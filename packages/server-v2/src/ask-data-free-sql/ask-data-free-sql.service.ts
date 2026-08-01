import { Injectable } from '@nestjs/common';
import { AiService, AiStructuredOutputError } from '../ai/ai.service.js';
import { AskDataService } from '../ask-data/ask-data.service.js';
import { ReadOnlySqlCostGuard } from '../read-only-sql-kernel/read-only-sql-cost-guard.js';
import { readOnlySqlKernelConfig } from '../read-only-sql-kernel/read-only-sql-kernel.config.js';
import { ReadOnlySqlExecutor } from '../read-only-sql-kernel/read-only-sql-executor.js';
import { ReadOnlySqlGuard } from '../read-only-sql-kernel/read-only-sql-guard.js';
import type { ReadOnlySqlView } from '../read-only-sql-kernel/read-only-sql-kernel.types.js';
import { ASK_DATA_FREE_SQL_EXAMPLES, ASK_DATA_FREE_SQL_VIEWS } from './ask-data-free-sql.catalog.js';
import { AskDataFreeSqlAnswerService } from './ask-data-free-sql.answer.service.js';
import { AskDataFreeSqlAuditService } from './ask-data-free-sql-audit.service.js';
import { resolveAskDataDateRange } from './ask-data-free-sql.date-range.js';
import {
  ASK_DATA_SQL_GENERATION_SCHEMA,
  buildSqlGenerationMessages,
  buildSqlRepairMessages,
  isRepairableSqlGuardReason,
} from './ask-data-free-sql.prompts.js';
import type {
  AskDataAnswer,
  AskDataFreeSqlContext,
  AskDataFreeSqlRequest,
  AskDataFreeSqlResponse,
  AskDataSqlGeneration,
} from './ask-data-free-sql.types.js';

@Injectable()
export class AskDataFreeSqlService {
  constructor(
    private readonly aiService: AiService,
    private readonly legacyAskData: AskDataService,
    private readonly guard: ReadOnlySqlGuard,
    private readonly costGuard: ReadOnlySqlCostGuard,
    private readonly executor: ReadOnlySqlExecutor,
    private readonly answerService: AskDataFreeSqlAnswerService,
    private readonly audit: AskDataFreeSqlAuditService,
  ) {}

  getCatalog() {
    const config = readOnlySqlKernelConfig();
    return {
      enabled: config.enabled,
      executeReady: config.enabled && !config.dryRunOnly && Boolean(config.readonlyDatabaseUrl),
      mode: !config.enabled ? 'legacy' : config.dryRunOnly || !config.readonlyDatabaseUrl ? 'dry_run' : 'execute',
      connectionMode: config.connectionMode,
      tables: ASK_DATA_FREE_SQL_VIEWS.map((view) => ({
        viewName: view.viewName,
        label: view.label,
        domain: view.domain,
        description: view.description,
      })),
      examples: ASK_DATA_FREE_SQL_EXAMPLES,
    };
  }

