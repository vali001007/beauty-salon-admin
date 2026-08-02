import type { AskDataSemanticAnswerShape } from './ask-data-free-sql.types.js';

export type AskDataSemanticMetricContract = {
  metricKey: string;
  label: string;
  aliases: string[];
  preferredView: string;
  fallbackViews?: string[];
  dimensions: string[];
  answerShapes: AskDataSemanticAnswerShape[];
  defaultAnswerShape: AskDataSemanticAnswerShape;
  priority?: number;
  staticData?: boolean;
};

export const ASK_DATA_SEMANTIC_CONTRACTS: AskDataSemanticMetricContract[] = [
  contract('order_revenue', '订单经营收入', ['营业额', '订单收入', '订单金额', '订单净收', '订单数', '客单价'], 'agent_v3_order_summary_view', ['date', 'customer', 'payment_method'], ['scalar', 'trend', 'comparison', 'ranking']),
  contract('product_sales', '商品销售', ['产品订单', '商品订单', '商品销量', '产品销量', '商品销售额', '商品排行', 'sku销量'], 'agent_v3_order_item_sales_view', ['date', 'product', 'sku'], ['scalar', 'list', 'ranking', 'trend'], false, 20),
  contract('project_sales', '项目服务销售', ['项目销量', '项目销售', '项目收入', '服务次数', '项目排行', '最受欢迎项目', '项目最受欢迎', '最热门项目', '项目最热门'], 'agent_v3_project_service_sales_view', ['date', 'project'], ['scalar', 'list', 'ranking', 'trend'], false, 20),
  contract('payment_flow', '支付退款明细', ['实收流水', '支付流水', '支付记录', '退款流水', '退款记录', '售后退款', '退款原因', '支付方式'], 'agent_v3_payment_refund_view', ['date', 'payment_method', 'refund_reason'], ['scalar', 'list', 'ranking', 'trend'], false, 10, ['agent_v3_order_summary_view']),
  contract('daily_net_receipts', '日结净收', ['日结', '日结净收', '收银汇总', '结账金额', '每日收入', '净收趋势'], 'agent_v3_daily_settlement_view', ['date'], ['scalar', 'list', 'trend', 'comparison']),
  contract('inventory_on_hand', '商品库存', ['商品库存', '当前库存', '库存数量', '低库存', '安全库存', '库存金额', '效期', '缺货'], 'agent_v3_product_inventory_view', ['product', 'sku'], ['scalar', 'list', 'ranking'], true),
  contract('inventory_movement', '库存流水', ['库存流水', '库存变化', '入库记录', '出库记录', '盘点记录', '出库数量'], 'agent_v3_stock_movement_view', ['date', 'product', 'movement_type'], ['scalar', 'list', 'ranking', 'trend']),
  contract('inventory_scrap', '库存报废', ['库存报废', '报废商品', '报废数量', '报废金额', '库存损失', '报损'], 'agent_v3_inventory_scrap_view', ['date', 'product', 'reason'], ['scalar', 'list', 'ranking', 'trend']),
  contract('customer_profile', '客户档案摘要', ['客户档案', '客户列表', '会员等级', '最近到店客户', '累计消费客户', '客户订单数'], 'ask_data_customer_profile_summary_view', ['customer', 'member_level'], ['scalar', 'list', 'ranking'], true),
  contract('staff_profile', '员工档案', ['员工档案', '员工列表', '美容师人数', '在职员工', '员工级别', '员工人数'], 'agent_v3_staff_profile_view', ['staff', 'staff_level'], ['scalar', 'list'], true),
  contract('staff_performance', '员工绩效', ['员工业绩', '员工绩效', '员工排行', '业绩排行', '员工提成', '员工客单价', '人效'], 'ask_data_staff_performance_view', ['date', 'staff'], ['scalar', 'list', 'ranking', 'trend']),
  contract('reservation_metrics', '预约经营', ['预约数量', '预约列表', '预约趋势', '预约取消率', '取消预约', '到店预约', '美容师预约'], 'agent_v3_reservation_view', ['date', 'staff', 'project', 'status'], ['scalar', 'list', 'ranking', 'trend']),
  contract('marketing_conversion', '营销转化', ['营销转化', '触达转化', '转化数', '线索转化', '营销线索', '转化率'], 'agent_v3_marketing_conversion_view', ['date', 'channel', 'strategy'], ['scalar', 'list', 'ranking', 'trend']),
  contract('card_assets', '次卡资产', ['次卡资产', '卡项资产', '剩余次数', '到期次卡', '过期次卡', '会员权益'], 'agent_v3_card_asset_view', ['customer', 'card', 'expiry_status'], ['scalar', 'list', 'ranking'], true),
  contract('card_usage', '次卡核销', ['次卡核销', '卡项核销', '核销次数', '划扣记录', '卡耗', '核销收入'], 'agent_v3_card_usage_view', ['date', 'customer', 'card', 'project'], ['scalar', 'list', 'ranking', 'trend']),
  contract('customer_balance', '客户余额', ['客户余额', '储值余额', '现金余额', '赠送余额', '余额排行'], 'agent_v3_customer_balance_view', ['customer'], ['scalar', 'list', 'ranking'], true),
  contract('service_quality', '服务质量', ['服务质量', '服务任务', '护理完成', '服务完成率', '未完成服务', '服务状态'], 'agent_v3_service_quality_view', ['date', 'staff', 'project', 'status'], ['scalar', 'list', 'ranking', 'trend']),
  contract('appointment_gap', '预约空档', ['预约空档', '可用容量', '空闲时段', '低峰时段', '邀约机会', '空档收入'], 'agent_v3_appointment_gap_view', ['date', 'time_slot'], ['scalar', 'list', 'ranking']),
  contract('project_catalog', '项目目录', ['项目目录', '项目价格', '服务价格', '价格最高的项目', '价格最低的项目', '项目时长', '服务时长', '项目类型', '护理周期', '疗程'], 'agent_v3_project_catalog_view', ['project', 'project_type'], ['scalar', 'list', 'ranking'], true, 20),
  contract('marketing_activity', '营销活动', ['营销活动', '活动列表', '活动状态', '参与人数', '发布状态'], 'agent_v3_marketing_activity_view', ['date', 'activity', 'status'], ['scalar', 'list', 'ranking'], true),
  contract('marketing_automation', '自动触达', ['自动触达', '营销自动化', '跟进任务', '触达完成量', '触达状态', '最近执行'], 'agent_v3_marketing_automation_view', ['date', 'automation', 'status'], ['scalar', 'list', 'ranking', 'trend']),
  contract('promotion_offer', '优惠活动', ['优惠活动', '优惠券', '促销方案', '折扣活动', '优惠核销', '全局优惠'], 'agent_v3_promotion_offer_view', ['date', 'offer', 'scope'], ['scalar', 'list', 'ranking'], true),
  contract('operating_cost', '经营成本', ['经营成本', '经营费用', '成本类别', '费用结构', '租金成本', '水电成本', '分摊方式'], 'ask_data_operating_cost_view', ['date', 'cost_category'], ['scalar', 'list', 'ranking', 'trend']),
  contract('procurement_detail', '采购明细', ['采购单', '采购明细', '采购记录', '采购到货', '采购单金额'], 'agent_v3_purchase_procurement_view', ['date', 'supplier', 'product', 'status'], ['scalar', 'list', 'ranking', 'trend']),
  contract('supplier_performance', '供应商表现', ['供应商表现', '供应商排行', '各供应商采购金额', '供应商采购金额', '采购次数', '平均交付天数'], 'agent_v3_supplier_performance_view', ['supplier'], ['scalar', 'list', 'ranking'], true, 20),
  contract('confirmed_profit', '已确认实际利润', ['实际利润', '经营利润', '已确认利润', '月结利润', '毛利率', '经营利润率'], 'ask_data_confirmed_profit_view', ['month'], ['scalar', 'list', 'trend', 'comparison']),
  contract('reconciliation_issue', '财务对账异常', ['财务对账', '对账异常', '账实差异', '财务异常', '未处理异常', '最近一次对账'], 'ask_data_reconciliation_issue_view', ['date', 'issue_type', 'severity', 'status'], ['scalar', 'list', 'ranking', 'trend', 'comparison']),
  contract('member_liability', '会员履约负债', ['会员负债', '履约负债', '合同负债', '次卡负债', '储值负债', '赠送义务'], 'ask_data_member_liability_view', ['snapshot_date'], ['scalar', 'list', 'trend', 'comparison']),
  contract('staff_capacity', '排班与员工产能', ['排班产能', '员工产能', '排班分钟', '工时利用率', '空闲分钟', '超排分钟', '预约分钟'], 'ask_data_staff_capacity_view', ['date', 'staff'], ['scalar', 'list', 'ranking', 'trend']),
  contract('transfer_status', '库存调拨', ['库存调拨', '调拨单', '调入状态', '调出状态', '未完成调拨', '跨店库存调拨'], 'ask_data_transfer_status_view', ['date', 'direction', 'counterparty_store', 'status'], ['scalar', 'list', 'ranking', 'trend']),
  contract('bom_variance', 'BOM 实际消耗偏差', ['bom偏差', '耗材偏差', '实际消耗偏差', '标准用量', '异常消耗', '标准缺失'], 'ask_data_bom_consumption_variance_view', ['date', 'project', 'product', 'standard_status'], ['scalar', 'list', 'ranking', 'trend']),
  contract('customer_feedback', '客户反馈', ['客户反馈', '客户投诉', '满意度', '低评分反馈', '客户表扬', '客户建议', '严重反馈'], 'ask_data_customer_feedback_view', ['date', 'customer', 'staff', 'project', 'feedback_type', 'severity', 'status'], ['scalar', 'list', 'ranking', 'trend']),
  contract('customer_lifecycle', '客户生命周期', ['客户生命周期', '生命周期阶段', '流失风险', 'ltv档位', '客户机会', '触达疲劳', '高价值客户'], 'ask_data_customer_lifecycle_view', ['customer', 'lifecycle_stage', 'ltv_band', 'risk_level', 'opportunity_type'], ['scalar', 'list', 'ranking'], true),
  contract('marketing_roi', '营销 ROI', ['营销roi', '营销投产', '投入产出', '渠道效果', '营销成本回报', '归因净收入', '渠道roi'], 'ask_data_marketing_roi_view', ['date', 'channel', 'strategy', 'cost_source'], ['scalar', 'list', 'ranking', 'trend', 'comparison'], false, 20),
];

