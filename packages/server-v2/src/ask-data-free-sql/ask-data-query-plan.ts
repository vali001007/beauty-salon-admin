import type { ReadOnlySqlView } from '../read-only-sql-kernel/read-only-sql-kernel.types.js';
import { resolveAskDataEntities, type AskDataResolvedEntityFilter } from './ask-data-entity-resolver.js';
import type { AskDataSemanticIntent } from './ask-data-free-sql.types.js';
import { ASK_DATA_SEMANTIC_CONTRACTS } from './ask-data-semantic-contracts.js';
import { extractAskDataGreaterThanThreshold, parseAskDataNumber } from './ask-data-number-parser.js';

export type AskDataQueryAggregation = {
  field: string;
  fn: 'sum' | 'sum_abs' | 'avg' | 'count' | 'count_distinct' | 'max' | 'min' | 'none' | 'derived';
  alias: string;
  zeroOnEmpty?: boolean;
  sourceFields?: string[];
  expression?: string;
};

export type AskDataControlledQueryPlan = {
  metricKeys: string[];
  viewNames: string[];
  requiredViewNames: string[];
  requiredJoinKeys: string[];
  selectFields: string[];
  requiredOutputFields: string[];
  aggregations: AskDataQueryAggregation[];
  dimensions: Array<{ key: string; field: string; viewName: string }>;
  requiredGroupByFields: string[];
  forbiddenGroupByFields: string[];
  filters: Array<{ field: string; operator: string; value: unknown; viewName?: string }>;
  entityFilters: AskDataResolvedEntityFilter[];
  timeRange?: AskDataSemanticIntent['timeRange'];
  timeScopeMode: 'event_range' | 'current_snapshot' | 'active_interval' | 'none';
  timeFieldOverrides?: Record<string, string>;
  timeGrain?: {
    sourceField: string;
    granularity: 'day' | 'week' | 'month';
    alias: string;
    expression: string;
  };
  comparisonMode?: 'previous_period' | 'year_over_year' | 'multi_metric' | 'dimension';
  sort?: Array<{ field: string; direction: 'asc' | 'desc'; nulls?: 'first' | 'last' }>;
  limit: number;
  answerShape: AskDataSemanticIntent['answerShape'];
  resultMode: 'scalar' | 'detail' | 'grouped' | 'ranking' | 'trend';
  requireDistinctResult: boolean;
  forbidAdditionalViews: boolean;
  assumptions: string[];
  requiredAnswerFacts: string[];
};

const METRIC_FIELDS: Record<string, AskDataQueryAggregation[]> = {
  order_revenue: [sum('net_amount', 'net_revenue'), countDistinct('order_id', 'order_count')],
  product_sales: [sum('quantity', 'sales_quantity'), sum('net_amount', 'net_sales_amount')],
  project_sales: [sum('service_quantity', 'service_count'), sum('net_amount', 'project_revenue')],
  item_contribution_margin: itemContributionMarginAggregations(),
  project_attributed_cost: [
    sum('net_revenue', 'net_revenue'),
    sum('attributed_cost', 'attributed_cost'),
    derived('attributed_cost_rate', 'SUM(attributed_cost) / NULLIF(SUM(net_revenue), 0)', ['attributed_cost', 'net_revenue']),
    derived('estimated_cost_event_count', 'COUNT(*) FILTER (WHERE is_estimated_cost)', ['is_estimated_cost']),
    derived('cost_missing_event_count', 'COUNT(*) FILTER (WHERE attributed_cost IS NULL)', ['attributed_cost']),
  ],
  below_cost_sale: itemContributionMarginAggregations(),
  payment_flow: [sum('payment_amount', 'payment_amount'), sum('refund_amount', 'refund_amount'), count('order_id', 'flow_count')],
  daily_net_receipts: [sum('net_amount', 'net_receipts'), sum('order_count', 'order_count')],
  inventory_on_hand: [sum('current_stock', 'current_stock'), sum('stock_value', 'stock_value')],
  inventory_movement: [sumZero('quantity', 'movement_quantity'), count('movement_id', 'movement_count')],
  inventory_scrap: [sum('scrap_quantity', 'scrap_quantity'), sum('loss_amount', 'loss_amount')],
  inventory_days_of_stock: [none('days_of_stock_30d', 'days_of_stock_30d'), none('current_stock', 'current_stock'), none('avg_daily_outbound_30d', 'avg_daily_outbound_30d')],
  inventory_operational_turnover: [none('operational_turnover_ratio_30d', 'operational_turnover_ratio_30d'), none('outbound_quantity_30d', 'outbound_quantity_30d'), none('event_weighted_avg_stock_30d', 'event_weighted_avg_stock_30d')],
  inventory_slow_moving: [none('slow_moving_status', 'slow_moving_status'), none('current_stock', 'current_stock'), none('outbound_quantity_90d', 'outbound_quantity_90d'), none('operational_turnover_ratio_30d', 'operational_turnover_ratio_30d'), none('days_of_stock_30d', 'days_of_stock_30d')],
  inventory_demand_change: [none('demand_change_rate_30d', 'demand_change_rate_30d'), none('outbound_quantity_30d', 'outbound_quantity_30d'), none('outbound_quantity_previous_30d', 'outbound_quantity_previous_30d')],
  inventory_procurement_coverage: [none('replenishment_fact_status', 'replenishment_fact_status'), none('current_stock', 'current_stock'), none('safety_stock', 'safety_stock'), none('outbound_quantity_90d', 'outbound_quantity_90d'), none('open_procurement_quantity', 'open_procurement_quantity'), none('open_procurement_order_count', 'open_procurement_order_count'), none('procurement_order_count_90d', 'procurement_order_count_90d'), none('last_procurement_at', 'last_procurement_at')],
  inventory_outbound_usage: [none('outbound_quantity_30d', 'outbound_quantity_30d'), none('outbound_quantity_current_month', 'outbound_quantity_current_month'), none('outbound_quantity_current_quarter', 'outbound_quantity_current_quarter'), none('avg_daily_outbound_30d', 'avg_daily_outbound_30d')],
  inventory_outbound_cost_estimate: [none('estimated_outbound_cost_30d', 'estimated_outbound_cost_30d'), none('estimated_avg_daily_outbound_cost_30d', 'estimated_avg_daily_outbound_cost_30d'), none('estimated_outbound_cost_current_month', 'estimated_outbound_cost_current_month'), none('estimated_avg_daily_outbound_cost_current_month', 'estimated_avg_daily_outbound_cost_current_month')],
  customer_profile: [countDistinct('customer_id', 'customer_count'), sum('total_paid_amount', 'total_paid_amount')],
  staff_profile: [countDistinct('staff_id', 'staff_count')],
  staff_performance: [sum('paid_amount', 'paid_amount'), sum('service_count', 'service_count'), sum('commission_amount', 'commission_amount')],
  reservation_metrics: [countDistinct('reservation_id', 'reservation_count')],
  marketing_conversion: [sumZero('event_count', 'event_count'), sumZero('lead_count', 'lead_count'), sumZero('conversion_count', 'conversion_count'), sumZero('attributed_revenue', 'attributed_revenue')],
  card_assets: [sum('remaining_times', 'remaining_times'), sum('paid_amount', 'paid_amount')],
  card_usage: [sum('times', 'usage_times'), sum('recognized_amount', 'recognized_amount')],
  customer_balance: [sum('cash_balance', 'cash_balance'), sum('gift_balance', 'gift_balance')],
  service_quality: [countDistinct('service_task_id', 'service_task_count')],
  appointment_gap: [sum('available_capacity', 'available_capacity'), sum('estimated_revenue', 'estimated_revenue'), sum('candidate_count', 'candidate_count')],
  project_catalog: [none('price', 'price'), none('duration', 'duration')],
  marketing_activity: [sum('participants', 'participants')],
  marketing_automation: [sum('task_count', 'task_count'), sum('completed_count', 'completed_count')],
  promotion_offer: [sum('issued_count', 'issued_count'), sum('used_count', 'used_count')],
  operating_cost: [sum('amount', 'operating_cost')],
  procurement_detail: [sum('total_amount', 'procurement_amount'), countDistinct('procurement_id', 'procurement_count')],
  supplier_performance: [none('procurement_amount', 'procurement_amount'), none('procurement_count', 'procurement_count'), none('avg_delivery_days', 'avg_delivery_days')],
  supplier_latest_quote: [none('quote_price', 'quote_price'), none('minimum_order_quantity', 'minimum_order_quantity'), none('lead_days', 'lead_days')],
  supplier_price_comparison: [none('quote_price', 'quote_price'), none('lowest_current_quote_price', 'lowest_current_quote_price'), none('price_difference_from_lowest', 'price_difference_from_lowest'), none('price_premium_rate', 'price_premium_rate')],
  supplier_minimum_order_quantity: [none('minimum_order_quantity', 'minimum_order_quantity')],
  supplier_payment_terms: [none('payment_terms', 'payment_terms'), none('settlement_mode', 'settlement_mode')],
  supplier_lead_time: [none('lead_days', 'lead_days')],
  confirmed_profit: [
    sum('operating_revenue', 'operating_revenue'),
    sum('gross_profit', 'gross_profit'),
    sum('operating_profit', 'operating_profit'),
    derived(
      'gross_margin_rate',
      'SUM(gross_profit) / NULLIF(SUM(operating_revenue), 0)',
      ['gross_profit', 'operating_revenue'],
    ),
    derived(
      'operating_margin_rate',
      'SUM(operating_profit) / NULLIF(SUM(operating_revenue), 0)',
      ['operating_profit', 'operating_revenue'],
    ),
  ],
  reconciliation_issue: [countDistinct('issue_id', 'issue_count'), sum('amount', 'issue_amount')],
  member_liability: [sum('total_liability', 'total_liability'), sum('remaining_times', 'remaining_times')],
  staff_capacity: [sum('scheduled_minutes', 'scheduled_minutes'), sum('booked_minutes', 'booked_minutes'), sum('idle_minutes', 'idle_minutes'), sum('overbooked_minutes', 'overbooked_minutes'), derived('utilization_rate', 'SUM(booked_minutes)::numeric / NULLIF(SUM(scheduled_minutes), 0)', ['booked_minutes', 'scheduled_minutes'])],
  transfer_status: [countDistinct('transfer_id', 'transfer_count'), sum('product_count', 'product_count')],
  bom_variance: [sum('standard_qty', 'standard_qty'), sum('actual_qty', 'actual_qty'), sum('deviation_qty', 'deviation_qty'), derived('deviation_rate', 'SUM(deviation_qty) / NULLIF(SUM(standard_qty), 0)', ['deviation_qty', 'standard_qty'])],
  customer_feedback: [countDistinct('feedback_id', 'feedback_count'), avg('rating', 'average_rating')],
  customer_lifecycle: [countDistinct('customer_id', 'customer_count'), avg('top_score', 'average_opportunity_score')],
  marketing_roi: [sum('exposure_count', 'exposure_count'), sum('click_count', 'click_count'), sum('conversion_count', 'conversion_count'), sum('attributed_net_revenue', 'attributed_net_revenue'), sum('marketing_cost', 'marketing_cost'), derived('roi', 'SUM(attributed_net_revenue) / NULLIF(SUM(marketing_cost), 0)', ['attributed_net_revenue', 'marketing_cost'])],
  payment_customer_detail: [],
  inventory_usage_balance: [sumAbs('quantity', 'consumed_quantity'), max('current_stock', 'current_stock')],
  inventory_loss_rate: [derived('scrap_out_quantity', "SUM(ABS(quantity)) FILTER (WHERE movement_type = 'scrap_out')", ['quantity', 'movement_type']), sumAbs('quantity', 'outbound_quantity'), derived('inventory_loss_rate', "SUM(ABS(quantity)) FILTER (WHERE movement_type = 'scrap_out') / NULLIF(SUM(ABS(quantity)), 0)", ['quantity', 'movement_type'])],
  payment_order_difference: [sum('paid_amount', 'payment_amount'), sum('revenue_amount', 'order_amount'), derived('payment_order_difference', 'SUM(paid_amount) - SUM(revenue_amount)', ['paid_amount', 'revenue_amount'])],
};

const DIMENSION_FIELDS: Record<string, string[]> = {
  date: ['order_created_at', 'paid_at', 'settlement_date', 'occurred_at', 'event_at', 'verified_at', 'appointment_time', 'completed_at', 'latest_task_at', 'date', 'business_date', 'period_month', 'settle_month', 'work_date', 'effect_date', 'latest_event_at', 'snapshot_date', 'start_at', 'created_at', 'computed_at'],
  time_slot: ['start_time'],
  month: ['period_month', 'settle_month'],
  snapshot_date: ['snapshot_date'],
  customer: ['customer_id', 'customer_name_masked'],
  member_level: ['member_level'],
  staff: ['staff_id', 'staff_name', 'beautician_id', 'beautician_name', 'primary_staff_id', 'primary_staff_name'],
  staff_level: ['level_name'],
  operator: ['operator_name'],
  project: ['project_id', 'project_name'],
  product: ['product_id', 'product_name', 'sku'],
  item_type: ['item_type'],
  cost_basis: ['cost_basis', 'cost_completeness'],
  product_category: ['category_name'],
  sku: ['sku'],
  supplier: ['supplier_id', 'supplier_name'],
  channel: ['channel'],
  strategy: ['strategy_id', 'strategy_name'],
  activity: ['activity_id', 'activity_title'],
  payment_method: ['payment_method', 'pay_method'],
  status: ['status', 'issue_status', 'payment_status', 'refund_status'],
  cost_category: ['category'],
  movement_type: ['movement_type'],
  card: ['customer_card_id', 'card_name'],
  project_type: ['project_type'],
  promotion_type: ['type'],
  offer: ['promotion_id', 'promotion_name'],
  scope: ['scope_type'],
  direction: ['direction'],
  counterparty_store: ['counterpart_store_id', 'counterpart_store_name'],
  feedback_type: ['feedback_type'],
  severity: ['severity'],
  lifecycle_stage: ['lifecycle_stage'],
  ltv_band: ['ltv_tier'],
  risk_level: ['churn_risk_level'],
  opportunity_type: ['top_opportunity_type'],
  slow_moving_status: ['slow_moving_status'],
  replenishment_status: ['replenishment_fact_status'],
  customer_status: ['customer_status'],
  source_channel: ['source_channel'],
  age_band: ['age_band'],
  automation: ['strategy_id', 'strategy_name', 'automation_source', 'trigger_type'],
};

const GOVERNED_SAME_KEY_VIEW_JOINS: Record<string, string[]> = {
  'agent_v3_card_asset_view|agent_v3_customer_balance_view': ['customer_id'],
  'agent_v3_marketing_activity_view|agent_v3_marketing_conversion_view': ['activity_id'],
  'agent_v3_marketing_conversion_view|ask_data_marketing_roi_view': ['activity_id'],
  'agent_v3_purchase_procurement_view|agent_v3_supplier_performance_view': ['supplier_id'],
  'agent_v3_project_service_sales_view|ask_data_bom_consumption_variance_view': ['project_id'],
  'agent_v3_service_quality_view|ask_data_customer_feedback_view': ['project_id'],
};

