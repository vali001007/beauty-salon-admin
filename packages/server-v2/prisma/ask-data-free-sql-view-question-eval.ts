import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AiService } from '../src/ai/ai.service.js';
import { AskDataFreeSqlAnswerService } from '../src/ask-data-free-sql/ask-data-free-sql.answer.service.js';
import { ASK_DATA_FREE_SQL_VIEWS } from '../src/ask-data-free-sql/ask-data-free-sql.catalog.js';
import { AskDataClarificationPolicy } from '../src/ask-data-free-sql/ask-data-clarification-policy.js';
import { AskDataIntentParser } from '../src/ask-data-free-sql/ask-data-intent-parser.js';
import {
  askDataSemanticRouterConfig,
  AskDataSemanticRouter,
} from '../src/ask-data-free-sql/ask-data-semantic-router.js';
import { selectAskDataViews } from '../src/ask-data-free-sql/ask-data-free-sql-view-selector.js';
import { resolveAskDataDateRange } from '../src/ask-data-free-sql/ask-data-free-sql.date-range.js';
import { askDataGuardParameters, askDataTimeScopeOverrides, buildAskDataQueryPlan } from '../src/ask-data-free-sql/ask-data-query-plan.js';
import {
  validateAskDataQueryPlan,
  validateAskDataQueryPlanExecution,
} from '../src/ask-data-free-sql/ask-data-query-plan-validator.js';
import {
  ASK_DATA_SQL_GENERATION_SCHEMA,
  buildClarificationRepairMessages,
  buildSqlGenerationMessages,
  buildSqlRepairMessages,
  isRepairableSqlGuardReason,
  shouldRetryClearQuestionClarification,
} from '../src/ask-data-free-sql/ask-data-free-sql.prompts.js';
import type { AskDataAnswer, AskDataSqlGeneration } from '../src/ask-data-free-sql/ask-data-free-sql.types.js';
import {
  AskDataStructuredOutputCallError,
  askDataStructuredErrorCode,
  generateAskDataStructuredWithRetry,
} from '../src/ask-data-free-sql/ask-data-structured-output.js';
import { ReadOnlySqlCostGuard } from '../src/read-only-sql-kernel/read-only-sql-cost-guard.js';
import { ReadOnlySqlExecutor } from '../src/read-only-sql-kernel/read-only-sql-executor.js';
import { ReadOnlySqlGuard } from '../src/read-only-sql-kernel/read-only-sql-guard.js';
import { ReadOnlySqlParser } from '../src/read-only-sql-kernel/read-only-sql-parser.js';
import { AskDataNamedEntityResolver } from '../src/ask-data-free-sql/ask-data-entity-resolver.js';
import {
  detectAskDataAnswerContractFailure,
  detectAskDataAnswerScopeFailure,
  isAskDataAnswerGrounded,
} from '../src/ask-data-free-sql/ask-data-answer-eval-quality.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { validateAskDataGoldRoutePlanMatch } from './ask-data-gold-plan-match.js';

type ManifestQuestion = {
  id: string;
  domain: string;
  role: string;
  type: string;
  difficulty: string;
  question: string;
  expected_target: string;
  notes: string;
  expectedView: string;
  expectedViewLabel: string;
  requiredViews?: string[];
  requiredAnswerFacts?: string[];
  requiredOutputFields?: string[];
  requiredResultMode?: 'scalar' | 'detail' | 'grouped' | 'ranking' | 'trend';
  expectedMetricKeys?: string[];
  acceptableViews?: string[];
  questionChecksum?: string;
};

type Manifest = {
  generatedAt: string;
  sourcePath: string;
  sourceQuestionCount: number;
  targetPerView: number;
  viewCount: number;
  coveredViews: number;
  selectedCaseCount: number;
  insufficientViews: Array<Record<string, unknown>>;
  sourceGoldChecksum?: string;
  sourceContractChecksum?: string;
  selectedQuestionsChecksum?: string;
  checksum?: string;
  selectedQuestions: ManifestQuestion[];
};

type EvalResult = ManifestQuestion & {
  status: string;
  pipelineStatus: string;
  failureCategory?: string;
  failureClass?: 'product_failure' | 'provider_failure' | 'gold_failure' | 'data_failure' | 'security_failure';
  failureReason?: string;
  candidateViews: string[];
  candidateExpectedHit: boolean;
  legacyCandidateViews?: string[];
  semanticRouteMode?: string;
  semanticConfidence?: number;
  semanticMetricKeys?: string[];
  semanticRoutingMs?: number;
  selectedViews: string[];
  expectedViewHit: boolean;
  generationStatus?: string;
  generationAttempts?: number;
  generationRepairReasons?: string[];
  provider?: string;
  model?: string;
  generationMs: number;
  guardMs: number;
  executionMs: number;
  answerMs: number;
  totalMs: number;
  rowCount?: number;
  noData?: boolean;
  answerGrounded?: boolean;
  answerComplete?: boolean;
  goldPlanMatched?: boolean;
  answer?: Pick<AskDataAnswer, 'summary' | 'keyFindings' | 'caveats'>;
  redactedSql?: string;
};

