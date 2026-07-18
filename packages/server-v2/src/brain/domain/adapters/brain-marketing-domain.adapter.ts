import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BrainSkillRuntimeService } from '../../skills/brain-skill-runtime.service.js';
import { BrainActionConfirmationService } from '../../skills/brain-action-confirmation.service.js';
import { BrainCustomerFactResolverService } from '../brain-customer-fact-resolver.service.js';
import type { BrainDomainAdapter, BrainDomainAdapterExecution, BrainDomainAnswer } from '../brain-domain-adapter.types.js';
import { BrainTimeRangeParserService } from '../../cognition/brain-time-range-parser.service.js';
import { defaultBrainDateRange, formatBrainMoney, formatBrainPercent } from '../brain-domain-formatters.js';
import { BrainActionTargetResolverService } from '../brain-action-target-resolver.service.js';
import { BrainPredictionSkillsService } from '../../skills/brain-prediction-skills.service.js';
import { GapOpportunityService } from '../../../scheduling/gap-opportunity.service.js';

type GapFillPreviewCandidate = {
  customerId: number;
  customerName?: string;
  projectName?: string;
  score?: number;
  recommendedChannel?: string;
  messageDraft?: string;
  reasons?: unknown[];
  risks?: unknown[];
};

type GapFillPreviewOpportunity = {
  date: string;
  startTime: string;
  endTime: string;
  candidates?: GapFillPreviewCandidate[];
};

@Injectable()
export class BrainMarketingDomainAdapter implements BrainDomainAdapter {
  readonly key = 'marketing_growth' as const;
  readonly role = 'marketing' as const;
  readonly requiredPermissions = ['core:marketing:create'];

  constructor(
    private readonly skillRuntime: BrainSkillRuntimeService,
    private readonly customerFacts: BrainCustomerFactResolverService,
    private readonly timeRangeParser: BrainTimeRangeParserService,
    private readonly actionConfirmationService: BrainActionConfirmationService,
    @Optional() private readonly actionTargets?: BrainActionTargetResolverService,
    @Optional() private readonly predictionSkills?: BrainPredictionSkillsService,
    @Optional() private readonly gapOpportunities?: GapOpportunityService,
  ) {}

  canHandle(plan: BrainDomainAdapterExecution['plan']) {
    return plan.adapterKey === this.key;
  }

