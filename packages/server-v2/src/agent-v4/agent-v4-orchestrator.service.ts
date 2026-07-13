import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentWorkflowRuntimeService } from '../agent/agent-workflow-runtime.service.js';
import type { AgentActor, AgentEvidence, AgentPlan, AgentRunResult, AgentRunStatus, AgentSuggestedAction, AuraResponseBlock } from '../agent/agent.types.js';
import { MarketingService } from '../marketing/marketing.service.js';
import { AgentV3ControlledTextToSqlService, type AgentV3TextToSqlResult } from '../agent-v3/text-to-sql/index.js';

type AgentV4Intent =
  | 'readonly_query'
  | 'lifecycle_diagnosis'
  | 'business_plan'
  | 'submit_business_plan'
  | 'attribution_review'
  | 'quality_review';

type AgentV4ProcessResult = {
  answer: string;
  renderedBlocks: AuraResponseBlock[];
  actions?: AgentSuggestedAction[];
  evidence?: AgentEvidence;
  status?: AgentRunStatus;
};

const AGENT_V4_CODE = 'agent_v4';
const AGENT_V4_ARCHITECTURE = 'agent_v4_lifecycle_business_agent';

@Injectable()
export class AgentV4OrchestratorService {
  constructor(
    private readonly runtime: AgentWorkflowRuntimeService,
    private readonly textToSql: AgentV3ControlledTextToSqlService,
    private readonly marketingService: MarketingService,
  ) {}

  async createRun(input: { message: string; actor: AgentActor; context?: Record<string, unknown> }): Promise<AgentRunResult> {
    const context = this.withAgentV4Context(input.context);
    const run = await this.runtime.createRun({
      ...input,
      context,
      agentCode: AGENT_V4_CODE,
    });
    await this.runtime.addMessage(run.id, 'user', input.message, {
      entrypoint: input.actor.entrypoint,
      personaCode: input.actor.personaCode,
      architecture: AGENT_V4_ARCHITECTURE,
    });
    return this.processRun({ run, message: input.message, actor: input.actor, context });
  }

  async appendMessage(input: {
    runId: number;
    message: string;
    actor: AgentActor;
    context?: Record<string, unknown>;
  }): Promise<AgentRunResult> {
    const run = await this.runtime.getRun(input.runId);
    if (!run) throw new NotFoundException('Agent V4 run not found');
    if (run.agentCode !== AGENT_V4_CODE) throw new ForbiddenException('该运行记录不属于 Agent V4');
    if (Number(run.storeId) !== Number(input.actor.storeId)) throw new ForbiddenException('Agent V4 run store mismatch');
    const context = this.withAgentV4Context({
      ...(this.asObject(run.contextJson) ?? {}),
      ...(input.context ?? {}),
    });
    await this.runtime.addMessage(input.runId, 'user', input.message, {
      entrypoint: input.actor.entrypoint,
      personaCode: input.actor.personaCode,
      architecture: AGENT_V4_ARCHITECTURE,
    });
    return this.processRun({ run, message: input.message, actor: input.actor, context });
  }

  findRuns(query: {
    page?: number | string;
    pageSize?: number | string;
    status?: string;
    role?: string;
    personaCode?: string;
    entrypoint?: string;
    keyword?: string;
    storeId?: number;
  }) {
    return this.runtime.findRuns({ ...query, agentCode: AGENT_V4_CODE });
  }

  async getRun(id: number, storeId?: number) {
    const run = await this.runtime.getRun(id);
    return this.assertAgentV4Run(run, storeId);
  }

  async getRunDetail(id: number, storeId?: number) {
    const detail = await this.runtime.getRunDetail(id, storeId);
    if (!detail.run) return detail;
    this.assertAgentV4Run(detail.run, storeId);
    return detail;
  }

