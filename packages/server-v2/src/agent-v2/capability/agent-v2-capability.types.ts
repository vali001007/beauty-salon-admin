import type { AgentPersonaCode, AgentRiskLevel, AgentRole, AgentToolPlanItem } from '../../agent/agent.types.js';
import type { BusinessTask, BusinessTaskDomain, BusinessTaskOutputIntent } from '../../agent/business-task/business-task.types.js';
import type { StructuredIntent } from '../intent/agent-v2-intent.types.js';

export type AgentV2ActionIntent =
  | 'lookup'
  | 'list'
  | 'summary'
  | 'analyze'
  | 'diagnose'
  | 'recommend'
  | 'draft'
  | 'confirm_action';

export type AgentV2ExecutorType =
  | 'business_record_query'
  | 'business_metric_query'
  | 'business_trend_query'
  | 'business_detail_query'
  | 'business_action_draft'
  | 'business_query'
  | 'custom_service'
  | 'draft_tool'
  | 'workflow'
  | 'navigation';

export type AgentV2ReleaseStrategy = 'auto_publish' | 'approval_required' | 'write_blocked';

export type AgentV2StoreScope = 'required' | 'optional' | 'forbidden';

export type AgentV2CapabilitySource = 'manual_builtin' | 'auto_scan_draft' | 'eval_failure';

export type AgentV2FieldPolicy = {
  field: string;
  label: string;
  visibility: 'allow' | 'mask' | 'deny';
  reason: string;
};

export type AgentV2QueryAggregation = {
  type: 'count' | 'sum' | 'avg' | 'min' | 'max';
  field?: string;
  as?: string;
};

export type AgentV2QueryPlan = {
  dateField?: string;
  orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;
  take?: number;
  aggregation?: AgentV2QueryAggregation[];
};

export type AgentV2CapabilityManifest = {
  capabilityId: string;
  version: string;
  status: 'enabled' | 'disabled';
  source: AgentV2CapabilitySource;
  displayName: string;
  description: string;
  domain: BusinessTaskDomain;
  businessObject: string;
  personaCodes: AgentPersonaCode[];
  actions: AgentV2ActionIntent[];
  sourceModels: string[];
  sourceApis?: string[];
  eventTypes?: string[];
  outputKinds: string[];
  executor: {
    type: AgentV2ExecutorType;
    tool: string;
    queryKey?: string;
  };
  customServiceReason?: string;
  queryPlan?: AgentV2QueryPlan;
  storeScope: AgentV2StoreScope;
  permissionCodes: string[];
  fieldPolicies: AgentV2FieldPolicy[];
  riskLevel: AgentRiskLevel;
  releaseStrategy: AgentV2ReleaseStrategy;
  examples: string[];
  negativeExamples: string[];
  triggerKeywords: string[];
  boundaryNotes: string[];
};

export type AgentV2DecisionInput = {
  message: string;
  role: AgentRole;
  task?: BusinessTask;
  legacyCapabilityId?: string | null;
  excludedCapabilityIds?: string[];
};

export type AgentV2CapabilityCandidate = {
  capabilityId: string;
  score: number;
  reason: string;
};

export type AgentV2CapabilityDecision = {
  selected: AgentV2CapabilityManifest | null;
  confidence: number;
  reason: string;
  candidates: AgentV2CapabilityCandidate[];
  excluded: AgentV2CapabilityCandidate[];
  outputIntent?: BusinessTaskOutputIntent;
  toolPlan: AgentToolPlanItem[];
  boundaryWarnings: string[];
  intent?: StructuredIntent;
};