  async query(request: AskDataFreeSqlRequest, context: AskDataFreeSqlContext): Promise<AskDataFreeSqlResponse> {
    const config = readOnlySqlKernelConfig();
    const question = String(request.question ?? '').trim();
    if (!question) return this.simpleResponse('clarification', '请输入想查询的经营问题。', context, 'empty_question');

    if (!config.enabled) return this.queryLegacy(request, context);

    const questionBlock = this.preflightQuestion(question);
    if (questionBlock) {
      const response = this.simpleResponse('blocked', questionBlock.message, context, questionBlock.reasonCode);
      response.auditRunId = await this.audit.record({ question, context, status: response.status });
      return response;
    }

    let generated: AskDataSqlGeneration;
    try {
      const result = await this.aiService.generateStructured<AskDataSqlGeneration>({
        scenario: 'ask_data_free_sql_generate',
        messages: buildSqlGenerationMessages({ request, context, views: ASK_DATA_FREE_SQL_VIEWS }),
        schema: ASK_DATA_SQL_GENERATION_SCHEMA,
        timeoutMs: 20000,
        temperature: 0,
        userId: context.userId,
        storeId: context.storeId,
      });
      generated = this.normalizeGeneration(result.data);
    } catch (error) {
      const message =
        error instanceof AiStructuredOutputError && error.code === 'PROVIDER_AUTH_FAILED'
          ? '问数模型鉴权失败，请联系管理员。'
          : '问数模型暂时不可用，请稍后重试。';
      const response = this.simpleResponse('failed', message, context, 'sql_generation_failed');
      response.auditRunId = await this.audit.record({ question, context, status: response.status });
      return response;
    }

    if (generated.status === 'clarification') {
      const response = this.simpleResponse(
        'clarification',
        '需要补充查询条件。',
        context,
        'clarification',
        generated.clarificationQuestion || '请补充门店、时间范围或指标。',
      );
      response.queryPlan.explanation = generated.explanation;
      response.auditRunId = await this.audit.record({
        question,
        context,
        status: response.status,
        generatedSql: generated.sql,
        explanation: generated.explanation,
      });
      return response;
    }
    if (generated.status === 'blocked') {
      const response = this.simpleResponse(
        'blocked',
        '这个问题涉及写入、敏感数据或超出当前问数范围。',
        context,
        'model_blocked',
      );
      response.queryPlan.explanation = generated.explanation;
      response.auditRunId = await this.audit.record({
        question,
        context,
        status: response.status,
        generatedSql: generated.sql,
        explanation: generated.explanation,
      });
      return response;
    }

    const resolvedDateRange = resolveAskDataDateRange(question);
    const guardContext = {
      storeIds: [context.storeId],
      permissions: context.permissions,
      deniedPermissions: context.deniedPermissions,
      maxLimit: config.maxLimit,
      maxViews: config.maxViews,
      maxRangeDays: config.maxRangeDays,
      question,
      parameters: {
        ...generated.parameters,
        ...(resolvedDateRange ? { startAt: resolvedDateRange.startAt, endAt: resolvedDateRange.endAt } : {}),
      },
    };
    let guard = this.guard.inspect(generated.sql, ASK_DATA_FREE_SQL_VIEWS, guardContext);
    if (guard.status === 'blocked' && isRepairableSqlGuardReason(guard.reasonCode)) {
      try {
        const repairResult = await this.aiService.generateStructured<AskDataSqlGeneration>({
          scenario: 'ask_data_free_sql_repair',
          messages: buildSqlRepairMessages({
            request,
            context,
            views: ASK_DATA_FREE_SQL_VIEWS,
            previous: generated,
            reasonCode: guard.reasonCode,
            reasonMessage: guard.message,
            redactedSql: guard.redactedSql ?? '',
          }),
          schema: ASK_DATA_SQL_GENERATION_SCHEMA,
          timeoutMs: 20000,
          temperature: 0,
          userId: context.userId,
          storeId: context.storeId,
        });
        const repaired = this.normalizeGeneration(repairResult.data);
        if (repaired.status === 'ready') {
          generated = repaired;
          guard = this.guard.inspect(repaired.sql, ASK_DATA_FREE_SQL_VIEWS, {
            ...guardContext,
            parameters: {
              ...repaired.parameters,
              ...(resolvedDateRange ? { startAt: resolvedDateRange.startAt, endAt: resolvedDateRange.endAt } : {}),
            },
          });
        }
      } catch {
        // Keep the original blocked result. Repair is a single bounded attempt;
        // it never bypasses the parser, guard or cost checks.
      }
    }
    if (guard.status === 'blocked') {
      const response = this.simpleResponse('blocked', guard.message, context, guard.reasonCode);
      response.queryPlan.explanation = generated.explanation;
      response.queryMeta.sqlFingerprint = guard.sqlFingerprint;
      response.auditRunId = await this.audit.record({
        question,
        context,
        status: response.status,
        guard,
        generatedSql: generated.sql,
        explanation: generated.explanation,
      });
      return response;
    }

    const cost = this.costGuard.inspect(guard, config.maxEstimatedCost);
    if (cost.status === 'blocked') {
      const response = this.simpleResponse('blocked', cost.message, context, cost.reasonCode);
      response.queryPlan.explanation = generated.explanation;
      response.queryMeta.sqlFingerprint = guard.sqlFingerprint;
      response.auditRunId = await this.audit.record({
        question,
        context,
        status: response.status,
        guard,
        cost,
        generatedSql: generated.sql,
        explanation: generated.explanation,
      });
      return response;
    }

    const execution = await this.executor.execute({
      guard,
      connectionString: config.readonlyDatabaseUrl,
      timeoutMs: config.timeoutMs,
      maxRows: config.maxLimit,
      dryRunOnly: config.dryRunOnly,
    });
    const meta = {
      viewNames: guard.selectedViews.map((view) => view.viewName),
      timeRange: this.timeRange(guard.params),
      storeScope: `门店 ${context.storeId}`,
      truncated: Boolean(execution.truncated),
      sqlFingerprint: guard.sqlFingerprint,
      executionMs: execution.executionMs,
      ...(config.connectionMode !== 'unavailable' ? { connectionMode: config.connectionMode } : {}),
      ...(this.canViewDebugSql(context) ? { generatedSql: guard.redactedSql } : {}),
      ...(execution.blockedReason ? { statusReason: execution.blockedReason } : {}),
    };
    if (execution.status === 'blocked' || execution.status === 'failed') {
      const status =
        execution.status === 'blocked' && execution.blockedReason === 'dry_run_only' ? 'blocked' : 'failed';
      const response = this.simpleResponse(
        status,
        this.executionMessage(execution.blockedReason),
        context,
        execution.blockedReason ?? 'execution_failed',
      );
      response.queryMeta = meta;
      response.queryPlan.explanation = generated.explanation;
      response.auditRunId = await this.audit.record({
        question,
        context,
        status: response.status,
        guard,
        cost,
        execution,
        generatedSql: generated.sql,
        explanation: generated.explanation,
      });
      return response;
    }

    const rows = this.sanitizeRows(execution.rows, guard.selectedViews);
    const answer = await this.answerService.compose({
      question,
      explanation: generated.explanation,
      rows,
      selectedViews: guard.selectedViews,
      context,
      timeRange: meta.timeRange,
      truncated: Boolean(execution.truncated),
    });
    const response: AskDataFreeSqlResponse = {
      status: execution.status,
      summary: answer.summary,
      keyFindings: answer.keyFindings,
      columns: this.columns(rows, guard.selectedViews),
      rows,
      sources: this.sources(guard.selectedViews, meta.timeRange),
      limitations: [
        ...answer.caveats,
        ...(config.connectionMode === 'development_admin'
          ? ['当前为开发环境管理员数据库连接冒烟模式，不代表专用只读角色上线验收通过。']
          : []),
        '仅查询已登记的问数视图，结果受当前用户门店和权限范围限制。',
      ],
      queryMeta: meta,
      queryPlan: {
        planner: 'llm',
        explanation: generated.explanation,
        ...(this.canViewDebugSql(context) ? { generatedSql: guard.redactedSql } : {}),
      },
    };
    response.auditRunId = await this.audit.record({
      question,
      context,
      status: response.status,
      guard,
      cost,
      execution,
      selectedViews: guard.selectedViews,
      answer,
      generatedSql: generated.sql,
      explanation: generated.explanation,
    });
    return response;
  }

