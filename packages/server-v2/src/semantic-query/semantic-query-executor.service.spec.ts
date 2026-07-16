import { createInMemoryBusinessMetricCatalog } from '../semantic-data/business-metric-catalog.testing.js';
import type { BusinessMetricCatalogDefinition } from '../semantic-data/business-metric-catalog.types.js';
import { BusinessDefinitionRuntimeQueryEngineService } from './business-definition-runtime-query-engine.service.js';
import type { SemanticQueryPlan } from './query-plan.types.js';
import { SemanticQueryExecutorService } from './semantic-query-executor.service.js';

describe('SemanticQueryExecutorService governed runtime execution', () => {
  it('executes the immutable runtime binding carried by the plan', async () => {
    const prisma = { productOrder: { findMany: jest.fn().mockResolvedValue([{ totalAmount: 120 }]) } };
    const metric = metricDefinition();
    const service = createExecutor(prisma, metric);

    const result = await service.execute(plan(metric));

    expect(result).toMatchObject({
      status: 'success',
      title: '实收金额',
      rows: [{ paidAmount: 120, paid_amount: 120 }],
      kpis: [{ label: '实收金额', value: '120', hint: 'metric.paid_amount@1' }],
    });
    expect(prisma.productOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: expect.arrayContaining([{ status: 'paid' }, { storeId: 6 }]) },
      }),
    );
  });

  it('follows a newly published filter instead of a metric-key switch', async () => {
    const prisma = { productOrder: { findMany: jest.fn().mockResolvedValue([{ totalAmount: 90 }]) } };
    const metric = metricDefinition({
      version: 2,
      runtimeQuery: runtimeQuery({ filters: [{ model: 'ProductOrder', field: 'status', operator: 'eq', value: 'completed' }] }),
    });
    const service = createExecutor(prisma, metric);

    await service.execute(plan(metric));

    expect(prisma.productOrder.findMany.mock.calls[0][0].where.AND).toContainEqual({ status: 'completed' });
  });

  it('rejects an unknown key before any historical hardcoded query can run', async () => {
    const prisma = {
      productOrder: { findMany: jest.fn() },
      paymentRecord: { findMany: jest.fn() },
    };
    const known = metricDefinition();
    const unknown = metricDefinition({ key: 'unknown_metric', definitionKey: 'metric.unknown_metric' });
    const service = createExecutor(prisma, known);

    await expect(service.execute(plan(unknown))).rejects.toThrow('business_metric_catalog_metric_missing:unknown_metric');
    expect(prisma.productOrder.findMany).not.toHaveBeenCalled();
    expect(prisma.paymentRecord.findMany).not.toHaveBeenCalled();
  });

  it('rejects stale lineage and tampered runtime bindings', async () => {
    const prisma = { productOrder: { findMany: jest.fn() } };
    const current = metricDefinition({ version: 2, definitionFingerprint: 'c'.repeat(64) });
    const stale = metricDefinition({ version: 1, definitionFingerprint: 'a'.repeat(64) });
    const service = createExecutor(prisma, current);

    await expect(service.execute(plan(stale))).rejects.toThrow('semantic_runtime_definition_lineage_stale:paid_amount');
    expect(prisma.productOrder.findMany).not.toHaveBeenCalled();
  });

  it('rejects dynamic user filters that were not compiled into the published runtime definition', async () => {
    const prisma = { productOrder: { findMany: jest.fn() } };
    const metric = metricDefinition();
    const service = createExecutor(prisma, metric);

    await expect(service.execute(plan(metric, { filters: { storeId: 6, rawStatus: 'paid' } }))).rejects.toThrow(
      'semantic_runtime_dynamic_filter_unsupported:rawStatus',
    );
  });

  it('rejects an actor without the metric permission before querying Prisma', async () => {
    const prisma = { productOrder: { findMany: jest.fn() } };
    const metric = metricDefinition();
    const service = createExecutor(prisma, metric);

    await expect(
      service.execute(plan(metric, { actor: actor({ permissions: ['core:inventory:view'] }) })),
    ).rejects.toThrow('semantic_runtime_permission_denied:paid_amount:core:finance:view');
    expect(prisma.productOrder.findMany).not.toHaveBeenCalled();
  });

  it('rejects a stale plan when another instance publishes a new current lineage', async () => {
    const prisma = { productOrder: { findMany: jest.fn() } };
    const metric = metricDefinition();
    const catalog = createInMemoryBusinessMetricCatalog([metric]);
    const lineage = {
      loadCurrent: jest.fn().mockResolvedValue(
        new Map([
          [
            'paid_amount',
            {
              definitionKey: 'metric.paid_amount',
              version: 2,
              definitionFingerprint: 'c'.repeat(64),
              sourceFingerprint: 'd'.repeat(64),
            },
          ],
        ]),
      ),
    };
    const refresh = jest.fn().mockResolvedValue(undefined);
    const service = new (SemanticQueryExecutorService as any)(
      prisma,
      undefined,
      catalog,
      new BusinessDefinitionRuntimeQueryEngineService(prisma as any, dataModelProvider() as any),
      lineage,
      { refresh },
    ) as SemanticQueryExecutorService;

    await expect(service.execute(plan(metric))).rejects.toThrow('catalog_lineage_stale:paid_amount');
    expect(refresh).toHaveBeenCalled();
    expect(prisma.productOrder.findMany).not.toHaveBeenCalled();
  });
});

