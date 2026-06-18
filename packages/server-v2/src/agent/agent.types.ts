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

export type AgentToolExecutionContext = {
  runId: number;
  storeId: number;
  userId?: number;
  deviceId?: number;
  role: AgentRole;
};

export type AgentFieldScopeValue = 'visible' | 'masked' | 'hidden' | string;
export type AgentFieldScopes = Record<string, AgentFieldScopeValue>;

export type AgentToolDefinition = {
  name: string;
  description: string;
  riskLevel: AgentRiskLevel;
  allowedRoles: AgentRole[];
  requiredPermissions: string[];
  requiresApproval: boolean;
  consumedSlots?: string[];
  maxRows?: number;
  timeoutMs: number;
  execute: (args: Record<string, unknown>, context: AgentToolExecutionContext) => Promise<AgentToolResult>;
};

export type AgentToolResult = {
  status: 'success' | 'no_data' | 'unsupported' | 'failed';
  title: string;
  summary: string;
  data?: unknown;
  evidence?: AgentEvidence;
  actions?: AgentSuggestedAction[];
};

export type AgentSuggestedAction = {
  label: string;
  action: string;
  riskLevel: AgentRiskLevel;
};

export type AgentEvidence = {
  source: string[];
  dateRange?: string;
  metricDefinition: string;
  filters: string[];
  sampleSize?: number;
  limitations?: string[];
};

export type AgentToolPlanItem = {
  tool: string;
  args: Record<string, unknown>;
};

export type AgentPlan = {
  intentType: 'query' | 'analysis_and_recommendation' | 'draft' | 'clarify';
  goal: string;
  toolPlan: AgentToolPlanItem[];
  confidence: number;
  clarificationNeeded: boolean;
  clarificationQuestion?: string | null;
  businessTask?: unknown;
  capabilityPlan?: {
    capabilityId: string;
    reason: string;
  };
  semanticSqlCandidate?: unknown;
};

export type AgentActor = {
  storeId: number;
  userId?: number;
  deviceId?: number;
  role: AgentRole;
  entrypoint: string;
  permissions?: string[];
  fieldScopes?: AgentFieldScopes;
};

export type AgentRunResult = {
  runId: number;
  runNo: string;
  status: AgentRunStatus;
  plan?: AgentPlan;
  answer: string;
  toolResults: AgentToolResult[];
  actions: AgentSuggestedAction[];
  evidence?: AgentEvidence;
  approval?: {
    id: number;
    toolName: string;
    riskLevel: AgentRiskLevel;
    status: string;
  };
};
