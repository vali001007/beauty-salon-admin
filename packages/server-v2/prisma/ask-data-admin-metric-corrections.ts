import type { AskDataGoldSupportClass } from './ask-data-gold-question-contracts.js';

export type AskDataAdminMetricCorrection = {
  sourceId: string;
  supportClass: AskDataGoldSupportClass;
  auditClass:
    | 'existing_ask_direct'
    | 'existing_facts_new_metric'
    | 'existing_facts_new_view'
    | 'backend_fact_incomplete'
    | 'sensitive_or_context';
  priority: 'P0' | 'P1' | 'P2' | 'boundary';
  expectedMetricKeys: string[];
  acceptableViews: string[];
  requiredViews: string[];
  allowedClarificationSlots: Array<'year' | 'threshold' | 'entity_identity' | 'comparison_relation' | 'comparison_baseline' | 'time_point'>;
  capabilityKey: string;
  capabilityLabel: string;
  reason: string;
};

export type AskDataAdminExplicitQueryContract = {
  requiredResultMode: 'scalar' | 'detail' | 'grouped' | 'ranking' | 'trend';
  requiredOutputFields: string[];
  requiredDimensionKeys: string[];
  requiredAnswerFacts: string[];
};

const query = (
  sourceId: string,
  expectedMetricKeys: string[],
  requiredViews: string[],
  capabilityKey: string,
  capabilityLabel: string,
  reason: string,
  acceptableViews = requiredViews,
): AskDataAdminMetricCorrection => ({
  sourceId,
  supportClass: 'ask_query_supported',
  auditClass: 'existing_facts_new_metric',
  priority: 'P0',
  expectedMetricKeys,
  acceptableViews,
  requiredViews,
  allowedClarificationSlots: [],
  capabilityKey,
  capabilityLabel,
  reason,
});

const clarification = (
  sourceId: string,
  slot: AskDataAdminMetricCorrection['allowedClarificationSlots'][number],
  reason: string,
): AskDataAdminMetricCorrection => ({
  sourceId,
  supportClass: 'clarification_required',
  auditClass: 'sensitive_or_context',
  priority: 'boundary',
  expectedMetricKeys: [],
  acceptableViews: [],
  requiredViews: [],
  allowedClarificationSlots: [slot],
  capabilityKey: 'clarification_required',
  capabilityLabel: '需补充关键查询槽位',
  reason,
});

const newView = (
  sourceId: string,
  capabilityKey: string,
  capabilityLabel: string,
  reason: string,
): AskDataAdminMetricCorrection => ({
  sourceId,
  supportClass: 'admin_supported_ask_not_open',
  auditClass: 'existing_facts_new_view',
  priority: 'P1',
  expectedMetricKeys: [],
  acceptableViews: [],
  requiredViews: [],
  allowedClarificationSlots: [],
  capabilityKey,
  capabilityLabel,
  reason,
});

const incomplete = (
  sourceId: string,
  capabilityKey: string,
  capabilityLabel: string,
  reason: string,
): AskDataAdminMetricCorrection => ({
  sourceId,
  supportClass: 'admin_backend_unsupported',
  auditClass: 'backend_fact_incomplete',
  priority: 'P1',
  expectedMetricKeys: [],
  acceptableViews: [],
  requiredViews: [],
  allowedClarificationSlots: [],
  capabilityKey,
  capabilityLabel,
  reason,
});

