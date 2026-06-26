import { InventoryService } from './inventory.service';

describe('InventoryService terminal dashboard cache', () => {
  let service: InventoryService;
  let prisma: jest.Mocked<any>;
  let terminalDashboardCache: { invalidate: jest.Mock };
  let commissionService: { recordAmiContribution: jest.Mock };

  beforeEach(() => {
    terminalDashboardCache = { invalidate: jest.fn() };
    commissionService = { recordAmiContribution: jest.fn() };
    prisma = {
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
      product: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        fields: { safetyStock: 'safetyStock' },
      },
      stockBatch: {
        create: jest.fn(),
      },
      stockMovement: {
        create: jest.fn(),
      },
      transferOrder: {
        create: jest.fn(),
      },
      supplyCatalogMapping: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new InventoryService(prisma as any, terminalDashboardCache as any, commissionService as any);
  });

  it('invalidates manager inventory alerts after inbound stock changes', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 10,
      storeId: 2,
      currentStock: 3,
      unit: '瓶',
    });
    prisma.stockBatch.create.mockResolvedValue({ id: 101, productId: 10, batchNo: 'B-001', stock: 5 });

    const result = await service.inbound({ productId: 10, batchNo: 'B-001', stock: 5 });

    expect(result).toMatchObject({ id: 101 });
    expect(terminalDashboardCache.invalidate).toHaveBeenCalledWith(2, ['role', 'manager', 'inventory-alerts']);
  });

  it('returns non-negative stock values for historical negative products', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 10,
        name: '院装洁面乳',
        sku: 'SKU-10',
        unit: '瓶',
        currentStock: -164,
        safetyStock: 0,
        status: 'active',
      },
    ]);
    prisma.product.count.mockResolvedValue(1);

    const result = await service.getStock(1);

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        currentStock: 0,
        availableStock: 0,
        safetyStock: 0,
        status: '缺货',
      }),
    );
  });

  it('invalidates source and target store inventory alerts after completed transfer applies stock', async () => {
    prisma.transferOrder.create.mockResolvedValue({
      id: 88,
      orderNo: 'TRF88',
      fromStoreId: 1,
      toStoreId: 2,
    });
    prisma.product.findFirst
      .mockResolvedValueOnce({
        id: 10,
        sku: 'SKU-10',
        storeId: 1,
        currentStock: 8,
        unit: '瓶',
      })
      .mockResolvedValueOnce({
        id: 20,
        sku: 'SKU-10',
        storeId: 2,
        currentStock: 1,
        unit: '瓶',
      });

    await service.createTransfer({
      fromStoreId: 1,
      toStoreId: 2,
      status: 'completed',
      items: [{ productId: 10, quantity: 3 }],
    });

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { currentStock: 5 },
    });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: { currentStock: 4 },
    });
    expect(terminalDashboardCache.invalidate).toHaveBeenCalledWith(1, ['role', 'manager', 'inventory-alerts']);
    expect(terminalDashboardCache.invalidate).toHaveBeenCalledWith(2, ['role', 'manager', 'inventory-alerts']);
  });

  it('caps completed transfer stock at zero when requested quantity exceeds stock', async () => {
    prisma.transferOrder.create.mockResolvedValue({
      id: 90,
      orderNo: 'TRF90',
      fromStoreId: 1,
      toStoreId: 2,
    });
    prisma.product.findFirst
      .mockResolvedValueOnce({
        id: 10,
        sku: 'SKU-10',
        storeId: 1,
        currentStock: 2,
        unit: '瓶',
      })
      .mockResolvedValueOnce({
        id: 20,
        sku: 'SKU-10',
        storeId: 2,
        currentStock: 1,
        unit: '瓶',
      });

    await service.createTransfer({
      fromStoreId: 1,
      toStoreId: 2,
      status: 'completed',
      items: [{ productId: 10, quantity: 5 }],
      remark: '调拨测试',
    });

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { currentStock: 0 },
    });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: { currentStock: 3 },
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: 'transfer_out',
        quantity: -2,
        beforeStock: 2,
        afterStock: 0,
        remark: '调拨测试；库存不足：本次申请 5，实际扣减 2，不足 3',
      }),
    });
  });

  it('does not invalidate inventory alerts when transfer is only a pending document', async () => {
    prisma.transferOrder.create.mockResolvedValue({
      id: 89,
      orderNo: 'TRF89',
      fromStoreId: 1,
      toStoreId: 2,
    });

    await service.createTransfer({
      fromStoreId: 1,
      toStoreId: 2,
      status: 'pending',
      items: [{ productId: 10, quantity: 3 }],
    });

    expect(terminalDashboardCache.invalidate).not.toHaveBeenCalled();
  });

  it('records Ami inventory alert work minutes when replenishment suggestions exist', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 10,
        name: '精华液',
        sku: 'SKU-10',
        currentStock: 2,
        safetyStock: 5,
        costPrice: 20,
        minPurchaseQty: 3,
        supplier: '旧供应商文本',
        suppliers: [
          {
            supplierId: 88,
            supplyPrice: 18,
            moq: 12,
            supplier: { id: 88, name: '正式主供应商' },
          },
        ],
      },
    ]);

    const result = await service.getReplenishment(1);

    expect(result).toHaveLength(1);
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, storeId: 1, currentStock: { lte: prisma.product.fields.safetyStock } },
      include: {
        suppliers: {
          where: { supplier: { status: 'active', deletedAt: null } },
          include: { supplier: { select: { id: true, name: true } } },
          orderBy: [{ isPrimary: 'desc' }, { supplyPrice: 'asc' }],
          take: 1,
        },
      },
    });
    expect(result[0]).toEqual(
      expect.objectContaining({
        supplierId: 88,
        supplier: '正式主供应商',
        supplyPrice: 18,
        moq: 12,
        suggestedQty: 12,
        estimatedAmount: 216,
      }),
    );
    expect(commissionService.recordAmiContribution).toHaveBeenCalledWith({
      storeId: 1,
      category: 'inventory_alert',
      triggerType: 'inventory_replenishment',
      triggerId: 1,
      workMinutes: 5,
      metadata: { suggestionCount: 1 },
    });
  });
});
