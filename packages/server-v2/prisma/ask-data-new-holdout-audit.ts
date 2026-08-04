import type {
  AskDataGoldQuestionContract,
  AskDataGoldSupportClass,
} from './ask-data-gold-question-contracts.ts';

export type AskDataNewHoldoutAuditDecision = {
  id: string;
  supportClass: AskDataGoldSupportClass;
  expectedView?: string;
  expectedMetricKeys?: string[];
  acceptableViews?: string[];
  requiredViews?: string[];
  allowedClarificationSlots?: AskDataGoldQuestionContract['allowedClarificationSlots'];
  requiredOutputFields?: string[];
  requiredResultMode?: AskDataGoldQuestionContract['requiredResultMode'];
  managementSupport: AskDataGoldQuestionContract['managementSupport'];
  backendSupport: AskDataGoldQuestionContract['backendSupport'];
  auditNote: string;
};

const decisions: AskDataNewHoldoutAuditDecision[] = [];

function supported(
  expectedView: string,
  ids: string[],
  auditNote = '管理端与 Ask 已有可靠只读事实，可进入独立 holdout 查询分母。',
) {
  for (const id of ids) decisions.push({
    id,
    supportClass: 'ask_query_supported',
    expectedView,
    managementSupport: 'supported',
    backendSupport: 'supported',
    auditNote,
  });
}

function corrected(input: Omit<AskDataNewHoldoutAuditDecision, 'managementSupport' | 'backendSupport'> & {
  managementSupport?: AskDataGoldQuestionContract['managementSupport'];
  backendSupport?: AskDataGoldQuestionContract['backendSupport'];
}) {
  decisions.push({
    managementSupport: 'supported',
    backendSupport: 'supported',
    ...input,
  });
}

function clarification(
  id: string,
  expectedView: string,
  slots: AskDataGoldQuestionContract['allowedClarificationSlots'],
  auditNote: string,
) {
  decisions.push({
    id,
    supportClass: 'clarification_required',
    expectedView,
    allowedClarificationSlots: slots,
    managementSupport: 'supported',
    backendSupport: 'supported',
    auditNote,
  });
}

function boundary(
  id: string,
  supportClass: Extract<AskDataGoldSupportClass, 'admin_supported_ask_not_open' | 'admin_backend_unsupported'>,
  auditNote: string,
  managementSupport: AskDataGoldQuestionContract['managementSupport'] = 'supported',
  backendSupport: AskDataGoldQuestionContract['backendSupport'] = 'supported',
) {
  decisions.push({ id, supportClass, managementSupport, backendSupport, auditNote });
}

supported('agent_v3_order_summary_view', ['BQ0652', 'BQ0665']);
corrected({
  id: 'BQ0667',
  supportClass: 'ask_query_supported',
  expectedView: 'agent_v3_order_summary_view',
  expectedMetricKeys: ['order_revenue'],
  requiredOutputFields: ['average_order_value'],
  requiredResultMode: 'scalar',
  auditNote: '客单价必须按净收入除以去重订单数计算，不能只返回营业额。',
});
boundary('BQ0664', 'admin_supported_ask_not_open', '现有订单摘要不含订单级优惠使用事实；商品明细优惠不能代表全部订单。');
boundary('BQ0668', 'admin_supported_ask_not_open', '现有 Ask 未开放开卡赠送次数与开卡订单的联合事实。');

clarification('BQ0685', 'agent_v3_order_item_sales_view', ['year'], '双十一跨年份，必须先确定年份；明确后还需要商品与项目两个销售视图。');
clarification('BQ0691', 'agent_v3_order_item_sales_view', ['year'], '双十一跨年份；连带销售比例本身也需要订单项目联合事实。');
clarification('BQ0693', 'agent_v3_order_item_sales_view', ['year'], '双十一跨年份，年份会改变销售结果。');
corrected({
  id: 'BQ0696',
  supportClass: 'ask_query_supported',
  expectedView: 'agent_v3_order_item_sales_view',
  expectedMetricKeys: ['product_sales', 'project_sales'],
  acceptableViews: ['agent_v3_order_item_sales_view', 'agent_v3_project_service_sales_view'],
  requiredViews: ['agent_v3_order_item_sales_view', 'agent_v3_project_service_sales_view'],
  requiredOutputFields: ['net_sales_amount', 'project_revenue'],
  requiredResultMode: 'scalar',
  auditNote: '项目订单与产品订单必须使用两个独立销售口径，禁止用单个商品视图代替。',
});
boundary('BQ0702', 'admin_supported_ask_not_open', '现有 Ask 视图无法识别同一订单是否同时包含项目与商品，不能计算连带销售比例。');

