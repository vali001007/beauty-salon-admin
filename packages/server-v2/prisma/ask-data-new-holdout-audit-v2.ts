import type { AskDataGoldQuestionContract, AskDataGoldSupportClass } from './ask-data-gold-question-contracts.ts';

export type AskDataNewHoldoutV2Decision = {
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

const decisions: AskDataNewHoldoutV2Decision[] = [];
const add = (decision: AskDataNewHoldoutV2Decision) => decisions.push(decision);
const supported = (view: string, ids: string[], note = '管理端与 Ask 已有可靠只读事实。') => ids.forEach((id) => add({
  id, supportClass: 'ask_query_supported', expectedView: view,
  managementSupport: 'supported', backendSupport: 'supported', auditNote: note,
}));
const clarification = (id: string, view: string, slots: AskDataGoldQuestionContract['allowedClarificationSlots'], note: string) => add({
  id, supportClass: 'clarification_required', expectedView: view, allowedClarificationSlots: slots,
  managementSupport: 'supported', backendSupport: 'supported', auditNote: note,
});
const boundary = (
  id: string,
  supportClass: Extract<AskDataGoldSupportClass, 'admin_supported_ask_not_open' | 'admin_backend_unsupported'>,
  note: string,
  managementSupport: AskDataGoldQuestionContract['managementSupport'] = 'supported',
  backendSupport: AskDataGoldQuestionContract['backendSupport'] = 'supported',
) => add({ id, supportClass, managementSupport, backendSupport, auditNote: note });
const corrected = (input: Omit<AskDataNewHoldoutV2Decision, 'managementSupport' | 'backendSupport'>) => add({
  managementSupport: 'supported', backendSupport: 'supported', ...input,
});

supported('agent_v3_order_summary_view', ['BQ0670', 'BQ0676', 'BQ0681', 'BQ0687']);
corrected({
  id: 'BQ0678', supportClass: 'ask_query_supported', expectedView: 'agent_v3_order_summary_view',
  expectedMetricKeys: ['order_revenue'], requiredOutputFields: ['average_order_value'], requiredResultMode: 'scalar',
  auditNote: '客单价按净收入除以去重订单数。',
});
supported('agent_v3_order_item_sales_view', ['BQ0704', 'BQ0542', 'BQ0548', 'BQ0560']);
clarification('BQ0554', 'agent_v3_order_item_sales_view', ['year'], '国庆跨年份。');
for (const id of ['BQ0549', 'BQ0561']) supported('agent_v3_project_service_sales_view', [id]);
for (const id of ['BQ0556', 'BQ0562']) corrected({
  id, supportClass: 'ask_query_supported', expectedView: 'agent_v3_project_service_sales_view', expectedMetricKeys: ['project_sales'],
  requiredOutputFields: ['project_id', 'project_name', 'estimated_margin'], requiredResultMode: 'grouped',
  auditNote: '只回答项目销售口径的预估毛利并披露口径。',
});
clarification('BQ0550', 'agent_v3_project_service_sales_view', ['year'], '双十一跨年份。');
clarification('BQ0555', 'agent_v3_project_service_sales_view', ['year'], '国庆跨年份。');

supported('agent_v3_payment_refund_view', ['BQ0720', 'BQ0740']);
for (const id of ['BQ0711', 'BQ0721', 'BQ0741', 'BQ0748', 'BQ0752']) clarification(
  id, 'agent_v3_payment_refund_view', ['threshold'], '“正常、偏高或可疑”缺少治理阈值或比较基线。',
);
clarification('BQ0730', 'agent_v3_payment_refund_view', ['year'], '双十一跨年份。');
clarification('BQ0731', 'agent_v3_payment_refund_view', ['year', 'threshold'], '同时缺少双十一年份和退款率判断阈值。');
clarification('BQ0746', 'agent_v3_payment_refund_view', ['threshold'], '“异常大额退款”没有金额阈值。');

supported('agent_v3_product_inventory_view', ['BQ1084', 'BQ1089', 'BQ1093']);
for (const id of ['BQ1083', 'BQ1086', 'BQ1090', 'BQ1091', 'BQ1092', 'BQ1095']) boundary(
  id, 'admin_backend_unsupported', '当前库存视图是现状快照，无法还原过去期间的缺货、临期、安全库存或库存价值。', 'partial', 'partial',
);
clarification('BQ1097', 'agent_v3_product_inventory_view', ['time_point'], '“最近 14 天即将过期”混合过去观察期与未来效期窗口，需要明确时间口径。');
supported('agent_v3_stock_movement_view', ['BQ1123', 'BQ1127', 'BQ1131', 'BQ1132', 'BQ1178', 'BQ1182', 'BQ1186', 'BQ1190']);
clarification('BQ1194', 'agent_v3_stock_movement_view', ['year'], '五一假期跨年份。');
clarification('BQ1198', 'agent_v3_stock_movement_view', ['year'], '五一假期跨年份。');

supported('ask_data_customer_profile_summary_view', ['BQ0039', 'BQ0047', 'BQ0057', 'BQ0077']);
clarification('BQ0884', 'agent_v3_reservation_view', ['year'], '国庆跨年份。');
clarification('BQ0885', 'agent_v3_reservation_view', ['year'], '国庆跨年份。');
supported('agent_v3_reservation_view', ['BQ0887', 'BQ0888', 'BQ0892', 'BQ0893', 'BQ0896', 'BQ0897']);
clarification('BQ0889', 'agent_v3_reservation_view', ['year'], '国庆跨年份。');
clarification('BQ0895', 'agent_v3_reservation_view', ['year'], '国庆跨年份。');
supported('agent_v3_marketing_conversion_view', ['BQ1540', 'BQ1541', 'BQ1544', 'BQ1547', 'BQ1560']);

supported('agent_v3_card_usage_view', ['BQ0844', 'BQ0847', 'BQ0852', 'BQ0855', 'BQ0860', 'BQ0539', 'BQ0546', 'BQ0552', 'BQ0558', 'BQ0564']);
supported('agent_v3_project_catalog_view', ['BQ0493']);
for (const id of ['BQ1539']) corrected({
  id, supportClass: 'ask_query_supported', expectedView: 'ask_data_marketing_roi_view', expectedMetricKeys: ['marketing_roi'],
  requiredOutputFields: ['strategy_name', 'conversion_rate'], requiredResultMode: 'ranking',
  auditNote: '自动化策略转化排行使用含策略和转化率的营销 ROI 事实。',
});
supported('agent_v3_marketing_automation_view', ['BQ1545']);
clarification('BQ1550', 'ask_data_marketing_roi_view', ['year'], '国庆跨年份。');

clarification('BQ1348', 'ask_data_operating_cost_view', ['year'], '五一假期跨年份。');
clarification('BQ1354', 'ask_data_operating_cost_view', ['year'], '五一假期跨年份。');
supported('ask_data_operating_cost_view', ['BQ1358', 'BQ1364']);
clarification('BQ1368', 'ask_data_operating_cost_view', ['year'], '春节跨年份。');
clarification('BQ1374', 'ask_data_operating_cost_view', ['year'], '春节跨年份。');

supported('agent_v3_purchase_procurement_view', ['BQ1748', 'BQ1756', 'BQ1763', 'BQ1770']);
for (const id of ['BQ1750', 'BQ1758', 'BQ1765']) boundary(id, 'admin_supported_ask_not_open', '采购底表有返点事实，但当前 Ask 采购视图未开放返点字段。');
boundary('BQ1753', 'admin_supported_ask_not_open', '当前 Ask 采购视图没有采购品类字段，且春节还缺年份。');
boundary('BQ1760', 'admin_supported_ask_not_open', '当前 Ask 采购视图没有采购品类字段。');
boundary('BQ1767', 'admin_supported_ask_not_open', '当前 Ask 采购视图没有采购品类字段。');

boundary('BQ1315', 'admin_backend_unsupported', '已确认利润仅按自然月快照，不能精确回答滚动最近 30 天毛利率。', 'partial', 'partial');
corrected({
  id: 'BQ1317', supportClass: 'ask_query_supported', expectedView: 'agent_v3_project_service_sales_view', expectedMetricKeys: ['project_sales'],
  requiredOutputFields: ['project_id', 'project_name', 'estimated_margin'], requiredResultMode: 'ranking',
  auditNote: '项目利润贡献只能回答预估项目毛利。',
});
supported('ask_data_confirmed_profit_view', ['BQ1320', 'BQ1322', 'BQ1334']);
clarification('BQ1324', 'agent_v3_project_service_sales_view', ['year'], '五一假期跨年份；明确后按预估项目毛利排行。');
boundary('BQ1327', 'admin_backend_unsupported', '已确认利润按自然月快照，无法精确回答五一假期经营利润。', 'partial', 'partial');
boundary('BQ1329', 'admin_backend_unsupported', '已确认利润按自然月快照，无法精确回答五一假期毛利率。', 'partial', 'partial');
corrected({
  id: 'BQ1331', supportClass: 'ask_query_supported', expectedView: 'agent_v3_project_service_sales_view', expectedMetricKeys: ['project_sales'],
  requiredOutputFields: ['project_id', 'project_name', 'estimated_margin'], requiredResultMode: 'ranking',
  auditNote: '项目利润贡献只能回答预估项目毛利。',
});
boundary('BQ0821', 'admin_supported_ask_not_open', '当前 Ask 没有每张订单的成本与毛利明细视图。');
supported('ask_data_reconciliation_issue_view', ['BQ1400', 'BQ1403', 'BQ1407', 'BQ1410']);

supported('ask_data_staff_capacity_view', ['BQ0360', 'BQ0366', 'BQ0372']);
clarification('BQ0378', 'ask_data_staff_capacity_view', ['year'], '双十一跨年份。');
supported('ask_data_marketing_roi_view', ['BQ1586', 'BQ1588', 'BQ1605', 'BQ1612']);

export const ASK_DATA_NEW_HOLDOUT_AUDIT_V2 = Object.freeze(decisions);
