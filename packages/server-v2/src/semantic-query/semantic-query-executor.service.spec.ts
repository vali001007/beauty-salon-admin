import { SemanticQueryExecutorService } from './semantic-query-executor.service.js';
import type { SemanticQueryPlan } from './query-plan.types.js';

function basePlan(overrides: Partial<SemanticQueryPlan> = {}): SemanticQueryPlan {
  return {
    queryId: 'sq_test',
    capabilityId: 'revenue_diagnosis',
    taskId: 'task_test',
    originalQuestion: '最近七天收银趋势',
    role: 'manager',
    storeScope: { storeIds: [1], scopeType: 'current_store' },
    metrics: [{ key: 'paid_amount', aggregation: 'sum' }],
    dimensions: ['date'],
    filters: { storeId: 1 },
    timeRange: { preset: 'last_7_days', label: '近7天' },
    orderBy: [{ key: 'paid_amount', direction: 'desc' }],
    limit: 10,
    outputShape: 'trend',
    riskLevel: 'low',
    ...overrides,
  };
}

describe('SemanticQueryExecutorService', () => {
  let prisma: jest.Mocked<any>;
  let service: SemanticQueryExecutorService;

  beforeEach(() => {
    prisma = {
      productOrder: { findMany: jest.fn() },
      paymentRecord: { findMany: jest.fn() },
      refundRecord: { findMany: jest.fn() },
      orderItem: { findMany: jest.fn() },
      product: { findMany: jest.fn() },
      customer: { findMany: jest.fn() },
      customerPredictionSnapshot: { findMany: jest.fn() },
      customerCard: { findMany: jest.fn() },
      customerBalanceAccount: { findMany: jest.fn() },
      cardUsageRecord: { findMany: jest.fn() },
      beautician: { findMany: jest.fn() },
      reservation: { findMany: jest.fn() },
      marketingActivity: { findMany: jest.fn() },
      marketingPage: { findMany: jest.fn() },
      marketingPageLead: { findMany: jest.fn() },
      marketingPageEvent: { findMany: jest.fn() },
    };
    service = new SemanticQueryExecutorService(prisma);
  });

  it('executes cashier trend with user-facing summary and audit evidence', async () => {
    prisma.productOrder.findMany.mockResolvedValue([
      { id: 1, totalAmount: 300, customerId: 101, createdAt: new Date(), payMethod: 'wechat' },
    ]);
    prisma.paymentRecord.findMany.mockResolvedValue([{ id: 1, amount: 300, paidAt: new Date(), status: 'paid', method: 'wechat' }]);
    prisma.refundRecord.findMany.mockResolvedValue([]);

    const result = await service.execute(basePlan());

    expect(result.status).toBe('success');
    expect(result.title).toBe('收银趋势');
    expect(result.summary).toContain('实收合计');
    expect(result.rows[0]).toHaveProperty('date');
    expect(result.auditEvidence).toMatchObject({
      source: ['ProductOrder', 'PaymentRecord', 'RefundRecord'],
      sampleSize: 2,
    });
    expect(result.userEvidence?.dataSummary).toBe('基于 2 条业务记录统计');
  });

  it('executes product ranking without free SQL', async () => {
    prisma.orderItem.findMany.mockResolvedValue([
      {
        itemId: 301,
        name: '氨基酸洁面乳',
        quantity: 2,
        subtotal: 256,
        order: { id: 1, customerId: 101, createdAt: new Date(Date.now() - 86_400_000), status: 'completed' },
      },
    ]);

    const result = await service.execute(
      basePlan({
        capabilityId: 'product_sales_ranking',
        originalQuestion: '最近销量好的商品有哪些',
        metrics: [{ key: 'product_sales_quantity', aggregation: 'sum' }],
        dimensions: ['productId', 'productName'],
        timeRange: { preset: 'last_30_days', label: '近30天' },
        outputShape: 'list',
      }),
    );

    expect(result.status).toBe('success');
    expect(result.rows[0]).toMatchObject({
      productId: 301,
      productName: '氨基酸洁面乳',
      quantity: 2,
      salesAmount: 256,
    });
    expect(result.auditEvidence.sqlFingerprint).toHaveLength(16);
  });

  it('executes project service ranking', async () => {
    prisma.orderItem.findMany.mockResolvedValue([
      {
        itemId: 701,
        name: '深层补水护理',
        quantity: 3,
        subtotal: 900,
        order: { id: 1, customerId: 101, createdAt: new Date(Date.now() - 86_400_000), status: 'completed' },
      },
    ]);

    const result = await service.execute(
      basePlan({
        capabilityId: 'project_service_ranking',
        originalQuestion: '最近做得好的项目',
        metrics: [{ key: 'project_service_count', aggregation: 'sum' }],
        dimensions: ['projectId', 'projectName'],
        outputShape: 'list',
      }),
    );

    expect(result.status).toBe('success');
    expect(result.rows[0]).toMatchObject({ projectName: '深层补水护理', serviceCount: 3, revenue: 900 });
  });

  it('executes customer follow-up ranking with masked phone', async () => {
    prisma.customer.findMany.mockResolvedValue([
      { id: 501, name: '杨晓雯', phone: '18800003187', memberLevel: '银卡会员', totalSpent: 18097, visitCount: 5, lastVisitDate: new Date(Date.now() - 30 * 86_400_000), tags: ['VIP'] },
    ]);
    prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
      { customerId: 501, churnScore: 75, churnLevel: 'high', repurchase30dScore: 60, marketingResponseScore: 50, ltv12m: 18097, ltvTier: 'high', createdAt: new Date() },
    ]);

    const result = await service.execute(
      basePlan({
        capabilityId: 'customer_follow_up_ranking',
        originalQuestion: '今天最值得跟进的10个客户',
        metrics: [{ key: 'follow_up_priority_score', aggregation: 'score' }],
        dimensions: ['customerId', 'customerName'],
        outputShape: 'list',
        limit: 10,
      }),
    );

    expect(result.status).toBe('success');
    expect(result.summary).toContain('已按要求返回 1 位客户');
    expect(result.rows[0]).toMatchObject({ customerName: '杨晓雯', phone: '188****3187', churnScore: 75 });
  });

  it('masks phone in member balance ranking', async () => {
    prisma.customerBalanceAccount.findMany.mockResolvedValue([
      {
        customerId: 501,
        cashBalance: 1200,
        giftBalance: 200,
        customer: { id: 501, name: '李女士', phone: '13800000000', memberLevel: '金卡' },
      },
    ]);

    const result = await service.execute(
      basePlan({
        capabilityId: 'card_member_business_diagnosis',
        originalQuestion: '会员余额最高的客户',
        metrics: [{ key: 'member_balance', aggregation: 'sum' }],
        dimensions: ['customerId', 'customerName'],
        outputShape: 'list',
      }),
    );

    expect(result.status).toBe('success');
    expect(result.rows[0]).toMatchObject({
      customerName: '李女士',
      phone: '138****0000',
      totalBalance: 1400,
    });
    expect(JSON.stringify(result.rows[0])).not.toContain('13800000000');
  });

  it('executes card expiry risk ranking', async () => {
    const expiresAt = new Date(Date.now() + 10 * 86_400_000);
    prisma.customerCard.findMany.mockResolvedValue([
      {
        customerId: 601,
        cardName: '补水护理 10 次卡',
        remainingTimes: 3,
        expiryDate: expiresAt,
        customer: { id: 601, name: '王女士', phone: '13900001234', memberLevel: '金卡' },
      },
    ]);

    const result = await service.execute(
      basePlan({
        capabilityId: 'card_expiry_risk',
        originalQuestion: '哪些次卡快到期了',
        metrics: [{ key: 'card_expiry_risk', aggregation: 'score' }],
        dimensions: ['customerId', 'customerName', 'cardName'],
        outputShape: 'list',
      }),
    );

    expect(result.status).toBe('success');
    expect(result.rows[0]).toMatchObject({ customerName: '王女士', phone: '139****1234', cardName: '补水护理 10 次卡', remainingTimes: 3 });
  });

  it('executes staff performance ranking from reservations and order items', async () => {
    prisma.beautician.findMany.mockResolvedValue([{ id: 8, name: '沈晴', status: 'active' }]);
    prisma.reservation.findMany.mockResolvedValue([{ id: 1, beauticianId: 8, status: 'completed' }]);
    prisma.orderItem.findMany.mockResolvedValue([{ id: 11, beauticianId: 8, subtotal: 680, orderId: 21 }]);

    const result = await service.execute(
      basePlan({
        capabilityId: 'staff_performance_ranking',
        originalQuestion: '近期表现较好的员工',
        metrics: [{ key: 'staff_performance_score', aggregation: 'score' }],
        dimensions: ['beauticianId', 'beauticianName'],
        outputShape: 'list',
      }),
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('员工表现排行');
    expect(result.rows[0]).toMatchObject({
      beauticianName: '沈晴',
      serviceCount: 1,
      completedCount: 1,
      orderCount: 1,
      revenue: 680,
    });
  });

  it('executes reservation schedule trend with arrival rate', async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    prisma.reservation.findMany.mockResolvedValue([
      { id: 1, date: yesterday, status: 'completed', customerId: 1, beauticianId: 8 },
      { id: 2, date: yesterday, status: 'pending', customerId: 2, beauticianId: 9 },
    ]);

    const result = await service.execute(
      basePlan({
        capabilityId: 'reservation_schedule_summary',
        originalQuestion: '最近七天预约趋势',
        metrics: [
          { key: 'reservation_count', aggregation: 'sum' },
          { key: 'arrival_rate', aggregation: 'ratio' },
        ],
        dimensions: ['date'],
        outputShape: 'trend',
      }),
    );

    expect(result.status).toBe('success');
    expect(result.summary).toContain('预约');
    expect(result.rows.some((row) => row.reservationCount === 2 && row.arrivalRateText === '+50%')).toBe(true);
  });

  it('executes marketing conversion ranking', async () => {
    prisma.marketingActivity.findMany.mockResolvedValue([{ id: 31, title: '夏季补水活动', status: 'published' }]);
    prisma.marketingPage.findMany.mockResolvedValue([{ id: 41, activityId: 31, title: '夏季补水活动页' }]);
    prisma.marketingPageEvent.findMany.mockResolvedValue([
      { id: 1, pageId: 41, eventType: 'view' },
      { id: 2, pageId: 41, eventType: 'view' },
    ]);
    prisma.marketingPageLead.findMany.mockResolvedValue([{ id: 3, pageId: 41, status: 'converted' }]);

    const result = await service.execute(
      basePlan({
        capabilityId: 'marketing_conversion_diagnosis',
        originalQuestion: '最近活动转化怎么样',
        metrics: [{ key: 'campaign_conversion_rate', aggregation: 'ratio' }],
        dimensions: ['campaignId', 'campaignName'],
        outputShape: 'list',
      }),
    );

    expect(result.status).toBe('success');
    expect(result.rows[0]).toMatchObject({
      campaignName: '夏季补水活动',
      viewCount: 2,
      leadCount: 1,
      conversionRateText: '+50%',
    });
  });
});
