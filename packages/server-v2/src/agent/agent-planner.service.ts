import { Injectable } from '@nestjs/common';
import type { AgentActor, AgentPlan } from './agent.types.js';
import { AgentToolRegistryService } from './agent-tool-registry.service.js';
import type { BusinessTask } from './business-task/business-task.types.js';
import { BusinessTaskCompilerService } from './business-task/business-task-compiler.service.js';

@Injectable()
export class AgentPlannerService {
  constructor(
    private readonly toolRegistry: AgentToolRegistryService,
    private readonly businessTaskCompiler: BusinessTaskCompilerService,
  ) {}

  async plan(input: { message: string; actor: AgentActor; context?: Record<string, unknown> }): Promise<AgentPlan> {
    const text = this.normalize(input.message);
    const tools = this.toolRegistry.list();
    const compiled = await this.businessTaskCompiler.compile({
      message: input.message,
      role: input.actor.role,
      context: input.context,
    });
    const businessTask = compiled.task;
    const semanticSqlCandidate = compiled.semanticSqlCandidate;

    if (this.isHighRiskDirectAction(text)) {
      return {
        intentType: 'clarify',
        goal: '拦截高风险正式执行动作',
        toolPlan: [],
        confidence: 0.9,
        clarificationNeeded: true,
        clarificationQuestion:
          '该请求涉及正式发布、批量触达、收银、核销或退款等高风险动作，Agent 不能直接执行。请先生成草稿或建议，并在管理端完成审批后再操作。',
        businessTask,
        semanticSqlCandidate,
      };
    }

    if (this.isCustomerFollowUpDraftRequest(text)) {
      if (!this.canUseTool('customer.followup.task.draft', input.actor.role)) {
        return this.buildRoleDeniedPlan('customer.followup.task.draft', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'draft',
        goal: '生成客户跟进任务草稿',
        toolPlan: [
          {
            tool: 'customer.followup.task.draft',
            args: {
              question: input.message,
              target: this.detectFollowUpTarget(text),
              limit: 10,
              channel: 'phone',
            },
          },
        ],
        confidence: 0.82,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'customer_followup_task_draft',
          reason: '用户请求生成客户跟进任务，属于中风险草稿能力。',
        },
      };
    }

    if (this.isInventoryReplenishmentDraftRequest(text)) {
      if (!this.canUseTool('inventory.replenishment.draft', input.actor.role)) {
        return this.buildRoleDeniedPlan('inventory.replenishment.draft', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'draft',
        goal: '生成库存补货采购草稿',
        toolPlan: [
          {
            tool: 'inventory.replenishment.draft',
            args: {
              question: input.message,
              limit: 10,
            },
          },
        ],
        confidence: 0.84,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
      };
    }

    if (this.isServiceRecordDraftRequest(text)) {
      if (!this.canUseTool('service.record.draft', input.actor.role)) {
        return this.buildRoleDeniedPlan('service.record.draft', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'draft',
        goal: '生成服务记录草稿建议',
        toolPlan: [
          {
            tool: 'service.record.draft',
            args: {
              question: input.message,
              limit: 5,
            },
          },
        ],
        confidence: 0.82,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
      };
    }

    if (this.isSchedulingOptimizationRequest(text)) {
      if (!this.canUseTool('scheduling.optimization.preview', input.actor.role)) {
        return this.buildRoleDeniedPlan('scheduling.optimization.preview', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '生成智能排班优化预览',
        toolPlan: [
          {
            tool: 'scheduling.optimization.preview',
            args: {
              question: input.message,
              weekStart: this.detectWeekStart(text),
              mode: /当前|本周/.test(text) ? 'optimize_current' : 'copy_last_week_optimize',
              objective: /公平|均衡/.test(text) ? 'fairness' : /人手|少排|节省/.test(text) ? 'reduce_staff' : 'cover_reservations',
            },
          },
        ],
        confidence: 0.84,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
      };
    }

    if (this.isMarketingOpportunity(text)) {
      if (!this.canUseTool('marketing.opportunity.discover', input.actor.role)) {
        return this.buildRoleDeniedPlan('marketing.opportunity.discover', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: 'analysis_and_recommendation',
        goal: '发现适合做营销活动的商品、项目或客户机会',
        toolPlan: [
          {
            tool: 'marketing.opportunity.discover',
            args: {
              question: input.message,
              targetType: this.detectOpportunityTarget(text),
              dateRange: 'last_30_days',
              limit: 10,
              signals: ['stock', 'sales', 'expiry', 'margin', 'customerFit'],
            },
          },
        ],
        confidence: 0.86,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: 'marketing_opportunity_discovery',
          reason: '商品/项目/客户活动机会问题命中营销机会发现能力。',
        },
      };
    }

    const priorityPlan = this.planCustomerPriorityRecommendation(input.message, businessTask, input.actor.role);
    if (priorityPlan) {
      return {
        ...priorityPlan,
        businessTask,
        semanticSqlCandidate,
      };
    }

    if (this.isDraftRequest(text)) {
      const hasPreviousOpportunity = this.hasPreviousOpportunity(input.context);
      if (hasPreviousOpportunity && !this.canUseTool('marketing.activity.draft', input.actor.role)) {
        return this.buildRoleDeniedPlan('marketing.activity.draft', businessTask, semanticSqlCandidate);
      }
      return {
        intentType: hasPreviousOpportunity ? 'draft' : 'clarify',
        goal: '根据上一轮机会结果生成营销活动草稿',
        toolPlan: hasPreviousOpportunity
          ? [{ tool: 'marketing.activity.draft', args: { question: input.message, context: input.context } }]
          : [],
        confidence: hasPreviousOpportunity ? 0.82 : 0.58,
        clarificationNeeded: !hasPreviousOpportunity,
        clarificationQuestion: hasPreviousOpportunity
          ? null
          : '请先说明要基于哪些商品、项目或客户生成活动草稿，或先询问“有哪些商品适合做活动”。',
        businessTask,
        semanticSqlCandidate,
      };
    }

    const compiledPlan = this.planFromCompiledTask(compiled);
    if (compiledPlan) return compiledPlan;

    if (this.isBusinessQuestion(text) || businessTask.domain !== 'unknown') {
      return {
        intentType: 'query',
        goal: '执行受控经营问数',
        toolPlan: [
          {
            tool: 'business.query.ask',
            args: { question: input.message, context: input.context },
          },
        ],
        confidence: 0.76,
        clarificationNeeded: false,
        businessTask,
        semanticSqlCandidate,
        capabilityPlan: {
          capabilityId: semanticSqlCandidate.fallbackCapability ?? 'business_query',
          reason: '未命中专用 P0 能力，回退到受控经营问数能力。',
        },
      };
    }

    return {
      intentType: 'clarify',
      goal: '澄清用户想执行的经营任务',
      toolPlan: [],
      confidence: 0.3,
      clarificationNeeded: true,
      clarificationQuestion: `请说明要处理的经营任务，例如：${tools
        .slice(0, 3)
        .map((tool) => tool.description)
        .join('、')}。`,
      businessTask,
      semanticSqlCandidate,
    };
  }

  private canUseTool(toolName: string, role: AgentActor['role']) {
    const tool = this.findTool(toolName);
    if (!tool) return false;
    if (!tool.allowedRoles) return true;
    return tool.allowedRoles.includes(role);
  }

  private buildRoleDeniedPlan(toolName: string, businessTask: BusinessTask, semanticSqlCandidate: unknown): AgentPlan {
    const tool = this.findTool(toolName);
    return {
      intentType: 'clarify',
      goal: '角色权限不足',
      toolPlan: [],
      confidence: 0.9,
      clarificationNeeded: true,
      clarificationQuestion: `当前账号角色不能使用「${tool?.description ?? '该经营查询'}」能力，请切换有权限账号或由店长处理。`,
      businessTask,
      semanticSqlCandidate,
    };
  }

  private findTool(toolName: string) {
    const registry = this.toolRegistry as unknown as {
      get?: (name: string) => { description?: string; allowedRoles?: AgentActor['role'][] } | undefined;
      list?: () => Array<{ name: string; description?: string; allowedRoles?: AgentActor['role'][] }>;
    };
    if (typeof registry.get === 'function') return registry.get(toolName);
    return registry.list?.().find((tool) => tool.name === toolName);
  }

  private normalize(value: string) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
  }

  private planCustomerPriorityRecommendation(message: string, task: BusinessTask, role: AgentActor['role']): AgentPlan | null {
    if (task.domain !== 'customer') return null;
    if (!task.metrics.includes('follow_up_priority_score')) return null;
    if (task.taskType !== 'recommendation' && task.taskType !== 'ranking') return null;
    if (!this.canUseTool('customer.priority.rank', role)) {
      return this.buildRoleDeniedPlan('customer.priority.rank', task, undefined);
    }

    const limit = Math.min(Math.max(Number(task.limit) || 10, 1), 50);
    return {
      intentType: 'analysis_and_recommendation',
      goal: '推荐优先跟进客户',
      toolPlan: [
        {
          tool: 'customer.priority.rank',
          args: {
            question: message,
            businessTask: task,
            limit,
            timeRange: task.timeRange?.preset ?? 'today',
            filters: task.filters,
          },
        },
      ],
      confidence: Math.max(0.84, task.confidence),
      clarificationNeeded: false,
      capabilityPlan: {
        capabilityId: 'customer_priority_recommendation',
        reason: '命中客户优先跟进推荐能力，按流失风险、复购机会、客户价值和近期跟进状态生成客户名单。',
      },
    };
  }

  private planFromCompiledTask(compiled: Awaited<ReturnType<BusinessTaskCompilerService['compile']>>): AgentPlan | null {
    const capability = compiled.capabilityMatches[0];
    if (!capability) return null;
    if (capability.capabilityId === 'business_query' && this.isMarketingOpportunity(this.normalize(compiled.task.objective))) {
      return null;
    }
    const goalByCapability: Record<string, string> = {
      customer_priority_recommendation: '推荐优先跟进客户',
      revenue_diagnosis: '诊断收入变化',
      product_sales_ranking: '查询商品销量排行',
      inventory_risk_ranking: '查询库存风险排行',
      reservation_schedule_diagnosis: '诊断预约排班',
      project_business_diagnosis: '诊断项目经营',
      card_member_business_diagnosis: '诊断卡项/会员卡经营',
      finance_margin_diagnosis: '诊断财务毛利',
      staff_performance_ranking: '查询员工表现排行',
      supplier_performance_diagnosis: '诊断供应链采购',
      marketing_conversion_diagnosis: '诊断营销转化',
      promotion_effect_analysis: '分析权益活动效果',
      automation_execution_diagnosis: '复盘自动化执行',
      customer_app_funnel_analysis: '分析客户小程序和渠道漏斗',
      terminal_health_diagnosis: '诊断终端设备与对话',
      refund_risk_diagnosis: '诊断售后退款',
      service_quality_diagnosis: '诊断服务质量',
      store_comparison_diagnosis: '诊断门店对比',
      business_query: '执行受控经营问数',
    };
    const goal = goalByCapability[capability.capabilityId];
    if (!goal) return null;
    if (capability.capabilityId === 'business_query' && compiled.task.domain === 'unknown') return null;
    const analysisCapabilities = new Set(
      Object.keys(goalByCapability).filter((id) => id !== 'business_query'),
    );

    return {
      intentType: analysisCapabilities.has(capability.capabilityId) ? 'analysis_and_recommendation' : 'query',
      goal,
      toolPlan: capability.toolPlan,
      confidence: Math.max(0.76, compiled.validation.confidence),
      clarificationNeeded: false,
      businessTask: compiled.task,
      semanticSqlCandidate: compiled.semanticSqlCandidate,
      capabilityPlan: {
        capabilityId: capability.capabilityId,
        reason: capability.reason,
      },
    };
  }

  private isMarketingOpportunity(text: string) {
    const hasMarketingIntent = /活动|营销|促销|优惠|推一下|推广|清一清|清库存|搭售|满赠|权益|邀约|推/.test(text);
    const hasOpportunityVerb = /适合|可以|哪些|哪个|推荐|建议|机会|做|搞|推/.test(text);
    const hasTarget = /商品|产品|项目|护理|服务|疗程|客户|会员|库存|东西|品/.test(text);
    return hasMarketingIntent && hasOpportunityVerb && hasTarget;
  }

  private isHighRiskDirectAction(text: string) {
    const hasDirectAction = /发布|上线|群发|发送|自动发|扣款|收款|直接退款|发起退款|确认退款|退款给|直接核销|帮.*核销|确认核销|核销次卡|划扣|确认收银|改排班|删除/.test(text);
    const hasSensitiveDomain = /活动|客户|会员|短信|微信|小程序|订单|次卡|会员卡|余额|排班|预约|库存|收银|支付|扣款|收款/.test(text);
    return hasDirectAction && hasSensitiveDomain;
  }

  private isCustomerFollowUpDraftRequest(text: string) {
    const hasTaskIntent = /跟进任务|邀约任务|回访任务|唤醒任务|创建跟进|生成跟进|安排跟进|生成邀约/.test(text);
    const hasCustomerDomain = /客户|顾客|会员|流失|复购|邀约|回访|唤醒|沉睡/.test(text);
    return hasTaskIntent && hasCustomerDomain;
  }

  private detectFollowUpTarget(text: string) {
    if (/流失|沉睡|唤醒/.test(text)) return 'churn';
    if (/复购|补货|周期/.test(text)) return 'repurchase';
    if (/活动|营销|响应|邀约/.test(text)) return 'marketing_response';
    return 'mixed';
  }

  private isInventoryReplenishmentDraftRequest(text: string) {
    const hasDraftIntent = /补货草稿|采购草稿|生成补货|创建补货|生成采购|创建采购|补货建议草稿/.test(text);
    const hasInventoryDomain = /库存|商品|产品|补货|采购/.test(text);
    return hasDraftIntent && hasInventoryDomain;
  }

  private isServiceRecordDraftRequest(text: string) {
    const hasDraftIntent = /服务记录草稿|护理记录草稿|生成服务记录|生成护理记录|补服务记录|补护理记录/.test(text);
    const hasServiceDomain = /服务|护理|记录|美容师/.test(text);
    return hasDraftIntent && hasServiceDomain;
  }

  private isSchedulingOptimizationRequest(text: string) {
    const hasSchedulingIntent = /优化|智能|生成|建议|预览/.test(text) && /排班/.test(text);
    const hasSchedulingDomain = /排班|预约|人手|美容师|班表/.test(text);
    return hasSchedulingIntent && hasSchedulingDomain;
  }

  private detectWeekStart(text: string) {
    if (/下周|下星期/.test(text)) return 'next_week';
    if (/本周|这周|当前/.test(text)) return 'this_week';
    return undefined;
  }

  private detectOpportunityTarget(text: string) {
    if (/项目|护理|服务|疗程/.test(text)) return 'project';
    if (/商品|产品|库存|东西|品/.test(text)) return 'product';
    if (/客户|会员|顾客/.test(text)) return 'customer';
    return 'product';
  }

  private isDraftRequest(text: string) {
    return /草稿|生成活动|创建活动|新建活动|做个活动|活动方案/.test(text);
  }

  private isBusinessQuestion(text: string) {
    return /经营|收入|营收|营业额|流水|订单|商品|产品|项目|客户|会员|排班|预约|库存|补货|临期|次卡|会员卡|财务|营销|活动|权益|优惠券|自动化|门店|多店|异常|风险|预警|毛利|成本|采购|供应链|供应商|小程序|渠道|终端|设备|退款|售后|服务质量/.test(
      text,
    );
  }

  private hasPreviousOpportunity(context?: Record<string, unknown>) {
    if (!context) return false;
    const text = JSON.stringify(context);
    return /marketing\.opportunity\.discover|商品活动机会|productId|opportunity/i.test(text);
  }
}
