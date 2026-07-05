import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { formatBusinessDate, formatBusinessDateTime } from '../../common/utils/business-time.js';
import type { AgentEvidence, AgentToolExecutionContext, AgentToolResult } from '../../agent/agent.types.js';

const DAY_MS = 86_400_000;

type AgentV2DateRange = {
  start: Date;
  end: Date;
  label: string;
  preset: string;
};

type OrderRecordConfig = {
  title: string;
  queryKey: string;
  itemTypes?: string[];
  orderKinds?: string[];
  metricDefinition: string;
};

@Injectable()
export class AgentV2BusinessRecordQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async execute(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const capabilityId = String(args.capabilityId ?? '');
    if (capabilityId === 'inventory.scrap.records.list') return this.listInventoryScrapRecords(args, context);
    if (capabilityId === 'order.product.records.list') {
      return this.listOrderRecords(args, context, {
        title: '商品订单记录',
        queryKey: 'order.product.records',
        itemTypes: ['product', 'goods', 'sku'],
        orderKinds: ['product'],
        metricDefinition: '商品订单 = ProductOrder 中 orderKind=product 或 OrderItem.itemType 为商品/产品类的已落库订单。',
      });
    }
    if (capabilityId === 'order.project.records.list') {
      return this.listOrderRecords(args, context, {
        title: '项目订单记录',
        queryKey: 'order.project.records',
        itemTypes: ['project', 'service'],
        orderKinds: ['project'],
        metricDefinition: '项目订单 = ProductOrder 中 orderKind=project 或 OrderItem.itemType 为项目/服务类的已落库订单。',
      });
    }
    if (capabilityId === 'order.member-card.records.list') {
      return this.listOrderRecords(args, context, {
        title: '会员卡开卡与充值记录',
        queryKey: 'order.member-card.records',
        itemTypes: ['member_card', 'member-card', 'stored_value', 'recharge'],
        orderKinds: ['member_card_recharge', 'member_card_open', 'stored_value', 'recharge'],
        metricDefinition: '会员卡开卡与充值 = 储值类 ProductOrder/OrderItem 记录，回答余额充值和会员开卡，不等同于次卡。',
      });
    }
    if (capabilityId === 'order.card-package.records.list') return this.listCardPackageRecords(args, context);
    if (capabilityId === 'cashier.payment.records.list') return this.listPaymentRecords(args, context);
    if (capabilityId === 'card.usage.records.list') return this.listCardUsageRecords(args, context);
    if (capabilityId === 'card.package.status.lookup') return this.lookupCardPackageStatus(args, context);
    if (capabilityId === 'card.package.inactive-customers.list') return this.listCardPackageInactiveCustomers(args, context);
    if (capabilityId === 'customer.coupon.status.lookup') return this.lookupCustomerCouponStatus(args, context);
    if (capabilityId === 'finance.staff-commission.records.list') return this.listCommissionRecords(args, context);
    if (capabilityId === 'customer.consumption.records.list') return this.listCustomerConsumptionRecords(args, context);

    return {
      status: 'unsupported',
      title: '暂不支持的业务记录查询',
      summary: `V2 业务记录查询暂未支持 ${capabilityId || 'unknown'}。`,
      data: { capabilityId },
      evidence: this.evidence(['AgentV2CapabilityManifest'], '当前能力没有可执行记录查询器。', [], 0),
      actions: [],
    };
  }

  private async listInventoryScrapRecords(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const range = this.resolveDateRange(args.timeRange ?? 'this_week');
    const movements = await (this.prisma as any).stockMovement.findMany({
      where: {
        storeId: context.storeId,
        movementType: 'scrap_out',
        occurredAt: { gte: range.start, lt: range.end },
      },
      include: {
        product: { select: { id: true, name: true, sku: true, unit: true, specUnit: true, costPrice: true, category: { select: { name: true } } } },
        store: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true, username: true, role: true } },
        batch: { select: { id: true, batchNo: true, expiryDate: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });

    const items = (movements as any[]).map((movement) => {
      const quantity = Math.abs(this.toNumber(movement.quantity));
      const unit = movement.unit ?? movement.product?.specUnit ?? movement.product?.unit ?? '';
      const costPrice = this.toNumber(movement.product?.costPrice);
      const lossAmount = Number((quantity * costPrice).toFixed(2));
      return {
        movementId: movement.id,
        movementNo: movement.movementNo,
        productId: movement.productId,
        productName: movement.product?.name ?? `商品#${movement.productId}`,
        sku: movement.product?.sku ?? '',
        categoryName: movement.product?.category?.name ?? '未分类',
        scrapQuantity: quantity,
        unit,
        scrapQuantityText: `${quantity}${unit}`,
        lossAmount,
        lossAmountText: this.formatMoney(lossAmount),
        storeName: movement.store?.name ?? `门店#${movement.storeId}`,
        operatorName: movement.operator?.name ?? movement.operator?.username ?? '未记录',
        occurredAt: this.formatDateTime(movement.occurredAt),
        batchNo: movement.batch?.batchNo ?? '',
        expiryDate: this.formatDate(movement.batch?.expiryDate),
        sourceNo: movement.sourceNo ?? '',
        remark: movement.remark ?? '',
      };
    });

    const totalLossAmount = items.reduce((sum, item) => sum + item.lossAmount, 0);
    const evidence = this.evidence(
      ['StockMovement', 'Product', 'Store', 'User', 'StockBatch'],
      '已发生报废记录 = StockMovement.movementType 为 scrap_out 的库存流水；按发生时间过滤，按当前门店授权过滤。',
      [`storeId=${context.storeId}`, 'movementType=scrap_out', this.rangeFilterText('occurredAt', range), `limit=${limit}`],
      items.length,
      range,
      ['只读取当前已落库的库存报废流水，不推测临期风险，也不创建库存调整。'],
    );

    if (!items.length) {
      return this.noData('已发生报废记录', `${range.label}没有已发生的报废库存流水。`, { items, requestedLimit: limit, totalLossAmount: 0, timeRange: this.serializeRange(range) }, evidence);
    }

    return {
      status: 'success',
      title: '已发生报废记录',
      summary: `${range.label}共有 ${items.length} 条报废记录，预计损耗 ${this.formatMoney(totalLossAmount)}；最近一条是 ${items[0].productName}，数量 ${items[0].scrapQuantityText}。`,
      data: {
        items,
        requestedLimit: limit,
        totalLossAmount: Number(totalLossAmount.toFixed(2)),
        totalLossAmountText: this.formatMoney(totalLossAmount),
        timeRange: this.serializeRange(range),
      },
      evidence,
      actions: [{ label: '查看库存流水', action: 'inventory:stock-movements', riskLevel: 'low' }],
    };
  }

  private async listOrderRecords(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
    config: OrderRecordConfig,
  ): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const orderNo = this.extractOrderNo(args);
    const range = this.resolveDateRange(args.timeRange ?? (orderNo ? 'all' : 'this_week'));
    const where: Record<string, unknown> = {
      storeId: context.storeId,
      ...this.orderNoWhere(orderNo),
      ...this.createdAtWhere(range),
    };
    if (!orderNo) {
      where.OR = [
        ...(config.orderKinds?.length ? [{ orderKind: { in: config.orderKinds } }] : []),
        ...(config.itemTypes?.length ? [{ orderItems: { some: { itemType: { in: config.itemTypes } } } }] : []),
      ];
    }

    const orders = await (this.prisma as any).productOrder.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
        orderItems: { orderBy: { id: 'asc' } },
        paymentRecords: { orderBy: { createdAt: 'asc' } },
        refundRecords: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const items = (orders as any[]).map((order) => this.mapOrderRecord(order));
    const totalNetAmount = items.reduce((sum, item) => sum + item.netAmount, 0);
    const evidence = this.evidence(
      ['ProductOrder', 'OrderItem', 'PaymentRecord', 'RefundRecord', 'Customer', 'Store'],
      config.metricDefinition,
      [`storeId=${context.storeId}`, this.rangeFilterText('createdAt', range), orderNo ? `orderNo~${orderNo}` : `queryKey=${config.queryKey}`, `limit=${limit}`],
      items.length,
      range,
      ['只读已落库订单；如客户消费记录未同步，需要继续核对 ConsumptionRecord 来源链路。'],
    );

    if (!items.length) {
      return this.noData(config.title, orderNo ? `没有找到订单 ${orderNo}。` : `${range.label}没有匹配的${config.title}。`, { items, requestedLimit: limit, totalNetAmount: 0, timeRange: this.serializeRange(range) }, evidence);
    }

    return {
      status: 'success',
      title: config.title,
      summary: `${orderNo ? `订单 ${orderNo}` : range.label}找到 ${items.length} 条${config.title}，合计实收 ${this.formatMoney(totalNetAmount)}。`,
      data: {
        items,
        requestedLimit: limit,
        totalNetAmount: Number(totalNetAmount.toFixed(2)),
        totalNetAmountText: this.formatMoney(totalNetAmount),
        timeRange: this.serializeRange(range),
      },
      evidence,
      actions: [{ label: '查看订单管理', action: 'order:open-management', riskLevel: 'low' }],
    };
  }

  private async listCardPackageRecords(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const range = this.resolveDateRange(args.timeRange ?? 'this_week');
    const cards = await (this.prisma as any).customerCard.findMany({
      where: {
        customer: { storeId: context.storeId },
        ...this.createdAtWhere(range),
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, store: { select: { id: true, name: true } } } },
        card: { select: { id: true, name: true, totalTimes: true } },
        operator: { select: { id: true, name: true, username: true, role: true } },
        sourceOrder: { select: { id: true, orderNo: true, payMethod: true, status: true, netAmount: true, totalAmount: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const items = (cards as any[]).map((card) => ({
      customerCardId: card.id,
      sourceOrderNo: card.sourceOrder?.orderNo ?? '',
      cardName: card.cardName ?? card.card?.name ?? `次卡#${card.cardId}`,
      customerName: card.customer?.name ?? card.customerName ?? `客户#${card.customerId}`,
      customerPhone: card.customer?.phone ?? '',
      storeName: card.customer?.store?.name ?? '',
      totalTimes: this.toNumber(card.totalTimes),
      remainingTimes: this.toNumber(card.remainingTimes),
      paidAmount: this.toNumber(card.paidAmount ?? card.sourceOrder?.netAmount ?? card.sourceOrder?.totalAmount),
      paidAmountText: this.formatMoney(this.toNumber(card.paidAmount ?? card.sourceOrder?.netAmount ?? card.sourceOrder?.totalAmount)),
      giftTimes: this.toNumber(card.giftTimes),
      operatorName: card.operator?.name ?? card.operator?.username ?? '未记录',
      statusLabel: this.cardStatusLabel(card.status),
      createdAt: this.formatDateTime(card.createdAt),
      expiryDate: this.formatDate(card.expiryDate),
    }));
    const totalPaidAmount = items.reduce((sum, item) => sum + item.paidAmount, 0);
    const evidence = this.evidence(
      ['CustomerCard', 'Card', 'ProductOrder', 'Customer', 'Store', 'User'],
      '次卡开卡订单 = CustomerCard 来源开卡记录，关联 sourceOrder 可追溯原始收银订单。',
      [`storeId=${context.storeId}`, this.rangeFilterText('createdAt', range), `limit=${limit}`],
      items.length,
      range,
      ['只回答次卡开卡/购买记录，不回答核销服务流水。'],
    );
    if (!items.length) return this.noData('次卡开卡订单', `${range.label}没有次卡开卡订单。`, { items, requestedLimit: limit, timeRange: this.serializeRange(range) }, evidence);
    return {
      status: 'success',
      title: '次卡开卡订单',
      summary: `${range.label}找到 ${items.length} 条次卡开卡订单，合计实付 ${this.formatMoney(totalPaidAmount)}。`,
      data: { items, requestedLimit: limit, totalPaidAmount, totalPaidAmountText: this.formatMoney(totalPaidAmount), timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看次卡开卡管理', action: 'card-package:open-orders', riskLevel: 'low' }],
    };
  }

  private async lookupCardPackageStatus(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const keyword = this.extractCustomerKeyword(args);
    const evidence = this.evidence(
      ['CustomerCard', 'Card', 'Customer', 'CardUsageRecord'],
      '客户次卡状态 = CustomerCard 当前余次、总次数、有效期和状态；只读查询，不执行核销扣次。',
      [`storeId=${context.storeId}`, keyword ? `customer~${keyword}` : 'customer=missing', `limit=${limit}`],
      0,
      undefined,
      ['必须有客户名、手机号或客户 ID 才查询具体客户次卡，避免把全店客户卡片误暴露给当前问题。'],
    );
    if (!keyword) {
      return this.noData('客户次卡状态', '需要提供客户名、手机号或客户 ID，才能确认这位客人的次卡余量和有效期。', { items: [], requestedLimit: limit }, evidence);
    }

    const cards = await (this.prisma as any).customerCard.findMany({
      where: {
        customer: {
          storeId: context.storeId,
          ...this.customerKeywordWhere(keyword),
        },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, store: { select: { id: true, name: true } } } },
        card: { select: { id: true, name: true, totalTimes: true } },
        operator: { select: { id: true, name: true, username: true } },
      },
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }],
      take: limit,
    });

    const now = this.startOfDay(new Date());
    const items = ((cards ?? []) as any[]).map((card) => {
      const expiryDate = card.expiryDate ? new Date(card.expiryDate) : null;
      const daysUntilExpiry = expiryDate ? Math.ceil((this.startOfDay(expiryDate).getTime() - now.getTime()) / DAY_MS) : null;
      return {
        customerCardId: card.id,
        customerName: card.customer?.name ?? card.customerName ?? `客户#${card.customerId}`,
        customerPhone: card.customer?.phone ?? '',
        cardName: card.cardName ?? card.card?.name ?? `次卡#${card.cardId}`,
        totalTimes: this.toNumber(card.totalTimes ?? card.card?.totalTimes),
        remainingTimes: this.toNumber(card.remainingTimes),
        usedTimes: Math.max(0, this.toNumber(card.totalTimes ?? card.card?.totalTimes) - this.toNumber(card.remainingTimes)),
        expiryDate: this.formatDate(card.expiryDate),
        daysUntilExpiry,
        daysUntilExpiryText: daysUntilExpiry === null ? '未设置' : daysUntilExpiry >= 0 ? `剩余 ${daysUntilExpiry} 天` : `已过期 ${Math.abs(daysUntilExpiry)} 天`,
        statusLabel: this.cardStatusLabel(card.status),
        operatorName: card.operator?.name ?? card.operator?.username ?? '未记录',
        createdAt: this.formatDateTime(card.createdAt),
      };
    });
    const updatedEvidence = { ...evidence, sampleSize: items.length };
    if (!items.length) {
      return this.noData('客户次卡状态', `没有找到客户 ${keyword} 的次卡状态记录。`, { items, requestedLimit: limit }, updatedEvidence);
    }
    const activeCount = items.filter((item) => item.remainingTimes > 0 && item.statusLabel === '可用').length;
    return {
      status: 'success',
      title: '客户次卡状态',
      summary: `客户 ${items[0].customerName} 找到 ${items.length} 张次卡，其中 ${activeCount} 张仍可用；最近到期：${items[0].cardName}，${items[0].daysUntilExpiryText}。`,
      data: { items, requestedLimit: limit },
      evidence: updatedEvidence,
      actions: [{ label: '查看次卡核销管理', action: 'card-usage:open', riskLevel: 'low' }],
    };
  }

  private async lookupCustomerCouponStatus(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const keyword = this.extractCustomerKeyword(args);
    const evidence = this.evidence(
      ['Customer', 'Promotion', 'ProductOrder'],
      '客户优惠券状态 = 结合客户订单中已使用权益和当前权益资产库存识别；当前没有独立 CustomerCoupon 领取流水时会明确说明数据缺口。',
      [`storeId=${context.storeId}`, keyword ? `customer~${keyword}` : 'customer=missing', `limit=${limit}`],
      0,
      undefined,
      ['没有客户条件时不返回全店客户券信息；若未接入客户券领取表，只能确认已使用权益和可发权益库存。'],
    );
    if (!keyword) {
      return this.noData('客户优惠券状态', '需要提供客户名、手机号或客户 ID，才能查询这位客人是否有未核销优惠券。', { items: [], requestedLimit: limit, dataGap: 'missing_customer_context' }, evidence);
    }

    const customers = await (this.prisma as any).customer.findMany({
      where: {
        storeId: context.storeId,
        ...this.customerKeywordWhere(keyword),
      },
      select: { id: true, name: true, phone: true },
      take: 5,
    });
    const customerIds = ((customers ?? []) as any[]).map((customer) => Number(customer.id));
    if (!customerIds.length) {
      return this.noData('客户优惠券状态', `没有找到客户 ${keyword}。`, { items: [], requestedLimit: limit }, evidence);
    }

    const orders = await (this.prisma as any).productOrder.findMany({
      where: {
        storeId: context.storeId,
        customerId: { in: customerIds },
        OR: [{ couponId: { not: null } }, { promotionId: { not: null } }],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const promotions = await (this.prisma as any).promotion.findMany({
      where: {
        OR: [{ storeId: context.storeId }, { storeId: null }],
        status: { in: ['active', 'published', 'enabled'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    const promotionMap = new Map(((promotions ?? []) as any[]).map((promotion) => [Number(promotion.id), promotion]));
    const usedItems = ((orders ?? []) as any[]).map((order) => {
      const promotion = promotionMap.get(Number(order.promotionId)) ?? null;
      return {
        customerName: (customers as any[]).find((customer) => Number(customer.id) === Number(order.customerId))?.name ?? order.customerName ?? `客户#${order.customerId}`,
        promotionName: promotion?.name ?? order.discountSource ?? `权益#${order.promotionId ?? order.couponId}`,
        statusLabel: '已使用',
        usedOrderNo: order.orderNo,
        usedAt: this.formatDateTime(order.createdAt),
        validUntil: '',
      };
    });
    const availableItems = ((promotions ?? []) as any[])
      .filter((promotion) => this.toNumber(promotion.issuedCount) > this.toNumber(promotion.usedCount))
      .slice(0, Math.max(0, limit - usedItems.length))
      .map((promotion) => ({
        customerName: (customers as any[])[0]?.name ?? keyword,
        promotionName: promotion.name,
        statusLabel: '可发放库存',
        usedOrderNo: '',
        usedAt: '',
        validUntil: promotion.endAt ? this.formatDate(promotion.endAt) : promotion.validDays ? `领取后 ${promotion.validDays} 天` : '未设置',
      }));
    const items = [...usedItems, ...availableItems].slice(0, limit);
    const updatedEvidence = { ...evidence, sampleSize: items.length };
    if (!items.length) {
      return this.noData('客户优惠券状态', `客户 ${keyword} 暂未找到已使用权益或可用权益库存；如已接入客户券领取表，需要补充 CustomerCoupon 数据源。`, { items, requestedLimit: limit, dataGap: 'missing_customer_coupon_source' }, updatedEvidence);
    }
    return {
      status: 'success',
      title: '客户优惠券状态',
      summary: `客户 ${items[0].customerName} 找到 ${usedItems.length} 条已使用权益记录，当前可参考 ${availableItems.length} 个可发权益库存；未接入客户券领取流水时不能断言“已领取未核销”。`,
      data: { items, requestedLimit: limit, dataGap: 'customer_coupon_ledger_not_detected' },
      evidence: updatedEvidence,
      actions: [{ label: '查看权益资产库', action: 'marketing:promotions', riskLevel: 'low' }],
    };
  }

  private async listPaymentRecords(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const orderNo = this.extractOrderNo(args);
    const range = this.resolveDateRange(args.timeRange ?? (orderNo ? 'all' : 'this_week'));
    const payments = await (this.prisma as any).paymentRecord.findMany({
      where: {
        order: {
          storeId: context.storeId,
          ...this.orderNoWhere(orderNo),
        },
        ...this.paymentTimeWhere(range),
      },
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            orderKind: true,
            customerName: true,
            status: true,
            totalAmount: true,
            netAmount: true,
            customer: { select: { id: true, name: true, phone: true } },
            store: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    const items = (payments as any[]).map((payment) => ({
      paymentId: payment.id,
      paymentNo: payment.paymentNo,
      orderNo: payment.order?.orderNo ?? '',
      orderKindLabel: this.orderKindLabel(payment.order?.orderKind),
      customerName: payment.order?.customer?.name ?? payment.order?.customerName ?? '',
      storeName: payment.order?.store?.name ?? '',
      method: payment.method,
      methodLabel: this.payMethodLabel(payment.method),
      amount: this.toNumber(payment.amount),
      amountText: this.formatMoney(this.toNumber(payment.amount)),
      statusLabel: this.paymentStatusLabel(payment.status),
      paidAt: this.formatDateTime(payment.paidAt ?? payment.createdAt),
      orderNetAmountText: this.formatMoney(this.toNumber(payment.order?.netAmount ?? payment.order?.totalAmount)),
      transactionNo: payment.transactionNo ?? '',
    }));
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const evidence = this.evidence(
      ['PaymentRecord', 'ProductOrder', 'Customer', 'Store'],
      '收银支付流水 = PaymentRecord 已落库支付记录，按订单门店授权过滤，可用于核对订单是否进入财务。',
      [`storeId=${context.storeId}`, this.rangeFilterText('paidAt/createdAt', range), orderNo ? `orderNo~${orderNo}` : 'paymentRecord', `limit=${limit}`],
      items.length,
      range,
      ['支付流水回答收银是否入账；订单项目/商品明细需查对应订单能力。'],
    );
    if (!items.length) return this.noData('收银支付流水', orderNo ? `没有找到订单 ${orderNo} 对应的支付流水。` : `${range.label}没有收银支付流水。`, { items, requestedLimit: limit, totalAmount: 0, timeRange: this.serializeRange(range) }, evidence);
    return {
      status: 'success',
      title: '收银支付流水',
      summary: `${orderNo ? `订单 ${orderNo}` : range.label}找到 ${items.length} 条支付流水，合计 ${this.formatMoney(totalAmount)}。`,
      data: { items, requestedLimit: limit, totalAmount, totalAmountText: this.formatMoney(totalAmount), timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看收银对账', action: 'finance:reconciliation', riskLevel: 'low' }],
    };
  }

  private async listCardUsageRecords(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const range = this.resolveDateRange(args.timeRange ?? 'this_week');
    const records = await (this.prisma as any).cardUsageRecord.findMany({
      where: {
        storeId: context.storeId,
        verifiedAt: { gte: range.start, lt: range.end },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true, username: true, role: true } },
        beautician: { select: { id: true, name: true, userId: true } },
        device: { select: { id: true, name: true, deviceCode: true } },
        sourceOrder: { select: { id: true, orderNo: true } },
      },
      orderBy: { verifiedAt: 'desc' },
      take: limit,
    });

    const items = (records as any[]).map((record) => {
      const operatorName = record.operator?.name ?? record.operator?.username ?? record.beautician?.name ?? '未记录';
      const entrySourceLabel = record.device ? '智能终端' : record.operator ? '管理端' : '未记录';
      return {
        usageId: record.id,
        sourceOrderNo: record.sourceOrder?.orderNo ?? '',
        cardName: record.cardName ?? `次卡#${record.cardId}`,
        customerName: record.customer?.name ?? record.customerName ?? `客户#${record.customerId}`,
        customerPhone: record.customer?.phone ?? '',
        projectName: record.projectName ?? `项目#${record.projectId}`,
        storeName: record.store?.name ?? `门店#${record.storeId}`,
        times: this.toNumber(record.times),
        timesText: `${this.toNumber(record.times)} 次`,
        remainingTimes: this.toNumber(record.remainingTimes),
        remainingTimesText: `${this.toNumber(record.remainingTimes)} 次`,
        recognizedAmount: this.toNumber(record.recognizedAmount),
        recognizedAmountText: this.formatMoney(this.toNumber(record.recognizedAmount)),
        operatorName,
        beauticianName: record.beautician?.name ?? '',
        entrySourceLabel,
        deviceName: record.device?.name ?? record.device?.deviceCode ?? '',
        verifiedAt: this.formatDateTime(record.verifiedAt),
      };
    });
    const totalRecognizedAmount = items.reduce((sum, item) => sum + item.recognizedAmount, 0);
    const evidence = this.evidence(
      ['CardUsageRecord', 'CustomerCard', 'Card', 'Project', 'Customer', 'User', 'Beautician', 'TerminalDevice'],
      '次卡核销记录 = CardUsageRecord 已落库服务核销流水；管理端核销看 operator，智能终端核销看 device。',
      [`storeId=${context.storeId}`, this.rangeFilterText('verifiedAt', range), `limit=${limit}`],
      items.length,
      range,
      ['核销入口不能只看终端设备；管理端核销也必须纳入统计。'],
    );
    if (!items.length) return this.noData('次卡核销记录', `${range.label}没有次卡核销记录。`, { items, requestedLimit: limit, timeRange: this.serializeRange(range) }, evidence);
    return {
      status: 'success',
      title: '次卡核销记录',
      summary: `${range.label}找到 ${items.length} 条次卡核销记录，识别收入 ${this.formatMoney(totalRecognizedAmount)}。`,
      data: { items, requestedLimit: limit, totalRecognizedAmount, totalRecognizedAmountText: this.formatMoney(totalRecognizedAmount), timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看次卡核销管理', action: 'card-usage:open', riskLevel: 'low' }],
    };
  }

  private async listCardPackageInactiveCustomers(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const range = this.resolveDateRange(args.timeRange ?? 'last_90_days');
    const inactiveThresholdDays = this.toNumber((args.filters as any)?.inactiveDays ?? 30) || 30;
    const cards = await (this.prisma as any).customerCard.findMany({
      where: {
        customer: { storeId: context.storeId },
        remainingTimes: { gt: 0 },
        status: { in: ['active', 'enabled', 'available'] },
        createdAt: { lt: new Date(Date.now() - inactiveThresholdDays * DAY_MS) },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, store: { select: { id: true, name: true } } } },
        card: { select: { id: true, name: true, totalTimes: true } },
        usageRecords: { orderBy: { verifiedAt: 'desc' }, take: 1, select: { verifiedAt: true, projectName: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: Math.max(limit * 3, 50),
    });

    const now = this.startOfDay(new Date());
    const items = ((cards ?? []) as any[])
      .map((card) => {
        const lastUsedAtDate = card.usageRecords?.[0]?.verifiedAt ? new Date(card.usageRecords[0].verifiedAt) : null;
        const baseDate = lastUsedAtDate ?? new Date(card.createdAt);
        const inactiveDays = Math.max(0, Math.floor((now.getTime() - this.startOfDay(baseDate).getTime()) / DAY_MS));
        return {
          customerCardId: card.id,
          customerName: card.customer?.name ?? `客户#${card.customerId}`,
          customerPhone: card.customer?.phone ?? '',
          cardName: card.cardName ?? card.card?.name ?? `次卡#${card.cardId}`,
          remainingTimes: this.toNumber(card.remainingTimes),
          totalTimes: this.toNumber(card.totalTimes ?? card.card?.totalTimes),
          lastUsedAt: lastUsedAtDate ? this.formatDate(lastUsedAtDate) : '未核销',
          lastProjectName: card.usageRecords?.[0]?.projectName ?? '',
          inactiveDays,
          createdAt: this.formatDate(card.createdAt),
          expiryDate: this.formatDate(card.expiryDate),
        };
      })
      .filter((item) => item.inactiveDays >= inactiveThresholdDays)
      .sort((a, b) => b.inactiveDays - a.inactiveDays)
      .slice(0, limit);
    const evidence = this.evidence(
      ['CustomerCard', 'CardUsageRecord', 'Customer', 'Card'],
      '次卡沉睡客户 = 仍有余次的 CustomerCard，结合最近 CardUsageRecord 判断超过阈值未使用。',
      [`storeId=${context.storeId}`, `inactiveDays>=${inactiveThresholdDays}`, `limit=${limit}`],
      items.length,
      range,
      ['名单只用于人工跟进参考，不自动下发触达、不执行核销扣次。'],
    );
    if (!items.length) {
      return this.noData('次卡沉睡客户名单', `没有找到超过 ${inactiveThresholdDays} 天未使用且仍有余次的次卡客户。`, { items, requestedLimit: limit, inactiveThresholdDays }, evidence);
    }
    return {
      status: 'success',
      title: '次卡沉睡客户名单',
      summary: `找到 ${items.length} 位买了次卡但超过 ${inactiveThresholdDays} 天未使用的客户，建议按未使用天数优先跟进。`,
      data: { items, requestedLimit: limit, inactiveThresholdDays, timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看次卡核销管理', action: 'card-usage:open', riskLevel: 'low' }],
    };
  }

  private async listCommissionRecords(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const range = this.resolveDateRange(args.timeRange ?? 'this_week');
    const records = await (this.prisma as any).commissionRecord.findMany({
      where: {
        storeId: context.storeId,
        createdAt: { gte: range.start, lt: range.end },
      },
      include: {
        staffUser: { select: { id: true, name: true, username: true, role: true } },
        beautician: { select: { id: true, name: true } },
        order: { select: { id: true, orderNo: true, orderKind: true } },
        orderItem: { select: { id: true, name: true, itemType: true } },
        rule: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const items = (records as any[]).map((record) => ({
      commissionId: record.id,
      staffName: record.staffUser?.name ?? record.staffUser?.username ?? record.beautician?.name ?? '未绑定人员',
      staffUserId: record.staffUserId ?? '',
      beauticianName: record.beautician?.name ?? '',
      orderNo: record.order?.orderNo ?? '',
      orderKindLabel: this.orderKindLabel(record.order?.orderKind),
      sourceTypeLabel: this.sourceTypeLabel(record.sourceType),
      itemName: record.orderItem?.name ?? '',
      ruleName: record.rule?.name ?? '',
      sourceAmount: this.toNumber(record.sourceAmount),
      sourceAmountText: this.formatMoney(this.toNumber(record.sourceAmount)),
      rateText: `${Number(this.toNumber(record.rate) * 100).toFixed(2)}%`,
      amount: this.toNumber(record.amount),
      amountText: this.formatMoney(this.toNumber(record.amount)),
      statusLabel: this.commissionStatusLabel(record.status),
      settleMonth: record.settleMonth ?? '',
      createdAt: this.formatDateTime(record.createdAt),
    }));
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const evidence = this.evidence(
      ['CommissionRecord', 'User', 'Beautician', 'CommissionRule', 'ProductOrder', 'OrderItem', 'CardUsageRecord'],
      '员工提成流水 = CommissionRecord，主体字段 staffUserId；beauticianId 仅用于历史兼容或技师关联。',
      [`storeId=${context.storeId}`, this.rangeFilterText('createdAt', range), `limit=${limit}`],
      items.length,
      range,
      ['员工人效和提成必须与系统用户统一，不能只按历史美容师表解释。'],
    );
    if (!items.length) return this.noData('员工提成流水', `${range.label}没有员工提成流水。`, { items, requestedLimit: limit, timeRange: this.serializeRange(range) }, evidence);
    return {
      status: 'success',
      title: '员工提成流水',
      summary: `${range.label}找到 ${items.length} 条员工提成流水，合计提成 ${this.formatMoney(totalAmount)}。`,
      data: { items, requestedLimit: limit, totalAmount, totalAmountText: this.formatMoney(totalAmount), timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看提成明细', action: 'finance:commission-records', riskLevel: 'low' }],
    };
  }

  private async listCustomerConsumptionRecords(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const limit = this.resolveLimit(args.limit);
    const range = this.resolveDateRange(args.timeRange ?? 'this_week');
    const records = await (this.prisma as any).consumptionRecord.findMany({
      where: {
        customer: { storeId: context.storeId },
        consumeTime: { gte: range.start, lt: range.end },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true, storeId: true, store: { select: { id: true, name: true } } } },
      },
      orderBy: { consumeTime: 'desc' },
      take: limit,
    });
    const items = (records as any[]).map((record) => ({
      consumptionId: record.id,
      customerName: record.customer?.name ?? `客户#${record.customerId}`,
      customerPhone: record.customer?.phone ?? '',
      storeName: record.customer?.store?.name ?? '',
      consumeType: record.consumeType,
      consumeTypeLabel: this.consumeTypeLabel(record.consumeType),
      consumeContentText: this.formatConsumeContent(record.consumeContent),
      payMethodLabel: this.payMethodLabel(record.payMethod),
      amount: this.toNumber(record.amount),
      amountText: this.formatMoney(this.toNumber(record.amount)),
      campaign: record.campaign ?? '',
      consumeTime: this.formatDateTime(record.consumeTime),
    }));
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const evidence = this.evidence(
      ['ConsumptionRecord', 'Customer', 'ProductOrder', 'CardUsageRecord', 'CustomerCard'],
      '客户消费记录 = ConsumptionRecord 客户视角消费流水；用于核对订单、收银、核销是否同步进客户画像。',
      [`storeId=${context.storeId}`, this.rangeFilterText('consumeTime', range), `limit=${limit}`],
      items.length,
      range,
      ['如果订单存在但 ConsumptionRecord 缺失，说明同步链路存在断点，不能把订单明细硬当成客户消费记录。'],
    );
    if (!items.length) return this.noData('客户消费记录', `${range.label}没有客户消费记录。`, { items, requestedLimit: limit, timeRange: this.serializeRange(range) }, evidence);
    return {
      status: 'success',
      title: '客户消费记录',
      summary: `${range.label}找到 ${items.length} 条客户消费记录，合计消费 ${this.formatMoney(totalAmount)}。`,
      data: { items, requestedLimit: limit, totalAmount, totalAmountText: this.formatMoney(totalAmount), timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看客户消费记录', action: 'customer:consumption-records', riskLevel: 'low' }],
    };
  }

  private mapOrderRecord(order: any) {
    const totalDiscountAmount = this.toNumber(order.totalDiscountAmount ?? order.orderDiscountAmount ?? order.itemDiscountAmount);
    const netAmount = this.toNumber(order.netAmount ?? order.totalAmount);
    const refundAmount = (order.refundRecords ?? []).reduce((sum: number, refund: any) => sum + this.toNumber(refund.amount), 0);
    return {
      orderId: order.id,
      orderNo: order.orderNo,
      orderKind: order.orderKind,
      orderKindLabel: this.orderKindLabel(order.orderKind),
      customerName: order.customer?.name ?? order.customerName ?? '',
      customerPhone: order.customer?.phone ?? '',
      storeName: order.store?.name ?? `门店#${order.storeId}`,
      itemSummary: this.describeOrderItems(order),
      itemCount: Array.isArray(order.orderItems) && order.orderItems.length ? order.orderItems.length : this.countItemsJson(order.items),
      totalAmount: this.toNumber(order.totalAmount),
      totalAmountText: this.formatMoney(this.toNumber(order.totalAmount)),
      netAmount,
      netAmountText: this.formatMoney(netAmount),
      discountAmount: totalDiscountAmount,
      discountAmountText: this.formatMoney(totalDiscountAmount),
      refundAmount,
      refundAmountText: this.formatMoney(refundAmount),
      payMethodLabel: this.payMethodLabel(order.payMethod),
      statusLabel: this.orderStatusLabel(order.status),
      source: order.source ?? '',
      createdAt: this.formatDateTime(order.createdAt),
      remark: order.remark ?? '',
    };
  }

  private describeOrderItems(order: any) {
    const orderItems = Array.isArray(order.orderItems) ? order.orderItems : [];
    if (orderItems.length) {
      return orderItems
        .slice(0, 4)
        .map((item: any) => `${item.name ?? item.itemName ?? '明细'} x${this.toNumber(item.quantity) || 1}`)
        .join('；');
    }
    const items = Array.isArray(order.items) ? order.items : [];
    return items
      .slice(0, 4)
      .map((item: any) => `${item.name ?? item.productName ?? item.projectName ?? '明细'} x${this.toNumber(item.quantity) || 1}`)
      .join('；') || '-';
  }

  private countItemsJson(items: unknown) {
    return Array.isArray(items) ? items.length : 0;
  }

  private formatConsumeContent(value: unknown): string {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed;
      try {
        return this.formatConsumeContent(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }
    if (Array.isArray(value)) {
      return value.map((item: unknown) => this.formatConsumeContent(item)).filter(Boolean).join('；') || '-';
    }
    if (typeof value === 'object') {
      const object = value as Record<string, any>;
      const names = [
        object.projectName,
        object.productName,
        object.cardName,
        object.serviceName,
        object.result,
        Array.isArray(object.consumptionItems)
          ? object.consumptionItems.map((item: any) => `${item.name ?? item.productName ?? item.projectName ?? '项目'} x${item.quantity ?? 1}`).join('；')
          : '',
      ].filter(Boolean);
      return names.join('；') || '-';
    }
    return String(value);
  }

  private noData(title: string, summary: string, data: unknown, evidence: AgentEvidence): AgentToolResult {
    return { status: 'no_data', title, summary, data, evidence, actions: [] };
  }

  private resolveLimit(input: unknown) {
    return Math.min(Math.max(Number(input) || 20, 1), 100);
  }

  private resolveDateRange(input: unknown): AgentV2DateRange {
    const now = new Date();
    const preset = typeof input === 'object' && input !== null ? String((input as any).preset ?? '') : String(input ?? '');
    if (preset === 'all') return { start: new Date(0), end: now, label: '全部时间', preset };
    if (typeof input === 'object' && input !== null && (input as any).startDate && (input as any).endDate) {
      return {
        start: new Date(String((input as any).startDate)),
        end: new Date(`${String((input as any).endDate).slice(0, 10)}T23:59:59.999Z`),
        label: String((input as any).label ?? '自定义时间'),
        preset: String((input as any).preset ?? 'custom'),
      };
    }
    if (preset === 'today') {
      const start = this.startOfDay(now);
      return { start, end: new Date(start.getTime() + DAY_MS), label: '今天', preset };
    }
    if (preset === 'yesterday') {
      const end = this.startOfDay(now);
      return { start: new Date(end.getTime() - DAY_MS), end, label: '昨天', preset };
    }
    if (preset === 'last_7_days') return { start: new Date(now.getTime() - 7 * DAY_MS), end: now, label: '近 7 天', preset };
    if (preset === 'last_30_days') return { start: new Date(now.getTime() - 30 * DAY_MS), end: now, label: '近 30 天', preset };
    if (preset === 'this_month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: '本月', preset };
    const start = this.startOfWeek(now);
    return { start, end: now, label: '本周', preset: 'this_week' };
  }

  private createdAtWhere(range: AgentV2DateRange) {
    if (range.preset === 'all') return {};
    return { createdAt: { gte: range.start, lt: range.end } };
  }

  private paymentTimeWhere(range: AgentV2DateRange) {
    if (range.preset === 'all') return {};
    return { OR: [{ paidAt: { gte: range.start, lt: range.end } }, { createdAt: { gte: range.start, lt: range.end } }] };
  }

  private orderNoWhere(orderNo: string | null) {
    return orderNo ? { orderNo: { contains: orderNo } } : {};
  }

  private extractOrderNo(args: Record<string, unknown>) {
    const filters = typeof args.filters === 'object' && args.filters !== null ? args.filters as Record<string, unknown> : {};
    const fromFilter = String(filters.orderNo ?? '').trim();
    if (fromFilter) return fromFilter;
    const question = String(args.question ?? '').toUpperCase();
    return question.match(/[A-Z]{2,}[A-Z0-9]{5,}|PO\d{6,}/)?.[0] ?? null;
  }

  private extractCustomerKeyword(args: Record<string, unknown>) {
    const filters = typeof args.filters === 'object' && args.filters !== null ? args.filters as Record<string, unknown> : {};
    const fromFilter = String(filters.customerId ?? filters.customerName ?? filters.customerPhone ?? filters.keyword ?? '').trim();
    if (fromFilter) return fromFilter;
    const question = String(args.question ?? '').trim();
    const phone = question.match(/1[3-9]\d{9}/)?.[0];
    if (phone) return phone;
    const named =
      question.match(/(?:客户|客人|会员)(?:叫|是|名为|姓名为)([\u4e00-\u9fa5]{2,4})/)?.[1] ??
      question.match(/(?:客户|客人|会员)\s*([\u4e00-\u9fa5]{2,4})(?=的|\s|，|,|。|$)/)?.[1];
    if (named && !/^(的|有|没|要|说|想|需|可|还|未|已|这|那)/.test(named)) return named;
    return '';
  }

  private customerKeywordWhere(keyword: string) {
    const trimmed = String(keyword ?? '').trim();
    const numericId = Number(trimmed);
    const or: Array<Record<string, unknown>> = [
      { name: { contains: trimmed } },
      { phone: { contains: trimmed } },
    ];
    if (Number.isInteger(numericId) && numericId > 0 && trimmed.length <= 8) or.push({ id: numericId });
    return { OR: or };
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private startOfWeek(date: Date) {
    const day = date.getDay() || 7;
    const start = this.startOfDay(date);
    return new Date(start.getTime() - (day - 1) * DAY_MS);
  }

  private evidence(source: string[], metricDefinition: string, filters: string[], sampleSize: number, range?: AgentV2DateRange, limitations?: string[]): AgentEvidence {
    return {
      source,
      sourceTables: source,
      dateRange: range ? `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}` : undefined,
      metricDefinition,
      filters,
      sampleSize,
      limitations: limitations ?? ['只读取当前账号授权范围内的已落库业务数据，不执行写入、删除、发券或下发。'],
    };
  }

  private serializeRange(range: AgentV2DateRange) {
    return { start: this.formatDate(range.start), end: this.formatDate(range.end), label: range.label, preset: range.preset };
  }

  private rangeFilterText(field: string, range: AgentV2DateRange) {
    if (range.preset === 'all') return `${field}=全部时间`;
    return `${field}=${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`;
  }

  private formatDate(value: unknown) {
    if (!value) return '';
    return formatBusinessDate(value as Date);
  }

  private formatDateTime(value: unknown) {
    if (!value) return '';
    return formatBusinessDateTime(value as Date, { seconds: true });
  }

  private toNumber(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
  }

  private formatMoney(value: number) {
    return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private payMethodLabel(value: unknown) {
    const map: Record<string, string> = {
      wechat: '微信',
      alipay: '支付宝',
      cash: '现金',
      card: '银行卡',
      balance: '会员卡余额',
      member_card: '会员卡划扣',
      mixed: '组合支付',
    };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '未记录');
  }

  private orderStatusLabel(value: unknown) {
    const map: Record<string, string> = { pending: '待处理', paid: '已支付', completed: '已完成', refunded: '已退款', cancelled: '已取消' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '未记录');
  }

  private paymentStatusLabel(value: unknown) {
    const map: Record<string, string> = { pending: '待支付', paid: '已支付', success: '成功', failed: '失败', refunded: '已退款' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '未记录');
  }

  private orderKindLabel(value: unknown) {
    const map: Record<string, string> = {
      product: '商品订单',
      project: '项目订单',
      member_card_recharge: '会员卡充值',
      member_card_open: '会员开卡',
      card_package: '次卡开卡',
      recharge: '充值',
    };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '订单');
  }

  private cardStatusLabel(value: unknown) {
    const map: Record<string, string> = { active: '可用', enabled: '可用', expired: '已过期', disabled: '停用', used_up: '已用完' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '未记录');
  }

  private commissionStatusLabel(value: unknown) {
    const map: Record<string, string> = { pending: '待确认', confirmed: '已确认', settled: '已结算', paid: '已发放' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '未记录');
  }

  private sourceTypeLabel(value: unknown) {
    const map: Record<string, string> = { product: '商品订单', project: '项目订单', card: '次卡/会员卡', card_usage: '次卡核销', recharge: '充值', manual: '手工调整' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '业务记录');
  }

  private consumeTypeLabel(value: unknown) {
    const map: Record<string, string> = { product_order: '商品订单', project_order: '项目订单', card_usage: '次卡核销', member_card: '会员卡', service: '服务记录' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '消费记录');
  }
}
