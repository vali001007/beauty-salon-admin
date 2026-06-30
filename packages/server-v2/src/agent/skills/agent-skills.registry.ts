import { Injectable } from '@nestjs/common';
import type { AgentRole } from '../agent.types.js';
import type { BusinessTask } from '../business-task/business-task.types.js';
import type { AmiBusinessSkill, AmiBusinessSkillPlan } from './agent-skill.types.js';

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
        if (role === 'reception' && /补货|采购|采购单|草稿|临期处理|清仓/.test(String(task.objective ?? ''))) return false;
        return task.domain === 'inventory' && task.metrics.some((metric) => metric.includes('stock') || metric.includes('expiry') || metric.includes('supplier'));
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
