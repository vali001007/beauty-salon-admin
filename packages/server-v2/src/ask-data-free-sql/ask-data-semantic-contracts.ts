import type { AskDataSemanticAnswerShape } from './ask-data-free-sql.types.js';

export type AskDataSemanticMetricContract = {
  metricKey: string;
  label: string;
  aliases: string[];
  preferredView: string;
  fallbackViews?: string[];
  supportingViews?: string[];
  dimensions: string[];
  answerShapes: AskDataSemanticAnswerShape[];
  defaultAnswerShape: AskDataSemanticAnswerShape;
  priority?: number;
  staticData?: boolean;
  negativeAliases: string[];
  negativePatterns: RegExp[];
  conflictsWith: string[];
  allowedClarificationSlots: Array<'year' | 'threshold' | 'entity_identity' | 'comparison_relation' | 'comparison_baseline' | 'time_point'>;
  defaultAssumptions: string[];
};

type AskDataMetricGovernance = Pick<
  AskDataSemanticMetricContract,
  'negativeAliases' | 'negativePatterns' | 'conflictsWith' | 'defaultAssumptions'
>;

const ASK_DATA_METRIC_GOVERNANCE: Partial<Record<string, Partial<AskDataMetricGovernance>>> = {
  order_revenue: {
    negativeAliases: ['日结', '收银汇总', '实收流水', '收款明细', '刷卡消费', '退款流水', '对账异常'],
    conflictsWith: ['daily_net_receipts', 'payment_flow', 'reconciliation_issue'],
  },
  payment_flow: {
    negativeAliases: ['营业额', '订单收入', '日结净收'],
    conflictsWith: ['order_revenue', 'daily_net_receipts'],
  },
  daily_net_receipts: {
    negativeAliases: ['营业额', '订单收入', '支付流水', '退款流水', '平不平', '对不上'],
    conflictsWith: ['order_revenue', 'payment_flow'],
  },
  product_sales: {
    negativeAliases: ['项目销量', '项目收入', '项目价格', '项目时长', '慢动销', '库存积压', '运营周转率'],
    conflictsWith: ['project_sales', 'project_catalog'],
  },
  project_sales: {
    negativeAliases: ['项目价格', '项目时长', '项目类型', '预约数量', '美容师服务次数', '已确认利润', '月结利润'],
    conflictsWith: ['project_catalog', 'reservation_metrics', 'staff_performance'],
  },
  project_catalog: {
    negativeAliases: ['项目销量', '项目收入', '预约数量'],
    conflictsWith: ['project_sales', 'reservation_metrics'],
  },
  inventory_on_hand: {
    negativeAliases: ['库存流水', '出库记录', '入库记录', '消耗特别快', '库存调拨', '库存报废', '报废金额', '报废商品', '报损', '次卡到期', '库存周转率', '还能用多久', '慢动销', '需求突然增加', '采购覆盖'],
    conflictsWith: ['inventory_movement', 'inventory_scrap', 'inventory_days_of_stock', 'inventory_operational_turnover', 'inventory_slow_moving', 'inventory_demand_change', 'inventory_procurement_coverage', 'transfer_status', 'card_assets'],
    defaultAssumptions: ['商品临期未指定窗口时，默认查询未来 30 天。'],
  },
  inventory_movement: {
    negativeAliases: ['当前库存', '还有多少库存', '安全库存', '库存调拨', '标准bom', '缺少标准', '库存周转率', '库存覆盖天数', '慢动销', '需求增长', '采购覆盖', '出库成本估算', '90天无出库', '90天没出库', '长期无出库', '一直有但没出库', '一直有但没有出库'],
    negativePatterns: [/(?:90|九十)天.*(?:没有|没|无)出库/, /(?:一直有|当前有库存|长期).*(?:没有|没|无)出库/],
    conflictsWith: ['inventory_on_hand', 'inventory_days_of_stock', 'inventory_operational_turnover', 'inventory_slow_moving', 'inventory_demand_change', 'inventory_procurement_coverage', 'transfer_status'],
  },
  inventory_scrap: {
    negativeAliases: ['当前库存', '安全库存', '库存价值', '库存流水', '库存调拨'],
    conflictsWith: ['inventory_on_hand', 'inventory_movement', 'transfer_status'],
  },
  card_assets: {
    negativeAliases: ['产品过期', '商品过期', '临期产品', '快过期的产品'],
    conflictsWith: ['inventory_on_hand'],
  },
  staff_performance: {
    negativeAliases: ['工作饱和度', '接待能力', '工时利用率'],
    conflictsWith: ['staff_capacity', 'project_sales'],
  },
  reservation_metrics: {
    negativeAliases: ['项目做得最多', '项目最受欢迎', '工作饱和度', '超过接待能力'],
    conflictsWith: ['project_sales', 'staff_capacity', 'appointment_gap'],
  },
  service_quality: {
    negativeAliases: ['工作饱和度', '超过接待能力', '预约空档'],
    conflictsWith: ['staff_capacity', 'reservation_metrics'],
  },
  staff_capacity: {
    negativeAliases: ['员工业绩', '员工提成', '服务质量'],
    conflictsWith: ['staff_performance', 'service_quality', 'reservation_metrics'],
  },
  operating_cost: {
    negativeAliases: ['利润率', '营销roi', '渠道roi', '归因收入'],
    conflictsWith: ['confirmed_profit', 'marketing_roi'],
  },
  confirmed_profit: {
    negativeAliases: ['成本明细', '费用结构', '固定成本', '变动成本', '渠道roi', '项目毛利', '项目利润贡献'],
    conflictsWith: ['operating_cost', 'marketing_roi'],
  },
  marketing_roi: {
    negativeAliases: ['经营成本', '固定成本', '变动成本', '月结利润'],
    conflictsWith: ['operating_cost', 'confirmed_profit', 'marketing_conversion'],
  },
  reconciliation_issue: {
    negativeAliases: ['营业额', '订单收入'],
    conflictsWith: ['order_revenue', 'payment_flow'],
  },
  inventory_days_of_stock: {
    conflictsWith: ['inventory_on_hand', 'inventory_movement'],
    defaultAssumptions: ['库存可用天数按当前库存除以最近 30 天日均出库量计算；最近 30 天无出库时返回空值。'],
  },
  inventory_operational_turnover: {
    conflictsWith: ['inventory_on_hand', 'inventory_movement'],
    defaultAssumptions: ['库存周转率采用近 30 天出库量除以库存事件加权平均库存的运营口径，不等同于财务会计库存周转率。'],
  },
  inventory_slow_moving: {
    conflictsWith: ['inventory_on_hand', 'product_sales'],
    defaultAssumptions: ['慢动销视图包含“90 天无出库”和“近 30 天运营周转率低于 0.5”两类治理状态；明确条件按本次问题精确过滤。'],
  },
  inventory_demand_change: {
    conflictsWith: ['inventory_movement'],
    defaultAssumptions: ['需求变化按最近 30 天出库量与前一个 30 天窗口比较；前期出库为 0 时变化率返回空值。'],
  },
  inventory_procurement_coverage: {
    conflictsWith: ['inventory_on_hand', 'procurement_detail'],
    defaultAssumptions: ['采购覆盖只展示安全库存、未完成采购和最近采购事实，不生成补货数量或采购建议。'],
  },
  inventory_outbound_usage: {
    conflictsWith: ['inventory_movement'],
    defaultAssumptions: ['自然月和自然季度用量使用对应日历周期累计；日均用量默认使用最近 30 天出库量除以 30。'],
  },
  inventory_outbound_cost_estimate: {
    conflictsWith: ['inventory_movement', 'operating_cost'],
    defaultAssumptions: ['耗材出库成本按商品档案成本估算，不代表批次实际采购成本或财务已确认材料成本。'],
  },
  procurement_detail: {
    negativeAliases: ['采购覆盖', '有消耗但没有采购', '低于安全库存但没采购', '低于安全库存且没有采购', '供应商报价', '最低采购量', '供应商账期', '换个供应商降低成本'],
    conflictsWith: ['inventory_procurement_coverage', 'supplier_latest_quote', 'supplier_price_comparison', 'supplier_minimum_order_quantity', 'supplier_payment_terms', 'supplier_lead_time'],
  },
  supplier_performance: {
    negativeAliases: ['最近报价', '供应商报价', '最低采购量', 'MOQ', '账期', '结算方式', '当前报价', '报价比较'],
    conflictsWith: ['supplier_latest_quote', 'supplier_price_comparison', 'supplier_minimum_order_quantity', 'supplier_payment_terms', 'supplier_lead_time'],
  },
  supplier_latest_quote: {
    negativeAliases: [
      '采购次数',
      '采购金额',
      '实际交付天数',
      '采购单',
      '报价交期',
      '预计交付天数',
      '最低报价',
      '报价最低',
      '报价比较',
      '更低报价',
      '报价差额',
      '账期',
      '最低采购量',
    ],
    negativePatterns: [/更低.*报价/, /报价.*差额/],
    conflictsWith: ['supplier_performance', 'procurement_detail'],
    defaultAssumptions: ['只读取当前门店商品映射的 active + approved 报价；报价不等于最终采购成交价。'],
  },
  supplier_price_comparison: {
    negativeAliases: ['采购金额', '采购次数', '实际交付表现'],
    conflictsWith: ['supplier_performance', 'procurement_detail'],
    defaultAssumptions: ['只比较同一门店商品的当前已审批报价；最低报价不代表质量或综合性价比最好。'],
  },
  supplier_minimum_order_quantity: {
    conflictsWith: ['supplier_performance', 'procurement_detail'],
    defaultAssumptions: ['最低采购量使用已审批报价中的 MOQ，不代表门店实际采购数量。'],
  },
  supplier_payment_terms: {
    conflictsWith: ['supplier_performance', 'procurement_detail'],
    defaultAssumptions: ['账期和结算方式来自供应商档案；空值表示后台未维护，不能推断。'],
  },
  supplier_lead_time: {
    negativeAliases: ['平均实际交付天数'],
    conflictsWith: ['supplier_performance', 'procurement_detail'],
    defaultAssumptions: ['报价交期是供应商当前报价中的预计 lead days，不等于历史实际交付天数。'],
  },
};

