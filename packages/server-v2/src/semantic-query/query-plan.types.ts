import type { AgentRole } from '../agent/agent.types.js';
import type { BusinessTask, BusinessTimeRange } from '../agent/business-task/business-task.types.js';
import type { BusinessMetricRuntimeQuery } from '../brain/cognition/business-definition-snapshot.types.js';

export type SemanticQueryAggregation = 'sum' | 'count' | 'count_distinct' | 'avg' | 'max' | 'min' | 'ratio' | 'score';
export type SemanticQueryOutputShape = 'summary' | 'list' | 'table' | 'trend' | 'comparison';
export type SemanticQueryStatus = 'success' | 'no_data' | 'unsupported' | 'rejected' | 'failed';

export type SemanticQueryActorContext = Readonly<{
  principalType: 'user';
  userId: number;
  storeId: number;
  role: AgentRole;
  permissions: readonly string[];
  beauticianId?: number;
}>;

export type SemanticQueryPlan = {
  queryId: string;
  capabilityId: string;
  templateId?: string;
  taskId: string;
  originalQuestion: string;
  taskType: BusinessTask['taskType'];
  role: AgentRole;
  actor: SemanticQueryActorContext;
  storeScope: {
    storeIds: number[];
    scopeType: 'current_store' | 'authorized_stores';
  };
  metrics: SemanticQueryMetricPlan[];
  dimensions: string[];
  dimensionBindings: readonly SemanticQueryDimensionBinding[];
  selfScope?: Readonly<{ dimensionKey: 'beauticianId'; value: number }>;
  filters: Record<string, unknown>;
  timeRange: BusinessTimeRange;
  orderBy: Array<{ key: string; direction: 'asc' | 'desc' }>;
  limit: number;
  outputShape: SemanticQueryOutputShape;
  riskLevel: 'low' | 'medium' | 'high';
};

export type SemanticQueryMetricPlan = Readonly<{
  key: string;
  aggregation: SemanticQueryAggregation;
  runtimeBinding: Readonly<{
    definitionKey: string;
    version: number;
    definitionFingerprint: string;
    sourceFingerprint: string;
    name: string;
    description: string;
    permissions: readonly string[];
    allowedTaskTypes: readonly string[];
    sensitive: boolean;
    formula: unknown;
    sourceDefinition: unknown;
    runtimeQuery: BusinessMetricRuntimeQuery;
  }>;
}>;

export type SemanticQueryDimensionBinding = Readonly<{
  key: string;
  name: string;
  model: string;
  field: string;
  sensitive: boolean;
}>;

export type SemanticQueryPlanInput = {
  task: BusinessTask;
  actor?: SemanticQueryActorContext;
  role?: AgentRole;
  storeId?: number;
  operatorId?: number;
  capabilityId?: string;
};

export type SemanticQueryEvidence = {
  source: string[];
  sourceTables?: string[];
  dateRange?: string;
  metricDefinition: string;
  filters: string[];
  sampleSize?: number;
  limitations?: string[];
  auditId?: string;
  sqlFingerprint?: string;
};

export type SemanticQueryResult = {
  status: SemanticQueryStatus;
  queryId: string;
  capabilityId: string;
  title: string;
  summary: string;
  rows: Array<Record<string, unknown>>;
  kpis?: Array<{ label: string; value: string; hint?: string }>;
  actions: Array<{ label: string; action: string; riskLevel: 'low' | 'medium' | 'high' }>;
  userEvidence?: {
    dateRange?: string;
    dataSummary?: string;
  };
  auditEvidence: SemanticQueryEvidence;
  rejectedReason?: string;
};
