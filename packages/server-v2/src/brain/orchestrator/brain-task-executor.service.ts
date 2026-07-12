import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BrainDomainAdapterRegistryService } from '../domain/brain-domain-adapter-registry.service.js';
import type { BrainRoleIntentPlan } from '../domain/brain-domain-adapter.types.js';
import { BrainTraceService } from '../governance/brain-trace.service.js';
import type {
  BrainTaskExecutionInput,
  BrainTaskExecutionResult,
  BrainTaskNode,
  BrainTaskResult,
} from './brain-task.types.js';

@Injectable()
export class BrainTaskExecutorService {
  constructor(
    private readonly adapters: BrainDomainAdapterRegistryService,
    private readonly trace: BrainTraceService,
  ) {}

  async execute(input: BrainTaskExecutionInput): Promise<BrainTaskExecutionResult> {
    const pending = new Map(input.plan.nodes.map((node) => [node.id, node]));
    const results = new Map<string, BrainTaskResult>();

    while (pending.size) {
      const ready = [...pending.values()].filter((node) => node.dependencies.every((dependency) => results.has(dependency.nodeId)));
      if (!ready.length) {
        for (const node of pending.values()) {
          results.set(node.id, {
            nodeId: node.id,
            role: node.role,
            status: 'skipped',
            citations: [],
            suggestedActions: [],
            latencyMs: 0,
            attempts: 0,
            error: 'task_dependency_cycle_or_missing_node',
          });
        }
        break;
      }

      const batchResults = await Promise.all(ready.map((node) => this.executeNode(node, input, results)));
      for (const result of batchResults) {
        results.set(result.nodeId, result);
        pending.delete(result.nodeId);
      }
    }

    const orderedResults = input.plan.nodes.map((node) => results.get(node.id)).filter((item): item is BrainTaskResult => Boolean(item));
    const summary = orderedResults.find((result) => result.nodeId === 'supervisor_summary');
    const successful = orderedResults.filter((result) => result.status === 'completed' && result.nodeId !== 'supervisor_summary');
    return {
      status: successful.length ? 'completed' : 'failed',
      answer: summary?.answer ?? this.composeSummary(input.plan.objective, orderedResults),
      citations: successful.flatMap((result) => result.citations),
      suggestedActions: successful.flatMap((result) => result.suggestedActions),
      results: orderedResults,
    };
  }

