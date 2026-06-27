export type BusinessQueryRole = 'manager' | 'reception' | 'beautician';

export type BusinessQueryStatus = 'success' | 'clarify' | 'unsupported' | 'no_data';

export interface BusinessQueryAskRequest {
  question: string;
  role?: BusinessQueryRole;
  operatorId?: number | null;
  context?: BusinessQueryContext;
}

export interface BusinessQueryContext {
  previousResponse?: Pick<BusinessQueryResponse, 'domain' | 'capability'> & {
    queryPlan?: BusinessQueryPlan;
    card?: Pick<BusinessQueryCard, 'type' | 'title' | 'items'>;
  };
}

export interface BusinessQueryPlan {
  requestId: string;
  originalQuestion: string;
  domain: string;
  capability: string;
  intent: 'query' | 'clarify' | 'unsupported';
  metrics: string[];
  dimensions: string[];
  filters: Record<string, unknown>;
  sort?: { field: string; direction: 'asc' | 'desc' };
  limit: number;
  needClarification: boolean;
  clarificationQuestion?: string | null;
}

export interface BusinessQueryEvidence {
  dateRange?: string;
  compareRange?: string;
  source: string[];
  sourceTables?: string[];
  filters: string[];
  metricDefinition: string;
  sampleSize?: number;
  limitations?: string[];
}

export interface BusinessQueryCard {
  type: string;
  title: string;
  summary: string;
  items: Array<Record<string, unknown>>;
  kpis?: Array<{ label: string; value: string; hint?: string }>;
}

export interface BusinessQueryAction {
  label: string;
  action: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface BusinessQueryResponse {
  requestId: string;
  status: BusinessQueryStatus;
  domain: string;
  capability: string;
  queryPlan: BusinessQueryPlan;
  card?: BusinessQueryCard;
  answer: string;
  evidence: BusinessQueryEvidence;
  actions: BusinessQueryAction[];
}

export interface BusinessQueryCapability {
  id: string;
  domain: string;
  name: string;
  description: string;
  allowedRoles: BusinessQueryRole[];
  defaultParams: Record<string, unknown>;
  resultLimit: number;
  riskLevel: 'low' | 'medium' | 'high';
  cardType: string;
  implemented: boolean;
}
