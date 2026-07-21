import { ConflictException } from '@nestjs/common';
import { InventoryService } from './inventory.service.js';
import {
  buildPurchaseOrderCreationFingerprint,
  buildPurchaseOrderIdempotencyKey,
} from './purchase-order-idempotency.js';

describe('InventoryService purchase order create idempotency', () => {
  const input = {
    storeId: 6,
    storeName: '门店6',
    supplier: '供应商A',
    expectedDate: '2026-07-25',
    status: '待审核',
    source: 'ami_brain',
    idempotencyKey: 'purchase-action-81',
    items: [{ productId: 11, productName: '精华液', sku: 'SKU-11', quantity: 10, unitPrice: 20 }],
  };
  const existing = {
    id: 81,
    orderNo: 'PUR81',
    idempotencyKey: buildPurchaseOrderIdempotencyKey(6, 'ami_brain', 'purchase-action-81'),
    creationFingerprint: buildPurchaseOrderCreationFingerprint(input),
    supplier: '供应商A',
    totalAmount: 200,
    status: '待审核',
    items: {
      storeId: 6,
      storeName: '门店6',
      expectedDate: '2026-07-25',
      source: 'ami_brain',
      items: [{ id: 1, productId: 11, productName: '精华液', sku: 'SKU-11', quantity: 10, receivedQty: 0, unitPrice: 20, subtotal: 200 }],
    },
    createdAt: new Date('2026-07-18T00:00:00.000Z'),
    updatedAt: new Date('2026-07-18T00:00:00.000Z'),
  };
  let prisma: any;
  let service: InventoryService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
      $executeRaw: jest.fn().mockResolvedValue(0),
      product: { count: jest.fn().mockResolvedValue(1) },
      purchaseOrder: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(existing),
      },
    };
    service = new InventoryService(prisma, { invalidate: jest.fn() } as never);
  });

  it('persists a scoped hash and immutable creation fingerprint', async () => {
    const result = await service.createPurchaseOrderIdempotent(input);

    expect(result).toMatchObject({ replayed: false, purchaseOrder: { id: 81, status: '待审核' } });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.purchaseOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: existing.idempotencyKey,
        creationFingerprint: existing.creationFingerprint,
        status: '待审核',
        totalAmount: 200,
      }),
    });
  });

  it('returns the original purchase order after later status changes', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue({ ...existing, status: '已下单' });

    const result = await service.createPurchaseOrderIdempotent(input);

    expect(result).toMatchObject({ replayed: true, purchaseOrder: { id: 81, status: '已下单' } });
    expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it('rejects the same key when quantity or status differs', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue(existing);

    await expect(service.createPurchaseOrderIdempotent({
      ...input,
      items: [{ ...input.items[0], quantity: 11 }],
    })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.createPurchaseOrderIdempotent({ ...input, status: '草稿' })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
  });

  it('separates the same raw key by store and source', () => {
    expect(buildPurchaseOrderIdempotencyKey(6, 'ami_brain', 'same')).not.toBe(
      buildPurchaseOrderIdempotencyKey(7, 'ami_brain', 'same'),
    );
    expect(buildPurchaseOrderIdempotencyKey(6, 'ami_brain', 'same')).not.toBe(
      buildPurchaseOrderIdempotencyKey(6, 'admin', 'same'),
    );
  });

  it('treats item order as non-semantic for replay', () => {
    const reversed = {
      ...input,
      items: [
        { productId: 12, productName: '面膜', sku: 'SKU-12', quantity: 2, unitPrice: 30 },
        input.items[0],
      ],
    };
    expect(buildPurchaseOrderCreationFingerprint(reversed)).toBe(
      buildPurchaseOrderCreationFingerprint({ ...reversed, items: [...reversed.items].reverse() }),
    );
  });
});
