import { BusinessQueryService } from './business-query.service.js';
import type { BusinessQueryResponse } from './business-query.types.js';

function expectBusinessQueryResponseContract(
  result: BusinessQueryResponse,
  status: BusinessQueryResponse['status'],
  options: { requireCard?: boolean; requireItems?: boolean } = {},
) {
  expect(result.status).toBe(status);
  expect(result.requestId).toMatch(/^bq_/);
  expect(result.domain).toBe(result.queryPlan.domain);
  expect(result.capability).toBe(result.queryPlan.capability);
  expect(result.answer).toEqual(expect.any(String));
  expect(result.answer.trim().length).toBeGreaterThan(0);
  expect(result.evidence).toEqual(
    expect.objectContaining({
      source: expect.any(Array),
      filters: expect.any(Array),
      metricDefinition: expect.any(String),
    }),
  );
  expect(Array.isArray(result.actions)).toBe(true);

  if (options.requireCard) {
    expect(result.card).toEqual(
      expect.objectContaining({
        type: expect.any(String),
        title: expect.any(String),
        summary: expect.any(String),
        items: expect.any(Array),
      }),
    );
  }
  if (options.requireItems) {
    expect(result.card?.items.length).toBeGreaterThan(0);
  }
}

describe('BusinessQueryService', () => {
  let prisma: jest.Mocked<any>;
  let service: BusinessQueryService;

  beforeEach(() => {
    prisma = {
      orderItem: { findMany: jest.fn() },
      product: { findMany: jest.fn() },
      project: { findMany: jest.fn() },
      customer: { findMany: jest.fn() },
      beautician: { findMany: jest.fn() },
      reservation: { findMany: jest.fn() },
      schedule: { findMany: jest.fn() },
      serviceTask: { findMany: jest.fn() },
      productOrder: { findMany: jest.fn() },
      customerCard: { findMany: jest.fn() },
      cardUsageRecord: { findMany: jest.fn() },
      customerBalanceAccount: { findMany: jest.fn() },
      commissionRecord: { findMany: jest.fn() },
      paymentRecord: { findMany: jest.fn() },
      refundRecord: { findMany: jest.fn() },
      marketingAttribution: { findMany: jest.fn() },
      marketingPageAttribution: { findMany: jest.fn() },
      recommendationEvent: { findMany: jest.fn() },
      marketingAutomationExecution: { findMany: jest.fn() },
      terminalDevice: { findMany: jest.fn() },
      terminalConversation: { findMany: jest.fn() },
      userStore: { findMany: jest.fn() },
      aiAuditLog: { create: jest.fn() },
    };
    service = new BusinessQueryService(prisma);
  });

  it('routes product sales growth questions to product sales trend instead of customer growth', () => {
    const plan = service.resolve({
      question: '近期销量增长的商品',
      storeId: 1,
      role: 'manager',
    });

    expect(plan.domain).toBe('product');
    expect(plan.capability).toBe('product_sales_trend');
    expect(plan.needClarification).toBe(false);
  });

  it('routes customer growth questions to customer growth opportunity', () => {
    const plan = service.resolve({
      question: '最近增长客户',
      storeId: 1,
      role: 'manager',
    });

    expect(plan.domain).toBe('customer');
    expect(plan.capability).toBe('customer_growth_opportunity');
  });

  it('uses unified query hub before legacy BusinessQuery query methods when planner is injected', async () => {
    const queryPlanner = {
      plan: jest.fn().mockReturnValue({
        plan: { queryId: 'sq_bq', metrics: [{ key: 'product_sales_quantity', aggregation: 'sum' }], dimensions: ['productId', 'productName'] },
        warnings: [],
      }),
    };
    const semanticQueryExecutor = {
      execute: jest.fn().mockResolvedValue({
        status: 'success',
        queryId: 'sq_bq',
        capabilityId: 'product_sales_ranking',
        title: '商品销量排行',
        summary: '近30天销量最高的是补水精华。',
        rows: [{ productId: 301, productName: '补水精华', quantity: 10 }],
        actions: [{ label: '查看商品明细', action: 'product:301', riskLevel: 'low' }],
        userEvidence: { dataSummary: '基于 1 条业务记录统计' },
        auditEvidence: {
          source: ['ProductOrder', 'OrderItem', 'Product'],
          metricDefinition: '商品销量测试口径',
          filters: ['当前门店'],
          sampleSize: 1,
        },
      }),
    };
    const preParser = {
      parse: jest.fn().mockReturnValue({
        task: {
          taskType: 'ranking',
          domain: 'product',
          objective: '最近销量好的商品有哪些',
          entities: [],
          metrics: ['product_sales_quantity'],
          filters: {},
          timeRange: { preset: 'last_30_days', label: '近30天' },
          sort: [{ field: 'product_sales_quantity', direction: 'desc' }],
          limit: 10,
          outputMode: 'ranked_list',
          riskLevel: 'low',
          requiresApproval: false,
          missingSlots: [],
          confidence: 0.9,
          actorRole: 'manager',
        },
      }),
    };
    const unifiedService = new BusinessQueryService(prisma, queryPlanner as any, semanticQueryExecutor as any, preParser as any);

    const result = await unifiedService.ask({ question: '最近销量好的商品有哪些', storeId: 1, role: 'manager' });

    expect(queryPlanner.plan).toHaveBeenCalled();
    expect(semanticQueryExecutor.execute).toHaveBeenCalledWith(queryPlanner.plan.mock.results[0].value.plan);
    expect(prisma.orderItem.findMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'success',
      capability: 'product_sales_trend',
      card: {
        type: 'productSalesTrend',
        items: [{ productId: 301, productName: '补水精华', quantity: 10 }],
      },
    });
  });

  it('recognizes core operating domains before executing governed queries', () => {
    const cases = [
      ['近期销量增长的商品', 'product', 'product_sales_trend'],
      ['最近做得最多的项目', 'project', 'project_service_trend'],
      ['哪些客户要流失', 'customer', 'customer_churn_risk'],
      ['今天排班占用率怎么样', 'schedule', 'schedule_utilization'],
      ['今日预约情况', 'reservation', 'reservation_today'],
      ['今天订单收入多少', 'order', 'order_revenue_analysis'],
      ['即将到期次卡', 'card', 'card_expiry_risk'],
      ['会员卡余额沉淀资金', 'memberCard', 'member_balance_analysis'],
      ['今日实收和费用', 'finance', 'finance_cashflow_summary'],
      ['哪些商品低库存', 'inventory', 'inventory_alert'],
      ['活动转化效果', 'marketing', 'marketing_conversion'],
      ['自动化执行复盘', 'automation', 'automation_execution_summary'],
      ['项目耗材毛利', 'project', 'project_material_margin'],
      ['供应链采购建议', 'supplyChain', 'supplier_purchase_advice'],
      ['经营异常提醒', 'business', 'business_anomaly_alert'],
      ['多店收入对比', 'store', 'multi_store_comparison'],
      ['近期表现较好的员工', 'staff', 'staff_performance'],
      ['终端最近失败最多的问题', 'terminal', 'terminal_health_diagnosis'],
    ] as const;

    for (const [question, domain, capability] of cases) {
      const plan = service.resolve({ question, storeId: 1, role: 'manager' });

      expect(plan.domain).toBe(domain);
      expect(plan.capability).toBe(capability);
      expect(plan.needClarification).toBe(false);
    }
  });

  it('aggregates staff performance from governed staff-linked records', async () => {
    prisma.beautician.findMany.mockResolvedValue([
      { id: 11, name: '沈晴', status: 'active', level: { name: '高级美容师' } },
      { id: 12, name: '唐伊', status: 'active', level: { name: '中级美容师' } },
    ]);
    prisma.orderItem.findMany.mockResolvedValue([
      {
        id: 1,
        orderId: 1001,
        beauticianId: 11,
        itemType: 'project',
        quantity: 3,
        subtotal: 2400,
        createdAt: new Date(),
        order: { id: 1001, customerId: 101, createdAt: new Date(), status: 'completed' },
      },
      {
        id: 2,
        orderId: 1002,
        beauticianId: 12,
        itemType: 'project',
        quantity: 1,
        subtotal: 600,
        createdAt: new Date(),
        order: { id: 1002, customerId: 102, createdAt: new Date(), status: 'completed' },
      },
    ]);
    prisma.commissionRecord.findMany.mockResolvedValue([
      { id: 1, beauticianId: 11, amount: 360, status: 'pending', type: 'project', createdAt: new Date() },
      { id: 2, beauticianId: 12, amount: 90, status: 'pending', type: 'project', createdAt: new Date() },
    ]);
    prisma.reservation.findMany.mockResolvedValue([
      { id: 1, beauticianId: 11, customerId: 101, status: 'completed', date: new Date() },
      { id: 2, beauticianId: 11, customerId: 103, status: 'pending', date: new Date() },
      { id: 3, beauticianId: 12, customerId: 102, status: 'completed', date: new Date() },
    ]);
    prisma.serviceTask.findMany.mockResolvedValue([
      { id: 1, beauticianId: 11, status: 'completed', completedAt: new Date() },
      { id: 2, beauticianId: 12, status: 'pending', completedAt: null },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([
      { id: 1, beauticianId: 11, customerId: 101, times: 2, verifiedAt: new Date() },
    ]);

    const result = await service.ask({
      question: '近期表现较好的员工',
      storeId: 1,
      role: 'manager',
    });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true, requireItems: true });
    expect(result.domain).toBe('staff');
    expect(result.capability).toBe('staff_performance');
    expect(result.card?.type).toBe('staffPerformance');
    expect(result.card?.items[0]).toMatchObject({
      beauticianName: '沈晴',
      serviceCount: 3,
      cardUsageTimes: 2,
      salesAmount: 2400,
      commissionAmount: 360,
      completionRateText: '50%',
    });
    expect(result.answer).toContain('沈晴');
    expect(result.evidence.source).toContain('CommissionRecord');
  });

  it('diagnoses terminal device and conversation failures without falling back to unsupported answers', async () => {
    prisma.terminalDevice.findMany.mockResolvedValue([
      {
        id: 21,
        deviceCode: 'POS-01',
        name: '前台终端',
        status: 'online',
        networkStatus: 'ok',
        printerStatus: 'error',
        scannerStatus: 'ok',
        cameraStatus: 'ok',
        batteryLevel: 80,
        lastOnlineAt: new Date(),
      },
      {
        id: 22,
        deviceCode: 'ROOM-02',
        name: '护理间终端',
        status: 'offline',
        networkStatus: 'offline',
        printerStatus: 'ok',
        scannerStatus: 'ok',
        cameraStatus: 'ok',
        batteryLevel: 15,
        lastOnlineAt: new Date(),
      },
    ]);
    prisma.terminalConversation.findMany.mockResolvedValue([
      {
        id: 1,
        deviceId: 'POS-01',
        role: 'manager',
        messageCount: 2,
        updatedAt: new Date(),
        messages: [
          { content: '缺少设备认证令牌' },
          { content: '点击服务记录接口失败 500' },
        ],
      },
      {
        id: 2,
        deviceId: 'ROOM-02',
        role: 'manager',
        messageCount: 1,
        updatedAt: new Date(),
        messages: [{ content: '页面一直重复刷新，不稳定' }],
      },
    ]);

    const result = await service.ask({
      question: '终端最近失败最多的问题',
      storeId: 1,
      role: 'manager',
    });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true, requireItems: true });
    expect(result.domain).toBe('terminal');
    expect(result.capability).toBe('terminal_health_diagnosis');
    expect(result.card?.type).toBe('terminalHealthDiagnosis');
    expect(result.card?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failureCategoryLabel: '设备离线或状态异常',
          failureCount: 1,
          recommendation: expect.stringContaining('检查设备网络'),
        }),
        expect.objectContaining({
          failureCategoryLabel: '设备认证或会话初始化异常',
          sampleMessage: '缺少设备认证令牌',
        }),
      ]),
    );
    expect(result.answer).toContain('终端失败信号');
    expect(result.evidence.source).toEqual(['TerminalDevice', 'TerminalConversation']);
    expect(prisma.terminalDevice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId: 1 },
      }),
    );
    expect(prisma.terminalConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 1 }),
      }),
    );
  });

  it('does not invent terminal diagnosis when there is no terminal evidence', async () => {
    prisma.terminalDevice.findMany.mockResolvedValue([]);
    prisma.terminalConversation.findMany.mockResolvedValue([]);

    const result = await service.ask({
      question: '终端最近失败最多的问题',
      storeId: 1,
      role: 'manager',
    });

    expectBusinessQueryResponseContract(result, 'no_data');
    expect(result.domain).toBe('terminal');
    expect(result.capability).toBe('terminal_health_diagnosis');
    expect(result.answer).toContain('没有终端设备或终端会话数据');
    expect(result.evidence.source).toEqual(['TerminalDevice', 'TerminalConversation']);
  });

  it('blocks terminal device diagnosis for roles without terminal management permission', async () => {
    const result = await service.ask({
      question: '终端最近失败最多的问题',
      storeId: 1,
      role: 'reception',
    });

    expectBusinessQueryResponseContract(result, 'unsupported');
    expect(result.domain).toBe('terminal');
    expect(result.capability).toBe('terminal_health_diagnosis');
    expect(result.answer).toContain('当前角色暂不能查询');
    expect(prisma.terminalDevice.findMany).not.toHaveBeenCalled();
    expect(prisma.terminalConversation.findMany).not.toHaveBeenCalled();
  });

  it('aggregates current and previous product sales trend with evidence', async () => {
    const now = Date.now();
    prisma.orderItem.findMany.mockResolvedValue([
      {
        orderId: 1,
        itemType: 'product',
        itemId: 301,
        name: '补水精华',
        quantity: 10,
        subtotal: 1000,
        createdAt: new Date(now - 5 * 86_400_000),
        order: { id: 1, customerId: 101, createdAt: new Date(now - 5 * 86_400_000), status: 'completed' },
      },
      {
        orderId: 2,
        itemType: 'product',
        itemId: 301,
        name: '补水精华',
        quantity: 4,
        subtotal: 400,
        createdAt: new Date(now - 35 * 86_400_000),
        order: { id: 2, customerId: 102, createdAt: new Date(now - 35 * 86_400_000), status: 'completed' },
      },
    ]);
    prisma.product.findMany.mockResolvedValue([
      { id: 301, name: '补水精华', currentStock: 18, safetyStock: 8, unit: '瓶' },
    ]);

    const result = await service.ask({
      question: '近期销量增长的商品',
      storeId: 1,
      role: 'manager',
    });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true, requireItems: true });
    expect(result.capability).toBe('product_sales_trend');
    expect(result.card?.type).toBe('productSalesTrend');
    expect(result.card?.items[0]).toMatchObject({
      productName: '补水精华',
      quantity: 10,
      previousQuantity: 4,
      growthQuantity: 6,
      growthRateText: '+150%',
      currentStock: 18,
    });
    expect(result.evidence.source).toContain('OrderItem');
    expect(result.answer).toContain('补水精华');
    expect(prisma.aiAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scenario: 'business_query',
        provider: 'ami_core',
        model: 'business-query-router',
        status: 'success',
      }),
    });
  });

  it('returns no_data instead of inventing when there is no product sales evidence', async () => {
    prisma.orderItem.findMany.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([]);

    const result = await service.ask({
      question: '近期销量增长的商品',
      storeId: 1,
      role: 'manager',
    });

    expectBusinessQueryResponseContract(result, 'no_data');
    expect(result.answer).toContain('无法判断');
    expect(result.evidence.source).toEqual(['ProductOrder', 'OrderItem', 'Product']);
  });

  it('blocks disallowed roles before executing governed product sales queries', async () => {
    const result = await service.ask({
      question: '最近销量好的商品有哪些',
      storeId: 1,
      role: 'beautician',
      operatorId: 7,
    });

    expectBusinessQueryResponseContract(result, 'unsupported');
    expect(result.capability).toBe('product_sales_trend');
    expect(result.answer).toContain('当前角色暂不能查询');
    expect(prisma.orderItem.findMany).not.toHaveBeenCalled();
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.aiAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scenario: 'business_query',
        status: 'unsupported',
        safetyBlocked: true,
      }),
    });
  });

  it('aggregates project service trend from governed order items', async () => {
    const now = Date.now();
    prisma.orderItem.findMany.mockResolvedValue([
      {
        orderId: 1,
        itemType: 'project',
        itemId: 501,
        name: '深层补水护理',
        quantity: 3,
        subtotal: 900,
        createdAt: new Date(now - 3 * 86_400_000),
        order: { id: 1, customerId: 101, createdAt: new Date(now - 3 * 86_400_000), status: 'completed' },
      },
      {
        orderId: 2,
        itemType: 'project',
        itemId: 501,
        name: '深层补水护理',
        quantity: 1,
        subtotal: 300,
        createdAt: new Date(now - 35 * 86_400_000),
        order: { id: 2, customerId: 102, createdAt: new Date(now - 35 * 86_400_000), status: 'completed' },
      },
    ]);
    prisma.project.findMany.mockResolvedValue([{ id: 501, name: '深层补水护理', duration: 60, price: 300 }]);

    const result = await service.ask({ question: '最近做得最多的项目', storeId: 1, role: 'manager' });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true, requireItems: true });
    expect(result.capability).toBe('project_service_trend');
    expect(result.card?.items[0]).toMatchObject({
      projectName: '深层补水护理',
      serviceCount: 3,
      previousServiceCount: 1,
      growthRateText: '+200%',
    });
    expect(result.evidence.source).toContain('Project');
  });

  it('calculates schedule utilization by beautician', async () => {
    prisma.schedule.findMany.mockResolvedValue([
      { id: 1, beauticianId: 11, status: 'available', beautician: { id: 11, name: '沈晴', status: 'active' } },
      { id: 2, beauticianId: 11, status: 'busy', beautician: { id: 11, name: '沈晴', status: 'active' } },
      { id: 3, beauticianId: 12, status: 'leave', beautician: { id: 12, name: '唐伊', status: 'active' } },
    ]);

    const result = await service.ask({ question: '今天排班占用率怎么样', storeId: 1, role: 'manager' });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true, requireItems: true });
    expect(result.capability).toBe('schedule_utilization');
    expect(result.card?.items[0]).toMatchObject({ beauticianName: '唐伊', utilizationRateText: '+100%' });
    expect(result.evidence.metricDefinition).toContain('排班利用率');
  });

  it('returns expiring customer cards with customer evidence', async () => {
    const expiryDate = new Date(Date.now() + 7 * 86_400_000);
    prisma.customerCard.findMany.mockResolvedValue([
      {
        id: 701,
        customerId: 101,
        cardName: '补水护理 10 次卡',
        totalTimes: 10,
        remainingTimes: 2,
        expiryDate,
        customer: { id: 101, name: '李伟明', phone: '15895260608', memberLevel: '银卡会员' },
      },
    ]);

    const result = await service.ask({ question: '即将到期次卡', storeId: 1, role: 'manager' });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true, requireItems: true });
    expect(result.capability).toBe('card_expiry_risk');
    expect(result.card?.items[0]).toMatchObject({
      customerName: '李伟明',
      phone: '158****0608',
      cardName: '补水护理 10 次卡',
      remainingTimes: 2,
    });
  });

  it('aggregates card usage records', async () => {
    prisma.cardUsageRecord.findMany.mockResolvedValue([
      { id: 1, customerId: 101, cardName: '补水护理 10 次卡', projectName: '深层补水护理', times: 2, remainingTimes: 6, beauticianId: 11 },
      { id: 2, customerId: 102, cardName: '补水护理 10 次卡', projectName: '深层补水护理', times: 1, remainingTimes: 4, beauticianId: 12 },
    ]);

    const result = await service.ask({ question: '核销最多的卡', storeId: 1, role: 'manager' });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true, requireItems: true });
    expect(result.capability).toBe('card_usage_analysis');
    expect(result.card?.items[0]).toMatchObject({
      cardName: '补水护理 10 次卡',
      projectName: '深层补水护理',
      usageTimes: 3,
      customerCount: 2,
    });
  });

  it('summarizes member card balance accounts', async () => {
    prisma.customerBalanceAccount.findMany.mockResolvedValue([
      {
        id: 801,
        customerId: 101,
        cashBalance: 800,
        giftBalance: 200,
        updatedAt: new Date(),
        customer: { id: 101, name: '李伟明', phone: '15895260608', memberLevel: '银卡会员' },
      },
    ]);

    const result = await service.ask({ question: '会员卡余额沉淀资金', storeId: 1, role: 'manager' });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true, requireItems: true });
    expect(result.capability).toBe('member_balance_analysis');
    expect(result.card?.items[0]).toMatchObject({
      customerName: '李伟明',
      cashBalance: 800,
      giftBalance: 200,
      totalBalance: 1000,
    });
  });

  it('summarizes finance cashflow from payment and refund records', async () => {
    prisma.paymentRecord.findMany.mockResolvedValue([
      { id: 1, method: 'wechat', amount: 1200, status: 'paid', paidAt: new Date() },
      { id: 2, method: 'cash', amount: 300, status: 'paid', paidAt: new Date() },
    ]);
    prisma.refundRecord.findMany.mockResolvedValue([{ id: 1, amount: 200, status: 'refunded', refundedAt: new Date() }]);

    const result = await service.ask({ question: '今日实收和费用', storeId: 1, role: 'manager' });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true });
    expect(result.capability).toBe('finance_cashflow_summary');
    expect(result.card?.kpis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '实收', value: '¥1,500' }),
        expect.objectContaining({ label: '退款', value: '¥200' }),
        expect.objectContaining({ label: '净额', value: '¥1,300' }),
      ]),
    );
  });

  it('summarizes marketing conversion from governed attribution records', async () => {
    prisma.marketingAttribution.findMany.mockResolvedValue([
      {
        id: 1,
        strategyId: 301,
        customerId: 101,
        orderId: 1001,
        attributedRevenue: 1500,
        strategy: { id: 301, name: '沉睡客户唤醒', status: 'active' },
        order: { id: 1001, totalAmount: 1500, status: 'completed' },
      },
    ]);
    prisma.marketingPageAttribution.findMany.mockResolvedValue([
      {
        id: 2,
        pageId: 401,
        customerId: 102,
        orderId: 1002,
        attributedRevenue: 800,
        page: { id: 401, title: '夏季补水活动页', sourceType: 'activity', status: 'published' },
        order: { id: 1002, totalAmount: 800, status: 'completed' },
      },
    ]);
    prisma.recommendationEvent.findMany.mockResolvedValue([
      { id: 3, eventType: 'converted', orderId: 1003, customerId: 103, createdAt: new Date() },
    ]);

    const result = await service.ask({ question: '最近活动转化怎么样', storeId: 1, role: 'manager' });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true, requireItems: true });
    expect(result.capability).toBe('marketing_conversion');
    expect(result.card?.type).toBe('marketingConversion');
    expect(result.card?.kpis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '转化次数', value: '3' }),
        expect.objectContaining({ label: '归因收入', value: '¥2,300' }),
      ]),
    );
    expect(result.evidence.source).toContain('MarketingAttribution');
  });

  it('creates product replenishment opportunities from stock and sales evidence', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 301, name: '补水精华', sku: 'SKU-301', currentStock: 3, safetyStock: 10, unit: '瓶', status: 'active' },
    ]);
    prisma.orderItem.findMany.mockResolvedValue([
      {
        orderId: 1,
        itemType: 'product',
        itemId: 301,
        name: '补水精华',
        quantity: 12,
        subtotal: 1200,
        order: { id: 1, createdAt: new Date(), status: 'completed' },
      },
    ]);

    const result = await service.ask({ question: '有哪些商品需要补货建议', storeId: 1, role: 'manager' });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true, requireItems: true });
    expect(result.capability).toBe('product_replenishment_opportunity');
    expect(result.card?.items[0]).toMatchObject({
      productName: '补水精华',
      currentStock: 3,
      safetyStock: 10,
      salesQuantity: 12,
      suggestedReplenishment: 7,
    });
    expect(result.actions[0]).toMatchObject({ label: '生成补货单草稿', riskLevel: 'medium' });
  });

  it('summarizes automation execution outcomes', async () => {
    prisma.marketingAutomationExecution.findMany.mockResolvedValue([
      {
        id: 1,
        strategyId: 401,
        strategyName: '沉睡客户唤醒',
        status: 'success',
        triggeredCount: 10,
        reachedCount: 8,
        executedAt: new Date(),
        strategy: { id: 401, name: '沉睡客户唤醒', status: 'enabled', source: 'manual' },
        touches: [
          { id: 1, status: 'converted', actualRevenue: 500, convertedAt: new Date(), customerId: 101 },
          { id: 2, status: 'reached', actualRevenue: 0, convertedAt: null, customerId: 102 },
        ],
        attributions: [{ id: 1, attributedRevenue: 800, customerId: 101, orderId: 1001 }],
      },
    ]);

    const result = await service.ask({ question: '自动化执行复盘', storeId: 1, role: 'manager' });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true, requireItems: true });
    expect(result.capability).toBe('automation_execution_summary');
    expect(result.card?.items[0]).toMatchObject({
      strategyName: '沉睡客户唤醒',
      executionCount: 1,
      reachedCount: 8,
      convertedCount: 1,
      attributedRevenue: 1300,
    });
  });

  it('estimates project material margin from BOM and product cost', async () => {
    prisma.project.findMany.mockResolvedValue([
      {
        id: 501,
        name: '深层补水护理',
        price: 480,
        duration: 60,
        bomItems: [
          { standardQty: 2, unit: '片', product: { id: 301, name: '补水面膜', costPrice: 30, unit: '片' } },
          { standardQty: 1, unit: '支', product: { id: 302, name: '精华安瓶', costPrice: 80, unit: '支' } },
        ],
      },
    ]);

    const result = await service.ask({ question: '项目耗材毛利', storeId: 1, role: 'manager' });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true, requireItems: true });
    expect(result.capability).toBe('project_material_margin');
    expect(result.card?.items[0]).toMatchObject({
      projectName: '深层补水护理',
      projectPrice: 480,
      materialCost: 140,
      grossMargin: 340,
      grossMarginRateText: '+71%',
    });
  });

  it('creates supplier purchase advice from replenishment demand and supplier terms', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 301,
        name: '补水精华',
        sku: 'SKU-301',
        currentStock: 2,
        safetyStock: 10,
        unit: '瓶',
        costPrice: 70,
        supplier: '默认供应商',
        minPurchaseQty: 0,
        suppliers: [
          {
            supplyPrice: 65,
            moq: 12,
            leadDays: 5,
            isPrimary: true,
            supplier: { id: 1, name: '华南供应商', paymentTerms: '月结' },
          },
        ],
      },
    ]);
    prisma.orderItem.findMany.mockResolvedValue([
      { orderId: 1, itemType: 'product', itemId: 301, quantity: 15, subtotal: 1500, order: { id: 1, createdAt: new Date() } },
    ]);

    const result = await service.ask({ question: '供应链采购建议', storeId: 1, role: 'manager' });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true, requireItems: true });
    expect(result.capability).toBe('supplier_purchase_advice');
    expect(result.card?.items[0]).toMatchObject({
      productName: '补水精华',
      supplierName: '华南供应商',
      suggestedQty: 12,
      estimatedAmount: 780,
    });
  });

  it('detects business anomalies from governed operating data', async () => {
    prisma.productOrder.findMany.mockResolvedValue([]);
    prisma.reservation.findMany.mockResolvedValue([
      { id: 1, status: 'pending' },
      { id: 2, status: 'no_show' },
    ]);
    prisma.product.findMany.mockResolvedValue([{ id: 301, name: '补水精华', currentStock: 2, safetyStock: 10 }]);
    prisma.customer.findMany.mockResolvedValue([{ id: 101, name: '李伟明', totalSpent: 9000, lastVisitDate: new Date(Date.now() - 80 * 86_400_000) }]);
    prisma.marketingAutomationExecution.findMany.mockResolvedValue([{ id: 1, strategyName: '沉睡客户唤醒', status: 'failed', message: '渠道失败', executedAt: new Date() }]);

    const result = await service.ask({ question: '经营异常提醒', storeId: 1, role: 'manager' });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true, requireItems: true });
    expect(result.capability).toBe('business_anomaly_alert');
    expect(result.card?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain: '订单', severity: 'high' }),
        expect.objectContaining({ domain: '库存', title: '补水精华 库存不足' }),
        expect.objectContaining({ domain: '自动化', severity: 'high' }),
      ]),
    );
  });

  it('compares only stores authorized for the current operator', async () => {
    prisma.userStore.findMany.mockResolvedValue([
      { storeId: 1, store: { id: 1, name: '南山店', city: '深圳', status: 'active', deletedAt: null } },
      { storeId: 2, store: { id: 2, name: '福田店', city: '深圳', status: 'active', deletedAt: null } },
    ]);
    prisma.productOrder.findMany.mockResolvedValue([
      { id: 1, storeId: 1, totalAmount: 1000 },
      { id: 2, storeId: 2, totalAmount: 2000 },
    ]);
    prisma.reservation.findMany.mockResolvedValue([{ id: 1, storeId: 2 }]);
    prisma.customer.findMany.mockResolvedValue([{ id: 1, storeId: 1 }, { id: 2, storeId: 2 }]);
    prisma.product.findMany.mockResolvedValue([{ id: 1, storeId: 1, currentStock: 1, safetyStock: 5 }]);

    const result = await service.ask({ question: '多店收入对比', storeId: 1, role: 'manager', operatorId: 99 });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true, requireItems: true });
    expect(result.capability).toBe('multi_store_comparison');
    expect(prisma.productOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: { in: [1, 2] } }),
      }),
    );
    expect(result.card?.items[0]).toMatchObject({ storeName: '福田店', salesAmount: 2000 });
    expect(result.card?.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ storeId: 3 })]));
  });

  it('does not compare stores when the operator has only one authorized store', async () => {
    prisma.userStore.findMany.mockResolvedValue([
      { storeId: 1, store: { id: 1, name: '南山店', city: '深圳', status: 'active', deletedAt: null } },
    ]);

    const result = await service.ask({ question: '多店收入对比', storeId: 1, role: 'manager', operatorId: 99 });

    expectBusinessQueryResponseContract(result, 'no_data');
    expect(result.answer).toContain('未授权多个门店');
    expect(prisma.productOrder.findMany).not.toHaveBeenCalled();
  });

  it('uses previous product query context to answer stock follow-up without full inventory scan', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 301, name: '补水精华', sku: 'SKU-301', currentStock: 6, safetyStock: 10, unit: '瓶', status: 'active' },
      { id: 302, name: '修护乳', sku: 'SKU-302', currentStock: 22, safetyStock: 8, unit: '瓶', status: 'active' },
    ]);

    const result = await service.ask({
      question: '这些商品库存够吗',
      storeId: 1,
      role: 'manager',
      context: {
        previousResponse: {
          domain: 'product',
          capability: 'product_sales_trend',
          card: {
            type: 'productSalesTrend',
            title: '近期销量增长的商品',
            items: [
              { productId: 301, productName: '补水精华' },
              { productId: 302, productName: '修护乳' },
            ],
          },
        },
      },
    });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true, requireItems: true });
    expect(result.capability).toBe('inventory_alert');
    expect(result.queryPlan.filters.contextProductIds).toEqual([301, 302]);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [301, 302] } }),
      }),
    );
    expect(result.answer).toContain('补水精华');
  });

  it('uses previous product query context to answer buyer follow-up', async () => {
    prisma.orderItem.findMany.mockResolvedValue([
      {
        orderId: 1,
        itemType: 'product',
        itemId: 301,
        name: '补水精华',
        quantity: 2,
        subtotal: 596,
        createdAt: new Date(),
        order: { id: 1, customerId: 101, customerName: '李伟明', createdAt: new Date(), totalAmount: 596, status: 'completed' },
      },
    ]);
    prisma.customer.findMany.mockResolvedValue([{ id: 101, name: '李伟明', phone: '15895260608', memberLevel: '银卡会员', tags: ['VIP'] }]);

    const result = await service.ask({
      question: '哪些客户买的',
      storeId: 1,
      role: 'manager',
      context: {
        previousResponse: {
          domain: 'product',
          capability: 'product_sales_trend',
          card: {
            type: 'productSalesTrend',
            title: '近期销量增长的商品',
            items: [{ productId: 301, productName: '补水精华' }],
          },
        },
      },
    });

    expectBusinessQueryResponseContract(result, 'success', { requireCard: true, requireItems: true });
    expect(result.capability).toBe('product_customer_distribution');
    expect(result.card?.items[0]).toMatchObject({
      productName: '补水精华',
      customerName: '李伟明',
      phone: '158****0608',
      quantity: 2,
      salesAmount: 596,
    });
    expect(result.evidence.filters).toContain('productId in context(1)');
  });
});
