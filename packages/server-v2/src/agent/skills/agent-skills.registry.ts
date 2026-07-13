import { Injectable } from '@nestjs/common';
import type { BusinessQueryCapabilityId } from '../../business-query/business-query.types.js';
import type { AgentRole } from '../agent.types.js';
import type { BusinessTask } from '../business-task/business-task.types.js';
import type { AmiBusinessSkill, AmiBusinessSkillPlan } from './agent-skill.types.js';

const BUSINESS_QUERY_INTENTS: BusinessTask['taskType'][] = ['query', 'ranking', 'recommendation', 'diagnosis', 'forecast'];

function businessQueryToolPlan(capabilityId: BusinessQueryCapabilityId, task: BusinessTask, limit = 10, timeRange = 'last_30_days') {
  return [
    {
      tool: 'business.query.ask',
      args: {
        question: task.objective,
        businessTask: task,
        capabilityId,
        limit: Math.min(Math.max(Number(task.limit) || limit, 1), 100),
        timeRange: task.timeRange?.preset ?? timeRange,
        filters: task.filters,
        context: {
          forcedCapabilityId: capabilityId,
        },
      },
    },
  ];
}

function matchBusinessQuerySkill(
  task: BusinessTask,
  role: AgentRole,
  allowedRoles: AgentRole[],
  domains: BusinessTask['domain'][],
  pattern?: RegExp,
) {
  if (!allowedRoles.includes(role)) return false;
  if (!domains.includes(task.domain)) return false;
  if (!BUSINESS_QUERY_INTENTS.includes(task.taskType)) return false;
  return pattern ? pattern.test(String(task.objective ?? '')) : true;
}

