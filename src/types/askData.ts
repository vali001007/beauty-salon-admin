export type AskDataStatus = 'success' | 'clarification' | 'unsupported' | 'no_data' | 'error';

export interface AskDataHistoryItem {
  role: 'user' | 'assistant';
  content: string;
  queryPlan?: AskDataQueryPlan;
  rows?: Array<Record<string, unknown>>;
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
  planner?: 'ai' | 'rule';
}

export interface AskDataQueryResponse {
  status: AskDataStatus;
  summary: string;
  columns: AskDataColumn[];
  rows: Array<Record<string, unknown>>;
  sources: AskDataSource[];
  clarificationQuestion?: string;
  queryPlan: AskDataQueryPlan;
}

export interface AskDataCatalogTable {
  model: string;
  label: string;
  description: string;
  fields: string[];
}

export interface AskDataCatalogResponse {
  tables: AskDataCatalogTable[];
  examples: string[];
}
