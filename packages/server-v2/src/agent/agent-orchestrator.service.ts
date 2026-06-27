import { Injectable, Optional } from '@nestjs/common';
import { AnswerContractValidatorService } from './answer-contract/index.js';
import { AgentEvidenceService } from './agent-evidence.service.js';
import { AgentEvalService } from './agent-eval.service.js';
import { AgentFieldScopeSanitizerService } from './agent-field-scope-sanitizer.service.js';
import { AgentPlannerService } from './agent-planner.service.js';
import { AgentPolicyService } from './agent-policy.service.js';
import { AgentResponseSafetyService } from './agent-response-safety.service.js';
import { AgentToolRegistryService } from './agent-tool-registry.service.js';
import { AgentWorkflowRuntimeService } from './agent-workflow-runtime.service.js';
import type {
  AgentActor,
  AgentPlan,
  AgentRunResult,
  AgentSuggestedAction,
  AgentToolDefinition,
  AgentToolResult,
  AgentPhaseOutput,
  AuraBlockAction,
  AuraResponseBlock,
} from './agent.types.js';

@Injectable()
export class AgentOrchestratorService {
  constructor(
    private readonly runtime: AgentWorkflowRuntimeService,
    private readonly planner: AgentPlannerService,
    private readonly policy: AgentPolicyService,
    private readonly toolRegistry: AgentToolRegistryService,
    private readonly evidenceService: AgentEvidenceService,
    private readonly evalService: AgentEvalService,
    private readonly fieldScopeSanitizer: AgentFieldScopeSanitizerService,
    private readonly responseSafety: AgentResponseSafetyService,
    @Optional()
    private readonly answerContractValidator?: AnswerContractValidatorService,
  ) {}

  async createRun(input: { message: string; actor: AgentActor; context?: Record<string, unknown> }): Promise<AgentRunResult> {
    const run = await this.runtime.createRun(input);
    await this.runtime.addMessage(run.id, 'user', input.message, { entrypoint: input.actor.entrypoint });
    return this.processRun({ run, message: input.message, actor: input.actor, context: input.context });
  }

  async appendMessage(input: {
    runId: number;
    message: string;
    actor: AgentActor;
    context?: Record<string, unknown>;
  }): Promise<AgentRunResult> {
    const run = await this.runtime.getRun(input.runId);
    if (!run) throw new Error('AgentRun not found');
    await this.runtime.addMessage(input.runId, 'user', input.message, { entrypoint: input.actor.entrypoint });
    const previousResult = this.asObject(run.resultJson);
    const previousFocus = this.asObject(previousResult?.conversationFocus);
    const mergedContext = {
      ...(this.asObject(run.contextJson)),
      ...(previousFocus ? { conversationFocus: previousFocus } : {}),
      ...(previousResult ? { previousResult } : {}),
      ...(input.context ?? {}),
    };
    return this.processRun({ run, message: input.message, actor: input.actor, context: mergedContext });
  }

  async getRun(id: number) {
    return this.runtime.getRun(id);
  }

  async findRuns(query: {
    page?: number | string;
    pageSize?: number | string;
    status?: string;
    role?: string;
    entrypoint?: string;
    keyword?: string;
    storeId?: number;
  }) {
    return this.runtime.findRuns(query);
  }

  async getRunDetail(id: number, storeId?: number) {
    return this.runtime.getRunDetail(id, storeId);
  }

  async findApprovals(query: { page?: number | string; pageSize?: number | string; status?: string; storeId?: number }) {
    return this.runtime.findApprovals(query);
  }

  async listTools() {
    return this.toolRegistry.list();
  }

  async runDefaultEvals(options?: { persistFailures?: boolean }) {
    return this.evalService.runDefaultCases(undefined, { persistFailures: options?.persistFailures, source: 'agent_evals_default' });
  }

  async runP0Evals(options?: { persistFailures?: boolean }) {
    return this.evalService.runP0Cases({ persistFailures: options?.persistFailures, source: 'agent_evals_p0' });
  }

  async runSkillEvals(skillId?: string, options?: { persistFailures?: boolean }) {
    return this.evalService.runSkillCases(skillId, { persistFailures: options?.persistFailures, source: 'agent_evals_skills' });
  }

  async approve(input: {
    approvalId: number;
    actor: AgentActor;
    comment?: string;
    args?: Record<string, unknown>;
  }): Promise<AgentRunResult> {
    const approval = await this.runtime.getApproval(input.approvalId);
    if (!approval) throw new Error('AgentApproval not found');
    if (approval.status !== 'pending') throw new Error('AgentApproval is not pending');
    const run = await this.runtime.getRun(Number(approval.runId));
    if (!run) throw new Error('AgentRun not found');
    if (Number(run.storeId) !== Number(input.actor.storeId)) throw new Error('AgentRun store mismatch');
    const toolCall = approval.toolCallId ? await this.runtime.getToolCall(Number(approval.toolCallId)) : null;
    if (!toolCall) throw new Error('AgentToolCall not found');
    const tool = this.toolRegistry.get(String(toolCall.toolName));
    if (!tool) throw new Error(`未注册 Agent 工具：${toolCall.toolName}`);
    this.policy.validateToolAccess(tool, input.actor);

    const args = {
      ...this.asObject(toolCall.argsJson),
      ...(input.args ?? {}),
    };
    await this.runtime.updateApproval(input.approvalId, {
      status: 'approved',
      approvedBy: input.actor.userId,
      comment: input.comment,
      beforeJson: approval.beforeJson,
      afterJson: this.toJson({ tool: tool.name, args, approvedBy: input.actor.userId }),
      decidedAt: new Date(),
    });
    await this.runtime.updateToolCall(Number(toolCall.id), { status: 'running', argsJson: this.toJson(args) });
    await this.runtime.setRunStatus(Number(run.id), 'running_tool');

    try {
      const toolStartedAt = new Date();
      const startedAt = Date.now();
      const result = await this.toolRegistry.execute(tool.name, args, {
        runId: Number(run.id),
        storeId: input.actor.storeId,
        userId: input.actor.userId,
        deviceId: input.actor.deviceId,
        role: input.actor.role,
      });
      this.assertConsumedSlots(tool, args, result, input.actor);
      const safeResult = this.sanitizeToolResult(result, input.actor);
      const toolResults = [safeResult];
      const actions = safeResult.actions ?? [];
      const evidence = this.evidenceService.merge(toolResults);
      const plan = this.asPlan(run.planJson);
      const answer = safeResult.summary;

      await this.runtime.updateToolCall(Number(toolCall.id), {
        status: safeResult.status,
        resultJson: this.toJson(safeResult),
        latencyMs: Date.now() - startedAt,
      });
      const toolLatencyMs = Date.now() - startedAt;
      await this.runtime.recordStep({
        runId: Number(run.id),
        stepType: 'tool',
        name: tool.name,
        status: safeResult.status,
        inputJson: args,
        outputJson: this.buildToolStepOutput(safeResult, toolLatencyMs),
        startedAt: toolStartedAt,
        endedAt: new Date(),
      });
      await this.runtime.addMessage(Number(run.id), 'assistant', answer, {
        status: 'completed',
        approvalId: input.approvalId,
      });
      const renderingStartedAt = new Date();
      const renderedBlocks = this.buildRenderedBlocks(answer, toolResults, plan);
      const answerContract = this.validateAnswerContract(plan, answer, toolResults, renderedBlocks);
      const responseMode = this.resolveResponseMode(plan, renderedBlocks);
      const phaseOutputs = this.buildPhaseOutputs(plan, answer, toolResults, actions, renderedBlocks);
      const conversationFocus = this.buildConversationFocus(Number(run.id), plan, toolResults, renderedBlocks);
      const renderingEndedAt = new Date();
      await this.runtime.recordStep({
        runId: Number(run.id),
        stepType: 'rendering',
        name: 'agent.response.render',
        status: 'success',
        inputJson: { toolResultCount: toolResults.length, actionCount: actions.length },
        outputJson: {
          blockCount: renderedBlocks.length,
          answerContract,
          responseMode,
          phaseOutputs,
          conversationFocus,
          traceSummary: this.buildTraceSummary(plan, answerContract, responseMode, renderedBlocks),
        },
        startedAt: renderingStartedAt,
        endedAt: renderingEndedAt,
      });
      const updated = await this.runtime.setRunStatus(Number(run.id), 'completed', {
        evidenceJson: this.toJson(evidence),
        resultJson: this.toJson({
          answer,
          plan,
          toolResults,
          actions,
          evidence,
          approval,
          renderedBlocks,
          answerContract,
          responseMode,
          phaseOutputs,
          conversationFocus,
          traceSummary: this.buildTraceSummary(plan, answerContract, responseMode, renderedBlocks),
        }),
      });
      return this.buildRunResult(updated, plan, answer, toolResults, actions);
    } catch (error) {
      const answer = error instanceof Error ? error.message : String(error);
      await this.runtime.updateToolCall(Number(toolCall.id), { status: 'failed', resultJson: this.toJson({ error: answer }) });
      await this.runtime.addMessage(Number(run.id), 'assistant', `Agent 审批后执行失败：${answer}`, {
        status: 'failed',
        approvalId: input.approvalId,
      });
      const updated = await this.runtime.setRunStatus(Number(run.id), 'failed', { errorMessage: answer });
      return this.buildRunResult(updated, this.asPlan(run.planJson), `Agent 审批后执行失败：${answer}`, [], []);
    }
  }

