import { RefundInventoryReversalService } from './refund-inventory-reversal.service';

describe('RefundInventoryReversalService', () => {
  const service = new RefundInventoryReversalService();

  it('does not create stock movements for refund only', async () => {
    const tx: any = { stockMovement: { findMany: jest.fn(), create: jest.fn() } };

    const result = await service.reverseForRefund(tx, {
      id: 1,
      refundMode: 'refund_only',
      order: { id: 10, orderNo: 'PO10', storeId: 1 },
      items: [{ id: 11, orderItemId: 101, itemType: 'product', itemId: 8, quantity: 1 }],
    } as any);

    expect(result).toEqual([]);
    expect(tx.stockMovement.findMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('creates a sale return using original batch and unit cost', async () => {
    const tx: any = {
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([
          { id: 4, productId: 8, batchId: 3, quantity: -2, unit: '瓶', unitCost: 30, costSource: 'batch' },
        ]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 9, ...data })),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({ id: 8, currentStock: 5 }),
        update: jest.fn(),
      },
      stockBatch: {
        findUnique: jest.fn().mockResolvedValue({ id: 3, stock: 2 }),
        update: jest.fn(),
      },
    };

    const result = await service.reverseForRefund(tx, {
      id: 1,
      refundMode: 'return_and_refund',
      order: { id: 10, orderNo: 'PO10', storeId: 1 },
      items: [{ id: 11, orderItemId: 101, itemType: 'product', itemId: 8, quantity: 1 }],
    } as any);

    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: 'sale_return_in',
        productId: 8,
        batchId: 3,
        quantity: 1,
        unitCost: 30,
        costAmount: 30,
        sourceType: 'refund_item',
        sourceId: 11,
        orderItemId: 101,
        refundItemId: 11,
      }),
    });
    expect(result).toHaveLength(1);
    expect(tx.stockBatch.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { stock: 3 } });
  });

  it('creates project consumable reversals from original movements instead of current BOM', async () => {
    const tx: any = {
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([
          { id: 5, productId: 9, batchId: 4, quantity: -4, unit: 'ml', unitCost: 2, costSource: 'batch' },
        ]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 10, ...data })),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({ id: 9, currentStock: 20 }),
        update: jest.fn(),
      },
      stockBatch: {
        findUnique: jest.fn().mockResolvedValue({ id: 4, stock: 10 }),
        update: jest.fn(),
      },
    };

    await service.reverseForRefund(tx, {
      id: 1,
      refundMode: 'return_and_refund',
      order: { id: 10, orderNo: 'PO10', storeId: 1 },
      items: [
        { id: 12, orderItemId: 102, itemType: 'project', itemId: 2, quantity: 0.5, originalOrderItemQuantity: 1 },
      ],
    } as any);

    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: 'service_consume_reverse',
        productId: 9,
        quantity: 2,
        costAmount: 4,
      }),
    });
  });
});
