import { Injectable, Optional } from '@nestjs/common';
import type { AgentEvidence, AgentToolExecutionContext, AgentToolResult } from '../../agent/agent.types.js';
import { formatBusinessDate, formatBusinessDateTime } from '../../common/utils/business-time.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { listAgentV2CapabilityManifests } from '../capability/agent-v2-capability-manifest.js';
import type { AgentV2CapabilityManifest } from '../capability/agent-v2-capability.types.js';
import { AgentV2ManifestProviderService } from '../capability-center/agent-v2-manifest-provider.service.js';
import { GenericQueryEngineService } from '../query-engine/generic-query-engine.service.js';

const DAY_MS = 86_400_000;

type AgentV2DateRange = {
  start: Date;
  end: Date;
  label: string;
  preset: string;
};

type MetricQueryTarget = {
  manifest: AgentV2CapabilityManifest;
  capabilityId: string;
  queryKey?: string;
  displayName: string;
  sourceModels: string[];
  permissionCodes: string[];
  boundaryNotes: string[];
};

@Injectable()
export class AgentV2BusinessMetricQueryService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly genericQueryEngine?: GenericQueryEngineService,
    @Optional() private readonly manifestProvider?: AgentV2ManifestProviderService,
  ) {}

  private get targets() {
    return this.buildTargets();
  }

  async execute(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const capabilityId = String(args.capabilityId ?? '');
    const queryKey = String(args.queryKey ?? '');
    const target = this.resolveTarget(capabilityId, queryKey);
    const metricKey = target?.queryKey ?? (queryKey || capabilityId);
    const genericResult = await this.tryExecuteGenericMetric(target, args, context);
    if (genericResult) return this.withMetricTarget(genericResult, target);
    const result = await this.executeMetricKey(metricKey, args, context);
    if (result) return this.withMetricTarget(result, target);
    if (target) return this.metricNeedsDevelopment(target);

    return {
      status: 'unsupported',
      title: '暂不支持的业务指标查询',
      summary: `V2 业务指标查询暂未支持 ${capabilityId || 'unknown'}。`,
      data: { capabilityId, queryKey },
      evidence: this.evidence(['AgentV2CapabilityManifest'], '当前能力没有可执行指标查询器。', [], 0),
      actions: [],
    };
  }

  private buildTargets(): MetricQueryTarget[] {
    return this.activeManifests()
      .filter((manifest) => manifest.status === 'enabled' && manifest.executor.tool === 'business.metric.query')
      .map((manifest) => ({
        manifest,
        capabilityId: manifest.capabilityId,
        queryKey: manifest.executor.queryKey,
        displayName: manifest.displayName,
        sourceModels: manifest.sourceModels,
        permissionCodes: manifest.permissionCodes,
        boundaryNotes: manifest.boundaryNotes,
      }));
  }

  private activeManifests() {
    return this.manifestProvider?.listManifests() ?? listAgentV2CapabilityManifests();
  }

  private resolveTarget(capabilityId: string, queryKey: string) {
    const candidates = [capabilityId, queryKey].map((value) => value.trim()).filter(Boolean);
    return this.targets.find((target) => candidates.includes(target.capabilityId) || (target.queryKey && candidates.includes(target.queryKey))) ?? null;
  }

  private async tryExecuteGenericMetric(
    target: MetricQueryTarget | null,
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult | null> {
    if (!target || !this.genericQueryEngine?.canExecute(target.manifest)) return null;
    return this.genericQueryEngine.tryExecute({
      manifest: target.manifest,
      args: {
        ...args,
        capabilityId: target.capabilityId,
        queryKey: target.queryKey ?? args.queryKey,
      },
      context,
    });
  }

  private executeMetricKey(metricKey: string, args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult | null> {
    if (metricKey === 'finance.daily-settlement.metric') return this.getDailySettlementMetric(args, context);
    if (metricKey === 'finance.payment-method-breakdown.metric') return this.getPaymentMethodBreakdownMetric(args, context);
    if (metricKey === 'finance.refund.metric') return this.getRefundMetric(args, context);
    if (metricKey === 'finance.staff-commission.metric') return this.getStaffCommissionMetric(args, context);
    if (metricKey === 'finance.staff-efficiency.metric') return this.getStaffEfficiencyMetric(args, context);
    if (metricKey === 'finance.product-gross-profit.metric') return this.getProductGrossProfitMetric(args, context);
    if (metricKey === 'finance.project-gross-profit.metric') return this.getProjectGrossProfitMetric(args, context);
    if (metricKey === 'finance.overall-gross-margin.metric') return this.getOverallGrossMarginMetric(args, context);
    if (metricKey === 'finance.card-package-sales.metric') return this.getCardPackageSalesMetric(args, context);
    if (metricKey === 'finance.payment-channel-fee.metric') return this.getPaymentChannelFeeMetric(args, context);
    if (metricKey === 'marketing.coupon-redemption.metric') return this.getCouponRedemptionMetric(args, context);
    if (metricKey === 'card.package.free-vs-paid.behavior.metric') return this.getCardPackageFreeVsPaidBehaviorMetric(args, context);
    if (metricKey === 'finance.discount-permission-risk.metric') return this.getDiscountPermissionRiskMetric(args, context);
    if (metricKey === 'finance.risk-diagnostics.metric') return this.getFinanceRiskDiagnosticsMetric(args, context);
    if (metricKey === 'agent.multi-domain.summary') return this.getMultiDomainSummaryMetric(args, context);
    if (metricKey === 'finance.commission-cost-optimization.advice') return this.getCommissionCostOptimizationAdvice(args, context);
    return Promise.resolve(null);
  }

  private withMetricTarget(result: AgentToolResult, target: MetricQueryTarget | null): AgentToolResult {
    if (!target) return result;
    const data = result.data && typeof result.data === 'object' && !Array.isArray(result.data) ? result.data as Record<string, unknown> : {};
    return {
      ...result,
      data: {
        ...data,
        metricManifest: {
          capabilityId: target.capabilityId,
          queryKey: target.queryKey,
          sourceModels: target.sourceModels,
          permissionCodes: target.permissionCodes,
        },
      },
    };
  }

  private metricNeedsDevelopment(target: MetricQueryTarget): AgentToolResult {
    return {
      status: 'unsupported',
      title: `${target.displayName}待接入`,
      summary: `${target.displayName} 已进入 Manifest，但 business.metric.query 尚未接入 queryKey=${target.queryKey ?? target.capabilityId} 的执行器。`,
      data: {
        capabilityId: target.capabilityId,
        queryKey: target.queryKey,
        reason: 'metric_query_executor_missing',
      },
      evidence: this.evidence(
        ['AgentV2CapabilityManifest', ...target.sourceModels],
        'Manifest 已声明指标能力，但缺少对应的指标执行器。',
        [`capabilityId=${target.capabilityId}`, `queryKey=${target.queryKey ?? ''}`, ...target.permissionCodes.map((code) => `permission=${code}`)],
        0,
        undefined,
        target.boundaryNotes,
      ),
      actions: [],
    };
  }

  private async getDailySettlementMetric(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'today');
    const settlements = await (this.prisma as any).dailySettlement.findMany({
      where: {
        storeId: context.storeId,
        settleDate: { gte: range.start, lt: range.end },
      },
      orderBy: { settleDate: 'desc' },
      take: 60,
    });
    const rows = (settlements as any[]).map((settlement) => {
      const totalRevenue = this.toNumber(settlement.totalRevenue);
      const refundAmount = this.toNumber(settlement.refundAmount);
      const netRevenue = totalRevenue - refundAmount;
      return {
        settlementId: settlement.id,
        settleDate: this.formatDate(settlement.settleDate),
        totalRevenue,
        totalRevenueText: this.formatMoney(totalRevenue),
        refundAmount,
        refundAmountText: this.formatMoney(refundAmount),
        netRevenue,
        netRevenueText: this.formatMoney(netRevenue),
        orderCount: this.toNumber(settlement.orderCount),
        customerCount: this.toNumber(settlement.customerCount),
        avgTransactionText: this.formatMoney(this.toNumber(settlement.avgTransaction)),
        grossProfitText: this.formatMoney(this.toNumber(settlement.grossProfit)),
        grossMarginText: `${this.toNumber(settlement.grossMargin).toFixed(1)}%`,
        commissionTotalText: this.formatMoney(this.toNumber(settlement.commissionTotal)),
        statusLabel: this.statusLabel(settlement.status),
      };
    });
    const totals = rows.reduce(
      (sum, row) => ({
        totalRevenue: sum.totalRevenue + row.totalRevenue,
        refundAmount: sum.refundAmount + row.refundAmount,
        netRevenue: sum.netRevenue + row.netRevenue,
        orderCount: sum.orderCount + row.orderCount,
        customerCount: sum.customerCount + row.customerCount,
      }),
      { totalRevenue: 0, refundAmount: 0, netRevenue: 0, orderCount: 0, customerCount: 0 },
    );
    const evidence = this.evidence(
      ['DailySettlement', 'PaymentRecord', 'RefundRecord', 'ProductOrder', 'CommissionRecord'],
      '日结报表指标 = DailySettlement 已生成日结汇总；营收、退款、订单数、客数、毛利和提成来自财务日结口径。',
      [`storeId=${context.storeId}`, `settleDate=${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`],
      rows.length,
      range,
      ['日结指标依赖日结生成任务；若订单或收银已存在但日结为空，需要先核对日结生成链路。'],
    );
    if (!rows.length) {
      return {
        status: 'no_data',
        title: '日结报表指标',
        summary: `${range.label}没有已生成的日结报表。`,
        data: { rows, metrics: totals, timeRange: this.serializeRange(range) },
        evidence,
        actions: [{ label: '生成日结报表', action: 'finance:daily-settlement-generate', riskLevel: 'medium' }],
      };
    }
    return {
      status: 'success',
      title: '日结报表指标',
      summary: `${range.label}日结实收 ${this.formatMoney(totals.totalRevenue)}，退款 ${this.formatMoney(totals.refundAmount)}，净收 ${this.formatMoney(totals.netRevenue)}，订单 ${totals.orderCount} 单。`,
      data: {
        rows,
        items: rows,
        metrics: {
          ...totals,
          totalRevenueText: this.formatMoney(totals.totalRevenue),
          refundAmountText: this.formatMoney(totals.refundAmount),
          netRevenueText: this.formatMoney(totals.netRevenue),
        },
        timeRange: this.serializeRange(range),
      },
      evidence,
      actions: [{ label: '查看日结报表', action: 'finance:daily-settlement', riskLevel: 'low' }],
    };
  }

  private async getPaymentMethodBreakdownMetric(
    args: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'today');
    const payments = await (this.prisma as any).paymentRecord.findMany({
      where: {
        order: { storeId: context.storeId },
        ...this.paymentTimeWhere(range),
      },
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            orderKind: true,
            customerName: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      take: 2000,
    });

    const grouped = new Map<string, { method: string; methodLabel: string; revenue: number; paymentCount: number; orderIds: Set<number>; latestPaidAt: string }>();
    for (const payment of payments as any[]) {
      const method = String(payment.method ?? 'unknown').toLowerCase();
      const existing =
        grouped.get(method) ??
        {
          method,
          methodLabel: this.payMethodLabel(method),
          revenue: 0,
          paymentCount: 0,
          orderIds: new Set<number>(),
          latestPaidAt: '',
        };
      existing.revenue += this.toNumber(payment.amount);
      existing.paymentCount += 1;
      if (payment.orderId) existing.orderIds.add(Number(payment.orderId));
      if (!existing.latestPaidAt) existing.latestPaidAt = this.formatDateTime(payment.paidAt ?? payment.createdAt);
      grouped.set(method, existing);
    }

    const rows = Array.from(grouped.values())
      .map((item) => ({
        method: item.method,
        methodLabel: item.methodLabel,
        revenue: Number(item.revenue.toFixed(2)),
        revenueText: this.formatMoney(item.revenue),
        paymentCount: item.paymentCount,
        orderCount: item.orderIds.size,
        latestPaidAt: item.latestPaidAt,
      }))
      .sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const totalPaymentCount = rows.reduce((sum, row) => sum + row.paymentCount, 0);
    const totalOrderCount = rows.reduce((sum, row) => sum + row.orderCount, 0);
    const evidence = this.evidence(
      ['PaymentRecord', 'ProductOrder', 'RefundRecord', 'Store'],
      '支付方式收款拆分 = PaymentRecord 按 method 聚合金额和笔数，按订单所属门店授权过滤。退款需要查看 RefundRecord 指标。',
      [`storeId=${context.storeId}`, this.rangeFilterText('paidAt/createdAt', range), 'groupBy=method'],
      rows.length,
      range,
      ['当前只统计已落库支付流水；组合支付会按实际 PaymentRecord 拆分支付方式。'],
    );

    if (!rows.length) {
      return {
        status: 'no_data',
        title: '支付方式收款拆分',
        summary: `${range.label}没有支付流水。`,
        data: {
          rows,
          items: rows,
          metrics: { totalRevenue: 0, totalRevenueText: this.formatMoney(0), totalPaymentCount: 0, totalOrderCount: 0 },
          timeRange: this.serializeRange(range),
        },
        evidence,
        actions: [{ label: '查看收银对账', action: 'finance:reconciliation', riskLevel: 'low' }],
      };
    }

    const topMethods = rows.slice(0, 3).map((row) => `${row.methodLabel} ${row.revenueText}`).join('，');
    return {
      status: 'success',
      title: '支付方式收款拆分',
      summary: `${range.label}收款 ${this.formatMoney(totalRevenue)}，共 ${totalPaymentCount} 笔支付；${topMethods}。`,
      data: {
        rows,
        items: rows,
        metrics: {
          totalRevenue: Number(totalRevenue.toFixed(2)),
          totalRevenueText: this.formatMoney(totalRevenue),
          totalPaymentCount,
          totalOrderCount,
          methodCount: rows.length,
        },
        timeRange: this.serializeRange(range),
      },
      evidence,
      actions: [{ label: '查看收银对账', action: 'finance:reconciliation', riskLevel: 'low' }],
    };
  }

  private async getRefundMetric(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'today');
    const refunds = await (this.prisma as any).refundRecord.findMany({
      where: {
        order: { storeId: context.storeId },
        ...this.refundTimeWhere(range),
      },
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            customerName: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ refundedAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    const rows = (refunds as any[]).map((refund) => ({
      refundId: refund.id,
      refundNo: refund.refundNo,
      orderNo: refund.order?.orderNo ?? '',
      customerName: refund.order?.customer?.name ?? refund.order?.customerName ?? '',
      amount: this.toNumber(refund.amount),
      amountText: this.formatMoney(this.toNumber(refund.amount)),
      statusLabel: this.refundStatusLabel(refund.status),
      refundedAt: this.formatDateTime(refund.refundedAt ?? refund.createdAt),
      reason: refund.reason ?? '',
    }));
    const refundAmount = rows.reduce((sum, row) => sum + row.amount, 0);
    const evidence = this.evidence(
      ['RefundRecord', 'ProductOrder', 'Customer', 'Store'],
      '退款指标 = RefundRecord 已发生退款流水，按订单所属门店授权过滤，聚合退款笔数和金额。不会执行退款操作。',
      [`storeId=${context.storeId}`, this.rangeFilterText('refundedAt/createdAt', range)],
      rows.length,
      range,
      ['只读退款记录；发起或处理退款属于写操作，需要人工确认。'],
    );

    if (!rows.length) {
      return {
        status: 'no_data',
        title: '退款笔数与金额',
        summary: `${range.label}没有退款记录。`,
        data: {
          rows,
          items: rows,
          metrics: { refundCount: 0, refundAmount: 0, refundAmountText: this.formatMoney(0) },
          timeRange: this.serializeRange(range),
        },
        evidence,
        actions: [{ label: '查看退款记录', action: 'finance:refund-records', riskLevel: 'low' }],
      };
    }

    return {
      status: 'success',
      title: '退款笔数与金额',
      summary: `${range.label}退款 ${rows.length} 笔，金额 ${this.formatMoney(refundAmount)}。`,
      data: {
        rows,
        items: rows,
        metrics: {
          refundCount: rows.length,
          refundAmount: Number(refundAmount.toFixed(2)),
          refundAmountText: this.formatMoney(refundAmount),
        },
        timeRange: this.serializeRange(range),
      },
      evidence,
      actions: [{ label: '查看退款记录', action: 'finance:refund-records', riskLevel: 'low' }],
    };
  }

  private async getStaffCommissionMetric(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'this_month');
    const question = String(args.question ?? '');
    const where: Record<string, unknown> = {
      storeId: context.storeId,
      createdAt: { gte: range.start, lt: range.end },
    };
    if (/我的/.test(question) && context.userId) where.staffUserId = context.userId;
    const records = await (this.prisma as any).commissionRecord.findMany({
      where,
      include: {
        staffUser: { select: { id: true, name: true, username: true, role: true } },
        beautician: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 3000,
    });

    const grouped = new Map<
      string,
      {
        staffKey: string;
        staffName: string;
        staffUserId: number | null;
        beauticianId: number | null;
        commissionAmount: number;
        sourceAmount: number;
        recordCount: number;
        latestCreatedAt: string;
      }
    >();
    for (const record of records as any[]) {
      const staffKey = record.staffUserId ? `user:${record.staffUserId}` : record.beauticianId ? `beautician:${record.beauticianId}` : 'unbound';
      const existing =
        grouped.get(staffKey) ??
        {
          staffKey,
          staffName: record.staffUser?.name ?? record.staffUser?.username ?? record.beautician?.name ?? '未绑定人员',
          staffUserId: record.staffUserId ?? null,
          beauticianId: record.beauticianId ?? null,
          commissionAmount: 0,
          sourceAmount: 0,
          recordCount: 0,
          latestCreatedAt: '',
        };
      existing.commissionAmount += this.toNumber(record.amount);
      existing.sourceAmount += this.toNumber(record.sourceAmount);
      existing.recordCount += 1;
      if (!existing.latestCreatedAt) existing.latestCreatedAt = this.formatDateTime(record.createdAt);
      grouped.set(staffKey, existing);
    }

    const rows = Array.from(grouped.values())
      .map((item) => ({
        ...item,
        commissionAmount: Number(item.commissionAmount.toFixed(2)),
        commissionAmountText: this.formatMoney(item.commissionAmount),
        sourceAmount: Number(item.sourceAmount.toFixed(2)),
        sourceAmountText: this.formatMoney(item.sourceAmount),
      }))
      .sort((a, b) => b.commissionAmount - a.commissionAmount);
    const totalCommissionAmount = rows.reduce((sum, row) => sum + row.commissionAmount, 0);
    const totalRecordCount = rows.reduce((sum, row) => sum + row.recordCount, 0);
    const topStaff = rows[0] ?? null;
    const evidence = this.evidence(
      ['CommissionRecord', 'User', 'Beautician', 'CommissionRule', 'ProductOrder', 'OrderItem'],
      '员工提成汇总 = CommissionRecord 按 staffUserId 聚合；历史 beauticianId 记录只作为兼容兜底，不作为新主体。',
      [`storeId=${context.storeId}`, this.rangeFilterText('createdAt', range), context.userId && /我的/.test(question) ? `staffUserId=${context.userId}` : 'groupBy=staffUserId'],
      rows.length,
      range,
      ['员工提成口径以系统用户为主体；若出现未绑定人员，说明历史流水需要补 staffUserId。'],
    );

    if (!rows.length) {
      return {
        status: 'no_data',
        title: '员工提成汇总',
        summary: `${range.label}没有员工提成记录。`,
        data: {
          rows,
          items: rows,
          metrics: { totalCommissionAmount: 0, totalCommissionAmountText: this.formatMoney(0), totalRecordCount: 0, staffCount: 0 },
          timeRange: this.serializeRange(range),
        },
        evidence,
        actions: [{ label: '查看员工提成', action: 'finance:commission-records', riskLevel: 'low' }],
      };
    }

    return {
      status: 'success',
      title: '员工提成汇总',
      summary: `${range.label}员工提成合计 ${this.formatMoney(totalCommissionAmount)}，共 ${totalRecordCount} 条；最高为 ${topStaff?.staffName ?? '-'} ${topStaff?.commissionAmountText ?? this.formatMoney(0)}。`,
      data: {
        rows,
        items: rows,
        metrics: {
          totalCommissionAmount: Number(totalCommissionAmount.toFixed(2)),
          totalCommissionAmountText: this.formatMoney(totalCommissionAmount),
          totalRecordCount,
          staffCount: rows.length,
          topStaffName: topStaff?.staffName ?? '',
          topStaffAmount: topStaff?.commissionAmount ?? 0,
          topStaffAmountText: topStaff?.commissionAmountText ?? this.formatMoney(0),
        },
        timeRange: this.serializeRange(range),
      },
      evidence,
      actions: [{ label: '查看员工提成', action: 'finance:commission-records', riskLevel: 'low' }],
    };
  }

  private async getStaffEfficiencyMetric(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'this_month');
    const prisma = this.prisma as any;
    const [beauticians, orderItems, commissionRecords, reservations, serviceTasks, cardUsageRecords] = await Promise.all([
      prisma.beautician?.findMany?.({
        where: { storeId: context.storeId, status: 'active' },
        select: { id: true, userId: true, name: true, status: true, level: { select: { name: true } } },
        take: 300,
      }) ?? [],
      prisma.orderItem?.findMany?.({
        where: {
          beauticianId: { not: null },
          order: {
            storeId: context.storeId,
            status: { in: ['paid', 'completed', 'success', 'finished', '已支付', '已完成'] },
            createdAt: { gte: range.start, lt: range.end },
          },
        },
        include: { order: { select: { id: true, customerId: true, createdAt: true, status: true } } },
        orderBy: { createdAt: 'desc' },
        take: 3000,
      }) ?? [],
      prisma.commissionRecord?.findMany?.({
        where: {
          storeId: context.storeId,
          createdAt: { gte: range.start, lt: range.end },
          status: { notIn: ['cancelled', 'canceled', 'void', '已取消'] },
        },
        select: { id: true, beauticianId: true, staffUserId: true, amount: true, status: true, type: true, createdAt: true },
        take: 3000,
      }) ?? [],
      prisma.reservation?.findMany?.({
        where: { storeId: context.storeId, beauticianId: { not: null }, date: { gte: range.start, lt: range.end }, status: { not: 'cancelled' } },
        select: { id: true, beauticianId: true, customerId: true, status: true, date: true },
        take: 3000,
      }) ?? [],
      prisma.serviceTask?.findMany?.({
        where: { storeId: context.storeId, beauticianId: { not: null }, appointmentTime: { gte: range.start, lt: range.end } },
        select: { id: true, beauticianId: true, status: true, completedAt: true },
        take: 3000,
      }) ?? [],
      prisma.cardUsageRecord?.findMany?.({
        where: {
          beauticianId: { not: null },
          verifiedAt: { gte: range.start, lt: range.end },
          OR: [{ storeId: context.storeId }, { customer: { storeId: context.storeId, deletedAt: null } }],
        },
        select: { id: true, beauticianId: true, customerId: true, times: true, verifiedAt: true },
        take: 3000,
      }) ?? [],
    ]);

    const buckets = new Map<
      number,
      {
        beauticianId: number;
        staffName: string;
        levelName: string;
        status: string;
        salesAmount: number;
        serviceCount: number;
        orderIds: Set<number>;
        customerIds: Set<number>;
        commissionAmount: number;
        reservationCount: number;
        completedReservationCount: number;
        completedTaskCount: number;
        cardUsageTimes: number;
      }
    >();
    const ensureBucket = (beauticianId: number) => {
      const existing = buckets.get(beauticianId);
      if (existing) return existing;
      const beautician = (beauticians as any[]).find((item) => Number(item.id) === beauticianId);
      const next = {
        beauticianId,
        staffName: beautician?.name ?? `员工${beauticianId}`,
        levelName: beautician?.level?.name ?? '未设置等级',
        status: beautician?.status ?? '',
        salesAmount: 0,
        serviceCount: 0,
        orderIds: new Set<number>(),
        customerIds: new Set<number>(),
        commissionAmount: 0,
        reservationCount: 0,
        completedReservationCount: 0,
        completedTaskCount: 0,
        cardUsageTimes: 0,
      };
      buckets.set(beauticianId, next);
      return next;
    };

    for (const beautician of beauticians as any[]) {
      const beauticianId = Number(beautician.id);
      if (Number.isFinite(beauticianId)) ensureBucket(beauticianId);
    }
    for (const item of orderItems as any[]) {
      const beauticianId = Number(item.beauticianId);
      if (!beauticianId) continue;
      const target = ensureBucket(beauticianId);
      target.salesAmount += this.toNumber(item.netAmount || item.subtotal);
      if (String(item.itemType || '') === 'project') target.serviceCount += this.toNumber(item.quantity);
      if (item.orderId) target.orderIds.add(Number(item.orderId));
      if (item.order?.customerId) target.customerIds.add(Number(item.order.customerId));
    }
    for (const record of commissionRecords as any[]) {
      const beauticianId = Number(record.beauticianId);
      if (!beauticianId) continue;
      ensureBucket(beauticianId).commissionAmount += this.toNumber(record.amount);
    }
    for (const reservation of reservations as any[]) {
      const beauticianId = Number(reservation.beauticianId);
      if (!beauticianId) continue;
      const target = ensureBucket(beauticianId);
      target.reservationCount += 1;
      if (reservation.customerId) target.customerIds.add(Number(reservation.customerId));
      if (/completed|checked_in|arrived|done|已完成|已到店/.test(String(reservation.status || ''))) {
        target.completedReservationCount += 1;
      }
    }
    for (const task of serviceTasks as any[]) {
      const beauticianId = Number(task.beauticianId);
      if (!beauticianId) continue;
      if (/completed|done|已完成/.test(String(task.status || '')) || task.completedAt) {
        ensureBucket(beauticianId).completedTaskCount += 1;
      }
    }
    for (const usage of cardUsageRecords as any[]) {
      const beauticianId = Number(usage.beauticianId);
      if (!beauticianId) continue;
      const target = ensureBucket(beauticianId);
      target.cardUsageTimes += this.toNumber(usage.times);
      if (usage.customerId) target.customerIds.add(Number(usage.customerId));
    }

    const rows = Array.from(buckets.values())
      .map((item) => {
        const completionRate = item.reservationCount ? item.completedReservationCount / item.reservationCount : 0;
        const performanceScore =
          item.serviceCount * 8 +
          item.completedTaskCount * 6 +
          item.cardUsageTimes * 5 +
          item.orderIds.size * 4 +
          item.customerIds.size * 3 +
          item.salesAmount / 1000 +
          item.commissionAmount / 100 +
          completionRate * 20;
        const performanceLevel = performanceScore >= 80 ? '表现突出' : performanceScore >= 40 ? '稳定发挥' : '需持续跟进';
        return {
          beauticianId: item.beauticianId,
          staffName: item.staffName,
          levelName: item.levelName,
          status: item.status,
          performanceScore: Math.round(performanceScore),
          performanceLevel,
          serviceCount: item.serviceCount,
          completedTaskCount: item.completedTaskCount,
          cardUsageTimes: item.cardUsageTimes,
          salesAmount: Number(item.salesAmount.toFixed(2)),
          salesAmountText: this.formatMoney(item.salesAmount),
          commissionAmount: Number(item.commissionAmount.toFixed(2)),
          commissionAmountText: this.formatMoney(item.commissionAmount),
          orderCount: item.orderIds.size,
          customerCount: item.customerIds.size,
          reservationCount: item.reservationCount,
          completedReservationCount: item.completedReservationCount,
          completionRate: Number((completionRate * 100).toFixed(1)),
          completionRateText: this.formatPercent(completionRate * 100),
          reason: `服务 ${item.serviceCount} 次，销售额 ${this.formatMoney(item.salesAmount)}，提成 ${this.formatMoney(item.commissionAmount)}，预约完成率 ${Math.round(completionRate * 100)}%。`,
        };
      })
      .filter((item) => item.performanceScore > 0)
      .sort((a, b) => b.performanceScore - a.performanceScore || b.salesAmount - a.salesAmount || b.serviceCount - a.serviceCount)
      .slice(0, 20);

    const totalSales = rows.reduce((sum, row) => sum + row.salesAmount, 0);
    const totalCommission = rows.reduce((sum, row) => sum + row.commissionAmount, 0);
    const totalService = rows.reduce((sum, row) => sum + row.serviceCount + row.cardUsageTimes, 0);
    const topStaff = rows[0] ?? null;
    const evidence = this.evidence(
      ['Beautician', 'OrderItem', 'ProductOrder', 'CommissionRecord', 'Reservation', 'ServiceTask', 'CardUsageRecord'],
      '员工人效分 = 服务次数、完成服务任务、次卡核销次数、订单数、服务客户数、销售额、提成和预约完成率的加权综合评分；仅用于门店内部经营排序。',
      [`storeId=${context.storeId}`, this.rangeFilterText('createdAt/date/verifiedAt', range), '只读统计，不修改排班或提成'],
      (beauticians as any[]).length +
        (orderItems as any[]).length +
        (commissionRecords as any[]).length +
        (reservations as any[]).length +
        (serviceTasks as any[]).length +
        (cardUsageRecords as any[]).length,
      range,
      ['员工人效依赖订单、预约、服务任务、核销和提成数据完整性；缺少任一来源会影响分值。'],
    );

    if (!rows.length) {
      return {
        status: 'no_data',
        title: '员工人效指标',
        summary: `${range.label}没有可用于员工人效分析的订单、提成、预约、服务任务或次卡核销数据。`,
        data: {
          rows,
          items: rows,
          metrics: {
            staffCount: 0,
            totalSales: 0,
            totalSalesText: this.formatMoney(0),
            totalCommission: 0,
            totalCommissionText: this.formatMoney(0),
            totalServiceCount: 0,
          },
          timeRange: this.serializeRange(range),
        },
        evidence,
        actions: [{ label: '查看员工人效', action: 'finance:staff-efficiency', riskLevel: 'low' }],
      };
    }

    return {
      status: 'success',
      title: '员工人效指标',
      summary: `${range.label}上榜员工 ${rows.length} 人；人效最高为 ${topStaff?.staffName ?? '-'}，人效分 ${topStaff?.performanceScore ?? 0}，销售额 ${topStaff?.salesAmountText ?? this.formatMoney(0)}。`,
      data: {
        rows,
        items: rows,
        metrics: {
          staffCount: rows.length,
          topStaffName: topStaff?.staffName ?? '',
          topPerformanceScore: topStaff?.performanceScore ?? 0,
          topPerformanceLevel: topStaff?.performanceLevel ?? '',
          totalSales: Number(totalSales.toFixed(2)),
          totalSalesText: this.formatMoney(totalSales),
          totalCommission: Number(totalCommission.toFixed(2)),
          totalCommissionText: this.formatMoney(totalCommission),
          totalServiceCount: totalService,
        },
        timeRange: this.serializeRange(range),
      },
      evidence,
      actions: [{ label: '查看员工人效', action: 'finance:staff-efficiency', riskLevel: 'low' }],
    };
  }

  private async getProductGrossProfitMetric(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'this_month');
    const question = String(args.question ?? '');
    const orders = await (this.prisma as any).productOrder.findMany({
      where: {
        storeId: context.storeId,
        createdAt: { gte: range.start, lt: range.end },
        orderItems: { some: { itemType: { in: ['product', 'goods', 'sku', 'retail'] } } },
      },
      include: { orderItems: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const productIds = Array.from(
      new Set(
        (orders as any[])
          .flatMap((order) => order.orderItems ?? [])
          .filter((item) => this.isProductOrderItem(item))
          .map((item) => this.orderItemObjectId(item))
          .filter((id): id is number => Number.isFinite(id)),
      ),
    );
    const products = productIds.length
      ? await (this.prisma as any).product.findMany({
          where: { storeId: context.storeId, id: { in: productIds } },
          select: { id: true, sku: true, name: true, costPrice: true, retailPrice: true, category: { select: { name: true } } },
        })
      : [];
    const productMap = new Map<number, any>((products as any[]).map((product) => [Number(product.id), product]));
    const grouped = new Map<
      string,
      { productKey: string; productId: number | null; productName: string; sku: string; quantity: number; revenue: number; cost: number; orderCount: number; missingCostCount: number }
    >();

    for (const order of orders as any[]) {
      for (const item of (order.orderItems ?? []) as any[]) {
        if (!this.isProductOrderItem(item)) continue;
        const productId = this.orderItemObjectId(item);
        const product = productId ? productMap.get(productId) : null;
        const productKey = productId ? `product:${productId}` : `name:${item.name ?? 'unknown'}`;
        const quantity = this.orderItemQuantity(item);
        const unitCost = this.toNumber(product?.costPrice ?? item.payload?.costPrice);
        const existing =
          grouped.get(productKey) ??
          {
            productKey,
            productId: productId ?? null,
            productName: product?.name ?? item.name ?? '未命名商品',
            sku: product?.sku ?? '',
            quantity: 0,
            revenue: 0,
            cost: 0,
            orderCount: 0,
            missingCostCount: 0,
          };
        existing.quantity += quantity;
        existing.revenue += this.orderItemRevenue(item);
        existing.cost += unitCost * quantity;
        existing.orderCount += 1;
        if (unitCost <= 0) existing.missingCostCount += 1;
        grouped.set(productKey, existing);
      }
    }

    const rows = Array.from(grouped.values()).map((item) => {
      const grossProfit = item.revenue - item.cost;
      const grossMargin = item.revenue > 0 ? (grossProfit / item.revenue) * 100 : 0;
      return {
        ...item,
        quantity: Number(item.quantity.toFixed(2)),
        revenue: Number(item.revenue.toFixed(2)),
        revenueText: this.formatMoney(item.revenue),
        cost: Number(item.cost.toFixed(2)),
        costText: this.formatMoney(item.cost),
        grossProfit: Number(grossProfit.toFixed(2)),
        grossProfitText: this.formatMoney(grossProfit),
        grossMargin: Number(grossMargin.toFixed(1)),
        grossMarginText: this.formatPercent(grossMargin),
      };
    });
    const sortByMargin = /毛利率.*高|毛利率最高|最高/.test(question);
    rows.sort((a, b) => (sortByMargin ? b.grossMargin - a.grossMargin : b.grossProfit - a.grossProfit));
    const metrics = this.sumGrossProfitRows(rows);
    const missingCostCount = rows.reduce((sum, row) => sum + row.missingCostCount, 0);
    const evidence = this.evidence(
      ['ProductOrder', 'OrderItem', 'Product', 'PaymentRecord', 'RefundRecord'],
      '商品毛利 = 商品订单明细净收入 - 商品成本价 × 销量；收入使用 OrderItem.netAmount，缺失时按明细成交额兜底。',
      [`storeId=${context.storeId}`, this.rangeFilterText('ProductOrder.createdAt', range), 'OrderItem.itemType=product/goods/sku/retail'],
      rows.length,
      range,
      missingCostCount ? [`${missingCostCount} 条商品明细缺少成本价，相关商品毛利会偏高。`] : ['只读订单与商品成本，不执行写入。'],
    );

    if (!rows.length) {
      return {
        status: 'no_data',
        title: '商品毛利指标',
        summary: `${range.label}没有可计算的商品销售明细。`,
        data: { rows, items: rows, metrics, timeRange: this.serializeRange(range) },
        evidence,
        actions: [{ label: '查看商品毛利', action: 'finance:product-profit', riskLevel: 'low' }],
      };
    }
    return {
      status: 'success',
      title: '商品毛利指标',
      summary: `${range.label}商品收入 ${metrics.revenueText}，毛利 ${metrics.grossProfitText}，整体毛利率 ${metrics.grossMarginText}。`,
      data: { rows, items: rows, metrics, timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看商品毛利', action: 'finance:product-profit', riskLevel: 'low' }],
    };
  }

  private async getProjectGrossProfitMetric(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'this_month');
    const question = String(args.question ?? '');
    const orders = await (this.prisma as any).productOrder.findMany({
      where: {
        storeId: context.storeId,
        createdAt: { gte: range.start, lt: range.end },
        orderItems: { some: { itemType: { in: ['project', 'service'] } } },
      },
      include: { orderItems: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const projectItems = (orders as any[]).flatMap((order) => (order.orderItems ?? []).filter((item: any) => this.isProjectOrderItem(item)));
    const projectIds = Array.from(new Set(projectItems.map((item) => this.orderItemObjectId(item)).filter((id): id is number => Number.isFinite(id))));
    const orderItemIds = projectItems.map((item) => Number(item.id)).filter((id) => Number.isFinite(id));
    const projects = projectIds.length
      ? await (this.prisma as any).project.findMany({
          where: { storeId: context.storeId, id: { in: projectIds } },
          include: { bomItems: { include: { product: { select: { id: true, name: true, costPrice: true } } } } },
        })
      : [];
    const commissionFindMany = (this.prisma as any).commissionRecord?.findMany?.bind((this.prisma as any).commissionRecord);
    const commissionRecords =
      commissionFindMany && orderItemIds.length
        ? await commissionFindMany({
            where: { storeId: context.storeId, orderItemId: { in: orderItemIds } },
            select: { orderItemId: true, amount: true },
          })
        : [];
    const commissionByItem = new Map<number, number>();
    for (const record of commissionRecords as any[]) {
      const key = Number(record.orderItemId);
      commissionByItem.set(key, (commissionByItem.get(key) ?? 0) + this.toNumber(record.amount));
    }
    const projectMap = new Map<number, any>((projects as any[]).map((project) => [Number(project.id), project]));
    const grouped = new Map<
      string,
      {
        projectKey: string;
        projectId: number | null;
        projectName: string;
        serviceCount: number;
        revenue: number;
        materialCost: number;
        commissionCost: number;
        orderCount: number;
        missingBomCount: number;
        missingCommissionCount: number;
      }
    >();

    for (const item of projectItems as any[]) {
      const projectId = this.orderItemObjectId(item);
      const project = projectId ? projectMap.get(projectId) : null;
      const projectKey = projectId ? `project:${projectId}` : `name:${item.name ?? 'unknown'}`;
      const quantity = this.orderItemQuantity(item);
      const bomUnitCost = this.projectBomUnitCost(project);
      const itemCommission = commissionByItem.get(Number(item.id)) ?? 0;
      const existing =
        grouped.get(projectKey) ??
        {
          projectKey,
          projectId: projectId ?? null,
          projectName: project?.name ?? item.name ?? '未命名项目',
          serviceCount: 0,
          revenue: 0,
          materialCost: 0,
          commissionCost: 0,
          orderCount: 0,
          missingBomCount: 0,
          missingCommissionCount: 0,
        };
      existing.serviceCount += quantity;
      existing.revenue += this.orderItemRevenue(item);
      existing.materialCost += bomUnitCost * quantity;
      existing.commissionCost += itemCommission;
      existing.orderCount += 1;
      if (bomUnitCost <= 0) existing.missingBomCount += 1;
      if (itemCommission <= 0) existing.missingCommissionCount += 1;
      grouped.set(projectKey, existing);
    }

    const rows = Array.from(grouped.values()).map((item) => {
      const totalCost = item.materialCost + item.commissionCost;
      const grossProfit = item.revenue - totalCost;
      const grossMargin = item.revenue > 0 ? (grossProfit / item.revenue) * 100 : 0;
      return {
        ...item,
        serviceCount: Number(item.serviceCount.toFixed(2)),
        revenue: Number(item.revenue.toFixed(2)),
        revenueText: this.formatMoney(item.revenue),
        avgPriceText: this.formatMoney(item.serviceCount ? item.revenue / item.serviceCount : 0),
        materialCost: Number(item.materialCost.toFixed(2)),
        materialCostText: this.formatMoney(item.materialCost),
        commissionCost: Number(item.commissionCost.toFixed(2)),
        commissionCostText: this.formatMoney(item.commissionCost),
        grossProfit: Number(grossProfit.toFixed(2)),
        grossProfitText: this.formatMoney(grossProfit),
        grossMargin: Number(grossMargin.toFixed(1)),
        grossMarginText: this.formatPercent(grossMargin),
      };
    });
    const sortLow = /异常低|偏低|最低|成本.*高|上涨/.test(question);
    rows.sort((a, b) => (sortLow ? a.grossMargin - b.grossMargin : b.grossProfit - a.grossProfit));
    const metrics = this.sumGrossProfitRows(rows);
    const missingBomCount = rows.reduce((sum, row) => sum + row.missingBomCount, 0);
    const missingCommissionCount = rows.reduce((sum, row) => sum + row.missingCommissionCount, 0);
    const limitations = [
      missingBomCount ? `${missingBomCount} 条项目明细缺少 BOM 成本，项目毛利会偏高。` : '项目耗材成本来自项目 BOM 标准用量。',
      missingCommissionCount ? `${missingCommissionCount} 条项目明细没有提成流水，提成成本可能未完全生成。` : '提成成本来自已生成 CommissionRecord。',
    ];
    const evidence = this.evidence(
      ['ProductOrder', 'OrderItem', 'Project', 'ProjectBomItem', 'Product', 'CommissionRecord'],
      '项目毛利 = 项目订单明细净收入 - 项目 BOM 标准耗材成本 - 已生成提成成本。',
      [`storeId=${context.storeId}`, this.rangeFilterText('ProductOrder.createdAt', range), 'OrderItem.itemType=project/service'],
      rows.length,
      range,
      limitations,
    );

    if (!rows.length) {
      return {
        status: 'no_data',
        title: '项目毛利指标',
        summary: `${range.label}没有可计算的项目订单明细。`,
        data: { rows, items: rows, metrics, timeRange: this.serializeRange(range) },
        evidence,
        actions: [{ label: '查看项目毛利', action: 'finance:project-profit', riskLevel: 'low' }],
      };
    }
    return {
      status: 'success',
      title: '项目毛利指标',
      summary: `${range.label}项目收入 ${metrics.revenueText}，毛利 ${metrics.grossProfitText}，整体毛利率 ${metrics.grossMarginText}。`,
      data: { rows, items: rows, metrics, timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看项目毛利', action: 'finance:project-profit', riskLevel: 'low' }],
    };
  }

  private async getOverallGrossMarginMetric(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'this_month');
    const settlements = await (this.prisma as any).dailySettlement.findMany({
      where: { storeId: context.storeId, settleDate: { gte: range.start, lt: range.end } },
      orderBy: { settleDate: 'desc' },
      take: 60,
    });
    const rows = (settlements as any[]).map((settlement) => {
      const revenue = this.toNumber(settlement.totalRevenue) - this.toNumber(settlement.refundAmount);
      const materialCost = this.toNumber(settlement.materialCost);
      const commissionCost = this.toNumber(settlement.commissionTotal);
      const grossProfitValue = this.toNumber(settlement.grossProfit);
      const grossProfit = grossProfitValue || revenue - materialCost - commissionCost;
      const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : this.toNumber(settlement.grossMargin);
      return {
        settlementId: settlement.id,
        periodLabel: this.formatDate(settlement.settleDate),
        revenue,
        revenueText: this.formatMoney(revenue),
        materialCost,
        materialCostText: this.formatMoney(materialCost),
        commissionCost,
        commissionCostText: this.formatMoney(commissionCost),
        grossProfit,
        grossProfitText: this.formatMoney(grossProfit),
        grossMargin,
        grossMarginText: this.formatPercent(grossMargin),
      };
    });
    const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const materialCost = rows.reduce((sum, row) => sum + row.materialCost, 0);
    const commissionCost = rows.reduce((sum, row) => sum + row.commissionCost, 0);
    const grossProfit = rows.reduce((sum, row) => sum + row.grossProfit, 0);
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const metrics = {
      revenue: Number(revenue.toFixed(2)),
      revenueText: this.formatMoney(revenue),
      materialCost: Number(materialCost.toFixed(2)),
      materialCostText: this.formatMoney(materialCost),
      commissionCost: Number(commissionCost.toFixed(2)),
      commissionCostText: this.formatMoney(commissionCost),
      grossProfit: Number(grossProfit.toFixed(2)),
      grossProfitText: this.formatMoney(grossProfit),
      grossMargin: Number(grossMargin.toFixed(1)),
      grossMarginText: this.formatPercent(grossMargin),
      settlementCount: rows.length,
    };
    const evidence = this.evidence(
      ['DailySettlement', 'ProductOrder', 'CommissionRecord', 'StockMovement'],
      '整体毛利率 = DailySettlement 净收入、耗材成本、提成成本和毛利汇总后计算。',
      [`storeId=${context.storeId}`, this.rangeFilterText('settleDate', range)],
      rows.length,
      range,
      ['整体毛利率依赖已生成 DailySettlement；若日结缺失，需先修复日结生成和订单入账链路。'],
    );
    if (!rows.length) {
      return {
        status: 'no_data',
        title: '整体毛利率指标',
        summary: `${range.label}没有已生成的日结毛利数据。`,
        data: { rows, items: rows, metrics, timeRange: this.serializeRange(range) },
        evidence,
        actions: [{ label: '查看利润看板', action: 'finance:profit-dashboard', riskLevel: 'low' }],
      };
    }
    return {
      status: 'success',
      title: '整体毛利率指标',
      summary: `${range.label}收入 ${metrics.revenueText}，毛利 ${metrics.grossProfitText}，毛利率 ${metrics.grossMarginText}。`,
      data: { rows, items: rows, metrics, timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看利润看板', action: 'finance:profit-dashboard', riskLevel: 'low' }],
    };
  }

  private async getCardPackageSalesMetric(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'this_month');
    const records = await (this.prisma as any).customerCard.findMany({
      where: {
        customer: { storeId: context.storeId },
        createdAt: { gte: range.start, lt: range.end },
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        card: { select: { id: true, name: true } },
        sourceOrder: { select: { id: true, orderNo: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 3000,
    });
    const rows = (records as any[]).map((record) => ({
      customerCardId: record.id,
      cardName: record.card?.name ?? record.cardName ?? '未命名次卡',
      customerName: record.customer?.name ?? '',
      orderNo: record.sourceOrder?.orderNo ?? '',
      paidAmount: this.toNumber(record.paidAmount),
      paidAmountText: this.formatMoney(this.toNumber(record.paidAmount)),
      discountAmount: this.toNumber(record.discountAmount),
      giftTimes: this.toNumber(record.giftTimes),
      totalTimes: this.toNumber(record.totalTimes),
      remainingTimes: this.toNumber(record.remainingTimes),
      createdAt: this.formatDateTime(record.createdAt),
    }));
    const totalPaidAmount = rows.reduce((sum, row) => sum + row.paidAmount, 0);
    const totalGiftTimes = rows.reduce((sum, row) => sum + row.giftTimes, 0);
    const totalTimes = rows.reduce((sum, row) => sum + row.totalTimes, 0);
    const metrics = {
      totalPaidAmount: Number(totalPaidAmount.toFixed(2)),
      totalPaidAmountText: this.formatMoney(totalPaidAmount),
      cardCount: rows.length,
      totalTimes,
      totalGiftTimes,
      avgPaidAmountText: this.formatMoney(rows.length ? totalPaidAmount / rows.length : 0),
    };
    const evidence = this.evidence(
      ['CustomerCard', 'Card', 'Customer', 'ProductOrder', 'OrderItem'],
      '次卡销售金额 = CustomerCard 开卡记录 paidAmount 汇总；来源订单用于追溯，不按核销收入重复计算。',
      [`storeId=${context.storeId}`, this.rangeFilterText('CustomerCard.createdAt', range)],
      rows.length,
      range,
      ['次卡销售与次卡核销是两个口径：销售看开卡实收，核销看服务消耗与收入确认。'],
    );
    if (!rows.length) {
      return {
        status: 'no_data',
        title: '次卡销售金额',
        summary: `${range.label}没有次卡开卡销售记录。`,
        data: { rows, items: rows, metrics, timeRange: this.serializeRange(range) },
        evidence,
        actions: [{ label: '查看次卡开卡管理', action: 'order:card-package-orders', riskLevel: 'low' }],
      };
    }
    return {
      status: 'success',
      title: '次卡销售金额',
      summary: `${range.label}次卡销售 ${metrics.totalPaidAmountText}，共 ${metrics.cardCount} 张，赠送 ${metrics.totalGiftTimes} 次。`,
      data: { rows, items: rows, metrics, timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看次卡开卡管理', action: 'order:card-package-orders', riskLevel: 'low' }],
    };
  }

  private async getPaymentChannelFeeMetric(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'today');
    const payments = await (this.prisma as any).paymentRecord.findMany({
      where: {
        order: { storeId: context.storeId },
        ...this.paymentTimeWhere(range),
      },
      include: {
        order: { select: { id: true, orderNo: true, customerName: true } },
      },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      take: 3000,
    });
    const grouped = new Map<string, { method: string; methodLabel: string; amount: number; estimatedFee: number; feeRate: number; paymentCount: number; orderIds: Set<number> }>();
    for (const payment of payments as any[]) {
      const method = String(payment.method ?? 'unknown').toLowerCase();
      const amount = this.toNumber(payment.amount);
      const feeRate = this.paymentFeeRate(method);
      const existing =
        grouped.get(method) ??
        {
          method,
          methodLabel: this.payMethodLabel(method),
          amount: 0,
          estimatedFee: 0,
          feeRate,
          paymentCount: 0,
          orderIds: new Set<number>(),
        };
      existing.amount += amount;
      existing.estimatedFee += amount * feeRate;
      existing.paymentCount += 1;
      if (payment.orderId) existing.orderIds.add(Number(payment.orderId));
      grouped.set(method, existing);
    }
    const rows = Array.from(grouped.values())
      .map((item) => ({
        method: item.method,
        methodLabel: item.methodLabel,
        amount: Number(item.amount.toFixed(2)),
        amountText: this.formatMoney(item.amount),
        feeRate: item.feeRate,
        feeRateText: this.formatPercent(item.feeRate * 100),
        estimatedFee: Number(item.estimatedFee.toFixed(2)),
        estimatedFeeText: this.formatMoney(item.estimatedFee),
        paymentCount: item.paymentCount,
        orderCount: item.orderIds.size,
      }))
      .sort((a, b) => b.estimatedFee - a.estimatedFee);
    const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
    const totalEstimatedFee = rows.reduce((sum, row) => sum + row.estimatedFee, 0);
    const metrics = {
      totalAmount: Number(totalAmount.toFixed(2)),
      totalAmountText: this.formatMoney(totalAmount),
      totalEstimatedFee: Number(totalEstimatedFee.toFixed(2)),
      totalEstimatedFeeText: this.formatMoney(totalEstimatedFee),
      methodCount: rows.length,
      paymentCount: rows.reduce((sum, row) => sum + row.paymentCount, 0),
    };
    const evidence = this.evidence(
      ['PaymentRecord', 'ProductOrder', 'Store'],
      '支付渠道手续费 = PaymentRecord 按支付渠道汇总后乘默认费率；当前不是支付通道真实对账单手续费。',
      [`storeId=${context.storeId}`, this.rangeFilterText('paidAt/createdAt', range), 'feeRate=wechat/alipay 0.6%, bank/card 0.3%, cash/member_card 0%'],
      rows.length,
      range,
      ['PaymentRecord 当前没有真实手续费字段，本能力返回预估手续费；接入支付通道对账单后应替换为真实手续费。'],
    );
    if (!rows.length) {
      return {
        status: 'no_data',
        title: '支付渠道手续费预估',
        summary: `${range.label}没有可估算手续费的支付流水。`,
        data: { rows, items: rows, metrics, timeRange: this.serializeRange(range) },
        evidence,
        actions: [{ label: '查看收银对账', action: 'finance:reconciliation', riskLevel: 'low' }],
      };
    }
    return {
      status: 'success',
      title: '支付渠道手续费预估',
      summary: `${range.label}收款 ${metrics.totalAmountText}，预估手续费 ${metrics.totalEstimatedFeeText}。`,
      data: { rows, items: rows, metrics, timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看收银对账', action: 'finance:reconciliation', riskLevel: 'low' }],
    };
  }

  private async getCouponRedemptionMetric(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'this_month');
    const promotions = await (this.prisma as any).promotion.findMany({
      where: {
        OR: [{ storeId: context.storeId }, { storeId: null }],
        status: { in: ['active', 'published', 'enabled'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    });
    const orders = await (this.prisma as any).productOrder.findMany({
      where: {
        storeId: context.storeId,
        createdAt: { gte: range.start, lt: range.end },
        OR: [{ couponId: { not: null } }, { promotionId: { not: null } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
    const promotionMap = new Map((promotions as any[]).map((promotion) => [Number(promotion.id), promotion]));
    const rows = (promotions as any[])
      .map((promotion) => {
        const issuedCount = this.toNumber(promotion.issuedCount);
        const usedCount = this.toNumber(promotion.usedCount);
        const unusedCount = Math.max(0, issuedCount - usedCount);
        const relatedOrders = (orders as any[]).filter((order) => Number(order.promotionId) === Number(promotion.id) || Number(order.couponId) === Number(promotion.id));
        const cycleDays =
          relatedOrders.length && promotion.createdAt
            ? relatedOrders.reduce((sum, order) => sum + Math.max(0, (new Date(order.createdAt).getTime() - new Date(promotion.createdAt).getTime()) / DAY_MS), 0) / relatedOrders.length
            : 0;
        const redemptionRate = issuedCount > 0 ? (usedCount / issuedCount) * 100 : 0;
        return {
          promotionId: promotion.id,
          promotionName: promotion.name,
          type: promotion.type,
          discountText: promotion.discountText,
          issuedCount,
          usedCount,
          unusedCount,
          periodUsedCount: relatedOrders.length,
          redemptionRate,
          redemptionRateText: this.formatPercent(redemptionRate),
          averageCycleDays: Number(cycleDays.toFixed(1)),
          averageCycleDaysText: relatedOrders.length ? `${Number(cycleDays.toFixed(1))} 天` : '本期无核销订单',
          status: promotion.status,
        };
      })
      .sort((a, b) => b.periodUsedCount - a.periodUsedCount || b.usedCount - a.usedCount)
      .slice(0, 20);
    const issuedTotal = rows.reduce((sum, row) => sum + row.issuedCount, 0);
    const usedTotal = rows.reduce((sum, row) => sum + row.usedCount, 0);
    const unusedTotal = rows.reduce((sum, row) => sum + row.unusedCount, 0);
    const periodUsedCount = (orders as any[]).length;
    const avgCycleRows = rows.filter((row) => row.averageCycleDays > 0);
    const averageCycleDays = avgCycleRows.length ? avgCycleRows.reduce((sum, row) => sum + row.averageCycleDays, 0) / avgCycleRows.length : 0;
    const evidence = this.evidence(
      ['Promotion', 'ProductOrder'],
      '优惠券核销指标 = ProductOrder 中 couponId/promotionId 的本期使用订单 + Promotion 累计发放/核销计数。',
      [`storeId=${context.storeId}`, this.rangeFilterText('createdAt', range), 'order.couponId/promotionId is not null'],
      rows.length,
      range,
      ['当前统计只读权益资产和订单使用关系；发券、强制核销和客户券领取流水不在本能力执行范围内。'],
    );
    if (!rows.length && !periodUsedCount) {
      return {
        status: 'no_data',
        title: '优惠券核销指标',
        summary: `${range.label}没有优惠券核销订单，也没有可统计的权益资产。`,
        data: { rows, items: rows, metrics: { issuedTotal: 0, usedTotal: 0, unusedTotal: 0, periodUsedCount: 0 }, timeRange: this.serializeRange(range) },
        evidence,
        actions: [{ label: '查看权益资产库', action: 'marketing:promotions', riskLevel: 'low' }],
      };
    }
    return {
      status: 'success',
      title: '优惠券核销指标',
      summary: `${range.label}订单侧核销 ${periodUsedCount} 次；权益资产累计已发 ${issuedTotal} 张、已核销 ${usedTotal} 张，平均核销周期 ${averageCycleDays ? `${Number(averageCycleDays.toFixed(1))} 天` : '本期无可计算样本'}。`,
      data: {
        rows,
        items: rows,
        metrics: {
          issuedTotal,
          usedTotal,
          unusedTotal,
          periodUsedCount,
          averageCycleDays: Number(averageCycleDays.toFixed(1)),
          averageCycleDaysText: averageCycleDays ? `${Number(averageCycleDays.toFixed(1))} 天` : '本期无可计算样本',
        },
        timeRange: this.serializeRange(range),
      },
      evidence,
      actions: [{ label: '查看权益资产库', action: 'marketing:promotions', riskLevel: 'low' }],
    };
  }

  private async getDiscountPermissionRiskMetric(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'this_month');
    const orders = await (this.prisma as any).productOrder.findMany({
      where: {
        storeId: context.storeId,
        createdAt: { gte: range.start, lt: range.end },
        OR: [
          { totalDiscountAmount: { gt: 0 } },
          { orderDiscountAmount: { gt: 0 } },
          { itemDiscountAmount: { gt: 0 } },
        ],
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        orderItems: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    const rows = (orders as any[]).map((order) => {
      const discountAmount = this.toNumber(order.totalDiscountAmount || order.orderDiscountAmount || order.itemDiscountAmount);
      const itemManualDiscount = (order.orderItems ?? []).some((item: any) => ['manual', 'override', 'staff'].includes(String(item.discountSource ?? '').toLowerCase()));
      const source = String(order.discountSource ?? 'none').toLowerCase();
      const risky = itemManualDiscount || ['manual', 'override', 'staff'].includes(source) || (discountAmount > 0 && !order.promotionId && !order.couponId);
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        customerName: order.customer?.name ?? order.customerName ?? '',
        discountAmount,
        discountAmountText: this.formatMoney(discountAmount),
        discountSource: source,
        discountSourceLabel: this.discountSourceLabel(source),
        promotionId: order.promotionId ?? '',
        couponId: order.couponId ?? '',
        riskLabel: risky ? '需复核' : '规则优惠',
        reason: risky ? '存在手工/额外折扣或未关联权益资产' : '折扣已关联权益或规则来源',
        createdAt: this.formatDateTime(order.createdAt),
      };
    });
    const riskRows = rows.filter((row) => row.riskLabel === '需复核');
    const riskAmount = riskRows.reduce((sum, row) => sum + row.discountAmount, 0);
    const evidence = this.evidence(
      ['ProductOrder', 'OrderItem', 'User'],
      '折扣越权风险 = ProductOrder/OrderItem 中折扣金额、折扣来源和权益关联关系的只读风险识别。',
      [`storeId=${context.storeId}`, this.rangeFilterText('createdAt', range), 'discountAmount>0'],
      rows.length,
      range,
      ['当前只能识别疑似额外折扣；最终是否越权需要结合审批、角色折扣上限或授权日志。'],
    );
    return {
      status: rows.length ? 'success' : 'no_data',
      title: '折扣越权风险',
      summary: rows.length
        ? `${range.label}找到 ${rows.length} 笔折扣订单，其中 ${riskRows.length} 笔需复核，涉及折扣 ${this.formatMoney(riskAmount)}。`
        : `${range.label}没有折扣订单风险样本。`,
      data: {
        rows,
        items: rows,
        metrics: {
          discountOrderCount: rows.length,
          riskOrderCount: riskRows.length,
          riskAmount: Number(riskAmount.toFixed(2)),
          riskAmountText: this.formatMoney(riskAmount),
        },
        timeRange: this.serializeRange(range),
      },
      evidence,
      actions: [{ label: '查看收银对账', action: 'finance:reconciliation', riskLevel: 'low' }],
    };
  }

  private async getCommissionCostOptimizationAdvice(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'this_month');
    const [commissionRecords, orders] = await Promise.all([
      (this.prisma as any).commissionRecord.findMany({
        where: { storeId: context.storeId, createdAt: { gte: range.start, lt: range.end } },
        include: { staffUser: { select: { id: true, name: true, username: true, role: true } }, rule: { select: { id: true, name: true, type: true } } },
        orderBy: { createdAt: 'desc' },
        take: 3000,
      }),
      (this.prisma as any).productOrder.findMany({
        where: { storeId: context.storeId, createdAt: { gte: range.start, lt: range.end } },
        select: { id: true, netAmount: true, totalAmount: true },
        take: 5000,
      }),
    ]);
    const totalCommission = (commissionRecords as any[]).reduce((sum, record) => sum + this.toNumber(record.amount), 0);
    const totalRevenue = (orders as any[]).reduce((sum, order) => sum + this.toNumber(order.netAmount || order.totalAmount), 0);
    const commissionRate = totalRevenue > 0 ? (totalCommission / totalRevenue) * 100 : 0;
    const grouped = new Map<string, { staffName: string; amount: number; recordCount: number }>();
    for (const record of commissionRecords as any[]) {
      const key = String(record.staffUserId ?? record.beauticianId ?? 'unknown');
      const current = grouped.get(key) ?? { staffName: record.staffUser?.name ?? record.staffUser?.username ?? '未绑定人员', amount: 0, recordCount: 0 };
      current.amount += this.toNumber(record.amount);
      current.recordCount += 1;
      grouped.set(key, current);
    }
    const rows = Array.from(grouped.values())
      .map((row) => ({ ...row, amount: Number(row.amount.toFixed(2)), amountText: this.formatMoney(row.amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
    const advice = [
      '把通用提成放在财务提成规则统一维护，项目侧只保留“是否参与提成”和人员绑定，降低重复配置。',
      '高毛利项目可设置阶梯激励，低毛利或耗材成本高的项目设置提成上限，避免收入增长但毛利被吃掉。',
      '提成流水主体使用系统用户 staffUserId，员工人效、提成和权限保持同一人员口径。',
    ];
    const evidence = this.evidence(
      ['CommissionRecord', 'ProductOrder', 'CommissionRule', 'User'],
      '提成成本优化 = 本期 CommissionRecord 提成成本 / ProductOrder 实收收入，并结合规则归口给出配置建议。',
      [`storeId=${context.storeId}`, this.rangeFilterText('createdAt', range)],
      (commissionRecords as any[]).length,
      range,
      ['本能力只输出建议，不自动修改提成规则或项目配置。'],
    );
    return {
      status: (commissionRecords as any[]).length || (orders as any[]).length ? 'success' : 'no_data',
      title: '提成成本优化建议',
      summary: `${range.label}提成成本 ${this.formatMoney(totalCommission)}，收入 ${this.formatMoney(totalRevenue)}，提成占比 ${this.formatPercent(commissionRate)}；建议统一规则入口、保留项目侧轻配置。`,
      data: {
        rows,
        items: rows,
        metrics: {
          totalCommission,
          totalCommissionText: this.formatMoney(totalCommission),
          totalRevenue,
          totalRevenueText: this.formatMoney(totalRevenue),
          commissionRate: Number(commissionRate.toFixed(1)),
          commissionRateText: this.formatPercent(commissionRate),
        },
        advice,
        timeRange: this.serializeRange(range),
      },
      evidence,
      actions: [{ label: '查看提成规则', action: 'finance:commission-rules', riskLevel: 'low' }],
    };
  }

  private async getCardPackageFreeVsPaidBehaviorMetric(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'this_month');
    const cards = await (this.prisma as any).customerCard.findMany({
      where: { customer: { storeId: context.storeId } },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        usageRecords: { select: { id: true, verifiedAt: true, recognizedAmount: true } },
      },
      take: 5000,
    });
    const customerIds = [...new Set(((cards ?? []) as any[]).map((card) => Number(card.customerId)).filter((id) => Number.isFinite(id)))];
    const orders = customerIds.length
      ? await (this.prisma as any).productOrder.findMany({
          where: { storeId: context.storeId, customerId: { in: customerIds }, createdAt: { gte: range.start, lt: range.end } },
          select: { customerId: true, netAmount: true, totalAmount: true },
          take: 5000,
        })
      : [];
    const revenueByCustomer = new Map<number, number>();
    for (const order of (orders ?? []) as any[]) {
      const key = Number(order.customerId);
      revenueByCustomer.set(key, (revenueByCustomer.get(key) ?? 0) + this.toNumber(order.netAmount || order.totalAmount));
    }
    const segments = new Map<string, { segmentLabel: string; customerIds: Set<number>; usageCount: number; recognizedAmount: number; revenue: number }>();
    for (const card of (cards ?? []) as any[]) {
      const paidAmount = this.toNumber(card.paidAmount);
      const discountAmount = this.toNumber(card.discountAmount);
      const segmentKey = paidAmount <= 0 || discountAmount >= paidAmount ? 'free' : 'paid';
      const current =
        segments.get(segmentKey) ??
        {
          segmentLabel: segmentKey === 'free' ? '免费/赠送次卡客户' : '付费次卡客户',
          customerIds: new Set<number>(),
          usageCount: 0,
          recognizedAmount: 0,
          revenue: 0,
        };
      const customerId = Number(card.customerId);
      if (Number.isFinite(customerId)) current.customerIds.add(customerId);
      current.usageCount += Array.isArray(card.usageRecords) ? card.usageRecords.length : 0;
      current.recognizedAmount += (card.usageRecords ?? []).reduce((sum: number, usage: any) => sum + this.toNumber(usage.recognizedAmount), 0);
      segments.set(segmentKey, current);
    }
    const rows = Array.from(segments.values()).map((segment) => {
      const revenue = Array.from(segment.customerIds).reduce((sum, customerId) => sum + (revenueByCustomer.get(customerId) ?? 0), 0);
      const customerCount = segment.customerIds.size;
      return {
        segmentLabel: segment.segmentLabel,
        customerCount,
        usageCount: segment.usageCount,
        recognizedAmount: Number(segment.recognizedAmount.toFixed(2)),
        recognizedAmountText: this.formatMoney(segment.recognizedAmount),
        revenue: Number(revenue.toFixed(2)),
        revenueText: this.formatMoney(revenue),
        avgRevenue: customerCount ? Number((revenue / customerCount).toFixed(2)) : 0,
        avgRevenueText: this.formatMoney(customerCount ? revenue / customerCount : 0),
      };
    });
    const evidence = this.evidence(
      ['CustomerCard', 'CardUsageRecord', 'ProductOrder', 'Customer'],
      '免费/付费次卡消费差异 = CustomerCard 支付金额分群 + 本期 ProductOrder 消费 + CardUsageRecord 核销行为。',
      [`storeId=${context.storeId}`, this.rangeFilterText('ProductOrder.createdAt', range)],
      rows.length,
      range,
      ['分群以 CustomerCard.paidAmount/discountAmount 判断；若赠送策略另有专门字段，需后续并入口径。'],
    );
    return {
      status: rows.length ? 'success' : 'no_data',
      title: '免费次卡与付费客户消费差异',
      summary: rows.length
        ? `已按免费/赠送次卡客户与付费次卡客户拆分消费、核销和人均消费。`
        : '没有可用于对比的次卡客户样本。',
      data: { rows, items: rows, metrics: { segmentCount: rows.length }, timeRange: this.serializeRange(range) },
      evidence,
      actions: [{ label: '查看次卡开卡管理', action: 'card-package:open-orders', riskLevel: 'low' }],
    };
  }

  private async getFinanceRiskDiagnosticsMetric(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'this_month');
    const prisma = this.prisma as any;
    const [orders, refunds, settlements, commissions, approvals] = await Promise.all([
      prisma.productOrder?.findMany?.({ where: { storeId: context.storeId, createdAt: { gte: range.start, lt: range.end } }, select: { id: true, netAmount: true, totalAmount: true, status: true }, take: 5000 }) ?? [],
      prisma.refundRecord?.findMany?.({ where: { order: { storeId: context.storeId }, createdAt: { gte: range.start, lt: range.end } }, select: { id: true, amount: true, status: true, createdAt: true, refundedAt: true }, take: 1000 }) ?? [],
      prisma.dailySettlement?.findMany?.({ where: { storeId: context.storeId, settleDate: { gte: range.start, lt: range.end } }, take: 60 }) ?? [],
      prisma.commissionRecord?.findMany?.({ where: { storeId: context.storeId, createdAt: { gte: range.start, lt: range.end } }, select: { id: true, amount: true, staffUserId: true }, take: 5000 }) ?? [],
      prisma.agentApproval?.findMany?.({ where: { createdAt: { gte: range.start, lt: range.end } }, select: { id: true, status: true, createdAt: true, decidedAt: true }, take: 1000 }) ?? [],
    ]);
    const revenue = ((orders ?? []) as any[]).reduce((sum, order) => sum + this.toNumber(order.netAmount || order.totalAmount), 0);
    const refundAmount = ((refunds ?? []) as any[]).reduce((sum, refund) => sum + this.toNumber(refund.amount), 0);
    const commissionAmount = ((commissions ?? []) as any[]).reduce((sum, commission) => sum + this.toNumber(commission.amount), 0);
    const rows = [
      {
        riskType: '日结覆盖',
        riskLevel: (settlements ?? []).length ? '正常' : '需复核',
        metricText: `${(settlements ?? []).length} 条日结`,
        evidenceText: (settlements ?? []).length ? '本期已有日结汇总' : '本期订单存在时日结为空会影响财务看板',
        suggestion: (settlements ?? []).length ? '继续按日结口径复核' : '检查日结生成任务和订单入账链路',
      },
      {
        riskType: '退款压力',
        riskLevel: refundAmount > revenue * 0.05 ? '偏高' : '正常',
        metricText: `退款 ${this.formatMoney(refundAmount)} / 收入 ${this.formatMoney(revenue)}`,
        evidenceText: `${(refunds ?? []).length} 条退款记录`,
        suggestion: refundAmount > revenue * 0.05 ? '抽查大额退款原因和审批记录' : '保持常规复核',
      },
      {
        riskType: '提成成本',
        riskLevel: revenue > 0 && commissionAmount / revenue > 0.18 ? '偏高' : '正常',
        metricText: `提成 ${this.formatMoney(commissionAmount)}，占收入 ${this.formatPercent(revenue ? (commissionAmount / revenue) * 100 : 0)}`,
        evidenceText: `${(commissions ?? []).length} 条提成记录`,
        suggestion: '按员工和项目拆分查看高提成来源',
      },
      {
        riskType: '审批/报销线索',
        riskLevel: (approvals ?? []).some((item: any) => String(item.status).toLowerCase() === 'pending') ? '待处理' : '正常',
        metricText: `${(approvals ?? []).length} 条审批线索`,
        evidenceText: '当前用 AgentApproval 做审批线索入口；员工报销若有独立表需继续接入。',
        suggestion: '待审批项需人工确认，不自动写入财务结果',
      },
    ];
    const evidence = this.evidence(
      ['DailySettlement', 'ProductOrder', 'RefundRecord', 'CommissionRecord', 'AgentApproval'],
      '财务诊断 = 收入、退款、提成、日结和审批线索的只读聚合，用于发现异常和生成简报。',
      [`storeId=${context.storeId}`, this.rangeFilterText('createdAt/settleDate', range)],
      rows.length,
      range,
      ['诊断结果不等于审计结论；报销如未建独立业务表，会标记为数据源缺口。'],
    );
    return {
      status: 'success',
      title: '财务异常与经营压力诊断',
      summary: `${range.label}收入 ${this.formatMoney(revenue)}，退款 ${this.formatMoney(refundAmount)}，提成 ${this.formatMoney(commissionAmount)}；已生成 ${rows.length} 类风险摘要。`,
      data: {
        rows,
        items: rows,
        metrics: {
          revenue,
          revenueText: this.formatMoney(revenue),
          refundAmount,
          refundAmountText: this.formatMoney(refundAmount),
          commissionAmount,
          commissionAmountText: this.formatMoney(commissionAmount),
          settlementCount: (settlements ?? []).length,
        },
        timeRange: this.serializeRange(range),
      },
      evidence,
      actions: [{ label: '查看收银对账', action: 'finance:reconciliation', riskLevel: 'low' }],
    };
  }

  private async getMultiDomainSummaryMetric(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args.timeRange ?? 'today');
    const prisma = this.prisma as any;
    const [orders, settlements] = await Promise.all([
      prisma.productOrder?.findMany?.({ where: { storeId: context.storeId, createdAt: { gte: range.start, lt: range.end } }, select: { id: true, netAmount: true, totalAmount: true }, take: 5000 }) ?? [],
      prisma.dailySettlement?.findMany?.({ where: { storeId: context.storeId, settleDate: { gte: range.start, lt: range.end } }, take: 60 }) ?? [],
    ]);
    const revenue = ((orders ?? []) as any[]).reduce((sum, order) => sum + this.toNumber(order.netAmount || order.totalAmount), 0);
    const rows = [
      { section: '今日营收', metricText: `${this.formatMoney(revenue)} / ${(orders ?? []).length} 单`, nextStep: '需要精确日结时查看收银对账或日结报表' },
      { section: '预约', metricText: '需调用预约能力补充', nextStep: 'V2 后续接入 Appointment 通用记录查询' },
      { section: '库存', metricText: '需调用库存风险能力补充', nextStep: '查看临期风险和已发生报废记录' },
      { section: '员工', metricText: '需调用员工提成/人效能力补充', nextStep: '按 staffUserId 统一口径查看' },
      { section: '客户', metricText: '需调用客户沉睡/消费能力补充', nextStep: '先查客户分层，再决定是否触达' },
      { section: '月报', metricText: `${(settlements ?? []).length} 条日结可作为月报来源`, nextStep: '月报可自动生成，写入/发布前需确认' },
    ];
    const evidence = this.evidence(
      ['ProductOrder', 'DailySettlement', 'AgentV2CapabilityManifest'],
      '多域摘要 = 将复杂问题拆成多个只读经营模块，先输出摘要和下一步，不自动写入或下发。',
      [`storeId=${context.storeId}`, this.rangeFilterText('createdAt/settleDate', range)],
      rows.length,
      range,
      ['当前执行单次摘要；深度数据可由后续 planner 并发调用各领域能力补全。'],
    );
    return {
      status: 'success',
      title: '多域经营摘要',
      summary: `已拆分为营收、预约、库存、员工、客户和月报 6 个模块；本次只返回授权摘要，不执行写入动作。`,
      data: { rows, items: rows, metrics: { revenue, revenueText: this.formatMoney(revenue), orderCount: (orders ?? []).length }, timeRange: this.serializeRange(range) },
      evidence,
      actions: [],
    };
  }

  private resolveDateRange(input: unknown): AgentV2DateRange {
    const now = new Date();
    const preset = typeof input === 'object' && input !== null ? String((input as any).preset ?? '') : String(input ?? '');
    if (typeof input === 'object' && input !== null && (input as any).startDate && (input as any).endDate) {
      return {
        start: new Date(String((input as any).startDate)),
        end: new Date(`${String((input as any).endDate).slice(0, 10)}T23:59:59.999Z`),
        label: String((input as any).label ?? '自定义时间'),
        preset: String((input as any).preset ?? 'custom'),
      };
    }
    if (preset === 'yesterday') {
      const end = this.startOfDay(now);
      return { start: new Date(end.getTime() - DAY_MS), end, label: '昨天', preset };
    }
    if (preset === 'this_week') {
      const start = this.startOfWeek(now);
      return { start, end: now, label: '本周', preset };
    }
    if (preset === 'this_month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: '本月', preset };
    if (preset === 'last_30_days') return { start: new Date(now.getTime() - 30 * DAY_MS), end: now, label: '近 30 天', preset };
    const start = this.startOfDay(now);
    return { start, end: new Date(start.getTime() + DAY_MS), label: '今天', preset: 'today' };
  }

  private paymentTimeWhere(range: AgentV2DateRange) {
    return { OR: [{ paidAt: { gte: range.start, lt: range.end } }, { createdAt: { gte: range.start, lt: range.end } }] };
  }

  private refundTimeWhere(range: AgentV2DateRange) {
    return { OR: [{ refundedAt: { gte: range.start, lt: range.end } }, { createdAt: { gte: range.start, lt: range.end } }] };
  }

  private isProductOrderItem(item: any) {
    return ['product', 'goods', 'sku', 'retail'].includes(String(item?.itemType ?? '').toLowerCase());
  }

  private isProjectOrderItem(item: any) {
    return ['project', 'service'].includes(String(item?.itemType ?? '').toLowerCase());
  }

  private orderItemObjectId(item: any) {
    const value = Number(item?.itemId ?? item?.productId ?? item?.projectId ?? item?.payload?.productId ?? item?.payload?.projectId);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  private orderItemQuantity(item: any) {
    const quantity = this.toNumber(item?.quantity);
    return quantity > 0 ? quantity : 1;
  }

  private orderItemRevenue(item: any) {
    const netAmount = this.toNumber(item?.netAmount);
    if (netAmount > 0) return netAmount;
    const subtotal = this.toNumber(item?.subtotal);
    if (subtotal > 0) return Math.max(0, subtotal - this.toNumber(item?.itemDiscountAmount) - this.toNumber(item?.orderAllocatedDiscountAmount));
    const unitPrice = this.toNumber(item?.unitPrice);
    const listAmount = this.toNumber(item?.listAmount);
    const quantity = this.orderItemQuantity(item);
    const base = listAmount > 0 ? listAmount : unitPrice * quantity;
    return Math.max(0, base - this.toNumber(item?.discount) - this.toNumber(item?.totalDiscountAmount));
  }

  private projectBomUnitCost(project: any) {
    const bomItems = Array.isArray(project?.bomItems) ? project.bomItems : [];
    return bomItems.reduce((sum: number, item: any) => sum + this.toNumber(item?.standardQty) * this.toNumber(item?.product?.costPrice), 0);
  }

  private sumGrossProfitRows(rows: Array<{ revenue: number; grossProfit: number }>) {
    const revenue = rows.reduce((sum, row) => sum + this.toNumber(row.revenue), 0);
    const grossProfit = rows.reduce((sum, row) => sum + this.toNumber(row.grossProfit), 0);
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    return {
      revenue: Number(revenue.toFixed(2)),
      revenueText: this.formatMoney(revenue),
      grossProfit: Number(grossProfit.toFixed(2)),
      grossProfitText: this.formatMoney(grossProfit),
      grossMargin: Number(grossMargin.toFixed(1)),
      grossMarginText: this.formatPercent(grossMargin),
      itemCount: rows.length,
    };
  }

  private paymentFeeRate(method: string) {
    const map: Record<string, number> = {
      wechat: 0.006,
      alipay: 0.006,
      card: 0.003,
      bank_card: 0.003,
      bank: 0.003,
      cash: 0,
      balance: 0,
      member_card: 0,
    };
    return map[String(method ?? '').toLowerCase()] ?? 0;
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
      limitations: limitations ?? ['只读取当前账号授权范围内的已生成业务指标，不执行写入。'],
    };
  }

  private serializeRange(range: AgentV2DateRange) {
    return { start: this.formatDate(range.start), end: this.formatDate(range.end), label: range.label, preset: range.preset };
  }

  private rangeFilterText(field: string, range: AgentV2DateRange) {
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

  private formatPercent(value: number) {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  private statusLabel(value: unknown) {
    const map: Record<string, string> = { draft: '待确认', generated: '已生成', confirmed: '已确认', closed: '已关闭' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '未记录');
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

  private discountSourceLabel(value: unknown) {
    const map: Record<string, string> = {
      none: '无优惠来源',
      promotion: '营销活动',
      coupon: '优惠券',
      manual: '手工优惠',
      override: '授权改价',
      staff: '员工优惠',
      package: '套餐权益',
    };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '未记录');
  }

  private refundStatusLabel(value: unknown) {
    const map: Record<string, string> = { pending: '待处理', success: '成功', completed: '已完成', refunded: '已退款', failed: '失败', cancelled: '已取消' };
    return map[String(value ?? '').toLowerCase()] ?? String(value ?? '未记录');
  }
}
