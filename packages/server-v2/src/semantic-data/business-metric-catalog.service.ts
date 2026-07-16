import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type {
  BusinessDefinitionSnapshotProvider,
  BusinessMetricDefinitionSnapshot,
} from '../brain/cognition/business-definition-snapshot.types.js';
import { BUSINESS_DEFINITION_SNAPSHOT_PROVIDER } from '../brain/cognition/business-definition-snapshot.types.js';
import type {
  BusinessTaskDomain,
  BusinessTaskType,
} from '../agent/business-task/business-task.types.js';
import type {
  BusinessMetricCatalog,
  BusinessMetricCatalogDefinition,
  BusinessMetricCatalogStatus,
} from './business-metric-catalog.types.js';

const BUSINESS_TASK_DOMAINS = new Set<BusinessTaskDomain>([
  'business',
  'customer',
  'product',
  'project',
  'reservation',
  'schedule',
  'order',
  'card',
  'memberCard',
  'inventory',
  'supplyChain',
  'finance',
  'marketing',
  'promotion',
  'automation',
  'staff',
  'serviceQuality',
  'customerApp',
  'channel',
  'terminal',
  'store',
  'afterSales',
  'unknown',
]);

@Injectable()
export class BusinessMetricCatalogService implements BusinessMetricCatalog, OnModuleInit {
  private byKey: ReadonlyMap<string, BusinessMetricCatalogDefinition> = new Map();
  private ordered: readonly BusinessMetricCatalogDefinition[] = Object.freeze([]);
  private state: BusinessMetricCatalogStatus['state'] = 'unavailable';
  private failureReason = 'not_initialized';
  private requestedGeneration = 0;
  private completedGeneration = 0;
  private refreshLoop?: Promise<void>;
  private refreshedAt?: string;

  constructor(
    @Inject(BUSINESS_DEFINITION_SNAPSHOT_PROVIDER)
    private readonly snapshotProvider: BusinessDefinitionSnapshotProvider,
  ) {}

  async onModuleInit() {
    await this.refresh();
  }

  refresh(): Promise<void> {
    this.requestedGeneration += 1;
    if (!this.refreshLoop) {
      this.refreshLoop = this.runRefreshLoop().finally(() => {
        this.refreshLoop = undefined;
      });
    }
    return this.refreshLoop;
  }

  @Interval(30_000)
  async refreshPeriodically() {
    await this.refresh();
  }

  list(): readonly BusinessMetricCatalogDefinition[] {
    this.assertReady();
    return this.ordered;
  }

  findByKey(key: string): BusinessMetricCatalogDefinition | undefined {
    this.assertReady();
    return this.byKey.get(key);
  }

  match(keys: readonly string[], taskType?: BusinessTaskType): readonly BusinessMetricCatalogDefinition[] {
    this.assertReady();
    return Object.freeze(
      keys
        .map((key) => this.byKey.get(key))
        .filter((metric): metric is BusinessMetricCatalogDefinition => Boolean(metric))
        .filter((metric) => !taskType || metric.allowedTaskTypes.includes(taskType)),
    );
  }

  assertContains(keys: readonly string[], source: string): void {
    this.assertReady();
    const missing = [...new Set(keys)].filter((key) => !this.byKey.has(key)).sort();
    if (missing.length) {
      throw new Error(`business_metric_catalog_coverage_missing:${source}:${missing.join(',')}`);
    }
  }

  getStatus(): BusinessMetricCatalogStatus {
    return Object.freeze({
      state: this.state,
      ...(this.failureReason ? { reason: this.failureReason } : {}),
      metricCount: this.ordered.length,
      generation: this.completedGeneration,
      ...(this.refreshedAt ? { refreshedAt: this.refreshedAt } : {}),
    });
  }

  private async runRefreshLoop() {
    while (this.completedGeneration < this.requestedGeneration) {
      const generation = this.requestedGeneration;
      await this.loadGeneration();
      this.completedGeneration = generation;
    }
  }

  private async loadGeneration() {
    try {
      if (typeof this.snapshotProvider.loadActiveMetricDefinitions !== 'function') {
        throw new Error('business_metric_catalog_metric_snapshot_source_missing');
      }
      const metrics = await this.snapshotProvider.loadActiveMetricDefinitions();
      if (!metrics.length) throw new Error('business_metric_catalog_empty');
      this.swap(metrics);
    } catch (error) {
      this.failureReason = error instanceof Error ? error.message : 'unknown_refresh_failure';
      this.state = this.ordered.length ? 'stale' : 'unavailable';
    }
  }

