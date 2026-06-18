import { Injectable } from '@nestjs/common';
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
    const mergedContext = {
      ...(this.asObject(run.contextJson)),
      ...(this.asObject(run.resultJson) ? { previousResult: this.asObject(run.resultJson) } : {}),
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

  async runDefaultEvals() {
    return this.evalService.runDefaultCases();
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
      await this.runtime.recordStep({
        runId: Number(run.id),
        stepType: 'tool',
        name: tool.name,
        status: safeResult.status,
        inputJson: args,
        outputJson: safeResult,
        endedAt: new Date(),
      });
      await this.runtime.addMessage(Number(run.id), 'assistant', answer, {
        status: 'completed',
        approvalId: input.approvalId,
      });
      const updated = await this.runtime.setRunStatus(Number(run.id), 'completed', {
        evidenceJson: this.toJson(evidence),
        resultJson: this.toJson({ answer, plan, toolResults, actions, evidence, approval }),
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
      const plan = await this.planner.plan({ message: input.message, actor: input.actor, context: input.context });
      await this.runtime.persistPlan(runId, plan);
      await this.runtime.recordStep({
        runId,
        stepType: 'planner',
        name: 'agent.planner',
        status: 'success',
        inputJson: { message: input.message, role: input.actor.role, context: input.context },
        outputJson: plan,
        endedAt: new Date(),
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
            beforeJson: { tool: tool.name, args: item.args, riskLevel: tool.riskLevel },
          });
          await this.runtime.updateToolCall(toolCall.id, { approvalId: approval.id, status: 'waiting_approval' });
          const answer = `工具「${tool.name}」需要人工确认后执行。`;
          await this.runtime.addMessage(runId, 'assistant', answer, { status: 'waiting_approval', approvalId: approval.id });
          const updated = await this.runtime.setRunStatus(runId, 'waiting_approval', {
            resultJson: this.toJson({ answer, plan, toolResults, approval }),
          });
          return {
            ...this.buildRunResult(updated, plan, answer, toolResults, actions),
            approval: {
              id: approval.id,
              toolName: tool.name,
              riskLevel: tool.riskLevel,
              status: approval.status,
            },
          };
        }

        await this.runtime.setRunStatus(runId, 'running_tool');
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
        await this.runtime.recordStep({
          runId,
          stepType: 'tool',
          name: tool.name,
          status: safeResult.status,
          inputJson: item.args,
          outputJson: safeResult,
          endedAt: new Date(),
        });
      }

      await this.runtime.setRunStatus(runId, 'composing');
      const evidence = this.evidenceService.merge(toolResults);
      const answer = this.composeAnswer(plan, toolResults);
      await this.runtime.addMessage(runId, 'assistant', answer, { status: 'completed' });
      const updated = await this.runtime.setRunStatus(runId, 'completed', {
        evidenceJson: this.toJson(evidence),
        resultJson: this.toJson({ answer, plan, toolResults, actions, evidence }),
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

  private buildRunResult(
    run: any,
    plan: AgentPlan | undefined,
    answer: string,
    toolResults: AgentToolResult[],
    actions: AgentSuggestedAction[],
  ): AgentRunResult {
    return {
      runId: Number(run.id),
      runNo: String(run.runNo),
      status: run.status,
      plan,
      answer,
      toolResults,
      actions,
      evidence: this.evidenceService.merge(toolResults),
    };
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
