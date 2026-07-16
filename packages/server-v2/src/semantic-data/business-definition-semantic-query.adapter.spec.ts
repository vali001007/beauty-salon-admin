import { QueryPlannerService } from '../semantic-query/query-planner.service.js';
import { QuerySafetyGuardService } from '../semantic-query/query-safety-guard.service.js';
import { QueryTemplateRegistryService } from '../semantic-query/query-template-registry.service.js';
import { DimensionRegistryService } from './dimension-registry.service.js';
import { createInMemoryBusinessMetricCatalog } from './business-metric-catalog.testing.js';
import { LEGACY_SEMANTIC_METRICS } from './legacy-semantic-metric.fixture.js';
import { BusinessDefinitionSemanticQueryAdapter } from './business-definition-semantic-query.adapter.js';

describe('BusinessDefinitionSemanticQueryAdapter', () => {
  it('executes product_sales_quantity through the real template/planner/executor chain', async () => {
    const metricRegistry = createInMemoryBusinessMetricCatalog(LEGACY_SEMANTIC_METRICS);
    const dimensionRegistry = new DimensionRegistryService();
    const templateRegistry = new QueryTemplateRegistryService();
    const planner = new QueryPlannerService(
      metricRegistry,
      dimensionRegistry,
      new QuerySafetyGuardService(metricRegistry, dimensionRegistry),
      templateRegistry,
    );
    const executor = {
      execute: jest.fn().mockResolvedValue({
        status: 'success',
        queryId: 'volatile-query-id',
        capabilityId: 'product_sales_ranking',
        title: '商品销量排行',
        summary: 'volatile summary',
        rows: [{ quantity: 14, productName: '抗衰紧致眼霜', productId: 101 }],
        kpis: [{ value: '14', label: '最高销量' }],
        actions: [],
        auditEvidence: { source: ['OrderItem'], metricDefinition: 'registry-owned', filters: [] },
      }),
    };
    const adapter = new BusinessDefinitionSemanticQueryAdapter(planner, executor as any, templateRegistry);

    const actual = await adapter.execute({
      canonicalQueryRef: 'semantic_query.product_sales_quantity',
      version: productSalesVersion(),
      fixtureCase: {
        caseKey: 'store-6-july',
        input: {
          storeId: 6,
          operatorId: 1,
          role: 'manager',
          timeRange: { preset: 'custom', startDate: '2026-07-01', endDate: '2026-07-31', label: '2026年7月' },
          limit: 10,
        },
        expected: {},
      },
      timezone: 'Asia/Shanghai',
      storeScope: { mode: 'current_store' },
    });

    expect(actual).toEqual({
      status: 'success',
      rows: [{ productId: 101, productName: '抗衰紧致眼霜', quantity: 14 }],
      kpis: [{ label: '最高销量', value: '14' }],
    });
    expect(executor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'product_sales',
        capabilityId: 'product_sales_ranking',
        storeScope: { storeIds: [6], scopeType: 'current_store' },
        timeRange: {
          preset: 'custom',
          startDate: '2026-07-01',
          endDate: '2026-07-31',
          label: '2026年7月',
        },
        metrics: expect.arrayContaining([expect.objectContaining({ key: 'product_sales_quantity' })]),
      }),
    );
  });

  it('does not support refs that have no registered semantic query template', () => {
    const adapter = adapterWithMocks();

    expect(adapter.supports('semantic_query.forged_metric')).toBe(false);
  });

  it('rejects when the version payload metric binding disagrees with the canonical ref', async () => {
    const adapter = adapterWithMocks();

    await expect(
      adapter.execute({
        canonicalQueryRef: 'semantic_query.product_sales_quantity',
        version: productSalesVersion({ payload: { metricKey: 'net_revenue' } }),
        fixtureCase: { caseKey: 'case', input: { storeId: 6 }, expected: {} },
        timezone: 'Asia/Shanghai',
        storeScope: { mode: 'current_store' },
      }),
    ).rejects.toThrow('business_definition_metric_binding_mismatch');
  });

  it('fails closed for UTC because the current semantic executor uses the business timezone', async () => {
    const adapter = adapterWithMocks();

    await expect(
      adapter.execute({
        canonicalQueryRef: 'semantic_query.product_sales_quantity',
        version: productSalesVersion(),
        fixtureCase: {
          caseKey: 'case',
          input: {
            storeId: 6,
            timeRange: { preset: 'custom', startDate: '2026-07-01', endDate: '2026-07-31', label: 'July' },
          },
          expected: {},
        },
        timezone: 'UTC',
        storeScope: { mode: 'current_store' },
      }),
    ).rejects.toThrow('business_definition_query_timezone_unsupported');
  });

  it('rejects fixture store access outside an explicit governed store scope', async () => {
    const adapter = adapterWithMocks();

    await expect(
      adapter.execute({
        canonicalQueryRef: 'semantic_query.product_sales_quantity',
        version: productSalesVersion(),
        fixtureCase: {
          caseKey: 'case',
          input: {
            storeId: 6,
            timeRange: { preset: 'custom', startDate: '2026-07-01', endDate: '2026-07-31', label: 'July' },
          },
          expected: {},
        },
        timezone: 'Asia/Shanghai',
        storeScope: { mode: 'explicit_store_ids', storeIds: [5] },
      }),
    ).rejects.toThrow('business_definition_fixture_store_out_of_scope');
  });

  it('rejects unknown or executor-unsupported presets before planning', async () => {
    const { adapter, planner, executor } = adapterHarness();

    await expect(executeWithTimeRange(adapter, { preset: 'last_week', label: '上周' })).rejects.toThrow(
      'business_definition_fixture_time_range_preset_unsupported',
    );
    expect(planner.plan).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('rejects custom ranges with missing dates before planning', async () => {
    const { adapter, planner, executor } = adapterHarness();

    await expect(
      executeWithTimeRange(adapter, { preset: 'custom', startDate: '2026-07-01', label: '2026年7月' }),
    ).rejects.toThrow('business_definition_fixture_time_range_invalid');
    expect(planner.plan).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('rejects custom ranges with invalid calendar dates before planning', async () => {
    const { adapter, planner, executor } = adapterHarness();

    await expect(
      executeWithTimeRange(adapter, {
        preset: 'custom',
        startDate: '2026-02-30',
        endDate: '2026-03-02',
        label: '非法日期',
      }),
    ).rejects.toThrow('business_definition_fixture_time_range_invalid');
    expect(planner.plan).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('rejects custom ranges whose start is not before end', async () => {
    const { adapter, planner, executor } = adapterHarness();

    await expect(
      executeWithTimeRange(adapter, {
        preset: 'custom',
        startDate: '2026-07-31',
        endDate: '2026-07-01',
        label: '倒序区间',
      }),
    ).rejects.toThrow('business_definition_fixture_time_range_order_invalid');
    expect(planner.plan).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('requires fixed presets to use their canonical label', async () => {
    const { adapter, planner, executor } = adapterHarness();

    await expect(executeWithTimeRange(adapter, { preset: 'today', label: '近7天' })).rejects.toThrow(
      'business_definition_fixture_time_range_label_mismatch',
    );
    expect(planner.plan).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });
});

function adapterWithMocks() {
  return adapterHarness().adapter;
}

function adapterHarness() {
  const planner = { plan: jest.fn() };
  const executor = { execute: jest.fn() };
  return {
    adapter: new BusinessDefinitionSemanticQueryAdapter(
      planner as any,
      executor as any,
      new QueryTemplateRegistryService(),
    ),
    planner,
    executor,
  };
}

function executeWithTimeRange(adapter: BusinessDefinitionSemanticQueryAdapter, timeRange: Record<string, unknown>) {
  return adapter.execute({
    canonicalQueryRef: 'semantic_query.product_sales_quantity',
    version: productSalesVersion(),
    fixtureCase: {
      caseKey: 'time-range-case',
      input: { storeId: 6, operatorId: 1, role: 'manager', timeRange },
      expected: {},
    },
    timezone: 'Asia/Shanghai',
    storeScope: { mode: 'current_store' },
  });
}

function productSalesVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 21,
    definitionId: 10,
    version: 1,
    schemaVersion: '1.0',
    payload: {
      metricKey: 'product_sales_quantity',
      capabilityId: 'product_sales_ranking',
      taskType: 'ranking',
      outputMode: 'ranked_list',
      permissionPolicies: [
        { bindingRef: 'capability:product_sales_ranking', allOf: ['core:order:products'] },
      ],
    },
    lifecycleStatus: 'validated',
    fingerprint: 'a'.repeat(64),
    sourceFingerprint: 'b'.repeat(64),
    validationStatus: 'passed',
    canonicalQueryRef: 'semantic_query.product_sales_quantity',
    fixtureSetKey: 'semantic.product_sales_quantity.v1',
    timezone: 'Asia/Shanghai',
    storeScope: { mode: 'current_store' },
    definition: {
      id: 10,
      definitionKey: 'metric.product_sales_quantity',
      kind: 'metric',
      domain: 'product',
      name: '商品销量',
      ownerType: 'system',
    },
    ...overrides,
  } as any;
}
