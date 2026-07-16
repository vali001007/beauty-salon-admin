import { BusinessTaskPreParserService } from '../agent/business-task/business-task-preparser.service.js';
import { DimensionRegistryService } from '../semantic-data/dimension-registry.service.js';
import { createInMemoryBusinessMetricCatalog } from '../semantic-data/business-metric-catalog.testing.js';
import { LEGACY_SEMANTIC_METRICS } from '../semantic-data/legacy-semantic-metric.fixture.js';
import { QueryPlannerService } from './query-planner.service.js';
import { QuerySafetyGuardService } from './query-safety-guard.service.js';
import { QueryTemplateRegistryService } from './query-template-registry.service.js';

describe('QueryPlannerService', () => {
  const preParser = new BusinessTaskPreParserService();
  const metricRegistry = createInMemoryBusinessMetricCatalog(LEGACY_SEMANTIC_METRICS);
  const dimensionRegistry = new DimensionRegistryService();
  const safetyGuard = new QuerySafetyGuardService(metricRegistry, dimensionRegistry);
  const templateRegistry = new QueryTemplateRegistryService();
  const planner = new QueryPlannerService(metricRegistry, dimensionRegistry, safetyGuard, templateRegistry);

  const actor = (overrides: Record<string, unknown> = {}) => ({
    principalType: 'user' as const,
    userId: 9,
    storeId: 1,
    role: 'manager' as const,
    permissions: ['*'],
    ...overrides,
  });

  it('uses the server-owned actor and ignores client identity filters', () => {
    const { task } = preParser.parse({ message: '近期表现较好的员工', role: 'beautician' });
    task.filters = { operatorId: 999, beauticianId: 999 };

    const result = planner.plan({
      task,
      actor: actor({ role: 'beautician', beauticianId: 17 }),
      capabilityId: 'staff_performance_ranking',
    } as any);

    expect(result.rejectedReason).toBeUndefined();
    expect(result.plan).toMatchObject({
      actor: { userId: 9, storeId: 1, role: 'beautician', beauticianId: 17 },
      filters: { storeId: 1, scope: 'self', beauticianId: 17 },
      selfScope: { dimensionKey: 'beauticianId', value: 17 },
    });
    expect(result.plan?.filters).not.toEqual(expect.objectContaining({ operatorId: 999 }));
  });

  it('fails closed when the actor lacks a published metric permission', () => {
    const { task } = preParser.parse({ message: '今天实收多少', role: 'manager' });

    expect(() =>
      planner.plan({
        task,
        actor: actor({ permissions: ['core:inventory:view'] }),
        capabilityId: 'order_revenue_analysis',
      } as any),
    ).toThrow('business_metric_catalog_permission_denied:net_revenue:core:finance:view');
  });

  it('plans last 7 days cashier trend as date-based semantic query', () => {
    const { task } = preParser.parse({ message: '最近七天收银趋势', role: 'manager' });
    const result = planner.plan({ task, actor: actor(), capabilityId: 'revenue_diagnosis' });

    expect(result.rejectedReason).toBeUndefined();
    expect(result.plan).toMatchObject({
      capabilityId: 'revenue_diagnosis',
      role: 'manager',
      dimensions: ['date'],
      outputShape: 'trend',
      timeRange: { preset: 'last_7_days', label: '近7天' },
      storeScope: { storeIds: [1], scopeType: 'current_store' },
    });
    expect(result.plan?.metrics.map((item) => item.key)).toEqual(expect.arrayContaining(['paid_amount']));
    expect(Object.isFrozen(result.plan?.metrics[0].runtimeBinding)).toBe(true);
    expect(Object.isFrozen(result.plan?.metrics[0].runtimeBinding.runtimeQuery)).toBe(true);
    expect(result.plan?.metrics[0].runtimeBinding).toMatchObject({
      definitionKey: 'metric.paid_amount',
      permissions: expect.any(Array),
    });
  });

  it('plans revenue KPI questions as order revenue summary by payment method', () => {
    const { task } = preParser.parse({ message: '今天营收多少', role: 'manager' });
    const result = planner.plan({ task, actor: actor(), capabilityId: 'order_revenue_analysis' });

    expect(result.rejectedReason).toBeUndefined();
    expect(result.plan).toMatchObject({
      capabilityId: 'order_revenue_analysis',
      templateId: 'order_revenue',
      role: 'manager',
      dimensions: ['payMethod'],
      outputShape: 'summary',
      timeRange: { preset: 'today', label: '今天' },
      storeScope: { storeIds: [1], scopeType: 'current_store' },
    });
    expect(result.plan?.metrics.map((item) => item.key)).toEqual(expect.arrayContaining(['revenue']));
  });

  it('plans order customer consumption list through its P0 template', () => {
    const { task } = preParser.parse({ message: '昨天有哪些消费客户，列出清单', role: 'manager' });
    const result = planner.plan({ task, actor: actor(), capabilityId: 'order_customer_consumption_list' });

    expect(result.rejectedReason).toBeUndefined();
    expect(result.plan).toMatchObject({
      capabilityId: 'order_customer_consumption_list',
      templateId: 'order_customer_consumption_list',
      dimensions: ['customerId', 'customerName'],
      outputShape: 'table',
      timeRange: { preset: 'yesterday', label: '昨天' },
      storeScope: { storeIds: [1], scopeType: 'current_store' },
      filters: { storeId: 1 },
      orderBy: [{ key: 'paid_amount', direction: 'desc' }],
      limit: 20,
    });
    expect(result.plan?.metrics.map((item) => item.key)).toEqual(expect.arrayContaining(['paid_amount', 'order_count']));
  });

  it('plans product ranking with product dimensions and user limit', () => {
    const { task } = preParser.parse({ message: '最近销量好的5个商品有哪些', role: 'manager' });
    const result = planner.plan({ task, actor: actor() });

    expect(result.plan).toMatchObject({
      capabilityId: 'product_sales_ranking',
      limit: 5,
      dimensions: ['productId', 'productName'],
      outputShape: 'list',
    });
    expect(result.plan?.metrics.map((item) => item.key)).toEqual(expect.arrayContaining(['product_sales_growth']));
  });

  it('blocks sensitive finance metric for reception', () => {
    const { task } = preParser.parse({ message: '本月毛利怎么样', role: 'reception' });
    const result = planner.plan({ task, actor: actor({ role: 'reception' }) });

    expect(result.plan).toBeUndefined();
    expect(result.rejectedReason).toContain('前台');
  });

  it('fails closed when the published metric disallows the requested task type', () => {
    const restrictedCatalog = createInMemoryBusinessMetricCatalog(
      LEGACY_SEMANTIC_METRICS.map((metric) =>
        metric.key === 'paid_amount' ? { ...metric, allowedTaskTypes: ['ranking'] as const } : metric,
      ),
    );
    const restrictedPlanner = new QueryPlannerService(
      restrictedCatalog,
      dimensionRegistry,
      new QuerySafetyGuardService(restrictedCatalog, dimensionRegistry),
      templateRegistry,
    );
    const { task } = preParser.parse({ message: '今天实收多少', role: 'manager' });

    expect(() =>
      restrictedPlanner.plan({ task, actor: actor(), capabilityId: 'order_revenue_analysis' }),
    ).toThrow('business_metric_catalog_task_type_not_allowed:paid_amount:query');
  });

  it('blocks beautician broad staff query without self scope', () => {
    const { task } = preParser.parse({ message: '近期表现较好的员工', role: 'beautician' });
    const result = planner.plan({ task, actor: actor({ role: 'beautician' }) });

    expect(result.plan).toBeUndefined();
    expect(result.rejectedReason).toContain('美容师账号只能查询本人');
  });

  it('rejects query plans without a valid current store scope', () => {
    const { task } = preParser.parse({ message: '昨天有哪些消费客户，列出清单', role: 'manager' });
    const result = planner.plan({
      task,
      actor: actor({ storeId: 0 }),
      capabilityId: 'order_customer_consumption_list',
    });

    expect(result.plan).toBeUndefined();
    expect(result.rejectedReason).toContain('缺少门店范围');
  });

  it('uses P1 capability templates even when metrics are sparse', () => {
    const { task } = preParser.parse({ message: '本周预约排班有什么风险', role: 'manager' });
    const result = planner.plan({ task, actor: actor(), capabilityId: 'reservation_schedule_diagnosis' });

    expect(result.rejectedReason).toBeUndefined();
    expect(result.plan).toMatchObject({
      capabilityId: 'reservation_schedule_diagnosis',
      templateId: 'reservation_schedule',
      dimensions: ['date'],
      storeScope: { storeIds: [1], scopeType: 'current_store' },
      filters: { storeId: 1 },
    });
    expect(result.plan?.metrics.map((item) => item.key)).toEqual(expect.arrayContaining(['reservation_count', 'arrival_rate']));
  });

  it('plans recent marketing activity questions as activity list instead of conversion diagnosis', () => {
    const { task } = preParser.parse({ message: '推荐近期营销活动', role: 'manager' });
    const result = planner.plan({ task, actor: actor() });

    expect(result.rejectedReason).toBeUndefined();
    expect(result.plan).toMatchObject({
      capabilityId: 'marketing_activity_list',
      templateId: 'marketing_activity_list',
      dimensions: ['campaignId', 'campaignName'],
      outputShape: 'table',
      storeScope: { storeIds: [1], scopeType: 'current_store' },
    });
    expect(result.plan?.metrics.map((item) => item.key)).toEqual(['marketing_activity_count']);
  });
});
