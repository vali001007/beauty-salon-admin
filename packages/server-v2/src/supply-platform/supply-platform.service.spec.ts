import { SupplyPlatformService } from './supply-platform.service.js';

describe('SupplyPlatformService', () => {
  let prisma: any;
  let service: SupplyPlatformService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      supplySupplier: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      store: {
        findFirst: jest.fn(),
      },
      supplySku: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      supplyQuote: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      procurementOrder: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      supplierShipment: {
        create: jest.fn(),
      },
      product: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      stockBatch: {
        create: jest.fn(),
      },
      stockMovement: {
        create: jest.fn(),
      },
      supplierShipmentItem: {
        update: jest.fn(),
      },
      procurementOrderItem: {
        update: jest.fn(),
        findMany: jest.fn(),
      },
      supplySettlement: {
        findMany: jest.fn(),
        count: jest.fn(),
        upsert: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(async (operations: any) => {
      if (Array.isArray(operations)) return Promise.all(operations);
      return operations(prisma);
    });
    service = new SupplyPlatformService(prisma);
  });

  it('creates procurement orders from approved supply quotes with locked price', async () => {
    prisma.supplySupplier.findFirst.mockResolvedValue({ id: 8, name: 'Supply A', platformFeeRate: 0.02, rebateRate: 0.05 });
    prisma.store.findFirst.mockResolvedValue({ id: 3, name: 'Store A' });
    prisma.supplySku.findMany.mockResolvedValue([{ id: 1001, supplierId: 8, name: 'Mask', status: 'active', auditStatus: 'approved' }]);
    prisma.supplyQuote.findMany.mockResolvedValue([
      { id: 2001, supplySkuId: 1001, supplierId: 8, price: 12, moq: 10, status: 'active', auditStatus: 'approved' },
    ]);
    prisma.procurementOrder.create.mockImplementation(async ({ data }: any) => ({
      id: 3001,
      ...data,
      supplier: { id: 8, name: 'Supply A' },
      store: { id: 3, name: 'Store A' },
      items: data.items.create,
    }));

    const result = await service.createOrder({
      storeId: 3,
      supplierId: 8,
      sourceType: 'replenishment',
      items: [{ productId: 101, supplySkuId: 1001, quoteId: 2001, quantity: 3 }],
    });

    expect(prisma.procurementOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: 3,
          supplierId: 8,
          totalAmount: 120,
          platformFee: 2.4,
          rebateAmount: 6,
          netAmount: 114,
          items: {
            create: [{ productId: 101, supplySkuId: 1001, quoteId: 2001, quantity: 10, unitPrice: 12, subtotal: 120 }],
          },
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: 3001, totalAmount: 120 }));
  });

  it('scopes supplier account SKU lists to its bound supplier', async () => {
    prisma.supplySku.findMany.mockResolvedValue([{ id: 1001, supplierId: 8, name: 'Mask' }]);
    prisma.supplySku.count.mockResolvedValue(1);

    const result = await service.findSkus({ page: 1, pageSize: 20 } as any, {
      id: 91,
      permissions: ['core:supply:supplier'],
      supplySupplierId: 8,
    });

    expect(prisma.supplySku.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ supplierId: 8 }),
      }),
    );
    expect(result.items).toHaveLength(1);
  });

  it('blocks supplier accounts from reading or writing another supplier data', async () => {
    await expect(
      service.findSkus({ supplierId: 9 } as any, {
        id: 91,
        permissions: ['core:supply:supplier'],
        supplySupplierId: 8,
      }),
    ).rejects.toThrow('供应商账号只能访问自己的供应链数据');

    await expect(
      service.createSku(
        { supplierId: 9, name: 'Other supplier product' } as any,
        { id: 91, permissions: ['core:supply:supplier'], supplySupplierId: 8 },
      ),
    ).rejects.toThrow('供应商账号只能访问自己的供应链数据');
  });

  it('keeps supplier accounts out of platform audit actions', async () => {
    await expect(
      service.auditSku(1001, { auditStatus: 'approved', status: 'active' } as any, {
        id: 91,
        permissions: ['core:supply:supplier'],
        supplySupplierId: 8,
      }),
    ).rejects.toThrow('只有平台运营可以审核商品');
  });

  it('allows supplier accounts to accept their own pending procurement orders', async () => {
    jest.spyOn(service, 'findOrder').mockResolvedValue({ id: 3001, supplierId: 8, status: 'pending_supplier_confirm' } as any);
    prisma.procurementOrder.update.mockResolvedValue({ id: 3001, status: 'accepted' });

    const result = await service.updateOrderStatus(
      3001,
      { status: 'accepted' } as any,
      { id: 91, permissions: ['core:supply:supplier'], supplySupplierId: 8 },
    );

    expect(prisma.procurementOrder.update).toHaveBeenCalledWith({
      where: { id: 3001 },
      data: { status: 'accepted', acceptedAt: expect.any(Date) },
      include: { items: true, shipments: true },
    });
    expect(result).toEqual(expect.objectContaining({ status: 'accepted' }));
  });

  it('blocks supplier accounts from advancing procurement orders beyond accept or reject', async () => {
    jest.spyOn(service, 'findOrder').mockResolvedValue({ id: 3001, supplierId: 8, status: 'pending_supplier_confirm' } as any);

    await expect(
      service.updateOrderStatus(
        3001,
        { status: 'settled' } as any,
        { id: 91, permissions: ['core:supply:supplier'], supplySupplierId: 8 },
      ),
    ).rejects.toThrow('供应商只能接单或拒单');
  });

  it('creates supplier shipment and marks procurement order as shipped', async () => {
    jest.spyOn(service, 'findOrder').mockResolvedValue({
      id: 3001,
      supplierId: 8,
      status: 'accepted',
      items: [{ id: 1, supplySkuId: 1001 }],
    } as any);
    prisma.supplierShipment.create.mockResolvedValue({ id: 4001, shipmentNo: 'SHP-1', items: [] });

    const result = await service.createShipment(3001, {
      logisticsCompany: 'SF',
      trackingNo: 'SF001',
      items: [{ orderItemId: 1, supplySkuId: 1001, shippedQty: 10, batchNo: 'B001' }],
    });

    expect(prisma.supplierShipment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 3001,
          supplierId: 8,
          logisticsCompany: 'SF',
          trackingNo: 'SF001',
          items: { create: [expect.objectContaining({ orderItemId: 1, supplySkuId: 1001, shippedQty: 10, batchNo: 'B001' })] },
        }),
      }),
    );
    expect(prisma.procurementOrder.update).toHaveBeenCalledWith({ where: { id: 3001 }, data: { status: 'shipped', shippedAt: expect.any(Date) } });
    expect(result).toEqual(expect.objectContaining({ id: 4001 }));
  });

  it('receives supply platform shipments into local stock batches and movements', async () => {
    prisma.procurementOrder.findUnique.mockResolvedValue({
      id: 3001,
      orderNo: 'SPO-3001',
      storeId: 3,
      status: 'shipped',
      receivedAt: null,
      items: [
        { id: 1, productId: 101, supplySkuId: 1001, quantity: 10, receivedQty: 0, supplySku: { id: 1001, name: 'Mask' } },
      ],
      shipments: [
        {
          id: 4001,
          items: [{ id: 5001, orderItemId: 1, supplySkuId: 1001, shippedQty: 10, receivedQty: 0, batchNo: 'B001', productionDate: null, expiryDate: null }],
        },
      ],
    });
    prisma.product.findFirst.mockResolvedValue({ id: 101, storeId: 3, name: 'Mask local', currentStock: 5, unit: 'box' });
    prisma.stockBatch.create.mockResolvedValue({ id: 6001 });
    prisma.procurementOrderItem.findMany.mockResolvedValue([{ id: 1, quantity: 10, receivedQty: 10 }]);
    jest.spyOn(service, 'findOrder').mockResolvedValue({ id: 3001, status: 'received' } as any);

    const result = await service.receiveOrder(3001, {
      items: [{ shipmentItemId: 5001, productId: 101, receivedQty: 10 }],
      remark: 'ok',
    });

    expect(prisma.stockBatch.create).toHaveBeenCalledWith({ data: expect.objectContaining({ productId: 101, batchNo: 'B001', stock: 10 }) });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 3,
        productId: 101,
        movementType: 'purchase_inbound',
        sourceType: 'supply_platform_order',
        sourceId: 3001,
        sourceNo: 'SPO-3001',
      }),
    });
    expect(result).toEqual(expect.objectContaining({ affectedStoreId: 3 }));
  });

  it('generates supplier settlement from received procurement orders', async () => {
    prisma.procurementOrder.findMany.mockResolvedValue([
      { supplierId: 8, totalAmount: 120, rebateAmount: 6, platformFee: 2.4 },
      { supplierId: 8, totalAmount: 80, rebateAmount: 4, platformFee: 1.6 },
    ]);
    prisma.supplySettlement.upsert.mockResolvedValue({ id: 7001, supplierId: 8, settleMonth: '2026-06', orderCount: 2 });

    const result = await service.generateSettlement({ settleMonth: '2026-06' });

    expect(prisma.supplySettlement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { supplierId_settleMonth: { supplierId: 8, settleMonth: '2026-06' } },
        create: expect.objectContaining({ totalAmount: 200, rebateAmount: 10, platformFee: 4, netPayable: 186 }),
      }),
    );
    expect(result.total).toBe(1);
  });
});
