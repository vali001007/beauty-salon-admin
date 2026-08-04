import { createHash } from 'node:crypto';

export type AskDataGoldSupportClass =
  | 'ask_query_supported'
  | 'ask_query_low_confidence'
  | 'clarification_required'
  | 'multi_turn_context_required'
  | 'ask_readonly_boundary'
  | 'ask_sensitive_boundary'
  | 'ask_scope_limit'
  | 'admin_supported_ask_not_open'
  | 'brain_content_or_advice'
  | 'admin_backend_unsupported';

export type AskDataGoldQuestionContract = {
  id: string;
  sourceSuite: 'ami_brain_2000' | 'agent_650' | 'ask_supplemental' | 'ask_holdout_v4';
  sourceId: string;
  sourceRole: string;
  question: string;
  checksum: string;
  split: 'development' | 'holdout';
  supportClass: AskDataGoldSupportClass;
  expectedMetricKeys: string[];
  requiredDimensionKeys: string[];
  acceptableViews: string[];
  requiredViews: string[];
  requiredOutputFields: string[];
  requiredResultMode?: 'scalar' | 'detail' | 'grouped' | 'ranking' | 'trend';
  runtimeResolutionRequired: boolean;
  forbiddenViews: string[];
  mustClarify: boolean;
  allowedClarificationSlots: Array<'year' | 'threshold' | 'entity_identity' | 'comparison_relation' | 'comparison_baseline' | 'time_point'>;
  requiredAnswerFacts: string[];
  forbiddenClaims: string[];
  managementSupport: 'supported' | 'partial' | 'unsupported' | 'unknown';
  backendSupport: 'supported' | 'partial' | 'unsupported' | 'unknown';
};

export type AskDataGoldQuestionInput = {
  sourceSuite: AskDataGoldQuestionContract['sourceSuite'];
  sourceId: string;
  sourceRole: string;
  question: string;
  expectedView?: string;
  supportClass?: AskDataGoldSupportClass;
  managementSupport?: AskDataGoldQuestionContract['managementSupport'];
  backendSupport?: AskDataGoldQuestionContract['backendSupport'];
  expectedMetricKeys?: string[];
  acceptableViews?: string[];
  requiredViews?: string[];
  allowedClarificationSlots?: AskDataGoldQuestionContract['allowedClarificationSlots'];
  requiredOutputFields?: string[];
  requiredResultMode?: AskDataGoldQuestionContract['requiredResultMode'];
  requiredDimensionKeys?: string[];
  requiredAnswerFacts?: string[];
};

type AskDataQuestionOverride = Partial<Pick<
  AskDataGoldQuestionContract,
  | 'supportClass'
  | 'expectedMetricKeys'
  | 'acceptableViews'
  | 'requiredViews'
  | 'allowedClarificationSlots'
  | 'requiredOutputFields'
  | 'requiredResultMode'
  | 'requiredDimensionKeys'
  | 'requiredAnswerFacts'
  | 'runtimeResolutionRequired'
>>;