const strict = process.argv.includes('--strict');
const allowDevelopmentAdmin = process.argv.includes('--allow-development-admin');
const storeId = positiveInt(argumentValue('--store-id='), 6);
const concurrency = positiveInt(argumentValue('--concurrency='), 3);
const viewFilter = argumentValue('--view=');
const questionFilter = argumentValue('--question-id=');
const questionIds = new Set((questionFilter ?? '').split(',').map((item) => item.trim()).filter(Boolean));
const offset = nonNegativeInt(argumentValue('--offset='), 0);
const limit = positiveInt(argumentValue('--limit='), Number.MAX_SAFE_INTEGER);
const manifestPath = resolve(
  process.cwd(),
  argumentValue('--manifest=') ??
    '../../docs/04-测试数据/Ami-Ask-34视图问题集实测-2026-08-02/selection-manifest.json',
);
const outputPath = resolve(
  process.cwd(),
  argumentValue('--output=') ??
    '../../docs/04-测试数据/Ami-Ask-34视图问题集实测-2026-08-02/detailed-results.json',
);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
validateManifestSource(manifest);
const cases = manifest.selectedQuestions
  .filter((item) => !viewFilter || item.expectedView === viewFilter)
  .filter((item) => !questionIds.size || questionIds.has(item.id))
  .slice(offset, offset + limit);
const dedicatedReadonlyUrl = process.env.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL?.trim();
const developmentAdminUrl = allowDevelopmentAdmin ? process.env.DATABASE_URL?.trim() : undefined;
const connectionString = dedicatedReadonlyUrl || developmentAdminUrl;
const connectionMode = dedicatedReadonlyUrl
  ? 'dedicated_readonly'
  : developmentAdminUrl
    ? 'development_admin'
    : 'unavailable';

if (!cases.length) throw new Error('No evaluation cases matched the filters');
if (allowDevelopmentAdmin && process.env.NODE_ENV === 'production') {
  throw new Error('development_admin_database_forbidden_in_production');
}
if (!connectionString) throw new Error('readonly_database_url_missing');

const databaseHost = new URL(connectionString).hostname;
const prismaAuditStub = { aiAuditLog: { create: async () => ({ id: 0 }) } };
const ai = new AiService(prismaAuditStub as never, new ConfigService(process.env));
const semanticRouter = new AskDataSemanticRouter(ai, new AskDataIntentParser(), new AskDataClarificationPolicy());
const semanticConfig = askDataSemanticRouterConfig();
const answerService = new AskDataFreeSqlAnswerService(ai);
const prisma = new PrismaService();
const namedEntityResolver = new AskDataNamedEntityResolver(prisma);
const guard = new ReadOnlySqlGuard(new ReadOnlySqlParser());
const costGuard = new ReadOnlySqlCostGuard();
const executor = new ReadOnlySqlExecutor();
const context = {
  storeId,
  visibleStoreIds: [storeId],
  permissions: ['*'],
  deniedPermissions: [] as string[],
};
const startedAt = Date.now();
const results = new Array<EvalResult>(cases.length);

mkdirSync(dirname(outputPath), { recursive: true });
await mapWithConcurrency(cases, concurrency, async (item, index) => {
  const result = await evaluate(item);
  results[index] = result;
  writeCheckpoint(false);
  console.error(
    `[ask-data-view-eval] ${index + 1}/${cases.length} ${item.id} ${item.expectedView} ${result.status} ${result.totalMs}ms`,
  );
  return result;
});
await prisma.$disconnect();

writeCheckpoint(true);
const finalReport = buildReport(true);
console.log(JSON.stringify(finalReport, null, 2));
if (strict && finalReport.summary.strictAccuracy < 1) process.exitCode = 1;

