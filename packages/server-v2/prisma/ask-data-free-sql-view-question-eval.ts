import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
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
import {
  ASK_DATA_SQL_GENERATION_SCHEMA,
  buildClarificationRepairMessages,
  buildSqlGenerationMessages,
  buildSqlRepairMessages,
  isRepairableSqlGuardReason,
  shouldRetryClearQuestionClarification,
} from '../src/ask-data-free-sql/ask-data-free-sql.prompts.js';
import type { AskDataAnswer, AskDataSqlGeneration } from '../src/ask-data-free-sql/ask-data-free-sql.types.js';
import { ReadOnlySqlCostGuard } from '../src/read-only-sql-kernel/read-only-sql-cost-guard.js';
import { ReadOnlySqlExecutor } from '../src/read-only-sql-kernel/read-only-sql-executor.js';
import { ReadOnlySqlGuard } from '../src/read-only-sql-kernel/read-only-sql-guard.js';
import { ReadOnlySqlParser } from '../src/read-only-sql-kernel/read-only-sql-parser.js';

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
  selectedQuestions: ManifestQuestion[];
};

type EvalResult = ManifestQuestion & {
  status: string;
  pipelineStatus: string;
  failureCategory?: string;
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
const cases = manifest.selectedQuestions
  .filter((item) => !viewFilter || item.expectedView === viewFilter)
  .filter((item) => !questionIds.size || questionIds.has(item.id))
  .slice(0, limit);
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

writeCheckpoint(true);
const finalReport = buildReport(true);
console.log(JSON.stringify(finalReport, null, 2));
if (strict && finalReport.summary.strictAccuracy < 1) process.exitCode = 1;

async function evaluate(item: ManifestQuestion): Promise<EvalResult> {
  const itemStartedAt = Date.now();
  const legacyCandidateViews = selectAskDataViews(item.question, context);
  const semanticStartedAt = Date.now();
  const semanticRoute = semanticConfig.enabled
    ? await semanticRouter.route({ question: item.question, context, authorizedViews: ASK_DATA_FREE_SQL_VIEWS, config: semanticConfig })
    : undefined;
  const semanticRoutingMs = Date.now() - semanticStartedAt;
  const candidateViews = semanticRoute?.candidateViews.length ? semanticRoute.candidateViews : legacyCandidateViews;
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
    candidateExpectedHit: candidateViewNames.includes(item.expectedView),
    legacyCandidateViews: legacyCandidateViews.map((view) => view.viewName),
    semanticRouteMode: semanticRoute?.routeMode,
    semanticConfidence: semanticRoute?.semanticIntent.confidence,
    semanticMetricKeys: semanticRoute?.semanticIntent.metricKeys,
    semanticRoutingMs,
  };
  let generationMs = 0;
  let guardMs = 0;
  let executionMs = 0;
  let answerMs = 0;
  if (semanticRoute?.clarificationQuestion) {
    return failure(base, {
      status: 'clarification',
      pipelineStatus: 'generation_not_ready',
      failureCategory: 'semantic_clarification',
      failureReason: semanticRoute.clarificationQuestion,
      generationStatus: 'clarification',
      generationMs,
      guardMs,
      executionMs,
      answerMs,
      itemStartedAt,
    });
  }
  try {
    const generationStartedAt = Date.now();
    let generation = await ai.generateStructured<AskDataSqlGeneration>({
      scenario: 'ask_data_free_sql_view_question_eval_generation',
      messages: buildSqlGenerationMessages({
        request: { question: item.question },
        context,
        views: candidateViews,
        semanticIntent: semanticRoute?.semanticIntent,
      }),
      schema: ASK_DATA_SQL_GENERATION_SCHEMA,
      timeoutMs: 20000,
      temperature: 0,
      storeId,
    });
    let generationAttempts = 1;
    if (
      generation.data.status === 'clarification' &&
      (Boolean(semanticRoute?.semanticIntent.metricKeys.length) ||
        shouldRetryClearQuestionClarification(item.question, candidateViews))
    ) {
      generation = await ai.generateStructured<AskDataSqlGeneration>({
        scenario: 'ask_data_free_sql_view_question_eval_clarification_repair',
        messages: buildClarificationRepairMessages({
          request: { question: item.question },
          context,
          views: candidateViews,
          previous: generation.data,
          semanticIntent: semanticRoute?.semanticIntent,
        }),
        schema: ASK_DATA_SQL_GENERATION_SCHEMA,
        timeoutMs: 20000,
        temperature: 0,
        storeId,
      });
      generationAttempts += 1;
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
        ...generation.data.parameters,
        ...(dateRange ? { startAt: dateRange.startAt, endAt: dateRange.endAt } : {}),
      },
    };
    const guardStartedAt = Date.now();
    let guarded = guard.inspect(generation.data.sql, ASK_DATA_FREE_SQL_VIEWS, guardContext);
    if (guarded.status === 'blocked' && isRepairableSqlGuardReason(guarded.reasonCode)) {
      const repairStartedAt = Date.now();
      const repaired = await ai.generateStructured<AskDataSqlGeneration>({
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
        }),
        schema: ASK_DATA_SQL_GENERATION_SCHEMA,
        timeoutMs: 20000,
        temperature: 0,
        storeId,
      });
      generationMs += Date.now() - repairStartedAt;
      generationAttempts += 1;
      if (repaired.data.status === 'ready') {
        generation = repaired;
        guarded = guard.inspect(repaired.data.sql, ASK_DATA_FREE_SQL_VIEWS, {
          ...guardContext,
          parameters: {
            ...repaired.data.parameters,
            ...(dateRange ? { startAt: dateRange.startAt, endAt: dateRange.endAt } : {}),
          },
        });
      }
    }
    guardMs = Date.now() - guardStartedAt;
    if (guarded.status === 'blocked') {
      return failure(base, {
        status: 'guard_blocked',
        pipelineStatus: 'guard_blocked',
        failureCategory: `guard_${guarded.reasonCode}`,
        failureReason: guarded.message,
        generationStatus: generation.data.status,
        generationAttempts,
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
    const expectedViewHit = selectedViews.includes(item.expectedView);
    const executionStartedAt = Date.now();
    const execution = await executor.execute({
      guard: guarded,
      connectionString,
      timeoutMs: 5000,
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

    const rows = sanitizeRows(execution.rows);
    const answerStartedAt = Date.now();
    const answer = await answerService.compose({
      question: item.question,
      explanation: generation.data.explanation,
      rows,
      selectedViews: guarded.selectedViews,
      context,
      timeRange: timeRange(guarded.params),
      truncated: Boolean(execution.truncated),
      assumptions: semanticRoute?.semanticIntent.assumptions,
    });
    answerMs = Date.now() - answerStartedAt;
    const answerGrounded = isGrounded(answer, rows, timeRange(guarded.params));
    const status = expectedViewHit && answerGrounded ? 'pass' : expectedViewHit ? 'answer_not_grounded' : 'expected_view_miss';
    const failureCategory =
      status === 'pass'
        ? undefined
        : status === 'expected_view_miss'
          ? base.candidateExpectedHit
            ? 'model_view_selection_miss'
            : 'candidate_selector_miss'
          : 'answer_not_grounded';
    return {
      ...base,
      status,
      pipelineStatus: answerGrounded ? 'pass' : 'answer_not_grounded',
      failureCategory,
      failureReason:
        status === 'expected_view_miss'
          ? `Expected ${item.expectedView}, selected ${selectedViews.join(', ') || 'none'}`
          : status === 'answer_not_grounded'
            ? 'Answer contains numeric claims not present in query rows or time range.'
            : undefined,
      selectedViews,
      expectedViewHit,
      generationStatus: generation.data.status,
      generationAttempts,
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
      answer: { summary: answer.summary, keyFindings: answer.keyFindings, caveats: answer.caveats },
      redactedSql: guarded.redactedSql,
    };
  } catch (error) {
    return failure(base, {
      status: 'evaluation_failed',
      pipelineStatus: 'evaluation_failed',
      failureCategory: error instanceof Error ? error.name : 'unknown_error',
      failureReason: error instanceof Error ? error.message : String(error),
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
  } as EvalResult;
}

function writeCheckpoint(complete: boolean) {
  writeFileSync(outputPath, `${JSON.stringify(buildReport(complete), null, 2)}\n`);
}

function buildReport(complete: boolean) {
  const completedResults = results.filter(Boolean);
  const strictPassed = completedResults.filter((item) => item.status === 'pass').length;
  const pipelinePassed = completedResults.filter((item) => item.pipelineStatus === 'pass').length;
  const expectedViewHits = completedResults.filter((item) => item.expectedViewHit).length;
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
    },
    summary: {
      plannedCases: cases.length,
      completedCases: completedResults.length,
      strictPassed,
      strictFailed: completedResults.length - strictPassed,
      strictAccuracy: ratio(strictPassed, completedResults.length),
      pipelinePassRate: ratio(pipelinePassed, completedResults.length),
      expectedViewHitRate: ratio(expectedViewHits, completedResults.length),
      noDataRate: ratio(completedResults.filter((item) => item.noData).length, completedResults.length),
      averageMs: average(durations),
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      durationMs: Date.now() - startedAt,
      failureCounts: countBy(completedResults.filter((item) => item.failureCategory), (item) => item.failureCategory ?? 'unknown'),
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

function isGrounded(answer: AskDataAnswer, rows: Array<Record<string, unknown>>, range: string) {
  const evidence = new Set(extractNumbers(`${JSON.stringify(rows)} ${rows.length} ${range}`));
  return extractNumbers([answer.summary, ...answer.keyFindings].join(' ')).every((number) => evidence.has(number));
}

function extractNumbers(value: string) {
  return (value.match(/-?\d+(?:\.\d+)?/g) ?? []).map((item) => String(Number(item)));
}

function timeRange(params: Record<string, unknown>) {
  const start = String(params.startAt ?? '').slice(0, 10);
  const end = String(params.endAt ?? '').slice(0, 10);
  return start && end ? `${start} 至 ${end}` : '默认近 30 天';
}

function argumentValue(prefix: string) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
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