  private async queryLegacy(
    request: AskDataFreeSqlRequest,
    context: AskDataFreeSqlContext,
  ): Promise<AskDataFreeSqlResponse> {
    const result = await this.legacyAskData.query(
      { question: request.question, history: request.history as any },
      context as any,
    );
    return {
      status:
        result.status === 'success'
          ? 'success'
          : result.status === 'no_data'
            ? 'no_data'
            : result.status === 'clarification'
              ? 'clarification'
              : result.status === 'unsupported'
                ? 'blocked'
                : 'failed',
      summary: result.summary,
      keyFindings: [],
      columns: result.columns,
      rows: result.rows,
      sources: result.sources,
      clarificationQuestion: result.clarificationQuestion,
      limitations: ['当前自由 SQL 功能开关未开启，已使用固定模板降级查询。'],
      queryMeta: {
        viewNames: result.sources.map((source) => source.model),
        timeRange: result.queryPlan?.dateRange?.label ?? '',
        storeScope: `门店 ${context.storeId}`,
        truncated: false,
      },
      queryPlan: { planner: 'legacy', explanation: result.queryPlan?.intent },
    };
  }

  private normalizeGeneration(value: AskDataSqlGeneration): AskDataSqlGeneration {
    return {
      status: ['ready', 'clarification', 'blocked'].includes(value?.status) ? value.status : 'clarification',
      sql: String(value?.sql ?? '').trim(),
      parameters: value?.parameters && typeof value.parameters === 'object' ? value.parameters : {},
      explanation: String(value?.explanation ?? '').trim(),
      expectedColumns: Array.isArray(value?.expectedColumns) ? value.expectedColumns.map(String).slice(0, 20) : [],
      clarificationQuestion: String(value?.clarificationQuestion ?? '').trim(),
    };
  }

