import { deductStockItems } from './inventory-stock-deduction.js';

function createTx(options: { product?: any; batches?: any[]; existingMovement?: any } = {}) {
  const product = options.product ?? { id: 10, storeId: 1, currentStock: 10, unit: '瓶' };
  return {
    product: {
      findFirst: jest.fn().mockResolvedValue(product),
      update: jest.fn().mockResolvedValue({}),
    },
    stockBatch: {
      findMany: jest.fn().mockResolvedValue(options.batches ?? []),
      update: jest.fn().mockResolvedValue({}),
    },
    stockMovement: {
      findFirst: jest.fn().mockResolvedValue(options.existingMovement ?? null),
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: Math.floor(Math.random() * 1000), ...data })),
    },
  };
}

describe('inventory stock deduction helper', () => {
  it('deducts outbound stock by FIFO batches before updating product stock', async () => {
    const tx = createTx({
      product: { id: 10, storeId: 1, currentStock: 10, unit: '瓶', costPrice: 12 },
      batches: [
        { id: 1, productId: 10, stock: 2, unitCost: 8, expiryDate: new Date('2026-07-01'), createdAt: new Date('2026-01-01') },
        { id: 2, productId: 10, stock: 5, unitCost: 10, expiryDate: new Date('2026-08-01'), createdAt: new Date('2026-01-02') },
      ],
    });

    await deductStockItems(tx, {
      storeId: 1,
      movementType: 'service_consume',
      source: { type: 'project_order', id: 100, no: 'PO100', remark: '项目订单自动扣耗材' },
      items: [{ productId: 10, quantity: 6 }],
    });

    expect(tx.stockBatch.update).toHaveBeenNthCalledWith(1, { where: { id: 1 }, data: { stock: 0 } });
    expect(tx.stockBatch.update).toHaveBeenNthCalledWith(2, { where: { id: 2 }, data: { stock: 1 } });
    expect(tx.product.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { currentStock: 4 } });
    expect(tx.stockMovement.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ batchId: 1, quantity: -2, beforeStock: 10, afterStock: 8, unitCost: 8, costAmount: 16, costSource: 'batch_snapshot' }),
    });
    expect(tx.stockMovement.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ batchId: 2, quantity: -4, beforeStock: 8, afterStock: 4, unitCost: 10, costAmount: 40, costSource: 'batch_snapshot' }),
    });
  });

  it('deducts main stock and records no-batch remark when no batch is available', async () => {
    const tx = createTx({ product: { id: 11, storeId: 1, currentStock: 5, unit: '盒', costPrice: 7 }, batches: [] });

    await deductStockItems(tx, {
      storeId: 1,
      movementType: 'sale_out',
      source: { type: 'product_order', id: 101, no: 'SO101', remark: '商品订单自动扣库存' },
      items: [{ productId: 11, quantity: 3 }],
    });

    expect(tx.product.update).toHaveBeenCalledWith({ where: { id: 11 }, data: { currentStock: 2 } });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        batchId: undefined,
        quantity: -3,
        beforeStock: 5,
        afterStock: 2,
        unitCost: 7,
        costAmount: 21,
        costSource: 'product_master_estimate',
        remark: expect.stringContaining('无可用批次'),
      }),
    });
  });

  it('skips deduction when the same source and movement type already exists', async () => {
    const tx = createTx({ existingMovement: { id: 1 } });

    await deductStockItems(tx, {
      storeId: 1,
      movementType: 'service_consume',
      source: { type: 'card_usage', id: 200, no: 'CARD200' },
      items: [{ productId: 10, quantity: 1 }],
    });

    expect(tx.product.findFirst).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
});
