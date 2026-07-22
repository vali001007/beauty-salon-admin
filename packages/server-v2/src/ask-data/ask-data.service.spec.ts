import { AskDataService } from './ask-data.service';

describe('AskDataService clean-room query flow', () => {
  const ai = {
    chat: jest.fn(),
  };

  function createService(prisma: Record<string, any>) {
    ai.chat.mockRejectedValue(new Error('model unavailable'));
    return new AskDataService(prisma as any, ai as any);
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-09T10:00:00.000+08:00'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('maps project revenue questions to ProductOrder and OrderItem sources', async () => {
    const prisma = {
      productOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            orderNo: 'PO-001',
            createdAt: new Date('2026-06-12T10:00:00.000Z'),
            orderItems: [
              { itemType: 'project', itemId: 101, name: '肩颈舒压', quantity: 2, netAmount: 580, subtotal: 600 },
              { itemType: 'product', itemId: 301, name: '精油', quantity: 1, netAmount: 120, subtotal: 120 },
            ],
          },
        ]),
      },
    };
    const service = createService(prisma);

    const result = await service.query({ question: '上个月收入按项目看', history: [] }, 6);

    expect(result.status).toBe('success');
    expect(result.queryPlan.templateId).toBe('project_revenue_by_period');
    expect(result.sources.map((source) => source.model)).toEqual(['ProductOrder', 'OrderItem']);
    expect(result.columns.map((column) => column.key)).toEqual(['projectName', 'orderCount', 'quantity', 'revenue']);
    expect(result.rows).toEqual([
      expect.objectContaining({ projectName: '肩颈舒压', orderCount: 1, quantity: 2, revenue: 580 }),
    ]);
    expect(result.summary).toContain('项目收入');
    expect(prisma.productOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 6, status: { in: ['completed', 'paid', '已付款', '已完成'] } }),
      include: { orderItems: true },
    }));
  });

  it('answers low stock questions from the Product table only', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: 10, name: '补水面膜', sku: 'SKU-10', currentStock: 3, safetyStock: 8, unit: '盒', status: 'active' },
          { id: 11, name: '洁面乳', sku: 'SKU-11', currentStock: 20, safetyStock: 5, unit: '支', status: 'active' },
        ]),
      },
    };
    const service = createService(prisma);

    const result = await service.query({ question: '库存低于安全库存的商品有哪些' }, 6);

    expect(result.status).toBe('success');
    expect(result.queryPlan.templateId).toBe('low_stock_products');
    expect(result.sources.map((source) => source.model)).toEqual(['Product']);
    expect(result.rows).toEqual([
      expect.objectContaining({ productName: '补水面膜', currentStock: 3, safetyStock: 8, gap: 5 }),
    ]);
  });

  it('resolves a customer and returns recent consumption from Customer, ProductOrder and OrderItem', async () => {
    const prisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([{ id: 7, name: '张三', phone: '13800000000' }]),
      },
      productOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 66,
            orderNo: 'PO-066',
            createdAt: new Date('2026-07-02T08:00:00.000Z'),
            netAmount: 880,
            payMethod: 'wechat',
            status: 'completed',
            orderItems: [
              { itemType: 'project', name: '小气泡清洁', quantity: 1, netAmount: 380, subtotal: 380 },
              { itemType: 'product', name: '修护精华', quantity: 1, netAmount: 500, subtotal: 500 },
            ],
          },
        ]),
      },
    };
    const service = createService(prisma);

    const result = await service.query({ question: '张三最近消费了什么' }, 6);

    expect(result.status).toBe('success');
    expect(result.queryPlan.templateId).toBe('customer_recent_consumption');
    expect(result.sources.map((source) => source.model)).toEqual(['Customer', 'ProductOrder', 'OrderItem']);
    expect(result.rows[0]).toEqual(expect.objectContaining({
      customerName: '张三',
      orderNo: 'PO-066',
      itemNames: '小气泡清洁、修护精华',
      amount: 880,
    }));
  });

  it('asks for clarification when a customer name matches multiple records', async () => {
    const prisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([
          { id: 7, name: '张三', phone: '13800000000' },
          { id: 8, name: '张三丰', phone: '13900000000' },
        ]),
      },
    };
    const service = createService(prisma);

    const result = await service.query({ question: '张三最近消费了什么' }, 6);

    expect(result.status).toBe('clarification');
    expect(result.clarificationQuestion).toContain('找到多个客户');
    expect(result.rows).toEqual([
      expect.objectContaining({ customerId: 7, customerName: '张三' }),
      expect.objectContaining({ customerId: 8, customerName: '张三丰' }),
    ]);
  });

  it('calculates reservation cancellation rate from Reservation rows', async () => {
    const prisma = {
      reservation: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, status: 'cancelled', date: new Date('2026-07-01T00:00:00.000Z') },
          { id: 2, status: 'completed', date: new Date('2026-07-02T00:00:00.000Z') },
          { id: 3, status: 'pending', date: new Date('2026-07-03T00:00:00.000Z') },
          { id: 4, status: 'cancelled', date: new Date('2026-07-04T00:00:00.000Z') },
        ]),
      },
    };
    const service = createService(prisma);

    const result = await service.query({ question: '本月预约取消率是多少' }, 6);

    expect(result.status).toBe('success');
    expect(result.queryPlan.templateId).toBe('reservation_cancel_rate');
    expect(result.sources.map((source) => source.model)).toEqual(['Reservation']);
    expect(result.rows[0]).toEqual(expect.objectContaining({ totalReservations: 4, cancelledReservations: 2, cancellationRate: 0.5 }));
  });

  it('returns no_data when a supported query has no rows', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = createService(prisma);

    const result = await service.query({ question: '库存低于安全库存的商品有哪些' }, 6);

    expect(result.status).toBe('no_data');
    expect(result.summary).toContain('没有查到');
  });

  it('returns unsupported for questions outside the clean-room MVP catalog', async () => {
    const service = createService({});

    const result = await service.query({ question: '帮我生成一个营销海报' }, 6);

    expect(result.status).toBe('unsupported');
    expect(result.summary).toContain('基础版暂未支持');
  });
});