export const ASK_DATA_DIMENSION_ALIASES: Array<{ key: string; aliases: string[] }> = [
  { key: 'date', aliases: ['每天', '每日', '按日', '日期', '月份', '每月', '按月'] },
  { key: 'customer', aliases: ['客户', '会员', '顾客'] },
  { key: 'staff', aliases: ['员工', '美容师', '服务人员'] },
  { key: 'project', aliases: ['项目', '护理', '服务项目'] },
  { key: 'product', aliases: ['商品', '产品', 'sku'] },
  { key: 'supplier', aliases: ['供应商', '供货商'] },
  { key: 'channel', aliases: ['渠道', '来源渠道'] },
  { key: 'strategy', aliases: ['策略', '营销策略'] },
  { key: 'status', aliases: ['状态', '进度'] },
  { key: 'payment_method', aliases: ['支付方式', '付款方式'] },
  { key: 'cost_category', aliases: ['成本类别', '费用类别'] },
];

export const ASK_DATA_SEMANTIC_PATTERNS: Record<string, RegExp[]> = {
  order_revenue: [/(?:^|[^产品商品项目])订单.*(?:多少|几笔|数量|金额|收入)/, /多少笔订单/, /(?:营业额|订单收入|客单价)/],
  product_sales: [/产品.*订单/, /商品.*(?:销量|销售|订单|排行)/, /连带销售/, /各品类销售额/],
  project_sales: [/项目.*(?:订单金额|销量|销售|收入|排行)/, /(?:哪个|哪些|各).*项目.*(?:受欢迎|热门|销量)/],
  payment_flow: [/实收流水/, /大额退款/, /退款.*(?:几笔|多少|金额|记录|原因)/, /支付方式.*(?:金额|多少|分布)/],
  daily_net_receipts: [/订单量.*趋势/, /(?:日结|收银汇总|每日收入|净收趋势)/],
  inventory_on_hand: [/(?:库存|存量).*(?:多少|数量|金额|不足|缺货|效期)/, /还有多少库存|临期产品/],
  inventory_movement: [/(?:消耗了多少|耗材消耗|出库数量|入库数量|库存变化|入库了多少货|出入库流水)/],
  inventory_scrap: [/(?:报废|报损|库存损失)/],
  customer_profile: [/(?:钻石|金卡|银卡|普通).*会员/, /会员.*(?:多少人|多少个|等级)/, /上次到店|最近到店|累计消费/, /到店的客户/],
  staff_profile: [/(?:员工|美容师).*(?:职级|级别|档案|在职|人数)/, /(?:什么|哪个)职级/, /在职美容师/],
  staff_performance: [/(?:员工|美容师).*业绩/, /业绩.*(?:员工|美容师|榜单|排行)/, /(?:提成|人效|员工客单价)/],
  reservation_metrics: [/(?:预约).*(?:数量|多少|趋势|取消率|状态|列表|都有谁|还没到店)/, /有多少个?预约|有预约吗|到店人数/],
  marketing_conversion: [/(?:新增|多少).*线索/, /线索.*(?:多少|转化)/, /营销.*转化/, /活动.*(?:带来.*营收|归因.*收益|参与转化)/, /触达.*客户.*转化/],
  card_assets: [/(?:次卡|卡项).*(?:剩余|到期|过期|资产|权益)/],
  card_usage: [/(?:核销|划扣).*(?:次卡|卡项)/, /(?:次卡|卡项).*(?:核销|划扣)/],
  customer_balance: [/(?:客户|会员|顾客).*(?:余额|储值)/, /(?:余额|储值).*(?:客户|会员|排行)/],
  service_quality: [/(?:服务任务|服务质量|护理完成|服务完成率)/],
  appointment_gap: [/(?:时段).*(?:还有空|空闲|空档)/, /(?:预约空档|空档时段|大量空档|可用容量)/],
  project_catalog: [/(?:价格是多少|做一次要多久)/, /(?:多少个|哪些|所有).*项目/, /项目.*(?:价格|时长|类型|疗程|护理周期|推荐)/],
  marketing_activity: [/(?:活动).*(?:参与人数|列表|状态|发布)/],
  marketing_automation: [/(?:触达).*(?:成功率|完成量|状态|最近执行)/, /发出去多少条触达/, /自动化策略|营销自动化|自动触达/],
  promotion_offer: [/(?:优惠|优惠券|促销|折扣).*(?:活动|核销|发放|范围)/],
  operating_cost: [/(?:各项成本|成本科目|成本明细|费用明细|费用结构|经营成本)/],
  procurement_detail: [/(?:采购).*(?:单|明细|记录|到货|在途|总额|结算待付款)/, /发货在途/],
  supplier_performance: [/(?:各供应商|供应商).*(?:采购金额|采购次数|交付天数|表现|排行|合作最多|集中度)/],
  confirmed_profit: [/(?:实际利润|经营利润|已确认利润|月结利润|毛利率|经营利润率|毛利是多少)/],
  reconciliation_issue: [/(?:对平|平不平|对不上|对账|账实差异|金额不一致|支付和金额)/],
  member_liability: [/(?:会员|储值|次卡|合同|履约).*(?:负债|义务)/],
  staff_capacity: [/(?:排班|产能利用率|团队.*产能|工时利用率|空闲分钟|超排)/],
  transfer_status: [/(?:调拨|调入|调出).*(?:状态|单|完成|未完成)/],
  bom_variance: [/(?:bom|耗材|实际消耗).*(?:偏差|标准用量|异常|标准缺失|理论消耗|差得多)/i],
  customer_feedback: [/(?:客户|顾客).*(?:反馈|投诉|满意度|低评分|表扬|建议)/, /严重反馈/],
  customer_lifecycle: [/(?:客户价值分层|价值分层预测|生命周期|流失风险|ltv|触达疲劳|客户机会)/i],
  marketing_roi: [/(?:roi|投产|投入产出|获客成本|拓客成本|渠道效果|营销成本回报|归因净收入)/i],
};