async function evaluate(item: ManifestQuestion): Promise<EvalResult> {
  const itemStartedAt = Date.now();
  const legacyCandidateViews = selectAskDataViews(item.question, context);
  const semanticStartedAt = Date.now();
  let semanticRoute = semanticConfig.enabled
    ? await semanticRouter.route({ question: item.question, context, authorizedViews: ASK_DATA_FREE_SQL_VIEWS, config: semanticConfig })
    : undefined;
  let entityClarification: { question: string; reason: string } | undefined;
  if (semanticRoute && !semanticRoute.clarificationQuestion && semanticRoute.semanticIntent.entities.length) {
    const resolved = await namedEntityResolver.resolve(semanticRoute.semanticIntent, storeId);
    semanticRoute = { ...semanticRoute, semanticIntent: resolved.semanticIntent };
    if (resolved.clarificationQuestion) {
      entityClarification = {
        question: resolved.clarificationQuestion,
        reason: resolved.clarificationReason ?? 'entity_identity',
      };
    }
  }
  const semanticRoutingMs = Date.now() - semanticStartedAt;
  const candidateViews = semanticRoute?.candidateViews.length ? semanticRoute.candidateViews : legacyCandidateViews;
  const controlledQueryPlan = semanticRoute
    ? buildAskDataQueryPlan({ question: item.question, semanticIntent: semanticRoute.semanticIntent, candidateViews })
    : undefined;
  const candidateViewNames = candidateViews.map((view) => view.viewName);
  const base: Omit<
    EvalResult,
    | 'status'
    | 'pipelineStatus'
    | 'selectedViews'
    | 'expectedViewHit'
    | 'generationMs'
    | 'guardMs'
    | 'executionMs'
    | 'answerMs'
    | 'totalMs'
  > = {
    ...item,
    candidateViews: candidateViewNames,
    candidateExpectedHit: (item.requiredViews?.length ? item.requiredViews : [item.expectedView])
      .every((viewName) => candidateViewNames.includes(viewName)),
    legacyCandidateViews: legacyCandidateViews.map((view) => view.viewName),
    semanticRouteMode: semanticRoute?.routeMode,
    semanticConfidence: semanticRoute?.semanticIntent.confidence,
    semanticMetricKeys: semanticRoute?.semanticIntent.metricKeys,
    semanticRoutingMs,
    goldPlanMatched: true,
  };
  let generationMs = 0;
  let guardMs = 0;
  let executionMs = 0;
  let answerMs = 0;
  let generationAttempts = 0;
  let generationRepairReasons: string[] = [];
  if (semanticRoute?.clarificationQuestion || entityClarification) {
    return failure(base, {
      status: 'clarification',
      pipelineStatus: 'generation_not_ready',
      failureCategory: 'semantic_clarification',
      failureReason: semanticRoute?.clarificationQuestion ?? entityClarification?.question,
      generationStatus: 'clarification',
      generationMs,
      guardMs,
      executionMs,
      answerMs,
      itemStartedAt,
    });
  }
  if (controlledQueryPlan) {
    const planValidation = validateAskDataQueryPlan(controlledQueryPlan, candidateViews);
    if (!planValidation.valid) {
      return failure(base, {
        status: 'controlled_plan_invalid',
        pipelineStatus: 'generation_not_ready',
        failureCategory: planValidation.reasonCode,
        failureReason: planValidation.message,
        generationMs,
        guardMs,
        executionMs,
        answerMs,
        itemStartedAt,
      });
    }
    const missingGoldOutput = (item.requiredOutputFields ?? [])
      .find((field) => !controlledQueryPlan.requiredOutputFields.includes(field));
    const resultModeMismatch = item.requiredResultMode && item.requiredResultMode !== controlledQueryPlan.resultMode;
    const routePlanContract = validateAskDataGoldRoutePlanMatch(item, {
      semanticMetricKeys: semanticRoute?.semanticIntent.metricKeys,
      candidateViews: candidateViewNames,
      planMetricKeys: controlledQueryPlan.metricKeys,
      planRequiredViews: controlledQueryPlan.requiredViewNames,
    });
    if (missingGoldOutput || resultModeMismatch || !routePlanContract.valid) {
      return failure(base, {
        status: 'gold_plan_mismatch',
        pipelineStatus: 'generation_not_ready',
        failureCategory: missingGoldOutput
          ? 'gold_required_output_missing'
          : resultModeMismatch
            ? 'gold_result_mode_mismatch'
            : routePlanContract.reasonCodes[0],
        failureReason: missingGoldOutput
          ? `Gold 要求输出字段 ${missingGoldOutput} 未进入查询计划。`
          : resultModeMismatch
            ? `Gold 要求结果粒度 ${item.requiredResultMode}，实际为 ${controlledQueryPlan.resultMode}。`
            : `语义路由或查询计划扩张了 Gold 合同：${routePlanContract.reasonCodes.join(', ')}。`,
        goldPlanMatched: false,
        generationMs,
        guardMs,
        executionMs,
        answerMs,
        itemStartedAt,
      });
    }
  }
  try {
    const generationStartedAt = Date.now();
    const generatedCall = await generateAskDataStructuredWithRetry<AskDataSqlGeneration>(ai, {
      scenario: 'ask_data_free_sql_view_question_eval_generation',
      messages: buildSqlGenerationMessages({
        request: { question: item.question },
        context,
        views: candidateViews,
        semanticIntent: semanticRoute?.semanticIntent,
        controlledQueryPlan,
      }),
      schema: ASK_DATA_SQL_GENERATION_SCHEMA,
      timeoutMs: 20000,
      temperature: 0,
      storeId,
    });
    let generation = generatedCall.result;
    generationAttempts = generatedCall.audit.attempts;
    generationRepairReasons = generatedCall.audit.retryAttempted
      ? [`structured:${generatedCall.audit.firstErrorCode ?? 'transient_error'}`]
      : [];
    if (
      generation.data.status === 'clarification' &&
      (Boolean(semanticRoute?.semanticIntent.metricKeys.length) ||
        shouldRetryClearQuestionClarification(item.question, candidateViews))
    ) {
      const repairCall = await generateAskDataStructuredWithRetry<AskDataSqlGeneration>(ai, {
        scenario: 'ask_data_free_sql_view_question_eval_clarification_repair',
        messages: buildClarificationRepairMessages({
          request: { question: item.question },
          context,
          views: candidateViews,
          previous: generation.data,
          semanticIntent: semanticRoute?.semanticIntent,
          controlledQueryPlan,
        }),
        schema: ASK_DATA_SQL_GENERATION_SCHEMA,
        timeoutMs: 20000,
        temperature: 0,
        storeId,
      });
      generation = repairCall.result;
      generationAttempts += repairCall.audit.attempts;
      generationRepairReasons.push('clarification:model_clarification');
      if (repairCall.audit.retryAttempted) {
        generationRepairReasons.push(`clarification:structured:${repairCall.audit.firstErrorCode ?? 'transient_error'}`);
      }
    }
    generationMs = Date.now() - generationStartedAt;
    if (generation.data.status !== 'ready') {
      return failure(base, {
        status: generation.data.status,
        pipelineStatus: 'generation_not_ready',
        failureCategory: generation.data.status,
        failureReason: generation.data.explanation,
        generationStatus: generation.data.status,
        generationAttempts,
        generationRepairReasons,
        provider: generation.provider,
        model: generation.model,
        generationMs,
        guardMs,
        executionMs,
        answerMs,
        itemStartedAt,
      });
    }

    const dateRange = semanticRoute?.semanticIntent.timeRange ?? resolveAskDataDateRange(item.question);
    const guardContext = {
      storeIds: [storeId],
      permissions: ['*'],
      deniedPermissions: [],
      maxLimit: 100,
      maxViews: 2,
      maxRangeDays: 730,
      question: item.question,
      parameters: {
        ...askDataGuardParameters(controlledQueryPlan, generation.data.parameters, dateRange),
      },
      ...(controlledQueryPlan?.requiredViewNames.length === 2
        ? { allowedJoinViewSets: [controlledQueryPlan.requiredViewNames] }
        : {}),
      ...askDataTimeScopeOverrides(controlledQueryPlan),
    };
    const guardStartedAt = Date.now();
    let guarded = guard.inspect(generation.data.sql, ASK_DATA_FREE_SQL_VIEWS, guardContext);
    let repairAttempted = false;
    if (guarded.status === 'blocked' && isRepairableSqlGuardReason(guarded.reasonCode)) {
      repairAttempted = true;
      generationRepairReasons.push(`guard:${guarded.reasonCode}`);
      const repairStartedAt = Date.now();
      const repairCall = await generateAskDataStructuredWithRetry<AskDataSqlGeneration>(ai, {
        scenario: 'ask_data_free_sql_view_question_eval_guard_repair',
        messages: buildSqlRepairMessages({
          request: { question: item.question },
          context,
          views: candidateViews,
          previous: generation.data,
          reasonCode: guarded.reasonCode,
          reasonMessage: guarded.message,
          redactedSql: guarded.redactedSql ?? '',
          semanticIntent: semanticRoute?.semanticIntent,
          controlledQueryPlan,
        }),
        schema: ASK_DATA_SQL_GENERATION_SCHEMA,
        timeoutMs: 20000,
        temperature: 0,
        storeId,
      });
      const repaired = repairCall.result;
      generationMs += Date.now() - repairStartedAt;
      generationAttempts += repairCall.audit.attempts;
      if (repairCall.audit.retryAttempted) {
        generationRepairReasons.push(`guard:structured:${repairCall.audit.firstErrorCode ?? 'transient_error'}`);
      }
      if (repaired.data.status === 'ready') {
        generation = repaired;
        guarded = guard.inspect(repaired.data.sql, ASK_DATA_FREE_SQL_VIEWS, {
          ...guardContext,
          parameters: {
            ...askDataGuardParameters(controlledQueryPlan, repaired.data.parameters, dateRange),
          },
        });
      }
    }
    let planExecutionValidation =
      guarded.status === 'pass' && controlledQueryPlan
        ? validateAskDataQueryPlanExecution(controlledQueryPlan, guarded)
        : { valid: true as const };
    if (guarded.status === 'pass' && !planExecutionValidation.valid && !repairAttempted) {
      repairAttempted = true;
      generationRepairReasons.push(`query_plan:${planExecutionValidation.reasonCode}`);
      const planRepairStartedAt = Date.now();
      const repairCall = await generateAskDataStructuredWithRetry<AskDataSqlGeneration>(ai, {
        scenario: 'ask_data_free_sql_view_question_eval_plan_repair',
        messages: buildSqlRepairMessages({
          request: { question: item.question },
          context,
          views: candidateViews,
          previous: generation.data,
          reasonCode: planExecutionValidation.reasonCode,
          reasonMessage: planExecutionValidation.message,
          redactedSql: guarded.redactedSql,
          semanticIntent: semanticRoute?.semanticIntent,
          controlledQueryPlan,
        }),
        schema: ASK_DATA_SQL_GENERATION_SCHEMA,
        timeoutMs: 20000,
        temperature: 0,
        storeId,
      });
      const repaired = repairCall.result;
      generationMs += Date.now() - planRepairStartedAt;
      generationAttempts += repairCall.audit.attempts;
      if (repairCall.audit.retryAttempted) {
        generationRepairReasons.push(`query_plan:structured:${repairCall.audit.firstErrorCode ?? 'transient_error'}`);
      }
      if (repaired.data.status === 'ready') {
        generation = repaired;
        guarded = guard.inspect(repaired.data.sql, ASK_DATA_FREE_SQL_VIEWS, {
          ...guardContext,
          parameters: {
            ...askDataGuardParameters(controlledQueryPlan, repaired.data.parameters, dateRange),
          },
        });
        planExecutionValidation =
          guarded.status === 'pass'
            ? validateAskDataQueryPlanExecution(controlledQueryPlan!, guarded)
            : { valid: true };
      }
    }
    guardMs = Date.now() - guardStartedAt;
    if (guarded.status === 'pass' && !planExecutionValidation.valid) {
      return failure(base, {
        status: 'controlled_plan_incomplete',
        pipelineStatus: 'guard_blocked',
        failureCategory: planExecutionValidation.reasonCode,
        failureReason: planExecutionValidation.message,
        generationStatus: generation.data.status,
        generationAttempts,
        generationRepairReasons,
        provider: generation.provider,
        model: generation.model,
        generationMs,
        guardMs,
        executionMs,
        answerMs,
        redactedSql: guarded.redactedSql,
        itemStartedAt,
      });
    }
    if (guarded.status === 'blocked') {
      return failure(base, {
        status: 'guard_blocked',
        pipelineStatus: 'guard_blocked',
        failureCategory: `guard_${guarded.reasonCode}`,
        failureReason: guarded.message,
        generationStatus: generation.data.status,
        generationAttempts,
        generationRepairReasons,
        provider: generation.provider,
        model: generation.model,
        generationMs,
        guardMs,
        executionMs,
        answerMs,
        redactedSql: guarded.redactedSql,
        itemStartedAt,
      });
    }
    const cost = costGuard.inspect(guarded, 100);
    if (cost.status === 'blocked') {
      return failure(base, {
        status: 'cost_blocked',
        pipelineStatus: 'cost_blocked',
        failureCategory: `cost_${cost.reasonCode}`,
        failureReason: cost.message,
        generationStatus: generation.data.status,
        generationAttempts,
        generationRepairReasons,
        provider: generation.provider,
        model: generation.model,
        generationMs,
        guardMs,
        executionMs,
        answerMs,
        redactedSql: guarded.redactedSql,
        itemStartedAt,
      });
    }

    const selectedViews = guarded.selectedViews.map((view) => view.viewName);
    const requiredViews = item.requiredViews?.length ? item.requiredViews : [item.expectedView];
    const acceptableViews = item.acceptableViews?.length ? item.acceptableViews : requiredViews;
    const expectedViewHit = requiredViews.every((viewName) => selectedViews.includes(viewName))
      && selectedViews.every((viewName) => acceptableViews.includes(viewName));
    const executionStartedAt = Date.now();
    const execution = await executor.execute({
      guard: guarded,
      connectionString,
      timeoutMs: 5000,
      connectionTimeoutMs: positiveInt(process.env.ASK_DATA_FREE_SQL_CONNECTION_TIMEOUT_MS, 5000),
      maxRows: 100,
      dryRunOnly: false,
    });
    executionMs = Date.now() - executionStartedAt;
    if (execution.status === 'blocked' || execution.status === 'failed') {
      return failure(base, {
        status: 'execution_failed',
        pipelineStatus: 'execution_failed',
        failureCategory: 'execution_failed',
        failureReason: execution.blockedReason,
        selectedViews,
        expectedViewHit,
        generationStatus: generation.data.status,
        generationAttempts,
        generationRepairReasons,
        provider: generation.provider,
        model: generation.model,
        generationMs,
        guardMs,
        executionMs,
        answerMs,
        rowCount: execution.rows.length,
        redactedSql: guarded.redactedSql,
        itemStartedAt,
      });
    }

    const sanitizedRows = sanitizeRows(execution.rows);
    const rows = isNullOnlyResult(sanitizedRows) ? [] : sanitizedRows;
    const answerStartedAt = Date.now();
    const answer = await answerService.compose({
      question: item.question,
      explanation: generation.data.explanation,
      rows,
      selectedViews: guarded.selectedViews,
      context,
      timeRange: timeRange(guarded.params, controlledQueryPlan),
      truncated: Boolean(execution.truncated),
      assumptions: semanticRoute?.semanticIntent.assumptions,
      requiredAnswerFacts: controlledQueryPlan?.requiredAnswerFacts,
      controlledQueryPlan: controlledQueryPlan
        ? {
            answerShape: controlledQueryPlan.answerShape,
            metricKeys: controlledQueryPlan.metricKeys,
            dimensions: controlledQueryPlan.dimensions,
            comparisonMode: controlledQueryPlan.comparisonMode,
            requiredOutputFields: controlledQueryPlan.requiredOutputFields,
            aggregations: controlledQueryPlan.aggregations,
            sort: controlledQueryPlan.sort,
            limit: controlledQueryPlan.limit,
            resultMode: controlledQueryPlan.resultMode,
            timeGrain: controlledQueryPlan.timeGrain,
          }
        : undefined,
    });
    answerMs = Date.now() - answerStartedAt;
    const answerGrounded = isGrounded(answer, rows, timeRange(guarded.params, controlledQueryPlan));
    const answerScopeFailure = rows.length ? detectAskDataAnswerScopeFailure(answer, {
      rows,
      nonNullableRequiredFields: controlledQueryPlan?.aggregations
        .filter((aggregation) => aggregation.zeroOnEmpty)
        .map((aggregation) => aggregation.alias),
    }) : undefined;
    const answerContractFailure = rows.length ? detectAskDataAnswerContractFailure(answer, {
      question: item.question,
      rows,
      requiredOutputFields: controlledQueryPlan?.requiredOutputFields,
      requiredAnswerFacts: controlledQueryPlan?.requiredAnswerFacts,
      metricKeys: controlledQueryPlan?.metricKeys,
      dimensions: controlledQueryPlan?.dimensions,
      nonNullableRequiredFields: controlledQueryPlan?.aggregations
        .filter((aggregation) => aggregation.zeroOnEmpty)
        .map((aggregation) => aggregation.alias),
    }) : undefined;
    const answerFailure = answerScopeFailure ?? answerContractFailure;
    const answerComplete = !answerFailure && (rows.length === 0 || (controlledQueryPlan?.requiredAnswerFacts ?? [])
      .every((fact) => answer.coveredFacts.includes(fact)));
    const answerCorrect = answerGrounded && answerComplete;
    const status = expectedViewHit && answerCorrect
      ? 'pass'
      : expectedViewHit
        ? answerGrounded
          ? 'answer_incomplete'
          : 'answer_not_grounded'
        : 'expected_view_miss';
    const failureCategory =
      status === 'pass'
        ? undefined
        : status === 'expected_view_miss'
          ? base.candidateExpectedHit
            ? 'model_view_selection_miss'
            : 'candidate_selector_miss'
          : status === 'answer_incomplete'
            ? answerScopeFailure
              ? 'answer_scope_unresolved'
              : answerContractFailure
                ? 'answer_contract_incomplete'
                : 'answer_incomplete'
            : 'answer_not_grounded';
    return {
      ...base,
      status,
      pipelineStatus: answerCorrect ? 'pass' : answerGrounded ? 'answer_incomplete' : 'answer_not_grounded',
      failureCategory,
      ...(failureCategory ? { failureClass: classifyEvalFailure(failureCategory, status) } : {}),
      failureReason:
        status === 'expected_view_miss'
          ? `Expected ${(item.requiredViews?.length ? item.requiredViews : [item.expectedView]).join(', ')}, selected ${selectedViews.join(', ') || 'none'}`
          : status === 'answer_incomplete'
            ? answerFailure ?? 'Answer did not cover every required answer fact.'
            : status === 'answer_not_grounded'
            ? 'Answer contains numeric claims not present in query rows or time range.'
            : undefined,
      selectedViews,
      expectedViewHit,
      generationStatus: generation.data.status,
      generationAttempts,
      generationRepairReasons,
      provider: generation.provider,
      model: generation.model,
      generationMs,
      guardMs,
      executionMs,
      answerMs,
      totalMs: Date.now() - itemStartedAt,
      rowCount: rows.length,
      noData: rows.length === 0,
      answerGrounded,
      answerComplete,
      goldPlanMatched: true,
      answer: { summary: answer.summary, keyFindings: answer.keyFindings, caveats: answer.caveats },
      redactedSql: guarded.redactedSql,
    };
  } catch (error) {
    const structuredErrorCode = askDataStructuredErrorCode(error);
    const structuredAudit = error instanceof AskDataStructuredOutputCallError ? error.audit : undefined;
    const structuredCause = error instanceof AskDataStructuredOutputCallError ? error.originalError : error;
    const failedProvider = typeof structuredCause === 'object' && structuredCause && 'provider' in structuredCause
      ? String((structuredCause as { provider?: unknown }).provider ?? '')
      : undefined;
    const failedModel = typeof structuredCause === 'object' && structuredCause && 'model' in structuredCause
      ? String((structuredCause as { model?: unknown }).model ?? '')
      : undefined;
    if (structuredAudit) {
      generationAttempts += structuredAudit.attempts;
      if (structuredAudit.retryAttempted) {
        generationRepairReasons.push(`structured:${structuredAudit.firstErrorCode ?? 'transient_error'}`);
      }
    }
    return failure(base, {
      status: 'evaluation_failed',
      pipelineStatus: 'evaluation_failed',
      failureCategory: structuredErrorCode ? 'AiStructuredOutputError' : error instanceof Error ? error.name : 'unknown_error',
      failureReason: error instanceof Error ? error.message : String(error),
      generationAttempts,
      generationRepairReasons,
      ...(failedProvider ? { provider: failedProvider } : {}),
      ...(failedModel ? { model: failedModel } : {}),
      generationMs,
      guardMs,
      executionMs,
      answerMs,
      itemStartedAt,
    });
  }
}