const ASK_DATA_QUESTION_OVERRIDES: Record<string, AskDataQuestionOverride> = {
  'ami_brain_2000:BQ0122': {
    supportClass: 'clarification_required',
    allowedClarificationSlots: ['threshold'],
    requiredResultMode: 'detail',
    requiredOutputFields: ['customer_id', 'customer_name_masked', 'cash_balance', 'gift_balance'],
  },
  'ami_brain_2000:BQ0669': unsupportedCurrentAskFact(),
  'ami_brain_2000:BQ0680': unsupportedCurrentAskFact(),
  'ami_brain_2000:BQ0503': unsupportedCurrentAskFact(),
  'ami_brain_2000:BQ0514': unsupportedCurrentAskFact(),
  'ami_brain_2000:BQ0525': unsupportedCurrentAskFact(),
  'ami_brain_2000:BQ0960': {
    supportClass: 'clarification_required',
    allowedClarificationSlots: ['threshold'],
    requiredResultMode: 'detail',
    requiredOutputFields: ['date', 'start_time', 'available_capacity'],
  },
  'ami_brain_2000:BQ1783': {
    supportClass: 'clarification_required',
    allowedClarificationSlots: ['threshold'],
    requiredResultMode: 'grouped',
    requiredOutputFields: ['supplier_id', 'supplier_name', 'procurement_amount'],
  },
  'agent_650:beautician-015': {
    requiredResultMode: 'detail',
    requiredOutputFields: [
      'reservation_id',
      'customer_id',
      'customer_name_masked',
      'date',
      'start_time',
      'project_id',
      'project_name',
    ],
  },
  'agent_650:inventory-003': {
    requiredResultMode: 'detail',
    requiredOutputFields: ['product_id', 'product_name', 'current_stock', 'safety_stock'],
  },
  'agent_650:inventory-040': {
    supportClass: 'clarification_required',
    allowedClarificationSlots: ['threshold'],
    requiredResultMode: 'scalar',
    requiredOutputFields: ['inventory_loss_rate'],
  },
  'agent_650:manager-011': {
    requiredResultMode: 'scalar',
    requiredOutputFields: ['current_period_net_revenue', 'previous_period_net_revenue', 'revenue_difference'],
    requiredAnswerFacts: ['metric_value', 'time_range', 'data_policy', 'amount_unit', 'comparison_current', 'comparison_previous', 'comparison_difference'],
  },
  'agent_650:finance-086': unsupportedCurrentAskFact(),
  'agent_650:finance-009': reconciliationDetailContract(),
  'agent_650:finance-010': reconciliationDetailContract(),
  'agent_650:finance-087': reconciliationDetailContract(),
  'agent_650:finance-098': reconciliationDetailContract(),
  'agent_650:inventory-027': {
    requiredResultMode: 'detail',
    requiredOutputFields: ['product_id', 'product_name', 'current_stock', 'nearest_expiry_date'],
  },
  'agent_650:frontdesk-079': {
    requiredResultMode: 'ranking',
    requiredOutputFields: ['staff_id', 'staff_name', 'idle_minutes', 'overbooked_minutes'],
  },
  'agent_650:frontdesk-083': {
    requiredResultMode: 'detail',
    requiredOutputFields: ['product_id', 'product_name', 'unit', 'current_stock', 'status'],
  },
  'agent_650:inventory-082': {
    requiredResultMode: 'detail',
    requiredOutputFields: ['product_id', 'product_name', 'actual_qty', 'deviation_qty', 'deviation_rate', 'standard_status'],
  },
  'agent_650:marketing-063': {
    requiredResultMode: 'scalar',
    requiredOutputFields: ['marketing_cost', 'attributed_net_revenue', 'roi'],
  },
  'agent_650:manager-097': {
    supportClass: 'clarification_required',
    allowedClarificationSlots: ['threshold'],
    requiredResultMode: 'scalar',
    requiredOutputFields: ['feedback_count'],
  },
  'agent_650:manager-083': {
    supportClass: 'clarification_required',
    allowedClarificationSlots: ['threshold'],
    requiredResultMode: 'scalar',
    requiredOutputFields: ['reservation_count'],
  },
  'agent_650:marketing-062': {
    supportClass: 'clarification_required',
    allowedClarificationSlots: ['threshold'],
    requiredResultMode: 'scalar',
    requiredOutputFields: ['used_count'],
  },
  'agent_650:inventory-009': {
    requiredResultMode: 'ranking',
    requiredOutputFields: ['product_id', 'product_name', 'current_stock', 'safety_stock'],
  },
  'agent_650:finance-074': {
    requiredResultMode: 'scalar',
    requiredOutputFields: ['current_period_refund_amount', 'previous_period_refund_amount', 'refund_amount_difference'],
    requiredAnswerFacts: ['metric_value', 'time_range', 'data_policy', 'amount_unit', 'comparison_current', 'comparison_previous', 'comparison_difference'],
  },
  'agent_650:manager-007': {
    supportClass: 'clarification_required',
    allowedClarificationSlots: ['comparison_baseline'],
    requiredOutputFields: ['average_order_value'],
    requiredResultMode: 'scalar',
  },
  'agent_650:frontdesk-012': {
    requiredOutputFields: ['reservation_id', 'customer_id', 'customer_name_masked', 'date', 'start_time', 'project_name', 'status'],
    requiredResultMode: 'detail',
  },
  'agent_650:frontdesk-031': {
    requiredDimensionKeys: ['customer'],
    requiredOutputFields: [
      'reservation_id',
      'customer_id',
      'customer_name_masked',
      'date',
      'start_time',
      'project_id',
      'project_name',
      'status',
    ],
    requiredResultMode: 'detail',
    requiredAnswerFacts: ['metric_value', 'time_range', 'data_policy', 'list_items'],
  },
  'ask_supplemental:SUP-STAFF-005': {
    requiredOutputFields: ['level_name'],
    requiredResultMode: 'grouped',
  },
  'ask_supplemental:SUP-TRANSFER-006': {
    requiredOutputFields: ['inbound_transfer_count', 'outbound_transfer_count', 'transfer_count_difference'],
    requiredResultMode: 'scalar',
    requiredAnswerFacts: ['metric_value', 'time_range', 'data_policy', 'all_requested_dimensions', 'comparison_difference'],
  },
  'ami_brain_2000:BQ0154': { supportClass: 'brain_content_or_advice' },
  'ami_brain_2000:BQ0162': { supportClass: 'brain_content_or_advice' },
  'ami_brain_2000:BQ0167': { supportClass: 'brain_content_or_advice' },
  'ami_brain_2000:BQ0171': { supportClass: 'brain_content_or_advice' },
  'ami_brain_2000:BQ0175': { supportClass: 'brain_content_or_advice' },
  'ami_brain_2000:BQ0048': {
    expectedMetricKeys: ['customer_balance', 'card_assets'],
    acceptableViews: ['agent_v3_customer_balance_view', 'agent_v3_card_asset_view'],
    requiredViews: ['agent_v3_customer_balance_view', 'agent_v3_card_asset_view'],
    requiredOutputFields: ['customer_id', 'customer_name_masked', 'cash_balance', 'gift_balance', 'card_name', 'remaining_times'],
    requiredResultMode: 'detail',
  },
  'ami_brain_2000:BQ0058': {
    expectedMetricKeys: ['customer_balance', 'card_assets'],
    acceptableViews: ['agent_v3_customer_balance_view', 'agent_v3_card_asset_view'],
    requiredViews: ['agent_v3_customer_balance_view', 'agent_v3_card_asset_view'],
    requiredOutputFields: ['customer_id', 'customer_name_masked', 'cash_balance', 'gift_balance', 'card_name', 'remaining_times'],
    requiredResultMode: 'detail',
  },
  'ami_brain_2000:BQ0068': {
    expectedMetricKeys: ['customer_balance', 'card_assets'],
    acceptableViews: ['agent_v3_customer_balance_view', 'agent_v3_card_asset_view'],
    requiredViews: ['agent_v3_customer_balance_view', 'agent_v3_card_asset_view'],
    requiredOutputFields: ['customer_id', 'customer_name_masked', 'cash_balance', 'gift_balance', 'card_name', 'remaining_times'],
    requiredResultMode: 'detail',
  },
  'ami_brain_2000:BQ0078': {
    expectedMetricKeys: ['customer_balance', 'card_assets'],
    acceptableViews: ['agent_v3_customer_balance_view', 'agent_v3_card_asset_view'],
    requiredViews: ['agent_v3_customer_balance_view', 'agent_v3_card_asset_view'],
    requiredOutputFields: ['customer_id', 'customer_name_masked', 'cash_balance', 'gift_balance', 'card_name', 'remaining_times'],
    requiredResultMode: 'detail',
  },
  'ami_brain_2000:BQ1303': {
    requiredOutputFields: ['stored_value_liability', 'card_liability'],
    requiredResultMode: 'scalar',
    requiredAnswerFacts: ['metric_value', 'time_range', 'data_policy', 'all_requested_metrics'],
  },
  'ami_brain_2000:BQ1305': {
    requiredDimensionKeys: ['category'],
    requiredOutputFields: ['category', 'operating_cost', 'cost_share'],
    requiredResultMode: 'grouped',
    requiredAnswerFacts: ['metric_value', 'time_range', 'data_policy', 'amount_unit', 'all_requested_dimensions'],
  },
  'agent_650:manager-073': {
    requiredDimensionKeys: ['product'],
    requiredOutputFields: ['product_id', 'product_name', 'movement_quantity'],
    requiredResultMode: 'ranking',
    requiredAnswerFacts: ['metric_value', 'time_range', 'data_policy', 'ranking_order', 'ranking_limit'],
  },
  'ami_brain_2000:BQ0181': runtimeCustomerClarification(['customer_id', 'customer_name_masked', 'churn_risk_level']),
  'ami_brain_2000:BQ0186': runtimeCustomerClarification(['customer_id', 'customer_name_masked', 'ltv_tier']),
  'ami_brain_2000:BQ0189': runtimeCustomerClarification(['customer_id', 'customer_name_masked', 'churn_risk_level']),
  'ami_brain_2000:BQ0192': runtimeCustomerClarification(['customer_id', 'customer_name_masked', 'ltv_tier']),
  'ami_brain_2000:BQ0194': runtimeCustomerClarification(['customer_id', 'customer_name_masked', 'churn_risk_level']),
  'ami_brain_2000:BQ0197': runtimeCustomerClarification(['customer_id', 'customer_name_masked', 'ltv_tier']),
  'ami_brain_2000:BQ0198': runtimeCustomerClarification(['customer_id', 'customer_name_masked', 'churn_risk_level']),
  'ami_brain_2000:BQ0201': runtimeCustomerClarification(['customer_id', 'customer_name_masked', 'ltv_tier']),
  'ami_brain_2000:BQ0202': runtimeCustomerClarification(['customer_id', 'customer_name_masked', 'churn_risk_level']),
  'ami_brain_2000:BQ0205': runtimeCustomerClarification(['customer_id', 'customer_name_masked', 'ltv_tier']),
  'ami_brain_2000:BQ0003': runtimeCustomerClarification(['customer_id', 'customer_name_masked', 'member_level']),
  'ami_brain_2000:BQ0015': runtimeCustomerClarification(['customer_id', 'customer_name_masked', 'member_level']),
  'agent_650:frontdesk-030': runtimeCustomerClarification(['customer_id', 'customer_name_masked', 'date', 'start_time', 'project_name']),
  'agent_650:frontdesk-048': {
    requiredOutputFields: [
      'reservation_id',
      'customer_id',
      'customer_name_masked',
      'date',
      'start_time',
      'project_name',
    ],
    requiredResultMode: 'detail',
  },
};

