export type AskDataStatus =
  | 'success'
  | 'clarification'
  | 'unsupported'
  | 'no_data'
  | 'error'
  | 'blocked'
  | 'failed'
  | 'feature_disabled';

export interface AskDataHistoryItem {
  role: 'user' | 'assistant';
  content: string;
  queryPlan?: AskDataQueryPlan;
  rows?: Array<Record<string, unknown>>;
  queryMeta?: AskDataQueryMeta;
}

export interface AskDataQueryRequest {
  question: string;
  history?: AskDataHistoryItem[];
}

export interface AskDataColumn {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'money' | 'percent' | 'date';
}

export interface AskDataSource {
  model: string;
  fields: string[];
  filters: string[];
  reason: string;
  dataPolicy?: string;
  dataAsOf?: string;
}

export interface AskDataQueryPlan {
  templateId?: string;
  intent: 'query' | 'clarification' | 'unsupported';
  question?: string;
  dateRange?: {
    label: string;
    from: string;
    to: string;
  };
  entity?: {
    type: string;
    name?: string;
    id?: number;
  };
  assumptions?: string[];
  confidence?: number;
  planner?: 'ai' | 'rule' | 'llm' | 'legacy';
  explanation?: string;
  generatedSql?: string;
  semanticIntent?: {
    intent: 'query' | 'list' | 'ranking' | 'comparison' | 'trend' | 'diagnosis';
    answerShape: 'scalar' | 'list' | 'ranking' | 'comparison' | 'trend';
    metricKeys: string[];
    dimensionKeys: string[];
    confidence: number;
    routeMode: 'deterministic' | 'model_fallback';
    assumptions: string[];
  };
}

export interface AskDataQueryResponse {
  status: AskDataStatus;
  summary: string;
  keyFindings?: string[];
  columns: AskDataColumn[];
  rows: Array<Record<string, unknown>>;
  sources: AskDataSource[];
  clarificationQuestion?: string;
  limitations?: string[];
  queryMeta?: AskDataQueryMeta;
  queryPlan: AskDataQueryPlan;
  auditRunId?: string;
}

export interface AskDataQueryMeta {
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
}

export interface AskDataCatalogTable {
  model?: string;
  viewName?: string;
  label: string;
  domain?: string;
  description: string;
  fields?: string[];
  dataPolicy?: string;
  freshnessField?: string;
}

export interface AskDataCatalogResponse {
  tables: AskDataCatalogTable[];
  examples: string[];
  totalCount?: number;
  groups?: Array<{ domain: string; label: string; count: number }>;
  enabled?: boolean;
  executeReady?: boolean;
  mode?: 'legacy' | 'dry_run' | 'execute';
  connectionMode?: 'dedicated_readonly' | 'development_admin' | 'unavailable';
}
