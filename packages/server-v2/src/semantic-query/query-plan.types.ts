import type { AgentRole } from '../agent/agent.types.js';
import type { BusinessTask, BusinessTimeRange } from '../agent/business-task/business-task.types.js';

export type SemanticQueryAggregation = 'sum' | 'count' | 'avg' | 'max' | 'min' | 'ratio' | 'score';
export type SemanticQueryOutputShape = 'summary' | 'list' | 'table' | 'trend' | 'comparison';
export type SemanticQueryStatus = 'success' | 'no_data' | 'unsupported' | 'rejected' | 'failed';

export type SemanticQueryPlan = {
  queryId: string;
  capabilityId: string;
  taskId: string;
  originalQuestion: string;
  role: AgentRole;
  storeScope: {
    storeIds: number[];
    scopeType: 'current_store' | 'authorized_stores';
  };
  metrics: Array<{ key: string; aggregation: SemanticQueryAggregation }>;
  dimensions: string[];
  filters: Record<string, unknown>;
  timeRange: BusinessTimeRange;
  orderBy: Array<{ key: string; direction: 'asc' | 'desc' }>;
  limit: number;
  outputShape: SemanticQueryOutputShape;
  riskLevel: 'low' | 'medium' | 'high';
};

export type SemanticQueryPlanInput = {
  task: BusinessTask;
  role: AgentRole;
  storeId: number;
  operatorId?: number;
  capabilityId?: string;
};

export type SemanticQueryEvidence = {
  source: string[];
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