supported('agent_v3_project_service_sales_view', ['BQ0530', 'BQ0543']);
clarification('BQ0533', 'agent_v3_project_service_sales_view', ['year'], '五一假期跨年份，必须补充年份。');
for (const id of ['BQ0536', 'BQ0544']) corrected({
  id,
  supportClass: 'ask_query_supported',
  expectedView: 'agent_v3_project_service_sales_view',
  expectedMetricKeys: ['project_sales'],
  requiredOutputFields: ['project_id', 'project_name', 'estimated_margin'],
  requiredResultMode: 'grouped',
  auditNote: '只允许回答项目销售口径的预估毛利，必须披露其不等于已确认月结利润。',
});

clarification('BQ0688', 'agent_v3_payment_refund_view', ['year', 'threshold'], '同时缺少双十一年份和“大额退款”金额阈值。');
supported('agent_v3_payment_refund_view', ['BQ0694', 'BQ0705', 'BQ0710']);
clarification('BQ0699', 'agent_v3_payment_refund_view', ['threshold'], '“大额退款”没有治理金额阈值。');

clarification('BQ1398', 'ask_data_reconciliation_issue_view', ['year'], '“日结平不平”应使用对账异常口径，春节还必须补充年份。');
corrected({
  id: 'BQ1405',
  supportClass: 'ask_query_supported',
  expectedView: 'ask_data_reconciliation_issue_view',
  expectedMetricKeys: ['reconciliation_issue'],
  requiredOutputFields: ['issue_id', 'issue_count'],
  requiredResultMode: 'detail',
  auditNote: '日结是否对平必须查询财务对账异常，不能使用日结净收视图。',
});

supported('agent_v3_product_inventory_view', ['BQ1075', 'BQ1077', 'BQ1080']);
boundary('BQ1081', 'admin_backend_unsupported', '当前库存视图是现状快照，没有去年同期缺货状态历史。', 'partial', 'partial');
boundary('BQ1082', 'admin_backend_unsupported', '当前库存视图是现状快照，没有去年同期临期状态历史。', 'partial', 'partial');
supported('agent_v3_stock_movement_view', ['BQ1109', 'BQ1113', 'BQ1114', 'BQ1118', 'BQ1122']);

supported('ask_data_customer_profile_summary_view', ['BQ0023', 'BQ0027', 'BQ0029', 'BQ0037']);
clarification('BQ0028', 'ask_data_customer_profile_summary_view', ['year'], '判断是否属于五一假期依赖具体年份的放假区间，不能只凭“上次到店”日期泛化。');
supported('ask_data_staff_performance_view', ['BQ0305', 'BQ0310', 'BQ0313', 'BQ0314']);
supported('agent_v3_reservation_view', ['BQ0876', 'BQ0877', 'BQ0879', 'BQ0880', 'BQ0881']);
supported('agent_v3_marketing_conversion_view', ['BQ1529', 'BQ1530', 'BQ1533', 'BQ1536', 'BQ1538']);
supported('agent_v3_card_usage_view', ['BQ0823', 'BQ0828', 'BQ0831', 'BQ0836']);
clarification('BQ0839', 'agent_v3_card_usage_view', ['year'], '双十一跨年份，必须补充年份。');
supported('agent_v3_project_catalog_view', ['BQ0483', 'BQ0485', 'BQ0486', 'BQ0490', 'BQ0492']);

