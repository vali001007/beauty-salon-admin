import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { formatBusinessDate } from '../common/utils/business-time.js';
import type { BusinessTimeRange } from '../agent/business-task/business-task.types.js';
import type { SemanticQueryEvidence, SemanticQueryPlan, SemanticQueryResult } from './query-plan.types.js';
import { QueryTemplateRegistryService } from './query-template-registry.service.js';

const DAY_MS = 86_400_000;
const PAID_ORDER_STATUSES = ['completed', 'paid', '已完成', '已付款'];

type DateRange = { start: Date; end: Date; label: string };

@Injectable()
export class SemanticQueryExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryTemplateRegistry?: QueryTemplateRegistryService,
  ) {}

  async execute(plan: SemanticQueryPlan): Promise<SemanticQueryResult> {
    const metricKeys = plan.metrics.map((metric) => metric.key);
    const template =
      (plan.templateId ? this.queryTemplateRegistry?.findById(plan.templateId) : undefined) ??
      this.queryTemplateRegistry?.findByCapability(plan.capabilityId) ??
      this.queryTemplateRegistry?.findForMetrics(metricKeys);
    if (template?.id === 'order_customer_consumption_list' || plan.capabilityId === 'order_customer_consumption_list') {
      return this.queryOrderCustomerConsumptionList(plan);
    }
    if (template?.id === 'order_revenue' || metricKeys.some((key) => ['paid_amount', 'revenue', 'order_count', 'average_order_value', 'net_revenue'].includes(key))) {
      return this.queryOrderRevenue(plan);
    }
    if (template?.id === 'product_sales' || metricKeys.some((key) => ['product_sales_quantity', 'product_sales_amount', 'product_sales_growth'].includes(key))) {
      return this.queryProductSales(plan);
    }
    if (template?.id === 'project_service' || metricKeys.some((key) => ['project_service_count', 'project_service_growth'].includes(key))) return this.queryProjectService(plan);
    if (template?.id === 'customer_follow_up' || metricKeys.some((key) => ['follow_up_priority_score', 'churn_risk_score', 'repurchase_opportunity_score'].includes(key))) return this.queryCustomerFollowUp(plan);
    if (template?.id === 'inventory_risk' || metricKeys.includes('stock_risk_score')) return this.queryInventoryRisk(plan);
    if (template?.id === 'member_balance' || metricKeys.includes('member_balance')) return this.queryMemberBalance(plan);
    if (template?.id === 'card_usage' || metricKeys.includes('card_usage_times')) return this.queryCardUsage(plan);
    if (template?.id === 'card_expiry' || metricKeys.includes('card_expiry_risk')) return this.queryCardExpiry(plan);
    if (template?.id === 'staff_performance' || metricKeys.includes('staff_performance_score')) return this.queryStaffPerformance(plan);
    if (template?.id === 'reservation_schedule' || metricKeys.some((key) => ['reservation_count', 'arrival_rate'].includes(key))) return this.queryReservationSchedule(plan);
    if (template?.id === 'marketing_activity_list' || metricKeys.includes('marketing_activity_count')) return this.queryRecentMarketingActivities(plan);
    if (template?.id === 'marketing_conversion' || metricKeys.includes('campaign_conversion_rate')) return this.queryMarketingConversion(plan);
    return this.rejected(plan, '当前查询指标尚未接入统一查询执行器。');
  }

  private async queryOrderCustomerConsumptionList(plan: SemanticQueryPlan): Promise<SemanticQueryResult> {
    const range = this.resolveDateRange(plan.timeRange);
    const storeId = plan.storeScope.storeIds[0];
    const orders = await this.prisma.productOrder.findMany({
      where: {
        storeId,
        status: { notIn: ['cancelled', 'canceled', 'refunded', '已取消', '已退款'] },
        createdAt: { gte: range.start, lt: range.end },
      },
      select: {
        id: true,
        orderNo: true,
        customerId: true,
        customerName: true,
        totalAmount: true,
        netAmount: true,
        payMethod: true,
        status: true,
        createdAt: true,
        customer: { select: { id: true, name: true, phone: true, memberLevel: true } },
        orderItems: { select: { name: true, itemType: true, quantity: true, subtotal: true } },
        paymentRecords: { select: { amount: true, status: true, method: true, paidAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    const customers = new Map<
      string,
      {
        customerId: number | null;
        customerName: string;
        phoneMasked: string;
        memberLevel: string;
        paidAmount: number;
        orderCount: number;
        lastOrderTime: Date;
        orderNos: string[];
        payMethods: Set<string>;
        itemNames: Map<string, number>;
      }
    >();

    for (const order of orders as any[]) {
      const paidAmount = this.getOrderPaidAmount(order);
      if (paidAmount <= 0) continue;
      const customerId = Number(order.customerId) || null;
      const customerName = String(order.customer?.name || order.customerName || (customerId ? `客户${customerId}` : '散客'));
      const key = customerId ? `customer:${customerId}` : `guest:${customerName}`;
      const existing = customers.get(key);
      const lastOrderTime = new Date(order.createdAt);
      const target =
        existing ??
        {
          customerId,
          customerName,
          phoneMasked: this.maskPhone(order.customer?.phone),
          memberLevel: order.customer?.memberLevel ?? '',
          paidAmount: 0,
          orderCount: 0,
          lastOrderTime,
          orderNos: [] as string[],
          payMethods: new Set<string>(),
          itemNames: new Map<string, number>(),
        };
      target.paidAmount += paidAmount;
      target.orderCount += 1;
      if (lastOrderTime.getTime() > target.lastOrderTime.getTime()) target.lastOrderTime = lastOrderTime;
      if (order.orderNo) target.orderNos.push(String(order.orderNo));
      if (order.payMethod) target.payMethods.add(String(order.payMethod));
      for (const payment of order.paymentRecords ?? []) {
        if (payment.method) target.payMethods.add(String(payment.method));
      }
      for (const item of order.orderItems ?? []) {
        const name = String(item.name || '').trim();
        if (!name) continue;
        target.itemNames.set(name, (target.itemNames.get(name) ?? 0) + (this.toNumber(item.quantity) || 1));
      }
      customers.set(key, target);
    }

    const rows = Array.from(customers.values())
      .map((item) => {
        const itemsSummary = Array.from(item.itemNames.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name, quantity]) => `${name}${quantity > 1 ? ` x${quantity}` : ''}`)
          .join('、');
        return {
          customerId: item.customerId,
          customerName: item.customerName,
          phoneMasked: item.phoneMasked,
          memberLevel: item.memberLevel || '未标注',
          paidAmount: Math.round(item.paidAmount * 100) / 100,
          paidAmountText: this.formatMoney(item.paidAmount),
          orderCount: item.orderCount,
          lastOrderTime: item.lastOrderTime.toISOString(),
          lastOrderDate: this.formatDate(item.lastOrderTime),
          itemsSummary: itemsSummary || '未记录明细',
          payMethods: Array.from(item.payMethods).join('、') || '未知',
          orderNos: item.orderNos.slice(0, 5),
          suggestion: item.paidAmount >= 1000 ? '高消费客户，建议结合服务记录做复购承接。' : '建议完成消费后回访与满意度确认。',
        };
      })
      .sort((a, b) => b.paidAmount - a.paidAmount || b.orderCount - a.orderCount)
      .slice(0, plan.limit);

    const totalAmount = rows.reduce((sum, row) => sum + this.toNumber(row.paidAmount), 0);
    const totalOrders = rows.reduce((sum, row) => sum + this.toNumber(row.orderCount), 0);
    const evidence = this.evidence(plan, {
      source: ['ProductOrder', 'PaymentRecord', 'OrderItem', 'Customer'],
      dateRange: this.formatRange(range),
      metricDefinition: '消费客户清单 = 查询周期内未取消/未退款订单，按客户聚合有效支付金额；金额优先取支付记录合计，其次取订单 netAmount，再次取 totalAmount。',
      filters: ['storeId=当前门店', 'status not in cancelled/refunded', 'createdAt=查询周期', `limit=${plan.limit}`],
      sampleSize: (orders as any[]).length,
      limitations: ['散客或缺失 customerId 的订单按客户姓名聚合；退款中的部分退款订单暂按订单当前有效金额展示。'],
    });
    if (!rows.length) return this.noData(plan, `${range.label}暂无有效消费客户。`, evidence);
    return this.success(plan, {
      title: '消费客户清单',
      summary: `${range.label}共有 ${rows.length} 位消费客户，${totalOrders} 笔有效订单，消费合计 ${this.formatMoney(totalAmount)}。`,
      rows,
      evidence,
      kpis: [
        { label: '消费客户', value: `${rows.length}` },
        { label: '有效订单', value: `${totalOrders}` },
        { label: '消费合计', value: this.formatMoney(totalAmount) },
      ],
      actions: [
        { label: '查看订单明细', action: 'orders:open', riskLevel: 'low' },
        { label: '生成复购跟进草稿', action: 'customer.followup.task.draft', riskLevel: 'medium' },
      ],
    });
  }

  private async queryOrderRevenue(plan: SemanticQueryPlan): Promise<SemanticQueryResult> {
    const range = this.resolveDateRange(plan.timeRange);
    const storeId = plan.storeScope.storeIds[0];
    const [orders, payments, refunds] = await Promise.all([
      this.prisma.productOrder.findMany({
        where: { storeId, status: { in: PAID_ORDER_STATUSES }, createdAt: { gte: range.start, lt: range.end } },
        select: { id: true, totalAmount: true, customerId: true, createdAt: true, payMethod: true },
        take: 5000,
      }),
      (this.prisma as any).paymentRecord.findMany({
        where: { order: { storeId }, status: { in: ['paid', 'completed', 'success', '已支付', '已完成'] }, paidAt: { gte: range.start, lt: range.end } },
        select: { id: true, orderId: true, method: true, amount: true, paidAt: true, status: true },
        take: 5000,
      }),
      (this.prisma as any).refundRecord.findMany({
        where: { order: { storeId }, status: { in: ['refunded', 'success', 'completed', '已退款', '已完成'] }, refundedAt: { gte: range.start, lt: range.end } },
        select: { id: true, orderId: true, amount: true, refundedAt: true, status: true, order: { select: { payMethod: true } } },
        take: 5000,
      }),
    ]);
    const rows = plan.dimensions.includes('date')
      ? this.buildRevenueTrendRows(orders as any[], payments as any[], refunds as any[], range, plan)
      : this.buildRevenueSummaryRows(orders as any[], payments as any[], refunds as any[]);
    const evidence = this.evidence(plan, {
      source: ['ProductOrder', 'PaymentRecord', 'RefundRecord'],
      dateRange: this.formatRange(range),
      metricDefinition: '营收 = 有效订单收入；实收 = 支付成功流水；退款 = 已完成退款流水；净额 = 实收 - 退款；客单价 = 实收 / 有效订单数。',
      filters: ['当前门店', '订单状态为已支付或已完成', '支付/退款时间在查询周期内'],
      sampleSize: (orders as any[]).length + (payments as any[]).length + (refunds as any[]).length,
    });
    if (!rows.length) return this.noData(plan, '当前周期没有可统计的收银或收入数据。', evidence);
    const totalPaid = rows.reduce((sum, row) => sum + this.toNumber(row.paidAmount), 0);
    const totalRevenue = rows.reduce((sum, row) => sum + this.toNumber(row.revenue), 0);
    const totalRefund = rows.reduce((sum, row) => sum + this.toNumber(row.refundAmount), 0);
    const totalNet = totalPaid - totalRefund;
    const totalOrders = rows.reduce((sum, row) => sum + this.toNumber(row.orderCount), 0);
    return this.success(plan, {
      title: plan.outputShape === 'trend' ? '收银趋势' : '收银收入',
      summary: plan.outputShape === 'trend'
        ? `${range.label}共 ${rows.length} 天有收银记录，实收合计 ${this.formatMoney(totalPaid)}。`
        : `${range.label}实收 ${this.formatMoney(totalPaid)}，退款 ${this.formatMoney(totalRefund)}，净额 ${this.formatMoney(totalNet)}，订单 ${totalOrders} 笔。`,
      rows,
      evidence,
      kpis: [
        { label: '营收', value: this.formatMoney(totalRevenue), hint: '有效订单收入汇总' },
        { label: '实收', value: this.formatMoney(totalPaid) },
        { label: '订单数', value: `${totalOrders}` },
        { label: '客单价', value: totalOrders ? this.formatMoney(totalPaid / totalOrders) : '¥0' },
        { label: '退款', value: this.formatMoney(totalRefund), hint: '已完成退款流水' },
        { label: '净额', value: this.formatMoney(totalNet), hint: '实收扣减退款' },
      ],
      actions: [{ label: '查看订单明细', action: 'orders:open', riskLevel: 'low' }],
    });
  }

  private buildRevenueTrendRows(orders: any[], payments: any[], refunds: any[], range: DateRange, plan: SemanticQueryPlan) {
    const buckets = new Map<string, { date: string; revenue: number; paidAmount: number; refundAmount: number; orderCount: number; customerIds: Set<number> }>();
    for (const day of this.enumerateDays(range)) {
      buckets.set(day, { date: day, revenue: 0, paidAmount: 0, refundAmount: 0, orderCount: 0, customerIds: new Set<number>() });
    }
    for (const order of orders) {
      const key = this.formatDate(new Date(order.createdAt));
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.revenue += this.toNumber(order.totalAmount);
      bucket.orderCount += 1;
      if (order.customerId) bucket.customerIds.add(Number(order.customerId));
    }
    for (const payment of payments) {
      const key = this.formatDate(new Date(payment.paidAt));
      const bucket = buckets.get(key);
      if (bucket) bucket.paidAmount += this.toNumber(payment.amount);
    }
    for (const refund of refunds) {
      const key = this.formatDate(new Date(refund.refundedAt));
      const bucket = buckets.get(key);
      if (bucket) bucket.refundAmount += this.toNumber(refund.amount);
    }
    return Array.from(buckets.values())
      .map((bucket) => ({
        date: bucket.date,
        revenue: Math.round(bucket.revenue * 100) / 100,
        paidAmount: Math.round((bucket.paidAmount || bucket.revenue) * 100) / 100,
        refundAmount: Math.round(bucket.refundAmount * 100) / 100,
        netAmount: Math.round(((bucket.paidAmount || bucket.revenue) - bucket.refundAmount) * 100) / 100,
        orderCount: bucket.orderCount,
        customerCount: bucket.customerIds.size,
      }))
      .filter((row) => row.orderCount > 0 || row.paidAmount > 0 || plan.outputShape === 'trend')
      .slice(-plan.limit);
  }

  private buildRevenueSummaryRows(orders: any[], payments: any[], refunds: any[]) {
    const revenue = orders.reduce((sum, order) => sum + this.toNumber(order.totalAmount), 0);
    const paidAmount = payments.reduce((sum, payment) => sum + this.toNumber(payment.amount), 0) || revenue;
    const refundAmount = refunds.reduce((sum, refund) => sum + this.toNumber(refund.amount), 0);
    if (!orders.length && !payments.length) return [];
    const buckets = new Map<
      string,
      { payMethod: string; revenue: number; paidAmount: number; refundAmount: number; orderCount: number; paymentCount: number; customerIds: Set<number> }
    >();
    const ensureBucket = (method: unknown) => {
      const key = String(method || '未知');
      const existing = buckets.get(key);
      if (existing) return existing;
      const created = { payMethod: key, revenue: 0, paidAmount: 0, refundAmount: 0, orderCount: 0, paymentCount: 0, customerIds: new Set<number>() };
      buckets.set(key, created);
      return created;
    };
    for (const order of orders) {
      const bucket = ensureBucket(order.payMethod);
      bucket.revenue += this.toNumber(order.totalAmount);
      bucket.orderCount += 1;
      if (order.customerId) bucket.customerIds.add(Number(order.customerId));
    }
    for (const payment of payments) {
      const bucket = ensureBucket(payment.method);
      bucket.paidAmount += this.toNumber(payment.amount);
      bucket.paymentCount += 1;
    }
    for (const refund of refunds) {
      const bucket = ensureBucket(refund.order?.payMethod);
      bucket.refundAmount += this.toNumber(refund.amount);
    }
    const hasPayments = payments.length > 0;
    return Array.from(buckets.values())
      .map((bucket) => {
        const effectivePaidAmount = hasPayments ? bucket.paidAmount : bucket.revenue;
        const netAmount = effectivePaidAmount - bucket.refundAmount;
        return {
          payMethod: bucket.payMethod,
          revenue: Math.round(bucket.revenue * 100) / 100,
          paidAmount: Math.round(effectivePaidAmount * 100) / 100,
          refundAmount: Math.round(bucket.refundAmount * 100) / 100,
          netAmount: Math.round(netAmount * 100) / 100,
          orderCount: bucket.orderCount,
          paymentCount: bucket.paymentCount,
          customerCount: bucket.customerIds.size,
          averageOrderValue: bucket.orderCount ? effectivePaidAmount / bucket.orderCount : 0,
        };
      })
      .sort((a, b) => b.paidAmount - a.paidAmount || b.orderCount - a.orderCount);
  }

  private async queryProductSales(plan: SemanticQueryPlan): Promise<SemanticQueryResult> {
    const range = this.resolveDateRange(plan.timeRange);
    const previous = this.previousSameLengthRange(range);
    const records = await (this.prisma as any).orderItem.findMany({
      where: {
        itemType: 'product',
        itemId: { not: null },
        order: {
          storeId: plan.storeScope.storeIds[0],
          status: { in: PAID_ORDER_STATUSES },
          createdAt: { gte: previous.start, lt: range.end },
        },
      },
      include: { order: { select: { id: true, customerId: true, createdAt: true, status: true } } },
      take: 5000,
    });
    const bucket = new Map<number, { productId: number; productName: string; quantity: number; previousQuantity: number; salesAmount: number; customers: Set<number> }>();
    for (const item of records as any[]) {
      const productId = Number(item.itemId);
      if (!productId) continue;
      const target =
        bucket.get(productId) ??
        { productId, productName: item.name, quantity: 0, previousQuantity: 0, salesAmount: 0, customers: new Set<number>() };
      const createdAt = new Date(item.order?.createdAt ?? item.createdAt);
      const isCurrent = createdAt >= range.start && createdAt < range.end;
      if (isCurrent) {
        target.quantity += this.toNumber(item.quantity);
        target.salesAmount += this.toNumber(item.subtotal);
        if (item.order?.customerId) target.customers.add(Number(item.order.customerId));
      } else {
        target.previousQuantity += this.toNumber(item.quantity);
      }
      bucket.set(productId, target);
    }
    const rows = Array.from(bucket.values())
      .map((item) => {
        const growthQuantity = item.quantity - item.previousQuantity;
        const growthRate = item.previousQuantity > 0 ? growthQuantity / item.previousQuantity : item.quantity > 0 ? 1 : 0;
        return {
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          previousQuantity: item.previousQuantity,
          growthQuantity,
          growthRate,
          growthRateText: this.formatPercent(growthRate),
          salesAmount: item.salesAmount,
          customerCount: item.customers.size,
        };
      })
      .filter((item) => item.quantity > 0)
      .sort((a, b) => {
        const orderKey = plan.orderBy[0]?.key ?? 'quantity';
        return this.toNumber(b[orderKey as keyof typeof b]) - this.toNumber(a[orderKey as keyof typeof a]) || b.quantity - a.quantity;
      })
      .slice(0, plan.limit);
    const evidence = this.evidence(plan, {
      source: ['ProductOrder', 'OrderItem', 'Product'],
      dateRange: this.formatRange(range),
      metricDefinition: '商品销量 = 指定周期内商品类订单明细数量；增长为上一等长周期对比。',
      filters: ['当前门店', '商品订单明细', '订单状态为已支付或已完成'],
      sampleSize: (records as any[]).length,
    });
    if (!rows.length) return this.noData(plan, '当前周期没有商品销售数据，无法判断销量排行。', evidence);
    return this.success(plan, {
      title: '商品销量排行',
      summary: `${range.label}销量最高的是 ${rows[0].productName}，销量 ${rows[0].quantity}。`,
      rows,
      evidence,
      kpis: [
        { label: '上榜商品', value: `${rows.length}` },
        { label: '最高销量', value: `${rows[0].quantity}` },
        { label: '销售额', value: this.formatMoney(rows.reduce((sum, row) => sum + this.toNumber(row.salesAmount), 0)) },
      ],
      actions: [{ label: '查看商品明细', action: rows[0].productId ? `product:${rows[0].productId}` : 'manager.inventory', riskLevel: 'low' }],
    });
  }

  private async queryProjectService(plan: SemanticQueryPlan): Promise<SemanticQueryResult> {
    const range = this.resolveDateRange(plan.timeRange);
    const previous = this.previousSameLengthRange(range);
    const records = await (this.prisma as any).orderItem.findMany({
      where: {
        itemType: 'project',
        itemId: { not: null },
        order: {
          storeId: plan.storeScope.storeIds[0],
          status: { in: PAID_ORDER_STATUSES },
          createdAt: { gte: previous.start, lt: range.end },
        },
      },
      include: { order: { select: { id: true, customerId: true, createdAt: true, status: true } } },
      take: 5000,
    });
    const bucket = new Map<number, { projectId: number; projectName: string; serviceCount: number; previousServiceCount: number; revenue: number; customers: Set<number> }>();
    for (const item of records as any[]) {
      const projectId = Number(item.itemId);
      if (!projectId) continue;
      const target =
        bucket.get(projectId) ??
        { projectId, projectName: item.name, serviceCount: 0, previousServiceCount: 0, revenue: 0, customers: new Set<number>() };
      const createdAt = new Date(item.order?.createdAt ?? item.createdAt);
      const isCurrent = createdAt >= range.start && createdAt < range.end;
      if (isCurrent) {
        target.serviceCount += this.toNumber(item.quantity) || 1;
        target.revenue += this.toNumber(item.subtotal);
        if (item.order?.customerId) target.customers.add(Number(item.order.customerId));
      } else {
        target.previousServiceCount += this.toNumber(item.quantity) || 1;
      }
      bucket.set(projectId, target);
    }
    const rows = Array.from(bucket.values())
      .map((item) => {
        const growthCount = item.serviceCount - item.previousServiceCount;
        const growthRate = item.previousServiceCount > 0 ? growthCount / item.previousServiceCount : item.serviceCount > 0 ? 1 : 0;
        return {
          projectId: item.projectId,
          projectName: item.projectName,
          serviceCount: item.serviceCount,
          previousServiceCount: item.previousServiceCount,
          growthCount,
          growthRateText: this.formatPercent(growthRate),
          revenue: Math.round(item.revenue * 100) / 100,
          customerCount: item.customers.size,
        };
      })
      .filter((item) => item.serviceCount > 0)
      .sort((a, b) => b.serviceCount - a.serviceCount || b.revenue - a.revenue)
      .slice(0, plan.limit);
    const evidence = this.evidence(plan, {
      source: ['ProductOrder', 'OrderItem', 'Project'],
      dateRange: this.formatRange(range),
      metricDefinition: '项目服务次数 = 指定周期内项目类订单明细数量；增长为上一等长周期对比。',
      filters: ['当前门店', '项目订单明细', '订单状态为已支付或已完成'],
      sampleSize: (records as any[]).length,
    });
    if (!rows.length) return this.noData(plan, '当前周期没有项目服务数据，无法判断项目排行。', evidence);
    return this.success(plan, {
      title: '项目服务排行',
      summary: `${range.label}服务最多的是 ${rows[0].projectName}，共 ${rows[0].serviceCount} 次。`,
      rows,
      evidence,
      actions: [{ label: '查看项目明细', action: rows[0].projectId ? `project:${rows[0].projectId}` : 'manager.projects', riskLevel: 'low' }],
    });
  }

  private async queryCustomerFollowUp(plan: SemanticQueryPlan): Promise<SemanticQueryResult> {
    const [customers, snapshots] = await Promise.all([
      this.prisma.customer.findMany({
        where: { storeId: plan.storeScope.storeIds[0], deletedAt: null },
        select: { id: true, name: true, phone: true, memberLevel: true, totalSpent: true, visitCount: true, lastVisitDate: true, tags: true },
        take: 5000,
      }),
      (this.prisma as any).customerPredictionSnapshot.findMany({
        where: { storeId: plan.storeScope.storeIds[0] },
        select: { customerId: true, churnScore: true, churnLevel: true, repurchase30dScore: true, marketingResponseScore: true, ltv12m: true, ltvTier: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
    ]);
    const latestSnapshotByCustomer = new Map<number, any>();
    for (const snapshot of snapshots as any[]) {
      const customerId = Number(snapshot.customerId);
      if (!latestSnapshotByCustomer.has(customerId)) latestSnapshotByCustomer.set(customerId, snapshot);
    }
    const now = new Date();
    const rows = (customers as any[])
      .map((customer) => {
        const snapshot = latestSnapshotByCustomer.get(Number(customer.id));
        const daysSinceVisit = customer.lastVisitDate ? Math.max(0, Math.floor((now.getTime() - new Date(customer.lastVisitDate).getTime()) / DAY_MS)) : null;
        const churnScore = this.toNumber(snapshot?.churnScore);
        const repurchaseScore = this.toNumber(snapshot?.repurchase30dScore);
        const responseScore = this.toNumber(snapshot?.marketingResponseScore);
        const ltv = this.toNumber(snapshot?.ltv12m ?? customer.totalSpent);
        const followUpScore = Math.round(churnScore * 0.4 + repurchaseScore * 0.25 + responseScore * 0.2 + Math.min(30, ltv / 1000) + (daysSinceVisit ? Math.min(20, daysSinceVisit / 10) : 0));
        return {
          customerId: customer.id,
          customerName: customer.name,
          phone: this.maskPhone(customer.phone),
          memberLevel: customer.memberLevel ?? '无',
          tags: Array.isArray(customer.tags) ? customer.tags.join('、') : customer.tags ?? '',
          daysSinceVisit,
          totalSpent: this.toNumber(customer.totalSpent),
          churnScore,
          churnLevel: snapshot?.churnLevel,
          repurchaseScore,
          followUpScore,
        };
      })
      .filter((item) => item.followUpScore > 0 || item.totalSpent > 0 || item.daysSinceVisit !== null)
      .sort((a, b) => b.followUpScore - a.followUpScore || b.totalSpent - a.totalSpent)
      .slice(0, plan.limit);
    const evidence = this.evidence(plan, {
      source: ['Customer', 'CustomerPredictionSnapshot'],
      metricDefinition: '优先跟进客户 = 综合流失风险、复购机会、营销响应、消费价值和最近到店情况评分。',
      filters: ['当前门店', '客户未删除', '仅生成跟进建议，不自动触达'],
      sampleSize: (customers as any[]).length,
    });
    if (!rows.length) return this.noData(plan, '当前没有足够客户数据用于生成跟进建议。', evidence);
    return this.success(plan, {
      title: '客户跟进优先级',
      summary: `已按要求返回 ${rows.length} 位客户。优先建议跟进 ${rows[0].customerName}。`,
      rows,
      evidence,
      actions: [{ label: '生成跟进任务草稿', action: 'follow-up:draft', riskLevel: 'medium' }],
    });
  }

  private async queryInventoryRisk(plan: SemanticQueryPlan): Promise<SemanticQueryResult> {
    const products = await (this.prisma as any).product.findMany({
      where: { storeId: plan.storeScope.storeIds[0], deletedAt: null },
      select: { id: true, name: true, sku: true, currentStock: true, safetyStock: true, unit: true, status: true },
      take: 5000,
    });
    const rows = (products as any[])
      .map((product) => {
        const currentStock = this.toNumber(product.currentStock);
        const safetyStock = this.toNumber(product.safetyStock);
        const stockGap = Math.max(0, safetyStock - currentStock);
        return {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          currentStock,
          safetyStock,
          stockGap,
          unit: product.unit,
          riskScore: stockGap > 0 ? Math.min(100, 50 + stockGap * 5) : 0,
        };
      })
      .filter((item) => item.stockGap > 0)
      .sort((a, b) => b.riskScore - a.riskScore || b.stockGap - a.stockGap)
      .slice(0, plan.limit);
    const evidence = this.evidence(plan, {
      source: ['Product'],
      metricDefinition: '库存风险 = 当前库存低于安全库存的缺口排行。',
      filters: ['当前门店', '商品未删除', '当前库存低于安全库存'],
      sampleSize: (products as any[]).length,
    });
    if (!rows.length) return this.noData(plan, '当前没有低于安全库存的商品。', evidence);
    return this.success(plan, {
      title: '库存风险排行',
      summary: `库存风险最高的是 ${rows[0].productName}，低于安全库存 ${rows[0].stockGap}${rows[0].unit ?? ''}。`,
      rows,
      evidence,
      actions: [{ label: '生成补货单草稿', action: 'purchase:draft:context', riskLevel: 'medium' }],
    });
  }

  private async queryMemberBalance(plan: SemanticQueryPlan): Promise<SemanticQueryResult> {
    const accounts = await (this.prisma as any).customerBalanceAccount.findMany({
      where: { storeId: plan.storeScope.storeIds[0], status: 'active' },
      include: { customer: { select: { id: true, name: true, phone: true, memberLevel: true } } },
      take: 5000,
    });
    const rows = (accounts as any[])
      .map((account) => {
        const cashBalance = this.toNumber(account.cashBalance);
        const giftBalance = this.toNumber(account.giftBalance);
        return {
          customerId: account.customerId,
          customerName: account.customer?.name,
          phone: this.maskPhone(account.customer?.phone),
          memberLevel: account.customer?.memberLevel,
          cashBalance,
          giftBalance,
          totalBalance: cashBalance + giftBalance,
        };
      })
      .filter((item) => item.totalBalance > 0)
      .sort((a, b) => b.totalBalance - a.totalBalance)
      .slice(0, plan.limit);
    const evidence = this.evidence(plan, {
      source: ['CustomerBalanceAccount', 'Customer'],
      metricDefinition: '会员余额 = 储值账户现金余额与赠送余额合计。',
      filters: ['当前门店', '储值账户状态为启用', '余额大于 0'],
      sampleSize: (accounts as any[]).length,
    });
    if (!rows.length) return this.noData(plan, '当前没有可统计的会员卡余额数据。', evidence);
    return this.success(plan, {
      title: '会员卡余额排行',
      summary: `余额最高的是 ${rows[0].customerName}，余额 ${this.formatMoney(rows[0].totalBalance)}。`,
      rows,
      evidence,
      kpis: [{ label: '余额合计', value: this.formatMoney(rows.reduce((sum, row) => sum + row.totalBalance, 0)) }],
      actions: [{ label: '查看客户卡项', action: 'customers:cards:open', riskLevel: 'low' }],
    });
  }

  private async queryCardUsage(plan: SemanticQueryPlan): Promise<SemanticQueryResult> {
    const range = this.resolveDateRange(plan.timeRange);
    const records = await (this.prisma as any).cardUsageRecord.findMany({
      where: { storeId: plan.storeScope.storeIds[0], verifiedAt: { gte: range.start, lt: range.end } },
      take: 5000,
    });
    const bucket = new Map<string, { cardName: string; projectName: string; usageTimes: number; customerIds: Set<number>; beauticianIds: Set<number> }>();
    for (const item of records as any[]) {
      const key = `${item.cardName ?? '未知卡项'}|${item.projectName ?? '未关联项目'}`;
      const target =
        bucket.get(key) ??
        { cardName: item.cardName ?? '未知卡项', projectName: item.projectName ?? '未关联项目', usageTimes: 0, customerIds: new Set<number>(), beauticianIds: new Set<number>() };
      target.usageTimes += this.toNumber(item.times) || 1;
      if (item.customerId) target.customerIds.add(Number(item.customerId));
      if (item.beauticianId) target.beauticianIds.add(Number(item.beauticianId));
      bucket.set(key, target);
    }
    const rows = Array.from(bucket.values())
      .map((item) => ({
        cardName: item.cardName,
        projectName: item.projectName,
        usageTimes: item.usageTimes,
        customerCount: item.customerIds.size,
        beauticianCount: item.beauticianIds.size,
      }))
      .sort((a, b) => b.usageTimes - a.usageTimes)
      .slice(0, plan.limit);
    const evidence = this.evidence(plan, {
      source: ['CardUsageRecord'],
      dateRange: this.formatRange(range),
      metricDefinition: '卡项核销次数 = 指定周期内次卡核销记录 times 汇总。',
      filters: ['当前门店', '核销时间在查询周期内'],
      sampleSize: (records as any[]).length,
    });
    if (!rows.length) return this.noData(plan, '当前周期没有卡项核销记录。', evidence);
    return this.success(plan, {
      title: '卡项核销排行',
      summary: `${range.label}核销最多的是 ${rows[0].cardName}，共 ${rows[0].usageTimes} 次。`,
      rows,
      evidence,
      actions: [{ label: '查看核销明细', action: 'orders:card-usage:open', riskLevel: 'low' }],
    });
  }

  private async queryCardExpiry(plan: SemanticQueryPlan): Promise<SemanticQueryResult> {
    const now = new Date();
    const horizon = new Date(now.getTime() + 30 * DAY_MS);
    const cards = await (this.prisma as any).customerCard.findMany({
      where: {
        status: 'active',
        remainingTimes: { gt: 0 },
        expiryDate: { gte: now, lte: horizon },
        customer: { storeId: plan.storeScope.storeIds[0], deletedAt: null },
      },
      include: { customer: { select: { id: true, name: true, phone: true, memberLevel: true } } },
      take: 5000,
    });
    const rows = (cards as any[])
      .map((card) => {
        const daysToExpire = Math.max(0, Math.ceil((new Date(card.expiryDate).getTime() - now.getTime()) / DAY_MS));
        return {
          customerId: card.customerId,
          customerName: card.customer?.name,
          phone: this.maskPhone(card.customer?.phone),
          memberLevel: card.customer?.memberLevel ?? '无',
          cardName: card.cardName,
          remainingTimes: card.remainingTimes,
          expiryDate: this.formatDate(new Date(card.expiryDate)),
          daysToExpire,
        };
      })
      .sort((a, b) => a.daysToExpire - b.daysToExpire || b.remainingTimes - a.remainingTimes)
      .slice(0, plan.limit);
    const evidence = this.evidence(plan, {
      source: ['CustomerCard', 'Customer'],
      dateRange: `${this.formatDate(now)} 至 ${this.formatDate(horizon)}`,
      metricDefinition: '卡项到期风险 = 未来 30 天内到期且仍有剩余次数的客户次卡。',
      filters: ['当前门店', '卡状态启用', '剩余次数大于 0', '到期日在未来 30 天内'],
      sampleSize: (cards as any[]).length,
    });
    if (!rows.length) return this.noData(plan, '未来 30 天没有即将到期且仍有余次的卡项。', evidence);
    return this.success(plan, {
      title: '卡项到期风险',
      summary: `未来 30 天有 ${rows.length} 张卡需要提醒，最近到期的是 ${rows[0].customerName} 的 ${rows[0].cardName}。`,
      rows,
      evidence,
      actions: [{ label: '生成到期提醒任务', action: 'card-expiry:follow-up:draft', riskLevel: 'medium' }],
    });
  }

  private async queryStaffPerformance(plan: SemanticQueryPlan): Promise<SemanticQueryResult> {
    const range = this.resolveDateRange(plan.timeRange);
    const storeId = plan.storeScope.storeIds[0];
    const [beauticians, reservations, orderItems] = await Promise.all([
      (this.prisma as any).beautician.findMany({
        where: { storeId },
        select: { id: true, name: true, status: true },
        take: 1000,
      }),
      (this.prisma as any).reservation.findMany({
        where: { storeId, date: { gte: range.start, lt: range.end } },
        select: { id: true, beauticianId: true, status: true },
        take: 5000,
      }),
      (this.prisma as any).orderItem.findMany({
        where: {
          beauticianId: { not: null },
          order: { storeId, status: { in: PAID_ORDER_STATUSES }, createdAt: { gte: range.start, lt: range.end } },
        },
        select: { id: true, beauticianId: true, subtotal: true, orderId: true },
        take: 5000,
      }),
    ]);
    const bucket = new Map<number, { beauticianId: number; beauticianName: string; level?: string; serviceCount: number; completedCount: number; orderCount: number; revenue: number }>();
    for (const beautician of beauticians as any[]) {
      bucket.set(Number(beautician.id), {
        beauticianId: Number(beautician.id),
        beauticianName: beautician.name,
        level: beautician.level,
        serviceCount: 0,
        completedCount: 0,
        orderCount: 0,
        revenue: 0,
      });
    }
    for (const reservation of reservations as any[]) {
      const beauticianId = Number(reservation.beauticianId);
      const target = bucket.get(beauticianId);
      if (!target) continue;
      target.serviceCount += 1;
      if (['completed', 'arrived', 'done', '已完成', '已到店'].includes(String(reservation.status))) target.completedCount += 1;
    }
    for (const item of orderItems as any[]) {
      const beauticianId = Number(item.beauticianId);
      const target = bucket.get(beauticianId);
      if (!target) continue;
      target.orderCount += 1;
      target.revenue += this.toNumber(item.subtotal);
    }
    const rows = Array.from(bucket.values())
      .map((item) => {
        const completionRate = item.serviceCount ? item.completedCount / item.serviceCount : 0;
        const score = Math.round(item.revenue / 100 + item.completedCount * 10 + item.orderCount * 5 + completionRate * 20);
        return {
          ...item,
          revenue: Math.round(item.revenue * 100) / 100,
          completionRateText: this.formatPercent(completionRate),
          score,
        };
      })
      .filter((item) => item.serviceCount > 0 || item.orderCount > 0 || item.revenue > 0)
      .sort((a, b) => b.score - a.score || b.revenue - a.revenue)
      .slice(0, plan.limit);
    const evidence = this.evidence(plan, {
      source: ['Beautician', 'Reservation', 'OrderItem'],
      dateRange: this.formatRange(range),
      metricDefinition: '员工表现 = 服务完成、订单数量和收入贡献的综合评分。',
      filters: ['当前门店', '预约/订单在查询周期内'],
      sampleSize: (reservations as any[]).length + (orderItems as any[]).length,
    });
    if (!rows.length) return this.noData(plan, '当前周期没有可统计的员工服务或业绩数据。', evidence);
    return this.success(plan, {
      title: '员工表现排行',
      summary: `${range.label}表现较好的是 ${rows[0].beauticianName}，综合分 ${rows[0].score}。`,
      rows,
      evidence,
      kpis: [{ label: '上榜员工', value: `${rows.length}` }],
      actions: [{ label: '查看员工明细', action: 'staff:performance:open', riskLevel: 'low' }],
    });
  }

  private async queryReservationSchedule(plan: SemanticQueryPlan): Promise<SemanticQueryResult> {
    const range = this.resolveDateRange(plan.timeRange);
    const reservations = await (this.prisma as any).reservation.findMany({
      where: { storeId: plan.storeScope.storeIds[0], date: { gte: range.start, lt: range.end } },
      select: { id: true, date: true, status: true, customerId: true, beauticianId: true },
      take: 5000,
    });
    const bucket = new Map<string, { date: string; reservationCount: number; arrivedCount: number; completedCount: number; noShowCount: number }>();
    for (const day of this.enumerateDays(range)) {
      bucket.set(day, { date: day, reservationCount: 0, arrivedCount: 0, completedCount: 0, noShowCount: 0 });
    }
    for (const reservation of reservations as any[]) {
      const key = this.formatDate(new Date(reservation.date));
      const target = bucket.get(key);
      if (!target) continue;
      const status = String(reservation.status);
      target.reservationCount += 1;
      if (['arrived', 'completed', 'done', '已到店', '已完成'].includes(status)) target.arrivedCount += 1;
      if (['completed', 'done', '已完成'].includes(status)) target.completedCount += 1;
      if (['no_show', 'cancelled', '未到店', '已取消'].includes(status)) target.noShowCount += 1;
    }
    const rows = Array.from(bucket.values())
      .map((item) => ({
        ...item,
        arrivalRateText: this.formatPercent(item.reservationCount ? item.arrivedCount / item.reservationCount : 0),
      }))
      .filter((item) => item.reservationCount > 0 || plan.outputShape === 'trend')
      .slice(-plan.limit);
    const evidence = this.evidence(plan, {
      source: ['Reservation'],
      dateRange: this.formatRange(range),
      metricDefinition: '预约与到店 = 查询周期内预约数量及已到店/已完成状态占比。',
      filters: ['当前门店', '预约开始时间在查询周期内'],
      sampleSize: (reservations as any[]).length,
    });
    if (!rows.some((row) => row.reservationCount > 0)) return this.noData(plan, '当前周期没有预约记录。', evidence);
    const total = rows.reduce((sum, row) => sum + row.reservationCount, 0);
    return this.success(plan, {
      title: '预约到店趋势',
      summary: `${range.label}共有 ${total} 个预约。`,
      rows,
      evidence,
      actions: [{ label: '查看预约列表', action: 'reservations:open', riskLevel: 'low' }],
    });
  }

  private async queryRecentMarketingActivities(plan: SemanticQueryPlan): Promise<SemanticQueryResult> {
    const range = this.resolveDateRange(plan.timeRange);
    const activities = await (this.prisma as any).marketingActivity.findMany({
      where: {
        OR: [
          { createdAt: { gte: range.start, lt: range.end } },
          { updatedAt: { gte: range.start, lt: range.end } },
          { startDate: { gte: range.start, lt: range.end } },
          { endDate: { gte: range.start, lt: range.end } },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        publishStatus: true,
        participants: true,
        conversion: true,
        startDate: true,
        endDate: true,
        targetCustomers: true,
        discount: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: plan.limit,
    });

    const activityIds = (activities as any[]).map((activity) => Number(activity.id)).filter((id) => Number.isFinite(id));
    const pages = activityIds.length
      ? await (this.prisma as any).marketingPage.findMany({
          where: { activityId: { in: activityIds } },
          select: { id: true, activityId: true, storeId: true },
          take: 1000,
        })
      : [];
    const pageCountByActivityId = new Map<number, number>();
    for (const page of pages as any[]) {
      const activityId = Number(page.activityId);
      if (!Number.isFinite(activityId)) continue;
      pageCountByActivityId.set(activityId, (pageCountByActivityId.get(activityId) ?? 0) + 1);
    }

    const rows = (activities as any[]).map((activity) => ({
      campaignId: activity.id,
      campaignName: activity.title,
      status: activity.status ?? '未设置',
      publishStatus: activity.publishStatus ?? '未发布',
      activityDateRange: this.formatOptionalDateRange(activity.startDate, activity.endDate),
      targetCustomers: activity.targetCustomers ?? '未设置',
      offer: activity.discount ?? '未设置',
      participants: this.toNumber(activity.participants),
      conversion: activity.conversion ?? '0%',
      pageCount: pageCountByActivityId.get(Number(activity.id)) ?? 0,
      publishedAt: activity.publishedAt ? this.formatDate(new Date(activity.publishedAt)) : '',
      updatedAt: this.formatDate(new Date(activity.updatedAt ?? activity.createdAt)),
    }));

    const evidence = this.evidence(plan, {
      source: ['MarketingActivity', 'MarketingPage'],
      dateRange: this.formatRange(range),
      metricDefinition: '营销活动清单 = 查询周期内创建、更新、开始或结束的营销活动，按最近更新时间倒序。',
      filters: ['活动创建/更新/开始/结束时间在查询周期内', `limit=${plan.limit}`],
      sampleSize: (activities as any[]).length + (pages as any[]).length,
      limitations: ['MarketingActivity 当前未内置 storeId，门店范围通过关联 MarketingPage 统计页数量辅助呈现。'],
    });
    if (!rows.length) return this.noData(plan, `${range.label}没有可查看的营销活动。`, evidence);
    const runningCount = rows.filter((row) => String(row.status).includes('进行中')).length;
    const draftCount = rows.filter((row) => String(row.status).includes('draft') || String(row.publishStatus).includes('未发布')).length;
    return this.success(plan, {
      title: '近期营销活动',
      summary: `${range.label}共找到 ${rows.length} 条营销活动，进行中 ${runningCount} 条，草稿/未发布 ${draftCount} 条；最近更新的是「${rows[0].campaignName}」。`,
      rows,
      evidence,
      actions: [{ label: '查看活动列表', action: 'marketing:activities:open', riskLevel: 'low' }],
    });
  }

  private async queryMarketingConversion(plan: SemanticQueryPlan): Promise<SemanticQueryResult> {
    const range = this.resolveDateRange(plan.timeRange);
    const storeId = plan.storeScope.storeIds[0];
    const [pages, leads, events] = await Promise.all([
      (this.prisma as any).marketingPage.findMany({
        where: { storeId, status: 'active', userId: { not: null } },
        select: { id: true, activityId: true, title: true },
        take: 1000,
      }),
      (this.prisma as any).marketingPageLead.findMany({
        where: { storeId, createdAt: { gte: range.start, lt: range.end } },
        select: { id: true, pageId: true, status: true },
        take: 5000,
      }),
      (this.prisma as any).marketingPageEvent.findMany({
        where: { storeId, occurredAt: { gte: range.start, lt: range.end } },
        select: { id: true, pageId: true, eventType: true },
        take: 5000,
      }),
    ]);
    const activityIds = Array.from(
      new Set((pages as any[]).map((page) => Number(page.activityId)).filter((activityId) => Number.isFinite(activityId) && activityId > 0)),
    );
    const activities = activityIds.length
      ? await (this.prisma as any).marketingActivity.findMany({
          where: { id: { in: activityIds } },
          select: { id: true, title: true, status: true },
          take: 1000,
        })
      : [];
    const activityById = new Map((activities as any[]).map((item) => [Number(item.id), item]));
    const pageById = new Map((pages as any[]).map((item) => [Number(item.id), item]));
    const bucket = new Map<number, { campaignId: number; campaignName: string; viewCount: number; leadCount: number; convertedCount: number }>();
    for (const page of pages as any[]) {
      const activity = activityById.get(Number(page.activityId));
      const campaignId = Number(page.activityId || page.id);
      bucket.set(campaignId, {
        campaignId,
        campaignName: activity?.title ?? page.title ?? '未命名活动',
        viewCount: 0,
        leadCount: 0,
        convertedCount: 0,
      });
      pageById.set(Number(page.id), page);
    }
    for (const event of events as any[]) {
      const page = pageById.get(Number(event.pageId));
      const campaignId = Number(page?.activityId || event.pageId);
      const target = bucket.get(campaignId);
      if (target) target.viewCount += 1;
    }
    for (const lead of leads as any[]) {
      const page = pageById.get(Number(lead.pageId));
      const campaignId = Number(page?.activityId || lead.pageId);
      const target = bucket.get(campaignId);
      if (!target) continue;
      target.leadCount += 1;
      if (['converted', 'completed', 'won', '已转化', '已成交'].includes(String(lead.status))) target.convertedCount += 1;
    }
    const rows = Array.from(bucket.values())
      .map((item) => {
        const conversionRate = item.viewCount ? item.leadCount / item.viewCount : item.leadCount > 0 ? 1 : 0;
        return { ...item, conversionRateText: this.formatPercent(conversionRate), score: Math.round(conversionRate * 100 + item.leadCount * 2) };
      })
      .filter((item) => item.viewCount > 0 || item.leadCount > 0)
      .sort((a, b) => b.score - a.score || b.leadCount - a.leadCount)
      .slice(0, plan.limit);
    const evidence = this.evidence(plan, {
      source: ['MarketingActivity', 'MarketingPage', 'MarketingPageEvent', 'MarketingPageLead'],
      dateRange: this.formatRange(range),
      metricDefinition: '营销转化 = 活动页访问、线索和成交状态的综合表现。',
      filters: ['当前门店', '访问和线索创建时间在查询周期内'],
      sampleSize: (events as any[]).length + (leads as any[]).length,
    });
    if (!rows.length) return this.noData(plan, '当前周期没有可统计的营销活动转化数据。', evidence);
    return this.success(plan, {
      title: '营销转化排行',
      summary: `${range.label}转化表现较好的是 ${rows[0].campaignName}，线索 ${rows[0].leadCount} 个。`,
      rows,
      evidence,
      actions: [{ label: '查看活动效果', action: 'marketing:effects:open', riskLevel: 'low' }],
    });
  }

  private success(
    plan: SemanticQueryPlan,
    input: {
      title: string;
      summary: string;
      rows: Array<Record<string, unknown>>;
      kpis?: Array<{ label: string; value: string; hint?: string }>;
      actions?: SemanticQueryResult['actions'];
      evidence: SemanticQueryEvidence;
    },
  ): SemanticQueryResult {
    return {
      status: 'success',
      queryId: plan.queryId,
      capabilityId: plan.capabilityId,
      title: input.title,
      summary: input.summary,
      rows: input.rows,
      kpis: input.kpis,
      actions: input.actions ?? [],
      userEvidence: {
        dateRange: input.evidence.dateRange,
        dataSummary: input.evidence.sampleSize !== undefined ? `基于 ${input.evidence.sampleSize} 条业务记录统计` : undefined,
      },
      auditEvidence: input.evidence,
    };
  }

  private noData(plan: SemanticQueryPlan, summary: string, evidence: SemanticQueryEvidence): SemanticQueryResult {
    return {
      status: 'no_data',
      queryId: plan.queryId,
      capabilityId: plan.capabilityId,
      title: '暂无数据',
      summary,
      rows: [],
      actions: [],
      userEvidence: { dateRange: evidence.dateRange },
      auditEvidence: evidence,
    };
  }

  private rejected(plan: SemanticQueryPlan, rejectedReason: string): SemanticQueryResult {
    return {
      status: 'rejected',
      queryId: plan.queryId,
      capabilityId: plan.capabilityId,
      title: '暂不支持',
      summary: rejectedReason,
      rows: [],
      actions: [],
      rejectedReason,
      auditEvidence: this.evidence(plan, {
        source: [],
        metricDefinition: '未执行查询。',
        filters: [],
        limitations: [rejectedReason],
      }),
    };
  }

  private evidence(plan: SemanticQueryPlan, input: Omit<SemanticQueryEvidence, 'auditId' | 'sqlFingerprint'>): SemanticQueryEvidence {
    return {
      ...input,
      sourceTables: input.sourceTables?.length ? input.sourceTables : input.source,
      auditId: `sq_${plan.queryId}`,
      sqlFingerprint: this.createFingerprint(plan),
    };
  }

  private resolveDateRange(value?: BusinessTimeRange): DateRange {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (value?.preset === 'today') return { start: today, end: new Date(today.getTime() + DAY_MS), label: '今天' };
    if (value?.preset === 'yesterday') return { start: new Date(today.getTime() - DAY_MS), end: today, label: '昨天' };
    if (value?.preset === 'this_month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: '本月' };
    if (value?.preset === 'last_7_days') return { start: new Date(now.getTime() - 7 * DAY_MS), end: now, label: '近7天' };
    if (value?.preset === 'custom' && value.startDate && value.endDate) {
      const start = new Date(value.startDate);
      const end = new Date(value.endDate);
      end.setDate(end.getDate() + 1);
      return { start, end, label: value.label || '自定义' };
    }
    return { start: new Date(now.getTime() - 30 * DAY_MS), end: now, label: '近30天' };
  }

  private previousSameLengthRange(range: DateRange): DateRange {
    const duration = range.end.getTime() - range.start.getTime();
    return { start: new Date(range.start.getTime() - duration), end: new Date(range.start.getTime()), label: `上一${range.label}` };
  }

  private enumerateDays(range: DateRange) {
    const days: string[] = [];
    const cursor = new Date(range.start);
    cursor.setHours(0, 0, 0, 0);
    while (cursor < range.end && days.length < 370) {
      days.push(this.formatDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  private createFingerprint(plan: SemanticQueryPlan) {
    const normalized = JSON.stringify({
      metrics: plan.metrics.map((item) => item.key).sort(),
      dimensions: [...plan.dimensions].sort(),
      timeRange: plan.timeRange.preset,
      filters: Object.keys(plan.filters).sort(),
      limit: plan.limit,
    });
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }

  private formatRange(range: DateRange) {
    return `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`;
  }

  private formatOptionalDateRange(start?: Date | string | null, end?: Date | string | null) {
    if (!start && !end) return '未设置';
    const startText = start ? this.formatDate(new Date(start)) : '未设置';
    const endText = end ? this.formatDate(new Date(end)) : '未设置';
    return `${startText} 至 ${endText}`;
  }

  private formatDate(value: Date) {
    return formatBusinessDate(value);
  }

  private formatMoney(value: number) {
    const prefix = value < 0 ? '-' : '';
    return `${prefix}¥${Math.abs(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
  }

  private formatPercent(value: number) {
    const sign = value > 0 ? '+' : '';
    return `${sign}${Math.round(value * 100)}%`;
  }

  private maskPhone(value?: string | null) {
    const text = String(value || '');
    if (!/^1\d{10}$/.test(text)) return text;
    return `${text.slice(0, 3)}****${text.slice(7)}`;
  }

  private getOrderPaidAmount(order: Record<string, unknown>) {
    const paymentRecords = Array.isArray(order.paymentRecords) ? (order.paymentRecords as Array<Record<string, unknown>>) : [];
    const paidByRecords = paymentRecords
      .filter((payment) => !/cancel|failed|void|取消|失败/.test(String(payment.status || '').toLowerCase()))
      .reduce((total, payment) => total + this.toNumber(payment.amount), 0);
    if (paidByRecords > 0) return paidByRecords;
    const netAmount = this.toNumber(order.netAmount);
    if (netAmount > 0) return netAmount;
    return this.toNumber(order.totalAmount);
  }

  private toNumber(value: unknown) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'object' && value && 'toNumber' in value && typeof (value as any).toNumber === 'function') return (value as any).toNumber();
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