  async reject(input: { approvalId: number; actor: AgentActor; comment?: string }): Promise<AgentRunResult> {
    const approval = await this.runtime.getApproval(input.approvalId);
    if (!approval) throw new Error('AgentApproval not found');
    if (approval.status !== 'pending') throw new Error('AgentApproval is not pending');
    const run = await this.runtime.getRun(Number(approval.runId));
    if (!run) throw new Error('AgentRun not found');
    if (Number(run.storeId) !== Number(input.actor.storeId)) throw new Error('AgentRun store mismatch');
    const toolCall = approval.toolCallId ? await this.runtime.getToolCall(Number(approval.toolCallId)) : null;
    await this.runtime.updateApproval(input.approvalId, {
      status: 'rejected',
      approvedBy: input.actor.userId,
      comment: input.comment,
      decidedAt: new Date(),
    });
    if (toolCall) {
      await this.runtime.updateToolCall(Number(toolCall.id), { status: 'rejected' });
    }
    const answer = '已拒绝执行该 Agent 动作，未写入任何业务数据。';
    await this.runtime.addMessage(Number(run.id), 'assistant', answer, {
      status: 'cancelled',
      approvalId: input.approvalId,
    });
    const updated = await this.runtime.setRunStatus(Number(run.id), 'cancelled', {
      resultJson: this.toJson({ answer, approval: { ...approval, status: 'rejected' } }),
    });
    return this.buildRunResult(updated, this.asPlan(run.planJson), answer, [], []);
  }

  private async processRun(input: {
    run: any;
    message: string;
    actor: AgentActor;
    context?: Record<string, unknown>;
  }): Promise<AgentRunResult> {
    const runId = Number(input.run.id);
    try {
      await this.runtime.setRunStatus(runId, 'planning');
      const planningStartedAt = new Date();
      const plan = await this.planner.plan({ message: input.message, actor: input.actor, context: input.context });
      const planningEndedAt = new Date();
      await this.runtime.persistPlan(runId, plan);
      await this.runtime.recordStep({
        runId,
        stepType: 'planner',
        name: 'agent.planner',
        status: 'success',
        inputJson: { message: input.message, role: input.actor.role, context: input.context },
        outputJson: {
          ...plan,
          performance: { includes: ['business_task_compile', 'tool_planning'] },
          traceSummary: this.buildTraceSummary(plan),
        },
        startedAt: planningStartedAt,
        endedAt: planningEndedAt,
      });

      if (plan.clarificationNeeded || !plan.toolPlan.length) {
        const answer = plan.clarificationQuestion ?? '请补充要处理的经营任务。';
        await this.runtime.addMessage(runId, 'assistant', answer, { status: 'clarify' });
        const updated = await this.runtime.setRunStatus(runId, 'completed', {
          resultJson: this.toJson({ answer, plan, toolResults: [] }),
        });
        return this.buildRunResult(updated, plan, answer, [], []);
      }

      await this.runtime.setRunStatus(runId, 'validating');
      const toolResults: AgentToolResult[] = [];
      const actions: AgentSuggestedAction[] = [];
      if (plan.executionPath === 'deep' && plan.progressNotice) {
        await this.runtime.addMessage(runId, 'assistant', plan.progressNotice, { status: 'analyzing', executionPath: 'deep' });
      }

      for (const item of plan.toolPlan) {
        const tool = this.toolRegistry.get(item.tool);
        if (!tool) throw new Error(`未注册 Agent 工具：${item.tool}`);
        const policy = this.policy.validateToolAccess(tool, input.actor);
        const toolCall = await this.runtime.createToolCall({
          runId,
          toolName: tool.name,
          riskLevel: tool.riskLevel,
          status: policy.requiresApproval ? 'waiting_approval' : 'running',
          argsJson: item.args,
        });

        if (policy.requiresApproval) {
          const approval = await this.runtime.createApproval({
            runId,
            toolCallId: toolCall.id,
            requestedBy: input.actor.userId,
            beforeJson: { tool: tool.name, args: item.args, riskLevel: tool.riskLevel, reason: policy.reason },
          });
          await this.runtime.updateToolCall(toolCall.id, { approvalId: approval.id, status: 'waiting_approval' });
          const answer = policy.reason;
          const renderedBlocks = this.buildPendingApprovalBlocks(tool.name, item.args, Number(approval.id), answer);
          const conversationFocus = this.buildConversationFocus(runId, plan, toolResults, renderedBlocks);
          await this.runtime.addMessage(runId, 'assistant', answer, { status: 'waiting_approval', approvalId: approval.id });
          const updated = await this.runtime.setRunStatus(runId, 'waiting_approval', {
            resultJson: this.toJson({ answer, plan, toolResults, approval, approvalReason: policy.reason, renderedBlocks, conversationFocus }),
          });
          const runResult = this.buildRunResult(updated, plan, answer, toolResults, actions);
          return {
            ...runResult,
            renderedBlocks: renderedBlocks.length ? renderedBlocks : runResult.renderedBlocks,
            approval: {
              id: approval.id,
              toolName: tool.name,
              riskLevel: tool.riskLevel,
              status: approval.status,
              reason: policy.reason,
            },
          };
        }

        await this.runtime.setRunStatus(runId, 'running_tool');
        const toolStartedAt = new Date();
        const startedAt = Date.now();
        const result = await this.toolRegistry.execute(tool.name, item.args, {
          runId,
          storeId: input.actor.storeId,
          userId: input.actor.userId,
          deviceId: input.actor.deviceId,
          role: input.actor.role,
        });
        this.assertConsumedSlots(tool, item.args, result, input.actor);
        const safeResult = this.sanitizeToolResult(result, input.actor);
        toolResults.push(safeResult);
        actions.push(...(safeResult.actions ?? []));
        await this.runtime.updateToolCall(toolCall.id, {
          status: safeResult.status,
          resultJson: this.toJson(safeResult),
          latencyMs: Date.now() - startedAt,
        });
        const toolLatencyMs = Date.now() - startedAt;
        await this.runtime.recordStep({
          runId,
          stepType: 'tool',
          name: tool.name,
          status: safeResult.status,
          inputJson: item.args,
          outputJson: this.buildToolStepOutput(safeResult, toolLatencyMs),
          startedAt: toolStartedAt,
          endedAt: new Date(),
        });
      }

      await this.runtime.setRunStatus(runId, 'composing');
      const renderingStartedAt = new Date();
      const evidence = this.evidenceService.merge(toolResults);
      const answer = this.composeAnswer(plan, toolResults);
      const renderedBlocks = this.buildRenderedBlocks(answer, toolResults, plan);
      const answerContract = this.validateAnswerContract(plan, answer, toolResults, renderedBlocks);
      const responseMode = this.resolveResponseMode(plan, renderedBlocks);
      const phaseOutputs = this.buildPhaseOutputs(plan, answer, toolResults, actions, renderedBlocks);
      const conversationFocus = this.buildConversationFocus(runId, plan, toolResults, renderedBlocks);
      const renderingEndedAt = new Date();
      await this.runtime.recordStep({
        runId,
        stepType: 'rendering',
        name: 'agent.response.render',
        status: 'success',
        inputJson: { toolResultCount: toolResults.length, actionCount: actions.length },
        outputJson: {
          blockCount: renderedBlocks.length,
          answerContract,
          executionPath: plan.executionPath,
          responseMode,
          phaseOutputs,
          conversationFocus,
          traceSummary: this.buildTraceSummary(plan, answerContract, responseMode, renderedBlocks),
        },
        startedAt: renderingStartedAt,
        endedAt: renderingEndedAt,
      });
      await this.runtime.addMessage(runId, 'assistant', answer, this.buildCompletionMessageMeta(plan, responseMode));
      const updated = await this.runtime.setRunStatus(runId, 'completed', {
        evidenceJson: this.toJson(evidence),
        resultJson: this.toJson({
          answer,
          plan,
          toolResults,
          actions,
          evidence,
          renderedBlocks,
          answerContract,
          responseMode,
          conversationFocus,
          phaseOutputs,
          traceSummary: this.buildTraceSummary(plan, answerContract, responseMode, renderedBlocks),
        }),
      });
      return this.buildRunResult(updated, plan, answer, toolResults, actions);
    } catch (error) {
      const answer = error instanceof Error ? error.message : String(error);
      await this.runtime.addMessage(runId, 'assistant', `Agent 执行失败：${answer}`, { status: 'failed' });
      const updated = await this.runtime.setRunStatus(runId, 'failed', { errorMessage: answer });
      return this.buildRunResult(updated, undefined, `Agent 执行失败：${answer}`, [], []);
    }
  }

