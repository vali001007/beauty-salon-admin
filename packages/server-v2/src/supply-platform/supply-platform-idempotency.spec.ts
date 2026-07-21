import { ConflictException } from '@nestjs/common';
import { SupplyPlatformService } from './supply-platform.service.js';
import {
  buildProcurementBatchCreationFingerprint,
  buildProcurementBatchIdempotencyKey,
  buildProcurementOrderCreationFingerprint,
  buildProcurementOrderIdempotencyKey,
  buildProcurementReceiptCreationFingerprint,
  buildProcurementReceiptIdempotencyKey,
} from './supply-platform-idempotency.js';

describe('supply platform idempotency', () => {
  const orderInput = {
    idempotencyKey: 'order-action-1',
    storeId: 6,
    supplierId: 8,
    sourceType: 'replenishment',
    sourceNo: 'REP-1',
    items: [{ productId: 101, supplySkuId: 1001, quoteId: 2001, quantity: 3 }],
  };
  const batchInput = {
    idempotencyKey: 'batch-action-1',
    storeId: 6,
    sourceNo: 'REP-1',
    items: [{ productId: 101, mappingId: 301, supplySkuId: 1001, quoteId: 2001, quantity: 3 }],
  };
  const receiptInput = {
    idempotencyKey: 'receipt-action-1',
    items: [{ shipmentItemId: 5001, productId: 101, receivedQty: 10 }],
    remark: '全部到货',
  };

  it('separates raw keys by store, source and order scope', () => {
    expect(buildProcurementOrderIdempotencyKey(6, 'replenishment', 'same')).not.toBe(
      buildProcurementOrderIdempotencyKey(7, 'replenishment', 'same'),
    );
    expect(buildProcurementOrderIdempotencyKey(6, 'replenishment', 'same')).not.toBe(
      buildProcurementOrderIdempotencyKey(6, 'manual', 'same'),
    );
    expect(buildProcurementBatchIdempotencyKey(6, 'same')).not.toBe(buildProcurementBatchIdempotencyKey(7, 'same'));
    expect(buildProcurementReceiptIdempotencyKey(3001, 'same')).not.toBe(
      buildProcurementReceiptIdempotencyKey(3002, 'same'),
    );
  });

  it('keeps item ordering outside immutable request fingerprints', () => {
    const orderItems = [
      { productId: 101, supplySkuId: 1001, quoteId: 2001, quantity: 3 },
      { productId: 102, supplySkuId: 1002, quoteId: 2002, quantity: 5 },
    ];
    expect(buildProcurementOrderCreationFingerprint({ ...orderInput, items: orderItems })).toBe(
      buildProcurementOrderCreationFingerprint({ ...orderInput, items: [...orderItems].reverse() }),
    );
    expect(buildProcurementBatchCreationFingerprint({ ...batchInput, items: orderItems })).toBe(
      buildProcurementBatchCreationFingerprint({ ...batchInput, items: [...orderItems].reverse() }),
    );
  });

  it('replays committed orders before mutable quote checks and rejects changed payloads', async () => {
    const stored = {
      id: 3001,
      idempotencyKey: buildProcurementOrderIdempotencyKey(6, 'replenishment', orderInput.idempotencyKey),
      creationFingerprint: buildProcurementOrderCreationFingerprint(orderInput),
      status: 'accepted',
    };
    const prisma: any = {
      procurementOrder: { findUnique: jest.fn().mockResolvedValue(stored) },
      supplySupplier: { findFirst: jest.fn() },
      supplyQuote: { findMany: jest.fn() },
    };
    const service = new SupplyPlatformService(prisma);

    await expect(service.createOrder(orderInput as any)).resolves.toMatchObject({
      id: 3001,
      duplicated: true,
      status: 'accepted',
    });
    await expect(service.createOrder({ ...orderInput, sourceNo: 'REP-2' } as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.supplySupplier.findFirst).not.toHaveBeenCalled();
    expect(prisma.supplyQuote.findMany).not.toHaveBeenCalled();
  });

  it('replays complete supplier batches before mapping checks and rejects changed lists', async () => {
    const fingerprint = buildProcurementBatchCreationFingerprint(batchInput);
    const stored = [
      { id: 3001, supplierId: 8, batchCreationFingerprint: fingerprint },
      { id: 3002, supplierId: 9, batchCreationFingerprint: fingerprint },
    ];
    const prisma: any = {
      procurementOrder: { findMany: jest.fn().mockResolvedValue(stored) },
      supplyCatalogMapping: { findMany: jest.fn() },
    };
    const service = new SupplyPlatformService(prisma);

    await expect(service.createOrdersFromReplenishment(batchInput as any)).resolves.toMatchObject({
      total: 2,
      duplicated: true,
    });
    await expect(
      service.createOrdersFromReplenishment({ ...batchInput, items: [{ ...batchInput.items[0], quantity: 4 }] } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.supplyCatalogMapping.findMany).not.toHaveBeenCalled();
  });

  it('marks a batch as duplicated when another request commits after the initial lookup', async () => {
    const fingerprint = buildProcurementBatchCreationFingerprint(batchInput);
    const stored = [{ id: 3001, supplierId: 8, batchCreationFingerprint: fingerprint }];
    const prisma: any = {
      $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
      $executeRaw: jest.fn().mockResolvedValue(0),
      procurementOrder: { findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(stored) },
    };
    const service = new SupplyPlatformService(prisma);

    await expect(service.createOrdersFromReplenishment(batchInput as any)).resolves.toMatchObject({
      total: 1,
      duplicated: true,
    });
  });

  it('replays committed receipts before order state checks and rejects changed quantities', async () => {
    const stored = {
      id: 8001,
      storeId: 6,
      idempotencyKey: buildProcurementReceiptIdempotencyKey(3001, receiptInput.idempotencyKey),
      creationFingerprint: buildProcurementReceiptCreationFingerprint(3001, receiptInput),
    };
    const prisma: any = { procurementReceipt: { findUnique: jest.fn().mockResolvedValue(stored) } };
    const service = new SupplyPlatformService(prisma);
    jest.spyOn(service, 'findOrder').mockResolvedValue({ id: 3001, status: 'received' } as any);

    await expect(service.receiveOrder(3001, receiptInput as any)).resolves.toMatchObject({
      id: 3001,
      receiptId: 8001,
      affectedStoreId: 6,
      duplicated: true,
    });
    await expect(
      service.receiveOrder(3001, { ...receiptInput, items: [{ ...receiptInput.items[0], receivedQty: 9 }] } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
