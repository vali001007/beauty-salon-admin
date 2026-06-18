import { SemanticSqlExecutorService } from './semantic-sql-executor.service.js';

describe('SemanticSqlExecutorService', () => {
  let prisma: jest.Mocked<any>;
  let service: SemanticSqlExecutorService;

  beforeEach(() => {
    prisma = {
      orderItem: { findMany: jest.fn() },
      product: { findMany: jest.fn() },
      productOrder: { findMany: jest.fn() },
      customerBalanceAccount: { findMany: jest.fn() },
    };
    service = new SemanticSqlExecutorService(prisma);
  });

  it('rejects execution when beta is disabled', async () => {
    const result = await service.execute({
      taskId: 'task_1',
      storeId: 1,
      actorRole: 'manager',
      metricKeys: ['product_sales_growth'],
      dimensions: ['productId', 'productName'],
      filters: {},
      limit: 10,
    });

    expect(result.status).toBe('rejected');
    expect(result.rejectedReason).toBe('semantic_sql_beta_disabled');
    expect(result.sqlFingerprint).toHaveLength(16);
    expect(prisma.orderItem.findMany).not.toHaveBeenCalled();
  });

  it('executes whitelisted product sales growth aggregation with evidence', async () => {
    prisma.orderItem.findMany.mockResolvedValue([
      {
        itemId: 301,
        name: '补水精华',
        quantity: 8,
        subtotal: 5440,
        order: { id: 1, customerId: 101, createdAt: new Date('2026-06-10T10:00:00.000Z'), status: 'completed' },
      },
      {
        itemId: 301,
        name: '补水精华',
        quantity: 4,
        subtotal: 2720,
        order: { id: 2, customerId: 102, createdAt: new Date('2026-05-15T10:00:00.000Z'), status: 'completed' },
      },
    ]);

    const result = await service.execute({
      taskId: 'task_2',
      storeId: 1,
      actorRole: 'manager',
      metricKeys: ['product_sales_growth'],
      dimensions: ['productId', 'productName'],
      filters: {},
      timeRange: { preset: 'custom', startDate: '2026-06-01', endDate: '2026-06-30', label: '2026年6月' },
      limit: 10,
      betaEnabled: true,
    });

    expect(result.status).toBe('success');
    expect(result.rows[0]).toMatchObject({
      productId: 301,
      productName: '补水精华',
      quantity: 8,
      previousQuantity: 4,
      growth: 4,
      growthRate: 1,
      salesAmount: 5440,
      customerCount: 1,
    });
    expect(result.evidence).toMatchObject({
      source: ['OrderItem', 'ProductOrder'],
      sampleSize: 2,
    });
  });

  it('rejects unsupported dimensions before querying', async () => {
    const result = await service.execute({
      taskId: 'task_3',
      storeId: 1,
      actorRole: 'manager',
      metricKeys: ['member_balance'],
      dimensions: ['phone'],
      filters: {},
      limit: 10,
      betaEnabled: true,
    });

    expect(result.status).toBe('rejected');
    expect(result.rejectedReason).toBe('dimension_phone_not_allowed');
    expect(prisma.customerBalanceAccount.findMany).not.toHaveBeenCalled();
  });

  it('executes member balance aggregation without sensitive phone fields', async () => {
    prisma.customerBalanceAccount.findMany.mockResolvedValue([
      {
        id: 1,
        customerId: 501,
        cashBalance: 1200,
        giftBalance: 200,
        customer: { id: 501, name: '李女士', phone: '13800000000', memberLevel: '金卡' },
      },
    ]);

    const result = await service.execute({
      taskId: 'task_4',
      storeId: 1,
      actorRole: 'manager',
      metricKeys: ['member_balance'],
      dimensions: ['customerId', 'customerName'],
      filters: {},
      limit: 10,
      betaEnabled: true,
    });

    expect(result.status).toBe('success');
    expect(result.rows[0]).toEqual({
      customerId: 501,
      customerName: '李女士',
      memberLevel: '金卡',
      cashBalance: 1200,
      giftBalance: 200,
      totalBalance: 1400,
    });
    expect(result.rows[0]).not.toHaveProperty('phone');
  });
});
