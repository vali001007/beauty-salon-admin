import type { BusinessTaskType } from '../agent/business-task/business-task.types.js';
import type {
  BusinessMetricCatalog,
  BusinessMetricCatalogDefinition,
} from './business-metric-catalog.types.js';
import type { LegacySemanticMetricDefinition } from './legacy-semantic-metric.fixture.js';

export function createInMemoryBusinessMetricCatalog(
  metrics: readonly LegacySemanticMetricDefinition[] | readonly BusinessMetricCatalogDefinition[],
): BusinessMetricCatalog {
  const normalized = metrics.map((metric) => normalizeMetric(metric));
  const byKey = new Map(normalized.map((metric) => [metric.key, metric]));
  if (byKey.size !== normalized.length) throw new Error('business_metric_catalog_duplicate_test_fixture');
  const list = Object.freeze([...normalized]);
  return {
    list: () => list,
    findByKey: (key) => byKey.get(key),
    match: (keys: readonly string[], taskType?: BusinessTaskType) =>
      Object.freeze(
        keys
          .map((key) => byKey.get(key))
          .filter((metric): metric is BusinessMetricCatalogDefinition => Boolean(metric))
          .filter((metric) => !taskType || metric.allowedTaskTypes.includes(taskType)),
      ),
    assertContains: (keys, source) => {
      const missing = [...new Set(keys)].filter((key) => !byKey.has(key)).sort();
      if (missing.length) throw new Error(`business_metric_catalog_coverage_missing:${source}:${missing.join(',')}`);
    },
    getStatus: () => Object.freeze({ state: 'ready', metricCount: list.length, generation: 1 }),
    refresh: async () => undefined,
  };
}

function normalizeMetric(
  metric: LegacySemanticMetricDefinition | BusinessMetricCatalogDefinition,
): BusinessMetricCatalogDefinition {
  if ('definitionKey' in metric) return deepFreeze(structuredClone(metric));
  const aggregation = metric.defaultAggregation ?? defaultAggregation(metric.key);
  return deepFreeze({
    ...structuredClone(metric),
    definitionKey: `metric.${metric.key}`,
    version: 0,
    definitionFingerprint: 'legacy-test-fixture',
    sourceFingerprint: 'legacy-test-fixture',
    permissions: legacyPermissions(metric),
    formula: { type: aggregation, model: 'Store', field: 'id' },
    sourceDefinition: [{ model: 'Store', field: 'id' }],
    defaultAggregation: aggregation,
    runtimeQuery: {
      aggregation,
      joinPath: [],
      dimensions: metric.key === 'staff_performance_score' ? ['beauticianId', 'beauticianName'] : [],
      filters: [],
      capabilityKeys: [],
      executorKeys: [],
      outputFields: [metric.key],
      timePolicy: { mode: 'event_time', field: 'createdAt', boundary: '[start,end)', timezone: 'Asia/Shanghai' },
      storeScope: { mode: 'current_store', model: 'Store', field: 'id', joinPath: [] },
    },
  });
}

function legacyPermissions(metric: LegacySemanticMetricDefinition): string[] {
  if (metric.domain === 'finance' || metric.domain === 'order') return ['core:finance:view'];
  if (metric.domain === 'staff') return ['core:beautician-performance:view'];
  if (metric.domain === 'inventory') return ['core:inventory:stock'];
  return ['core:business:view'];
}

function defaultAggregation(key: string) {
  if (key.includes('rate') || key.includes('ratio')) return 'ratio' as const;
  if (key.includes('score')) return 'score' as const;
  if (key.includes('count')) return 'count' as const;
  return 'sum' as const;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}
