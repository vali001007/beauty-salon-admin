export type AskDataSupplementalQuestion = {
  id: string;
  role: string;
  question: string;
  expectedView: string;
  provenance: string;
};

export const ASK_DATA_SUPPLEMENTAL_QUESTIONS: AskDataSupplementalQuestion[] = [
  q('SUP-CARD-USAGE-002', 'finance', '按次卡名称统计最近 30 天核销次数', 'agent_v3_card_usage_view'),
  q('SUP-BAL-001', 'manager', '当前储值余额最高的前 10 位客户是谁', 'agent_v3_customer_balance_view'),
  q('SUP-BAL-002', 'finance', '哪些客户的赠送余额高于现金余额', 'agent_v3_customer_balance_view'),
  q('SUP-BAL-003', 'frontdesk', '列出客户当前现金余额和赠送余额', 'agent_v3_customer_balance_view'),
  q('SUP-BAL-004', 'finance', '哪些客户现金余额已经为 0 但仍有赠送余额', 'agent_v3_customer_balance_view'),
  q('SUP-BAL-005', 'manager', '当前门店客户现金余额与赠送余额合计各是多少', 'agent_v3_customer_balance_view'),
  q('SUP-BAL-006', 'manager', '客户储值总余额从高到低怎么排', 'agent_v3_customer_balance_view'),

  q('SUP-GAP-001', 'frontdesk', '未来 7 天每天可加客容量和预计收入趋势', 'agent_v3_appointment_gap_view'),
  q('SUP-GAP-002', 'frontdesk', '今天上午哪些时段还有可用预约容量', 'agent_v3_appointment_gap_view'),
  q('SUP-GAP-003', 'manager', '本周可用容量最高的前 10 个预约时段', 'agent_v3_appointment_gap_view'),
  q('SUP-GAP-004', 'marketing', '未来 30 天预约空档候选客户数合计是多少', 'agent_v3_appointment_gap_view'),

  q('SUP-SCRAP-001', 'inventory', '本月库存报废造成的损耗金额合计是多少', 'agent_v3_inventory_scrap_view'),
  q('SUP-SCRAP-002', 'inventory', '按报废数量列出损耗最多的商品前 10 名', 'agent_v3_inventory_scrap_view'),
  q('SUP-SCRAP-003', 'inventory', '最近 30 天有哪些库存报废记录', 'agent_v3_inventory_scrap_view'),
  q('SUP-SCRAP-004', 'manager', '各操作人的库存报废金额分别是多少', 'agent_v3_inventory_scrap_view'),
  q('SUP-SCRAP-005', 'finance', '每笔库存报废的平均损耗金额是多少', 'agent_v3_inventory_scrap_view'),
  q('SUP-SCRAP-006', 'inventory', '哪些报废记录的损耗金额为 0', 'agent_v3_inventory_scrap_view'),
  q('SUP-SCRAP-007', 'manager', '最近三个月库存报废金额的按日趋势', 'agent_v3_inventory_scrap_view'),
  q('SUP-SCRAP-008', 'inventory', '列出库存报废记录的受控备注摘要和商品名称', 'agent_v3_inventory_scrap_view'),

  q('SUP-PROMO-001', 'marketing', '当前有哪些仍在生效的全局优惠', 'agent_v3_promotion_offer_view'),
  q('SUP-PROMO-002', 'marketing', '各优惠活动的发放数量和使用数量分别是多少', 'agent_v3_promotion_offer_view'),
  q('SUP-PROMO-003', 'frontdesk', '未来 30 天内即将结束的优惠活动有哪些', 'agent_v3_promotion_offer_view'),
  q('SUP-PROMO-004', 'manager', '全局优惠和门店优惠各有多少个', 'agent_v3_promotion_offer_view'),
  q('SUP-PROMO-005', 'marketing', '按优惠类型统计当前活动数量', 'agent_v3_promotion_offer_view'),
  q('SUP-PROMO-006', 'marketing', '哪些优惠活动已经发放但还没有被使用', 'agent_v3_promotion_offer_view'),
  q('SUP-PROMO-007', 'manager', '使用次数最多的优惠活动前 10 名', 'agent_v3_promotion_offer_view'),
  q('SUP-PROMO-008', 'marketing', '当前按优惠范围统计发放量和使用量', 'agent_v3_promotion_offer_view'),

  q('SUP-STAFF-001', 'manager', '当前在职员工一共有多少人', 'agent_v3_staff_profile_view'),
  q('SUP-STAFF-002', 'manager', '各员工级别分别有多少人', 'agent_v3_staff_profile_view'),
  q('SUP-STAFF-003', 'frontdesk', '列出当前在职美容师及其级别', 'agent_v3_staff_profile_view'),
  q('SUP-STAFF-004', 'manager', '最近入职的员工前 10 名是谁', 'agent_v3_staff_profile_view'),
  q('SUP-STAFF-005', 'manager', '当前员工档案中有哪些不同的职级', 'agent_v3_staff_profile_view'),

  q('SUP-SUPPLIER-001', 'inventory', '平均交付天数最短的供应商前 10 名', 'agent_v3_supplier_performance_view'),
  q('SUP-SUPPLIER-002', 'manager', '比较各供应商的采购次数、采购金额和平均交付天数', 'agent_v3_supplier_performance_view'),
  q('SUP-SUPPLIER-003', 'inventory', '各供应商累计采购金额从高到低怎么排', 'agent_v3_supplier_performance_view'),
  q('SUP-SUPPLIER-004', 'inventory', '采购次数最多的供应商前 10 名', 'agent_v3_supplier_performance_view'),

  q('SUP-CARD-USAGE-003', 'finance', '最近 30 天次卡确认收入的按日趋势', 'agent_v3_card_usage_view'),
  q('SUP-CARD-USAGE-001', 'finance', '最近 30 天次卡核销次数和确认收入各是多少', 'agent_v3_card_usage_view'),
  q('SUP-CARD-USAGE-005', 'finance', '本月各次卡名称的核销次数分别是多少', 'agent_v3_card_usage_view'),
  q('SUP-CARD-USAGE-006', 'manager', '最近 30 天确认收入最高的次卡前 10 名', 'agent_v3_card_usage_view'),
  q('SUP-CARD-USAGE-007', 'frontdesk', '最近 7 天每种次卡分别核销了多少次', 'agent_v3_card_usage_view'),
  q('SUP-SERVICE-001', 'manager', '最近 30 天各服务状态的任务数量分别是多少', 'agent_v3_service_quality_view'),
  q('SUP-ACTIVITY-001', 'marketing', '最近 30 天各营销活动的参与人数是多少', 'agent_v3_marketing_activity_view'),
  q('SUP-LIABILITY-001', 'finance', '最新已确认会员履约负债总额和剩余次数是多少', 'ask_data_member_liability_view'),
  q('SUP-LIFECYCLE-001', 'manager', '按流失风险等级统计当前客户数量', 'ask_data_customer_lifecycle_view'),
  q('SUP-LIFECYCLE-002', 'manager', '按客户生命周期阶段统计当前客户数量', 'ask_data_customer_lifecycle_view'),
  q('SUP-LIFECYCLE-003', 'manager', '按 LTV 档位统计当前客户数量', 'ask_data_customer_lifecycle_view'),
  q('SUP-LIFECYCLE-004', 'manager', '列出当前客户的生命周期阶段、LTV 档位和流失风险等级', 'ask_data_customer_lifecycle_view'),
  q('SUP-LIFECYCLE-005', 'manager', '按最高优先级机会类型统计当前客户数量', 'ask_data_customer_lifecycle_view'),
  q('SUP-LIFECYCLE-006', 'manager', '当前高流失风险客户有多少人', 'ask_data_customer_lifecycle_view'),
  q('SUP-LIFECYCLE-007', 'manager', '当前低流失风险客户有多少人', 'ask_data_customer_lifecycle_view'),
  q('SUP-LIFECYCLE-008', 'marketing', '列出当前高流失风险客户及其 LTV 档位', 'ask_data_customer_lifecycle_view'),
  q('SUP-LIFECYCLE-009', 'marketing', '当前存在未关闭机会的客户有多少人', 'ask_data_customer_lifecycle_view'),
  q('SUP-LIFECYCLE-010', 'manager', '机会评分最高的前 10 位客户', 'ask_data_customer_lifecycle_view'),
  q('SUP-FEEDBACK-001', 'manager', '最近 30 天各员工收到的投诉数量排名', 'ask_data_customer_feedback_view'),

  q('SUP-BOM-001', 'inventory', '最近 30 天有哪些 BOM 消耗偏差超过 20% 的记录', 'ask_data_bom_consumption_variance_view'),
  q('SUP-BOM-002', 'manager', '按项目列出实际耗材偏差率最高的前 10 名', 'ask_data_bom_consumption_variance_view'),
  q('SUP-BOM-003', 'inventory', '哪些耗材消耗记录缺少标准 BOM', 'ask_data_bom_consumption_variance_view'),
  q('SUP-BOM-004', 'inventory', '各商品的标准用量、实际用量和偏差数量分别是多少', 'ask_data_bom_consumption_variance_view'),
  q('SUP-BOM-005', 'manager', '最近三个月实际耗材偏差率的变化趋势', 'ask_data_bom_consumption_variance_view'),
  q('SUP-BOM-006', 'inventory', 'BOM 消耗异常记录一共有多少条', 'ask_data_bom_consumption_variance_view'),

  q('SUP-CARD-USAGE-004', 'frontdesk', '列出最近 30 天次卡核销明细', 'agent_v3_card_usage_view'),
  q('SUP-CARD-ASSET-001', 'manager', '按状态统计当前次卡剩余次数', 'agent_v3_card_asset_view'),
  q('SUP-CARD-ASSET-002', 'finance', '当前有效次卡的剩余次数合计是多少', 'agent_v3_card_asset_view'),
  q('SUP-CARD-ASSET-003', 'finance', '已过期次卡的剩余次数合计是多少', 'agent_v3_card_asset_view'),
  q('SUP-CARD-ASSET-004', 'manager', '剩余次数最多的客户次卡前 10 名', 'agent_v3_card_asset_view'),
  q('SUP-CARD-ASSET-005', 'frontdesk', '列出未来 30 天到期且仍有剩余次数的客户次卡', 'agent_v3_card_asset_view'),
  q('SUP-CARD-ASSET-006', 'frontdesk', '列出未来 30 天到期且剩余次数超过 5 次的客户次卡', 'agent_v3_card_asset_view'),

  q('SUP-TRANSFER-001', 'inventory', '当前有哪些未完成的调出单', 'ask_data_transfer_status_view'),
  q('SUP-TRANSFER-002', 'inventory', '当前有哪些待接收的调入单', 'ask_data_transfer_status_view'),
  q('SUP-TRANSFER-003', 'manager', '按状态统计库存调拨单数量', 'ask_data_transfer_status_view'),
  q('SUP-TRANSFER-004', 'inventory', '各对方门店的调入商品数量分别是多少', 'ask_data_transfer_status_view'),
  q('SUP-TRANSFER-005', 'inventory', '最近 30 天创建了多少张库存调拨单', 'ask_data_transfer_status_view'),
  q('SUP-TRANSFER-006', 'manager', '调入和调出方向的调拨单数量对比', 'ask_data_transfer_status_view'),
  q('SUP-TRANSFER-007', 'inventory', '商品种类最多的库存调拨单前 10 张', 'ask_data_transfer_status_view'),
  q('SUP-TRANSFER-008', 'inventory', '列出最近更新的 20 张库存调拨单', 'ask_data_transfer_status_view'),
  q('SUP-TRANSFER-009', 'manager', '已经完成的库存调拨单一共有多少张', 'ask_data_transfer_status_view'),
  q('SUP-TRANSFER-010', 'inventory', '最早创建但仍未完成的库存调拨单是哪一张', 'ask_data_transfer_status_view'),
];

function q(
  id: string,
  role: string,
  question: string,
  expectedView: string,
): AskDataSupplementalQuestion {
  return {
    id,
    role,
    question,
    expectedView,
    provenance: 'Ami Ask 两轮实测覆盖缺口补充；问题按不同业务决策和答案形态人工设计，非时间改写复制。',
  };
}
