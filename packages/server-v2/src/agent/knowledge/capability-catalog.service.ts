import { Injectable } from '@nestjs/common';
import { ActionOntologyService } from './action-ontology.service.js';
import type { AgentCapabilityDefinition, CapabilityResolutionInput, CapabilityResolutionResult } from './knowledge.types.js';

export const AGENT_CAPABILITY_CATALOG: AgentCapabilityDefinition[] = [
  {
    capabilityId: 'finance.order.lookup',
    businessQueryCapabilityId: 'finance_order_lookup',
    displayName: '订单流水查询',
    description: '根据订单号、收银组号或客户线索查询订单、支付和退款摘要。',
    personaCodes: ['manager', 'finance', 'reception'],
    objectTypes: ['Order'],
    actions: ['lookup', 'summary', 'print'],
    requiredEntities: ['Order'],
    outputKinds: ['order_card', 'evidence_panel'],
    riskLevel: 'low',
    examples: ['查一下订单 PO202606300001', '这个收银单明细', '打印这笔订单'],
    negativeExamples: ['这个月营业额', '今天所有订单列表'],
    triggerKeywords: ['订单号', '收银单', '收银组号', '小票', '票据', '打印'],
  },
  {
    capabilityId: 'reception.member_card.lookup',
    businessQueryCapabilityId: 'member_card_lookup',
    displayName: '客户卡项查询',
    description: '根据客户卡项实体查询剩余次数、到期和核销摘要。',
    personaCodes: ['manager', 'reception'],
    objectTypes: ['MemberCard'],
    actions: ['lookup', 'summary', 'diagnose'],
    requiredEntities: ['MemberCard'],
    outputKinds: ['member_card_summary', 'evidence_panel'],
    riskLevel: 'low',
    examples: ['水光卡还剩几次', '张雯的疗程卡状态', '这张卡什么时候到期'],
    negativeExamples: ['卡项销售排行榜', '会员卡沉淀资金'],
    triggerKeywords: ['卡项', '会员卡', '次卡', '疗程卡', '剩余次数', '权益'],
  },
  {
    capabilityId: 'marketing.activity.link.lookup',
    businessQueryCapabilityId: 'marketing_activity_link_lookup',
    displayName: '营销活动链接查询',
    description: '根据营销活动或推广页实体查询活动链接、小程序路径和二维码。',
    personaCodes: ['manager', 'marketing', 'reception'],
    objectTypes: ['MarketingActivity', 'MarketingPage'],
    actions: ['get_link'],
    requiredEntities: ['MarketingActivity'],
    optionalEntities: ['MarketingPage'],
    outputKinds: ['link_card', 'evidence_panel'],
    riskLevel: 'low',
    examples: ['老朋友回店护理礼活动链接发我', '这个活动二维码在哪里', '把回店礼小程序路径发我'],
    negativeExamples: ['最近做得好的护理项目', '肩颈护理服务次数怎么样'],
    triggerKeywords: ['活动链接', '二维码', '小程序路径', '推广页', '分享链接', '回店礼'],
  },
  {
    capabilityId: 'marketing.activity.list',
    businessQueryCapabilityId: 'marketing_activity_list',
    queryTemplateId: 'marketing_activity_list',
    displayName: '营销活动清单',
    description: '查询近期营销活动、草稿、已发布活动和进行中活动清单。',
    personaCodes: ['manager', 'marketing', 'reception'],
    objectTypes: ['MarketingActivity'],
    actions: ['list', 'recommend', 'lookup'],
    requiredEntities: [],
    outputKinds: ['table', 'evidence_panel'],
    riskLevel: 'low',
    examples: ['推荐近期营销活动', '近期有哪些营销活动', '列出正在进行的活动'],
    negativeExamples: ['活动链接发我', '客户召回名单', '今天有哪些预约', 'Ami Aura 最近有哪些失败问题'],
    triggerKeywords: ['营销活动', '推广活动', '优惠活动', '回店活动', '活动清单', '进行中活动', '已发布活动', '活动列表', '活动推荐'],
  },
  {
    capabilityId: 'marketing.customer.recall.list',
    businessQueryCapabilityId: 'customer_growth_opportunity',
    displayName: '客户召回清单',
    description: '查询需要召回、回访、复购承接的客户清单和优先级。',
    personaCodes: ['manager', 'marketing', 'reception', 'beautician'],
    objectTypes: ['Customer'],
    actions: ['list', 'recommend', 'diagnose'],
    requiredEntities: [],
    outputKinds: ['table', 'evidence_panel', 'action_card'],
    riskLevel: 'medium',
    examples: ['请列出10个需要紧急召回的客户', '哪些客户适合召回', '需要回访的高价值客户'],
    negativeExamples: ['张雯客户档案', '张雯今天有哪些预约'],
    triggerKeywords: [
      '召回',
      '回访',
      '流失',
      '沉睡',
      '复购',
      '跟进',
      '老客',
      '高消费',
      '激活',
      '触达',
      '复购承接',
      '回店名单',
      '顾问联系',
      '联系客户',
      '发回店礼',
      '回店活动触达',
      '先联系',
    ],
  },
  {
    capabilityId: 'project.service.trend',
    businessQueryCapabilityId: 'project_service_trend',
    displayName: '项目服务趋势',
    description: '查询护理项目服务次数、收入和趋势。',
    personaCodes: ['manager', 'reception', 'beautician'],
    objectTypes: ['Project'],
    actions: ['lookup', 'list', 'analyze', 'diagnose'],
    requiredEntities: [],
    outputKinds: ['table', 'evidence_panel'],
    riskLevel: 'low',
    examples: ['最近做得好的护理项目', '肩颈护理最近卖得好吗', '本月服务项目排行'],
    negativeExamples: ['老朋友回店护理礼活动链接发我', '推荐近期营销活动', '今天有哪些预约'],
    triggerKeywords: ['护理项目', '服务项目', '服务次数', '项目趋势', '卖得好', '做得好'],
  },
  {
    capabilityId: 'product.sales.trend',
    businessQueryCapabilityId: 'product_sales_trend',
    displayName: '商品销量趋势',
    description: '查询商品销量、销售额、订单数、客户数和环比增长。',
    personaCodes: ['manager', 'reception'],
    objectTypes: ['InventoryProduct', 'Order'],
    actions: ['summary', 'list', 'analyze', 'compare'],
    requiredEntities: [],
    outputKinds: ['table', 'evidence_panel'],
    riskLevel: 'low',
    examples: ['最近销量好的商品有哪些', '补水精华销量趋势', '本月商品销售排行'],
    negativeExamples: ['哪些商品需要补货', '一次性丁腈手套库存还够吗'],
    triggerKeywords: ['销量', '销售排行', '商品销售', '卖得好', '销售额', '产品销量'],
  },
  {
    capabilityId: 'product.customer.distribution',
    businessQueryCapabilityId: 'product_customer_distribution',
    displayName: '商品购买客户分布',
    description: '基于商品结果或商品实体查询购买客户、订单数、购买数量和最近购买时间。',
    personaCodes: ['manager', 'reception'],
    objectTypes: ['InventoryProduct', 'Customer', 'Order'],
    actions: ['list', 'summary', 'analyze'],
    requiredEntities: [],
    outputKinds: ['table', 'evidence_panel'],
    riskLevel: 'medium',
    examples: ['这些商品有哪些客户买过', '补水精华购买客户分布', '谁买过这个产品'],
    negativeExamples: ['商品销量排行', '客户召回名单'],
    triggerKeywords: ['购买客户', '谁买过', '买过这个', '客户分布', '购买分布'],
  },
  {
    capabilityId: 'customer.profile.lookup',
    businessQueryCapabilityId: 'customer_profile_lookup',
    displayName: '客户档案查询',
    description: '根据客户实体查询客户基础信息、消费和跟进摘要。',
    personaCodes: ['manager', 'reception', 'beautician'],
    objectTypes: ['Customer'],
    actions: ['lookup'],
    requiredEntities: ['Customer'],
    outputKinds: ['customer_card', 'evidence_panel'],
    riskLevel: 'low',
    examples: ['张雯客户档案', '查一下这个客户', '刘思琪消费情况'],
    negativeExamples: ['客户召回名单', '哪些客户需要跟进'],
    triggerKeywords: ['客户档案', '客户详情', '消费情况', '会员资料'],
  },
  {
    capabilityId: 'reception.customer.reservation_today',
    businessQueryCapabilityId: 'customer_reservation_today',
    displayName: '客户今日预约查询',
    description: '根据客户实体查询今日预约、项目、美容师和预约状态。',
    personaCodes: ['manager', 'reception', 'beautician'],
    objectTypes: ['Customer'],
    actions: ['list', 'lookup'],
    requiredEntities: ['Customer'],
    outputKinds: ['reservation_table', 'evidence_panel'],
    riskLevel: 'low',
    examples: ['张雯今天有哪些预约', '这个客户今天有没有预约', '刘思琪今日预约'],
    negativeExamples: ['今天全店有哪些预约', '今日预约客户清单'],
    triggerKeywords: ['客户预约', '今日预约', '今天预约', '预约记录'],
  },
  {
    capabilityId: 'reception.customer.card_benefit.summary',
    businessQueryCapabilityId: 'customer_card_benefit_summary',
    displayName: '客户卡项权益摘要',
    description: '根据客户实体查询持有卡项、余额、权益和可核销项目。',
    personaCodes: ['manager', 'reception'],
    objectTypes: ['Customer', 'MemberCard'],
    actions: ['lookup', 'summary'],
    requiredEntities: ['Customer'],
    outputKinds: ['card_benefit_summary', 'evidence_panel'],
    riskLevel: 'low',
    examples: ['张雯还有什么卡和权益', '这个客户卡项状态', '客户还有几次护理'],
    negativeExamples: ['卡项销售排行榜', '卡项核销趋势'],
    triggerKeywords: ['卡和权益', '客户权益', '卡项状态', '可核销项目'],
  },
  {
    capabilityId: 'inventory.product.stock.lookup',
    businessQueryCapabilityId: 'inventory_alert',
    displayName: '库存商品状态查询',
    description: '根据库存商品实体查询当前库存、安全库存、临期和补货风险。',
    personaCodes: ['manager', 'inventory', 'reception'],
    objectTypes: ['InventoryProduct'],
    actions: ['lookup', 'diagnose', 'recommend', 'summary'],
    requiredEntities: ['InventoryProduct'],
    outputKinds: ['inventory_status_card', 'evidence_panel'],
    riskLevel: 'low',
    examples: ['一次性丁腈手套库存还够吗', '补水精华还有多少库存', '这个耗材要不要补货'],
    negativeExamples: ['商品销量排行榜', '哪些卡快到期了'],
    triggerKeywords: ['库存', '库存商品', '耗材', '补货', '安全库存', '低库存', '缺货'],
  },
  {
    capabilityId: 'inventory.expiring.list',
    businessQueryCapabilityId: 'inventory_alert',
    displayName: '临期库存清单',
    description: '查询临期、即将过期、低库存和缺货商品清单。',
    personaCodes: ['manager', 'inventory', 'reception'],
    objectTypes: ['InventoryProduct'],
    actions: ['lookup', 'list', 'diagnose', 'recommend', 'summary'],
    requiredEntities: [],
    outputKinds: ['table', 'evidence_panel', 'action_card'],
    riskLevel: 'low',
    examples: ['近期有哪些临期库存产品', '列出临期库存清单', '哪些产品快过期了'],
    negativeExamples: ['一次性丁腈手套库存还够吗', '商品销量排行', '哪些卡快到期了'],
    triggerKeywords: ['临期', '过期', '到期', '临期库存', '临期产品', '快过期', '库存预警', '低库存', '缺货产品'],
  },
  {
    capabilityId: 'manager.staff.performance.rank',
    businessQueryCapabilityId: 'staff_performance',
    displayName: '员工绩效表现查询',
    description: '根据美容师实体或员工问题查询业绩、服务量、提成和表现。',
    personaCodes: ['manager', 'beautician'],
    objectTypes: ['Beautician'],
    actions: ['lookup', 'summary', 'list', 'diagnose'],
    requiredEntities: [],
    outputKinds: ['staff_performance_card', 'table', 'evidence_panel'],
    riskLevel: 'medium',
    examples: ['宋乔这个月业绩怎么样', '本月员工表现排行', '哪个美容师表现最好'],
    negativeExamples: ['客户预约查询', '排班空闲情况'],
    triggerKeywords: ['员工表现', '美容师表现', '业绩排行', '绩效排行', '提成', '服务量'],
  },
  {
    capabilityId: 'finance.revenue.summary',
    businessQueryCapabilityId: 'order_revenue_analysis',
    displayName: '收入流水 KPI 查询',
    description: '查询营业额、收入、流水、订单数、客单价等经营 KPI。',
    personaCodes: ['manager', 'finance'],
    objectTypes: ['Order'],
    actions: ['summary', 'compare'],
    requiredEntities: [],
    outputKinds: ['kpi', 'table', 'evidence_panel'],
    riskLevel: 'low',
    examples: ['这个月营业额', '本月营收', '今日收入', '昨天流水', '这个月客单价'],
    negativeExamples: ['查一下订单 PO202606300001', '客户召回名单'],
    triggerKeywords: ['营业额', '营收', '收入', '流水', '客单价', '订单数', '现金收入', '实收', '金额'],
  },
  {
    capabilityId: 'finance.today.transaction.list',
    businessQueryCapabilityId: 'finance_today_transaction_list',
    displayName: '今日交易订单清单',
    description: '查询今日收银、核销、办卡、充值、退款等交易订单列表，并支持生成打印预览。',
    personaCodes: ['manager', 'finance', 'reception'],
    objectTypes: ['Order'],
    actions: ['list', 'print'],
    requiredEntities: [],
    outputKinds: ['table', 'action_card', 'evidence_panel'],
    riskLevel: 'medium',
    examples: ['列出今天所有收银、核销、办卡订单列表，支持打印操作', '今天收银和核销订单清单', '今日办卡充值订单列表'],
    negativeExamples: ['这个月营业额', '查一下订单 PO202606300001'],
    triggerKeywords: ['今日交易', '今天收银', '核销订单', '办卡订单', '充值订单', '打印清单'],
  },
  {
    capabilityId: 'finance.profit.diagnosis',
    businessQueryCapabilityId: 'finance_cashflow_summary',
    displayName: '利润毛利诊断',
    description: '查询利润、毛利、毛利率和下降原因，给出财务风险解释。',
    personaCodes: ['manager', 'finance'],
    objectTypes: ['Order'],
    actions: ['diagnose', 'summary', 'compare'],
    requiredEntities: [],
    outputKinds: ['kpi', 'table', 'evidence_panel'],
    riskLevel: 'medium',
    examples: ['本月利润为什么下降', '这个月毛利率怎么样', '毛利下降原因'],
    negativeExamples: ['打印收银单', '客户卡项权益'],
    triggerKeywords: ['利润', '毛利', '毛利率', '成本', '费用', '下降原因'],
  },
  {
    capabilityId: 'project.material.margin',
    businessQueryCapabilityId: 'project_material_margin',
    displayName: '项目耗材毛利',
    description: '按项目价格、BOM 标准用量和商品成本估算项目耗材成本与毛利空间。',
    personaCodes: ['manager'],
    objectTypes: ['Project', 'InventoryProduct', 'FinanceMetric'],
    actions: ['summary', 'analyze', 'diagnose'],
    requiredEntities: [],
    outputKinds: ['kpi', 'table', 'evidence_panel'],
    riskLevel: 'medium',
    examples: ['项目耗材毛利', '哪些项目耗材成本高', '项目毛利空间怎么样'],
    negativeExamples: ['本月利润为什么下降', '库存补货建议'],
    triggerKeywords: ['项目耗材', '耗材毛利', '项目成本', '项目毛利', 'BOM成本', '耗材成本'],
  },
  {
    capabilityId: 'member.balance.analysis',
    businessQueryCapabilityId: 'member_balance_analysis',
    displayName: '会员卡余额分析',
    description: '查询储值余额、充值金额、沉淀资金和会员资产风险。',
    personaCodes: ['manager', 'reception'],
    objectTypes: ['MemberCard', 'FinanceMetric'],
    actions: ['summary', 'analyze', 'diagnose'],
    requiredEntities: [],
    outputKinds: ['kpi', 'table', 'evidence_panel'],
    riskLevel: 'medium',
    examples: ['会员卡余额沉淀资金', '储值余额还有多少', '会员资产风险'],
    negativeExamples: ['张雯还有什么卡和权益', '卡项核销趋势'],
    triggerKeywords: ['储值余额', '会员卡余额', '沉淀资金', '会员资产', '充值余额'],
  },
  {
    capabilityId: 'manager.business.overview',
    businessQueryCapabilityId: 'business_overview',
    displayName: '门店经营概览',
    description: '查询今日或指定时间范围内的收入、预约、客户、库存和风险摘要。',
    personaCodes: ['manager'],
    objectTypes: ['BusinessOverview'],
    actions: ['summary', 'diagnose', 'recommend'],
    requiredEntities: [],
    outputKinds: ['kpi', 'risk_card', 'evidence_panel'],
    riskLevel: 'medium',
    examples: ['今天我应该重点关注什么', '今日经营概览', '最近一个月运营有啥风险'],
    negativeExamples: ['这个月营业额', '张雯今天有哪些预约'],
    triggerKeywords: ['经营概览', '经营驾驶舱', '重点关注', '运营风险', '今日经营', '经营摘要'],
  },
  {
    capabilityId: 'manager.business.anomaly.alert',
    businessQueryCapabilityId: 'business_anomaly_alert',
    displayName: '经营异常主动提醒',
    description: '扫描收入、预约、库存、客户和自动化数据，识别需要店长关注的异常。',
    personaCodes: ['manager'],
    objectTypes: ['BusinessOverview'],
    actions: ['diagnose', 'recommend', 'summary'],
    requiredEntities: [],
    outputKinds: ['risk_card', 'table', 'evidence_panel'],
    riskLevel: 'medium',
    examples: ['经营异常提醒', '最近有哪些经营异常', '门店有哪些风险要处理'],
    negativeExamples: ['这个月营业额', '推荐近期营销活动'],
    triggerKeywords: ['经营异常', '异常提醒', '运营风险', '门店风险', '风险要处理', '经营预警'],
  },
  {
    capabilityId: 'manager.multi_store.comparison',
    businessQueryCapabilityId: 'multi_store_comparison',
    displayName: '多门店对比',
    description: '基于当前用户授权门店集合，对比收入、客户、预约和库存表现。',
    personaCodes: ['manager'],
    objectTypes: ['BusinessOverview'],
    actions: ['compare', 'analyze', 'summary'],
    requiredEntities: [],
    outputKinds: ['kpi', 'table', 'evidence_panel'],
    riskLevel: 'high',
    examples: ['多店收入对比', '各门店本月经营对比', '门店之间业绩比较'],
    negativeExamples: ['今日经营概览', '单店这个月营业额'],
    triggerKeywords: ['多店', '多门店', '各门店', '门店对比', '分店对比', '门店之间'],
  },
  {
    capabilityId: 'reception.reservation.today.list',
    businessQueryCapabilityId: 'reservation_today',
    displayName: '今日预约清单',
    description: '查询全店今日预约、到店、未到店、预约客户和空位情况。',
    personaCodes: ['manager', 'reception', 'beautician'],
    objectTypes: ['Reservation'],
    actions: ['list', 'summary', 'diagnose'],
    requiredEntities: [],
    outputKinds: ['reservation_table', 'evidence_panel', 'action_card'],
    riskLevel: 'low',
    examples: ['今天有哪些预约', '今日预约客户清单', '还有多少预约客户没到店'],
    negativeExamples: ['张雯个人预约记录', '这个月营业额'],
    triggerKeywords: ['今日预约', '今天预约', '预约客户', '未到店', '到店客户', '空位'],
  },
  {
    capabilityId: 'reception.schedule.availability',
    businessQueryCapabilityId: 'schedule_utilization',
    displayName: '排班忙闲与可用时段',
    description: '查询美容师排班、忙闲、空档、请假和时段占用率。',
    personaCodes: ['manager', 'reception', 'beautician'],
    objectTypes: ['Schedule', 'Beautician'],
    actions: ['lookup', 'list', 'summary', 'analyze', 'diagnose'],
    requiredEntities: [],
    outputKinds: ['table', 'evidence_panel', 'action_card'],
    riskLevel: 'low',
    examples: ['今天排班空闲情况', '哪些美容师下午有空档', '今日排班利用率'],
    negativeExamples: ['本月员工表现排行', '张雯今天有哪些预约'],
    triggerKeywords: ['排班', '班表', '空档', '可用时段', '忙闲', '占用率', '利用率', '请假'],
  },
  {
    capabilityId: 'inventory.replenishment.recommend',
    businessQueryCapabilityId: 'product_replenishment_opportunity',
    displayName: '库存补货建议',
    description: '结合安全库存、低库存和近期销量给出补货优先级。',
    personaCodes: ['manager', 'inventory', 'reception'],
    objectTypes: ['InventoryProduct', 'Supplier'],
    actions: ['recommend', 'list', 'diagnose'],
    requiredEntities: [],
    outputKinds: ['table', 'evidence_panel', 'action_card'],
    riskLevel: 'medium',
    examples: ['哪些商品需要补货', '给我库存补货建议', '低库存产品优先补哪些'],
    negativeExamples: ['一次性丁腈手套库存还够吗', '近期临期库存产品'],
    triggerKeywords: ['补货建议', '需要补货', '补哪些', '低库存', '安全库存', '采购优先级'],
  },
  {
    capabilityId: 'marketing.effect.diagnose',
    businessQueryCapabilityId: 'marketing_conversion',
    displayName: '营销效果诊断',
    description: '查询营销活动触达、转化、收入和归因表现。',
    personaCodes: ['manager', 'marketing'],
    objectTypes: ['MarketingActivity'],
    actions: ['analyze', 'diagnose', 'compare', 'summary'],
    requiredEntities: [],
    outputKinds: ['kpi', 'table', 'evidence_panel'],
    riskLevel: 'low',
    examples: ['近期营销转化怎么样', '活动效果复盘', '营销活动收入归因分析'],
    negativeExamples: ['活动链接发我', '推荐近期营销活动'],
    triggerKeywords: ['营销转化', '活动效果', '触达', '归因', '打开率', '转化率', '效果复盘'],
  },
  {
    capabilityId: 'marketing.customer.churn.risk',
    businessQueryCapabilityId: 'customer_churn_risk',
    displayName: '客户流失风险清单',
    description: '查询久未到店、高消费无预约、流失风险客户和回访建议。',
    personaCodes: ['manager', 'marketing', 'reception', 'beautician'],
    objectTypes: ['Customer'],
    actions: ['list', 'diagnose', 'recommend', 'summary'],
    requiredEntities: [],
    outputKinds: ['table', 'evidence_panel', 'action_card'],
    riskLevel: 'low',
    examples: ['哪些客户有流失风险', '高价值客户沉默预警', '列出久未到店客户'],
    negativeExamples: ['请列出10个需要紧急召回的客户', '张雯客户档案', '哪些客户有流失风险要回访'],
    triggerKeywords: ['流失风险', '久未到店', '沉默客户', '沉睡客户', '高价值客户沉默', '客户预警'],
  },
  {
    capabilityId: 'automation.execution.summary',
    businessQueryCapabilityId: 'automation_execution_summary',
    displayName: '自动化执行复盘',
    description: '查询自动化执行次数、触达、转化和归因收入表现。',
    personaCodes: ['manager'],
    objectTypes: ['Automation'],
    actions: ['summary', 'analyze', 'diagnose'],
    requiredEntities: [],
    outputKinds: ['kpi', 'table', 'evidence_panel'],
    riskLevel: 'low',
    examples: ['自动化执行复盘', '自动化触达转化怎么样', '最近自动化执行效果'],
    negativeExamples: ['营销活动列表', '客户召回名单'],
    triggerKeywords: ['自动化', '自动化执行', '执行复盘', '自动化触达', '自动化转化', '执行效果'],
  },
  {
    capabilityId: 'order.customer.consumption.list',
    businessQueryCapabilityId: 'order_customer_consumption_list',
    displayName: '消费客户清单',
    description: '查询指定时间范围内发生消费、成交或流水的客户清单。',
    personaCodes: ['manager', 'finance', 'reception'],
    objectTypes: ['Order', 'Customer'],
    actions: ['list', 'summary'],
    requiredEntities: [],
    outputKinds: ['table', 'evidence_panel', 'action_card'],
    riskLevel: 'low',
    examples: ['昨天有哪些消费的客户，列出清单', '今日成交客户名单', '本周有流水的会员'],
    negativeExamples: ['这个月营业额', '需要召回的客户'],
    triggerKeywords: ['消费客户', '成交客户', '有流水', '消费清单', '哪些客户消费', '会员消费'],
  },
  {
    capabilityId: 'card.expiry.risk',
    businessQueryCapabilityId: 'card_expiry_risk',
    displayName: '卡项到期风险',
    description: '查询即将到期的次卡、疗程卡和剩余权益。',
    personaCodes: ['manager', 'reception'],
    objectTypes: ['MemberCard', 'Customer'],
    actions: ['list', 'diagnose', 'recommend', 'summary'],
    requiredEntities: [],
    outputKinds: ['table', 'evidence_panel', 'action_card'],
    riskLevel: 'low',
    examples: ['哪些卡快到期了', '列出即将到期次卡', '卡项到期风险客户'],
    negativeExamples: ['张雯还有什么卡和权益', '会员卡余额分析'],
    triggerKeywords: ['卡快到期', '卡项到期', '即将到期次卡', '权益到期', '到期风险'],
  },
  {
    capabilityId: 'card.usage.analysis',
    businessQueryCapabilityId: 'card_usage_analysis',
    displayName: '卡项核销分析',
    description: '查询次卡核销数量、趋势和高频核销卡项。',
    personaCodes: ['manager', 'reception'],
    objectTypes: ['MemberCard'],
    actions: ['analyze', 'summary', 'list'],
    requiredEntities: [],
    outputKinds: ['kpi', 'table', 'evidence_panel'],
    riskLevel: 'low',
    examples: ['本月卡项核销情况', '次卡核销趋势', '哪些卡核销最多'],
    negativeExamples: ['张雯还有什么卡和权益', '哪些卡快到期了'],
    triggerKeywords: ['卡项核销', '次卡核销', '核销趋势', '核销最多', '高频核销'],
  },
  {
    capabilityId: 'supplier.purchase.advice',
    businessQueryCapabilityId: 'supplier_purchase_advice',
    displayName: '供应链采购建议',
    description: '结合补货需求、主供应商、采购价、起订量和交期给出采购建议。',
    personaCodes: ['manager', 'inventory'],
    objectTypes: ['Supplier', 'InventoryProduct'],
    actions: ['recommend', 'list', 'draft'],
    requiredEntities: [],
    outputKinds: ['supplier_purchase_card', 'table', 'evidence_panel'],
    riskLevel: 'medium',
    examples: ['生成供应商采购建议', '哪些补货商品适合一起采购', '本周采购优先级'],
    negativeExamples: ['低库存产品清单', '一次性丁腈手套库存还够吗'],
    triggerKeywords: ['供应商采购', '采购建议', '一起采购', '起订量', '交期', '采购优先级'],
  },
  {
    capabilityId: 'terminal.health.diagnosis',
    businessQueryCapabilityId: 'terminal_health_diagnosis',
    displayName: '终端健康诊断',
    description: '查询终端设备在线状态、外设状态、会话数量和高频失败问题。',
    personaCodes: ['manager'],
    objectTypes: ['Terminal'],
    actions: ['diagnose', 'summary', 'lookup'],
    requiredEntities: [],
    outputKinds: ['kpi', 'table', 'evidence_panel'],
    riskLevel: 'low',
    examples: ['终端运行是否正常', 'Ami Aura 最近有哪些失败问题', '打印机扫码器状态'],
    negativeExamples: ['这个月营业额', '今天预约客户清单'],
    triggerKeywords: ['终端', 'Ami Aura', '设备状态', '打印机', '扫码器', '高频失败', '失败问题', '运行是否正常'],
  },
];

