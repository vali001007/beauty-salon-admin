import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface InventoryRiskSummary {
  stockoutSkuCount: number;
  expiringStockValue: number;
  suggestedAction: string;
  lowStockProducts: Array<{ productId: number; name: string; currentStock: number; safetyStock: number }>;
  expiringProducts: Array<{ productId: number; name: string; stock: number; expiryDate?: string; estimatedValue: number }>;
}

export interface InventoryStockRiskFacts {
  stockoutProducts: Array<{
    productId: number;
    name: string;
    periodEndStock: number;
    stockoutObservedAt?: string;
  }>;
  lowStockProducts: Array<{ productId: number; name: string; currentStock: number; safetyStock: number }>;
}

export interface InventoryDetailAnalysis {
  totalSku: number;
  totalStockValue: number;
  products: Array<{
    productId: number;
    sku: string;
    name: string;
    stock: number;
    safetyStock: number;
    stockValue: number;
    outboundQty: number;
    inboundQty: number;
    coverageDays?: number;
  }>;
  movements: Array<{ occurredAt: string; productName: string; type: string; quantity: number; costAmount: number }>;
}

export interface InventoryAgingAnalysis {
  totalProductCount: number;
  batchCoveredProductCount: number;
  candidateCount: number;
  observationDays: number;
  minimumRecordedAgeDays: number;
  minimumCoverageDays: number;
  products: Array<{
    productId: number;
    sku: string;
    name: string;
    stock: number;
    safetyStock: number;
    stockValue: number;
    oldestBatchAgeDays: number;
    lastOutboundDays?: number;
    outboundQuantity: number;
    coverageDays?: number;
    reason: string;
  }>;
}

export interface InventoryTurnoverAnalysis {
  rangeDays: number;
  current: InventoryTurnoverPeriod;
  previous: InventoryTurnoverPeriod;
  rows: Array<{
    productId: number;
    productName: string;
    currentStock: number;
    outboundQuantity: number;
    eventWeightedAverageStock: number;
    operationalTurnoverRatio?: number;
    consumptionOccupancyRatio?: number;
    previousConsumptionOccupancyRatio?: number;
    consumptionOccupancyDelta?: number;
  }>;
  policy: 'operational_event_weighted_not_financial_turnover';
}

export interface InventoryTurnoverPeriod {
  outboundQuantity: number;
  eventWeightedAverageStock: number;
  operationalTurnoverRatio?: number;
  estimatedOutboundCost: number;
  eventWeightedAverageStockValue: number;
  consumptionOccupancyRatio?: number;
}

export interface InventoryProcurementAnalysis {
  suggestions: Array<{
    productId: number;
    sku: string;
    productName: string;
    unit?: string;
    currentStock: number;
    safetyStock: number;
    suggestedQty: number;
    supplierName?: string;
    unitPrice?: number;
    estimatedCost?: number;
    leadDays?: number;
  }>;
  recentOrders: Array<{
    orderNo: string;
    supplierName: string;
    amount: number;
    netAmount: number;
    status: string;
    createdAt: string;
    expectedArrivalDate?: string;
    receivedAt?: string;
    settledAt?: string;
  }>;
  orderItems?: Array<{
    orderNo: string;
    supplierName: string;
    productName?: string;
    categoryName: string;
    quantity: number;
    amount: number;
    status: string;
    createdAt: string;
  }>;
  suppliers: Array<{
    supplierId?: number;
    supplierName: string;
    status?: string;
    qualificationStatus: string;
    leadDays?: number;
    quoteCount: number;
  }>;
}

export type PurchaseOrderActionTargetResolution =
  | {
      ok: true;
      value: {
        id: number;
        orderNo: string;
        supplier: string;
        totalAmount: number;
        status: string;
        updatedAt: string;
      };
    }
  | { ok: false; reason: string; message: string };

@Injectable()
export class BrainInventorySkillsService {
  constructor(private readonly prisma: PrismaService) {}

  private firstMovementByProduct<T extends { productId: number }>(movements: T[]) {
    const result = new Map<number, T>();
    for (const movement of movements) {
      if (!result.has(movement.productId)) result.set(movement.productId, movement);
    }
    return result;
  }