const DETAIL_IDENTITY_FIELDS: Record<string, string[]> = {
  agent_v3_order_summary_view: ['order_id', 'customer_id', 'customer_name_masked'],
  agent_v3_payment_refund_view: ['order_id'],
  agent_v3_stock_movement_view: ['movement_id', 'product_id', 'product_name'],
  agent_v3_inventory_scrap_view: ['movement_id', 'product_id', 'product_name'],
  ask_data_customer_profile_summary_view: ['customer_id', 'customer_name_masked'],
  agent_v3_staff_profile_view: ['staff_id', 'staff_name'],
  ask_data_staff_performance_view: ['staff_id', 'staff_name'],
  agent_v3_reservation_view: ['reservation_id'],
  agent_v3_card_asset_view: ['customer_card_id', 'customer_id', 'customer_name_masked'],
  agent_v3_card_usage_view: ['customer_id', 'customer_name_masked', 'card_name', 'project_name'],
  agent_v3_customer_balance_view: ['customer_id', 'customer_name_masked'],
  agent_v3_service_quality_view: ['service_task_id'],
  agent_v3_appointment_gap_view: ['date', 'start_time'],
  agent_v3_project_catalog_view: ['project_id', 'project_name'],
  ask_data_item_margin_view: ['event_id', 'item_id', 'item_name'],
  agent_v3_marketing_activity_view: ['activity_id'],
  agent_v3_marketing_automation_view: ['automation_source', 'trigger_type'],
  agent_v3_promotion_offer_view: ['promotion_id', 'promotion_name'],
  agent_v3_purchase_procurement_view: ['procurement_id', 'procurement_no'],
  agent_v3_supplier_performance_view: ['supplier_id', 'supplier_name'],
  ask_data_supplier_quote_terms_view: ['quote_id', 'product_id', 'product_name', 'supplier_id', 'supplier_name'],
  ask_data_reconciliation_issue_view: ['issue_id'],
  ask_data_staff_capacity_view: ['staff_id', 'staff_name'],
  ask_data_transfer_status_view: ['transfer_id', 'transfer_no'],
  ask_data_bom_consumption_variance_view: ['movement_id', 'project_id', 'project_name', 'product_id', 'product_name'],
  ask_data_customer_feedback_view: ['feedback_id', 'customer_id', 'customer_name_masked'],
  ask_data_customer_lifecycle_view: ['customer_id', 'customer_name_masked'],
  ask_data_inventory_turnover_view: ['product_id', 'product_name', 'sku'],
};

export function buildAskDataQueryPlan(input: {
  question: string;
  semanticIntent: AskDataSemanticIntent;
  candidateViews: ReadOnlySqlView[];
}): AskDataControlledQueryPlan {
  const unconfirmedReservationCustomerDetail = /(?:预约|预订).*(?:还没确认|尚未确认|未确认|待确认).*(?:客户|客人)|(?:客户|客人).*(?:预约|预订).*(?:还没确认|尚未确认|未确认|待确认)/.test(input.question);
  const explicitNoOutbound90d = isExplicitNoOutbound90dQuestion(input.question);
  const explicitOperationalTurnoverUpperBound = extractOperationalTurnoverUpperBound(input.question);
  const candidateByName = new Map(input.candidateViews.map((view) => [view.viewName, view]));
  const contracts = input.semanticIntent.metricKeys
    .map((metricKey) => ASK_DATA_SEMANTIC_CONTRACTS.find((contract) => contract.metricKey === metricKey))
    .filter((contract): contract is NonNullable<typeof contract> => Boolean(contract));
  const selectedContracts = contracts
    .filter((contract) => candidateByName.has(contract.preferredView))
    .filter((contract, index, values) => values.findIndex((item) => item.preferredView === contract.preferredView) === index)
    .slice(0, 2);
  const viewNames = [...new Set(selectedContracts.flatMap((contract) => [
    contract.preferredView,
    ...(contract.supportingViews ?? []),
  ]))].slice(0, 2);
  const views = viewNames.map((viewName) => candidateByName.get(viewName)).filter((view): view is ReadOnlySqlView => Boolean(view));
  const metricKeys = selectedContracts.map((contract) => contract.metricKey);
  let resultMode = resolveResultMode(input.question, input.semanticIntent.answerShape);
  if (unconfirmedReservationCustomerDetail) resultMode = 'detail';
  if (input.semanticIntent.entities.some((entity) => /^(?:customer|客户|staff|员工)$/.test(entity.type))) {
    resultMode = 'detail';
  }
  if (metricKeys.includes('reservation_metrics') && /有(?:几|多少)个预约|有预约吗/.test(input.question)) {
    resultMode = 'scalar';
  }
  if (input.semanticIntent.entities.some((entity) => /^(?:project|项目|product|商品|supplier|供应商)$/.test(entity.type))) {
    resultMode = metricKeys.every((metricKey) => ['project_catalog', 'inventory_on_hand', 'inventory_days_of_stock', 'inventory_operational_turnover', 'inventory_slow_moving', 'inventory_demand_change', 'inventory_procurement_coverage', 'inventory_outbound_usage', 'inventory_outbound_cost_estimate', 'supplier_performance', 'supplier_latest_quote', 'supplier_price_comparison', 'supplier_minimum_order_quantity', 'supplier_payment_terms', 'supplier_lead_time', 'item_contribution_margin', 'project_attributed_cost', 'below_cost_sale'].includes(metricKey))
      ? 'detail'
      : 'grouped';
  }
  if (metricKeys.includes('reservation_metrics') && /(?:预约|预订).*(?:项目|护理).*(?:客户|客人).*(?:哪些|有谁)|(?:预约|预订).*(?:哪些|有谁).*(?:客户|客人)/.test(input.question)) {
    resultMode = 'detail';
  }
  if (metricKeys.includes('product_sales') && /(?:产品|商品).*动销|动销分析/.test(input.question)) {
    resultMode = 'grouped';
  }
  if (metricKeys.includes('marketing_roi') && /活动.*(?:亏钱|亏损|赔钱|不赚钱)/.test(input.question)) {
    resultMode = 'grouped';
  }
  if (metricKeys.includes('below_cost_sale')) resultMode = 'ranking';
  if (metricKeys.includes('item_contribution_margin') && /各项目|每个项目|各商品|每个商品|各产品|每个产品/.test(input.question)) {
    resultMode = 'grouped';
  }
  if (metricKeys.includes('item_contribution_margin')
    && input.semanticIntent.answerShape === 'comparison'
    && /商品|产品/.test(input.question)
    && /项目|服务/.test(input.question)) {
    resultMode = 'grouped';
  } else if (metricKeys.includes('item_contribution_margin') && /(?:最高|最低|排行|排名|哪个|哪些)/.test(input.question)) {
    resultMode = 'ranking';
  }
  if (metricKeys.includes('project_attributed_cost') && /(?:各项目|每个项目|哪个项目|最高)/.test(input.question)) {
    resultMode = /最高|哪个/.test(input.question) ? 'ranking' : 'grouped';
  }
  if (metricKeys.some((metricKey) => ['item_contribution_margin', 'project_attributed_cost'].includes(metricKey))
    && /按成本口径|各成本口径|按成本来源|各成本来源/.test(input.question)) {
    resultMode = 'grouped';
  }
  if (input.semanticIntent.answerShape === 'comparison' && metricKeys.length > 1 && /各多少|分别(?:是多少|多少)/.test(input.question)) {
    resultMode = 'scalar';
  }
  const requestedPaymentMethods = resolveRequestedPaymentMethods(input.question);
  const pivotPaymentMethods = metricKeys.includes('payment_flow') && requestedPaymentMethods.length > 1;
  if (pivotPaymentMethods) resultMode = 'scalar';
  const pivotTransferDirections = metricKeys.includes('transfer_status') && /调入和调出.*(?:数量|调拨单).*对比|调入.*调出.*(?:数量|调拨单)/.test(input.question);
  if (pivotTransferDirections) resultMode = 'scalar';
  const pivotReservationProjectTypes = metricKeys.includes('reservation_metrics')
    && /(?:面部).*(?:预约).*(?:身体)|(?:预约).*(?:面部).*(?:身体)/.test(input.question);
  if (pivotReservationProjectTypes) resultMode = 'scalar';
  const entityDimensionKeys = input.semanticIntent.entities.flatMap((entity) =>
    /^(?:project|项目)$/.test(entity.type)
      ? ['project']
      : /^(?:product|商品)$/.test(entity.type)
        ? ['product']
        : /^(?:supplier|供应商)$/.test(entity.type)
          ? ['supplier']
          : [],
  );
  const dimensionKeys = [...new Set([...resolveDimensionKeys(input.question, metricKeys, input.semanticIntent.dimensionKeys, resultMode), ...entityDimensionKeys])]
    .filter((key) => !(pivotPaymentMethods && key === 'payment_method'))
    .filter((key) => !(pivotTransferDirections && key === 'direction'))
    .filter((key) => !(pivotReservationProjectTypes && key === 'project_type'));
  const dimensions = dimensionKeys.flatMap((key) => resolveDimensionFields(key, views));
  // An explicitly resolved business dimension (for example a named product)
  // must remain visible in the result even when the wording asks "how much".
  // Treat it as a one-or-few-row grouped result so grouping requirements and
  // execution validation stay consistent.
  if (resultMode === 'scalar' && dimensions.length) resultMode = 'grouped';
  if (unconfirmedReservationCustomerDetail) resultMode = 'detail';
  const aggregations = [
    ...selectedContracts.flatMap((contract) => metricAggregationsForQuestion(contract.metricKey, input.question, resultMode)),
    ...crossMetricAggregationsForQuestion(input.question, metricKeys),
  ]
    .filter((aggregation, index, values) => values.findIndex((item) => item.alias === aggregation.alias) === index);
  const entityFilters = resolveAskDataEntities(input.semanticIntent, views);
  const governedSemanticFilters = input.semanticIntent.filters
    .filter((filter) =>
      !(metricKeys.includes('transfer_status') && /已经完成|已完成/.test(input.question) && filter.key === 'status' && filter.operator === 'eq'),
    )
    .filter((filter) =>
      !(metricKeys.includes('inventory_procurement_coverage') && /未完成采购|没有.*采购|没采购|无采购/.test(input.question) && filter.key === 'status'),
    );
  const filters = [
    ...governedSemanticFilters.map((filter) => ({ field: filter.key, operator: filter.operator, value: filter.value })),
    ...deriveQuestionFilters(input.question, metricKeys),
    ...entityFilters.map((filter) => ({ field: filter.field, operator: filter.operator, value: filter.value, viewName: filter.viewName })),
  ].filter((filter, index, values) => values.findIndex((item) => item.field === filter.field && item.operator === filter.operator) === index);
  const identityFields = resultMode === 'detail'
    ? views.flatMap((view) => DETAIL_IDENTITY_FIELDS[view.viewName] ?? [])
    : resultMode === 'ranking'
      ? dimensions.length
        ? dimensions.flatMap((dimension) => dimension.field)
        : views.flatMap((view) => DETAIL_IDENTITY_FIELDS[view.viewName] ?? [])
      : [];
  const dimensionFields = dimensions.map((dimension) => dimension.field);
  const timeGrain = resolveTimeGrain(input.question, input.semanticIntent, resultMode, dimensions);
  const outputDimensionFields = dimensionFields.map((field) => field === timeGrain?.sourceField ? timeGrain.alias : field);
  const aggregationSourceFields = aggregations.flatMap((aggregation) => aggregation.sourceFields ?? [aggregation.field]);
  const requiredOutputFields = [...new Set([
    ...identityFields,
    ...outputDimensionFields,
    ...aggregations.map((aggregation) => aggregation.alias),
    ...detailContextFields(input.question, viewNames, resultMode),
  ])];
  const requiredGroupByFields = aggregations.some((aggregation) => aggregation.fn !== 'none')
    ? [...new Set([...identityFields, ...outputDimensionFields])]
    : [];
  const sort = resolveSort(input.question, aggregations, dimensions, resultMode);
  const limit = resolveLimit(input.question, input.semanticIntent.answerShape, resultMode);
  const timeScope = resolveTimeScope(input.question, input.semanticIntent, selectedContracts);
  const requiredJoinKeys = resolveRequiredJoinKeys(viewNames, resultMode, views);
  const assumptions = [...new Set([
    ...input.semanticIntent.assumptions,
    ...selectedContracts.flatMap((contract) => contract.defaultAssumptions),
    ...(timeScope.mode === 'event_range' && !input.semanticIntent.timeRange
      ? ['未指定事件时间范围，默认查询近 30 天。']
      : []),
    ...(/消费了钱.*很少用次卡/.test(input.question)
      ? ['“很少使用次卡”按当前有效次卡且累计核销不超过 1 次判断。']
      : []),
    ...(/消费频率.*明显下降/.test(input.question)
      ? ['“频率明显下降”按距最近到店天数超过平均复购间隔 1.5 倍判断。']
      : []),
    ...(/消费很多但突然消失/.test(input.question)
      ? ['“消费很多”使用已治理的高 LTV 档位；“突然消失”使用 inactive 客户状态。']
      : []),
    ...(/只剩最后几瓶/.test(input.question)
      ? ['“最后几瓶”按当前库存低于安全库存判断。']
      : []),
    ...(metricKeys.includes('inventory_usage_balance') && /洗面奶/.test(input.question)
      ? ['“洗面奶”按商品名称包含“洁面”的已登记商品查询。']
      : []),
    ...(metricKeys.includes('inventory_loss_rate')
      ? ['库存损耗率按期间报废数量除以期间全部出库数量计算。']
      : []),
    ...(metricKeys.some((metricKey) => ['inventory_days_of_stock', 'inventory_operational_turnover', 'inventory_slow_moving', 'inventory_demand_change', 'inventory_procurement_coverage', 'inventory_outbound_usage'].includes(metricKey))
      ? ['库存周转与采购覆盖来自当前库存及固定滚动窗口事实；不生成补货建议。']
      : []),
    ...(metricKeys.includes('inventory_days_of_stock')
      ? ['库存可用天数按当前库存除以最近 30 天日均出库量计算；最近 30 天无出库时返回空值。']
      : []),
    ...(metricKeys.includes('inventory_operational_turnover')
      ? ['库存周转率采用近 30 天出库量除以库存事件加权平均库存的运营口径，不等同于财务会计库存周转率。']
      : []),
    ...(metricKeys.includes('inventory_slow_moving') && explicitNoOutbound90d
      ? ['“90 天无出库”按当前有库存且最近 90 天出库量为 0 判断，不包含仅低周转的商品。']
      : []),
    ...(metricKeys.includes('inventory_slow_moving') && !explicitNoOutbound90d && explicitOperationalTurnoverUpperBound
      ? [`“低周转”按当前有库存且近 30 天运营周转率${explicitOperationalTurnoverUpperBound.operator === 'lte' ? '不高于' : '低于'} ${explicitOperationalTurnoverUpperBound.value} 判断。`]
      : []),
    ...(metricKeys.includes('inventory_slow_moving') && !explicitNoOutbound90d && !explicitOperationalTurnoverUpperBound
      ? ['泛化“慢动销/库存积压”按当前有库存且 90 天无出库，或近 30 天运营周转率低于 0.5 判断。']
      : []),
    ...(metricKeys.includes('inventory_demand_change')
      ? ['需求变化按最近 30 天与前一个 30 天窗口比较；“突然增加”按增长超过 50% 判断。']
      : []),
    ...(metricKeys.includes('inventory_outbound_cost_estimate')
      ? ['耗材出库费用使用商品档案成本估算，不代表批次实际采购成本或已确认财务成本。']
      : []),
    ...(metricKeys.some((metricKey) => ['item_contribution_margin', 'project_attributed_cost', 'below_cost_sale'].includes(metricKey))
      ? ['本结果为商品/项目贡献毛利口径：已识别净收入减可归属商品/耗材成本，不含员工提成和经营费用，不等同已确认月结利润。']
      : []),
    ...(metricKeys.some((metricKey) => ['item_contribution_margin', 'project_attributed_cost', 'below_cost_sale'].includes(metricKey))
      ? ['成本优先使用库存/耗材流水；未覆盖部分使用商品档案成本或 BOM 标准成本估算，回答必须披露估算性。']
      : []),
    ...(/权益.*吸引力/.test(input.question)
      ? ['权益吸引力默认按归因转化率排名。']
      : []),
    ...(/自动化规则.*效果/.test(input.question)
      ? ['自动化规则效果仅按任务完成率展示，不代表营销归因 ROI。']
      : []),
    ...(unconfirmedReservationCustomerDetail
      ? ['“还没确认”按预约当前状态为 pending 查询，并返回可行动的脱敏客户预约明细。']
      : []),
    ...(pivotPaymentMethods
      ? [`支付方式按${requestedPaymentMethods.map((item) => item.label).join('、')}分别汇总，未发生的方式按 0 展示。`]
      : []),
    ...(isIncompatibleUnitComparison(input.question, metricKeys)
      ? ['耗材消耗数量与收入金额单位不同，仅并列展示，不计算差额、变化率或投入产出；如需经营对比，应改用耗材成本金额。']
      : []),
  ])];
  const comparison = input.semanticIntent.answerShape === 'comparison' || pivotPaymentMethods || pivotReservationProjectTypes;
  const requiredAnswerFacts = deriveRequiredAnswerFacts(
    input.question,
    input.semanticIntent.answerShape,
    metricKeys,
    requestedPaymentMethods.length,
    pivotTransferDirections,
    pivotReservationProjectTypes,
  );
  return {
    metricKeys,
    viewNames,
    requiredViewNames: viewNames,
    requiredJoinKeys,
    selectFields: [...new Set([...identityFields, ...dimensionFields, ...aggregationSourceFields, ...entityFilters.map((filter) => filter.field), ...detailContextFields(input.question, viewNames, resultMode)])],
    requiredOutputFields,
    aggregations,
    dimensions,
    requiredGroupByFields,
    forbiddenGroupByFields: forbiddenGroupByFields(input.question, metricKeys),
    filters,
    entityFilters,
    ...(input.semanticIntent.timeRange ? { timeRange: input.semanticIntent.timeRange } : {}),
    timeScopeMode: timeScope.mode,
    ...(timeScope.fieldOverrides ? { timeFieldOverrides: timeScope.fieldOverrides } : {}),
    ...(timeGrain ? { timeGrain } : {}),
    ...(comparison ? { comparisonMode: comparisonMode(input.question, contracts.length, dimensions) } : {}),
    ...(sort.length ? { sort } : {}),
    limit,
    answerShape: input.semanticIntent.answerShape,
    resultMode,
    requireDistinctResult: /不同|去重/.test(input.question) && aggregations.length === 0,
    forbidAdditionalViews: true,
    assumptions,
    requiredAnswerFacts,
  };
}

