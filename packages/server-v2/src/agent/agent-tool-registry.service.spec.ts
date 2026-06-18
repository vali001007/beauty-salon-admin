import { AgentToolRegistryService } from './agent-tool-registry.service.js';

describe('AgentToolRegistryService', () => {
  let prisma: jest.Mocked<any>;
  let businessQueryService: jest.Mocked<any>;
  let marketingService: jest.Mocked<any>;
  let inventoryService: jest.Mocked<any>;
  let terminalService: jest.Mocked<any>;
  let smartSchedulingService: jest.Mocked<any>;
  let service: AgentToolRegistryService;

  beforeEach(() => {
    prisma = {
      product: { findMany: jest.fn() },
      project: { findMany: jest.fn() },
      orderItem: { findMany: jest.fn() },
      productOrder: { findMany: jest.fn() },
      commissionRecord: { findMany: jest.fn() },
      dailySettlement: { findMany: jest.fn() },
      stockBatch: { findMany: jest.fn() },
      predictionRun: { findFirst: jest.fn() },
      customerPredictionSnapshot: { findMany: jest.fn() },
      customer: { findMany: jest.fn() },
      beautician: { findFirst: jest.fn(), findMany: jest.fn() },
      serviceTask: { findMany: jest.fn() },
      schedule: { findMany: jest.fn() },
      reservation: { findMany: jest.fn() },
      customerCard: { findMany: jest.fn() },
      cardUsageRecord: { findMany: jest.fn() },
      customerBalanceAccount: { findMany: jest.fn() },
      customerBalanceTransaction: { findMany: jest.fn() },
      supplier: { findMany: jest.fn() },
      supplierOrder: { findMany: jest.fn() },
      supplierSettlement: { findMany: jest.fn() },
      marketingPage: { findMany: jest.fn() },
      marketingPageEvent: { findMany: jest.fn() },
      promotion: { findMany: jest.fn() },
      customerAppIdentity: { findMany: jest.fn() },
      customerAppEvent: { findMany: jest.fn() },
      marketingPageLead: { findMany: jest.fn() },
      marketingPageAttribution: { findMany: jest.fn() },
      marketingAutomationExecution: { findMany: jest.fn() },
      terminalDevice: { findMany: jest.fn() },
      terminalConversation: { findMany: jest.fn() },
      terminalFollowUpTask: { findMany: jest.fn() },
      refundRecord: { findMany: jest.fn() },
      userStore: { findMany: jest.fn() },
    };
    businessQueryService = {
      ask: jest.fn(),
    };
    marketingService = {
      createActivity: jest.fn(),
    };
    inventoryService = {
      getReplenishment: jest.fn(),
      createPurchaseOrder: jest.fn(),
    };
    terminalService = {
      batchCreateFollowUpTasks: jest.fn(),
    };
    smartSchedulingService = {
      preview: jest.fn(),
    };
    service = new AgentToolRegistryService(
      prisma,
      businessQueryService,
      marketingService,
      inventoryService,
      terminalService,
      smartSchedulingService,
    );
  });

  it('registers P0 agent tools', () => {
    expect(service.list().map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        'business.query.ask',
        'customer.priority.rank',
        'revenue.diagnose',
        'product.sales.rank',
        'inventory.risk.rank',
        'marketing.opportunity.discover',
        'marketing.activity.draft',
        'customer.followup.task.draft',
        'inventory.replenishment.draft',
        'service.record.draft',
        'scheduling.optimization.preview',
        'schedule.diagnose',
        'project.diagnose',
        'card.diagnose',
        'finance.margin.diagnose',
        'staff.performance.rank',
        'supply_chain.diagnose',
        'marketing.conversion.diagnose',
        'automation.execution.diagnose',
        'store.comparison.diagnose',
        'promotion.effect.analyze',
        'customer_app.funnel.analyze',
        'terminal.health.diagnose',
        'order.refund.diagnose',
        'service.quality.diagnose',
      ]),
    );
    expect(service.list().find((tool) => tool.name === 'customer.priority.rank')?.consumedSlots).toEqual([
      'timeRange',
      'limit',
      'filters.customerSegment',
    ]);
    expect(service.list().find((tool) => tool.name === 'revenue.diagnose')?.consumedSlots).toEqual(['timeRange']);
    expect(service.list().find((tool) => tool.name === 'product.sales.rank')?.consumedSlots).toEqual(['timeRange', 'limit']);
    expect(service.list().find((tool) => tool.name === 'inventory.risk.rank')?.consumedSlots).toEqual(['timeRange', 'limit']);
    expect(service.list().find((tool) => tool.name === 'staff.performance.rank')?.consumedSlots).toEqual(['timeRange', 'limit']);
    for (const toolName of [
      'schedule.diagnose',
      'project.diagnose',
      'card.diagnose',
      'finance.margin.diagnose',
      'supply_chain.diagnose',
      'marketing.conversion.diagnose',
      'automation.execution.diagnose',
      'store.comparison.diagnose',
      'customer_app.funnel.analyze',
      'terminal.health.diagnose',
      'order.refund.diagnose',
      'service.quality.diagnose',
    ]) {
      expect(service.list().find((tool) => tool.name === toolName)?.consumedSlots).toEqual(['timeRange', 'limit']);
    }
    expect(service.list().find((tool) => tool.name === 'promotion.effect.analyze')?.consumedSlots).toBeUndefined();
  });

  it('blocks direct tool execution when the current role is not allowed', async () => {
    const result = await service.execute(
      'terminal.health.diagnose',
      { question: '终端最近失败最多的问题' },
      { runId: 1, storeId: 1, userId: 7, role: 'reception' },
    );

    expect(result).toMatchObject({
      status: 'unsupported',
      title: '权限不足',
      summary: expect.stringContaining('当前账号角色不能使用'),
      evidence: expect.objectContaining({
        filters: ['当前角色：前台'],
        limitations: ['角色权限不足，已阻止工具执行。'],
      }),
      actions: [],
    });
    expect(prisma.terminalDevice.findMany).not.toHaveBeenCalled();
    expect(prisma.terminalConversation.findMany).not.toHaveBeenCalled();
  });

  it('blocks frontdesk from executing manager-only marketing opportunity discovery', async () => {
    const result = await service.execute(
      'marketing.opportunity.discover',
      { question: '有哪些商品适合做活动', targetType: 'product' },
      { runId: 2, storeId: 1, userId: 9, role: 'reception' },
    );

    expect(result).toMatchObject({
      status: 'unsupported',
      title: '权限不足',
      summary: expect.stringContaining('当前账号角色不能使用'),
      evidence: expect.objectContaining({
        filters: ['当前角色：前台'],
        limitations: ['角色权限不足，已阻止工具执行。'],
      }),
    });
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.stockBatch.findMany).not.toHaveBeenCalled();
    expect(prisma.orderItem.findMany).not.toHaveBeenCalled();
  });

  it('ranks customer follow-up priorities with evidence without creating tasks', async () => {
    prisma.predictionRun.findFirst.mockResolvedValue({ id: 11, status: 'completed' });
    prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
      {
        id: 1,
        customerId: 501,
        churnScore: 86,
        churnLevel: '极高',
        repurchase30dScore: 62,
        marketingResponseScore: 78,
        customer: {
          id: 501,
          name: '李女士',
          phone: '13800000000',
          memberLevel: '金卡',
          visitCount: 8,
          totalSpent: 12000,
          lastVisitDate: new Date(Date.now() - 65 * 86_400_000),
          tags: ['VIP'],
        },
      },
      {
        id: 2,
        customerId: 502,
        churnScore: 60,
        churnLevel: '中',
        repurchase30dScore: 80,
        marketingResponseScore: 40,
        customer: {
          id: 502,
          name: '王女士',
          phone: '13900000000',
          memberLevel: '银卡',
          visitCount: 5,
          totalSpent: 6000,
          lastVisitDate: new Date(Date.now() - 30 * 86_400_000),
          tags: [],
        },
      },
    ]);

    const result = await service.execute(
      'customer.priority.rank',
      { question: '今天最值得跟进的10个客户', limit: 10, timeRange: 'today' },
      { runId: 301, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('今日优先跟进客户');
    expect(result.summary).toContain('少于你要求的 10 位');
    expect((result.data as any).requestedLimit).toBe(10);
    expect((result.data as any).items).toHaveLength(2);
    expect((result.data as any).items[0]).toMatchObject({
      customerId: 501,
      customerName: '李女士',
      phone: '138****0000',
      priority: 'urgent',
    });
    expect(result.evidence?.metricDefinition).toContain('follow_up_priority_score');
    expect(terminalService.batchCreateFollowUpTasks).not.toHaveBeenCalled();
  });

  it('consumes next week time range when ranking priority customers', async () => {
    prisma.predictionRun.findFirst.mockResolvedValue({ id: 12, status: 'completed' });
    prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
      {
        id: 1,
        customerId: 501,
        churnScore: 65,
        churnLevel: '高',
        repurchase30dScore: 20,
        marketingResponseScore: 20,
        customer: {
          id: 501,
          name: '张女士',
          phone: '13800000001',
          memberLevel: '银卡',
          visitCount: 2,
          totalSpent: 1000,
          lastVisitDate: new Date(Date.now() - 80 * 86_400_000),
          createdAt: new Date(Date.now() - 180 * 86_400_000),
          tags: [],
        },
      },
      {
        id: 2,
        customerId: 502,
        churnScore: 20,
        churnLevel: '低',
        repurchase30dScore: 20,
        marketingResponseScore: 20,
        customer: {
          id: 502,
          name: '周女士',
          phone: '13900000002',
          memberLevel: '金卡',
          visitCount: 4,
          totalSpent: 3000,
          lastVisitDate: new Date(Date.now() - 60 * 86_400_000),
          createdAt: new Date(Date.now() - 180 * 86_400_000),
          tags: [],
        },
      },
    ]);
    prisma.reservation.findMany.mockResolvedValue([{ id: 90, customerId: 502, status: 'confirmed', date: new Date() }]);
    prisma.terminalFollowUpTask.findMany.mockResolvedValue([{ id: 91, customerId: 502, priority: 'urgent', status: 'pending', dueAt: new Date() }]);

    const result = await service.execute(
      'customer.priority.rank',
      { question: '下周重点关注哪些客户', limit: 10, timeRange: 'next_week' },
      { runId: 302, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('下周优先跟进客户');
    expect(result.evidence?.filters).toEqual(expect.arrayContaining(['timeRange=下周', 'limit=10']));
    expect((result.data as any).consumedSlots.timeRange).toMatchObject({ preset: 'next_week', label: '下周' });
    expect((result.data as any).items[0]).toMatchObject({
      customerId: 502,
      customerName: '周女士',
      reservationCount: 1,
      pendingFollowUpCount: 1,
      urgentFollowUpCount: 1,
    });
    expect((result.data as any).items[0].reason).toContain('下周有 1 个预约');
    expect(prisma.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerId: { in: [501, 502] },
          date: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
        }),
      }),
    );
    expect(prisma.terminalFollowUpTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerId: { in: [501, 502] },
          dueAt: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
        }),
      }),
    );
  });

  it('adapts business query service as a read-only agent tool', async () => {
    businessQueryService.ask.mockResolvedValue({
      status: 'success',
      answer: '今天收入 ¥8,000。',
      card: { title: '订单收入分析' },
      evidence: { source: ['ProductOrder'], metricDefinition: '收入口径', filters: [], sampleSize: 8 },
      actions: [],
    });

    const result = await service.execute(
      'business.query.ask',
      { question: '今天收入怎么样' },
      { runId: 1, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.summary).toBe('今天收入 ¥8,000。');
    expect(businessQueryService.ask).toHaveBeenCalledWith(expect.objectContaining({ question: '今天收入怎么样', storeId: 1 }));
  });

  it('ranks staff performance with sales commission service quality and evidence without business query fallback', async () => {
    prisma.beautician.findMany.mockResolvedValue([
      { id: 11, name: '沈晴', status: 'active', userId: 31, level: { name: '高级美容师' } },
      { id: 12, name: '唐伊', status: 'active', userId: 32, level: { name: '中级美容师' } },
    ]);
    prisma.orderItem.findMany.mockResolvedValue([
      {
        orderId: 101,
        itemType: 'project',
        itemId: 401,
        name: '补水护理',
        beauticianId: 11,
        quantity: 3,
        subtotal: 2400,
        order: { id: 101, customerId: 501, createdAt: new Date(), status: 'completed' },
      },
      {
        orderId: 102,
        itemType: 'product',
        itemId: 301,
        name: '补水精华',
        beauticianId: 11,
        quantity: 1,
        subtotal: 680,
        order: { id: 102, customerId: 501, createdAt: new Date(), status: 'paid' },
      },
      {
        orderId: 103,
        itemType: 'project',
        itemId: 402,
        name: '修护护理',
        beauticianId: 12,
        quantity: 1,
        subtotal: 800,
        order: { id: 103, customerId: 502, createdAt: new Date(), status: 'completed' },
      },
    ]);
    prisma.commissionRecord.findMany.mockResolvedValue([
      { id: 1, beauticianId: 11, amount: 300, sourceAmount: 2400, type: 'project', status: 'confirmed', createdAt: new Date() },
      { id: 2, beauticianId: 12, amount: 80, sourceAmount: 800, type: 'project', status: 'pending', createdAt: new Date() },
    ]);
    prisma.reservation.findMany.mockResolvedValue([
      { id: 1, beauticianId: 11, customerId: 501, status: 'completed', date: new Date() },
      { id: 2, beauticianId: 11, customerId: 503, status: 'pending', date: new Date() },
      { id: 3, beauticianId: 12, customerId: 502, status: 'completed', date: new Date() },
    ]);
    prisma.serviceTask.findMany.mockResolvedValue([
      { id: 1, beauticianId: 11, customerId: 501, status: 'completed', completedAt: new Date(), remark: '护理完成', consumptionItems: [{ productId: 1 }] },
      { id: 2, beauticianId: 11, customerId: 503, status: 'pending', completedAt: null, remark: null, consumptionItems: null },
      { id: 3, beauticianId: 12, customerId: 502, status: 'completed', completedAt: new Date(), remark: null, consumptionItems: null },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([
      { id: 1, beauticianId: 11, customerId: 501, times: 2, verifiedAt: new Date() },
      { id: 2, beauticianId: 12, customerId: 502, times: 1, verifiedAt: new Date() },
    ]);

    const result = await service.execute(
      'staff.performance.rank',
      { question: '近期表现较好的员工', limit: 10, timeRange: 'last_30_days' },
      { runId: 320, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('员工表现排行');
    expect(result.summary).toContain('沈晴');
    expect((result.data as any).items[0]).toMatchObject({
      beauticianName: '沈晴',
      serviceCount: 3,
      salesAmount: 3080,
      commissionAmount: 300,
      cardUsageTimes: 2,
      repeatCustomerCount: 2,
    });
    expect((result.data as any).items[0].serviceRecordCompletionRateText).toBe('50%');
    expect(result.evidence).toMatchObject({
      source: ['Beautician', 'OrderItem', 'CommissionRecord', 'Reservation', 'ServiceTask', 'CardUsageRecord'],
      sampleSize: 15,
    });
    expect(result.actions?.[0]).toMatchObject({ action: 'beauticians:open', riskLevel: 'low' });
    expect(businessQueryService.ask).not.toHaveBeenCalled();
  });

  it('limits staff performance to the current beautician when role is beautician', async () => {
    prisma.beautician.findFirst.mockResolvedValue({ id: 11 });
    prisma.beautician.findMany.mockResolvedValue([{ id: 11, name: '沈晴', status: 'active', userId: 31, level: { name: '高级美容师' } }]);
    prisma.orderItem.findMany.mockResolvedValue([
      {
        orderId: 101,
        itemType: 'project',
        itemId: 401,
        name: '补水护理',
        beauticianId: 11,
        quantity: 2,
        subtotal: 1600,
        order: { id: 101, customerId: 501, createdAt: new Date(), status: 'completed' },
      },
    ]);
    prisma.commissionRecord.findMany.mockResolvedValue([{ id: 1, beauticianId: 11, amount: 160, sourceAmount: 1600, type: 'project', status: 'pending', createdAt: new Date() }]);
    prisma.reservation.findMany.mockResolvedValue([{ id: 1, beauticianId: 11, customerId: 501, status: 'completed', date: new Date() }]);
    prisma.serviceTask.findMany.mockResolvedValue([
      { id: 1, beauticianId: 11, customerId: 501, status: 'completed', completedAt: new Date(), remark: '已完成', consumptionItems: [{ productId: 1 }] },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([{ id: 1, beauticianId: 11, customerId: 501, times: 1, verifiedAt: new Date() }]);

    const result = await service.execute(
      'staff.performance.rank',
      { question: '我的表现怎么样', limit: 10, timeRange: 'last_30_days' },
      { runId: 321, storeId: 1, userId: 31, role: 'beautician' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('我的表现');
    expect(result.summary).toContain('你的表现分');
    expect((result.data as any).requestedLimit).toBe(1);
    expect((result.data as any).scope).toBe('本人');
    expect((result.data as any).items).toHaveLength(1);
    expect(prisma.orderItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ beauticianId: 11 }) }));
    expect(result.evidence?.limitations).toContain('美容师角色仅返回本人数据，不返回全店排行。');
    expect(result.actions?.[0]).toMatchObject({ action: 'beautician.commission', riskLevel: 'low' });
    expect(businessQueryService.ask).not.toHaveBeenCalled();
  });

  it('keeps beautician staff performance no-data evidence business-readable when account is not bound', async () => {
    prisma.beautician.findFirst.mockResolvedValue(null);

    const result = await service.execute(
      'staff.performance.rank',
      { question: '我的表现怎么样', limit: 10, timeRange: 'last_30_days' },
      { runId: 322, storeId: 1, userId: 31, role: 'beautician' },
    );

    expect(result.status).toBe('no_data');
    expect(result.title).toBe('我的表现');
    expect(result.summary).toContain('未绑定美容师档案');
    expect(result.evidence?.filters).toEqual(['当前账号为美容师角色', '仅查询本人服务与提成数据', '未找到与当前账号绑定的美容师档案']);
    expect(result.evidence?.filters.join('；')).not.toMatch(/role=|beauticianId=|operatorId=|userId=/);
    expect(prisma.beautician.findMany).not.toHaveBeenCalled();
    expect(businessQueryService.ask).not.toHaveBeenCalled();
  });

  it('diagnoses supply chain delivery and settlement without falling back to business query', async () => {
    prisma.supplier.findMany.mockResolvedValue([
      { id: 601, name: '华东耗材', category: '耗材', status: 'active', paymentTerms: '月结' },
      { id: 602, name: '本地用品', category: '用品', status: 'active', paymentTerms: '现结' },
    ]);
    prisma.supplierOrder.findMany.mockResolvedValue([
      {
        id: 701,
        supplierId: 601,
        totalAmount: 3000,
        netAmount: 2800,
        status: 'received',
        orderedAt: new Date(Date.now() - 6 * 86_400_000),
        receivedAt: new Date(Date.now() - 2 * 86_400_000),
        supplier: { id: 601, name: '华东耗材', category: '耗材', status: 'active' },
        items: [{ quantity: 20, receivedQty: 20, subtotal: 3000 }],
      },
      {
        id: 702,
        supplierId: 602,
        totalAmount: 1200,
        netAmount: 1200,
        status: 'pending',
        orderedAt: new Date(Date.now() - 10 * 86_400_000),
        receivedAt: null,
        supplier: { id: 602, name: '本地用品', category: '用品', status: 'active' },
        items: [{ quantity: 10, receivedQty: 0, subtotal: 1200 }],
      },
    ]);
    prisma.supplierSettlement.findMany.mockResolvedValue([
      {
        id: 801,
        supplierId: 602,
        netPayable: 1200,
        totalAmount: 1200,
        status: 'draft',
        supplier: { id: 602, name: '本地用品', category: '用品', status: 'active' },
      },
    ]);

    const result = await service.execute(
      'supply_chain.diagnose',
      { question: '哪个供应商供货慢', limit: 10, timeRange: 'last_30_days' },
      { runId: 316, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('供应链采购诊断');
    expect(result.summary).toContain('本地用品');
    expect((result.data as any).items[0]).toMatchObject({
      supplierName: '本地用品',
      pendingOrderCount: 1,
      overdueOrderCount: 1,
      unpaidSettlementCount: 1,
    });
    expect(result.evidence).toMatchObject({
      source: ['Supplier', 'SupplierOrder', 'SupplierOrderItem', 'SupplierSettlement'],
      sampleSize: 5,
    });
    expect(businessQueryService.ask).not.toHaveBeenCalled();
  });

  it('diagnoses marketing page conversion funnel as a dedicated read-only tool', async () => {
    prisma.marketingPage.findMany.mockResolvedValue([
      { id: 901, title: '补水活动页', status: 'published', sourceType: 'activity', sourceId: '12', publishedAt: new Date() },
    ]);
    prisma.marketingPageEvent.findMany.mockResolvedValue([
      { id: 1, pageId: 901, eventType: 'view', channel: 'wechat', customerId: 501, sessionId: 's1', occurredAt: new Date() },
      { id: 2, pageId: 901, eventType: 'click', channel: 'wechat', customerId: 501, sessionId: 's1', occurredAt: new Date() },
    ]);
    prisma.marketingPageLead.findMany.mockResolvedValue([
      { id: 11, pageId: 901, channel: 'wechat', status: 'converted', convertedAt: new Date(), createdAt: new Date() },
    ]);
    prisma.marketingPageAttribution.findMany.mockResolvedValue([
      { id: 21, pageId: 901, customerId: 501, orderId: 1001, attributedRevenue: 1680, convertedAt: new Date() },
    ]);

    const result = await service.execute(
      'marketing.conversion.diagnose',
      { question: '哪些活动效果好', limit: 10, timeRange: 'last_30_days' },
      { runId: 317, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('营销转化诊断');
    expect(result.summary).toContain('补水活动页');
    expect((result.data as any).items[0]).toMatchObject({
      pageTitle: '补水活动页',
      viewCount: 1,
      clickCount: 1,
      leadCount: 1,
      leadConvertedCount: 1,
      attributedOrderCount: 1,
      conversionCount: 1,
      attributedRevenue: 1680,
    });
    expect(result.evidence?.source).toEqual(['MarketingPage', 'MarketingPageEvent', 'MarketingPageLead', 'MarketingPageAttribution']);
    expect(businessQueryService.ask).not.toHaveBeenCalled();
  });

  it('diagnoses automation execution touches and attribution as a dedicated read-only tool', async () => {
    prisma.marketingAutomationExecution.findMany.mockResolvedValue([
      {
        id: 1001,
        strategyId: 77,
        strategyName: '沉睡客户唤醒',
        status: 'success',
        triggeredCount: 20,
        reachedCount: 16,
        executedAt: new Date(),
        strategy: { id: 77, name: '沉睡客户唤醒', status: 'active', source: 'system' },
        touches: [
          { id: 1, customerId: 501, channel: 'wechat', status: 'converted', convertedAt: new Date(), actualRevenue: 980 },
          { id: 2, customerId: 502, channel: 'wechat', status: 'reached', convertedAt: null, actualRevenue: 0 },
        ],
        attributions: [{ id: 11, customerId: 501, orderId: 2001, attributedRevenue: 980 }],
      },
    ]);

    const result = await service.execute(
      'automation.execution.diagnose',
      { question: '自动化触达效果怎么样', limit: 10, timeRange: 'last_30_days' },
      { runId: 318, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('自动化执行复盘');
    expect((result.data as any).items[0]).toMatchObject({
      strategyName: '沉睡客户唤醒',
      executionCount: 1,
      triggeredCount: 20,
      reachedCount: 16,
      convertedCount: 1,
      attributedRevenue: 980,
    });
    expect(result.evidence?.source).toEqual(['MarketingAutomationExecution', 'MarketingAutomationTouch', 'MarketingAttribution']);
    expect(businessQueryService.ask).not.toHaveBeenCalled();
  });

  it('compares only authorized stores as a dedicated read-only tool', async () => {
    prisma.userStore.findMany.mockResolvedValue([
      { storeId: 1, store: { id: 1, name: 'Ami 一店', city: '上海', status: 'active', deletedAt: null } },
      { storeId: 2, store: { id: 2, name: 'Ami 二店', city: '杭州', status: 'active', deletedAt: null } },
    ]);
    prisma.productOrder.findMany.mockResolvedValue([
      { id: 1, storeId: 1, totalAmount: 5000, customerId: 501 },
      { id: 2, storeId: 2, totalAmount: 2000, customerId: 601 },
    ]);
    prisma.reservation.findMany.mockResolvedValue([
      { id: 1, storeId: 1, status: 'completed' },
      { id: 2, storeId: 2, status: 'pending' },
    ]);
    prisma.customer.findMany.mockResolvedValue([
      { id: 501, storeId: 1 },
      { id: 601, storeId: 2 },
      { id: 602, storeId: 2 },
    ]);
    prisma.product.findMany.mockResolvedValue([
      { id: 301, storeId: 1, currentStock: 5, safetyStock: 10 },
      { id: 401, storeId: 2, currentStock: 20, safetyStock: 10 },
    ]);

    const result = await service.execute(
      'store.comparison.diagnose',
      { question: '多个门店哪个表现好', limit: 10, timeRange: 'last_30_days' },
      { runId: 319, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('多门店对比诊断');
    expect((result.data as any).authorizedStoreCount).toBe(2);
    expect((result.data as any).items[0]).toMatchObject({
      storeName: 'Ami 一店',
      salesAmount: 5000,
      orderCount: 1,
      lowStockCount: 1,
    });
    expect(result.evidence?.source).toEqual(['UserStore', 'Store', 'ProductOrder', 'Reservation', 'Customer', 'Product']);
    expect(businessQueryService.ask).not.toHaveBeenCalled();
  });

  it('does not query cross-store business tables when only one store is authorized', async () => {
    prisma.userStore.findMany.mockResolvedValue([
      { storeId: 1, store: { id: 1, name: 'Ami 一店', city: '上海', status: 'active', deletedAt: null } },
    ]);

    const result = await service.execute(
      'store.comparison.diagnose',
      { question: '多个门店哪个表现好', limit: 10, timeRange: 'last_30_days' },
      { runId: 320, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('no_data');
    expect(result.summary).toContain('当前账号未授权多个门店');
    expect((result.data as any)).toMatchObject({
      items: [],
      authorizedStoreCount: 1,
      requestedLimit: 10,
    });
    expect(result.evidence?.limitations).toContain('当前账号未授权多个门店，因此不执行跨门店经营数据查询。');
    expect(prisma.productOrder.findMany).not.toHaveBeenCalled();
    expect(prisma.reservation.findMany).not.toHaveBeenCalled();
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(businessQueryService.ask).not.toHaveBeenCalled();
  });

  it('classifies terminal high-frequency failures and surfaces capability candidate inputs', async () => {
    prisma.terminalDevice.findMany.mockResolvedValue([
      {
        id: 1,
        deviceCode: 'T001',
        name: '前台终端',
        status: 'offline',
        networkStatus: 'error',
        printerStatus: 'ok',
        scannerStatus: 'offline',
        cameraStatus: 'ok',
        batteryLevel: 12,
        lastOnlineAt: new Date(),
      },
    ]);
    prisma.terminalConversation.findMany.mockResolvedValue([
      {
        id: 1,
        deviceId: 'T001',
        role: 'manager',
        messageCount: 3,
        updatedAt: new Date(),
        messages: [
          { role: 'user', content: 'marketing:activity:12' },
          { role: 'assistant', content: '缺少设备认证令牌，会话初始化失败。' },
          { role: 'assistant', content: '暂时无法回复，需要补充条件。' },
        ],
      },
      {
        id: 2,
        deviceId: 'T001',
        role: 'manager',
        messageCount: 1,
        updatedAt: new Date(),
        messages: [{ role: 'assistant', content: '排班切换状态失败，无法从忙碌改为正常。' }],
      },
    ]);

    const result = await service.execute(
      'terminal.health.diagnose',
      { question: '终端最近失败最多的问题', limit: 10, timeRange: 'last_30_days' },
      { runId: 322, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('终端设备与对话诊断');
    expect(result.summary).toContain('失败信号');
    expect((result.data as any).kpis).toMatchObject({
      deviceCount: 1,
      abnormalDeviceCount: 1,
      conversationCount: 2,
      messageCount: 4,
    });
    expect((result.data as any).failureCategories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          failureCategoryLabel: '设备认证或会话初始化异常',
          candidateCapabilityName: '设备认证令牌修复',
          sampleMessage: expect.stringContaining('缺少设备认证令牌'),
        }),
        expect.objectContaining({
          failureCategoryLabel: '智能问答未命中经营能力',
          candidateCapabilityName: '智能问答能力候选',
        }),
        expect.objectContaining({
          failureCategoryLabel: '排班或预约交互失败',
          candidateCapabilityName: '排班交互失败排查',
        }),
      ]),
    );
    expect((result.data as any).capabilityCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: 'terminal',
          metric: 'terminal_failure_rate',
          sourceFailureCategory: '设备认证或会话初始化异常',
        }),
      ]),
    );
    expect(result.evidence?.limitations).toContain('该查询只读，不自动修改设备状态。');
    expect(result.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'terminal:conversations:open', riskLevel: 'low' })]),
    );
    expect(businessQueryService.ask).not.toHaveBeenCalled();
  });

  it('analyzes customer app funnel from identity events leads reservations orders and attribution', async () => {
    prisma.customerAppIdentity.findMany.mockResolvedValue([
      { id: 1, customerId: 501, bindStatus: 'bound', source: 'ami_glow', phone: '13800000000', lastLoginAt: new Date(), createdAt: new Date() },
    ]);
    prisma.customerAppEvent.findMany.mockResolvedValue([
      {
        id: 1,
        customerId: 501,
        identityId: 1,
        openid: 'openid-1',
        sessionId: 's1',
        eventType: 'project_view',
        channel: 'miniapp',
        targetType: 'project',
        targetId: '7',
        source: 'ami_glow',
        occurredAt: new Date(),
      },
      {
        id: 2,
        customerId: 501,
        identityId: 1,
        openid: 'openid-1',
        sessionId: 's1',
        eventType: 'promotion_claimed',
        channel: 'miniapp',
        targetType: 'promotion',
        targetId: '31',
        source: 'ami_glow',
        occurredAt: new Date(),
      },
      {
        id: 3,
        customerId: 501,
        identityId: 1,
        openid: 'openid-1',
        sessionId: 's1',
        eventType: 'miniapp_reservation_success',
        channel: 'miniapp',
        targetType: 'project',
        targetId: '7',
        source: 'ami_glow',
        occurredAt: new Date(),
      },
      {
        id: 4,
        customerId: 501,
        identityId: 1,
        openid: 'openid-1',
        sessionId: 's1',
        eventType: 'promotion_reserved',
        channel: 'miniapp',
        targetType: 'promotion',
        targetId: '31',
        source: 'ami_glow',
        occurredAt: new Date(),
      },
    ]);
    prisma.marketingPageLead.findMany.mockResolvedValue([
      { id: 11, customerId: 501, channel: 'miniapp', status: 'converted', convertedAt: new Date(), createdAt: new Date() },
    ]);
    prisma.marketingPageAttribution.findMany.mockResolvedValue([
      {
        id: 21,
        pageId: 901,
        customerId: 501,
        orderId: 9001,
        attributedRevenue: 1680,
        convertedAt: new Date(),
        lead: { id: 11, channel: 'miniapp', status: 'converted' },
        page: { id: 901, title: '补水活动页', sourceType: 'activity' },
      },
    ]);
    prisma.reservation.findMany.mockResolvedValue([
      { id: 88, customerId: 501, status: 'checked_in', createdAt: new Date(), checkedInAt: new Date() },
    ]);
    prisma.productOrder.findMany.mockResolvedValue([
      { id: 9001, customerId: 501, totalAmount: 1980, source: null, createdAt: new Date() },
    ]);

    const result = await service.execute(
      'customer_app.funnel.analyze',
      { question: '小程序最近带来多少客户和成交', limit: 10, timeRange: 'last_30_days' },
      { runId: 323, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('客户小程序渠道漏斗');
    expect(result.summary).toContain('预约事件 1 次');
    expect(result.summary).toContain('小程序客户同期成交 1 笔');
    expect((result.data as any).kpis).toMatchObject({
      identityCount: 1,
      boundCount: 1,
      uniqueVisitorCount: 1,
      activeCustomerCount: 1,
      appEventCount: 4,
      promotionClaimedCount: 1,
      promotionReservedCount: 1,
      reservationEventCount: 1,
      reservationCount: 1,
      leadCount: 1,
      leadConvertedCount: 1,
      attributedOrderCount: 1,
      attributedRevenue: 1680,
      appCustomerOrderCount: 1,
      appCustomerRevenue: 1980,
    });
    expect((result.data as any).items[0]).toMatchObject({
      channel: 'miniapp',
      eventCount: 4,
      uniqueVisitorCount: 1,
      promotionClaimCount: 1,
      promotionReservedCount: 1,
      reservationEventCount: 1,
      reservationCount: 1,
      checkedInReservationCount: 1,
      leadCount: 1,
      leadConvertedCount: 1,
      attributedOrderCount: 1,
      attributedRevenue: 1680,
      appCustomerOrderCount: 1,
      appCustomerRevenue: 1980,
      conversionCount: 1,
    });
    expect(result.evidence?.source).toEqual([
      'CustomerAppIdentity',
      'CustomerAppEvent',
      'MarketingPageLead',
      'MarketingPageAttribution',
      'Reservation',
      'ProductOrder',
    ]);
    expect(result.evidence?.sampleSize).toBe(9);
    expect(businessQueryService.ask).not.toHaveBeenCalled();
  });

  it('diagnoses revenue changes with current and previous period evidence', async () => {
    prisma.productOrder.findMany
      .mockResolvedValueOnce([
        {
          id: 101,
          orderNo: 'O101',
          totalAmount: 5000,
          payMethod: '微信',
          status: 'completed',
          createdAt: new Date(),
          orderItems: [
            { itemType: 'product', itemId: 301, name: '补水精华', quantity: 2, subtotal: 3200 },
            { itemType: 'project', itemId: 401, name: '深层补水护理', quantity: 3, subtotal: 1800 },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 91,
          orderNo: 'O091',
          totalAmount: 8000,
          payMethod: '现金',
          status: 'completed',
          createdAt: new Date(Date.now() - 86_400_000),
          orderItems: [
            { itemType: 'product', itemId: 301, name: '补水精华', quantity: 4, subtotal: 6400 },
            { itemType: 'project', itemId: 402, name: '美白护理', quantity: 2, subtotal: 1600 },
          ],
        },
      ]);

    const result = await service.execute(
      'revenue.diagnose',
      { question: '为什么今天收入下降', timeRange: 'today' },
      { runId: 302, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('收入诊断');
    expect(result.summary).toContain('下降');
    expect(result.summary).toContain('补水精华');
    expect((result.data as any).current).toMatchObject({ revenue: 5000, orderCount: 1 });
    expect((result.data as any).previous).toMatchObject({ revenue: 8000, orderCount: 1 });
    expect((result.data as any).delta).toMatchObject({ revenue: -3000, orderCount: 0 });
    expect((result.data as any).itemDrivers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: '补水精华', currentAmount: 3200, previousAmount: 6400, delta: -3200 }),
        expect.objectContaining({ name: '美白护理', currentAmount: 0, previousAmount: 1600, delta: -1600 }),
      ]),
    );
    expect(result.evidence).toMatchObject({
      source: ['ProductOrder', 'OrderItem'],
      sampleSize: 2,
    });
  });

  it('ranks product sales growth with evidence and requested limit', async () => {
    prisma.orderItem.findMany.mockResolvedValue([
      {
        orderId: 101,
        itemType: 'product',
        itemId: 301,
        name: '补水精华',
        quantity: 8,
        subtotal: 5440,
        order: { id: 101, customerId: 501, createdAt: new Date(), status: 'completed' },
      },
      {
        orderId: 91,
        itemType: 'product',
        itemId: 301,
        name: '补水精华',
        quantity: 2,
        subtotal: 1360,
        order: { id: 91, customerId: 502, createdAt: new Date(Date.now() - 40 * 86_400_000), status: 'completed' },
      },
      {
        orderId: 102,
        itemType: 'product',
        itemId: 302,
        name: '修护面膜',
        quantity: 4,
        subtotal: 1200,
        order: { id: 102, customerId: 503, createdAt: new Date(), status: 'completed' },
      },
    ]);
    prisma.product.findMany.mockResolvedValue([
      { id: 301, name: '补水精华', sku: 'P301', currentStock: 40, safetyStock: 10, unit: '瓶' },
      { id: 302, name: '修护面膜', sku: 'P302', currentStock: 30, safetyStock: 8, unit: '片' },
    ]);

    const result = await service.execute(
      'product.sales.rank',
      { question: '近30天销量增长最快的10个商品', limit: 10, timeRange: 'last_30_days' },
      { runId: 303, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('商品销量排行');
    expect(result.summary).toContain('补水精华');
    expect((result.data as any).requestedLimit).toBe(10);
    expect((result.data as any).items[0]).toMatchObject({
      productId: 301,
      productName: '补水精华',
      quantity: 8,
      previousQuantity: 2,
      growthQuantity: 6,
      salesAmount: 5440,
      orderCount: 1,
      customerCount: 1,
    });
    expect(result.evidence).toMatchObject({
      source: ['ProductOrder', 'OrderItem', 'Product'],
      sampleSize: 3,
    });
    expect(result.actions?.[1]).toMatchObject({ action: 'agent:tool:marketing.opportunity.discover', riskLevel: 'low' });
  });

  it('returns no_data for product sales ranking when order evidence is missing', async () => {
    prisma.orderItem.findMany.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([]);

    const result = await service.execute(
      'product.sales.rank',
      { question: '近期销量增长的商品', limit: 10 },
      { runId: 304, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('no_data');
    expect(result.summary).toContain('没有足够商品订单明细');
    expect((result.data as any).items).toEqual([]);
    expect(result.evidence?.sampleSize).toBe(0);
  });

  it('ranks inventory risk from stock, sales and expiring batches without creating purchase orders', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 301, name: '补水精华', sku: 'P301', currentStock: 2, safetyStock: 10, unit: '瓶', status: 'active' },
      { id: 302, name: '修护面膜', sku: 'P302', currentStock: 20, safetyStock: 8, unit: '片', status: 'active' },
    ]);
    prisma.orderItem.findMany.mockResolvedValue([
      {
        orderId: 101,
        itemType: 'product',
        itemId: 301,
        quantity: 15,
        subtotal: 7500,
        order: { id: 101, createdAt: new Date(), status: 'completed' },
      },
      {
        orderId: 102,
        itemType: 'product',
        itemId: 302,
        quantity: 3,
        subtotal: 900,
        order: { id: 102, createdAt: new Date(), status: 'completed' },
      },
    ]);
    prisma.stockBatch.findMany.mockResolvedValue([
      { productId: 302, stock: 5, expiryDate: new Date(Date.now() + 20 * 86_400_000) },
    ]);

    const result = await service.execute(
      'inventory.risk.rank',
      { question: '哪些商品库存不足', limit: 10, timeRange: 'last_30_days' },
      { runId: 305, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('库存风险排行');
    expect(result.summary).toContain('补水精华');
    expect((result.data as any).items[0]).toMatchObject({
      productId: 301,
      productName: '补水精华',
      currentStock: 2,
      safetyStock: 10,
      stockGap: 8,
      suggestedReplenishment: 8,
      riskLevel: 'high',
    });
    expect((result.data as any).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: 302, expiringStock: 5, daysToExpiry: expect.any(Number) }),
      ]),
    );
    expect(result.evidence).toMatchObject({
      source: ['Product', 'StockBatch', 'ProductOrder', 'OrderItem'],
    });
    expect(result.actions?.[0]).toMatchObject({ action: 'agent:tool:inventory.replenishment.draft', riskLevel: 'medium' });
    expect(inventoryService.createPurchaseOrder).not.toHaveBeenCalled();
  });

  it('returns no_data for inventory risk when stock and expiry signals are healthy', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 301, name: '补水精华', sku: 'P301', currentStock: 50, safetyStock: 10, unit: '瓶', status: 'active' },
    ]);
    prisma.orderItem.findMany.mockResolvedValue([]);
    prisma.stockBatch.findMany.mockResolvedValue([]);

    const result = await service.execute(
      'inventory.risk.rank',
      { question: '哪些商品库存不足', limit: 10 },
      { runId: 306, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('no_data');
    expect(result.summary).toContain('当前没有低库存');
    expect((result.data as any).items).toEqual([]);
    expect(result.evidence?.sampleSize).toBe(1);
  });

  it('diagnoses project service growth and material margin with evidence', async () => {
    prisma.orderItem.findMany.mockResolvedValue([
      {
        orderId: 101,
        itemType: 'project',
        itemId: 401,
        name: '深层补水护理',
        quantity: 6,
        subtotal: 2880,
        order: { id: 101, customerId: 501, createdAt: new Date(), status: 'completed' },
      },
      {
        orderId: 91,
        itemType: 'project',
        itemId: 401,
        name: '深层补水护理',
        quantity: 2,
        subtotal: 960,
        order: { id: 91, customerId: 502, createdAt: new Date(Date.now() - 40 * 86_400_000), status: 'completed' },
      },
      {
        orderId: 102,
        itemType: 'project',
        itemId: 402,
        name: '敏感修护护理',
        quantity: 3,
        subtotal: 900,
        order: { id: 102, customerId: 503, createdAt: new Date(), status: 'completed' },
      },
    ]);
    prisma.project.findMany.mockResolvedValue([
      {
        id: 401,
        name: '深层补水护理',
        price: 480,
        duration: 60,
        status: 'active',
        bomItems: [{ standardQty: 2, unit: '片', product: { id: 601, name: '补水面膜', costPrice: 80, unit: '片' } }],
      },
      {
        id: 402,
        name: '敏感修护护理',
        price: 300,
        duration: 60,
        status: 'active',
        bomItems: [{ standardQty: 2, unit: '片', product: { id: 602, name: '修护面膜', costPrice: 95, unit: '片' } }],
      },
    ]);

    const result = await service.execute(
      'project.diagnose',
      { question: '项目耗材毛利怎么样', limit: 10, timeRange: 'last_30_days' },
      { runId: 309, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('项目经营诊断');
    expect(result.summary).toContain('耗材毛利率最低');
    expect(result.summary).toContain('敏感修护护理');
    expect((result.data as any).items[0]).toMatchObject({
      projectId: 402,
      projectName: '敏感修护护理',
      serviceCount: 3,
      materialCost: 190,
      grossMargin: 110,
    });
    expect((result.data as any).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectId: 401,
          projectName: '深层补水护理',
          serviceCount: 6,
          previousServiceCount: 2,
          growthCount: 4,
          materialCost: 160,
          grossMargin: 320,
        }),
      ]),
    );
    expect((result.data as any).lowMarginItems[0]).toMatchObject({
      projectName: '敏感修护护理',
      materialCost: 190,
    });
    expect(result.evidence).toMatchObject({
      source: ['ProductOrder', 'OrderItem', 'Project', 'ProjectBomItem', 'Product'],
      sampleSize: 5,
    });
    expect(result.actions?.[1]).toMatchObject({ action: 'agent:tool:marketing.opportunity.discover', riskLevel: 'low' });
  });

  it('includes active BOM projects for margin-only project diagnosis even without recent orders', async () => {
    prisma.orderItem.findMany.mockResolvedValue([]);
    prisma.project.findMany.mockResolvedValue([
      {
        id: 403,
        name: '基础清洁护理',
        price: 260,
        duration: 45,
        status: 'active',
        bomItems: [{ standardQty: 3, unit: '片', product: { id: 603, name: '清洁棉片', costPrice: 40, unit: '片' } }],
      },
    ]);

    const result = await service.execute(
      'project.diagnose',
      { question: '项目耗材毛利怎么样', limit: 10 },
      { runId: 310, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.summary).toContain('基础清洁护理');
    expect((result.data as any).items[0]).toMatchObject({
      projectId: 403,
      projectName: '基础清洁护理',
      serviceCount: 0,
      materialCost: 120,
      grossMargin: 140,
    });
    expect(result.evidence?.sampleSize).toBe(1);
  });

  it('returns no_data for project diagnosis when project order evidence is missing', async () => {
    prisma.orderItem.findMany.mockResolvedValue([]);
    prisma.project.findMany.mockResolvedValue([]);

    const result = await service.execute(
      'project.diagnose',
      { question: '最近做得最多的项目', limit: 10 },
      { runId: 311, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('no_data');
    expect(result.summary).toContain('没有足够项目订单明细');
    expect((result.data as any).items).toEqual([]);
    expect(result.evidence?.sampleSize).toBe(0);
  });

  it('diagnoses card expiry usage and member balance with evidence', async () => {
    prisma.customerCard.findMany.mockResolvedValue([
      {
        id: 701,
        customerId: 501,
        cardName: '补水护理 10 次卡',
        totalTimes: 10,
        remainingTimes: 1,
        expiryDate: new Date(Date.now() + 5 * 86_400_000),
        status: 'active',
        customer: { id: 501, name: '李女士', phone: '13800000000', memberLevel: '金卡' },
      },
      {
        id: 702,
        customerId: 502,
        cardName: '敏感修护 8 次卡',
        totalTimes: 8,
        remainingTimes: 4,
        expiryDate: new Date(Date.now() + 60 * 86_400_000),
        status: 'active',
        customer: { id: 502, name: '王女士', phone: '13900000000', memberLevel: '银卡' },
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([
      { id: 801, customerId: 501, cardName: '补水护理 10 次卡', projectName: '深层补水护理', times: 2, remainingTimes: 1, beauticianId: 11, verifiedAt: new Date() },
      { id: 802, customerId: 502, cardName: '补水护理 10 次卡', projectName: '深层补水护理', times: 1, remainingTimes: 4, beauticianId: 12, verifiedAt: new Date() },
    ]);
    prisma.customerBalanceAccount.findMany.mockResolvedValue([
      {
        id: 901,
        customerId: 501,
        cashBalance: 1200,
        giftBalance: 200,
        updatedAt: new Date(),
        customer: { id: 501, name: '李女士', phone: '13800000000', memberLevel: '金卡' },
      },
      {
        id: 902,
        customerId: 502,
        cashBalance: 300,
        giftBalance: 0,
        updatedAt: new Date(),
        customer: { id: 502, name: '王女士', phone: '13900000000', memberLevel: '银卡' },
      },
    ]);
    prisma.customerBalanceTransaction.findMany.mockResolvedValue([
      { id: 1001, customerId: 501, type: 'recharge', amount: 1000, giftAmount: 200, cashBalanceAfter: 1200, giftBalanceAfter: 200, paymentMethod: 'wechat', createdAt: new Date() },
      { id: 1002, customerId: 501, type: 'consume', amount: 180, giftAmount: 20, cashBalanceAfter: 1020, giftBalanceAfter: 180, paymentMethod: 'member_balance', createdAt: new Date() },
    ]);

    const result = await service.execute(
      'card.diagnose',
      { question: '会员卡余额和次卡到期风险怎么样', limit: 10, timeRange: 'last_30_days' },
      { runId: 312, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('卡项/会员卡经营诊断');
    expect(result.summary).toContain('补水护理 10 次卡');
    expect((result.data as any).expiryItems[0]).toMatchObject({
      customerCardId: 701,
      customerName: '李女士',
      remainingTimes: 1,
      riskLevel: 'high',
    });
    expect((result.data as any).usageItems[0]).toMatchObject({
      cardName: '补水护理 10 次卡',
      projectName: '深层补水护理',
      usageTimes: 3,
      customerCount: 2,
    });
    expect((result.data as any).balanceItems[0]).toMatchObject({
      customerName: '李女士',
      totalBalance: 1400,
    });
    expect((result.data as any).transactionSummary).toMatchObject({
      rechargeAmount: 1000,
      consumeAmount: 180,
      totalBalance: 1700,
    });
    expect(result.evidence).toMatchObject({
      source: ['CustomerCard', 'CardUsageRecord', 'CustomerBalanceAccount', 'CustomerBalanceTransaction', 'Customer'],
      sampleSize: 8,
    });
    expect(result.actions?.[0]).toMatchObject({ action: 'orders:card-usage:open', riskLevel: 'low' });
  });

  it('returns no_data for card diagnosis when card evidence is missing', async () => {
    prisma.customerCard.findMany.mockResolvedValue([]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.customerBalanceAccount.findMany.mockResolvedValue([]);
    prisma.customerBalanceTransaction.findMany.mockResolvedValue([]);

    const result = await service.execute(
      'card.diagnose',
      { question: '会员卡余额怎么样', limit: 10 },
      { runId: 313, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('no_data');
    expect(result.summary).toContain('没有匹配到足够');
    expect((result.data as any).balanceItems).toEqual([]);
    expect(result.evidence?.sampleSize).toBe(0);
  });

  it('diagnoses finance margin with material and commission costs', async () => {
    prisma.productOrder.findMany
      .mockResolvedValueOnce([
        {
          id: 1101,
          customerId: 501,
          totalAmount: 2000,
          status: 'completed',
          createdAt: new Date(),
          paymentRecords: [{ amount: 2000, method: 'wechat', status: 'paid' }],
          refundRecords: [{ amount: 100, status: 'refunded' }],
          orderItems: [
            { id: 2101, itemType: 'product', itemId: 301, name: '补水精华', quantity: 2, subtotal: 800 },
            { id: 2102, itemType: 'project', itemId: 401, name: '深层补水护理', quantity: 2, subtotal: 1200 },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 1091,
          customerId: 502,
          totalAmount: 1000,
          status: 'completed',
          createdAt: new Date(Date.now() - 40 * 86_400_000),
          paymentRecords: [{ amount: 1000, method: 'wechat', status: 'paid' }],
          refundRecords: [],
          orderItems: [{ id: 2091, itemType: 'project', itemId: 401, name: '深层补水护理', quantity: 1, subtotal: 1000 }],
        },
      ]);
    prisma.product.findMany.mockResolvedValue([{ id: 301, name: '补水精华', unit: '瓶', costPrice: 260 }]);
    prisma.project.findMany.mockResolvedValue([
      {
        id: 401,
        name: '深层补水护理',
        bomItems: [{ standardQty: 2, product: { costPrice: 80 } }],
      },
    ]);
    prisma.commissionRecord.findMany.mockResolvedValue([{ id: 1, type: 'project', amount: 120, sourceAmount: 1200, status: 'pending' }]);
    prisma.dailySettlement.findMany.mockResolvedValue([
      {
        id: 1,
        settleDate: new Date(),
        totalRevenue: 1900,
        materialCost: 840,
        commissionTotal: 120,
        grossProfit: 940,
        grossMargin: 49.47,
        status: 'draft',
      },
    ]);

    const result = await service.execute(
      'finance.margin.diagnose',
      { question: '近30天毛利怎么样', limit: 10, timeRange: 'last_30_days' },
      { runId: 314, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('财务毛利诊断');
    expect(result.summary).toContain('毛利');
    expect((result.data as any).current).toMatchObject({
      orderCount: 1,
      totalRevenue: 2000,
      refundAmount: 100,
      netRevenue: 1900,
      materialCost: 840,
      commissionTotal: 120,
      grossProfit: 940,
    });
    expect((result.data as any).current.grossMarginRate).toBeCloseTo(940 / 1900, 4);
    expect((result.data as any).lowMarginItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemName: '补水精华',
          materialCost: 520,
          grossProfit: 280,
        }),
      ]),
    );
    expect((result.data as any).dailySettlementEvidence[0]).toMatchObject({
      totalRevenue: 1900,
      materialCost: 840,
      commissionTotal: 120,
    });
    expect(result.evidence).toMatchObject({
      source: ['ProductOrder', 'OrderItem', 'Product', 'ProjectBomItem', 'CommissionRecord', 'DailySettlement'],
      sampleSize: 5,
    });
    expect(result.actions?.[1]).toMatchObject({ action: 'finance:daily-settlement:open', riskLevel: 'low' });
  });

  it('returns no_data for finance margin when there are no valid orders', async () => {
    prisma.productOrder.findMany.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([]);
    prisma.project.findMany.mockResolvedValue([]);
    prisma.commissionRecord.findMany.mockResolvedValue([]);
    prisma.dailySettlement.findMany.mockResolvedValue([]);

    const result = await service.execute(
      'finance.margin.diagnose',
      { question: '近30天毛利怎么样', limit: 10 },
      { runId: 315, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('no_data');
    expect(result.summary).toContain('没有有效订单');
    expect((result.data as any).current.orderCount).toBe(0);
    expect(result.evidence?.sampleSize).toBe(0);
  });

  it('discovers product marketing opportunities with evidence', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 301,
        name: '补水精华',
        sku: 'P301',
        currentStock: 40,
        safetyStock: 10,
        retailPrice: 680,
        costPrice: 260,
        unit: '瓶',
        status: 'active',
      },
    ]);
    prisma.orderItem.findMany.mockResolvedValue([
      {
        orderId: 1,
        itemId: 301,
        quantity: 8,
        subtotal: 5440,
        order: { id: 1, customerId: 101, createdAt: new Date(), status: 'completed' },
      },
    ]);
    prisma.stockBatch.findMany.mockResolvedValue([
      {
        productId: 301,
        stock: 6,
        expiryDate: new Date(Date.now() + 45 * 86_400_000),
      },
    ]);

    const result = await service.execute(
      'marketing.opportunity.discover',
      { targetType: 'product' },
      { runId: 1, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('商品活动机会');
    expect((result.data as any).items[0]).toMatchObject({
      productId: 301,
      productName: '补水精华',
      suggestedChannels: ['miniapp', 'wechat', 'store'],
    });
    expect(result.evidence?.source).toEqual(['Product', 'StockBatch', 'ProductOrder', 'OrderItem']);
    expect(result.actions?.[0]).toMatchObject({ action: 'agent:tool:marketing.activity.draft', riskLevel: 'medium' });
  });

  it('creates a draft marketing activity after approval executes the draft tool', async () => {
    marketingService.createActivity.mockResolvedValue({
      id: 901,
      title: '补水精华会员专属满赠',
      status: 'draft',
    });

    const result = await service.execute(
      'marketing.activity.draft',
      {
        question: '帮我生成活动草稿',
        context: {
          previousRun: {
            toolResults: [
              {
                data: {
                  items: [
                    {
                      productId: 301,
                      productName: '补水精华',
                      fitScore: 86,
                      suggestedCampaign: '会员专属满赠',
                      reason: '库存高于安全库存，近 30 天销量稳定。',
                    },
                  ],
                },
              },
            ],
          },
        },
      },
      { runId: 101, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.data).toMatchObject({ activityId: 901, status: 'draft' });
    expect(result.actions?.[0]).toMatchObject({ action: 'marketing:activity:901', riskLevel: 'low' });
    expect(marketingService.createActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '补水精华会员专属满赠',
        status: 'draft',
        sourceRecommendationId: 'agent_run_101',
        recommendedItemsJson: [expect.objectContaining({ productId: 301, productName: '补水精华' })],
      }),
    );
  });

  it('creates customer follow-up tasks after approval executes the follow-up draft tool', async () => {
    prisma.predictionRun.findFirst.mockResolvedValue({ id: 11, storeId: 1, status: 'completed' });
    prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
      {
        id: 701,
        customerId: 501,
        churnScore: 82,
        churnLevel: '极高',
        repurchase30dScore: 20,
        marketingResponseScore: 76,
        customer: {
          id: 501,
          name: '李女士',
          phone: '13800000000',
          memberLevel: '金卡',
          visitCount: 8,
          totalSpent: 12000,
          lastVisitDate: new Date(Date.now() - 55 * 86_400_000),
          tags: ['VIP'],
        },
      },
    ]);
    terminalService.batchCreateFollowUpTasks.mockResolvedValue({
      items: [{ id: 1001, customerId: 501, status: 'pending' }],
      total: 1,
      createdCount: 1,
      duplicatedCount: 0,
      failedCount: 0,
      failures: [],
    });

    const result = await service.execute(
      'customer.followup.task.draft',
      { question: '生成流失客户跟进任务', target: 'churn', limit: 5 },
      { runId: 201, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('客户跟进任务草稿');
    expect(result.summary).toContain('已创建 1 条客户跟进任务');
    expect(terminalService.batchCreateFollowUpTasks).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        customerId: 501,
        customerIds: [501],
        source: 'agent',
        triggerType: 'agent_customer_followup',
        assigneeRole: 'consultant',
      }),
      7,
    );
  });

  it('creates a draft purchase order after approval executes the replenishment draft tool', async () => {
    inventoryService.getReplenishment.mockResolvedValue([
      {
        id: 301,
        productName: '补水精华',
        sku: 'P301',
        currentStock: 2,
        safetyStock: 10,
        suggestedQty: 18,
        supplyPrice: 120,
        estimatedAmount: 2160,
        supplier: '默认供应商',
      },
    ]);
    inventoryService.createPurchaseOrder.mockResolvedValue({
      id: 801,
      orderNo: 'PUR001',
      status: '草稿',
      totalAmount: 2160,
    });

    const result = await service.execute(
      'inventory.replenishment.draft',
      { question: '生成补货采购草稿', limit: 5 },
      { runId: 202, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('补货采购草稿');
    expect(result.data).toMatchObject({ purchaseOrderId: 801, orderNo: 'PUR001', status: '草稿' });
    expect(inventoryService.createPurchaseOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        supplier: '默认供应商',
        status: '草稿',
        source: 'agent',
        items: [expect.objectContaining({ productId: 301, quantity: 18, unitPrice: 120 })],
      }),
    );
  });

  it('generates service record draft suggestions without submitting official records', async () => {
    prisma.beautician.findFirst.mockResolvedValue({ id: 21 });
    prisma.serviceTask.findMany.mockResolvedValue([
      {
        id: 501,
        taskNo: 'T501',
        customerId: 301,
        projectId: 401,
        beauticianId: 21,
        appointmentTime: new Date(),
        status: 'in_progress',
        customer: { id: 301, name: '王女士', memberLevel: '金卡', phone: '13800000000', tags: ['敏感肌'] },
        beautician: { id: 21, name: '沈晴' },
        project: {
          id: 401,
          name: '敏感修护护理',
          duration: 60,
          bomItems: [
            { productId: 601, standardQty: 1, unit: '片', product: { id: 601, name: '修护面膜', sku: 'M601', unit: '片' } },
          ],
        },
      },
    ]);

    const result = await service.execute(
      'service.record.draft',
      { question: '帮我生成服务记录草稿', limit: 3 },
      { runId: 203, storeId: 1, userId: 7, role: 'beautician' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('服务记录草稿建议');
    expect((result.data as any).items[0]).toMatchObject({
      taskId: 501,
      customerName: '王女士',
      projectName: '敏感修护护理',
      consumptionItems: [expect.objectContaining({ productName: '修护面膜', actualQty: 1 })],
    });
    expect(result.summary).toContain('需美容师确认后再提交正式服务记录');
  });

  it('diagnoses reservation and schedule utilization without publishing schedules', async () => {
    prisma.schedule.findMany.mockResolvedValue([
      {
        id: 1,
        storeId: 1,
        beauticianId: 11,
        date: new Date(),
        startTime: '09:00',
        endTime: '10:00',
        status: 'busy',
        beautician: { id: 11, name: '沈晴', status: 'active' },
      },
      {
        id: 2,
        storeId: 1,
        beauticianId: 12,
        date: new Date(),
        startTime: '09:00',
        endTime: '10:00',
        status: 'available',
        beautician: { id: 12, name: '唐伊', status: 'active' },
      },
      {
        id: 3,
        storeId: 1,
        beauticianId: 12,
        date: new Date(),
        startTime: '10:00',
        endTime: '11:00',
        status: 'available',
        beautician: { id: 12, name: '唐伊', status: 'active' },
      },
    ]);
    prisma.reservation.findMany.mockResolvedValue([
      {
        id: 701,
        storeId: 1,
        beauticianId: 11,
        date: new Date(),
        startTime: '09:00',
        endTime: '10:00',
        status: 'pending',
        beautician: { id: 11, name: '沈晴', status: 'active' },
        project: { id: 401, name: '补水护理', duration: 60 },
        customer: { id: 501, name: '李女士' },
      },
      {
        id: 702,
        storeId: 1,
        beauticianId: 13,
        date: new Date(),
        startTime: '10:00',
        endTime: '11:00',
        status: 'pending',
        beautician: { id: 13, name: '顾然', status: 'active' },
        project: { id: 402, name: '修护护理', duration: 60 },
        customer: { id: 502, name: '王女士' },
      },
    ]);

    const result = await service.execute(
      'schedule.diagnose',
      { question: '今天哪些美容师空闲', timeRange: 'today', limit: 10 },
      { runId: 307, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('预约排班诊断');
    expect(result.summary).toContain('有效预约 2 条');
    expect((result.data as any).kpis).toMatchObject({
      reservationCount: 2,
      scheduleSlotCount: 3,
      occupiedSlotCount: 1,
      uncoveredReservationCount: 2,
    });
    expect((result.data as any).idleStaff[0]).toMatchObject({
      beauticianName: '唐伊',
      availableCount: 2,
    });
    expect(result.evidence).toMatchObject({
      source: ['Schedule', 'Reservation', 'Beautician'],
      sampleSize: 5,
    });
    expect(result.actions?.[1]).toMatchObject({ action: 'agent:tool:scheduling.optimization.preview', riskLevel: 'low' });
    expect(smartSchedulingService.preview).not.toHaveBeenCalled();
  });

  it('returns no_data for schedule diagnosis when reservation and schedule evidence is missing', async () => {
    prisma.schedule.findMany.mockResolvedValue([]);
    prisma.reservation.findMany.mockResolvedValue([]);

    const result = await service.execute(
      'schedule.diagnose',
      { question: '今天哪些时段最忙', timeRange: 'today' },
      { runId: 308, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('no_data');
    expect(result.summary).toContain('暂无预约和排班数据');
    expect((result.data as any).staffItems).toEqual([]);
    expect(result.evidence?.sampleSize).toBe(0);
  });

  it('previews smart scheduling optimization without publishing schedules', async () => {
    smartSchedulingService.preview.mockResolvedValue({
      runId: 'smart_1_20260615_001',
      weekStart: '2026-06-15',
      score: 88,
      summary: { hardConflictCount: 0, softConflictCount: 1 },
      schedules: [{ beauticianId: 1, date: '2026-06-15', startTime: '10:00', endTime: '11:00', status: 'available' }],
      warnings: [{ severity: 'soft', message: '高峰人手偏紧' }],
      conflicts: [],
      explanations: ['已覆盖预约高峰'],
    });

    const result = await service.execute(
      'scheduling.optimization.preview',
      { question: '优化下周排班', weekStart: '2026-06-15' },
      { runId: 204, storeId: 1, userId: 7, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('智能排班优化预览');
    expect(result.data).toMatchObject({ runId: 'smart_1_20260615_001', score: 88 });
    expect(result.actions?.[0]).toMatchObject({ action: 'scheduling:open', riskLevel: 'low' });
    expect(smartSchedulingService.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 1,
        weekStart: '2026-06-15',
        keepConfirmedReservations: true,
        allowOverrideBusy: false,
        allowOverrideLeave: false,
      }),
    );
  });
});
