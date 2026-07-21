import { Injectable } from '@nestjs/common';
import { MarketingService } from '../../marketing/marketing.service.js';
import type { AgentActor, AuraResponseBlock } from '../../agent/agent.types.js';
import { AGENT_V5_CODE, type AgentV5AdapterResult } from '../agent-v5.types.js';

@Injectable()
export class AgentV5LifecycleAdapter {
  constructor(private readonly marketingService: MarketingService) {}

  async diagnose(input: { actor: AgentActor }): Promise<AgentV5AdapterResult> {
    const [opportunitiesPage, serviceCyclesPage] = await Promise.all([
      this.marketingService.getLifecycleOpportunities({ page: 1, pageSize: 20, status: 'open' }, input.actor.storeId) as Promise<any>,
      this.marketingService.getLifecycleServiceCycles({ page: 1, pageSize: 10, dueOnly: true }, input.actor.storeId) as Promise<any>,
    ]);
    const opportunities = this.asArray(opportunitiesPage?.items ?? opportunitiesPage?.data);
    const serviceCycles = this.asArray(serviceCyclesPage?.items ?? serviceCyclesPage?.data);
    const top = opportunities.slice(0, 8);
    const summary = top.length
      ? `已识别 ${opportunitiesPage.total ?? opportunities.length} 个生命周期机会，优先处理 ${this.labelOpportunity(top[0]?.opportunityType)}。`
      : '当前暂无生命周期机会。请先运行营销预测或重建客户生命周期小本体。';

    return {
      status: top.length ? 'success' : 'no_data',
      title: '生命周期经营诊断',
      summary,
      data: { opportunitiesPage, serviceCyclesPage },
      evidence: {
        sources: ['CustomerOpportunity', 'CustomerServiceCycleState', 'CustomerOpportunityFulfillmentCheck'],
        domains: ['customer', 'marketing', 'service'],
        concepts: ['lifecycle_opportunity', 'service_cycle', 'fulfillment_check'],
        filters: [`storeId=${input.actor.storeId}`, 'status=open', 'dueOnly=true'],
        sampleSize: top.length + serviceCycles.length,
        facts: top.map((item) => ({
          source: 'CustomerOpportunity',
          id: item.id,
          label: this.labelOpportunity(item.opportunityType),
          value: item.score ?? item.priority ?? '',
        })),
        limitations: ['生命周期机会来自小本体快照，V5 只做建议、计划和审批申请。'],
      },
      renderedBlocks: [
        { kind: 'summary_text', title: '生命周期经营诊断', content: summary },
        ...this.opportunityBlocks(top),
      ],
      actions: top.length ? [{ label: '生成本周经营计划', action: 'agent-v5:business-plan', riskLevel: 'medium' }] : [],
    };
  }

  async createBusinessPlan(input: {
    runId: number;
    message: string;
    actor: AgentActor;
  }): Promise<AgentV5AdapterResult> {
    const plan = await this.marketingService.createLifecycleBusinessPlan({
      storeId: input.actor.storeId,
      planPeriod: this.currentWeek(),
      title: 'Agent V5 全业务经营计划草稿',
      objectivesJson: {
        sourceAgentCode: AGENT_V5_CODE,
        sourceRunId: input.runId,
        sourceEntrypoint: input.actor.entrypoint,
        request: input.message,
      },
      goalsJson: {
        sourceAgentCode: AGENT_V5_CODE,
        sourceRunId: input.runId,
        businessScope: 'full_business_ontology',
        primaryChain: 'lifecycle_business_loop',
      },
    } as any, input.actor.storeId, input.actor.userId) as any;
    const actions = this.asArray(plan?.actionsJson);
    const summary = plan?.id
      ? `已生成 Agent V5 经营计划 #${plan.id}，包含 ${actions.length} 个待审批动作。`
      : `经营计划生成失败：${plan?.reason ?? '生命周期服务暂不可用'}`;

    return {
      status: plan?.id ? 'draft' : 'no_data',
      title: '全业务经营计划草稿',
      summary,
      data: plan,
      evidence: {
        sources: ['LifecycleBusinessPlan', 'CustomerOpportunity'],
        domains: ['business_plan', 'customer', 'marketing'],
        concepts: ['approval_action', 'lifecycle_opportunity'],
        filters: [`storeId=${input.actor.storeId}`, `sourceRunId=${input.runId}`],
        sampleSize: actions.length,
        facts: actions.map((action, index) => ({
          source: 'LifecycleBusinessPlan.actionsJson',
          id: action.id ?? index,
          label: action.title ?? action.name ?? `action_${index + 1}`,
          value: action.type ?? '',
        })),
        limitations: ['经营计划仅生成草稿和审批动作，不直接发券、群发、改资产、扣库存或创建订单。'],
      },
      renderedBlocks: [
        { kind: 'summary_text', title: '全业务经营计划草稿', content: summary },
        ...this.actionTableBlocks(actions),
        ...(plan?.id ? [{
          kind: 'action_card' as const,
          title: '提交经营计划动作审批',
          preview: `提交计划 #${plan.id} 的 ${actions.length} 个动作，审批后才允许创建草稿或跟进任务。`,
          actionId: `agent-v5:submit-business-plan:${plan.id}`,
          riskLevel: 'medium' as const,
          impactSummary: '不会自动发送、群发、扣库存、创建订单或改客户资产。',
        }] : []),
      ],
      actions: plan?.id ? [{ label: '提交审批', action: `agent-v5:submit-business-plan:${plan.id}`, riskLevel: 'medium' }] : [],
    };
  }

