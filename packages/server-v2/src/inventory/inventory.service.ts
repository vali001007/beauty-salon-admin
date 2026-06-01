import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  private createMovementNo(prefix = 'SM') {
    return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
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
    return { items, data: items, total, page, pageSize };
  }

  async getBatches(productId: number) {
    return this.prisma.stockBatch.findMany({
      where: { productId },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async getExpiring(page = 1, pageSize = 20) {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const where = { expiryDate: { lte: thirtyDaysFromNow }, stock: { gt: 0 } };
    const [items, total] = await Promise.all([
      this.prisma.stockBatch.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { product: { select: { name: true, sku: true } } },
        orderBy: { expiryDate: 'asc' },
      }),
      this.prisma.stockBatch.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  async inbound(data: { productId: number; batchNo: string; stock: number; productionDate?: string; expiryDate?: string; remark?: string }) {
    return this.prisma.$transaction(async (tx) => {
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

      return batch;
    });
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
        createDate: order.createdAt.toISOString().slice(0, 10),
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
      createDate: order.createdAt.toISOString().slice(0, 10),
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

    return this.prisma.$transaction(async (tx) => {
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
      }

      return order;
    });
  }

  // Replenishment suggestions
  async getReplenishment(storeId?: number) {
    const where: any = { deletedAt: null };
    if (storeId) where.storeId = storeId;

    const products = await this.prisma.product.findMany({
      where: { ...where, currentStock: { lte: this.prisma.product.fields.safetyStock } },
    });

    return products
      .filter((p) => Number(p.currentStock) <= Number(p.safetyStock))
      .map((product) => ({
        id: product.id,
        productName: product.name,
        sku: product.sku,
        currentStock: Number(product.currentStock ?? 0),
        forecast7Days: Math.max(1, Math.round(Number(product.safetyStock ?? 0) * 0.8)),
        safetyStock: Number(product.safetyStock ?? 0),
        inTransit: 0,
        suggestedQty: Math.max(0, Number(product.safetyStock ?? 0) * 2 - Number(product.currentStock ?? 0)),
        supplier: product.supplier ?? '默认供应商',
        estimatedAmount: Math.max(0, Number(product.safetyStock ?? 0) * 2 - Number(product.currentStock ?? 0)) * Number(product.costPrice ?? 0),
      }));
  }
}