export const ASK_DATA_SEMANTIC_CONTRACTS: AskDataSemanticMetricContract[] = [
  contract('order_revenue', '订单经营收入', ['营业额', '订单收入', '订单金额', '订单净收', '开单净收入', '订单数', '客单价'], 'agent_v3_order_summary_view', ['date', 'customer', 'payment_method'], ['scalar', 'trend', 'comparison', 'ranking']),
  contract('product_sales', '商品销售', ['产品订单', '商品订单', '商品销量', '产品销量', '产品销售', '商品销售额', '商品排行', '商品卖出件数', '商品退款后销售额', 'sku销量', '卖得最好的产品', '产品动销', '商品动销', '动销分析'], 'agent_v3_order_item_sales_view', ['date', 'product', 'sku'], ['scalar', 'list', 'ranking', 'trend'], false, 20),
  contract('project_sales', '项目服务销售', ['项目订单', '项目销量', '项目销售', '项目收入', '项目毛利', '项目利润贡献', '服务次数', '项目排行', '最受欢迎项目', '项目最受欢迎', '最热门项目', '项目最热门'], 'agent_v3_project_service_sales_view', ['date', 'project'], ['scalar', 'list', 'ranking', 'trend'], false, 30),
  contract('payment_flow', '支付退款明细', ['实收流水', '支付流水', '支付记录', '收款记录', '退款流水', '退款记录', '退款明细', '售后退款', '退款原因', '支付方式', '现金收款', '储值收款', '收了多少钱', '收了多少现金', '储值卡消费'], 'agent_v3_payment_refund_view', ['date', 'payment_method', 'refund_reason'], ['scalar', 'list', 'ranking', 'trend'], false, 10, ['agent_v3_order_summary_view']),
  contract('daily_net_receipts', '日结净收', ['日结', '日结净收', '营业日净收', '每日净收', '每日收入', '收入汇总', '收银汇总', '结账金额', '净收趋势'], 'agent_v3_daily_settlement_view', ['date'], ['scalar', 'list', 'trend', 'comparison']),
  contract('inventory_on_hand', '商品库存', ['商品库存', '当前库存', '库存数量', '低库存', '库存不足', '安全库存', '库存金额', '效期', '缺货', '仓库库存', '库存价值', '可售商品'], 'agent_v3_product_inventory_view', ['product', 'sku'], ['scalar', 'list', 'ranking'], true),
  contract('inventory_movement', '库存流水', ['库存流水', '库存变化', '库存变动', '入库记录', '出库记录', '盘点记录', '出库数量', '消耗趋势', '耗材用量', '调拨出库流水'], 'agent_v3_stock_movement_view', ['date', 'product', 'movement_type'], ['scalar', 'list', 'ranking', 'trend']),
  contract('inventory_scrap', '库存报废', ['库存报废', '报废商品', '报废数量', '报废金额', '库存损失', '报损'], 'agent_v3_inventory_scrap_view', ['date', 'product', 'reason'], ['scalar', 'list', 'ranking', 'trend']),
  contract('inventory_days_of_stock', '库存可用天数', ['库存可用天数', '库存覆盖天数', '还能用多久', '还够用多久', '够用多少天', '可用多少天'], 'ask_data_inventory_turnover_view', ['product', 'product_category'], ['scalar', 'list', 'ranking'], true, 50),
  contract('inventory_operational_turnover', '库存运营周转率', ['库存周转率', '运营周转率', '周转率最低', '周转率情况', '库存周转情况'], 'ask_data_inventory_turnover_view', ['product', 'product_category'], ['scalar', 'list', 'ranking'], true, 50),
  contract('inventory_slow_moving', '慢动销与库存积压', ['慢动销', '库存积压', '积压太久', '长期没用', '一直有但不用', '一直有但没用', '没有动销', '进货太多导致积压', '90天无出库', '90天没出库', '长期无出库', '一直有但没出库', '一直有但没有出库'], 'ask_data_inventory_turnover_view', ['product', 'product_category', 'slow_moving_status'], ['list', 'ranking'], true, 50),
  contract('inventory_demand_change', '库存需求变化', ['库存需求变化', '需求突然增加', '需求明显增加', '消耗突然增加', '近期需求变化'], 'ask_data_inventory_turnover_view', ['product', 'product_category'], ['list', 'ranking', 'comparison'], true, 50),
  contract('inventory_procurement_coverage', '库存采购覆盖事实', ['采购覆盖', '快断货但还没采购', '低于安全库存但没采购', '低于安全库存且无在途采购', '一直消耗但没有采购', '没有在途采购'], 'ask_data_inventory_turnover_view', ['product', 'product_category', 'replenishment_status'], ['scalar', 'list', 'ranking'], true, 50),
  contract('inventory_outbound_usage', '库存期间出库用量', ['季度产品用量', '本季度产品用量', '本月产品用量', '每个产品用量', '日均耗材用量', '每天消耗多少耗材'], 'ask_data_inventory_turnover_view', ['product', 'product_category'], ['scalar', 'list', 'ranking'], true, 50),
  contract('inventory_outbound_cost_estimate', '耗材出库成本估算', ['每日平均耗材费用', '日均耗材费用', '日均耗材成本', '每天耗材成本', '耗材消耗成本估算'], 'ask_data_inventory_turnover_view', ['product', 'product_category'], ['scalar', 'list', 'ranking'], true, 50),
  contract('customer_profile', '客户行为与档案摘要', ['客户档案', '客户列表', '会员等级', '最近到店客户', '累计消费客户', '客户订单数', '沉睡客户', '好久没来', '没到店但还有未用次卡', '复购客户', '回头客', '客户来源', '客户价值分层', '生日客户', '快过生日', '次卡没使用', '办卡未预约', '消费频率下降'], 'ask_data_customer_profile_summary_view', ['customer', 'member_level', 'customer_status', 'source_channel', 'age_band', 'ltv_band'], ['scalar', 'list', 'ranking', 'comparison'], true),
  contract('staff_profile', '员工档案', ['员工档案', '员工列表', '美容师人数', '在职员工', '员工级别', '员工人数'], 'agent_v3_staff_profile_view', ['staff', 'staff_level'], ['scalar', 'list', 'ranking'], true),
  contract('staff_performance', '员工绩效', ['员工业绩', '员工绩效', '员工排行', '业绩排行', '业绩最好', '员工提成', '员工客单价', '员工服务次数', '人效', '接待客户最多', '进步最快'], 'ask_data_staff_performance_view', ['date', 'staff'], ['scalar', 'list', 'ranking', 'trend', 'comparison']),
  contract('reservation_metrics', '预约经营', ['预约情况', '预约数量', '预约列表', '非取消预约量', '全部预约', '下一个预约', '最后一个预约', '预约趋势', '预约取消率', '取消预约', '到店预约', '未确认预约', '待确认预约', '预约还没确认', '美容师预约', '服务流程安排'], 'agent_v3_reservation_view', ['date', 'staff', 'project', 'project_type', 'customer', 'status'], ['scalar', 'list', 'ranking', 'trend', 'comparison']),
  contract('marketing_conversion', '营销转化', ['营销转化', '触达转化', '转化数', '线索转化', '营销线索', '转化率', '活动归因收入'], 'agent_v3_marketing_conversion_view', ['date', 'channel', 'strategy'], ['scalar', 'list', 'ranking', 'trend']),
  contract('card_assets', '次卡资产', ['次卡资产', '卡项资产', '剩余次数', '未用完次卡', '未用完的次卡', '到期次卡', '过期次卡', '会员权益'], 'agent_v3_card_asset_view', ['customer', 'card', 'expiry_status'], ['scalar', 'list', 'ranking'], true),
  contract('card_usage', '次卡核销', ['次卡核销', '卡项核销', '核销次数', '划扣记录', '卡耗', '核销收入'], 'agent_v3_card_usage_view', ['date', 'customer', 'card', 'project'], ['scalar', 'list', 'ranking', 'trend']),
  contract('customer_balance', '客户余额', ['客户余额', '储值余额', '现金余额', '赠送余额', '余额排行'], 'agent_v3_customer_balance_view', ['customer'], ['scalar', 'list', 'ranking'], true),
  contract('service_quality', '服务质量', ['服务质量', '服务任务', '护理完成', '完成服务数量', '服务完成率', '未完成服务', '服务状态', '服务了几个客人'], 'agent_v3_service_quality_view', ['date', 'staff', 'project', 'status'], ['scalar', 'list', 'ranking', 'trend']),
  contract('appointment_gap', '预约空档', ['预约空档', '可用容量', '可用预约容量', '可加客容量', '空闲时段', '低峰时段', '邀约机会', '空档收入', '空档候选客户', '可以加客', '还能加客'], 'agent_v3_appointment_gap_view', ['date', 'time_slot'], ['scalar', 'list', 'ranking']),
  contract('project_catalog', '项目目录', ['项目目录', '项目价格', '服务价格', '价格最高的项目', '价格最低的项目', '项目时长', '服务时长', '项目类型', '护理周期', '疗程'], 'agent_v3_project_catalog_view', ['project', 'project_type'], ['scalar', 'list', 'ranking'], true, 20),
  contract('marketing_activity', '营销活动', ['营销活动', '活动列表', '活动状态', '参与人数', '发布状态', '正在发布的活动'], 'agent_v3_marketing_activity_view', ['date', 'activity', 'status'], ['scalar', 'list', 'ranking'], true),
  contract('marketing_automation', '自动触达', ['自动触达', '营销自动化', '自动化规则', '跟进任务', '触发类型任务量', '触达完成量', '触达状态', '最近执行'], 'agent_v3_marketing_automation_view', ['date', 'automation', 'status'], ['scalar', 'list', 'ranking', 'trend']),
  contract('promotion_offer', '优惠活动', ['优惠活动', '优惠券', '促销方案', '折扣活动', '优惠核销', '全局优惠', '仍有效优惠'], 'agent_v3_promotion_offer_view', ['date', 'offer', 'scope'], ['scalar', 'list', 'ranking'], true),
  contract('operating_cost', '经营成本', ['经营成本', '经营费用', '成本类别', '费用结构', '租金成本', '水电成本', '分摊方式'], 'ask_data_operating_cost_view', ['date', 'cost_category'], ['scalar', 'list', 'ranking', 'trend']),
  contract('procurement_detail', '采购明细', ['采购单', '采购明细', '采购记录', '采购到货', '采购单金额', '采购成本'], 'agent_v3_purchase_procurement_view', ['date', 'supplier', 'product', 'status'], ['scalar', 'list', 'ranking', 'trend']),
  contract('supplier_performance', '供应商表现', ['供应商表现', '供应商排行', '各供应商采购金额', '供应商采购金额', '采购次数', '平均交付天数'], 'agent_v3_supplier_performance_view', ['supplier'], ['scalar', 'list', 'ranking'], true, 20),
  contract('supplier_latest_quote', '供应商已审批报价', ['供应商报价', '最近报价', '最新报价', '上次报价', '当前报价', '每个供应商报价'], 'ask_data_supplier_quote_terms_view', ['product', 'product_category', 'supplier'], ['scalar', 'list', 'ranking'], true, 45),
  contract('supplier_price_comparison', '同商品供应商报价比较', ['比较供应商价格', '供应商价格比较', '两个供应商的价格', '哪个供应商报价低', '哪个报价最低', '更低的供应商报价', '换供应商降低成本', '换个供应商降低成本', '报价差额'], 'ask_data_supplier_quote_terms_view', ['product', 'product_category', 'supplier'], ['list', 'ranking', 'comparison'], true, 50),
  contract('supplier_minimum_order_quantity', '供应商最低采购量', ['最低采购量', '最小采购量', '起订量', 'MOQ', 'moq要求', '采购量要求'], 'ask_data_supplier_quote_terms_view', ['product', 'product_category', 'supplier'], ['scalar', 'list', 'ranking'], true, 45),
  contract('supplier_payment_terms', '供应商账期与结算方式', ['供应商账期', '账期怎么约定', '付款账期', '结算方式', '月结条款', '付款条件'], 'ask_data_supplier_quote_terms_view', ['supplier'], ['scalar', 'list', 'comparison'], true, 45),
  contract('supplier_lead_time', '供应商报价交期', ['供应商交期', '报价交期', '预计交付天数', '供货要几天', '交货周期'], 'ask_data_supplier_quote_terms_view', ['product', 'supplier'], ['scalar', 'list', 'ranking', 'comparison'], true, 45),
  contract('confirmed_profit', '已确认实际利润', ['实际利润', '经营利润', '营业利润', '已确认利润', '月结利润', '净利润', '毛利率', '经营利润率', '营业利润率'], 'ask_data_confirmed_profit_view', ['month'], ['scalar', 'list', 'trend', 'comparison']),
  contract('reconciliation_issue', '财务对账异常', ['财务对账', '对账异常', '账实差异', '财务异常', '不正常流水', '重复退款', '未处理异常', '最近一次对账'], 'ask_data_reconciliation_issue_view', ['date', 'issue_type', 'severity', 'status'], ['scalar', 'list', 'ranking', 'trend', 'comparison']),
  contract('member_liability', '会员履约负债', ['会员负债', '履约负债', '合同负债', '次卡负债', '储值负债', '赠送义务'], 'ask_data_member_liability_view', ['snapshot_date'], ['scalar', 'list', 'trend', 'comparison']),
  contract('staff_capacity', '排班与员工产能', ['排班产能', '员工产能', '可以接新单', '排班分钟', '工时利用率', '空闲分钟', '超排分钟', '预约分钟'], 'ask_data_staff_capacity_view', ['date', 'staff'], ['scalar', 'list', 'ranking', 'trend']),
  contract('transfer_status', '库存调拨', ['库存调拨', '调拨单', '调入状态', '调出状态', '未完成调拨', '跨店库存调拨'], 'ask_data_transfer_status_view', ['date', 'direction', 'counterparty_store', 'status'], ['scalar', 'list', 'ranking', 'trend']),
  contract('bom_variance', 'BOM 实际消耗偏差', ['bom偏差', '耗材偏差', '实际消耗偏差', '耗材偏差率', '用量偏离标准', '理论消耗', '标准用量', '异常消耗', '消耗异常', '标准缺失', '耗材浪费', '使用不规范'], 'ask_data_bom_consumption_variance_view', ['date', 'project', 'product', 'standard_status'], ['scalar', 'list', 'ranking', 'trend']),
  contract('customer_feedback', '客户反馈', ['客户反馈', '项目反馈', '客户投诉', '客诉', '满意度', '平均评分', '低评分反馈', '客户表扬', '客户建议', '严重反馈'], 'ask_data_customer_feedback_view', ['date', 'customer', 'staff', 'project', 'feedback_type', 'severity', 'status'], ['scalar', 'list', 'ranking', 'trend']),
  contract('customer_lifecycle', '客户生命周期', ['客户生命周期', '生命周期阶段', '流失风险', 'ltv档位', '客户机会', '未关闭机会', '机会类型', '机会评分', '最高优先级机会', '触达疲劳', '高价值客户'], 'ask_data_customer_lifecycle_view', ['customer', 'lifecycle_stage', 'ltv_band', 'risk_level', 'opportunity_type'], ['scalar', 'list', 'ranking'], true),
  contract('marketing_roi', '营销 ROI', ['营销roi', '营销投产', '投入产出', '活动花费', '权益吸引力', '渠道效果', '营销成本回报', '归因净收入', '渠道roi', '活动亏钱', '活动亏损'], 'ask_data_marketing_roi_view', ['date', 'activity', 'channel', 'strategy', 'offer', 'cost_source'], ['scalar', 'list', 'ranking', 'trend', 'comparison'], false, 20),
  contract('payment_customer_detail', '收款客户明细', ['第一笔收款是谁的', '首笔收款客户'], 'agent_v3_payment_refund_view', ['date', 'customer'], ['list', 'ranking'], false, 40, [], ['agent_v3_order_summary_view']),
  contract('inventory_usage_balance', '库存用量与结存', ['用了多少还剩多少', '消耗与结存'], 'agent_v3_stock_movement_view', ['date', 'product'], ['scalar', 'list'], false, 40, [], ['agent_v3_product_inventory_view']),
  contract('inventory_loss_rate', '库存损耗率', ['库存损耗率', '报废占出库比'], 'agent_v3_stock_movement_view', ['date', 'product'], ['scalar', 'trend', 'comparison'], false, 40),
  contract('payment_order_difference', '到账与开单差额', ['到账的钱和开单的钱差多少', '到账与开单差额'], 'agent_v3_daily_settlement_view', ['date'], ['scalar', 'comparison'], false, 40),
];