@Injectable()
export class CapabilityCatalogService {
  constructor(private readonly actionOntology: ActionOntologyService) {}

  list() {
    return [...AGENT_CAPABILITY_CATALOG];
  }

  findById(capabilityId: string) {
    return AGENT_CAPABILITY_CATALOG.find((item) => item.capabilityId === capabilityId || item.businessQueryCapabilityId === capabilityId);
  }

  resolve(input: CapabilityResolutionInput): CapabilityResolutionResult {
    const action = input.action ?? this.actionOntology.detect(input.text);
    const entityObjectTypes = new Set((input.entities ?? []).map((item) => item.objectType));
    const role = input.role;
    const candidates = AGENT_CAPABILITY_CATALOG.map((capability) => {
      let score = 0;
      const reasons: string[] = [];
      if (capability.actions.includes(action)) {
        score += 0.35;
        reasons.push(`action:${action}`);
      }
      for (const objectType of entityObjectTypes) {
        if (capability.objectTypes.includes(objectType)) {
          score += 0.45;
          reasons.push(`entity:${objectType}`);
        }
      }
      if (!capability.requiredEntities.length && entityObjectTypes.size === 0 && capability.actions.includes(action)) {
        score += 0.2;
        reasons.push('no_required_entity');
      }
      if (this.matchesExample(input.text, capability.examples)) {
        score += 0.1;
        reasons.push('example');
      }
      const keywordScore = this.scoreTriggerKeywords(input.text, capability.triggerKeywords ?? []);
      if (keywordScore > 0) {
        score += keywordScore;
        reasons.push('trigger_keywords');
      }
      if (this.matchesNegativeExample(input.text, capability.negativeExamples)) {
        score -= 0.5;
        reasons.push('negative_example');
      }
      if (score > 0 && role && capability.personaCodes.includes(role)) {
        score += 0.1;
        reasons.push(`role:${role}`);
      }
      return { capabilityId: capability.capabilityId, score, reason: reasons.join(',') || 'no_match' };
    })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const top = candidates[0];
    return {
      capability: top ? this.findById(top.capabilityId) : undefined,
      action,
      confidence: top?.score ?? 0,
      reason: top?.reason ?? 'no_capability_match',
      candidates,
    };
  }

  private matchesExample(text: string, examples: string[]) {
    const normalized = this.normalize(text);
    return examples.some((example) => {
      const value = this.normalize(example);
      return value.length >= 4 && (normalized.includes(value) || value.includes(normalized));
    });
  }

  private matchesNegativeExample(text: string, examples: string[]) {
    const normalized = this.normalize(text);
    return examples.some((example) => {
      const value = this.normalize(example);
      return value.length >= 4 && (normalized === value || normalized.includes(value));
    });
  }

  private normalize(text: string) {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
  }

  private scoreTriggerKeywords(text: string, keywords: string[]) {
    if (!keywords.length) return 0;
    const normalized = this.normalize(text);
    const hits = keywords.filter((keyword) => normalized.includes(this.normalize(keyword))).length;
    return Math.min(0.3, hits * 0.08);
  }
}