  async execute(input: BrainDomainAdapterExecution): Promise<BrainDomainAnswer | undefined> {
    if (input.plan.capabilityKey === 'gap_fill_touch_preview') return this.previewGapFillTouch(input);
    if (input.plan.capabilityKey === 'marketing_touch_draft') return this.previewDirectTouch(input);
    const message = input.dto.message;
    if (/(流失|复购|响应|客户价值|ltv).*(预测|概率|风险|评分)|预测.*(流失|复购|响应|客户价值|ltv)/i.test(message)) {
      return this.answerCustomerPrediction(input);
    }
    if (this.isDirectTouchAction(input)) return this.previewDirectTouch(input);
    if (this.isAutomationRulePreview(message)) {
      const rule = this.buildAutomationRulePreview(message);
      return {
        status: 'completed',
        answer: `营销自动化规则预览：${rule.name}。触发条件：${rule.trigger}；执行动作：${rule.action}；保护条件：${rule.guardrails}。自动化规则发布能力尚未开放，因此当前不会生成不可执行的确认按钮。`,
        citations: [{ sourceType: 'skill', sourceId: 'marketing_automation_rule_preview', label: '营销自动化规则预览' }],
        suggestedActions: [],
        grounding: 'preview_action',
        metadata: { adapterKey: this.key, ruleType: rule.type, unsupportedReason: 'automation_rule_publish_not_open' },
      };
    }
    if (/(活动.*收入|归因收入|投产|roi|转化率|渠道质量|渠道.*效果|活动复盘|自动化规则|自动跟进|自动提醒|触达规则)/i.test(message)) {
      const parsed = this.timeRangeParser.parse(message);
      const range = parsed.range ?? defaultBrainDateRange();
      const analytics = await this.skillRuntime.buildMarketingAnalytics({
        storeId: input.context.storeId,
        startDate: range.startDate,
        endDate: range.endDate,
      });
      const coverageLabel = analytics.dataCoverage.touchesTruncated
        ? `前 ${analytics.dataCoverage.touchSampleSize} 条触达样本`
        : `${analytics.reachedCount} 条触达记录`;
      const channelLines = analytics.channels.length
        ? analytics.channels.map((item, index) => `${index + 1}. ${item.channel}：触达 ${item.reached}，转化 ${item.converted}，转化率 ${formatBrainPercent(item.conversionRate)}，收入 ${formatBrainMoney(item.revenue)}`).join('\n')
        : '当前没有渠道触达记录。';
      const strategyLines = analytics.strategies.length
        ? analytics.strategies.map((item, index) => `${index + 1}. ${item.name}（${item.status}，${item.executionType}）`).join('\n')
        : '当前门店没有已运行过的自动化策略。';
      return {
        status: 'completed',
        answer: `${range.label}营销分析：${coverageLabel}，样本内转化 ${analytics.convertedCount} 人，转化率 ${formatBrainPercent(analytics.conversionRate)}，归因收入 ${formatBrainMoney(analytics.attributedRevenue)}。\n渠道表现：\n${channelLines}\n自动化策略：\n${strategyLines}\n当前 schema 没有统一活动成本事实，因此不计算虚假的 ROI；录入成本后才能用归因收入/成本计算。${analytics.dataCoverage.touchesTruncated || analytics.dataCoverage.attributionsTruncated ? '\n当前明细达到读取上限，上述触达、转化或归因是受控样本，不代表完整总量。' : ''}`,
        citations: [{ sourceType: 'skill', sourceId: 'marketing_attribution_analytics', label: '营销触达、转化与归因分析' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key, rangeLabel: range.label, costStatus: 'not_modelled', dataCoverage: analytics.dataCoverage },
      };
    }
    if (
      (input.plan.intent === 'list' ||
        input.plan.intent === 'diagnosis' ||
        /(客户分层|客群|名单|哪些客户|找一下|响应.*客户|沉睡客户|流失客户|召回客户|消费很多|消费金额|消失|没来|重要客户|特别关注|优惠.*敏感|等打折|打折才来|基础项目|升单|疗程快结束|续购|新客.*渠道|渠道.*新客|新客最多|时间段.*新客|新客.*潜力.*长期|项目.*感兴趣.*(?:还没办卡|未办卡|没有办卡))/.test(
          message,
        )) &&
      !/(写|文案|话术|短信|消息)/.test(message)
    ) {
      const answer = await this.customerFacts.answerCustomerFactQuestion({
        storeId: input.context.storeId,
        message,
      });
      return {
        status: 'completed' as const,
        answer,
        citations: [{ sourceType: 'skill', sourceId: 'marketing_customer_segment_summary', label: '营销客群摘要' }],
        grounding: 'db_skill' as const,
        metadata: { adapterKey: this.key },
      };
    }

    if (input.plan.intent === 'draft' || /(写|生成|编辑|拟一|拟个|文案|话术|短信|消息|通知|朋友圈|小红书)/.test(message)) {
      const answer = /召回|沉默|沉睡|没来|流失/.test(message)
        ? this.skillRuntime.draftCustomerRecall({})
        : this.skillRuntime.draftAppointmentReminder({});
      return {
        status: 'completed' as const,
        answer,
        citations: [{ sourceType: 'skill', sourceId: 'marketing_draft_appointment_reminder', label: '营销文案草稿' }],
        grounding: 'template_skill' as const,
        metadata: { adapterKey: this.key },
      };
    }

    const answer = this.skillRuntime.draftCampaignPlan({
      theme: /母亲节/.test(message) ? '母亲节' : /国庆/.test(message) ? '国庆' : undefined,
    });
    return {
      status: 'completed' as const,
      answer,
      citations: [{ sourceType: 'skill', sourceId: 'marketing_campaign_plan', label: '营销活动方案' }],
      grounding: 'template_skill' as const,
      metadata: { adapterKey: this.key },
    };
  }

  private async answerCustomerPrediction(input: BrainDomainAdapterExecution): Promise<BrainDomainAnswer> {
    if (!input.context.permissions.includes('*') && !input.context.permissions.includes('core:marketing:analytics')) {
      throw new ForbiddenException('missing_permission:core:marketing:analytics');
    }
    if (!this.actionTargets || !this.predictionSkills) return this.actionClarification('预测查询服务未就绪，请稍后重试。');
    const customer = await this.actionTargets.resolveCustomer({ storeId: input.context.storeId, message: input.dto.message });
    if (!customer.ok) return this.actionClarification(customer.message);
    const prediction = await this.predictionSkills.getCustomerPrediction({ storeId: input.context.storeId, customerId: customer.value.id });
    if (prediction.status === 'missing') {
      return {
        status: 'completed',
        answer: `${customer.value.name}当前没有预测快照。${prediction.boundary}`,
        citations: [],
        grounding: 'none',
        metadata: { adapterKey: this.key, unsupportedReason: 'prediction_snapshot_missing' },
      };
    }
    if (prediction.status === 'stale') {
      return {
        status: 'completed',
        answer: `${customer.value.name}的预测快照已过期。模型 ${prediction.modelVersion}，生成于 ${prediction.generatedAt}，距今 ${prediction.ageDays} 天。${prediction.boundary}`,
        citations: [{ sourceType: 'prediction', sourceId: String(prediction.snapshotId), label: '已过期客户预测快照' }],
        grounding: 'db_skill',
        metadata: { adapterKey: this.key, predictionStatus: 'stale', modelVersion: prediction.modelVersion },
      };
    }
    const reasons = prediction.reasons.length ? prediction.reasons.map(String).join('；') : '模型未记录可展示的主要原因';
    const actions = prediction.recommendedActions.length ? prediction.recommendedActions.map(String).join('；') : '先由员工复核实时客户状态，再决定是否跟进';
    return {
      status: 'completed',
      answer: `${prediction.customerName}客户预测（不是确定事实）：流失风险 ${(prediction.churn.score * 100).toFixed(0)}%（${prediction.churn.level}），30 天复购评分 ${(prediction.repurchase30d.score * 100).toFixed(0)}%，营销响应评分 ${(prediction.marketingResponse.score * 100).toFixed(0)}%，6 个月客户价值 ${prediction.customerValue.ltv6m.toFixed(2)} 元，12 个月客户价值 ${prediction.customerValue.ltv12m.toFixed(2)} 元（${prediction.customerValue.tier}）。生命周期阶段：${prediction.lifecycleStage ?? '未记录'}。\n模型版本：${prediction.modelVersion}；生成时间：${prediction.generatedAt}；主要依据：${reasons}。\n建议：${actions}。${prediction.boundary}`,
      citations: [{ sourceType: 'prediction', sourceId: String(prediction.snapshotId), label: `客户预测快照 ${prediction.modelVersion}` }],
      grounding: 'db_skill',
      metadata: {
        adapterKey: this.key,
        predictionStatus: 'available',
        modelVersion: prediction.modelVersion,
        generatedAt: prediction.generatedAt,
        snapshotId: prediction.snapshotId,
      },
    };
  }

  private isDirectTouchAction(input: BrainDomainAdapterExecution) {
    const message = input.dto.message;
    return !this.isAutomationRulePreview(message) && (input.plan.intent === 'action' || /(给|为).*(客户|女士|先生).*(创建|生成|发起).*(触达|提醒|召回|消息任务)/.test(message));
  }

  private async previewDirectTouch(input: BrainDomainAdapterExecution): Promise<BrainDomainAnswer> {
    if (!input.context.permissions.includes('*') && !input.context.permissions.includes('core:marketing:create')) {
      throw new ForbiddenException('missing_permission:core:marketing:create');
    }
    if (!this.actionTargets) return this.actionClarification('动作目标解析服务未就绪，请稍后重试。');
    const message = input.dto.message;
    const customer = await this.actionTargets.resolveCustomer({ storeId: input.context.storeId, message });
    if (!customer.ok) return this.actionClarification(customer.message);
    const script = /召回|沉睡|没来|流失/.test(message)
      ? this.skillRuntime.draftCustomerRecall({})
      : this.skillRuntime.draftAppointmentReminder({});
    const summary = `创建营销触达任务草稿：${customer.value.name}；渠道为人工电话/消息复核，不会自动群发。`;
    const confirmation = await this.actionConfirmationService.createPreview({
      runId: input.runId,
      userId: input.context.userId,
      storeId: input.context.storeId,
      skillKey: 'create_marketing_touch_draft',
      planId: input.plan.executionPlanId,
      riskLevel: 'medium',
      preview: {
        actionType: 'create_marketing_touch_draft',
        summary,
        riskLevel: 'medium',
        impactItems: [{ objectType: 'customer', objectId: String(customer.value.id), label: customer.value.name }],
      } as Prisma.InputJsonValue,
      payload: {
        customerId: customer.value.id,
        title: 'Ami Brain 营销触达草稿',
        script,
        note: script,
        channel: 'phone',
        sourceMessage: message,
      } as Prisma.InputJsonValue,
    });
    return {
      status: 'completed',
      answer: `${summary}\n${script}`,
      citations: [{ sourceType: 'skill', sourceId: 'marketing_touch_action_preview', label: '营销触达任务预览' }],
      suggestedActions: [{
        actionId: confirmation.actionId,
        actionType: 'create_marketing_touch_draft',
        riskLevel: 'medium',
        requiresConfirmation: true,
        summary,
      }],
      grounding: 'preview_action',
      metadata: { adapterKey: this.key },
    };
  }

  private async previewGapFillTouch(input: BrainDomainAdapterExecution): Promise<BrainDomainAnswer> {
    this.assertPermission(input, 'core:store:scheduling');
    this.assertPermission(input, 'core:marketing:create');
    if (!this.gapOpportunities) return this.actionClarification('空档机会预览服务未就绪，请稍后重试。', 'capability_not_open');

    const parsed = this.timeRangeParser.parse(input.dto.message);
    const range = parsed.range ?? this.tomorrowRange();
    const preview = await this.gapOpportunities.preview({
      storeId: input.context.storeId,
      startDate: range.startDate,
      endDate: range.endDate,
      opportunityLimit: 3,
      candidateLimit: 3,
    });
    const opportunities = (preview.opportunities ?? []) as GapFillPreviewOpportunity[];
    if (!opportunities.length) {
      return this.gapNoAction(`${range.label}没有可补位的预约空档，本次未生成触达任务。`, 'appointment_gap_missing');
    }
    const selectedOpportunity = opportunities.find((item) => Array.isArray(item.candidates) && item.candidates.length > 0);
    const selectedCandidate = selectedOpportunity?.candidates?.[0];
    if (!selectedOpportunity || !selectedCandidate) {
      return this.gapNoAction(
        `${range.label}存在预约空档，但没有通过冷却期、联系方式和预约冲突校验的候选客户。`,
        'gap_candidate_missing',
      );
    }

    const appointmentWindow = `${selectedOpportunity.date} ${selectedOpportunity.startTime}-${selectedOpportunity.endTime}`;
    const script = String(selectedCandidate.messageDraft ?? '').trim();
    const customerName = String(selectedCandidate.customerName ?? '候选客户');
    const projectName = String(selectedCandidate.projectName ?? '适配护理项目');
    const summary = `为空档 ${appointmentWindow} 创建 ${customerName} 的触达任务草稿；推荐项目 ${projectName}；不会自动发送或修改预约。`;
    const action = await this.actionConfirmationService.createPreview({
      runId: input.runId,
      userId: input.context.userId,
      storeId: input.context.storeId,
      skillKey: 'create_marketing_touch_draft',
      planId: input.plan.executionPlanId,
      riskLevel: 'medium',
      preview: {
        actionType: 'create_marketing_touch_draft',
        summary,
        riskLevel: 'medium',
        impactItems: [
          { objectType: 'customer', objectId: String(selectedCandidate.customerId), label: customerName },
          { objectType: 'appointment_gap', objectId: `${selectedOpportunity.date}:${selectedOpportunity.startTime}`, label: appointmentWindow },
        ],
        risks: [
          ...(Array.isArray(selectedCandidate.risks) ? selectedCandidate.risks.map(String) : []),
          '确认后仅创建人工跟进任务，不会发送消息或创建预约。',
        ],
      } as Prisma.InputJsonValue,
      payload: {
        customerId: Number(selectedCandidate.customerId),
        title: `空档补位邀约：${appointmentWindow}`,
        script,
        note: `Ami Brain 自动匹配；候选分 ${Number(selectedCandidate.score ?? 0)}；${summary}`,
        channel: String(selectedCandidate.recommendedChannel ?? 'phone'),
      } as Prisma.InputJsonValue,
    });
    const suggestedAction = {
      actionId: action.actionId,
      actionType: 'create_marketing_touch_draft',
      riskLevel: 'medium',
      requiresConfirmation: true,
      summary,
    };
    const rows = opportunities.flatMap((opportunity) =>
      (opportunity.candidates ?? []).slice(0, 3).map((candidate) => ({
        appointmentWindow: `${opportunity.date} ${opportunity.startTime}-${opportunity.endTime}`,
        customer: candidate.customerName,
        project: candidate.projectName,
        score: candidate.score,
        channel: candidate.recommendedChannel,
        reason: Array.isArray(candidate.reasons) ? candidate.reasons.slice(0, 2).join('；') : '',
      })),
    );
    return {
      status: 'completed',
      answer: `${range.label}识别到 ${preview.summary.opportunityCount} 个可补位空档、${preview.summary.candidateCount} 个候选匹配。已按已发布评分规则选择 ${customerName}，候选分 ${Number(selectedCandidate.score ?? 0)}。\n${summary}\n邀约草稿：${script}`,
      citations: [{ sourceType: 'db_skill', sourceId: 'gap_opportunity_readonly_preview', label: '排班、预约与空档候选匹配预览' }],
      suggestedActions: [suggestedAction],
      grounding: 'preview_action',
      blocks: [
        {
          kind: 'table',
          rows,
          columns: ['appointmentWindow', 'customer', 'project', 'score', 'channel', 'reason'],
          citationIds: ['gap_opportunity_readonly_preview'],
        },
        { kind: 'action_preview', actions: [suggestedAction] },
        { kind: 'limitations', items: ['自动选择仅生成触达任务草稿；用户确认前不写业务任务、不发送消息、不创建或修改预约。'] },
      ],
      metadata: {
        adapterKey: this.key,
        capabilityKey: 'gap_fill_touch_preview',
        rangeLabel: range.label,
        selectedCustomerId: selectedCandidate.customerId,
        selectedOpportunity: appointmentWindow,
        selectionPolicy: 'GapOpportunityService published scoring and safety filters',
        businessDataPersisted: false,
      },
    };
  }

  private assertPermission(input: BrainDomainAdapterExecution, permission: string) {
    if (!input.context.permissions.includes('*') && !input.context.permissions.includes(permission)) {
      throw new ForbiddenException(`missing_permission:${permission}`);
    }
  }

  private tomorrowRange() {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);
    return { label: '明天', preset: 'tomorrow', startDate, endDate };
  }