  private composeAnswer(plan: AgentPlan, results: AgentToolResult[]) {
    if (!results.length) return plan.clarificationQuestion ?? '没有执行任何工具。';
    if (results.length === 1) return results[0].summary;
    return results.map((result, index) => `${index + 1}. ${result.summary}`).join('\n');
  }

  private resolveResponseMode(plan: AgentPlan | undefined, renderedBlocks: AuraResponseBlock[]): AgentRunResult['responseMode'] {
    if (!plan) return undefined;
    const hasStructuredBlocks = renderedBlocks.some((block) => block.kind !== 'text');
    return plan.executionPath === 'fast' && hasStructuredBlocks ? 'structured_blocks' : 'composed_answer';
  }

  private buildCompletionMessageMeta(plan: AgentPlan, responseMode: AgentRunResult['responseMode']) {
    if (plan.executionPath === 'fast' && responseMode === 'structured_blocks') {
      return { status: 'completed', executionPath: 'fast', responseMode };
    }
    return { status: 'completed' };
  }

  private buildTraceSummary(
    plan: AgentPlan | undefined,
    answerContract?: AgentRunResult['answerContract'],
    responseMode?: AgentRunResult['responseMode'],
    renderedBlocks: AuraResponseBlock[] = [],
  ) {
    const businessTask = this.asObject(plan?.businessTask);
    const contract = this.asObject(answerContract?.contract);
    const fallbackReason = this.buildFallbackReason(plan, responseMode, renderedBlocks);
    return {
      skillId: plan?.skillPlan?.skillId,
      capabilityId: plan?.skillPlan?.capabilityId ?? plan?.capabilityPlan?.capabilityId,
      executionPath: plan?.executionPath,
      responseMode,
      fallbackReason,
      businessTask: businessTask
        ? {
            domain: businessTask.domain,
            taskType: businessTask.taskType,
            outputIntent: businessTask.outputIntent,
            metrics: businessTask.metrics,
            timeRange: businessTask.timeRange,
            confidence: businessTask.confidence,
          }
        : undefined,
      answerContract: answerContract
        ? {
            valid: answerContract.valid,
            missingKinds: answerContract.missingKinds,
            warnings: answerContract.warnings,
            source: contract?.source,
          }
        : undefined,
    };
  }

  private buildFallbackReason(
    plan: AgentPlan | undefined,
    responseMode: AgentRunResult['responseMode'],
    renderedBlocks: AuraResponseBlock[],
  ) {
    if (!plan || plan.executionPath !== 'fast') return undefined;
    if (responseMode === 'structured_blocks') return undefined;
    const hasOnlyTextBlocks = renderedBlocks.every((block) => block.kind === 'text');
    return hasOnlyTextBlocks ? 'fast_path_no_structured_blocks_use_composed_answer' : 'fast_path_contract_not_structured';
  }

  private buildPhaseOutputs(
    plan: AgentPlan | undefined,
    answer: string,
    toolResults: AgentToolResult[],
    actions: AgentSuggestedAction[],
    renderedBlocks: AuraResponseBlock[],
  ): AgentPhaseOutput[] | undefined {
    if (plan?.executionPath !== 'deep') return undefined;
    const successfulResults = toolResults.filter((result) => result.status === 'success');
    const coreSummary = answer || successfulResults[0]?.summary || plan.goal;
    const detailSummary = successfulResults.length
      ? successfulResults.map((result, index) => `${index + 1}. ${result.title}：${result.summary}`).join('\n')
      : '暂无可用明细。';
    const recommendationActions = actions.filter((action) => action.riskLevel === 'low' || action.riskLevel === 'medium');
    const draftActions = actions.filter((action) => action.riskLevel === 'medium' || action.riskLevel === 'high');
    const blockKinds = [...new Set(renderedBlocks.map((block) => block.kind))];
    const phases: AgentPhaseOutput[] = [
      {
        phase: 'core_conclusion',
        title: '核心结论',
        summary: coreSummary,
        blockKinds,
      },
      {
        phase: 'details',
        title: '数据明细',
        summary: detailSummary,
        blockKinds: blockKinds.filter((kind) => kind !== 'text'),
      },
    ];

    if (recommendationActions.length) {
      phases.push({
        phase: 'recommendations',
        title: '建议动作',
        summary: recommendationActions.map((action) => action.label).join('；'),
        actionLabels: recommendationActions.map((action) => action.label),
      });
    } else if (successfulResults.length > 1) {
      phases.push({
        phase: 'recommendations',
        title: '建议动作',
        summary: '已完成多维诊断，可继续追问具体项目、客户或员工明细。',
      });
    }

    if (draftActions.length) {
      phases.push({
        phase: 'action_draft',
        title: '操作草稿',
        summary: draftActions.map((action) => `${action.label}（${action.riskLevel}）`).join('；'),
        actionLabels: draftActions.map((action) => action.label),
      });
    }

    return phases;
  }

