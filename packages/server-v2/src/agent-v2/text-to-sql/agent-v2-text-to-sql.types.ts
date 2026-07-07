export type AgentV2TextToSqlRunStatus = 'success' | 'no_data' | 'blocked' | 'failed' | 'dry_run';

export type AgentV2TextToSqlExecutionMode = 'dry_run' | 'execute';

export type AgentV2TextToSqlFieldPolicy = 'allow' | 'mask' | 'deny';

export type AgentV2TextToSqlField = {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  description: string;
  policy: AgentV2TextToSqlFieldPolicy;
  roles?: Array<'dimension' | 'measure' | 'time' | 'filter'>;
};

export type AgentV2SemanticViewStatus = 'enabled' | 'planned' | 'disabled';

export type AgentV2SemanticView = {
  id: string;
  viewName: string;
  domain: string;
  description: string;
  status: AgentV2SemanticViewStatus;
  batch: 'P0' | 'P1' | 'P2';
  adminOnly?: boolean;
  requiredPermissions: string[];
  storeScopeField?: string;
  defaultTimeField?: string;
  fields: AgentV2TextToSqlField[];
  sampleQuestions: string[];
};

export type AgentV2TextToSqlRequest = {
  question: string;
  userId?: number;
  storeIds: number[];
  roleCodes: string[];
  permissions: string[];
  fieldScopes?: Record<string, unknown>;
  runtimeContext?: Record<string, unknown>;
  mode?: AgentV2TextToSqlExecutionMode;
};

export type AgentV2TextToSqlIntent = {
  domain: string;
  type: 'record' | 'detail' | 'metric' | 'ranking' | 'trend' | 'compare' | 'diagnose' | 'unknown';
  metric?: string;
  timeRange?: {
    label: string;
    startAt?: string;
    endAt?: string;
  };
};

export type AgentV2TextToSqlPlan = {
  status: 'planned' | 'unable_to_plan';
  intent: AgentV2TextToSqlIntent;
  selectedViews: string[];
  generatedSql?: string;
  parameters: Record<string, unknown>;
  explanation: string;
  reasonCode?: string;
};

export type AgentV2ParsedSelectSql = {
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

export type AgentV2SqlGuardResult =
  | {
      status: 'pass';
      safeSql: string;
      redactedSql: string;
      params: Record<string, unknown>;
      selectedViews: AgentV2SemanticView[];
      parsed: AgentV2ParsedSelectSql;
      appliedPolicies: string[];
    }
  | {
      status: 'blocked';
      reasonCode: string;
      message: string;
      redactedSql?: string;
      parsed?: AgentV2ParsedSelectSql;
      appliedPolicies: string[];
    };

export type AgentV2SqlCostGuardResult =
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

export type AgentV2TextToSqlEvidence = {
  sourceViews: string[];
  dateRange?: string;
  storeScope: string;
  fieldPolicies: Array<{ field: string; policy: AgentV2TextToSqlFieldPolicy }>;
  limitations: string[];
};

export type AgentV2TextToSqlTrace = {
  planner: AgentV2TextToSqlPlan;
  guard: AgentV2SqlGuardResult;
  costGuard?: AgentV2SqlCostGuardResult;
  executionMode: AgentV2TextToSqlExecutionMode;
  executionMs?: number;
  rowCount?: number;
};

export type AgentV2TextToSqlExecutionResult = {
  status: AgentV2TextToSqlRunStatus;
  rows: Array<Record<string, unknown>>;
  executionMs: number;
  blockedReason?: string;
  errorMessage?: string;
};

export type AgentV2TextToSqlResult = {
  status: AgentV2TextToSqlRunStatus;
  answer?: string;
  rows: Array<Record<string, unknown>>;
  evidence: AgentV2TextToSqlEvidence;
  queryTrace: AgentV2TextToSqlTrace;
  auditRunId?: string;
  blockedReason?: string;
};

export type AgentV2TextToSqlCandidate = {
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