  private async processRun(input: {
    run: any;
    message: string;
    actor: AgentActor;
    context?: Record<string, unknown>;
  }): Promise<AgentRunResult> {
    const runId = Number(input.run.id);
    const startedAt = new Date();
    const intent = this.resolveIntent(input.message, input.context);
    const plan = this.buildPlan(input.message, intent);
    await this.runtime.persistPlan(runId, plan);
    await this.runtime.setRunStatus(runId, 'validating');

    try {
      const result: AgentV4ProcessResult = intent === 'readonly_query'
        ? await this.handleReadOnlyQuery(input)
        : await this.handleLifecycleIntent(input, intent);

      await this.runtime.recordStep({
        runId,
        stepType: intent === 'readonly_query' ? 'text_to_sql' : 'lifecycle_business',
        name: intent === 'readonly_query' ? 'agent.v4.via_agent_v3_text_to_sql' : `agent.v4.${intent}`,
        status: 'success',
        inputJson: {
          message: input.message,
          role: input.actor.role,
          personaCode: input.actor.personaCode,
          architecture: AGENT_V4_ARCHITECTURE,
          intent,
        },
        outputJson: {
          evidence: result.evidence,
          renderedBlockKinds: result.renderedBlocks?.map((block) => block.kind),
        },
        startedAt,
        endedAt: new Date(),
      });

      await this.runtime.addMessage(runId, 'assistant', result.answer, {
        responseMode: 'structured_blocks',
        architecture: AGENT_V4_ARCHITECTURE,
        intent,
      });
      const updated = await this.runtime.setRunStatus(runId, result.status ?? 'completed', {
        resultJson: this.toJson({
          answer: result.answer,
          plan,
          renderedBlocks: result.renderedBlocks,
          evidence: result.evidence,
          actions: result.actions,
          architecture: AGENT_V4_ARCHITECTURE,
          intent,
        }),
        evidenceJson: this.toJson(result.evidence),
      });

      return {
        runId: Number(updated.id),
        runNo: String(updated.runNo),
        status: updated.status,
        plan,
        answer: result.answer,
        toolResults: [],
        actions: result.actions ?? [],
        evidence: result.evidence,
        responseMode: 'structured_blocks',
        personaCode: updated.personaCode ?? null,
        renderedBlocks: result.renderedBlocks,
        phaseOutputs: [{
          phase: intent === 'business_plan' || intent === 'submit_business_plan' ? 'action_draft' : 'core_conclusion',
          title: this.phaseTitle(intent),
          summary: result.answer,
          blockKinds: result.renderedBlocks?.map((block) => block.kind) as AuraResponseBlock['kind'][] | undefined,
          actionLabels: result.actions?.map((action) => action.label),
        }],
        followUpSuggestions: this.followUps(intent),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'agent_v4_failed';
      await this.runtime.recordStep({
        runId,
        stepType: 'lifecycle_business',
        name: `agent.v4.${intent}`,
        status: 'failed',
        inputJson: { message: input.message, intent },
        outputJson: { error: message },
        startedAt,
        endedAt: new Date(),
      });
      await this.runtime.addMessage(runId, 'assistant', `Agent V4 执行失败：${message}`, {
        responseMode: 'structured_blocks',
        architecture: AGENT_V4_ARCHITECTURE,
        intent,
      });
      const updated = await this.runtime.setRunStatus(runId, 'failed', { errorMessage: message });
      return {
        runId: Number(updated.id),
        runNo: String(updated.runNo),
        status: updated.status,
        plan,
        answer: `Agent V4 执行失败：${message}`,
        toolResults: [],
        actions: [],
        responseMode: 'structured_blocks',
        renderedBlocks: [{ kind: 'data_gap', title: 'Agent V4 执行失败', message, missingData: ['请检查生命周期本体数据和权限配置。'] }],
      };
    }
  }

  private async handleReadOnlyQuery(input: {
    message: string;
    actor: AgentActor;
    context?: Record<string, unknown>;
  }): Promise<AgentV4ProcessResult> {
    const result = await this.textToSql.run({
      question: input.message,
      userId: input.actor.userId,
      storeIds: [input.actor.storeId].filter((value) => Number.isFinite(value)),
      permissions: input.actor.permissions ?? [],
      roleCodes: [input.actor.role, input.actor.personaCode].filter((value): value is string => Boolean(value)),
      fieldScopes: input.actor.fieldScopes,
      runtimeContext: {
        ...(input.context ?? {}),
        architecture: AGENT_V4_ARCHITECTURE,
        readOnlyVia: 'agent_v3_text_to_sql',
      },
      mode: input.context?.agentV4Mode === 'execute' ? 'execute' : 'dry_run',
    });
    const answer = result.answer ?? this.textToSqlFallback(result);
    const renderedBlocks = this.buildTextToSqlBlocks(result);
    return {
      answer,
      renderedBlocks,
      actions: [],
      evidence: this.toAgentEvidence(result),
      status: result.status === 'failed' ? 'failed' : 'completed',
    };
  }

  private async handleLifecycleIntent(input: {
    run: any;
    message: string;
    actor: AgentActor;
    context?: Record<string, unknown>;
  }, intent: Exclude<AgentV4Intent, 'readonly_query'>): Promise<AgentV4ProcessResult> {
    if (intent === 'business_plan') return this.createBusinessPlan(input);
    if (intent === 'submit_business_plan') return this.submitBusinessPlan(input);
    if (intent === 'attribution_review') return this.reviewAttribution(input);
    if (intent === 'quality_review') return this.reviewQuality(input);
    return this.diagnoseLifecycle(input);
  }

  private async diagnoseLifecycle(input: { actor: AgentActor; message: string }): Promise<AgentV4ProcessResult> {
    const opportunitiesPage = await this.marketingService.getLifecycleOpportunities({ page: 1, pageSize: 20, status: 'open' }, input.actor.storeId) as any;
    const serviceCyclesPage = await this.marketingService.getLifecycleServiceCycles({ page: 1, pageSize: 10, dueOnly: true }, input.actor.storeId) as any;
    const opportunities = this.asArray(opportunitiesPage?.items ?? opportunitiesPage?.data);
    const serviceCycles = this.asArray(serviceCyclesPage?.items ?? serviceCyclesPage?.data);
    const topOpportunities = opportunities.slice(0, 8);
    const evidence = this.uniqueStrings(topOpportunities.flatMap((item) => this.asStringArray(item.evidence)).slice(0, 8));
    const answer = topOpportunities.length
      ? `Agent V4 已识别 ${opportunitiesPage.total ?? opportunities.length} 个客户生命周期机会，优先处理 ${this.labelOpportunity(topOpportunities[0]?.opportunityType)} 等高分机会。`
      : '当前暂无可用生命周期机会。请先运行营销预测或重建客户生命周期小本体。';
    return {
      answer,
      actions: topOpportunities.length ? [{ label: '生成本周经营计划', action: 'agent-v4:business-plan', riskLevel: 'medium' as const }] : [],
      evidence: this.lifecycleEvidence({
        sources: ['CustomerOpportunity', 'CustomerServiceCycleState', 'CustomerOpportunityFulfillmentCheck'],
        sampleSize: opportunities.length,
        filters: ['status=open', `storeId=${input.actor.storeId}`],
        limitations: ['V4 只生成建议和草稿，不直接触达客户。'],
      }),
      renderedBlocks: [
        { kind: 'summary_text', content: answer },
        ...this.kpiBlocks([
          ['生命周期机会', String(opportunitiesPage.total ?? opportunities.length), 'open'],
          ['到期服务周期', String(serviceCycles.length), 'dueOnly'],
          ['高优先级机会', String(topOpportunities.filter((item) => item.priority === 'P0').length), 'P0'],
        ]),
        ...(topOpportunities.length ? [{
          kind: 'table' as const,
          columns: ['机会', '客户', '优先级', '分数', '承接风险'],
          rows: topOpportunities.map((item) => [
            this.labelOpportunity(item.opportunityType),
            String(item.customer?.name ?? item.customerId ?? '-'),
            String(item.priority ?? '-'),
            String(item.score ?? '-'),
            this.fulfillmentLabel(item.fulfillment),
          ]),
          caption: 'Agent V4 基于客户生命周期小本体读取机会，不直接执行营销动作。',
        }] : [{
          kind: 'data_gap' as const,
          title: '暂无生命周期机会',
          message: '当前门店没有可展示的生命周期机会。',
          missingData: ['CustomerLifecycleSnapshot', 'CustomerOpportunity'],
          nextSteps: ['运行营销预测', '手动重建生命周期小本体'],
        }]),
        {
          kind: 'evidence_panel' as const,
          sources: ['CustomerOpportunity', 'CustomerServiceCycleState'],
          metricDefinition: '客户生命周期服务营销小本体机会与服务周期',
          limitations: ['只读诊断，不自动发券、不群发、不改库存/订单/客户资产。', ...evidence.slice(0, 2)],
        },
      ] as AuraResponseBlock[],
    };
  }

  private async createBusinessPlan(input: { run: any; actor: AgentActor; message: string }): Promise<AgentV4ProcessResult> {
    const plan = await this.marketingService.createLifecycleBusinessPlan({
      storeId: input.actor.storeId,
      title: 'Agent V4 客户生命周期经营周计划',
      goalsJson: {
        objective: input.message,
        sourceAgentCode: AGENT_V4_CODE,
        sourceRunId: Number(input.run.id),
      },
    }, input.actor.storeId, input.actor.userId) as any;
    const actions = this.asArray(plan.actionsJson);
    const evidence = this.asStringArray(plan.evidenceJson);
    const answer = plan?.id
      ? `已生成 Agent V4 经营计划草稿 #${plan.id}，包含 ${actions.length} 个待审批动作。`
      : `经营计划生成失败：${plan?.reason ?? 'unknown_reason'}`;
    return {
      answer,
      actions: plan?.id ? [{ label: '提交经营计划审批', action: `agent-v4:submit-business-plan:${plan.id}`, riskLevel: 'medium' as const }] : [],
      evidence: this.lifecycleEvidence({
        sources: ['LifecycleBusinessPlan', 'CustomerOpportunity'],
        sampleSize: actions.length,
        filters: [`storeId=${input.actor.storeId}`],
        limitations: ['计划是草稿；审批后也只允许创建活动草稿、自动规则草稿或终端跟进任务。'],
      }),
      renderedBlocks: [
        { kind: 'summary_text', content: answer },
        ...this.kpiBlocks([
          ['待审批动作', String(actions.length), plan.status ?? 'draft'],
          ['计划状态', String(plan.status ?? '-'), plan.planPeriod ?? '-'],
        ]),
        {
          kind: 'table' as const,
          columns: ['动作', '类型', '目标人数', '风险控制'],
          rows: actions.slice(0, 8).map((action) => [
            String(action.title ?? action.objective ?? '生命周期经营动作'),
            String(action.type ?? action.actionType ?? '-'),
            String(action.targetCustomerCount ?? action.customerCount ?? '-'),
            this.asStringArray(action.riskControls ?? action.risks).join('；') || '审批后执行草稿',
          ]),
          caption: '经营计划动作只进入审批和草稿链路。',
        },
        ...(plan?.id ? [{
          kind: 'action_card' as const,
          title: '提交经营计划动作审批',
          preview: `提交计划 #${plan.id} 的 ${actions.length} 个动作，审批后仅允许创建草稿或跟进任务。`,
          actionId: `agent-v4:submit-business-plan:${plan.id}`,
          riskLevel: 'medium' as const,
          impactSummary: '不会直接发券、群发、改资产、扣库存或创建订单。',
        }] : []),
        {
          kind: 'evidence_panel' as const,
          sources: ['LifecycleBusinessPlan', 'CustomerOpportunity'],
          metricDefinition: 'Agent V4 基于生命周期机会生成经营计划草稿',
          limitations: ['审批前不执行任何营销触达。', ...evidence.slice(0, 2)],
        },
      ] as AuraResponseBlock[],
    };
  }

  private async submitBusinessPlan(input: { run: any; actor: AgentActor; message: string; context?: Record<string, unknown> }): Promise<AgentV4ProcessResult> {
    const planId = this.resolveBusinessPlanId(input.message, input.context);
    if (!planId) {
      return {
        answer: '请先生成经营计划，或在消息/上下文中提供 businessPlanId 后再提交审批。',
        actions: [],
        evidence: this.lifecycleEvidence({
          sources: ['LifecycleBusinessPlan'],
          filters: ['businessPlanId missing'],
          limitations: ['没有计划 ID 时不会创建审批。'],
        }),
        renderedBlocks: [{
          kind: 'data_gap' as const,
          title: '缺少经营计划 ID',
          message: 'Agent V4 未找到可提交的经营计划。',
          missingData: ['businessPlanId'],
          nextSteps: ['先发送“生成本周经营计划”', '或在上下文中传入 businessPlanId'],
        }] as AuraResponseBlock[],
      };
    }
    const submitted = await this.marketingService.submitLifecycleBusinessPlanActions(planId, {
      sourceAgentCode: AGENT_V4_CODE,
      sourceRunId: Number(input.run.id),
      sourceEntrypoint: input.actor.entrypoint,
    }, input.actor.userId) as any;
    const approvalId = submitted?.approval?.id ?? submitted?.plan?.approvalJson?.agentApprovalId;
    const answer = submitted?.submitted
      ? `经营计划 #${planId} 已提交审批，审批单 #${approvalId ?? '-'} 等待人工确认。`
      : `经营计划提交审批失败：${submitted?.reason ?? 'unknown_reason'}`;
    return {
      answer,
      actions: approvalId ? [
        { label: '确认审批', action: `approve:${approvalId}`, riskLevel: 'medium' as const },
        { label: '暂不执行', action: `reject:${approvalId}`, riskLevel: 'low' as const },
      ] : [],
      evidence: this.lifecycleEvidence({
        sources: ['LifecycleBusinessPlan', 'AgentApproval'],
        sampleSize: approvalId ? 1 : 0,
        filters: [`businessPlanId=${planId}`],
        limitations: ['审批通过后仍只创建草稿或终端跟进任务。'],
      }),
      renderedBlocks: [
        { kind: 'summary_text', content: answer },
        ...(approvalId ? [{
          kind: 'action_card' as const,
          title: '经营计划审批',
          preview: `审批单 #${approvalId} 待处理。审批通过后仅创建草稿/跟进任务。`,
          actionId: `approve:${approvalId}`,
          riskLevel: 'medium' as const,
          impactSummary: '不会直接发券、群发、扣库存、创建订单或改客户资产。',
        }] : []),
        {
          kind: 'evidence_panel' as const,
          sources: ['LifecycleBusinessPlan', 'AgentApproval'],
          metricDefinition: 'Agent V4 经营计划审批链路',
          limitations: ['审批后动作仍受现有营销/终端接口边界限制。'],
        },
      ] as AuraResponseBlock[],
    };
  }

  private async reviewAttribution(input: { actor: AgentActor }): Promise<AgentV4ProcessResult> {
    const page = await this.marketingService.getLifecycleAttribution({ page: 1, pageSize: 20 }, input.actor.storeId) as any;
    const events = this.asArray(page.items ?? page.data);
    const answer = events.length
      ? `Agent V4 找到 ${page.total ?? events.length} 条生命周期归因事件，可用于复盘触达、行为、预约、订单和库存/排期证据。`
      : '当前暂无生命周期归因事件，可能尚未产生触达或还未重建归因。';
    return {
      answer,
      actions: [],
      evidence: this.lifecycleEvidence({
        sources: ['LifecycleAttributionEvent'],
        sampleSize: events.length,
        filters: [`storeId=${input.actor.storeId}`],
        limitations: ['归因为轻量链路，先用于证据复盘，不作为财务结算依据。'],
      }),
      renderedBlocks: [
        { kind: 'summary_text', content: answer },
        ...(events.length ? [{
          kind: 'table' as const,
          columns: ['事件', '来源', '客户', '机会', '时间'],
          rows: events.slice(0, 10).map((event) => [
            String(event.eventType ?? '-'),
            String(event.sourceType ?? '-'),
            String(event.customerId ?? '-'),
            String(event.opportunityId ?? '-'),
            this.formatDateTime(event.occurredAt),
          ]),
          caption: '触达 -> 行为 -> 预约/核销/订单 -> 库存/排期证据链。',
        }] : [{
          kind: 'data_gap' as const,
          title: '暂无归因事件',
          message: '当前没有可复盘的生命周期归因事件。',
          missingData: ['LifecycleAttributionEvent'],
          nextSteps: ['重建生命周期小本体并包含归因', '等待营销触达或预约/订单行为产生'],
        }]),
      ] as AuraResponseBlock[],
    };
  }

  private async reviewQuality(input: { actor: AgentActor }): Promise<AgentV4ProcessResult> {
    const [quality, rules] = await Promise.all([
      this.marketingService.getLifecycleQuality(input.actor.storeId),
      this.marketingService.getLifecycleRules({ status: 'active' }, input.actor.storeId),
    ]) as any[];
    const ruleItems = this.asArray(rules?.items ?? rules?.data ?? rules);
    const answer = quality
      ? `生命周期小本体质量快照已生成：字段覆盖率 ${this.percent(quality.fieldCoverageRate)}，规则命中率 ${this.percent(quality.ruleHitRate)}，归因完整率 ${this.percent(quality.attributionCompletenessRate)}。`
      : '当前暂无生命周期质量快照，请先重建生命周期小本体。';
    return {
      answer,
      actions: [],
      evidence: this.lifecycleEvidence({
        sources: ['CustomerLifecycleQualitySnapshot', 'CustomerLifecycleRuleVersion'],
        sampleSize: ruleItems.length,
        filters: [`storeId=${input.actor.storeId}`],
        limitations: ['V4 只解释质量和规则，不自动发布或回滚规则。'],
      }),
      renderedBlocks: [
        { kind: 'summary_text', content: answer },
        ...this.kpiBlocks([
          ['字段覆盖率', this.percent(quality?.fieldCoverageRate), 'fieldCoverageRate'],
          ['规则命中率', this.percent(quality?.ruleHitRate), 'ruleHitRate'],
          ['归因完整率', this.percent(quality?.attributionCompletenessRate), 'attributionCompletenessRate'],
        ]),
        {
          kind: 'evidence_panel' as const,
          sources: ['CustomerLifecycleQualitySnapshot', 'CustomerLifecycleRuleVersion'],
          metricDefinition: '生命周期本体质量和规则版本治理',
          limitations: ['规则发布/回滚必须走治理接口和权限，不由 V4 自动执行。'],
        },
      ] as AuraResponseBlock[],
    };
  }

  private buildPlan(message: string, intent: AgentV4Intent): AgentPlan {
    return {
      intentType: intent === 'readonly_query' ? 'query' : intent === 'submit_business_plan' ? 'draft' : 'analysis_and_recommendation',
      goal: message,
      toolPlan: this.toolPlan(intent),
      confidence: 0.84,
      clarificationNeeded: false,
      businessTask: {
        architecture: AGENT_V4_ARCHITECTURE,
        runtime: AGENT_V4_CODE,
        readOnlyVia: intent === 'readonly_query' ? 'agent_v3_text_to_sql' : undefined,
        approvalBoundary: 'drafts_and_approval_only',
        blockedWrites: ['auto_send_coupon', 'mass_send', 'customer_asset_write', 'stock_deduct', 'order_create', 'schedule_write'],
      },
      semanticSqlCandidate: intent === 'readonly_query' ? {
        source: 'agent_v3_controlled_text_to_sql',
        readOnlyVia: 'agent_v3_text_to_sql',
      } : undefined,
    };
  }

  private resolveIntent(message: string, context?: Record<string, unknown>): AgentV4Intent {
    if (context?.agentV4Intent === 'submit_business_plan') return 'submit_business_plan';
    if (context?.agentV4Intent === 'business_plan') return 'business_plan';
    const text = message.toLowerCase();
    if (/提交|审批|确认/.test(message) && /计划|经营/.test(message)) return 'submit_business_plan';
    if (/归因|效果|复盘|核销|点击|转化/.test(message)) return 'attribution_review';
    if (/质量|规则|覆盖率|命中率|治理|回滚|发布/.test(message)) return 'quality_review';
    if (/哪些客户|为什么|生命周期|机会|护理周期|沉睡|召回|到期|库存|产能|服务周期/.test(message)) return 'lifecycle_diagnosis';
    if (/计划|本周|经营|动作|方案|安排/.test(message)) return 'business_plan';
    if (/销售|营收|订单|排行|统计|多少|趋势|同比|环比|top|TOP/.test(text)) return 'readonly_query';
    return 'lifecycle_diagnosis';
  }

  private buildTextToSqlBlocks(result: AgentV3TextToSqlResult): AuraResponseBlock[] {
    const blocks: AuraResponseBlock[] = [
      { kind: 'summary_text', content: result.answer ?? this.textToSqlFallback(result) },
      {
        kind: 'evidence_panel',
        sources: result.evidence.sourceViews,
        dateRange: result.evidence.dateRange,
        metricDefinition: 'Agent V4 复用 Agent V3 白名单语义视图 + SQL Guard + 只读执行器',
        limitations: ['readOnlyVia=agent_v3_text_to_sql', ...(result.evidence.limitations ?? [])],
      },
    ];
    if (result.rows.length) {
      const columns = Object.keys(result.rows[0] ?? {}).slice(0, 8);
      blocks.splice(1, 0, {
        kind: 'table',
        columns,
        rows: result.rows.slice(0, 20).map((row) => columns.map((column) => this.cell(row[column]))),
        sortable: true,
        caption: `Agent V4 通过 V3 只读查询返回 ${result.rows.length} 条，只展示前 20 条。`,
      });
    }
    if (result.status === 'blocked') {
      blocks.splice(1, 0, {
        kind: 'permission_notice',
        title: 'V4 只读查询已阻断',
        message: result.blockedReason ?? 'SQL Guard 未放行该查询。',
        allowedSummary: 'V4 复用 V3，只允许白名单语义视图上的 SELECT 只读查询。',
      });
    }
    return blocks;
  }

  private toAgentEvidence(result: AgentV3TextToSqlResult): AgentEvidence {
    return {
      source: result.evidence.sourceViews,
      sourceTables: result.evidence.sourceViews,
      storeScope: result.evidence.storeScope,
      metricDefinition: 'Agent V4 via Agent V3 Text-to-SQL 受控只读查询',
      filters: result.queryTrace.guard.appliedPolicies,
      limitations: ['readOnlyVia=agent_v3_text_to_sql', ...(result.evidence.limitations ?? [])],
      queryTraceId: result.auditRunId,
      queryTraces: [this.redactTrace(result.queryTrace)],
      fieldPolicyApplied: {
        fieldPolicies: result.evidence.fieldPolicies,
      },
    };
  }

  private lifecycleEvidence(input: {
    sources: string[];
    sampleSize?: number;
    filters?: string[];
    limitations?: string[];
  }): AgentEvidence {
    return {
      source: input.sources,
      sourceModels: input.sources,
      sourceTables: input.sources,
      metricDefinition: 'Agent V4 客户全生命周期服务营销小本体',
      filters: input.filters ?? [],
      sampleSize: input.sampleSize,
      limitations: [
        'Agent V4 只生成建议、计划、草稿和审批申请。',
        '禁止自动发券、群发、改客户资产、扣库存、创建订单或改排班。',
        ...(input.limitations ?? []),
      ],
    };
  }

  private toolPlan(intent: AgentV4Intent) {
    const toolByIntent: Record<AgentV4Intent, string> = {
      readonly_query: 'agent_v3.controlled_text_to_sql',
      lifecycle_diagnosis: 'marketing.lifecycle.opportunities',
      business_plan: 'marketing.lifecycle.business_plan.create',
      submit_business_plan: 'marketing.lifecycle.business_plan.submit_actions',
      attribution_review: 'marketing.lifecycle.attribution',
      quality_review: 'marketing.lifecycle.quality',
    };
    return [{ tool: toolByIntent[intent], args: { boundary: 'drafts_and_approval_only' } }];
  }

  private assertAgentV4Run(run: any, storeId?: number) {
    if (!run) throw new NotFoundException('Agent V4 run not found');
    if (run.agentCode !== AGENT_V4_CODE) throw new ForbiddenException('该运行记录不属于 Agent V4');
    if (storeId && Number(run.storeId) !== Number(storeId)) throw new ForbiddenException('Agent V4 run store mismatch');
    return run;
  }

  private withAgentV4Context(context?: Record<string, unknown>) {
    return {
      ...(context ?? {}),
      architecture: AGENT_V4_ARCHITECTURE,
      agentEngine: AGENT_V4_CODE,
      readOnlyVia: 'agent_v3_text_to_sql',
      boundary: 'drafts_and_approval_only',
    };
  }

  private resolveBusinessPlanId(message: string, context?: Record<string, unknown>) {
    const contextId = Number(context?.businessPlanId ?? context?.lifecycleBusinessPlanId);
    if (Number.isFinite(contextId) && contextId > 0) return contextId;
    const match = message.match(/(?:计划|plan|#)\s*#?(\d+)/i) ?? message.match(/\b(\d{1,9})\b/);
    const id = Number(match?.[1]);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  private phaseTitle(intent: AgentV4Intent) {
    const titles: Record<AgentV4Intent, string> = {
      readonly_query: 'V4 只读数据分析',
      lifecycle_diagnosis: 'V4 生命周期诊断',
      business_plan: 'V4 经营计划草稿',
      submit_business_plan: 'V4 审批提交',
      attribution_review: 'V4 归因复盘',
      quality_review: 'V4 规则与质量治理',
    };
    return titles[intent];
  }

  private followUps(intent: AgentV4Intent) {
    if (intent === 'business_plan') return ['提交这个经营计划审批', '看看计划里的目标客户证据', '复盘最近一次触达效果'];
    if (intent === 'attribution_review') return ['哪些机会归因不完整', '按机会类型看转化效果', '生成下周经营计划'];
    if (intent === 'quality_review') return ['哪些规则需要优化', '重建生命周期小本体', '查看本周客户机会'];
    return ['生成本周经营计划', '哪些客户最该触达', '最近触达效果怎么样'];
  }

  private textToSqlFallback(result: AgentV3TextToSqlResult) {
    if (result.status === 'blocked') return `Agent V4 已通过 V3 阻断该查询：${result.blockedReason ?? 'blocked'}。`;
    if (result.status === 'no_data') return '当前筛选范围内没有匹配数据。';
    return 'Agent V4 已通过 V3 完成受控 Text-to-SQL 查询。';
  }

  private kpiBlocks(items: Array<[string, string, string]>): AuraResponseBlock[] {
    return items.map(([label, value, hint]) => ({ kind: 'kpi_card' as const, label, value, hint }));
  }

  private fulfillmentLabel(value: any) {
    if (!value) return '待校验';
    const inventoryReady = value.inventoryReady !== false;
    const capacityReady = value.capacityReady !== false;
    if (inventoryReady && capacityReady) return '可承接';
    if (!inventoryReady && !capacityReady) return '库存/产能不足';
    return inventoryReady ? '产能不足' : '库存不足';
  }

  private labelOpportunity(value: unknown) {
    const labels: Record<string, string> = {
      care_cycle_due: '护理周期到期',
      card_expiring: '次卡/套餐到期',
      dormant_winback: '沉睡客户召回',
      coupon_claimed_unused: '领券未核销',
      browse_abandonment: '浏览未预约',
      project_cycle_due: '项目护理周期到期',
      homecare_bundle: '居家护理搭配',
      service_upgrade: '服务升级机会',
      project_idle_capacity: '低峰产能填充',
      inventory_clearance: '库存消化机会',
    };
    return labels[String(value)] ?? String(value ?? '-');
  }

  private percent(value: unknown) {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) return '-';
    return `${Math.round(numeric * 100)}%`;
  }

  private formatDateTime(value: unknown) {
    if (!value) return '-';
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  }

  private asArray(value: unknown): any[] {
    return Array.isArray(value) ? value : [];
  }

  private asStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
  }

  private uniqueStrings(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
  }

  private cell(value: unknown) {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
    return String(value);
  }

  private redactTrace(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') return {};
    return JSON.parse(JSON.stringify(value, (key, entryValue) => {
      if (/^(generatedSql|safeSql|sql)$/i.test(key)) return 'redacted_for_agent_v4_runtime';
      if (key === 'parsed') return 'redacted_for_agent_v4_runtime';
      return entryValue;
    })) as Record<string, unknown>;
  }

  private toJson(value: unknown) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }
}