export const ASK_DATA_DIMENSION_ALIASES: Array<{ key: string; aliases: string[] }> = [
  { key: 'date', aliases: ['每天', '每日', '按日', '日期', '月份', '每月', '每个月', '逐月', '按月'] },
  { key: 'time_slot', aliases: ['时段', '时间段', '开始时间'] },
  { key: 'customer', aliases: ['客户', '会员', '顾客'] },
  { key: 'customer_status', aliases: ['新客', '老客', '回头客', '沉睡客户', '客户状态'] },
  { key: 'lifecycle_stage', aliases: ['生命周期阶段'] },
  { key: 'ltv_band', aliases: ['客户价值档位', 'ltv档位', '价值分层'] },
  { key: 'risk_level', aliases: ['流失风险等级', '流失风险'] },
  { key: 'opportunity_type', aliases: ['机会类型', '客户机会'] },
  { key: 'source_channel', aliases: ['来源', '来源渠道', '客户渠道'] },
  { key: 'age_band', aliases: ['年龄段', '客群年龄'] },
  { key: 'staff', aliases: ['员工', '美容师', '服务人员'] },
  { key: 'staff_level', aliases: ['员工级别', '员工职级', '职级', '级别'] },
  { key: 'operator', aliases: ['操作人'] },
  { key: 'project', aliases: ['项目', '护理', '服务项目'] },
  { key: 'project_type', aliases: ['项目类型', '项目分类'] },
  { key: 'product', aliases: ['商品', '产品', 'sku'] },
  { key: 'product_category', aliases: ['品类', '商品分类', '产品分类'] },
  { key: 'slow_moving_status', aliases: ['慢动销状态', '积压状态'] },
  { key: 'replenishment_status', aliases: ['采购覆盖状态', '补货事实状态'] },
  { key: 'card', aliases: ['次卡名称', '卡项名称', '次卡', '卡项'] },
  { key: 'supplier', aliases: ['供应商', '供货商'] },
  { key: 'channel', aliases: ['渠道', '来源渠道'] },
  { key: 'strategy', aliases: ['策略', '营销策略'] },
  { key: 'automation', aliases: ['自动化来源', '触达来源', '触发类型'] },
  { key: 'activity', aliases: ['活动', '营销活动'] },
  { key: 'status', aliases: ['状态', '进度'] },
  { key: 'promotion_type', aliases: ['优惠类型', '促销类型'] },
  { key: 'scope', aliases: ['全局优惠', '门店优惠', '优惠范围'] },
  { key: 'direction', aliases: ['调入', '调出', '方向'] },
  { key: 'counterparty_store', aliases: ['对方门店'] },
  { key: 'feedback_type', aliases: ['反馈类型'] },
  { key: 'payment_method', aliases: ['支付方式', '付款方式'] },
  { key: 'cost_category', aliases: ['成本类别', '费用类别', '成本科目', '费用科目'] },
];