export const ASK_DATA_ADMIN_METRIC_CORRECTIONS: AskDataAdminMetricCorrection[] = [
  clarification('manager-005', 'comparison_relation', '问题没有说明要比较营业额、实收、净收还是其他指标，直接选择会改变经营结论。'),
  query('manager-013', ['reservation_metrics'], ['agent_v3_reservation_view'], 'reservation_schedule_metric', '预约时段与顺序', '按当日下午时段统计非取消预约数。'),
  query('manager-032', ['customer_profile'], ['ask_data_customer_profile_summary_view'], 'customer_card_engagement', '次卡使用活跃度', '已有客户实收、有效次卡和核销次数；“很少使用”按累计核销不超过 1 次并披露假设。'),
  newView('manager-035', 'customer_arrival_value_snapshot', '当日到店客户价值联合事实', '需要把当日预约/到店与客户 LTV 档位安全关联，现有两个禁止 JOIN 的视图不能直接组合。'),
  query('manager-040', ['customer_profile'], ['ask_data_customer_profile_summary_view'], 'customer_visit_decline', '客户到店频率下降', '用距最近到店天数与平均复购间隔比较，默认超过 1.5 倍标记为明显下降。'),
  query('manager-041', ['staff_performance'], ['ask_data_staff_performance_view'], 'staff_performance_metric', '员工绩效指标', '按当月实收业绩降序返回员工排名。'),
  query('manager-042', ['staff_performance'], ['ask_data_staff_performance_view'], 'staff_service_volume_metric', '员工服务量', '按员工服务量降序返回接待客户最多的美容师。'),
  newView('manager-044', 'staff_daily_performance_fact', '员工日/周绩效事实', '现有员工绩效视图仅有月粒度，不能证明本周与上周业绩下滑。'),
  query('manager-048', ['customer_feedback'], ['ask_data_customer_feedback_view'], 'staff_feedback_metric', '员工客诉与反馈', '客户反馈视图已包含员工和投诉类型；真实为空时必须回答暂无反馈数据。'),
  query('manager-051', ['service_quality'], ['agent_v3_service_quality_view'], 'staff_completed_service_metric', '员工完成服务量', '按当日 completed 服务任务和美容师分组统计客户数。'),
  query('manager-052', ['staff_performance'], ['ask_data_staff_performance_view'], 'staff_performance_improvement', '员工绩效进步', '比较当月与上月员工实收业绩差额并排名。'),
  query('manager-061', ['inventory_on_hand'], ['agent_v3_product_inventory_view'], 'inventory_shortage_metric', '低库存与缺货', '当前库存低于安全库存即标记为库存不足。'),
  query('manager-064', ['product_sales'], ['agent_v3_order_item_sales_view'], 'product_sales_metric', '商品销量排名', '“卖得最好的产品”应使用商品销售视图，不使用库存快照。'),
  query('marketing-004', ['customer_profile'], ['ask_data_customer_profile_summary_view'], 'high_value_inactive_customer', '高价值沉睡客户', '使用高 LTV 档位与 inactive/超期未到店联合筛选，不自行设定金额门槛。'),
  newView('marketing-010', 'customer_period_spend_trend', '客户分期消费趋势', '现有客户摘要只有累计消费，缺少当期与上期消费可比事实。'),
  query('marketing-012', ['customer_profile'], ['ask_data_customer_profile_summary_view'], 'customer_value_segmentation', '客户价值分层', '使用已治理的 LTV 档位统计客户分层，并披露不是临时自定义金额分箱。'),
  query('marketing-063', ['marketing_roi'], ['ask_data_marketing_roi_view'], 'marketing_roi_metric', '营销投入与归因收入', '同时返回营销成本与归因净收入，并强制披露 estimated 成本口径。'),
  query('marketing-064', ['marketing_roi'], ['ask_data_marketing_roi_view'], 'promotion_attractiveness_metric', '权益吸引力', '默认以促销/权益带来的转化率排名，并披露该代理口径。'),
  query('marketing-100', ['marketing_automation'], ['agent_v3_marketing_automation_view'], 'marketing_automation_effectiveness', '自动化规则运行效果', '当前只回答运行状态、任务量、完成量和完成率，不冒充归因 ROI。'),
  query('frontdesk-023', ['reservation_metrics'], ['agent_v3_reservation_view'], 'arrived_customer_list', '当日到店客户列表', '使用 checked_in/completed 预约和脱敏客户信息返回当日到店列表。'),
  query('frontdesk-027', ['reservation_metrics'], ['agent_v3_reservation_view'], 'next_reservation_metric', '下一个预约', '按当日当前时间后的开始时间升序返回第一条非取消预约。'),
  query('frontdesk-028', ['reservation_metrics'], ['agent_v3_reservation_view'], 'reservation_detail_list', '预约明细', '返回当日全部预约的脱敏明细。'),
  newView('frontdesk-039', 'reservation_customer_value_snapshot', '预约客户价值联合事实', '需要将当日预约与客户会员等级/LTV 安全关联，现有视图不允许直接 JOIN。'),
  clarification('frontdesk-043', 'entity_identity', '需要客户 ID、更完整姓名或预约时间才能核查指定预约。'),
  incomplete('frontdesk-045', 'reservation_arrival_event', '到店与爽约事件', '开发门店 ReservationStatusEvent 为 0，并无稳定 no_show 事件闭环，不能用 cancelled 冒充爽约。'),
  query('frontdesk-050', ['reservation_metrics'], ['agent_v3_reservation_view'], 'reservation_peak_date', '预约高峰日期', '按日聚合预约数并降序返回月内预约最多的日期。'),
  query('frontdesk-061', ['payment_flow'], ['agent_v3_payment_refund_view'], 'cash_receipt_metric', '现金收款', '按现金支付方式筛选并汇总实收。'),
  query('frontdesk-063', ['payment_flow'], ['agent_v3_payment_refund_view'], 'stored_value_payment_metric', '储值消费支付', '按数据库已治理的储值支付方式统计笔数和金额。'),
  clarification('frontdesk-065', 'time_point', '“上周某天”没有指定具体日期，缺失会改变收款明细。'),
  clarification('frontdesk-066', 'entity_identity', '需要客户、订单或支付时间才能核查指定付款。'),
  query('frontdesk-073', ['payment_customer_detail'], ['agent_v3_payment_refund_view', 'agent_v3_order_summary_view'], 'first_receipt_customer', '首笔收款与脱敏客户', '通过 order_id 关联支付与订单摘要，返回首笔支付时间和脱敏客户。'),
  query('frontdesk-074', ['payment_flow'], ['agent_v3_payment_refund_view'], 'payment_total_metric', '收款汇总', '按期间汇总支付金额，不与订单营业额混用。'),
  query('frontdesk-079', ['staff_capacity'], ['ask_data_staff_capacity_view'], 'staff_available_capacity', '可接新单员工', '使用当日空闲分钟和超排分钟判断可接待产能，不用员工绩效代替。'),
  query('frontdesk-083', ['inventory_on_hand'], ['agent_v3_product_inventory_view'], 'sellable_inventory', '可售商品库存', '列出当前库存大于 0 的商品，并展示状态与数量。'),
  query('frontdesk-096', ['appointment_gap'], ['agent_v3_appointment_gap_view'], 'appointment_available_slot', '可加客时段', '使用预约空档视图筛选当日下午可用容量。'),
  newView('beautician-005', 'reservation_end_time_fact', '预约预计结束时间', '当前预约视图只开放 start_time，缺少结束时间或项目时长的受控派生字段。'),
  clarification('beautician-008', 'entity_identity', '“我”需要当前登录账号与员工 ID 唯一绑定；未绑定时不得推断。'),
  query('beautician-015', ['reservation_metrics'], ['agent_v3_reservation_view'], 'reservation_time_project', '指定时间预约项目', '按当日 14:00 开始时间查询脱敏客户和项目。'),
  query('beautician-025', ['reservation_metrics'], ['agent_v3_reservation_view'], 'daily_service_schedule', '当日服务流程安排', '按开始时间返回当日预约项目、美容师和状态。'),
  query('inventory-003', ['inventory_on_hand'], ['agent_v3_product_inventory_view'], 'low_stock_metric', '低库存', '“只剩最后几瓶”默认使用安全库存阈值，不自行硬编统一瓶数。'),
  query('inventory-004', ['inventory_usage_balance'], ['agent_v3_stock_movement_view', 'agent_v3_product_inventory_view'], 'inventory_usage_and_balance', '期间用量与当前结存', '库存流水计算本月消耗，库存快照返回当前结存；两个指标必须都回答。'),
  query('inventory-012', ['inventory_on_hand'], ['agent_v3_product_inventory_view'], 'inventory_product_family', '商品系列库存', '对“补水系列”做受控商品名称包含筛选。'),
  query('inventory-013', ['inventory_on_hand'], ['agent_v3_product_inventory_view'], 'inventory_product_family', '商品系列库存', '对“防晒产品”做受控商品名称包含筛选。'),
  newView('inventory-024', 'inventory_unit_cost_snapshot', '商品单位成本库存快照', '当前只有库存总价值，没有可安全排序的商品单位成本。'),
  query('inventory-027', ['inventory_on_hand'], ['agent_v3_product_inventory_view'], 'inventory_expiry_window', '库存效期窗口', '筛选最近效期在当日至未来 30 天的有库存商品。'),
  newView('inventory-028', 'expired_batch_consumption_fact', '过期批次使用事实', '仅有最近效期不能证明过期批次被实际使用，需要批次与消耗流水关联。'),
  query('inventory-033', ['inventory_on_hand'], ['agent_v3_product_inventory_view'], 'inventory_expiry_ranking', '最近效期排名', '“最容易过期”按最近效期升序并限定当前有库存。'),
  clarification('inventory-040', 'threshold', '可以计算库存损耗率，但“高不高”没有已治理阈值；需要用户提供阈值或比较基线后才能下结论。'),
  query('inventory-071', ['bom_variance'], ['ask_data_bom_consumption_variance_view'], 'project_consumption_metric', '项目实际耗材', '按项目汇总 actual_qty 并降序返回耗材最多的项目。'),
  query('inventory-077', ['bom_variance'], ['ask_data_bom_consumption_variance_view'], 'bom_abnormal_consumption', '耗材浪费与不规范', '使用绝对偏差率超过 20% 的已治理异常标记，标准缺失时不伪造结论。'),
  query('inventory-082', ['bom_variance'], ['ask_data_bom_consumption_variance_view'], 'bom_abnormal_product', '产品异常消耗', '按商品聚合已标记异常的 BOM 实际消耗偏差。'),
  query('finance-001', ['payment_flow'], ['agent_v3_payment_refund_view'], 'payment_total_metric', '实际收款', '“收了多少钱”按支付记录实收金额统计，不等同订单营业额。'),
  query('finance-004', ['daily_net_receipts'], ['agent_v3_daily_settlement_view'], 'daily_finance_summary', '日收入汇总', '使用日结收入、实收、退款、净收、订单数和客户数组织汇总。'),
  query('finance-006', ['daily_net_receipts'], ['agent_v3_daily_settlement_view'], 'daily_income_trend', '每日收入趋势', '按 settlement_date 返回本周每日收入与净收。'),
  clarification('finance-008', 'comparison_relation', '问题只说明本月与上月增减，未说明营业额、实收、净收或其他指标；Ask 页面没有题库中的“财务 Agent”隐含上下文。'),
  query('finance-011', ['payment_flow'], ['agent_v3_payment_refund_view'], 'stored_value_receipt_metric', '储值收款', '按储值相关支付方式汇总当月收款。'),
  newView('finance-016', 'card_sales_fact', '次卡销售时间事实', '次卡资产视图有购卡实收但没有购卡时间，不能正确统计“这个月”。'),
  query('finance-017', ['reconciliation_issue'], ['ask_data_reconciliation_issue_view'], 'payment_service_reconciliation', '收款与服务对账', '查询收款无对应服务的已检测对账异常，不从订单备注推断。'),
  query('finance-020', ['payment_order_difference'], ['agent_v3_daily_settlement_view'], 'payment_order_difference', '到账与开单差额', '使用同一日结视图中的 paid_amount 与 revenue_amount 汇总并计算差额，避免支付和订单明细 JOIN 放大。'),
  query('finance-021', ['member_liability'], ['ask_data_member_liability_view'], 'prepaid_unused_liability', '未履约预付金', '使用最新 confirmed 会员履约负债快照；无快照时明确提示未确认。'),
  query('finance-029', ['confirmed_profit'], ['ask_data_confirmed_profit_view'], 'material_cost_ratio', '耗材成本占比', '使用 confirmed 利润快照材料成本除以营业收入，不读取 draft。'),
  query('finance-037', ['operating_cost'], ['ask_data_operating_cost_view'], 'operating_cost_change', '成本项目异常增加', '按成本类别比较当期与上一可比期金额变化。'),
  newView('finance-043', 'break_even_revenue_snapshot', '盈亏平衡收入快照', '经营成本视图允许联查，但 confirmed 利润视图禁止 JOIN；必须先建立经审计的盈亏平衡语义快照，不得在自由 SQL 中临时拼接。'),
  query('finance-061', ['reconciliation_issue'], ['ask_data_reconciliation_issue_view'], 'duplicate_charge_refund_issue', '重复收费与退款异常', '只查询已检测的重复消费/重复退款对账异常。'),
  query('finance-075', ['payment_flow'], ['agent_v3_payment_refund_view'], 'refund_detail_report', '退款明细', '返回退款时间、金额、状态和原因分类，不返回流水号或内部备注。'),
  query('finance-078', ['reconciliation_issue'], ['ask_data_reconciliation_issue_view'], 'abnormal_finance_flow', '异常财务流水', '将“不正常流水”限定为已检测对账异常，不自行推断风险。'),
  newView('finance-086', 'cash_reconciliation_run_status', '现金收入对账运行状态', '当前对账视图以异常为主表，无异常时不保留运行行；不能用“异常数为 0”冒充“已完成对账”。'),
  query('finance-088', ['reconciliation_issue'], ['ask_data_reconciliation_issue_view'], 'finance_issue_summary', '财务异常汇总', '按异常类别、严重度和处理状态汇总已检测财务异常。'),
];