export const ASK_DATA_VIEW_METRIC_KEYS: Record<string, string> = {
  agent_v3_order_summary_view: 'order_revenue',
  agent_v3_order_item_sales_view: 'product_sales',
  agent_v3_project_service_sales_view: 'project_sales',
  agent_v3_payment_refund_view: 'payment_flow',
  agent_v3_daily_settlement_view: 'daily_net_receipts',
  agent_v3_product_inventory_view: 'inventory_on_hand',
  agent_v3_stock_movement_view: 'inventory_movement',
  agent_v3_inventory_scrap_view: 'inventory_scrap',
  ask_data_customer_profile_summary_view: 'customer_profile',
  agent_v3_staff_profile_view: 'staff_profile',
  ask_data_staff_performance_view: 'staff_performance',
  agent_v3_reservation_view: 'reservation_metrics',
  agent_v3_marketing_conversion_view: 'marketing_conversion',
  agent_v3_card_asset_view: 'card_assets',
  agent_v3_card_usage_view: 'card_usage',
  agent_v3_customer_balance_view: 'customer_balance',
  agent_v3_service_quality_view: 'service_quality',
  agent_v3_appointment_gap_view: 'appointment_gap',
  agent_v3_project_catalog_view: 'project_catalog',
  agent_v3_marketing_activity_view: 'marketing_activity',
  agent_v3_marketing_automation_view: 'marketing_automation',
  agent_v3_promotion_offer_view: 'promotion_offer',
  ask_data_operating_cost_view: 'operating_cost',
  agent_v3_purchase_procurement_view: 'procurement_detail',
  agent_v3_supplier_performance_view: 'supplier_performance',
  ask_data_confirmed_profit_view: 'confirmed_profit',
  ask_data_reconciliation_issue_view: 'reconciliation_issue',
  ask_data_member_liability_view: 'member_liability',
  ask_data_staff_capacity_view: 'staff_capacity',
  ask_data_transfer_status_view: 'transfer_status',
  ask_data_bom_consumption_variance_view: 'bom_variance',
  ask_data_customer_feedback_view: 'customer_feedback',
  ask_data_customer_lifecycle_view: 'customer_lifecycle',
  ask_data_marketing_roi_view: 'marketing_roi',
};

const VIEW_CONFLICTS: Record<string, string[]> = {
  agent_v3_order_summary_view: ['agent_v3_daily_settlement_view', 'agent_v3_payment_refund_view'],
  agent_v3_daily_settlement_view: ['agent_v3_order_summary_view'],
  agent_v3_payment_refund_view: ['agent_v3_order_summary_view'],
  agent_v3_project_service_sales_view: ['agent_v3_reservation_view', 'agent_v3_project_catalog_view'],
  agent_v3_project_catalog_view: ['agent_v3_project_service_sales_view'],
  agent_v3_stock_movement_view: ['agent_v3_product_inventory_view'],
  agent_v3_product_inventory_view: ['agent_v3_card_asset_view'],
  ask_data_staff_capacity_view: ['agent_v3_reservation_view', 'agent_v3_service_quality_view'],
  ask_data_operating_cost_view: ['ask_data_confirmed_profit_view', 'ask_data_marketing_roi_view'],
  ask_data_reconciliation_issue_view: ['agent_v3_order_summary_view'],
};

const METRIC_REQUIRED_OUTPUTS: Record<string, string[]> = {
  order_revenue: ['net_revenue'],
  product_sales: ['sales_quantity'],
  project_sales: ['service_count'],
  payment_flow: ['payment_amount'],
  daily_net_receipts: ['net_receipts'],
  inventory_on_hand: ['current_stock'],
  inventory_movement: ['movement_quantity'],
  inventory_scrap: ['loss_amount'],
  customer_profile: ['customer_count'],
  staff_profile: ['staff_count'],
  staff_performance: ['paid_amount'],
  reservation_metrics: ['reservation_count'],
  marketing_conversion: ['conversion_count'],
  card_assets: ['remaining_times'],
  card_usage: ['usage_times'],
  customer_balance: ['cash_balance', 'gift_balance'],
  service_quality: ['service_task_count'],
  appointment_gap: ['available_capacity'],
  project_catalog: ['price'],
  marketing_activity: ['participants'],
  marketing_automation: ['task_count', 'completed_count'],
  promotion_offer: ['issued_count', 'used_count'],
  operating_cost: ['operating_cost'],
  procurement_detail: ['procurement_amount'],
  supplier_performance: ['procurement_amount'],
  confirmed_profit: ['operating_profit'],
  reconciliation_issue: ['issue_count'],
  member_liability: ['total_liability'],
  staff_capacity: ['scheduled_minutes', 'booked_minutes', 'idle_minutes'],
  transfer_status: ['transfer_count'],
  bom_variance: ['deviation_rate'],
  customer_feedback: ['feedback_count'],
  customer_lifecycle: ['customer_count'],
  marketing_roi: ['roi'],
  payment_customer_detail: ['paid_at', 'payment_amount'],
  inventory_usage_balance: ['consumed_quantity', 'current_stock'],
  inventory_loss_rate: ['inventory_loss_rate'],
  payment_order_difference: ['payment_amount', 'order_amount', 'payment_order_difference'],
};

const VIEW_REQUIRED_IDENTITIES: Record<string, string[]> = {
  agent_v3_order_summary_view: ['order_id'],
  agent_v3_order_item_sales_view: ['product_id', 'product_name'],
  agent_v3_project_service_sales_view: ['project_id', 'project_name'],
  agent_v3_payment_refund_view: ['order_id'],
  agent_v3_product_inventory_view: ['product_id', 'product_name'],
  agent_v3_stock_movement_view: ['movement_id', 'product_id', 'product_name'],
  agent_v3_inventory_scrap_view: ['movement_id', 'product_id', 'product_name'],
  ask_data_customer_profile_summary_view: ['customer_id', 'customer_name_masked'],
  agent_v3_staff_profile_view: ['staff_id', 'staff_name'],
  ask_data_staff_performance_view: ['staff_id', 'staff_name'],
  agent_v3_reservation_view: ['reservation_id'],
  agent_v3_marketing_conversion_view: ['activity_id', 'activity_title'],
  agent_v3_card_asset_view: ['customer_card_id', 'customer_id', 'customer_name_masked'],
  agent_v3_card_usage_view: ['customer_id', 'customer_name_masked', 'card_name', 'project_name'],
  agent_v3_customer_balance_view: ['customer_id', 'customer_name_masked'],
  agent_v3_service_quality_view: ['service_task_id'],
  agent_v3_appointment_gap_view: ['date', 'start_time'],
  agent_v3_project_catalog_view: ['project_id', 'project_name'],
  agent_v3_marketing_activity_view: ['activity_id', 'activity_title'],
  agent_v3_marketing_automation_view: ['automation_source', 'trigger_type'],
  agent_v3_promotion_offer_view: ['promotion_id', 'promotion_name'],
  agent_v3_purchase_procurement_view: ['procurement_id', 'procurement_no'],
  agent_v3_supplier_performance_view: ['supplier_id', 'supplier_name'],
  ask_data_reconciliation_issue_view: ['issue_id'],
  ask_data_staff_capacity_view: ['staff_id', 'staff_name'],
  ask_data_transfer_status_view: ['transfer_id', 'transfer_no'],
  ask_data_bom_consumption_variance_view: ['movement_id', 'project_id', 'project_name', 'product_id', 'product_name'],
  ask_data_customer_feedback_view: ['feedback_id'],
  ask_data_customer_lifecycle_view: ['customer_id', 'customer_name_masked'],
};