export const ASK_DATA_SEMANTIC_PATTERNS: Record<string, RegExp[]> = {
  order_revenue: [/(?:^|[^产品商品项目])订单.*(?:多少|几笔|数量|金额|收入)/, /多少笔订单/, /跟上个月比收入|收入差多少/, /(?:营业额|订单收入|客单价|消费记录|消费明细)/],
  product_sales: [/产品.*订单/, /商品.*(?:销量|销售|订单|排行|卖出去|件数)/, /(?:产品|商品).*(?:扣掉退款|退款后).*卖了多少钱/, /(?:产品|商品).*动销|动销.*(?:产品|商品)|动销分析/, /卖得最好.*(?:产品|商品)|(?:产品|商品).*卖得最好/, /连带销售/, /各品类销售额/],
  project_sales: [/项目.*(?:订单(?:金额)?|销量|销售|收入|排行|毛利|利润贡献|贡献.*营收)/, /(?:哪个|哪些|各).*项目.*(?:受欢迎|热门|销量|毛利|利润贡献|贡献.*营收)/],
  payment_flow: [
    /实收流水/,
    /(?:今天|本月|这个月)?.*收了多少(?:钱|现金)/,
    /(?:现金|微信|支付宝|银行卡|刷卡|会员余额|储值).*(?:各|分别)(?:收|收了|收款|支付).*?多少/,
    /(?:现金|微信|支付宝|银行卡|刷卡|会员余额|储值).*收了多少.*(?:现金|微信|支付宝|银行卡|刷卡|会员余额|储值).*(?:各|分别)?多少/,
    /储值卡.*消费/,
    /大额退款/,
    /退款.*(?:几笔|多少|金额|记录|原因)/,
    /支付方式.*(?:金额|多少|分布)/,
  ],
  daily_net_receipts: [/订单量.*趋势/, /(?:日结|营业日.*净收|每日净收|每天的收入|收入汇总|收银汇总|结账金额|净收趋势)/],
  inventory_on_hand: [/(?:库存|存量|仓库).*(?:多少|数量|金额|货|价值|不足|缺货|效期)/, /(?:补水|防晒).*(?:产品|系列).*(?:库存|还有|多少)/, /只剩最后几瓶|现在有什么产品可以卖|还有多少库存|临期产品|临期库存|过期库存|哪些东西快没了|快过期的产品|产品快过期|\d+天内.*过期|多少天内.*过期|最容易过期/],
  inventory_movement: [
    /(?:消耗了多少|耗材消耗|消耗趋势|用量趋势|出库数量|入库数量|库存变化|库存变动|入库了多少货|出入库流水|调拨出库流水)/,
    /^(?!.*(?:偏差|异常|标准)).{2,40}(?:消耗|用量).*(?:趋势|走势)/,
  ],
  inventory_scrap: [/(?:报废|报损|库存损失)/],
  inventory_days_of_stock: [/(?:库存|耗材|产品|商品).*(?:还|能|够).*(?:用|支撑).*(?:多久|多少天)/, /(?:库存可用|库存覆盖|可用|够用)(?:多少)?天/],
  inventory_operational_turnover: [/(?:库存|产品|商品).*(?:运营)?周转率|(?:运营)?周转率.*(?:库存|产品|商品)|周转率(?:最低|情况|怎么样)/],
  inventory_slow_moving: [
    /(?:产品|商品|库存).*(?:积压|慢动销|长期没用|一直不用|一直没用|没有动销)/,
    /进货太多.*积压|一直有.*(?:不用|没用)|积压太久/,
    /(?:产品|商品|库存)?(?:一直有|当前有库存|有库存|长期).*(?:90|九十)天.*(?:没有|没|无)出库/,
    /(?:近|最近)?(?:90|九十)天(?:没有|没|无)出库.*(?:产品|商品|库存)?/,
  ],
  inventory_demand_change: [/(?:产品|商品|耗材).*(?:需求|消耗).*(?:突然|明显).*(?:增加|上升)/, /(?:需求|消耗).*(?:比|较).*(?:前\s*30\s*天|上个\s*30\s*天).*(?:增长|增加|上升).*(?:产品|商品|耗材)/, /最近.*(?:产品|商品|耗材).*需求.*变化/],
  inventory_procurement_coverage: [/(?:产品|商品).*(?:快断货|低于安全库存).*(?:没|未|无|没有).*(?:采购|在途)/, /(?:产品|商品).*(?:有消耗|一直消耗).*(?:没|未|无|没有).*采购(?:记录)?/, /一直.*消耗.*(?:没|未|无|没有).*采购|采购覆盖/],
  inventory_outbound_usage: [/(?:这|本)(?:季度|月).*(?:每个|各)(?:产品|商品).*(?:累计)?(?:出库)?(?:用量|消耗)/, /(?:每个|各)(?:产品|商品).*(?:这|本)(?:季度|月).*(?:累计)?(?:出库)?(?:用量|消耗)/, /(?:每天|日均).*(?:消耗|使用).*(?:耗材|产品|商品).*(?:多少|用量)/],
  inventory_outbound_cost_estimate: [/(?:每天|每日|日均|每日平均).*(?:耗材|出库).*(?:费用|成本)(?:估算)?/, /(?:耗材|出库).*(?:每天|每日|日均|每日平均).*(?:费用|成本)(?:估算)?/],
  customer_profile: [/(?:钻石|金卡|银卡|普通).*会员/, /会员.*(?:多少人|多少个|等级)/, /上次到店|最近到店|累计消费/, /到店的客户/, /(?:好久没来|三个月没来|45天没来|\d+天没到店|沉睡客户|只来一次|消费很多但突然消失)/, /没到店.*(?:未用|没用).*次卡/, /(?:新客|老客|回头客|复购率|平均多久回来|消费金额分.*层)/, /(?:生日|快过生日|来源渠道|年龄段)/, /(?:办了卡|开了次卡|买了次卡).*(?:没预约|不来|没使用)/, /消费了钱.*很少用次卡|卡里的次数快用完/, /消费频率.*下降/],
  staff_profile: [/(?:员工|美容师).*(?:职级|级别|档案|在职|人数)/, /(?:什么|哪个)职级/, /在职美容师/],
  staff_performance: [/(?:员工|美容师).*业绩/, /业绩.*(?:员工|美容师|榜单|排行|最好|进步)/, /(?:提成|人效|员工客单价)/, /(?:哪个|哪位).*美容师.*(?:客人最多|接待最多)/, /(?:各|每位)?(?:员工|美容师).*服务次数/],
  reservation_metrics: [/(?:预约).*(?:情况|数量|预约量|非取消预约量|多少|趋势|取消率|状态|列表|都有谁|哪些客户|客户有哪些|还没到店|还没来|还没确认|尚未确认|未确认|待确认|最多|最满|全部|下一个|最后一个)/, /(?:各项目|每个项目).*预约量/, /(?:时段).*(?:预约).*(?:最满|最多)/, /(?:预约|预订).*(?:项目|护理).*(?:客户|客人)/, /[\p{Script=Han}·]{2,4}(?:今年|本周末|这周末|本周|今天)?(?:的)?预约(?:是|在|几点|什么时候|安排|的是什么项目|有哪些|$)/u, /[\p{Script=Han}·]{2,4}(?:今年|本周末|这周末|本周|今天)?接了哪些预约/u, /下午还有几个预约|两点.*客人.*项目|服务流程安排|有(?:几|多少)个预约|有预约吗|到店人数/],
  marketing_conversion: [/(?:新增|多少).*线索/, /线索.*(?:多少|转化)/, /营销.*转化/, /活动.*(?:带来.*营收|归因.*收益|归因收入|参与转化)/, /触达.*客户.*转化/],
  card_assets: [/(?:次卡|卡项).*(?:剩余|未用完|没用完|到期|过期|资产|权益)/, /(?:未用完|没用完|未用|没用|有剩余).*次卡/],
  card_usage: [/(?:核销|划扣).*(?:次卡|卡项)/, /(?:次卡|卡项).*(?:核销|划扣|确认收入|收入进度)/, /确认收入.*(?:次卡|卡项)/, /次卡.*还没核销完/],
  customer_balance: [/(?:客户|会员|顾客).*(?:余额|储值)/, /(?:余额|储值).*(?:客户|会员|排行)/],
  service_quality: [/(?:服务任务|服务质量|护理完成|完成服务.*数量|服务完成率)/, /(?:今天)?谁服务了几个客人/],
  appointment_gap: [/(?:时段).*(?:还有空|空闲|空档|可以加客|可用预约容量)/, /(?:预约空档|空档时段|大量空档|可用容量|可加客容量|空档候选客户|还能加[一二两三四五六七八九十\d]+位客人)/, /预约密度.*(?:空位|空档)|哪里有空位/],
  project_catalog: [/(?:价格是多少|做一次要多久)/, /(?:多少个|哪些|所有).*项目/, /项目.*(?:价格|时长|类型|疗程|护理周期|推荐)/],
  marketing_activity: [/(?:活动).*(?:参与人数|数量|列表|清单|状态|发布|进行中)/],
  marketing_automation: [/(?:触达).*(?:成功率|完成量|状态|最近执行)/, /发出去多少条触达/, /触发类型.*(?:任务量|完成量)/, /自动化(?:规则|策略).*(?:运行|任务|完成)|营销自动化|自动触达/],
  promotion_offer: [/(?:优惠|优惠券|促销|折扣).*(?:活动|核销|发放|范围|有效)/],
  operating_cost: [/(?:各项成本|成本科目|成本明细|费用明细|费用结构|经营成本|人力成本|成本项目.*异常增加)/],
  procurement_detail: [/(?:采购).*(?:单|明细|记录|到货|在途|总额|成本|金额|趋势|变化|结算待付款)/, /发货在途/],
  supplier_performance: [/(?:各供应商|供应商).*(?:采购金额|采购次数|交付天数|表现|排行|合作最多|集中度|交货最稳定|交付最稳定)/],
  supplier_latest_quote: [
    /供应商.*(?:最近|最新|上次|当前).*报价/,
    /(?:最近|最新|上次|当前)报价.*供应商/,
    /(?:每个|各)供应商.*报价/,
  ],
  supplier_price_comparison: [
    /(?:比较|对比).*(?:两个|不同)?供应商.*(?:报价|价格)/,
    /供应商.*(?:报价|价格).*(?:比较|对比|最低|更低|差额|降低成本)/,
    /(?:最低报价|报价最低|哪个报价低|更低的供应商报价|报价差额)/,
    /换(?:个)?供应商.*降低成本/,
  ],
  supplier_minimum_order_quantity: [
    /(?:供应商|各品类|品类|商品|产品).*(?:最低采购量|最小采购量|起订量|moq)/i,
    /(?:最低采购量|最小采购量|起订量|moq).*(?:供应商|各品类|品类|商品|产品|要求)/i,
  ],
  supplier_payment_terms: [
    /供应商.*(?:账期|结算方式|付款条件|月结条款)/,
    /(?:账期|结算方式|付款条件|月结条款).*(?:供应商|怎么约定)/,
  ],
  supplier_lead_time: [
    /供应商.*(?:报价交期|预计交付天数|供货要几天|交货周期|交期).*(?:最短|最快|排名|排行)?/,
    /(?:报价交期|预计交付天数|供货要几天|交货周期).*(?:供应商|最短|最快)/,
  ],
  confirmed_profit: [/(?:实际利润|经营利润|营业利润|已确认利润|月结利润|毛利率|经营利润率|营业利润率|毛利是多少|耗材成本占了多少)/],
  reconciliation_issue: [/(?:对平|平不平|对不上|对得上|对账|账实差异|金额不一致|支付和金额|现金和系统数|漏收|多收|重复收费|重复退款|双计费|收款和系统记录|收款没有对应服务|不正常的流水|现金收入.*核对|财务数据.*异常)/],
  member_liability: [/(?:会员|储值|次卡|合同|履约|预付).*(?:负债|义务|还没使用|未使用)/],
  staff_capacity: [/(?:排班|产能利用率|团队.*产能|工时利用率|空闲分钟|超排|工作饱和度|接待能力|忙不过来|可以接新单)/],
  transfer_status: [/(?:调拨|调入|调出).*(?:状态|单|完成|未完成|商品数量)/, /对方门店.*调入/],
  bom_variance: [/(?:bom|耗材|实际消耗|实际用量|消耗|用量).*(?:偏差|偏离标准|标准用量|异常|标准缺失|理论消耗|差得多|浪费|使用不规范|最多)/i],
  customer_feedback: [/(?:客户|顾客|项目).*(?:反馈|投诉|满意度|评分|低评分|表扬|建议)/, /反馈.*(?:数量|平均评分|排行)/, /客诉|严重反馈|差评|负面反馈/],
  customer_lifecycle: [/(?:客户价值分层|价值分层预测|生命周期|流失风险|ltv|触达疲劳|客户机会|未关闭机会|机会评分)/i],
  marketing_roi: [/(?:roi|投产|投入产出|投入回报|获客成本|拓客成本|自动化策略.*转化|活动.*花了多少.*带来.*收入|活动.*(?:亏钱|亏损|赔钱|不赚钱)|权益.*吸引力|渠道效果|营销成本回报|归因净收入)/i],
  payment_customer_detail: [/(?:第一笔|首笔)收款.*(?:谁的|客户)/],
  inventory_usage_balance: [/用了多少.*还剩多少|消耗.*结存/],
  inventory_loss_rate: [/库存损耗率|报废.*出库.*比/],
  payment_order_difference: [/到账.*开单.*差多少|开单.*到账.*差额/],
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
    for (const viewName of item.supportingViews ?? []) {
      if (!viewNames.has(viewName)) errors.push(`unknown_supporting_view:${item.metricKey}:${viewName}`);
    }
    for (const alias of item.aliases) {
      const normalized = normalizeSemanticText(alias);
      const owner = aliasOwners.get(normalized);
      if (owner && owner !== item.metricKey) errors.push(`duplicate_alias:${normalized}:${owner}:${item.metricKey}`);
      aliasOwners.set(normalized, item.metricKey);
    }
    for (const metricKey of item.conflictsWith) {
      if (!ASK_DATA_SEMANTIC_CONTRACTS.some((candidate) => candidate.metricKey === metricKey)) {
        errors.push(`unknown_conflicting_metric:${item.metricKey}:${metricKey}`);
      }
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
  supportingViews: string[] = [],
): AskDataSemanticMetricContract {
  const governance = ASK_DATA_METRIC_GOVERNANCE[metricKey] ?? {};
  const allowedClarificationSlots: AskDataSemanticMetricContract['allowedClarificationSlots'] = ['year'];
  if (answerShapes.includes('ranking') || answerShapes.includes('list')) allowedClarificationSlots.push('threshold');
  if (dimensions.some((dimension) => ['customer', 'staff', 'project', 'product', 'supplier'].includes(dimension))) {
    allowedClarificationSlots.push('entity_identity');
  }
  if (answerShapes.includes('comparison')) allowedClarificationSlots.push('comparison_relation');
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
    supportingViews,
    negativeAliases: governance.negativeAliases ?? [],
    negativePatterns: governance.negativePatterns ?? [],
    conflictsWith: governance.conflictsWith ?? [],
    allowedClarificationSlots: [...new Set(allowedClarificationSlots)],
    defaultAssumptions: governance.defaultAssumptions ?? [],
  };
}
