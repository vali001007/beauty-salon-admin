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

export interface AgentAppendMessageRequest {
  message: string;
  role?: AgentRole;
  operatorId?: number | null;
  context?: Record<string, unknown>;
}

export interface AgentApprovalDecisionRequest {
  role?: AgentRole;
  operatorId?: number | null;
  comment?: string;
  args?: Record<string, unknown>;
}

export interface AgentCompileBusinessTaskRequest {
  message: string;
  role?: AgentRole;
  context?: Record<string, unknown>;
}

export interface AgentToolPlanItem {
  tool: string;
  args: Record<string, unknown>;
}

export interface BusinessTimeRange {
  preset: string;
  startDate?: string;
  endDate?: string;
  label: string;
}

export interface BusinessTask {
  taskType: string;
  domain: string;
  objective: string;
  entities: Array<{ type: string; value: string; confidence: number }>;
  metrics: string[];
  filters: Record<string, unknown>;
  timeRange?: BusinessTimeRange;
  sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  limit?: number;
  outputMode: string;
  riskLevel: AgentRiskLevel;
  requiresApproval: boolean;
  missingSlots: string[];
  confidence: number;
  actorRole?: AgentRole;
}

export interface SemanticSqlCandidate {
  status: 'allowed' | 'rejected' | 'not_candidate' | string;
  allowed: boolean;
  reason: string;
  metricKeys: string[];
  dimensions: string[];
  timeRange?: BusinessTimeRange;
  limit?: number;
  rejectedRules: string[];
  fallbackCapability?: string;
}

export interface AgentBusinessTaskValidation {
  valid: boolean;
  confidence: number;
  missingSlots: string[];
  warnings: string[];
  clarificationQuestion?: string | null;
}

export interface AgentBusinessTaskCompileResult {
  task: BusinessTask;
  preParsed: unknown;
  llmDraft: unknown;
  validation: AgentBusinessTaskValidation;
  capabilityMatches: Array<{
    capabilityId: string;
    reason: string;
    toolPlan: AgentToolPlanItem[];
  }>;
  metricMatches: Array<Record<string, unknown>>;
  semanticSqlCandidate: SemanticSqlCandidate;
}

export interface AgentPlan {
  intentType: 'query' | 'analysis_and_recommendation' | 'draft' | 'clarify';
  goal: string;
  toolPlan: AgentToolPlanItem[];
  confidence: number;
  clarificationNeeded: boolean;
  clarificationQuestion?: string | null;
  businessTask?: BusinessTask | unknown;
  capabilityPlan?: {
    capabilityId: string;
    reason: string;
  };
  semanticSqlCandidate?: SemanticSqlCandidate | unknown;
}

