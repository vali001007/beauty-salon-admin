import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentWorkflowRuntimeService } from '../agent/agent-workflow-runtime.service.js';
import type { AgentActor, AgentEvidence, AgentPlan, AgentRunResult, AuraResponseBlock } from '../agent/agent.types.js';
import { AgentV3ControlledTextToSqlService, type AgentV3TextToSqlResult } from './text-to-sql/index.js';

@Injectable()
export class AgentV3OrchestratorService {
  constructor(
    private readonly runtime: AgentWorkflowRuntimeService,
    private readonly textToSql: AgentV3ControlledTextToSqlService,
  ) {}

  async createRun(input: { message: string; actor: AgentActor; context?: Record<string, unknown> }): Promise<AgentRunResult> {
    const context = this.withAgentV3Context(input.context);
    const run = await this.runtime.createRun({
      ...input,
      context,
      agentCode: 'agent_v3',
    });
    await this.runtime.addMessage(run.id, 'user', input.message, {
      entrypoint: input.actor.entrypoint,
      personaCode: input.actor.personaCode,
      architecture: 'agent_v3_text_to_sql',
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
    if (!run) throw new NotFoundException('Agent V3 run not found');
    if (run.agentCode !== 'agent_v3') throw new ForbiddenException('该运行记录不属于 Agent V3');
    if (Number(run.storeId) !== Number(input.actor.storeId)) throw new ForbiddenException('Agent V3 run store mismatch');
    const context = this.withAgentV3Context({
      ...(this.asObject(run.contextJson) ?? {}),
      ...(input.context ?? {}),
    });
    await this.runtime.addMessage(input.runId, 'user', input.message, {
      entrypoint: input.actor.entrypoint,
      personaCode: input.actor.personaCode,
      architecture: 'agent_v3_text_to_sql',
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
    return this.runtime.findRuns({ ...query, agentCode: 'agent_v3' });
  }

  async getRun(id: number, storeId?: number) {
    const run = await this.runtime.getRun(id);
    return this.assertAgentV3Run(run, storeId);
  }

  async getRunDetail(id: number, storeId?: number) {
    const detail = await this.runtime.getRunDetail(id, storeId);
    if (!detail.run) return detail;
    this.assertAgentV3Run(detail.run, storeId);
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
    const plan = this.buildPlan(input.message);
    await this.runtime.persistPlan(runId, plan);
    await this.runtime.setRunStatus(runId, 'validating');

    const result = await this.textToSql.run({
      question: input.message,
      userId: input.actor.userId,
      storeIds: [input.actor.storeId].filter((value) => Number.isFinite(value)),
      permissions: input.actor.permissions ?? [],
      roleCodes: [input.actor.role, input.actor.personaCode].filter((value): value is string => Boolean(value)),
      fieldScopes: input.actor.fieldScopes,
      runtimeContext: input.context,
      mode: input.context?.agentV3Mode === 'execute' ? 'execute' : 'dry_run',
    });

    await this.runtime.recordStep({
      runId,
      stepType: 'text_to_sql',
      name: 'agent.v3.controlled_text_to_sql',
      status: result.status === 'blocked' || result.status === 'failed' ? 'failed' : 'success',
      inputJson: {
        message: input.message,
        role: input.actor.role,
        personaCode: input.actor.personaCode,
        architecture: 'agent_v3_text_to_sql',
      },
      outputJson: {
        status: result.status,
        auditRunId: result.auditRunId,
        evidence: result.evidence,
        queryTrace: this.redactTrace(result.queryTrace),
      },
      startedAt,
      endedAt: new Date(),
    });

    const answer = result.answer ?? this.fallbackAnswer(result);
    const renderedBlocks = this.buildBlocks(result);
    await this.runtime.addMessage(runId, 'assistant', answer, {
      responseMode: 'structured_blocks',
      architecture: 'agent_v3_text_to_sql',
      textToSqlStatus: result.status,
      auditRunId: result.auditRunId,
    });
    const updated = await this.runtime.setRunStatus(runId, result.status === 'failed' ? 'failed' : 'completed', {
      resultJson: this.toJson({
        answer,
        plan,
        renderedBlocks,
        evidence: result.evidence,
        queryTrace: this.redactTrace(result.queryTrace),
        architecture: 'agent_v3_text_to_sql',
      }),
      errorMessage: result.status === 'failed' ? result.blockedReason ?? 'agent_v3_text_to_sql_failed' : null,
    });

    return {
      runId: Number(updated.id),
      runNo: String(updated.runNo),
      status: updated.status,
      plan,
      answer,
      toolResults: [],
      actions: [],
      evidence: this.toAgentEvidence(result),
      responseMode: 'structured_blocks',
      personaCode: updated.personaCode ?? null,
      renderedBlocks,
      phaseOutputs: [{
        phase: 'core_conclusion',
        title: 'V3 数据分析结果',
        summary: answer,
        blockKinds: renderedBlocks.map((block) => block.kind),
      }],
    };
  }

  private buildPlan(message: string): AgentPlan {
    return {
      intentType: 'query',
      goal: message,
      toolPlan: [],
      confidence: 0.82,
      clarificationNeeded: false,
      businessTask: {
        architecture: 'agent_v3_text_to_sql',
        runtime: 'agent_v3',
        manifestUsed: false,
        readOnly: true,
      },
      semanticSqlCandidate: {
        source: 'agent_v3_controlled_text_to_sql',
        manifestUsed: false,
      },
    };
  }

  private buildBlocks(result: AgentV3TextToSqlResult): AuraResponseBlock[] {
    const blocks: AuraResponseBlock[] = [
      { kind: 'summary_text', content: result.answer ?? this.fallbackAnswer(result) },
      {
        kind: 'evidence_panel',
        sources: result.evidence.sourceViews,
        dateRange: result.evidence.dateRange,
        metricDefinition: 'Agent V3 白名单语义视图 + SQL Guard + 只读执行器',
        limitations: result.evidence.limitations,
      },
    ];
    if (result.rows.length) {
      const columns = Object.keys(result.rows[0] ?? {}).slice(0, 8);
      blocks.splice(1, 0, {
        kind: 'table',
        columns,
        rows: result.rows.slice(0, 20).map((row) => columns.map((column) => this.cell(row[column]))),
        sortable: true,
        caption: `Agent V3 返回 ${result.rows.length} 条，只展示前 20 条。`,
      });
    }
    if (result.status === 'blocked') {
      blocks.splice(1, 0, {
        kind: 'permission_notice',
        title: 'V3 查询已阻断',
        message: result.blockedReason ?? 'SQL Guard 未放行该查询。',
        allowedSummary: 'V3 仅支持白名单语义视图上的 SELECT 只读查询。',
      });
    }
    return blocks;
  }

  private toAgentEvidence(result: AgentV3TextToSqlResult): AgentEvidence {
    return {
      source: result.evidence.sourceViews,
      sourceTables: result.evidence.sourceViews,
      storeScope: result.evidence.storeScope,
      metricDefinition: 'Agent V3 Text-to-SQL 受控只读查询',
      filters: result.queryTrace.guard.status === 'pass' ? result.queryTrace.guard.appliedPolicies : result.queryTrace.guard.appliedPolicies,
      limitations: result.evidence.limitations,
      queryTraceId: result.auditRunId,
      queryTraces: [this.redactTrace(result.queryTrace)],
      fieldPolicyApplied: {
        fieldPolicies: result.evidence.fieldPolicies,
      },
    };
  }

  private assertAgentV3Run(run: any, storeId?: number) {
    if (!run) throw new NotFoundException('Agent V3 run not found');
    if (run.agentCode !== 'agent_v3') throw new ForbiddenException('该运行记录不属于 Agent V3');
    if (storeId && Number(run.storeId) !== Number(storeId)) throw new ForbiddenException('Agent V3 run store mismatch');
    return run;
  }

  private withAgentV3Context(context?: Record<string, unknown>) {
    return {
      ...(context ?? {}),
      architecture: 'agent_v3_text_to_sql',
      agentEngine: 'agent_v3',
      manifestUsed: false,
    };
  }

  private fallbackAnswer(result: AgentV3TextToSqlResult) {
    if (result.status === 'blocked') return `Agent V3 已阻断该查询：${result.blockedReason ?? 'blocked'}。`;
    if (result.status === 'no_data') return '当前筛选范围内没有匹配数据。';
    return 'Agent V3 已完成受控 Text-to-SQL 查询。';
  }

  private redactTrace(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') return {};
    return JSON.parse(JSON.stringify(value, (key, entryValue) => {
      if (/^(generatedSql|safeSql|sql)$/i.test(key)) return 'redacted_for_agent_v3_runtime';
      if (key === 'parsed') return 'redacted_for_agent_v3_runtime';
      return entryValue;
    })) as Record<string, unknown>;
  }

  private cell(value: unknown) {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
    return String(value);
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  }

  private toJson(value: unknown) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }
}