  private async executeNode(
    node: BrainTaskNode,
    input: BrainTaskExecutionInput,
    priorResults: Map<string, BrainTaskResult>,
  ): Promise<BrainTaskResult> {
    const startedAt = Date.now();
    if (node.kind === 'summary') {
      const result: BrainTaskResult = {
        nodeId: node.id,
        role: node.role,
        status: 'completed',
        answer: this.composeSummary(input.plan.objective, [...priorResults.values()]),
        citations: [],
        suggestedActions: [],
        latencyMs: Date.now() - startedAt,
        attempts: 1,
      };
      await this.recordNode(input.runId, node, result);
      return result;
    }

    const dependencyContext = node.dependencies
      .map((dependency) => priorResults.get(dependency.nodeId))
      .filter((result): result is BrainTaskResult => Boolean(result?.answer))
      .map((result) => `${result.role}: ${result.answer}`)
      .join('\n');
    const prompt = dependencyContext ? `${node.prompt}\n可用上游事实：\n${dependencyContext}` : node.prompt;
    let attempts = 0;
    let lastError = '';

    while (attempts <= node.maxRetries) {
      attempts += 1;
      try {
        const plan = this.nodeRoutePlan(node);
        const adapter = this.adapters.resolve(plan);
        if (!adapter) throw new Error(`adapter_not_available:${node.adapterKey}`);
        const answer = await this.withTimeout(
          adapter.execute({
            context: input.context,
            dto: { ...input.dto, message: prompt, roleHint: node.role === 'supervisor' ? input.dto.roleHint : node.role },
            runId: input.runId,
            cognition: input.cognition,
            runtimeIntent: { ...input.runtimeIntent, intent: node.intent, expectedShape: node.answerShape },
            plan,
          }),
          node.timeoutMs,
        );
        if (!answer) throw new Error(`adapter_returned_empty:${node.adapterKey}`);
        const result: BrainTaskResult = {
          nodeId: node.id,
          role: node.role,
          status: answer.status === 'completed' ? 'completed' : 'failed',
          answer: answer.answer,
          citations: answer.citations,
          suggestedActions: answer.suggestedActions ?? [],
          latencyMs: Date.now() - startedAt,
          attempts,
          ...(answer.status === 'failed' ? { error: answer.answer } : {}),
        };
        await this.recordNode(input.runId, node, result);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    const result: BrainTaskResult = {
      nodeId: node.id,
      role: node.role,
      status: 'failed',
      citations: [],
      suggestedActions: [],
      latencyMs: Date.now() - startedAt,
      attempts,
      error: lastError,
    };
    await this.recordNode(input.runId, node, result);
    return result;
  }

  private nodeRoutePlan(node: BrainTaskNode): BrainRoleIntentPlan {
    const domainByAdapter: Record<string, BrainRoleIntentPlan['domain']> = {
      store_manager: 'store_operation',
      front_desk: 'front_desk',
      marketing_growth: 'marketing_growth',
      beautician_service: 'beautician_service',
      inventory_procurement: 'inventory_procurement',
      finance_risk: 'finance_risk',
      customer_service: 'customer_service',
    };
    return {
      role: node.role === 'supervisor' ? 'store_manager' : node.role,
      domain: domainByAdapter[node.adapterKey ?? ''] ?? 'semantic_metric',
      intent: node.intent,
      answerShape: node.answerShape,
      adapterKey: node.adapterKey,
      requiredPermissions: node.requiredPermissions,
      confidence: 1,
      grounding: node.intent === 'action' ? 'preview_action' : node.intent === 'draft' || node.intent === 'recommendation' ? 'template_skill' : 'db_skill',
      reason: 'supervisor_task_node',
    };
  }

  private composeSummary(objective: string, results: BrainTaskResult[]) {
    const completed = results.filter((result) => result.status === 'completed' && result.answer && result.nodeId !== 'supervisor_summary');
    const failed = results.filter((result) => result.status !== 'completed' && result.nodeId !== 'supervisor_summary');
    const facts = completed.map((result) => `- ${result.role}：${result.answer}`).join('\n') || '- 当前没有成功返回的子任务事实。';
    const missing = failed.length ? `\n缺失部分：${failed.map((result) => `${result.role}(${result.error ?? result.status})`).join('；')}。` : '';
    const actions = completed.flatMap((result) => result.suggestedActions).length
      ? '已有受控动作预览，请在确认后进入后续流程。'
      : '当前只提供分析和建议，涉及写操作时需要另行生成动作预览。';
    return `结论：已围绕“${objective}”完成 ${completed.length} 个子任务。\n归因：\n${facts}${missing}\n建议：优先处理已被多个角色共同指向的风险，再补齐缺失数据。\n行动：${actions}`;
  }

  private async recordNode(runId: number, node: BrainTaskNode, result: BrainTaskResult) {
    await this.trace.recordStep({
      runId,
      stepKey: `supervisor_${node.id}`,
      layer: 'orchestration',
      input: { node, requiredPermissions: node.requiredPermissions } as unknown as Prisma.InputJsonValue,
      output: { status: result.status, answer: result.answer, attempts: result.attempts } as Prisma.InputJsonValue,
      status: result.status,
      latencyMs: result.latencyMs,
      ...(result.error ? { error: { message: result.error } as Prisma.InputJsonValue } : {}),
    });
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`task_timeout:${timeoutMs}`)), timeoutMs);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}