export interface AgentEvidence {
  source: string[];
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

export interface AgentToolCatalogItem {
  name: string;
  description: string;
  riskLevel: AgentRiskLevel;
  allowedRoles: AgentRole[];
  requiredPermissions: string[];
  requiresApproval: boolean;
  consumedSlots?: string[];
  maxRows?: number;
  timeoutMs: number;
}

export interface AgentEvalCaseResult {
  id: string;
  scenario: string;
  passed: boolean;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  errors: string[];
}

export interface AgentEvalSummary {
  total: number;
  passed: number;
  failed: number;
  results: AgentEvalCaseResult[];
}

export interface AgentRunRecord {
  id: number;
  runNo: string;
  storeId: number;
  userId?: number | null;
  deviceId?: number | null;
  role: AgentRole | string;
  entrypoint: string;
  agentCode: string;
  status: AgentRunStatus | string;
  userInput: string;
  planJson?: unknown;
  contextJson?: unknown;
  evidenceJson?: unknown;
  resultJson?: unknown;
  errorMessage?: string | null;
  startedAt?: string;
  completedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  toolCallCount?: number;
  approvalCount?: number;
}

export interface AgentMessageRecord {
  id: number;
  runId: number;
  role: 'user' | 'assistant' | 'system' | string;
  content: string;
  metadata?: unknown;
  createdAt: string;
}

export interface AgentStepRecord {
  id: number;
  runId: number;
  stepType: string;
  name: string;
  status: string;
  inputJson?: unknown;
  outputJson?: unknown;
  startedAt: string;
  endedAt?: string | null;
}

export interface AgentToolCallRecord {
  id: number;
  runId: number;
  toolName: string;
  riskLevel: AgentRiskLevel | string;
  status: string;
  argsJson: unknown;
  resultJson?: unknown;
  approvalId?: number | null;
  idempotencyKey?: string | null;
  latencyMs?: number | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface AgentApprovalRecord {
  id: number;
  runId: number;
  toolCallId?: number | null;
  status: 'pending' | 'approved' | 'rejected' | string;
  requestedBy?: number | null;
  approvedBy?: number | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  comment?: string | null;
  createdAt: string;
  decidedAt?: string | null;
}

export interface AgentApprovalListItem extends AgentApprovalRecord {
  run?: Pick<AgentRunRecord, 'id' | 'runNo' | 'userInput' | 'status' | 'role' | 'entrypoint' | 'agentCode'> | null;
  toolCall?: Pick<AgentToolCallRecord, 'id' | 'toolName' | 'riskLevel' | 'status' | 'argsJson' | 'resultJson'> | null;
}

export interface AgentRunDetail {
  run: AgentRunRecord | null;
  messages: AgentMessageRecord[];
  steps: AgentStepRecord[];
  toolCalls: AgentToolCallRecord[];
  approvals: AgentApprovalRecord[];
}

export interface AgentRunListQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  role?: string;
  entrypoint?: string;
  keyword?: string;
}

export interface AgentApprovalListQuery {
  page?: number;
  pageSize?: number;
  status?: string;
}

// ─── Persona（六大角色 Agent 配置）──────────────────────────────────────────

export type AgentPersonaCode =
  | 'manager'
  | 'marketing'
  | 'reception'
  | 'beautician'
  | 'inventory'
  | 'finance';

export interface AgentPersonaSummary {
  code: AgentPersonaCode;
  name: string;
  description: string;
  targetRoles: string[];
  toolGroups: string[];
  suggestedQuestions: string[];
}

// ─── AuraResponseBlock（与后端 agent.types.ts 保持同步）──────────────────────

export type AuraBlockAction = {
  label: string;
  actionId: string;
  riskLevel: AgentRiskLevel;
};

export type AuraResponseBlock =
  | { kind: 'text'; content: string }
  | { kind: 'kpi_card'; label: string; value: string; delta?: string; deltaType?: 'up' | 'down' | 'neutral'; unit?: string; hint?: string }
  | { kind: 'table'; columns: string[]; rows: string[][]; sortable?: boolean; caption?: string }
  | { kind: 'chart'; chartType: 'line' | 'bar' | 'pie' | 'funnel'; title: string; data: unknown; xKey?: string; yKeys?: string[] }
  | { kind: 'customer_card'; customerId: string; name: string; vipLevel?: string; lastVisit?: string; suggestion?: string; actions?: AuraBlockAction[] }
  | { kind: 'confirm_action'; title: string; preview: string; actionId: string; riskLevel: AgentRiskLevel; impactSummary?: string }
  | { kind: 'alert'; level: 'warning' | 'critical' | 'info'; message: string; actionId?: string }
  | { kind: 'follow_up_chips'; suggestions: string[] }
  | { kind: 'document_preview'; title: string; content: string; downloadable?: boolean }
  | { kind: 'evidence_panel'; sources: string[]; dateRange?: string; metricDefinition: string; limitations?: string[] };

// AgentRunResult 扩展版（含 renderedBlocks）
export interface AgentRunResultV2 extends AgentRunResult {
  renderedBlocks?: AuraResponseBlock[];
  followUpSuggestions?: string[];
  personaCode?: AgentPersonaCode;
}

// ─── Feedback ────────────────────────────────────────────────────────────────

export interface AgentFeedbackRequest {
  rating?: number;
  adopted?: boolean;
  comment?: string;
  businessActionJson?: unknown;
}

