import type { AgentRiskLevel, AuraResponseBlock } from './blocks';
import type { AgentPersonaCode, AgentRole } from './persona';

export type AgentRunStatus = 'created' | 'planning' | 'validating' | 'running_tool' | 'waiting_approval' | 'composing' | 'completed' | 'failed' | 'cancelled';

export interface AgentEvidence {
  source: string[];
  sourceTables?: string[];
  dateRange?: string;
  metricDefinition: string;
  filters: string[];
  sampleSize?: number;
  limitations?: string[];
}

export interface AgentSuggestedAction {
  label: string;
  action: string;
  riskLevel: AgentRiskLevel;
  payload?: unknown;
}

export interface AgentToolResult {
  status: 'success' | 'no_data' | 'unsupported' | 'failed';
  title: string;
  summary: string;
  data?: unknown;
  evidence?: AgentEvidence;
  actions?: AgentSuggestedAction[];
}

export interface AgentToolPlanItem {
  tool: string;
  args: Record<string, unknown>;
}

export interface AgentPlan {
  intentType: 'query' | 'analysis_and_recommendation' | 'draft' | 'clarify';
  goal: string;
  toolPlan: AgentToolPlanItem[];
  confidence: number;
  clarificationNeeded: boolean;
  clarificationQuestion?: string | null;
  executionPath?: 'fast' | 'deep';
  progressNotice?: string;
  businessTask?: unknown;
  capabilityPlan?: {
    capabilityId: string;
    reason: string;
  };
  skillPlan?: {
    skillId: string;
    capabilityId?: string;
    confidence: number;
    reason: string;
    outputContract?: unknown;
  };
  outputContract?: unknown;
  semanticSqlCandidate?: unknown;
}

export type AgentRouteMode = 'manual' | 'context_inherit' | 'auto' | 'role_default';

export interface AgentRouteDecision {
  personaCode: AgentPersonaCode;
  confidence: number;
  reason: string;
  candidates: Array<{
    personaCode: string;
    score: number;
    matchedCapabilities: string[];
  }>;
  clarificationNeeded: boolean;
  clarificationQuestion?: string | null;
  deniedReason?: string | null;
  mode: AgentRouteMode;
  routeChanged?: boolean;
}

export interface AgentApprovalSummary {
  id: number;
  toolName: string;
  riskLevel: AgentRiskLevel;
  status: string;
  reason?: string;
}

export interface AgentRunResultV2 {
  runId: number;
  runNo: string;
  status: AgentRunStatus;
  plan?: AgentPlan;
  answer: string;
  toolResults: AgentToolResult[];
  actions: AgentSuggestedAction[];
  evidence?: AgentEvidence;
  responseMode?: 'structured_blocks' | 'composed_answer';
  approval?: AgentApprovalSummary;
  renderedBlocks?: AuraResponseBlock[];
  answerContract?: {
    valid: boolean;
    contract: unknown;
    missingKinds: string[];
    warnings: string[];
    errors: string[];
    checkedAt: string;
  };
  followUpSuggestions?: string[];
  personaCode?: AgentPersonaCode | string | null;
  routeDecision?: AgentRouteDecision;
}

export interface AgentCreateRunRequest {
  message: string;
  role?: AgentRole;
  entrypoint?: string;
  personaCode?: AgentPersonaCode | string;
  operatorId?: number | null;
  context?: Record<string, unknown>;
}

export interface AgentAppendMessageRequest {
  message: string;
  role?: AgentRole;
  entrypoint?: string;
  personaCode?: AgentPersonaCode | string;
  operatorId?: number | null;
  context?: Record<string, unknown>;
}

export interface AgentFeedbackRequest {
  rating?: number;
  adopted?: boolean;
  comment?: string;
  businessActionJson?: unknown;
}
