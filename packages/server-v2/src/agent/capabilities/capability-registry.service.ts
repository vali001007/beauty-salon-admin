import { Injectable } from '@nestjs/common';
import type { AgentRole, AgentToolPlanItem } from '../agent.types.js';
import type { BusinessCapabilityPlan, BusinessTask, BusinessTaskType, BusinessTaskDomain } from '../business-task/business-task.types.js';

export type BusinessCapabilityDefinition = {
  id: string;
  name: string;
  domain: BusinessTaskDomain;
  supportedTaskTypes: BusinessTaskType[];
  requiredMetrics: string[];
  optionalMetrics?: string[];
  allowedRoles: AgentRole[];
  description: string;
  toolPlanFactory: (task: BusinessTask) => AgentToolPlanItem[];
};

@Injectable()
export class CapabilityRegistryService {
  private readonly capabilities: BusinessCapabilityDefinition[] = [
    {
      id: 'customer_priority_recommendation',
      name: '客户优先跟进推荐',
      domain: 'customer',
      supportedTaskTypes: ['recommendation', 'ranking', 'forecast'],
      requiredMetrics: ['follow_up_priority_score'],
      allowedRoles: ['manager', 'reception'],
      description: '返回今天最值得跟进的客户 ranked list，并给出推荐原因和下一步动作。',
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
      id: 'revenue_diagnosis',
      name: '收入诊断',
      domain: 'business',
      supportedTaskTypes: ['query', 'diagnosis'],
      requiredMetrics: ['revenue'],
      allowedRoles: ['manager'],
      description: '对比当前周期与上一等长周期的收入、订单数、客单价，并拆分商品/项目贡献。',
      toolPlanFactory: (task) => [
        {
          tool: 'revenue.diagnose',
          args: {
            question: task.objective,
            businessTask: task,
            timeRange: task.timeRange?.preset ?? 'today',
            filters: task.filters,
          },
        },
      ],
    },
    {
      id: 'product_sales_ranking',
      name: '商品销量排行',
      domain: 'product',
      supportedTaskTypes: ['query', 'ranking'],
      requiredMetrics: [],
      optionalMetrics: ['product_sales_growth', 'product_sales_amount'],
      allowedRoles: ['manager', 'reception'],
      description: '查询商品销量、销售额、订单数、客户数和环比增长排行。',
      toolPlanFactory: (task) => [
        {
          tool: 'product.sales.rank',
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
      id: 'inventory_risk_ranking',
      name: '库存风险排行',
      domain: 'inventory',
      supportedTaskTypes: ['query', 'ranking', 'diagnosis', 'recommendation', 'forecast'],
      requiredMetrics: ['stock_risk_score'],
      allowedRoles: ['manager', 'reception'],
      description: '结合当前库存、安全库存、近 30 天销量、14 天预测需求和临期批次生成库存风险排行。',
      toolPlanFactory: (task) => [
        {
          tool: 'inventory.risk.rank',
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
      id: 'reservation_schedule_diagnosis',
      name: '预约排班诊断',
      domain: 'schedule',
      supportedTaskTypes: ['query', 'ranking', 'diagnosis', 'forecast'],
      requiredMetrics: [],
      optionalMetrics: ['schedule_utilization_rate', 'reservation_arrival_rate'],
      allowedRoles: ['manager', 'reception'],
      description: '结合预约、排班和美容师状态诊断忙闲时段、排班占用率和人手缺口。',
      toolPlanFactory: (task) => [
        {
          tool: 'schedule.diagnose',
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
      id: 'project_business_diagnosis',
      name: '项目经营诊断',
      domain: 'project',
      supportedTaskTypes: ['query', 'ranking', 'diagnosis', 'recommendation'],
      requiredMetrics: [],
      optionalMetrics: ['project_service_growth', 'gross_margin'],
      allowedRoles: ['manager', 'reception'],
      description: '结合项目服务趋势、项目收入、服务客户数和 BOM 耗材毛利诊断项目经营表现。',
      toolPlanFactory: (task) => [
        {
          tool: 'project.diagnose',
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
      id: 'card_member_business_diagnosis',
      name: '卡项/会员卡经营诊断',
      domain: 'card',
      supportedTaskTypes: ['query', 'ranking', 'diagnosis', 'forecast'],
      requiredMetrics: [],
      optionalMetrics: ['card_expiry_risk', 'card_usage_times', 'member_balance'],
      allowedRoles: ['manager', 'reception'],
      description: '诊断次卡到期/剩余次数风险、卡项核销活跃度、会员储值余额和充值消费流水。',
      toolPlanFactory: (task) => [
        {
          tool: 'card.diagnose',
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
      id: 'finance_margin_diagnosis',
      name: '财务毛利诊断',
      domain: 'finance',
      supportedTaskTypes: ['query', 'ranking', 'diagnosis', 'forecast'],
      requiredMetrics: [],
      optionalMetrics: ['gross_margin', 'material_cost', 'commission_cost', 'revenue', 'net_revenue'],
      allowedRoles: ['manager'],
      description: '诊断有效订单净收入、商品/项目耗材成本、提成成本、毛利和毛利率。',
      toolPlanFactory: (task) => [
        {
          tool: 'finance.margin.diagnose',
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
      id: 'staff_performance_ranking',
      name: '员工表现排行',
      domain: 'staff',
      supportedTaskTypes: ['query', 'ranking', 'diagnosis', 'recommendation'],
      requiredMetrics: [],
      optionalMetrics: ['staff_performance_score', 'staff_service_revenue', 'staff_commission_amount', 'staff_customer_repurchase_rate'],
      allowedRoles: ['manager', 'beautician'],
      description: '按员工服务、销售、提成、预约完成和服务质量信号生成员工表现排行。',
      toolPlanFactory: (task) => [
        {
          tool: 'staff.performance.rank',
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
      id: 'supplier_performance_diagnosis',
      name: '供应链采购诊断',
      domain: 'supplyChain',
      supportedTaskTypes: ['query', 'ranking', 'diagnosis', 'forecast', 'recommendation'],
      requiredMetrics: [],
      optionalMetrics: ['supplier_delivery_cycle', 'supplier_settlement_amount', 'supplier_purchase_score', 'stock_risk_score'],
      allowedRoles: ['manager'],
      description: '结合补货需求、供应商、采购价格、起订量和交期诊断供应链采购优先级。',
      toolPlanFactory: (task) => [
        {
          tool: 'supply_chain.diagnose',
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
      id: 'marketing_conversion_diagnosis',
      name: '营销转化诊断',
      domain: 'marketing',
      supportedTaskTypes: ['query', 'ranking', 'diagnosis'],
      requiredMetrics: [],
      optionalMetrics: ['campaign_conversion_rate', 'campaign_revenue'],
      allowedRoles: ['manager'],
      description: '诊断活动触达、线索、转化、成交收入和归因效果。',
      toolPlanFactory: (task) => [
        {
          tool: 'marketing.conversion.diagnose',
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
      id: 'promotion_effect_analysis',
      name: '权益活动效果分析',
      domain: 'promotion',
      supportedTaskTypes: ['query', 'ranking', 'diagnosis'],
      requiredMetrics: [],
      optionalMetrics: ['promotion_claim_rate', 'campaign_conversion_rate'],
      allowedRoles: ['manager'],
      description: '分析权益、优惠券或促销的领取、使用、成本和转化效果。',
      toolPlanFactory: (task) => [
        {
          tool: 'promotion.effect.analyze',
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
      id: 'automation_execution_diagnosis',
      name: '自动化执行复盘',
      domain: 'automation',
      supportedTaskTypes: ['query', 'ranking', 'diagnosis'],
      requiredMetrics: [],
      optionalMetrics: ['automation_touch_success_rate', 'campaign_conversion_rate', 'campaign_revenue'],
      allowedRoles: ['manager'],
      description: '分析自动化策略执行、触达、转化和归因收入。',
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
      id: 'customer_app_funnel_analysis',
      name: '客户小程序渠道漏斗',
      domain: 'customerApp',
      supportedTaskTypes: ['query', 'ranking', 'diagnosis'],
      requiredMetrics: [],
      optionalMetrics: ['customer_app_active_count', 'customer_app_bind_rate', 'channel_conversion_rate'],
      allowedRoles: ['manager'],
      description: '分析客户小程序和渠道的访问、绑定、线索、预约与成交转化。',
      toolPlanFactory: (task) => [
        {
          tool: 'customer_app.funnel.analyze',
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
      id: 'terminal_health_diagnosis',
      name: '终端设备与对话诊断',
      domain: 'terminal',
      supportedTaskTypes: ['query', 'ranking', 'diagnosis'],
      requiredMetrics: [],
      optionalMetrics: ['terminal_failure_rate', 'terminal_conversation_count'],
      allowedRoles: ['manager'],
      description: '诊断终端设备在线状态、外设状态、会话数量和高频失败问题。',
      toolPlanFactory: (task) => [
        {
          tool: 'terminal.health.diagnose',
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
      id: 'refund_risk_diagnosis',
      name: '售后退款诊断',
      domain: 'afterSales',
      supportedTaskTypes: ['query', 'ranking', 'diagnosis', 'forecast'],
      requiredMetrics: [],
      optionalMetrics: ['refund_amount', 'refund_rate'],
      allowedRoles: ['manager', 'reception'],
      description: '诊断退款金额、退款率、退款订单和异常售后风险。',
      toolPlanFactory: (task) => [
        {
          tool: 'order.refund.diagnose',
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
      id: 'service_quality_diagnosis',
      name: '服务质量诊断',
      domain: 'serviceQuality',
      supportedTaskTypes: ['query', 'ranking', 'diagnosis', 'forecast'],
      requiredMetrics: [],
      optionalMetrics: ['service_completion_rate', 'staff_performance_score'],
      allowedRoles: ['manager'],
      description: '诊断服务任务完成率、护理记录完整性和服务质量风险。',
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
      id: 'store_comparison_diagnosis',
      name: '门店对比诊断',
      domain: 'store',
      supportedTaskTypes: ['query', 'ranking', 'diagnosis', 'forecast'],
      requiredMetrics: [],
      optionalMetrics: ['store_rank_score', 'revenue', 'campaign_conversion_rate', 'stock_risk_score', 'reservation_arrival_rate', 'business_anomaly_count'],
      allowedRoles: ['manager'],
      description: '按授权门店对比收入、客户、库存、预约和活动转化。',
      toolPlanFactory: (task) => [
        {
          tool: 'store.comparison.diagnose',
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
      id: 'business_query',
      name: '受控经营问数',
      domain: 'business',
      supportedTaskTypes: ['query', 'ranking', 'diagnosis', 'forecast', 'recommendation'],
      requiredMetrics: [],
      allowedRoles: ['manager', 'reception', 'beautician'],
      description: '未命中专用能力时，回退到受控经营问数服务，不能瞎答。',
      toolPlanFactory: (task) => [
        {
          tool: 'business.query.ask',
          args: {
            question: task.objective,
            businessTask: task,
          },
        },
      ],
    },
  ];

  list() {
    return [...this.capabilities];
  }

  match(task: BusinessTask, role: AgentRole): BusinessCapabilityPlan | null {
    const exact = this.capabilities.find((capability) => {
      if (capability.id === 'business_query') return false;
      const domainMatched =
        capability.domain === task.domain ||
        (capability.id === 'reservation_schedule_diagnosis' && task.domain === 'reservation') ||
        (capability.id === 'card_member_business_diagnosis' && task.domain === 'memberCard') ||
        (capability.id === 'customer_app_funnel_analysis' && task.domain === 'channel');
      return (
        domainMatched &&
        capability.supportedTaskTypes.includes(task.taskType) &&
        capability.allowedRoles.includes(role) &&
        capability.requiredMetrics.every((metric) => task.metrics.includes(metric)) &&
        (!capability.optionalMetrics?.length || capability.optionalMetrics.some((metric) => task.metrics.includes(metric)))
      );
    });

    if (exact) {
      return {
        capabilityId: exact.id,
        reason: `BusinessTask 命中能力「${exact.name}」：${exact.description}`,
        toolPlan: exact.toolPlanFactory(task),
      };
    }

    if (task.domain !== 'unknown' && task.taskType !== 'clarify') {
      const fallback = this.capabilities.find((capability) => capability.id === 'business_query');
      if (fallback && fallback.allowedRoles.includes(role)) {
        return {
          capabilityId: fallback.id,
          reason: '未命中专用 P0 能力，回退到受控经营问数能力。',
          toolPlan: fallback.toolPlanFactory(task),
        };
      }
    }

    return null;
  }
}