  private buildConversationFocus(
    runId: number,
    plan: AgentPlan | undefined,
    toolResults: AgentToolResult[],
    renderedBlocks: AuraResponseBlock[],
  ) {
    const timeRange = this.extractFocusTimeRange(plan, toolResults);
    const currentItems = this.extractFocusItems(toolResults, renderedBlocks).slice(0, 5);
    const currentCustomer = currentItems.find((item) => item.customerId || item.customerName || item.name || item.phoneMasked);
    const currentActivity = this.extractFocusActivity(toolResults, renderedBlocks);

    if (!timeRange && !currentCustomer && !currentActivity && currentItems.length === 0) return undefined;

    return {
      sourceRunId: runId,
      ...(timeRange ? { timeRange } : {}),
      ...(currentCustomer ? { currentCustomer } : {}),
      ...(currentActivity ? { currentActivity } : {}),
      ...(currentItems.length ? { currentItems } : {}),
    };
  }

  private extractFocusTimeRange(plan: AgentPlan | undefined, toolResults: AgentToolResult[]) {
    const businessTask = this.asObject(plan?.businessTask);
    const taskTimeRange = this.asObject(businessTask?.timeRange);
    if (taskTimeRange) return taskTimeRange;

    for (const result of toolResults) {
      const data = this.asObject(result.data);
      const queryPlan = this.asObject(data?.queryPlan) ?? this.asObject(this.asObject(data?.raw)?.queryPlan);
      const filters = this.asObject(queryPlan?.filters);
      const dateRange = this.asObject(filters?.dateRange);
      if (dateRange) return dateRange;
      if (result.evidence?.dateRange) return { label: result.evidence.dateRange };
    }
    return undefined;
  }

  private extractFocusItems(toolResults: AgentToolResult[], renderedBlocks: AuraResponseBlock[]) {
    const items: Array<Record<string, unknown>> = [];

    for (const result of toolResults) {
      const data = this.asObject(result.data);
      const raw = this.asObject(data?.raw);
      const card = this.asObject(data?.card) ?? this.asObject(raw?.card);
      const directItems = Array.isArray(data?.items) ? data.items : Array.isArray(card?.items) ? card.items : Array.isArray(raw?.items) ? raw.items : [];
      for (const item of directItems) {
        const normalized = this.normalizeFocusItem(item);
        if (normalized) items.push(normalized);
      }
    }

    if (items.length) return items;

    const table = renderedBlocks.find((block) => block.kind === 'table') as Extract<AuraResponseBlock, { kind: 'table' }> | undefined;
    if (!table) return items;
    return table.rows.slice(0, 5).map((row) => {
      const item: Record<string, unknown> = {};
      table.columns.forEach((column, index) => {
        item[column] = row[index];
      });
      return item;
    });
  }

  private normalizeFocusItem(value: unknown): Record<string, unknown> | undefined {
    const item = this.asObject(value);
    if (!item) return undefined;
    const customer = this.asObject(item.customer);
    return {
      ...(item.customerId !== undefined ? { customerId: item.customerId } : customer?.id !== undefined ? { customerId: customer.id } : {}),
      ...(item.customerName !== undefined
        ? { customerName: item.customerName }
        : item.name !== undefined
          ? { customerName: item.name }
          : customer?.name !== undefined
            ? { customerName: customer.name }
            : {}),
      ...(item.phoneMasked !== undefined
        ? { phoneMasked: item.phoneMasked }
        : item.phone !== undefined
          ? { phoneMasked: item.phone }
          : customer?.phone !== undefined
            ? { phoneMasked: customer.phone }
            : {}),
      ...item,
    };
  }

  private extractFocusActivity(toolResults: AgentToolResult[], renderedBlocks: AuraResponseBlock[]) {
    for (const result of toolResults) {
      const data = this.asObject(result.data);
      const activity = this.normalizeFocusActivity({
        ...(data ?? {}),
        sourceTitle: result.title,
        sourceSummary: result.summary,
      });
      if (activity) return activity;
    }

    const activityBlock = renderedBlocks.find((block) => block.kind === 'activity_draft_card') as
      | Extract<AuraResponseBlock, { kind: 'activity_draft_card' }>
      | undefined;
    if (!activityBlock) return undefined;

    const activityId = this.extractActivityIdFromActions(activityBlock.actions);
    return this.normalizeFocusActivity({
      activityId,
      title: activityBlock.title,
      targetAudience: activityBlock.targetAudience,
      offerSummary: activityBlock.offerSummary,
      copyPreview: activityBlock.copyPreview,
      scheduleHint: activityBlock.scheduleHint,
      sourceTitle: '活动草稿卡',
    });
  }

  private normalizeFocusActivity(value: Record<string, unknown>) {
    const title = value.title ?? value.activityTitle;
    const activityId = value.activityId ?? value.id;
    const hasActivitySignal =
      value.sourceTitle === '营销活动草稿' ||
      value.sourceTitle === '活动草稿卡' ||
      activityId !== undefined ||
      title !== undefined;
    if (!hasActivitySignal || (activityId === undefined && title === undefined)) return undefined;

    return {
      ...(activityId !== undefined ? { activityId } : {}),
      ...(title !== undefined ? { activityTitle: title } : {}),
      ...(value.status !== undefined ? { status: value.status } : {}),
      ...(value.targetAudience !== undefined ? { targetAudience: value.targetAudience } : {}),
      ...(value.offerSummary !== undefined ? { offerSummary: value.offerSummary } : {}),
      ...(value.copyPreview !== undefined ? { copyPreview: value.copyPreview } : {}),
      ...(value.scheduleHint !== undefined ? { scheduleHint: value.scheduleHint } : {}),
    };
  }

  private extractActivityIdFromActions(actions?: AuraBlockAction[]) {
    for (const action of actions ?? []) {
      const match = String(action.actionId ?? '').match(/marketing:activity:(?:edit:)?(\d+)/);
      if (match) return Number(match[1]);
    }
    return undefined;
  }

