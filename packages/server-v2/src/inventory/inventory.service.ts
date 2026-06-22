import { Injectable, NotFoundException } from '@nestjs/common';
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

  private createMovementNo(prefix = 'SM') {
    return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private getStockStatus(item: { currentStock?: unknown; safetyStock?: unknown }) {
    const currentStock = this.toNumber(item.currentStock);
    const safetyStock = this.toNumber(item.safetyStock);
    if (currentStock <= 0) return '缺货';
    if (safetyStock > 0 && currentStock < safetyStock) return '低库存';
    if (safetyStock > 0 && currentStock > safetyStock * 4) return '积压';
    return '正常';
  }

  private mapStockItem(item: any) {
    return {
      ...item,
      status: this.getStockStatus(item),
    };
  }

  async getStock(storeId?: number, page = 1, pageSize = 20) {
    const where: any = { deletedAt: null };
    if (storeId) where.storeId = storeId;

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, name: true, sku: true, unit: true, currentStock: true, safetyStock: true, status: true },
      }),
      this.prisma.product.count({ where }),
    ]);
    const mapped = items.map((item) => this.mapStockItem(item));
    return { items: mapped, data: mapped, total, page, pageSize };
  }

  async getBatches(productId: number) {
    return this.prisma.stockBatch.findMany({
      where: { productId },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async getExpiring(page = 1, pageSize = 20, storeId?: number) {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const where: any = { expiryDate: { lte: thirtyDaysFromNow }, stock: { gt: 0 } };
    if (storeId) where.product = { storeId };
    const [items, total] = await Promise.all([
      this.prisma.stockBatch.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { product: { select: { name: true, sku: true, costPrice: true, store: { select: { name: true } } } } },
        orderBy: { expiryDate: 'asc' },
      }),
      this.prisma.stockBatch.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  async inbound(data: { productId: number; batchNo: string; stock: number; productionDate?: string; expiryDate?: string; remark?: string }) {
    const { batch, storeId } = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: Number(data.productId) } });
      if (!product) throw new NotFoundException('Product not found');

      const quantity = this.toNumber(data.stock);
      const beforeStock = this.toNumber(product.currentStock);
      const afterStock = beforeStock + quantity;

      const batch = await tx.stockBatch.create({
        data: {
          productId: Number(data.productId),
          batchNo: data.batchNo,
          stock: quantity,
          productionDate: data.productionDate ? new Date(data.productionDate) : undefined,
          expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
        },
      });

      await tx.product.update({
        where: { id: Number(data.productId) },
        data: { currentStock: { increment: quantity } },
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
          unit: product.unit,
          sourceType: 'stock_batch',
          sourceId: batch.id,
          sourceNo: data.batchNo,
          remark: data.remark,
        },
      });

      return { batch, storeId: product.storeId };
    });
    this.invalidateInventoryDashboardCache(storeId);
    return batch;
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
          product: { select: { id: true, name: true, sku: true, unit: true } },
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
    const viewItems = items.map((order) => {
      const payload = order.items && typeof order.items === 'object' && !Array.isArray(order.items)
        ? order.items as { items?: unknown; storeName?: string; expectedDate?: string }
        : undefined;
      const orderItems = Array.isArray(order.items) ? order.items : Array.isArray(payload?.items) ? payload.items : [];
      return {
        ...order,
        totalAmount: Number(order.totalAmount ?? 0),
        productCount: orderItems.length,
        storeName: payload?.storeName ?? '全部门店',
        createDate: formatBusinessDate(order.createdAt),
        expectedDate: payload?.expectedDate ?? '',
        items: orderItems,
      };
    });
    return { items: viewItems, data: viewItems, total, page, pageSize };
  }

  async createPurchaseOrder(data: any) {
    const orderNo = `PUR${Date.now()}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
    const items: Array<{ quantity?: number | string; unitPrice?: number | string }> = Array.isArray(data.items) ? data.items : [];
    const totalAmount = items.reduce((sum, item) => sum + Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0), 0);
    const payload = {
      items,
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

  // Transfer Orders
  async getTransfers(page = 1, pageSize = 20) {
    const [items, total] = await Promise.all([
      this.prisma.transferOrder.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.transferOrder.count(),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  async createTransfer(data: any) {
    const orderNo = `TRF${Date.now()}`;
    const items = Array.isArray(data.items) ? data.items : [];
    const shouldApplyStock = data.applyStock === true || ['completed', 'received', 'done'].includes(String(data.status || ''));

    const affectedStoreIds = new Set<number>();
    const order = await this.prisma.$transaction(async (tx) => {
      const order = await tx.transferOrder.create({
        data: {
          orderNo,
          fromStoreId: Number(data.fromStoreId),
          toStoreId: Number(data.toStoreId),
          productCount: data.productCount ?? items.length,
          status: data.status ?? 'pending',
          items,
        },
      });

      if (!shouldApplyStock) return order;

      for (const item of items) {
        const productId = Number(item.productId ?? item.itemId);
        const quantity = this.toNumber(item.quantity ?? item.qty ?? item.stock);
        if (!productId || quantity <= 0) continue;

        const fromProduct = await tx.product.findFirst({
          where: { id: productId, storeId: order.fromStoreId, deletedAt: null },
        });
        if (!fromProduct) continue;

        const fromBefore = this.toNumber(fromProduct.currentStock);
        const fromAfter = fromBefore - quantity;
        await tx.product.update({
          where: { id: fromProduct.id },
          data: { currentStock: { decrement: quantity } },
        });
        await tx.stockMovement.create({
          data: {
            storeId: order.fromStoreId,
            productId: fromProduct.id,
            movementNo: this.createMovementNo('TO'),
            movementType: 'transfer_out',
            quantity: -quantity,
            beforeStock: fromBefore,
            afterStock: fromAfter,
            unit: fromProduct.unit,
            sourceType: 'transfer_order',
            sourceId: order.id,
            sourceNo: order.orderNo,
            remark: data.remark,
          },
        });
        affectedStoreIds.add(order.fromStoreId);

        const toProduct = await tx.product.findFirst({
          where: { sku: fromProduct.sku, storeId: order.toStoreId, deletedAt: null },
        });
        if (!toProduct) continue;

        const toBefore = this.toNumber(toProduct.currentStock);
        const toAfter = toBefore + quantity;
        await tx.product.update({
          where: { id: toProduct.id },
          data: { currentStock: { increment: quantity } },
        });
        await tx.stockMovement.create({
          data: {
            storeId: order.toStoreId,
            productId: toProduct.id,
            movementNo: this.createMovementNo('TI'),
            movementType: 'transfer_in',
            quantity,
            beforeStock: toBefore,
            afterStock: toAfter,
            unit: toProduct.unit,
            sourceType: 'transfer_order',
            sourceId: order.id,
            sourceNo: order.orderNo,
            remark: data.remark,
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

    const products = await this.prisma.product.findMany({
      where: { ...where, currentStock: { lte: this.prisma.product.fields.safetyStock } },
      include: {
        suppliers: {
          where: { supplier: { status: 'active', deletedAt: null } },
          include: { supplier: { select: { id: true, name: true } } },
          orderBy: [{ isPrimary: 'desc' }, { supplyPrice: 'asc' }],
          take: 1,
        },
      },
    });

    const productIds = products.map((product) => product.id);
    const inTransitByProduct = storeId && this.supplyPlatformService
      ? await this.supplyPlatformService.getInTransitByProduct(storeId, productIds)
      : new Map<number, number>();
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
                    OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
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
      if (mapping.productId && !mappingByProduct.has(mapping.productId)) mappingByProduct.set(mapping.productId, mapping);
    }

    const suggestions = products
      .filter((p) => Number(p.currentStock) <= Number(p.safetyStock))
      .map((product) => {
        const primarySupplier = product.suppliers?.[0];
        const platformMapping = mappingByProduct.get(product.id);
        const platformSku = platformMapping?.supplySku;
        const platformQuote = platformSku?.quotes?.[0];
        const currentStock = Number(product.currentStock ?? 0);
        const safetyStock = Number(product.safetyStock ?? 0);
        const inTransit = inTransitByProduct.get(product.id) ?? 0;
        const baseSuggestedQty = Math.max(0, safetyStock * 2 - currentStock - inTransit);
        const moq = platformQuote?.moq ?? primarySupplier?.moq ?? product.minPurchaseQty ?? null;
        const suggestedQty = Math.max(baseSuggestedQty, Number(moq ?? 0));
        const supplyPrice = Number(platformQuote?.price ?? primarySupplier?.supplyPrice ?? product.costPrice ?? 0);
        const supplierId = platformSku?.supplierId ?? primarySupplier?.supplierId;
        const supplierName = platformSku?.supplier?.name ?? primarySupplier?.supplier?.name ?? product.supplier ?? '默认供应商';
        const availabilityStatus = platformQuote ? 'platform_available' : primarySupplier ? 'legacy_supplier_available' : 'manual_purchase';
        const reasonParts = [
          `当前库存 ${currentStock}`,
          `安全库存 ${safetyStock}`,
          inTransit > 0 ? `在途 ${inTransit}` : '暂无在途',
          moq ? `起订量 ${moq}` : '',
          platformQuote?.leadDays ? `交期 ${platformQuote.leadDays} 天` : '',
        ].filter(Boolean);

        return {
          id: product.id,
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          currentStock,
          forecast7Days: Math.max(1, Math.round(safetyStock * 0.8)),
          safetyStock,
          inTransit,
          inTransitQty: inTransit,
          suggestedQty,
          supplierId,
          supplier: supplierName,
          supplierName,
          supplySkuId: platformSku?.id,
          supplySkuName: platformSku?.name,
          quoteId: platformQuote?.id,
          supplyPrice,
          moq,
          leadDays: platformQuote?.leadDays ?? primarySupplier?.leadDays ?? null,
          estimatedAmount: suggestedQty * supplyPrice,
          reason: reasonParts.join('，'),
          availabilityStatus,
        };
      });
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