export function buildAskDataGoldQuestionContract(input: AskDataGoldQuestionInput): AskDataGoldQuestionContract {
  const override = ASK_DATA_QUESTION_OVERRIDES[`${input.sourceSuite}:${input.sourceId}`] ?? {};
  const expectedView = governedExpectedView(input.question, input.expectedView?.trim() ?? '');
  const supportClass = override.supportClass ?? input.supportClass ?? (expectedView ? 'ask_query_supported' : 'admin_supported_ask_not_open');
  const expectedMetricKeys = override.expectedMetricKeys
    ? [...override.expectedMetricKeys]
    : input.expectedMetricKeys
    ? [...input.expectedMetricKeys]
    : expectedView && ASK_DATA_VIEW_METRIC_KEYS[expectedView]
      ? [ASK_DATA_VIEW_METRIC_KEYS[expectedView]]
      : [];
  const acceptableViews = override.acceptableViews
    ? [...override.acceptableViews]
    : input.acceptableViews
    ? [...input.acceptableViews]
    : expectedView ? acceptableViewsFor(input.question, expectedView) : [];
  const requiredViews = override.requiredViews
    ? [...override.requiredViews]
    : input.requiredViews
    ? [...input.requiredViews]
    : requiredViewsFor(input.question, expectedView);
  for (const viewName of requiredViews) {
    const metricKey = ASK_DATA_VIEW_METRIC_KEYS[viewName];
    if (metricKey && !expectedMetricKeys.includes(metricKey)) expectedMetricKeys.push(metricKey);
    if (!acceptableViews.includes(viewName)) acceptableViews.push(viewName);
  }
  const allowedClarificationSlots = override.allowedClarificationSlots
    ? [...override.allowedClarificationSlots]
    : input.allowedClarificationSlots
    ? [...input.allowedClarificationSlots]
    : clarificationSlots(input.question);
  const requiredResultMode = override.requiredResultMode
    ?? input.requiredResultMode
    ?? inferRequiredResultMode(input.question, expectedMetricKeys);
  const requiredOutputFields = override.requiredOutputFields
    ? [...override.requiredOutputFields]
    : input.requiredOutputFields?.length
      ? [...input.requiredOutputFields]
      : inferRequiredOutputFields(input.question, expectedMetricKeys, requiredViews, requiredResultMode);
  const checksum = createHash('sha256').update(normalizeQuestion(input.question)).digest('hex');
  return {
    id: `${input.sourceSuite}:${input.sourceId}`,
    sourceSuite: input.sourceSuite,
    sourceId: input.sourceId,
    sourceRole: input.sourceRole,
    question: input.question,
    checksum,
    split: Number.parseInt(checksum.slice(0, 8), 16) % 5 === 0 ? 'holdout' : 'development',
    supportClass,
    expectedMetricKeys,
    requiredDimensionKeys: override.requiredDimensionKeys
      ? [...override.requiredDimensionKeys]
      : input.requiredDimensionKeys
        ? [...input.requiredDimensionKeys]
        : requiredDimensions(input.question),
    acceptableViews,
    requiredViews,
    requiredOutputFields,
    requiredResultMode,
    runtimeResolutionRequired: override.runtimeResolutionRequired
      ?? (['ask_query_supported', 'ask_query_low_confidence'].includes(supportClass) && containsNamedBusinessEntity(input.question)),
    forbiddenViews: expectedView
      ? (VIEW_CONFLICTS[expectedView] ?? []).filter((viewName) => !acceptableViews.includes(viewName))
      : [],
    mustClarify: allowedClarificationSlots.length > 0,
    allowedClarificationSlots,
    requiredAnswerFacts: override.requiredAnswerFacts
      ? [...override.requiredAnswerFacts]
      : input.requiredAnswerFacts
        ? [...input.requiredAnswerFacts]
        : requiredAnswerFacts(input.question),
    forbiddenClaims: [
      '不得声称跨门店结论。',
      '不得输出手机号、地址、健康信息、备注原文或其他敏感字段。',
      '不得把估算值表述为实际确认值。',
      '不得用无数据推断业务从未发生。',
      ...(/为什么|原因|怎么回事/.test(input.question) ? ['不得仅凭查询结果断言因果关系。'] : []),
    ],
    managementSupport: input.managementSupport ?? (expectedView ? 'supported' : 'unknown'),
    backendSupport: input.backendSupport ?? (expectedView ? 'supported' : 'unknown'),
  };
}

function inferRequiredResultMode(
  question: string,
  _metricKeys: string[],
): NonNullable<AskDataGoldQuestionContract['requiredResultMode']> {
  if (/最后一个预约/.test(question)) return 'detail';
  if (/(?:下午两点|下午2点|\b14[:：]00\b).*(?:客人|客户).*(?:什么项目|做什么)|(?:什么项目|做什么).*(?:下午两点|下午2点|\b14[:：]00\b)/.test(question)) return 'detail';
  if (/有什么(?:产品|商品).*可以卖|有没有什么(?:产品|商品).*只剩|\d+天内.*(?:过期|临期)|(?:过期|临期).*(?:产品|商品|东西)/.test(question)) return 'detail';
  if (/哪个(?:员工|美容师).*可以接新单|可以接新单.*哪个(?:员工|美容师)/.test(question)) return 'ranking';
  if (/(?:消耗异常|异常消耗).*(?:产品|商品)|(?:产品|商品).*(?:消耗异常|异常消耗)/.test(question)) return 'detail';
  if (/主要营收项目|项目.*主要营收/.test(question)) return 'ranking';
  if (/(?:产品|商品).*动销|动销分析/.test(question)) return 'grouped';
  if (/支付方式(?:结构|分布)|成本结构/.test(question) && !/变化|趋势|走势|相比|对比|环比|同比/.test(question)) return 'grouped';
  if (/有(?:几|多少)个预约/.test(question)) return 'scalar';
  if (/活动.*(?:亏钱|亏损|赔钱|不赚钱)/.test(question)) return 'grouped';
  if (/面部.*预约.*身体|预约.*面部.*身体/.test(question)) return 'scalar';
  if (/哪天最忙.*空档/.test(question)) return 'grouped';
  if (/哪里有空位|哪个时段可以加客/.test(question)) return 'detail';
  if (/预约.*都有谁|预约了但还没来.*客人|还没来的客人/.test(question)) return 'detail';
  if (/最近采购了什么|采购了什么.*花了多少钱/.test(question)) return 'detail';
  if (/项目订单和产品订单各占多少|项目收入和产品销售各多少/.test(question)) return 'scalar';
  if (/活动归因的收益分别多少/.test(question)) return 'scalar';
  if (/按最高优先级机会类型统计|按.+(?:类型|状态|级别|职级|方向|范围).*(?:统计|汇总)/.test(question)) return 'grouped';
  if (/历史采购记录.*一般一次买多少/.test(question)) return 'scalar';
  if (/有没有.*(?:漏收|多收|重复收费|双计费|重复退款|重复消费)|核对.*(?:收款|系统记录).*(?:一致|平不平)|成本项目异常增加/.test(question)) {
    return 'detail';
  }
  if (/有没有耗材被浪费|使用不规范/.test(question)) return 'detail';
  if (/排行|排名|从高到低|从低到高|降序|升序|最高|最低|最多|最少|最大|最小|最快|最慢|前\s*\d+|top\s*\d*|最受欢迎|最热门|卖得最好|业绩最好|进步最快|最容易过期/i.test(question)) {
    return 'ranking';
  }
  if (/趋势|走势|变化|按日|每日|每天|按月|每月|每个月|逐月|按周|每周/.test(question)) return 'trend';
  if (/各(?:供应商|项目|商品|产品|品类|次卡|卡项|员工|美容师|支付方式|优惠活动|门店|对方门店|操作人|类型|状态)|每(?:个|种)(?:供应商|项目|商品|产品|品类|次卡|卡项|员工|美容师)|按.+(?:统计|汇总)|有哪些.*各多少|分别多少|各占多少|谁服务了几个客人/.test(question)) {
    return 'grouped';
  }
  if (/全局优惠和门店优惠各有多少个|按消费金额分.*层|用了多少.*还剩多少|补水系列产品的库存/.test(question)) return 'grouped';
  if (/一共有多少|总共有多少|共有多少|多少条|多少张|多少笔|几笔|多少人|有多少个|合计(?:各)?是多少|总计(?:各)?是多少/.test(question)) {
    return 'scalar';
  }
  if (/哪些|列出|列表|明细|记录|流水|逐笔|所有|下一个预约|第一笔收款|首笔收款|当前.*(?:优惠|活动|调拨)|待接收|未完成.*单|最近入职|有没有.*客户|服务流程安排/.test(question)) {
    return 'detail';
  }
  if (/属于哪个项目类型/.test(question)) return 'detail';
  if (/(?:最近\s*\d+\s*天|今天|昨天|上周|本周)?.{2,24}消耗了多少/.test(question)) return 'grouped';
  if (containsNamedBusinessEntity(question)) return 'detail';
  if (/对比|比较|相比|环比|同比|跟.+比/.test(question)) return 'grouped';
  if (/库存整体情况/.test(question)) return 'scalar';
  if (/(?:商品|产品|耗材|库存).*(?:还有多少|剩多少|情况)|浪费|使用不规范/.test(question)) return 'grouped';
  return 'scalar';
}

