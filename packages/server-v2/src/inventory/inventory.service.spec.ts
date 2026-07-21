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
      $executeRaw: jest.fn().mockResolvedValue(0),
      product: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
        fields: { safetyStock: 'safetyStock' },
      },
      stockBatch: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      stockMovement: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      transferOrder: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      purchaseOrder: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      store: {
        findUnique: jest.fn(),
      },
      supplyCatalogMapping: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    prisma.store.findUnique.mockImplementation(({ where }: any) => Promise.resolve({ id: where.id, name: `门店${where.id}` }));
    service = new InventoryService(prisma as any, terminalDashboardCache as any, commissionService as any);
  });

  it('invalidates manager inventory alerts after inbound stock changes', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 10,
      storeId: 2,
      currentStock: 3,
      unit: '瓶',
    });
    prisma.stockBatch.findFirst.mockResolvedValue(null);
    prisma.stockBatch.create.mockResolvedValue({ id: 101, productId: 10, batchNo: 'B-001', stock: 5 });

    const result = await service.inbound({ productId: 10, batchNo: 'B-001', quantity: 5 });

    expect(result).toMatchObject({ id: 101 });
    expect(terminalDashboardCache.invalidate).toHaveBeenCalledWith(2, ['role', 'manager', 'inventory-alerts']);
  });

  it('writes operator to inbound stock movement for audit tracing', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 10,
      storeId: 2,
      currentStock: 3,
      unit: '瓶',
    });
    prisma.stockBatch.findFirst.mockResolvedValue(null);
    prisma.stockBatch.create.mockResolvedValue({ id: 101, productId: 10, batchNo: 'B-001', stock: 5 });

    await service.inbound({
      productId: 10,
      batchNo: 'B-001',
      quantity: 5,
      operatorId: 7,
      remark: '库存发布前验收-真实入库',
    });

    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: 'inbound',
        sourceType: 'stock_batch',
        sourceId: 101,
        sourceNo: 'B-001',
        operatorId: 7,
        remark: expect.stringContaining('库存发布前验收-真实入库'),
      }),
    });
  });

  it('writes inbound cost snapshots to batch and stock movement', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 10,
      storeId: 2,
      currentStock: 3,
      unit: '瓶',
      costPrice: 12,
      supplier: '默认供应商',
    });
    prisma.stockBatch.findFirst.mockResolvedValue(null);
    prisma.stockBatch.create.mockResolvedValue({ id: 101, productId: 10, batchNo: 'B-001', stock: 5 });

    await service.inbound({
      productId: 10,
      batchNo: 'B-001',
      quantity: 5,
      unitCost: 8,
      totalAmount: 40,
      supplier: '核心耗材供应商',
    });

    expect(prisma.stockBatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 10,
        batchNo: 'B-001',
        stock: 5,
        unitCost: 8,
        totalAmount: 40,
        supplierName: '核心耗材供应商',
      }),
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: 'inbound',
        unitCost: 8,
        costAmount: 40,
        costSource: 'inbound_cost',
        remark: expect.stringContaining('供应商 核心耗材供应商'),
      }),
    });
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

    const result = await service.getStock({ storeId: 1 });

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        currentStock: 0,
        availableStock: 0,
        safetyStock: 0,
        status: '缺货',
      }),
    );
  });

  it('falls back to primary supplier relation for stock supplier display', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 10,
        name: '射频仪器导入凝胶',
        sku: 'IND-6-STD-GEL-RF-001',
        unit: '支',
        costPrice: 50,
        supplier: null,
        currentStock: 100,
        safetyStock: 10,
        status: 'active',
        suppliers: [{ supplier: { name: '核心耗材供应商' } }],
      },
    ]);
    prisma.product.count.mockResolvedValue(1);

    const result = await service.getStock({ storeId: 1 });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          supplier: true,
          suppliers: {
            where: { supplier: { status: 'active', deletedAt: null } },
            select: { supplier: { select: { name: true } } },
            orderBy: [{ isPrimary: 'desc' }, { supplyPrice: 'asc' }],
            take: 1,
          },
        }),
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        supplier: '核心耗材供应商',
      }),
    );
  });

  it('keeps backward compatibility with legacy inbound stock field', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 10,
      storeId: 2,
      currentStock: 3,
      unit: '瓶',
    });
    prisma.stockBatch.findFirst.mockResolvedValue(null);
    prisma.stockBatch.create.mockResolvedValue({ id: 101, productId: 10, batchNo: 'B-001', stock: 5 });

    await service.inbound({ productId: 10, batchNo: 'B-001', stock: 5 });

    expect(prisma.stockBatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stock: 5,
      }),
    });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { currentStock: 8 },
    });
  });

  it('merges inbound quantity into an existing batch with the same product and batch number', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 10,
      storeId: 2,
      currentStock: 3,
      unit: '瓶',
    });
    prisma.stockBatch.findFirst.mockResolvedValue({ id: 101, productId: 10, batchNo: 'B-001', stock: 4 });
    prisma.stockBatch.update.mockResolvedValue({ id: 101, productId: 10, batchNo: 'B-001', stock: 9 });

    const result = await service.inbound({ productId: 10, batchNo: 'B-001', quantity: 5 });

    expect(result).toMatchObject({ id: 101 });
    expect(prisma.stockBatch.create).not.toHaveBeenCalled();
    expect(prisma.stockBatch.update).toHaveBeenCalledWith({
      where: { id: 101 },
      data: expect.objectContaining({
        stock: 9,
        unitCost: 0,
        totalAmount: 0,
      }),
    });
  });

  it('rejects inbound when expiry date is before production date', async () => {
    await expect(service.inbound({
      productId: 10,
      batchNo: 'B-001',
      quantity: 5,
      productionDate: '2026-06-10',
      expiryDate: '2026-06-01',
    })).rejects.toThrow('过期日期不能早于生产日期');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates manual outbound adjustment with product, batch, and movement updates', async () => {
    prisma.product.findFirst.mockResolvedValue({
      id: 10,
      storeId: 2,
      sku: 'SKU-10',
      currentStock: 8,
      unit: '瓶',
    });
    prisma.stockBatch.findFirst.mockResolvedValue({ id: 101, productId: 10, batchNo: 'B-001', stock: 6 });
    prisma.stockBatch.update.mockResolvedValue({ id: 101, productId: 10, batchNo: 'B-001', stock: 3 });
    prisma.stockMovement.create.mockResolvedValue({ id: 501, storeId: 2 });

    const result = await service.createAdjustment({
      productId: 10,
      batchId: 101,
      adjustmentType: 'manual_outbound',
      quantity: 3,
      reason: '库存发布前验收-手工出库',
    });

    expect(result).toMatchObject({ id: 501 });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { currentStock: 5 },
    });
    expect(prisma.stockBatch.update).toHaveBeenCalledWith({
      where: { id: 101 },
      data: { stock: 3 },
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: 'manual_outbound',
        quantity: -3,
        beforeStock: 8,
        afterStock: 5,
        sourceType: 'inventory_adjustment',
        sourceNo: 'B-001',
        remark: '库存发布前验收-手工出库',
      }),
    });
    expect(terminalDashboardCache.invalidate).toHaveBeenCalledWith(2, ['role', 'manager', 'inventory-alerts']);
  });

  it('rejects outbound adjustment when selected batch has no available stock', async () => {
    prisma.product.findFirst.mockResolvedValue({
      id: 10,
      storeId: 2,
      sku: 'SKU-10',
      currentStock: 8,
      unit: '瓶',
    });
    prisma.stockBatch.findFirst.mockResolvedValue({ id: 101, productId: 10, batchNo: 'B-001', stock: 0 });

    await expect(service.createAdjustment({
      productId: 10,
      batchId: 101,
      adjustmentType: 'manual_outbound',
      quantity: 3,
    })).rejects.toThrow('当前库存不足，无法出库');

    expect(prisma.stockMovement.create).not.toHaveBeenCalled();
  });

  it('keeps acceptance marker on scrap out adjustments', async () => {
    prisma.product.findFirst.mockResolvedValue({
      id: 10,
      storeId: 2,
      sku: 'SKU-10',
      currentStock: 8,
      unit: '瓶',
    });
    prisma.stockBatch.findFirst.mockResolvedValue({ id: 101, productId: 10, batchNo: 'B-001', stock: 6 });
    prisma.stockBatch.update.mockResolvedValue({ id: 101, productId: 10, batchNo: 'B-001', stock: 5 });
    prisma.stockMovement.create.mockResolvedValue({ id: 504, storeId: 2 });

    await service.createAdjustment({
      productId: 10,
      batchId: 101,
      adjustmentType: 'scrap_out',
      quantity: 1,
      reason: '库存发布前验收-临期报废',
    });

    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: 'scrap_out',
        quantity: -1,
        beforeStock: 8,
        afterStock: 7,
        sourceType: 'inventory_adjustment',
        sourceNo: 'B-001',
        remark: '库存发布前验收-临期报废',
      }),
    });
  });

  it('creates stocktake gain adjustment as inbound movement', async () => {
    prisma.product.findFirst.mockResolvedValue({
      id: 10,
      storeId: 2,
      sku: 'SKU-10',
      currentStock: 8,
      unit: '瓶',
    });
    prisma.stockMovement.create.mockResolvedValue({ id: 502, storeId: 2 });

    await service.createAdjustment({
      productId: 10,
      adjustmentType: 'stocktake_gain',
      quantity: 4,
      reason: '盘点盘盈',
    });

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { currentStock: 12 },
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: 'stocktake_gain',
        quantity: 4,
        beforeStock: 8,
        afterStock: 12,
        sourceType: 'stocktake',
      }),
    });
  });

  it('creates stocktake loss movement with stocktake source type', async () => {
    prisma.product.findFirst.mockResolvedValue({
      id: 10,
      storeId: 2,
      sku: 'SKU-10',
      currentStock: 8,
      unit: '瓶',
    });
    prisma.stockMovement.create.mockResolvedValue({ id: 503, storeId: 2 });

    await service.createAdjustment({
      productId: 10,
      adjustmentType: 'stocktake_loss',
      quantity: 3,
      remark: '账面 8；实盘 5；差异 -3',
    });

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { currentStock: 5 },
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: 'stocktake_loss',
        quantity: -3,
        beforeStock: 8,
        afterStock: 5,
        sourceType: 'stocktake',
        remark: '账面 8；实盘 5；差异 -3',
      }),
    });
  });

  it('keeps acceptance supplier marker when creating manual purchase orders', async () => {
    prisma.purchaseOrder.create.mockResolvedValue({
      id: 72,
      orderNo: 'PUR72',
      supplier: '库存验收供应商',
      status: '已审核',
      totalAmount: 8.8,
      items: {
        storeId: 2,
        storeName: 'Ami 全量演示门店',
        expectedDate: '2026-06-28',
        source: 'manual',
        items: [
          { id: 1, productId: 10, productName: '眼周护理膜', sku: 'SKU-EYE', quantity: 1, receivedQty: 0, unitPrice: 8.8, subtotal: 8.8 },
        ],
      },
      createdAt: new Date('2026-06-28T00:00:00Z'),
    });

    const result = await service.createPurchaseOrder({
      storeId: 2,
      storeName: 'Ami 全量演示门店',
      supplier: '库存验收供应商',
      status: '已审核',
      expectedDate: '2026-06-28',
      items: [{ productId: 10, productName: '眼周护理膜', sku: 'SKU-EYE', quantity: 1, unitPrice: 8.8 }],
    });

    expect(result).toEqual(expect.objectContaining({
      id: 72,
      supplier: '库存验收供应商',
      status: '已审核',
      totalAmount: 8.8,
      productCount: 1,
      storeName: 'Ami 全量演示门店',
    }));
    expect(prisma.purchaseOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        supplier: '库存验收供应商',
        status: '已审核',
        totalAmount: 8.8,
        items: expect.objectContaining({
          storeId: 2,
          storeName: 'Ami 全量演示门店',
          expectedDate: '2026-06-28',
          items: [expect.objectContaining({ productId: 10, sku: 'SKU-EYE' })],
        }),
      }),
    });
  });

  it('updates manual purchase order status before receiving', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue({
      id: 70,
      orderNo: 'PUR70',
      status: '草稿',
      totalAmount: 100,
      items: { storeName: '门店1', expectedDate: '2026-07-01', items: [] },
      createdAt: new Date('2026-06-28T00:00:00Z'),
    });
    prisma.purchaseOrder.update.mockResolvedValue({
      id: 70,
      orderNo: 'PUR70',
      status: '已下单',
      totalAmount: 100,
      items: { storeName: '门店1', expectedDate: '2026-07-01', items: [] },
      createdAt: new Date('2026-06-28T00:00:00Z'),
    });

    const result = await service.updatePurchaseOrderStatus(70, { status: '已下单' });

    expect(result).toMatchObject({ id: 70, status: '已下单', storeName: '门店1' });
    expect(prisma.purchaseOrder.update).toHaveBeenCalledWith({
      where: { id: 70 },
      data: { status: '已下单' },
    });
  });

  it('receives manual purchase order items into batches, stock, and movements', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue({
      id: 71,
      orderNo: 'PUR71',
      status: '已下单',
      totalAmount: 100,
      items: {
        storeName: '门店1',
        expectedDate: '2026-07-01',
        items: [
          { id: 1, productName: '补水面膜', sku: 'SKU-10', quantity: 10, receivedQty: 2, unitPrice: 10, subtotal: 100 },
        ],
      },
      createdAt: new Date('2026-06-28T00:00:00Z'),
    });
    prisma.product.findFirst.mockResolvedValue({
      id: 10,
      storeId: 2,
      sku: 'SKU-10',
      name: '补水面膜',
      currentStock: 5,
      unit: '盒',
    });
    prisma.stockBatch.create.mockResolvedValue({ id: 801, productId: 10, batchNo: 'B-PUR71', stock: 3 });
    prisma.stockMovement.create.mockResolvedValue({ id: 901, storeId: 2 });
    prisma.purchaseOrder.update.mockResolvedValue({
      id: 71,
      orderNo: 'PUR71',
      status: '部分收货',
      totalAmount: 100,
      items: {
        storeName: '门店1',
        expectedDate: '2026-07-01',
        items: [
          { id: 1, productName: '补水面膜', sku: 'SKU-10', quantity: 10, receivedQty: 5, unitPrice: 10, subtotal: 100 },
        ],
      },
      createdAt: new Date('2026-06-28T00:00:00Z'),
    });

    const result = await service.receivePurchaseOrder(71, {
      items: [{ sku: 'SKU-10', receivedQty: 3, batchNo: 'B-PUR71' }],
      remark: '库存发布前验收-采购收货',
    });

    expect(result).toMatchObject({ id: 71, status: '部分收货' });
    expect(prisma.stockBatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 10,
        batchNo: 'B-PUR71',
        stock: 3,
      }),
    });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { currentStock: 8 },
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: 'inbound',
        quantity: 3,
        beforeStock: 5,
        afterStock: 8,
        sourceType: 'purchase_order',
        sourceId: 71,
        sourceNo: 'PUR71',
        remark: expect.stringContaining('库存发布前验收-采购收货'),
      }),
    });
    expect(terminalDashboardCache.invalidate).toHaveBeenCalledWith(2, ['role', 'manager', 'inventory-alerts']);
  });

  it('receives legacy manual purchase orders by current store and product name when sku changed', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue({
      id: 73,
      orderNo: 'PUR73',
      status: '已下单',
      totalAmount: 168,
      items: {
        storeName: 'Ami 全量演示门店',
        expectedDate: '2026-07-04',
        items: [
          { id: 1, productName: '玻尿酸保湿精华', sku: 'AMI-SKU-001-S6', quantity: 1, receivedQty: 0, unitPrice: 168, subtotal: 168 },
        ],
      },
      createdAt: new Date('2026-06-28T00:00:00Z'),
    });
    prisma.product.findFirst.mockResolvedValueOnce(null);
    prisma.product.findMany.mockResolvedValueOnce([{
      id: 82,
      storeId: 6,
      sku: 'AMI-DEMO-FULL-SKU-001',
      name: '玻尿酸保湿精华',
      currentStock: 22,
      unit: '瓶',
    }]);
    prisma.stockBatch.create.mockResolvedValue({ id: 802, productId: 82, batchNo: 'B-PUR73', stock: 1 });
    prisma.stockMovement.create.mockResolvedValue({ id: 902, storeId: 6 });
    prisma.purchaseOrder.update.mockResolvedValue({
      id: 73,
      orderNo: 'PUR73',
      status: '已收货',
      totalAmount: 168,
      items: {
        storeName: 'Ami 全量演示门店',
        expectedDate: '2026-07-04',
        items: [
          { id: 1, productName: '玻尿酸保湿精华', sku: 'AMI-SKU-001-S6', quantity: 1, receivedQty: 1, unitPrice: 168, subtotal: 168 },
        ],
      },
      createdAt: new Date('2026-06-28T00:00:00Z'),
    });

    const result = await service.receivePurchaseOrder(73, {
      storeId: 6,
      items: [{ sku: 'AMI-SKU-001-S6', receivedQty: 1, batchNo: 'B-PUR73' }],
      remark: '采购管理手动采购单收货入库',
    });

    expect(result).toMatchObject({ id: 73, status: '已收货' });
    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: {
        sku: 'AMI-SKU-001-S6',
        deletedAt: null,
        storeId: 6,
      },
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: {
        name: '玻尿酸保湿精华',
        storeId: 6,
        deletedAt: null,
      },
      take: 2,
      orderBy: { id: 'asc' },
    });
    expect(prisma.stockBatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 82,
        batchNo: 'B-PUR73',
        stock: 1,
      }),
    });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 82 },
      data: { currentStock: 23 },
    });
    expect(terminalDashboardCache.invalidate).toHaveBeenCalledWith(6, ['role', 'manager', 'inventory-alerts']);
  });

  it('summarizes expiring batches and real scrap movements', async () => {
    const now = new Date();
    const daysFromNow = (days: number) => {
      const date = new Date(now);
      date.setDate(date.getDate() + days);
      return date;
    };
    prisma.stockBatch.findMany.mockResolvedValue([
      { id: 1, stock: 2, expiryDate: daysFromNow(-2), product: { costPrice: 10, category: { name: '护肤品' } } },
      { id: 2, stock: 3, expiryDate: daysFromNow(10), product: { costPrice: 20, category: { name: '护肤品' } } },
      { id: 3, stock: 4, expiryDate: daysFromNow(45), product: { costPrice: 30, category: { name: '美发产品' } } },
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([
      { quantity: -2, occurredAt: now, product: { costPrice: 10, category: { name: '护肤品' } } },
      { quantity: -1, occurredAt: now, product: { costPrice: 30, category: { name: '美发产品' } } },
    ]);

    const result = await service.getExpiringSummary(2, '60d');

    expect(prisma.stockBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        stock: { gt: 0 },
        product: { deletedAt: null, storeId: 2 },
      }),
    }));
    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        movementType: 'scrap_out',
        storeId: 2,
      }),
    }));
    expect(result).toMatchObject({
      expiringBatchCount: 1,
      urgentBatchCount: 1,
      expiredBatchCount: 1,
      expiringCostAmount: 180,
      scrappedAmount: 50,
    });
    expect(result.categoryWastage).toEqual([
      { category: '美发产品', amount: 30, percentage: 60 },
      { category: '护肤品', amount: 20, percentage: 40 },
    ]);
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
      reason: '库存发布前验收-调拨',
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
        remark: '库存发布前验收-调拨；库存不足：本次申请 5，实际扣减 2，不足 3',
      }),
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        movementType: 'transfer_in',
        quantity: 2,
        beforeStock: 1,
        afterStock: 3,
        remark: '库存发布前验收-调拨；库存不足：本次申请 5，实际扣减 2，不足 3',
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
    prisma.product.findFirst.mockResolvedValue({
      id: 10,
      sku: 'SKU-10',
      storeId: 1,
      currentStock: 8,
      unit: '瓶',
    });

    await service.createTransfer({
      fromStoreId: 1,
      toStoreId: 2,
      status: 'pending',
      items: [{ productId: 10, quantity: 3 }],
    });

    expect(terminalDashboardCache.invalidate).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 10 },
    }));
  });

  it('rejects completed transfer before stock changes when target store has no matching sku', async () => {
    prisma.product.findFirst
      .mockResolvedValueOnce({
        id: 10,
        sku: 'SKU-10',
        storeId: 1,
        currentStock: 8,
        unit: '瓶',
      })
      .mockResolvedValueOnce(null);

    await expect(service.createTransfer({
      fromStoreId: 1,
      toStoreId: 2,
      status: 'completed',
      items: [{ productId: 10, quantity: 3 }],
    })).rejects.toThrow('调入门店缺少同 SKU 商品');

    expect(prisma.transferOrder.create).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(prisma.stockMovement.create).not.toHaveBeenCalled();
  });

  it('generates transfer suggestions from high-stock stores to low-stock stores with the same sku', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 101,
        storeId: 1,
        sku: 'SKU-10',
        name: '补水面膜',
        currentStock: 60,
        safetyStock: 10,
        unit: '盒',
        store: { id: 1, name: 'A店' },
      },
      {
        id: 201,
        storeId: 2,
        sku: 'SKU-10',
        name: '补水面膜',
        currentStock: 3,
        safetyStock: 10,
        unit: '盒',
        store: { id: 2, name: 'B店' },
      },
    ]);

    const result = await service.getTransferSuggestions();

    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { deletedAt: null, safetyStock: { gt: 0 } },
    }));
    expect(result).toEqual([
      expect.objectContaining({
        sku: 'SKU-10',
        productName: '补水面膜',
        productId: 101,
        fromStoreId: 1,
        fromStoreName: 'A店',
        toStoreId: 2,
        toStoreName: 'B店',
        sourceStock: 60,
        targetStock: 3,
        safetyStock: 10,
        suggestedQty: 17,
      }),
    ]);
    expect(prisma.transferOrder.create).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
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
      },
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([
      { productId: 10, quantity: -8, movementType: 'sale_out', occurredAt: new Date() },
      { productId: 10, quantity: -4, movementType: 'service_consume', occurredAt: new Date() },
    ]);
    prisma.purchaseOrder.findMany.mockResolvedValue([]);
    prisma.supplyCatalogMapping.findMany.mockResolvedValue([
      {
        id: 501,
        productId: 10,
        isPreferred: true,
        supplySku: {
          id: 601,
          supplierId: 88,
          name: '平台精华液',
          supplier: { id: 88, name: '正式主供应商', status: 'active' },
          quotes: [{ id: 701, price: 18, moq: 12, leadDays: 3 }],
        },
      },
    ]);

    const result = await service.getReplenishment(1);

    expect(result).toHaveLength(1);
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, storeId: 1 },
    });
    expect(result[0]).toEqual(
      expect.objectContaining({
        supplierId: 88,
        supplier: '正式主供应商',
        supplyPrice: 18,
        moq: 12,
        suggestedQty: 15,
        estimatedAmount: 270,
        forecast7Days: 12,
        forecast30Days: 12,
      }),
    );
    expect(result[0].reason).toContain('近30天消耗 12');
    expect(commissionService.recordAmiContribution).toHaveBeenCalledWith({
      storeId: 1,
      category: 'inventory_alert',
      triggerType: 'inventory_replenishment',
      triggerId: 1,
      workMinutes: 5,
      metadata: { suggestionCount: 1 },
    });
  });

  it('subtracts manual purchase in-transit quantity from replenishment suggestions', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 11,
        name: '补水面膜',
        sku: 'SKU-11',
        currentStock: 2,
        safetyStock: 10,
        costPrice: 5,
        minPurchaseQty: 0,
        suppliers: [],
      },
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([]);
    prisma.purchaseOrder.findMany.mockResolvedValue([
      {
        status: '已下单',
        items: {
          items: [
            { sku: 'SKU-11', quantity: 20, receivedQty: 5 },
          ],
        },
      },
    ]);

    const result = await service.getReplenishment(1);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      productId: 11,
      inTransit: 15,
      manualInTransit: 15,
      suggestedQty: 3,
      reason: expect.stringContaining('在途 15 已抵扣'),
    }));
  });

  it('does not generate platform purchase fields when a supply mapping has no available quote', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 12,
        name: '修护精华',
        sku: 'SKU-12',
        currentStock: 0,
        safetyStock: 10,
        costPrice: 9,
        minPurchaseQty: 0,
        supplier: '本地供应商',
        suppliers: [],
      },
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([]);
    prisma.purchaseOrder.findMany.mockResolvedValue([]);
    prisma.supplyCatalogMapping.findMany.mockResolvedValue([
      {
        id: 301,
        productId: 12,
        isPreferred: true,
        supplySku: {
          id: 1001,
          supplierId: 8,
          name: '平台修护精华',
          supplier: { id: 8, name: '平台供应商' },
          quotes: [],
        },
      },
    ]);

    const result = await service.getReplenishment(1);

    expect(result[0]).toEqual(
      expect.objectContaining({
        productId: 12,
        supplier: '本地供应商',
        availabilityStatus: 'platform_mapped_no_quote',
        supplySkuId: undefined,
        quoteId: undefined,
        supplyPrice: 9,
      }),
    );
  });
});
