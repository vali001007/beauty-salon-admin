import type {
  ReadOnlySqlGuardResult,
  ReadOnlySqlExecutionResult,
  ReadOnlySqlView,
} from '../read-only-sql-kernel/read-only-sql-kernel.types.js';
import type { AskDataControlledQueryPlan } from './ask-data-query-plan.js';

export type AskDataFreeSqlStatus = 'success' | 'no_data' | 'clarification' | 'blocked' | 'failed' | 'feature_disabled';

export type AskDataFreeSqlRequest = {
  question: string;
  history?: Array<{
    role: 'user' | 'assistant';
    content: string;
    rows?: Array<Record<string, unknown>>;
    queryMeta?: AskDataQueryMeta;
  }>;
};

export type AskDataFreeSqlContext = {
  userId?: number;
  storeId: number;
  visibleStoreIds: number[];
  permissions: string[];
  deniedPermissions: string[];
};

export type AskDataSqlGeneration = {
  status: 'ready' | 'clarification' | 'blocked';
  sql: string;
  parameters: Record<string, unknown>;
  explanation: string;
  expectedColumns: string[];
  clarificationQuestion: string;
};

export type AskDataSemanticIntentName = 'query' | 'list' | 'ranking' | 'comparison' | 'trend' | 'diagnosis';

export type AskDataSemanticAnswerShape = 'scalar' | 'list' | 'ranking' | 'comparison' | 'trend';

export type AskDataSemanticIntent = {
  intent: AskDataSemanticIntentName;
  answerShape: AskDataSemanticAnswerShape;
  metricKeys: string[];
  dimensionKeys: string[];
  entities: Array<{ type: string; mention: string; resolvedValue?: string }>;
  filters: Array<{ key: string; operator: string; value: unknown }>;
  timeRange?: { label: string; startAt: string; endAt: string };
  ambiguities: Array<{ slot: string; reason: string; candidates: string[] }>;
  assumptions: string[];
  confidence: number;
};

export type AskDataSemanticRouteMode = 'deterministic' | 'model_fallback';

export type AskDataSemanticRouteMeta = {
  intent: AskDataSemanticIntentName;
  answerShape: AskDataSemanticAnswerShape;
  metricKeys: string[];
  dimensionKeys: string[];
  confidence: number;
  routeMode: AskDataSemanticRouteMode;
  assumptions: string[];
};

export type AskDataSemanticAuditMeta = AskDataSemanticRouteMeta & {
  deterministicCandidates: string[];
  finalCandidates: string[];
  fallbackReason?: string;
  clarificationReason?: string;
  deterministicLatencyMs: number;
  modelFallbackLatencyMs?: number;
  shadow: boolean;
};

export type AskDataAnswer = {
  summary: string;
  keyFindings: string[];
  caveats: string[];
  displayMode: 'table' | 'ranking' | 'trend' | 'metric';
  coveredFacts: string[];
  compositionMode?: 'model' | 'deterministic' | 'deterministic_fallback';
};

export type AskDataQueryMeta = {
  viewNames: string[];
  timeRange: string;
  storeScope: string;
  truncated: boolean;
  sqlFingerprint?: string;
  executionMs?: number;
  generatedSql?: string;
  statusReason?: string;
  connectionMode?: 'dedicated_readonly' | 'development_admin';
  dataAsOf?: string;
  executionAttempts?: number;
  executionRetryAttempted?: boolean;
};

export type AskDataFreeSqlResponse = {
  status: AskDataFreeSqlStatus;
  summary: string;
  keyFindings: string[];
  columns: Array<{ key: string; label: string; type?: 'text' | 'number' | 'money' | 'percent' | 'date' }>;
  rows: Array<Record<string, unknown>>;
  sources: Array<{
    model: string;
    fields: string[];
    filters: string[];
    reason: string;
    dataPolicy?: string;
    dataAsOf?: string;
  }>;
  clarificationQuestion?: string;
  limitations: string[];
  queryMeta: AskDataQueryMeta;
  queryPlan: {
    planner: 'llm' | 'legacy';
    explanation?: string;
    generatedSql?: string;
    semanticIntent?: AskDataSemanticRouteMeta;
    controlled?: AskDataControlledQueryPlan;
  };
  auditRunId?: string;
};

export type AskDataCatalogResponse = {
  tables: Array<
    Pick<ReadOnlySqlView, 'viewName' | 'label' | 'domain' | 'description' | 'dataPolicy' | 'freshnessField'>
  >;
  totalCount: number;
  groups: Array<{ domain: string; label: string; count: number }>;
  examples: string[];
  enabled: boolean;
  executeReady: boolean;
  mode: 'legacy' | 'dry_run' | 'execute';
  connectionMode: 'dedicated_readonly' | 'development_admin' | 'unavailable';
};

export type AskDataAuditInput = {
  question: string;
  context: AskDataFreeSqlContext;
  status: AskDataFreeSqlStatus;
  guard?: ReadOnlySqlGuardResult;
  cost?: { estimatedCost: number };
  execution?: ReadOnlySqlExecutionResult;
  selectedViews?: ReadOnlySqlView[];
  answer?: AskDataAnswer;
  generatedSql?: string;
  explanation?: string;
  semanticRouting?: AskDataSemanticAuditMeta;
  controlledQueryPlan?: AskDataControlledQueryPlan;
  structuredOutput?: {
    attempts: number;
    retryAttempted: boolean;
    retryLatencyMs: number;
    firstErrorCode?: string;
    finalErrorCode?: string;
    repairAttempts?: Array<{
      kind: 'clarification' | 'guard' | 'query_plan';
      reasonCode: string;
      latencyMs: number;
      succeeded: boolean;
      attempts: number;
      retryAttempted: boolean;
      firstErrorCode?: string;
      finalErrorCode?: string;
    }>;
  };
};
