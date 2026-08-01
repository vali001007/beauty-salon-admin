import type {
  ReadOnlySqlGuardResult,
  ReadOnlySqlExecutionResult,
  ReadOnlySqlView,
} from '../read-only-sql-kernel/read-only-sql-kernel.types.js';

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

export type AskDataAnswer = {
  summary: string;
  keyFindings: string[];
  caveats: string[];
  displayMode: 'table' | 'ranking' | 'trend' | 'metric';
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
};

export type AskDataFreeSqlResponse = {
  status: AskDataFreeSqlStatus;
  summary: string;
  keyFindings: string[];
  columns: Array<{ key: string; label: string; type?: 'text' | 'number' | 'money' | 'percent' | 'date' }>;
  rows: Array<Record<string, unknown>>;
  sources: Array<{ model: string; fields: string[]; filters: string[]; reason: string }>;
  clarificationQuestion?: string;
  limitations: string[];
  queryMeta: AskDataQueryMeta;
  queryPlan: {
    planner: 'llm' | 'legacy';
    explanation?: string;
    generatedSql?: string;
  };
  auditRunId?: string;
};

export type AskDataCatalogResponse = {
  tables: Array<Pick<ReadOnlySqlView, 'viewName' | 'label' | 'domain' | 'description'>>;
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
};