  private swap(metrics: BusinessMetricDefinitionSnapshot[]) {
    const next = new Map<string, BusinessMetricCatalogDefinition>();
    for (const metric of metrics) {
      const definition = toCatalogDefinition(metric);
      if (next.has(definition.key)) {
        throw new Error(`business_metric_catalog_duplicate:${definition.key}`);
      }
      next.set(definition.key, definition);
    }
    const ordered = Object.freeze([...next.values()].sort((left, right) => left.key.localeCompare(right.key)));
    this.byKey = next;
    this.ordered = ordered;
    this.failureReason = '';
    this.state = 'ready';
    this.refreshedAt = new Date().toISOString();
  }

  private assertReady() {
    if (this.state === 'stale') throw new Error(`business_metric_catalog_stale:${this.failureReason}`);
    if (this.state !== 'ready') throw new Error(`business_metric_catalog_unavailable:${this.failureReason}`);
  }
}

function toCatalogDefinition(metric: BusinessMetricDefinitionSnapshot): BusinessMetricCatalogDefinition {
  const key = requiredString(metric.metricKey, 'metric_key_missing');
  if (metric.definitionKey !== `metric.${key}`) {
    throw new Error(`business_metric_catalog_identity_invalid:${key}`);
  }
  if (!BUSINESS_TASK_DOMAINS.has(metric.domain as BusinessTaskDomain)) {
    throw new Error(`business_metric_catalog_domain_invalid:${key}:${metric.domain}`);
  }
  if (!metric.runtimeQuery) throw new Error(`business_metric_catalog_runtime_query_missing:${key}`);
  if (!metric.allowedTaskTypes?.length) {
    throw new Error(`business_metric_catalog_allowed_task_types_missing:${key}`);
  }
  if (typeof metric.sensitive !== 'boolean') {
    throw new Error(`business_metric_catalog_sensitive_flag_missing:${key}`);
  }
  const permissions = stringArray(metric.permissions, `business_metric_catalog_permissions_invalid:${key}`);
  if (!permissions.length) throw new Error(`business_metric_catalog_permissions_missing:${key}`);
  const definition = {
    key,
    definitionKey: metric.definitionKey,
    version: metric.version,
    definitionFingerprint: requiredString(metric.definitionFingerprint, 'definition_fingerprint_missing'),
    sourceFingerprint: requiredString(metric.sourceFingerprint, 'source_fingerprint_missing'),
    name: requiredString(metric.name, 'metric_name_missing'),
    domain: metric.domain as BusinessTaskDomain,
    description: requiredString(metric.description, 'metric_description_missing'),
    source: sourceDescriptions(metric.source),
    filters: filterDescriptions(metric.defaultFilters),
    permissions,
    allowedTaskTypes: [...new Set(metric.allowedTaskTypes)] as BusinessTaskType[],
    sensitive: metric.sensitive,
    valueType: metric.valueType,
    defaultAggregation: metric.runtimeQuery.aggregation,
    userVisibleDefinition: metric.description,
    auditDefinition: `published:${metric.definitionKey}@${metric.version}`,
    formula: metric.formula,
    sourceDefinition: metric.source,
    runtimeQuery: metric.runtimeQuery,
  };
  return deepFreeze(structuredClone(definition));
}

function sourceDescriptions(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length) throw new Error('business_metric_catalog_source_missing');
  return value.map((source) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new Error('business_metric_catalog_source_invalid');
    }
    const record = source as Record<string, unknown>;
    const model = requiredString(record.model, 'business_metric_catalog_source_model_missing');
    const field = typeof record.field === 'string' && record.field.trim() ? `.${record.field.trim()}` : '';
    return `${model}${field}`;
  });
}

function filterDescriptions(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('business_metric_catalog_filters_invalid');
  return value.map((filter) => stableJson(filter));
}

function stringArray(value: unknown, message: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(message);
  }
  return [...new Set(value.map((item) => (item as string).trim()))];
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message);
  return value.trim();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
}
