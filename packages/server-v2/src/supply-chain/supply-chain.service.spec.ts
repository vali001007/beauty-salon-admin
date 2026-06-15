import { SupplyChainService } from './supply-chain.service.js';

describe('SupplyChainService', () => {
  let prisma: any;
  let service: SupplyChainService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      supplier: {
        findFirst: jest.fn(),
      },
      store: {
        findFirst: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      supplierOrder: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      supplierOrderItem: {
        update: jest.fn(),
        findMany: jest.fn(),
      },
      stockBatch: {
        create: jest.fn(),
      },
      stockMovement: {
        create: jest.fn(),
      },
      supplierSettlement: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(async (operations: any) => {
      if (Array.isArray(operations)) return Promise.all(operations);
      return operations(prisma);
    });
    service = new SupplyChainService(prisma);
  });

  it('creates supplier order with linked supply prices, rebate and platform fee', async () => {
    prisma.supplier.findFirst.mockResolvedValue({
      id: 9,
      storeId: 3,
      name: 'Supplier A',
      rebateRate: 0.05,
      store: { id: 3, name: 'Store A' },
    });
    prisma.store.findFirst.mockResolvedValue({ id: 3, name: 'Store A' });
    prisma.product.findMany.mockResolvedValue([
      {
        id: 101,
        storeId: 3,
        name: 'Cleanser',
        sku: 'SKU-101',
        unit: 'bottle',
        costPrice: 30,
        suppliers: [{ supplierId: 9, supplyPrice: 20 }],
      },
      {
        id: 102,
        storeId: 3,
        name: 'Mask',
        sku: 'SKU-102',
        unit: 'box',
        costPrice: 35,
        suppliers: [],
      },
    ]);
    prisma.supplierOrder.create.mockImplementation(async ({ data }: any) => ({
      id: 100,
      ...data,
      orderedAt: new Date('2026-06-08T08:00:00.000Z'),
      supplier: { id: 9, name: 'Supplier A' },
      store: { id: 3, name: 'Store A' },
      items: data.items.create.map((item: any, index: number) => ({
        id: index + 1,
        ...item,
        receivedQty: 0,
        product: {
          id: item.productId,
          name: item.productId === 101 ? 'Cleanser' : 'Mask',
          sku: item.productId === 101 ? 'SKU-101' : 'SKU-102',
          unit: item.productId === 101 ? 'bottle' : 'box',
        },
      })),
    }));

    const result = await service.createOrder({
      supplierId: 9,
      storeId: 3,
      status: 'draft',
      items: [
        { productId: 101, quantity: 2 },
        { productId: 102, quantity: 1 },
      ],
    });

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { id: { in: [101, 102] }, deletedAt: null },
      include: { suppliers: { where: { supplierId: 9 } } },
    });
    expect(prisma.supplierOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supplierId: 9,
          storeId: 3,
          totalAmount: 75,
          platformFee: 1.5,
          rebateAmount: 3.75,
          netAmount: 71.25,
          status: 'draft',
          items: {
            create: [
              { productId: 101, quantity: 2, unitPrice: 20, subtotal: 40 },
              { productId: 102, quantity: 1, unitPrice: 35, subtotal: 35 },
            ],
          },
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 100,
        supplierName: 'Supplier A',
        storeName: 'Store A',
        totalAmount: 75,
        platformFee: 1.5,
        rebateAmount: 3.75,
        netAmount: 71.25,
        platformRevenue: 5.25,
        productCount: 2,
        totalQuantity: 3,
        receivedQuantity: 0,
      }),
    );
  });

  it('receives supplier order into stock batches and stock movements', async () => {
    const tx = {
      supplierOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 100,
          orderNo: 'SPO-100',
          storeId: 3,
          status: 'ordered',
          receivedAt: null,
          items: [
            {
              id: 1,
              productId: 101,
              quantity: 5,
              receivedQty: 2,
              product: { id: 101, name: 'Cleanser', currentStock: 10, unit: 'bottle' },
            },
          ],
        }),
        update: jest.fn(),
      },
      supplierOrderItem: {
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ id: 1, quantity: 5, receivedQty: 5 }]),
      },
      stockBatch: {
        create: jest.fn().mockResolvedValue({ id: 77 }),
      },
      product: {
        update: jest.fn(),
      },
      stockMovement: {
        create: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));
    prisma.supplierOrder.findUnique.mockResolvedValue({
      id: 100,
      orderNo: 'SPO-100',
      supplierId: 9,
      storeId: 3,
      totalAmount: 100,
      platformFee: 2,
      rebateAmount: 5,
      netAmount: 95,
      status: 'received',
      receivedAt: new Date('2026-06-08T09:00:00.000Z'),
      supplier: { id: 9, name: 'Supplier A' },
      store: { id: 3, name: 'Store A' },
      items: [
        {
          id: 1,
          productId: 101,
          quantity: 5,
          unitPrice: 20,
          subtotal: 100,
          receivedQty: 5,
          product: { id: 101, name: 'Cleanser', sku: 'SKU-101', unit: 'bottle', suppliers: [] },
        },
      ],
    });

    const result = await service.receiveOrder(100, {
      items: [
        {
          orderItemId: 1,
          receivedQty: 3,
          batchNo: 'B-001',
          productionDate: '2026-06-01',
          expiryDate: '2027-06-01',
        },
      ],
      remark: 'first inbound',
    });

    expect(tx.stockBatch.create).toHaveBeenCalledWith({
      data: {
        productId: 101,
        batchNo: 'B-001',
        stock: 3,
        productionDate: new Date('2026-06-01'),
        expiryDate: new Date('2027-06-01'),
      },
    });
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 101 },
      data: { currentStock: { increment: 3 } },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 3,
        productId: 101,
        batchId: 77,
        movementNo: expect.stringMatching(/^SIN/),
        movementType: 'purchase_inbound',
        quantity: 3,
        beforeStock: 10,
        afterStock: 13,
        unit: 'bottle',
        sourceType: 'supplier_order',
        sourceId: 100,
        sourceNo: 'SPO-100',
        remark: 'first inbound',
      }),
    });
    expect(tx.supplierOrderItem.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { receivedQty: 5 },
    });
    expect(tx.supplierOrder.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { status: 'received', receivedAt: expect.any(Date) },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 100,
        status: 'received',
        affectedStoreId: 3,
        receivedQuantity: 5,
        totalQuantity: 5,
      }),
    );
  });

  it('generates supplier monthly settlements from received and settled orders', async () => {
    prisma.supplierOrder.findMany.mockResolvedValue([
      {
        id: 1,
        supplierId: 9,
        totalAmount: 1000,
        rebateAmount: 50,
        platformFee: 20,
        supplier: { id: 9, name: 'Supplier A' },
      },
      {
        id: 2,
        supplierId: 9,
        totalAmount: 500,
        rebateAmount: 25,
        platformFee: 10,
        supplier: { id: 9, name: 'Supplier A' },
      },
      {
        id: 3,
        supplierId: 10,
        totalAmount: 300,
        rebateAmount: 12,
        platformFee: 6,
        supplier: { id: 10, name: 'Supplier B' },
      },
    ]);
    prisma.supplierSettlement.upsert.mockImplementation(async ({ create }: any) => ({
      id: create.supplierId,
      ...create,
      status: 'draft',
      supplier: { id: create.supplierId, name: create.supplierId === 9 ? 'Supplier A' : 'Supplier B' },
    }));

    const result = await service.generateSettlement({ settleMonth: '2026-06' });

    expect(prisma.supplierOrder.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['received', 'settled'] },
        receivedAt: { gte: new Date(Date.UTC(2026, 5, 1)), lt: new Date(Date.UTC(2026, 6, 1)) },
      },
      include: { supplier: { select: { id: true, name: true } } },
    });
    expect(prisma.supplierSettlement.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { supplierId_settleMonth: { supplierId: 9, settleMonth: '2026-06' } },
        update: {
          orderCount: 2,
          totalAmount: 1500,
          rebateAmount: 75,
          platformFee: 30,
          netPayable: 1395,
        },
        create: {
          supplierId: 9,
          settleMonth: '2026-06',
          orderCount: 2,
          totalAmount: 1500,
          rebateAmount: 75,
          platformFee: 30,
          netPayable: 1395,
        },
      }),
    );
    expect(prisma.supplierSettlement.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { supplierId_settleMonth: { supplierId: 10, settleMonth: '2026-06' } },
        update: {
          orderCount: 1,
          totalAmount: 300,
          rebateAmount: 12,
          platformFee: 6,
          netPayable: 282,
        },
        create: {
          supplierId: 10,
          settleMonth: '2026-06',
          orderCount: 1,
          totalAmount: 300,
          rebateAmount: 12,
          platformFee: 6,
          netPayable: 282,
        },
      }),
    );
    expect(result).toEqual({
      total: 2,
      items: [
        expect.objectContaining({
          supplierId: 9,
          supplierName: 'Supplier A',
          settleMonth: '2026-06',
          orderCount: 2,
          totalAmount: 1500,
          rebateAmount: 75,
          platformFee: 30,
          platformRevenue: 105,
          netPayable: 1395,
        }),
        expect.objectContaining({
          supplierId: 10,
          supplierName: 'Supplier B',
          platformRevenue: 18,
          netPayable: 282,
        }),
      ],
    });
  });

  it('exports supplier settlements as a reconciliation csv with platform revenue', async () => {
    prisma.supplierSettlement.findMany.mockResolvedValue([
      {
        id: 1,
        supplierId: 9,
        settleMonth: '2026-06',
        orderCount: 3,
        totalAmount: 1200,
        rebateAmount: 60,
        platformFee: 24,
        netPayable: 1116,
        status: 'confirmed',
        confirmedAt: new Date('2026-06-30T09:00:00.000Z'),
        paidAt: null,
        supplier: { id: 9, name: 'Ami 官方供应链' },
      },
    ]);

    const result = await service.exportSettlements({ settleMonth: '2026-06', status: 'confirmed', supplierId: 9 });

    expect(prisma.supplierSettlement.findMany).toHaveBeenCalledWith({
      where: { supplierId: 9, settleMonth: '2026-06', status: 'confirmed' },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: [{ settleMonth: 'desc' }, { supplierId: 'asc' }],
    });
    expect(result.filename).toBe('supplier-settlements-2026-06.csv');
    expect(result.contentType).toBe('text/csv; charset=utf-8');
    expect(result.total).toBe(1);
    expect(result.content).toContain('"月份","供应商","采购单数","采购金额"');
    expect(result.content).toContain('"2026-06","Ami 官方供应链","3","1200","60","24","84","1116","confirmed"');
  });
});
