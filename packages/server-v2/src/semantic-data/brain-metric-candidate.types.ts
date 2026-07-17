import type { BusinessTaskType } from '../agent/business-task/business-task.types.js';

export type BrainMetricValueType = 'money' | 'count' | 'percent' | 'duration' | 'score';
export type BrainMetricAggregation = 'sum' | 'count' | 'count_distinct' | 'avg' | 'ratio' | 'score';

export interface BrainMetricJoinStep {
  fromModel: string;
  relationField: string;
  toModel: string;
}

export interface BrainMetricFilter {
  model: string;
  field: string;
  operator: string;
  value: unknown;
}

export interface BrainMetricPermissionPolicy {
  bindingRef: string;
  allOf: string[];
}

export type BrainMetricResolverExpression =
  | { op: 'field'; field: string }
  | { op: 'constant'; value: number }
  | { op: 'add'; operands: BrainMetricResolverExpression[] }
  | { op: 'subtract'; left: BrainMetricResolverExpression; right: BrainMetricResolverExpression }
  | { op: 'multiply'; left: BrainMetricResolverExpression; right: BrainMetricResolverExpression }
  | {
      op: 'divide';
      numerator: BrainMetricResolverExpression;
      denominator: BrainMetricResolverExpression;
      zero: 'error' | 'zero';
    }
  | { op: 'clamp'; value: BrainMetricResolverExpression; min: number; max: number };

export interface BrainMetricDomainResolver {
  kind: 'domain_service';
  key:
    | 'manager_staff_analysis'
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
  dimensionFields: Record<string, string>;
  expression: BrainMetricResolverExpression;
  overallAggregation: 'sum' | 'avg' | 'min' | 'max';
}

export interface CanonicalMetricPayload {
  metricKey: string;
  aliases?: string[];
  description: string;
  valueType: BrainMetricValueType;
  allowedTaskTypes?: BusinessTaskType[];
  sensitive?: boolean;
  measure: {
    aggregation: BrainMetricAggregation;
    model?: string;
    field?: string;
    distinctField?: string;
    resolver?: BrainMetricDomainResolver;
  };
  sourceModels: string[];
  joinPath: BrainMetricJoinStep[];
  filters: BrainMetricFilter[];
  dimensions: string[];
  timePolicy: {
    mode: 'event_time' | 'as_of_snapshot';
    field?: string;
    boundary: '[start,end)' | 'as_of';
    timezone: 'Asia/Shanghai' | 'UTC';
  };
  storeScope: {
    mode: 'current_store';
    model: string;
    field: string;
    joinPath: BrainMetricJoinStep[];
  };
  permissionPolicies: BrainMetricPermissionPolicy[];
  exceptionPolicy: {
    cancelled: string;
    refunded: string;
    gifts: string;
    fallback: string;
  };
  bindings: {
    template: string[];
    capability: string[];
    executor: string[];
    outputField: string[];
    sort?: {
      outputField: string;
      direction: 'asc' | 'desc';
      missing: 'error';
    };
  };
}

export type BrainMetricPayloadFragment = {
  [Key in keyof CanonicalMetricPayload]?: CanonicalMetricPayload[Key] extends Array<infer Item>
    ? Array<DeepPartial<Item>>
    : CanonicalMetricPayload[Key] extends object
      ? DeepPartial<CanonicalMetricPayload[Key]>
      : CanonicalMetricPayload[Key];
};

type DeepPartial<Value> =
  Value extends Array<infer Item>
    ? Array<DeepPartial<Item>>
    : Value extends object
      ? { [Key in keyof Value]?: DeepPartial<Value[Key]> }
      : Value;

export type BrainMetricSourceKind =
  | 'published_definition'
  | 'metric_declaration'
  | 'template_declaration'
  | 'legacy_metric_binding'
  | 'verified_executable_binding'
  | 'language_evidence';

export type BrainMetricSourceAuthority =
  | 'published_definition'
  | 'verified_executable_binding'
  | 'metric_template_declaration'
  | 'language_evidence';

export interface BrainMetricBindingEvidence {
  queryKey?: string;
  outputField?: string;
  permissionAllOf?: string[];
  dateField?: string;
  executorRef?: string;
}

interface BrainMetricSourceObservationBase {
  metricKey: string;
  sourcePath: string;
  sourceSymbol: string;
  aliases?: string[];
  blockedReasons?: string[];
  evidence: Record<string, unknown>;
  observationFingerprint?: string;
}

export interface BrainMetricLanguageObservation extends BrainMetricSourceObservationBase {
  sourceKind: 'language_evidence';
  authority: 'language_evidence';
  payload?: never;
  binding?: never;
}

export interface BrainMetricPublishedDefinitionObservation extends BrainMetricSourceObservationBase {
  sourceKind: 'published_definition';
  authority: 'published_definition';
  payload: CanonicalMetricPayload;
  binding?: BrainMetricBindingEvidence;
}

export interface BrainMetricExecutableObservation extends BrainMetricSourceObservationBase {
  sourceKind: 'verified_executable_binding';
  authority: 'verified_executable_binding';
  payload?: BrainMetricPayloadFragment;
  binding: BrainMetricBindingEvidence;
}

export interface BrainMetricDeclarationObservation extends BrainMetricSourceObservationBase {
  sourceKind: 'metric_declaration' | 'template_declaration' | 'legacy_metric_binding';
  authority: 'metric_template_declaration';
  payload?: BrainMetricPayloadFragment;
  binding?: BrainMetricBindingEvidence;
}

export type BrainMetricSourceObservation =
  | BrainMetricLanguageObservation
  | BrainMetricPublishedDefinitionObservation
  | BrainMetricExecutableObservation
  | BrainMetricDeclarationObservation;

export interface BrainMetricCandidateResult {
  metricKey: string;
  status: 'draft' | 'blocked';
  blockedReasons: string[];
  aliases: string[];
  observations: BrainMetricSourceObservation[];
  draftInput?: {
    definitionKey: string;
    kind: 'metric';
    domain: string;
    name: string;
    ownerType: string;
    ownerId: string;
    lifecycleStatus: 'candidate' | 'draft';
    schemaVersion: '1.0';
    payload: CanonicalMetricPayload;
    canonicalQueryRef?: string;
    fixtureSetKey?: string;
    timezone: 'Asia/Shanghai' | 'UTC';
    storeScope: CanonicalMetricPayload['storeScope'];
    evidence: Array<{
      sourceType: string;
      sourcePath: string;
      sourceSymbol: string;
      evidenceKind: string;
      confidence: number;
      conflictGroup?: string;
    }>;
  };
}

export interface BrainMetricCandidateGenerationResult {
  candidates: BrainMetricCandidateResult[];
  summary: { total: number; draft: number; blocked: number };
}

export interface BrainMetricCandidateSourceFile {
  path: string;
  content: string;
}