function failure(
  base: Omit<
    EvalResult,
    | 'status'
    | 'pipelineStatus'
    | 'selectedViews'
    | 'expectedViewHit'
    | 'generationMs'
    | 'guardMs'
    | 'executionMs'
    | 'answerMs'
    | 'totalMs'
  >,
  input: Partial<EvalResult> & Pick<EvalResult, 'status' | 'pipelineStatus' | 'generationMs' | 'guardMs' | 'executionMs' | 'answerMs'> & { itemStartedAt: number },
): EvalResult {
  const { itemStartedAt, ...rest } = input;
  return {
    ...base,
    selectedViews: input.selectedViews ?? [],
    expectedViewHit: input.expectedViewHit ?? false,
    totalMs: Date.now() - itemStartedAt,
    ...rest,
    ...(rest.failureCategory && !rest.failureClass
      ? { failureClass: classifyEvalFailure(rest.failureCategory, rest.status) }
      : {}),
  } as EvalResult;
}

function classifyEvalFailure(
  failureCategory: string,
  status: string,
): NonNullable<EvalResult['failureClass']> {
  if (failureCategory === 'AiStructuredOutputError') return 'provider_failure';
  if (status === 'gold_plan_mismatch' || failureCategory.startsWith('gold_')) return 'gold_failure';
  if (status === 'execution_failed' || failureCategory === 'execution_failed') return 'data_failure';
  if (/^(?:permission_|cross_store_|sensitive_|readonly_)/.test(failureCategory)) return 'security_failure';
  return 'product_failure';
}