  private assertConsumedSlots(tool: AgentToolDefinition, args: Record<string, unknown>, result: AgentToolResult, actor: AgentActor) {
    const declaredSlots = tool.consumedSlots ?? [];
    const requiredSlots = declaredSlots.filter((slot) => slot === 'timeRange' || slot === 'limit');
    const filterSlots = declaredSlots.filter((slot) => slot.startsWith('filters.'));
    if (!requiredSlots.length && !filterSlots.length) return;
    const data = this.asObject(result.data);
    const consumedSlots = this.asObject(data?.consumedSlots);
    const missing = requiredSlots.filter((slot) => !(slot in (consumedSlots ?? {})));
    if (missing.length) {
      throw new Error(`工具「${tool.name}」未回写关键槽位：${missing.join('、')}，已阻止生成可能答非所问的回复。`);
    }
    if (requiredSlots.includes('timeRange')) {
      const requestedTimeRange = typeof args.timeRange === 'string' ? args.timeRange : this.getDefaultTimeRangePreset(tool.name);
      const consumedTimeRange = this.asObject(consumedSlots?.timeRange);
      if (consumedTimeRange?.preset !== requestedTimeRange) {
        throw new Error(
          `工具「${tool.name}」未消费请求时间范围：请求 ${requestedTimeRange}，实际 ${String(consumedTimeRange?.preset ?? '未返回')}。`,
        );
      }
    }
    if (requiredSlots.includes('limit')) {
      const requestedLimit = this.normalizeRequestedLimit(tool.name, args.limit, actor);
      if (Number(consumedSlots?.limit) !== requestedLimit) {
        throw new Error(`工具「${tool.name}」未消费请求数量：请求 ${requestedLimit}，实际 ${String(consumedSlots?.limit ?? '未返回')}。`);
      }
    }
    this.assertConsumedFilterSlots(tool.name, args, consumedSlots, filterSlots);
  }

  private assertConsumedFilterSlots(
    toolName: string,
    args: Record<string, unknown>,
    consumedSlots: Record<string, unknown> | undefined,
    filterSlots: string[],
  ) {
    if (!filterSlots.length) return;
    const requestedFilters = this.asObject(args.filters);
    const consumedFilters = this.asObject(consumedSlots?.filters);
    for (const slot of filterSlots) {
      const filterName = slot.slice('filters.'.length);
      const requestedValue = requestedFilters?.[filterName];
      if (requestedValue === undefined || requestedValue === null || requestedValue === '') continue;
      const consumedValue = consumedFilters?.[filterName];
      if (consumedValue !== requestedValue) {
        throw new Error(
          `工具「${toolName}」未消费请求过滤条件：${filterName} 请求 ${String(requestedValue)}，实际 ${String(consumedValue ?? '未返回')}。`,
        );
      }
    }
  }

  private getDefaultTimeRangePreset(toolName: string) {
    if (toolName === 'customer.priority.rank') return 'today';
    if (toolName === 'revenue.diagnose') return 'today';
    if (toolName === 'finance.revenue.summary') return 'today';
    if (toolName === 'finance.report.draft') return 'this_month';
    if (toolName === 'schedule.diagnose') return 'today';
    return 'last_30_days';
  }

  private normalizeRequestedLimit(toolName: string, value: unknown, actor: AgentActor) {
    if (toolName === 'staff.performance.rank' && actor.role === 'beautician') return 1;
    const fallback = toolName === 'marketing.opportunity.discover' ? 10 : toolName === 'service.record.draft' ? 5 : 10;
    const max = toolName === 'marketing.opportunity.discover' || toolName === 'service.record.draft' ? 20 : 50;
    return Math.min(Math.max(Number(value) || fallback, 1), max);
  }

  private sanitizeToolResult(result: AgentToolResult, actor: AgentActor): AgentToolResult {
    const displaySafeResult = this.responseSafety.sanitizeToolResult(result);
    return this.fieldScopeSanitizer.sanitize(displaySafeResult, actor.fieldScopes);
  }

  private buildToolStepOutput(result: AgentToolResult, latencyMs: number) {
    return {
      ...result,
      observability: this.buildToolObservability(result, latencyMs),
    };
  }

  private buildToolObservability(result: AgentToolResult, latencyMs: number) {
    const data = this.asObject(result.data);
    const raw = this.asObject(data?.raw);
    const card = this.asObject(data?.card) ?? this.asObject(raw?.card);
    const queryPlan = this.asObject(data?.queryPlan) ?? this.asObject(raw?.queryPlan);
    const rows = Array.isArray(data?.rows) ? data.rows : Array.isArray(raw?.rows) ? raw.rows : [];
    const items = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(card?.items)
        ? card.items
        : Array.isArray(raw?.items)
          ? raw.items
          : [];
    const kpis = Array.isArray(data?.kpis) ? data.kpis : Array.isArray(card?.kpis) ? card.kpis : Array.isArray(raw?.kpis) ? raw.kpis : [];
    const sampleSize = Number(result.evidence?.sampleSize);
    const dataVolume = {
      itemCount: items.length,
      rowCount: rows.length,
      kpiCount: kpis.length,
      sampleSize: Number.isFinite(sampleSize) ? sampleSize : undefined,
    };
    return {
      latencyMs,
      slowQuery: latencyMs >= 2000,
      queryPlan: queryPlan ?? undefined,
      dataVolume,
      performanceHints: this.buildPerformanceHints(queryPlan, latencyMs, dataVolume),
    };
  }

  private buildPerformanceHints(
    queryPlan: Record<string, unknown> | undefined,
    latencyMs: number,
    dataVolume: { itemCount: number; rowCount: number; kpiCount: number; sampleSize?: number },
  ) {
    const capabilityId = String(queryPlan?.capabilityId ?? queryPlan?.capability ?? queryPlan?.templateId ?? '');
    const highFrequencyCapabilities = new Set([
      'order_customer_consumption_list',
      'order_revenue',
      'reservation_today',
      'reservation_schedule_diagnosis',
      'inventory_alert',
      'inventory_risk_ranking',
      'staff_performance_ranking',
    ]);
    const isHighFrequency = highFrequencyCapabilities.has(capabilityId);
    const largeResult = (dataVolume.sampleSize ?? 0) >= 100 || dataVolume.itemCount >= 50 || dataVolume.rowCount >= 50;
    if (!isHighFrequency && latencyMs < 1500 && !largeResult) return undefined;
    return {
      cacheCandidate: isHighFrequency || latencyMs >= 1500,
      preaggregationCandidate: largeResult || latencyMs >= 2000,
      reason: isHighFrequency
        ? '高频门店问数，建议按门店和时间范围设置短 TTL 缓存。'
        : latencyMs >= 2000
          ? '单次查询耗时较高，建议评估预聚合或索引。'
          : '结果集较大，建议评估分页、缓存或预聚合。',
    };
  }

  private buildRunResult(
    run: any,
    plan: AgentPlan | undefined,
    answer: string,
    toolResults: AgentToolResult[],
    actions: AgentSuggestedAction[],
  ): AgentRunResult {
    const renderedBlocks = this.buildRenderedBlocks(answer, toolResults, plan);
    const followUpSuggestions = this.buildFollowUpSuggestions(actions, plan);
    const answerContract = this.validateAnswerContract(plan, answer, toolResults, renderedBlocks);
    const responseMode = plan ? this.resolveResponseMode(plan, renderedBlocks) : undefined;
    const phaseOutputs = this.buildPhaseOutputs(plan, answer, toolResults, actions, renderedBlocks);
    return {
      runId: Number(run.id),
      runNo: String(run.runNo),
      status: run.status,
      plan,
      answer,
      toolResults,
      actions,
      evidence: this.evidenceService.merge(toolResults),
      responseMode,
      renderedBlocks,
      phaseOutputs,
      answerContract,
      followUpSuggestions,
    };
  }

  private validateAnswerContract(
    plan: AgentPlan | undefined,
    answer: string,
    toolResults: AgentToolResult[],
    renderedBlocks: AuraResponseBlock[],
  ) {
    return this.answerContractValidator?.validate({
      plan,
      answer,
      toolResults,
      renderedBlocks,
    });
  }

