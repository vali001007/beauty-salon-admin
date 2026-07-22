/**
 * Compatibility type export only. Runtime code must inject BUSINESS_METRIC_CATALOG.
 * The historical metric data lives in legacy-semantic-metric.fixture.ts for
 * offline candidate generation and tests.
 */
export type { BusinessMetricCatalogDefinition as SemanticMetricDefinition } from './business-metric-catalog.types.js';
