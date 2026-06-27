import { DimensionRegistryService } from '../semantic-data/dimension-registry.service.js';
import { SemanticMetricRegistryService } from '../semantic-data/semantic-metric-registry.service.js';
import type { SemanticQueryPlan } from './query-plan.types.js';
import { QuerySafetyGuardService } from './query-safety-guard.service.js';

function basePlan(overrides: Partial<SemanticQueryPlan> = {}): SemanticQueryPlan {
  return {
    queryId: 'sq_guard',
    capabilityId: 'revenue_diagnosis',
    taskId: 'task_guard',
    originalQuestion: '今天收银多少',
    role: 'manager',
    storeScope: { storeIds: [1], scopeType: 'current_store' },
    metrics: [{ key: 'paid_amount', aggregation: 'sum' }],
    dimensions: ['date'],
    filters: { storeId: 1 },
    timeRange: { preset: 'today', label: '今天' },
    orderBy: [{ key: 'paid_amount', direction: 'desc' }],
    limit: 10,
    outputShape: 'summary',
    riskLevel: 'low',
    ...overrides,
  };
}

describe('QuerySafetyGuardService', () => {
  const metricRegistry = new SemanticMetricRegistryService();
  const dimensionRegistry = new DimensionRegistryService();
  const guard = new QuerySafetyGuardService(metricRegistry, dimensionRegistry);

  it('allows scoped manager query with registered metric and dimensions', () => {
    expect(guard.validate(basePlan())).toEqual({ allowed: true, warnings: [] });
  });

  it('rejects unsupported dimensions and unknown metrics', () => {
    expect(guard.validate(basePlan({ dimensions: ['date', 'rawSqlColumn'] })).rejectedReason).toContain('维度');
    expect(guard.validate(basePlan({ metrics: [{ key: 'raw_metric', aggregation: 'sum' }] })).rejectedReason).toContain('暂不支持指标');
  });

  it('rejects missing or invalid store scope', () => {
    expect(guard.validate(basePlan({ storeScope: { storeIds: [], scopeType: 'current_store' } })).rejectedReason).toContain('缺少门店范围');
    expect(guard.validate(basePlan({ storeScope: { storeIds: [0], scopeType: 'current_store' } })).rejectedReason).toContain('缺少门店范围');
  });

  it('blocks broad beautician query unless it has self scope', () => {
    expect(guard.validate(basePlan({ role: 'beautician' })).rejectedReason).toContain('本人');
    expect(guard.validate(basePlan({ role: 'beautician', filters: { storeId: 1, scope: 'self', beauticianId: 8 } })).allowed).toBe(true);
  });

  it('blocks sensitive finance metric for reception', () => {
    const decision = guard.validate(basePlan({ role: 'reception', metrics: [{ key: 'net_revenue', aggregation: 'sum' }] }));
    expect(decision.allowed).toBe(false);
    expect(decision.rejectedReason).toContain('前台');
  });
});
