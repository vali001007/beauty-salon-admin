import { ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { AgentWorkflowRuntimeService } from '../agent/agent-workflow-runtime.service.js';
import type {
  AgentActor,
  AgentEvidence,
  AgentPhaseOutput,
  AgentPlan,
  AgentRouteDecision,
  AgentRunResult,
  AgentSuggestedAction,
  AgentToolResult,
  AuraResponseBlock,
} from '../agent/agent.types.js';
import { AgentV2RuntimeService, type AgentV2RuntimePlan } from './agent-v2-runtime.service.js';
import { AgentV2EvidenceService } from './evidence/agent-v2-evidence.service.js';
import { AgentV2PolicyGatewayService } from './policy/agent-v2-policy-gateway.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AgentV2ControlledTextToSqlService, type AgentV2TextToSqlResult } from './text-to-sql/index.js';

const TABLE_LABELS: Record<string, string> = {
  movementId: '流水ID',
  movementNo: '流水号',
  productName: '产品',
  date: '日期',
  revenueText: '营业额',
  avgOrderValueText: '客单价',
  itemName: '明细',
  itemTypeLabel: '类型',
  quantityText: '数量',
  unitPriceText: '单价',
  lineNetAmountText: '实收',
  operationTypeLabel: '操作类型',
  reason: '原因',
  sku: 'SKU',
  categoryName: '分类',
  scrapQuantityText: '报废数量',
  lossAmount: '损耗金额',
  storeName: '门店',
  operatorName: '操作人',
  occurredAt: '发生时间',
  batchNo: '批次',
  expiryDate: '到期日期',
  remark: '备注',
  orderNo: '订单编号',
  orderKindLabel: '订单类型',
  customerName: '客户',
  itemSummary: '业务明细',
  netAmountText: '实收金额',
  discountAmountText: '优惠金额',
  payMethodLabel: '支付方式',
  statusLabel: '状态',
  createdAt: '创建时间',
  cardName: '次卡',
  totalTimes: '总次数',
  remainingTimes: '剩余次数',
  paidAmountText: '实付金额',
  projectName: '项目',
  timesText: '本次核销',
  remainingTimesText: '剩余次数',
  recognizedAmountText: '识别收入',
  entrySourceLabel: '核销入口',
  verifiedAt: '核销时间',
  paymentNo: '支付流水号',
  methodLabel: '支付方式',
  amountText: '金额',
  paidAt: '支付时间',
  settleDate: '日结日期',
  totalRevenueText: '实收',
  refundAmountText: '退款',
  netRevenueText: '净收',
  orderCount: '订单数',
  customerCount: '客户数',
  grossProfitText: '毛利',
  commissionTotalText: '提成',
  staffName: '服务/办理人员',
  sourceTypeLabel: '来源',
  sourceAmountText: '计提金额',
  consumeTypeLabel: '消费类型',
  consumeContentText: '消费内容',
  consumeTime: '消费时间',
};

@Injectable()
export class AgentV2OrchestratorService {
  private readonly logger = new Logger(AgentV2OrchestratorService.name);

  constructor(
    private readonly agentV2Runtime: AgentV2RuntimeService,
    private readonly runtime: AgentWorkflowRuntimeService,
    private readonly evidenceService: AgentV2EvidenceService,
    private readonly policyGateway: AgentV2PolicyGatewayService,
    private readonly prisma: PrismaService,
    @Optional() private readonly controlledTextToSql?: AgentV2ControlledTextToSqlService,
  ) {}

  listTools() {
    return this.agentV2Runtime.listTools();
  }

  async createRun(input: {
    message: string;
    actor: AgentActor;
    context?: Record<string, unknown>;
  }): Promise<AgentRunResult> {
    const context = this.withAgentV2Context(input.context);
    const run = await this.runtime.createRun({
      ...input,
      context,
      agentCode: 'agent_v2',
    });
    await this.runtime.addMessage(run.id, 'user', input.message, {
      entrypoint: input.actor.entrypoint,
      personaCode: input.actor.personaCode,
      architecture: 'agent_v2',
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
    if (!run) throw new NotFoundException('Agent V2 run not found');
    if (run.agentCode !== 'agent_v2') throw new ForbiddenException('该运行记录不属于 Agent V2');
    if (Number(run.storeId) !== Number(input.actor.storeId)) throw new ForbiddenException('Agent V2 run store mismatch');
    const context = this.withAgentV2Context({
      ...(this.asObject(run.contextJson) ?? {}),
      ...(input.context ?? {}),
    });
    await this.runtime.addMessage(input.runId, 'user', input.message, {
      entrypoint: input.actor.entrypoint,
      personaCode: input.actor.personaCode,
      architecture: 'agent_v2',
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
    return this.runtime.findRuns({ ...query, agentCode: 'agent_v2' });
  }

  async getRun(id: number, storeId?: number) {
    const run = await this.runtime.getRun(id);
    return this.assertAgentV2Run(run, storeId);
  }

  async getRunDetail(id: number, storeId?: number) {
    const detail = await this.runtime.getRunDetail(id, storeId);
    if (!detail.run) return detail;
    this.assertAgentV2Run(detail.run, storeId);
    return detail;
  }

  async processRun(input: {
    run: any;
    message: string;
    actor: AgentActor;
    context?: Record<string, unknown>;
  }): Promise<AgentRunResult> {
    const agentV2Plan = await this.agentV2Runtime.planAsync({
      message: input.message,
      actor: input.actor,
      context: input.context,
    });
    if (!agentV2Plan) return this.processTextToSqlFallback(input);
    return this.processPlannedRun(input, agentV2Plan);
  }

  private async processPlannedRun(
    input: {
      run: any;
      message: string;
      actor: AgentActor;
      context?: Record<string, unknown>;
    },
    agentV2Plan: AgentV2RuntimePlan,
    retryAttempted = false,
  ): Promise<AgentRunResult> {
    const runId = Number(input.run.id);
    const plan = agentV2Plan.plan;
    const planningAt = new Date();

    await this.runtime.persistPlan(runId, plan);
    await this.runtime.recordStep({
      runId,
      stepType: 'planner',
      name: 'agent.v2.planner',
      status: 'success',
      inputJson: { message: input.message, role: input.actor.role, personaCode: input.actor.personaCode, context: input.context },
      outputJson: {
        plan,
        decision: agentV2Plan.decision,
        routeDecision: this.asObject(input.context?.routeDecision),
        architecture: 'agent_v2',
      },
      startedAt: planningAt,
      endedAt: new Date(),
    });
    await this.upsertAuditDetail({
      run: input.run,
      message: input.message,
      actor: input.actor,
      context: input.context,
      status: 'planned',
      agentV2Plan,
      latencyBreakdown: { planningMs: Date.now() - planningAt.getTime() },
    });

    if (plan.clarificationNeeded || !plan.toolPlan.length) {
      const answer = plan.clarificationQuestion ?? '请补充要处理的经营任务。';
      await this.runtime.addMessage(runId, 'assistant', answer, { status: 'clarify', architecture: 'agent_v2' });
      const updated = await this.runtime.setRunStatus(runId, 'completed', {
        resultJson: this.toJson({ answer, plan, toolResults: [], architecture: 'agent_v2' }),
      });
      await this.upsertAuditDetail({
        run: updated,
        message: input.message,
        actor: input.actor,
        context: input.context,
        status: 'completed',
        agentV2Plan,
        toolResults: [],
      });
      return this.buildRunResult(updated, plan, answer, [], [], [], input.context, undefined, undefined);
    }

    await this.runtime.setRunStatus(runId, 'validating');
    const toolResults: AgentToolResult[] = [];
    const actions: AgentSuggestedAction[] = [];
    this.policyGateway.assertCapabilityAccess(agentV2Plan.decision.selected, input.actor);

    for (const item of plan.toolPlan) {
      const tool = this.agentV2Runtime.getTool(item.tool);
      if (!tool) throw new Error(`未注册 Agent V2 工具：${item.tool}`);
      const policy = this.policyGateway.assertToolAccess(agentV2Plan.decision.selected, tool, input.actor);
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
          beforeJson: { tool: tool.name, args: item.args, riskLevel: tool.riskLevel, reason: policy.approvalReason, checks: policy.checks },
        });
        await this.runtime.updateToolCall(toolCall.id, { approvalId: approval.id, status: 'waiting_approval' });
        const answer = policy.approvalReason ?? '该 Agent V2 能力需要人工确认后继续。';
        const renderedBlocks: AuraResponseBlock[] = [
          { kind: 'permission_notice', title: '需要人工确认', message: answer },
        ];
        await this.runtime.addMessage(runId, 'assistant', answer, {
          status: 'waiting_approval',
          approvalId: approval.id,
          architecture: 'agent_v2',
        });
        const updated = await this.runtime.setRunStatus(runId, 'waiting_approval', {
          resultJson: this.toJson({ answer, plan, toolResults, renderedBlocks, approval, architecture: 'agent_v2' }),
        });
        await this.upsertAuditDetail({
          run: updated,
          message: input.message,
          actor: input.actor,
          context: input.context,
          status: 'waiting_approval',
          agentV2Plan,
          toolResults,
          latencyBreakdown: { waitingApprovalId: approval.id },
        });
        return {
          ...this.buildRunResult(updated, plan, answer, toolResults, actions, renderedBlocks, input.context, undefined, undefined),
          approval: {
            id: approval.id,
            toolName: tool.name,
            riskLevel: tool.riskLevel,
            status: approval.status,
            reason: policy.approvalReason,
          },
        };
      }

      await this.runtime.setRunStatus(runId, 'running_tool');
      const startedAt = Date.now();
      const toolStartedAt = new Date();
      const rawResult = await this.agentV2Runtime.executeTool(tool.name, item.args, {
        runId,
        storeId: input.actor.storeId,
        userId: input.actor.userId,
        deviceId: input.actor.deviceId,
        role: input.actor.role,
        permissions: input.actor.permissions,
      });
      const result = this.policyGateway.applyResultPolicy(rawResult, agentV2Plan.decision.selected, input.actor);
      toolResults.push(result);
      actions.push(...(result.actions ?? []));
      await this.runtime.updateToolCall(toolCall.id, {
        status: result.status,
        resultJson: this.toJson(result),
        latencyMs: Date.now() - startedAt,
      });
      await this.runtime.recordStep({
        runId,
        stepType: 'tool',
        name: tool.name,
        status: result.status,
        inputJson: item.args,
        outputJson: {
          title: result.title,
          summary: result.summary,
          status: result.status,
          evidence: result.evidence,
          policyChecks: policy.checks,
          latencyMs: Date.now() - startedAt,
        },
        startedAt: toolStartedAt,
        endedAt: new Date(),
      });
    }

    await this.runtime.setRunStatus(runId, 'composing');
    const answer = this.composeAnswer(plan, toolResults);
    const renderedBlocks = this.buildRenderedBlocks(answer, toolResults);
    const answerContract = this.agentV2Runtime.validateAnswer({
      question: input.message,
      plan,
      answer,
      toolResults,
      renderedBlocks,
    });
    if (!answerContract.valid && !retryAttempted) {
      const retryRun = await this.retryAfterContractFailure(input, agentV2Plan, answerContract);
      if (retryRun) return retryRun;
    }
    const evidence = this.evidenceService.merge(toolResults);
    const finalAnswer = answerContract.valid ? answer : this.contractFailureAnswer(answerContract);
    const finalBlocks = answerContract.valid ? renderedBlocks : this.contractFailureBlocks(finalAnswer, answerContract);
    const phaseOutputs = this.buildPhaseOutputs(finalAnswer, finalBlocks);
    const answerContractSummary = this.toAnswerContract(answerContract);

    await this.runtime.recordStep({
      runId,
      stepType: 'rendering',
      name: 'agent.v2.response.render',
      status: answerContract.valid ? 'success' : 'failed',
      inputJson: { toolResultCount: toolResults.length, actionCount: actions.length },
      outputJson: { blockCount: finalBlocks.length, answerContract, architecture: 'agent_v2' },
      startedAt: new Date(),
      endedAt: new Date(),
    });
    await this.runtime.addMessage(runId, 'assistant', finalAnswer, { responseMode: 'structured_blocks', architecture: 'agent_v2' });
    const updated = await this.runtime.setRunStatus(runId, 'completed', {
      evidenceJson: this.toJson(evidence),
      resultJson: this.toJson({
        answer: finalAnswer,
        plan,
        toolResults,
        actions,
        renderedBlocks: finalBlocks,
        phaseOutputs,
        answerContract: answerContractSummary,
        architecture: 'agent_v2',
      }),
    });
    await this.upsertAuditDetail({
      run: updated,
      message: input.message,
      actor: input.actor,
      context: input.context,
      status: answerContract.valid ? 'completed' : 'contract_failed',
      agentV2Plan,
      toolResults,
      evidence,
      answerContract: answerContractSummary,
      phaseOutputs,
    });
    return this.buildRunResult(
      updated,
      plan,
      finalAnswer,
      toolResults,
      actions,
      finalBlocks,
      input.context,
      evidence,
      answerContractSummary,
      phaseOutputs,
    );
  }

  private composeAnswer(plan: AgentPlan, results: AgentToolResult[]) {
    if (!results.length) return plan.clarificationQuestion ?? '没有执行任何工具。';
    if (results.length === 1) return results[0].summary;
    return results.map((result) => result.summary).filter(Boolean).join('\n');
  }

  private toTextToSqlToolResult(result: AgentV2TextToSqlResult): AgentToolResult {
    return {
      status: result.status === 'success' || result.status === 'dry_run' ? 'success' : result.status === 'blocked' ? 'unsupported' : result.status,
      title: '受控 Text-to-SQL 只读分析',
      summary: result.answer ?? this.textToSqlFallbackAnswer(result),
      data: {
        rows: result.rows,
        status: result.status,
        auditRunId: result.auditRunId,
        blockedReason: result.blockedReason,
      },
      evidence: this.toAgentEvidence(result),
      actions: [],
    };
  }

  private toAgentEvidence(result: AgentV2TextToSqlResult): AgentEvidence {
    return {
      source: result.evidence.sourceViews,
      sourceTables: result.evidence.sourceViews,
      storeScope: result.evidence.storeScope,
      dateRange: result.evidence.dateRange,
      metricDefinition: 'Agent V2 受控 Text-to-SQL 仅通过白名单语义视图执行只读查询。',
      filters: [result.evidence.storeScope, ...(result.evidence.limitations ?? [])].filter(Boolean),
      sampleSize: result.rows.length,
      limitations: result.evidence.limitations,
      fieldPolicyApplied: {
        fieldPolicies: result.evidence.fieldPolicies,
      },
      queryTraceId: result.auditRunId,
      queryTraces: [this.redactTextToSqlTrace(result.queryTrace) as Record<string, unknown>],
    };
  }

  private redactTextToSqlTrace(value: unknown, key?: string): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      if (/^(generatedSql|safeSql|redactedSql|sql)$/i.test(key ?? '')) return 'redacted_for_user_runtime';
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map((item) => this.redactTextToSqlTrace(item, key));
    if (typeof value !== 'object') return value;
    if (key === 'parsed') return 'redacted_for_user_runtime';
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        this.redactTextToSqlTrace(entryValue, entryKey),
      ]),
    );
  }

  private buildTextToSqlBlocks(result: AgentV2TextToSqlResult): AuraResponseBlock[] {
    const blocks: AuraResponseBlock[] = [
      { kind: 'summary_text', content: result.answer ?? this.textToSqlFallbackAnswer(result) },
      {
        kind: 'evidence_panel',
        sources: result.evidence.sourceViews,
        dateRange: result.evidence.dateRange,
        metricDefinition: '白名单语义视图 + Guard 安全改写 + 只读执行器',
        limitations: result.evidence.limitations,
      },
    ];
    if (result.rows.length) {
      const columns = Object.keys(result.rows[0] ?? {}).slice(0, 8);
      blocks.splice(1, 0, {
        kind: 'table',
        columns,
        rows: result.rows.slice(0, 20).map((row) => columns.map((column) => this.cell(row[column]))),
        caption: '受控 Text-to-SQL 查询结果',
      });
    }
    if (result.status === 'blocked' || result.status === 'failed') {
      blocks.splice(1, 0, {
        kind: 'data_gap',
        title: '受控查询未执行',
        message: result.answer ?? this.textToSqlFallbackAnswer(result),
        missingData: [result.blockedReason ?? result.status],
        nextSteps: ['检查语义视图启用状态、只读库连接、权限或 Guard 阻断原因。'],
      });
    }
    return blocks;
  }

  private textToSqlFallbackAnswer(result: AgentV2TextToSqlResult) {
    if (result.status === 'blocked') return `受控 Text-to-SQL 已阻断：${result.blockedReason ?? 'unknown'}。`;
    if (result.status === 'failed') return '受控 Text-to-SQL 执行失败，已记录审计。';
    if (result.status === 'no_data') return '当前筛选范围内没有匹配数据。';
    if (result.status === 'dry_run') return '已生成受控 Text-to-SQL 查询计划，当前为 dry-run，未访问数据库。';
    return `已通过受控 Text-to-SQL 查询到 ${result.rows.length} 条结果。`;
  }

  private cell(value: unknown) {
    if (value === null || value === undefined) return '-';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private async retryAfterContractFailure(
    input: {
      run: any;
      message: string;
      actor: AgentActor;
      context?: Record<string, unknown>;
    },
    currentPlan: AgentV2RuntimePlan,
    answerContract: { valid: boolean; errors: string[]; warnings: string[] },
  ) {
    const capabilityId = currentPlan.decision.selected?.capabilityId;
    if (!capabilityId) return null;
    const retryContext = {
      ...(input.context ?? {}),
      agentV2ContractRetry: {
        excludedCapabilityIds: [capabilityId],
        errors: answerContract.errors,
      },
    };
    const retryPlan = await this.agentV2Runtime.planAsync({
      message: input.message,
      actor: input.actor,
      context: retryContext,
    });
    if (!retryPlan?.decision.selected || retryPlan.decision.selected.capabilityId === capabilityId) return null;
    await this.runtime.recordStep({
      runId: Number(input.run.id),
      stepType: 'planner',
      name: 'agent.v2.contract_failed.retry',
      status: 'success',
      inputJson: {
        failedCapabilityId: capabilityId,
        errors: answerContract.errors,
      },
      outputJson: {
        retryCapabilityId: retryPlan.decision.selected.capabilityId,
        decision: retryPlan.decision,
      },
      startedAt: new Date(),
      endedAt: new Date(),
    });
    return this.processPlannedRun({ ...input, context: retryContext }, retryPlan, true);
  }

  private async processTextToSqlFallback(input: {
    run: any;
    message: string;
    actor: AgentActor;
    context?: Record<string, unknown>;
  }): Promise<AgentRunResult> {
    if (!this.controlledTextToSql || process.env.AGENT_V2_TEXT_TO_SQL_ENABLED !== 'true') {
      return this.completeUnsupportedRun(input);
    }
    if (!this.isTextToSqlFallbackAllowed(input.actor)) {
      return this.completeUnsupportedRun(input);
    }

    const runId = Number(input.run.id);
    const plan: AgentPlan = {
      intentType: 'query',
      goal: '受控 Text-to-SQL 只读分析',
      toolPlan: [],
      confidence: 0.45,
      clarificationNeeded: false,
      executionPath: 'deep',
      businessTask: {
        architecture: 'agent_v2_controlled_text_to_sql',
        question: input.message,
        fallbackReason: 'no_published_capability_matched',
      },
      capabilityPlan: {
        capabilityId: 'agent_v2.text_to_sql.fallback',
        reason: '已发布能力未命中，进入受控 Text-to-SQL 兜底。',
      },
      outputContract: {
        requiredKinds: ['text', 'table', 'evidence_panel'],
        evidenceRequired: true,
      },
    };
    await this.runtime.persistPlan(runId, plan);
    await this.runtime.recordStep({
      runId,
      stepType: 'planner',
      name: 'agent.v2.text_to_sql.fallback.plan',
      status: 'success',
      inputJson: { message: input.message, role: input.actor.role, context: input.context },
      outputJson: { plan, architecture: 'agent_v2_controlled_text_to_sql' },
      startedAt: new Date(),
      endedAt: new Date(),
    });

    await this.runtime.setRunStatus(runId, 'running_tool');
    const result = await this.controlledTextToSql.run({
      question: input.message,
      userId: input.actor.userId,
      storeIds: [input.actor.storeId].filter((value): value is number => typeof value === 'number'),
      roleCodes: [input.actor.role, input.actor.personaCode].filter((value): value is string => Boolean(value)),
      permissions: input.actor.permissions ?? [],
      fieldScopes: input.actor.fieldScopes,
      runtimeContext: input.context,
      mode: 'execute',
    });
    await this.runtime.recordStep({
      runId,
      stepType: 'tool',
      name: 'agent.v2.text_to_sql.controlled',
      status: result.status === 'success' || result.status === 'no_data' || result.status === 'dry_run' ? 'success' : 'failed',
      inputJson: { question: input.message },
      outputJson: {
        status: result.status,
        auditRunId: result.auditRunId,
        blockedReason: result.blockedReason,
        evidence: result.evidence,
        queryTrace: result.queryTrace,
      },
      startedAt: new Date(),
      endedAt: new Date(),
    });

    const answer = result.answer ?? this.textToSqlFallbackAnswer(result);
    const toolResult = this.toTextToSqlToolResult(result);
    const evidence = this.toAgentEvidence(result);
    const renderedBlocks = this.buildTextToSqlBlocks(result);
    const phaseOutputs = this.buildPhaseOutputs(answer, renderedBlocks);
    await this.runtime.addMessage(runId, 'assistant', answer, {
      responseMode: 'structured_blocks',
      architecture: 'agent_v2_controlled_text_to_sql',
      auditRunId: result.auditRunId,
    });
    const updated = await this.runtime.setRunStatus(runId, 'completed', {
      evidenceJson: this.toJson(evidence),
      resultJson: this.toJson({
        answer,
        plan,
        toolResults: [toolResult],
        renderedBlocks,
        phaseOutputs,
        architecture: 'agent_v2_controlled_text_to_sql',
        textToSql: {
          status: result.status,
          auditRunId: result.auditRunId,
          blockedReason: result.blockedReason,
        },
      }),
    });
    await this.upsertAuditDetail({
      run: updated,
      message: input.message,
      actor: input.actor,
      context: input.context,
      status: result.status === 'blocked' || result.status === 'failed' ? 'text_to_sql_blocked' : 'text_to_sql_completed',
      toolResults: [toolResult],
      evidence,
      phaseOutputs,
      errorCode: result.blockedReason,
      errorMessage: result.status === 'failed' ? result.answer : undefined,
    });
    return this.buildRunResult(updated, plan, answer, [toolResult], [], renderedBlocks, input.context, evidence, undefined, phaseOutputs);
  }

  private isTextToSqlFallbackAllowed(actor: AgentActor) {
    if (process.env.AGENT_V2_TEXT_TO_SQL_ADMIN_ONLY === 'false') return true;
    const permissions = actor.permissions ?? [];
    const roles = [actor.role, actor.personaCode].filter((value): value is string => Boolean(value));
    return (
      permissions.includes('*') ||
      permissions.includes('core:agent-governance:manage') ||
      roles.some((role) => ['super_admin', 'admin', 'manager'].includes(role))
    );
  }

  private async completeUnsupportedRun(input: {
    run: any;
    message: string;
    actor: AgentActor;
    context?: Record<string, unknown>;
  }): Promise<AgentRunResult> {
    const runId = Number(input.run.id);
    const answer = 'Agent V2 当前没有匹配的已发布能力。请先在 Agent 能力中心补齐能力、工具和权限配置，或显式切换到 Agent V1 处理。';
    const plan: AgentPlan = {
      intentType: 'clarify',
      goal: '未命中 Agent V2 能力目录',
      toolPlan: [],
      confidence: 0,
      clarificationNeeded: true,
      clarificationQuestion: answer,
      capabilityPlan: {
        capabilityId: 'agent_v2.unsupported',
        reason: 'Agent V2 不再回退到 Agent V1；缺失能力需要通过能力中心补齐。',
      },
    };
    await this.runtime.persistPlan(runId, plan);
    await this.runtime.recordStep({
      runId,
      stepType: 'planner',
      name: 'agent.v2.planner.no_capability',
      status: 'failed',
      inputJson: { message: input.message, role: input.actor.role, context: input.context },
      outputJson: { architecture: 'agent_v2', reason: 'no_capability_matched' },
      startedAt: new Date(),
      endedAt: new Date(),
    });
    await this.runtime.addMessage(runId, 'assistant', answer, {
      status: 'unsupported_capability',
      architecture: 'agent_v2',
    });
    const updated = await this.runtime.setRunStatus(runId, 'completed', {
      resultJson: this.toJson({ answer, plan, toolResults: [], architecture: 'agent_v2', fallback: false }),
    });
    await this.upsertAuditDetail({
      run: updated,
      message: input.message,
      actor: input.actor,
      context: input.context,
      status: 'unsupported_capability',
      errorCode: 'no_capability_matched',
      errorMessage: 'Agent V2 当前没有匹配的已发布能力。',
    });
    return this.buildRunResult(updated, plan, answer, [], [], [], input.context);
  }

  private async upsertAuditDetail(input: {
    run: any;
    message: string;
    actor: AgentActor;
    context?: Record<string, unknown>;
    status: string;
    agentV2Plan?: AgentV2RuntimePlan;
    toolResults?: AgentToolResult[];
    evidence?: AgentEvidence;
    answerContract?: AgentRunResult['answerContract'];
    phaseOutputs?: AgentPhaseOutput[];
    latencyBreakdown?: Record<string, unknown>;
    errorCode?: string;
    errorMessage?: string;
  }) {
    const delegate = (this.prisma as any).agentRunAuditDetail;
    if (!delegate?.upsert) return;

    const decision = input.agentV2Plan?.decision;
    const selected = decision?.selected;
    const runId = Number(input.run.id);
    const data = {
      runId,
      storeId: input.actor.storeId ?? input.run.storeId ?? null,
      userId: input.actor.userId ?? input.run.userId ?? null,
      role: input.actor.role ?? input.run.role ?? null,
      entrypoint: input.actor.entrypoint ?? input.run.entrypoint ?? null,
      agentCode: input.run.agentCode ?? 'agent_v2',
      personaCode: input.actor.personaCode ?? input.run.personaCode ?? null,
      question: input.message,
      status: input.status,
      capabilityId: selected?.capabilityId ?? null,
      knowledgeGraphJson: this.toJson({
        routeDecision: this.asObject(input.context?.routeDecision),
        strategy: input.agentV2Plan?.strategy,
      }),
      llmPromptJson: this.toJson(this.asObject(input.context?.llmPrompt) ?? this.asObject(input.context?.agentV2Prompt)),
      llmResponseJson: this.toJson(this.asObject(input.context?.llmResponse) ?? this.asObject(input.context?.agentV2LlmResponse)),
      structuredIntentJson: this.toJson({
        outputIntent: decision?.outputIntent,
        boundaryWarnings: decision?.boundaryWarnings ?? [],
      }),
      capabilityMappingJson: this.toJson({
        selected: selected?.capabilityId ?? null,
        reason: decision?.reason,
        confidence: decision?.confidence,
        candidates: decision?.candidates,
        excluded: decision?.excluded,
        toolPlan: decision?.toolPlan,
      }),
      policyDecisionJson: this.toJson({
        releaseStrategy: selected?.releaseStrategy,
        riskLevel: selected?.riskLevel,
        permissionCodes: selected?.permissionCodes,
        storeScope: selected?.storeScope,
        fieldPolicies: selected?.fieldPolicies,
        answerContract: input.answerContract,
      }),
      toolTraceJson: this.toJson({
        plannedTools: input.agentV2Plan?.plan.toolPlan ?? [],
        results: input.toolResults ?? [],
        evidence: input.evidence,
        phaseOutputs: input.phaseOutputs,
      }),
      contractValidationJson: this.toJson(input.answerContract),
      latencyBreakdownJson: this.toJson(input.latencyBreakdown),
      costJson: this.toJson(this.asObject(input.context?.cost) ?? this.asObject(input.context?.agentV2Cost)),
      riskJson: this.toJson({
        releaseStrategy: selected?.releaseStrategy,
        riskLevel: selected?.riskLevel,
        boundaryWarnings: decision?.boundaryWarnings ?? [],
      }),
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
    };
    const { runId: _runId, ...updateData } = data;

    try {
      await delegate.upsert({
        where: { runId },
        create: data,
        update: updateData,
      });
    } catch (error) {
      this.logger.warn(`Agent V2 audit detail upsert failed for run ${runId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private withAgentV2Context(context?: Record<string, unknown>) {
    return {
      ...(context ?? {}),
      architecture: 'agent_v2',
      fallbackToAgentV1: false,
    };
  }

  private assertAgentV2Run(run: any, storeId?: number) {
    if (!run) throw new NotFoundException('Agent V2 run not found');
    if (run.agentCode !== 'agent_v2') throw new ForbiddenException('该运行记录不属于 Agent V2');
    if (storeId !== undefined && Number(run.storeId) !== Number(storeId)) {
      throw new ForbiddenException('Agent V2 run store mismatch');
    }
    return run;
  }

  private contractFailureAnswer(answerContract: { errors: string[]; warnings: string[] }) {
    const reasons = answerContract.errors.length ? answerContract.errors.join('；') : '未满足输出契约';
    return `当前回答未通过 Agent V2 证据和格式校验，系统已拦截，避免返回不可靠结论。失败原因：${reasons}。`;
  }

  private contractFailureBlocks(
    answer: string,
    answerContract: { errors: string[]; warnings: string[] },
  ): AuraResponseBlock[] {
    return [
      { kind: 'summary_text', content: answer },
      {
        kind: 'alert',
        level: 'warning',
        message: `已记录为 contract_failed：${answerContract.errors.join('；') || '输出契约未通过'}`,
      },
    ];
  }

  private buildRenderedBlocks(answer: string, results: AgentToolResult[]): AuraResponseBlock[] {
    const blocks: AuraResponseBlock[] = [{ kind: 'summary_text', content: answer }];
    for (const result of results) {
      const data = this.asObject(result.data);
      const items = Array.isArray(data?.items) ? data.items : [];
      const metrics = this.asObject(data?.metrics);
      const chart = this.asObject(data?.chart);
      const actionDraft = this.asObject(data?.actionDraft);
      if (metrics) {
        blocks.push(...this.kpiBlocks(metrics));
      }
      if (chart && this.isSupportedChartType(chart.chartType)) {
        blocks.push({
          kind: 'chart',
          chartType: chart.chartType,
          title: String(chart.title ?? result.title),
          data: chart.data ?? [],
          xKey: typeof chart.xKey === 'string' ? chart.xKey : undefined,
          yKeys: Array.isArray(chart.yKeys) ? chart.yKeys.map(String) : undefined,
        });
      }
      if (actionDraft) {
        blocks.push({
          kind: 'action_card',
          title: String(result.title ?? '待确认动作'),
          preview: this.actionDraftPreview(actionDraft),
          actionId: String(result.actions?.[0]?.action ?? 'agent-v2:confirm-action'),
          riskLevel: result.actions?.[0]?.riskLevel ?? 'medium',
          impactSummary: actionDraft.approvalRequired ? '提交前需要人工确认，不会直接写入业务数据。' : '低风险动作，可直接执行。',
        });
      }
      if (items.length) {
        blocks.push(this.tableBlock(items));
      } else if (result.status === 'no_data') {
        blocks.push({
          kind: 'data_gap',
          title: result.title,
          message: result.summary,
          missingData: ['当前筛选范围内没有匹配记录'],
        });
      }
      if (result.evidence) {
        blocks.push({
          kind: 'evidence_panel',
          sources: result.evidence.sourceTables ?? result.evidence.source,
          dateRange: result.evidence.dateRange,
          metricDefinition: result.evidence.metricDefinition,
          limitations: result.evidence.limitations,
        });
      }
    }
    return blocks;
  }

  private tableBlock(items: unknown[]): AuraResponseBlock {
    const rows = items.map((item) => this.asObject(item) ?? {});
    const columns = Object.keys(rows[0] ?? {}).filter((key) => !/Id$|^id$/.test(key)).slice(0, 8);
    return {
      kind: 'table',
      columns: columns.map((column) => TABLE_LABELS[column] ?? column),
      rows: rows.map((row) => columns.map((column) => this.formatCell(row[column]))),
      sortable: true,
    };
  }

  private kpiBlocks(metrics: Record<string, unknown>): AuraResponseBlock[] {
    const mapping: Array<[string, string]> = [
      ['totalRevenueText', '实收'],
      ['refundAmountText', '退款'],
      ['netRevenueText', '净收'],
      ['orderCount', '订单数'],
      ['customerCount', '客户数'],
      ['totalAmountText', '合计金额'],
      ['totalNetAmountText', '合计实收'],
      ['avgOrderValueText', '客单价'],
      ['revenueChangeText', '变化'],
      ['revenueChangeRateText', '变化率'],
    ];
    return mapping
      .filter(([key]) => metrics[key] !== undefined && metrics[key] !== null && metrics[key] !== '')
      .slice(0, 6)
      .map(([key, label]) => ({
        kind: 'kpi_card',
        label,
        value: this.formatCell(metrics[key]),
      }));
  }

  private isSupportedChartType(value: unknown): value is 'line' | 'bar' | 'pie' | 'funnel' {
    return value === 'line' || value === 'bar' || value === 'pie' || value === 'funnel';
  }

  private actionDraftPreview(actionDraft: Record<string, unknown>) {
    const parts = [
      actionDraft.operationTypeLabel,
      actionDraft.productName,
      actionDraft.quantityText,
      actionDraft.reason,
    ]
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
    return parts.length ? parts.join(' · ') : '已生成待确认草稿。';
  }

  private buildPhaseOutputs(answer: string, renderedBlocks: AuraResponseBlock[]): AgentPhaseOutput[] {
    return [
      {
        phase: 'core_conclusion',
        title: '查询结果',
        summary: answer,
        blockKinds: renderedBlocks.map((block) => block.kind),
      },
    ];
  }

  private buildRunResult(
    run: any,
    plan: AgentPlan | undefined,
    answer: string,
    toolResults: AgentToolResult[],
    actions: AgentSuggestedAction[],
    renderedBlocks: AuraResponseBlock[],
    context?: Record<string, unknown>,
    evidence?: AgentEvidence,
    answerContract?: AgentRunResult['answerContract'],
    phaseOutputs?: AgentPhaseOutput[],
  ): AgentRunResult {
    return {
      runId: Number(run.id),
      runNo: String(run.runNo),
      status: run.status,
      plan,
      answer,
      toolResults,
      actions,
      evidence,
      responseMode: renderedBlocks.length ? 'structured_blocks' : 'composed_answer',
      personaCode: run.personaCode ?? null,
      routeDecision: this.asObject(context?.routeDecision) as AgentRouteDecision | undefined,
      renderedBlocks,
      phaseOutputs,
      answerContract,
    };
  }

  private toAnswerContract(validation: { valid: boolean; errors: string[]; warnings: string[] }): AgentRunResult['answerContract'] {
    return {
      valid: validation.valid,
      contract: { agentV2: { enforced: true } },
      missingKinds: [],
      warnings: validation.warnings,
      errors: validation.errors,
      checkedAt: new Date().toISOString(),
    };
  }

  private formatCell(value: unknown) {
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
