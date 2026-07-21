import type { BusinessDefinitionSnapshotProvider } from '../brain/cognition/business-definition-snapshot.types.js';
import { BusinessMetricCatalogService } from './business-metric-catalog.service.js';

describe('BusinessMetricCatalogService', () => {
  it('loads an immutable catalog from the governed published snapshot provider', async () => {
    const provider = snapshotProvider([metricSnapshot('paid_amount')]);
    const catalog = new BusinessMetricCatalogService(provider);

    await catalog.onModuleInit();

    expect(catalog.findByKey('paid_amount')).toMatchObject({
      key: 'paid_amount',
      definitionKey: 'metric.paid_amount',
      defaultAggregation: 'sum',
      allowedTaskTypes: ['query', 'diagnosis', 'ranking'],
      sensitive: true,
      permissions: ['core:finance:view'],
    });
    expect(Object.isFrozen(catalog.list())).toBe(true);
    expect(Object.isFrozen(catalog.findByKey('paid_amount'))).toBe(true);
  });

  it('does not block module initialization when the published metric catalog is empty', async () => {
    const catalog = new BusinessMetricCatalogService(snapshotProvider([]));

    await expect(catalog.onModuleInit()).resolves.toBeUndefined();
    expect(() => catalog.list()).toThrow('business_metric_catalog_unavailable:business_metric_catalog_empty');
  });

  it('fails closed for duplicate metric keys', async () => {
    const catalog = new BusinessMetricCatalogService(
      snapshotProvider([metricSnapshot('paid_amount'), metricSnapshot('paid_amount', { version: 2 })]),
    );

    await expect(catalog.refresh()).resolves.toBeUndefined();
    expect(() => catalog.list()).toThrow('business_metric_catalog_unavailable:business_metric_catalog_duplicate:paid_amount');
  });

  it.each([
    ['missing runtime query', { runtimeQuery: undefined }, 'business_metric_catalog_runtime_query_missing:paid_amount'],
    ['missing task policy', { allowedTaskTypes: undefined }, 'business_metric_catalog_allowed_task_types_missing:paid_amount'],
    ['missing sensitivity policy', { sensitive: undefined }, 'business_metric_catalog_sensitive_flag_missing:paid_amount'],
    ['missing permissions', { permissions: [] }, 'business_metric_catalog_permissions_missing:paid_amount'],
  ])('rejects %s instead of inventing runtime metadata', async (_label, overrides, message) => {
    const catalog = new BusinessMetricCatalogService(snapshotProvider([metricSnapshot('paid_amount', overrides)]));

    await expect(catalog.refresh()).resolves.toBeUndefined();
    expect(() => catalog.list()).toThrow(`business_metric_catalog_unavailable:${message}`);
  });

  it('marks a previously valid cache stale when refresh validation fails', async () => {
    const provider = snapshotProvider([metricSnapshot('paid_amount')]);
    const catalog = new BusinessMetricCatalogService(provider);
    await catalog.refresh();
    provider.loadActiveMetricDefinitions = jest.fn().mockRejectedValue(
      new Error('published_business_definition_projection_invalid:paid_amount:fingerprint'),
    );

    await expect(catalog.refresh()).resolves.toBeUndefined();
    expect(catalog.getStatus()).toMatchObject({ state: 'stale', metricCount: 1 });
    expect(() => catalog.findByKey('paid_amount')).toThrow(
      'business_metric_catalog_stale:published_business_definition_projection_invalid',
    );
  });

  it('queues a second refresh generation while the first refresh is in flight', async () => {
    let resolveFirst!: (value: ReturnType<typeof metricSnapshot>[]) => void;
    const provider = {
      loadActiveMetricDefinitions: jest
        .fn()
        .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
        .mockResolvedValueOnce([metricSnapshot('paid_amount', { version: 2 })]),
    } as unknown as BusinessDefinitionSnapshotProvider;
    const catalog = new BusinessMetricCatalogService(provider);

    const first = catalog.refresh();
    const second = catalog.refresh();
    resolveFirst([metricSnapshot('paid_amount')]);
    await Promise.all([first, second]);

    expect((provider as any).loadActiveMetricDefinitions).toHaveBeenCalledTimes(2);
    expect(catalog.findByKey('paid_amount')).toMatchObject({ version: 2 });
  });

  it('periodically refreshes without throwing and converges after a previous failure', async () => {
    const provider = snapshotProvider([metricSnapshot('paid_amount')]);
    const catalog = new BusinessMetricCatalogService(provider);
    await catalog.onModuleInit();
    provider.loadActiveMetricDefinitions
      .mockRejectedValueOnce(new Error('temporary_db_error'))
      .mockResolvedValueOnce([metricSnapshot('paid_amount', { version: 2 })]);

    await expect(catalog.refreshPeriodically()).resolves.toBeUndefined();
    expect(catalog.getStatus().state).toBe('stale');
    await expect(catalog.refreshPeriodically()).resolves.toBeUndefined();
    expect(catalog.findByKey('paid_amount')).toMatchObject({ version: 2 });
  });

  it('loads only metric projections and never asks the full ontology snapshot to validate unrelated kinds', async () => {
    const provider = snapshotProvider([metricSnapshot('paid_amount')]);
    (provider as any).loadActiveDefinitions = jest.fn().mockRejectedValue(new Error('broken_entity_projection'));
    const catalog = new BusinessMetricCatalogService(provider);

    await catalog.onModuleInit();

    expect(provider.loadActiveMetricDefinitions).toHaveBeenCalledTimes(1);
    expect((provider as any).loadActiveDefinitions).not.toHaveBeenCalled();
    expect(catalog.findByKey('paid_amount')).toBeDefined();
  });

  it('reports explicit coverage gaps', async () => {
    const catalog = new BusinessMetricCatalogService(snapshotProvider([metricSnapshot('paid_amount')]));
    await catalog.refresh();

    expect(() => catalog.assertContains(['paid_amount', 'order_count'], 'query_templates')).toThrow(
      'business_metric_catalog_coverage_missing:query_templates:order_count',
    );
  });
});

