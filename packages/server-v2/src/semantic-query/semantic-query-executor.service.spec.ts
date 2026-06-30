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
      sourceTables: ['ProductOrder', 'PaymentRecord', 'RefundRecord'],
      sampleSize: 2,
    });
    expect(result.userEvidence?.dataSummary).toBe('基于 2 条业务记录统计');
  });

  it('executes order revenue KPI summary with payment method rows and refund evidence', async () => {
    const paidAt = new Date('2026-06-27T10:00:00.000Z');
    prisma.productOrder.findMany.mockResolvedValue([
      { id: 1, totalAmount: 600, customerId: 101, createdAt: paidAt, payMethod: 'wechat' },
      { id: 2, totalAmount: 400, customerId: 102, createdAt: paidAt, payMethod: 'alipay' },
    ]);
    prisma.paymentRecord.findMany.mockResolvedValue([
      { id: 11, orderId: 1, amount: 600, paidAt, status: 'paid', method: 'wechat' },
      { id: 12, orderId: 2, amount: 400, paidAt, status: 'paid', method: 'alipay' },
    ]);
    prisma.refundRecord.findMany.mockResolvedValue([
      { id: 21, orderId: 1, amount: 100, refundedAt: paidAt, status: 'refunded', order: { payMethod: 'wechat' } },
    ]);

    const result = await service.execute(
      basePlan({
        capabilityId: 'order_revenue_analysis',
        templateId: 'order_revenue',
        originalQuestion: '今天营收多少',
        metrics: [
          { key: 'revenue', aggregation: 'sum' },
          { key: 'order_count', aggregation: 'count' },
          { key: 'average_order_value', aggregation: 'avg' },
        ],
        dimensions: ['payMethod'],
        timeRange: { preset: 'today', label: '今天' },
        outputShape: 'summary',
      }),
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('收银收入');
    expect(result.summary).toContain('实收 ¥1,000');
    expect(result.summary).toContain('退款 ¥100');
    expect(result.summary).toContain('净额 ¥900');
    expect(result.kpis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '营收', value: '¥1,000' }),
        expect.objectContaining({ label: '实收', value: '¥1,000' }),
        expect.objectContaining({ label: '退款', value: '¥100' }),
        expect.objectContaining({ label: '净额', value: '¥900' }),
      ]),
    );
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ payMethod: 'wechat', revenue: 600, paidAmount: 600, refundAmount: 100, netAmount: 500, orderCount: 1 }),
        expect.objectContaining({ payMethod: 'alipay', revenue: 400, paidAmount: 400, refundAmount: 0, netAmount: 400, orderCount: 1 }),
      ]),
    );
    expect(result.auditEvidence.metricDefinition).toContain('净额 = 实收 - 退款');
    expect(result.auditEvidence).toMatchObject({
      source: ['ProductOrder', 'PaymentRecord', 'RefundRecord'],
      sampleSize: 5,
    });
  });

  it('executes order customer consumption list with table rows and standardized evidence', async () => {
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 11,
        orderNo: 'SO-11',
        customerId: 501,
        customerName: '马美琳',
        totalAmount: 980,
        netAmount: 960,
        payMethod: 'wechat',
        status: 'completed',
        createdAt: new Date(),
        customer: { id: 501, name: '马美琳', phone: '18800003187', memberLevel: 'VIP' },
        orderItems: [{ name: '深层补水护理', itemType: 'project', quantity: 1, subtotal: 980 }],
        paymentRecords: [{ amount: 960, status: 'paid', method: 'wechat', paidAt: new Date() }],
      },
    ]);

    const result = await service.execute(
      basePlan({
        capabilityId: 'order_customer_consumption_list',
        templateId: 'order_customer_consumption_list',
        originalQuestion: '昨天有哪些消费客户，列出清单',
        metrics: [
          { key: 'paid_amount', aggregation: 'sum' },
          { key: 'order_count', aggregation: 'count' },
        ],
        dimensions: ['customerId', 'customerName'],
        timeRange: { preset: 'yesterday', label: '昨天' },
        outputShape: 'table',
      }),
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('消费客户清单');
    expect(result.rows[0]).toMatchObject({
      customerName: '马美琳',
      phoneMasked: '188****3187',
      paidAmount: 960,
      orderCount: 1,
      itemsSummary: '深层补水护理',
    });
    expect(result.auditEvidence).toMatchObject({
      source: ['ProductOrder', 'PaymentRecord', 'OrderItem', 'Customer'],
      sourceTables: ['ProductOrder', 'PaymentRecord', 'OrderItem', 'Customer'],
      filters: expect.arrayContaining(['storeId=当前门店', 'status not in cancelled/refunded']),
      metricDefinition: expect.stringContaining('消费客户清单'),
      sampleSize: 1,
    });
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

  it('executes recent marketing activity list without querying non-existent activity storeId', async () => {
    const updatedAt = new Date();
    prisma.marketingActivity.findMany.mockResolvedValue([
      {
        id: 15,
        title: '玻尿酸保湿精华限时到店搭赠',
        status: 'draft',
        publishStatus: null,
        participants: 0,
        conversion: '0%',
        startDate: null,
        endDate: null,
        targetCustomers: '近期购买/适合该商品的会员客户',
        discount: '限时到店搭赠',
        publishedAt: null,
        createdAt: updatedAt,
        updatedAt,
      },
    ]);
    prisma.marketingPage.findMany.mockResolvedValue([{ id: 901, activityId: 15, storeId: 1 }]);

    const result = await service.execute(
      basePlan({
        capabilityId: 'marketing_activity_list',
        templateId: 'marketing_activity_list',
        originalQuestion: '推荐近期营销活动',
        metrics: [{ key: 'marketing_activity_count', aggregation: 'count' }],
        dimensions: ['campaignId', 'campaignName'],
        outputShape: 'table',
      }),
    );

    expect(prisma.marketingActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ storeId: expect.anything() }),
        select: expect.objectContaining({ id: true, title: true, updatedAt: true }),
      }),
    );
    expect(result.status).toBe('success');
    expect(result.title).toBe('近期营销活动');
    expect(result.summary).toContain('玻尿酸保湿精华限时到店搭赠');
    expect(result.rows[0]).toMatchObject({
      campaignId: 15,
      campaignName: '玻尿酸保湿精华限时到店搭赠',
      publishStatus: '未发布',
      offer: '限时到店搭赠',
      pageCount: 1,
    });
    expect(result.auditEvidence.source).toEqual(['MarketingActivity', 'MarketingPage']);
  });
});
