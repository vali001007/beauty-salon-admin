import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TerminalDashboardCacheService } from '../terminal/terminal-dashboard-cache.service.js';
import { CommissionService } from '../commission/commission.service.js';
import { formatBusinessDate } from '../common/utils/business-time.js';
import { SupplyPlatformService } from '../supply-platform/supply-platform.service.js';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private terminalDashboardCache: TerminalDashboardCacheService,
    private commissionService?: CommissionService,
    private supplyPlatformService?: SupplyPlatformService,
  ) {}

  private invalidateInventoryDashboardCache(storeId?: number | null) {
    this.terminalDashboardCache.invalidate(storeId, ['role', 'manager', 'inventory-alerts']);
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  private toNonNegativeStock(value: unknown): number {
    const stock = this.toNumber(value);
    return Number.isFinite(stock) ? Math.max(0, stock) : 0;
  }

  private createMovementNo(prefix = 'SM') {
    return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private getStockStatus(item: { currentStock?: unknown; safetyStock?: unknown }) {
    const currentStock = this.toNonNegativeStock(item.currentStock);
    const safetyStock = this.toNonNegativeStock(item.safetyStock);
    if (currentStock <= 0) return '缺货';
    if (safetyStock > 0 && currentStock < safetyStock) return '低库存';
    if (safetyStock > 0 && currentStock > safetyStock * 4) return '积压';
    return '正常';
  }

  private mapStockItem(item: any) {
    const currentStock = this.toNonNegativeStock(item.currentStock);
    const reserved = this.toNonNegativeStock(item.reserved);
    const availableStock = this.toNonNegativeStock(item.availableStock ?? currentStock - reserved);
    const safetyStock = this.toNonNegativeStock(item.safetyStock);
    const lastBatch = Array.isArray(item.batches) ? item.batches[0] : undefined;
    const primarySupplier = Array.isArray(item.suppliers) ? item.suppliers[0] : undefined;
    const supplierName = item.supplier ?? primarySupplier?.supplier?.name ?? '';
    return {
      ...item,
      productName: item.productName ?? item.name,
      storeName: item.storeName ?? item.store?.name ?? '',
      categoryName: item.categoryName ?? item.category?.name ?? '',
      supplier: supplierName,
      currentStock,
      reserved,
      availableStock,
      safetyStock,
      maxStock: this.toNonNegativeStock(item.maxStock ?? Math.max(safetyStock * 5, currentStock)),
      costPrice: this.toNumber(item.costPrice),
      status: this.getStockStatus(item),
      lastInboundDate: item.lastInboundDate ?? lastBatch?.createdAt?.toISOString?.().slice(0, 10) ?? '',
    };
  }

  private buildShortageRemark(baseRemark: string | undefined, requestedQty: number, appliedQty: number) {
    if (appliedQty >= requestedQty) return baseRemark;
    const shortageRemark = `库存不足：本次申请 ${requestedQty}，实际扣减 ${appliedQty}，不足 ${requestedQty - appliedQty}`;
    return [baseRemark, shortageRemark].filter(Boolean).join('；');
  }

  private getExpiringPeriodConfig(period?: string) {
    const value = String(period || '60d');
    const daysByPeriod: Record<string, number> = {
      '30d': 30,
      '60d': 60,
      '90d': 90,
      '180d': 180,
      this_month: 30,
      month: 30,
      quarter: 90,
      half_year: 180,
    };
    const windowDays = daysByPeriod[value] ?? 60;
    const trendMonths = windowDays >= 180 ? 6 : windowDays >= 90 ? 3 : 2;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + windowDays);
    const trendStart = new Date(today.getFullYear(), today.getMonth() - trendMonths + 1, 1);
    return { today, windowEnd, windowDays, trendMonths, trendStart };
  }

  private daysUntil(expiryDate: Date | string | null | undefined, today: Date) {
    if (!expiryDate) return null;
    const date = new Date(expiryDate);
    date.setHours(0, 0, 0, 0);
    return Math.ceil((date.getTime() - today.getTime()) / 86400000);
  }

  private monthKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private getLossAmount(movement: any) {
    const quantity = Math.abs(this.toNumber(movement.quantity));
    const costPrice = this.toNumber(movement.product?.costPrice);
    return quantity * costPrice;
  }

  private getConsumptionStats(movements: any[], productIds: number[]) {
    const result = new Map<number, { consumed7Days: number; consumed30Days: number }>();
    const productIdSet = new Set(productIds);
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    for (const id of productIds) result.set(id, { consumed7Days: 0, consumed30Days: 0 });
    for (const movement of movements) {
      const productId = Number(movement.productId);
      if (!productIdSet.has(productId)) continue;
      const quantity = Math.abs(this.toNumber(movement.quantity));
      if (quantity <= 0) continue;
      const occurredAt = new Date(movement.occurredAt ?? movement.createdAt ?? now);
      const stats = result.get(productId) ?? { consumed7Days: 0, consumed30Days: 0 };
      stats.consumed30Days += quantity;
      if (occurredAt >= sevenDaysAgo) stats.consumed7Days += quantity;
      result.set(productId, stats);
    }
    return result;
  }

  private getManualPurchaseInTransitBySku(orders: any[]) {
    const result = new Map<string, number>();
    const activeStatuses = new Set(['待审核', '已审核', '已下单', '部分收货']);
    for (const order of orders) {
      if (!activeStatuses.has(String(order.status))) continue;
      const { items } = this.getPurchaseOrderPayload(order);
      for (const item of items) {
        const remainingQty = Math.max(0, this.toNumber(item.quantity) - this.toNumber(item.receivedQty));
        if (!item.sku || remainingQty <= 0) continue;
        result.set(item.sku, (result.get(item.sku) ?? 0) + remainingQty);
      }
    }
    return result;
  }

  private buildReplenishmentDecision(input: {
    currentStock: number;
    safetyStock: number;
    consumed7Days: number;
    consumed30Days: number;
    inTransit: number;
    moq?: number | null;
    leadDays?: number | null;
  }) {
    const forecast7Days = Math.ceil(Math.max(input.consumed7Days, input.consumed30Days > 0 ? (input.consumed30Days / 30) * 7 : 0));
    const forecast30Days = Math.ceil(input.consumed30Days);
    const dailyConsumption = input.consumed30Days > 0 ? input.consumed30Days / 30 : 0;
    const hasConsumptionHistory = input.consumed30Days > 0;
    const targetStock = hasConsumptionHistory
      ? Math.max(input.safetyStock * 2, input.safetyStock + forecast30Days)
      : input.safetyStock * 2;
    const shortageQty = Math.max(0, Math.ceil(targetStock - input.currentStock - input.inTransit));
    const moq = this.toNumber(input.moq);
    const suggestedQty = shortageQty > 0 ? Math.max(shortageQty, moq > 0 ? moq : 0) : 0;
    const daysUntilSafety = dailyConsumption > 0 && input.currentStock > input.safetyStock
      ? Math.floor((input.currentStock - input.safetyStock) / dailyConsumption)
      : input.currentStock <= input.safetyStock
        ? 0
        : null;
    return {
      forecast7Days,
      forecast30Days,
      dailyConsumption,
      hasConsumptionHistory,
      targetStock,
      shortageQty,
      suggestedQty,
      daysUntilSafety,
    };
  }

  private getPurchaseOrderPayload(order: any) {
    const payload = order.items && typeof order.items === 'object' && !Array.isArray(order.items)
      ? order.items as { items?: unknown; storeId?: number | string; storeName?: string; expectedDate?: string; source?: string }
      : undefined;
    const rawItems = Array.isArray(order.items) ? order.items : Array.isArray(payload?.items) ? payload.items : [];
    const items = rawItems.map((raw: any, index: number) => {
      const quantity = this.toNumber(raw.quantity);
      const unitPrice = this.toNumber(raw.unitPrice);
      return {
        id: Number(raw.id ?? index + 1),
        ...(Number(raw.productId) > 0 ? { productId: Number(raw.productId) } : {}),
        productName: raw.productName ?? '',
        sku: raw.sku ?? '',
        quantity,
        receivedQty: this.toNumber(raw.receivedQty),
        unitPrice,
        subtotal: this.toNumber(raw.subtotal ?? quantity * unitPrice),
      };
    });
    return { payload, items };
  }

  private mapPurchaseOrder(order: any) {
    const { payload, items } = this.getPurchaseOrderPayload(order);
    return {
      ...order,
      totalAmount: Number(order.totalAmount ?? 0),
      productCount: items.length,
      storeName: payload?.storeName ?? '全部门店',
      createDate: formatBusinessDate(order.createdAt),
      expectedDate: payload?.expectedDate ?? '',
      items,
    };
  }

  private async findPurchaseOrderProduct(tx: any, item: { productId?: number; sku?: string; productName?: string }, storeId?: number) {
    const productId = Number(item.productId);
    if (Number.isInteger(productId) && productId > 0) {
      const product = await tx.product.findFirst({
        where: {
          id: productId,
          deletedAt: null,
          ...(storeId ? { storeId } : {}),
        },
      });
      if (product) return product;
    }

    const sku = String(item.sku ?? '').trim();
    if (sku) {
      const product = await tx.product.findFirst({
        where: {
          sku,
          deletedAt: null,
          ...(storeId ? { storeId } : {}),
        },
      });
      if (product) return product;
    }

    const productName = String(item.productName ?? '').trim();
    if (!productName || !storeId) return null;
    const products = await tx.product.findMany({
      where: {
        name: productName,
        storeId,
        deletedAt: null,
      },
      take: 2,
      orderBy: { id: 'asc' },
    });
    return products.length === 1 ? products[0] : null;
  }

  async getStock(query: {
    storeId?: number;
    categoryId?: number;
    status?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const where: any = { deletedAt: null };
    if (query.storeId) where.storeId = Number(query.storeId);
    if (query.categoryId) where.categoryId = Number(query.categoryId);
    if (query.keyword?.trim()) {
      const keyword = query.keyword.trim();
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { sku: { contains: keyword, mode: 'insensitive' } },
        { brand: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const select = {
      id: true,
      name: true,
      sku: true,
      unit: true, specUnit: true,
      costPrice: true,
      supplier: true,
      currentStock: true,
      safetyStock: true,
      status: true,
      storeId: true,
      categoryId: true,
      store: { select: { name: true } },
      category: { select: { name: true } },
      suppliers: {
        where: { supplier: { status: 'active', deletedAt: null } },
        select: { supplier: { select: { name: true } } },
        orderBy: [{ isPrimary: 'desc' as const }, { supplyPrice: 'asc' as const }],
        take: 1,
      },
      batches: { select: { createdAt: true }, orderBy: { createdAt: 'desc' as const }, take: 1 },
    };

    if (query.status) {
      const allItems = await this.prisma.product.findMany({ where, select, orderBy: { id: 'desc' } });
      const filtered = allItems.map((item) => this.mapStockItem(item)).filter((item) => item.status === query.status);
      const items = filtered.slice((page - 1) * pageSize, page * pageSize);
      return { items, data: items, total: filtered.length, page, pageSize };
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select,
        orderBy: { id: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);
    const mapped = items.map((item) => this.mapStockItem(item));
    return { items: mapped, data: mapped, total, page, pageSize };
  }

  async getBatches(productId: number) {
    const batches = await this.prisma.stockBatch.findMany({
      where: { productId },
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return batches.map((batch) => {
      const stock = this.toNonNegativeStock(batch.stock);
      const expiryDate = batch.expiryDate ? new Date(batch.expiryDate) : null;
      const remainingDays = expiryDate ? Math.ceil((expiryDate.getTime() - today.getTime()) / 86400000) : null;
      const status = remainingDays === null
        ? '正常'
        : remainingDays < 0
          ? '已过期'
          : remainingDays <= 60
            ? '临期'
            : '正常';
      return {
        ...batch,
        stock,
        inboundQty: stock,
        availableQty: stock,
        status,
        inboundDate: batch.createdAt,
      };
    });
  }

  async getExpiring(page = 1, pageSize = 20, storeId?: number, period?: string) {
    const { windowEnd } = this.getExpiringPeriodConfig(period);

    const where: any = { expiryDate: { lte: windowEnd }, stock: { gt: 0 }, product: { deletedAt: null } };
    if (storeId) where.product.storeId = storeId;
    const [items, total] = await Promise.all([
      this.prisma.stockBatch.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: {
            select: {
              name: true,
              sku: true,
              storeId: true,
              unit: true, specUnit: true,
              costPrice: true,
              retailPrice: true,
              supplier: true,
              store: { select: { name: true } },
              category: { select: { name: true } },
            },
          },
        },
        orderBy: { expiryDate: 'asc' },
      }),
      this.prisma.stockBatch.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  async getExpiringSummary(storeId?: number, period?: string) {
    const { today, windowEnd, windowDays, trendMonths, trendStart } = this.getExpiringPeriodConfig(period);
    const batchWhere: any = { expiryDate: { lte: windowEnd }, stock: { gt: 0 }, product: { deletedAt: null } };
    if (storeId) batchWhere.product.storeId = storeId;
    const movementWhere: any = {
      movementType: 'scrap_out',
      occurredAt: { gte: trendStart },
    };
    if (storeId) movementWhere.storeId = storeId;

    const [batches, scrapMovements] = await Promise.all([
      this.prisma.stockBatch.findMany({
        where: batchWhere,
        include: {
          product: {
            select: {
              costPrice: true,
              category: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.stockMovement.findMany({
        where: movementWhere,
        include: {
          product: {
            select: {
              costPrice: true,
              category: { select: { name: true } },
            },
          },
        },
        orderBy: { occurredAt: 'asc' },
      }),
    ]);

    let expiringBatchCount = 0;
    let urgentBatchCount = 0;
    let expiredBatchCount = 0;
    let expiringCostAmount = 0;
    for (const batch of batches) {
      const remainingDays = this.daysUntil(batch.expiryDate, today);
      const stock = this.toNonNegativeStock(batch.stock);
      const amount = stock * this.toNumber(batch.product?.costPrice);
      if (remainingDays !== null && remainingDays < 0) {
        expiredBatchCount += 1;
      } else if (remainingDays !== null && remainingDays <= 30) {
        urgentBatchCount += 1;
        expiringCostAmount += amount;
      } else {
        expiringBatchCount += 1;
        expiringCostAmount += amount;
      }
    }

    const trendMonthsList = Array.from({ length: trendMonths }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth() - trendMonths + 1 + index, 1);
      return this.monthKey(date);
    });
    const trendMap = new Map(trendMonthsList.map((month) => [month, 0]));
    const categoryMap = new Map<string, number>();
    let scrappedAmount = 0;
    for (const movement of scrapMovements) {
      const amount = this.getLossAmount(movement);
      scrappedAmount += amount;
      const month = this.monthKey(new Date(movement.occurredAt));
      trendMap.set(month, (trendMap.get(month) ?? 0) + amount);
      const category = movement.product?.category?.name ?? '未分类';
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + amount);
    }
    const categoryTotal = Array.from(categoryMap.values()).reduce((sum, amount) => sum + amount, 0);

    return {
      period: period || '60d',
      windowDays,
      expiringBatchCount,
      urgentBatchCount,
      expiredBatchCount,
      expiringCostAmount,
      scrappedAmount,
      wastageTrend: trendMonthsList.map((month) => ({ month, amount: trendMap.get(month) ?? 0 })),
      categoryWastage: Array.from(categoryMap.entries())
        .map(([category, amount]) => ({
          category,
          amount,
          percentage: categoryTotal > 0 ? Math.round((amount / categoryTotal) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.amount - a.amount),
    };
  }

  async inbound(data: {
    productId: number;
    batchNo: string;
    quantity?: number | string;
    stock?: number | string;
    unitCost?: number | string;
    totalAmount?: number | string;
    supplier?: string;
    productionDate?: string;
    expiryDate?: string;
    remark?: string;
    operatorId?: number | string;
  }) {
    const productId = Number(data.productId);
    const batchNo = String(data.batchNo ?? '').trim();
    const quantity = this.toNumber(data.quantity ?? data.stock);
    if (!productId) throw new BadRequestException('请选择入库商品');
    if (!batchNo) throw new BadRequestException('批次号不能为空');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('入库数量必须大于 0');
    const productionDate = data.productionDate ? new Date(data.productionDate) : undefined;
    const expiryDate = data.expiryDate ? new Date(data.expiryDate) : undefined;
    if (productionDate && Number.isNaN(productionDate.getTime())) throw new BadRequestException('生产日期格式不正确');
    if (expiryDate && Number.isNaN(expiryDate.getTime())) throw new BadRequestException('过期日期格式不正确');
    if (productionDate && expiryDate && expiryDate < productionDate) throw new BadRequestException('过期日期不能早于生产日期');

    const { batch, storeId } = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new NotFoundException('Product not found');

      const beforeStock = this.toNonNegativeStock(product.currentStock);
      const afterStock = beforeStock + quantity;
      const rawUnitCost = data.unitCost;
      const unitCost = rawUnitCost === undefined || rawUnitCost === null || rawUnitCost === ''
        ? this.toNumber(product.costPrice)
        : this.toNumber(rawUnitCost);
      const rawTotalAmount = data.totalAmount;
      const totalAmount = rawTotalAmount === undefined || rawTotalAmount === null || rawTotalAmount === ''
        ? unitCost * quantity
        : this.toNumber(rawTotalAmount);
      const supplier = String(data.supplier ?? product.supplier ?? '').trim();
      const costRemark = [
        Number.isFinite(unitCost) ? `成本单价 ¥${unitCost.toFixed(2)}` : null,
        Number.isFinite(totalAmount) ? `订单总价 ¥${totalAmount.toFixed(2)}` : null,
        supplier ? `供应商 ${supplier}` : null,
      ].filter(Boolean).join('；');
      const remark = [data.remark, costRemark].filter(Boolean).join('；');

      const existingBatch = await tx.stockBatch.findFirst({
        where: { productId, batchNo },
      });
      const batch = existingBatch
        ? await tx.stockBatch.update({
            where: { id: existingBatch.id },
            data: {
              stock: this.toNonNegativeStock(existingBatch.stock) + quantity,
              ...(productionDate ? { productionDate } : {}),
              ...(expiryDate ? { expiryDate } : {}),
            },
          })
        : await tx.stockBatch.create({
            data: {
              productId,
              batchNo,
              stock: quantity,
              productionDate,
              expiryDate,
            },
          });

      await tx.product.update({
        where: { id: productId },
        data: { currentStock: afterStock },
      });

      await tx.stockMovement.create({
        data: {
          storeId: product.storeId,
          productId: product.id,
          batchId: batch.id,
          movementNo: this.createMovementNo('IN'),
          movementType: 'inbound',
          quantity,
          beforeStock,
          afterStock,
          unit: product.specUnit ?? product.unit,
          sourceType: 'stock_batch',
          sourceId: batch.id,
          sourceNo: batchNo,
          ...(data.operatorId ? { operatorId: Number(data.operatorId) } : {}),
          remark,
        },
      });

      return { batch, storeId: product.storeId };
    });
    this.invalidateInventoryDashboardCache(storeId);
    return batch;
  }

  async createAdjustment(data: {
    productId: number | string;
    batchId?: number | string | null;
    quantity?: number | string;
    targetStock?: number | string;
    adjustmentType?: string;
    reason?: string;
    remark?: string;
    operatorId?: number | string;
  }) {
    const productId = Number(data.productId);
    const batchId = data.batchId ? Number(data.batchId) : undefined;
    const adjustmentType = String(data.adjustmentType ?? '').trim();
    const allowedTypes = new Set(['manual_outbound', 'scrap_out', 'stocktake_gain', 'stocktake_loss', 'manual_correction']);
    if (!productId) throw new BadRequestException('请选择库存商品');
    if (!allowedTypes.has(adjustmentType)) throw new BadRequestException('库存调整类型不正确');

    const rawQuantity = this.toNumber(data.quantity);
    const targetStock = data.targetStock === undefined || data.targetStock === null || data.targetStock === ''
      ? undefined
      : this.toNumber(data.targetStock);
    if (adjustmentType !== 'manual_correction' && (!Number.isFinite(rawQuantity) || rawQuantity <= 0)) {
      throw new BadRequestException('调整数量必须大于 0');
    }
    if (adjustmentType === 'manual_correction' && (!Number.isFinite(Number(targetStock)) || Number(targetStock) < 0)) {
      throw new BadRequestException('手工修正需要填写不小于 0 的目标库存');
    }

    const movement = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, deletedAt: null },
      });
      if (!product) throw new NotFoundException('Product not found');

      const beforeStock = this.toNonNegativeStock(product.currentStock);
      let isOutbound = ['manual_outbound', 'scrap_out', 'stocktake_loss'].includes(adjustmentType);
      let requestedQty = rawQuantity;
      if (adjustmentType === 'stocktake_gain') isOutbound = false;
      if (adjustmentType === 'manual_correction') {
        const diff = Number(targetStock) - beforeStock;
        isOutbound = diff < 0;
        requestedQty = Math.abs(diff);
      }
      if (requestedQty <= 0) throw new BadRequestException('调整后库存未发生变化');

      const batch = batchId
        ? await tx.stockBatch.findFirst({ where: { id: batchId, productId } })
        : null;
      if (batchId && !batch) throw new BadRequestException('批次不存在或不属于当前商品');

      const beforeBatchStock = batch ? this.toNonNegativeStock(batch.stock) : undefined;
      const appliedQty = isOutbound
        ? Math.min(beforeStock, beforeBatchStock === undefined ? requestedQty : Math.min(beforeBatchStock, requestedQty))
        : requestedQty;
      if (isOutbound && appliedQty <= 0) {
        if (this.toNumber(product.currentStock) < 0) {
          await tx.product.update({
            where: { id: product.id },
            data: { currentStock: 0 },
          });
        }
        throw new BadRequestException('当前库存不足，无法出库');
      }

      const signedQuantity = isOutbound ? -appliedQty : appliedQty;
      const afterStock = isOutbound ? beforeStock - appliedQty : beforeStock + appliedQty;
      await tx.product.update({
        where: { id: product.id },
        data: { currentStock: afterStock },
      });

      if (batch) {
        const afterBatchStock = isOutbound
          ? Math.max(0, Number(beforeBatchStock) - appliedQty)
          : Number(beforeBatchStock) + appliedQty;
        await tx.stockBatch.update({
          where: { id: batch.id },
          data: { stock: afterBatchStock },
        });
      }

      const remark = this.buildShortageRemark([data.reason, data.remark].filter(Boolean).join('；'), requestedQty, appliedQty);
      const sourceType = ['stocktake_gain', 'stocktake_loss'].includes(adjustmentType) ? 'stocktake' : 'inventory_adjustment';
      return tx.stockMovement.create({
        data: {
          storeId: product.storeId,
          productId: product.id,
          batchId: batch?.id,
          movementNo: this.createMovementNo('ADJ'),
          movementType: adjustmentType,
          quantity: signedQuantity,
          beforeStock,
          afterStock,
          unit: product.specUnit ?? product.unit,
          sourceType,
          sourceId: product.id,
          sourceNo: batch?.batchNo ?? product.sku,
          operatorId: data.operatorId ? Number(data.operatorId) : undefined,
          remark,
        },
      });
    });
    this.invalidateInventoryDashboardCache(movement.storeId);
    return movement;
  }

  async getStockMovements(query: {
    page?: number;
    pageSize?: number;
    storeId?: number;
    productId?: number;
    sourceType?: string;
    sourceId?: number;
    movementType?: string;
  }) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const where: any = {};
    if (query.storeId) where.storeId = Number(query.storeId);
    if (query.productId) where.productId = Number(query.productId);
    if (query.sourceType) where.sourceType = query.sourceType;
    if (query.sourceId) where.sourceId = Number(query.sourceId);
    if (query.movementType) where.movementType = query.movementType;

    const [items, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: {
          store: { select: { id: true, name: true } },
          product: { select: { id: true, name: true, sku: true, unit: true, specUnit: true } },
          batch: { select: { id: true, batchNo: true } },
          operator: { select: { id: true, name: true, username: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { occurredAt: 'desc' },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return { items, data: items, total, page, pageSize };
  }

  // Purchase Orders
  async getPurchaseOrders(page = 1, pageSize = 20) {
    const [items, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.purchaseOrder.count(),
    ]);
    const viewItems = items.map((order) => this.mapPurchaseOrder(order));
    return { items: viewItems, data: viewItems, total, page, pageSize };
  }

  async createPurchaseOrder(data: any) {
    const orderNo = `PUR${Date.now()}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
    const items: Array<{
      id: number;
      productId?: number;
      productName: string;
      sku: string;
      quantity: number;
      receivedQty: number;
      unitPrice: number;
      subtotal: number;
    }> = (Array.isArray(data.items) ? data.items : []).map((item: any, index: number) => {
      const quantity = this.toNumber(item.quantity);
      const unitPrice = this.toNumber(item.unitPrice);
      return {
        id: Number(item.id ?? index + 1),
        ...(Number(item.productId) > 0 ? { productId: Number(item.productId) } : {}),
        productName: item.productName ?? '',
        sku: item.sku ?? '',
        quantity,
        receivedQty: this.toNumber(item.receivedQty),
        unitPrice,
        subtotal: this.toNumber(item.subtotal ?? quantity * unitPrice),
      };
    });
    if (!items.length) throw new BadRequestException('采购单至少需要一条明细');
    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const payload = {
      items,
      storeId: data.storeId ? Number(data.storeId) : undefined,
      storeName: data.storeName ?? '全部门店',
      expectedDate: data.expectedDate ?? '',
      source: data.source ?? 'manual',
    };
    const order = await this.prisma.purchaseOrder.create({
      data: {
        orderNo,
        supplier: data.supplier,
        totalAmount,
        status: data.status ?? '草稿',
        items: payload,
      },
    });
    return {
      ...order,
      totalAmount,
      productCount: items.length,
      storeName: payload.storeName,
      createDate: formatBusinessDate(order.createdAt),
      expectedDate: payload.expectedDate,
      items,
    };
  }

  async updatePurchaseOrderStatus(id: number, data: { status?: string }) {
    const status = String(data.status ?? '').trim();
    const allowedStatuses = new Set(['草稿', '待审核', '已审核', '已下单', '已取消']);
    if (!allowedStatuses.has(status)) throw new BadRequestException('采购单状态不正确');

    const order = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Purchase order not found');
    if (['已收货', '已取消'].includes(String(order.status))) {
      throw new BadRequestException('当前采购单状态不可再调整');
    }
    if (String(order.status) === '部分收货' && status !== '已取消') {
      throw new BadRequestException('部分收货采购单只能继续收货或取消');
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status },
    });
    return this.mapPurchaseOrder(updated);
  }

  async receivePurchaseOrder(id: number, data: {
    items?: Array<{ sku?: string; receivedQty?: number | string; batchNo?: string; productionDate?: string; expiryDate?: string }>;
    remark?: string;
    storeId?: number | string;
    operatorId?: number | string;
  }) {
    const affectedStoreIds = new Set<number>();
    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Purchase order not found');
      if (String(order.status) === '已取消') throw new BadRequestException('已取消采购单不可收货');
      if (String(order.status) === '已收货') throw new BadRequestException('采购单已完成收货');
      if (!['已审核', '已下单', '部分收货'].includes(String(order.status))) {
        throw new BadRequestException('采购单需先审核并下单后才能收货');
      }

      const { payload, items } = this.getPurchaseOrderPayload(order);
      const payloadStoreId = payload?.storeId ? Number(payload.storeId) : data.storeId ? Number(data.storeId) : undefined;
      if (!items.length) throw new BadRequestException('采购单没有可收货明细');

      const requestedBySku = new Map<string, { receivedQty: number; batchNo?: string; productionDate?: string; expiryDate?: string }>();
      for (const item of data.items ?? []) {
        const sku = String(item.sku ?? '').trim();
        const receivedQty = this.toNumber(item.receivedQty);
        if (sku && Number.isFinite(receivedQty) && receivedQty > 0) {
          requestedBySku.set(sku, {
            receivedQty,
            batchNo: item.batchNo,
            productionDate: item.productionDate,
            expiryDate: item.expiryDate,
          });
        }
      }

      let receivedAny = false;
      const nextItems = [];
      for (const item of items) {
        const remainingQty = Math.max(0, item.quantity - item.receivedQty);
        const request = requestedBySku.get(item.sku);
        const receiveQty = request ? Math.min(remainingQty, request.receivedQty) : data.items?.length ? 0 : remainingQty;
        if (receiveQty <= 0) {
          nextItems.push(item);
          continue;
        }

        const product = await this.findPurchaseOrderProduct(tx, item, payloadStoreId);
        if (!product) throw new BadRequestException(`SKU ${item.sku} 未找到本地商品，无法收货入库`);

        const beforeStock = this.toNonNegativeStock(product.currentStock);
        const afterStock = beforeStock + receiveQty;
        const batchNo = request?.batchNo || `${order.orderNo}-${item.sku}-${Date.now()}`;
        const batch = await tx.stockBatch.create({
          data: {
            productId: product.id,
            batchNo,
            stock: receiveQty,
            productionDate: request?.productionDate ? new Date(request.productionDate) : undefined,
            expiryDate: request?.expiryDate ? new Date(request.expiryDate) : undefined,
          },
        });
        await tx.product.update({
          where: { id: product.id },
          data: { currentStock: afterStock },
        });
        await tx.stockMovement.create({
          data: {
            storeId: product.storeId,
            productId: product.id,
            batchId: batch.id,
            movementNo: this.createMovementNo('POI'),
            movementType: 'inbound',
            quantity: receiveQty,
            beforeStock,
            afterStock,
            unit: product.specUnit ?? product.unit,
            sourceType: 'purchase_order',
            sourceId: order.id,
            sourceNo: order.orderNo,
            ...(data.operatorId ? { operatorId: Number(data.operatorId) } : {}),
            remark: [data.remark, `手动采购单收货：${item.productName || item.sku}`].filter(Boolean).join('；'),
          },
        });
        affectedStoreIds.add(product.storeId);
        receivedAny = true;
        nextItems.push({ ...item, receivedQty: item.receivedQty + receiveQty });
      }

      if (!receivedAny) throw new BadRequestException('没有可收货数量');
      const allReceived = nextItems.every((item) => item.receivedQty >= item.quantity);
      const nextStatus = allReceived ? '已收货' : '部分收货';
      return tx.purchaseOrder.update({
        where: { id: order.id },
        data: {
          status: nextStatus,
          items: {
            ...(payload ?? {}),
            items: nextItems,
          },
        },
      });
    });
    affectedStoreIds.forEach((storeId) => this.invalidateInventoryDashboardCache(storeId));
    return this.mapPurchaseOrder(updated);
  }

  // Transfer Orders
  async getTransferSuggestions(targetStoreId?: number) {
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        safetyStock: { gt: 0 },
        ...(targetStoreId ? { OR: [{ storeId: targetStoreId }, { currentStock: { gt: 0 } }] } : {}),
      },
      select: {
        id: true,
        storeId: true,
        sku: true,
        name: true,
        currentStock: true,
        safetyStock: true,
        unit: true, specUnit: true,
        store: { select: { id: true, name: true } },
      },
      orderBy: [{ sku: 'asc' }, { storeId: 'asc' }],
    });
    const bySku = new Map<string, any[]>();
    for (const product of products) {
      if (!product.sku) continue;
      bySku.set(product.sku, [...(bySku.get(product.sku) ?? []), product]);
    }

    const suggestions: any[] = [];
    for (const [sku, items] of bySku.entries()) {
      const targets = items.filter((item) => {
        const currentStock = this.toNonNegativeStock(item.currentStock);
        const safetyStock = this.toNonNegativeStock(item.safetyStock);
        return safetyStock > 0 && currentStock < safetyStock && (!targetStoreId || item.storeId === targetStoreId);
      });
      const sources = items.filter((item) => {
        const currentStock = this.toNonNegativeStock(item.currentStock);
        const safetyStock = this.toNonNegativeStock(item.safetyStock);
        return safetyStock > 0 && currentStock > safetyStock * 4;
      });

      for (const target of targets) {
        const targetCurrent = this.toNonNegativeStock(target.currentStock);
        const targetSafety = this.toNonNegativeStock(target.safetyStock);
        const targetNeed = Math.max(1, Math.ceil(targetSafety * 2 - targetCurrent));
        for (const source of sources) {
          if (source.storeId === target.storeId) continue;
          const sourceCurrent = this.toNonNegativeStock(source.currentStock);
          const sourceSafety = this.toNonNegativeStock(source.safetyStock);
          const sourceAvailable = Math.max(0, Math.floor(sourceCurrent - sourceSafety * 2));
          const suggestedQty = Math.min(targetNeed, sourceAvailable);
          if (suggestedQty <= 0) continue;
          suggestions.push({
            id: `${source.id}-${target.id}`,
            sku,
            productName: target.name || source.name,
            productId: source.id,
            fromStoreId: source.storeId,
            fromStoreName: source.store?.name ?? `门店${source.storeId}`,
            toStoreId: target.storeId,
            toStoreName: target.store?.name ?? `门店${target.storeId}`,
            sourceStock: sourceCurrent,
            targetStock: targetCurrent,
            safetyStock: targetSafety,
            suggestedQty,
            unit: target.specUnit ?? source.specUnit ?? target.unit ?? source.unit,
            reason: `${target.store?.name ?? '目标门店'}库存 ${targetCurrent}，低于安全库存 ${targetSafety}；${source.store?.name ?? '来源门店'}库存 ${sourceCurrent}，高于安全库存 4 倍，可调拨 ${suggestedQty}${target.specUnit ?? target.unit ?? ''}。`,
          });
          break;
        }
      }
    }

    return suggestions.slice(0, 20);
  }

  async getTransfers(page = 1, pageSize = 20) {
    const [items, total] = await Promise.all([
      this.prisma.transferOrder.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          fromStore: { select: { id: true, name: true } },
          toStore: { select: { id: true, name: true } },
        },
      }),
      this.prisma.transferOrder.count(),
    ]);
    const normalizedItems = items.map((item: any) => ({
      ...item,
      fromStore: item.fromStore?.name ?? '',
      toStore: item.toStore?.name ?? '',
      fromStoreName: item.fromStore?.name ?? '',
      toStoreName: item.toStore?.name ?? '',
    }));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async createTransfer(data: any) {
    const orderNo = `TRF${Date.now()}`;
    const fromStoreId = Number(data.fromStoreId);
    const toStoreId = Number(data.toStoreId);
    if (!Number.isInteger(fromStoreId) || fromStoreId <= 0) throw new BadRequestException('请选择调出门店');
    if (!Number.isInteger(toStoreId) || toStoreId <= 0) throw new BadRequestException('请选择调入门店');
    if (fromStoreId === toStoreId) throw new BadRequestException('调入门店不能与调出门店相同');

    const status = String(data.status ?? 'pending');
    if (!['pending', 'completed', 'received', 'done'].includes(status)) {
      throw new BadRequestException('调拨状态不正确');
    }

    const items = Array.isArray(data.items)
      ? data.items.map((item: any) => ({
          productId: Number(item.productId ?? item.itemId),
          quantity: this.toNumber(item.quantity ?? item.qty ?? item.stock),
        }))
      : [];
    if (!items.length) throw new BadRequestException('至少添加一个调拨产品');
    for (const item of items) {
      if (!Number.isInteger(item.productId) || item.productId <= 0) throw new BadRequestException('请选择调拨产品');
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new BadRequestException('调拨数量必须为正整数');
    }

    const remark = [data.reason, data.remark].filter(Boolean).join('；') || undefined;
    const shouldApplyStock = data.applyStock === true || ['completed', 'received', 'done'].includes(status);

    const affectedStoreIds = new Set<number>();
    const order = await this.prisma.$transaction(async (tx) => {
      const [fromStore, toStore] = await Promise.all([
        tx.store.findUnique({ where: { id: fromStoreId } }),
        tx.store.findUnique({ where: { id: toStoreId } }),
      ]);
      if (!fromStore) throw new BadRequestException('调出门店不存在');
      if (!toStore) throw new BadRequestException('调入门店不存在');

      const resolvedItems: Array<{
        productId: number;
        quantity: number;
        fromProduct: any;
        toProduct?: any;
      }> = [];

      for (const item of items) {
        const fromProduct = await tx.product.findFirst({
          where: { id: item.productId, storeId: fromStoreId, deletedAt: null },
        });
        if (!fromProduct) throw new BadRequestException('调出门店不存在该调拨产品');

        let toProduct: any | undefined;
        if (shouldApplyStock) {
          toProduct = await tx.product.findFirst({
            where: { sku: fromProduct.sku, storeId: toStoreId, deletedAt: null },
          });
          if (!toProduct) throw new BadRequestException('调入门店缺少同 SKU 商品，请先建商品后再调拨');
        }

        resolvedItems.push({ ...item, fromProduct, toProduct });
      }

      const orderItems = resolvedItems.map((item) => ({
        productId: item.productId,
        sku: item.fromProduct.sku,
        productName: item.fromProduct.name,
        quantity: item.quantity,
      }));
      const order = await tx.transferOrder.create({
        data: {
          orderNo,
          fromStoreId,
          toStoreId,
          productCount: data.productCount ?? orderItems.length,
          status,
          items: { reason: data.reason ?? data.remark ?? '', items: orderItems },
        },
      });

      if (!shouldApplyStock) return order;

      for (const item of resolvedItems) {
        const { fromProduct, toProduct, quantity } = item;
        const fromBefore = this.toNonNegativeStock(fromProduct.currentStock);
        const appliedQty = Math.min(fromBefore, quantity);
        const fromAfter = fromBefore - appliedQty;
        if (appliedQty <= 0) {
          if (this.toNumber(fromProduct.currentStock) < 0) {
            await tx.product.update({
              where: { id: fromProduct.id },
              data: { currentStock: 0 },
            });
          }
          continue;
        }
        await tx.product.update({
          where: { id: fromProduct.id },
          data: { currentStock: fromAfter },
        });
        await tx.stockMovement.create({
          data: {
            storeId: order.fromStoreId,
            productId: fromProduct.id,
            movementNo: this.createMovementNo('TO'),
            movementType: 'transfer_out',
            quantity: -appliedQty,
            beforeStock: fromBefore,
            afterStock: fromAfter,
            unit: fromProduct.specUnit ?? fromProduct.unit,
            sourceType: 'transfer_order',
            sourceId: order.id,
            sourceNo: order.orderNo,
            ...(data.operatorId ? { operatorId: Number(data.operatorId) } : {}),
            remark: this.buildShortageRemark(remark, quantity, appliedQty),
          },
        });
        affectedStoreIds.add(order.fromStoreId);

        const toBefore = this.toNonNegativeStock(toProduct.currentStock);
        const toAfter = toBefore + appliedQty;
        await tx.product.update({
          where: { id: toProduct.id },
          data: { currentStock: toAfter },
        });
        await tx.stockMovement.create({
          data: {
            storeId: order.toStoreId,
            productId: toProduct.id,
            movementNo: this.createMovementNo('TI'),
            movementType: 'transfer_in',
            quantity: appliedQty,
            beforeStock: toBefore,
            afterStock: toAfter,
            unit: toProduct.specUnit ?? toProduct.unit,
            sourceType: 'transfer_order',
            sourceId: order.id,
            sourceNo: order.orderNo,
            ...(data.operatorId ? { operatorId: Number(data.operatorId) } : {}),
            remark: this.buildShortageRemark(remark, quantity, appliedQty),
          },
        });
        affectedStoreIds.add(order.toStoreId);
      }

      return order;
    });
    affectedStoreIds.forEach((storeId) => this.invalidateInventoryDashboardCache(storeId));
    return order;
  }

  // Replenishment suggestions
  async getReplenishment(storeId?: number) {
    const where: any = { deletedAt: null };
    if (storeId) where.storeId = storeId;

    const products = await this.prisma.product.findMany({ where });

    const productIds = products.map((product) => product.id);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const [platformInTransitByProduct, consumptionMovements, manualPurchaseOrders] = await Promise.all([
      storeId && this.supplyPlatformService
        ? this.supplyPlatformService.getInTransitByProduct(storeId, productIds)
        : Promise.resolve(new Map<number, number>()),
      productIds.length
        ? this.prisma.stockMovement.findMany({
            where: {
              productId: { in: productIds },
              occurredAt: { gte: thirtyDaysAgo },
              movementType: { in: ['sale_out', 'service_consume', 'service_consumption'] },
            },
            select: { productId: true, quantity: true, movementType: true, occurredAt: true, createdAt: true },
          })
        : Promise.resolve([]),
      this.prisma.purchaseOrder.findMany({
        where: { status: { in: ['待审核', '已审核', '已下单', '部分收货'] } },
        select: { status: true, items: true },
      }),
    ]);
    const consumptionByProduct = this.getConsumptionStats(consumptionMovements, productIds);
    const manualInTransitBySku = this.getManualPurchaseInTransitBySku(manualPurchaseOrders);
    const now = new Date();
    const platformMappings = productIds.length
      ? await this.prisma.supplyCatalogMapping.findMany({
          where: {
            productId: { in: productIds },
            mappingStatus: 'active',
            supplySku: { status: 'active', auditStatus: 'approved', deletedAt: null },
          },
          include: {
            supplySku: {
              include: {
                supplier: { select: { id: true, name: true, status: true } },
                quotes: {
                  where: {
                    status: 'active',
                    auditStatus: 'approved',
                    deletedAt: null,
                    stockStatus: { notIn: ['out_of_stock', 'unavailable'] },
                    AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ validTo: null }, { validTo: { gte: now } }] }],
                  },
                  orderBy: [{ price: 'asc' }],
                  take: 1,
                },
              },
            },
          },
          orderBy: [{ isPreferred: 'desc' }, { createdAt: 'desc' }],
        })
      : [];
    const mappingByProduct = new Map<number, (typeof platformMappings)[number]>();
    for (const mapping of platformMappings) {
      if (!mapping.productId) continue;
      const current = mappingByProduct.get(mapping.productId);
      const hasQuote = (mapping.supplySku?.quotes?.length ?? 0) > 0;
      const currentHasQuote = (current?.supplySku?.quotes?.length ?? 0) > 0;
      if (!current || (!currentHasQuote && hasQuote)) mappingByProduct.set(mapping.productId, mapping);
    }

    const suggestions = products
      .map((product) => {
        const platformMapping = mappingByProduct.get(product.id);
        const platformSku = platformMapping?.supplySku;
        const platformQuote = platformSku?.quotes?.[0];
        const platformAvailable = Boolean(platformSku && platformQuote);
        const currentStock = this.toNonNegativeStock(product.currentStock);
        const safetyStock = this.toNonNegativeStock(product.safetyStock);
        const platformInTransit = platformInTransitByProduct.get(product.id) ?? 0;
        const manualInTransit = manualInTransitBySku.get(product.sku) ?? 0;
        const inTransit = platformInTransit + manualInTransit;
        const moq = platformAvailable ? platformQuote?.moq : product.minPurchaseQty ?? null;
        const leadDays = platformAvailable ? platformQuote?.leadDays : null;
        const consumption = consumptionByProduct.get(product.id) ?? { consumed7Days: 0, consumed30Days: 0 };
        const decision = this.buildReplenishmentDecision({
          currentStock,
          safetyStock,
          consumed7Days: consumption.consumed7Days,
          consumed30Days: consumption.consumed30Days,
          inTransit,
          moq,
          leadDays,
        });
        const supplyPrice = Number(platformAvailable ? platformQuote?.price : product.costPrice ?? 0);
        const supplierId = platformAvailable ? platformSku?.supplierId : undefined;
        const supplierName = platformAvailable ? platformSku?.supplier?.name : product.supplier ?? '手动采购';
        const availabilityStatus = platformAvailable
          ? 'platform_available'
          : platformMapping
            ? 'platform_mapped_no_quote'
            : 'manual_purchase';
        const reasonParts = [
          `当前库存 ${currentStock}`,
          `安全库存 ${safetyStock}`,
          decision.hasConsumptionHistory
            ? `近30天消耗 ${Math.round(consumption.consumed30Days * 10) / 10}，7天预测 ${decision.forecast7Days}`
            : '暂无足够历史消耗，按安全库存规则补货',
          decision.daysUntilSafety !== null ? `预计 ${decision.daysUntilSafety} 天后触达安全线` : '',
          inTransit > 0 ? `在途 ${inTransit} 已抵扣` : '暂无在途',
          moq ? `起订量 ${moq}` : '',
          leadDays ? `交期 ${leadDays} 天` : '',
        ].filter(Boolean);

        return {
          id: product.id,
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          currentStock,
          forecast7Days: decision.forecast7Days,
          forecast30Days: decision.forecast30Days,
          dailyConsumption: Math.round(decision.dailyConsumption * 100) / 100,
          safetyStock,
          inTransit,
          inTransitQty: inTransit,
          platformInTransit,
          manualInTransit,
          suggestedQty: decision.suggestedQty,
          mappingId: platformMapping?.id,
          supplierId,
          supplier: supplierName,
          supplierName,
          supplySkuId: platformAvailable ? platformSku?.id : undefined,
          supplySkuName: platformAvailable ? platformSku?.name : undefined,
          quoteId: platformAvailable ? platformQuote?.id : undefined,
          supplyPrice,
          moq,
          leadDays,
          estimatedAmount: decision.suggestedQty * supplyPrice,
          reason: reasonParts.join('，'),
          availabilityStatus,
          canCreatePlatformOrder: platformAvailable,
          canCreateManualOrder: !platformAvailable,
        };
      })
      .filter((item) => item.suggestedQty > 0);
    if (suggestions.length && storeId && this.commissionService) {
      await this.commissionService.recordAmiContribution({
        storeId,
        category: 'inventory_alert',
        triggerType: 'inventory_replenishment',
        triggerId: storeId,
        workMinutes: 5,
        metadata: { suggestionCount: suggestions.length },
      });
    }
    return suggestions;
  }
}