function snapshotProvider(metrics: ReturnType<typeof metricSnapshot>[]) {
  return {
    loadActiveMetricDefinitions: jest.fn().mockResolvedValue(metrics),
  } as unknown as BusinessDefinitionSnapshotProvider & { loadActiveMetricDefinitions: jest.Mock };
}

function snapshot(metrics: ReturnType<typeof metricSnapshot>[]) {
  return { entities: [], relations: [], metrics, dimensions: [] };
}

function metricSnapshot(key: string, overrides: Record<string, unknown> = {}) {
  return {
    definitionKey: `metric.${key}`,
    metricKey: key,
    name: '实收金额',
    domain: 'finance',
    formula: { type: 'sum', model: 'PaymentRecord', field: 'amount' },
    source: [{ model: 'PaymentRecord', field: 'amount' }],
    defaultFilters: [],
    permissions: ['core:finance:view'],
    description: '指定周期内已支付成功的收款金额。',
    valueType: 'money',
    allowedTaskTypes: ['query', 'diagnosis', 'ranking'],
    sensitive: true,
    runtimeQuery: {
      aggregation: 'sum',
      joinPath: [],
      dimensions: ['date'],
      filters: [],
      capabilityKeys: ['order_revenue_analysis'],
      executorKeys: ['SemanticQueryExecutorService.execute'],
      outputFields: ['paidAmount'],
      timePolicy: { mode: 'event_time', field: 'paidAt', boundary: '[start,end)', timezone: 'Asia/Shanghai' },
      storeScope: { mode: 'current_store', model: 'ProductOrder', field: 'storeId', joinPath: [] },
    },
    version: 1,
    definitionFingerprint: 'a'.repeat(64),
    sourceFingerprint: 'b'.repeat(64),
    ...overrides,
  };
}
