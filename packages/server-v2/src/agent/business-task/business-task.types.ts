import type { AgentRiskLevel, AgentRole, AgentToolPlanItem } from '../agent.types.js';

export type BusinessTaskType =
  | 'query'
  | 'ranking'
  | 'recommendation'
  | 'diagnosis'
  | 'forecast'
  | 'draft'
  | 'workflow'
  | 'clarify';

export type BusinessTaskDomain =
  | 'business'
  | 'customer'
  | 'product'
  | 'project'
  | 'reservation'
  | 'schedule'
  | 'order'
  | 'card'
  | 'memberCard'
  | 'inventory'
  | 'supplyChain'
  | 'finance'
  | 'marketing'
  | 'promotion'
  | 'automation'
  | 'staff'
  | 'serviceQuality'
  | 'customerApp'
  | 'channel'
  | 'terminal'
  | 'store'
  | 'afterSales'
  | 'unknown';

export type BusinessTaskOutputMode = 'summary' | 'ranked_list' | 'table' | 'card' | 'draft' | 'workflow';

export type BusinessTimeRange = {
  preset:
    | 'today'
    | 'yesterday'
    | 'this_week'
    | 'next_week'
    | 'this_month'
    | 'last_7_days'
    | 'last_30_days'
    | 'next_30_days'
    | 'custom';
  startDate?: string;
  endDate?: string;
  label: string;
};

export type BusinessEntityRef = {
  type: BusinessTaskDomain | 'customer_segment' | 'metric';
  value: string;
  confidence: number;
};

export type BusinessSort = {
  field: string;
  direction: 'asc' | 'desc';
};

export type BusinessTask = {
  taskType: BusinessTaskType;
  domain: BusinessTaskDomain;
  objective: string;
  entities: BusinessEntityRef[];
  metrics: string[];
  filters: Record<string, unknown>;
  timeRange?: BusinessTimeRange;
  sort?: BusinessSort[];
  limit?: number;
  outputMode: BusinessTaskOutputMode;
  riskLevel: AgentRiskLevel;
  requiresApproval: boolean;
  missingSlots: string[];
  confidence: number;
  actorRole?: AgentRole;
};

export type BusinessTaskPreparseResult = {
  task: BusinessTask;
  deterministicSlots: {
    domainMatched: boolean;
    taskTypeMatched: boolean;
    limitMatched: boolean;
    timeRangeMatched: boolean;
    metricMatched: boolean;
  };
  warnings: string[];
};

export type BusinessCapabilityPlan = {
  capabilityId: string;
  reason: string;
  toolPlan: AgentToolPlanItem[];
};