  private actionClarification(answer: string, unsupportedReason = 'action_target_requires_clarification'): BrainDomainAnswer {
    return {
      status: 'completed',
      answer,
      citations: [],
      suggestedActions: [],
      grounding: 'none',
      metadata: { adapterKey: this.key, unsupportedReason },
    };
  }

  private gapNoAction(answer: string, noActionReason: string): BrainDomainAnswer {
    return {
      status: 'completed',
      answer,
      citations: [{ sourceType: 'db_skill', sourceId: 'gap_opportunity_readonly_preview', label: '排班、预约与空档候选匹配预览' }],
      suggestedActions: [],
      grounding: 'db_skill',
      blocks: [
        {
          kind: 'table',
          rows: [],
          columns: ['appointmentWindow', 'customer', 'project', 'score', 'channel'],
          citationIds: ['gap_opportunity_readonly_preview'],
        },
        { kind: 'limitations', items: ['没有真实空档或合格候选时不生成确认按钮、不创建任务、不发送消息。'] },
      ],
      metadata: { adapterKey: this.key, capabilityKey: 'gap_fill_touch_preview', noActionReason, businessDataPersisted: false },
    };
  }

  private isAutomationRulePreview(message: string) {
    return /(设置|创建|新建|设计|做一个|能不能).*(自动|规则|流程)|自动.*(送|跟进|提醒|推荐|升级|复盘|推送)/.test(message);
  }