function resolveRequiredJoinKeys(
  viewNames: string[],
  resultMode: AskDataControlledQueryPlan['resultMode'],
  views: ReadOnlySqlView[],
) {
  if (viewNames.length !== 2 || resultMode === 'scalar') return [];
  const governed = GOVERNED_SAME_KEY_VIEW_JOINS[[...viewNames].sort().join('|')] ?? [];
  if (governed.length) return governed;
  return resultMode === 'detail'
    && views.every((view) => view.fields.some((field) => field.name === 'customer_id' && field.policy !== 'deny'))
      ? ['customer_id']
      : [];
}

export function metricFieldsForAskData(metricKey: string) {
  return METRIC_FIELDS[metricKey] ?? [];
}

export function askDataTimeScopeOverrides(plan?: AskDataControlledQueryPlan) {
  if (!plan) return {};
  return {
    ...(plan.timeScopeMode !== 'event_range' ? { skipDefaultTimeScopeViewNames: plan.viewNames } : {}),
    ...(plan.timeFieldOverrides ? { timeScopeFieldOverrides: plan.timeFieldOverrides } : {}),
  };
}

export function askDataGuardParameters(
  plan: AskDataControlledQueryPlan | undefined,
  generated: Record<string, unknown>,
  resolvedRange?: AskDataSemanticIntent['timeRange'],
  now = new Date(),
) {
  const needsAsOfTime = plan?.filters.some((filter) => filter.operator === 'gte_as_of_time');
  const needsAsOfEndAt = plan?.filters.some((filter) => [
    'between_as_of_days',
    'lte_as_of',
    'gte_as_of',
    'gte_as_of_nullable',
  ].includes(filter.operator));
  if (plan && plan.timeScopeMode !== 'event_range') {
    return {
      ...(needsAsOfTime ? { asOfTime: now.toISOString() } : {}),
      ...(needsAsOfEndAt ? { endAt: resolvedRange?.endAt ?? now.toISOString() } : {}),
    };
  }
  return {
    ...generated,
    ...(resolvedRange ? { startAt: resolvedRange.startAt, endAt: resolvedRange.endAt } : {}),
    ...(needsAsOfTime ? { asOfTime: now.toISOString() } : {}),
  };
}

function resolveDimensionFields(key: string, views: ReadOnlySqlView[]) {
  for (const view of views) {
    const available = new Set(view.fields.filter((field) => field.policy !== 'deny').map((field) => field.name));
    const fields = (DIMENSION_FIELDS[key] ?? []).filter((candidate) => available.has(candidate));
    if (fields.length) return fields.map((field) => ({ key, field, viewName: view.viewName }));
  }
  return [];
}

function resolveDimensionKeys(
  question: string,
  metricKeys: string[],
  semanticKeys: string[],
  resultMode: AskDataControlledQueryPlan['resultMode'],
) {
  const keys = new Set(resultMode === 'scalar' ? [] : semanticKeys);
  if (resultMode === 'trend') keys.add('date');
  const add = (key: string, pattern: RegExp) => pattern.test(question) && keys.add(key);
  add('staff_level', /员工级别|员工职级|职级|级别/);
  add('member_level', /会员等级|按等级|各等级/);
  add('project_type', /项目类型|属于哪个项目类型|项目.*按类型|按类型.*项目/);
  add('activity', /哪些活动|各活动|每场活动|活动.*(?:亏钱|亏损|赔钱|不赚钱|排行|排名|roi|投产|投入产出|最高|最低)/i);
  add('operator', /操作人/);
  add('cost_category', /运营成本有哪些|经营成本有哪些|成本结构|费用结构|成本科目|费用科目|按成本类别|按费用类别/);
  add('cost_category', /成本项目异常增加/);
  add('promotion_type', /优惠类型|促销类型|按类型/);
  add('scope', /全局优惠和门店优惠|优惠范围|按范围/);
  add('offer', /各优惠活动|哪些优惠活动|优惠活动前\s*\d+|优惠活动.*最多/);
  add('feedback_type', /反馈类型|按类型统计.*反馈/);
  add('direction', /调入和调出|按方向|方向.*对比/);
  add('counterparty_store', /对方门店/);
  add('status', /按状态|各状态/);
  add('supplier', /各供应商|每家供应商|供应商.*(?:排行|前\s*[一二三四五六七八九十\d]+|比较)/);
  add('project', /按项目|各项目|每个项目|哪个项目|项目.*前\s*[一二三四五六七八九十\d]+|耗材最多的项目/);
  add('product', /按商品|各商品|每种商品|哪些商品|哪些产品|产品.*前\s*[一二三四五六七八九十\d]+|卖得最好.*(?:产品|商品)|(?:产品|商品).*卖得最好|(?:产品|商品).*动销|动销分析|补水|防晒|洗面奶|耗材/);
  add('item_type', /(?:商品|产品).*(?:项目|服务).*毛利|(?:项目|服务).*(?:商品|产品).*毛利|按品项类型|商品与项目/);
  add('cost_basis', /成本口径|成本来源|估算成本|成本完整性/);
  add('product', /缺货最紧急/);
  add('product', /有什么(?:产品|商品)|有没有什么(?:产品|商品)|(?:过期|临期).*(?:产品|商品|东西)|(?:产品|商品|东西).*过期/);
  add('product_category', /各品类|按品类|商品分类|产品分类/);
  add('card', /按次卡名称|各次卡|各卡项|每种次卡|每种卡项/);
  if (metricKeys.includes('inventory_on_hand') && /^[^，。？?]{2,24}(?:现在|当前)?库存(?:还有|剩)/.test(question) && !/库存整体|仓库/.test(question)) {
    keys.add('product');
  }
  add('date', /按日|每日|每天|日趋势|哪天|哪几天/);
  if (metricKeys.includes('appointment_gap')
    && /(?:本周|未来|最近|近\s*\d+\s*天).*(?:时段|空档)/.test(question)
    && !/合计|总计|一共/.test(question)) keys.add('date');
  add('source_channel', /来源|渠道/);
  add('payment_method', /支付方式|付款方式|现金.*(?:微信|支付宝)|微信.*(?:现金|支付宝)|支付宝.*(?:现金|微信)/);
  add('age_band', /年龄段/);
  add('customer_status', /新客|老客|回头客|沉睡客户|客户状态/);
  add('ltv_band', /消费金额分.*层|价值分层|价值档位|ltv/i);
  add('lifecycle_stage', /生命周期阶段/);
  add('risk_level', /流失风险(?:等级)?/);
  add('opportunity_type', /机会类型|客户机会/);
  add('offer', /权益.*吸引力/);
  add('automation', /自动化规则|自动化策略|触发类型|触达来源/);
  add('staff', /每位员工|每位美容师|各员工|各美容师|美容师.*(?:排行|前\s*[一二三四五六七八九十\d]+)/);
  if (resultMode === 'scalar' && !/按流失风险|各流失风险/.test(question)) keys.delete('risk_level');
  if (/按项目/.test(question) && !/按商品|按产品/.test(question)) keys.delete('product');
  if (metricKeys.includes('payment_customer_detail')) keys.add('customer');
  if (metricKeys.includes('service_quality') && /谁服务/.test(question)) keys.add('staff');
  if (metricKeys.includes('staff_capacity') && /哪个(?:员工|美容师)|哪位(?:员工|美容师)/.test(question)) keys.add('staff');
  if (metricKeys.includes('staff_performance') && /(?:谁|哪个|哪位).*(?:业绩|客人|进步)/.test(question)) keys.add('staff');
  if (metricKeys.includes('staff_profile') && /员工级别|职级/.test(question) && !/员工.*及其级别|美容师.*及其级别/.test(question)) {
    keys.delete('staff');
  }
  if (metricKeys.includes('customer_feedback') && /反馈类型/.test(question)) {
    keys.delete('customer');
    keys.delete('staff');
    keys.delete('project');
  }
  if (metricKeys.includes('item_contribution_margin')
    && /商品|产品/.test(question)
    && /项目|服务/.test(question)
    && /毛利/.test(question)) {
    keys.add('item_type');
    keys.delete('product');
    keys.delete('project');
  }
  if (metricKeys.includes('project_attributed_cost') && /项目/.test(question)) {
    keys.add('project');
    keys.delete('product');
  }
  if (metricKeys.includes('item_contribution_margin')
    && keys.has('cost_basis')
    && !/各项目|每个项目|按项目|各商品|每个商品|按商品|各产品|每个产品|按产品/.test(question)) {
    keys.delete('project');
    keys.delete('product');
  }
  if (metricKeys.includes('inventory_outbound_cost_estimate')
    && !/(?:按|各|每个|哪些)(?:产品|商品|耗材)|(?:产品|商品|耗材).*(?:排行|排名)/.test(question)) {
    keys.delete('product');
  }
  if (keys.has('project_type') && /按类型/.test(question)) keys.delete('project');
  if ((keys.has('lifecycle_stage') || keys.has('ltv_band')) && /怎么分布|按生命周期/.test(question)) keys.delete('customer');
  if (resultMode === 'detail' && !keys.size) {
    if (metricKeys.includes('customer_balance')) keys.add('customer');
    if (metricKeys.includes('staff_profile')) keys.add('staff');
  }
  return [...keys];
}