function inferRequiredOutputFields(
  question: string,
  metricKeys: string[],
  requiredViews: string[],
  resultMode: NonNullable<AskDataGoldQuestionContract['requiredResultMode']>,
) {
  const fields: string[] = [];
  if (resultMode === 'detail' || resultMode === 'ranking') {
    for (const viewName of requiredViews) fields.push(...requiredIdentityFields(viewName, question, resultMode));
  }
  fields.push(...requiredDimensionOutputFields(question, resultMode));
  for (const metricKey of metricKeys) fields.push(...metricRequiredOutputs(metricKey, question, resultMode));
  fields.push(...detailRequiredOutputs(question, requiredViews, resultMode));
  if (resultMode === 'trend') fields.unshift(requiredTrendAlias(question));
  return [...new Set(fields.filter(Boolean))];
}

function requiredIdentityFields(
  viewName: string,
  question: string,
  resultMode: NonNullable<AskDataGoldQuestionContract['requiredResultMode']>,
) {
  const fields = [...(VIEW_REQUIRED_IDENTITIES[viewName] ?? [])];
  if (viewName === 'agent_v3_card_usage_view' && resultMode === 'ranking' && /确认收入.*(?:次卡|卡项)|(?:次卡|卡项).*确认收入/.test(question)) {
    return ['card_name'];
  }
  if (viewName === 'ask_data_bom_consumption_variance_view' && resultMode === 'ranking' && /按项目|哪个项目/.test(question)) {
    return ['project_id', 'project_name'];
  }
  if (viewName === 'agent_v3_stock_movement_view' || viewName === 'agent_v3_inventory_scrap_view') {
    return /记录|流水|明细|逐笔/.test(question) && resultMode === 'detail'
      ? fields
      : fields.filter((field) => field !== 'movement_id');
  }
  if (resultMode === 'ranking') {
    return fields.filter((field) => !/^(?:order_id|reservation_id|usage_id|feedback_id|issue_id|transfer_id|procurement_id)$/.test(field));
  }
  return fields;
}

