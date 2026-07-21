export const BUSINESS_DEFINITION_SNAPSHOT_PROVIDER = Symbol('BUSINESS_DEFINITION_SNAPSHOT_PROVIDER');

export type BusinessDefinitionKind = 'entity' | 'relation' | 'metric' | 'dimension';

export interface BusinessDefinitionBase {
  definitionKey: string;
  version: number;
  definitionFingerprint: string;
  sourceFingerprint: string;
}

export interface BusinessEntityDefinitionSnapshot extends BusinessDefinitionBase {
  domain: string;
  entityKey: string;
  name: string;
  aliases: string[];
  attributes: unknown;
  tableMap: unknown;
}

export interface BusinessRelationDefinitionSnapshot extends BusinessDefinitionBase {
  relationKey: string;
  fromEntityKey: string;
  toEntityKey: string;
  name: string;
  joinPath: unknown;
}

export interface BusinessMetricDefinitionSnapshot extends BusinessDefinitionBase {
  metricKey: string;
  name: string;
  aliases?: string[];
  domain: string;
  formula: unknown;
  source: unknown;
  defaultFilters: unknown;
  permissions: unknown;
  description: string;
  valueType?: 'money' | 'count' | 'percent' | 'score' | 'duration';
  allowedTaskTypes?: readonly (
    | 'query'
    | 'ranking'
    | 'recommendation'
    | 'diagnosis'
    | 'forecast'
    | 'draft'
    | 'workflow'
    | 'clarify'
  )[];
  sensitive?: boolean;
  readonly runtimeQuery?: BusinessMetricRuntimeQuery;
}

export type BusinessMetricRuntimeAggregation = 'sum' | 'count' | 'count_distinct' | 'avg' | 'ratio' | 'score';

export type BusinessMetricRuntimeExpression =
  | Readonly<{ op: 'field'; field: string }>
  | Readonly<{ op: 'constant'; value: number }>
  | Readonly<{ op: 'add'; operands: readonly BusinessMetricRuntimeExpression[] }>
  | Readonly<{
      op: 'subtract';
      left: BusinessMetricRuntimeExpression;
      right: BusinessMetricRuntimeExpression;
    }>
  | Readonly<{
      op: 'multiply';
      left: BusinessMetricRuntimeExpression;
      right: BusinessMetricRuntimeExpression;
    }>
  | Readonly<{
      op: 'divide';
      numerator: BusinessMetricRuntimeExpression;
      denominator: BusinessMetricRuntimeExpression;
      zero: 'error' | 'zero';
    }>
  | Readonly<{
      op: 'clamp';
      value: BusinessMetricRuntimeExpression;
      min: number;
      max: number;
    }>;

export interface BusinessMetricRuntimeResolver {
  readonly kind: 'domain_service';
  readonly key:
    | 'manager_staff_analysis'
    | 'manager_operations_analysis'
    | 'finance_cost_analysis'
    | 'inventory_risk_summary'
    | 'inventory_consumption_rows'
    | 'product_margin_rows'
    | 'marketing_follow_up_opportunities'
    | 'customer_retention_summary'
    | 'customer_acquisition_conversion_summary'
    | 'customer_service_feedback_summary'
    | 'customer_service_feedback_by_staff'
    | 'customer_waiting_summary'
    | 'customer_dormant_reactivation_rows';
  readonly dimensionFields: Readonly<Record<string, string>>;
  readonly expression: BusinessMetricRuntimeExpression;
  readonly overallAggregation: 'sum' | 'avg' | 'min' | 'max';
}

export interface BusinessMetricRuntimeQuery {
  readonly aggregation: BusinessMetricRuntimeAggregation;
  readonly joinPath: readonly Readonly<{
    fromModel: string;
    relationField: string;
    toModel: string;
  }>[];
  readonly dimensions: readonly string[];
  readonly filters: readonly Readonly<Record<string, unknown>>[];
  readonly capabilityKeys: readonly string[];
  readonly executorKeys: readonly string[];
  readonly outputFields: readonly string[];
  readonly sort?: Readonly<{
    outputField: string;
    direction: 'asc' | 'desc';
    missing: 'error';
  }>;
  readonly resolver?: BusinessMetricRuntimeResolver;
  readonly timePolicy: Readonly<{
    mode: 'event_time' | 'as_of_snapshot';
    field?: string;
    boundary: '[start,end)' | 'as_of';
    timezone: 'Asia/Shanghai' | 'UTC';
  }>;
  readonly storeScope: Readonly<{
    mode: 'current_store';
    anchorModel?: string;
    model: string;
    field: string;
    joinPath: readonly Readonly<{
      fromModel: string;
      relationField: string;
      toModel: string;
    }>[];
  }>;
}

export interface BusinessDimensionDefinitionSnapshot extends BusinessDefinitionBase {
  dimensionKey: string;
  name: string;
  aliases?: string[];
  domain: string;
  source: unknown;
  permissions: unknown;
}

export interface BusinessDefinitionSnapshotInput {
  entities: BusinessEntityDefinitionSnapshot[];
  relations: BusinessRelationDefinitionSnapshot[];
  metrics: BusinessMetricDefinitionSnapshot[];
  dimensions: BusinessDimensionDefinitionSnapshot[];
}

export interface PrismaRuntimeDataModelField {
  readonly name: string;
  readonly kind?: string;
  readonly type: string;
  readonly isList: boolean;
}

export interface PrismaRuntimeDataModel {
  readonly models: Readonly<
    Record<
      string,
      {
        readonly fields: readonly PrismaRuntimeDataModelField[];
      }
    >
  >;
}

export interface BusinessDefinitionSnapshotProvider {
  loadActiveDefinitions(): Promise<BusinessDefinitionSnapshotInput>;
  loadEvaluationDefinitions?(definitionVersionIds: readonly number[]): Promise<BusinessDefinitionSnapshotInput>;
  loadActiveMetricDefinitions?(): Promise<BusinessMetricDefinitionSnapshot[]>;
  getRuntimeDataModel(): PrismaRuntimeDataModel;
}

export type BusinessDefinitionRef = BrainDefinitionRef<BusinessDefinitionKind>;

export interface ProductionReadyBusinessDefinitionSnapshot extends BusinessDefinitionSnapshotInput {
  productionReady: true;
  fingerprint: string;
}

export type EntityAliasResolution =
  | {
      status: 'resolved';
      matchType: 'exact' | 'prefix' | 'fuzzy';
      entity: BusinessEntityDefinitionSnapshot;
      refs: BusinessDefinitionRef[];
    }
  | {
      status: 'ambiguity';
      matchType: 'exact' | 'prefix' | 'fuzzy';
      refs: BusinessDefinitionRef[];
    }
  | {
      status: 'not_found';
      refs: [];
    };

export interface GovernedJoinStep {
  fromEntityKey: string;
  toEntityKey: string;
  direction: 'forward' | 'reverse';
  relation: BusinessRelationDefinitionSnapshot;
  joinPath: unknown;
  ref: BusinessDefinitionRef;
}

export interface GovernedJoinPath {
  fromEntityKey: string;
  toEntityKey: string;
  hopCount: number;
  steps: GovernedJoinStep[];
  refs: BusinessDefinitionRef[];
}
import type { BrainDefinitionRef } from './brain-semantic-intent.types.js';