function metricAggregationsForQuestion(
  metricKey: string,
  question: string,
  resultMode: AskDataControlledQueryPlan['resultMode'],
) {
  if (metricKey === 'payment_customer_detail') return [];
  if (metricKey === 'order_revenue' && /订单实收/.test(question)) {
    return [sumZero('paid_amount', 'order_paid_amount')];
  }
  if (metricKey === 'order_revenue' && /订单净收.*日结净收/.test(question)) {
    return [sumZero('net_amount', 'net_revenue'), countDistinct('order_id', 'order_count')];
  }
  if (metricKey === 'order_revenue' && /客单价/.test(question)) {
    return [
      sum('net_amount', 'net_revenue'),
      countDistinct('order_id', 'order_count'),
      derived('average_order_value', 'SUM(net_amount) / NULLIF(COUNT(DISTINCT order_id), 0)', ['net_amount', 'order_id']),
    ];
  }
  if (metricKey === 'order_revenue' && /(?:这个月|本月|当月).*(?:上个月|上月)|(?:上个月|上月).*(?:这个月|本月|当月)/.test(question)) {
    return [
      derived(
        'current_period_net_revenue',
        "COALESCE(SUM(net_amount) FILTER (WHERE order_created_at >= DATE_TRUNC('month', :endAt::date) - INTERVAL '1 month' AND order_created_at < DATE_TRUNC('month', :endAt::date)), 0)",
        ['net_amount', 'order_created_at'],
      ),
      derived(
        'previous_period_net_revenue',
        "COALESCE(SUM(net_amount) FILTER (WHERE order_created_at >= DATE_TRUNC('month', :endAt::date) - INTERVAL '2 months' AND order_created_at < DATE_TRUNC('month', :endAt::date) - INTERVAL '1 month'), 0)",
        ['net_amount', 'order_created_at'],
      ),
      derived(
        'revenue_difference',
        "COALESCE(SUM(net_amount) FILTER (WHERE order_created_at >= DATE_TRUNC('month', :endAt::date) - INTERVAL '1 month' AND order_created_at < DATE_TRUNC('month', :endAt::date)), 0) - COALESCE(SUM(net_amount) FILTER (WHERE order_created_at >= DATE_TRUNC('month', :endAt::date) - INTERVAL '2 months' AND order_created_at < DATE_TRUNC('month', :endAt::date) - INTERVAL '1 month'), 0)",
        ['net_amount', 'order_created_at'],
      ),
    ];
  }
  if (metricKey === 'order_revenue' && /(?:这礼拜|本周).*(?:上礼拜|上周)|(?:上礼拜|上周).*(?:这礼拜|本周)/.test(question)) {
    return [
      derived(
        'current_period_net_revenue',
        "COALESCE(SUM(net_amount) FILTER (WHERE order_created_at >= DATE_TRUNC('week', :endAt::date) - INTERVAL '1 week' AND order_created_at < DATE_TRUNC('week', :endAt::date)), 0)",
        ['net_amount', 'order_created_at'],
      ),
      derived(
        'previous_period_net_revenue',
        "COALESCE(SUM(net_amount) FILTER (WHERE order_created_at >= DATE_TRUNC('week', :endAt::date) - INTERVAL '2 weeks' AND order_created_at < DATE_TRUNC('week', :endAt::date) - INTERVAL '1 week'), 0)",
        ['net_amount', 'order_created_at'],
      ),
      derived(
        'revenue_difference',
        "COALESCE(SUM(net_amount) FILTER (WHERE order_created_at >= DATE_TRUNC('week', :endAt::date) - INTERVAL '1 week' AND order_created_at < DATE_TRUNC('week', :endAt::date)), 0) - COALESCE(SUM(net_amount) FILTER (WHERE order_created_at >= DATE_TRUNC('week', :endAt::date) - INTERVAL '2 weeks' AND order_created_at < DATE_TRUNC('week', :endAt::date) - INTERVAL '1 week'), 0)",
        ['net_amount', 'order_created_at'],
      ),
    ];
  }
  if (metricKey === 'product_sales' && /扣掉退款|退款后/.test(question)) {
    return [
      sum('quantity', 'sales_quantity'),
      sum('net_amount', 'gross_net_sales_amount'),
      sum('refund_amount', 'refund_amount'),
      derived('net_sales_after_refund', 'SUM(net_amount) - SUM(refund_amount)', ['net_amount', 'refund_amount']),
    ];
  }
  if (metricKey === 'item_contribution_margin') return METRIC_FIELDS.item_contribution_margin;
  if (metricKey === 'project_attributed_cost') return METRIC_FIELDS.project_attributed_cost;
  if (metricKey === 'below_cost_sale') return METRIC_FIELDS.below_cost_sale;
  if (metricKey === 'project_sales' && /毛利|利润贡献/.test(question)) {
    return [
      sum('net_amount', 'project_revenue'),
      sum('estimated_margin', 'estimated_margin'),
    ];
  }
  if (metricKey === 'payment_flow') {
    if (/订单实收.*支付流水金额/.test(question)) {
      return [sumZero('payment_amount', 'payment_amount'), sumZero('refund_amount', 'refund_amount'), countZero('order_id', 'flow_count')];
    }
    const requestedMethods = resolveRequestedPaymentMethods(question);
    if (requestedMethods.length > 1) {
      return requestedMethods.map((method) => derived(
        `${method.key}_payment_amount`,
        `COALESCE(SUM(payment_amount) FILTER (WHERE payment_method IN (${method.values.map((value) => `'${value}'`).join(', ')})), 0)`,
        ['payment_amount', 'payment_method'],
      ));
    }
    if (requestedMethods.length === 1 && /收了多少现金|现金收款/.test(question)) {
      return [derived(
        'cash_payment_amount',
        `COALESCE(SUM(payment_amount) FILTER (WHERE payment_method IN (${requestedMethods[0].values.map((value) => `'${value}'`).join(', ')})), 0)`,
        ['payment_amount', 'payment_method'],
      )];
    }
    if (!/退款|流水|记录|笔数/.test(question) && /收了多少钱|收款汇总|实际收款|总收款|收款多少|收了多少/.test(question)) {
      return [sumZero('payment_amount', 'payment_amount')];
    }
    if (/本月退款和上月比增加了多少/.test(question)) {
      return [
        derived(
          'current_period_refund_amount',
          "COALESCE(SUM(refund_amount) FILTER (WHERE refunded_at >= DATE_TRUNC('month', :endAt::date) - INTERVAL '1 month' AND refunded_at < DATE_TRUNC('month', :endAt::date)), 0)",
          ['refund_amount', 'refunded_at'],
        ),
        derived(
          'previous_period_refund_amount',
          "COALESCE(SUM(refund_amount) FILTER (WHERE refunded_at >= DATE_TRUNC('month', :endAt::date) - INTERVAL '2 months' AND refunded_at < DATE_TRUNC('month', :endAt::date) - INTERVAL '1 month'), 0)",
          ['refund_amount', 'refunded_at'],
        ),
        derived(
          'refund_amount_difference',
          "COALESCE(SUM(refund_amount) FILTER (WHERE refunded_at >= DATE_TRUNC('month', :endAt::date) - INTERVAL '1 month' AND refunded_at < DATE_TRUNC('month', :endAt::date)), 0) - COALESCE(SUM(refund_amount) FILTER (WHERE refunded_at >= DATE_TRUNC('month', :endAt::date) - INTERVAL '2 months' AND refunded_at < DATE_TRUNC('month', :endAt::date) - INTERVAL '1 month'), 0)",
          ['refund_amount', 'refunded_at'],
        ),
      ];
    }
  }
  if (metricKey === 'daily_net_receipts' && /订单净收.*日结净收/.test(question)) {
    return [sumZero('net_amount', 'net_receipts'), sumZero('order_count', 'order_count')];
  }
  if (metricKey === 'daily_net_receipts' && /(?:收入汇总|每天的收入情况)/.test(question)) {
    return [
      sum('revenue_amount', 'revenue_amount'),
      sum('paid_amount', 'paid_amount'),
      sum('refund_amount', 'refund_amount'),
      sum('net_amount', 'net_receipts'),
      sum('order_count', 'order_count'),
      sum('customer_count', 'customer_count'),
    ];
  }
  if (metricKey === 'inventory_usage_balance') return METRIC_FIELDS.inventory_usage_balance;
  if (metricKey === 'inventory_loss_rate') return METRIC_FIELDS.inventory_loss_rate;
  if (metricKey === 'inventory_days_of_stock') {
    if (resultMode === 'scalar') {
      return [
        sum('current_stock', 'current_stock'),
        sum('avg_daily_outbound_30d', 'avg_daily_outbound_30d'),
        derived('days_of_stock_30d', 'SUM(current_stock) / NULLIF(SUM(avg_daily_outbound_30d), 0)', ['current_stock', 'avg_daily_outbound_30d']),
      ];
    }
    return METRIC_FIELDS.inventory_days_of_stock;
  }
  if (metricKey === 'inventory_operational_turnover') {
    if (resultMode === 'scalar') {
      return [
        sum('outbound_quantity_30d', 'outbound_quantity_30d'),
        sum('event_weighted_avg_stock_30d', 'event_weighted_avg_stock_30d'),
        derived('operational_turnover_ratio_30d', 'SUM(outbound_quantity_30d) / NULLIF(SUM(event_weighted_avg_stock_30d), 0)', ['outbound_quantity_30d', 'event_weighted_avg_stock_30d']),
      ];
    }
    return METRIC_FIELDS.inventory_operational_turnover;
  }
  if (metricKey === 'inventory_slow_moving') {
    if (resultMode === 'scalar') return [countDistinct('product_id', 'slow_moving_product_count')];
    return METRIC_FIELDS.inventory_slow_moving;
  }
  if (metricKey === 'inventory_demand_change') {
    if (resultMode === 'scalar') {
      return [
        sum('outbound_quantity_30d', 'outbound_quantity_30d'),
        sum('outbound_quantity_previous_30d', 'outbound_quantity_previous_30d'),
        derived('demand_change_rate_30d', '(SUM(outbound_quantity_30d) - SUM(outbound_quantity_previous_30d)) / NULLIF(SUM(outbound_quantity_previous_30d), 0)', ['outbound_quantity_30d', 'outbound_quantity_previous_30d']),
      ];
    }
    return METRIC_FIELDS.inventory_demand_change;
  }
  if (metricKey === 'inventory_procurement_coverage') {
    if (resultMode === 'scalar') return [countDistinct('product_id', 'uncovered_product_count')];
    return METRIC_FIELDS.inventory_procurement_coverage;
  }
  if (metricKey === 'inventory_outbound_usage') {
    const sourceField = /(?:这|这个|本)季度/.test(question)
      ? 'outbound_quantity_current_quarter'
      : /(?:这|这个|本)月/.test(question)
        ? 'outbound_quantity_current_month'
        : /(?:每天|每日|日均)/.test(question)
          ? 'avg_daily_outbound_30d'
          : 'outbound_quantity_30d';
    return resultMode === 'scalar' ? [sum(sourceField, sourceField)] : [none(sourceField, sourceField)];
  }
  if (metricKey === 'inventory_outbound_cost_estimate') {
    const sourceField = /(?:这|这个|本)月/.test(question)
      ? 'estimated_avg_daily_outbound_cost_current_month'
      : 'estimated_avg_daily_outbound_cost_30d';
    return resultMode === 'scalar' ? [sum(sourceField, sourceField)] : [none(sourceField, sourceField)];
  }
  if (metricKey === 'payment_order_difference') return METRIC_FIELDS.payment_order_difference;
  if (metricKey === 'inventory_movement' && /(?:耗材.*消耗|消耗速度)/.test(question)) {
    return [sumAbsZero('quantity', 'movement_quantity')];
  }
  if (metricKey === 'inventory_movement' && /库存消耗/.test(question)) {
    return [sumAbsZero('quantity', 'movement_quantity')];
  }
  if (metricKey === 'inventory_movement' && /调拨出库/.test(question)) {
    return [sumAbsZero('quantity', 'movement_quantity'), countZero('movement_id', 'movement_count')];
  }
  if (metricKey === 'inventory_movement' && /(?:净出库量|出库量)/.test(question)) {
    return [sumAbsZero('quantity', 'movement_quantity'), count('movement_id', 'movement_count')];
  }
  if (metricKey === 'inventory_movement' && resultMode === 'detail') {
    return [none('quantity', 'movement_quantity')];
  }
  if (metricKey === 'customer_profile') {
    if (/平均多久回来|平均复购.*间隔/.test(question)) {
      return [avg('average_return_interval_days', 'average_return_interval_days')];
    }
    if (/次卡.*(?:剩余|没使用|不来)|次数快用完/.test(question)) {
      return [sum('remaining_card_times', 'remaining_card_times'), sum('unused_card_count', 'unused_card_count')];
    }
    if (/来源|渠道|年龄段|新客|老客|回头客|沉睡|快过生日|多久没来|没来的客户|分.*层/.test(question)) {
      return [countDistinct('customer_id', 'customer_count')];
    }
    if (resultMode === 'detail') return [];
  }
  if (metricKey === 'customer_balance' && /储值余额|总余额|余额最高/.test(question)) {
    if (resultMode === 'detail') {
      return [none('cash_balance', 'cash_balance'), none('gift_balance', 'gift_balance')];
    }
    return [
      sum('cash_balance', 'cash_balance'),
      sum('gift_balance', 'gift_balance'),
      derived('total_balance', 'SUM(cash_balance) + SUM(gift_balance)', ['cash_balance', 'gift_balance']),
    ];
  }
  if (metricKey === 'card_assets' && resultMode === 'detail') {
    return [none('remaining_times', 'remaining_times')];
  }
  if (metricKey === 'card_usage' && resultMode === 'detail') {
    return [none('times', 'usage_times'), none('recognized_amount', 'recognized_amount')];
  }
  if (metricKey === 'service_quality' && resultMode === 'detail') return [];
  if (metricKey === 'customer_lifecycle' && resultMode === 'detail') return [];
  if (metricKey === 'customer_lifecycle' && /机会评分/.test(question)) {
    return [none('top_score', 'top_score')];
  }
  if (metricKey === 'customer_lifecycle' && /客户数量|多少客户|多少人/.test(question)) {
    return [countDistinct('customer_id', 'customer_count')];
  }
  if (metricKey === 'inventory_scrap') {
    if (resultMode === 'detail') return [none('scrap_quantity', 'scrap_quantity'), none('loss_amount', 'loss_amount')];
    if (/平均损耗/.test(question)) return [avg('loss_amount', 'average_loss_amount')];
  }
  if (metricKey === 'inventory_on_hand' && resultMode === 'ranking' && /(?:缺货最紧急|最容易过期)/.test(question)) {
    return [
      none('current_stock', 'current_stock'),
      none('safety_stock', 'safety_stock'),
      none('nearest_expiry_date', 'nearest_expiry_date'),
    ];
  }
  if (metricKey === 'procurement_detail' && /每家供应商.*未到货采购单/.test(question)) {
    return [countDistinct('procurement_id', 'pending_procurement_count')];
  }
  if (metricKey === 'procurement_detail' && /一般一次买多少|平均.*采购|采购.*平均(?!交付|交货|到货)/.test(question)) {
    return [avg('total_amount', 'average_procurement_amount')];
  }
  if (metricKey === 'procurement_detail' && resultMode === 'detail') {
    return [none('total_amount', 'procurement_amount')];
  }
  if (metricKey === 'promotion_offer') {
    if (/活动数量|有多少个|各有多少个/.test(question)) return [countDistinct('promotion_id', 'promotion_count')];
    if (/使用次数最多|使用数量|使用数|核销/.test(question) && !/发放/.test(question)) return [sum('used_count', 'used_count')];
    if (resultMode === 'detail') return [none('issued_count', 'issued_count'), none('used_count', 'used_count')];
  }
  if (metricKey === 'reconciliation_issue' && resultMode === 'detail') return [];
  if (metricKey === 'member_liability' && /预付了但还没使用/.test(question)) {
    return [
      max('snapshot_date', 'snapshot_date'),
      sum('total_liability', 'total_liability'),
      max('confirmed_at', 'confirmed_at'),
    ];
  }
  if (metricKey === 'member_liability' && /(?:储值负债.*次卡负债|次卡负债.*储值负债)/.test(question)) {
    return [
      derived(
        'stored_value_liability',
        'SUM(cash_contract_liability) + SUM(gift_obligation)',
        ['cash_contract_liability', 'gift_obligation'],
      ),
      sum('card_liability', 'card_liability'),
    ];
  }
  if (metricKey === 'member_liability' && /现金合同负债.*赠送义务.*次卡负债|现金合同负债.*次卡负债.*赠送义务/.test(question)) {
    return [
      sum('cash_contract_liability', 'cash_contract_liability'),
      sum('gift_obligation', 'gift_obligation'),
      sum('card_liability', 'card_liability'),
      sum('total_liability', 'total_liability'),
      max('confirmed_at', 'confirmed_at'),
    ];
  }
  if (metricKey === 'member_liability' && /确认快照/.test(question)) {
    return [sum('total_liability', 'total_liability'), max('confirmed_at', 'confirmed_at')];
  }
  if (metricKey === 'operating_cost' && /成本项目异常增加/.test(question)) {
    return [
      derived(
        'current_period_cost',
        "COALESCE(SUM(amount) FILTER (WHERE cost_date >= DATE_TRUNC('month', :endAt::date) - INTERVAL '1 month' AND cost_date < DATE_TRUNC('month', :endAt::date)), 0)",
        ['amount', 'cost_date'],
      ),
      derived(
        'previous_period_cost',
        "COALESCE(SUM(amount) FILTER (WHERE cost_date >= DATE_TRUNC('month', :endAt::date) - INTERVAL '2 months' AND cost_date < DATE_TRUNC('month', :endAt::date) - INTERVAL '1 month'), 0)",
        ['amount', 'cost_date'],
      ),
      derived(
        'cost_difference',
        "COALESCE(SUM(amount) FILTER (WHERE cost_date >= DATE_TRUNC('month', :endAt::date) - INTERVAL '1 month' AND cost_date < DATE_TRUNC('month', :endAt::date)), 0) - COALESCE(SUM(amount) FILTER (WHERE cost_date >= DATE_TRUNC('month', :endAt::date) - INTERVAL '2 months' AND cost_date < DATE_TRUNC('month', :endAt::date) - INTERVAL '1 month'), 0)",
        ['amount', 'cost_date'],
      ),
    ];
  }
  if (metricKey === 'operating_cost' && /成本科目.*占比/.test(question)) {
    return [
      sum('amount', 'operating_cost'),
      derived('cost_share', 'SUM(amount) / NULLIF(SUM(SUM(amount)) OVER (), 0)', ['amount']),
    ];
  }
  if (metricKey === 'marketing_activity') {
    if (/多少个|活动数量/.test(question)) return [countDistinct('activity_id', 'activity_count')];
    if (resultMode === 'detail') return [];
    if (/参与人数.*转化数|转化数.*参与人数/.test(question)) {
      return [sum('participants', 'participants')];
    }
    return [sum('participants', 'participants')];
  }
  if (metricKey === 'project_catalog' && /按类型.*(?:各有多少|平均价格)|各类型.*(?:数量|平均价格)/.test(question)) {
    return [countDistinct('project_id', 'project_count'), avg('price', 'average_price')];
  }
  if (metricKey === 'confirmed_profit' && /各项成本.*毛利|材料.*商品.*提成.*经营成本/.test(question)) {
    return [
      sum('material_cost', 'material_cost'),
      sum('product_cost', 'product_cost'),
      sum('commission_cost', 'commission_cost'),
      sum('operating_cost', 'operating_cost'),
      sum('gross_profit', 'gross_profit'),
      sum('operating_profit', 'operating_profit'),
      max('confirmed_at', 'confirmed_at'),
    ];
  }
  if (metricKey === 'staff_profile' && /最近入职/.test(question)) return [];
  if (metricKey === 'staff_profile' && (resultMode === 'detail' || /不同的职级|有哪些.*职级/.test(question))) {
    return /多少人/.test(question) ? [countDistinct('staff_id', 'staff_count')] : [];
  }
  if (metricKey === 'supplier_performance') return METRIC_FIELDS.supplier_performance;
  if (metricKey === 'supplier_latest_quote') {
    return resultMode === 'detail'
      ? [none('quote_price', 'quote_price'), none('minimum_order_quantity', 'minimum_order_quantity'), none('lead_days', 'lead_days')]
      : METRIC_FIELDS.supplier_latest_quote;
  }
  if (metricKey === 'supplier_price_comparison') return METRIC_FIELDS.supplier_price_comparison;
  if (metricKey === 'supplier_minimum_order_quantity') return METRIC_FIELDS.supplier_minimum_order_quantity;
  if (metricKey === 'supplier_payment_terms') return METRIC_FIELDS.supplier_payment_terms;
  if (metricKey === 'supplier_lead_time') return METRIC_FIELDS.supplier_lead_time;
  if (metricKey === 'reservation_metrics' && /(?:面部).*(?:预约).*(?:身体)|(?:预约).*(?:面部).*(?:身体)/.test(question)) {
    return [
      derived(
        'face_reservation_count',
        "COUNT(DISTINCT reservation_id) FILTER (WHERE project_type LIKE '%面部%')",
        ['reservation_id', 'project_type'],
      ),
      derived(
        'body_reservation_count',
        "COUNT(DISTINCT reservation_id) FILTER (WHERE project_type LIKE '%身体%')",
        ['reservation_id', 'project_type'],
      ),
    ];
  }
  if (metricKey === 'reservation_metrics' && /预约到店转化率/.test(question)) {
    return [
      derived(
        'reservation_count',
        "COUNT(DISTINCT reservation_id) FILTER (WHERE status NOT IN ('cancelled', 'canceled'))",
        ['reservation_id', 'status'],
      ),
      derived(
        'completed_reservation_count',
        "COUNT(DISTINCT reservation_id) FILTER (WHERE status IN ('checked_in', 'completed'))",
        ['reservation_id', 'status'],
      ),
      derived(
        'arrival_conversion_rate',
        "COUNT(DISTINCT reservation_id) FILTER (WHERE status IN ('checked_in', 'completed'))::numeric / NULLIF(COUNT(DISTINCT reservation_id) FILTER (WHERE status NOT IN ('cancelled', 'canceled')), 0)",
        ['reservation_id', 'status'],
      ),
    ];
  }
  if (metricKey === 'reservation_metrics' && resultMode === 'detail') return [];
  if (metricKey === 'inventory_on_hand' && resultMode === 'detail') {
    return [none('current_stock', 'current_stock'), none('safety_stock', 'safety_stock'), none('stock_value', 'stock_value')];
  }
  if (metricKey === 'marketing_automation') {
    return [
      sum('task_count', 'task_count'),
      sum('completed_count', 'completed_count'),
      derived('completion_rate', 'SUM(completed_count)::numeric / NULLIF(SUM(task_count), 0)', ['completed_count', 'task_count']),
      max('status', 'status'),
      max('latest_task_at', 'latest_task_at'),
    ];
  }
  if (metricKey === 'marketing_conversion' && /转化率/.test(question)) {
    return [
      sum('lead_count', 'lead_count'),
      sum('conversion_count', 'conversion_count'),
      derived(
        'conversion_rate',
        'SUM(conversion_count)::numeric / NULLIF(SUM(lead_count), 0)',
        ['conversion_count', 'lead_count'],
      ),
    ];
  }
  if (metricKey === 'marketing_roi' && /权益.*吸引力/.test(question)) {
    return [
      sum('exposure_count', 'exposure_count'),
      sum('conversion_count', 'conversion_count'),
      derived('conversion_rate', 'SUM(conversion_count) / NULLIF(SUM(exposure_count), 0)', ['conversion_count', 'exposure_count']),
      max('cost_source', 'cost_source'),
    ];
  }
  if (metricKey === 'marketing_roi' && /活动花了多少.*带来了多少收入/.test(question)) {
    return [
      sum('marketing_cost', 'marketing_cost'),
      sum('attributed_net_revenue', 'attributed_net_revenue'),
      derived('roi', 'SUM(attributed_net_revenue) / NULLIF(SUM(marketing_cost), 0)', ['attributed_net_revenue', 'marketing_cost']),
      max('cost_source', 'cost_source'),
    ];
  }
  if (metricKey === 'staff_performance' && /进步最快/.test(question)) {
    return [
      derived(
        'current_period_paid_amount',
        "COALESCE(SUM(paid_amount) FILTER (WHERE settle_month >= DATE_TRUNC('month', :endAt::date) - INTERVAL '1 month' AND settle_month < DATE_TRUNC('month', :endAt::date)), 0)",
        ['paid_amount', 'settle_month'],
      ),
      derived(
        'previous_period_paid_amount',
        "COALESCE(SUM(paid_amount) FILTER (WHERE settle_month >= DATE_TRUNC('month', :endAt::date) - INTERVAL '2 months' AND settle_month < DATE_TRUNC('month', :endAt::date) - INTERVAL '1 month'), 0)",
        ['paid_amount', 'settle_month'],
      ),
      derived(
        'paid_amount_difference',
        "COALESCE(SUM(paid_amount) FILTER (WHERE settle_month >= DATE_TRUNC('month', :endAt::date) - INTERVAL '1 month' AND settle_month < DATE_TRUNC('month', :endAt::date)), 0) - COALESCE(SUM(paid_amount) FILTER (WHERE settle_month >= DATE_TRUNC('month', :endAt::date) - INTERVAL '2 months' AND settle_month < DATE_TRUNC('month', :endAt::date) - INTERVAL '1 month'), 0)",
        ['paid_amount', 'settle_month'],
      ),
    ];
  }
  if (metricKey === 'customer_feedback' && /客诉最多.*最近有没有/.test(question)) {
    return [
      countDistinct('feedback_id', 'feedback_count'),
      max('occurred_at', 'latest_feedback_at'),
    ];
  }
  if (metricKey === 'marketing_roi' && /自动化策略.*转化最好/.test(question)) {
    return [
      sum('exposure_count', 'exposure_count'),
      sum('conversion_count', 'conversion_count'),
      derived('conversion_rate', 'SUM(conversion_count) / NULLIF(SUM(exposure_count), 0)', ['conversion_count', 'exposure_count']),
    ];
  }
  if (metricKey === 'marketing_roi' && /自动化策略.*转化漏斗/.test(question)) {
    return [
      sum('exposure_count', 'exposure_count'),
      sum('click_count', 'click_count'),
      sum('conversion_count', 'conversion_count'),
      derived('conversion_rate', 'SUM(conversion_count) / NULLIF(SUM(exposure_count), 0)', ['conversion_count', 'exposure_count']),
    ];
  }
  if (metricKey === 'marketing_roi' && /(?:获客|拓客)成本/.test(question)) {
    return [
      sum('marketing_cost', 'marketing_cost'),
      sum('conversion_count', 'conversion_count'),
      derived('acquisition_cost', 'SUM(marketing_cost) / NULLIF(SUM(conversion_count), 0)', ['marketing_cost', 'conversion_count']),
    ];
  }
  if (metricKey === 'marketing_roi' && /活动.*(?:亏钱|亏损|赔钱|不赚钱)/.test(question)) {
    return [
      sum('attributed_net_revenue', 'attributed_net_revenue'),
      sum('marketing_cost', 'marketing_cost'),
      derived(
        'marketing_profit',
        'SUM(attributed_net_revenue) - SUM(marketing_cost)',
        ['attributed_net_revenue', 'marketing_cost'],
      ),
      derived(
        'roi',
        'SUM(attributed_net_revenue) / NULLIF(SUM(marketing_cost), 0)',
        ['attributed_net_revenue', 'marketing_cost'],
      ),
    ];
  }
  if (metricKey === 'marketing_roi' && /(?:估算|估算成本|成本来源)/.test(question)) {
    return [
      ...METRIC_FIELDS.marketing_roi,
      max('cost_source', 'cost_source'),
    ];
  }
  if (metricKey === 'customer_feedback' && resultMode === 'detail') {
    if (/(?:投诉|客诉|不满|体验不佳|差评|负面反馈)/.test(question) && !/(?:多少|数量|统计|最多|排行|排名|平均)/.test(question)) {
      return [];
    }
    return [
      countDistinct('feedback_id', 'feedback_count'),
      avg('rating', 'average_rating'),
    ];
  }
  if (metricKey === 'confirmed_profit' && /已确认月结/.test(question)) {
    return [
      ...METRIC_FIELDS.confirmed_profit,
      max('confirmed_at', 'confirmed_at'),
    ];
  }
  if (metricKey === 'confirmed_profit' && /耗材成本占/.test(question)) {
    return [
      sum('material_cost', 'material_cost'),
      sum('operating_revenue', 'operating_revenue'),
      derived('material_cost_rate', 'SUM(material_cost) / NULLIF(SUM(operating_revenue), 0)', ['material_cost', 'operating_revenue']),
    ];
  }
  if (metricKey === 'bom_variance' && /哪个项目.*耗材最多/.test(question)) {
    return [sum('actual_qty', 'actual_qty')];
  }
  if (metricKey === 'service_quality' && /谁服务了几个客人/.test(question)) {
    return [countDistinct('service_task_id', 'service_task_count')];
  }
  if (metricKey === 'bom_variance') {
    if (resultMode === 'detail') {
      return [none('standard_qty', 'standard_qty'), none('actual_qty', 'actual_qty'), none('deviation_qty', 'deviation_qty'), none('deviation_rate', 'deviation_rate')];
    }
    if (/一共有多少条|多少条.*异常/.test(question)) return [countDistinct('movement_id', 'abnormal_record_count')];
  }
  if (metricKey === 'transfer_status') {
    if (/调出单数量.*调拨出库/.test(question)) {
      return [countDistinct('transfer_id', 'transfer_count'), sumZero('product_count', 'product_count')];
    }
    if (/调入和调出.*(?:数量|调拨单).*对比|调入.*调出.*(?:数量|调拨单)/.test(question)) {
      return [
        derived('inbound_transfer_count', "COUNT(DISTINCT transfer_id) FILTER (WHERE direction IN ('inbound', 'in'))", ['transfer_id', 'direction']),
        derived('outbound_transfer_count', "COUNT(DISTINCT transfer_id) FILTER (WHERE direction IN ('outbound', 'out'))", ['transfer_id', 'direction']),
        derived(
          'transfer_count_difference',
          "COUNT(DISTINCT transfer_id) FILTER (WHERE direction IN ('outbound', 'out')) - COUNT(DISTINCT transfer_id) FILTER (WHERE direction IN ('inbound', 'in'))",
          ['transfer_id', 'direction'],
        ),
      ];
    }
    if (resultMode === 'detail' || resultMode === 'ranking') return [none('product_count', 'product_count')];
    if (/一共有多少张|多少张/.test(question)) return [countDistinct('transfer_id', 'transfer_count')];
  }
  return METRIC_FIELDS[metricKey] ?? [];
}