  /**
   * 根据工具执行结果自动构建 AuraResponseBlock[]。
   * 规则：
   * 1. answer 文字 → text block
   * 2. 工具 summary → kpi_card（如包含数字指标）或 text
   * 3. 工具 data.items（数组）→ table block
   * 4. 工具 data.kpis（KPI 列表）→ kpi_card group
   * 5. AgentEvidence → evidence_panel block
   * 6. 需审批的动作 → confirm_action block
   */
  private buildRenderedBlocks(
    answer: string,
    toolResults: AgentToolResult[],
    plan?: AgentPlan,
  ): AuraResponseBlock[] {
    const blocks: AuraResponseBlock[] = [];

    // 主回答文字
    if (answer) {
      blocks.push({ kind: 'text', content: answer });
    }

    for (const result of toolResults) {
      if (result.status !== 'success') continue;
      const data = result.data as Record<string, unknown> | undefined;
      if (!data) continue;

      if (result.title === '商品活动机会' && Array.isArray(data.items) && data.items.length > 0) {
        const top = data.items[0] as Record<string, unknown>;
        blocks.push({
          kind: 'opportunity_card',
          title: result.title,
          summary: result.summary,
          opportunityType: String(top.opportunityType ?? '机会'),
          fitScore: Number(top.fitScore) || 0,
          productName: String(top.productName ?? top.name ?? '推荐商品'),
          sku: top.sku ? String(top.sku) : undefined,
          currentStock: top.currentStock !== undefined ? Number(top.currentStock) : undefined,
          safetyStock: top.safetyStock !== undefined ? Number(top.safetyStock) : undefined,
          salesQuantity: top.salesQuantity !== undefined ? Number(top.salesQuantity) : undefined,
          salesAmount: top.salesAmount !== undefined ? Number(top.salesAmount) : undefined,
          customerCount: top.customerCount !== undefined ? Number(top.customerCount) : undefined,
          expiringStock: top.expiringStock !== undefined ? Number(top.expiringStock) : undefined,
          daysToExpiry: top.daysToExpiry === null || top.daysToExpiry === undefined ? null : Number(top.daysToExpiry),
          marginRateText: top.marginRateText ? String(top.marginRateText) : undefined,
          reason: String(top.reason ?? result.summary ?? ''),
          suggestedCampaign: top.suggestedCampaign ? String(top.suggestedCampaign) : undefined,
          suggestedChannels: Array.isArray(top.suggestedChannels) ? top.suggestedChannels.map((item) => String(item)).slice(0, 3) : undefined,
          riskWarnings: Array.isArray(top.riskWarnings) ? top.riskWarnings.map((item) => String(item)).slice(0, 3) : undefined,
          actions: (result.actions ?? []).slice(0, 3).map((action) => ({
            label: action.label,
            actionId: action.action,
            riskLevel: action.riskLevel,
          })),
        });
      }

      if (result.title === '营销话术生成' && Array.isArray(data.copies)) {
        const copies = data.copies.map((copy, index) => ({
          label: `变体${index + 1}`,
          content: String(copy),
          tone: index === 0 ? '温和提醒' : index === 1 ? '活动邀约' : '专属回访',
        })).slice(0, 3);
        if (copies.length > 0) {
          blocks.push({
            kind: 'copy_variants',
            title: result.title,
            target: String(data.target ?? '目标客群'),
            offer: String(data.offer ?? '专属权益'),
            variants: copies,
            actions: (result.actions ?? []).slice(0, 2).map((action) => ({
              label: action.label,
              actionId: action.action,
              riskLevel: action.riskLevel,
            })),
          });
        }
      }

      if (result.title === '营销活动草稿' && data.activityId) {
        blocks.push({
          kind: 'activity_draft_card',
          title: String(data.title ?? result.title),
          targetAudience: String(data.targetAudience ?? '待运营在活动管理页确认'),
          offerSummary: String(data.offerSummary ?? '待运营确认权益'),
          copyPreview: String(data.copyPreview ?? result.summary),
          scheduleHint: String(data.scheduleHint ?? '已保存为草稿，发布前请确认发送时间'),
          impactSummary: '草稿已保存，不会自动发布或触达客户；请进入活动管理继续完善。',
          editable: false,
          recommendedItems: Array.isArray(data.recommendedItems)
            ? (data.recommendedItems as Array<Record<string, unknown>>).slice(0, 3).map((item) => ({
              name: String(item.productName ?? item.name ?? '推荐商品'),
              reason: item.reason ? String(item.reason) : undefined,
              fitScore: item.fitScore !== undefined ? Number(item.fitScore) : undefined,
            }))
            : undefined,
          actions: (result.actions ?? []).slice(0, 3).map((action) => ({
            label: action.label,
            actionId: action.action,
            riskLevel: action.riskLevel,
          })),
        });
      }

      if (result.title === '活动效果复盘') {
        const funnel = Array.isArray(data.funnel)
          ? data.funnel
          : this.buildMarketingEffectFunnel(data);
        if (funnel.length > 0) {
          blocks.push({
            kind: 'chart',
            chartType: 'funnel',
            title: '营销效果漏斗',
            data: funnel,
            xKey: 'name',
            yKeys: ['value'],
          });
        }
      }

      const inventoryCard = this.buildInventoryItemCard(result, data);
      if (inventoryCard) {
        blocks.push(inventoryCard);
      }

      const supplierCard = this.buildSupplierPurchaseCard(result, data);
      if (supplierCard) {
        blocks.push(supplierCard);
      }

      const document = this.asObject(data.document);
      if (document?.title && document?.content) {
        blocks.push({
          kind: 'document_preview',
          title: String(document.title),
          content: String(document.content),
          downloadable: Boolean(document.downloadable),
        });
      }

      // KPI 指标数组 → kpi_card blocks
      const businessQueryCard = this.asObject(data.card);
      const kpis = Array.isArray(data.kpis)
        ? data.kpis as Array<{ label: string; value: string; delta?: string; deltaType?: string }>
        : Array.isArray(businessQueryCard?.kpis)
          ? businessQueryCard.kpis as Array<{ label: string; value: string; delta?: string; deltaType?: string }>
          : null;
      if (kpis && kpis.length > 0) {
        for (const kpi of kpis) {
          blocks.push({
            kind: 'kpi_card',
            label: kpi.label,
            value: String(kpi.value),
            delta: kpi.delta,
            deltaType: kpi.deltaType as 'up' | 'down' | 'neutral' | undefined,
          });
        }
      }

      // items 数组 → table block
      const shouldSkipGenericItems = result.title === '营销话术生成' || result.title === '活动效果复盘';
      const items = !shouldSkipGenericItems && Array.isArray(data.items)
        ? data.items as Array<Record<string, unknown>>
        : !shouldSkipGenericItems && Array.isArray(businessQueryCard?.items)
          ? businessQueryCard.items as Array<Record<string, unknown>>
          : null;
      if (items && items.length > 0) {
        const columns = Object.keys(items[0] ?? {}).slice(0, 6);
        const rows = items.slice(0, 20).map((item) =>
          columns.map((col) => String(item[col] ?? '')),
        );
        if (columns.length > 0 && rows.length > 0) {
          blocks.push({ kind: 'table', columns, rows });
        }
      }

      // risks / alerts 数组 → alert blocks
      const risks = Array.isArray(data.risks) ? data.risks as Array<{ title?: string; message?: string; severity?: string }> : null;
      if (risks && risks.length > 0) {
        for (const risk of risks.slice(0, 3)) {
          const message = risk.title ?? risk.message ?? String(risk);
          if (message) {
            blocks.push({
              kind: 'alert',
              level: risk.severity === 'high' ? 'critical' : 'warning',
              message,
            });
          }
        }
      }
    }

    // 审批待确认 → confirm_action
    if (plan?.intentType === 'draft' && toolResults.length > 0) {
      const draftResult = toolResults.find((r) => r.status === 'success');
      if (draftResult) {
        blocks.push({
          kind: 'confirm_action',
          title: `确认执行：${draftResult.title}`,
          preview: draftResult.summary,
          actionId: `approve:${plan.toolPlan[0]?.tool ?? 'draft'}`,
          riskLevel: 'medium',
        });
      }
    }

    // Evidence 来源面板
    const evidence = this.evidenceService.merge(toolResults);
    const evidenceSources = evidence?.sourceTables?.length ? evidence.sourceTables : evidence?.source;
    if (evidence && evidenceSources && evidenceSources.length > 0) {
      blocks.push({
        kind: 'evidence_panel',
        sources: evidenceSources,
        dateRange: evidence.dateRange,
        metricDefinition: evidence.metricDefinition,
        limitations: evidence.limitations,
      });
    }

    return blocks;
  }