for (const id of ['BQ1561', 'BQ1571', 'BQ1581']) clarification(
  id,
  'agent_v3_marketing_activity_view',
  ['comparison_relation'],
  '“活动效果”未说明按参与、转化、归因收入还是 ROI 判断，直接选择会改变经营结论。',
);
clarification('BQ1591', 'agent_v3_marketing_activity_view', ['year', 'comparison_relation'], '国庆缺年份，且“活动效果”未指定评价指标。');
supported('agent_v3_marketing_automation_view', ['BQ1513', 'BQ1523', 'BQ1534']);
for (const id of ['BQ1517', 'BQ1528']) corrected({
  id,
  supportClass: 'ask_query_supported',
  expectedView: 'ask_data_marketing_roi_view',
  expectedMetricKeys: ['marketing_roi'],
  requiredOutputFields: ['strategy_name', 'conversion_rate'],
  requiredResultMode: 'ranking',
  auditNote: '自动化策略转化排行应使用含策略和转化率的营销 ROI 事实，不是仅含任务完成量的自动触达视图。',
});

supported('ask_data_operating_cost_view', ['BQ1319', 'BQ1333', 'BQ1338', 'BQ1344']);
clarification('BQ1326', 'ask_data_operating_cost_view', ['year'], '春节跨年份，必须补充年份。');
supported('agent_v3_purchase_procurement_view', ['BQ1739', 'BQ1743', 'BQ1745']);
clarification('BQ1740', 'agent_v3_purchase_procurement_view', ['year'], '国庆跨年份，必须补充年份；明确后可按采购状态统计待付款金额。');
clarification('BQ1742', 'agent_v3_purchase_procurement_view', ['year'], '国庆跨年份，必须补充年份。');

for (const id of ['BQ1301', 'BQ1310']) corrected({
  id,
  supportClass: 'ask_query_supported',
  expectedView: 'agent_v3_project_service_sales_view',
  expectedMetricKeys: ['project_sales'],
  requiredOutputFields: ['project_id', 'project_name', 'estimated_margin'],
  requiredResultMode: 'ranking',
  auditNote: '已确认利润快照没有项目维度；只能按项目销售视图回答预估毛利贡献并披露口径。',
});
supported('ask_data_confirmed_profit_view', ['BQ1306', 'BQ1308']);
boundary('BQ1313', 'admin_backend_unsupported', '已确认利润仅按自然月快照，不能精确回答滚动最近 30 天经营利润。', 'partial', 'partial');

clarification('BQ1382', 'ask_data_reconciliation_issue_view', ['year'], '五一假期跨年份，必须补充年份。');
supported('ask_data_reconciliation_issue_view', ['BQ1386', 'BQ1389']);
clarification('BQ1393', 'ask_data_reconciliation_issue_view', ['year'], '春节跨年份，必须补充年份。');
clarification('BQ1396', 'ask_data_reconciliation_issue_view', ['year'], '春节跨年份，必须补充年份。');
clarification('BQ1399', 'ask_data_member_liability_view', ['year'], '春节跨年份，必须补充年份后才能比较负债增长。');
supported('ask_data_member_liability_view', ['BQ1406']);

supported('ask_data_staff_capacity_view', ['BQ0335', 'BQ0350', 'BQ0352']);
clarification('BQ0343', 'ask_data_staff_capacity_view', ['year'], '春节跨年份，必须补充年份。');
clarification('BQ0353', 'ask_data_staff_capacity_view', ['threshold'], '“长期闲置”没有明确观察周期或利用率阈值。');
supported('ask_data_customer_lifecycle_view', ['BQ0206', 'BQ0209', 'BQ0210']);
supported('ask_data_marketing_roi_view', ['BQ1568', 'BQ1576', 'BQ1578']);
for (const id of ['BQ1573', 'BQ1583']) corrected({
  id,
  supportClass: 'ask_query_supported',
  expectedView: 'ask_data_marketing_roi_view',
  expectedMetricKeys: ['marketing_roi'],
  requiredOutputFields: [id === 'BQ1573' ? 'trend_month' : 'trend_day', 'acquisition_cost'],
  requiredResultMode: 'trend',
  auditNote: '拓客成本按营销成本除以转化数计算；转化数为 0 时必须返回空值而不是 0。',
});

export const ASK_DATA_NEW_HOLDOUT_AUDIT = Object.freeze(decisions);