function crossMetricAggregationsForQuestion(question: string, metricKeys: string[]): AskDataQueryAggregation[] {
  if (metricKeys.includes('order_revenue') && metricKeys.includes('daily_net_receipts') && /订单净收.*日结净收.*差额/.test(question)) {
    return [derived(
      'order_settlement_difference',
      "(SELECT COALESCE(SUM(net_amount), 0) FROM agent_v3_order_summary_view WHERE store_id = :storeId AND order_created_at >= :startAt AND order_created_at < :endAt) - (SELECT COALESCE(SUM(net_amount), 0) FROM agent_v3_daily_settlement_view WHERE store_id = :storeId AND settlement_date >= :startAt::date AND settlement_date < :endAt::date)",
      ['net_amount', 'net_amount'],
    )];
  }
  if (metricKeys.includes('order_revenue') && metricKeys.includes('payment_flow') && /订单实收.*支付流水金额.*差额/.test(question)) {
    return [derived(
      'order_payment_difference',
      "(SELECT COALESCE(SUM(paid_amount), 0) FROM agent_v3_order_summary_view WHERE store_id = :storeId AND order_created_at >= :startAt AND order_created_at < :endAt) - (SELECT COALESCE(SUM(payment_amount), 0) FROM agent_v3_payment_refund_view WHERE store_id = :storeId AND paid_at >= :startAt AND paid_at < :endAt)",
      ['paid_amount', 'payment_amount'],
    )];
  }
  return [];
}

function resolveResultMode(question: string, answerShape: AskDataSemanticIntent['answerShape']): AskDataControlledQueryPlan['resultMode'] {
  if (/(?:这礼拜|本周).*(?:上礼拜|上周).*(?:差额|差多少|放一起)|(?:上礼拜|上周).*(?:这礼拜|本周).*(?:差额|差多少|放一起)/.test(question)) return 'scalar';
  if (/(?:这个月|本月|当月).*(?:上个月|上月).*(?:差多少|相差|比较|对比)|(?:上个月|上月).*(?:这个月|本月|当月).*(?:差多少|相差|比较|对比)/.test(question)) return 'scalar';
  if (/(?:储值负债.*次卡负债|次卡负债.*储值负债).*分别多少/.test(question)) return 'scalar';
  if (/现金合同负债.*赠送义务.*次卡负债.*各多少/.test(question)) return 'scalar';
  if (/活动数量.*优惠数量.*分别多少|调出单数量.*出库流水条数.*分别多少|订单实收.*支付流水金额.*差额/.test(question)) return 'scalar';
  if (/现金余额.*赠送余额.*分别(?:合计)?多少/.test(question)) return 'scalar';
  // This wording asks for one aggregate per staff member. A generic list
  // would otherwise become raw detail rows and drop service_task_count.
  if (/谁服务了几个客人/.test(question)) return 'grouped';
  if (/(?:按次卡名称|按卡项名称).*(?:统计|核销)|(?:各|按)操作人.*(?:报废|报损)|每个项目.*(?:收入占比|营收占比)|各员工级别.*(?:多少|统计)|各美容师.*(?:排班|空档)|各对方门店.*(?:调入|调出)|按\s*(?:流失风险等级|客户生命周期阶段|生命周期阶段|LTV\s*档位).*统计/i.test(question)) {
    return 'grouped';
  }
  if (/最后一个预约/.test(question)) return 'detail';
  if (/(?:下午两点|下午2点|\b14[:：]00\b).*(?:客人|客户).*(?:什么项目|做什么)|(?:什么项目|做什么).*(?:下午两点|下午2点|\b14[:：]00\b)/.test(question)) return 'detail';
  if (/有什么(?:产品|商品).*可以卖|有没有什么(?:产品|商品).*只剩|\d+天内.*(?:过期|临期)|(?:过期|临期).*(?:产品|商品|东西)/.test(question)) return 'detail';
  if (/(?:未来|接下来).*(?:仍有效|有效).*优惠|(?:仍有效|当前有效).*优惠/.test(question)) return 'detail';
  if (/哪个(?:员工|美容师).*可以接新单|可以接新单.*哪个(?:员工|美容师)/.test(question)) return 'ranking';
  if (/(?:消耗异常|异常消耗).*(?:产品|商品)|(?:产品|商品).*(?:消耗异常|异常消耗)/.test(question)) return 'detail';
  if (/缺货最紧急的是什么/.test(question)) return 'ranking';
  if (/这个月有没有不正常的流水|这个月的财务数据有没有异常/.test(question)) return 'detail';
  if (/(?:哪些|哪个).*时段.*预约最满|预约.*(?:哪些|哪个).*时段.*最满/.test(question)) return 'ranking';
  if (/临期库存.*(?:损失风险|风险有多大)/.test(question)) return 'detail';
  if (/调入和调出.*(?:数量|调拨单).*对比|调入.*调出.*(?:数量|调拨单)/.test(question)) return 'scalar';
  if (/有哪些不同的职级|有哪些.*职级|不同的员工职级/.test(question)) return 'grouped';
  if (/支付方式.*(?:结构|分布|分别|各)/.test(question)) return 'grouped';
  if (/预约.*都有谁|预约了但还没来.*客人|还没来的客人/.test(question)) return 'detail';
  if (/哪天最忙.*空档/.test(question)) return 'grouped';
  if (/哪里有空位|哪个时段可以加客/.test(question)) return 'detail';
  if (/最近采购了什么|采购了什么.*花了多少钱/.test(question)) return 'detail';
  if (answerShape === 'ranking') return 'ranking';
  if (answerShape === 'trend') return 'trend';
  if (/按最高优先级机会类型统计|按.*(?:类型|状态|级别|职级|方向|范围|项目).*(?:统计|汇总|各有多少|分别)|每(?:位|家|场|种|个).*(?:分别|多少|对比|累计|采购|金额|次数)|各(?:会员等级|成本科目|供应商|项目|商品|品类|活动).*(?:多少|汇总|分布|销售|金额|占比)|怎么分布|运营成本有哪些.*各多少|经营成本有哪些.*各多少/.test(question)) {
    return 'grouped';
  }
  if (/历史采购记录.*一般一次买多少|活动归因的收益分别多少/.test(question)) return 'scalar';
  if (/BOM\s*消耗异常记录一共有多少条|BOM.*异常.*多少条/i.test(question)) return 'scalar';
  if (/今天有没有超过接待能力|有没有超过接待能力|是否超过接待能力/.test(question)) return 'scalar';
  if (/有没有.*(?:漏收|多收|重复收费|双计费|重复退款|重复消费)|核对.*(?:收款|系统记录).*(?:一致|平不平)|成本项目异常增加|有没有耗材被浪费|使用不规范/.test(question)) {
    return 'detail';
  }
  if (/哪一张|第一笔收款|首笔收款|下一个预约|全部预约|服务流程安排|到店客人的基本信息|哪些|有哪些|列出|清单|名单|逐条|由谁|所有|明细|记录|流水|最近入职|当前在职.*及其|待接收|未完成.*单|未解决.*反馈|即将结束.*活动|当前.*优惠|找(?:一下|下)?.*客户|的客户(?:$|，|。)|有没有.*(?:记录|情况|客户)/.test(question)) return 'detail';
  if (answerShape === 'list') return 'detail';
  if (answerShape === 'scalar') return 'scalar';
  return 'grouped';
}

