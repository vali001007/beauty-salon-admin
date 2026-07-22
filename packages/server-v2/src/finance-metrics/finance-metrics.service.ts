import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { formatBusinessDate } from '../common/utils/business-time.js';
import { QueryFinanceDailyMetricsDto } from './dto.js';
import { FinanceRecognitionService } from '../finance-recognition/finance-recognition.service.js';
import type {
  FinanceDailyMetric,
  FinanceDailyMetricResponse,
  FinanceMetricCostQuality,
  FinanceMetricCostQualityItem,
  FinanceMetricCostQualityReason,
  FinanceMetricDataQuality,
  FinanceMetricDataQualityStatus,
  FinanceMetricMissingReason,
  FinanceMetricPaymentBreakdown,
  FinanceMetricSummary,
  FinanceReadiness,
} from './finance-metrics.types.js';

type DateRange = { from: Date; to: Date; dateFrom: string; dateTo: string };
type DailyAccumulator = Omit<FinanceDailyMetric, 'dataQuality'> & {
  missingReasons: Set<FinanceMetricMissingReason>;
  costQualityReasons: Set<FinanceMetricCostQualityReason>;
  costQualityItems: FinanceMetricCostQualityItem[];
  customerIds: Set<number>;
  orderIds: Set<number>;
};

type ProjectBomInfo = {
  unitCost: number;
  productIds: Set<number>;
};

type CostResolution = {
  amount: number;
  source: string;
  sourceNo?: string;
  sourceId?: number;
  occurredAt?: Date;
};

type CostMovementIndex = {
  serviceByOrderProject: Map<string, CostResolution>;
  serviceByCardUsageProject: Map<string, CostResolution>;
  productByOrderProduct: Map<string, CostResolution>;
};

const PAID_ORDER_STATUSES = ['completed', 'paid', 'refunded', '已完成', '已付款'];
const REFUND_STATUSES = ['success', 'completed', 'refunded', 'paid'];
const PREPAID_ORDER_ITEM_TYPES = new Set(['recharge', 'member_recharge', 'balance_recharge', 'card', 'customer_card', 'card_sale', 'member_card', 'open']);

@Injectable()
export class FinanceMetricsService {
  private readonly recognition: FinanceRecognitionService;

  constructor(private readonly prisma: PrismaService, recognition?: FinanceRecognitionService) {
    this.recognition = recognition ?? new FinanceRecognitionService(prisma);
  }

  async getDailyMetrics(query: QueryFinanceDailyMetricsDto, storeHeader?: string): Promise<FinanceDailyMetricResponse> {
    const storeId = this.asOptionalStoreId(query.storeId ?? storeHeader);
    const range = this.parseDateRange(query.dateFrom, query.dateTo);
    return this.buildDailyMetrics(range, storeId, query.mode ?? 'live');
  }

  async getDailyMetricForStoreDate(storeIdInput: number | string | undefined, dateInput: string | Date) {
    const storeId = this.asStoreId(storeIdInput);
    const date = this.dateKey(dateInput);
    const range = this.parseDateRange(date, date);
    const result = await this.buildDailyMetrics(range, storeId, 'live');
    return result.items[0] ?? this.finalizeDay(this.createEmptyDay(date, storeId), new Map());
  }

  private async buildDailyMetrics(range: DateRange, storeId?: number, mode: 'live' | 'confirmed' = 'live'): Promise<FinanceDailyMetricResponse> {
    if (mode === 'confirmed') return this.buildConfirmedDailyMetrics(range, storeId);
    const [
      orders,
      payments,
      refunds,
      balanceDeducts,
      cardUsages,
      costMovements,
      products,
      projects,
      commissionRecords,
      stores,
    ] = await Promise.all([
      this.getOrders(range, storeId),
      this.getPayments(range, storeId),
      this.getRefunds(range, storeId),
      this.getMemberBalanceDeducts(range, storeId),
      this.getCardUsages(range, storeId),
      this.getCostMovements(range, storeId),
      this.getProductsForOrders(range, storeId),
      this.getProjectsForMetrics(range, storeId),
      this.getCommissionRecords(range, storeId),
      this.getStores(storeId),
    ]);

    const storeById = new Map(stores.map((store: any) => [Number(store.id), store.name]));
    const productCostById = new Map(products.map((product: any) => [Number(product.id), this.toNumber(product.costPrice)]));
    const projectBomById = this.buildProjectBomMap(projects);
    const movementIndex = this.buildCostMovementIndex(costMovements, projectBomById);
    const cardUnitValueByName = await this.getCardUnitValueByName();
    const days = this.createDays(range, storeId);

    for (const payment of payments) this.applyPayment(days, payment);
    for (const order of orders) this.applyOrder(days, order, productCostById, projectBomById, movementIndex);
    for (const refund of refunds) this.applyRefund(days, refund);
    for (const tx of balanceDeducts) this.applyMemberBalanceDeduct(days, tx);
    for (const usage of cardUsages) this.applyCardUsage(days, usage, cardUnitValueByName, projectBomById, movementIndex);
    this.applyCommissionCost(days, commissionRecords);

    const allCustomerIds = new Set<number>();
    for (const day of days.values()) for (const customerId of day.customerIds) allCustomerIds.add(customerId);
    const items = Array.from(days.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => this.finalizeDay(item, storeById));
    const summary = this.buildSummary(items, range, allCustomerIds);
    const readiness = this.readiness(summary);
    return {
      items,
      total: items.length,
      summary,
      mode,
      recognitionBasis: 'finance_recognition_v1',
      readiness,
    };
  }