  async buildInventoryRiskSummary(input: { storeId: number; expiringBefore: Date }): Promise<InventoryRiskSummary> {
    const [products, expiringBatches] = await Promise.all([
      this.prisma.product.findMany({
        where: { storeId: input.storeId, deletedAt: null, status: 'active' },
        select: { id: true, name: true, currentStock: true, safetyStock: true },
      }),
      this.prisma.stockBatch.findMany({
        where: {
          expiryDate: { lte: input.expiringBefore },
          stock: { gt: 0 },
          product: { storeId: input.storeId },
        },
        select: {
          productId: true,
          stock: true,
          unitCost: true,
          totalAmount: true,
          expiryDate: true,
          product: { select: { id: true, name: true } },
        },
      }),
    ]);

    const lowStockProducts = products
      .map((product) => ({
        productId: product.id,
        name: product.name,
        currentStock: this.toNumber(product.currentStock),
        safetyStock: this.toNumber(product.safetyStock),
      }))
      .filter((product) => product.safetyStock > 0 && product.currentStock < product.safetyStock);
    const expiringStockValue = expiringBatches.reduce((sum, batch) => {
      const totalAmount = this.toNumber(batch.totalAmount);
      return sum + (totalAmount > 0 ? totalAmount : this.toNumber(batch.stock) * this.toNumber(batch.unitCost));
    }, 0);
    const expiringProducts = expiringBatches.map((batch) => {
      const totalAmount = this.toNumber(batch.totalAmount);
      return {
        productId: batch.product?.id ?? batch.productId ?? 0,
        name: batch.product?.name ?? '产品',
        stock: this.toNumber(batch.stock),
        expiryDate: batch.expiryDate?.toISOString().slice(0, 10),
        estimatedValue: totalAmount > 0 ? totalAmount : this.toNumber(batch.stock) * this.toNumber(batch.unitCost),
      };
    });

    return {
      stockoutSkuCount: lowStockProducts.length,
      expiringStockValue,
      suggestedAction: lowStockProducts.length > 0 ? '先复核低于安全库存的 SKU，再人工确认补货单。' : '库存未触发低库存预警。',
      lowStockProducts,
      expiringProducts,
    };
  }