function resolveSort(
  question: string,
  aggregations: AskDataQueryAggregation[],
  dimensions: AskDataControlledQueryPlan['dimensions'],
  resultMode: AskDataControlledQueryPlan['resultMode'],
) {
  if (!['ranking', 'detail'].includes(resultMode)) return [];
  const byAlias = (alias: string) => aggregations.some((item) => item.alias === alias) ? alias : undefined;
  const explicitlyRequestedField =
    (/即将结束/.test(question) ? 'end_at' : undefined) ??
    (/(?:第一笔|首笔)收款/.test(question) ? 'paid_at' : undefined) ??
    (/最后一个预约/.test(question) ? 'start_time' : undefined) ??
    (/下一个预约/.test(question) ? 'start_time' : undefined) ??
    (/(?:可以接新单|空闲分钟|空闲.*最多)/.test(question) ? byAlias('idle_minutes') : undefined) ??
    (/使用次数|使用数量/.test(question) ? byAlias('used_count') : undefined) ??
    (/确认收入/.test(question) ? byAlias('recognized_amount') : undefined) ??
    (/发放数量/.test(question) ? byAlias('issued_count') : undefined) ??
    (/偏差率/.test(question) ? byAlias('deviation_rate') : undefined) ??
    (/耗材最多/.test(question) ? byAlias('actual_qty') : undefined) ??
    (/(?:毛利率|贡献毛利率).*(?:最高|最低|排行|排名)|(?:最高|最低).*(?:毛利率|贡献毛利率)/.test(question) ? byAlias('contribution_margin_rate') : undefined) ??
    (/(?:项目|耗材).*成本.*(?:最高|最多|排行|排名)|(?:最高|最多).*(?:项目|耗材).*成本/.test(question) ? byAlias('attributed_cost') : undefined) ??
    (/(?:亏损|亏本|低于成本|毛利最低)/.test(question) ? byAlias('contribution_margin') : undefined) ??
    (/(?:贡献)?毛利.*(?:最高|最低|排行|排名)|(?:最高|最低).*(?:贡献)?毛利/.test(question) ? byAlias('contribution_margin') : undefined) ??
    (/利润贡献|项目毛利/.test(question) ? byAlias('estimated_margin') : undefined) ??
    (/贡献.*主要营收/.test(question) ? byAlias('project_revenue') : undefined) ??
    (/(?:获客|拓客)成本/.test(question) ? byAlias('acquisition_cost') : undefined) ??
    (/权益.*吸引力/.test(question) ? byAlias('conversion_rate') : undefined) ??
    (/转化最好/.test(question) ? byAlias('conversion_rate') : undefined) ??
    (/机会评分/.test(question) ? byAlias('top_score') : undefined) ??
    (/(?:营销\s*)?roi|投产(?:比|率)?|投入产出(?:比|率)?/i.test(question) ? byAlias('roi') : undefined) ??
    (/接的客人最多|服务了几个客人/.test(question) ? byAlias('service_count') ?? byAlias('service_task_count') : undefined) ??
    (/业绩最好/.test(question) ? byAlias('paid_amount') : undefined) ??
    (/预约最多/.test(question) ? byAlias('reservation_count') : undefined) ??
    (/(?:消费金额|累计消费|累计实收|实收金额).*(?:最高|最多|最低|最少|排行|排名)|(?:最高|最多|最低|最少).*(?:消费金额|累计消费|累计实收|实收金额)/.test(question)
      ? byAlias('total_paid_amount')
      : undefined) ??
    (/总余额|储值余额/.test(question) ? byAlias('total_balance') : undefined) ??
    (/报废数量/.test(question) ? byAlias('scrap_quantity') : undefined) ??
    (/损耗金额/.test(question) ? byAlias('loss_amount') : undefined) ??
    (/平均交付天数/.test(question) ? byAlias('avg_delivery_days') : undefined) ??
    (/(?:报价最低|最低报价|哪个报价低|价格最低)/.test(question) ? byAlias('quote_price') : undefined) ??
    (/(?:最低采购量|最小采购量|起订量|MOQ)/i.test(question) ? byAlias('minimum_order_quantity') : undefined) ??
    (/(?:供应商交期|报价交期|预计交付天数|供货要几天|交货周期).*(?:最短|最快|排名|排行)/.test(question) ? byAlias('lead_days') : undefined) ??
    (/最近入职/.test(question) ? 'created_at' : undefined) ??
    (/最近更新/.test(question) ? 'updated_at' : undefined) ??
    (/最早创建/.test(question) ? 'created_at' : undefined);
  const governedField =
    (/进步最快/.test(question) ? byAlias('paid_amount_difference') : undefined) ??
    (/成本项目异常增加/.test(question) ? byAlias('cost_difference') : undefined) ??
    (/缺货最紧急/.test(question) ? byAlias('current_stock') : undefined) ??
    (/周转率最低|周转最低/.test(question) ? byAlias('operational_turnover_ratio_30d') : undefined) ??
    (/(?:库存|耗材).*(?:还能|还够|够).*(?:用|支撑).*(?:多久|多少天)|可用天数.*(?:最少|最低|最短)/.test(question) ? byAlias('days_of_stock_30d') : undefined) ??
    (/需求.*(?:突然|明显).*(?:增加|上升)|增长最快/.test(question) ? byAlias('demand_change_rate_30d') : undefined) ??
    (/最容易过期/.test(question) ? byAlias('nearest_expiry_date') : undefined);
  const field = governedField ?? explicitlyRequestedField
    ?? (resultMode === 'detail' ? undefined : aggregations[0]?.alias ?? dimensions[0]?.field);
  if (!field) return [];
  const direction = field === 'lead_days'
    || /最低|最少|最短|最早|第一笔|首笔|下一个|即将结束|最容易过期|缺货最紧急|亏损|亏本|低于成本/.test(question)
    ? 'asc' as const
    : 'desc' as const;
  const nulls = aggregations.some((aggregation) => aggregation.alias === field && aggregation.fn === 'derived')
    || ['days_of_stock_30d', 'operational_turnover_ratio_30d', 'demand_change_rate_30d'].includes(field)
    ? 'last' as const
    : undefined;
  return [{ field, direction, ...(nulls ? { nulls } : {}) }];
}

function resolveLimit(
  question: string,
  answerShape: AskDataSemanticIntent['answerShape'],
  resultMode: AskDataControlledQueryPlan['resultMode'],
) {
  if (/哪一张|哪一天|第一笔|首笔|下一个|最后一个/.test(question)) return 1;
  const explicit = question.match(/(?:前|榜前)\s*([一二三四五六七八九十\d]{1,3})\s*(?:个|名|条|张)?|(?:最近更新的?|列出最近更新的?|最近)\s*([一二三四五六七八九十\d]{1,3})\s*(?:个(?!月|周|天)|名|条|张)/);
  if (explicit) return Math.max(1, Math.min(chineseInteger(explicit[1] ?? explicit[2]), 100));
  if (answerShape === 'ranking' || resultMode === 'ranking') return 10;
  if (resultMode === 'scalar') return 1;
  if (resultMode === 'trend') return 100;
  return 100;
}

function resolveTimeScope(
  question: string,
  semanticIntent: AskDataSemanticIntent,
  contracts: typeof ASK_DATA_SEMANTIC_CONTRACTS,
): { mode: AskDataControlledQueryPlan['timeScopeMode']; fieldOverrides?: Record<string, string> } {
  if (contracts.some((contract) => contract.metricKey === 'payment_flow') && /退款/.test(question) && semanticIntent.timeRange) {
    return { mode: 'event_range', fieldOverrides: { agent_v3_payment_refund_view: 'refunded_at' } };
  }
  if (contracts.some((contract) => contract.metricKey === 'inventory_on_hand')
    && semanticIntent.timeRange
    && /临期|即将过期|快过期/.test(question)) {
    return { mode: 'event_range', fieldOverrides: { agent_v3_product_inventory_view: 'nearest_expiry_date' } };
  }
  if (contracts.some((contract) => contract.metricKey === 'card_assets')
    && semanticIntent.timeRange
    && /到期|过期/.test(question)) {
    return { mode: 'event_range', fieldOverrides: { agent_v3_card_asset_view: 'expiry_date' } };
  }
  if (contracts.some((contract) => contract.metricKey === 'customer_profile') && semanticIntent.timeRange) {
    const field = /生日/.test(question)
      ? 'next_birthday_date'
      : /新客|新来|首次消费|来源渠道/.test(question)
        ? 'first_order_at'
        : undefined;
    if (field) {
      return { mode: 'event_range', fieldOverrides: { ask_data_customer_profile_summary_view: field } };
    }
    return { mode: 'current_snapshot' };
  }
  if (contracts.some((contract) => contract.metricKey === 'promotion_offer') && /当前|仍在生效|即将结束/.test(question)) {
    if (/即将结束/.test(question) && semanticIntent.timeRange) {
      return { mode: 'event_range', fieldOverrides: { agent_v3_promotion_offer_view: 'end_at' } };
    }
    return { mode: 'active_interval' };
  }
  if (contracts.every((contract) => contract.staticData)) return { mode: 'none' };
  if (/最近[一二三四五六七八九十\d]+个(?:确认快照|已确认月结)/.test(question)) return { mode: 'none' };
  if (semanticIntent.timeRange) return { mode: 'event_range' };
  if (/当前|目前|现在|仍未|未完成|待接收|已经完成|还没确认|尚未确认|未确认|待确认/.test(question)) return { mode: 'current_snapshot' };
  if (contracts.some((contract) => [
    'supplier_performance',
    'supplier_latest_quote',
    'supplier_price_comparison',
    'supplier_minimum_order_quantity',
    'supplier_payment_terms',
    'supplier_lead_time',
    'transfer_status',
    'promotion_offer',
  ].includes(contract.metricKey))) {
    return { mode: 'none' };
  }
  return { mode: 'event_range' };
}

function chineseInteger(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === '十') return 10;
  const [left, right] = value.split('十');
  if (value.includes('十')) return (left ? digits[left] ?? 0 : 1) * 10 + (right ? digits[right] ?? 0 : 0);
  return digits[value] ?? 10;
}

function resolveTimeGrain(
  question: string,
  semanticIntent: AskDataSemanticIntent,
  resultMode: AskDataControlledQueryPlan['resultMode'],
  dimensions: AskDataControlledQueryPlan['dimensions'],
) {
  if (resultMode !== 'trend') return undefined;
  const sourceField = dimensions.find((dimension) => dimension.key === 'date')?.field;
  if (!sourceField) return undefined;
  let granularity: 'day' | 'week' | 'month' = 'day';
  if (['period_month', 'settle_month'].includes(sourceField) || /按月|每月|每个月|逐月|月趋势|月结/.test(question)) granularity = 'month';
  else if (/按周|每周|周趋势/.test(question)) granularity = 'week';
  else if (/上个月.*采购|采购.*上个月/.test(question)) granularity = 'day';
  else if (!/按日|每日|每天|日趋势/.test(question) && semanticIntent.timeRange) {
    const days = (Date.parse(semanticIntent.timeRange.endAt) - Date.parse(semanticIntent.timeRange.startAt)) / 86_400_000;
    if (days > 30) granularity = 'month';
  }
  return {
    sourceField,
    granularity,
    alias: `trend_${granularity}`,
    expression: `DATE_TRUNC('${granularity}', ${sourceField})::date`,
  };
}

