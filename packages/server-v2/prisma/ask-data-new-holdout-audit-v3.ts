import type { AskDataGoldQuestionContract, AskDataGoldSupportClass } from './ask-data-gold-question-contracts.ts';

export type AskDataNewHoldoutV3Decision = {
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

const decisions: AskDataNewHoldoutV3Decision[] = [];
const add = (decision: AskDataNewHoldoutV3Decision) => decisions.push(decision);
const supported = (view: string, ids: string[], note = '当前管理端与 Ask 已有可靠只读事实。') => ids.forEach((id) => add({
  id,
  supportClass: 'ask_query_supported',
  expectedView: view,
  managementSupport: 'supported',
  backendSupport: 'supported',
  auditNote: note,
}));
const corrected = (input: Omit<AskDataNewHoldoutV3Decision, 'managementSupport' | 'backendSupport'>) => add({
  managementSupport: 'supported',
  backendSupport: 'supported',
  ...input,
});
const clarification = (
  id: string,
  view: string,
  slots: AskDataGoldQuestionContract['allowedClarificationSlots'],
  note: string,
) => add({
  id,
  supportClass: 'clarification_required',
  expectedView: view,
  allowedClarificationSlots: slots,
  managementSupport: 'supported',
  backendSupport: 'supported',
  auditNote: note,
});
const boundary = (
  ids: string[],
  supportClass: Extract<AskDataGoldSupportClass, 'admin_supported_ask_not_open' | 'admin_backend_unsupported'>,
  note: string,
  managementSupport: AskDataGoldQuestionContract['managementSupport'] = 'supported',
  backendSupport: AskDataGoldQuestionContract['backendSupport'] = 'supported',
) => ids.forEach((id) => add({ id, supportClass, managementSupport, backendSupport, auditNote: note }));
const brain = (ids: string[], note: string) => ids.forEach((id) => add({
  id,
  supportClass: 'brain_content_or_advice',
  managementSupport: 'partial',
  backendSupport: 'partial',
  auditNote: note,
}));

// 订单：只保留当前订单摘要能够证明的收入、客单价、趋势和脱敏客户明细。
supported('agent_v3_order_summary_view', ['BQ0698', 'BQ0700', 'BQ0703', 'BQ0706', 'BQ0708']);
for (const id of ['BQ0689', 'BQ0692', 'BQ0716']) clarification(id, 'agent_v3_order_summary_view', ['year'], '节日跨年份，年份会改变查询窗口。');
clarification('BQ0715', 'agent_v3_order_summary_view', ['threshold'], '“大额订单”没有治理金额阈值。');
boundary(['BQ0675', 'BQ0697'], 'admin_supported_ask_not_open', '订单摘要未开放优惠使用标识，不能按是否使用优惠筛选。');
boundary(['BQ0679', 'BQ0686', 'BQ0690', 'BQ0701'], 'admin_supported_ask_not_open', '当前 Ask 没有开卡订单与赠送次数联合事实。');

// 商品销售：动销可查询，订单级商品成本与毛利未开放。
supported('agent_v3_order_item_sales_view', ['BQ1179', 'BQ1187', 'BQ1203']);
clarification('BQ1195', 'agent_v3_order_item_sales_view', ['year'], '五一假期跨年份。');
boundary(['BQ0827', 'BQ0835', 'BQ0843', 'BQ0851', 'BQ0859'], 'admin_supported_ask_not_open', '商品销售视图只有销售、优惠和退款，没有订单级商品成本与毛利。');

// 退款风险：判断词必须先补阈值；节日题同时补年份。
for (const id of ['BQ0754', 'BQ0756', 'BQ0760', 'BQ0770', 'BQ0772']) {
  clarification(id, 'agent_v3_payment_refund_view', ['threshold'], '“大额、偏高、可疑连续”缺少治理阈值。');
}
for (const id of ['BQ0762', 'BQ0764', 'BQ0768']) {
  clarification(id, 'agent_v3_payment_refund_view', ['year', 'threshold'], '同时缺少双十一年份和风险判定阈值。');
}

// 库存：当前快照可以回答现状和未来效期，不能还原过去某日的库存状态。
supported('agent_v3_product_inventory_view', ['BQ1108']);
corrected({
  id: 'BQ1142',
  supportClass: 'ask_query_supported',
  expectedView: 'agent_v3_product_inventory_view',
  expectedMetricKeys: ['inventory_on_hand'],
  requiredOutputFields: ['product_id', 'product_name', 'nearest_expiry_date', 'current_stock', 'stock_value'],
  requiredResultMode: 'detail',
  auditNote: '按当前批次快照筛选本周末临期商品，并展示库存数量和风险货值。',
});
clarification('BQ1106', 'agent_v3_product_inventory_view', ['threshold'], '“库存金额高”没有金额阈值。');
for (const id of ['BQ1181', 'BQ1205']) clarification(id, 'agent_v3_product_inventory_view', ['comparison_baseline'], '“库存结构合理”缺少结构目标或比较基线。');
boundary(
  ['BQ1099', 'BQ1115', 'BQ1117', 'BQ1124', 'BQ1126', 'BQ1133', 'BQ1135', 'BQ1137', 'BQ1189', 'BQ1197'],
  'admin_backend_unsupported',
  '当前库存视图是现状快照，不能还原历史期间的低库存、临期或库存结构。',
  'partial',
  'partial',
);
clarification('BQ1202', 'agent_v3_stock_movement_view', ['comparison_relation'], '“耗占比”没有明确分子和分母。');

// 客户：当前档案快照支持个人现状，不支持历史等级结构或跨事实消费贡献。
supported('ask_data_customer_profile_summary_view', ['BQ0038']);
boundary(
  ['BQ0042', 'BQ0053', 'BQ0063', 'BQ0067', 'BQ0073', 'BQ0083', 'BQ0093', 'BQ0101', 'BQ0109'],
  'admin_supported_ask_not_open',
  '当前 Ask 缺少客户 Top/会员等级与项目购买、期间到店或消费贡献的受控联合视图。',
);
boundary(
  ['BQ0086', 'BQ0095', 'BQ0103', 'BQ0111'],
  'admin_backend_unsupported',
  '客户档案是当前快照，无法还原历史时间窗口中的会员等级结构。',
  'partial',
  'partial',
);
brain(['BQ0092'], '“共同特征”需要分析和解释，Ask 可提供事实但不直接生成经营画像结论。');

// 预约：到店转化、时段/项目/员工排行及脱敏预约明细均属于预约事实。
for (const id of ['BQ0898', 'BQ0907']) corrected({
  id,
  supportClass: 'ask_query_supported',
  expectedView: 'agent_v3_reservation_view',
  expectedMetricKeys: ['reservation_metrics'],
  requiredOutputFields: ['reservation_count', 'completed_reservation_count', 'arrival_conversion_rate'],
  requiredResultMode: 'scalar',
  auditNote: '到店转化率按到店或完成预约数除以非取消预约数。',
});
for (const id of ['BQ0899', 'BQ0908']) corrected({
  id,
  supportClass: 'ask_query_supported',
  expectedView: 'agent_v3_reservation_view',
  expectedMetricKeys: ['reservation_metrics'],
  requiredOutputFields: ['start_time', 'reservation_count'],
  requiredResultMode: 'ranking',
  auditNote: '按开始时段汇总非取消预约并按预约数倒序。',
});
for (const id of ['BQ0901', 'BQ0910']) corrected({
  id,
  supportClass: 'ask_query_supported',
  expectedView: 'agent_v3_reservation_view',
  expectedMetricKeys: ['reservation_metrics'],
  requiredOutputFields: ['project_id', 'project_name', 'reservation_count'],
  requiredResultMode: 'ranking',
  auditNote: '按项目汇总非取消预约并按预约数倒序。',
});
for (const id of ['BQ0904', 'BQ0913']) corrected({
  id,
  supportClass: 'ask_query_supported',
  expectedView: 'agent_v3_reservation_view',
  expectedMetricKeys: ['reservation_metrics'],
  requiredOutputFields: ['beautician_id', 'beautician_name', 'reservation_count'],
  requiredResultMode: 'grouped',
  auditNote: '按美容师汇总非取消预约量。',
});
supported('agent_v3_reservation_view', ['BQ0903', 'BQ0905', 'BQ0906', 'BQ0912']);
boundary(['BQ0902', 'BQ0911'], 'admin_supported_ask_not_open', '预约视图没有资源冲突检测结果。');
clarification('BQ0914', 'agent_v3_reservation_view', ['year'], '国庆跨年份。');

// 营销转化与自动化：国庆题补年份；真正的漏斗使用营销 ROI 事实。
for (const id of ['BQ1549', 'BQ1551', 'BQ1552', 'BQ1555', 'BQ1558']) {
  clarification(id, 'agent_v3_marketing_conversion_view', ['year'], '国庆跨年份。');
}
clarification('BQ1556', 'agent_v3_marketing_automation_view', ['year'], '国庆跨年份。');
for (const id of ['BQ1562', 'BQ1572', 'BQ1582']) corrected({
  id,
  supportClass: 'ask_query_supported',
  expectedView: 'ask_data_marketing_roi_view',
  expectedMetricKeys: ['marketing_roi'],
  requiredOutputFields: ['strategy_id', 'strategy_name', 'exposure_count', 'click_count', 'conversion_count', 'conversion_rate'],
  requiredResultMode: 'grouped',
  auditNote: '自动化策略漏斗使用策略级触达、点击和转化事实，不使用任务完成量冒充转化。',
});
corrected({
  id: 'BQ1592',
  supportClass: 'clarification_required',
  expectedView: 'ask_data_marketing_roi_view',
  expectedMetricKeys: ['marketing_roi'],
  allowedClarificationSlots: ['year'],
  requiredOutputFields: ['strategy_id', 'strategy_name', 'exposure_count', 'click_count', 'conversion_count', 'conversion_rate'],
  requiredResultMode: 'grouped',
  auditNote: '国庆缺年份；明确后使用策略级营销漏斗事实。',
});
for (const id of ['BQ1602', 'BQ1610', 'BQ1617']) clarification(id, 'agent_v3_marketing_automation_view', ['threshold'], '触达失败率“高”缺少阈值。');
clarification('BQ1624', 'agent_v3_marketing_automation_view', ['year', 'threshold'], '同时缺少国庆年份和失败率阈值。');
boundary(['BQ1604'], 'admin_supported_ask_not_open', '自动触达聚合视图没有任务截止时间，不能判断超时。');

// 经营成本：当前没有预算事实；异常判断必须先给出阈值。
boundary(['BQ1381', 'BQ1388', 'BQ1395', 'BQ1402', 'BQ1409'], 'admin_backend_unsupported', '当前后台没有可核验的经营成本预算基线。', 'partial', 'partial');
clarification('BQ1383', 'ask_data_operating_cost_view', ['year', 'threshold'], '五一缺年份，异常支出也缺金额或变化阈值。');
clarification('BQ1390', 'ask_data_operating_cost_view', ['threshold'], '异常成本支出缺少金额或变化阈值。');
clarification('BQ1397', 'ask_data_operating_cost_view', ['year', 'threshold'], '春节缺年份，异常支出也缺阈值。');
clarification('BQ1404', 'ask_data_operating_cost_view', ['threshold'], '异常成本支出缺少金额或变化阈值。');

// 采购：金额趋势与未到货采购单可查，返点和采购品类未开放。
supported('agent_v3_purchase_procurement_view', ['BQ1180', 'BQ1188', 'BQ1204', 'BQ1782', 'BQ1787', 'BQ1790']);
clarification('BQ1777', 'agent_v3_purchase_procurement_view', ['year'], '五一假期跨年份。');
clarification('BQ1196', 'agent_v3_purchase_procurement_view', ['year'], '五一假期跨年份。');
for (const id of ['BQ1786', 'BQ1789']) clarification(id, 'agent_v3_purchase_procurement_view', ['comparison_relation'], '“采购结构”未说明按供应商、状态还是其他维度。');
boundary(['BQ1772', 'BQ1779', 'BQ1785', 'BQ1788'], 'admin_supported_ask_not_open', '采购视图未开放返点字段。');
boundary(['BQ1774'], 'admin_supported_ask_not_open', '采购视图未开放采购品类字段。');

// 利润：confirmed 视图只支持月度门店快照，不支持订单级利润。
supported('ask_data_confirmed_profit_view', ['BQ1336']);
boundary(
  ['BQ0822', 'BQ0825', 'BQ0829', 'BQ0830', 'BQ0833', 'BQ0837', 'BQ0838', 'BQ0841', 'BQ0845', 'BQ0846', 'BQ0849', 'BQ0853', 'BQ0854', 'BQ0857'],
  'admin_supported_ask_not_open',
  '已确认利润视图是门店月结快照，不能回答项目或订单级利润明细。',
);

// 请假是否“导致”未来产能缺口属于预测和因果判断，不由 Ask 直接下结论。
brain(['BQ0354', 'BQ0361', 'BQ0367', 'BQ0373', 'BQ0379'], 'Ask 可展示请假和产能事实，但“会不会导致”属于预测与经营判断。');

// ROI：估算成本可回答趋势和亏损事实；预算与停投建议保持边界。
clarification('BQ1593', 'ask_data_marketing_roi_view', ['year'], '国庆跨年份。');
clarification('BQ1596', 'ask_data_marketing_roi_view', ['year'], '国庆跨年份。');
clarification('BQ1598', 'ask_data_marketing_roi_view', ['year'], '国庆跨年份。');
clarification('BQ1619', 'ask_data_marketing_roi_view', ['year'], '国庆跨年份；明确后按 estimated 成本判断活动亏损。');
supported('ask_data_marketing_roi_view', ['BQ1626'], '按归因净收入减 estimated 营销成本判断亏损，必须披露成本来源。');
brain(['BQ1601', 'BQ1609', 'BQ1616', 'BQ1623', 'BQ1630'], '“低于预期且该停”同时包含未治理阈值和停投建议，应由 Brain 承接决策。');
boundary(['BQ1606', 'BQ1613', 'BQ1620', 'BQ1627'], 'admin_backend_unsupported', '当前后台没有可核验的营销预算基线。', 'partial', 'partial');

export const ASK_DATA_NEW_HOLDOUT_AUDIT_V3 = Object.freeze(decisions);