function writeCheckpoint(complete: boolean) {
  writeFileSync(outputPath, `${JSON.stringify(buildReport(complete), null, 2)}\n`);
}

function buildReport(complete: boolean) {
  const completedResults = results.filter(Boolean);
  const strictPassed = completedResults.filter((item) => item.status === 'pass').length;
  const pipelinePassed = completedResults.filter((item) => item.pipelineStatus === 'pass').length;
  const expectedViewHits = completedResults.filter((item) => item.expectedViewHit).length;
  const providerAvailable = completedResults.filter((item) => item.failureCategory !== 'AiStructuredOutputError').length;
  const sqlGenerated = completedResults.filter((item) => item.generationStatus === 'ready').length;
  const guardPassed = completedResults.filter((item) => ['pass', 'answer_incomplete', 'answer_not_grounded', 'execution_failed'].includes(item.pipelineStatus)).length;
  const databaseExecuted = completedResults.filter((item) => ['pass', 'answer_incomplete', 'answer_not_grounded'].includes(item.pipelineStatus)).length;
  const groundedAnswers = completedResults.filter((item) => item.answerGrounded).length;
  const completeAnswers = completedResults.filter((item) => item.answerComplete).length;
  const goldPlanMatched = completedResults.filter((item) => item.goldPlanMatched).length;
  const durations = completedResults.map((item) => item.totalMs).sort((left, right) => left - right);
  return {
    generatedAt: new Date().toISOString(),
    complete,
    strict,
    connectionMode,
    databaseHost,
    storeId,
    concurrency,
    manifest: {
      path: manifestPath,
      sourcePath: manifest.sourcePath,
      sourceQuestionCount: manifest.sourceQuestionCount,
      targetPerView: manifest.targetPerView,
      viewCount: manifest.viewCount,
      coveredViews: manifest.coveredViews,
      insufficientViews: manifest.insufficientViews,
      sourceGoldChecksum: manifest.sourceGoldChecksum,
      sourceContractChecksum: manifest.sourceContractChecksum,
      selectedQuestionsChecksum: manifest.selectedQuestionsChecksum,
      checksum: manifest.checksum,
    },
    summary: {
      plannedCases: cases.length,
      completedCases: completedResults.length,
      strictPassed,
      strictFailed: completedResults.length - strictPassed,
      strictAccuracy: ratio(strictPassed, completedResults.length),
      pipelinePassRate: ratio(pipelinePassed, completedResults.length),
      expectedViewHitRate: ratio(expectedViewHits, completedResults.length),
      providerAvailabilityRate: ratio(providerAvailable, completedResults.length),
      sqlGenerationReadyRate: ratio(sqlGenerated, completedResults.length),
      guardPassRate: ratio(guardPassed, completedResults.length),
      databaseExecutionRate: ratio(databaseExecuted, completedResults.length),
      finalAnswerGroundedRate: ratio(groundedAnswers, completedResults.length),
      finalAnswerCompleteRate: ratio(completeAnswers, completedResults.length),
      goldPlanMatchRate: ratio(goldPlanMatched, completedResults.length),
      finalAnswerCorrectRate: ratio(pipelinePassed, completedResults.length),
      noDataRate: ratio(completedResults.filter((item) => item.noData).length, completedResults.length),
      averageMs: average(durations),
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      durationMs: Date.now() - startedAt,
      failureCounts: countBy(completedResults.filter((item) => item.failureCategory), (item) => item.failureCategory ?? 'unknown'),
      failureClassCounts: countBy(completedResults.filter((item) => item.failureClass), (item) => item.failureClass ?? 'unknown'),
    },
    byView: ASK_DATA_FREE_SQL_VIEWS.map((view) => {
      const items = completedResults.filter((item) => item.expectedView === view.viewName);
      return {
        viewName: view.viewName,
        label: view.label,
        plannedCount: cases.filter((item) => item.expectedView === view.viewName).length,
        completedCount: items.length,
        strictPassed: items.filter((item) => item.status === 'pass').length,
        strictAccuracy: ratio(items.filter((item) => item.status === 'pass').length, items.length),
        pipelinePassRate: ratio(items.filter((item) => item.pipelineStatus === 'pass').length, items.length),
        expectedViewHitRate: ratio(items.filter((item) => item.expectedViewHit).length, items.length),
        noDataRate: ratio(items.filter((item) => item.noData).length, items.length),
        averageMs: average(items.map((item) => item.totalMs)),
        failureCounts: countBy(items.filter((item) => item.failureCategory), (item) => item.failureCategory ?? 'unknown'),
      };
    }),
    results: completedResults,
  };
}