  async buildInventoryStockRiskFacts(input: {
    storeId: number;
    startDate: Date;
    endExclusive: Date;
  }): Promise<InventoryStockRiskFacts> {
    const products = await this.prisma.product.findMany({
      where: { storeId: input.storeId, deletedAt: null, status: 'active' },
      select: { id: true, name: true, currentStock: true, safetyStock: true },
      take: 1000,
    });
    const productIds = products.map((product) => product.id);
    if (!productIds.length) return { stockoutProducts: [], lowStockProducts: [] };

    const [periodMovements, beforeStartMovements, beforeEndMovements] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where: {
          storeId: input.storeId,
          productId: { in: productIds },
          occurredAt: { gte: input.startDate, lt: input.endExclusive },
        },
        select: { productId: true, beforeStock: true, afterStock: true, occurredAt: true },
        orderBy: [{ productId: 'asc' }, { occurredAt: 'asc' }],
        take: 10000,
      }),
      this.prisma.stockMovement.findMany({
        where: {
          storeId: input.storeId,
          productId: { in: productIds },
          occurredAt: { lt: input.startDate },
        },
        select: { productId: true, afterStock: true, occurredAt: true },
        orderBy: [{ occurredAt: 'desc' }],
        take: 10000,
      }),
      this.prisma.stockMovement.findMany({
        where: {
          storeId: input.storeId,
          productId: { in: productIds },
          occurredAt: { lt: input.endExclusive },
        },
        select: { productId: true, afterStock: true, occurredAt: true },
        orderBy: [{ occurredAt: 'desc' }],
        take: 10000,
      }),
    ]);

    const latestBeforeStart = this.firstMovementByProduct(beforeStartMovements);
    const latestBeforeEnd = this.firstMovementByProduct(beforeEndMovements);
    const firstPeriodMovement = new Map<number, (typeof periodMovements)[number]>();
    const stockoutObservedAt = new Map<number, string>();
    for (const movement of periodMovements) {
      if (!firstPeriodMovement.has(movement.productId)) {
        firstPeriodMovement.set(movement.productId, movement);
      }
      if (
        movement.afterStock != null &&
        this.toNumber(movement.afterStock) <= 0 &&
        !stockoutObservedAt.has(movement.productId)
      ) {
        stockoutObservedAt.set(movement.productId, movement.occurredAt.toISOString());
      }
    }

    const stockoutProducts = products
      .filter((product) => {
        const latestBefore = latestBeforeStart.get(product.id);
        const firstInPeriod = firstPeriodMovement.get(product.id);
        const currentStock = this.toNumber(product.currentStock);
        return (
          currentStock <= 0 ||
          (latestBefore?.afterStock != null && this.toNumber(latestBefore.afterStock) <= 0) ||
          (firstInPeriod?.beforeStock != null && this.toNumber(firstInPeriod.beforeStock) <= 0) ||
          stockoutObservedAt.has(product.id)
        );
      })
      .map((product) => {
        const latestBeforeEndMovement = latestBeforeEnd.get(product.id);
        return {
          productId: product.id,
          name: product.name,
          periodEndStock:
            latestBeforeEndMovement?.afterStock != null
              ? this.toNumber(latestBeforeEndMovement.afterStock)
              : this.toNumber(product.currentStock),
          ...(stockoutObservedAt.get(product.id)
            ? { stockoutObservedAt: stockoutObservedAt.get(product.id)!.slice(0, 10) }
            : {}),
        };
      })
      .sort((left, right) => left.productId - right.productId);

    const lowStockProducts = products
      .map((product) => {
        const latestBeforeEndMovement = latestBeforeEnd.get(product.id);
        return {
          productId: product.id,
          name: product.name,
          currentStock:
            latestBeforeEndMovement?.afterStock != null
              ? this.toNumber(latestBeforeEndMovement.afterStock)
              : this.toNumber(product.currentStock),
          safetyStock: this.toNumber(product.safetyStock),
        };
      })
      .filter((product) => product.safetyStock > 0 && product.currentStock < product.safetyStock)
      .sort((left, right) => left.productId - right.productId);

    return { stockoutProducts, lowStockProducts };
  }

  composeDisposalAdvice() {
    return `临期产品处理建议：
1. 先下架复核批次、开封状态和有效期，形成处理清单。
2. 未过期且符合使用标准的产品，优先安排到适配项目中合规消耗。
3. 已过期或状态异常的产品不得继续给客使用，按门店报损流程处理。
4. 如需做促销消化，先确认毛利、库存数量和客户适配范围。`;
  }

  async buildInventoryDetailAnalysis(input: {
    storeId: number;
    startDate: Date;
    endDate: Date;
    keyword?: string;
  }): Promise<InventoryDetailAnalysis> {
    const products = await this.prisma.product.findMany({
      where: {
        storeId: input.storeId,
        deletedAt: null,
        status: 'active',
        ...(input.keyword
          ? { OR: [{ name: { contains: input.keyword } }, { sku: { contains: input.keyword } }, { brand: { contains: input.keyword } }] }
          : {}),
      },
      select: { id: true, sku: true, name: true, currentStock: true, safetyStock: true, costPrice: true },
      take: 300,
    });
    const productIds = products.map((product) => product.id);
    const movements = productIds.length
      ? await this.prisma.stockMovement.findMany({
          where: {
            storeId: input.storeId,
            productId: { in: productIds },
            occurredAt: { gte: input.startDate, lte: input.endDate },
          },
          include: { product: { select: { name: true } } },
          orderBy: { occurredAt: 'desc' },
          take: 500,
        })
      : [];
    const byProduct = new Map<number, { outbound: number; inbound: number }>();
    for (const movement of movements) {
      const current = byProduct.get(movement.productId) ?? { outbound: 0, inbound: 0 };
      const quantity = Math.abs(this.toNumber(movement.quantity));
      if (/(out|consume|sale|usage|deduct|出库|消耗|销售)/i.test(movement.movementType)) current.outbound += quantity;
      if (/(in|purchase|receive|入库|采购|收货)/i.test(movement.movementType)) current.inbound += quantity;
      byProduct.set(movement.productId, current);
    }
    const periodDays = Math.max(1, Math.ceil((input.endDate.getTime() - input.startDate.getTime()) / 86400000));
    const rows = products.map((product) => {
      const stock = this.toNumber(product.currentStock);
      const movement = byProduct.get(product.id) ?? { outbound: 0, inbound: 0 };
      const dailyUsage = movement.outbound / periodDays;
      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        stock,
        safetyStock: this.toNumber(product.safetyStock),
        stockValue: stock * this.toNumber(product.costPrice),
        outboundQty: movement.outbound,
        inboundQty: movement.inbound,
        coverageDays: dailyUsage > 0 ? Math.floor(stock / dailyUsage) : undefined,
      };
    });
    return {
      totalSku: rows.length,
      totalStockValue: rows.reduce((sum, item) => sum + item.stockValue, 0),
      products: rows.sort((left, right) => right.outboundQty - left.outboundQty || left.coverageDays! - right.coverageDays!).slice(0, 30),
      movements: movements.slice(0, 30).map((movement) => ({
        occurredAt: movement.occurredAt.toISOString(),
        productName: movement.product.name,
        type: movement.movementType,
        quantity: this.toNumber(movement.quantity),
        costAmount: this.toNumber(movement.costAmount),
      })),
    };
  }

  async buildInventoryTurnoverAnalysis(input: {
    storeId: number;
    startDate: Date;
    endDate: Date;
  }): Promise<InventoryTurnoverAnalysis> {
    const rangeMs = Math.max(86_400_000, input.endDate.getTime() - input.startDate.getTime());
    const previousStartDate = new Date(input.startDate.getTime() - rangeMs);
    const rangeDays = Math.max(1, Math.ceil(rangeMs / 86_400_000));
    const products = await this.prisma.product.findMany({
      where: { storeId: input.storeId, deletedAt: null, status: 'active' },
      select: { id: true, name: true, currentStock: true, costPrice: true },
      take: 1000,
    });
    const productIds = products.map((product) => product.id);
    const movements = productIds.length
      ? await this.prisma.stockMovement.findMany({
          where: {
            storeId: input.storeId,
            productId: { in: productIds },
            occurredAt: { gte: previousStartDate, lte: input.endDate },
          },
          select: {
            productId: true,
            movementType: true,
            quantity: true,
            beforeStock: true,
            afterStock: true,
            occurredAt: true,
          },
          orderBy: [{ productId: 'asc' }, { occurredAt: 'asc' }],
          take: 50_000,
        })
      : [];
    const productById = new Map(products.map((product) => [product.id, product]));
    type ProductPeriod = {
      outboundQuantity: number;
      averageStockTotal: number;
      averageStockSamples: number;
      estimatedOutboundCost: number;
    };
    const emptyPeriod = (): ProductPeriod => ({
      outboundQuantity: 0,
      averageStockTotal: 0,
      averageStockSamples: 0,
      estimatedOutboundCost: 0,
    });
    const currentByProduct = new Map<number, ProductPeriod>();
    const previousByProduct = new Map<number, ProductPeriod>();
    const outboundMovement = (movementType: string, quantity: number) =>
      quantity < 0 || /(?:out|consume|consumption|sale|usage|deduct|scrap|transfer_out|manual_outbound|出库|消耗|销售|报损)/i.test(movementType);
    for (const movement of movements) {
      const currentPeriod = movement.occurredAt >= input.startDate;
      const target = currentPeriod ? currentByProduct : previousByProduct;
      const period = target.get(movement.productId) ?? emptyPeriod();
      const quantity = this.toNumber(movement.quantity);
      const product = productById.get(movement.productId);
      if (outboundMovement(movement.movementType, quantity)) {
        const outbound = Math.abs(quantity);
        period.outboundQuantity += outbound;
        period.estimatedOutboundCost += outbound * this.toNumber(product?.costPrice);
      }
      if (movement.beforeStock !== null && movement.afterStock !== null) {
        period.averageStockTotal += (this.toNumber(movement.beforeStock) + this.toNumber(movement.afterStock)) / 2;
        period.averageStockSamples += 1;
      }
      target.set(movement.productId, period);
    }
    const summarize = (byProduct: Map<number, ProductPeriod>): InventoryTurnoverPeriod => {
      let outboundQuantity = 0;
      let eventWeightedAverageStock = 0;
      let estimatedOutboundCost = 0;
      let eventWeightedAverageStockValue = 0;
      for (const [productId, period] of byProduct) {
        const averageStock = period.averageStockSamples > 0 ? period.averageStockTotal / period.averageStockSamples : 0;
        const costPrice = this.toNumber(productById.get(productId)?.costPrice);
        outboundQuantity += period.outboundQuantity;
        eventWeightedAverageStock += averageStock;
        estimatedOutboundCost += period.estimatedOutboundCost;
        eventWeightedAverageStockValue += averageStock * costPrice;
      }
      return {
        outboundQuantity,
        eventWeightedAverageStock,
        ...(eventWeightedAverageStock > 0
          ? { operationalTurnoverRatio: outboundQuantity / eventWeightedAverageStock }
          : {}),
        estimatedOutboundCost,
        eventWeightedAverageStockValue,
        ...(eventWeightedAverageStockValue > 0
          ? { consumptionOccupancyRatio: estimatedOutboundCost / eventWeightedAverageStockValue }
          : {}),
      };
    };
    const rows = products
      .map((product) => {
        const current = currentByProduct.get(product.id) ?? emptyPeriod();
        const previous = previousByProduct.get(product.id) ?? emptyPeriod();
        const currentAverageStock =
          current.averageStockSamples > 0 ? current.averageStockTotal / current.averageStockSamples : 0;
        const previousAverageStock =
          previous.averageStockSamples > 0 ? previous.averageStockTotal / previous.averageStockSamples : 0;
        const costPrice = this.toNumber(product.costPrice);
        const currentRatio = currentAverageStock > 0 ? current.outboundQuantity / currentAverageStock : undefined;
        const currentConsumptionRatio =
          currentAverageStock > 0 && costPrice > 0
            ? current.estimatedOutboundCost / (currentAverageStock * costPrice)
            : undefined;
        const previousConsumptionRatio =
          previousAverageStock > 0 && costPrice > 0
            ? previous.estimatedOutboundCost / (previousAverageStock * costPrice)
            : undefined;
        return {
          productId: product.id,
          productName: product.name,
          currentStock: this.toNumber(product.currentStock),
          outboundQuantity: current.outboundQuantity,
          eventWeightedAverageStock: currentAverageStock,
          ...(currentRatio === undefined ? {} : { operationalTurnoverRatio: currentRatio }),
          ...(currentConsumptionRatio === undefined ? {} : { consumptionOccupancyRatio: currentConsumptionRatio }),
          ...(previousConsumptionRatio === undefined
            ? {}
            : { previousConsumptionOccupancyRatio: previousConsumptionRatio }),
          ...(currentConsumptionRatio === undefined || previousConsumptionRatio === undefined
            ? {}
            : { consumptionOccupancyDelta: currentConsumptionRatio - previousConsumptionRatio }),
        };
      })
      .filter((row) => row.outboundQuantity > 0 || row.currentStock > 0)
      .sort(
        (left, right) =>
          (right.operationalTurnoverRatio ?? -1) - (left.operationalTurnoverRatio ?? -1) ||
          right.outboundQuantity - left.outboundQuantity ||
          left.productName.localeCompare(right.productName, 'zh-CN'),
      );
    return {
      rangeDays,
      current: summarize(currentByProduct),
      previous: summarize(previousByProduct),
      rows,
      policy: 'operational_event_weighted_not_financial_turnover',
    };
  }

  async buildInventoryAgingAnalysis(input: {
    storeId: number;
    asOf?: Date;
    observationDays?: number;
  }): Promise<InventoryAgingAnalysis> {
    const asOf = input.asOf ? new Date(input.asOf) : new Date();
    const observationDays = Math.max(30, Math.min(180, input.observationDays ?? 90));
    const minimumRecordedAgeDays = 30;
    const minimumCoverageDays = 180;
    const observationStart = new Date(asOf.getTime() - observationDays * 86_400_000);
    const products = await this.prisma.product.findMany({
      where: { storeId: input.storeId, deletedAt: null, status: 'active', currentStock: { gt: 0 } },
      select: {
        id: true,
        sku: true,
        name: true,
        currentStock: true,
        safetyStock: true,
        costPrice: true,
      },
      take: 500,
    });
    const productIds = products.map((product) => product.id);
    const [batches, movements] = productIds.length
      ? await Promise.all([
          this.prisma.stockBatch.findMany({
            where: { productId: { in: productIds }, stock: { gt: 0 } },
            select: { productId: true, createdAt: true },
            orderBy: [{ productId: 'asc' }, { createdAt: 'asc' }],
            take: 10_000,
          }),
          this.prisma.stockMovement.findMany({
            where: {
              storeId: input.storeId,
              productId: { in: productIds },
              occurredAt: { lte: asOf },
            },
            select: { productId: true, movementType: true, quantity: true, occurredAt: true },
            orderBy: { occurredAt: 'desc' },
            take: 20_000,
          }),
        ])
      : [[], []];
    const oldestBatchByProduct = new Map<number, Date>();
    for (const batch of batches) {
      const current = oldestBatchByProduct.get(batch.productId);
      if (!current || batch.createdAt < current) oldestBatchByProduct.set(batch.productId, batch.createdAt);
    }
    const outboundByProduct = new Map<number, { quantity: number; lastAt?: Date }>();
    for (const movement of movements) {
      if (!/(out|consume|consumption|sale|usage|deduct|scrap|transfer_out|manual_outbound|出库|消耗|销售|报损)/i.test(movement.movementType)) continue;
      const current = outboundByProduct.get(movement.productId) ?? { quantity: 0 };
      if (!current.lastAt || movement.occurredAt > current.lastAt) current.lastAt = movement.occurredAt;
      if (movement.occurredAt >= observationStart) current.quantity += Math.abs(this.toNumber(movement.quantity));
      outboundByProduct.set(movement.productId, current);
    }
    const ageDays = (value: Date) => Math.max(0, Math.floor((asOf.getTime() - value.getTime()) / 86_400_000));
    const rows = products.flatMap((product) => {
      const oldestBatch = oldestBatchByProduct.get(product.id);
      if (!oldestBatch) return [];
      const oldestBatchAgeDays = ageDays(oldestBatch);
      const outbound = outboundByProduct.get(product.id) ?? { quantity: 0 };
      const effectiveObservationDays = Math.max(1, Math.min(observationDays, oldestBatchAgeDays || 1));
      const stock = this.toNumber(product.currentStock);
      const safetyStock = this.toNumber(product.safetyStock);
      const dailyOutbound = outbound.quantity / effectiveObservationDays;
      const coverageDays = dailyOutbound > 0 ? Math.ceil(stock / dailyOutbound) : undefined;
      const lastOutboundDays = outbound.lastAt ? ageDays(outbound.lastAt) : undefined;
      const isSlowMoving = outbound.quantity === 0 ||
        (coverageDays !== undefined && coverageDays >= minimumCoverageDays) ||
        (lastOutboundDays !== undefined && lastOutboundDays >= 30 && safetyStock > 0 && stock >= safetyStock * 2);
      if (oldestBatchAgeDays < minimumRecordedAgeDays || !isSlowMoving) return [];
      const reason = outbound.quantity === 0
        ? `已记录在库 ${oldestBatchAgeDays} 天，观察期内无出库`
        : `已记录在库 ${oldestBatchAgeDays} 天，按近 ${effectiveObservationDays} 天出库速度预计可用 ${coverageDays} 天`;
      return [{
        productId: product.id,
        sku: product.sku,
        name: product.name,
        stock,
        safetyStock,
        stockValue: stock * this.toNumber(product.costPrice),
        oldestBatchAgeDays,
        lastOutboundDays,
        outboundQuantity: outbound.quantity,
        coverageDays,
        reason,
      }];
    }).sort((left, right) => {
      if (left.outboundQuantity === 0 && right.outboundQuantity !== 0) return -1;
      if (right.outboundQuantity === 0 && left.outboundQuantity !== 0) return 1;
      return (right.coverageDays ?? Number.MAX_SAFE_INTEGER) - (left.coverageDays ?? Number.MAX_SAFE_INTEGER) ||
        right.oldestBatchAgeDays - left.oldestBatchAgeDays || right.stockValue - left.stockValue;
    });
    return {
      totalProductCount: products.length,
      batchCoveredProductCount: oldestBatchByProduct.size,
      candidateCount: rows.length,
      observationDays,
      minimumRecordedAgeDays,
      minimumCoverageDays,
      products: rows,
    };
  }

  async buildProcurementAnalysis(input: {
    storeId: number;
    keyword?: string;
    productId?: number;
  }): Promise<InventoryProcurementAnalysis> {
    const products = await this.prisma.product.findMany({
      where: {
        storeId: input.storeId,
        deletedAt: null,
        status: 'active',
        ...(input.productId ? { id: input.productId } : {}),
        ...(input.keyword
          ? { OR: [{ name: { contains: input.keyword } }, { sku: { contains: input.keyword } }, { brand: { contains: input.keyword } }] }
          : {}),
      },
      select: {
        id: true,
        sku: true,
        name: true,
        unit: true,
        currentStock: true,
        safetyStock: true,
        minPurchaseQty: true,
      },
      take: 200,
    });
    const productIds = products.map((product) => product.id);
    const [mappings, recentOrders, procurementItems, suppliers] = await Promise.all([
      productIds.length
        ? this.prisma.supplyCatalogMapping.findMany({
            where: {
              productId: { in: productIds },
              mappingStatus: 'active',
              OR: [{ storeId: input.storeId }, { storeId: null }],
            },
            include: {
              supplySku: {
                include: {
                  quotes: {
                    where: { deletedAt: null },
                    include: { supplier: { select: { name: true, qualificationStatus: true } } },
                    orderBy: [{ price: 'asc' }, { leadDays: 'asc' }],
                  },
                },
              },
            },
          })
        : Promise.resolve([]),
      this.prisma.procurementOrder.findMany({
        where: { storeId: input.storeId },
        include: { supplier: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.procurementOrderItem.findMany({
        where: { order: { storeId: input.storeId } },
        select: {
          quantity: true,
          subtotal: true,
          order: {
            select: {
              orderNo: true,
              status: true,
              createdAt: true,
              supplier: { select: { name: true } },
            },
          },
          product: {
            select: {
              name: true,
              category: { select: { name: true } },
            },
          },
        },
        orderBy: { order: { createdAt: 'desc' } },
        take: 200,
      }),
      this.prisma.supplySupplier.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, status: true, qualificationStatus: true },
        orderBy: [{ status: 'asc' }, { id: 'asc' }],
        take: 200,
      }),
    ]);
    const mappingsByProduct = new Map<number, typeof mappings>();
    for (const mapping of mappings) {
      if (!mapping.productId) continue;
      const rows = mappingsByProduct.get(mapping.productId) ?? [];
      rows.push(mapping);
      mappingsByProduct.set(mapping.productId, rows);
    }
    const supplierStats = new Map<string, { qualificationStatus: string; leadDays?: number; quoteCount: number }>();
    const suggestions = products
      .map((product) => {
        const currentStock = this.toNumber(product.currentStock);
        const safetyStock = this.toNumber(product.safetyStock);
        const needsReorder = safetyStock > 0 && currentStock < safetyStock;
        const baseQty = needsReorder ? Math.max(Math.ceil(safetyStock * 2 - currentStock), product.minPurchaseQty) : 0;
        const quotes = (mappingsByProduct.get(product.id) ?? [])
          .flatMap((mapping) => mapping.supplySku.quotes)
          .sort((left, right) => this.toNumber(left.price) - this.toNumber(right.price) || (left.leadDays ?? 999) - (right.leadDays ?? 999));
        for (const quote of quotes) {
          const current = supplierStats.get(quote.supplier.name) ?? {
            qualificationStatus: quote.supplier.qualificationStatus,
            leadDays: quote.leadDays ?? undefined,
            quoteCount: 0,
          };
          current.quoteCount += 1;
          current.leadDays = current.leadDays == null ? quote.leadDays ?? undefined : Math.min(current.leadDays, quote.leadDays ?? current.leadDays);
          supplierStats.set(quote.supplier.name, current);
        }
        const quote = quotes[0];
        const suggestedQty = needsReorder ? Math.max(baseQty, quote?.moq ?? 0) : 0;
        const unitPrice = quote ? this.toNumber(quote.price) : undefined;
        return {
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          unit: product.unit || undefined,
          currentStock,
          safetyStock,
          suggestedQty,
          supplierName: quote?.supplier.name,
          unitPrice,
          estimatedCost: unitPrice === undefined ? undefined : suggestedQty * unitPrice,
          leadDays: quote?.leadDays ?? undefined,
        };
      })
      .filter((item) => item.suggestedQty > 0 || Boolean(input.keyword))
      .sort((left, right) => right.suggestedQty - left.suggestedQty)
      .slice(0, 20);

    return {
      suggestions,
      recentOrders: recentOrders.map((order) => ({
        orderNo: order.orderNo,
        supplierName: order.supplier.name,
        amount: this.toNumber(order.totalAmount),
        netAmount: this.toNumber(order.netAmount),
        status: order.status,
        createdAt: order.createdAt.toISOString().slice(0, 10),
        expectedArrivalDate: order.expectedArrivalDate?.toISOString().slice(0, 10),
        receivedAt: order.receivedAt?.toISOString().slice(0, 10),
        settledAt: order.settledAt?.toISOString().slice(0, 10),
      })),
      orderItems: procurementItems.map((item) => ({
        orderNo: item.order.orderNo,
        supplierName: item.order.supplier.name,
        productName: item.product?.name,
        categoryName: item.product?.category?.name ?? '未分类',
        quantity: item.quantity,
        amount: this.toNumber(item.subtotal),
        status: item.order.status,
        createdAt: item.order.createdAt.toISOString().slice(0, 10),
      })),
      suppliers: suppliers
        .map((supplier) => {
          const quoteStats = supplierStats.get(supplier.name);
          return {
            supplierId: supplier.id,
            supplierName: supplier.name,
            status: supplier.status,
            qualificationStatus: supplier.qualificationStatus,
            leadDays: quoteStats?.leadDays,
            quoteCount: quoteStats?.quoteCount ?? 0,
          };
        })
        .sort(
          (left, right) =>
            left.status.localeCompare(right.status) ||
            left.qualificationStatus.localeCompare(right.qualificationStatus) ||
            (left.leadDays ?? 999) - (right.leadDays ?? 999) ||
            left.supplierName.localeCompare(right.supplierName),
        ),
    };
  }

  async resolvePurchaseOrderActionTarget(input: {
    storeId: number;
    purchaseOrderId?: number;
    reference?: string;
  }): Promise<PurchaseOrderActionTargetResolution> {
    const reference = input.reference?.trim();
    const numericReference = Number(reference);
    const ids = [
      input.purchaseOrderId,
      Number.isInteger(numericReference) && numericReference > 0 ? numericReference : undefined,
    ].filter((value): value is number => Number.isInteger(value) && Number(value) > 0);
    const orderNumbers = reference && !/^\d+$/u.test(reference) ? [reference] : [];
    if (!ids.length && !orderNumbers.length) {
      return {
        ok: false,
        reason: 'purchase_order_target_missing',
        message: '请提供要提交审核的采购单编号，例如 PUR20260730001。',
      };
    }
    const matches = await this.prisma.purchaseOrder.findMany({
      where: {
        storeId: input.storeId,
        OR: [
          ...(ids.length ? [{ id: { in: [...new Set(ids)] } }] : []),
          ...(orderNumbers.length ? [{ orderNo: { in: [...new Set(orderNumbers)] } }] : []),
        ],
      },
      select: {
        id: true,
        orderNo: true,
        supplier: true,
        totalAmount: true,
        status: true,
        updatedAt: true,
      },
      take: 3,
    });
    if (!matches.length) {
      return {
        ok: false,
        reason: 'purchase_order_not_in_context_store',
        message: '当前门店没有找到该采购单，请核对采购单编号。',
      };
    }
    if (matches.length !== 1) {
      return {
        ok: false,
        reason: 'purchase_order_target_ambiguous',
        message: '当前目标对应多张采购单，请明确唯一采购单编号。',
      };
    }
    const order = matches[0];
    return {
      ok: true,
      value: {
        id: order.id,
        orderNo: order.orderNo,
        supplier: order.supplier ?? '未记录供应商',
        totalAmount: this.toNumber(order.totalAmount),
        status: String(order.status),
        updatedAt: order.updatedAt.toISOString(),
      },
    };
  }

  private toNumber(value: unknown) {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') return Number(value);
    if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
    return 0;
  }
}
