export type BusinessDefinitionKind =
  | 'entity'
  | 'field'
  | 'relation'
  | 'metric'
  | 'dimension'
  | 'status_dictionary'
  | 'time_policy'
  | 'query_definition';

export type BusinessDefinitionStatus = 'active' | 'archived';
export type BusinessDefinitionLifecycleStatus = 'candidate' | 'draft' | 'validated' | 'published';
export type BusinessDefinitionValidationStatus = 'pending' | 'passed' | 'failed';

export interface BusinessDefinitionListQuery {
  kind?: BusinessDefinitionKind;
  domain?: string;
  status?: BusinessDefinitionStatus;
  page?: number;
  pageSize?: number;
}

export interface BusinessDefinitionEvidence {
  id: number;
  versionId: number;
  sourceType: string;
  sourcePath: string;
  sourceSymbol?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  evidenceKind: string;
  evidenceFingerprint: string;
  confidence: number;
  conflictGroup?: string | null;
  createdAt: string;
}

export interface BusinessDefinitionProjection {
  id?: number;
  definitionVersionId: number;
  targetType: string;
  targetKey: string;
  definitionKey: string;
  definitionVersion: number;
  definitionFingerprint: string;
  sourceFingerprint: string;
  payload: Record<string, unknown>;
  projectionFingerprint: string;
  generatedAt: string;
  readOnly: boolean;
}

export interface CanonicalMetricPayload {
  [key: string]: unknown;
  metricKey: string;
  description: string;
  valueType: 'money' | 'count' | 'percent' | 'duration' | 'score';
  measure: {
    aggregation: 'sum' | 'count' | 'count_distinct' | 'avg' | 'ratio' | 'score';
    model: string;
    field?: string;
    distinctField?: string;
  };
  sourceModels: string[];
  joinPath: Array<{ fromModel: string; relationField: string; toModel: string }>;
  filters: Array<{ model: string; field: string; operator: string; value: unknown }>;
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
    joinPath: Array<{ fromModel: string; relationField: string; toModel: string }>;
  };
  permissionPolicies: Array<{ bindingRef: string; allOf: string[] }>;
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
  };
}

export interface BusinessDefinitionVersion {
  id: number;
  definitionId: number;
  version: number;
  schemaVersion: string;
  payload: Record<string, unknown>;
  lifecycleStatus: BusinessDefinitionLifecycleStatus;
  fingerprint: string;
  sourceFingerprint: string;
  validationStatus: BusinessDefinitionValidationStatus;
  validationReport?: Record<string, unknown> | null;
  canonicalQueryRef?: string | null;
  fixtureSetKey?: string | null;
  timezone: string;
  storeScope: Record<string, unknown>;
  createdBy: number;
  validatedBy?: number | null;
  validatedAt?: string | null;
  publishedBy?: number | null;
  publishedAt?: string | null;
  createdAt: string;
  evidence: BusinessDefinitionEvidence[];
  projections: BusinessDefinitionProjection[];
  definition?: {
    id: number;
    definitionKey: string;
    kind: BusinessDefinitionKind;
    domain: string;
    name: string;
    ownerType: string;
    ownerId?: string | null;
    currentPublishedVersion?: { id: number; version: number } | null;
  };
}

export type BusinessDefinitionListVersion = Omit<BusinessDefinitionVersion, 'definition' | 'evidence'>;

export interface BusinessDefinitionListItem {
  id: number;
  definitionKey: string;
  kind: BusinessDefinitionKind;
  domain: string;
  name: string;
  ownerType: string;
  ownerId?: string | null;
  status: BusinessDefinitionStatus;
  currentPublishedVersionId?: number | null;
  createdAt: string;
  updatedAt: string;
  currentPublishedVersion?: BusinessDefinitionListVersion | null;
}

export interface BusinessDefinitionDetail extends Omit<BusinessDefinitionListItem, 'currentPublishedVersion'> {
  currentPublishedVersion?: BusinessDefinitionVersion | null;
  versions: BusinessDefinitionVersion[];
}

export interface BusinessDefinitionListResult {
  items: BusinessDefinitionListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ValidateBusinessDefinitionVersionInput {
  reason?: string;
}

export interface PublishBusinessDefinitionVersionInput {
  expectedCurrentVersionId?: number;
}
