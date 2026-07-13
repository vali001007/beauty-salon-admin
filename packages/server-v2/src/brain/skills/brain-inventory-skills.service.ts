import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface InventoryRiskSummary {
  stockoutSkuCount: number;
  expiringStockValue: number;
  suggestedAction: string;
  lowStockProducts: Array<{ productId: number; name: string; currentStock: number; safetyStock: number }>;
  expiringProducts: Array<{ productId: number; name: string; stock: number; expiryDate?: string; estimatedValue: number }>;
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

export interface InventoryProcurementAnalysis {
  suggestions: Array<{
    productId: number;
    sku: string;
    productName: string;
    currentStock: number;
    safetyStock: number;
    suggestedQty: number;
    supplierName?: string;
    unitPrice?: number;
    estimatedCost?: number;
    leadDays?: number;
  }>;
  recentOrders: Array<{ orderNo: string; supplierName: string; amount: number; status: string; createdAt: string }>;
  suppliers: Array<{ supplierName: string; qualificationStatus: string; leadDays?: number; quoteCount: number }>;
}

@Injectable()
export class BrainInventorySkillsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async buildProcurementAnalysis(input: { storeId: number; keyword?: string }): Promise<InventoryProcurementAnalysis> {
    const products = await this.prisma.product.findMany({
      where: {
        storeId: input.storeId,
        deletedAt: null,
        status: 'active',
        ...(input.keyword
          ? { OR: [{ name: { contains: input.keyword } }, { sku: { contains: input.keyword } }, { brand: { contains: input.keyword } }] }
          : {}),
      },
      select: { id: true, sku: true, name: true, currentStock: true, safetyStock: true, minPurchaseQty: true },
      take: 200,
    });
    const productIds = products.map((product) => product.id);
    const [mappings, recentOrders] = await Promise.all([
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
        const baseQty = Math.max(0, Math.ceil(safetyStock * 2 - currentStock), product.minPurchaseQty);
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
        const suggestedQty = Math.max(baseQty, quote?.moq ?? 0);
        const unitPrice = quote ? this.toNumber(quote.price) : undefined;
        return {
          productId: product.id,
          sku: product.sku,
          productName: product.name,
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
        status: order.status,
        createdAt: order.createdAt.toISOString().slice(0, 10),
      })),
      suppliers: [...supplierStats.entries()]
        .map(([supplierName, value]) => ({ supplierName, ...value }))
        .sort((left, right) => left.qualificationStatus.localeCompare(right.qualificationStatus) || (left.leadDays ?? 999) - (right.leadDays ?? 999)),
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
