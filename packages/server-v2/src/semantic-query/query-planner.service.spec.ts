import { BusinessTaskPreParserService } from '../agent/business-task/business-task-preparser.service.js';
import { DimensionRegistryService } from '../semantic-data/dimension-registry.service.js';
import { SemanticMetricRegistryService } from '../semantic-data/semantic-metric-registry.service.js';
import { QueryPlannerService } from './query-planner.service.js';
import { QuerySafetyGuardService } from './query-safety-guard.service.js';
import { QueryTemplateRegistryService } from './query-template-registry.service.js';

describe('QueryPlannerService', () => {
  const preParser = new BusinessTaskPreParserService();
  const metricRegistry = new SemanticMetricRegistryService();
  const dimensionRegistry = new DimensionRegistryService();
  const safetyGuard = new QuerySafetyGuardService(metricRegistry, dimensionRegistry);
  const templateRegistry = new QueryTemplateRegistryService();
  const planner = new QueryPlannerService(metricRegistry, dimensionRegistry, safetyGuard, templateRegistry);

  it('plans last 7 days cashier trend as date-based semantic query', () => {
    const { task } = preParser.parse({ message: '最近七天收银趋势', role: 'manager' });
    const result = planner.plan({ task, role: 'manager', storeId: 1, operatorId: 9, capabilityId: 'revenue_diagnosis' });

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
  });

  it('plans revenue KPI questions as order revenue summary by payment method', () => {
    const { task } = preParser.parse({ message: '今天营收多少', role: 'manager' });
    const result = planner.plan({ task, role: 'manager', storeId: 1, operatorId: 9, capabilityId: 'order_revenue_analysis' });

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
    const result = planner.plan({ task, role: 'manager', storeId: 1, operatorId: 9, capabilityId: 'order_customer_consumption_list' });

    expect(result.rejectedReason).toBeUndefined();
    expect(result.plan).toMatchObject({
      capabilityId: 'order_customer_consumption_list',
      templateId: 'order_customer_consumption_list',
      dimensions: ['customerId', 'customerName'],
      outputShape: 'table',
      timeRange: { preset: 'yesterday', label: '昨天' },
      storeScope: { storeIds: [1], scopeType: 'current_store' },
      filters: expect.objectContaining({ storeId: 1, operatorId: 9 }),
      orderBy: [{ key: 'paid_amount', direction: 'desc' }],
      limit: 20,
    });
    expect(result.plan?.metrics.map((item) => item.key)).toEqual(expect.arrayContaining(['paid_amount', 'order_count']));
  });

  it('plans product ranking with product dimensions and user limit', () => {
    const { task } = preParser.parse({ message: '最近销量好的5个商品有哪些', role: 'manager' });
    const result = planner.plan({ task, role: 'manager', storeId: 1 });

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
    const result = planner.plan({ task, role: 'reception', storeId: 1 });

    expect(result.plan).toBeUndefined();
    expect(result.rejectedReason).toContain('前台');
  });

  it('blocks beautician broad staff query without self scope', () => {
    const { task } = preParser.parse({ message: '近期表现较好的员工', role: 'beautician' });
    const result = planner.plan({ task, role: 'beautician', storeId: 1 });

    expect(result.plan).toBeUndefined();
    expect(result.rejectedReason).toContain('美容师账号只能查询本人');
  });

  it('rejects query plans without a valid current store scope', () => {
    const { task } = preParser.parse({ message: '昨天有哪些消费客户，列出清单', role: 'manager' });
    const result = planner.plan({ task, role: 'manager', storeId: 0, capabilityId: 'order_customer_consumption_list' });

    expect(result.plan).toBeUndefined();
    expect(result.rejectedReason).toContain('缺少门店范围');
  });

  it('uses P1 capability templates even when metrics are sparse', () => {
    const { task } = preParser.parse({ message: '本周预约排班有什么风险', role: 'manager' });
    const result = planner.plan({ task, role: 'manager', storeId: 1, operatorId: 9, capabilityId: 'reservation_schedule_diagnosis' });

    expect(result.rejectedReason).toBeUndefined();
    expect(result.plan).toMatchObject({
      capabilityId: 'reservation_schedule_diagnosis',
      templateId: 'reservation_schedule',
      dimensions: ['date'],
      storeScope: { storeIds: [1], scopeType: 'current_store' },
      filters: expect.objectContaining({ storeId: 1, operatorId: 9 }),
    });
    expect(result.plan?.metrics.map((item) => item.key)).toEqual(expect.arrayContaining(['reservation_count', 'arrival_rate']));
  });
});