export const ASK_DATA_ADMIN_METRIC_CORRECTION_BY_ID = new Map(
  ASK_DATA_ADMIN_METRIC_CORRECTIONS.map((item) => [item.sourceId, item]),
);

const facts = (...items: string[]) => ['metric_value', 'time_range', 'data_policy', ...items];
const contract = (
  requiredResultMode: AskDataAdminExplicitQueryContract['requiredResultMode'],
  requiredOutputFields: string[],
  requiredDimensionKeys: string[] = [],
  requiredAnswerFacts: string[] = facts(),
): AskDataAdminExplicitQueryContract => ({
  requiredResultMode,
  requiredOutputFields,
  requiredDimensionKeys,
  requiredAnswerFacts,
});

/**
 * The management question audit is intentionally question-level. These
 * contracts must not be inferred from a view-wide default because a valid SQL
 * aggregate can still fail to answer "who", "which", comparison, or status
 * questions.
 */
export const ASK_DATA_ADMIN_EXPLICIT_QUERY_CONTRACTS: Record<string, AskDataAdminExplicitQueryContract> = {
  'beautician-015': contract('detail', ['reservation_id', 'customer_id', 'customer_name_masked', 'date', 'start_time', 'project_id', 'project_name'], ['date', 'customer', 'project']),
  'beautician-025': contract('detail', ['reservation_id', 'customer_id', 'customer_name_masked', 'date', 'start_time', 'project_id', 'project_name', 'beautician_id', 'beautician_name', 'status'], ['date', 'customer', 'project', 'staff', 'status'], facts('list_items')),
  'finance-001': contract('scalar', ['payment_amount'], ['date'], facts('amount_unit')),
  'finance-004': contract('scalar', ['revenue_amount', 'paid_amount', 'refund_amount', 'net_receipts', 'order_count', 'customer_count'], ['date'], facts('amount_unit', 'all_requested_metrics')),
  'finance-006': contract('trend', ['trend_day', 'revenue_amount', 'paid_amount', 'refund_amount', 'net_receipts'], ['date'], facts('amount_unit', 'trend_granularity', 'trend_points')),
  'finance-011': contract('scalar', ['payment_amount'], ['date', 'payment_method'], facts('amount_unit')),
  'finance-017': contract('detail', ['issue_id', 'business_date', 'run_status', 'category', 'severity', 'issue_status', 'amount', 'title', 'last_detected_at'], ['date', 'status'], facts('list_items')),
  'finance-020': contract('scalar', ['payment_amount', 'order_amount', 'payment_order_difference'], ['date'], facts('amount_unit', 'comparison_current', 'comparison_previous', 'comparison_difference', 'all_requested_metrics')),
  'finance-021': contract('scalar', ['snapshot_date', 'total_liability', 'confirmed_at'], ['snapshot_date'], facts('amount_unit')),
  'finance-029': contract('scalar', ['material_cost', 'operating_revenue', 'material_cost_rate'], ['month'], facts('amount_unit', 'all_requested_metrics')),
  'finance-037': contract('detail', ['category', 'current_period_cost', 'previous_period_cost', 'cost_difference'], ['date', 'cost_category'], facts('amount_unit', 'comparison_current', 'comparison_previous', 'comparison_difference', 'list_items')),
  'finance-061': contract('detail', ['issue_id', 'business_date', 'category', 'severity', 'issue_status', 'amount', 'title', 'last_detected_at'], ['date', 'status'], facts('list_items')),
  'finance-075': contract('detail', ['order_id', 'refunded_at', 'refund_amount', 'refund_status', 'refund_reason_category'], ['date'], facts('amount_unit', 'list_items')),
  'finance-078': contract('detail', ['issue_id', 'business_date', 'category', 'severity', 'issue_status', 'amount', 'title', 'last_detected_at'], ['date', 'status'], facts('list_items')),
  'finance-088': contract('detail', ['issue_id', 'business_date', 'category', 'severity', 'issue_status', 'amount', 'title', 'last_detected_at'], ['date', 'status'], facts('list_items')),
  'frontdesk-023': contract('detail', ['reservation_id', 'customer_id', 'customer_name_masked', 'date', 'start_time', 'project_id', 'project_name', 'status'], ['date', 'customer', 'project', 'status'], facts('list_items')),
  'frontdesk-027': contract('detail', ['reservation_id', 'customer_id', 'customer_name_masked', 'date', 'start_time', 'project_id', 'project_name'], ['date', 'customer', 'project']),
  'frontdesk-028': contract('detail', ['reservation_id', 'customer_id', 'customer_name_masked', 'date', 'start_time', 'project_id', 'project_name', 'beautician_id', 'beautician_name', 'status'], ['date', 'customer', 'project', 'staff', 'status'], facts('list_items')),
  'frontdesk-050': contract('ranking', ['date', 'reservation_count'], ['date'], facts('ranking_order', 'ranking_limit')),
  'frontdesk-061': contract('scalar', ['cash_payment_amount'], ['date', 'payment_method'], facts('amount_unit')),
  'frontdesk-063': contract('scalar', ['flow_count', 'payment_amount'], ['date', 'payment_method'], facts('count', 'amount_unit')),
  'frontdesk-073': contract('detail', ['order_id', 'paid_at', 'payment_amount', 'customer_id', 'customer_name_masked'], ['date', 'customer'], facts('amount_unit')),
  'frontdesk-074': contract('scalar', ['payment_amount'], ['date'], facts('amount_unit')),
  'frontdesk-079': contract('ranking', ['staff_id', 'staff_name', 'idle_minutes', 'overbooked_minutes'], ['date', 'staff'], facts('ranking_order', 'ranking_limit')),
  'frontdesk-083': contract('detail', ['product_id', 'product_name', 'unit', 'current_stock', 'status'], ['product'], facts('list_items')),
  'frontdesk-096': contract('detail', ['date', 'start_time', 'available_capacity'], ['date', 'time_slot'], facts('list_items')),
  'inventory-003': contract('detail', ['product_id', 'product_name', 'current_stock', 'safety_stock'], ['product'], facts('list_items')),
  'inventory-004': contract('grouped', ['product_id', 'product_name', 'consumed_quantity', 'current_stock'], ['date', 'product'], facts('all_requested_metrics')),
  'inventory-012': contract('grouped', ['product_id', 'product_name', 'current_stock'], ['product'], facts('list_items')),
  'inventory-013': contract('grouped', ['product_id', 'product_name', 'current_stock'], ['product'], facts('list_items')),
  'inventory-027': contract('detail', ['product_id', 'product_name', 'current_stock', 'nearest_expiry_date'], ['product'], facts('list_items')),
  'inventory-033': contract('ranking', ['product_id', 'product_name', 'current_stock', 'nearest_expiry_date'], ['product'], facts('list_items', 'ranking_order', 'ranking_limit')),
  'inventory-071': contract('ranking', ['project_id', 'project_name', 'actual_qty'], ['date', 'project'], facts('ranking_order', 'ranking_limit')),
  'inventory-077': contract('detail', ['movement_id', 'project_id', 'project_name', 'product_id', 'product_name', 'standard_qty', 'actual_qty', 'deviation_qty', 'deviation_rate', 'standard_status'], ['date', 'project', 'product'], facts('list_items')),
  'inventory-082': contract('detail', ['product_id', 'product_name', 'actual_qty', 'deviation_qty', 'deviation_rate', 'standard_status'], ['date', 'product'], facts('list_items')),
  'manager-013': contract('scalar', ['reservation_count'], ['date']),
  'manager-032': contract('detail', ['customer_id', 'customer_name_masked', 'total_paid_amount', 'active_card_count', 'card_usage_times', 'remaining_card_times'], ['customer'], facts('list_items')),
  'manager-040': contract('detail', ['customer_id', 'customer_name_masked', 'days_since_last_visit', 'average_return_interval_days', 'customer_status'], ['customer'], facts('list_items')),
  'manager-041': contract('ranking', ['staff_id', 'staff_name', 'paid_amount'], ['date', 'staff'], facts('ranking_order', 'ranking_limit')),
  'manager-042': contract('ranking', ['staff_id', 'staff_name', 'service_count'], ['staff'], facts('ranking_order', 'ranking_limit')),
  'manager-048': contract('ranking', ['staff_id', 'staff_name', 'feedback_count', 'latest_feedback_at'], ['date', 'staff'], facts('ranking_order', 'ranking_limit')),
  'manager-051': contract('grouped', ['beautician_id', 'beautician_name', 'service_task_count'], ['date', 'staff'], facts('list_items')),
  'manager-052': contract('ranking', ['staff_id', 'staff_name', 'current_period_paid_amount', 'previous_period_paid_amount', 'paid_amount_difference'], ['date', 'staff'], facts('comparison_current', 'comparison_previous', 'comparison_difference', 'ranking_order', 'ranking_limit')),
  'manager-061': contract('detail', ['product_id', 'product_name', 'current_stock', 'safety_stock', 'status'], ['product'], facts('list_items')),
  'manager-064': contract('ranking', ['product_id', 'product_name', 'sales_quantity', 'net_sales_amount'], ['date', 'product'], facts('ranking_order', 'ranking_limit')),
  'marketing-004': contract('detail', ['customer_id', 'customer_name_masked', 'total_paid_amount', 'ltv_tier', 'days_since_last_visit', 'customer_status'], ['customer'], facts('list_items')),
  'marketing-012': contract('grouped', ['ltv_tier', 'customer_count'], ['customer'], facts('list_items')),
  'marketing-063': contract('scalar', ['marketing_cost', 'attributed_net_revenue', 'roi', 'cost_source'], ['date'], facts('amount_unit', 'all_requested_metrics')),
  'marketing-064': contract('ranking', ['promotion_id', 'promotion_name', 'exposure_count', 'conversion_count', 'conversion_rate', 'cost_source'], ['offer'], facts('ranking_order', 'ranking_limit')),
  'marketing-100': contract('detail', ['automation_source', 'trigger_type', 'status', 'task_count', 'completed_count', 'completion_rate', 'latest_task_at'], ['date', 'automation', 'status'], facts('list_items')),
};

export const ASK_DATA_ADMIN_EXPLICIT_QUERY_CONTRACT_BY_ID = new Map(
  Object.entries(ASK_DATA_ADMIN_EXPLICIT_QUERY_CONTRACTS),
);