  private preflightQuestion(question: string) {
    if (/\bselect\b[\s\S]+\bfrom\b|\bunion\s+select\b/i.test(question)) {
      return { reasonCode: 'raw_sql_input_not_allowed', message: '请用经营问题提问，不支持粘贴 SQL 直接执行。' };
    }
    if (
      /删除|删掉|写入|帮我(?:新增|创建|修改|更新)|(?:新增|创建|修改|更新)(?:订单|客户|预约|活动|商品|项目|库存)|发券|下发|推送|充值|核销|作废|导入|(?:执行|发起|办理).*退款|\b(drop|delete|update|insert|alter|create|truncate)\b/i.test(
        question,
      )
    ) {
      return { reasonCode: 'write_intent_not_allowed', message: '智能问数只支持只读查询，不能执行写入或业务操作。' };
    }
    if (/手机号|电话|密码|token|secret|openid|证件|身份证|详细地址|薪资明细/i.test(question)) {
      return { reasonCode: 'sensitive_data_intent_not_allowed', message: '当前问数不开放敏感原始字段。' };
    }
    if (/其他门店|别的门店|全部门店|所有门店|跨门店|不限门店|绕过门店/i.test(question)) {
      return { reasonCode: 'cross_store_not_allowed', message: '第一阶段只查询当前已选择门店，不支持跨门店比较。' };
    }
    return undefined;
  }

  private sanitizeRows(rows: Array<Record<string, unknown>>, views: ReadOnlySqlView[]) {
    const policies = new Map<string, string>();
    for (const view of views) for (const field of view.fields) policies.set(field.name, field.policy);
    return rows
      .slice(0, 100)
      .map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key, this.sanitizeValue(key, value, policies.get(key))]),
        ),
      );
  }

  private sanitizeValue(key: string, value: unknown, policy?: string) {
    if (policy !== 'mask' && !/(phone|openid|idcard|address|password|token|secret)/i.test(key)) return value;
    if (value === null || value === undefined || value === '') return value;
    const text = String(value);
    if (/phone/i.test(key)) return text.slice(-4).padStart(4, '*');
    return `${text.slice(0, 1)}***`;
  }

  private columns(rows: Array<Record<string, unknown>>, views: ReadOnlySqlView[]) {
    const fields = new Map(views.flatMap((view) => view.fields.map((field) => [field.name, field] as const)));
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return keys.map((key) => {
      const field = fields.get(key);
      const type =
        field?.type === 'date'
          ? 'date'
          : field?.type === 'number'
            ? /(amount|revenue|price|cost|margin|paid|refund|income|value)/i.test(key)
              ? 'money'
              : 'number'
            : 'text';
      return { key, label: field?.description ?? key, type } as {
        key: string;
        label: string;
        type: 'text' | 'number' | 'money' | 'percent' | 'date';
      };
    });
  }

  private sources(views: ReadOnlySqlView[], timeRange: string) {
    return views.map((view) => ({
      model: view.viewName,
      fields: view.fields.map((field) => field.name),
      filters: ['门店权限', timeRange ? `时间范围：${timeRange}` : '查询范围由 SQL 指定', 'LIMIT 和只读 Guard'],
      reason: view.description,
    }));
  }

  private timeRange(params: Record<string, unknown>) {
    const start = String(params.startAt ?? '').slice(0, 10);
    const end = String(params.endAt ?? '').slice(0, 10);
    return start && end ? `${start} 至 ${end}` : '默认近 30 天';
  }

  private canViewDebugSql(context: AskDataFreeSqlContext) {
    return (
      context.permissions.includes('*') ||
      context.permissions.includes('core:system:logs') ||
      context.permissions.includes('core:agent-governance:view')
    );
  }

  private executionMessage(reason?: string) {
    if (reason === 'readonly_database_url_missing') return '只读查询服务尚未配置，当前无法执行自由查询。';
    if (reason === 'dry_run_only') return '自由查询当前处于演练模式，尚未访问数据库。';
    if (reason === 'timeout') return '查询耗时过长，请缩小时间范围或减少返回数量。';
    if (reason === 'permission_error') return '只读数据库拒绝了本次查询。';
    return '查询执行失败，请稍后重试。';
  }

  private simpleResponse(
    status: AskDataFreeSqlResponse['status'],
    summary: string,
    context: AskDataFreeSqlContext,
    statusReason: string,
    clarificationQuestion?: string,
  ): AskDataFreeSqlResponse {
    return {
      status,
      summary,
      keyFindings: [],
      columns: [],
      rows: [],
      sources: [],
      ...(clarificationQuestion ? { clarificationQuestion } : {}),
      limitations: [],
      queryMeta: {
        viewNames: [],
        timeRange: '',
        storeScope: `门店 ${context.storeId}`,
        truncated: false,
        statusReason,
      },
      queryPlan: { planner: 'llm' },
    };
  }
}
