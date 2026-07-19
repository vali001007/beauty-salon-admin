export type BrainCapabilityBoundaryStatus = 'system_unsupported' | 'system_supported_agent_gap';

export interface BrainCapabilityBoundaryMatch {
  code: string;
  status: BrainCapabilityBoundaryStatus;
  reason: string;
}

const RULES: ReadonlyArray<BrainCapabilityBoundaryMatch & { pattern: RegExp }> = [
  {
    code: 'coupon_redemption_lifecycle_not_available',
    status: 'system_unsupported',
    pattern: /优惠券.*(?:平均)?核销周期|(?:平均)?核销周期.*优惠券/,
    reason: '当前营销与订单数据没有统一记录优惠券发放时间、核销时间和券实例生命周期。',
  },
  {
    code: 'coupon_redemption_fact_not_connected',
    status: 'system_supported_agent_gap',
    pattern: /优惠券.*(?:核销了多少|核销数量|核销金额)|(?:核销了多少|核销数量|核销金额).*优惠券/,
    reason: '后台已有优惠券相关业务，但 Ami Brain 尚未接入优惠券实例核销数量和金额口径。',
  },
  {
    code: 'first_order_ltv_attribution_not_available',
    status: 'system_unsupported',
    pattern: /新客首单价格.*(?:长期|划算)|(?:降低|下调).*新客.*(?:价格|首单).*(?:长期|划算)/,
    reason: '当前系统没有首单价格实验、长期留存和客户终身价值的统一归因事实。',
  },
  {
    code: 'supplier_expiry_return_policy_not_available',
    status: 'system_unsupported',
    pattern: /供应商.*(?:临期|快过期).*(?:退换|退货|换货)|(?:临期|快过期).*(?:退换|退货|换货).*供应商/,
    reason: '当前采购业务没有供应商临期退换政策和退货索赔闭环。',
  },
  {
    code: 'supplier_score_definition_not_available',
    status: 'system_unsupported',
    pattern: /供应商.*(?:性价比|质量最好|最稳定)|(?:性价比|质量最好|最稳定).*供应商/,
    reason: '当前采购业务没有统一的供应商质量、交付、价格和售后评分口径。',
  },
  {
    code: 'material_substitution_definition_not_available',
    status: 'system_unsupported',
    pattern: /(?:替代品|替代耗材).*(?:降低|节省).*(?:成本)|(?:降低|节省).*(?:耗材|物料)成本.*替代/,
    reason: '当前商品与项目数据没有受治理的耗材替代关系、效果等价和禁忌约束。',
  },
  {
    code: 'complimentary_amount_definition_not_available',
    status: 'system_unsupported',
    pattern: /(?:免单|赠送).*(?:多少|金额)|(?:多少|金额).*(?:免单|赠送)/,
    reason: '当前订单与优惠数据没有统一区分免单、赠送和普通折扣的金额事实。',
  },
  {
    code: 'refund_commission_attribution_not_available',
    status: 'system_unsupported',
    pattern: /退款.*(?:影响|冲减).*(?:员工|美容师).*(?:提成)|(?:员工|美容师).*(?:提成).*(?:退款|冲减)/,
    reason: '当前退款记录没有稳定关联到员工提成冲减和责任归因。',
  },
  {
    code: 'staff_salary_cost_fact_not_available',
    status: 'system_unsupported',
    pattern: /员工.*(?:工资|薪资).*(?:提成).*(?:收入|比例)|(?:工资|薪资).*(?:占|比例).*(?:收入|营收)/,
    reason: '当前财务事实没有员工工资、薪资期间和实收收入的统一归集口径。',
  },
  {
    code: 'service_skin_change_record_not_available',
    status: 'system_unsupported',
    pattern:
      /(?:服务中|护理中|这次护理).*(?:皮肤状态|皮肤问题|明显变化).*(?:怎么记录|如何记录|记录和处理)|(?:记录).*(?:皮肤状态变化|皮肤问题)/,
    reason: '当前服务任务没有面向美容师的结构化皮肤状态变化记录闭环。',
  },
  {
    code: 'active_customer_care_goal_context_not_connected',
    status: 'system_supported_agent_gap',
    pattern: /这个客人.*(?:护肤目标|护理目标).*(?:制定|方案)|(?:护肤目标|护理目标).*(?:怎么制定|如何制定).*(?:方案)/,
    reason: '后台已有客户档案和测肤事实，但 Ami Brain 尚未接入当前服务客户身份与护理目标的受控上下文。',
  },
  {
    code: 'personal_revenue_rank_not_connected',
    status: 'system_supported_agent_gap',
    pattern: /我.*(?:业绩|服务收入).*(?:排名第几|排第几)|(?:排名第几|排第几).*(?:我的|我).*(?:业绩|服务收入)/,
    reason: '后台已有个人业绩和员工表现数据，但 Ami Brain 尚未发布按同一业绩口径计算个人名次的能力。',
  },
  {
    code: 'expiry_discount_policy_not_available',
    status: 'system_unsupported',
    pattern: /临期.*(?:优惠力度|折扣力度|打几折)|(?:优惠力度|折扣力度|打几折).*临期/,
    reason: '当前系统没有结合临期批次成本、剩余保质期、门店毛利红线和合规规则的统一折扣决策口径。',
  },
  {
    code: 'daily_material_category_consumption_not_connected',
    status: 'system_supported_agent_gap',
    pattern: /(?:每天|日均).*(?:清洁类|耗材|物料).*(?:消耗|用量)|(?:每天|日均).*(?:消耗|用量).*(?:清洁类|耗材|物料)/,
    reason: '后台已有库存与服务耗材事实，但 Ami Brain 尚未接入按耗材分类折算日均实际消耗的能力。',
  },
  {
    code: 'payment_service_reconciliation_not_connected',
    status: 'system_supported_agent_gap',
    pattern: /(?:收款|支付).*(?:没有|未).*(?:服务记录|履约记录)|(?:服务记录|履约记录).*(?:没有|未).*(?:收款|支付)/,
    reason: '后台已有订单、支付和服务记录，但 Ami Brain 尚未接入支付与履约逐笔对账能力。',
  },
  {
    code: 'refund_detail_report_not_connected',
    status: 'system_supported_agent_gap',
    pattern: /退款.*(?:明细|报告)/,
    reason: '后台已有退款记录，但 Ami Brain 尚未接入退款明细报告能力。',
  },
  {
    code: 'cash_reconciliation_not_connected',
    status: 'system_supported_agent_gap',
    pattern: /现金收入.*(?:核对|对账)|(?:核对|对账).*(?:现金收入|现金收款)/,
    reason: '后台已有收银班次和对账数据，但 Ami Brain 尚未接入现金对账结论能力。',
  },
  {
    code: 'arbitrary_audience_send_not_connected',
    status: 'system_supported_agent_gap',
    pattern: /(?:找|筛选).*(?:客户).*(?:然后|并且|再).*(?:发|发送).*(?:消息|短信|召回)/,
    reason: '后台已有客户查询和营销触达，但任意查询结果尚不能直接转换为受治理客群并发送，当前只能先形成客群或策略预览。',
  },
  {
    code: 'staff_incentive_cost_recommendation_not_connected',
    status: 'system_supported_agent_gap',
    pattern: /员工积极性.*提成成本|提成成本.*员工积极性/,
    reason: '后台已有员工表现和提成事实，但 Ami Brain 尚未接入兼顾激励效果与提成成本的治理策略能力。',
  },
  {
    code: 'marketing_automation_effect_not_connected',
    status: 'system_supported_agent_gap',
    pattern: /自动化规则.*(?:运行|效果)|(?:哪些|现在).*(?:自动化规则).*(?:效果|怎么样)/,
    reason: '后台已有营销策略运行状态，但 Ami Brain 尚未接入按自动化规则归因触达、转化和收入效果的能力。',
  },
  {
    code: 'service_completion_auto_message_not_connected',
    status: 'system_supported_agent_gap',
    pattern: /(?:每次|每回|每当).*(?:服务|护理).*(?:结束|完成).*(?:自动).*(?:发|发送).*(?:感谢|消息)|(?:服务|护理).*(?:结束|完成).*(?:自动).*(?:感谢|消息)/,
    reason: '后台已有服务完成与跟进任务事实，但尚未发布“服务完成后自动发送感谢消息”的受治理触发规则、渠道和送达回执合同。',
  },
  {
    code: 'marketing_automation_rule_publish_not_open',
    status: 'system_supported_agent_gap',
    pattern:
      /客户.*45天.*(?:自动).*(?:提醒|发消息)|(?:自动).*(?:快过期|即将过期).*(?:次卡|卡项).*(?:发消息|提醒)|(?:快过期|即将过期).*(?:次卡|卡项).*(?:自动).*(?:发消息|提醒)|(?:次卡|卡项).*(?:快过期|即将过期).*(?:自动).*(?:发消息|提醒)|(?:客户|会员).*(?:生日).*(?:自动).*(?:送|赠送|发放).*(?:礼物|礼品|权益)|新客.*(?:三天后|3天后).*(?:自动).*(?:跟进|提醒)|(?:疗程|次卡|卡项).*(?:快结束|即将结束).*(?:自动).*(?:提醒|续购|续卡)/,
    reason: '后台能识别客户生命周期、卡项到期和生日等触发条件，也能生成规则预览，但自动化规则发布、渠道发送、触达冷却、失败恢复和回执合同尚未开放。',
  },
  {
    code: 'active_customer_care_plan_change_context_not_connected',
    status: 'system_supported_agent_gap',
    pattern:
      /(?:客人|客户).*(?:想|要求|提出).*(?:改变|调整|更换).*(?:护理方案|护理方向).*(?:沟通|怎么说|怎么办|怎么分析|如何分析|分析)|(?:这个|这位)(?:客人|客户).*(?:改变|调整|更换).*(?:护理方案|护理方向)/,
    reason: '后台已有客户档案和护理项目，但 Ami Brain 尚未接入当前服务客户身份、现行护理方案和变更原因的受控上下文。',
  },
  {
    code: 'stored_value_aging_risk_not_connected',
    status: 'system_supported_agent_gap',
    pattern:
      /(?:长期|很久).*(?:未消耗|没消耗|未使用|没使用).*(?:大额)?(?:储值|余额)|(?:大额)(?:储值|余额).*(?:长期|很久).*(?:未消耗|没消耗|未使用|没使用)/,
    reason: '后台已有客户储值余额和消费记录，但 Ami Brain 尚未发布按充值批次、最近消耗时间和金额阈值计算长期未消耗大额储值名单的统一口径。',
  },
  {
    code: 'break_even_definition_not_available',
    status: 'system_unsupported',
    pattern: /盈亏平衡点|(?:每月|每个月|月度).*(?:至少|最低).*(?:收入|营收).*(?:盈亏平衡|保本)|(?:至少|最低).*(?:收入|营收).*(?:保本|不亏)/,
    reason: '当前财务定义没有统一发布固定成本、变动成本率和目标利润口径，无法可靠计算门店月度盈亏平衡收入。',
  },
  {
    code: 'staff_emotion_revenue_attribution_not_available',
    status: 'system_unsupported',
    pattern: /(?:员工|美容师).*(?:情绪不好|情绪低落|心情不好).*(?:营业额|营收|收入|服务).*(?:关系|影响)|(?:营业额|营收|收入).*(?:下滑|下降).*(?:员工|美容师).*(?:情绪|心情)/,
    reason: '当前员工档案没有结构化情绪事实，也没有员工情绪与服务质量、营业额之间的因果归因口径。',
  },
  {
    code: 'material_consumption_per_customer_not_connected',
    status: 'system_supported_agent_gap',
    pattern: /平均.*(?:每个|每位).*(?:客人|客户).*(?:消耗|使用).*(?:耗材|物料)|(?:人均|客均).*(?:耗材|物料).*(?:消耗|用量)/,
    reason: '后台已有服务任务和耗材记录，但 Ami Brain 尚未发布按客户关联实际耗材并计算人均消耗的完整口径。',
  },
  {
    code: 'bulk_customer_consumption_export_not_connected',
    status: 'system_supported_agent_gap',
    pattern: /(?:列出|导出|查看).*(?:所有|全部).*(?:客户|会员).*(?:消费明细|消费记录|消费流水)/,
    reason: '后台已有客户消费记录，但聊天能力尚未接入全量客户消费明细的分页、导出、敏感字段收口和审计下载合同。',
  },
];

export function matchBrainCapabilityBoundary(question: string): BrainCapabilityBoundaryMatch | undefined {
  const normalized = question.trim();
  const rule = RULES.find((item) => item.pattern.test(normalized));
  if (!rule) return undefined;
  return { code: rule.code, status: rule.status, reason: rule.reason };
}
