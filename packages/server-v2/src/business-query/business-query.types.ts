export type BusinessQueryRole = 'manager' | 'reception' | 'beautician';

export type BusinessQueryRuntimeFamily = 'agent_v1_legacy';

export interface BusinessQueryRuntimeBoundary {
  family: BusinessQueryRuntimeFamily;
  lifecycle: 'legacy_internal';
  note: string;
}

export type BusinessQueryDomain =
  | 'business'
  | 'product'
  | 'project'
  | 'customer'
  | 'schedule'
  | 'reservation'
  | 'order'
  | 'card'
  | 'memberCard'
  | 'finance'
  | 'inventory'
  | 'marketing'
  | 'staff'
  | 'store'
  | 'supplyChain'
  | 'automation'
  | 'terminal'
  | 'unknown';

export type BusinessQueryCapabilityId =
  | 'business_overview'
  | 'product_sales_trend'
  | 'product_replenishment_opportunity'
  | 'product_customer_distribution'
  | 'project_service_trend'
  | 'project_material_margin'
  | 'customer_churn_risk'
  | 'customer_profile_lookup'
  | 'customer_reservation_today'
  | 'customer_card_benefit_summary'
  | 'customer_growth_opportunity'
  | 'inventory_alert'
  | 'reservation_today'
  | 'schedule_utilization'
  | 'order_customer_consumption_list'
  | 'finance_order_lookup'
  | 'finance_today_transaction_list'
  | 'order_revenue_analysis'
  | 'card_expiry_risk'
  | 'member_card_lookup'
  | 'card_usage_analysis'
  | 'member_balance_analysis'
  | 'finance_cashflow_summary'
  | 'marketing_activity_list'
  | 'marketing_activity_link_lookup'
  | 'marketing_conversion'
  | 'automation_execution_summary'
  | 'supplier_purchase_advice'
  | 'business_anomaly_alert'
  | 'multi_store_comparison'
  | 'staff_performance'
  | 'terminal_health_diagnosis'
  | 'unsupported';

export interface BusinessQueryPlannerTrace {
  parserVersion: 'unified-query-planner-v1' | 'business-task-preparser' | 'legacy-rule';
  entityMatches: Array<{
    objectType: string;
    entityId?: string;
    displayName: string;
    confidence?: number;
    sourceModel?: string;
  }>;
  actionIntent?: string;
  capabilityId?: string;
  queryTemplateId?: string;
  executionPath: 'knowledge_graph' | 'semantic_query' | 'legacy_fallback' | 'clarify' | 'unsupported';
  fallbackReason?: string | null;
  schemaPath?: string[];
  confidence?: number;
}

export interface BusinessQueryPlan {
  requestId: string;
  originalQuestion: string;
  domain: BusinessQueryDomain;
  capability: BusinessQueryCapabilityId;
  intent: 'query' | 'clarify' | 'unsupported';
  metrics: string[];
  dimensions: string[];
  filters: Record<string, unknown>;
  sort?: { field: string; direction: 'asc' | 'desc' };
  limit: number;
  needClarification: boolean;
  clarificationQuestion?: string | null;
  plannerTrace?: BusinessQueryPlannerTrace;
  fallbackReason?: string | null;
}

export interface BusinessQueryContext {
  forcedCapabilityId?: BusinessQueryCapabilityId;
  forcedDomain?: BusinessQueryDomain;
  previousResponse?: {
    domain: BusinessQueryDomain | string;
    capability: BusinessQueryCapabilityId | string;
    queryPlan?: Partial<BusinessQueryPlan>;
    card?: Pick<BusinessQueryCard, 'type' | 'title' | 'items'>;
  };
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
  columns?: string[];
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
  status: 'success' | 'clarify' | 'unsupported' | 'no_data';
  domain: BusinessQueryDomain;
  capability: BusinessQueryCapabilityId;
  queryPlan: BusinessQueryPlan;
  card?: BusinessQueryCard;
  answer: string;
  evidence: BusinessQueryEvidence;
  actions: BusinessQueryAction[];
  runtimeFamily?: BusinessQueryRuntimeFamily;
  runtimeBoundary?: BusinessQueryRuntimeBoundary;
}

export interface BusinessQueryCapability {
  id: BusinessQueryCapabilityId;
  domain: BusinessQueryDomain;
  name: string;
  description: string;
  allowedRoles: BusinessQueryRole[];
  defaultParams: Record<string, unknown>;
  resultLimit: number;
  riskLevel: 'low' | 'medium' | 'high';
  cardType: string;
  implemented: boolean;
  runtimeFamily?: BusinessQueryRuntimeFamily;
  runtimeBoundary?: BusinessQueryRuntimeBoundary;
}
