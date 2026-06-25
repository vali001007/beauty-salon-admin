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

// ─── 结构化输出 Block 协议（AuraResponseBlock）───────────────────────────────
// 后端 Agent 通过 structured output 返回 AuraResponseBlock[]
// 前端 BlockRenderer 按 kind 分发渲染，AI 内容与 UI 解耦

export type AuraBlockAction = {
  label: string;
  actionId: string;
  riskLevel: AgentRiskLevel;
};

export type AuraResponseBlock =
  | { kind: 'text'; content: string }
  | {
      kind: 'kpi_card';
      label: string;
      value: string;
      delta?: string;
      deltaType?: 'up' | 'down' | 'neutral';
      unit?: string;
      hint?: string;
    }
  | {
      kind: 'table';
      columns: string[];
      rows: string[][];
      sortable?: boolean;
      caption?: string;
    }
  | {
      kind: 'chart';
      chartType: 'line' | 'bar' | 'pie' | 'funnel';
      title: string;
      data: unknown;
      xKey?: string;
      yKeys?: string[];
    }
  | {
      kind: 'customer_card';
      customerId: string;
      name: string;
      vipLevel?: string;
      lastVisit?: string;
      suggestion?: string;
      actions?: AuraBlockAction[];
    }
  | {
      kind: 'confirm_action';
      title: string;
      preview: string;
      actionId: string;
      riskLevel: AgentRiskLevel;
      impactSummary?: string;
    }
  | {
      kind: 'alert';
      level: 'warning' | 'critical' | 'info';
      message: string;
      actionId?: string;
    }
  | {
      kind: 'follow_up_chips';
      // 最多 3 个，方向：深入/扩展/行动
      suggestions: string[];
    }
  | {
      kind: 'document_preview';
      title: string;
      content: string;
      downloadable?: boolean;
    }
  | {
      kind: 'evidence_panel';
      sources: string[];
      dateRange?: string;
      metricDefinition: string;
      limitations?: string[];
    };

// ─────────────────────────────────────────────────────────────────────────────

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
  // 结构化渲染 blocks，前端 BlockRenderer 按 kind 渲染
  renderedBlocks?: AuraResponseBlock[];
  // Agent 动态生成的高价值关联问题（最多 3 个）
  followUpSuggestions?: string[];
};
