import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { formatBusinessDate } from '../common/utils/business-time.js';
import { FinanceMetricsService } from '../finance-metrics/finance-metrics.service.js';
import {
  QueryBeauticianPerformanceDto,
  QueryOperationProfitDto,
  QueryPrepaidLiabilitiesDto,
  QueryProductMarginsDto,
  QueryProjectMarginsDto,
} from './dto.js';
import type { CostBreakdownKey, DataQualityStatus, DateRange, MissingCostReason, OperationAlert } from './operation-profit.types.js';

type NumberMap = Map<string | number, number>;
type ProductCostSource = 'batch_snapshot' | 'order_snapshot' | 'product_master_estimate' | 'legacy_missing_snapshot' | 'missing' | 'mixed';
type ProductMovementCost = {
  unitCost: number;
  costAmount: number;
  source: ProductCostSource;
  sourceNo?: string;
};

export type OperationFinanceContext = {
  userId: number;
  storeIds: number[];
  roles: string[];
  permissions: string[];
};

@Injectable()
export class OperationProfitService {
  constructor(private prisma: PrismaService, private readonly financeMetricsService?: FinanceMetricsService) {}

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  private round(value: number, digits = 2) {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  private asOptionalStoreId(storeId?: number | string) {
    if (storeId === undefined || storeId === null || storeId === '') return undefined;
    const normalized = Number(storeId);
    if (!Number.isFinite(normalized) || normalized <= 0) throw new BadRequestException('门店 ID 无效');
    return normalized;
  }

  private parseDateRange(from: string, to: string): DateRange {
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new BadRequestException('日期范围无效');
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    if (start > end) throw new BadRequestException('开始日期不能晚于结束日期');
    return { from: start, to: end };
  }

  private dateKey(date: Date | string) {
    return formatBusinessDate(date);
  }

  private monthKeys(range: DateRange) {
    const months: string[] = [];
    const cursor = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
    const end = new Date(range.to.getFullYear(), range.to.getMonth(), 1);
    while (cursor <= end) {
      months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }

  private increment(map: NumberMap, key: string | number, amount: number) {
    map.set(key, this.toNumber(map.get(key)) + this.toNumber(amount));
  }

  private addDataQuality(reasons: Set<MissingCostReason>, status: DataQualityStatus, detail: string) {
    return {
      status,
      missingCostReasons: Array.from(reasons),
      detail,
    };
  }

  private itemType(itemType?: string) {
    return String(itemType ?? '').toLowerCase();
  }

  private isPaidOrder(status?: string) {
    return ['completed', 'paid', '已完成', '已付款'].includes(String(status ?? ''));
  }

  private isServiceItem(itemType?: string) {
    const type = this.itemType(itemType);
    return ['project', 'service', 'service_project'].includes(type);
  }

  private isProductItem(itemType?: string) {
    const type = this.itemType(itemType);
    return ['product', 'goods'].includes(type);
  }

  private isCardSaleItem(itemType?: string) {
    const type = this.itemType(itemType);
    return ['card', 'customer_card', 'card_sale', 'member_card'].includes(type);
  }

  private isRechargeItem(itemType?: string) {
    const type = this.itemType(itemType);
    return ['recharge', 'member_recharge', 'balance_recharge'].includes(type);
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

  private getRefundShare(item: any) {
    const order = item.order;
    const orderTotal = Math.max(this.toNumber(order?.netAmount ?? order?.totalAmount), 0);
    if (orderTotal <= 0) return 0;
    const refundAmount = (order?.refundRecords ?? [])
      .filter((refund: any) => ['completed', 'success', 'paid', 'refunded'].includes(String(refund.status)))
      .reduce((sum: number, refund: any) => sum + this.toNumber(refund.amount), 0);
    if (refundAmount <= 0) return 0;
    const itemAmount = this.getItemNetAmount(item);
    return Math.min(itemAmount, refundAmount * (itemAmount / orderTotal));
  }

  private getItemNetAmount(item: any) {
    return this.toNumber(item?.netAmount ?? item?.subtotal);
  }

  private getItemListAmount(item: any) {
    return this.toNumber(item?.listAmount ?? item?.subtotal);
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

  private getCardUsageRecognizedAmount(record: any, cardUnitValueByName: Map<string, number>, missingReasons?: Set<MissingCostReason>) {
    const amount = this.toNumber(record?.recognizedAmount);
    if (amount > 0) return amount;
    const unitValue = this.toNumber(record?.recognizedUnitValue) || this.toNumber(cardUnitValueByName.get(record?.cardName));
    if (unitValue <= 0) {
      missingReasons?.add('missing_card_unit_value');
      return 0;
    }
    return unitValue * (this.toNumber(record?.times) || 1);
  }

  private async getOrders(range: DateRange, storeId?: number) {
    return this.prisma.productOrder.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        createdAt: { gte: range.from, lte: range.to },
        status: { in: ['completed', 'paid', '已完成', '已付款'] },
      },
      include: {
        orderItems: true,
        paymentRecords: true,
        refundRecords: true,
        store: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async getCardUsageRecords(range: DateRange, storeId?: number) {
    return this.prisma.cardUsageRecord.findMany({
      where: {
        verifiedAt: { gte: range.from, lte: range.to },
        ...(storeId ? { customer: { storeId } } : {}),
      },
      include: {
        customer: { select: { id: true, name: true, storeId: true } },
        card: { select: { id: true, name: true, price: true, totalTimes: true } },
        project: { select: { id: true, name: true } },
        beautician: { select: { id: true, name: true } },
        sourceOrder: { select: { id: true, orderNo: true, checkoutGroupNo: true } },
        sourceOrderItem: { select: { id: true, name: true, itemType: true, itemId: true } },
      },
      orderBy: { verifiedAt: 'asc' },
    });
  }

  private async getOperatingCosts(range: DateRange, storeId?: number) {
    const costs = await this.prisma.operatingCost.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        periodMonth: { in: this.monthKeys(range) },
      },
      include: { store: { select: { id: true, name: true } } },
    });
    return costs.flatMap((cost: any) => {
      if (String(cost.allocationType) !== 'store_month') {
        const costDate = new Date(cost.costDate);
        return costDate >= range.from && costDate <= range.to ? [cost] : [];
      }
      const [year, month] = String(cost.periodMonth).split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
      const overlapStart = range.from > monthStart ? range.from : monthStart;
      const overlapEnd = range.to < monthEnd ? range.to : monthEnd;
      if (overlapStart > overlapEnd) return [];
      const overlapDays = Math.floor((new Date(overlapEnd).setHours(0, 0, 0, 0) - new Date(overlapStart).setHours(0, 0, 0, 0)) / 86400000) + 1;
      const daysInMonth = new Date(year, month, 0).getDate();
      return [{ ...cost, amount: (this.toNumber(cost.amount) * overlapDays) / daysInMonth, allocatedDays: overlapDays, daysInMonth }];
    });
  }

  private isSuperAdmin(context: OperationFinanceContext) {
    return context.permissions?.includes('*') || context.roles?.includes('super_admin');
  }

  private assertStoreAccess(storeId: number, context: OperationFinanceContext) {
    if (!this.isSuperAdmin(context) && !context.storeIds?.includes(storeId)) {
      throw new ForbiddenException('无权访问该门店财务数据');
    }
  }

  private async writeFinanceAudit(data: any) {
    if (this.prisma.financeAuditLog?.create) await this.prisma.financeAuditLog.create({ data });
  }

  private monthRange(periodMonth: string) {
    if (!/^\d{4}-\d{2}$/.test(periodMonth)) throw new BadRequestException('结账月份格式不正确');
    const [year, month] = periodMonth.split('-').map(Number);
    if (month < 1 || month > 12) throw new BadRequestException('结账月份格式不正确');
    const from = `${periodMonth}-01`;
    const to = `${periodMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    return { from, to };
  }

  async generateMonthlyClose(storeIdInput: number | string, periodMonth: string, context: OperationFinanceContext) {
    const storeId = this.asOptionalStoreId(storeIdInput);
    if (!storeId) throw new BadRequestException('缺少门店 ID');
    this.assertStoreAccess(storeId, context);
    const range = this.monthRange(periodMonth);
    const overview = await this.getOverview({ storeId, ...range });
    const latest = await this.prisma.monthlyProfitClose.findFirst({
      where: { storeId, periodMonth },
      orderBy: { version: 'desc' },
    });
    if (latest?.status === 'confirmed') throw new ConflictException('已确认月结禁止重新生成，请先由平台管理员重开');

    const amountByKey = new Map((overview.costBreakdown ?? []).map((item: any) => [item.key, this.toNumber(item.amount)]));
    const operatingCost = (overview.costBreakdown ?? [])
      .filter((item: any) => !['material', 'product', 'commission'].includes(item.key))
      .reduce((sum: number, item: any) => sum + this.toNumber(item.amount), 0);
    const data = {
      storeId,
      periodMonth,
      version: latest?.status === 'draft' ? latest.version : this.toNumber(latest?.version) + 1 || 1,
      operatingRevenue: this.toNumber(overview.summary.operatingIncome),
      materialCost: this.toNumber(amountByKey.get('material')),
      productCost: this.toNumber(amountByKey.get('product')),
      commissionCost: this.toNumber(amountByKey.get('commission')),
      operatingCost,
      grossProfit: this.toNumber(overview.summary.grossProfit),
      operatingProfit: this.toNumber(overview.summary.operatingProfit),
      dataQuality: { ...overview.dataQuality, readiness: overview.readiness },
      sourceSummary: { period: range, summary: overview.summary, costBreakdown: overview.costBreakdown },
      status: 'draft',
    };
    const close = latest?.status === 'draft'
      ? await this.prisma.monthlyProfitClose.update({ where: { id: latest.id }, data })
      : await this.prisma.monthlyProfitClose.create({ data });
    await this.writeFinanceAudit({ storeId, userId: context.userId, action: 'monthly_profit_close_generated', entityType: 'MonthlyProfitClose', entityId: close.id, afterPayload: { periodMonth, version: close.version } });
    return close;
  }

  async confirmMonthlyClose(id: number, context: OperationFinanceContext) {
    const close = await this.prisma.monthlyProfitClose.findUnique({ where: { id } });
    if (!close) throw new NotFoundException('月度利润结账单不存在');
    this.assertStoreAccess(this.toNumber(close.storeId), context);
    if (close.status !== 'draft') throw new ConflictException('只有草稿月结可以确认');
    if ((close.dataQuality as any)?.readiness?.publishable !== true) throw new ConflictException('利润数据未达到发布条件，禁止确认');
    const confirmedAt = new Date();
    const updated = await this.prisma.monthlyProfitClose.update({
      where: { id },
      data: { status: 'confirmed', confirmedBy: context.userId, confirmedAt },
    });
    await this.writeFinanceAudit({ storeId: close.storeId, userId: context.userId, action: 'monthly_profit_close_confirmed', entityType: 'MonthlyProfitClose', entityId: id, afterPayload: { version: close.version, confirmedAt } });
    return updated;
  }

  async reopenMonthlyClose(id: number, reasonInput: string, context: OperationFinanceContext) {
    if (!this.isSuperAdmin(context)) throw new ForbiddenException('仅超级管理员可以重开月结');
    const reason = reasonInput?.trim();
    if (!reason || reason.length < 5 || reason.length > 500) throw new BadRequestException('重开原因需为 5–500 字');
    const close = await this.prisma.monthlyProfitClose.findUnique({ where: { id } });
    if (!close) throw new NotFoundException('月度利润结账单不存在');
    if (close.status !== 'confirmed') throw new ConflictException('只有已确认月结可以重开');
    const reopenedAt = new Date();
    const updated = await this.prisma.monthlyProfitClose.update({
      where: { id },
      data: { status: 'reopened', reopenedBy: context.userId, reopenedAt, reopenReason: reason },
    });
    await this.writeFinanceAudit({ storeId: close.storeId, userId: context.userId, action: 'monthly_profit_close_reopened', entityType: 'MonthlyProfitClose', entityId: id, reason, beforePayload: { status: close.status, version: close.version }, afterPayload: { status: 'reopened' } });
    return updated;
  }

  async getMonthlyCloseVersions(storeIdInput: number | string, periodMonth: string, context: OperationFinanceContext) {
    const storeId = this.asOptionalStoreId(storeIdInput);
    if (!storeId) throw new BadRequestException('缺少门店 ID');
    this.assertStoreAccess(storeId, context);
    return this.prisma.monthlyProfitClose.findMany({ where: { storeId, periodMonth }, orderBy: { version: 'desc' } });
  }

  async generateMemberLiabilitySnapshot(
    storeIdInput: number | string,
    snapshotDateInput: string,
    context: OperationFinanceContext,
  ) {
    const storeId = this.asOptionalStoreId(storeIdInput);
    if (!storeId) throw new BadRequestException('缺少门店 ID');
    this.assertStoreAccess(storeId, context);
    const snapshotDate = new Date(`${snapshotDateInput}T00:00:00.000Z`);
    if (Number.isNaN(snapshotDate.getTime())) throw new BadRequestException('快照日期格式不正确');
    const [liability, latest] = await Promise.all([
      this.getPrepaidLiabilities({ storeId, page: 1, pageSize: 100000 }),
      this.prisma.memberLiabilitySnapshot.findFirst({ where: { storeId, snapshotDate }, orderBy: { version: 'desc' } }),
    ]);
    if (latest?.status === 'confirmed') throw new ConflictException('已确认会员负债快照不可覆盖');
    const monthStart = new Date(Date.UTC(snapshotDate.getUTCFullYear(), snapshotDate.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(snapshotDate.getUTCFullYear(), snapshotDate.getUTCMonth() + 1, 1));
    const transactions = await this.prisma.customerBalanceTransaction.findMany({
      where: { storeId, createdAt: { gte: monthStart, lt: monthEnd } },
      select: { type: true, amount: true, giftAmount: true },
    });
    const movement = (types: string[]) => transactions
      .filter((item: any) => types.includes(String(item.type)))
      .reduce((sum: number, item: any) => sum + Math.abs(this.toNumber(item.amount)) + Math.abs(this.toNumber(item.giftAmount)), 0);
    const data = {
      storeId,
      snapshotDate,
      version: latest?.status === 'draft' ? latest.version : this.toNumber(latest?.version) + 1 || 1,
      cashContractLiability: this.toNumber(liability.summary.cashBalance),
      giftObligation: this.toNumber(liability.summary.giftBalance),
      cardLiability: this.toNumber(liability.summary.cardLiability),
      remainingTimes: this.toNumber(liability.summary.remainingTimes),
      additions: movement(['recharge', '充值', 'member_recharge']),
      releases: movement(['consume', 'deduct', '消费']),
      refunds: movement(['refund', '退款', 'refund_restore']),
      expirations: movement(['expired', 'expire']),
      adjustments: movement(['adjust', 'adjustment', 'gift']),
      sourceSummary: { summary: liability.summary, rowCount: liability.total },
      status: 'draft',
    };
    const snapshot = latest?.status === 'draft'
      ? await this.prisma.memberLiabilitySnapshot.update({ where: { id: latest.id }, data })
      : await this.prisma.memberLiabilitySnapshot.create({ data });
    await this.writeFinanceAudit({ storeId, userId: context.userId, action: 'member_liability_snapshot_generated', entityType: 'MemberLiabilitySnapshot', entityId: snapshot.id, afterPayload: { snapshotDate: snapshotDateInput, version: snapshot.version } });
    return snapshot;
  }

  async confirmMemberLiabilitySnapshot(id: number, context: OperationFinanceContext) {
    const snapshot = await this.prisma.memberLiabilitySnapshot.findUnique({ where: { id } });
    if (!snapshot) throw new NotFoundException('会员负债快照不存在');
    this.assertStoreAccess(this.toNumber(snapshot.storeId), context);
    if (snapshot.status !== 'draft') throw new ConflictException('只有草稿会员负债快照可以确认');
    const confirmedAt = new Date();
    const updated = await this.prisma.memberLiabilitySnapshot.update({ where: { id }, data: { status: 'confirmed', confirmedBy: context.userId, confirmedAt } });
    await this.writeFinanceAudit({ storeId: snapshot.storeId, userId: context.userId, action: 'member_liability_snapshot_confirmed', entityType: 'MemberLiabilitySnapshot', entityId: id, afterPayload: { confirmedAt } });
    return updated;
  }

  private buildCostMap(costs: any[]) {
    const costMap = new Map<CostBreakdownKey, number>();
    for (const cost of costs) {
      const category = String(cost.category || 'other') as CostBreakdownKey;
      this.increment(costMap, category, this.toNumber(cost.amount));
    }
    return costMap;
  }

  private async getServiceMaterialCost(range: DateRange, storeId?: number) {
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        movementType: { in: ['service_consume', 'service_consumption'] },
        occurredAt: { gte: range.from, lte: range.to },
      },
      select: { productId: true, sourceType: true, sourceId: true, quantity: true, costAmount: true, remark: true, product: { select: { costPrice: true } } },
    });
    return movements.reduce((sum, movement) => {
      const snapshotCost = this.toNumber(movement.costAmount);
      if (snapshotCost > 0) return sum + snapshotCost;
      return sum + Math.abs(this.toNumber(movement.quantity)) * this.toNumber(movement.product?.costPrice);
    }, 0);
  }

  private async getProductCostFromItems(orderItems: any[], storeId?: number) {
    const productIds = Array.from(
      new Set(orderItems.filter((item) => this.isProductItem(item.itemType) && item.itemId).map((item) => Number(item.itemId))),
    );
    if (!productIds.length) return { cost: 0, missingCostCount: 0 };
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, ...(storeId ? { storeId } : {}) },
      select: { id: true, costPrice: true },
    });
    const productCostById = new Map(products.map((product) => [product.id, this.toNumber(product.costPrice)]));
    return orderItems.reduce(
      (summary, item) => {
        if (!this.isProductItem(item.itemType) || !item.itemId) return summary;
        const resolved = this.resolveProductItemCost(item, productCostById, new Map());
        summary.cost += resolved.costAmount;
        if (resolved.source === 'missing') summary.missingCostCount += 1;
        return summary;
      },
      { cost: 0, missingCostCount: 0 },
    );
  }

  private resolveProductItemCost(item: any, productCostById: Map<number, number>, movementCostByOrderProduct: Map<string, ProductMovementCost>) {
    const quantity = this.toNumber(item.quantity || 1) || 1;
    const productId = Number(item.itemId);
    const movementCost = movementCostByOrderProduct.get(`${item.orderId}:${productId}`);
    if (movementCost && movementCost.costAmount > 0) return movementCost;

    const snapshotUnitCost = this.getPayloadNumber(item.payload, ['costPrice', 'unitCost', 'productCostPrice']);
    const snapshotCostAmount = this.getPayloadNumber(item.payload, ['costAmount', 'productCostAmount']);
    if (snapshotCostAmount !== undefined) {
      return {
        unitCost: quantity > 0 ? snapshotCostAmount / quantity : snapshotCostAmount,
        costAmount: snapshotCostAmount,
        source: 'order_snapshot' as ProductCostSource,
      };
    }
    if (snapshotUnitCost !== undefined) {
      return {
        unitCost: snapshotUnitCost,
        costAmount: snapshotUnitCost * quantity,
        source: 'order_snapshot' as ProductCostSource,
      };
    }

    const masterUnitCost = this.toNumber(productCostById.get(productId));
    if (masterUnitCost > 0) {
      return {
        unitCost: masterUnitCost,
        costAmount: masterUnitCost * quantity,
        source: 'product_master_estimate' as ProductCostSource,
      };
    }

    return { unitCost: 0, costAmount: 0, source: 'missing' as ProductCostSource };
  }

  private resolveMovementMaterialCost(movement: any) {
    const snapshotCost = this.toNumber(movement.costAmount);
    if (snapshotCost > 0) return snapshotCost;
    return Math.abs(this.toNumber(movement.quantity)) * this.toNumber(movement.product?.costPrice);
  }

  private buildProductMovementCostMap(movements: any[]) {
    const map = new Map<string, ProductMovementCost>();
    for (const movement of movements) {
      const sourceId = Number(movement.sourceId);
      const productId = Number(movement.productId);
      if (!sourceId || !productId) continue;
      const quantity = Math.abs(this.toNumber(movement.quantity)) || 1;
      const snapshotAmount = this.toNumber(movement.costAmount);
      const unitCost = this.toNumber(movement.unitCost) || (quantity > 0 ? snapshotAmount / quantity : 0);
      if (snapshotAmount > 0) {
        map.set(`${sourceId}:${productId}`, {
          unitCost,
          costAmount: snapshotAmount,
          source: 'batch_snapshot',
          sourceNo: movement.sourceNo,
        });
        continue;
      }
      const fallbackUnitCost = this.toNumber(movement.product?.costPrice);
      if (fallbackUnitCost > 0) {
        map.set(`${sourceId}:${productId}`, {
          unitCost: fallbackUnitCost,
          costAmount: fallbackUnitCost * quantity,
          source: 'legacy_missing_snapshot',
          sourceNo: movement.sourceNo,
        });
      }
    }
    return map;
  }

  private movementBelongsToProject(movement: any, project: any) {
    const bomProductIds = new Set((project.bomItems ?? []).map((item: any) => Number(item.productId)).filter(Boolean));
    if (bomProductIds.size > 0 && !bomProductIds.has(Number(movement.productId))) return false;

    const remark = String(movement.remark ?? '').trim();
    if (remark && project.name && !remark.includes(project.name)) return false;

    return true;
  }

  private async getCommissionCostForPerformance(
    orderItemIds: number[],
    storeId?: number,
    params?: { staffUserId?: number | null; beauticianId?: number | null },
    cardUsageRecordIds: number[] = [],
  ) {
    if (!orderItemIds.length && !cardUsageRecordIds.length) return 0;
    const staffUserId = this.toNumber(params?.staffUserId);
    const beauticianId = this.toNumber(params?.beauticianId);
    const sourceFilters: any[] = [];
    if (cardUsageRecordIds.length) {
      if (orderItemIds.length) sourceFilters.push({ orderItemId: { in: orderItemIds } });
      sourceFilters.push({ cardUsageRecordId: { in: cardUsageRecordIds } });
      sourceFilters.push({ sourceType: 'card_usage', sourceId: { in: cardUsageRecordIds } });
    }
    const result = await this.prisma.commissionRecord.aggregate({
      where: {
        ...(storeId ? { storeId } : {}),
        ...(cardUsageRecordIds.length ? { OR: sourceFilters } : { orderItemId: { in: orderItemIds } }),
        type: { in: ['project', 'product'] },
        ...(staffUserId > 0 ? { staffUserId } : beauticianId > 0 ? { beauticianId } : {}),
        status: { not: 'cancelled' },
      },
      _sum: { amount: true },
    });
    return this.toNumber(result._sum.amount);
  }

  private async getCommissionCostForOrderItems(orderItemIds: number[], storeId?: number, cardUsageRecordIds: number[] = []) {
    if (!orderItemIds.length && !cardUsageRecordIds.length) return 0;
    const sourceFilters: any[] = [];
    if (cardUsageRecordIds.length) {
      if (orderItemIds.length) sourceFilters.push({ orderItemId: { in: orderItemIds } });
      sourceFilters.push({ cardUsageRecordId: { in: cardUsageRecordIds } });
      sourceFilters.push({ sourceType: 'card_usage', sourceId: { in: cardUsageRecordIds } });
    }
    const result = await this.prisma.commissionRecord.aggregate({
      where: {
        ...(storeId ? { storeId } : {}),
        ...(cardUsageRecordIds.length ? { OR: sourceFilters } : { orderItemId: { in: orderItemIds } }),
        type: { in: ['project', 'product'] },
        status: { not: 'cancelled' },
      },
      _sum: { amount: true },
    });
    return this.toNumber(result._sum.amount);
  }

  private async getPerformanceCommissionRecords(orderItemIds: number[], cardUsageRecordIds: number[], storeId?: number) {
    if (!orderItemIds.length && !cardUsageRecordIds.length) return [];
    const sourceFilters: any[] = [];
    if (orderItemIds.length) sourceFilters.push({ orderItemId: { in: orderItemIds } });
    if (cardUsageRecordIds.length) {
      sourceFilters.push({ cardUsageRecordId: { in: cardUsageRecordIds } });
      sourceFilters.push({ sourceType: 'card_usage', sourceId: { in: cardUsageRecordIds } });
    }
    const records = await this.prisma.commissionRecord.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        OR: sourceFilters,
        type: { in: ['project', 'product'] },
        status: { not: 'cancelled' },
      },
      select: {
        staffUserId: true,
        beauticianId: true,
        orderItemId: true,
        cardUsageRecordId: true,
        sourceType: true,
        sourceId: true,
        amount: true,
      },
    });
    return Array.isArray(records) ? records : [];
  }

  private buildPerformanceCommissionLookup(records: any[]) {
    const lookup = new Map<string, number>();
    const add = (key: string, amount: number) => lookup.set(key, this.round(this.toNumber(lookup.get(key)) + amount));
    for (const record of records) {
      const amount = this.toNumber(record.amount);
      const staffKeys = [record.staffUserId ? `staff:${record.staffUserId}` : '', record.beauticianId ? `beautician:${record.beauticianId}` : ''].filter(Boolean);
      for (const staffKey of staffKeys) {
        if (record.orderItemId) add(`${staffKey}:orderItem:${record.orderItemId}`, amount);
        if (record.cardUsageRecordId) add(`${staffKey}:cardUsage:${record.cardUsageRecordId}`, amount);
        if (record.sourceType === 'card_usage' && record.sourceId) add(`${staffKey}:cardUsage:${record.sourceId}`, amount);
      }
    }
    return lookup;
  }

  private getPerformanceCommissionAmount(lookup: Map<string, number>, staffUserId: number, beauticianIds: Set<number>, sourceType: 'orderItem' | 'cardUsage', sourceId: number) {
    const staffAmount = this.toNumber(lookup.get(`staff:${staffUserId}:${sourceType}:${sourceId}`));
    if (staffAmount > 0) return this.round(staffAmount);
    return this.round(Array.from(beauticianIds).reduce((sum, id) => sum + this.toNumber(lookup.get(`beautician:${id}:${sourceType}:${sourceId}`)), 0));
  }

  private async getPerformanceStaffUsers(storeId?: number, legacyBeauticianId?: number) {
    const storeFilter = storeId
      ? {
          OR: [
            { stores: { some: { storeId } } },
            { beauticianProfiles: { some: { storeId, status: 'active' } } },
          ],
        }
      : {};
    const legacyBeauticianFilter = legacyBeauticianId
      ? {
          beauticianProfiles: {
            some: {
              id: Number(legacyBeauticianId),
              status: 'active',
              ...(storeId ? { storeId } : {}),
            },
          },
        }
      : {};

    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: { in: ['active', '启用'] },
        ...storeFilter,
        ...legacyBeauticianFilter,
      },
      include: {
        stores: {
          ...(storeId ? { where: { storeId } } : {}),
          include: { store: { select: { id: true, name: true } } },
        },
        beauticianProfiles: {
          where: {
            status: 'active',
            ...(storeId ? { storeId } : {}),
            ...(legacyBeauticianId ? { id: Number(legacyBeauticianId) } : {}),
          },
          include: { store: { select: { id: true, name: true } } },
        },
      },
      orderBy: { id: 'asc' },
    });
  }

  private buildAlerts(params: {
    netMargin: number;
    operatingIncome: number;
    operatingCostMap: Map<CostBreakdownKey, number>;
    missingReasons: Set<MissingCostReason>;
    cardConsumptionRate: number;
  }): OperationAlert[] {
    const alerts: OperationAlert[] = [];
    const laborRent =
      this.toNumber(params.operatingCostMap.get('salary')) +
      this.toNumber(params.operatingCostMap.get('commission')) +
      this.toNumber(params.operatingCostMap.get('rent'));

    if (params.operatingIncome > 0 && params.netMargin < 0.08) {
      alerts.push({
        key: 'low_net_margin',
        level: 'critical',
        title: '经营净利率偏低',
        detail: `当前净利率 ${(params.netMargin * 100).toFixed(1)}%，建议优先查看成本结构和项目毛利。`,
        action: '查看项目毛利',
        path: '/operation-profit/project-margins',
      });
    }

    if (params.operatingIncome > 0 && laborRent / params.operatingIncome > 0.55) {
      alerts.push({
        key: 'labor_rent_high',
        level: 'warning',
        title: '人工与房租占比偏高',
        detail: '人工、提成和房租合计超过经营收入 55%，会显著压低净利。',
        action: '查看成本配置',
        path: '/operation-profit/costs',
      });
    }

    if (params.missingReasons.has('missing_cost')) {
      alerts.push({
        key: 'missing_cost',
        level: 'warning',
        title: '本期经营成本未录完整',
        detail: '缺少工资、房租、营销或折旧等成本时，利润只能作为预估。',
        action: '补录经营成本',
        path: '/operation-profit/costs',
      });
    }

    if (params.missingReasons.has('missing_bom')) {
      alerts.push({
        key: 'missing_bom',
        level: 'warning',
        title: '存在项目未配置 BOM',
        detail: '项目耗材成本缺失会影响项目毛利和总毛利判断。',
        action: '维护项目耗材',
        path: '/inventory/consumption',
      });
    }

    if (params.cardConsumptionRate > 0 && params.cardConsumptionRate < 0.2) {
      alerts.push({
        key: 'low_card_consumption',
        level: 'info',
        title: '会员卡消课速度偏慢',
        detail: '本期消课价值偏低，建议查看临期和沉睡会员卡。',
        action: '查看会员卡履约',
        path: '/operation-profit/prepaid-liabilities',
      });
    }

    return alerts;
  }

  async getOverview(query: QueryOperationProfitDto, headerStoreId?: string) {
    const storeId = this.asOptionalStoreId(query.storeId ?? headerStoreId);
    const range = this.parseDateRange(query.from, query.to);
    const [orders, cardUsageRecords, costs, cardUnitValueByName, financeMetrics] = await Promise.all([
      this.getOrders(range, storeId),
      this.getCardUsageRecords(range, storeId),
      this.getOperatingCosts(range, storeId),
      this.getCardUnitValueByName(),
      this.financeMetricsService
        ? this.financeMetricsService.getDailyMetrics({
            dateFrom: query.from,
            dateTo: query.to,
            storeId,
          })
        : Promise.resolve(null),
    ]);

    const allOrderItems = orders.flatMap((order) => order.orderItems.map((item) => ({ ...item, order })));
    const paidOrders = orders.filter((order) => this.isPaidOrder(order.status));
    const refunds = paidOrders.flatMap((order) => order.refundRecords ?? []);
    const refundAmount = refunds
      .filter((refund) => ['completed', 'success', 'paid', 'refunded'].includes(String(refund.status)))
      .reduce((sum, refund) => sum + this.toNumber(refund.amount), 0);

    const singleServiceIncome = allOrderItems
      .filter((item) => this.isServiceItem(item.itemType))
      .reduce((sum, item) => sum + Math.max(0, this.getItemNetAmount(item) - this.getRefundShare(item)), 0);
    const productSales = allOrderItems
      .filter((item) => this.isProductItem(item.itemType))
      .reduce((sum, item) => sum + Math.max(0, this.getItemNetAmount(item) - this.getRefundShare(item)), 0);
    const cardSales = allOrderItems.filter((item) => this.isCardSaleItem(item.itemType)).reduce((sum, item) => sum + this.getItemNetAmount(item), 0);
    const rechargeFromItems = allOrderItems.filter((item) => this.isRechargeItem(item.itemType)).reduce((sum, item) => sum + this.getItemNetAmount(item), 0);
    const rechargeFromBalance = await this.prisma.customerBalanceTransaction.aggregate({
      where: {
        ...(storeId ? { storeId } : {}),
        type: { in: ['recharge', '充值', 'member_recharge'] },
        createdAt: { gte: range.from, lte: range.to },
      },
      _sum: { amount: true },
    });
    const rechargeIncome = Math.max(rechargeFromItems, this.toNumber(rechargeFromBalance._sum.amount));

    const missingReasons = new Set<MissingCostReason>();
    const cardConsumptionIncome = cardUsageRecords.reduce(
      (sum, record) => sum + this.getCardUsageRecognizedAmount(record, cardUnitValueByName, missingReasons),
      0,
    );

    const cashIncome = paidOrders.reduce((sum, order) => sum + this.toNumber(order.totalAmount), 0) + rechargeIncome - refundAmount;
    const operatingIncome = singleServiceIncome + cardConsumptionIncome + productSales;
    const operatingOrderItemIds = allOrderItems
      .filter((item) => this.isServiceItem(item.itemType) || this.isProductItem(item.itemType))
      .map((item) => Number(item.id))
      .filter(Boolean);
    const cardUsageRecordIds = cardUsageRecords.map((record) => Number(record.id)).filter(Boolean);
    const [actualMaterialCost, productCostSummary, commissionCost] = await Promise.all([
      this.getServiceMaterialCost(range, storeId),
      this.getProductCostFromItems(allOrderItems, storeId),
      this.getCommissionCostForOrderItems(operatingOrderItemIds, storeId, cardUsageRecordIds),
    ]);
    const productCost = productCostSummary.cost;

    if (operatingIncome > 0 && actualMaterialCost <= 0) missingReasons.add('missing_actual_consumption');
    if (productSales > 0 && productCostSummary.missingCostCount > 0) missingReasons.add('missing_cost');
    if (operatingIncome > 0 && commissionCost <= 0) missingReasons.add('missing_commission');
    const operatingCostMap = this.buildCostMap(costs);
    const requiredCostCategories: CostBreakdownKey[] = ['rent', 'salary', 'marketing', 'utilities', 'depreciation'];
    if (requiredCostCategories.some((category) => !operatingCostMap.has(category))) missingReasons.add('missing_cost');

    const operatingCostTotal = Array.from(operatingCostMap.values()).reduce((sum, value) => sum + value, 0);
    const grossProfit = operatingIncome - actualMaterialCost - productCost - commissionCost;
    const operatingProfit = grossProfit - operatingCostTotal;
    const grossMargin = operatingIncome > 0 ? grossProfit / operatingIncome : 0;
    const netMargin = operatingIncome > 0 ? operatingProfit / operatingIncome : 0;
    const customerIds = new Set<number>();
    for (const order of paidOrders) if (order.customerId) customerIds.add(order.customerId);
    for (const record of cardUsageRecords) if (record.customerId) customerIds.add(record.customerId);
    const customerCount = customerIds.size;
    const avgTicket = customerCount > 0 ? operatingIncome / customerCount : 0;
    const prepaidAdditions = cardSales + rechargeIncome;
    const cardConsumptionRate = prepaidAdditions > 0 ? cardConsumptionIncome / prepaidAdditions : 0;
    const metricSummary = financeMetrics?.summary;
    if (metricSummary?.dataQuality?.missingReasons?.length) {
      for (const reason of metricSummary.dataQuality.missingReasons) missingReasons.add(reason as MissingCostReason);
    }
    const overviewCashIncome = metricSummary ? metricSummary.cashIncome : cashIncome;
    const overviewOperatingIncome = metricSummary ? metricSummary.operatingRevenue : operatingIncome;
    const overviewGrossProfit = metricSummary ? metricSummary.grossProfit : grossProfit;
    const overviewGrossMargin = metricSummary ? metricSummary.grossMargin : grossMargin;
    const overviewCustomerCount = metricSummary ? metricSummary.customerCount : customerCount;
    const overviewAvgTicket = metricSummary ? metricSummary.avgTicket : avgTicket;
    const overviewOperatingProfit = overviewGrossProfit - operatingCostTotal;
    const overviewNetMargin = overviewOperatingIncome > 0 ? overviewOperatingProfit / overviewOperatingIncome : 0;
    const overviewPrepaidAdditions = metricSummary ? metricSummary.prepaidAmount : prepaidAdditions;
    const overviewCardConsumptionRate =
      overviewPrepaidAdditions > 0 ? (metricSummary ? metricSummary.cardUsageRecognized : cardConsumptionIncome) / overviewPrepaidAdditions : cardConsumptionRate;

    const trendByDate = new Map<string, { date: string; cashIncome: number; operatingIncome: number; grossProfit: number; operatingProfit: number }>();
    const ensureTrend = (date: string) => {
      if (!trendByDate.has(date)) trendByDate.set(date, { date, cashIncome: 0, operatingIncome: 0, grossProfit: 0, operatingProfit: 0 });
      return trendByDate.get(date)!;
    };
    for (const order of paidOrders) {
      const row = ensureTrend(this.dateKey(order.createdAt));
      row.cashIncome += this.toNumber(order.totalAmount);
      for (const item of order.orderItems) {
        const orderItem = { ...item, order };
        if (this.isServiceItem(item.itemType) || this.isProductItem(item.itemType)) {
          row.operatingIncome += Math.max(0, this.getItemNetAmount(item) - this.getRefundShare(orderItem));
        }
      }
    }
    for (const record of cardUsageRecords) {
      const row = ensureTrend(this.dateKey(record.verifiedAt));
      row.operatingIncome += this.getCardUsageRecognizedAmount(record, cardUnitValueByName);
    }
    let trend = Array.from(trendByDate.values()).map((row) => ({
      ...row,
      grossProfit: this.round(row.operatingIncome * (grossMargin || 0)),
      operatingProfit: this.round(row.operatingIncome * (netMargin || 0)),
      cashIncome: this.round(row.cashIncome),
      operatingIncome: this.round(row.operatingIncome),
    }));
    if (financeMetrics?.items?.length) {
      const operatingCostByDate = new Map<string, number>();
      for (const cost of costs) {
        if (String(cost.allocationType) === 'store_month') {
          const [year, month] = String(cost.periodMonth).split('-').map(Number);
          const monthStart = new Date(year, month - 1, 1);
          const monthEnd = new Date(year, month, 0);
          const cursor = new Date(range.from > monthStart ? range.from : monthStart);
          cursor.setHours(0, 0, 0, 0);
          const end = new Date(range.to < monthEnd ? range.to : monthEnd);
          end.setHours(0, 0, 0, 0);
          const days = Math.max(1, this.toNumber((cost as any).allocatedDays));
          const amountPerDay = this.toNumber(cost.amount) / days;
          while (cursor <= end) {
            const key = this.dateKey(cursor);
            operatingCostByDate.set(key, this.toNumber(operatingCostByDate.get(key)) + amountPerDay);
            cursor.setDate(cursor.getDate() + 1);
          }
        } else {
          const key = this.dateKey(cost.costDate);
          operatingCostByDate.set(key, this.toNumber(operatingCostByDate.get(key)) + this.toNumber(cost.amount));
        }
      }
      trend = financeMetrics.items.map((item: any) => ({
        date: item.date,
        cashIncome: this.round(item.cashIncome),
        operatingIncome: this.round(item.operatingRevenue),
        grossProfit: this.round(item.grossProfit),
        operatingProfit: this.round(this.toNumber(item.grossProfit) - this.toNumber(operatingCostByDate.get(item.date))),
      }));
    }

    const dataQualityStatus: DataQualityStatus =
      operatingIncome <= 0 ? 'unavailable' : missingReasons.has('missing_cost') ? 'missing_cost' : missingReasons.size ? 'estimated' : 'complete';

    const readinessBlockers = Array.from(missingReasons)
      .filter((reason) => ['missing_cost', 'missing_bom', 'missing_batch_cost', 'missing_commission', 'missing_actual_consumption'].includes(reason))
      .map((code) => ({
        code,
        count: 1,
        actionPath: code === 'missing_commission' ? '/finance/staff-commission' : code === 'missing_bom' || code === 'missing_actual_consumption' ? '/inventory/consumption' : '/finance/profit',
      }));
    const readiness = operatingIncome <= 0
      ? { status: 'unavailable' as const, publishable: false, blockers: [], warnings: [] }
      : { status: readinessBlockers.length ? 'blocked' as const : 'ready' as const, publishable: readinessBlockers.length === 0, blockers: readinessBlockers, warnings: [] };

    return {
      period: { from: query.from, to: query.to },
      basis: query.basis ?? 'operating',
      summary: {
        cashIncome: this.round(overviewCashIncome),
        operatingIncome: this.round(overviewOperatingIncome),
        grossProfit: this.round(overviewGrossProfit),
        operatingProfit: this.round(overviewOperatingProfit),
        grossMargin: this.round(overviewGrossMargin, 4),
        netMargin: this.round(overviewNetMargin, 4),
        customerCount: overviewCustomerCount,
        avgTicket: this.round(overviewAvgTicket),
        cardConsumptionRate: this.round(overviewCardConsumptionRate, 4),
      },
      incomeBreakdown: [
        { key: 'single_service', label: '单次服务收入', amount: this.round(singleServiceIncome) },
        {
          key: 'card_consumption',
          label: '次卡履约收入',
          amount: this.round(cardConsumptionIncome),
          estimated: missingReasons.has('missing_card_unit_value'),
        },
        { key: 'product_sales', label: '产品销售收入', amount: this.round(productSales) },
        { key: 'card_sales', label: '办卡现金流', amount: this.round(cardSales), cashOnly: true },
        { key: 'recharge', label: '充值现金流', amount: this.round(rechargeIncome), cashOnly: true },
        { key: 'refund', label: '退款金额', amount: this.round(refundAmount) },
      ],
      costBreakdown: [
        { key: 'material', label: '服务耗材成本', amount: this.round(actualMaterialCost), estimated: missingReasons.has('missing_actual_consumption') },
        { key: 'product', label: '商品成本', amount: this.round(productCost) },
        { key: 'commission', label: '直接提成', amount: this.round(commissionCost), estimated: missingReasons.has('missing_commission') },
        ...Array.from(operatingCostMap.entries()).map(([key, amount]) => ({ key, label: this.costLabel(key), amount: this.round(amount) })),
      ],
      trend,
      alerts: this.buildAlerts({ netMargin, operatingIncome, operatingCostMap, missingReasons, cardConsumptionRate }),
      dataQuality: this.addDataQuality(missingReasons, dataQualityStatus, this.dataQualityDetail(dataQualityStatus)),
      readiness,
    };
  }

  private costLabel(key: string) {
    const labels: Record<string, string> = {
      rent: '房租物业',
      salary: '固定工资',
      commission: '提成成本',
      marketing: '营销成本',
      utilities: '水电杂费',
      depreciation: '折旧摊销',
      supplies_adjustment: '耗材调整',
      other: '其他费用',
    };
    return labels[key] || key;
  }

  private dataQualityDetail(status: DataQualityStatus) {
    const map: Record<DataQualityStatus, string> = {
      complete: '订单、成本、BOM 和提成都有可用数据。',
      estimated: '部分指标包含估算，请结合缺失原因判断。',
      missing_cost: '本期存在未录入的经营成本，利润为预估值。',
      missing_bom: '部分项目缺少 BOM，项目毛利不完整。',
      missing_commission: '提成数据缺失，贡献毛利可能偏高。',
      unavailable: '核心收入数据不足，暂不可计算。',
    };
    return map[status];
  }

  async getProductMargins(query: QueryProductMarginsDto, headerStoreId?: string) {
    const storeId = this.asOptionalStoreId(query.storeId ?? headerStoreId);
    const range = this.parseDateRange(query.from, query.to);
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const sortBy = query.sortBy ?? 'grossProfit';
    const orders = await this.getOrders(range, storeId);
    const productOrderItems = orders.flatMap((order) =>
      order.orderItems
        .filter((item) => this.isProductItem(item.itemType))
        .map((item) => ({
          ...item,
          order,
          orderId: order.id,
          orderNo: order.orderNo,
        })),
    );

    const productIds = Array.from(new Set(productOrderItems.filter((item) => item.itemId).map((item) => Number(item.itemId))));
    if (!productIds.length) return { items: [], data: [], total: 0, page, pageSize };

    const [products, commissionRecords, stockMovements] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          id: { in: productIds },
          ...(storeId ? { storeId } : {}),
          ...(query.categoryId ? { categoryId: Number(query.categoryId) } : {}),
          ...(query.keyword
            ? {
                OR: [
                  { name: { contains: query.keyword, mode: 'insensitive' } },
                  { sku: { contains: query.keyword, mode: 'insensitive' } },
                  { brand: { contains: query.keyword, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        include: { category: { select: { id: true, name: true } } },
      }),
      this.prisma.commissionRecord.findMany({
        where: {
          ...(storeId ? { storeId } : {}),
          orderItemId: { in: productOrderItems.map((item) => item.id) },
          type: 'product',
          status: { not: 'cancelled' },
        },
      }),
      this.prisma.stockMovement.findMany({
        where: {
          ...(storeId ? { storeId } : {}),
          productId: { in: productIds },
          movementType: 'sale_out',
          sourceType: 'product_order',
          sourceId: { in: orders.map((order) => order.id) },
          occurredAt: { gte: range.from, lte: range.to },
        },
        select: { productId: true, sourceId: true, sourceNo: true, quantity: true, unitCost: true, costAmount: true, costSource: true, product: { select: { costPrice: true } } },
      }),
    ]);

    const allowedProductIds = new Set(products.map((product) => product.id));
    const productById = new Map(products.map((product) => [product.id, product]));
    const productCostById = new Map(products.map((product) => [product.id, this.toNumber(product.costPrice)]));
    const movementCostByOrderProduct = this.buildProductMovementCostMap(stockMovements);
    const commissionByOrderItemId = new Map<number, number>();
    for (const record of commissionRecords) {
      if (!record.orderItemId) continue;
      this.increment(commissionByOrderItemId, record.orderItemId, this.toNumber(record.amount));
    }

    const rowsByProduct = new Map<number, any>();
    for (const item of productOrderItems) {
      const productId = Number(item.itemId);
      if (!allowedProductIds.has(productId)) continue;
      const product = productById.get(productId);
      const quantity = this.toNumber(item.quantity || 1) || 1;
      const salesAmount = this.getItemNetAmount(item);
      const listAmount = this.getItemListAmount(item);
      const refundAmount = this.getRefundShare(item);
      const cost = this.resolveProductItemCost(item, productCostById, movementCostByOrderProduct);
      const commissionCost = this.toNumber(commissionByOrderItemId.get(item.id));
      const current =
        rowsByProduct.get(productId) ??
        {
          productId,
          productName: product?.name ?? item.name ?? '',
          sku: product?.sku ?? '',
          categoryId: product?.categoryId,
          categoryName: product?.category?.name,
          brand: product?.brand,
          retailPrice: this.toNumber(product?.retailPrice),
          quantitySold: 0,
          listAmount: 0,
          salesAmount: 0,
          discountAmount: 0,
          refundAmount: 0,
          netSalesAmount: 0,
          productCost: 0,
          commissionCost: 0,
          sourceSet: new Set<ProductCostSource>(),
          missingCostReasons: new Set<MissingCostReason>(),
        };

      current.quantitySold += quantity;
      current.listAmount += listAmount;
      current.salesAmount += salesAmount;
      current.discountAmount += Math.max(0, listAmount - salesAmount);
      current.refundAmount += refundAmount;
      current.netSalesAmount += Math.max(0, salesAmount - refundAmount);
      current.productCost += cost.costAmount;
      current.commissionCost += commissionCost;
      current.sourceSet.add(cost.source);
      current.orderIds ??= new Set<number>();
      current.orderIds.add(item.orderId);
      current.sourceOrderById ??= new Map<number, any>();
      const sourceOrder = current.sourceOrderById.get(item.orderId) ?? {
        orderId: item.orderId,
        orderNo: item.orderNo,
        orderItemId: item.id,
        orderedAt: item.order?.createdAt ? formatBusinessDate(item.order.createdAt) : undefined,
        customerName: item.order?.customerName ?? '散客',
        quantity: 0,
        listAmount: 0,
        salesAmount: 0,
        discountAmount: 0,
        refundAmount: 0,
        netSalesAmount: 0,
        productCost: 0,
        costSource: cost.source,
        costSourceNo: cost.sourceNo,
        commissionCost: 0,
      };
      sourceOrder.quantity += quantity;
      sourceOrder.listAmount += listAmount;
      sourceOrder.salesAmount += salesAmount;
      sourceOrder.discountAmount += Math.max(0, listAmount - salesAmount);
      sourceOrder.refundAmount += refundAmount;
      sourceOrder.netSalesAmount += Math.max(0, salesAmount - refundAmount);
      sourceOrder.productCost += cost.costAmount;
      sourceOrder.unitCost = sourceOrder.quantity > 0 ? sourceOrder.productCost / sourceOrder.quantity : cost.unitCost;
      if (sourceOrder.costSource !== cost.source) sourceOrder.costSource = 'mixed';
      sourceOrder.costSourceNo = sourceOrder.costSourceNo || cost.sourceNo;
      sourceOrder.commissionCost += commissionCost;
      current.sourceOrderById.set(item.orderId, sourceOrder);
      if (cost.source === 'missing') current.missingCostReasons.add('missing_batch_cost');
      if (cost.source === 'product_master_estimate') current.missingCostReasons.add('product_master_estimate');
      if (cost.source === 'legacy_missing_snapshot') current.missingCostReasons.add('legacy_missing_snapshot');
      if (salesAmount > 0 && commissionCost <= 0) current.missingCostReasons.add('missing_commission');
      rowsByProduct.set(productId, current);
    }

    const rows = Array.from(rowsByProduct.values()).map((row) => {
      const grossProfit = row.netSalesAmount - row.productCost - row.commissionCost;
      const marginRate = row.netSalesAmount > 0 ? grossProfit / row.netSalesAmount : 0;
      const costSources = Array.from(row.sourceSet) as ProductCostSource[];
      const costSource: ProductCostSource = costSources.length === 1 ? costSources[0] : costSources.includes('missing') ? 'missing' : 'mixed';
      const status =
        row.missingCostReasons.size > 0
          ? 'cost_missing'
          : grossProfit < 0
            ? 'loss'
            : marginRate < 0.3
              ? 'low_margin'
              : marginRate >= 0.5
                ? 'high_profit'
                : 'normal';

      return {
        productId: row.productId,
        productName: row.productName,
        sku: row.sku,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        brand: row.brand,
        quantitySold: this.round(row.quantitySold),
        listAmount: this.round(row.listAmount),
        salesAmount: this.round(row.salesAmount),
        discountAmount: this.round(row.discountAmount),
        refundAmount: this.round(row.refundAmount),
        netSalesAmount: this.round(row.netSalesAmount),
        unitCost: row.quantitySold > 0 ? this.round(row.productCost / row.quantitySold) : 0,
        costSource,
        productCost: this.round(row.productCost),
        commissionCost: this.round(row.commissionCost),
        grossProfit: this.round(grossProfit),
        marginRate: this.round(marginRate, 4),
        avgDealPrice: row.quantitySold > 0 ? this.round(row.netSalesAmount / row.quantitySold) : 0,
        retailPrice: this.round(row.retailPrice),
        orderCount: row.orderIds?.size ?? 0,
        sourceOrders: Array.from(row.sourceOrderById?.values() ?? [])
          .map((source: any) => ({
            ...source,
            quantity: this.round(source.quantity),
            listAmount: this.round(source.listAmount),
            salesAmount: this.round(source.salesAmount),
            discountAmount: this.round(source.discountAmount),
            refundAmount: this.round(source.refundAmount),
            netSalesAmount: this.round(source.netSalesAmount),
            unitCost: this.round(source.unitCost),
            productCost: this.round(source.productCost),
            costSource: source.costSource,
            costSourceNo: source.costSourceNo,
            commissionCost: this.round(source.commissionCost),
          }))
          .sort((a: any, b: any) => String(b.orderedAt ?? '').localeCompare(String(a.orderedAt ?? '')) || Number(b.orderId) - Number(a.orderId))
          .slice(0, 50),
        status,
        missingCostReasons: Array.from(row.missingCostReasons),
      };
    });

    const filtered = query.status ? rows.filter((row) => row.status === query.status) : rows;
    const sorted = filtered.sort((a, b) => {
      if (sortBy === 'quantity') return b.quantitySold - a.quantitySold;
      if (sortBy === 'salesAmount') return b.netSalesAmount - a.netSalesAmount;
      if (sortBy === 'marginRate') return b.marginRate - a.marginRate;
      return b.grossProfit - a.grossProfit;
    });
    const items = sorted.slice((page - 1) * pageSize, page * pageSize);
    return { items, data: items, total: sorted.length, page, pageSize };
  }

  async getProjectMargins(query: QueryProjectMarginsDto, headerStoreId?: string) {
    const storeId = this.asOptionalStoreId(query.storeId ?? headerStoreId);
    const range = this.parseDateRange(query.from, query.to);
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const where: any = { deletedAt: null };
    if (storeId) where.storeId = storeId;

    const [projects, allProjectIds, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: { type: true, bomItems: { include: { product: { select: { id: true, name: true, costPrice: true, unit: true, specUnit: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.project.findMany({
        where,
        select: { id: true },
      }),
      this.prisma.project.count({ where }),
    ]);

    const [orders, cardUsageRecords, cardUnitValueByName] = await Promise.all([
      this.getOrders(range, storeId),
      this.getCardUsageRecords(range, storeId),
      this.getCardUnitValueByName(),
    ]);
    const orderItems = orders.flatMap((order) => order.orderItems.map((item) => ({ ...item, order, orderId: order.id, orderNo: order.orderNo })));
    const allProjectIdSet = new Set(allProjectIds.map((project) => project.id));
    const missingProjectOrderItems = orderItems.filter((item) => this.isServiceItem(item.itemType) && item.itemId && !allProjectIdSet.has(Number(item.itemId)));
    const projectOrderItemIds = orderItems
      .filter((item) => this.isServiceItem(item.itemType) && item.itemId)
      .map((item) => Number(item.id))
      .filter(Boolean);
    const cardUsageRecordIds = cardUsageRecords.map((record) => Number(record.id)).filter(Boolean);
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        movementType: { in: ['service_consume', 'service_consumption'] },
        occurredAt: { gte: range.from, lte: range.to },
        sourceType: { in: ['project_order', 'card_usage', 'service_task'] },
      },
      include: { product: { select: { id: true, name: true, costPrice: true } } },
    });
    const commissionSourceWhere = cardUsageRecordIds.length
      ? [
          ...(projectOrderItemIds.length ? [{ orderItemId: { in: projectOrderItemIds } }] : []),
          { cardUsageRecordId: { in: cardUsageRecordIds } },
          { sourceType: 'card_usage', sourceId: { in: cardUsageRecordIds } },
        ]
      : [];
    const commissionRecords = projectOrderItemIds.length || commissionSourceWhere.length
      ? await this.prisma.commissionRecord.findMany({
          where: {
            ...(storeId ? { storeId } : {}),
            ...(cardUsageRecordIds.length ? { OR: commissionSourceWhere } : { orderItemId: { in: projectOrderItemIds } }),
            type: 'project',
            status: { not: 'cancelled' },
          },
        })
      : [];

    const rows = projects.map((project) => {
      const missingReasons = new Set<MissingCostReason>();
      const projectOrderItems = orderItems.filter((item) => this.isServiceItem(item.itemType) && Number(item.itemId) === project.id);
      const orderServiceIncome = projectOrderItems.reduce(
        (sum, item) => sum + Math.max(0, this.getItemNetAmount(item) - this.getRefundShare(item)),
        0,
      );
      const orderServiceCount = projectOrderItems.reduce((sum, item) => sum + (this.toNumber(item.quantity) || 1), 0);
      const projectCardUsage = cardUsageRecords.filter((record) => this.toNumber(record.projectId) === project.id || record.projectName === project.name);
      const cardConsumptionIncome = projectCardUsage.reduce(
        (sum, record) => sum + this.getCardUsageRecognizedAmount(record, cardUnitValueByName, missingReasons),
        0,
      );
      const cardServiceCount = projectCardUsage.reduce((sum, record) => sum + this.toNumber(record.times || 1), 0);
      const serviceCount = orderServiceCount + cardServiceCount;
      const serviceIncome = orderServiceIncome + cardConsumptionIncome;
      if (!project.bomItems.length && serviceCount > 0) missingReasons.add('missing_bom');
      const standardMaterialCost =
        project.bomItems.reduce((sum, item) => sum + this.toNumber(item.standardQty) * this.toNumber(item.product?.costPrice), 0) * serviceCount;
      const orderIds = new Set(projectOrderItems.map((item) => Number(item.orderId)));
      const cardUsageIds = new Set(projectCardUsage.map((record) => Number(record.id)));
      const orderMaterialCost = movements.reduce((sum, movement) => {
        if (movement.sourceType === 'project_order' && !orderIds.has(Number(movement.sourceId))) return sum;
        if (movement.sourceType !== 'project_order') return sum;
        if (!this.movementBelongsToProject(movement, project)) return sum;
        return sum + this.resolveMovementMaterialCost(movement);
      }, 0);
      const cardUsageMaterialCost = movements.reduce((sum, movement) => {
        if (movement.sourceType === 'card_usage' && !cardUsageIds.has(Number(movement.sourceId))) return sum;
        if (movement.sourceType !== 'card_usage') return sum;
        if (!this.movementBelongsToProject(movement, project)) return sum;
        return sum + this.resolveMovementMaterialCost(movement);
      }, 0);
      const actualMaterialCost = orderMaterialCost + cardUsageMaterialCost;
      if (serviceCount > 0 && actualMaterialCost <= 0) missingReasons.add('missing_actual_consumption');
      const orderCommissionCost = commissionRecords
        .filter((record) => projectOrderItems.some((item) => item.id === record.orderItemId))
        .reduce((sum, record) => sum + this.toNumber(record.amount), 0);
      const cardUsageCommissionCost = commissionRecords
        .filter(
          (record) =>
            cardUsageIds.has(Number(record.cardUsageRecordId)) ||
            (String(record.sourceType) === 'card_usage' && cardUsageIds.has(Number(record.sourceId))),
        )
        .reduce((sum, record) => sum + this.toNumber(record.amount), 0);
      const commissionCost = orderCommissionCost + cardUsageCommissionCost;
      if (serviceIncome > 0 && commissionCost <= 0) missingReasons.add('missing_commission');
      const materialCost = actualMaterialCost > 0 ? actualMaterialCost : standardMaterialCost;
      const contributionProfit = serviceIncome - materialCost - commissionCost;
      const marginRate = serviceIncome > 0 ? contributionProfit / serviceIncome : 0;
      const standardMaterialUnitCost = project.bomItems.reduce(
        (sum, item) => sum + this.toNumber(item.standardQty) * this.toNumber(item.product?.costPrice),
        0,
      );
      const orderSourceRows = projectOrderItems.slice(0, 20).map((item) => {
        const quantity = this.toNumber(item.quantity) || 1;
        const amount = Math.max(0, this.getItemNetAmount(item) - this.getRefundShare(item));
        const itemOrderId = Number(item.orderId);
        const itemMaterialCost = movements.reduce((sum, movement) => {
          if (movement.sourceType !== 'project_order' || Number(movement.sourceId) !== itemOrderId) return sum;
          if (!this.movementBelongsToProject(movement, project)) return sum;
          return sum + this.resolveMovementMaterialCost(movement);
        }, 0);
        const materialCostForItem = itemMaterialCost > 0 ? itemMaterialCost : standardMaterialUnitCost * quantity;
        const commissionCostForItem = commissionRecords
          .filter((record) => Number(record.orderItemId) === Number(item.id))
          .reduce((sum, record) => sum + this.toNumber(record.amount), 0);
        const totalCost = materialCostForItem + commissionCostForItem;
        return {
          orderId: item.orderId,
          orderNo: item.orderNo,
          orderItemId: item.id,
          orderedAt: item.order?.createdAt ? this.dateKey(item.order.createdAt) : undefined,
          customerName: item.order?.customerName,
          quantity,
          amount: this.round(amount),
          materialCost: this.round(materialCostForItem),
          commissionCost: this.round(commissionCostForItem),
          totalCost: this.round(totalCost),
          grossProfit: this.round(amount - totalCost),
          marginRate: amount > 0 ? this.round((amount - totalCost) / amount, 4) : 0,
        };
      });
      const cardUsageSourceRows = projectCardUsage.slice(0, 20).map((record) => {
        const usageId = Number(record.id);
        const amount = this.getCardUsageRecognizedAmount(record, cardUnitValueByName);
        const materialCostForUsage = movements.reduce((sum, movement) => {
          if (movement.sourceType !== 'card_usage' || Number(movement.sourceId) !== usageId) return sum;
          if (!this.movementBelongsToProject(movement, project)) return sum;
          return sum + this.resolveMovementMaterialCost(movement);
        }, 0);
        const fallbackMaterialCost = materialCostForUsage > 0 ? materialCostForUsage : standardMaterialUnitCost * (this.toNumber(record.times) || 1);
        const commissionCostForUsage = commissionRecords
          .filter(
            (commission) =>
              Number(commission.cardUsageRecordId) === usageId ||
              (String(commission.sourceType) === 'card_usage' && Number(commission.sourceId) === usageId),
          )
          .reduce((sum, commission) => sum + this.toNumber(commission.amount), 0);
        const totalCost = fallbackMaterialCost + commissionCostForUsage;
        return {
          id: record.id,
          customerId: record.customerId,
          customerName: record.customerName,
          cardName: record.cardName,
          times: this.toNumber(record.times) || 1,
          recognizedAmount: this.round(amount),
          materialCost: this.round(fallbackMaterialCost),
          commissionCost: this.round(commissionCostForUsage),
          totalCost: this.round(totalCost),
          grossProfit: this.round(amount - totalCost),
          marginRate: amount > 0 ? this.round((amount - totalCost) / amount, 4) : 0,
          sourceOrderId: record.sourceOrderId,
          sourceOrderNo: record.sourceOrder?.orderNo,
          verifiedAt: record.verifiedAt,
        };
      });
      const status =
        missingReasons.size > 0
          ? 'cost_missing'
          : contributionProfit < 0
            ? 'loss'
            : marginRate < 0.3
              ? 'low_margin'
              : marginRate < 0.4 && serviceCount >= 3
                ? 'needs_optimization'
                : marginRate >= 0.6
                  ? 'high_profit'
                  : 'normal';
      return {
        projectId: project.id,
        projectName: project.name,
        projectType: project.type?.name,
        standardPrice: this.round(this.toNumber(project.price)),
        avgDealPrice: serviceCount > 0 ? this.round(serviceIncome / serviceCount) : 0,
        serviceCount: this.round(serviceCount),
        serviceIncome: this.round(serviceIncome),
        orderServiceIncome: this.round(orderServiceIncome),
        cardUsageIncome: this.round(cardConsumptionIncome),
        orderServiceCount: this.round(orderServiceCount),
        cardUsageCount: this.round(cardServiceCount),
        standardMaterialCost: this.round(standardMaterialCost),
        actualMaterialCost: this.round(actualMaterialCost),
        orderMaterialCost: this.round(orderMaterialCost),
        cardUsageMaterialCost: this.round(cardUsageMaterialCost),
        commissionCost: this.round(commissionCost),
        orderCommissionCost: this.round(orderCommissionCost),
        cardUsageCommissionCost: this.round(cardUsageCommissionCost),
        contributionProfit: this.round(contributionProfit),
        marginRate: this.round(marginRate, 4),
        status,
        missingCostReasons: Array.from(missingReasons),
        sourceOrders: orderSourceRows,
        sourceCardUsages: cardUsageSourceRows,
      };
    });
    const missingProjectRowMap = missingProjectOrderItems.reduce((map, item) => {
        const key = Number(item.itemId);
        const existing = map.get(key) ?? {
          projectId: key,
          projectName: item.name || `未知项目 ${key}`,
          projectType: '项目档案缺失',
          standardPrice: 0,
          avgDealPrice: 0,
          serviceCount: 0,
          serviceIncome: 0,
          standardMaterialCost: 0,
          actualMaterialCost: 0,
          commissionCost: 0,
          contributionProfit: 0,
          marginRate: 0,
          status: 'cost_missing',
          missingCostReasons: new Set<MissingCostReason>(['missing_project_master', 'missing_bom']),
        };
        const quantity = this.toNumber(item.quantity) || 1;
        const income = Math.max(0, this.getItemNetAmount(item) - this.getRefundShare(item));
        existing.serviceCount += quantity;
        existing.serviceIncome += income;
        map.set(key, existing);
        return map;
      }, new Map<number, any>());
    const missingProjectRows = Array.from(missingProjectRowMap.values()).map((row) => {
      const relatedOrderItemIds = missingProjectOrderItems.filter((item) => Number(item.itemId) === row.projectId).map((item) => Number(item.id));
      row.commissionCost = commissionRecords
        .filter((record) => relatedOrderItemIds.includes(Number(record.orderItemId)))
        .reduce((sum, record) => sum + this.toNumber(record.amount), 0);
      if (row.serviceIncome > 0 && row.commissionCost <= 0) row.missingCostReasons.add('missing_commission');
      row.avgDealPrice = row.serviceCount > 0 ? this.round(row.serviceIncome / row.serviceCount) : 0;
      row.contributionProfit = this.round(row.serviceIncome - row.commissionCost);
      row.marginRate = row.serviceIncome > 0 ? this.round(row.contributionProfit / row.serviceIncome, 4) : 0;
      return {
        ...row,
        serviceCount: this.round(row.serviceCount),
        serviceIncome: this.round(row.serviceIncome),
        commissionCost: this.round(row.commissionCost),
        missingCostReasons: Array.from(row.missingCostReasons),
      };
    });
    const sortedRows = [...rows, ...missingProjectRows].sort((a, b) => {
      const activityDelta = this.toNumber(b.serviceIncome) - this.toNumber(a.serviceIncome);
      if (activityDelta) return activityDelta;
      const countDelta = this.toNumber(b.serviceCount) - this.toNumber(a.serviceCount);
      if (countDelta) return countDelta;
      return Number(b.projectId) - Number(a.projectId);
    });
    const filtered = query.status ? sortedRows.filter((row) => row.status === query.status) : sortedRows;
    const start = (page - 1) * pageSize;
    const end = page * pageSize;
    const items = filtered.slice(start, end);
    return { items, data: items, total: filtered.length, page, pageSize };
  }

  async getPrepaidLiabilities(query: QueryPrepaidLiabilitiesDto, headerStoreId?: string) {
    const storeId = this.asOptionalStoreId(query.storeId ?? headerStoreId);
    if (query.asOfDate) {
      if (!storeId) throw new BadRequestException('历史负债查询必须指定门店');
      const asOfDate = new Date(`${query.asOfDate}T23:59:59.999Z`);
      if (Number.isNaN(asOfDate.getTime())) throw new BadRequestException('历史时点格式不正确');
      const snapshot = await this.prisma.memberLiabilitySnapshot.findFirst({
        where: { storeId, snapshotDate: { lte: asOfDate }, status: 'confirmed' },
        orderBy: [{ snapshotDate: 'desc' }, { version: 'desc' }],
      });
      if (!snapshot) throw new NotFoundException('该历史时点没有已确认会员负债快照');
      const cashBalance = this.toNumber(snapshot.cashContractLiability);
      const giftBalance = this.toNumber(snapshot.giftObligation);
      const cardLiability = this.toNumber(snapshot.cardLiability);
      return {
        items: [],
        data: [],
        total: 0,
        page: 1,
        pageSize: Number(query.pageSize ?? 20),
        snapshot,
        summary: {
          totalLiability: this.round(cashBalance + giftBalance + cardLiability),
          cardLiability: this.round(cardLiability),
          balanceLiability: this.round(cashBalance + giftBalance),
          cashBalance: this.round(cashBalance),
          giftBalance: this.round(giftBalance),
          remainingTimes: this.toNumber(snapshot.remainingTimes),
          additions: this.toNumber(snapshot.additions),
          releases: this.toNumber(snapshot.releases),
          refunds: this.toNumber(snapshot.refunds),
          expirations: this.toNumber(snapshot.expirations),
          adjustments: this.toNumber(snapshot.adjustments),
        },
      };
    }
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const type = query.type ?? 'all';
    const keyword = String(query.keyword ?? '').trim().toLowerCase();
    const where: any = { status: 'active', remainingTimes: { gt: 0 } };
    if (storeId) where.customer = { storeId };

    const cards =
      type === 'balance'
        ? []
        : await this.prisma.customerCard.findMany({
            where,
            include: {
              customer: { select: { id: true, name: true, storeId: true } },
              card: { select: { id: true, name: true, price: true, totalTimes: true } },
            },
            orderBy: { expiryDate: 'asc' },
          });
    const customerIds = Array.from(new Set(cards.map((card) => card.customerId)));
    const usageRecords = customerIds.length
      ? await this.prisma.cardUsageRecord.findMany({
          where: { OR: [{ customerCardId: { in: cards.map((card) => card.id) } }, { customerId: { in: customerIds } }] },
          orderBy: { verifiedAt: 'desc' },
        })
      : [];
    const usageByCustomerCard = new Map<string, any>();
    const cardRecognizedAmountByCardId = new Map<number, number>();
    const cardRecognizedAmountByCustomerCardKey = new Map<string, number>();
    for (const usage of usageRecords) {
      const key = `${usage.customerId}:${usage.cardName}`;
      if (!usageByCustomerCard.has(key)) usageByCustomerCard.set(key, usage);
      const amount = this.toNumber(usage.recognizedAmount);
      const customerCardId = Number(usage.customerCardId ?? 0);
      if (customerCardId > 0) {
        cardRecognizedAmountByCardId.set(customerCardId, (cardRecognizedAmountByCardId.get(customerCardId) ?? 0) + amount);
      } else {
        cardRecognizedAmountByCustomerCardKey.set(key, (cardRecognizedAmountByCustomerCardKey.get(key) ?? 0) + amount);
      }
    }

    const now = new Date();
    const cardRows = cards.map((card) => {
      const lastUsage = usageByCustomerCard.get(`${card.customerId}:${card.cardName}`) ?? usageRecords.find((usage) => usage.customerCardId === card.id);
      const totalTimes = this.toNumber(card.card?.totalTimes ?? card.totalTimes);
      const unitValue =
        this.toNumber((card as any).recognizedUnitValue) ||
        (totalTimes > 0
          ? (this.toNumber((card as any).paidAmount) || this.toNumber(card.card?.price)) / totalTimes
          : 0);
      const estimatedRemainingValue = unitValue * this.toNumber(card.remainingTimes);
      const daysToExpiry = Math.ceil((card.expiryDate.getTime() - now.getTime()) / 86400000);
      const daysSinceLastUsed = lastUsage ? Math.floor((now.getTime() - lastUsage.verifiedAt.getTime()) / 86400000) : null;
      const riskReasons: string[] = [];
      if (daysToExpiry <= 15) riskReasons.push('即将到期');
      if ((daysSinceLastUsed === null || daysSinceLastUsed >= 30) && card.remainingTimes > 0) riskReasons.push('30天未消课');
      if (estimatedRemainingValue >= 1000 || card.remainingTimes >= Math.max(5, Math.ceil(totalTimes * 0.5))) riskReasons.push('剩余权益较高');
      const riskLevel = riskReasons.length >= 2 ? 'high' : riskReasons.length === 1 ? 'medium' : 'low';
      return {
        liabilityType: 'card',
        customerId: card.customerId,
        customerName: card.customer?.name ?? '',
        customerCardId: card.id,
        cardId: card.cardId,
        cardName: card.cardName,
        totalTimes: card.totalTimes,
        remainingTimes: card.remainingTimes,
        estimatedRemainingValue: this.round(estimatedRemainingValue),
        recognizedIncome: this.round(
          (cardRecognizedAmountByCardId.get(card.id) ?? 0) +
            (cardRecognizedAmountByCustomerCardKey.get(`${card.customerId}:${card.cardName}`) ?? 0),
        ),
        expiryDate: card.expiryDate.toISOString(),
        lastUsedAt: lastUsage?.verifiedAt?.toISOString(),
        riskLevel,
        riskReasons,
      };
    });

    const balanceAccounts =
      type === 'card'
        ? []
        : await this.prisma.customerBalanceAccount.findMany({
            where: {
              status: 'active',
              ...(storeId ? { storeId } : {}),
              OR: [{ cashBalance: { gt: 0 } }, { giftBalance: { gt: 0 } }],
            },
            include: {
              customer: { select: { id: true, name: true, storeId: true } },
              transactions: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { id: true, type: true, amount: true, giftAmount: true, createdAt: true, orderId: true, order: { select: { orderNo: true } } },
              },
            },
            orderBy: { updatedAt: 'desc' },
          });

    const balanceRows = balanceAccounts.map((account) => {
      const cashBalance = this.toNumber(account.cashBalance);
      const giftBalance = this.toNumber(account.giftBalance);
      const estimatedRemainingValue = cashBalance + giftBalance;
      const lastTransaction = account.transactions?.[0];
      const riskReasons: string[] = [];
      if (estimatedRemainingValue >= 1000) riskReasons.push('储值余额较高');
      if (giftBalance > 0) riskReasons.push('含赠送余额');
      if (!lastTransaction) riskReasons.push('暂无余额流水');
      const riskLevel = estimatedRemainingValue >= 1000 ? 'high' : giftBalance > 0 ? 'medium' : 'low';
      return {
        liabilityType: 'balance',
        customerId: account.customerId,
        customerName: account.customer?.name ?? '',
        customerCardId: 0,
        cardId: undefined,
        cardName: '会员储值余额',
        totalTimes: 0,
        remainingTimes: 0,
        cashBalance: this.round(cashBalance),
        giftBalance: this.round(giftBalance),
        estimatedRemainingValue: this.round(estimatedRemainingValue),
        expiryDate: '',
        lastUsedAt: lastTransaction?.createdAt?.toISOString(),
        lastTransactionType: lastTransaction?.type,
        lastTransactionOrderId: lastTransaction?.orderId,
        lastTransactionOrderNo: lastTransaction?.order?.orderNo,
        riskLevel,
        riskReasons,
      };
    });
    const balanceConsumption =
      type === 'card'
        ? { _sum: { amount: 0, giftAmount: 0 } }
        : await this.prisma.customerBalanceTransaction.aggregate({
            where: {
              type: 'deduct',
              ...(storeId ? { storeId } : {}),
            },
            _sum: { amount: true, giftAmount: true },
          });

    const rows = [...cardRows, ...balanceRows].sort((a, b) => this.toNumber(b.estimatedRemainingValue) - this.toNumber(a.estimatedRemainingValue));
    const keywordFiltered = keyword
      ? rows.filter((row) =>
          [row.customerName, String(row.customerId), row.cardName, (row as any).lastTransactionOrderNo]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(keyword)),
        )
      : rows;
    const filtered =
      query.riskOnly === true || String(query.riskOnly) === 'true' ? keywordFiltered.filter((row) => row.riskLevel !== 'low') : keywordFiltered;
    const summary = {
      totalLiability: this.round(filtered.reduce((sum, row) => sum + this.toNumber(row.estimatedRemainingValue), 0)),
      cardLiability: this.round(filtered.filter((row) => row.liabilityType === 'card').reduce((sum, row) => sum + this.toNumber(row.estimatedRemainingValue), 0)),
      balanceLiability: this.round(
        filtered.filter((row) => row.liabilityType === 'balance').reduce((sum, row) => sum + this.toNumber(row.estimatedRemainingValue), 0),
      ),
      cashBalance: this.round(filtered.reduce((sum, row: any) => sum + this.toNumber(row.cashBalance), 0)),
      giftBalance: this.round(filtered.reduce((sum, row: any) => sum + this.toNumber(row.giftBalance), 0)),
      balanceCashConsumed: this.round(this.toNumber(balanceConsumption._sum.amount)),
      balanceGiftConsumed: this.round(this.toNumber(balanceConsumption._sum.giftAmount)),
      cardRecognizedIncome: this.round(
        filtered.filter((row) => row.liabilityType === 'card').reduce((sum, row: any) => sum + this.toNumber(row.recognizedIncome), 0),
      ),
      remainingTimes: filtered.reduce((sum, row: any) => sum + this.toNumber(row.remainingTimes), 0),
      highRisk: filtered.filter((row) => row.riskLevel === 'high').length,
      mediumRisk: filtered.filter((row) => row.riskLevel === 'medium').length,
    };
    const items = filtered.slice((page - 1) * pageSize, page * pageSize);
    return { items, data: items, total: filtered.length, page, pageSize, summary };
  }

  async getBeauticianPerformance(query: QueryBeauticianPerformanceDto, headerStoreId?: string) {
    const storeId = this.asOptionalStoreId(query.storeId ?? headerStoreId);
    const range = this.parseDateRange(query.from, query.to);
    const [staffUsers, orders, cardUsageRecords, cardUnitValueByName] = await Promise.all([
      this.getPerformanceStaffUsers(storeId, query.beauticianId ? Number(query.beauticianId) : undefined),
      this.getOrders(range, storeId),
      this.getCardUsageRecords(range, storeId),
      this.getCardUnitValueByName(),
    ]);
    const orderItems = orders.flatMap((order) => order.orderItems.map((item) => ({ ...item, order, customerId: order.customerId, customerName: order.customerName })));
    const serviceOrderItemIds = orderItems.filter((item) => this.isServiceItem(item.itemType)).map((item) => Number(item.id)).filter(Boolean);
    const cardUsageRecordIds = cardUsageRecords.map((record) => Number(record.id)).filter(Boolean);
    const commissionLookup = this.buildPerformanceCommissionLookup(await this.getPerformanceCommissionRecords(serviceOrderItemIds, cardUsageRecordIds, storeId));
    const rowsWithEmpty = await Promise.all(
      staffUsers.map(async (staffUser) => {
        const beauticianProfiles = staffUser.beauticianProfiles ?? [];
        const beauticianIds = new Set(beauticianProfiles.map((profile) => Number(profile.id)).filter(Boolean));
        const primaryBeautician = beauticianProfiles[0];
        const primaryStore = primaryBeautician?.store ?? staffUser.stores?.[0]?.store;
        const resolvedStoreId = primaryBeautician?.storeId ?? staffUser.stores?.[0]?.storeId ?? storeId;
        const items = orderItems.filter((item) => item.beauticianId && beauticianIds.has(Number(item.beauticianId)));
        const serviceItems = items.filter((item) => this.isServiceItem(item.itemType));
        const cardSaleItems = items.filter((item) => this.isCardSaleItem(item.itemType));
        const usageItems = cardUsageRecords.filter((record) => record.beauticianId && beauticianIds.has(Number(record.beauticianId)));
        const cardUsageIncome = usageItems.reduce(
          (sum, record) => sum + this.getCardUsageRecognizedAmount(record, cardUnitValueByName),
          0,
        );
        const serviceDetails = [
          ...serviceItems.map((item) => {
            const income = this.round(this.getItemNetAmount(item));
            const commissionCost = this.getPerformanceCommissionAmount(commissionLookup, staffUser.id, beauticianIds, 'orderItem', Number(item.id));
            return {
              id: `order-${item.id}`,
              sourceType: 'order',
              sourceLabel: '项目订单',
              sourceNo: item.order?.orderNo,
              serviceName: item.name,
              customerName: item.customerName ?? item.order?.customerName,
              occurredAt: item.order?.createdAt?.toISOString?.() ?? item.createdAt?.toISOString?.(),
              quantity: this.toNumber(item.quantity) || 1,
              income,
              commissionCost,
              contributionProfit: this.round(income - commissionCost),
            };
          }),
          ...usageItems.map((record) => {
            const income = this.round(this.getCardUsageRecognizedAmount(record, cardUnitValueByName));
            const commissionCost = this.getPerformanceCommissionAmount(commissionLookup, staffUser.id, beauticianIds, 'cardUsage', Number(record.id));
            return {
              id: `card-usage-${record.id}`,
              sourceType: 'card_usage',
              sourceLabel: '次卡核销',
              sourceNo: record.sourceOrder?.orderNo ?? record.sourceOrder?.checkoutGroupNo,
              serviceName: record.projectName || record.project?.name || record.sourceOrderItem?.name || '未命名服务',
              customerName: record.customerName ?? record.customer?.name,
              occurredAt: record.verifiedAt?.toISOString?.(),
              quantity: this.toNumber(record.times) || 1,
              income,
              commissionCost,
              contributionProfit: this.round(income - commissionCost),
            };
          }),
        ].sort((a, b) => String(b.occurredAt ?? '').localeCompare(String(a.occurredAt ?? '')));
        const serviceIncome = serviceItems.reduce((sum, item) => sum + this.getItemNetAmount(item), 0) + cardUsageIncome;
        const serviceCount =
          serviceItems.reduce((sum, item) => sum + (this.toNumber(item.quantity) || 1), 0) +
          usageItems.reduce((sum, record) => sum + this.toNumber(record.times || 1), 0);
        const commissionOrderItemIds = serviceItems.map((item) => Number(item.id)).filter(Boolean);
        const customerIds = new Set<number>();
        for (const item of items) if (item.customerId) customerIds.add(Number(item.customerId));
        for (const usage of usageItems) customerIds.add(usage.customerId);
        const cardUsageRecordIds = usageItems.map((record) => Number(record.id)).filter(Boolean);
        const commissionCost = await this.getCommissionCostForPerformance(
          commissionOrderItemIds,
          storeId,
          {
            staffUserId: staffUser.id,
            beauticianId: primaryBeautician?.id,
          },
          cardUsageRecordIds,
        );
        const contributionProfit = serviceIncome - commissionCost;
        const cardSalesAmount = cardSaleItems.reduce((sum, item) => sum + this.getItemNetAmount(item), 0);
        return {
          staffUserId: staffUser.id,
          staffName: staffUser.name || staffUser.username,
          beauticianId: primaryBeautician?.id ?? null,
          beauticianName: staffUser.name || staffUser.username,
          storeId: resolvedStoreId,
          storeName: primaryStore?.name,
          serviceIncome: this.round(serviceIncome),
          orderServiceIncome: this.round(serviceItems.reduce((sum, item) => sum + this.getItemNetAmount(item), 0)),
          cardUsageIncome: this.round(cardUsageIncome),
          serviceCount: this.round(serviceCount),
          customerCount: customerIds.size,
          avgTicket: customerIds.size ? this.round(serviceIncome / customerIds.size) : 0,
          cardSalesAmount: this.round(cardSalesAmount),
          commissionCost: this.round(commissionCost),
          contributionProfit: this.round(contributionProfit),
          repurchaseRate: 0,
          missingCostReasons: commissionCost <= 0 && serviceIncome > 0 ? ['missing_commission'] : [],
          serviceDetails,
        };
      }),
    );
    const rows = rowsWithEmpty.filter(
      (row) =>
        this.toNumber(row.serviceIncome) > 0 ||
        this.toNumber(row.serviceCount) > 0 ||
        this.toNumber(row.customerCount) > 0 ||
        this.toNumber(row.cardSalesAmount) > 0 ||
        this.toNumber(row.commissionCost) > 0,
    );

    return { items: rows, data: rows, total: rows.length, page: 1, pageSize: rows.length || 20 };
  }
}