function deriveQuestionFilters(question: string, metricKeys: string[]) {
  const filters: Array<{ field: string; operator: string; value: unknown }> = [];
  if (metricKeys.includes('inventory_usage_balance')) {
    const namedUsageProduct = question.match(/用了多少\s*([^，,。！？?；;]{2,24}?)(?:\s*[，,]\s*)?还剩多少/);
    const productName = namedUsageProduct?.[1]?.trim().replace(/^的/, '');
    if (productName) {
      filters.push({
        field: 'product_name',
        operator: 'contains',
        value: productName === '洗面奶' ? '洁面' : productName,
      });
    }
  }
  if (metricKeys.includes('inventory_on_hand')) {
    const governedProductFamily = question.match(/(补水|防晒)(?:系列)?(?:产品|商品)?/);
    if (governedProductFamily?.[1]) {
      filters.push({ field: 'product_name', operator: 'contains', value: governedProductFamily[1] });
    }
  }
  if (/损耗金额为\s*0|损耗金额已经为\s*0/.test(question)) filters.push({ field: 'loss_amount', operator: 'eq', value: 0 });
  if (metricKeys.includes('staff_profile') && /在职/.test(question)) filters.push({ field: 'status', operator: 'eq', value: 'active' });
  if (metricKeys.includes('customer_balance') && /赠送余额高于现金余额/.test(question)) {
    filters.push({ field: 'gift_balance', operator: 'aggregate_gt', value: 'cash_balance' });
  }
  if (metricKeys.includes('customer_balance') && /现金余额.*为\s*0.*赠送余额/.test(question)) {
    filters.push({ field: 'cash_balance', operator: 'eq', value: 0 });
    filters.push({ field: 'gift_balance', operator: 'gt', value: 0 });
  }
  if (metricKeys.includes('customer_balance') && metricKeys.includes('card_assets') && /(?:有|存在).*储值余额/.test(question)) {
    filters.push({ field: 'cash_balance', operator: 'sum_with_gt', value: { field: 'gift_balance', threshold: 0 } });
  }
  if (metricKeys.includes('customer_balance') && metricKeys.includes('card_assets')) {
    const cashThreshold = extractAskDataGreaterThanThreshold(question, /现金余额/);
    if (cashThreshold) filters.push({ field: 'cash_balance', operator: cashThreshold.operator, value: cashThreshold.value });
  }
  if (metricKeys.includes('project_catalog') && /当前启用项目|启用项目/.test(question)) {
    filters.push({ field: 'status', operator: 'in', value: ['active', 'enabled'] });
  }
  if (metricKeys.includes('procurement_detail') && /还没到货|未到货/.test(question)) {
    filters.push({ field: 'status', operator: 'not_in', value: ['received', 'completed', 'cancelled', 'canceled'] });
  }
  if (metricKeys.some((metricKey) => [
    'supplier_latest_quote',
    'supplier_price_comparison',
    'supplier_minimum_order_quantity',
    'supplier_payment_terms',
    'supplier_lead_time',
  ].includes(metricKey))) {
    filters.push({ field: 'is_current_valid', operator: 'eq', value: true });
  }
  if (metricKeys.some((metricKey) => ['item_contribution_margin', 'project_attributed_cost', 'below_cost_sale'].includes(metricKey))) {
    const mentionsProduct = /商品|产品/.test(question);
    const mentionsProject = /项目|服务/.test(question);
    if (mentionsProduct && !mentionsProject) filters.push({ field: 'item_type', operator: 'eq', value: 'product' });
    if (mentionsProject && !mentionsProduct) filters.push({ field: 'item_type', operator: 'eq', value: 'project' });
  }
  if (metricKeys.includes('item_contribution_margin') && /次卡核销/.test(question)) {
    filters.push({ field: 'event_type', operator: 'eq', value: 'card_redemption' });
  }
  if (metricKeys.includes('item_contribution_margin')
    && /退款.*(?:冲减|影响).*(?:收入|成本|毛利)|(?:收入|成本|毛利).*退款冲减/.test(question)) {
    filters.push({ field: 'event_type', operator: 'eq', value: 'refund' });
  }
  if (metricKeys.includes('below_cost_sale')) {
    filters.push({ field: 'attributed_cost', operator: 'is_not_null', value: true });
    filters.push({ field: 'net_revenue', operator: 'aggregate_lt', value: 'attributed_cost' });
  }
  if (metricKeys.includes('supplier_price_comparison') && /(?:更低|最低|降低成本|报价差额)/.test(question)) {
    filters.push({ field: 'alternative_supplier_count', operator: 'gt', value: 0 });
  }
  if (metricKeys.includes('supplier_price_comparison') && /(?:首选|优选)供应商/.test(question)) {
    filters.push({ field: 'is_preferred_supplier', operator: 'eq', value: true });
  }
  if (metricKeys.includes('card_assets') && /未用完|没用完|未用次卡|没用次卡|剩余|还剩/.test(question)) {
    const explicitRemainingThreshold = question.match(
      /(?:还剩|剩余(?:次数)?)\s*(?:超过|大于|高于|不少于|至少)?\s*(\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万]+)\s*次?\s*(以上)?/,
    );
    const remainingValue = explicitRemainingThreshold?.[1]
      ? parseAskDataNumber(explicitRemainingThreshold[1])
      : undefined;
    filters.push({
      field: 'remaining_times',
      operator: explicitRemainingThreshold?.[2] || /(?:不少于|至少)/.test(explicitRemainingThreshold?.[0] ?? '')
        ? 'gte'
        : 'gt',
      value: remainingValue ?? 0,
    });
  }
  if (metricKeys.includes('card_assets')) {
    const expiryWindow = question.match(
      /(\d{1,3}|[零〇一二两三四五六七八九十百千万]+)\s*天内到期|到期(?:时间)?在\s*(\d{1,3}|[零〇一二两三四五六七八九十百千万]+)\s*天内/,
    );
    const expiryDays = parseAskDataNumber(expiryWindow?.[1] ?? expiryWindow?.[2] ?? '');
    if (expiryDays !== undefined) {
      filters.push({ field: 'expiry_date', operator: 'between_as_of_days', value: Math.max(1, Math.min(expiryDays, 365)) });
    }
  }
  if (metricKeys.includes('card_assets') && /快过期/.test(question)) {
    filters.push({ field: 'remaining_times', operator: 'gt', value: 0 });
    filters.push({ field: 'expiry_date', operator: 'between_as_of_days', value: 30 });
  }
  if (metricKeys.includes('card_assets') && /当前有效次卡/.test(question)) {
    filters.push({ field: 'status', operator: 'in', value: ['active', 'valid'] });
  }
  if (metricKeys.includes('card_assets') && /已过期次卡/.test(question)) {
    filters.push({ field: 'status', operator: 'in', value: ['expired'] });
  }
  const namedCard = question.match(/(?:未用完|没用完|剩余(?:次数)?(?:大于\s*0)?的?)([^，。？?]{2,30}?次卡)/);
  const namedCardValue = namedCard?.[1]?.trim().replace(/^的/, '');
  const namedCardIsThresholdPhrase = namedCardValue
    ? /(?:超过|大于|高于|不少于|至少|多于|不超过|小于|低于)\s*(?:\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万]+)\s*次/.test(namedCardValue)
    : false;
  if (metricKeys.includes('card_assets') && namedCardValue && !namedCardIsThresholdPhrase) {
    filters.push({ field: 'card_name', operator: 'contains', value: namedCardValue });
  }
  const expiringNamedCard = question.match(/哪些?([^，。？?]{2,30}?次卡)快过期/);
  if (metricKeys.includes('card_assets') && expiringNamedCard?.[1]) {
    filters.push({ field: 'card_name', operator: 'contains', value: expiringNamedCard[1].trim() });
  }
  const usageNamedCard = question.match(/([^，。？?]{2,30}?次卡)的?确认收入进度/);
  if (metricKeys.includes('card_usage') && usageNamedCard?.[1]) {
    filters.push({ field: 'card_name', operator: 'contains', value: usageNamedCard[1].trim() });
  }
  if (metricKeys.includes('promotion_offer') && /已经发放.*还没有.*使用|发放但.*没有.*使用/.test(question)) {
    filters.push({ field: 'issued_count', operator: 'gt', value: 0 });
    filters.push({ field: 'used_count', operator: 'eq', value: 0 });
  }
  if (metricKeys.includes('promotion_offer') && /当前|仍在生效/.test(question)) {
    filters.push({ field: 'start_at', operator: 'lte_as_of', value: 'endAt' });
    filters.push({ field: 'end_at', operator: 'gte_as_of_nullable', value: 'endAt' });
  }
  if (metricKeys.includes('transfer_status') && /已经完成|已完成/.test(question)) {
    filters.push({ field: 'status', operator: 'in', value: ['completed', 'received', 'done'] });
  }
  if (metricKeys.includes('customer_profile') && /消费了钱.*很少用次卡/.test(question)) {
    filters.push({ field: 'total_paid_amount', operator: 'gt', value: 0 });
    filters.push({ field: 'active_card_count', operator: 'gt', value: 0 });
    filters.push({ field: 'card_usage_times', operator: 'lte', value: 1 });
  }
  if (metricKeys.includes('customer_profile') && /消费频率.*明显下降/.test(question)) {
    filters.push({ field: 'days_since_last_visit', operator: 'field_ratio_gt', value: { field: 'average_return_interval_days', multiplier: 1.5 } });
  }
  if (metricKeys.includes('customer_profile') && /消费很多但突然消失/.test(question)) {
    filters.push({ field: 'ltv_tier', operator: 'in', value: ['high', 'very_high', 'vip'] });
    filters.push({ field: 'customer_status', operator: 'eq', value: 'inactive' });
  }
  if (metricKeys.includes('customer_lifecycle') && /高流失风险/.test(question)) {
    filters.push({ field: 'churn_risk_level', operator: 'in', value: ['high', 'very_high'] });
  }
  if (metricKeys.includes('customer_lifecycle') && /低流失风险/.test(question)) {
    filters.push({ field: 'churn_risk_level', operator: 'in', value: ['low', 'very_low'] });
  }
  if (metricKeys.includes('customer_lifecycle') && /存在未关闭机会|有未关闭机会/.test(question)) {
    filters.push({ field: 'open_opportunity_count', operator: 'gt', value: 0 });
  }
  if (metricKeys.includes('customer_lifecycle') && /机会评分/.test(question)) {
    filters.push({ field: 'top_score', operator: 'is_not_null', value: true });
  }
  if (metricKeys.includes('inventory_on_hand') && /库存不够|库存不足|只剩最后几瓶|低库存/.test(question)) {
    filters.push({ field: 'current_stock', operator: 'field_lt', value: 'safety_stock' });
  }
  if (metricKeys.includes('inventory_slow_moving')) {
    const explicitOperationalTurnoverUpperBound = extractOperationalTurnoverUpperBound(question);
    if (isExplicitNoOutbound90dQuestion(question)) {
      filters.push({ field: 'slow_moving_status', operator: 'eq', value: 'no_outbound_90d' });
    } else if (explicitOperationalTurnoverUpperBound) {
      filters.push({
        field: 'operational_turnover_ratio_30d',
        operator: explicitOperationalTurnoverUpperBound.operator,
        value: explicitOperationalTurnoverUpperBound.value,
      });
    } else {
      filters.push({ field: 'slow_moving_status', operator: 'in', value: ['no_outbound_90d', 'low_turnover'] });
    }
    filters.push({ field: 'current_stock', operator: 'gt', value: 0 });
  }
  if (metricKeys.includes('inventory_demand_change')) {
    const explicitDemandThreshold = question.match(/(?:增长|增加|上升)\s*(?:超过|高于|大于)\s*(\d+(?:\.\d+)?)\s*%/);
    if (explicitDemandThreshold) {
      filters.push({
        field: 'demand_change_rate_30d',
        operator: 'gt',
        value: Number(explicitDemandThreshold[1]) / 100,
      });
    } else if (/突然|明显/.test(question)) {
      filters.push({ field: 'demand_change_rate_30d', operator: 'gt', value: 0.5 });
    }
  }
  if (metricKeys.includes('inventory_procurement_coverage') && /快断货|低于安全库存|没有在途采购|没采购|未采购/.test(question)) {
    filters.push({ field: 'replenishment_fact_status', operator: 'eq', value: 'below_safety_no_open_procurement' });
    if (/低于安全库存/.test(question)) {
      filters.push({ field: 'current_stock', operator: 'field_lt', value: 'safety_stock' });
    }
  }
  if (metricKeys.includes('inventory_procurement_coverage') && /(?:一直.*消耗|有消耗|有出库).*(?:没|未|无|没有).*采购/.test(question)) {
    filters.push({ field: 'outbound_quantity_90d', operator: 'gt', value: 0 });
    filters.push({ field: 'procurement_order_count_90d', operator: 'eq', value: 0 });
  }
  if (metricKeys.includes('inventory_on_hand') && /可以卖|可售/.test(question)) {
    filters.push({ field: 'current_stock', operator: 'gt', value: 0 });
  }
  if (metricKeys.includes('staff_capacity') && /可以接新单/.test(question)) {
    filters.push({ field: 'idle_minutes', operator: 'gt', value: 0 });
    filters.push({ field: 'overbooked_minutes', operator: 'eq', value: 0 });
  }
  if (metricKeys.includes('inventory_on_hand') && /30天内.*过期/.test(question)) {
    filters.push({ field: 'nearest_expiry_date', operator: 'between_as_of_days', value: 30 });
    filters.push({ field: 'current_stock', operator: 'gt', value: 0 });
  }
  if (metricKeys.includes('inventory_on_hand') && /快过期|临期/.test(question) && !/\d+天内/.test(question)) {
    filters.push({ field: 'nearest_expiry_date', operator: 'between_as_of_days', value: 30 });
    filters.push({ field: 'current_stock', operator: 'gt', value: 0 });
  }
  if (metricKeys.includes('inventory_on_hand') && /最容易过期/.test(question)) {
    filters.push({ field: 'nearest_expiry_date', operator: 'gte_as_of', value: 'endAt' });
    filters.push({ field: 'current_stock', operator: 'gt', value: 0 });
  }
  if (metricKeys.includes('reservation_metrics') && /到店客人/.test(question)) {
    filters.push({ field: 'status', operator: 'in', value: ['checked_in', 'completed'] });
  }
  if (metricKeys.includes('reservation_metrics')
    && /(?:预约|预订).*(?:还没确认|尚未确认|未确认|待确认).*(?:客户|客人)|(?:客户|客人).*(?:预约|预订).*(?:还没确认|尚未确认|未确认|待确认)/.test(question)) {
    filters.push({ field: 'status', operator: 'eq', value: 'pending' });
  }
  if (metricKeys.includes('reservation_metrics') && /(?:面部).*(?:预约).*(?:身体)|(?:预约).*(?:面部).*(?:身体)/.test(question)) {
    filters.push({ field: 'status', operator: 'not_in', value: ['cancelled', 'canceled'] });
  }
  if (metricKeys.includes('reservation_metrics')
    && /预约到店转化率|预约最满|预约最多|各美容师.*预约量/.test(question)) {
    filters.push({ field: 'status', operator: 'not_in', value: ['cancelled', 'canceled'] });
  }
  if (metricKeys.includes('reservation_metrics') && /下一个预约/.test(question)) {
    filters.push({ field: 'status', operator: 'not_in', value: ['cancelled', 'canceled'] });
    filters.push({ field: 'start_time', operator: 'gte_as_of_time', value: 'asOfTime' });
  }
  if (metricKeys.includes('reservation_metrics') && /下午.*预约/.test(question)) {
    filters.push({ field: 'status', operator: 'not_in', value: ['cancelled', 'canceled'] });
    filters.push({ field: 'start_time', operator: 'gte', value: '12:00' });
  }
  if (metricKeys.includes('reservation_metrics') && /下午两点|下午2点/.test(question)) {
    filters.push({ field: 'start_time', operator: 'eq', value: '14:00' });
  }
  if (metricKeys.includes('appointment_gap') && /下午.*加客/.test(question)) {
    filters.push({ field: 'start_time', operator: 'gte', value: '12:00' });
    filters.push({ field: 'available_capacity', operator: 'gt', value: 0 });
  }
  const requestedPaymentMethods = resolveRequestedPaymentMethods(question);
  if ((metricKeys.includes('payment_flow') || metricKeys.includes('payment_customer_detail')) && requestedPaymentMethods.length === 1) {
    filters.push({ field: 'payment_method', operator: 'in', value: requestedPaymentMethods[0].values });
  }
  if (metricKeys.includes('payment_flow') && /储值(?:卡)?(?:消费|收款)/.test(question)) {
    filters.push({ field: 'payment_method', operator: 'in', value: ['balance', 'stored_value', 'member_balance', '储值', '余额'] });
  }
  if (metricKeys.includes('payment_flow') && /退款明细|退款记录/.test(question)) {
    filters.push({ field: 'refund_amount', operator: 'gt', value: 0 });
  }
  if (metricKeys.includes('marketing_automation') && /正在运行|在运行/.test(question)) {
    filters.push({ field: 'status', operator: 'in', value: ['active', 'running', 'enabled', 'processing'] });
  }
  if (metricKeys.includes('marketing_activity') && /在跑|正在进行|运行中/.test(question)) {
    filters.push({ field: 'status', operator: 'in', value: ['active', 'running', 'published', 'ongoing'] });
  }
  if (metricKeys.includes('marketing_roi') && /活动.*(?:亏钱|亏损|赔钱|不赚钱)/.test(question)) {
    filters.push({ field: 'attributed_net_revenue', operator: 'aggregate_lt', value: 'marketing_cost' });
  }
  if (metricKeys.includes('marketing_roi') && /活动.*(?:roi|投产|投入产出|最高|最低)/i.test(question)) {
    filters.push({ field: 'activity_id', operator: 'is_not_null', value: true });
    filters.push({ field: 'activity_title', operator: 'is_not_null', value: true });
  }
  if (metricKeys.includes('marketing_roi') && /权益.*吸引力/.test(question)) {
    filters.push({ field: 'promotion_id', operator: 'is_not_null', value: true });
    filters.push({ field: 'promotion_name', operator: 'is_not_null', value: true });
  }
  if (metricKeys.includes('bom_variance') && /浪费|使用不规范|消耗异常/.test(question)) {
    filters.push({ field: 'is_abnormal', operator: 'eq', value: true });
  }
  if (metricKeys.includes('reconciliation_issue') && /重复退款|重复消费/.test(question)) {
    filters.push({ field: 'title', operator: 'contains_any', value: ['重复退款', '重复消费', '重复收费'] });
  }
  if (metricKeys.includes('reconciliation_issue') && /收款没有对应服务/.test(question)) {
    filters.push({ field: 'title', operator: 'contains_any', value: ['服务', '订单', '收款'] });
  }
  if (metricKeys.includes('reconciliation_issue') && /现金收入/.test(question)) {
    filters.push({ field: 'title', operator: 'contains', value: '现金' });
  }
  if (metricKeys.includes('inventory_loss_rate')) {
    filters.push({ field: 'quantity', operator: 'lt', value: 0 });
  }
  if (metricKeys.includes('inventory_movement') && /(?:耗材.*消耗|消耗速度)/.test(question)) {
    filters.push({ field: 'quantity', operator: 'lt', value: 0 });
  }
  return filters;
}