function metricRequiredOutputs(
  metricKey: string,
  question: string,
  resultMode: NonNullable<AskDataGoldQuestionContract['requiredResultMode']>,
) {
  if (metricKey === 'order_revenue' && /(?:第一笔|首笔)收款/.test(question)) return [];
  if (metricKey === 'order_revenue' && /多少笔|几笔|订单量|订单数/.test(question)) return ['order_count'];
  if (metricKey === 'product_sales' && /金额|销售额|收入/.test(question)) return ['net_sales_amount'];
  if (metricKey === 'project_sales' && /金额|销售额|收入/.test(question)) return ['project_revenue'];
  if (metricKey === 'payment_flow') {
    const methods = [
      [/现金/, 'cash_payment_amount'],
      [/微信/, 'wechat_payment_amount'],
      [/支付宝/, 'alipay_payment_amount'],
      [/银行卡|刷卡/, 'card_payment_amount'],
    ].filter(([pattern]) => (pattern as RegExp).test(question)).map(([, alias]) => alias as string);
    if (methods.length > 1) return methods;
    if (/退款.*(?:多少笔|几笔)/.test(question)) return ['flow_count'];
    if (/退款/.test(question) && !/实收|收款/.test(question)) return ['refund_amount'];
  }
  if (metricKey === 'inventory_on_hand' && /价值|货值/.test(question)) return ['stock_value'];
  if (metricKey === 'member_liability' && /(?:储值负债.*次卡负债|次卡负债.*储值负债)/.test(question)) {
    return ['stored_value_liability', 'card_liability'];
  }
  if ((metricKey === 'inventory_on_hand' || metricKey === 'inventory_movement') && /用了多少.*还剩多少/.test(question)) return [];
  if (metricKey === 'inventory_scrap' && /数量/.test(question) && !/金额|货值/.test(question)) return ['scrap_quantity'];
  if (metricKey === 'staff_profile' && resultMode === 'detail') return [];
  if (metricKey === 'staff_profile' && resultMode === 'ranking' && /最近入职/.test(question)) return [];
  if (metricKey === 'staff_performance') {
    if (/提成/.test(question)) return ['commission_amount'];
    if (/服务|客人/.test(question)) return ['service_count'];
  }
  if (metricKey === 'reservation_metrics' && resultMode === 'detail') return [];
  if (metricKey === 'reservation_metrics' && /面部.*预约.*身体|预约.*面部.*身体/.test(question)) {
    return ['face_reservation_count', 'body_reservation_count'];
  }
  if (metricKey === 'project_catalog') {
    const outputs = [];
    if (/价格|价钱|收费/.test(question)) outputs.push('price');
    if (/时长|多久|分钟/.test(question)) outputs.push('duration');
    if (/类型|疗程/.test(question)) outputs.push('project_type');
    return outputs.length ? outputs : ['price'];
  }
  if (metricKey === 'marketing_activity' && /多少个|活动数量/.test(question)) return ['activity_count'];
  if (metricKey === 'marketing_automation' && /成功率|完成率/.test(question)) {
    return ['task_count', 'completed_count', 'completion_rate'];
  }
  if (metricKey === 'marketing_conversion' && /转化率/.test(question)) {
    return ['lead_count', 'conversion_count', 'conversion_rate'];
  }
  if (metricKey === 'promotion_offer' && /活动数量|多少个/.test(question)) return ['promotion_count'];
  if (metricKey === 'promotion_offer' && /使用|核销/.test(question) && !/发放/.test(question)) return ['used_count'];
  if (metricKey === 'card_usage' && /确认收入/.test(question) && !/核销次数/.test(question)) return ['recognized_amount'];
  if (metricKey === 'appointment_gap' && /候选客户/.test(question)) return ['candidate_count'];
  if (metricKey === 'procurement_detail' && /多少(?:张|笔|个)|数量/.test(question)) return ['procurement_count'];
  if (metricKey === 'procurement_detail' && /一般一次买多少|平均.*采购|采购.*平均/.test(question)) return ['average_procurement_amount'];
  if (metricKey === 'reconciliation_issue' && /金额/.test(question)) return ['issue_amount'];
  if (metricKey === 'transfer_status' && resultMode === 'detail') return ['product_count'];
  if (metricKey === 'customer_feedback' && resultMode === 'detail' && /(?:投诉|客诉|不满|体验不佳|差评|负面反馈)/.test(question) && !/(?:多少|数量|统计|最多|排行|排名|平均)/.test(question)) return [];
  if (metricKey === 'customer_feedback' && /评分|满意度/.test(question)) return ['average_rating'];
  if (metricKey === 'customer_lifecycle' && resultMode === 'detail') return [];
  if (metricKey === 'customer_profile' && resultMode === 'detail') return [];
  if (metricKey === 'customer_lifecycle' && /按最高优先级机会类型统计/.test(question)) return ['customer_count'];
  if (metricKey === 'customer_lifecycle' && /机会评分/.test(question)) return ['top_score'];
  if (metricKey === 'marketing_conversion' && /收益|归因收入/.test(question)) return ['attributed_revenue'];
  if (metricKey === 'staff_capacity' && /超过接待能力|超排/.test(question)) return ['overbooked_minutes'];
  if (metricKey === 'staff_capacity' && /利用率/.test(question)) {
    return ['scheduled_minutes', 'booked_minutes', 'utilization_rate'];
  }
  if (metricKey === 'inventory_scrap' && /平均损耗/.test(question)) return ['average_loss_amount'];
  if (metricKey === 'inventory_loss_rate') return ['inventory_loss_rate'];
  if (metricKey === 'inventory_movement' && /库存损耗率/.test(question)) return [];
  if (metricKey === 'payment_order_difference') return ['payment_amount', 'order_amount', 'payment_order_difference'];
  if (metricKey === 'daily_net_receipts' && /到账的钱和开单的钱差多少/.test(question)) return [];
  if (metricKey === 'confirmed_profit' && /耗材成本占/.test(question)) {
    return ['material_cost', 'operating_revenue', 'material_cost_rate'];
  }
  if (metricKey === 'confirmed_profit' && /毛利率/.test(question)) {
    return ['operating_revenue', 'gross_profit', 'gross_margin_rate'];
  }
  if (metricKey === 'confirmed_profit' && /经营利润率/.test(question)) {
    return ['operating_revenue', 'operating_profit', 'operating_margin_rate'];
  }
  if (metricKey === 'bom_variance' && /一共有多少条|多少条.*异常/.test(question)) return ['abnormal_record_count'];
  if (metricKey === 'bom_variance' && /哪个项目.*耗材最多/.test(question)) return ['actual_qty'];
  if (metricKey === 'transfer_status' && /商品种类最多/.test(question)) return ['product_count'];
  if (metricKey === 'marketing_roi' && /权益.*吸引力/.test(question)) return ['exposure_count', 'conversion_count', 'conversion_rate'];
  if (metricKey === 'marketing_roi' && /(?:获客|拓客)成本/.test(question)) return ['acquisition_cost'];
  if (metricKey === 'marketing_roi' && /活动.*(?:亏钱|亏损|赔钱|不赚钱)/.test(question)) {
    return ['attributed_net_revenue', 'marketing_cost', 'marketing_profit', 'roi'];
  }
  if (metricKey === 'marketing_roi' && /活动.*(?:roi|投产|投入产出|最高|最低)/i.test(question)) {
    return ['roi'];
  }
  return METRIC_REQUIRED_OUTPUTS[metricKey] ?? [`${metricKey}_value`];
}

function requiredDimensionOutputFields(
  question: string,
  resultMode: NonNullable<AskDataGoldQuestionContract['requiredResultMode']>,
) {
  if (resultMode === 'scalar') return [];
  const fields: string[] = [];
  if (/员工级别|员工职级|各员工级别|各员工职级/.test(question)) fields.push('level_name');
  else if (/谁服务了几个客人/.test(question)) {
    fields.push('beautician_id', 'beautician_name');
  } else if (/(?:员工|美容师).*(?:排行|排名|前\s*\d+)|哪位员工|哪个员工|哪个美容师|哪位美容师|员工.*及其|美容师.*及其|业绩最好|提成最高|最近入职/.test(question)) {
    fields.push('staff_id', 'staff_name');
  }
  if (/供应商/.test(question)) fields.push('supplier_id', 'supplier_name');
  if (/属于哪个项目类型|项目类型/.test(question)) fields.push('project_id', 'project_name', 'project_type');
  else if (resultMode !== 'trend' && /按项目|各项目|哪个项目|项目.*(?:排行|前\s*\d+)|最受欢迎项目|项目销量/.test(question)) fields.push('project_id', 'project_name');
  if (resultMode !== 'trend' && !/调拨/.test(question) && /按商品|按产品|各商品|各产品|哪些商品|哪些产品|商品.*(?:排行|前\s*\d+|动销)|产品.*(?:排行|前\s*\d+|动销)|动销分析|(?:精华液|补水系列|洗面奶).*(?:库存|还有多少|剩多少)/.test(question)) {
    fields.push('product_id', 'product_name');
  }
  if (/各品类|按品类|商品分类|产品分类/.test(question)) fields.push('category_name');
  if (/客户|会员|顾客/.test(question) && !/按反馈类型|客户反馈数量|按消费金额分.*层|按最高优先级机会类型统计|权益.*吸引力/.test(question)) fields.push('customer_id', 'customer_name_masked');
  if (/支付方式/.test(question) && resultMode === 'grouped') fields.push('payment_method');
  if (/哪些活动|各活动|活动.*(?:亏钱|亏损|赔钱|不赚钱|roi|投产|投入产出|最高|最低)/i.test(question)) {
    fields.push('activity_id', 'activity_title');
  }
  if (/渠道/.test(question)) fields.push('channel');
  if (/反馈类型/.test(question)) fields.push('feedback_type');
  if (/机会类型/.test(question)) fields.push('top_opportunity_type');
  if (/按状态|各状态/.test(question)) fields.push('status');
  if (/优惠类型|按类型统计.*活动/.test(question)) fields.push('type');
  if (/运营成本有哪些|经营成本有哪些|成本结构/.test(question)) fields.push('category');
  if (/全局优惠和门店优惠/.test(question)) fields.push('scope_type');
  if (/各对方门店/.test(question)) fields.push('counterpart_store_id', 'counterpart_store_name');
  if (/各操作人/.test(question)) fields.push('operator_name');
  if (/按次卡名称|各次卡|各卡项|每种次卡|每种卡项/.test(question)) fields.push('card_name');
  if (/哪天最忙/.test(question)) fields.push('date');
  if (/按消费金额分.*层/.test(question)) fields.push('ltv_tier');
  if (/权益.*吸引力/.test(question)) fields.push('promotion_id', 'promotion_name');
  if (/调入和调出|按方向/.test(question)) fields.push('direction');
  return fields;
}

