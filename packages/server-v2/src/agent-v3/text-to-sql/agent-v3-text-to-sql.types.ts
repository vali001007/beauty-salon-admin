export type agentV3TextToSqlRunStatus = 'success' | 'no_data' | 'blocked' | 'failed' | 'dry_run';

export type AgentV3TextToSqlExecutionMode = 'dry_run' | 'execute';

export type AgentV3TextToSqlFieldPolicy = 'allow' | 'mask' | 'deny';

export type AgentV3TextToSqlField = {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  description: string;
  policy: AgentV3TextToSqlFieldPolicy;
  roles?: Array<'dimension' | 'measure' | 'time' | 'filter'>;
};

export type AgentV3SemanticViewStatus = 'enabled' | 'planned' | 'disabled';

export type AgentV3SemanticView = {
  id: string;
  viewName: string;
  domain: string;
  description: string;
  status: AgentV3SemanticViewStatus;
  batch: 'P0' | 'P1' | 'P2';
  adminOnly?: boolean;
  requiredPermissions: string[];
  storeScopeField?: string;
  defaultTimeField?: string;
  fields: AgentV3TextToSqlField[];
  sampleQuestions: string[];
};

export type AgentV3TextToSqlRequest = {
  question: string;
  userId?: number;
  storeIds: number[];
  roleCodes: string[];
  permissions: string[];
  fieldScopes?: Record<string, unknown>;
  runtimeContext?: Record<string, unknown>;
  mode?: AgentV3TextToSqlExecutionMode;
};

export type AgentV3TextToSqlIntent = {
  domain: string;
  type: 'record' | 'detail' | 'metric' | 'ranking' | 'trend' | 'compare' | 'diagnose' | 'unknown';
  metric?: string;
  timeRange?: {
    label: string;
    startAt?: string;
    endAt?: string;
  };
};

export type AgentV3QueryIntentRisk =
  | 'ambiguous_entity'
  | 'ambiguous_metric'
  | 'no_view'
  | 'permission_risk'
  | 'sensitive_data'
  | 'cross_store'
  | 'low_confidence';

export type AgentV3QueryIntent = {
  originalQuestion: string;
  normalizedQuestion: string;
  domain: string;
  entity: {
    type: string;
    canonicalName: string;
    aliases: string[];
    confidence: number;
  };
  metric: {
    type: 'amount' | 'count' | 'quantity' | 'rate' | 'trend' | 'ranking' | 'status' | 'unknown';
    canonicalName: string;
    fieldCandidates: string[];
    sortDirection?: 'asc' | 'desc';
    confidence: number;
  };
  timeRange: {
    preset?: string;
    confidence: number;
  };
  shape: 'metric' | 'ranking' | 'trend' | 'comparison' | 'list' | 'detail' | 'unknown';
  selectedView?: string;
  expectedFields: string[];
  forbiddenFields: string[];
  selectedViewCandidates: Array<{
    viewName: string;
    score: number;
    reasons: string[];
  }>;
  risks: AgentV3QueryIntentRisk[];
  source: 'v3_kg_local_fixture' | 'v3_kg_snapshot' | 'llm_kg_constrained';
};

export type AgentV3TextToSqlPlan = {
  status: 'planned' | 'unable_to_plan';
  intent: AgentV3TextToSqlIntent;
  queryIntent?: AgentV3QueryIntent;
  selectedViews: string[];
  generatedSql?: string;
  parameters: Record<string, unknown>;
  explanation: string;
  reasonCode?: string;
};

export type AgentV3ParsedSelectSql = {
  statementType: 'select';
  columns: string[];
  referencedColumns?: string[];
  sourceViews: string[];
  functions: string[];
  hasWildcard: boolean;
  hasLimit: boolean;
  limit?: number;
  hasWhere: boolean;
  hasGroupBy: boolean;
  hasOrderBy: boolean;
  tokens: string[];
};

export type AgentV3SqlGuardResult =
  | {
      status: 'pass';
      safeSql: string;
      redactedSql: string;
      params: Record<string, unknown>;
      selectedViews: AgentV3SemanticView[];
      parsed: AgentV3ParsedSelectSql;
      appliedPolicies: string[];
    }
  | {
      status: 'blocked';
      reasonCode: string;
      message: string;
      redactedSql?: string;
      parsed?: AgentV3ParsedSelectSql;
      appliedPolicies: string[];
    };

export type AgentV3SqlCostGuardResult =
  | {
      status: 'pass';
      estimatedCost?: number | null;
      checkedBy: 'static' | 'explain' | 'static_without_readonly_connection';
      appliedPolicies: string[];
    }
  | {
      status: 'blocked';
      reasonCode: string;
      message: string;
      estimatedCost?: number | null;
      appliedPolicies: string[];
    };

export type AgentV3AnswerRelevanceGuardResult =
  | {
      status: 'pass';
      appliedPolicies: string[];
    }
  | {
      status: 'blocked';
      reasonCode: string;
      message: string;
      appliedPolicies: string[];
    };

export type AgentV3TextToSqlEvidence = {
  sourceViews: string[];
  dateRange?: string;
  storeScope: string;
  fieldPolicies: Array<{ field: string; policy: AgentV3TextToSqlFieldPolicy }>;
  limitations: string[];
};

export type AgentV3TextToSqlTrace = {
  planner: AgentV3TextToSqlPlan;
  guard: AgentV3SqlGuardResult;
  relevanceGuard?: AgentV3AnswerRelevanceGuardResult;
  costGuard?: AgentV3SqlCostGuardResult;
  executionMode: AgentV3TextToSqlExecutionMode;
  executionMs?: number;
  rowCount?: number;
};

export type AgentV3TextToSqlExecutionResult = {
  status: agentV3TextToSqlRunStatus;
  rows: Array<Record<string, unknown>>;
  executionMs: number;
  blockedReason?: string;
  errorMessage?: string;
};

export type AgentV3TextToSqlResult = {
  status: agentV3TextToSqlRunStatus;
  answer?: string;
  rows: Array<Record<string, unknown>>;
  evidence: AgentV3TextToSqlEvidence;
  queryTrace: AgentV3TextToSqlTrace;
  auditRunId?: string;
  blockedReason?: string;
};

export type AgentV3TextToSqlCandidate = {
  clusterKey: string;
  normalizedIntent?: Record<string, unknown>;
  selectedViews: string[];
  safeSqlHash?: string | null;
  generatedSqlHash?: string | null;
  sampleQuestions: string[];
  hitCount: number;
  successCount: number;
  blockedCount: number;
  failedCount: number;
  usefulFeedbackCount: number;
  feedbackCount: number;
  successRate: number;
  blockedRate: number;
  feedbackUsefulRate: number | null;
  riskLevel: 'low' | 'medium' | 'high';
  status: 'candidate' | 'blocked_report';
  reason: string;
  suggestedCapabilityId: string;
  displayName: string;
};