function plan(metric: BusinessMetricCatalogDefinition, overrides: Partial<SemanticQueryPlan> = {}): SemanticQueryPlan {
  return {
    queryId: 'sq_catalog',
    capabilityId: 'order_revenue_analysis',
    taskId: 'task_catalog',
    originalQuestion: '本月实收多少',
    taskType: 'query',
    role: 'manager',
    actor: actor(),
    storeScope: { storeIds: [6], scopeType: 'current_store' },
    metrics: [
      {
        key: metric.key,
        aggregation: metric.defaultAggregation,
        runtimeBinding: {
          definitionKey: metric.definitionKey,
          version: metric.version,
          definitionFingerprint: metric.definitionFingerprint,
          sourceFingerprint: metric.sourceFingerprint,
          name: metric.name,
          description: metric.description,
          permissions: metric.permissions,
          allowedTaskTypes: metric.allowedTaskTypes,
          sensitive: metric.sensitive,
          formula: metric.formula,
          sourceDefinition: metric.sourceDefinition,
          runtimeQuery: metric.runtimeQuery,
        },
      },
    ],
    dimensions: [],
    dimensionBindings: [],
    filters: { storeId: 6 },
    timeRange: { preset: 'this_month', label: '本月' },
    orderBy: [{ key: metric.key, direction: 'desc' }],
    limit: 10,
    outputShape: 'summary',
    riskLevel: 'low',
    ...overrides,
  };
}

function actor(overrides: Record<string, unknown> = {}) {
  return {
    principalType: 'user' as const,
    userId: 9,
    storeId: 6,
    role: 'manager' as const,
    permissions: ['core:finance:view'],
    ...overrides,
  };
}

function createExecutor(prisma: any, metric: BusinessMetricCatalogDefinition) {
  const catalog = createInMemoryBusinessMetricCatalog([metric]);
  const lineage = {
    loadCurrent: jest.fn().mockResolvedValue(
      new Map([
        [
          metric.key,
          {
            definitionKey: metric.definitionKey,
            version: metric.version,
            definitionFingerprint: metric.definitionFingerprint,
            sourceFingerprint: metric.sourceFingerprint,
          },
        ],
      ]),
    ),
  };
  return new (SemanticQueryExecutorService as any)(
    prisma,
    undefined,
    catalog,
    new BusinessDefinitionRuntimeQueryEngineService(prisma as any, dataModelProvider() as any),
    lineage,
    { refresh: jest.fn() },
  ) as SemanticQueryExecutorService;
}

function metricDefinition(overrides: Partial<BusinessMetricCatalogDefinition> = {}): BusinessMetricCatalogDefinition {
  return {
    key: 'paid_amount',
    definitionKey: 'metric.paid_amount',
    version: 1,
    definitionFingerprint: 'a'.repeat(64),
    sourceFingerprint: 'b'.repeat(64),
    name: '实收金额',
    domain: 'finance',
    description: '指定周期内实收金额。',
    source: ['ProductOrder.totalAmount'],
    filters: ['status=paid'],
    permissions: ['core:finance:view'],
    allowedTaskTypes: ['query'],
    sensitive: true,
    valueType: 'money',
    defaultAggregation: 'sum',
    formula: { type: 'sum', model: 'ProductOrder', field: 'totalAmount' },
    sourceDefinition: [{ model: 'ProductOrder', field: 'totalAmount' }],
    runtimeQuery: runtimeQuery(),
    ...overrides,
  };
}

function runtimeQuery(overrides: Record<string, unknown> = {}) {
  return {
    aggregation: 'sum' as const,
    joinPath: [],
    dimensions: [],
    filters: [{ model: 'ProductOrder', field: 'status', operator: 'eq', value: 'paid' }],
    capabilityKeys: ['order_revenue_analysis'],
    executorKeys: ['BusinessDefinitionRuntimeQueryExecutor.execute'],
    outputFields: ['paidAmount'],
    timePolicy: { mode: 'event_time' as const, field: 'ProductOrder.createdAt', boundary: '[start,end)' as const, timezone: 'Asia/Shanghai' as const },
    storeScope: { mode: 'current_store' as const, model: 'ProductOrder', field: 'storeId', joinPath: [] },
    ...overrides,
  };
}

function dataModelProvider() {
  return {
    getRuntimeDataModel: () => ({
      models: {
        ProductOrder: {
          fields: [
            { name: 'totalAmount', type: 'Decimal', kind: 'scalar', isList: false },
            { name: 'status', type: 'String', kind: 'scalar', isList: false },
            { name: 'storeId', type: 'Int', kind: 'scalar', isList: false },
            { name: 'createdAt', type: 'DateTime', kind: 'scalar', isList: false },
          ],
        },
      },
    }),
  };
}