function validateManifestSource(input: Manifest) {
  if (!input.sourceGoldChecksum && !input.sourceContractChecksum && !input.selectedQuestionsChecksum && !input.checksum) return;
  if (!input.sourceGoldChecksum || !input.sourceContractChecksum || !input.selectedQuestionsChecksum || !input.checksum) {
    throw new Error('gold_manifest_identity_incomplete');
  }
  const source = JSON.parse(readFileSync(resolve(input.sourcePath), 'utf8')) as {
    checksum?: string;
    queryContracts?: Array<Record<string, unknown>>;
  };
  if (source.checksum !== input.sourceGoldChecksum) throw new Error('gold_manifest_source_checksum_mismatch');
  if ((source.queryContracts?.length ?? 0) !== input.sourceQuestionCount) throw new Error('gold_manifest_source_count_mismatch');
  const sourceContractChecksum = sha256(JSON.stringify((source.queryContracts ?? []).map(contractIdentity)));
  if (sourceContractChecksum !== input.sourceContractChecksum) throw new Error('gold_manifest_contract_checksum_mismatch');
  const selectedQuestionsChecksum = sha256(JSON.stringify(input.selectedQuestions.map(selectedIdentity)));
  if (selectedQuestionsChecksum !== input.selectedQuestionsChecksum) throw new Error('gold_manifest_selected_checksum_mismatch');
  const checksum = sha256(JSON.stringify({
    sourceGoldChecksum: input.sourceGoldChecksum,
    sourceContractChecksum: input.sourceContractChecksum,
    selectedQuestionsChecksum: input.selectedQuestionsChecksum,
  }));
  if (checksum !== input.checksum) throw new Error('gold_manifest_checksum_mismatch');
}

