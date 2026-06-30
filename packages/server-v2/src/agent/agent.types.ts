export type AgentRole = 'manager' | 'reception' | 'beautician';
export type AgentPersonaCode = 'manager' | 'marketing' | 'reception' | 'beautician' | 'inventory' | 'finance';
export type AgentRouteMode = 'manual' | 'context_inherit' | 'auto' | 'role_default';
export type AgentRiskLevel = 'low' | 'medium' | 'high';
export type AgentToolOutputKind =
  | 'text'
  | 'kpi'
  | 'table'
  | 'chart'
  | 'link_card'
  | 'action_card'
  | 'clarification_card'
  | 'capability_trace'
  | 'clarify'
  | 'evidence_panel'
  | 'data_gap'
  | 'permission_notice';
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
  outputKinds?: AgentToolOutputKind[];
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

export type AgentPhaseOutput = {
  phase: 'core_conclusion' | 'details' | 'recommendations' | 'action_draft';
  title: string;
  summary: string;
  blockKinds?: AuraResponseBlock['kind'][];
  actionLabels?: string[];
};

export type AgentEvidence = {
  source: string[];
  sourceTables?: string[];
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
};

export type AgentActor = {
  storeId: number;
  userId?: number;
  deviceId?: number;
  role: AgentRole;
  entrypoint: string;
  personaCode?: string;
  permissions?: string[];
  fieldScopes?: AgentFieldScopes;
};

export type AgentRouteDecision = {
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
};

// ─── 结构化输出 Block 协议（AuraResponseBlock）───────────────────────────────
// 后端 Agent 通过 structured output 返回 AuraResponseBlock[]
// 前端 BlockRenderer 按 kind 分发渲染，AI 内容与 UI 解耦

export type AuraBlockAction = {
  label: string;
  actionId: string;
  riskLevel: AgentRiskLevel;
};

export type AuraClarificationOption = {
  label: string;
  value: string;
  description?: string;
  actionId?: string;
};

export type AuraResponseBlock =
  | { kind: 'summary_text'; content: string; title?: string }
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
      kind: 'entity_resolution_badge';
      objectType: string;
      entityName: string;
      confidence?: number;
      sourceModel?: string;
      matchStrategy?: string;
      label?: string;
    }
  | {
      kind: 'capability_trace';
      title?: string;
      capabilityId?: string;
      queryTemplateId?: string;
      action?: string;
      executionPath?: string;
      schemaPath?: string[];
      confidence?: number;
      fallbackReason?: string | null;
      entity?: {
        objectType?: string;
        entityName?: string;
        entityId?: string;
        sourceModel?: string;
        confidence?: number;
      };
    }
  | {
      kind: 'link_card';
      title: string;
      description?: string;
      primaryUrl?: string;
      miniappPath?: string;
      qrCodeUrl?: string;
      statusLabel?: string;
      links?: Array<{ label: string; value: string; type?: 'url' | 'miniapp_path' | 'qr_code' | 'text' }>;
      actions?: AuraBlockAction[];
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
      kind: 'opportunity_card';
      title: string;
      summary: string;
      opportunityType: string;
      fitScore: number;
      productName: string;
      sku?: string;
      currentStock?: number;
      safetyStock?: number;
      salesQuantity?: number;
      salesAmount?: number;
      customerCount?: number;
      expiringStock?: number;
      daysToExpiry?: number | null;
      marginRateText?: string;
      reason: string;
      suggestedCampaign?: string;
      suggestedChannels?: string[];
      riskWarnings?: string[];
      actions?: AuraBlockAction[];
    }
  | {
      kind: 'copy_variants';
      title: string;
      target: string;
      offer: string;
      variants: Array<{
        label: string;
        content: string;
        tone?: string;
      }>;
      actions?: AuraBlockAction[];
    }
  | {
      kind: 'activity_draft_card';
      title: string;
      targetAudience: string;
      offerSummary: string;
      copyPreview: string;
      scheduleHint?: string;
      impactSummary?: string;
      offerCostEstimate?: Array<{
        label: string;
        value: string;
        tone?: 'default' | 'warning' | 'critical' | 'success';
      }>;
      audienceDetails?: Array<{
        label: string;
        value: string;
        description?: string;
      }>;
      editable?: boolean;
      recommendedItems?: Array<{
        name: string;
        reason?: string;
        fitScore?: number;
      }>;
      actions?: AuraBlockAction[];
    }
  | {
      kind: 'inventory_item_card';
      title: string;
      itemName: string;
      subtitle?: string;
      riskLevel?: AgentRiskLevel;
      statusLabel?: string;
      metrics: Array<{ label: string; value: string; tone?: 'default' | 'warning' | 'critical' | 'success' }>;
      reason?: string;
      actions?: AuraBlockAction[];
    }
  | {
      kind: 'supplier_purchase_card';
      title: string;
      productName: string;
      supplierName: string;
      statusLabel?: string;
      metrics: Array<{ label: string; value: string; tone?: 'default' | 'warning' | 'critical' | 'success' }>;
      reason?: string;
      actions?: AuraBlockAction[];
    }
  | {
      kind: 'clarification_card';
      title: string;
      question: string;
      options: AuraClarificationOption[];
      allowFreeText?: boolean;
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
      kind: 'action_card';
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
    }
  | {
      kind: 'data_gap';
      title: string;
      message: string;
      missingData: string[];
      nextSteps?: string[];
    }
  | {
      kind: 'permission_notice';
      title: string;
      message: string;
      allowedSummary?: string;
      actions?: AuraBlockAction[];
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
  responseMode?: 'structured_blocks' | 'composed_answer';
  personaCode?: string | null;
  routeDecision?: AgentRouteDecision;
  approval?: {
    id: number;
    toolName: string;
    riskLevel: AgentRiskLevel;
    status: string;
    reason?: string;
  };
  // 结构化渲染 blocks，前端 BlockRenderer 按 kind 渲染
  renderedBlocks?: AuraResponseBlock[];
  // Deep Path 分阶段输出，前端可按阶段追加展示
  phaseOutputs?: AgentPhaseOutput[];
  answerContract?: {
    valid: boolean;
    contract: unknown;
    missingKinds: string[];
    warnings: string[];
    errors: string[];
    checkedAt: string;
  };
  // Agent 动态生成的高价值关联问题（最多 3 个）
  followUpSuggestions?: string[];
};