  private buildPendingApprovalBlocks(
    toolName: string,
    args: Record<string, unknown>,
    approvalId: number,
    answer: string,
  ): AuraResponseBlock[] {
    if (toolName !== 'marketing.activity.draft') {
      return [{ kind: 'text', content: answer }];
    }
    const items = this.collectOpportunityItems(args).slice(0, 3);
    const primary = items[0];
    const productName = String(primary?.productName ?? primary?.name ?? args.title ?? '推荐商品');
    const campaignName = String(args.offerSummary ?? args.offer ?? primary?.suggestedCampaign ?? '会员专属活动');
    const title = String(args.title ?? `${productName}${campaignName}`);
    const riskWarnings = items.flatMap((item) => Array.isArray(item.riskWarnings) ? item.riskWarnings.map(String) : []).slice(0, 2);
    const copyPreview = String(
      args.copyPreview ??
        `亲爱的会员，${productName}正在做${campaignName}，适合近期补水修护需求。名额有限，到店前可先预约顾问为您确认适用权益。`,
    );
    const offerCostEstimate = this.buildActivityDraftCostEstimate(items, campaignName);
    const audienceDetails = this.buildActivityDraftAudienceDetails(items);
    const targetAudience = String(args.targetAudience ?? (items.length ? '近期购买/适合该商品的会员客户' : '待运营确认目标客群'));
    const scheduleHint = String(args.scheduleHint ?? '建议审批通过后先保存草稿，再由运营确认发送时间');
    const impactSummary = riskWarnings.length
      ? `需关注：${riskWarnings.join('；')}`
      : '审批通过后仅创建 draft 状态活动，不自动发布、不自动触达客户。';

    return [
      {
        kind: 'activity_draft_card',
        title,
        targetAudience,
        offerSummary: campaignName,
        copyPreview,
        scheduleHint,
        impactSummary,
        offerCostEstimate,
        audienceDetails,
        editable: true,
        recommendedItems: items.map((item) => ({
          name: String(item.productName ?? item.name ?? '推荐商品'),
          reason: item.reason ? String(item.reason) : undefined,
          fitScore: item.fitScore !== undefined ? Number(item.fitScore) : undefined,
        })),
        actions: [
          { label: '确认创建草稿', actionId: `approve:${approvalId}`, riskLevel: 'medium' },
          { label: '暂不创建', actionId: `reject:${approvalId}`, riskLevel: 'low' },
        ],
      },
      {
        kind: 'confirm_action',
        title: `确认创建活动草稿：${title}`,
        preview: `${targetAudience}；${campaignName}；${impactSummary}`,
        actionId: `approve:${approvalId}`,
        riskLevel: 'medium',
        impactSummary: '确认后只创建 draft 状态营销活动，不会自动发布或触达客户。',
      },
    ];
  }

  private buildActivityDraftCostEstimate(items: Array<Record<string, unknown>>, offerSummary: string) {
    const totalCustomerCount = items.reduce((sum, item) => sum + this.safeNumber(item.customerCount), 0);
    const totalSalesAmount = items.reduce((sum, item) => sum + this.safeNumber(item.salesAmount), 0);
    const averageFitScore = items.length
      ? Math.round(items.reduce((sum, item) => sum + this.safeNumber(item.fitScore), 0) / items.length)
      : 0;
    const estimatedTouchCount = totalCustomerCount > 0 ? Math.min(totalCustomerCount, 300) : 50;
    const discountRate = /折|满减|优惠|券|立减/.test(offerSummary) ? 0.12 : /赠|礼包|买赠/.test(offerSummary) ? 0.08 : 0.06;
    const estimatedBudget = Math.max(0, Math.round((totalSalesAmount || estimatedTouchCount * 180) * discountRate));

    return [
      {
        label: '预计触达',
        value: `${estimatedTouchCount}人`,
        tone: estimatedTouchCount > 200 ? 'warning' as const : 'default' as const,
      },
      {
        label: '权益成本估算',
        value: estimatedBudget > 0 ? `约 ¥${estimatedBudget.toLocaleString('zh-CN')}` : '待确认',
        tone: estimatedBudget > 3000 ? 'warning' as const : 'success' as const,
      },
      {
        label: '平均匹配分',
        value: averageFitScore > 0 ? `${averageFitScore}` : '待评估',
        tone: averageFitScore >= 80 ? 'success' as const : 'default' as const,
      },
    ];
  }

  private buildActivityDraftAudienceDetails(items: Array<Record<string, unknown>>) {
    if (!items.length) {
      return [
        {
          label: '目标客群',
          value: '待运营确认',
          description: '审批后只保存草稿，发布前需在营销活动页确认具体客群。',
        },
      ];
    }
    return items.slice(0, 5).map((item, index) => {
      const name = String(item.productName ?? item.name ?? `推荐对象${index + 1}`);
      const customerCount = this.safeNumber(item.customerCount);
      const salesQuantity = this.safeNumber(item.salesQuantity);
      const currentStock = this.safeNumber(item.currentStock);
      const reason = item.reason ? String(item.reason) : undefined;
      return {
        label: name,
        value: customerCount > 0 ? `${customerCount}位相关客户` : salesQuantity > 0 ? `近30天销量 ${salesQuantity}` : '建议运营复核',
        description: [
          currentStock > 0 ? `库存 ${currentStock}` : '',
          reason,
        ].filter(Boolean).join(' · ') || '基于营销机会推荐生成，发布前需确认真实客群。',
      };
    });
  }

  private safeNumber(value: unknown) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  private collectOpportunityItems(value: unknown): Array<Record<string, unknown>> {
    const found: Array<Record<string, unknown>> = [];
    const visit = (node: unknown) => {
      if (!node || found.length >= 10) return;
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      if (typeof node !== 'object') return;
      const object = node as Record<string, unknown>;
      if (
        (object.productName || object.name) &&
        (object.fitScore !== undefined || object.opportunityType || object.suggestedCampaign)
      ) {
        found.push(object);
      }
      for (const child of Object.values(object)) visit(child);
    };
    visit(value);
    return found;
  }