  async submitBusinessPlan(input: {
    planId: number;
    runId: number;
    actor: AgentActor;
  }): Promise<AgentV5AdapterResult> {
    const result = await this.marketingService.submitLifecycleBusinessPlanActions(input.planId, input.actor.storeId, {
      sourceAgentCode: AGENT_V5_CODE,
      sourceRunId: input.runId,
      sourceEntrypoint: input.actor.entrypoint,
      approvalBoundary: 'drafts_followups_and_approval_only',
    }, input.actor.userId) as any;
    const approvalId = result?.approval?.id ?? result?.approvalId;
    const summary = result?.submitted
      ? `经营计划 #${input.planId} 已提交审批${approvalId ? `，审批单 #${approvalId}` : ''}。`
      : `经营计划 #${input.planId} 未提交成功：${result?.reason ?? '审批服务暂不可用'}`;
    return {
      status: result?.submitted ? 'draft' : 'failed',
      title: '经营计划审批提交',
      summary,
      data: result,
      evidence: {
        sources: ['LifecycleBusinessPlan', 'AgentApproval'],
        domains: ['business_plan', 'approval'],
        concepts: ['approval_action'],
        filters: [`planId=${input.planId}`, `sourceRunId=${input.runId}`, `sourceAgentCode=${AGENT_V5_CODE}`],
        sampleSize: result?.submitted ? 1 : 0,
        limitations: ['审批前不创建正式活动，不执行真实触达或资产/库存/订单写入。'],
      },
      renderedBlocks: [
        { kind: 'summary_text', title: '经营计划审批提交', content: summary },
        {
          kind: 'action_card',
          title: '等待人工审批',
          preview: '审批通过后仅允许创建活动草稿、自动规则草稿或终端跟进任务。',
          actionId: approvalId ? `approve:${approvalId}` : `agent-v5:approval:${input.planId}`,
          riskLevel: 'medium',
          impactSummary: '禁止自动发券、群发、扣库存、改客户资产、创建订单或改排班。',
        },
      ],
      actions: approvalId ? [{ label: '查看审批', action: `approve:${approvalId}`, riskLevel: 'medium' }] : [],
    };
  }

  async reviewAttribution(input: { actor: AgentActor }): Promise<AgentV5AdapterResult> {
    const page = await this.marketingService.getLifecycleAttribution({ page: 1, pageSize: 20 }, input.actor.storeId) as any;
    const items = this.asArray(page?.items ?? page?.data);
    const summary = items.length
      ? `已找到 ${page.total ?? items.length} 条生命周期归因事件，可按触达、行为、预约/核销/订单继续复盘。`
      : '当前暂无生命周期归因事件，可能尚未产生触达或还未重建归因。';
    return {
      status: items.length ? 'success' : 'no_data',
      title: '生命周期归因复盘',
      summary,
      data: page,
      evidence: {
        sources: ['LifecycleAttributionEvent'],
        domains: ['marketing', 'customer'],
        concepts: ['marketing_attribution'],
        filters: [`storeId=${input.actor.storeId}`],
        sampleSize: items.length,
        facts: items.slice(0, 10).map((item) => ({
          source: 'LifecycleAttributionEvent',
          id: item.id,
          label: item.eventType ?? item.type ?? 'attribution_event',
          value: item.recommendationKey ?? item.opportunityId ?? '',
          occurredAt: item.occurredAt ?? item.createdAt,
        })),
        limitations: ['归因为轻量证据链，先用于经营复盘，不作为财务结算依据。'],
      },
      renderedBlocks: [
        { kind: 'summary_text', title: '生命周期归因复盘', content: summary },
        ...this.tableBlocks(['事件', '客户', '机会', '时间'], items.slice(0, 10).map((item) => [
          item.eventType ?? item.type ?? '-',
          String(item.customerId ?? '-'),
          String(item.opportunityId ?? item.recommendationKey ?? '-'),
          String(item.occurredAt ?? item.createdAt ?? '-'),
        ]), '来源：LifecycleAttributionEvent'),
      ],
    };
  }