function detailRequiredOutputs(
  question: string,
  requiredViews: string[],
  resultMode: NonNullable<AskDataGoldQuestionContract['requiredResultMode']>,
) {
  if (resultMode !== 'detail' && resultMode !== 'ranking') return [];
  const fields: string[] = [];
  if (requiredViews.includes('agent_v3_reservation_view') && resultMode === 'detail') fields.push('date', 'start_time', 'project_name');
  if (requiredViews.includes('agent_v3_appointment_gap_view')) fields.push('date', 'start_time', 'available_capacity');
  if (requiredViews.includes('agent_v3_staff_profile_view') && /职级|级别/.test(question)) fields.push('level_name');
  if (requiredViews.includes('ask_data_staff_capacity_view')) fields.push('work_date', 'scheduled_minutes', 'booked_minutes', 'idle_minutes');
  if (requiredViews.includes('ask_data_customer_feedback_view') && resultMode === 'detail') fields.push('feedback_type', 'rating');
  if (requiredViews.includes('ask_data_customer_lifecycle_view') && resultMode === 'detail') {
    if (/流失/.test(question)) fields.push('churn_risk_level', 'computed_at');
    if (/价值|分层|ltv/i.test(question)) fields.push('ltv_tier', 'computed_at');
    if (/机会/.test(question)) fields.push('top_opportunity_type', 'top_priority', 'top_score');
  }
  if (requiredViews.includes('agent_v3_customer_balance_view')) fields.push('cash_balance', 'gift_balance');
  if (requiredViews.includes('agent_v3_card_asset_view') && resultMode === 'detail') fields.push('card_name', 'remaining_times', 'expiry_date');
  if (requiredViews.includes('agent_v3_card_usage_view') && resultMode === 'detail') fields.push('card_name', 'project_name', 'remaining_times', 'verified_at');
  if (requiredViews.includes('agent_v3_product_inventory_view')) fields.push('current_stock');
  if (requiredViews.includes('ask_data_transfer_status_view') && resultMode === 'detail') fields.push('status', 'direction', 'updated_at');
  return fields;
}

function requiredTrendAlias(question: string) {
  if (/按日|每日|每天|日趋势/.test(question)) return 'trend_day';
  if (/按月|每月|每个月|逐月|月趋势/.test(question)) return 'trend_month';
  if (/按周|每周|周趋势/.test(question)) return 'trend_week';
  if (/最近三个月|这个季度|上个季度|去年同期|这半年|近半年|今年|年度/.test(question)) return 'trend_month';
  return 'trend_day';
}

function containsNamedBusinessEntity(question: string) {
  if (/谁的业绩|业绩最好.*谁|提成最高.*谁|哪个员工|哪位员工|哪个美容师|哪位美容师/.test(question)) return false;
  const reserved = new Set(['客户', '会员', '顾客', '员工', '美容师', '今天', '昨天', '本月', '最近', '当前', '哪些', '所有', '上周']);
  const patterns = [
    /(?:^|[，,。！？?；;\s])(?:帮我|请|查询|查看|查一下|查下|看看|预测|分析|告诉我)?(?:客户|会员|顾客)?([\p{Script=Han}·]{2,4})的(?:预约|会员等级|流失风险|生命周期|客户价值分层预测|储值余额|现金余额|赠送余额|余额|次卡|消费记录|消费情况|最近到店|生日)/gu,
    /预测([\p{Script=Han}·]{2,4})的(?:流失风险|生命周期|客户价值)/gu,
    /(?:^|[，,。！？?；;\s])(?:员工|美容师)?([\p{Script=Han}·]{2,4}?)(?:是什么职级|是什么级别)/gu,
    /(?:^|[，,。！？?；;\s])(?:员工|美容师)?([\p{Script=Han}·]{2,4}?)(?:这半年|昨天|本月|上个月|最近\s*\d+\s*天|这个季度|今年|上周)的?(?:提成|排班|业绩)/gu,
    /(?:^|[，,。！？?；;\s])(?:员工|美容师)?([\p{Script=Han}·]{2,4}?)的(?:提成|排班|业绩)/gu,
    /(?:^|[，,。！？?；;\s])(?:员工|美容师)?([\p{Script=Han}·]{2,4}?)(?:这半年|昨天|本月|上个月|最近\s*\d+\s*天|这个季度|今年|上周)有(?:几|多少)个预约/gu,
    /(?:^|[，,。！？?；;\s])(?:员工|美容师)?([\p{Script=Han}·]{2,4}?)(?:本周末|这周末|本周|这周)有(?:几|多少)个预约/gu,
    /(?:^|[，,。！？?；;\s])(?:员工|美容师)?([\p{Script=Han}·]{2,4}?)服务过的客户.*满意度/gu,
    /(?:^|[，,。！？?；;\s])([\p{Script=Han}A-Za-z0-9·\s]{2,24}?)(?:属于哪个项目类型|的价格是多少|做一次要多久)/gu,
    /(?:^|[，,。！？?；;\s])([\p{Script=Han}A-Za-z0-9·\s]{2,24}?)(?:的安全库存是多少|现在还有多少库存)/gu,
    /(?:^|[，,。！？?；;\s])(?:客户|会员|顾客)?([\p{Script=Han}·]{2,4}?)(?:本周末|这周末|本周|这周|今天|明天)?有预约吗/gu,
  ];
  return patterns.some((pattern) => [...question.matchAll(pattern)].some((match) => {
    const mention = match[1]?.trim();
    return Boolean(mention && !reserved.has(mention) && !/(?:今天|昨天|本月|上月|最近|当前|哪些|所有)/.test(mention));
  }));
}

function governedExpectedView(question: string, sourceExpectedView: string) {
  if (/实收流水/.test(question)) return 'agent_v3_payment_refund_view';
  if (/次卡.*快过期.*(?:还没核销完|没用完|未用完)/.test(question)) return 'agent_v3_card_asset_view';
  if (/日结.*平不平/.test(question)) return 'ask_data_reconciliation_issue_view';
  if (/预约密度.*(?:空位|空档)|哪天最忙.*空档/.test(question)) return 'agent_v3_appointment_gap_view';
  return sourceExpectedView;
}