function detailContextFields(
  question: string,
  viewNames: string[],
  resultMode: AskDataControlledQueryPlan['resultMode'],
) {
  const fields: string[] = [];
  if (viewNames.includes('agent_v3_payment_refund_view') && resultMode === 'detail') {
    fields.push('paid_at', 'payment_amount', 'payment_method', 'refunded_at', 'refund_amount', 'refund_status', 'refund_reason_category');
  }
  if (viewNames.includes('agent_v3_order_summary_view') && resultMode === 'detail') {
    fields.push('customer_id', 'customer_name_masked');
  }
  if (viewNames.includes('agent_v3_reservation_view') && resultMode === 'detail') {
    fields.push('customer_id', 'customer_name_masked', 'project_id', 'project_name', 'beautician_id', 'beautician_name', 'date', 'start_time', 'status');
  }
  if (viewNames.includes('agent_v3_customer_balance_view') && resultMode === 'detail') {
    fields.push('customer_id', 'customer_name_masked', 'cash_balance', 'gift_balance');
  }
  if (viewNames.includes('agent_v3_card_asset_view') && resultMode === 'detail') {
    fields.push('customer_id', 'customer_name_masked', 'customer_card_id', 'card_name', 'remaining_times', 'expiry_date');
  }
  if (viewNames.includes('agent_v3_card_usage_view') && resultMode === 'detail') {
    fields.push('customer_id', 'customer_name_masked', 'card_name', 'project_name', 'remaining_times', 'verified_at');
  }
  if (viewNames.includes('agent_v3_product_inventory_view') && resultMode === 'detail') {
    fields.push('product_id', 'product_name', 'sku', 'unit', 'current_stock', 'safety_stock', 'stock_value', 'status', 'nearest_expiry_date');
  }
  if (viewNames.includes('ask_data_inventory_turnover_view') && resultMode === 'detail') {
    fields.push(
      'product_id',
      'product_name',
      'sku',
      'category_name',
      'unit',
      'current_stock',
      'safety_stock',
      'days_of_stock_30d',
      'operational_turnover_ratio_30d',
      'slow_moving_status',
      'replenishment_fact_status',
      'open_procurement_quantity',
      'cost_policy',
      'turnover_policy',
      'data_as_of',
    );
  }
  if (viewNames.includes('ask_data_supplier_quote_terms_view') && resultMode === 'detail') {
    fields.push(
      'quote_id',
      'product_id',
      'product_name',
      'product_sku',
      'supplier_id',
      'supplier_name',
      'quote_price',
      'tax_included',
      'minimum_order_quantity',
      'lead_days',
      'stock_status',
      'settlement_mode',
      'payment_terms',
      'is_preferred_supplier',
      'alternative_supplier_count',
      'lowest_current_quote_price',
      'price_difference_from_lowest',
      'current_price_rank',
      'data_as_of',
    );
  }
  if (viewNames.includes('agent_v3_stock_movement_view') && resultMode === 'detail') {
    fields.push('movement_id', 'product_id', 'product_name', 'movement_type', 'occurred_at');
    if (/变动前后|前后数量/.test(question)) fields.push('before_stock', 'after_stock');
  }
  if (viewNames.includes('agent_v3_inventory_scrap_view')) {
    if (/记录|趋势/.test(question)) fields.push('occurred_at');
    if (/备注摘要/.test(question)) fields.push('remark_summary');
    if (/操作人/.test(question)) fields.push('operator_name');
  }
  if (viewNames.includes('agent_v3_staff_profile_view')) {
    if (/入职/.test(question)) fields.push('created_at');
    if (resultMode === 'detail') {
      fields.push('staff_id', 'staff_name');
      if (/职级|级别/.test(question)) fields.push('level_name');
    }
  }
  if (viewNames.includes('ask_data_staff_performance_view') && resultMode === 'detail') {
    fields.push('staff_id', 'staff_name', 'settle_month');
    if (/提成/.test(question)) fields.push('commission_amount');
    if (/业绩/.test(question)) fields.push('paid_amount');
    if (/服务|客人/.test(question)) fields.push('service_count');
  }
  if (viewNames.includes('agent_v3_service_quality_view') && resultMode === 'detail') {
    fields.push('service_task_id', 'project_id', 'project_name', 'beautician_id', 'beautician_name', 'status', 'appointment_time');
  }
  if (viewNames.includes('ask_data_staff_capacity_view') && resultMode === 'detail') {
    fields.push('staff_id', 'staff_name', 'work_date', 'scheduled_minutes', 'booked_minutes', 'idle_minutes');
  }
  if (viewNames.includes('ask_data_customer_feedback_view') && resultMode === 'detail') {
    fields.push('feedback_id', 'customer_id', 'customer_name_masked', 'staff_id', 'staff_name', 'project_id', 'project_name', 'feedback_type', 'rating', 'severity', 'status', 'occurred_at');
    if (hasNamedStaffQuestion(question)) fields.push('staff_id', 'staff_name');
  }
  if (viewNames.includes('ask_data_reconciliation_issue_view') && resultMode === 'detail') {
    fields.push('business_date', 'run_status', 'category', 'severity', 'issue_status', 'amount', 'title', 'last_detected_at');
  }
  if (viewNames.includes('agent_v3_marketing_activity_view') && resultMode === 'detail') {
    fields.push('activity_title', 'status', 'publish_status', 'start_at', 'end_at', 'participants', 'conversion');
  }
  if (viewNames.includes('agent_v3_promotion_offer_view') && resultMode === 'detail') {
    fields.push('type', 'scope_type', 'status', 'start_at', 'end_at');
    if (/(?:未来|接下来).*(?:仍有效|有效).*优惠/.test(question)) fields.push('discount_text');
  }
  if (viewNames.includes('agent_v3_project_catalog_view') && resultMode === 'detail') {
    if (/类项目|项目类型|按类型/.test(question)) fields.push('project_type');
    if (/疗程次数/.test(question)) fields.push('treatment_course_times');
  }
  if (viewNames.includes('agent_v3_purchase_procurement_view') && resultMode === 'detail') {
    fields.push('procurement_id', 'procurement_no', 'supplier_id', 'supplier_name', 'status', 'total_amount', 'expected_arrival_date');
  }
  if (viewNames.includes('ask_data_transfer_status_view') && resultMode === 'detail') fields.push('status', 'direction', 'counterpart_store_name', 'created_at', 'updated_at');
  if (viewNames.includes('ask_data_bom_consumption_variance_view') && resultMode === 'detail') fields.push('standard_status', 'occurred_at');
  if (viewNames.includes('ask_data_customer_profile_summary_view') && resultMode === 'detail') {
    if (/会员等级/.test(question)) fields.push('member_level');
    if (/生日/.test(question)) fields.push('next_birthday_date', 'days_until_birthday');
    if (/没来|没到店|沉睡|最近到店/.test(question)) fields.push('last_visit_at', 'days_since_last_visit');
    if (/来源|渠道/.test(question)) fields.push('source_channel');
    if (/次卡|办卡|卡里/.test(question)) {
      fields.push('active_card_count', 'remaining_card_times', 'unused_card_count', 'low_remaining_card_count', 'last_card_usage_at');
    }
    if (/生命周期|流失|高价值/.test(question)) fields.push('lifecycle_stage', 'ltv_tier', 'churn_risk_level');
    if (/消费频率/.test(question)) fields.push('days_since_last_visit', 'average_return_interval_days');
    if (/消费很多|突然消失/.test(question)) fields.push('total_paid_amount', 'ltv_tier', 'days_since_last_visit');
    if (/很少用次卡/.test(question)) fields.push('total_paid_amount', 'active_card_count', 'card_usage_times', 'remaining_card_times');
    fields.push('customer_status');
  }
  if (viewNames.includes('ask_data_customer_lifecycle_view') && resultMode === 'detail') {
    if (/生命周期/.test(question)) fields.push('lifecycle_stage');
    if (/流失风险/.test(question)) fields.push('churn_risk_level');
    if (/会员等级|价值|ltv/i.test(question)) fields.push('ltv_tier');
    if (/机会/.test(question)) fields.push('open_opportunity_count', 'top_opportunity_type', 'top_priority', 'top_score');
    fields.push('computed_at');
  }
  return fields;
}

function hasNamedStaffQuestion(question: string) {
  return /[\p{Script=Han}·]{2,4}(?:这半年|昨天|本月|上个月|最近\s*\d+\s*天|这个季度|今年|上周)?(?:的)?(?:提成|排班|业绩|服务过的客户)/u.test(question)
    || /[\p{Script=Han}·]{2,4}是什么(?:职级|级别)/u.test(question);
}

function forbiddenGroupByFields(question: string, metricKeys: string[]) {
  const fields: string[] = [];
  if (metricKeys.includes('customer_feedback') && /按反馈类型/.test(question)) fields.push('customer_id', 'staff_id', 'project_id');
  if (/按日|每日|每天/.test(question)) fields.push('occurred_at');
  return fields;
}

function comparisonMode(
  question: string,
  metricCount: number,
  dimensions: AskDataControlledQueryPlan['dimensions'],
): AskDataControlledQueryPlan['comparisonMode'] {
  if (resolveRequestedPaymentMethods(question).length > 1) return 'dimension';
  if (/调入和调出.*(?:数量|调拨单).*对比|调入.*调出.*(?:数量|调拨单)/.test(question)) return 'dimension';
  if (/(?:面部).*(?:预约).*(?:身体)|(?:预约).*(?:面部).*(?:身体)/.test(question)) return 'dimension';
  if (/同比|去年同期/.test(question)) return 'year_over_year';
  if (/上月|上周|昨天|上一|环比/.test(question)) return 'previous_period';
  if (metricCount > 1) return 'multi_metric';
  if (dimensions.length) return 'dimension';
  return 'previous_period';
}

function deriveRequiredAnswerFacts(
  question: string,
  answerShape: AskDataSemanticIntent['answerShape'],
  metricKeys: string[],
  requestedPaymentMethodCount: number,
  pivotTransferDirections: boolean,
  pivotReservationProjectTypes: boolean,
) {
  const facts = ['metric_value', 'data_policy'];
  if (/今天|本周|这周|本月|上月|最近|近\s*\d+|季度|年|趋势|同比|环比/.test(question)) facts.push('time_range');
  // A payment-method pivot is a side-by-side dimensional breakdown, not a
  // current-vs-previous-period comparison. Requiring a difference would make a
  // complete one-row cash/WeChat/Alipay result fail answer completeness.
  if (
    answerShape === 'comparison'
    && requestedPaymentMethodCount <= 1
    && !pivotTransferDirections
    && !pivotReservationProjectTypes
    && !isIncompatibleUnitComparison(question, metricKeys)
    && !isSideBySideSubmetricComparison(question, metricKeys)
  ) {
    facts.push('comparison_current', 'comparison_previous', 'comparison_difference');
  }
  if (answerShape === 'trend') facts.push('trend_granularity', 'trend_points');
  if (answerShape === 'ranking') facts.push('ranking_order', 'ranking_limit');
  if (answerShape === 'list') facts.push('list_items');
  if (metricKeys.length > 1) facts.push('all_requested_metrics');
  if (metricKeys.includes('member_liability') && /(?:储值负债.*次卡负债|次卡负债.*储值负债)/.test(question)) {
    facts.push('all_requested_metrics');
  }
  if (requestedPaymentMethodCount > 1 || pivotTransferDirections || pivotReservationProjectTypes) {
    facts.push('all_requested_dimensions');
  }
  if (pivotTransferDirections && /差额|相差|差多少|对比/.test(question)) facts.push('comparison_difference');
  return [...new Set(facts)];
}

function isIncompatibleUnitComparison(question: string, metricKeys: string[]) {
  return /耗材消耗和收入.*对比/.test(question)
    && metricKeys.includes('inventory_movement')
    && metricKeys.includes('order_revenue');
}

function isExplicitNoOutbound90dQuestion(question: string) {
  const normalized = question.replace(/\s+/g, '');
  return /(?:最近|近)?90天(?:内|中|期间)?[^，。！？?；;]*(?:没有|没|无)(?:发生)?出库|(?:没有|没|无)(?:发生)?出库[^，。！？?；;]*90天|一直有但[^，。！？?；;]*(?:没有|没|无)出库|长期(?:没有|没|无)出库/.test(normalized);
}

function extractOperationalTurnoverUpperBound(question: string): { operator: 'lt' | 'lte'; value: number } | undefined {
  const match = question.match(/运营周转率[^，。！？?；;]*(低于|小于|不高于|不超过)\s*(\d+(?:\.\d+)?)/);
  if (!match?.[1] || !match[2]) return undefined;
  return {
    operator: match[1] === '不高于' || match[1] === '不超过' ? 'lte' : 'lt',
    value: Number(match[2]),
  };
}

function isSideBySideSubmetricComparison(question: string, metricKeys: string[]) {
  return (
    metricKeys.includes('member_liability')
    && /(?:储值负债.*次卡负债|次卡负债.*储值负债).*分别多少/.test(question)
  ) || (
    metricKeys.includes('customer_balance')
    && /(?:现金余额.*赠送余额|赠送余额.*现金余额).*分别(?:合计)?多少/.test(question)
  ) || (
    metricKeys.includes('transfer_status')
    && /(?:调入.*调出|调出.*调入).*(?:分别多少|各多少)/.test(question)
  );
}

type RequestedPaymentMethod = { key: string; label: string; values: string[] };

const PAYMENT_METHODS: Array<RequestedPaymentMethod & { pattern: RegExp }> = [
  { key: 'cash', label: '现金', values: ['cash', '现金'], pattern: /现金/ },
  { key: 'wechat', label: '微信', values: ['wechat', 'weixin', '微信', '微信支付'], pattern: /微信/ },
  { key: 'alipay', label: '支付宝', values: ['alipay', '支付宝'], pattern: /支付宝/ },
  { key: 'bank_card', label: '银行卡', values: ['bank_card', 'card', '银行卡', '刷卡'], pattern: /银行卡|刷卡/ },
  { key: 'member_balance', label: '会员余额', values: ['balance', 'stored_value', 'member_balance', '储值', '余额', '会员余额'], pattern: /会员余额|储值(?:卡)?/ },
];

function resolveRequestedPaymentMethods(question: string): RequestedPaymentMethod[] {
  return PAYMENT_METHODS.filter((method) => method.pattern.test(question)).map(({ pattern: _pattern, ...method }) => method);
}

function itemContributionMarginAggregations(): AskDataQueryAggregation[] {
  return [
    sumZero('gross_revenue', 'gross_revenue'),
    sumZero('discount_amount', 'discount_amount'),
    sumZero('refund_amount', 'refund_amount'),
    sumZero('net_revenue', 'net_revenue'),
    sumZero('attributed_cost', 'attributed_cost'),
    derived(
      'contribution_margin',
      'CASE WHEN COUNT(*) FILTER (WHERE attributed_cost IS NULL) > 0 THEN NULL ELSE COALESCE(SUM(net_revenue), 0) - COALESCE(SUM(attributed_cost), 0) END',
      ['net_revenue', 'attributed_cost'],
    ),
    derived(
      'contribution_margin_rate',
      'CASE WHEN COUNT(*) FILTER (WHERE attributed_cost IS NULL) > 0 THEN NULL ELSE (COALESCE(SUM(net_revenue), 0) - COALESCE(SUM(attributed_cost), 0)) / NULLIF(COALESCE(SUM(net_revenue), 0), 0) END',
      ['net_revenue', 'attributed_cost'],
    ),
    derived('estimated_cost_event_count', 'COUNT(*) FILTER (WHERE is_estimated_cost)', ['is_estimated_cost']),
    derived('cost_missing_event_count', 'COUNT(*) FILTER (WHERE attributed_cost IS NULL)', ['attributed_cost']),
  ];
}

function sum(field: string, alias: string): AskDataQueryAggregation { return { field, alias, fn: 'sum' }; }
function sumZero(field: string, alias: string): AskDataQueryAggregation { return { field, alias, fn: 'sum', zeroOnEmpty: true }; }
function sumAbs(field: string, alias: string): AskDataQueryAggregation { return { field, alias, fn: 'sum_abs' }; }
function sumAbsZero(field: string, alias: string): AskDataQueryAggregation { return { field, alias, fn: 'sum_abs', zeroOnEmpty: true }; }
function avg(field: string, alias: string): AskDataQueryAggregation { return { field, alias, fn: 'avg' }; }
function max(field: string, alias: string): AskDataQueryAggregation { return { field, alias, fn: 'max' }; }
function count(field: string, alias: string): AskDataQueryAggregation { return { field, alias, fn: 'count' }; }
function countZero(field: string, alias: string): AskDataQueryAggregation { return { field, alias, fn: 'count', zeroOnEmpty: true }; }
function countDistinct(field: string, alias: string): AskDataQueryAggregation { return { field, alias, fn: 'count_distinct' }; }
function none(field: string, alias: string): AskDataQueryAggregation { return { field, alias, fn: 'none' }; }
function derived(alias: string, expression: string, sourceFields: string[]): AskDataQueryAggregation {
  return { field: sourceFields[0] ?? alias, alias, fn: 'derived', expression, sourceFields };
}