  private async buildConfirmedDailyMetrics(range: DateRange, storeId?: number): Promise<FinanceDailyMetricResponse> {
    const snapshots = await this.prisma.dailySettlementSnapshot.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        settleDate: {
          gte: new Date(`${range.dateFrom}T00:00:00.000Z`),
          lte: new Date(`${range.dateTo}T23:59:59.999Z`),
        },
        supersededAt: null,
      },
      include: { store: { select: { id: true, name: true } } },
      orderBy: [{ settleDate: 'asc' }, { version: 'desc' }],
    });
    const latestByStoreDate = new Map<string, any>();
    for (const snapshot of snapshots) {
      const key = `${snapshot.storeId}:${this.dateKey(snapshot.settleDate)}`;
      if (!latestByStoreDate.has(key)) latestByStoreDate.set(key, snapshot);
    }
    const items = Array.from(latestByStoreDate.values()).map((snapshot: any) => {
      const payload = snapshot.snapshot ?? {};
      const operatingRevenue = this.toNumber(snapshot.totalRevenue);
      const cashIncome = this.toNumber(snapshot.cashRevenue) + this.toNumber(snapshot.wechatRevenue) + this.toNumber(snapshot.alipayRevenue) + this.toNumber(snapshot.cardRevenue);
      const customerCount = this.toNumber(payload.customerCount);
      const orderCount = this.toNumber(payload.orderCount);
      const productCost = this.toNumber(payload.productCost ?? payload.summary?.productCost);
      const missingReasons = new Set<FinanceMetricMissingReason>(payload.dataQuality?.missingReasons ?? []);
      return {
        date: this.dateKey(snapshot.settleDate),
        storeId: snapshot.storeId,
        storeName: snapshot.store?.name,
        operatingRevenue,
        cashIncome,
        paymentBreakdown: {
          cash: this.toNumber(snapshot.cashRevenue),
          wechat: this.toNumber(snapshot.wechatRevenue),
          alipay: this.toNumber(snapshot.alipayRevenue),
          card: this.toNumber(snapshot.cardRevenue),
          total: cashIncome,
        },
        prepaidAmount: this.toNumber(payload.prepaidIncome ?? payload.prepaidAmount ?? snapshot.rechargeIncome),
        memberBalanceDeductCash: this.toNumber(payload.memberBalanceCashDeduct),
        memberBalanceDeductGift: this.toNumber(payload.memberBalanceGiftDeduct),
        memberBalanceDeductTotal: this.toNumber(payload.memberBalanceCashDeduct) + this.toNumber(payload.memberBalanceGiftDeduct),
        cardUsageRecognized: this.toNumber(payload.cardUsageRevenue),
        refundAmount: this.toNumber(snapshot.refundAmount),
        materialCost: this.toNumber(snapshot.materialCost),
        materialCostActual: this.toNumber(snapshot.materialCost),
        materialCostEstimated: 0,
        materialCostMissing: 0,
        productCost,
        productCostActual: productCost,
        productCostEstimated: 0,
        productCostMissing: 0,
        commissionCost: this.toNumber(snapshot.commissionTotal),
        grossProfit: this.toNumber(snapshot.grossProfit),
        grossMargin: this.toNumber(snapshot.grossMargin) > 1 ? this.toNumber(snapshot.grossMargin) / 100 : this.toNumber(snapshot.grossMargin),
        orderCount,
        customerCount,
        avgTicket: customerCount > 0 ? this.round(operatingRevenue / customerCount) : 0,
        avgOrderAmount: orderCount > 0 ? this.round(operatingRevenue / orderCount) : 0,
        avgCustomerSpend: customerCount > 0 ? this.round(operatingRevenue / customerCount) : 0,
        dataQuality: payload.dataQuality ?? this.dataQuality(missingReasons, operatingRevenue),
        costQuality: payload.costQuality ?? { status: missingReasons.size ? 'mixed' : 'complete', reasons: Array.from(missingReasons), items: [] },
      } as FinanceDailyMetric;
    });
    const liveRecognition = await this.buildDailyMetrics(range, storeId, 'live');
    const summary = this.buildSummary(items, range, new Set());
    summary.customerCount = liveRecognition.summary.customerCount;
    summary.avgTicket = summary.customerCount > 0 ? this.round(summary.operatingRevenue / summary.customerCount) : 0;
    summary.avgCustomerSpend = summary.avgTicket;
    return { items, total: items.length, summary, mode: 'confirmed', recognitionBasis: 'daily_settlement_snapshot_v1', readiness: this.readiness(summary) };
  }

  private parseDateRange(dateFromInput?: string, dateToInput?: string): DateRange {
    const today = this.dateKey(new Date());
    const dateFrom = dateFromInput || today;
    const dateTo = dateToInput || dateFrom;
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new BadRequestException('日期范围无效');
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    if (from > to) throw new BadRequestException('开始日期不能晚于结束日期');
    return { from, to, dateFrom: this.dateKey(from), dateTo: this.dateKey(to) };
  }

  private asOptionalStoreId(storeId?: number | string) {
    if (storeId === undefined || storeId === null || storeId === '') return undefined;
    const normalized = Number(storeId);
    if (!Number.isFinite(normalized) || normalized <= 0) throw new BadRequestException('门店 ID 无效');
    return normalized;
  }

  private asStoreId(storeId?: number | string) {
    const normalized = this.asOptionalStoreId(storeId);
    if (!normalized) throw new BadRequestException('缺少门店 ID');
    return normalized;
  }

  private dateKey(date: Date | string) {
    return formatBusinessDate(date);
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined || value === '') return 0;
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : 0;
  }

  private round(value: number, digits = 2) {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  private getPayloadNumber(payload: unknown, keys: string[]) {
    if (!payload || typeof payload !== 'object') return undefined;
    const source = payload as Record<string, unknown>;
    for (const key of keys) {
      const value = source[key];
      if (value === null || value === undefined || value === '') continue;
      const normalized = Number(value);
      if (Number.isFinite(normalized) && normalized > 0) return normalized;
    }
    return undefined;
  }

  private createDays(range: DateRange, storeId?: number) {
    const map = new Map<string, DailyAccumulator>();
    const cursor = new Date(range.from);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(range.to);
    end.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      const date = this.dateKey(cursor);
      map.set(date, this.createEmptyDay(date, storeId));
      cursor.setDate(cursor.getDate() + 1);
    }
    return map;
  }

  private createEmptyDay(date: string, storeId?: number): DailyAccumulator {
    return {
      date,
      storeId,
      operatingRevenue: 0,
      cashIncome: 0,
      paymentBreakdown: { cash: 0, wechat: 0, alipay: 0, card: 0, total: 0 },
      prepaidAmount: 0,
      memberBalanceDeductCash: 0,
      memberBalanceDeductGift: 0,
      memberBalanceDeductTotal: 0,
      cardUsageRecognized: 0,
      refundAmount: 0,
      materialCost: 0,
      materialCostActual: 0,
      materialCostEstimated: 0,
      materialCostMissing: 0,
      productCost: 0,
      productCostActual: 0,
      productCostEstimated: 0,
      productCostMissing: 0,
      commissionCost: 0,
      grossProfit: 0,
      grossMargin: 0,
      orderCount: 0,
      customerCount: 0,
      avgTicket: 0,
      avgOrderAmount: 0,
      avgCustomerSpend: 0,
      costQuality: { status: 'complete', reasons: [], items: [] },
      missingReasons: new Set<FinanceMetricMissingReason>(),
      costQualityReasons: new Set<FinanceMetricCostQualityReason>(),
      costQualityItems: [],
      customerIds: new Set<number>(),
      orderIds: new Set<number>(),
    };
  }

  private ensureDay(days: Map<string, DailyAccumulator>, date: string, storeId?: number) {
    if (!days.has(date)) days.set(date, this.createEmptyDay(date, storeId));
    return days.get(date)!;
  }

  private normalizePaymentMethod(method?: string | null) {
    const value = String(method ?? '').toLowerCase();
    if (['wechat', 'weixin', 'wx', '微信'].includes(value)) return 'wechat';
    if (['alipay', 'ali', '支付宝'].includes(value)) return 'alipay';
    if (['cash', '现金'].includes(value)) return 'cash';
    if (['card', 'bank_card', 'bankcard', '银行卡'].includes(value)) return 'card';
    if (['member_balance', 'balance', 'stored_value'].includes(value)) return 'member_balance';
    return value || 'other';
  }

  private itemType(itemType?: string) {
    return String(itemType ?? '').toLowerCase();
  }

  private isServiceItem(itemType?: string) {
    return ['project', 'service', 'service_project'].includes(this.itemType(itemType));
  }

  private isProductItem(itemType?: string) {
    return ['product', 'goods'].includes(this.itemType(itemType));
  }

  private isPrepaidItem(itemType?: string) {
    return PREPAID_ORDER_ITEM_TYPES.has(this.itemType(itemType));
  }

  private itemNetAmount(item: any) {
    const netAmount = this.toNumber(item?.netAmount);
    if (netAmount > 0) return netAmount;
    return this.toNumber(item?.subtotal);
  }

  private prepaidItemAmount(item: any) {
    const netAmount = this.itemNetAmount(item);
    if (netAmount > 0) return netAmount;
    const quantity = this.toNumber(item?.quantity) || 1;
    const unitPrice = this.toNumber(item?.unitPrice);
    const discount = this.toNumber(item?.totalDiscountAmount ?? item?.discount ?? item?.discountAmount);
    return Math.max(0, quantity * unitPrice - discount);
  }

  private getOrderNetAmount(order: any) {
    const netAmount = this.toNumber(order?.netAmount);
    if (netAmount > 0) return netAmount;
    return this.toNumber(order?.totalAmount);
  }

  private getOrderOperatingAmount(order: any) {
    return (order.orderItems ?? [])
      .filter((item: any) => this.isServiceItem(item.itemType) || this.isProductItem(item.itemType))
      .reduce((sum: number, item: any) => sum + this.itemNetAmount(item), 0);
  }

  private getRefundOperatingShare(refund: any) {
    const order = refund.order;
    const orderTotal = Math.max(this.getOrderNetAmount(order), 0);
    if (orderTotal <= 0) return 0;
    const operatingAmount = this.getOrderOperatingAmount(order);
    if (operatingAmount <= 0) return 0;
    return Math.min(this.toNumber(refund.amount), this.toNumber(refund.amount) * (operatingAmount / orderTotal));
  }

  private async getOrders(range: DateRange, storeId?: number) {
    return this.prisma.productOrder.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        AND: [
          {
            OR: [
              { createdAt: { gte: range.from, lte: range.to } },
              { orderItems: { some: { recognizedAt: { gte: range.from, lte: range.to } } } },
              {
                paymentRecords: {
                  some: {
                    status: 'success',
                    OR: [{ paidAt: { gte: range.from, lte: range.to } }, { paidAt: null, createdAt: { gte: range.from, lte: range.to } }],
                  },
                },
              },
            ],
          },
          {
            OR: [
              { status: { in: PAID_ORDER_STATUSES } },
              { paymentRecords: { some: { status: 'success' } } },
            ],
          },
        ],
      },
      include: {
        orderItems: true,
        paymentRecords: { where: { status: 'success' } },
        refundRecords: { where: { status: { in: REFUND_STATUSES } } },
        store: { select: { id: true, name: true } },
      },
    });
  }

  private async getPayments(range: DateRange, storeId?: number) {
    return this.prisma.paymentRecord.findMany({
      where: {
        status: 'success',
        OR: [{ paidAt: { gte: range.from, lte: range.to } }, { paidAt: null, createdAt: { gte: range.from, lte: range.to } }],
        order: { ...(storeId ? { storeId } : {}) },
      },
      include: { order: { select: { id: true, storeId: true, store: { select: { id: true, name: true } } } } },
    });
  }

  private async getRefunds(range: DateRange, storeId?: number) {
    return this.prisma.refundRecord.findMany({
      where: {
        status: { in: REFUND_STATUSES },
        refundedAt: { gte: range.from, lte: range.to },
        order: { ...(storeId ? { storeId } : {}) },
      },
      include: {
        items: { include: { orderItem: true, stockMovements: true } },
        order: { include: { orderItems: true, store: { select: { id: true, name: true } } } },
      },
    });
  }

  private async getMemberBalanceDeducts(range: DateRange, storeId?: number) {
    return this.prisma.customerBalanceTransaction.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        type: 'deduct',
        paymentMethod: 'member_balance',
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { createdAt: true, storeId: true, amount: true, giftAmount: true },
    });
  }

  private async getCardUsages(range: DateRange, storeId?: number) {
    return this.prisma.cardUsageRecord.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        verifiedAt: { gte: range.from, lte: range.to },
      },
      include: {
        card: { select: { name: true, price: true, totalTimes: true } },
        project: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
      },
    });
  }

  private async getCostMovements(range: DateRange, storeId?: number) {
    return this.prisma.stockMovement.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        movementType: { in: ['service_consume', 'service_consumption', 'sale_out'] },
        occurredAt: { gte: range.from, lte: range.to },
        sourceType: { in: ['project_order', 'card_usage', 'service_task', 'product_order'] },
      },
      include: { product: { select: { id: true, name: true, costPrice: true } } },
    });
  }

  private async getProductsForOrders(range: DateRange, storeId?: number) {
    const orders = await this.prisma.productOrder.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        createdAt: { gte: range.from, lte: range.to },
        OR: [{ status: { in: PAID_ORDER_STATUSES } }, { paymentRecords: { some: { status: 'success' } } }],
      },
      select: { orderItems: { select: { itemType: true, itemId: true } } },
    });
    const productIds = Array.from(
      new Set(
        orders.flatMap((order) =>
          order.orderItems
            .filter((item) => this.isProductItem(item.itemType) && item.itemId)
            .map((item) => Number(item.itemId)),
        ),
      ),
    );
    if (!productIds.length) return [];
    return this.prisma.product.findMany({ where: { id: { in: productIds }, ...(storeId ? { storeId } : {}) }, select: { id: true, costPrice: true } });
  }

  private async getProjectsForMetrics(range: DateRange, storeId?: number) {
    const [orders, usages] = await Promise.all([
      this.prisma.productOrder.findMany({
        where: { ...(storeId ? { storeId } : {}), createdAt: { gte: range.from, lte: range.to } },
        select: { orderItems: { select: { itemType: true, itemId: true } } },
      }),
      this.prisma.cardUsageRecord.findMany({
        where: { ...(storeId ? { storeId } : {}), verifiedAt: { gte: range.from, lte: range.to } },
        select: { projectId: true },
      }),
    ]);
    const projectIds = Array.from(
      new Set([
        ...orders.flatMap((order) =>
          order.orderItems
            .filter((item) => this.isServiceItem(item.itemType) && item.itemId)
            .map((item) => Number(item.itemId)),
        ),
        ...usages.map((usage) => Number(usage.projectId)).filter(Boolean),
      ]),
    );
    if (!projectIds.length) return [];
    return this.prisma.project.findMany({
      where: { id: { in: projectIds } },
      include: { bomItems: { include: { product: { select: { id: true, costPrice: true } } } } },
    });
  }

  private async getCommissionRecords(range: DateRange, storeId?: number) {
    return this.prisma.commissionRecord.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        createdAt: { gte: range.from, lte: range.to },
        type: { in: ['project', 'product'] },
        status: { not: 'cancelled' },
      },
      select: { createdAt: true, storeId: true, amount: true },
    });
  }

  private async getStores(storeId?: number) {
    return this.prisma.store.findMany({
      where: { ...(storeId ? { id: storeId } : {}) },
      select: { id: true, name: true },
    });
  }

  private async getCardUnitValueByName() {
    const cards = await this.prisma.card.findMany({ select: { name: true, price: true, totalTimes: true } });
    const map = new Map<string, number>();
    for (const card of cards) {
      const totalTimes = this.toNumber(card.totalTimes);
      const price = this.toNumber(card.price);
      if (card.name && totalTimes > 0) map.set(card.name, price / totalTimes);
    }
    return map;
  }

  private buildProjectBomMap(projects: any[]) {
    const map = new Map<number, ProjectBomInfo>();
    for (const project of projects) {
      const cost = (project.bomItems ?? []).reduce(
        (sum: number, item: any) => sum + this.toNumber(item.standardQty) * this.toNumber(item.product?.costPrice),
        0,
      );
      map.set(Number(project.id), {
        unitCost: cost,
        productIds: new Set((project.bomItems ?? []).map((item: any) => Number(item.productId ?? item.product?.id)).filter(Boolean)),
      });
    }
    return map;
  }

  private costResolutionFromMovement(movement: any): CostResolution {
    const snapshotAmount = this.toNumber(movement.costAmount);
    const quantity = Math.abs(this.toNumber(movement.quantity));
    if (snapshotAmount > 0) {
      return {
        amount: snapshotAmount,
        source: String(movement.costSource || 'batch_snapshot'),
        sourceNo: movement.sourceNo,
        sourceId: movement.sourceId ? Number(movement.sourceId) : undefined,
        occurredAt: movement.occurredAt ? new Date(movement.occurredAt) : undefined,
      };
    }
    const productCost = this.toNumber(movement.product?.costPrice);
    if (productCost > 0) {
      return {
        amount: productCost * quantity,
        source: 'product_master_estimate',
        sourceNo: movement.sourceNo,
        sourceId: movement.sourceId ? Number(movement.sourceId) : undefined,
        occurredAt: movement.occurredAt ? new Date(movement.occurredAt) : undefined,
      };
    }
    return {
      amount: 0,
      source: 'missing_cost',
      sourceNo: movement.sourceNo,
      sourceId: movement.sourceId ? Number(movement.sourceId) : undefined,
      occurredAt: movement.occurredAt ? new Date(movement.occurredAt) : undefined,
    };
  }

  private mergeCostResolution(map: Map<string, CostResolution>, key: string, value: CostResolution) {
    const current = map.get(key);
    if (!current) {
      map.set(key, { ...value });
      return;
    }
    current.amount += value.amount;
    if (current.source !== value.source) current.source = 'mixed';
    if (value.occurredAt && (!current.occurredAt || value.occurredAt < current.occurredAt)) current.occurredAt = value.occurredAt;
  }

  private buildCostMovementIndex(movements: any[], projectBomById: Map<number, ProjectBomInfo>): CostMovementIndex {
    const index: CostMovementIndex = {
      serviceByOrderProject: new Map(),
      serviceByCardUsageProject: new Map(),
      productByOrderProduct: new Map(),
    };
    for (const movement of movements) {
      const sourceType = String(movement.sourceType ?? '');
      const sourceId = Number(movement.sourceId);
      const productId = Number(movement.productId ?? movement.product?.id);
      const cost = this.costResolutionFromMovement(movement);
      if (sourceType === 'product_order' && sourceId && productId) {
        this.mergeCostResolution(index.productByOrderProduct, `${sourceId}:${productId}`, cost);
        continue;
      }
      if ((sourceType === 'project_order' || sourceType === 'card_usage') && sourceId) {
        if (!productId) continue;
        for (const [projectId, bom] of projectBomById.entries()) {
          if (bom.productIds.size > 0 && !bom.productIds.has(productId)) continue;
          const key = `${sourceId}:${projectId}`;
          this.mergeCostResolution(sourceType === 'project_order' ? index.serviceByOrderProject : index.serviceByCardUsageProject, key, cost);
        }
      }
    }
    return index;
  }

  private addCostIssue(
    day: DailyAccumulator,
    item: Omit<FinanceMetricCostQualityItem, 'suggestedAction'> & { suggestedAction?: string },
  ) {
    const suggestedActionMap: Record<FinanceMetricCostQualityReason, string> = {
      missing_actual_consumption: '补录实际耗材扣减流水，或确认该服务无需耗材。',
      missing_bom: '在项目 BOM 中维护标准耗材和用量。',
      missing_batch_cost: '补齐商品成本或批次成本后复核利润。',
      product_master_estimate: '当前使用商品主档成本估算，建议通过入库批次成本形成真实成本快照。',
      legacy_missing_snapshot: '历史库存流水缺少成本快照，建议按估算口径复核。',
      missing_commission: '补齐提成流水后复核利润。',
    };
    day.costQualityReasons.add(item.reason);
    day.costQualityItems.push({
      ...item,
      amount: item.amount === undefined ? undefined : this.round(item.amount),
      suggestedAction: item.suggestedAction ?? suggestedActionMap[item.reason],
    });
    day.missingReasons.add(item.reason as FinanceMetricMissingReason);
  }

  private resolveProductItemCost(item: any, productCostById: Map<number, number>): CostResolution {
    const quantity = this.toNumber(item.quantity || 1) || 1;
    const snapshotCostAmount = this.getPayloadNumber(item.payload, ['costAmount', 'productCostAmount']);
    if (snapshotCostAmount !== undefined) return { amount: snapshotCostAmount, source: 'order_snapshot' };
    const snapshotUnitCost = this.getPayloadNumber(item.payload, ['costPrice', 'unitCost', 'productCostPrice']);
    if (snapshotUnitCost !== undefined) return { amount: snapshotUnitCost * quantity, source: 'order_snapshot' };
    const productCost = this.toNumber(productCostById.get(Number(item.itemId)));
    return productCost > 0 ? { amount: productCost * quantity, source: 'product_master_estimate' } : { amount: 0, source: 'missing_cost' };
  }

  private resolveCardUsageAmount(usage: any, cardUnitValueByName: Map<string, number>, day: DailyAccumulator) {
    const amount = this.toNumber(usage.recognizedAmount);
    if (amount > 0) return amount;
    const unitValue =
      this.toNumber(usage.recognizedUnitValue) ||
      (this.toNumber(usage.card?.totalTimes) > 0
        ? this.toNumber(usage.card?.price) / this.toNumber(usage.card?.totalTimes)
        : this.toNumber(cardUnitValueByName.get(usage.cardName)));
    if (unitValue <= 0) {
      day.missingReasons.add('missing_card_unit_value');
      return 0;
    }
    return unitValue * (this.toNumber(usage.times) || 1);
  }

  private resolveStandardBomCostForItem(item: any, projectBomById: Map<number, ProjectBomInfo>) {
    const projectId = Number(item.itemId);
    if (!projectId) return 0;
    const unitCost = this.toNumber(projectBomById.get(projectId)?.unitCost);
    return unitCost * (this.toNumber(item.quantity) || 1);
  }

  private applyPayment(days: Map<string, DailyAccumulator>, payment: any) {
    const method = this.normalizePaymentMethod(payment.method);
    if (!['cash', 'wechat', 'alipay', 'card'].includes(method)) return;
    const date = this.dateKey(payment.paidAt ?? payment.createdAt);
    const day = this.ensureDay(days, date, payment.order?.storeId);
    const amount = this.toNumber(payment.amount);
    day.paymentBreakdown[method as keyof Omit<FinanceMetricPaymentBreakdown, 'total'>] += amount;
    day.paymentBreakdown.total += amount;
    day.cashIncome += amount;
  }

  private applyOrder(
    days: Map<string, DailyAccumulator>,
    order: any,
    productCostById: Map<number, number>,
    projectBomById: Map<number, ProjectBomInfo>,
    movementIndex: CostMovementIndex,
  ) {
    for (const item of order.orderItems ?? []) {
      const amount = this.itemNetAmount(item);
      const productId = Number(item.itemId);
      const productMovement = this.isProductItem(item.itemType) ? movementIndex.productByOrderProduct.get(`${order.id}:${productId}`) : undefined;
      const recognition = this.recognition.resolveOrderItemRecognizedAt({
        item,
        order,
        stockMovement: productMovement?.occurredAt ? { occurredAt: productMovement.occurredAt } : undefined,
      });
      const day = this.ensureDay(days, this.dateKey(recognition.recognizedAt), order.storeId);
      if (this.isServiceItem(item.itemType)) {
        day.orderIds.add(Number(order.id));
        if (order.customerId) day.customerIds.add(Number(order.customerId));
        day.operatingRevenue += amount;
        const projectId = Number(item.itemId);
        const actualCost = movementIndex.serviceByOrderProject.get(`${order.id}:${projectId}`);
        if (actualCost && actualCost.amount > 0 && actualCost.source !== 'product_master_estimate') {
          const costDay = this.ensureDay(days, this.dateKey(actualCost.occurredAt ?? recognition.recognizedAt), order.storeId);
          costDay.materialCostActual += actualCost.amount;
          costDay.materialCost += actualCost.amount;
        } else if (actualCost && actualCost.amount > 0) {
          day.materialCostEstimated += actualCost.amount;
          day.materialCost += actualCost.amount;
          this.addCostIssue(day, {
            type: 'material',
            sourceNo: order.orderNo,
            sourceId: order.id,
            itemName: item.name,
            amount: actualCost.amount,
            reason: 'legacy_missing_snapshot',
          });
        } else {
          const standardBomCost = this.resolveStandardBomCostForItem(item, projectBomById);
          if (standardBomCost > 0) {
            day.materialCostEstimated += standardBomCost;
            day.materialCost += standardBomCost;
            this.addCostIssue(day, {
              type: 'material',
              sourceNo: order.orderNo,
              sourceId: order.id,
              itemName: item.name,
              amount: standardBomCost,
              reason: 'missing_actual_consumption',
            });
          } else if (amount > 0) {
            day.materialCostMissing += amount;
            this.addCostIssue(day, {
              type: 'material',
              sourceNo: order.orderNo,
              sourceId: order.id,
              itemName: item.name,
              amount,
              reason: 'missing_bom',
            });
          }
        }
      } else if (this.isProductItem(item.itemType)) {
        day.orderIds.add(Number(order.id));
        if (order.customerId) day.customerIds.add(Number(order.customerId));
        day.operatingRevenue += amount;
        const movementCost = productMovement;
        const productCost = movementCost && movementCost.amount > 0 ? movementCost : this.resolveProductItemCost(item, productCostById);
        if (productCost.amount > 0 && ['batch_snapshot', 'order_snapshot', 'mixed'].includes(productCost.source)) {
          const costDay = this.ensureDay(days, this.dateKey(productCost.occurredAt ?? recognition.recognizedAt), order.storeId);
          costDay.productCostActual += productCost.amount;
          costDay.productCost += productCost.amount;
        } else if (productCost.amount > 0) {
          day.productCostEstimated += productCost.amount;
          day.productCost += productCost.amount;
          this.addCostIssue(day, {
            type: 'product',
            sourceNo: order.orderNo,
            sourceId: order.id,
            itemName: item.name,
            amount: productCost.amount,
            reason: 'product_master_estimate',
          });
        } else if (amount > 0) {
          day.productCostMissing += amount;
          this.addCostIssue(day, {
            type: 'product',
            sourceNo: order.orderNo,
            sourceId: order.id,
            itemName: item.name,
            amount,
            reason: 'missing_batch_cost',
          });
        }
      } else if (this.isPrepaidItem(item.itemType)) {
        day.prepaidAmount += this.prepaidItemAmount(item);
      }
    }
  }

  private applyRefund(days: Map<string, DailyAccumulator>, refund: any) {
    const date = this.dateKey(refund.refundedAt ?? refund.createdAt);
    const day = this.ensureDay(days, date, refund.order?.storeId);
    const amount = this.toNumber(refund.amount);
    day.refundAmount += amount;
    const facts = this.recognition.buildRefundFacts(refund);
    const exactOperatingFacts = facts.filter((fact) => fact.factType === 'operating_revenue');
    const exactPrepaidFacts = facts.filter((fact) => fact.factType === 'prepaid_addition');
    if (exactOperatingFacts.length || exactPrepaidFacts.length) {
      for (const fact of exactOperatingFacts) this.ensureDay(days, fact.businessDate, fact.storeId).operatingRevenue += fact.amount;
      for (const fact of exactPrepaidFacts) this.ensureDay(days, fact.businessDate, fact.storeId).prepaidAmount += fact.amount;
    } else {
      day.operatingRevenue -= this.getRefundOperatingShare(refund);
    }
    for (const fact of this.recognition.buildRefundCostReversalFacts(refund)) {
      const costDay = this.ensureDay(days, fact.businessDate, fact.storeId);
      if (fact.factType === 'product_cost') {
        costDay.productCost += fact.amount;
        costDay.productCostActual += fact.amount;
      } else if (fact.factType === 'material_cost') {
        costDay.materialCost += fact.amount;
        costDay.materialCostActual += fact.amount;
      }
    }
  }

  private applyMemberBalanceDeduct(days: Map<string, DailyAccumulator>, tx: any) {
    const date = this.dateKey(tx.createdAt);
    const day = this.ensureDay(days, date, tx.storeId);
    const cash = this.toNumber(tx.amount);
    const gift = this.toNumber(tx.giftAmount);
    day.memberBalanceDeductCash += cash;
    day.memberBalanceDeductGift += gift;
    day.memberBalanceDeductTotal += cash + gift;
  }

  private applyCardUsage(
    days: Map<string, DailyAccumulator>,
    usage: any,
    cardUnitValueByName: Map<string, number>,
    projectBomById: Map<number, ProjectBomInfo>,
    movementIndex: CostMovementIndex,
  ) {
    const date = this.dateKey(usage.verifiedAt);
    const day = this.ensureDay(days, date, usage.storeId);
    const amount = this.resolveCardUsageAmount(usage, cardUnitValueByName, day);
    if (usage.customerId) day.customerIds.add(Number(usage.customerId));
    day.cardUsageRecognized += amount;
    day.operatingRevenue += amount;

    const projectId = Number(usage.projectId);
    const actualCost = movementIndex.serviceByCardUsageProject.get(`${usage.id}:${projectId}`);
    if (actualCost && actualCost.amount > 0 && actualCost.source !== 'product_master_estimate') {
      day.materialCostActual += actualCost.amount;
      day.materialCost += actualCost.amount;
      return;
    }
    if (actualCost && actualCost.amount > 0) {
      day.materialCostEstimated += actualCost.amount;
      day.materialCost += actualCost.amount;
      this.addCostIssue(day, {
        type: 'material',
        sourceNo: usage.sourceOrder?.orderNo,
        sourceId: usage.id,
        itemName: usage.projectName ?? usage.project?.name,
        amount: actualCost.amount,
        reason: 'legacy_missing_snapshot',
      });
      return;
    }
    const unitBomCost = this.toNumber(projectBomById.get(projectId)?.unitCost);
    const estimatedCost = unitBomCost * (this.toNumber(usage.times) || 1);
    if (estimatedCost > 0) {
      day.materialCostEstimated += estimatedCost;
      day.materialCost += estimatedCost;
      this.addCostIssue(day, {
        type: 'material',
        sourceNo: usage.sourceOrder?.orderNo,
        sourceId: usage.id,
        itemName: usage.projectName ?? usage.project?.name,
        amount: estimatedCost,
        reason: 'missing_actual_consumption',
      });
    } else if (amount > 0) {
      day.materialCostMissing += amount;
      this.addCostIssue(day, {
        type: 'material',
        sourceNo: usage.sourceOrder?.orderNo,
        sourceId: usage.id,
        itemName: usage.projectName ?? usage.project?.name,
        amount,
        reason: 'missing_bom',
      });
    }
  }

  private applyCommissionCost(days: Map<string, DailyAccumulator>, commissionRecords: any[]) {
    for (const record of commissionRecords) {
      const date = this.dateKey(record.createdAt);
      const day = this.ensureDay(days, date, record.storeId);
      day.commissionCost += this.toNumber(record.amount);
    }
  }

  private finalizeDay(day: DailyAccumulator, storeById: Map<number, string>): FinanceDailyMetric {
    day.customerCount = day.customerIds.size;
    day.orderCount = day.orderIds.size;
    if (day.operatingRevenue > 0 && day.commissionCost <= 0) {
      this.addCostIssue(day, { type: 'commission', amount: day.operatingRevenue, reason: 'missing_commission' });
    }
    const grossProfit = day.operatingRevenue - day.materialCost - day.productCost - day.commissionCost;
    const grossMargin = day.operatingRevenue > 0 ? grossProfit / day.operatingRevenue : 0;
    const finalized: FinanceDailyMetric = {
      ...day,
      storeName: day.storeId ? storeById.get(day.storeId) : undefined,
      operatingRevenue: this.round(day.operatingRevenue),
      cashIncome: this.round(day.cashIncome),
      paymentBreakdown: {
        cash: this.round(day.paymentBreakdown.cash),
        wechat: this.round(day.paymentBreakdown.wechat),
        alipay: this.round(day.paymentBreakdown.alipay),
        card: this.round(day.paymentBreakdown.card),
        total: this.round(day.paymentBreakdown.total),
      },
      prepaidAmount: this.round(day.prepaidAmount),
      memberBalanceDeductCash: this.round(day.memberBalanceDeductCash),
      memberBalanceDeductGift: this.round(day.memberBalanceDeductGift),
      memberBalanceDeductTotal: this.round(day.memberBalanceDeductTotal),
      cardUsageRecognized: this.round(day.cardUsageRecognized),
      refundAmount: this.round(day.refundAmount),
      materialCost: this.round(day.materialCost),
      materialCostActual: this.round(day.materialCostActual),
      materialCostEstimated: this.round(day.materialCostEstimated),
      materialCostMissing: this.round(day.materialCostMissing),
      productCost: this.round(day.productCost),
      productCostActual: this.round(day.productCostActual),
      productCostEstimated: this.round(day.productCostEstimated),
      productCostMissing: this.round(day.productCostMissing),
      commissionCost: this.round(day.commissionCost),
      grossProfit: this.round(grossProfit),
      grossMargin: this.round(grossMargin, 4),
      avgTicket: day.customerCount > 0 ? this.round(day.operatingRevenue / day.customerCount) : 0,
      avgOrderAmount: day.orderCount > 0 ? this.round(day.operatingRevenue / day.orderCount) : 0,
      avgCustomerSpend: day.customerCount > 0 ? this.round(day.operatingRevenue / day.customerCount) : 0,
      dataQuality: this.dataQuality(day.missingReasons, day.operatingRevenue),
      costQuality: this.costQuality(day),
    };
    delete (finalized as any).missingReasons;
    delete (finalized as any).costQualityReasons;
    delete (finalized as any).costQualityItems;
    delete (finalized as any).customerIds;
    delete (finalized as any).orderIds;
    return finalized;
  }

  private dataQuality(reasons: Set<FinanceMetricMissingReason>, operatingRevenue: number): FinanceMetricDataQuality {
    const missingReasons = Array.from(reasons);
    const status: FinanceMetricDataQualityStatus =
      operatingRevenue <= 0
        ? 'unavailable'
        : reasons.has('missing_cost') || reasons.has('missing_bom') || reasons.has('missing_batch_cost')
          ? 'missing_cost'
          : reasons.size
            ? 'estimated'
            : 'complete';
    const detailMap: Record<FinanceMetricDataQualityStatus, string> = {
      complete: '本期收银、成本和提成口径完整。',
      estimated: '本期存在估算成本或缺提成，利润为预估值。',
      missing_cost: '本期存在缺成本或缺 BOM，利润需要补齐成本后复核。',
      missing_commission: '本期提成数据缺失，毛利可能偏高。',
      unavailable: '本期暂无可计算营业收入。',
    };
    return { status, missingReasons, detail: detailMap[status] };
  }

  private costQuality(day: DailyAccumulator): FinanceMetricCostQuality {
    const reasons = Array.from(day.costQualityReasons);
    const hasMissing = reasons.some((reason) => ['missing_bom', 'missing_batch_cost', 'missing_commission'].includes(reason));
    const hasEstimated =
      day.materialCostEstimated > 0 ||
      day.productCostEstimated > 0 ||
      reasons.some((reason) => ['missing_actual_consumption', 'product_master_estimate', 'legacy_missing_snapshot'].includes(reason));
    const hasActual = day.materialCostActual > 0 || day.productCostActual > 0;
    const status: FinanceMetricCostQuality['status'] = hasMissing ? 'missing' : hasActual && hasEstimated ? 'mixed' : hasEstimated ? 'estimated' : 'complete';
    return {
      status,
      reasons,
      items: day.costQualityItems.map((item) => ({ ...item, amount: item.amount === undefined ? undefined : this.round(item.amount) })),
    };
  }

  private readiness(summary: FinanceMetricSummary): FinanceReadiness {
    if (summary.operatingRevenue <= 0) return { status: 'unavailable', publishable: false, blockers: [], warnings: [] };
    const actions: Record<string, string> = {
      missing_bom: '/inventory/consumption',
      missing_batch_cost: '/inventory/stock',
      missing_cost: '/finance/profit',
      missing_commission: '/finance/staff-commission',
      missing_actual_consumption: '/inventory/consumption',
    };
    const blockers = summary.dataQuality.missingReasons
      .filter((reason) => ['missing_bom', 'missing_batch_cost', 'missing_cost', 'missing_commission'].includes(reason))
      .map((code) => ({ code, count: summary.costQuality.items.filter((item) => item.reason === code).length || 1, actionPath: actions[code] ?? '/finance/profit' }));
    const warnings = summary.dataQuality.missingReasons
      .filter((reason) => !blockers.some((item) => item.code === reason))
      .map((code) => ({ code, count: summary.costQuality.items.filter((item) => item.reason === code).length || 1 }));
    return { status: blockers.length ? 'blocked' : 'ready', publishable: blockers.length === 0, blockers, warnings };
  }

  private buildSummary(items: FinanceDailyMetric[], range: DateRange, customerIds = new Set<number>()): FinanceMetricSummary {
    const summary = items.reduce(
      (sum, item) => {
        sum.operatingRevenue += item.operatingRevenue;
        sum.cashIncome += item.cashIncome;
        sum.paymentBreakdown.cash += item.paymentBreakdown.cash;
        sum.paymentBreakdown.wechat += item.paymentBreakdown.wechat;
        sum.paymentBreakdown.alipay += item.paymentBreakdown.alipay;
        sum.paymentBreakdown.card += item.paymentBreakdown.card;
        sum.paymentBreakdown.total += item.paymentBreakdown.total;
        sum.prepaidAmount += item.prepaidAmount;
        sum.memberBalanceDeductCash += item.memberBalanceDeductCash;
        sum.memberBalanceDeductGift += item.memberBalanceDeductGift;
        sum.memberBalanceDeductTotal += item.memberBalanceDeductTotal;
        sum.cardUsageRecognized += item.cardUsageRecognized;
        sum.refundAmount += item.refundAmount;
        sum.materialCost += item.materialCost;
        sum.materialCostActual += item.materialCostActual;
        sum.materialCostEstimated += item.materialCostEstimated;
        sum.materialCostMissing += item.materialCostMissing;
        sum.productCost += item.productCost;
        sum.productCostActual += item.productCostActual;
        sum.productCostEstimated += item.productCostEstimated;
        sum.productCostMissing += item.productCostMissing;
        sum.commissionCost += item.commissionCost;
        sum.orderCount += item.orderCount;
        sum.customerCount += item.customerCount;
        for (const reason of item.dataQuality.missingReasons) sum.missingReasons.add(reason);
        for (const reason of item.costQuality.reasons) sum.costQualityReasons.add(reason);
        sum.costQualityItems.push(...item.costQuality.items);
        return sum;
      },
      {
        operatingRevenue: 0,
        cashIncome: 0,
        paymentBreakdown: { cash: 0, wechat: 0, alipay: 0, card: 0, total: 0 },
        prepaidAmount: 0,
        memberBalanceDeductCash: 0,
        memberBalanceDeductGift: 0,
        memberBalanceDeductTotal: 0,
        cardUsageRecognized: 0,
        refundAmount: 0,
        materialCost: 0,
        materialCostActual: 0,
        materialCostEstimated: 0,
        materialCostMissing: 0,
        productCost: 0,
        productCostActual: 0,
        productCostEstimated: 0,
        productCostMissing: 0,
        commissionCost: 0,
        orderCount: 0,
        customerCount: 0,
        avgOrderAmount: 0,
        avgCustomerSpend: 0,
        missingReasons: new Set<FinanceMetricMissingReason>(),
        costQualityReasons: new Set<FinanceMetricCostQualityReason>(),
        costQualityItems: [] as FinanceMetricCostQualityItem[],
      },
    );
    const grossProfit = summary.operatingRevenue - summary.materialCost - summary.productCost - summary.commissionCost;
    return {
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      operatingRevenue: this.round(summary.operatingRevenue),
      cashIncome: this.round(summary.cashIncome),
      paymentBreakdown: {
        cash: this.round(summary.paymentBreakdown.cash),
        wechat: this.round(summary.paymentBreakdown.wechat),
        alipay: this.round(summary.paymentBreakdown.alipay),
        card: this.round(summary.paymentBreakdown.card),
        total: this.round(summary.paymentBreakdown.total),
      },
      prepaidAmount: this.round(summary.prepaidAmount),
      memberBalanceDeductCash: this.round(summary.memberBalanceDeductCash),
      memberBalanceDeductGift: this.round(summary.memberBalanceDeductGift),
      memberBalanceDeductTotal: this.round(summary.memberBalanceDeductTotal),
      cardUsageRecognized: this.round(summary.cardUsageRecognized),
      refundAmount: this.round(summary.refundAmount),
      materialCost: this.round(summary.materialCost),
      materialCostActual: this.round(summary.materialCostActual),
      materialCostEstimated: this.round(summary.materialCostEstimated),
      materialCostMissing: this.round(summary.materialCostMissing),
      productCost: this.round(summary.productCost),
      productCostActual: this.round(summary.productCostActual),
      productCostEstimated: this.round(summary.productCostEstimated),
      productCostMissing: this.round(summary.productCostMissing),
      commissionCost: this.round(summary.commissionCost),
      grossProfit: this.round(grossProfit),
      grossMargin: summary.operatingRevenue > 0 ? this.round(grossProfit / summary.operatingRevenue, 4) : 0,
      orderCount: summary.orderCount,
      customerCount: customerIds.size || summary.customerCount,
      avgTicket: (customerIds.size || summary.customerCount) > 0 ? this.round(summary.operatingRevenue / (customerIds.size || summary.customerCount)) : 0,
      avgOrderAmount: summary.orderCount > 0 ? this.round(summary.operatingRevenue / summary.orderCount) : 0,
      avgCustomerSpend: (customerIds.size || summary.customerCount) > 0 ? this.round(summary.operatingRevenue / (customerIds.size || summary.customerCount)) : 0,
      dataQuality: this.dataQuality(summary.missingReasons, summary.operatingRevenue),
      costQuality: this.costQuality({
        ...(summary as any),
        date: range.dateTo,
        storeId: undefined,
        storeName: undefined,
        grossProfit: 0,
        grossMargin: 0,
        avgTicket: 0,
        avgOrderAmount: 0,
        avgCustomerSpend: 0,
        paymentBreakdown: summary.paymentBreakdown,
        costQuality: { status: 'complete', reasons: [], items: [] },
        costQualityReasons: summary.costQualityReasons,
        costQualityItems: summary.costQualityItems,
        customerIds: new Set<number>(),
        orderIds: new Set<number>(),
      }),
    };
  }
}