export function normalizeQuestion(value: string) {
  return value.trim().toLowerCase().replace(/[\s，。！？?、；;：:（）()“”"'`]+/g, '');
}

function acceptableViewsFor(question: string, expectedView: string) {
  const views = [expectedView];
  if (/(?:收入趋势|每天的收入|这个月跟上个月比收入|最近三个月的收入)/.test(question)) {
    add(views, 'agent_v3_order_summary_view');
    add(views, 'agent_v3_daily_settlement_view');
  }
  if (/(?:收款和系统记录.*一致|漏收|多收)/.test(question)) {
    add(views, 'ask_data_reconciliation_issue_view');
    add(views, 'agent_v3_daily_settlement_view');
    add(views, 'agent_v3_order_summary_view');
  }
  if (/(?:预约密度.*空位|哪天最忙.*空档)/.test(question)) {
    add(views, 'agent_v3_reservation_view');
    add(views, 'ask_data_staff_capacity_view');
    add(views, 'agent_v3_appointment_gap_view');
  }
  return views;
}

function requiredViewsFor(question: string, expectedView: string) {
  if (/项目收入和产品销售|项目订单和产品订单/.test(question)) {
    return ['agent_v3_project_service_sales_view', 'agent_v3_order_item_sales_view'];
  }
  if (/耗材消耗和收入.*对比/.test(question)) {
    return ['agent_v3_stock_movement_view', 'agent_v3_order_summary_view'];
  }
  if (/预约密度.*(?:空位|空档)|哪天最忙.*空档/.test(question)) {
    return ['agent_v3_appointment_gap_view'];
  }
  return expectedView ? [expectedView] : [];
}

function clarificationSlots(question: string): AskDataGoldQuestionContract['allowedClarificationSlots'] {
  const slots: AskDataGoldQuestionContract['allowedClarificationSlots'] = [];
  if (/(双十一|双十二|春节|国庆|中秋|端午|元旦|五一|618)/i.test(question) && !/(?:19|20)\d{2}/.test(question)) {
    slots.push('year');
  }
  if (/(大额退款|大额订单|大额消费|高消费金额|高价值订单)/.test(question) && !/(?:大于|超过|高于|不少于|至少|>=?|￥|¥)\s*\d+/.test(question)) {
    slots.push('threshold');
  }
  if (/(?:储值余额|现金余额|赠送余额).*(?:异常偏高|明显偏高)|(?:异常偏高|明显偏高).*(?:储值余额|现金余额|赠送余额)|供应商集中度.*(?:太高|偏高|高不高|是否高)|(?:大量|很多).*(?:空档|空闲时段)|(?:很多|大量).*(?:差评|负面反馈)/.test(question)
    && !/(?:大于|超过|高于|不少于|至少|>=?|￥|¥)\s*\d+/.test(question)) {
    slots.push('threshold');
  }
  if (/(?:爽约率|核销率).*(?:高不高|是否高|偏高|异常|正常)/.test(question)
    && !/(?:大于|超过|高于|低于|小于|不少于|不超过|至少|至多|>=?|<=?)\s*\d+(?:\.\d+)?%|(?:高于|低于|相比|比较|对比)(?:上月|上周|去年同期|近\s*\d+\s*天平均)/.test(question)) {
    slots.push('threshold');
  }
  if (/退款率.*(?:正常|偏高|高不高|是否高|可疑)/.test(question)
    && !/(?:大于|超过|高于|低于|小于|不少于|不超过|至少|至多|>=?|<=?)\s*\d+(?:\.\d+)?%|(?:高于|低于|相比|比较|对比)(?:上月|上周|去年同期|近\s*\d+\s*天平均)/.test(question)) {
    slots.push('threshold');
  }
  if (/(?:可疑|异常|连续).*退款|退款.*(?:可疑|异常|连续)/.test(question)
    && !/(?:连续|至少|超过|大于|高于)\s*\d+\s*(?:次|笔|元|天|小时)|\d+\s*(?:小时|天)内/.test(question)) {
    slots.push('threshold');
  }
  if (/(?:库存金额高|高库存金额|库存价值高|高库存价值|库存货值高|高库存货值|大额库存金额|大额库存价值|大额库存货值)/.test(question)
    && !/(?:大于|超过|高于|不少于|至少|>=?|￥|¥)\s*\d+/.test(question)) {
    slots.push('threshold');
  }
  if (/库存损耗率.*(?:高不高|是否高|偏高|异常|正常)/.test(question)
    && !/(?:大于|超过|高于|低于|小于|不少于|不超过|至少|至多|>=?|<=?)\s*\d+(?:\.\d+)?%|(?:高于|低于|相比|比较|对比)(?:上月|上周|去年同期|近\s*\d+\s*天平均)/.test(question)) {
    slots.push('threshold');
  }
  if (/耗占比/.test(question)) slots.push('comparison_relation');
  if (/(?:剩余次数还很多|还有很多余量|余量很多)/.test(question) && !/(?:大于|超过|高于|不少于|至少|>=?)\s*\d+/.test(question)) {
    slots.push('threshold');
  }
  if (/(?:长期闲置|长期空闲|长期产能浪费)/.test(question) && !/(?:最近|近|连续)\s*\d+\s*(?:天|周|个月)|利用率.*(?:低于|小于)\s*\d+/.test(question)) {
    slots.push('threshold');
  }
  if (/(?:跟|和|与)平时比|比平时/.test(question)) slots.push('comparison_baseline');
  if (/(?:所有|各)?活动.*效果/.test(question) && !/(?:参与|转化|归因收入|营收|roi|投产|点击|触达)/i.test(question)) {
    slots.push('comparison_relation');
  }
  if (/(这个客人|这位客人|她的|某个客户|某个员工|某个美容师|某个项目|某笔|这笔|这批)/.test(question)) {
    slots.push('entity_identity');
  }
  if (/同时要求|两个不兼容|比较关系/.test(question)) slots.push('comparison_relation');
  return [...new Set(slots)];
}

function requiredDimensions(question: string) {
  const dimensions: string[] = [];
  if (/客户|会员|顾客/.test(question)) dimensions.push('customer');
  if (/员工|美容师/.test(question)) dimensions.push('staff');
  if (/项目|护理/.test(question)) dimensions.push('project');
  if (/商品|产品|耗材/.test(question)) dimensions.push('product');
  if (/品类|商品分类|产品分类/.test(question)) dimensions.push('product_category');
  if (/供应商/.test(question)) dimensions.push('supplier');
  if (/活动/.test(question)) dimensions.push('activity');
  if (/渠道/.test(question)) dimensions.push('channel');
  if (/支付方式|微信|支付宝|现金|刷卡/.test(question)) dimensions.push('payment_method');
  if (/每天|每日|按日|每月|按月|趋势|相比|对比|环比|同比/.test(question)) dimensions.push('date');
  return [...new Set(dimensions)];
}

function requiredAnswerFacts(question: string) {
  const facts = ['metric_value', 'time_range', 'data_policy'];
  if (/对比|相比|环比|同比|跟上个月|和昨天/.test(question) && !/耗材消耗和收入.*对比/.test(question)) {
    facts.push('comparison_current', 'comparison_previous', 'comparison_difference');
  }
  if (/趋势|走势|变化/.test(question)) facts.push('trend_granularity', 'trend_points');
  if (/最多|最高|最低|排行|排名|最受欢迎/.test(question)) facts.push('ranking_order', 'ranking_limit');
  if (/哪些|明细|记录|列表|所有/.test(question)) facts.push('list_items');
  if (/多少笔|几笔/.test(question)) facts.push('count');
  if (/金额|营业额|收入|成本|利润|余额/.test(question)) facts.push('amount_unit');
  return [...new Set(facts)];
}

function runtimeCustomerClarification(requiredOutputFields: string[]): AskDataQuestionOverride {
  return {
    supportClass: 'clarification_required',
    allowedClarificationSlots: ['entity_identity'],
    requiredOutputFields,
    requiredResultMode: 'detail',
    runtimeResolutionRequired: true,
  };
}

function unsupportedCurrentAskFact(): AskDataQuestionOverride {
  return {
    supportClass: 'admin_supported_ask_not_open',
    expectedMetricKeys: [],
    acceptableViews: [],
    requiredViews: [],
    requiredOutputFields: [],
    runtimeResolutionRequired: false,
  };
}

function reconciliationDetailContract(): AskDataQuestionOverride {
  return {
    requiredResultMode: 'detail',
    requiredOutputFields: ['issue_id', 'business_date', 'run_status', 'category', 'severity', 'issue_status', 'amount', 'title', 'last_detected_at'],
  };
}

function add(values: string[], value: string) {
  if (!values.includes(value)) values.push(value);
}