  private buildAutomationRulePreview(message: string) {
    if (/新客.*三天|三天后.*跟进/.test(message)) {
      return { type: 'new_customer_follow_up', name: '新客到店 3 天后跟进', trigger: '客户首次到店完成后第 3 天', action: '创建前台/客服跟进任务草稿', guardrails: '同一客户 30 天内最多触发 1 次，不直接发送消息' };
    }
    if (/疗程.*结束|疗程.*快结束|续购/.test(message)) {
      return { type: 'treatment_renewal', name: '疗程临近结束提醒', trigger: '卡项剩余次数或有效期达到门槛', action: '创建续购提醒任务和话术草稿', guardrails: '先校验卡状态与客户退订偏好，不自动发券' };
    }
    if (/活动后.*复盘|自动复盘/.test(message)) {
      return { type: 'campaign_review', name: '活动结束后复盘', trigger: '活动结束后次日', action: '生成触达、转化和归因收入复盘任务', guardrails: '缺少活动成本时不计算 ROI' };
    }
    if (/升级会员|会员等级/.test(message)) {
      return { type: 'membership_upgrade', name: '消费达标会员升级', trigger: '客户累计消费达到配置门槛', action: '创建会员升级审核任务', guardrails: '只生成审核任务，不直接修改会员等级' };
    }
    if (/生日/.test(message)) {
      return { type: 'birthday_care', name: '生日关怀提醒', trigger: '客户生日当天', action: '创建生日关怀和礼物审核任务', guardrails: '礼物和权益需先校验预算与客户授权' };
    }
    return { type: 'customer_lifecycle', name: '客户生命周期自动跟进', trigger: '满足已配置客户行为条件', action: '创建跟进或推荐任务草稿', guardrails: '不自动群发、不自动改权益、不跨门店触达' };
  }
}