export function validateAskDataSemanticContracts(knownViews: Iterable<string>) {
  const viewNames = new Set(knownViews);
  const metricKeys = new Set<string>();
  const aliasOwners = new Map<string, string>();
  const errors: string[] = [];
  for (const item of ASK_DATA_SEMANTIC_CONTRACTS) {
    if (metricKeys.has(item.metricKey)) errors.push(`duplicate_metric_key:${item.metricKey}`);
    metricKeys.add(item.metricKey);
    if (!viewNames.has(item.preferredView)) errors.push(`unknown_preferred_view:${item.metricKey}:${item.preferredView}`);
    for (const viewName of item.fallbackViews ?? []) {
      if (!viewNames.has(viewName)) errors.push(`unknown_fallback_view:${item.metricKey}:${viewName}`);
    }
    for (const alias of item.aliases) {
      const normalized = normalizeSemanticText(alias);
      const owner = aliasOwners.get(normalized);
      if (owner && owner !== item.metricKey) errors.push(`duplicate_alias:${normalized}:${owner}:${item.metricKey}`);
      aliasOwners.set(normalized, item.metricKey);
    }
  }
  return errors;
}

export function normalizeSemanticText(value: string) {
  return value.trim().toLowerCase().replace(/[\s，。！？?、；;：:（）()]+/g, '');
}

function contract(
  metricKey: string,
  label: string,
  aliases: string[],
  preferredView: string,
  dimensions: string[],
  answerShapes: AskDataSemanticAnswerShape[],
  staticData = false,
  priority = 10,
  fallbackViews: string[] = [],
): AskDataSemanticMetricContract {
  return {
    metricKey,
    label,
    aliases,
    preferredView,
    dimensions,
    answerShapes,
    defaultAnswerShape: answerShapes[0] ?? 'scalar',
    staticData,
    priority,
    fallbackViews,
  };
}
