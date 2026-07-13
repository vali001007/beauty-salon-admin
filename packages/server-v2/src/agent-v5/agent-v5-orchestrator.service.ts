import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentWorkflowRuntimeService } from '../agent/agent-workflow-runtime.service.js';
import type { AgentActor, AgentEvidence, AgentPlan, AgentRunResult, AgentRunStatus, AgentSuggestedAction, AuraResponseBlock } from '../agent/agent.types.js';
import { AgentV5BeauticianAdapter } from './adapters/agent-v5-beautician.adapter.js';
import { AgentV5BusinessToolAdapter } from './adapters/agent-v5-business-tool.adapter.js';
import { AgentV5CashierAdapter } from './adapters/agent-v5-cashier.adapter.js';
import { AgentV5FinanceAdapter } from './adapters/agent-v5-finance.adapter.js';
import { AgentV5GovernanceAdapter } from './adapters/agent-v5-governance.adapter.js';
import { AgentV5InventorySupplyAdapter } from './adapters/agent-v5-inventory-supply.adapter.js';
import { AgentV5LifecycleAdapter } from './adapters/agent-v5-lifecycle.adapter.js';
import { AgentV5MarketingAdapter } from './adapters/agent-v5-marketing.adapter.js';
import { AgentV5ReceptionAdapter } from './adapters/agent-v5-reception.adapter.js';
import { AgentV5ReadonlyQueryAdapter } from './adapters/agent-v5-readonly-query.adapter.js';
import { AgentV5ScheduleAdapter } from './adapters/agent-v5-schedule.adapter.js';
import { AgentV5StaffPerformanceAdapter } from './adapters/agent-v5-staff-performance.adapter.js';
import { AGENT_V5_ARCHITECTURE, AGENT_V5_CODE, type AgentV5AdapterResult, type AgentV5MemoryItem, type AgentV5MemorySnapshot, type AgentV5RouteDecision } from './agent-v5.types.js';
import { AgentV5ClarificationService } from './ontology/agent-v5-clarification.service.js';
import { AgentV5ConstraintGuardService } from './ontology/agent-v5-constraint-guard.service.js';
import { AgentV5ContextBuilderService } from './ontology/agent-v5-context-builder.service.js';
import { AgentV5EvidencePackService } from './ontology/agent-v5-evidence-pack.service.js';
import { AgentV5MemoryService } from './ontology/agent-v5-memory.service.js';
import { AgentV5SemanticRouterService } from './ontology/agent-v5-semantic-router.service.js';

type AgentV5ProcessResult = {
  route: AgentV5RouteDecision;
  answer: string;
  renderedBlocks: AuraResponseBlock[];
  actions: AgentSuggestedAction[];
  evidence?: AgentEvidence;
  status: AgentRunStatus;
};

@Injectable()
export class AgentV5OrchestratorService {
  constructor(
    private readonly runtime: AgentWorkflowRuntimeService,
    private readonly router: AgentV5SemanticRouterService,
    private readonly contextBuilder: AgentV5ContextBuilderService,
    private readonly evidencePack: AgentV5EvidencePackService,
    private readonly clarification: AgentV5ClarificationService,
    private readonly memory: AgentV5MemoryService,
    private readonly constraintGuard: AgentV5ConstraintGuardService,
    private readonly readonlyQuery: AgentV5ReadonlyQueryAdapter,
    private readonly lifecycle: AgentV5LifecycleAdapter,
    private readonly businessTool: AgentV5BusinessToolAdapter,
    private readonly governance: AgentV5GovernanceAdapter,
    private readonly reception: AgentV5ReceptionAdapter,
    private readonly cashier: AgentV5CashierAdapter,
    private readonly beautician: AgentV5BeauticianAdapter,
    private readonly schedule: AgentV5ScheduleAdapter,
    private readonly finance: AgentV5FinanceAdapter,
    private readonly inventorySupply: AgentV5InventorySupplyAdapter,
    private readonly staffPerformance: AgentV5StaffPerformanceAdapter,
    private readonly marketing: AgentV5MarketingAdapter,
  ) {}

