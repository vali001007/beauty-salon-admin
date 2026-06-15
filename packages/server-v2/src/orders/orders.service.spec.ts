import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OrdersService marketing page attribution', () => {
  let service: OrdersService;

  beforeEach(() => {
    service = new OrdersService({} as PrismaService, {} as any);
  });

  function createTx() {
    return {
      marketingPageAttribution: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      marketingPageLead: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
  }

  it('creates a last-touch page attribution from the newest eligible lead', async () => {
    const tx = createTx();
    const lead = {
      id: 31,
      pageId: 12,
      customerId: 7,
      createdAt: new Date(Date.now() - 3 * 86400000),
    };
    tx.marketingPageAttribution.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    tx.marketingPageLead.findMany.mockResolvedValue([lead]);

    await (service as any).applyMarketingPageAttribution(tx, { id: 88, customerId: 7 }, 680);

    expect(tx.marketingPageLead.findMany).toHaveBeenCalledWith({
      where: {
        customerId: 7,
        status: { not: 'expired' },
        createdAt: { gte: expect.any(Date) },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    expect(tx.marketingPageAttribution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 31,
        pageId: 12,
        customerId: 7,
        orderId: 88,
        attributionType: 'last_touch',
        attributedRevenue: 680,
        attributionWindowDays: 30,
        touchedAt: lead.createdAt,
        convertedAt: expect.any(Date),
      }),
    });
    expect(tx.marketingPageLead.update).toHaveBeenCalledWith({
      where: { id: 31 },
      data: { status: 'converted', convertedAt: expect.any(Date) },
    });
  });

  it('does not create duplicate attribution for an already attributed order', async () => {
    const tx = createTx();
    tx.marketingPageAttribution.findFirst.mockResolvedValue({ id: 1 });

    await (service as any).applyMarketingPageAttribution(tx, { id: 88, customerId: 7 }, 680);

    expect(tx.marketingPageLead.findMany).not.toHaveBeenCalled();
    expect(tx.marketingPageAttribution.create).not.toHaveBeenCalled();
  });

  it('does not create attribution when the customer has no lead in the attribution window', async () => {
    const tx = createTx();
    tx.marketingPageAttribution.findFirst.mockResolvedValueOnce(null);
    tx.marketingPageLead.findMany.mockResolvedValue([]);

    await (service as any).applyMarketingPageAttribution(tx, { id: 88, customerId: 7 }, 680);

    expect(tx.marketingPageAttribution.create).not.toHaveBeenCalled();
    expect(tx.marketingPageLead.update).not.toHaveBeenCalled();
  });

  it('uses a 30-day attribution window when querying eligible leads', async () => {
    const tx = createTx();
    const systemNow = new Date('2026-06-07T09:00:00.000Z');
    jest.useFakeTimers().setSystemTime(systemNow);

    try {
      tx.marketingPageAttribution.findFirst.mockResolvedValueOnce(null);
      tx.marketingPageLead.findMany.mockResolvedValue([]);

      await (service as any).applyMarketingPageAttribution(tx, { id: 88, customerId: 7 }, 680);

      expect(tx.marketingPageLead.findMany).toHaveBeenCalledWith({
        where: {
          customerId: 7,
          status: { not: 'expired' },
          createdAt: { gte: new Date('2026-05-08T09:00:00.000Z') },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('OrdersService project order inventory consumption', () => {
  let service: OrdersService;
  let prisma: any;
  let tx: any;

  beforeEach(() => {
    tx = {
      customer: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      productOrder: {
        create: jest.fn(async ({ data }: any) => ({
          id: 501,
          ...data,
          createdAt: new Date('2026-06-14T09:00:00.000Z'),
          updatedAt: new Date('2026-06-14T09:00:00.000Z'),
        })),
        findUnique: jest.fn(async () => ({
          id: 501,
          orderNo: 'PO-501',
          customerName: '散客',
          storeId: 1,
          totalAmount: 400,
          status: 'paid',
          payMethod: 'wechat',
          orderItems: [
            {
              id: 701,
              orderId: 501,
              itemType: 'project',
              itemId: 101,
              name: 'Hydration',
              quantity: 2,
              unitPrice: 200,
              subtotal: 400,
              discount: 0,
            },
          ],
          paymentRecords: [],
          refundRecords: [],
          marketingAttributions: [],
        })),
      },
      orderItem: {
        createMany: jest.fn(),
      },
      stockMovement: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 901 }),
      },
      projectBomItem: {
        findMany: jest.fn().mockResolvedValue([{ projectId: 101, productId: 301, standardQty: 2, unit: '支' }]),
      },
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: 301, storeId: 1, currentStock: 10, unit: '支' }),
        update: jest.fn().mockResolvedValue({ id: 301 }),
      },
      paymentRecord: {
        create: jest.fn(),
      },
    };
    prisma = {
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    service = new OrdersService(prisma as PrismaService, {} as any);
  });

  it('deducts project BOM stock when creating a paid project order', async () => {
    await service.createProjectOrder({
      customerName: '散客',
      storeId: 1,
      status: '已付款',
      paymentMethod: '微信',
      totalAmount: 400,
      items: [{ projectId: 101, projectName: 'Hydration', quantity: 2, unitPrice: 200, subtotal: 400 }],
    });

    expect(tx.orderItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          orderId: 501,
          itemType: 'project',
          itemId: 101,
          name: 'Hydration',
          quantity: 2,
          unitPrice: 200,
          subtotal: 400,
        }),
      ],
    });
    expect(tx.projectBomItem.findMany).toHaveBeenCalledWith({
      where: { projectId: { in: [101] } },
      select: { projectId: true, productId: true, standardQty: true, unit: true },
    });
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 301 },
      data: { currentStock: { decrement: 4 } },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 1,
        productId: 301,
        movementType: 'service_consume',
        quantity: -4,
        beforeStock: 10,
        afterStock: 6,
        sourceType: 'project_order',
        sourceId: 501,
      }),
    });
  });

  it('deducts product stock when creating a paid product order', async () => {
    tx.productOrder.findUnique.mockResolvedValueOnce({
      id: 501,
      orderNo: 'PO-501',
      customerName: '散客',
      storeId: 1,
      totalAmount: 120,
      status: 'paid',
      payMethod: 'wechat',
      orderItems: [
        {
          id: 701,
          orderId: 501,
          itemType: 'product',
          itemId: 301,
          name: '补水精华',
          quantity: 3,
          unitPrice: 40,
          subtotal: 120,
          discount: 0,
        },
      ],
      paymentRecords: [],
      refundRecords: [],
      marketingAttributions: [],
    });

    await service.createProductOrder({
      customerName: '散客',
      storeId: 1,
      status: '已付款',
      paymentMethod: '微信',
      totalAmount: 120,
      items: [{ productId: 301, productName: '补水精华', quantity: 3, unitPrice: 40, subtotal: 120 }],
    });

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 301 },
      data: { currentStock: { decrement: 3 } },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 1,
        productId: 301,
        movementType: 'sale_out',
        quantity: -3,
        beforeStock: 10,
        afterStock: 7,
        sourceType: 'product_order',
        sourceId: 501,
      }),
    });
  });

  it('does not deduct project BOM stock for pending project orders', async () => {
    await service.createProjectOrder({
      customerName: '散客',
      storeId: 1,
      status: '待付款',
      paymentMethod: '微信',
      totalAmount: 400,
      items: [{ projectId: 101, projectName: 'Hydration', quantity: 2, unitPrice: 200, subtotal: 400 }],
    });

    expect(tx.projectBomItem.findMany).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
});
