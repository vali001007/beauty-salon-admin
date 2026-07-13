import type { AgentActor, AgentRiskLevel, AuraResponseBlock } from '../agent/agent.types.js';

export const AGENT_V5_CODE = 'agent_v5';
export const AGENT_V5_ARCHITECTURE = 'agent_v5_business_ontology_agent';

export type AgentV5Intent =
  | 'business_overview'
  | 'readonly_query'
  | 'lifecycle_diagnosis'
  | 'business_plan'
  | 'submit_business_plan'
  | 'attribution_review'
  | 'quality_review'
  | 'reception_lookup'
  | 'cashier_reconciliation'
  | 'beautician_service'
  | 'inventory_risk'
  | 'finance_margin'
  | 'reservation_coordination'
  | 'staff_performance'
  | 'marketing_growth'
  | 'failure_diagnosis'
  | 'clarify';

export type AgentV5RiskLevel = 'read' | 'draft' | 'approval_required' | 'blocked';
export type AgentV5AmbiguityType = 'domain' | 'entity' | 'metric' | 'time_range' | 'scope' | 'action' | 'multi_intent';

export type AgentV5RouteEntity = {
  type: string;
  id?: string | number;
  name?: string;
  confidence: number;
  source?: 'message' | 'memory' | 'context' | 'resolver';
};

export type AgentV5RouteAmbiguity = {
  type: AgentV5AmbiguityType;
  candidates: string[];
  question: string;
};

export type AgentV5ClarificationTrace = {
  runId: number;
  messageId?: number;
  ambiguityType: AgentV5AmbiguityType;
  candidates: string[];
  question: string;
  selectedValue?: string;
  resolved: boolean;
  adapterBefore?: string[];
  adapterAfter?: string[];
};

export type AgentV5MemoryItem = {
  key: string;
  value: string;
  entityType?: string;
  entityId?: string | number;
  sourceMessageId?: number;
  source?: 'message' | 'explicit_user_choice' | 'repeated_behavior' | 'admin_setting' | 'business_context' | 'governance';
  confidence?: number;
  expiresAt?: string;
};

export type AgentV5MemorySnapshot = {
  working: AgentV5MemoryItem[];
  preferences: AgentV5MemoryItem[];
  businessContext: AgentV5MemoryItem[];
  governance: Array<{
    issueType: string;
    count: number;
    lastOccurredAt: string;
    suggestedFix: string;
  }>;
};

export type AgentV5RouteDecision = {
  intent: AgentV5Intent;
  domains: string[];
  concepts: string[];
  entities: AgentV5RouteEntity[];
  capabilityCandidates: string[];
  adapterCandidates: string[];
  confidence: number;
  riskLevel: AgentV5RiskLevel;
  missingSlots: string[];
  ambiguity?: AgentV5RouteAmbiguity;
  fallbackPolicy: 'ask_clarification' | 'readonly_query' | 'domain_summary' | 'blocked';
  reason: string;
};

export type AgentV5EvidenceFact = {
  source: string;
  id?: string | number;
  label: string;
  value?: string | number;
  occurredAt?: string;
};

export type AgentV5EvidencePack = {
  sources: string[];
  domains: string[];
  concepts: string[];
  entities: Array<{ type: string; id?: string | number; name?: string }>;
  filters: string[];
  sampleSize: number;
  metrics: Record<string, string | number>;
  facts: AgentV5EvidenceFact[];
  risks: string[];
  limitations: string[];
  quality: Record<string, string | number | null>;
  memoryUsed?: AgentV5MemoryItem[];
  clarification?: AgentV5ClarificationTrace;
};

export type AgentV5AdapterResult = {
  status: 'success' | 'no_data' | 'blocked' | 'failed' | 'draft';
  title: string;
  summary: string;
  data?: unknown;
  evidence?: Partial<AgentV5EvidencePack>;
  renderedBlocks?: AuraResponseBlock[];
  actions?: Array<{ label: string; action: string; riskLevel: AgentRiskLevel }>;
  failureReason?: string;
};

export type AgentV5ConstraintResult = {
  decision: 'allow' | 'draft_only' | 'approval_required' | 'blocked';
  risks: string[];
  blockedActions: string[];
  limitations: string[];
};

export type AgentV5FailureCode =
  | 'ontology_route_gap'
  | 'capability_not_published'
  | 'readonly_query_blocked'
  | 'permission_denied'
  | 'data_not_found'
  | 'tool_not_supported'
  | 'tool_execution_failed'
  | 'missing_required_slot'
  | 'quality_insufficient'
  | 'high_risk_action_blocked';

export type AgentV5FailureDiagnosis = {
  code: AgentV5FailureCode;
  message: string;
  recoverable: boolean;
  nextSteps: string[];
};

export type AgentV5VerticalAdapterInput = {
  runId: number;
  message: string;
  actor: AgentActor;
  context?: Record<string, unknown>;
  route: AgentV5RouteDecision;
  memory: AgentV5MemorySnapshot;
};

export type AgentV5VerticalAdapter = {
  adapterCode: string;
  execute(input: AgentV5VerticalAdapterInput): Promise<AgentV5AdapterResult>;
};