function contractIdentity(item: Record<string, unknown>) {
  return {
    id: item.id,
    checksum: item.checksum,
    split: item.split,
    supportClass: item.supportClass,
    expectedMetricKeys: item.expectedMetricKeys,
    acceptableViews: item.acceptableViews,
    requiredViews: item.requiredViews,
    requiredOutputFields: item.requiredOutputFields,
    requiredResultMode: item.requiredResultMode,
    requiredDimensionKeys: item.requiredDimensionKeys,
    requiredAnswerFacts: item.requiredAnswerFacts,
    runtimeResolutionRequired: item.runtimeResolutionRequired,
    mustClarify: item.mustClarify,
    allowedClarificationSlots: item.allowedClarificationSlots,
    forbiddenClaims: item.forbiddenClaims,
  };
}

function selectedIdentity(item: ManifestQuestion) {
  return {
    id: item.id,
    questionChecksum: item.questionChecksum,
    expectedMetricKeys: item.expectedMetricKeys,
    acceptableViews: item.acceptableViews,
    requiredViews: item.requiredViews,
    requiredOutputFields: item.requiredOutputFields,
    requiredResultMode: item.requiredResultMode,
    requiredAnswerFacts: item.requiredAnswerFacts,
  };
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function sanitizeRows(rows: Array<Record<string, unknown>>) {
  return rows.slice(0, 100).map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        /(phone|openid|idcard|address|password|token|secret)/i.test(key) && value != null
          ? `${String(value).slice(0, 1)}***`
          : value,
      ]),
    ),
  );
}