  async reviewQuality(input: { actor: AgentActor }): Promise<AgentV5AdapterResult> {
    const [quality, rules] = await Promise.all([
      this.marketingService.getLifecycleQuality(input.actor.storeId) as Promise<any>,
      this.marketingService.getLifecycleRules({ page: 1, pageSize: 20 }, input.actor.storeId) as Promise<any>,
    ]);
    const ruleItems = this.asArray(rules?.items ?? rules?.data);
    const summary = quality
      ? `生命周期本体质量：字段覆盖率 ${this.percent(quality.fieldCoverageRate)}，规则命中率 ${this.percent(quality.ruleHitRate)}，归因完整率 ${this.percent(quality.attributionCompletenessRate)}。`
      : '当前暂无生命周期质量快照，请先重建生命周期小本体。';
    return {
      status: quality ? 'success' : 'no_data',
      title: '本体质量与规则治理',
      summary,
      data: { quality, rules },
      evidence: {
        sources: ['CustomerLifecycleQualitySnapshot', 'CustomerLifecycleRuleVersion'],
        domains: ['governance', 'quality'],
        concepts: ['rule_version', 'quality_snapshot'],
        filters: [`storeId=${input.actor.storeId}`],
        sampleSize: ruleItems.length + (quality ? 1 : 0),
        metrics: {
          fieldCoverageRate: quality?.fieldCoverageRate ?? null,
          ruleHitRate: quality?.ruleHitRate ?? null,
          attributionCompletenessRate: quality?.attributionCompletenessRate ?? null,
        },
        limitations: ['P2 规则治理先提供版本、发布、回滚和质量指标解释，不做图谱编辑器。'],
      },
      renderedBlocks: [
        { kind: 'summary_text', title: '本体质量与规则治理', content: summary },
        ...(quality ? [
          { kind: 'kpi_card' as const, label: '字段覆盖率', value: this.percent(quality.fieldCoverageRate) },
          { kind: 'kpi_card' as const, label: '规则命中率', value: this.percent(quality.ruleHitRate) },
          { kind: 'kpi_card' as const, label: '归因完整率', value: this.percent(quality.attributionCompletenessRate) },
        ] : []),
      ],
    };
  }

  private opportunityBlocks(opportunities: any[]): AuraResponseBlock[] {
    if (!opportunities.length) {
      return [{ kind: 'data_gap', title: '暂无生命周期机会', message: '运行营销预测或重建生命周期小本体后会自动生成。', missingData: ['CustomerOpportunity'] }];
    }
    return this.tableBlocks(
      ['机会', '客户', '分数', '承接风险'],
      opportunities.map((item) => [
        this.labelOpportunity(item.opportunityType),
        String(item.customer?.name ?? item.customerName ?? item.customerId ?? '-'),
        String(item.score ?? '-'),
        [item.fulfillment?.inventoryReady === false ? '库存不足' : '', item.fulfillment?.capacityReady === false ? '产能不足' : ''].filter(Boolean).join('、') || '可评估',
      ]),
      '来源：CustomerOpportunity',
    );
  }

  private actionTableBlocks(actions: any[]): AuraResponseBlock[] {
    if (!actions.length) return [];
    return this.tableBlocks(['动作', '类型', '目标人数', '风险控制'], actions.map((action) => [
      action.title ?? action.name ?? '-',
      action.type ?? action.actionType ?? '-',
      String(action.targetCustomerCount ?? action.customerCount ?? '-'),
      action.riskControl ?? '审批后执行草稿',
    ]), '来源：LifecycleBusinessPlan.actionsJson');
  }

  private tableBlocks(columns: string[], rows: string[][], caption: string): AuraResponseBlock[] {
    return rows.length ? [{ kind: 'table', columns, rows, caption }] : [];
  }

  private labelOpportunity(type?: string) {
    const labels: Record<string, string> = {
      care_cycle_due: '护理周期到期',
      project_cycle_due: '项目护理周期到期',
      card_expiring: '次卡到期',
      dormant_winback: '沉睡召回',
      coupon_claimed_unused: '领券未核销',
      browse_abandonment: '浏览未预约',
      homecare_bundle: '居家护理组合',
      service_upgrade: '服务升级',
      project_idle_capacity: '低峰产能填充',
    };
    return labels[type ?? ''] ?? type ?? '生命周期机会';
  }

  private currentWeek() {
    const now = new Date();
    const firstDay = new Date(Date.UTC(now.getFullYear(), 0, 1));
    const day = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - firstDay.getTime()) / 86400000);
    return `${now.getFullYear()}-W${String(Math.ceil((day + firstDay.getUTCDay() + 1) / 7)).padStart(2, '0')}`;
  }

  private percent(value: unknown) {
    const numeric = Number(value ?? 0);
    return `${Math.round(numeric * 100)}%`;
  }

  private asArray(value: unknown): any[] {
    return Array.isArray(value) ? value : [];
  }
}
