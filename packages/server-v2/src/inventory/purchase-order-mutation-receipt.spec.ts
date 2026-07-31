import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  buildBusinessMutationReceipt,
  buildBusinessMutationRequestFingerprint,
  buildBusinessMutationStateFingerprint,
} from '../common/mutation-receipt.js';
import { createTestPersistedBusinessDatabaseWriteSet } from '../common/database-write-set.testing.js';
import { InventoryService } from './inventory.service.js';

describe('InventoryService purchase order submission mutation receipt', () => {
  const before = purchaseOrder({ status: '草稿', updatedAt: new Date('2026-07-30T10:00:00.000Z') });
  const after = purchaseOrder({ status: '待审核', updatedAt: new Date('2026-07-30T10:00:01.000Z') });
  const requestPayload = {
    purchaseOrderId: 31,
    expectedPurchaseOrderUpdatedAt: before.updatedAt.toISOString(),
  };
  const context = {
    capabilityKey: 'submit_purchase_order_for_approval',
    idempotencyKey: 'brain-action-submit-purchase-31',
    mutationKind: 'state_transition' as const,
    requestPayload,
    actorId: 9,
  };
  let prisma: any;
  let service: InventoryService;

  beforeEach(() => {
    let writeSetRow: ReturnType<typeof createTestPersistedBusinessDatabaseWriteSet> | undefined;
    prisma = {
      $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          { transactionId: '777', tableCount: 120, monitorFingerprint: '1'.repeat(64), coverageComplete: true },
        ])
        .mockResolvedValueOnce([]),
      purchaseOrder: {
        findFirst: jest.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      businessMutationReceipt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
      businessDatabaseWriteSet: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const finalized = purchaseOrderWriteSet(data.id, data.idempotencyKey);
          writeSetRow = {
            ...finalized,
            status: 'collecting',
            entryCount: 0,
            writeSetFingerprint: null,
            finalizedAt: null,
          };
          return writeSetRow;
        }),
        findUnique: jest.fn().mockImplementation(async () => writeSetRow),
        updateMany: jest.fn().mockImplementation(async ({ data }: any) => {
          if (writeSetRow) writeSetRow = { ...writeSetRow, ...data };
          return { count: 1 };
        }),
      },
    };
    service = new InventoryService(prisma, { invalidate: jest.fn() } as never);
  });

  it('commits only the draft to pending-approval transition with an immutable receipt', async () => {
    const result = await service.submitPurchaseOrderForApproval(31, 6, before.updatedAt, context);

    expect(result).toMatchObject({
      id: 31,
      status: '待审核',
      mutationReplayed: false,
      mutationReceipt: {
        capabilityKey: 'submit_purchase_order_for_approval',
        businessObjectType: 'purchase_order',
        businessObjectId: '31',
        mutationKind: 'state_transition',
        changedFields: ['status'],
      },
    });
    expect(prisma.purchaseOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 31, storeId: 6, status: '草稿', updatedAt: before.updatedAt },
      data: { status: '待审核' },
    });
    expect(prisma.businessMutationReceipt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 6,
        capabilityKey: 'submit_purchase_order_for_approval',
        businessObjectType: 'purchase_order',
        businessObjectId: '31',
        mutationKind: 'state_transition',
        changedFields: ['status'],
        actorId: 9,
      }),
    });
  });

  it('rejects a stale frozen purchase-order version', async () => {
    prisma.purchaseOrder.findFirst.mockReset().mockResolvedValue({
      ...before,
      updatedAt: new Date('2026-07-30T10:00:02.000Z'),
    });

    await expect(service.submitPurchaseOrderForApproval(31, 6, before.updatedAt, context)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.purchaseOrder.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a purchase order that is no longer a draft', async () => {
    prisma.purchaseOrder.findFirst.mockReset().mockResolvedValue({ ...before, status: '待审核' });

    await expect(service.submitPurchaseOrderForApproval(31, 6, before.updatedAt, context)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.purchaseOrder.updateMany).not.toHaveBeenCalled();
  });

  it('returns the original causal receipt for an exact idempotent replay', async () => {
    const persisted = persistedReceipt(before, after, context);
    prisma.purchaseOrder.findFirst.mockReset().mockResolvedValue(after);
    prisma.businessMutationReceipt.findUnique.mockResolvedValue(persisted);
    prisma.businessDatabaseWriteSet.findUnique.mockResolvedValue(
      purchaseOrderWriteSet('00000000-0000-4000-8000-000000000031', context.idempotencyKey),
    );

    const result = await service.submitPurchaseOrderForApproval(31, 6, before.updatedAt, context);

    expect(result).toMatchObject({
      id: 31,
      status: '待审核',
      mutationReplayed: true,
      mutationReceipt: { receiptFingerprint: persisted.receiptFingerprint, changedFields: ['status'] },
    });
    expect(prisma.purchaseOrder.updateMany).not.toHaveBeenCalled();
    expect(prisma.businessMutationReceipt.create).not.toHaveBeenCalled();
  });

  it('rejects reuse of the same key for a different approved request payload', async () => {
    const persisted = persistedReceipt(before, after, context);
    prisma.purchaseOrder.findFirst.mockReset().mockResolvedValue(before);
    prisma.businessMutationReceipt.findUnique.mockResolvedValue(persisted);

    await expect(
      service.submitPurchaseOrderForApproval(31, 6, before.updatedAt, {
        ...context,
        requestPayload: { ...requestPayload, sourceMessage: 'different request' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.purchaseOrder.updateMany).not.toHaveBeenCalled();
  });

  it('fails closed when the purchase order is not in the current store', async () => {
    prisma.purchaseOrder.findFirst.mockReset().mockResolvedValue(null);

    await expect(service.submitPurchaseOrderForApproval(31, 7, before.updatedAt, context)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.purchaseOrder.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a transaction that changes any field beyond status', async () => {
    prisma.purchaseOrder.findFirst
      .mockReset()
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce({ ...after, supplier: '供应商B' });

    await expect(service.submitPurchaseOrderForApproval(31, 6, before.updatedAt, context)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.businessMutationReceipt.create).not.toHaveBeenCalled();
  });
});

function purchaseOrderWriteSet(writeSetId: string, idempotencyKey: string) {
  return createTestPersistedBusinessDatabaseWriteSet({
    capabilityKey: 'submit_purchase_order_for_approval',
    idempotencyKey,
    businessObjectId: 31,
    writeSetId,
    entries: [
      {
        modelName: 'PurchaseOrder',
        tableName: 'PurchaseOrder',
        operation: 'update',
        changedFields: ['status', 'updatedAt'],
        beforeStateFingerprint: '2'.repeat(64),
        afterStateFingerprint: '3'.repeat(64),
      },
      {
        modelName: 'BusinessMutationReceipt',
        tableName: 'business_mutation_receipt',
        operation: 'create',
        changedFields: ['id', 'storeId'],
        afterStateFingerprint: '4'.repeat(64),
      },
    ],
  });
}

function purchaseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 31,
    storeId: 6,
    orderNo: 'PUR20260730001',
    idempotencyKey: null,
    creationFingerprint: null,
    supplier: '供应商A',
    totalAmount: 160,
    status: '草稿',
    items: { items: [] },
    createdAt: new Date('2026-07-30T09:00:00.000Z'),
    updatedAt: new Date('2026-07-30T10:00:00.000Z'),
    ...overrides,
  };
}

function persistedReceipt(
  before: ReturnType<typeof purchaseOrder>,
  after: ReturnType<typeof purchaseOrder>,
  context: {
    capabilityKey: string;
    idempotencyKey: string;
    mutationKind: 'state_transition';
    requestPayload: Record<string, unknown>;
    actorId: number;
  },
) {
  const requestFingerprint = buildBusinessMutationRequestFingerprint({
    capabilityKey: context.capabilityKey,
    storeId: before.storeId,
    businessObjectType: 'purchase_order',
    businessObjectId: before.id,
    requestPayload: context.requestPayload,
  });
  const beforeVersion = before.updatedAt.toISOString();
  const afterVersion = after.updatedAt.toISOString();
  const beforeState = purchaseOrderState(before);
  const afterState = purchaseOrderState(after);
  const receipt = buildBusinessMutationReceipt({
    storeId: before.storeId,
    context,
    businessObjectType: 'purchase_order',
    businessObjectId: before.id,
    requestFingerprint,
    beforeVersion,
    afterVersion,
    beforeStateFingerprint: buildBusinessMutationStateFingerprint({
      businessObjectType: 'purchase_order',
      businessObjectId: before.id,
      version: beforeVersion,
      state: beforeState,
    }),
    afterStateFingerprint: buildBusinessMutationStateFingerprint({
      businessObjectType: 'purchase_order',
      businessObjectId: after.id,
      version: afterVersion,
      state: afterState,
    }),
    changedFields: ['status'],
    committedAt: new Date('2026-07-30T10:00:01.000Z'),
  });
  return {
    storeId: before.storeId,
    capabilityKey: context.capabilityKey,
    idempotencyKey: context.idempotencyKey,
    businessObjectType: 'purchase_order',
    businessObjectId: String(before.id),
    mutationKind: context.mutationKind,
    requestFingerprint,
    beforeVersion: receipt.before.version,
    afterVersion: receipt.after.version,
    beforeStateFingerprint: receipt.before.stateFingerprint,
    afterStateFingerprint: receipt.after.stateFingerprint,
    changedFields: [...receipt.changedFields],
    receiptFingerprint: receipt.receiptFingerprint,
    committedAt: new Date(receipt.committedAt),
  };
}

function purchaseOrderState(order: ReturnType<typeof purchaseOrder>) {
  return {
    storeId: Number(order.storeId),
    orderNo: String(order.orderNo),
    supplier: order.supplier,
    totalAmount: Number(order.totalAmount),
    status: String(order.status),
  };
}