function isNullOnlyResult(rows: Array<Record<string, unknown>>) {
  return rows.length > 0 && rows.every((row) => Object.values(row).every((value) => value == null));
}

function isGrounded(answer: AskDataAnswer, rows: Array<Record<string, unknown>>, range: string) {
  return isAskDataAnswerGrounded(answer, rows, range);
}

function timeRange(params: Record<string, unknown>, plan?: ReturnType<typeof buildAskDataQueryPlan>) {
  const start = String(params.startAt ?? '').slice(0, 10);
  const end = String(params.endAt ?? '').slice(0, 10);
  if (plan?.timeScopeMode === 'current_snapshot') return '当前状态（不按创建时间裁剪）';
  if (plan?.timeScopeMode === 'active_interval') return `截至 ${end || '当前'} 的生效状态`;
  if (plan?.timeScopeMode === 'none') return '当前汇总视图（不按事件时间裁剪）';
  return start && end ? `${start} 至 ${end}` : '默认近 30 天';
}

function argumentValue(prefix: string) {
  return [...process.argv]
    .reverse()
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function nonNegativeInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback;
}

function ratio(numerator: number, denominator: number) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0;
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1))];
}

function countBy<T>(items: T[], key: (item: T) => string) {
  return Object.fromEntries(
    [...items.reduce((map, item) => map.set(key(item), (map.get(key(item)) ?? 0) + 1), new Map<string, number>())].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    ),
  );
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, run: (item: T, index: number) => Promise<R>) {
  const mapped = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      mapped[index] = await run(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return mapped;
}
