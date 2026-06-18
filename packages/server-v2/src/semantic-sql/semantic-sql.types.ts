import type { AgentRole } from '../agent/agent.types.js';
import type { BusinessTask, BusinessTimeRange } from '../agent/business-task/business-task.types.js';

export type SemanticSqlDecisionStatus = 'allowed' | 'rejected' | 'not_candidate';

export type SemanticSqlCandidate = {
  status: SemanticSqlDecisionStatus;
  allowed: boolean;
  reason: string;
  metricKeys: string[];
  dimensions: string[];
  timeRange?: BusinessTimeRange;
  limit?: number;
  rejectedRules: string[];
  fallbackCapability?: string;
};

export type SemanticSqlDecisionInput = {
  task: BusinessTask;
  role?: AgentRole;
  p1BetaEnabled?: boolean;
};

export type SemanticSqlRequest = {
  taskId: string;
  storeId: number;
  actorRole: AgentRole;
  metricKeys: string[];
  dimensions: string[];
  filters: Record<string, unknown>;
  timeRange?: BusinessTimeRange;
  orderBy?: Array<{ metric: string; direction: 'asc' | 'desc' }>;
  limit: number;
};

export type SemanticSqlResult = {
  status: 'success' | 'no_data' | 'rejected';
  rows: Record<string, unknown>[];
  sqlFingerprint: string;
  evidence?: {
    source: string[];
    dateRange?: string;
    metricDefinition: string;
    filters: string[];
    sampleSize?: number;
    limitations?: string[];
  };
  rejectedReason?: string;
  auditId: string;
};
