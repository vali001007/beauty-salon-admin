export type AgentRole = 'manager' | 'reception' | 'beautician';

export type AgentRiskLevel = 'low' | 'medium' | 'high';

export type AgentRunStatus =
  | 'created'
  | 'planning'
  | 'validating'
  | 'running_tool'
  | 'waiting_approval'
  | 'composing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentCreateRunRequest {
  message: string;
  role?: AgentRole;
  entrypoint?: string;
  operatorId?: number | null;
  context?: Record<string, unknown>;
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
}

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
}

export interface AgentToolResult {
  status: 'success' | 'no_data' | 'unsupported' | 'failed';
  title: string;
  summary: string;
  data?: unknown;
  evidence?: AgentEvidence;
  actions?: AgentSuggestedAction[];
}

export interface AgentApprovalSummary {
  id: number;
  toolName: string;
  riskLevel: AgentRiskLevel;
  status: string;
  reason?: string;
}

export interface AgentRunResult {
  runId: number;
  runNo: string;
  status: AgentRunStatus;
  plan?: AgentPlan;
  answer: string;
  toolResults: AgentToolResult[];
  actions: AgentSuggestedAction[];
  evidence?: AgentEvidence;
  approval?: AgentApprovalSummary;
}