  async createRun(input: { message: string; actor: AgentActor; context?: Record<string, unknown> }): Promise<AgentRunResult> {
    const context = this.withAgentV5Context(input.context);
    const run = await this.runtime.createRun({
      ...input,
      context,
      agentCode: AGENT_V5_CODE,
    });
    await this.runtime.addMessage(run.id, 'user', input.message, {
      entrypoint: input.actor.entrypoint,
      personaCode: input.actor.personaCode,
      architecture: AGENT_V5_ARCHITECTURE,
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
    if (!run) throw new NotFoundException('Agent V5 run not found');
    if (run.agentCode !== AGENT_V5_CODE) throw new ForbiddenException('该运行记录不属于 Agent V5');
    if (Number(run.storeId) !== Number(input.actor.storeId)) throw new ForbiddenException('Agent V5 run store mismatch');
    const context = this.withAgentV5Context({
      ...(this.asObject(run.contextJson) ?? {}),
      ...(input.context ?? {}),
    });
    await this.runtime.addMessage(input.runId, 'user', input.message, {
      entrypoint: input.actor.entrypoint,
      personaCode: input.actor.personaCode,
      architecture: AGENT_V5_ARCHITECTURE,
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
    return this.runtime.findRuns({ ...query, agentCode: AGENT_V5_CODE });
  }

  async getRun(id: number, storeId?: number) {
    const run = await this.runtime.getRun(id);
    return this.assertAgentV5Run(run, storeId);
  }

  async getRunDetail(id: number, storeId?: number) {
    const detail = await this.runtime.getRunDetail(id, storeId);
    if (!detail.run) return detail;
    this.assertAgentV5Run(detail.run, storeId);
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
    const previousResult = this.asObject(input.run?.resultJson);
    const previousMemory = this.asMemorySnapshot(previousResult?.memory);
    const memorySnapshot = this.memory.buildSnapshot({
      message: input.message,
      previousMemory,
      runContext: input.context,
    });
    const resolved = this.memory.resolvePronouns(input.message, memorySnapshot);
    const routeContext = {
      ...(input.context ?? {}),
      agentV5Memory: memorySnapshot,
      agentV5MemoryUsed: resolved.memoryUsed,
    };
    const route = this.router.route(resolved.message, routeContext);
    const v5Context = this.contextBuilder.build({ message: resolved.message, actor: input.actor, route, context: routeContext });
    const plan = this.buildPlan(resolved.message, route, v5Context);
    await this.runtime.persistPlan(runId, plan);
    await this.runtime.setRunStatus(runId, 'validating');

    try {
      const result = await this.executeRoute({ ...input, runId, message: resolved.message, route, v5Context, memorySnapshot, memoryUsed: resolved.memoryUsed, context: routeContext });
      await this.runtime.recordStep({
        runId,
        stepType: 'agent_v5_ontology',
        name: `agent.v5.${route.intent}`,
        status: result.status === 'failed' ? 'failed' : 'success',
        inputJson: {
          message: input.message,
          resolvedMessage: resolved.message,
          architecture: AGENT_V5_ARCHITECTURE,
          route,
          v5Context,
          memoryUsed: resolved.memoryUsed,
        },
        outputJson: {
          evidence: result.evidence,
          renderedBlockKinds: result.renderedBlocks.map((block) => block.kind),
          actionCount: result.actions.length,
        },
        startedAt,
        endedAt: new Date(),
      });
      await this.runtime.addMessage(runId, 'assistant', result.answer, {
        responseMode: 'structured_blocks',
        architecture: AGENT_V5_ARCHITECTURE,
        intent: route.intent,
      });
      const updated = await this.runtime.setRunStatus(runId, result.status, {
        resultJson: this.toJson({
          answer: result.answer,
          plan,
          route,
          architecture: AGENT_V5_ARCHITECTURE,
          agentCode: AGENT_V5_CODE,
          memory: memorySnapshot,
          memoryUsed: resolved.memoryUsed,
          renderedBlocks: result.renderedBlocks,
          actions: result.actions,
          evidence: result.evidence,
        }),
        evidenceJson: this.toJson(result.evidence),
      });
      return this.toRunResult(updated, plan, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'agent_v5_failed';
      const failureRoute = route.intent === 'failure_diagnosis' ? route : { ...route, intent: 'failure_diagnosis' as const };
      const failure = this.governance.diagnoseFailure({ actor: input.actor, route: failureRoute, reason: message });
      const pack = this.evidencePack.build({ route: failureRoute, partial: failure.evidence, limitations: [message] });
      const evidence = this.evidencePack.toAgentEvidence(pack);
      await this.runtime.recordStep({
        runId,
        stepType: 'agent_v5_ontology',
        name: `agent.v5.${route.intent}`,
        status: 'failed',
        inputJson: { message: input.message, route },
        outputJson: { error: message, failure },
        startedAt,
        endedAt: new Date(),
      });
      await this.runtime.addMessage(runId, 'assistant', failure.summary, {
        responseMode: 'structured_blocks',
        architecture: AGENT_V5_ARCHITECTURE,
        intent: route.intent,
      });
      const updated = await this.runtime.setRunStatus(runId, 'failed', {
        errorMessage: message,
        resultJson: this.toJson({ answer: failure.summary, renderedBlocks: failure.renderedBlocks, evidence }),
        evidenceJson: this.toJson(evidence),
      });
      return this.toRunResult(updated, plan, {
        route,
        answer: failure.summary,
        renderedBlocks: failure.renderedBlocks ?? [],
        actions: failure.actions ?? [],
        evidence,
        status: 'failed',
      });
    }
  }

  private async executeRoute(input: {
    runId: number;
    message: string;
    actor: AgentActor;
    context?: Record<string, unknown>;
    route: AgentV5RouteDecision;
    v5Context: Record<string, unknown>;
    memorySnapshot: AgentV5MemorySnapshot;
    memoryUsed: AgentV5MemoryItem[];
  }): Promise<AgentV5ProcessResult> {
    if (input.route.missingSlots.length) {
      return this.buildClarification(input.route, `还缺少：${input.route.missingSlots.join('、')}`);
    }

    if (!input.context?.agentV5ClarificationSelection) {
      const clarification = this.clarification.inspect({ message: input.message, route: input.route });
      if (clarification.required && clarification.block) {
        const trace = { ...clarification.trace, runId: input.runId };
        const pack = this.evidencePack.build({
          route: input.route,
          partial: {
            sources: ['AgentV5ClarificationService'],
            domains: input.route.domains,
            concepts: input.route.concepts,
            filters: trace.candidates,
            sampleSize: trace.candidates.length,
            memoryUsed: input.memoryUsed,
            clarification: trace,
          },
          limitations: ['问题存在歧义，等待用户选择或补充后再调用业务工具。'],
        });
        return {
          route: input.route,
          answer: trace.question,
          renderedBlocks: [clarification.block],
          actions: [],
          evidence: this.evidencePack.toAgentEvidence(pack),
          status: 'completed',
        };
      }
    }

    const adapterResult = await this.runAdapter(input);
    const adapterResultWithMemory: AgentV5AdapterResult = {
      ...adapterResult,
      evidence: {
        ...(adapterResult.evidence ?? {}),
        memoryUsed: input.memoryUsed,
      },
    };
    const constraint = this.constraintGuard.inspect(input.route, adapterResultWithMemory.actions);
    if (constraint.decision === 'blocked') {
      const blocked: AgentV5AdapterResult = {
        status: 'blocked',
        title: '高风险动作已阻断',
        summary: 'Agent V5 已阻断不允许自动执行的高风险动作。',
        evidence: {
          sources: ['AgentV5ConstraintGuard'],
          domains: ['governance'],
          concepts: ['risk_boundary'],
          filters: constraint.blockedActions,
          sampleSize: 0,
          limitations: constraint.limitations,
        },
        renderedBlocks: [{
          kind: 'permission_notice',
          title: '高风险动作已阻断',
          message: constraint.risks.join('；') || '命中 V5 禁止动作边界。',
        }],
      };
      return this.composeResult(input.route, blocked, constraint, 'failed');
    }
    const status: AgentRunStatus = adapterResultWithMemory.status === 'failed' || adapterResultWithMemory.status === 'blocked'
      ? 'failed'
      : constraint.decision === 'approval_required' || adapterResultWithMemory.status === 'draft'
        ? 'waiting_approval'
        : 'completed';
    return this.composeResult(input.route, adapterResultWithMemory, constraint, status);
  }

  private async runAdapter(input: {
    runId: number;
    message: string;
    actor: AgentActor;
    context?: Record<string, unknown>;
    route: AgentV5RouteDecision;
    v5Context: Record<string, unknown>;
    memorySnapshot: AgentV5MemorySnapshot;
  }): Promise<AgentV5AdapterResult> {
    switch (input.route.intent) {
      case 'business_overview':
        return this.businessTool.overview({ actor: input.actor });
      case 'readonly_query':
        return this.readonlyQuery.run({ message: input.message, actor: input.actor, context: input.context });
      case 'lifecycle_diagnosis':
        return this.lifecycle.diagnose({ actor: input.actor });
      case 'business_plan':
        return this.lifecycle.createBusinessPlan({ runId: input.runId, message: input.message, actor: input.actor });
      case 'submit_business_plan':
        return this.lifecycle.submitBusinessPlan({ runId: input.runId, actor: input.actor, planId: this.extractPlanId(input.message, input.context) });
      case 'attribution_review':
        return this.lifecycle.reviewAttribution({ actor: input.actor });
      case 'quality_review':
        return this.lifecycle.reviewQuality({ actor: input.actor });
      case 'reception_lookup':
        return this.reception.execute({ ...input, memory: input.memorySnapshot });
      case 'cashier_reconciliation':
        return this.cashier.execute({ ...input, memory: input.memorySnapshot });
      case 'beautician_service':
        return this.beautician.execute({ ...input, memory: input.memorySnapshot });
      case 'inventory_risk':
        return this.inventorySupply.execute({ ...input, memory: input.memorySnapshot });
      case 'finance_margin':
        return this.finance.execute({ ...input, memory: input.memorySnapshot });
      case 'reservation_coordination':
        return this.schedule.execute({ ...input, memory: input.memorySnapshot });
      case 'staff_performance':
        return this.staffPerformance.execute({ ...input, memory: input.memorySnapshot });
      case 'marketing_growth':
        return this.marketing.execute({ ...input, memory: input.memorySnapshot });
      case 'failure_diagnosis':
        return this.governance.diagnoseFailure({ actor: input.actor, route: input.route });
      case 'clarify':
      default:
        return {
          status: 'no_data',
          title: '需要进一步明确问题',
          summary: '请补充要诊断的业务域、时间范围或对象。',
          renderedBlocks: [{
            kind: 'clarification_card',
            title: '需要进一步明确问题',
            question: '你希望 V5 诊断哪个业务域？',
            options: [
              { label: '经营概览', value: 'business_overview' },
              { label: '客户生命周期', value: 'lifecycle_diagnosis' },
              { label: '库存风险', value: 'inventory_risk' },
            ],
            allowFreeText: true,
          }],
        };
    }
  }

  private composeResult(
    route: AgentV5RouteDecision,
    adapterResult: AgentV5AdapterResult,
    constraint: { risks: string[]; limitations: string[]; decision: string },
    status: AgentRunStatus,
  ): AgentV5ProcessResult {
    const pack = this.evidencePack.build({
      route,
      partial: adapterResult.evidence,
      risks: constraint.risks,
      limitations: constraint.limitations,
    });
    const evidence = this.evidencePack.toAgentEvidence(pack);
    const renderedBlocks = [
      ...(adapterResult.renderedBlocks?.length ? adapterResult.renderedBlocks : [{ kind: 'summary_text' as const, title: adapterResult.title, content: adapterResult.summary }]),
      {
        kind: 'capability_trace' as const,
        title: 'V5 Ontology Router',
        capabilityId: route.capabilityCandidates[0],
        action: route.intent,
        executionPath: route.adapterCandidates[0] ?? 'agent_v5_adapter',
        schemaPath: route.concepts,
        confidence: route.confidence,
        fallbackReason: route.reason,
      },
      {
        kind: 'evidence_panel' as const,
        sources: evidence.source,
        metricDefinition: evidence.metricDefinition,
        limitations: evidence.limitations,
      },
    ];
    return {
      route,
      answer: adapterResult.summary,
      renderedBlocks,
      actions: adapterResult.actions ?? [],
      evidence,
      status,
    };
  }

  private buildClarification(route: AgentV5RouteDecision, reason: string): AgentV5ProcessResult {
    const pack = this.evidencePack.build({
      route,
      limitations: ['缺少必要槽位，未调用业务工具。'],
    });
    return {
      route,
      answer: reason,
      renderedBlocks: [{
        kind: 'clarification_card',
        title: '需要补充信息',
        question: reason,
        options: route.missingSlots.map((slot) => ({ label: slot, value: slot })),
        allowFreeText: true,
      }],
      actions: [],
      evidence: this.evidencePack.toAgentEvidence(pack),
      status: 'completed',
    };
  }

  private buildPlan(message: string, route: AgentV5RouteDecision, v5Context: Record<string, unknown>): AgentPlan {
    return {
      intentType: route.riskLevel === 'approval_required' ? 'draft' : route.intent === 'clarify' || route.missingSlots.length ? 'clarify' : 'analysis_and_recommendation',
      goal: message,
      toolPlan: route.capabilityCandidates.map((capability, index) => ({
        tool: route.adapterCandidates[index] ?? 'agent_v5_adapter',
        args: { capability, intent: route.intent },
      })),
      confidence: route.confidence,
      clarificationNeeded: route.missingSlots.length > 0 || route.intent === 'clarify' || Boolean(route.ambiguity),
      clarificationQuestion: route.missingSlots.length ? `请补充 ${route.missingSlots.join('、')}` : route.ambiguity?.question ?? null,
      executionPath: 'deep',
      progressNotice: 'Agent V5 正在通过全业务 Ontology Router 选择独立 adapter。',
      businessTask: {
        architecture: AGENT_V5_ARCHITECTURE,
        runtime: AGENT_V5_CODE,
        versionBoundary: 'independent_v5_runtime',
        reusePolicy: 'reuse_underlying_services_via_v5_adapters_only',
        forbiddenLegacyEntry: ['/agent-v2/*', '/agent-v3/*', '/agent-v4/*', 'AgentV2OrchestratorService', 'AgentV3OrchestratorService', 'AgentV4OrchestratorService'],
        approvalBoundary: 'drafts_followups_and_approval_only',
        route,
        context: v5Context,
      },
      capabilityPlan: {
        capabilityId: route.capabilityCandidates[0] ?? 'agent_v5.unknown',
        reason: route.reason,
      },
      outputContract: {
        responseMode: 'structured_blocks',
        evidenceRequired: true,
        versionBoundary: AGENT_V5_CODE,
      },
    };
  }

  private toRunResult(run: any, plan: AgentPlan, result: AgentV5ProcessResult): AgentRunResult {
    return {
      runId: Number(run.id),
      runNo: String(run.runNo),
      status: run.status,
      plan,
      answer: result.answer,
      toolResults: [],
      actions: result.actions,
      evidence: result.evidence,
      responseMode: 'structured_blocks',
      personaCode: run.personaCode ?? null,
      renderedBlocks: result.renderedBlocks,
      phaseOutputs: [{
        phase: result.status === 'waiting_approval' ? 'action_draft' : 'core_conclusion',
        title: this.phaseTitle(result.route.intent),
        summary: result.answer,
        blockKinds: result.renderedBlocks.map((block) => block.kind),
        actionLabels: result.actions.map((action) => action.label),
      }],
      followUpSuggestions: this.followUps(result.route.intent),
    };
  }

  private extractPlanId(message: string, context?: Record<string, unknown>) {
    const contextId = Number(context?.businessPlanId ?? context?.planId);
    if (Number.isFinite(contextId) && contextId > 0) return contextId;
    const match = message.match(/(?:计划|plan|#)\s*#?(\d{1,9})/i) ?? message.match(/\b(\d{1,9})\b/);
    const parsed = Number(match?.[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    throw new ForbiddenException('提交经营计划需要 businessPlanId');
  }

  private assertAgentV5Run(run: any, storeId?: number) {
    if (!run) throw new NotFoundException('Agent V5 run not found');
    if (run.agentCode !== AGENT_V5_CODE) throw new ForbiddenException('该运行记录不属于 Agent V5');
    if (storeId && Number(run.storeId) !== Number(storeId)) throw new ForbiddenException('Agent V5 run store mismatch');
    return run;
  }

  private withAgentV5Context(context?: Record<string, unknown>) {
    return {
      ...(context ?? {}),
      agentEngine: AGENT_V5_CODE,
      agentCode: AGENT_V5_CODE,
      architecture: AGENT_V5_ARCHITECTURE,
      reusePolicy: 'v5_adapters_only',
    };
  }

  private phaseTitle(intent: AgentV5RouteDecision['intent']) {
    const map: Record<AgentV5RouteDecision['intent'], string> = {
      business_overview: '全业务经营概览',
      readonly_query: '事实问数',
      lifecycle_diagnosis: '生命周期诊断',
      business_plan: '经营计划草稿',
      submit_business_plan: '审批提交',
      attribution_review: '归因复盘',
      quality_review: '质量治理',
      reception_lookup: '前台客户查询',
      cashier_reconciliation: '收银核销',
      beautician_service: '美容师服务',
      inventory_risk: '库存风险',
      finance_margin: '财务毛利',
      reservation_coordination: '预约协同',
      staff_performance: '员工业绩',
      marketing_growth: '营销增长',
      failure_diagnosis: '能力诊断',
      clarify: '澄清问题',
    };
    return map[intent];
  }

  private followUps(intent: AgentV5RouteDecision['intent']) {
    const common = ['展开证据链', '生成经营计划', '诊断能力缺口'];
    const map: Partial<Record<AgentV5RouteDecision['intent'], string[]>> = {
      business_overview: ['哪些指标异常', '本周重点关注什么', '生成本周经营计划'],
      lifecycle_diagnosis: ['按机会类型展开', '生成本周经营计划', '查看库存和产能风险'],
      attribution_review: ['哪些机会归因不完整', '按机会类型看转化效果', '生成下周经营计划'],
      inventory_risk: ['哪些项目受影响', '结合生命周期机会排序', '查看补货建议'],
      reception_lookup: ['查看客户卡权益', '客户最近一次服务是什么', '生成跟进建议'],
      cashier_reconciliation: ['核销和订单是否一致', '查看异常收银单', '按客户展开'],
      beautician_service: ['下一个客户要准备什么', '查看客户禁忌和偏好', '生成服务后跟进'],
      staff_performance: ['按美容师展开', '哪些服务完成率低', '查看提成异常'],
      marketing_growth: ['按机会类型看转化', '复盘最近一次触达', '生成下周经营计划'],
    };
    return map[intent] ?? common;
  }

  private asMemorySnapshot(value: unknown): AgentV5MemorySnapshot | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Partial<AgentV5MemorySnapshot>;
    return {
      working: Array.isArray(record.working) ? record.working : [],
      preferences: Array.isArray(record.preferences) ? record.preferences : [],
      businessContext: Array.isArray(record.businessContext) ? record.businessContext : [],
      governance: Array.isArray(record.governance) ? record.governance : [],
    };
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  }

  private toJson(value: unknown) {
    return JSON.parse(JSON.stringify(value ?? null));
  }
}
