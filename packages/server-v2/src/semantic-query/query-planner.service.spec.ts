import { BusinessTaskPreParserService } from '../agent/business-task/business-task-preparser.service.js';
import { DimensionRegistryService } from '../semantic-data/dimension-registry.service.js';
import { SemanticMetricRegistryService } from '../semantic-data/semantic-metric-registry.service.js';
import { QueryPlannerService } from './query-planner.service.js';
import { QuerySafetyGuardService } from './query-safety-guard.service.js';

describe('QueryPlannerService', () => {
  const preParser = new BusinessTaskPreParserService();
  const metricRegistry = new SemanticMetricRegistryService();
  const dimensionRegistry = new DimensionRegistryService();
  const safetyGuard = new QuerySafetyGuardService(metricRegistry, dimensionRegistry);
  const planner = new QueryPlannerService(metricRegistry, dimensionRegistry, safetyGuard);

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
});