  private buildMarketingEffectFunnel(data: Record<string, unknown>): Array<Record<string, unknown>> {
    const total = Number(data.total) || 0;
    const converted = Number(data.converted) || 0;
    const revenue = Number(data.revenue) || 0;
    if (total <= 0) return [];
    return [
      { name: '触达', value: total, valueText: `${total}人`, rateText: '100%' },
      { name: '核销/转化', value: converted, valueText: `${converted}人`, rateText: this.formatRate(converted, total) },
      { name: '收入贡献', value: converted, valueText: this.formatCurrency(revenue), rateText: this.formatRate(converted, total) },
    ];
  }

  private buildInventoryItemCard(result: AgentToolResult, data: Record<string, unknown>): AuraResponseBlock | null {
    if (
      ![
        '库存风险排行',
        '库存消耗趋势',
        '项目耗材 BOM 风险',
        '临期库存处理草稿',
        '补货采购草稿',
      ].includes(result.title)
    ) {
      return null;
    }
    const items = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : [];
    const top = items[0];
    if (!top) return null;

    const actions = (result.actions ?? []).slice(0, 3).map((action) => ({
      label: action.label,
      actionId: action.action,
      riskLevel: action.riskLevel,
    }));

    if (result.title === '项目耗材 BOM 风险') {
      return {
        kind: 'inventory_item_card',
        title: result.title,
        itemName: String(top.projectName ?? '项目耗材风险'),
        subtitle: top.topRiskProductName ? `重点耗材：${String(top.topRiskProductName)}` : undefined,
        riskLevel: this.normalizeRiskLevel(top.riskLevel),
        statusLabel: this.riskLabel(top.riskLevel),
        metrics: [
          { label: '服务次数', value: String(top.serviceCount ?? 0) },
          { label: 'BOM 数', value: String(top.bomItemCount ?? 0) },
          { label: '风险分', value: String(top.riskScore ?? 0), tone: this.riskTone(top.riskLevel) },
          { label: '缺口', value: this.firstBomShortageText(top), tone: this.riskTone(top.riskLevel) },
        ],
        reason: String(top.reason ?? result.summary),
        actions,
      };
    }

    if (result.title === '临期库存处理草稿') {
      return {
        kind: 'inventory_item_card',
        title: result.title,
        itemName: String(top.productName ?? '临期商品'),
        subtitle: top.batchNo ? `批次：${String(top.batchNo)}` : undefined,
        riskLevel: this.normalizeRiskLevel(top.riskLevel),
        statusLabel: top.daysToExpiry !== undefined ? `${String(top.daysToExpiry)} 天后到期` : this.riskLabel(top.riskLevel),
        metrics: [
          { label: '库存', value: this.withUnit(top.stock, top.unit) },
          { label: '建议价', value: String(top.suggestedPriceText ?? '-') },
          { label: '折扣', value: this.formatDiscount(top.suggestedDiscountRate) },
          { label: '到期日', value: String(top.expiryDate ?? '-') },
        ],
        reason: String(top.suggestedAction ?? result.summary),
        actions,
      };
    }

    return {
      kind: 'inventory_item_card',
      title: result.title,
      itemName: String(top.productName ?? top.name ?? '库存商品'),
      subtitle: top.sku ? `SKU ${String(top.sku)}` : undefined,
      riskLevel: this.normalizeRiskLevel(top.riskLevel),
      statusLabel: top.projectedDaysLeft !== undefined && top.projectedDaysLeft !== null
        ? `预计可用 ${String(top.projectedDaysLeft)} 天`
        : this.riskLabel(top.riskLevel),
      metrics: [
        { label: '当前库存', value: this.withUnit(top.currentStock, top.unit) },
        { label: '安全库存', value: this.withUnit(top.safetyStock, top.unit) },
        { label: '累计消耗', value: this.withUnit(top.consumeQty ?? top.quantity, top.unit) },
        { label: '建议量', value: this.withUnit(top.suggestedQty ?? top.quantity, top.unit), tone: 'warning' },
      ],
      reason: String(top.reason ?? result.summary),
      actions,
    };
  }

  private buildSupplierPurchaseCard(result: AgentToolResult, data: Record<string, unknown>): AuraResponseBlock | null {
    if (result.title !== '供应商采购链接') return null;
    const items = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : [];
    const top = items[0];
    if (!top) return null;
    return {
      kind: 'supplier_purchase_card',
      title: result.title,
      productName: String(top.productName ?? '采购商品'),
      supplierName: String(top.supplierName ?? '未绑定供应商'),
      statusLabel: top.status === 'missing_supplier_link' ? '需维护供应商' : '已绑定供应商',
      metrics: [
        { label: '当前库存', value: this.withUnit(top.currentStock, top.unit) },
        { label: '建议采购', value: this.withUnit(top.suggestedQty, top.unit), tone: 'warning' },
        { label: '供货价', value: String(top.supplyPriceText ?? '-') },
        { label: '交期', value: top.leadDays !== undefined && top.leadDays !== null ? `${String(top.leadDays)} 天` : '-' },
      ],
      reason: String(top.reason ?? result.summary),
      actions: (result.actions ?? []).slice(0, 3).map((action) => ({
        label: action.label,
        actionId: action.action,
        riskLevel: action.riskLevel,
      })),
    };
  }

  private normalizeRiskLevel(value: unknown): 'low' | 'medium' | 'high' | undefined {
    if (value === 'high' || value === '高') return 'high';
    if (value === 'medium' || value === '中') return 'medium';
    if (value === 'low' || value === '低') return 'low';
    return undefined;
  }

  private riskLabel(value: unknown): string | undefined {
    if (value === 'high' || value === '高') return '高风险';
    if (value === 'medium' || value === '中') return '中风险';
    if (value === 'low' || value === '低') return '低风险';
    return undefined;
  }

  private riskTone(value: unknown): 'default' | 'warning' | 'critical' | 'success' {
    if (value === 'high' || value === '高') return 'critical';
    if (value === 'medium' || value === '中') return 'warning';
    if (value === 'low' || value === '低') return 'success';
    return 'default';
  }

  private withUnit(value: unknown, unit: unknown): string {
    if (value === undefined || value === null || value === '') return '-';
    return `${String(value)}${unit ? String(unit) : ''}`;
  }

  private formatDiscount(value: unknown): string {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return '-';
    return `${Math.round(num * 100) / 10}折`;
  }

  private firstBomShortageText(item: Record<string, unknown>): string {
    const risks = Array.isArray(item.bomRisks) ? item.bomRisks as Array<Record<string, unknown>> : [];
    const shortage = Number(risks[0]?.shortage ?? 0);
    return this.withUnit(shortage, risks[0]?.unit);
  }

  private formatRate(value: number, total: number): string {
    if (!total) return '0%';
    return `${Math.round((value / total) * 1000) / 10}%`;
  }

  private formatCurrency(value: number): string {
    return `¥${Math.round(value).toLocaleString('zh-CN')}`;
  }

  /** 从 actions 和 plan 中提取 1-3 个高价值关联问题 */
  private buildFollowUpSuggestions(
    actions: AgentSuggestedAction[],
    plan?: AgentPlan,
  ): string[] {
    const suggestions: string[] = [];

    // 从 AgentSuggestedAction 中提取最多 3 个
    for (const action of actions.slice(0, 3)) {
      if (action.label && !suggestions.includes(action.label)) {
        suggestions.push(action.label);
      }
    }

    return suggestions.slice(0, 3);
  }

  private asObject(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
  }

  private asPlan(value: unknown): AgentPlan | undefined {
    const object = this.asObject(value);
    if (!object) return undefined;
    return object as AgentPlan;
  }

  private toJson(value: unknown) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }
}
