import type {
  BusinessTaskDomain,
  BusinessTaskType,
} from '../agent/business-task/business-task.types.js';
import type {
  BusinessMetricRuntimeAggregation,
  BusinessMetricRuntimeQuery,
} from '../brain/cognition/business-definition-snapshot.types.js';

export const BUSINESS_METRIC_CATALOG = Symbol('BUSINESS_METRIC_CATALOG');
export const BUSINESS_METRIC_CATALOG_REFRESHER = Symbol('BUSINESS_METRIC_CATALOG_REFRESHER');
export const BUSINESS_METRIC_CURRENT_LINEAGE_SOURCE = Symbol('BUSINESS_METRIC_CURRENT_LINEAGE_SOURCE');

export type BusinessMetricCatalogDefinition = Readonly<{
  key: string;
  definitionKey: string;
  version: number;
  definitionFingerprint: string;
  sourceFingerprint: string;
  name: string;
  domain: BusinessTaskDomain;
  description: string;
  source: readonly string[];
  filters: readonly string[];
  permissions: readonly string[];
  allowedTaskTypes: readonly BusinessTaskType[];
  sensitive: boolean;
  valueType?: 'money' | 'count' | 'percent' | 'score' | 'duration';
  defaultAggregation: BusinessMetricRuntimeAggregation;
  userVisibleDefinition?: string;
  auditDefinition?: string;
  formula: unknown;
  sourceDefinition: unknown;
  runtimeQuery: BusinessMetricRuntimeQuery;
}>;

export interface BusinessMetricCatalogReader {
  list(): readonly BusinessMetricCatalogDefinition[];
  findByKey(key: string): BusinessMetricCatalogDefinition | undefined;
  match(keys: readonly string[], taskType?: BusinessTaskType): readonly BusinessMetricCatalogDefinition[];
  assertContains(keys: readonly string[], source: string): void;
  getStatus(): BusinessMetricCatalogStatus;
}

export interface BusinessMetricCatalogRefresher {
  refresh(): Promise<void>;
}

export type BusinessMetricCurrentLineage = Readonly<{
  definitionKey: string;
  version: number;
  definitionFingerprint: string;
  sourceFingerprint: string;
}>;

export interface BusinessMetricCurrentLineageSource {
  loadCurrent(keys: readonly string[]): Promise<ReadonlyMap<string, BusinessMetricCurrentLineage>>;
}

export type BusinessMetricCatalog = BusinessMetricCatalogReader & BusinessMetricCatalogRefresher;

export type BusinessMetricCatalogStatus = Readonly<{
  state: 'ready' | 'unavailable' | 'stale';
  reason?: string;
  metricCount: number;
  generation: number;
  refreshedAt?: string;
}>;