const BUSINESS_QUERY_SKILL_DEFINITIONS: AmiBusinessSkill[] = [
  {
    id: 'business.overview.query',
    name: '门店经营概览',
    capabilityId: 'business_overview',
    domain: 'business',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['今天我应该重点关注什么', '今日经营概览', '门店今天怎么样'],
    entities: ['business_overview', 'store', 'order', 'reservation', 'customer', 'inventory'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'today', limit: 10 } },
    riskPolicy: { riskLevel: 'medium', requiresApproval: false, allowedRoles: ['manager'] },
    outputContract: { requiredKinds: ['kpi', 'evidence'], preferredKinds: ['kpi', 'table', 'action_card', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [
      {
        id: 'business-overview-today-focus',
        input: '今天我应该重点关注什么',
        expectedTool: 'manager.daily.briefing',
        expectedCapabilityId: 'manager_daily_briefing',
        expectedOutputKinds: ['kpi', 'action_card', 'evidence'],
      },
    ],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager'], ['business'], /概览|重点关注|今天.*怎么样|今日经营|经营摘要/),
    toolPlanFactory: (task) => businessQueryToolPlan('business_overview', task, 10, 'today'),
  },
  {
    id: 'business.anomaly.alert.query',
    name: '经营异常提醒',
    capabilityId: 'business_anomaly_alert',
    domain: 'business',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['最近一个月门店有哪些经营风险', '经营异常提醒', '门店风险要处理什么'],
    entities: ['business_overview', 'risk', 'order', 'reservation', 'inventory', 'customer'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'last_30_days', limit: 10 } },
    riskPolicy: { riskLevel: 'medium', requiresApproval: false, allowedRoles: ['manager'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['kpi', 'table', 'action_card', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [
      {
        id: 'business-anomaly-alert-month-risk',
        input: '最近一个月门店有哪些经营风险',
        expectedTool: 'business.query.ask',
        expectedCapabilityId: 'business_query',
        expectedOutputKinds: ['table', 'evidence'],
      },
    ],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager'], ['business'], /异常|风险|预警|提醒|要处理/),
    toolPlanFactory: (task) => businessQueryToolPlan('business_anomaly_alert', task, 10, 'last_30_days'),
  },
  {
    id: 'product.sales.trend.query',
    name: '商品销量趋势',
    capabilityId: 'product_sales_trend',
    domain: 'product',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['最近30天哪些商品卖得最好', '本月商品销售排行', '补水精华销量趋势'],
    entities: ['product', 'order', 'order_item'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'last_30_days', limit: 10 } },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager', 'reception'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['kpi', 'table', 'chart', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [
      {
        id: 'product-sales-trend-top-products',
        input: '最近30天哪些商品卖得最好',
        expectedTool: 'product.sales.rank',
        expectedCapabilityId: 'product_sales_ranking',
        expectedOutputKinds: ['table', 'evidence'],
      },
    ],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception'], ['product'], /销量|销售|热销|卖得好|排行|趋势/),
    toolPlanFactory: (task) => businessQueryToolPlan('product_sales_trend', task, 10, 'last_30_days'),
  },
  {
    id: 'product.customer.distribution.query',
    name: '商品购买客户分布',
    capabilityId: 'product_customer_distribution',
    domain: 'product',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['这些商品有哪些客户买过', '补水精华购买客户分布', '谁买过这个产品'],
    entities: ['product', 'customer', 'order'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'last_30_days', limit: 20 } },
    riskPolicy: { riskLevel: 'medium', requiresApproval: false, allowedRoles: ['manager', 'reception'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['table', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [
      {
        id: 'product-customer-distribution-buyers',
        input: '这些商品有哪些客户买过',
        expectedTool: 'business.query.ask',
        expectedCapabilityId: 'business_query',
        expectedOutputKinds: ['table', 'evidence'],
      },
    ],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception'], ['product'], /购买客户|谁买过|买过|客户分布/),
    toolPlanFactory: (task) => businessQueryToolPlan('product_customer_distribution', task, 20, 'last_30_days'),
  },
  {
    id: 'product.replenishment.opportunity.query',
    name: '库存补货机会',
    capabilityId: 'product_replenishment_opportunity',
    domain: 'inventory',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['哪些商品需要补货', '给我库存补货建议', '低库存产品优先补哪些'],
    entities: ['inventory_item', 'product', 'stock_movement'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'last_30_days', limit: 10 } },
    riskPolicy: { riskLevel: 'medium', requiresApproval: false, allowedRoles: ['manager', 'reception'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['table', 'action_card', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception'], ['inventory'], /补货|采购建议|优先补|安全库存/),
    toolPlanFactory: (task) => businessQueryToolPlan('product_replenishment_opportunity', task, 10, 'last_30_days'),
  },
  {
    id: 'project.service.trend.query',
    name: '项目服务趋势',
    capabilityId: 'project_service_trend',
    domain: 'project',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['最近做得好的护理项目', '肩颈护理最近卖得好吗', '本月服务项目排行'],
    entities: ['project', 'service_record', 'order_item'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'last_30_days', limit: 10 } },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager', 'reception', 'beautician'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['kpi', 'table', 'chart', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception', 'beautician'], ['project'], /服务次数|护理项目|项目.*排行|卖得好|做得好|趋势/),
    toolPlanFactory: (task) => businessQueryToolPlan('project_service_trend', task, 10, 'last_30_days'),
  },
  {
    id: 'project.material.margin.query',
    name: '项目耗材毛利',
    capabilityId: 'project_material_margin',
    domain: 'project',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['哪些项目耗材成本偏高', '项目耗材毛利', '项目毛利空间怎么样'],
    entities: ['project', 'project_bom', 'product', 'finance_metric'],
    requiredMetrics: [],
    requiredSlots: ['storeId'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { limit: 10 } },
    riskPolicy: { riskLevel: 'medium', requiresApproval: false, allowedRoles: ['manager'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['kpi', 'table', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [
      {
        id: 'project-material-margin-high-cost',
        input: '哪些项目耗材成本偏高',
        expectedTool: 'project.diagnose',
        expectedCapabilityId: 'project_business_diagnosis',
        expectedOutputKinds: ['table', 'evidence'],
      },
    ],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager'], ['project'], /耗材|成本|毛利|利润|BOM/i),
    toolPlanFactory: (task) => businessQueryToolPlan('project_material_margin', task, 10, 'last_30_days'),
  },
  {
    id: 'customer.churn.risk.query',
    name: '客户流失风险',
    capabilityId: 'customer_churn_risk',
    domain: 'customer',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['哪些客户有流失风险', '高价值客户沉默预警', '列出久未到店客户'],
    entities: ['customer', 'reservation', 'order'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'limit'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { limit: 10 } },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager', 'reception', 'beautician'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['table', 'action_card', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception', 'beautician'], ['customer'], /流失|沉睡|久未|未到店|沉默|预警/),
    toolPlanFactory: (task) => businessQueryToolPlan('customer_churn_risk', task, 10, 'last_30_days'),
  },
  {
    id: 'customer.growth.opportunity.query',
    name: '客户增长机会',
    capabilityId: 'customer_growth_opportunity',
    domain: 'customer',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['请列出10个需要紧急召回的客户', '哪些客户适合召回', '哪些客户适合复购跟进'],
    entities: ['customer', 'customer_segment', 'followup_task'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'limit'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { limit: 10 } },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager', 'reception', 'beautician'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['table', 'action_card', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception', 'beautician'], ['customer'], /召回|回访|复购|跟进|老客|高价值|激活|机会|承接/),
    toolPlanFactory: (task) => businessQueryToolPlan('customer_growth_opportunity', task, 10, 'last_30_days'),
  },
  {
    id: 'customer.profile.lookup.query',
    name: '客户档案查询',
    capabilityId: 'customer_profile_lookup',
    domain: 'customer',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['张雯客户档案', '查一下这个客户', '刘思琪消费情况'],
    entities: ['customer'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'customer'],
    clarificationPolicy: { mode: 'ask_once', requiredSlots: ['customer'] },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager', 'reception', 'beautician'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['kpi', 'table', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception', 'beautician'], ['customer'], /档案|详情|消费情况|会员资料|查一下.*客户/),
    toolPlanFactory: (task) => businessQueryToolPlan('customer_profile_lookup', task, 1, 'last_30_days'),
  },
  {
    id: 'customer.reservation.today.query',
    name: '客户今日预约',
    capabilityId: 'customer_reservation_today',
    domain: 'reservation',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['张雯今天有哪些预约', '这个客户今天有没有预约', '刘思琪今日预约'],
    entities: ['customer', 'reservation'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'customer', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'today', limit: 20 } },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager', 'reception', 'beautician'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['table', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception', 'beautician'], ['reservation', 'customer'], /客户.*预约|今天.*预约|今日预约/),
    toolPlanFactory: (task) => businessQueryToolPlan('customer_reservation_today', task, 20, 'today'),
  },
  {
    id: 'customer.card.benefit.summary.query',
    name: '客户卡项权益摘要',
    capabilityId: 'customer_card_benefit_summary',
    domain: 'card',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['张雯还有什么卡和权益', '这个客户卡项状态', '客户还有几次护理'],
    entities: ['customer', 'customer_card', 'benefit'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'customer'],
    clarificationPolicy: { mode: 'ask_once', requiredSlots: ['customer'] },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager', 'reception'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['kpi', 'table', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception'], ['card', 'customer', 'memberCard'], /卡和权益|客户权益|卡项状态|还有.*卡|还有几次|可核销/),
    toolPlanFactory: (task) => businessQueryToolPlan('customer_card_benefit_summary', task, 20, 'last_30_days'),
  },
  {
    id: 'inventory.alert.query',
    name: '库存预警',
    capabilityId: 'inventory_alert',
    domain: 'inventory',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['近期有哪些临期库存产品', '哪些商品库存不足', '哪些产品快过期了'],
    entities: ['inventory_item', 'product', 'stock_batch'],
    requiredMetrics: [],
    requiredSlots: ['storeId'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { limit: 10 } },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager', 'reception'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['kpi', 'table', 'action_card', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception'], ['inventory'], /库存|临期|过期|缺货|低库存|预警/),
    toolPlanFactory: (task) => businessQueryToolPlan('inventory_alert', task, 10, 'last_30_days'),
  },
  {
    id: 'reservation.today.query',
    name: '今日预约清单',
    capabilityId: 'reservation_today',
    domain: 'reservation',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['今天有哪些预约', '今日预约客户清单', '还有多少预约客户没到店'],
    entities: ['reservation', 'customer', 'beautician'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'today', limit: 20 } },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager', 'reception', 'beautician'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['table', 'action_card', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception', 'beautician'], ['reservation'], /预约|到店|未到店|空位|爽约/),
    toolPlanFactory: (task) => businessQueryToolPlan('reservation_today', task, 20, 'today'),
  },
  {
    id: 'schedule.utilization.query',
    name: '排班利用率',
    capabilityId: 'schedule_utilization',
    domain: 'schedule',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['今天排班空闲情况', '哪些美容师下午有空档', '今日排班利用率'],
    entities: ['schedule', 'beautician', 'reservation'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'today', limit: 20 } },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager', 'reception', 'beautician'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['kpi', 'table', 'action_card', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception', 'beautician'], ['schedule'], /排班|班表|空档|可用时段|忙闲|利用率|请假/),
    toolPlanFactory: (task) => businessQueryToolPlan('schedule_utilization', task, 20, 'today'),
  },
  {
    id: 'finance.order.lookup.query',
    name: '订单流水查询',
    capabilityId: 'finance_order_lookup',
    domain: 'order',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['查一下订单 PO202606300001', '这个收银单明细', '打印这笔订单'],
    entities: ['order', 'payment', 'refund'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'order'],
    clarificationPolicy: { mode: 'ask_once', requiredSlots: ['order'] },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager', 'reception'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['link_card', 'table', 'action_card', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception'], ['order'], /订单号|收银单|小票|票据|打印|订单明细|收银组号/),
    toolPlanFactory: (task) => businessQueryToolPlan('finance_order_lookup', task, 1, 'today'),
  },
  {
    id: 'finance.today.transaction.list.query',
    name: '今日交易订单清单',
    capabilityId: 'finance_today_transaction_list',
    domain: 'finance',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['列出今天所有收银、核销、办卡订单列表，支持打印操作', '今天收银和核销订单清单', '今日办卡充值订单列表'],
    entities: ['order', 'payment', 'refund', 'customer_card'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'today', limit: 50 } },
    riskPolicy: { riskLevel: 'medium', requiresApproval: false, allowedRoles: ['manager', 'reception'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['table', 'action_card', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception'], ['finance', 'order'], /今天|今日|收银|核销|办卡|充值|退款|交易|打印/),
    toolPlanFactory: (task) => businessQueryToolPlan('finance_today_transaction_list', task, 50, 'today'),
  },
  {
    id: 'finance.cashflow.summary.query',
    name: '财务现金流摘要',
    capabilityId: 'finance_cashflow_summary',
    domain: 'finance',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['本月利润为什么下降', '这个月毛利率怎么样', '现金流和实收情况'],
    entities: ['finance_metric', 'payment', 'refund', 'cost'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'this_month', limit: 10 } },
    riskPolicy: { riskLevel: 'medium', requiresApproval: false, allowedRoles: ['manager'] },
    outputContract: { requiredKinds: ['kpi', 'evidence'], preferredKinds: ['kpi', 'table', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager'], ['finance'], /现金流|实收|结算|费用|利润|毛利|毛利率|成本/),
    toolPlanFactory: (task) => businessQueryToolPlan('finance_cashflow_summary', task, 10, 'this_month'),
  },
  {
    id: 'member.card.lookup.query',
    name: '客户卡项详情',
    capabilityId: 'member_card_lookup',
    domain: 'card',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['水光卡还剩几次', '张雯的疗程卡状态', '这张卡什么时候到期'],
    entities: ['customer_card', 'card_usage_record'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'card'],
    clarificationPolicy: { mode: 'ask_once', requiredSlots: ['card'] },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager', 'reception'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['kpi', 'table', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception'], ['card', 'memberCard'], /还剩几次|疗程卡状态|这张卡|会员卡|卡项详情/),
    toolPlanFactory: (task) => businessQueryToolPlan('member_card_lookup', task, 10, 'last_30_days'),
  },
  {
    id: 'card.expiry.risk.query',
    name: '卡项到期风险',
    capabilityId: 'card_expiry_risk',
    domain: 'card',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['哪些卡快到期了', '列出即将到期次卡', '卡项到期风险客户'],
    entities: ['customer_card', 'customer'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'next_30_days', limit: 10 } },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager', 'reception'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['table', 'action_card', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception'], ['card'], /到期|快到期|即将到期|权益到期/),
    toolPlanFactory: (task) => businessQueryToolPlan('card_expiry_risk', task, 10, 'next_30_days'),
  },
  {
    id: 'card.usage.analysis.query',
    name: '卡项核销分析',
    capabilityId: 'card_usage_analysis',
    domain: 'card',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['本月卡项核销情况', '次卡核销趋势', '哪些卡核销最多'],
    entities: ['customer_card', 'card_usage_record'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'last_30_days', limit: 10 } },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager', 'reception'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['kpi', 'table', 'chart', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception'], ['card'], /核销|使用次数|核销趋势|核销最多/),
    toolPlanFactory: (task) => businessQueryToolPlan('card_usage_analysis', task, 10, 'last_30_days'),
  },
  {
    id: 'member.balance.analysis.query',
    name: '会员卡余额分析',
    capabilityId: 'member_balance_analysis',
    domain: 'memberCard',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['当前会员储值沉淀资金是多少', '会员卡余额沉淀资金', '储值余额还有多少'],
    entities: ['customer_card', 'balance_account', 'balance_transaction'],
    requiredMetrics: [],
    requiredSlots: ['storeId'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { limit: 10 } },
    riskPolicy: { riskLevel: 'medium', requiresApproval: false, allowedRoles: ['manager', 'reception'] },
    outputContract: { requiredKinds: ['kpi', 'evidence'], preferredKinds: ['kpi', 'table', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [
      {
        id: 'member-balance-analysis-deposit-funds',
        input: '当前会员储值沉淀资金是多少',
        expectedTool: 'card.diagnose',
        expectedCapabilityId: 'card_member_business_diagnosis',
        expectedOutputKinds: ['table', 'evidence'],
      },
    ],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception'], ['memberCard'], /储值|沉淀资金|会员资产|充值余额|余额.*(总额|汇总|沉淀|资金|多少)/),
    toolPlanFactory: (task) => businessQueryToolPlan('member_balance_analysis', task, 10, 'last_30_days'),
  },
  {
    id: 'marketing.activity.list.query',
    name: '营销活动清单',
    capabilityId: 'marketing_activity_list',
    domain: 'marketing',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['推荐近期营销活动', '近期有哪些营销活动', '列出正在进行的活动'],
    entities: ['marketing_activity', 'marketing_page'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'last_30_days', limit: 10 } },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager', 'reception'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['table', 'action_card', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception'], ['marketing'], /营销活动|推广活动|优惠活动|回店活动|活动清单|活动列表|近期活动|推荐.*活动/),
    toolPlanFactory: (task) => businessQueryToolPlan('marketing_activity_list', task, 10, 'last_30_days'),
  },
  {
    id: 'marketing.activity.link.lookup.query',
    name: '营销活动链接查询',
    capabilityId: 'marketing_activity_link_lookup',
    domain: 'marketing',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['老朋友回店护理礼活动链接发我', '这个活动二维码在哪里', '把回店礼小程序路径发我'],
    entities: ['marketing_activity', 'marketing_page'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'activity'],
    clarificationPolicy: { mode: 'ask_once', requiredSlots: ['activity'] },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager', 'reception'] },
    outputContract: { requiredKinds: ['link_card', 'evidence'], preferredKinds: ['link_card', 'table', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 2 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager', 'reception'], ['marketing'], /活动链接|二维码|小程序路径|推广页|分享链接|H5|URL/i),
    toolPlanFactory: (task) => businessQueryToolPlan('marketing_activity_link_lookup', task, 5, 'last_30_days'),
  },
  {
    id: 'marketing.conversion.query',
    name: '营销转化分析',
    capabilityId: 'marketing_conversion',
    domain: 'marketing',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['近期营销转化怎么样', '活动效果复盘', '营销活动收入归因分析'],
    entities: ['marketing_activity', 'marketing_page_event', 'marketing_attribution'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'last_30_days', limit: 10 } },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager'] },
    outputContract: { requiredKinds: ['kpi', 'evidence'], preferredKinds: ['kpi', 'table', 'chart', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager'], ['marketing'], /转化|效果|漏斗|线索|成交|归因|ROI|打开率/i),
    toolPlanFactory: (task) => businessQueryToolPlan('marketing_conversion', task, 10, 'last_30_days'),
  },
  {
    id: 'automation.execution.summary.query',
    name: '自动化执行复盘',
    capabilityId: 'automation_execution_summary',
    domain: 'automation',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['自动化执行复盘', '自动化触达转化怎么样', '最近自动化执行效果'],
    entities: ['automation_definition', 'automation_run', 'marketing_touch'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'last_30_days', limit: 10 } },
    riskPolicy: { riskLevel: 'low', requiresApproval: false, allowedRoles: ['manager'] },
    outputContract: { requiredKinds: ['kpi', 'evidence'], preferredKinds: ['kpi', 'table', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [
      {
        id: 'automation-execution-summary-review',
        input: '自动化执行复盘',
        expectedTool: 'automation.execution.diagnose',
        expectedCapabilityId: 'automation_execution_diagnosis',
        expectedOutputKinds: ['table', 'evidence'],
      },
    ],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager'], ['automation'], /自动化|自动触达|自动提醒|执行复盘|执行效果/),
    toolPlanFactory: (task) => businessQueryToolPlan('automation_execution_summary', task, 10, 'last_30_days'),
  },
  {
    id: 'supplier.purchase.advice.query',
    name: '供应链采购建议',
    capabilityId: 'supplier_purchase_advice',
    domain: 'supplyChain',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['生成供应商采购建议', '哪些补货商品适合一起采购', '本周采购优先级'],
    entities: ['supplier', 'purchase_order', 'product'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'last_30_days', limit: 10 } },
    riskPolicy: { riskLevel: 'medium', requiresApproval: false, allowedRoles: ['manager'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['table', 'action_card', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager'], ['supplyChain', 'inventory'], /供应商|采购建议|一起采购|起订量|交期|采购优先级/),
    toolPlanFactory: (task) => businessQueryToolPlan('supplier_purchase_advice', task, 10, 'last_30_days'),
  },
  {
    id: 'multi.store.comparison.query',
    name: '多门店对比',
    capabilityId: 'multi_store_comparison',
    domain: 'store',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['多店收入对比', '各门店本月经营对比', '门店之间业绩比较'],
    entities: ['store', 'business_overview', 'order', 'reservation'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'last_30_days', limit: 10 } },
    riskPolicy: { riskLevel: 'high', requiresApproval: false, allowedRoles: ['manager'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['kpi', 'table', 'chart', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [
      {
        id: 'multi-store-comparison-revenue',
        input: '各门店本月经营对比',
        expectedTool: 'store.comparison.diagnose',
        expectedCapabilityId: 'store_comparison_diagnosis',
        expectedOutputKinds: ['table', 'evidence'],
      },
    ],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager'], ['store'], /多店|多门店|各门店|门店对比|分店|区域/),
    toolPlanFactory: (task) => businessQueryToolPlan('multi_store_comparison', task, 10, 'last_30_days'),
  },
  {
    id: 'staff.performance.query',
    name: '员工表现',
    capabilityId: 'staff_performance',
    domain: 'staff',
    intents: BUSINESS_QUERY_INTENTS,
    examples: ['本月员工表现排行', '近期表现较好的员工', '哪个美容师表现最好'],
    entities: ['beautician', 'staff', 'commission', 'service_record'],
    requiredMetrics: [],
    requiredSlots: ['storeId', 'dateRange'],
    clarificationPolicy: { mode: 'default_and_state_assumption', defaultSlots: { dateRange: 'this_month', limit: 10 } },
    riskPolicy: { riskLevel: 'medium', requiresApproval: false, allowedRoles: ['manager'] },
    outputContract: { requiredKinds: ['table', 'evidence'], preferredKinds: ['kpi', 'table', 'chart', 'evidence_panel'], evidenceRequired: true, maxFollowUps: 3 },
    evalCases: [],
    match: (task, role) => matchBusinessQuerySkill(task, role, ['manager'], ['staff'], /员工|美容师|表现|业绩|绩效|提成|服务量|排行|排名/),
    toolPlanFactory: (task) => businessQueryToolPlan('staff_performance', task, 10, 'this_month'),
  },
];

@Injectable()
export class AgentSkillsRegistryService {
  private readonly skills: AmiBusinessSkill[] = [
    {
      id: 'business.intent.planning',
      name: '经营意图编译',
      domain: 'cross_domain',
      intents: ['query', 'ranking', 'recommendation', 'diagnosis', 'forecast', 'draft', 'workflow', 'clarify'],
      examples: ['今天营收多少', '昨天有哪些消费客户', '哪些客户该回访'],
      entities: ['business_task', 'time_range', 'metric', 'business_object'],
      requiredMetrics: [],
      requiredSlots: ['domain', 'taskType'],
      clarificationPolicy: {
        mode: 'default_and_state_assumption',
        requiredSlots: ['domain', 'taskType'],
      },
      riskPolicy: {
        riskLevel: 'low',
        requiresApproval: false,
        allowedRoles: ['manager', 'reception', 'beautician'],
      },
      outputContract: {
        requiredKinds: ['text'],
        preferredKinds: ['text', 'clarify'],
        maxFollowUps: 1,
      },
      evalCases: [],
      match: () => false,
    },
    {
      id: 'order.customer.consumption.list',
      name: '消费客户清单',
      capabilityId: 'order_customer_consumption_list',
      domain: 'order',
      intents: ['query', 'ranking'],
      examples: ['昨天有哪些消费客户，列出清单', '昨日成交会员有哪些', '上周流水客户名单'],
      entities: ['customer', 'order', 'payment', 'order_item'],
      requiredMetrics: ['paid_amount', 'order_count'],
      optionalMetrics: ['customer_count'],
      requiredSlots: ['storeId', 'dateRange'],
      clarificationPolicy: {
        mode: 'default_and_state_assumption',
        defaultSlots: { dateRange: 'yesterday', limit: 20 },
      },
      riskPolicy: {
        riskLevel: 'low',
        requiresApproval: false,
        allowedRoles: ['manager', 'reception'],
      },
      outputContract: {
        requiredKinds: ['table', 'evidence'],
        preferredKinds: ['kpi', 'table', 'evidence'],
        minItems: 0,
        evidenceRequired: true,
        maxFollowUps: 3,
      },
      evalCases: [
        {
          id: 'order-customer-consumption-list-yesterday',
          input: '昨天有哪些消费客户，列出清单',
          expectedTool: 'business.query.ask',
          expectedCapabilityId: 'order_customer_consumption_list',
          expectedOutputKinds: ['table', 'evidence'],
        },
      ],
      toolPlanFactory: (task) => [
        {
          tool: 'business.query.ask',
          args: {
            question: task.objective,
            businessTask: task,
            limit: Math.min(Math.max(Number(task.limit) || 20, 1), 100),
            timeRange: task.timeRange?.preset ?? 'yesterday',
            filters: task.filters,
          },
        },
      ],
    },
    {
      id: 'revenue.order.analysis',
      name: '营收订单分析',
      capabilityId: 'order_revenue_analysis',
      domain: 'business',
      intents: ['query'],
      examples: ['今天营收多少', '今日收入怎么样', '本月营业额和订单数'],
      entities: ['order', 'payment', 'refund', 'pay_method'],
      requiredMetrics: ['revenue'],
      optionalMetrics: ['paid_amount', 'order_count', 'average_order_value', 'net_revenue', 'payment_method_ratio', 'refund_amount'],
      requiredSlots: ['storeId', 'dateRange'],
      clarificationPolicy: {
        mode: 'default_and_state_assumption',
        defaultSlots: { dateRange: 'today', limit: 10 },
      },
      riskPolicy: {
        riskLevel: 'low',
        requiresApproval: false,
        allowedRoles: ['manager'],
      },
      outputContract: {
        requiredKinds: ['kpi', 'evidence'],
        preferredKinds: ['kpi', 'table', 'chart', 'evidence'],
        evidenceRequired: true,
        maxFollowUps: 3,
      },
      evalCases: [
        {
          id: 'revenue-order-analysis-today',
          input: '今天营收多少',
          expectedTool: 'business.query.ask',
          expectedCapabilityId: 'order_revenue_analysis',
          expectedOutputKinds: ['kpi', 'evidence'],
        },
      ],
      toolPlanFactory: (task) => [
        {
          tool: 'business.query.ask',
          args: {
            question: task.objective,
            businessTask: task,
            limit: Math.min(Math.max(Number(task.limit) || 10, 1), 50),
            timeRange: task.timeRange?.preset ?? 'today',
            filters: task.filters,
          },
        },
      ],
    },
    {
      id: 'customer.lifecycle.insight',
      name: '客户生命周期洞察',
      capabilityId: 'customer_priority_recommendation',
      domain: 'customer',
      intents: ['query', 'ranking', 'recommendation', 'forecast'],
      examples: ['今天哪些客户最值得回访', '哪些高价值客户该跟进', '下周重点关注哪些客户'],
      entities: ['customer', 'customer_segment', 'followup_task'],
      requiredMetrics: ['follow_up_priority_score'],
      optionalMetrics: ['churn_risk_score', 'repurchase_opportunity_score', 'ltv', 'rfm_score'],
      requiredSlots: ['storeId', 'dateRange', 'limit'],
      clarificationPolicy: {
        mode: 'default_and_state_assumption',
        defaultSlots: { dateRange: 'today', limit: 10 },
      },
      riskPolicy: {
        riskLevel: 'low',
        requiresApproval: false,
        allowedRoles: ['manager', 'reception'],
      },
      outputContract: {
        requiredKinds: ['table', 'evidence'],
        preferredKinds: ['kpi', 'table', 'action_card', 'evidence'],
        minItems: 0,
        evidenceRequired: true,
        maxFollowUps: 3,
      },
      evalCases: [
        {
          id: 'customer-lifecycle-followup-priority',
          input: '今天哪些客户最值得回访',
          expectedTool: 'customer.priority.rank',
          expectedCapabilityId: 'customer_priority_recommendation',
          expectedOutputKinds: ['table', 'evidence'],
        },
      ],
      toolPlanFactory: (task) => [
        {
          tool: 'customer.priority.rank',
          args: {
            question: task.objective,
            businessTask: task,
            limit: Math.min(Math.max(Number(task.limit) || 10, 1), 50),
            timeRange: task.timeRange?.preset ?? 'today',
            filters: task.filters,
          },
        },
      ],
    },
    {
      id: 'finance.profit.risk',
      name: '利润风险诊断',
      capabilityId: 'finance_profit_diagnosis',
      domain: 'finance',
      intents: ['diagnosis'],
      examples: ['为什么利润下降', '本月利润为什么下降，成本影响多大', '最近利润和毛利风险怎么回事'],
      entities: ['order', 'order_item', 'refund', 'commission', 'daily_settlement'],
      requiredMetrics: ['gross_margin'],
      optionalMetrics: ['net_revenue', 'material_cost', 'commission_cost', 'refund_amount'],
      requiredSlots: ['storeId', 'dateRange'],
      clarificationPolicy: {
        mode: 'default_and_state_assumption',
        defaultSlots: { dateRange: 'last_30_days', limit: 10 },
      },
      riskPolicy: {
        riskLevel: 'low',
        requiresApproval: false,
        allowedRoles: ['manager'],
      },
      outputContract: {
        requiredKinds: ['kpi', 'table', 'evidence'],
        preferredKinds: ['kpi', 'table', 'evidence'],
        evidenceRequired: true,
        maxFollowUps: 3,
      },
      evalCases: [
        {
          id: 'finance-profit-risk-decline',
          input: '为什么利润下降',
          expectedTool: 'finance.revenue.summary',
          expectedCapabilityId: 'finance_profit_diagnosis',
          expectedOutputKinds: ['kpi', 'evidence'],
        },
      ],
      match: (task, role) => {
        if (role !== 'manager') return false;
        if (task.domain !== 'finance' || task.taskType !== 'diagnosis') return false;
        const text = String(task.objective ?? '');
        const hasProfitDomain = /利润|盈利|净收入|成本|耗材成本|提成成本/.test(text);
        const hasDiagnosisIntent = /诊断|分析|原因|为什么|下降|上升|变化|影响|怎么样|情况|趋势|高吗|高不高/.test(text);
        const hasProjectOnlyIntent = /项目耗材|项目毛利|服务项目/.test(text);
        const hasRiskRankIntent = /排行|排名|风险最高|风险最低|哪些.*(低|亏)|低毛利/.test(text);
        return hasProfitDomain && hasDiagnosisIntent && !hasProjectOnlyIntent && !hasRiskRankIntent;
      },
      toolPlanFactory: (task) => [
        {
          tool: 'finance.revenue.summary',
          args: {
            question: task.objective,
            businessTask: task,
            timeRange: task.timeRange?.preset ?? 'last_30_days',
          },
        },
        {
          tool: 'finance.profit.diagnose',
          args: {
            question: task.objective,
            businessTask: task,
            limit: Math.min(Math.max(Number(task.limit) || 10, 1), 50),
            timeRange: task.timeRange?.preset ?? 'last_30_days',
          },
        },
        {
          tool: 'finance.refund.discount.audit',
          args: {
            question: task.objective,
            businessTask: task,
            limit: Math.min(Math.max(Number(task.limit) || 10, 1), 50),
            timeRange: task.timeRange?.preset ?? 'last_30_days',
          },
        },
        {
          tool: 'finance.beautician.performance.audit',
          args: {
            question: task.objective,
            businessTask: task,
            limit: Math.min(Math.max(Number(task.limit) || 10, 1), 50),
            timeRange: task.timeRange?.preset ?? 'last_30_days',
          },
        },
      ],
    },
    {
      id: 'marketing.growth.execution',
      name: '营销增长执行',
      capabilityId: 'marketing_growth_execution',
      domain: 'marketing',
      intents: ['draft', 'recommendation', 'diagnosis'],
      examples: ['帮我生成召回活动', '给沉睡客户做召回活动草稿', '帮我生成沉睡客户召回短信话术'],
      entities: ['customer_segment', 'promotion', 'marketing_activity', 'copy'],
      requiredMetrics: [],
      optionalMetrics: ['churn_risk_score', 'promotion_fit_score', 'marketing_conversion_rate'],
      requiredSlots: ['storeId', 'targetAudience', 'offer'],
      clarificationPolicy: {
        mode: 'default_and_state_assumption',
        defaultSlots: { targetAudience: '60 天未到店流失风险客户', offer: '回店护理权益' },
      },
      riskPolicy: {
        riskLevel: 'medium',
        requiresApproval: true,
        allowedRoles: ['manager'],
      },
      outputContract: {
        requiredKinds: ['action_card', 'table', 'evidence_panel'],
        preferredKinds: ['action_card', 'table', 'evidence_panel'],
        evidenceRequired: true,
        approvalRequired: true,
        maxFollowUps: 3,
      },
      evalCases: [
        {
          id: 'marketing-growth-recall-draft',
          input: '帮我生成召回活动',
          expectedTool: 'marketing.activity.draft',
          expectedCapabilityId: 'marketing_growth_execution',
          expectedOutputKinds: ['action_card', 'evidence'],
        },
      ],
      match: (task, role) => {
        if (role !== 'manager') return false;
        const text = String(task.objective ?? '');
        const hasDraftIntent = /生成|创建|新建|做个|做一场|策划|活动方案|活动草稿|召回活动/.test(text);
        const hasMarketingDomain = task.domain === 'marketing' || /活动|营销|促销|权益|优惠券|券|礼包|私域|短信/.test(text);
        const hasRecallTarget = /召回|沉睡|流失|唤醒|未到店|没来|老客|回店|回流/.test(text);
        return hasDraftIntent && hasMarketingDomain && hasRecallTarget;
      },
      toolPlanFactory: (task) => [
        {
          tool: 'marketing.activity.draft',
          args: {
            question: task.objective,
            businessTask: task,
            title: /沉睡/.test(task.objective) ? '沉睡客户召回活动' : '流失客户召回活动',
            targetAudience: /高价值|VIP|大客户/.test(task.objective) ? '60 天未到店高价值客户' : '60 天未到店流失风险客户',
            offerSummary: /券|优惠券/.test(task.objective) ? '回店护理券' : '回店护理权益',
          },
        },
      ],
    },
    {
      id: 'reservation.capacity.schedule',
      name: '预约排班容量诊断',
      capabilityId: 'reservation_schedule_diagnosis',
      domain: 'schedule',
      intents: ['query', 'diagnosis', 'recommendation'],
      examples: ['本周预约排班有什么风险', '今天哪些美容师空闲', '明天人手够不够'],
      entities: ['reservation', 'schedule', 'beautician', 'time_slot'],
      requiredMetrics: ['schedule_utilization_rate'],
      optionalMetrics: ['reservation_count', 'arrival_rate', 'reservation_no_show_rate', 'staff_idle_hours', 'skill_match_rate'],
      requiredSlots: ['storeId', 'dateRange'],
      clarificationPolicy: {
        mode: 'default_and_state_assumption',
        defaultSlots: { dateRange: 'today', limit: 20 },
      },
      riskPolicy: {
        riskLevel: 'low',
        requiresApproval: false,
        allowedRoles: ['manager', 'reception'],
      },
      outputContract: {
        requiredKinds: ['table', 'evidence'],
        preferredKinds: ['kpi', 'table', 'action_card', 'evidence'],
        evidenceRequired: true,
        maxFollowUps: 3,
      },
      evalCases: [
        {
          id: 'reservation-capacity-schedule-risk',
          input: '本周预约排班有什么风险',
          expectedTool: 'schedule.diagnose',
          expectedCapabilityId: 'reservation_schedule_diagnosis',
          expectedOutputKinds: ['table', 'evidence'],
        },
      ],
      match: (task, role) => {
        if (!['manager', 'reception'].includes(role)) return false;
        const text = String(task.objective ?? '');
        const hasScheduleDomain = task.domain === 'schedule' || task.domain === 'reservation';
        const hasScheduleSignal = /预约|排班|班表|空档|空闲|忙闲|爽约|人手|美容师|时段|到店/.test(text);
        return hasScheduleDomain && (hasScheduleSignal || task.metrics.some((metric) => metric.includes('reservation') || metric.includes('schedule')));
      },
      toolPlanFactory: (task) => [
        {
          tool: 'schedule.diagnose',
          args: {
            question: task.objective,
            businessTask: task,
            limit: Math.min(Math.max(Number(task.limit) || 20, 1), 50),
            timeRange: task.timeRange?.preset ?? 'today',
            filters: task.filters,
          },
        },
      ],
    },
    {
      id: 'inventory.supply.risk',
      name: '库存供应风险诊断',
      capabilityId: 'inventory_supply_risk',
      domain: 'inventory',
      intents: ['query', 'ranking', 'diagnosis', 'recommendation', 'draft'],
      examples: ['哪些商品库存不足', '项目耗材 BOM 风险怎么样', '生成补货采购草稿'],
      entities: ['inventory_item', 'stock_movement', 'project_bom', 'supplier', 'purchase_order'],
      requiredMetrics: ['stock_risk_score'],
      optionalMetrics: ['stock_turnover_days', 'batch_expiry_risk', 'supplier_purchase_score'],
      requiredSlots: ['storeId', 'dateRange'],
      clarificationPolicy: {
        mode: 'default_and_state_assumption',
        defaultSlots: { dateRange: 'last_30_days', limit: 10 },
      },
      riskPolicy: {
        riskLevel: 'medium',
        requiresApproval: false,
        allowedRoles: ['manager', 'reception'],
      },
      outputContract: {
        requiredKinds: ['table', 'evidence'],
        preferredKinds: ['kpi', 'table', 'action_card', 'evidence'],
        evidenceRequired: true,
        maxFollowUps: 3,
      },
      evalCases: [
        {
          id: 'inventory-supply-risk-low-stock',
          input: '哪些商品库存不足',
          expectedTool: 'inventory.risk.rank',
          expectedCapabilityId: 'inventory_supply_risk',
          expectedOutputKinds: ['table', 'evidence'],
        },
        {
          id: 'inventory-supply-risk-replenishment-draft',
          input: '生成补货采购草稿',
          expectedTool: 'inventory.replenishment.draft',
          expectedCapabilityId: 'inventory_supply_risk',
          expectedOutputKinds: ['action_card', 'evidence'],
        },
      ],
      match: (task, role) => {
        if (!['manager', 'reception'].includes(role)) return false;
        const text = String(task.objective ?? '');
        const hasIndustryChainSignal = /标准品|标准商品|行业.*商品|本地\s*SKU|供应链映射|平台采购|手工采购|链路断点|链路总览|BOM.*库存|耗材.*库存/.test(text);
        if (role === 'reception' && /补货|采购|采购单|草稿|临期处理|清仓|供应链映射|平台采购|手工采购/.test(text)) return false;
        return (
          (role === 'manager' && hasIndustryChainSignal) ||
          (task.domain === 'inventory' && task.metrics.some((metric) => metric.includes('stock') || metric.includes('expiry') || metric.includes('supplier')))
        );
      },
      toolPlanFactory: (task) => {
        const text = String(task.objective ?? '');
        const baseArgs = {
          question: task.objective,
          businessTask: task,
          limit: Math.min(Math.max(Number(task.limit) || 10, 1), 50),
          timeRange: task.timeRange?.preset ?? 'last_30_days',
          filters: task.filters,
        };
        if (/标准品|标准商品|行业.*商品|本地\s*SKU|供应链映射|平台采购|手工采购|链路断点|链路总览|BOM.*库存|耗材.*库存/.test(text)) {
          return [{ tool: 'industry.chain.operational.report', args: baseArgs }];
        }
        if (/(OCR|图片|识别|采购单|入库单).*(入库|采购|草稿)|(入库|采购|草稿).*(OCR|图片|识别|采购单|入库单)/.test(text)) {
          return [{ tool: 'inventory.purchase.intake.draft', args: baseArgs }];
        }
        if (/(语音|口述|自然语言).*(出库|领用|盘点|报废|草稿)|(出库|领用|盘点|报废).*(语音|口述|自然语言|草稿)/.test(text)) {
          return [{ tool: 'inventory.stock.operation.draft', args: baseArgs }];
        }
        if (/(商品|产品|SKU|品项).*(元数据|资料|品牌|规格|单位|保质期|安全库存|补全)|(元数据|资料|品牌|规格|单位|保质期|安全库存|补全).*(商品|产品|SKU|品项)/i.test(text)) {
          return [{ tool: 'inventory.product.metadata.suggest', args: baseArgs }];
        }
        if (/(生成|创建|新建|草稿|采购单).*(补货|采购)|(补货|采购).*(生成|创建|新建|草稿|采购单)/.test(text)) {
          return [{ tool: 'inventory.replenishment.draft', args: baseArgs }];
        }
        if (/调拨|门店.*库存|库存.*门店|跨店/.test(text)) return [{ tool: 'inventory.transfer.suggestion', args: baseArgs }];
        if (/BOM|项目耗材|耗材保障|项目.*耗材/.test(text)) return [{ tool: 'inventory.project.bom.risk', args: baseArgs }];
        if (/(临期|过期).*(处理|清理|清仓|草稿|方案|建议)|(处理|清理|清仓|草稿|方案|建议).*(临期|过期)/.test(text)) {
          return [{ tool: 'inventory.expiring.clearance.draft', args: baseArgs }];
        }
        return [{ tool: 'inventory.risk.rank', args: baseArgs }];
      },
    },
    {
      id: 'staff.performance.management',
      name: '员工绩效管理',
      capabilityId: 'staff_performance_ranking',
      domain: 'staff',
      intents: ['query', 'ranking', 'diagnosis', 'recommendation'],
      examples: ['近期表现较好的员工', '本月美容师业绩排行', '我的表现怎么样'],
      entities: ['beautician', 'staff', 'service_record', 'commission', 'reservation'],
      requiredMetrics: ['staff_performance_score'],
      optionalMetrics: ['staff_service_revenue', 'staff_commission_amount', 'staff_customer_repurchase_rate'],
      requiredSlots: ['storeId', 'dateRange'],
      clarificationPolicy: {
        mode: 'default_and_state_assumption',
        defaultSlots: { dateRange: 'this_month', limit: 10 },
      },
      riskPolicy: {
        riskLevel: 'low',
        requiresApproval: false,
        allowedRoles: ['manager', 'beautician'],
      },
      outputContract: {
        requiredKinds: ['table', 'evidence'],
        preferredKinds: ['kpi', 'table', 'chart', 'action_card', 'evidence'],
        evidenceRequired: true,
        maxFollowUps: 3,
      },
      evalCases: [
        {
          id: 'staff-performance-management-ranking',
          input: '近期表现较好的员工',
          expectedTool: 'staff.performance.rank',
          expectedCapabilityId: 'staff_performance_ranking',
          expectedOutputKinds: ['table', 'evidence'],
        },
        {
          id: 'staff-performance-management-self',
          input: '我的表现怎么样',
          role: 'beautician',
          expectedTool: 'beautician.performance.progress',
          expectedCapabilityId: 'beautician_performance_progress',
          expectedOutputKinds: ['table', 'evidence'],
        },
      ],
      match: (task, role) => {
        if (!['manager', 'beautician'].includes(role)) return false;
        return task.domain === 'staff' && task.metrics.some((metric) => metric.startsWith('staff_'));
      },
      toolPlanFactory: (task) => [
        {
          tool: 'staff.performance.rank',
          args: {
            question: task.objective,
            businessTask: task,
            limit: Math.min(Math.max(Number(task.limit) || 10, 1), 50),
            timeRange: task.timeRange?.preset ?? 'this_month',
            filters: task.filters,
          },
        },
      ],
    },
    {
      id: 'card.member.asset',
      name: '卡项会员资产诊断',
      capabilityId: 'card_member_business_diagnosis',
      domain: 'card',
      intents: ['query', 'ranking', 'diagnosis', 'forecast'],
      examples: ['未来30天哪些次卡快到期', '会员卡余额怎么样', '本月次卡核销最多的是哪些'],
      entities: ['customer_card', 'member_card_account', 'card_usage_record', 'balance_transaction'],
      requiredMetrics: [],
      optionalMetrics: ['card_expiry_risk', 'card_usage_times', 'card_writeoff_rate', 'member_balance', 'balance_inactive_days'],
      requiredSlots: ['storeId', 'dateRange'],
      clarificationPolicy: {
        mode: 'default_and_state_assumption',
        defaultSlots: { dateRange: 'next_30_days', limit: 10 },
      },
      riskPolicy: {
        riskLevel: 'low',
        requiresApproval: false,
        allowedRoles: ['manager'],
      },
      outputContract: {
        requiredKinds: ['table', 'evidence'],
        preferredKinds: ['kpi', 'table', 'action_card', 'evidence'],
        evidenceRequired: true,
        maxFollowUps: 3,
      },
      evalCases: [
        {
          id: 'card-member-asset-expiring',
          input: '未来30天哪些次卡快到期',
          expectedTool: 'card.diagnose',
          expectedCapabilityId: 'card_member_business_diagnosis',
          expectedOutputKinds: ['table', 'evidence'],
        },
        {
          id: 'card-member-asset-balance',
          input: '会员卡余额怎么样',
          expectedTool: 'card.diagnose',
          expectedCapabilityId: 'card_member_business_diagnosis',
          expectedOutputKinds: ['table', 'evidence'],
        },
      ],
      match: (task, role) => {
        if (role !== 'manager') return false;
        if (!['card', 'memberCard'].includes(task.domain)) return false;
        return task.metrics.some((metric) =>
          ['card_expiry_risk', 'card_usage_times', 'card_writeoff_rate', 'member_balance', 'balance_inactive_days'].includes(metric),
        );
      },
      toolPlanFactory: (task) => [
        {
          tool: 'card.diagnose',
          args: {
            question: task.objective,
            businessTask: task,
            limit: Math.min(Math.max(Number(task.limit) || 10, 1), 50),
            timeRange: task.timeRange?.preset ?? (task.domain === 'card' ? 'next_30_days' : 'last_30_days'),
            filters: task.filters,
          },
        },
      ],
    },
    {
      id: 'service.quality.record',
      name: '服务质量与护理记录诊断',
      capabilityId: 'service_quality_diagnosis',
      domain: 'serviceQuality',
      intents: ['query', 'ranking', 'diagnosis', 'forecast', 'recommendation'],
      examples: ['服务记录完整性怎么样', '哪些服务任务完成质量有风险', '本月护理建议有没有漏跟进'],
      entities: ['service_task', 'service_record', 'care_advice', 'beautician', 'customer_feedback'],
      requiredMetrics: [],
      optionalMetrics: ['service_completion_rate', 'staff_performance_score', 'care_fit_score'],
      requiredSlots: ['storeId', 'dateRange'],
      clarificationPolicy: {
        mode: 'default_and_state_assumption',
        defaultSlots: { dateRange: 'last_30_days', limit: 10 },
      },
      riskPolicy: {
        riskLevel: 'low',
        requiresApproval: false,
        allowedRoles: ['manager'],
      },
      outputContract: {
        requiredKinds: ['table', 'evidence'],
        preferredKinds: ['kpi', 'table', 'action_card', 'evidence'],
        evidenceRequired: true,
        maxFollowUps: 3,
      },
      evalCases: [
        {
          id: 'service-quality-record-risk',
          input: '服务记录完整性怎么样',
          expectedTool: 'service.quality.diagnose',
          expectedCapabilityId: 'service_quality_diagnosis',
          expectedOutputKinds: ['table', 'evidence'],
        },
      ],
      toolPlanFactory: (task) => [
        {
          tool: 'service.quality.diagnose',
          args: {
            question: task.objective,
            businessTask: task,
            limit: Math.min(Math.max(Number(task.limit) || 10, 1), 50),
            timeRange: task.timeRange?.preset ?? 'last_30_days',
            filters: task.filters,
          },
        },
      ],
    },
    {
      id: 'automation.event.trigger',
      name: '自动化事件触发诊断',
      capabilityId: 'automation_execution_diagnosis',
      domain: 'automation',
      intents: ['query', 'ranking', 'diagnosis', 'recommendation'],
      examples: ['自动化提醒执行怎么样', '哪些自动触达任务失败了', '每日简报和异常预警有没有漏发'],
      entities: ['automation_definition', 'automation_run', 'automation_effect', 'trigger_event'],
      requiredMetrics: [],
      optionalMetrics: ['automation_touch_success_rate', 'campaign_conversion_rate', 'campaign_revenue'],
      requiredSlots: ['storeId', 'dateRange'],
      clarificationPolicy: {
        mode: 'default_and_state_assumption',
        defaultSlots: { dateRange: 'last_30_days', limit: 10 },
      },
      riskPolicy: {
        riskLevel: 'low',
        requiresApproval: false,
        allowedRoles: ['manager'],
      },
      outputContract: {
        requiredKinds: ['table', 'evidence'],
        preferredKinds: ['kpi', 'table', 'action_card', 'evidence'],
        evidenceRequired: true,
        maxFollowUps: 3,
      },
      evalCases: [
        {
          id: 'automation-event-trigger-execution',
          input: '自动化提醒执行怎么样',
          expectedTool: 'automation.execution.diagnose',
          expectedCapabilityId: 'automation_execution_diagnosis',
          expectedOutputKinds: ['table', 'evidence'],
        },
      ],
      toolPlanFactory: (task) => [
        {
          tool: 'automation.execution.diagnose',
          args: {
            question: task.objective,
            businessTask: task,
            limit: Math.min(Math.max(Number(task.limit) || 10, 1), 50),
            timeRange: task.timeRange?.preset ?? 'last_30_days',
            filters: task.filters,
          },
        },
      ],
    },
    {
      id: 'store.comparison.benchmark',
      name: '多门店经营对比',
      capabilityId: 'store_comparison_diagnosis',
      domain: 'store',
      intents: ['query', 'ranking', 'diagnosis', 'forecast'],
      examples: ['各门店本月经营对比', '哪家分店表现最好', '多店收入和预约到店对比'],
      entities: ['store', 'revenue', 'reservation', 'inventory', 'marketing_activity'],
      requiredMetrics: [],
      optionalMetrics: ['store_rank_score', 'revenue', 'campaign_conversion_rate', 'stock_risk_score', 'reservation_arrival_rate', 'business_anomaly_count'],
      requiredSlots: ['storeId', 'dateRange'],
      clarificationPolicy: {
        mode: 'default_and_state_assumption',
        defaultSlots: { dateRange: 'this_month', limit: 10 },
      },
      riskPolicy: {
        riskLevel: 'low',
        requiresApproval: false,
        allowedRoles: ['manager'],
      },
      outputContract: {
        requiredKinds: ['table', 'evidence'],
        preferredKinds: ['kpi', 'table', 'chart', 'evidence'],
        evidenceRequired: true,
        maxFollowUps: 3,
      },
      evalCases: [
        {
          id: 'store-comparison-benchmark-ranking',
          input: '各门店本月经营对比',
          expectedTool: 'store.comparison.diagnose',
          expectedCapabilityId: 'store_comparison_diagnosis',
          expectedOutputKinds: ['table', 'evidence'],
        },
      ],
      toolPlanFactory: (task) => [
        {
          tool: 'store.comparison.diagnose',
          args: {
            question: task.objective,
            businessTask: task,
            limit: Math.min(Math.max(Number(task.limit) || 10, 1), 50),
            timeRange: task.timeRange?.preset ?? 'this_month',
            filters: task.filters,
          },
        },
      ],
    },
    {
      id: 'terminal.health.ops',
      name: '智能终端健康运维',
      capabilityId: 'terminal_health_diagnosis',
      domain: 'terminal',
      intents: ['query', 'ranking', 'diagnosis'],
      examples: ['终端设备今天有没有异常', '哪些终端离线了', '高频问答失败问题有哪些'],
      entities: ['terminal_device', 'terminal_peripheral', 'agent_conversation', 'failure_reason'],
      requiredMetrics: [],
      optionalMetrics: ['terminal_failure_rate', 'terminal_conversation_count'],
      requiredSlots: ['storeId', 'dateRange'],
      clarificationPolicy: {
        mode: 'default_and_state_assumption',
        defaultSlots: { dateRange: 'today', limit: 10 },
      },
      riskPolicy: {
        riskLevel: 'low',
        requiresApproval: false,
        allowedRoles: ['manager'],
      },
      outputContract: {
        requiredKinds: ['table', 'evidence'],
        preferredKinds: ['kpi', 'table', 'action_card', 'evidence'],
        evidenceRequired: true,
        maxFollowUps: 3,
      },
      evalCases: [
        {
          id: 'terminal-health-ops-failures',
          input: '终端设备今天有没有异常',
          expectedTool: 'terminal.health.diagnose',
          expectedCapabilityId: 'terminal_health_diagnosis',
          expectedOutputKinds: ['table', 'evidence'],
        },
      ],
      toolPlanFactory: (task) => [
        {
          tool: 'terminal.health.diagnose',
          args: {
            question: task.objective,
            businessTask: task,
            limit: Math.min(Math.max(Number(task.limit) || 10, 1), 50),
            timeRange: task.timeRange?.preset ?? 'today',
            filters: task.filters,
          },
        },
      ],
    },
    ...BUSINESS_QUERY_SKILL_DEFINITIONS,
    {
      id: 'answer.contract.rendering',
      name: '回复契约渲染',
      domain: 'cross_domain',
      intents: ['query', 'ranking', 'recommendation', 'diagnosis', 'forecast', 'draft', 'workflow', 'clarify'],
      examples: ['清单类输出表格', '数值类输出 KPI', '动作类输出确认卡'],
      entities: ['response_block', 'evidence', 'follow_up'],
      requiredMetrics: [],
      requiredSlots: ['outputContract'],
      clarificationPolicy: {
        mode: 'never_for_low_risk',
      },
      riskPolicy: {
        riskLevel: 'low',
        requiresApproval: false,
        allowedRoles: ['manager', 'reception', 'beautician'],
      },
      outputContract: {
        requiredKinds: ['text'],
        preferredKinds: ['kpi', 'table', 'chart', 'action_card', 'evidence'],
        evidenceRequired: false,
        maxFollowUps: 3,
      },
      evalCases: [],
      match: () => false,
    },
  ];

  list() {
    return [...this.skills];
  }

  get(id: string) {
    return this.skills.find((skill) => skill.id === id);
  }

  match(task: BusinessTask, role: AgentRole): AmiBusinessSkillPlan | null {
    const candidates = this.skills
      .filter((skill) => this.canMatchSkill(skill, task, role))
      .map((skill) => ({
        skill,
        confidence: this.score(skill, task),
      }))
      .sort((a, b) => b.confidence - a.confidence);

    const selected = candidates[0];
    if (!selected?.skill.toolPlanFactory) return null;

    return {
      skillId: selected.skill.id,
      name: selected.skill.name,
      capabilityId: selected.skill.capabilityId,
      confidence: selected.confidence,
      reason: `BusinessTask 命中 Skill「${selected.skill.name}」：${selected.skill.examples.slice(0, 2).join(' / ')}`,
      toolPlan: selected.skill.toolPlanFactory(task),
      outputContract: selected.skill.outputContract,
    };
  }

  private canMatchSkill(skill: AmiBusinessSkill, task: BusinessTask, role: AgentRole) {
    if (skill.match) return skill.match(task, role);
    if (!skill.toolPlanFactory) return false;
    if (!skill.riskPolicy.allowedRoles.includes(role)) return false;
    const domainMatched = skill.domain === 'cross_domain' || skill.domain === task.domain;
    if (!domainMatched) return false;
    if (!skill.intents.includes(task.taskType)) return false;
    return skill.requiredMetrics.every((metric) => task.metrics.includes(metric));
  }

  private score(skill: AmiBusinessSkill, task: BusinessTask) {
    let score = task.confidence;
    if (skill.domain === task.domain) score += 0.08;
    if (skill.requiredMetrics.length) score += 0.05;
    const optionalHitCount = skill.optionalMetrics?.filter((metric) => task.metrics.includes(metric)).length ?? 0;
    score += Math.min(optionalHitCount * 0.03, 0.09);
    return Math.min(0.98, Number(score.toFixed(2)));
  }
}
