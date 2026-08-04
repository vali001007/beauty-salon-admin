import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service.js';
import { AskDataService } from '../ask-data/ask-data.service.js';
import { ReadOnlySqlCostGuard } from '../read-only-sql-kernel/read-only-sql-cost-guard.js';
import { readOnlySqlKernelConfig } from '../read-only-sql-kernel/read-only-sql-kernel.config.js';
import { ReadOnlySqlExecutor } from '../read-only-sql-kernel/read-only-sql-executor.js';
import { ReadOnlySqlGuard } from '../read-only-sql-kernel/read-only-sql-guard.js';
import type { ReadOnlySqlView } from '../read-only-sql-kernel/read-only-sql-kernel.types.js';
import { ASK_DATA_FREE_SQL_EXAMPLES, ASK_DATA_FREE_SQL_VIEWS } from './ask-data-free-sql.catalog.js';
import { authorizedAskDataViews, selectAskDataViews } from './ask-data-free-sql-view-selector.js';
import { AskDataFreeSqlAnswerService } from './ask-data-free-sql.answer.service.js';
import { AskDataFreeSqlAuditService } from './ask-data-free-sql-audit.service.js';
import { resolveAskDataDateRange } from './ask-data-free-sql.date-range.js';
import {
  askDataSemanticRouterConfig,
  AskDataSemanticRouter,
  type AskDataSemanticRouteResult,
} from './ask-data-semantic-router.js';
import {
  askDataTimeScopeOverrides,
  askDataGuardParameters,
  buildAskDataQueryPlan,
  type AskDataControlledQueryPlan,
} from './ask-data-query-plan.js';
import {
  validateAskDataQueryPlan,
  validateAskDataQueryPlanExecution,
} from './ask-data-query-plan-validator.js';
import {
  ASK_DATA_SQL_GENERATION_SCHEMA,
  buildClarificationRepairMessages,
  buildSqlGenerationMessages,
  buildSqlRepairMessages,
  isRepairableSqlGuardReason,
  shouldRetryClearQuestionClarification,
} from './ask-data-free-sql.prompts.js';
import type {
  AskDataAnswer,
  AskDataFreeSqlContext,
  AskDataFreeSqlRequest,
  AskDataFreeSqlResponse,
  AskDataSemanticAuditMeta,
  AskDataSqlGeneration,
} from './ask-data-free-sql.types.js';
import {
  askDataStructuredErrorCode,
  AskDataStructuredOutputCallError,
  generateAskDataStructuredWithRetry,
  recordAskDataStructuredRepair,
  type AskDataStructuredOutputAudit,
} from './ask-data-structured-output.js';
import { AskDataNamedEntityResolver } from './ask-data-entity-resolver.js';

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
    private readonly semanticRouter: AskDataSemanticRouter,
    private readonly entityResolver: AskDataNamedEntityResolver,
  ) {}

  getCatalog(context: AskDataFreeSqlContext) {
    const config = readOnlySqlKernelConfig();
    const authorizedViews = authorizedAskDataViews(context);
    const groupCounts = new Map<string, number>();
    for (const view of authorizedViews) groupCounts.set(view.domain, (groupCounts.get(view.domain) ?? 0) + 1);
    return {
      enabled: config.enabled,
      executeReady: config.enabled && !config.dryRunOnly && Boolean(config.readonlyDatabaseUrl),
      mode: !config.enabled ? 'legacy' : config.dryRunOnly || !config.readonlyDatabaseUrl ? 'dry_run' : 'execute',
      connectionMode: config.connectionMode,
      totalCount: authorizedViews.length,
      groups: [...groupCounts.entries()]
        .map(([domain, count]) => ({ domain, label: this.domainLabel(domain), count }))
        .sort((left, right) => left.label.localeCompare(right.label, 'zh-Hans-CN')),
      tables: authorizedViews.map((view) => ({
        viewName: view.viewName,
        label: view.label,
        domain: view.domain,
        description: view.description,
        dataPolicy: view.dataPolicy,
        freshnessField: view.freshnessField ?? view.defaultTimeField,
      })),
      examples: ASK_DATA_FREE_SQL_EXAMPLES,
    };
  }

  async query(request: AskDataFreeSqlRequest, context: AskDataFreeSqlContext): Promise<AskDataFreeSqlResponse> {
    const config = readOnlySqlKernelConfig();
    const question = String(request.question ?? '').trim();
    if (!question) return this.simpleResponse('clarification', '请输入想查询的经营问题。', context, 'empty_question');

    if (!config.enabled) return this.queryLegacy(request, context);

    const authorizedViews = authorizedAskDataViews(context);
    if (!authorizedViews.length) {
      const response = this.simpleResponse('blocked', '当前账号没有可查询的经营数据权限。', context, 'permission_denied');
      response.auditRunId = await this.audit.record({ question, context, status: response.status });
      return response;
    }
    const questionBlock = this.preflightQuestion(question);
    if (questionBlock) {
      const response = this.simpleResponse('blocked', questionBlock.message, context, questionBlock.reasonCode);
      response.auditRunId = await this.audit.record({ question, context, status: response.status });
      return response;
    }
    const semanticConfig = askDataSemanticRouterConfig();
    const legacyCandidateViews = selectAskDataViews(question, context);
    const semanticRoute =
      semanticConfig.enabled || semanticConfig.shadow
        ? await this.semanticRouter.route({ question, context, authorizedViews, config: semanticConfig })
        : undefined;
    let activeSemanticRoute = semanticConfig.enabled ? semanticRoute : undefined;
    let semanticAudit = semanticRoute ? this.semanticAuditMeta(semanticRoute, semanticConfig.shadow && !semanticConfig.enabled) : undefined;
    if (semanticConfig.enabled && semanticRoute?.permissionDenied) {
      const response = this.attachSemanticPlan(
        this.simpleResponse('blocked', '当前账号没有查询该类经营数据的权限。', context, 'permission_denied'),
        activeSemanticRoute,
      );
      response.auditRunId = await this.audit.record({
        question,
        context,
        status: response.status,
        semanticRouting: semanticAudit,
      });
      return response;
    }
    if (semanticConfig.enabled && semanticRoute?.clarificationQuestion) {
      const response = this.attachSemanticPlan(
        this.simpleResponse(
          'clarification',
          '需要补充会影响查询口径的条件。',
          context,
          'semantic_clarification',
          semanticRoute.clarificationQuestion,
        ),
        activeSemanticRoute,
      );
      response.auditRunId = await this.audit.record({
        question,
        context,
        status: response.status,
        semanticRouting: semanticAudit,
      });
      return response;
    }
    if (activeSemanticRoute?.semanticIntent.entities.length) {
      const resolved = await this.entityResolver.resolve(activeSemanticRoute.semanticIntent, context.storeId);
      activeSemanticRoute = { ...activeSemanticRoute, semanticIntent: resolved.semanticIntent };
      semanticAudit = this.semanticAuditMeta(activeSemanticRoute, false);
      if (resolved.clarificationQuestion) {
        const response = this.attachSemanticPlan(
          this.simpleResponse(
            'clarification',
            '需要补充可唯一定位的客户信息。',
            context,
            resolved.clarificationReason ?? 'entity_identity',
            resolved.clarificationQuestion,
          ),
          activeSemanticRoute,
        );
        response.auditRunId = await this.audit.record({
          question,
          context,
          status: response.status,
          semanticRouting: semanticAudit,
        });
        return response;
      }
    }
    const candidateViews = semanticConfig.enabled && semanticRoute ? semanticRoute.candidateViews : legacyCandidateViews;
    if (!candidateViews.length) {
      const response = this.attachSemanticPlan(
        this.simpleResponse('blocked', '当前账号没有查询该类经营数据的权限。', context, 'permission_denied'),
        activeSemanticRoute,
      );
      response.auditRunId = await this.audit.record({
        question,
        context,
        status: response.status,
        semanticRouting: semanticAudit,
      });
      return response;
    }

    const controlledQueryPlan = activeSemanticRoute
      ? buildAskDataQueryPlan({
          question,
          semanticIntent: activeSemanticRoute.semanticIntent,
          candidateViews,
        })
      : undefined;
    if (controlledQueryPlan) {
      const planValidation = validateAskDataQueryPlan(controlledQueryPlan, candidateViews);
      if (!planValidation.valid) {
        const response = this.attachSemanticPlan(
          this.simpleResponse('blocked', '当前问题的查询计划不完整，已阻止生成可能答非所问的 SQL。', context, planValidation.reasonCode),
          activeSemanticRoute,
        );
        this.attachControlledPlan(response, controlledQueryPlan, context);
        response.auditRunId = await this.audit.record({
          question,
          context,
          status: response.status,
          semanticRouting: semanticAudit,
          controlledQueryPlan,
        });
        return response;
      }
    }
    const generationViews = controlledQueryPlan
      ? candidateViews.filter((view) => controlledQueryPlan.viewNames.includes(view.viewName))
      : candidateViews;

    let generated: AskDataSqlGeneration;
    let structuredOutputAudit: AskDataStructuredOutputAudit | undefined;
    try {
      const generatedCall = await generateAskDataStructuredWithRetry<AskDataSqlGeneration>(this.aiService, {
        scenario: 'ask_data_free_sql_generate',
        messages: buildSqlGenerationMessages({
          request,
          context,
          views: generationViews,
          semanticIntent: activeSemanticRoute?.semanticIntent,
          controlledQueryPlan,
        }),
        schema: ASK_DATA_SQL_GENERATION_SCHEMA,
        timeoutMs: 20000,
        temperature: 0,
        userId: context.userId,
        storeId: context.storeId,
      });
      structuredOutputAudit = generatedCall.audit;
      generated = this.normalizeGeneration(generatedCall.result.data);
    } catch (error) {
      structuredOutputAudit = error instanceof AskDataStructuredOutputCallError ? error.audit : undefined;
      const errorCode = askDataStructuredErrorCode(error);
      const message =
        errorCode === 'PROVIDER_AUTH_FAILED'
          ? '问数模型鉴权失败，请联系管理员。'
          : '问数模型暂时不可用，请稍后重试。';
      const response = this.attachSemanticPlan(
        this.simpleResponse('failed', message, context, 'sql_generation_failed'),
        activeSemanticRoute,
      );
      response.auditRunId = await this.audit.record({
        question,
        context,
        status: response.status,
        semanticRouting: semanticAudit,
        controlledQueryPlan,
        structuredOutput: structuredOutputAudit,
      });
      return response;
    }

    if (
      generated.status === 'clarification' &&
      (Boolean(activeSemanticRoute?.semanticIntent.metricKeys.length) ||
        shouldRetryClearQuestionClarification(question, candidateViews))
    ) {
      const clarificationRepairStartedAt = Date.now();
      let clarificationRepairSucceeded = false;
      let clarificationRepairAudit: AskDataStructuredOutputAudit | undefined;
      try {
        const retryCall = await generateAskDataStructuredWithRetry<AskDataSqlGeneration>(this.aiService, {
          scenario: 'ask_data_free_sql_clarification_repair',
          messages: buildClarificationRepairMessages({
            request,
            context,
            views: generationViews,
            previous: generated,
            semanticIntent: activeSemanticRoute?.semanticIntent,
            controlledQueryPlan,
          }),
          schema: ASK_DATA_SQL_GENERATION_SCHEMA,
          timeoutMs: 20000,
          temperature: 0,
          userId: context.userId,
          storeId: context.storeId,
        });
        clarificationRepairAudit = retryCall.audit;
        generated = this.normalizeGeneration(retryCall.result.data);
        clarificationRepairSucceeded = generated.status === 'ready';
      } catch (error) {
        clarificationRepairAudit = error instanceof AskDataStructuredOutputCallError ? error.audit : undefined;
        // Keep the original clarification. This retry is bounded and never
        // bypasses the normal parser, permission, cost or execution gates.
      } finally {
        if (structuredOutputAudit) {
          recordAskDataStructuredRepair(structuredOutputAudit, {
            kind: 'clarification',
            reasonCode: 'model_clarification',
            latencyMs: Date.now() - clarificationRepairStartedAt,
            succeeded: clarificationRepairSucceeded,
          }, clarificationRepairAudit);
        }
      }
    }

    if (generated.status === 'clarification') {
      const response = this.attachSemanticPlan(
        this.simpleResponse(
          'clarification',
          '需要补充查询条件。',
          context,
          'clarification',
          generated.clarificationQuestion || '请补充会改变结果的查询条件。',
        ),
        activeSemanticRoute,
      );
      response.queryPlan.explanation = generated.explanation;
      response.auditRunId = await this.audit.record({
        question,
        context,
        status: response.status,
        generatedSql: generated.sql,
        explanation: generated.explanation,
        semanticRouting: semanticAudit,
        controlledQueryPlan,
        structuredOutput: structuredOutputAudit,
      });
      return response;
    }
    if (generated.status === 'blocked') {
      const response = this.attachSemanticPlan(
        this.simpleResponse(
          'blocked',
          '这个问题涉及写入、敏感数据或超出当前问数范围。',
          context,
          'model_blocked',
        ),
        activeSemanticRoute,
      );
      response.queryPlan.explanation = generated.explanation;
      response.auditRunId = await this.audit.record({
        question,
        context,
        status: response.status,
        generatedSql: generated.sql,
        explanation: generated.explanation,
        semanticRouting: semanticAudit,
        controlledQueryPlan,
        structuredOutput: structuredOutputAudit,
      });
      return response;
    }

    const resolvedDateRange = activeSemanticRoute?.semanticIntent.timeRange ?? resolveAskDataDateRange(question);
    const guardContext = {
      storeIds: [context.storeId],
      permissions: context.permissions,
      deniedPermissions: context.deniedPermissions,
      maxLimit: config.maxLimit,
      maxViews: config.maxViews,
      maxRangeDays: config.maxRangeDays,
      question,
      parameters: {
        ...askDataGuardParameters(controlledQueryPlan, generated.parameters, resolvedDateRange),
      },
      ...(controlledQueryPlan?.requiredViewNames.length === 2
        ? { allowedJoinViewSets: [controlledQueryPlan.requiredViewNames] }
        : {}),
      ...askDataTimeScopeOverrides(controlledQueryPlan),
    };
    let guard = this.guard.inspect(generated.sql, ASK_DATA_FREE_SQL_VIEWS, guardContext);
    let repairAttempted = false;
    if (guard.status === 'blocked' && isRepairableSqlGuardReason(guard.reasonCode)) {
      repairAttempted = true;
      const guardRepairReason = guard.reasonCode;
      const guardRepairStartedAt = Date.now();
      let guardRepairSucceeded = false;
      let guardRepairAudit: AskDataStructuredOutputAudit | undefined;
      try {
        const repairCall = await generateAskDataStructuredWithRetry<AskDataSqlGeneration>(this.aiService, {
          scenario: 'ask_data_free_sql_repair',
          messages: buildSqlRepairMessages({
            request,
            context,
            views: generationViews,
            previous: generated,
            reasonCode: guard.reasonCode,
            reasonMessage: guard.message,
            redactedSql: guard.redactedSql ?? '',
            semanticIntent: activeSemanticRoute?.semanticIntent,
            controlledQueryPlan,
          }),
          schema: ASK_DATA_SQL_GENERATION_SCHEMA,
          timeoutMs: 20000,
          temperature: 0,
          userId: context.userId,
          storeId: context.storeId,
        });
        guardRepairAudit = repairCall.audit;
        const repaired = this.normalizeGeneration(repairCall.result.data);
        if (repaired.status === 'ready') {
          generated = repaired;
          guard = this.guard.inspect(repaired.sql, ASK_DATA_FREE_SQL_VIEWS, {
            ...guardContext,
            parameters: {
              ...askDataGuardParameters(controlledQueryPlan, repaired.parameters, resolvedDateRange),
            },
          });
          guardRepairSucceeded = guard.status === 'pass';
        }
      } catch (error) {
        guardRepairAudit = error instanceof AskDataStructuredOutputCallError ? error.audit : undefined;
        // Keep the original blocked result. Repair is a single bounded attempt;
        // it never bypasses the parser, guard or cost checks.
      } finally {
        if (structuredOutputAudit) {
          recordAskDataStructuredRepair(structuredOutputAudit, {
            kind: 'guard',
            reasonCode: guardRepairReason,
            latencyMs: Date.now() - guardRepairStartedAt,
            succeeded: guardRepairSucceeded,
          }, guardRepairAudit);
        }
      }
    }
    let planExecutionValidation =
      guard.status === 'pass' && controlledQueryPlan
        ? validateAskDataQueryPlanExecution(controlledQueryPlan, guard)
        : { valid: true as const };
    if (guard.status === 'pass' && !planExecutionValidation.valid && !repairAttempted) {
      repairAttempted = true;
      const planRepairReason = planExecutionValidation.reasonCode;
      const planRepairStartedAt = Date.now();
      let planRepairSucceeded = false;
      let planRepairAudit: AskDataStructuredOutputAudit | undefined;
      try {
        const repairCall = await generateAskDataStructuredWithRetry<AskDataSqlGeneration>(this.aiService, {
          scenario: 'ask_data_free_sql_plan_repair',
          messages: buildSqlRepairMessages({
            request,
            context,
            views: generationViews,
            previous: generated,
            reasonCode: planExecutionValidation.reasonCode,
            reasonMessage: planExecutionValidation.message,
            redactedSql: guard.redactedSql,
            semanticIntent: activeSemanticRoute?.semanticIntent,
            controlledQueryPlan,
          }),
          schema: ASK_DATA_SQL_GENERATION_SCHEMA,
          timeoutMs: 20000,
          temperature: 0,
          userId: context.userId,
          storeId: context.storeId,
        });
        planRepairAudit = repairCall.audit;
        const repaired = this.normalizeGeneration(repairCall.result.data);
        if (repaired.status === 'ready') {
          generated = repaired;
          guard = this.guard.inspect(repaired.sql, ASK_DATA_FREE_SQL_VIEWS, {
            ...guardContext,
            parameters: {
              ...askDataGuardParameters(controlledQueryPlan, repaired.parameters, resolvedDateRange),
            },
          });
          planExecutionValidation =
            guard.status === 'pass'
              ? validateAskDataQueryPlanExecution(controlledQueryPlan!, guard)
              : { valid: true };
          planRepairSucceeded = guard.status === 'pass' && planExecutionValidation.valid;
        }
      } catch (error) {
        planRepairAudit = error instanceof AskDataStructuredOutputCallError ? error.audit : undefined;
        // Query plan repair is a single bounded attempt and remains subject to
        // the same SQL parser, guard, cost and read-only execution gates.
      } finally {
        if (structuredOutputAudit) {
          recordAskDataStructuredRepair(structuredOutputAudit, {
            kind: 'query_plan',
            reasonCode: planRepairReason,
            latencyMs: Date.now() - planRepairStartedAt,
            succeeded: planRepairSucceeded,
          }, planRepairAudit);
        }
      }
    }
    if (guard.status === 'pass' && !planExecutionValidation.valid) {
      const response = this.attachSemanticPlan(
        this.simpleResponse('blocked', '生成的查询未完整覆盖问题要求，已阻止执行。', context, planExecutionValidation.reasonCode),
        activeSemanticRoute,
      );
      response.queryPlan.explanation = generated.explanation;
      this.attachControlledPlan(response, controlledQueryPlan, context);
      response.auditRunId = await this.audit.record({
        question,
        context,
        status: response.status,
        guard,
        generatedSql: generated.sql,
        explanation: generated.explanation,
        semanticRouting: semanticAudit,
        controlledQueryPlan,
        structuredOutput: structuredOutputAudit,
      });
      return response;
    }
    if (guard.status === 'blocked') {
      const response = this.attachSemanticPlan(
        this.simpleResponse('blocked', guard.message, context, guard.reasonCode),
        activeSemanticRoute,
      );
      response.queryPlan.explanation = generated.explanation;
      response.queryMeta.sqlFingerprint = guard.sqlFingerprint;
      response.auditRunId = await this.audit.record({
        question,
        context,
        status: response.status,
        guard,
        generatedSql: generated.sql,
        explanation: generated.explanation,
        semanticRouting: semanticAudit,
        controlledQueryPlan,
        structuredOutput: structuredOutputAudit,
      });
      return response;
    }

    const cost = this.costGuard.inspect(guard, config.maxEstimatedCost);
    if (cost.status === 'blocked') {
      const response = this.attachSemanticPlan(
        this.simpleResponse('blocked', cost.message, context, cost.reasonCode),
        activeSemanticRoute,
      );
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
        semanticRouting: semanticAudit,
        controlledQueryPlan,
        structuredOutput: structuredOutputAudit,
      });
      return response;
    }

    const execution = await this.executor.execute({
      guard,
      connectionString: config.readonlyDatabaseUrl,
      timeoutMs: config.timeoutMs,
      connectionTimeoutMs: config.connectionTimeoutMs,
      maxRows: config.maxLimit,
      dryRunOnly: config.dryRunOnly,
    });
    const sanitizedRows = execution.status === 'success' || execution.status === 'no_data'
      ? this.sanitizeRows(execution.rows, guard.selectedViews)
      : [];
    const normalizedNoData = execution.status === 'success' && this.isNullOnlyResult(sanitizedRows);
    const normalizedExecution = normalizedNoData
      ? { ...execution, status: 'no_data' as const, rows: [] }
      : execution;
    const rows = normalizedNoData ? [] : sanitizedRows;
    const dataAsOf = this.dataAsOf(rows, guard.selectedViews);
    const meta = {
      viewNames: guard.selectedViews.map((view) => view.viewName),
      timeRange: this.timeRange(guard.params, controlledQueryPlan),
      storeScope: `门店 ${context.storeId}`,
      truncated: Boolean(normalizedExecution.truncated),
      sqlFingerprint: guard.sqlFingerprint,
      executionMs: normalizedExecution.executionMs,
      ...(config.connectionMode !== 'unavailable' ? { connectionMode: config.connectionMode } : {}),
      ...(dataAsOf ? { dataAsOf } : {}),
      ...(this.canViewDebugSql(context) ? { generatedSql: guard.redactedSql } : {}),
      ...(normalizedExecution.blockedReason ? { statusReason: normalizedExecution.blockedReason } : {}),
      ...(normalizedExecution.attempts ? { executionAttempts: normalizedExecution.attempts } : {}),
      ...(normalizedExecution.retryAttempted !== undefined
        ? { executionRetryAttempted: normalizedExecution.retryAttempted }
        : {}),
    };
    if (normalizedExecution.status === 'blocked' || normalizedExecution.status === 'failed') {
      const status =
        normalizedExecution.status === 'blocked' && normalizedExecution.blockedReason === 'dry_run_only'
          ? 'blocked'
          : 'failed';
      const response = this.attachSemanticPlan(
        this.simpleResponse(
          status,
          this.executionMessage(normalizedExecution.blockedReason),
          context,
          normalizedExecution.blockedReason ?? 'execution_failed',
        ),
        activeSemanticRoute,
      );
      response.queryMeta = meta;
      response.queryPlan.explanation = generated.explanation;
      response.auditRunId = await this.audit.record({
        question,
        context,
        status: response.status,
        guard,
        cost,
        execution: normalizedExecution,
        generatedSql: generated.sql,
        explanation: generated.explanation,
        semanticRouting: semanticAudit,
        controlledQueryPlan,
        structuredOutput: structuredOutputAudit,
      });
      return response;
    }

    const answer = await this.answerService.compose({
      question,
      explanation: generated.explanation,
      rows,
      selectedViews: guard.selectedViews,
      context,
      timeRange: meta.timeRange,
      truncated: Boolean(normalizedExecution.truncated),
      assumptions: controlledQueryPlan?.assumptions ?? activeSemanticRoute?.semanticIntent.assumptions,
      requiredAnswerFacts: controlledQueryPlan?.requiredAnswerFacts,
      controlledQueryPlan: controlledQueryPlan
        ? {
            answerShape: controlledQueryPlan.answerShape,
            metricKeys: controlledQueryPlan.metricKeys,
            dimensions: controlledQueryPlan.dimensions,
            comparisonMode: controlledQueryPlan.comparisonMode,
            requiredOutputFields: controlledQueryPlan.requiredOutputFields,
            sort: controlledQueryPlan.sort,
            limit: controlledQueryPlan.limit,
            resultMode: controlledQueryPlan.resultMode,
            timeGrain: controlledQueryPlan.timeGrain,
          }
        : undefined,
    });
    const noDataHints = guard.selectedViews.map((view) => view.noDataHint).filter((hint): hint is string => Boolean(hint));
    const response: AskDataFreeSqlResponse = {
      status: normalizedExecution.status,
      summary: normalizedExecution.status === 'no_data' && noDataHints.length ? noDataHints[0] : answer.summary,
      keyFindings: answer.keyFindings,
      columns: this.columns(rows, guard.selectedViews),
      rows,
      sources: this.sources(guard.selectedViews, meta.timeRange, dataAsOf),
      limitations: [...new Set([
        ...answer.caveats,
        ...(controlledQueryPlan?.assumptions ?? activeSemanticRoute?.semanticIntent.assumptions ?? []),
        ...(rows.length === 0 ? noDataHints.slice(1) : []),
        ...guard.selectedViews
          .filter((view) => view.viewName === 'ask_data_marketing_roi_view')
          .map(() => '营销成本可能来自估算触达成本，不代表实际渠道账单。'),
        ...(config.connectionMode === 'development_admin'
          ? ['当前为开发环境管理员数据库连接冒烟模式，不代表专用只读角色上线验收通过。']
          : []),
        '仅查询已登记的问数视图，结果受当前用户门店和权限范围限制。',
      ])],
      queryMeta: meta,
      queryPlan: {
        planner: 'llm',
        explanation: generated.explanation,
        ...(this.canViewDebugSql(context) ? { generatedSql: guard.redactedSql } : {}),
        ...(activeSemanticRoute ? { semanticIntent: this.semanticPlan(activeSemanticRoute) } : {}),
        ...(controlledQueryPlan && this.canViewDebugSql(context) ? { controlled: controlledQueryPlan } : {}),
      },
    };
    response.auditRunId = await this.audit.record({
      question,
      context,
      status: response.status,
      guard,
      cost,
      execution: normalizedExecution,
      selectedViews: guard.selectedViews,
      answer,
      generatedSql: generated.sql,
      explanation: generated.explanation,
      semanticRouting: semanticAudit,
      controlledQueryPlan,
      structuredOutput: structuredOutputAudit,
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
    if (/补货建议|补货清单|采购建议|建议补(?:多少|哪些)|该补(?:多少|哪些)|什么时候补货|何时补货/.test(question)) {
      return {
        reasonCode: 'inventory_recommendation_not_supported',
        message: 'Ami Ask 当前只提供库存、消耗和在途采购事实，不生成补货数量、优先级或采购建议。',
      };
    }
    if (/开封(?:后|了)?.*(?:多久|多长时间|没用完)|(?:多久|多长时间).*开封.*没用完/.test(question)) {
      return {
        reasonCode: 'inventory_opened_at_fact_missing',
        message: '后台尚未记录批次开封时间，因此不能判断开封后多久未用完。',
      };
    }
    if (/(?:项目|服务).*(?:因为|因).*(?:缺|没有).*(?:耗材|产品).*(?:不能做|没法做)|(?:缺|没有).*(?:耗材|产品).*(?:项目|服务).*(?:不能做|没法做)/.test(question)) {
      return {
        reasonCode: 'project_bom_availability_fact_missing',
        message: '当前缺少项目完整 BOM 可用性和可服务次数口径，不能仅凭单个耗材库存断言项目无法执行。',
      };
    }
    if (/(?:仪器|理疗).*耗材.*(?:还能|够).*(?:做|服务).*(?:几次|多少次)/.test(question)) {
      return {
        reasonCode: 'governed_bom_service_count_missing',
        message: '当前缺少经过治理的 BOM 单次标准用量与可服务次数口径，不能计算仪器耗材还能服务多少次。',
      };
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

  private isNullOnlyResult(rows: Array<Record<string, unknown>>) {
    return (
      rows.length > 0 &&
      rows.every((row) => {
        const values = Object.values(row);
        return values.length === 0 || values.every((value) => value === null || value === undefined);
      })
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
            ? /(rate|ratio|utilization)/i.test(key)
              ? 'percent'
              : /(amount|revenue|price|cost|profit|paid|refund|income|value|liability)/i.test(key)
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

  private sources(views: ReadOnlySqlView[], timeRange: string, dataAsOf?: string) {
    return views.map((view) => ({
      model: view.viewName,
      fields: view.fields.filter((field) => field.policy !== 'deny').map((field) => field.name),
      filters: ['门店权限', timeRange ? `时间范围：${timeRange}` : '查询范围由 SQL 指定', 'LIMIT 和只读 Guard'],
      reason: view.description,
      ...(view.dataPolicy ? { dataPolicy: view.dataPolicy } : {}),
      ...(dataAsOf ? { dataAsOf } : {}),
    }));
  }

  private dataAsOf(rows: Array<Record<string, unknown>>, views: ReadOnlySqlView[]) {
    const candidates = views.flatMap((view) => [view.freshnessField, view.defaultTimeField]).filter(Boolean) as string[];
    const timestamps = rows
      .flatMap((row) => candidates.map((field) => row[field]))
      .map((value) => new Date(String(value ?? '')))
      .filter((value) => Number.isFinite(value.getTime()))
      .sort((left, right) => right.getTime() - left.getTime());
    return timestamps[0]?.toISOString();
  }

  private domainLabel(domain: string) {
    const labels: Record<string, string> = {
      order: '订单经营',
      product: '商品销售',
      project: '项目服务',
      finance: '财务利润',
      inventory: '库存供应',
      customer: '客户经营',
      card: '会员资产',
      staff: '员工产能',
      reservation: '预约排班',
      service: '服务质量',
      marketing: '营销效果',
      supply: '采购供应',
    };
    return labels[domain] ?? domain;
  }

  private timeRange(params: Record<string, unknown>, plan?: AskDataControlledQueryPlan) {
    const start = String(params.startAt ?? '').slice(0, 10);
    const end = String(params.endAt ?? '').slice(0, 10);
    if (plan?.timeScopeMode === 'current_snapshot') return '当前状态（不按创建时间裁剪）';
    if (plan?.timeScopeMode === 'active_interval') return `截至 ${end || '当前'} 的生效状态`;
    if (plan?.timeScopeMode === 'none') return '当前汇总视图（不按事件时间裁剪）';
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

  private semanticPlan(route: AskDataSemanticRouteResult) {
    return {
      intent: route.semanticIntent.intent,
      answerShape: route.semanticIntent.answerShape,
      metricKeys: route.semanticIntent.metricKeys,
      dimensionKeys: route.semanticIntent.dimensionKeys,
      confidence: route.semanticIntent.confidence,
      routeMode: route.routeMode,
      assumptions: route.semanticIntent.assumptions,
    };
  }

  private semanticAuditMeta(route: AskDataSemanticRouteResult, shadow: boolean): AskDataSemanticAuditMeta {
    return {
      ...this.semanticPlan(route),
      deterministicCandidates: route.deterministicCandidateViews.map((view) => view.viewName),
      finalCandidates: route.candidateViews.map((view) => view.viewName),
      ...(route.fallbackReason ? { fallbackReason: route.fallbackReason } : {}),
      ...(route.clarificationReason ? { clarificationReason: route.clarificationReason } : {}),
      deterministicLatencyMs: route.deterministicLatencyMs,
      ...(route.modelFallbackLatencyMs !== undefined ? { modelFallbackLatencyMs: route.modelFallbackLatencyMs } : {}),
      shadow,
    };
  }

  private attachSemanticPlan(response: AskDataFreeSqlResponse, route?: AskDataSemanticRouteResult) {
    if (route) response.queryPlan.semanticIntent = this.semanticPlan(route);
    return response;
  }

  private attachControlledPlan(
    response: AskDataFreeSqlResponse,
    plan: AskDataControlledQueryPlan | undefined,
    context: AskDataFreeSqlContext,
  ) {
    if (plan && this.canViewDebugSql(context)) response.queryPlan.controlled = plan;
    return response;
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
