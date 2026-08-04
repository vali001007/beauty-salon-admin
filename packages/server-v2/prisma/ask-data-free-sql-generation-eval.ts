import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AiService } from '../src/ai/ai.service.js';
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
import type { AskDataSqlGeneration } from '../src/ask-data-free-sql/ask-data-free-sql.types.js';
import { ReadOnlySqlCostGuard } from '../src/read-only-sql-kernel/read-only-sql-cost-guard.js';
import { ReadOnlySqlGuard } from '../src/read-only-sql-kernel/read-only-sql-guard.js';
import { ReadOnlySqlParser } from '../src/read-only-sql-kernel/read-only-sql-parser.js';

type EvalQuestion = { id: string; domain: string; question: string };

const strict = process.argv.includes('--strict');
const storeId = positiveInt(argumentValue('--store-id='), 6);
const concurrency = positiveInt(argumentValue('--concurrency='), 2);
const questionId = argumentValue('--question-id=');
const questionPath = resolve(process.cwd(), 'src/ask-data-free-sql/ask-data-free-sql.questions.json');
const questions = JSON.parse(readFileSync(questionPath, 'utf8')) as EvalQuestion[];
const selectedQuestions = questionId ? questions.filter((item) => item.id === questionId) : questions;
if (selectedQuestions.length === 0) throw new Error(`Unknown evaluation question: ${questionId}`);

const prismaAuditStub = {
  aiAuditLog: {
    create: async () => ({ id: 0 }),
  },
};
const ai = new AiService(prismaAuditStub as never, new ConfigService(process.env));
const semanticRouter = new AskDataSemanticRouter(ai, new AskDataIntentParser(), new AskDataClarificationPolicy());
const semanticConfig = askDataSemanticRouterConfig();
const parser = new ReadOnlySqlParser();
const guard = new ReadOnlySqlGuard(parser);
const costGuard = new ReadOnlySqlCostGuard();
const context = {
  storeId,
  visibleStoreIds: [storeId],
  permissions: ['*'],
  deniedPermissions: [] as string[],
};

const startedAt = Date.now();
const results = await mapWithConcurrency(selectedQuestions, concurrency, async (item) => {
  const itemStartedAt = Date.now();
  try {
    const semanticRoute = semanticConfig.enabled
      ? await semanticRouter.route({ question: item.question, context, authorizedViews: ASK_DATA_FREE_SQL_VIEWS, config: semanticConfig })
      : undefined;
    if (semanticRoute?.clarificationQuestion) {
      return {
        id: item.id,
        domain: item.domain,
        question: item.question,
        status: 'clarification',
        generationStatus: 'clarification',
        explanation: semanticRoute.clarificationReason,
        clarificationQuestion: semanticRoute.clarificationQuestion,
        semanticIntent: semanticRoute.semanticIntent,
        semanticRouteMode: semanticRoute.routeMode,
        semanticCandidates: [],
        durationMs: Date.now() - itemStartedAt,
      };
    }
    const candidateViews = semanticRoute?.candidateViews.length
      ? semanticRoute.candidateViews
      : selectAskDataViews(item.question, context);
    let generation = await ai.generateStructured<AskDataSqlGeneration>({
      scenario: 'ask_data_free_sql_generation_eval',
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
        scenario: 'ask_data_free_sql_generation_eval_clarification_repair',
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
      generationAttempts = 2;
    }
    const resolvedDateRange = semanticRoute?.semanticIntent.timeRange ?? resolveAskDataDateRange(item.question);
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
        ...(resolvedDateRange ? { startAt: resolvedDateRange.startAt, endAt: resolvedDateRange.endAt } : {}),
      },
    };
    let guarded = guard.inspect(generation.data.sql, ASK_DATA_FREE_SQL_VIEWS, guardContext);
    if (guarded.status === 'blocked' && isRepairableSqlGuardReason(guarded.reasonCode)) {
      const repaired = await ai.generateStructured<AskDataSqlGeneration>({
        scenario: 'ask_data_free_sql_generation_eval_repair',
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
      generationAttempts += 1;
      if (repaired.data.status === 'ready') {
        generation = repaired;
        guarded = guard.inspect(repaired.data.sql, ASK_DATA_FREE_SQL_VIEWS, {
          ...guardContext,
          parameters: {
            ...repaired.data.parameters,
            ...(resolvedDateRange ? { startAt: resolvedDateRange.startAt, endAt: resolvedDateRange.endAt } : {}),
          },
        });
      }
    }
    const cost = guarded.status === 'pass' ? costGuard.inspect(guarded, 100) : undefined;
    const status =
      generation.data.status !== 'ready'
        ? generation.data.status
        : guarded.status === 'blocked'
          ? 'guard_blocked'
          : cost?.status === 'blocked'
            ? 'cost_blocked'
            : 'pass';
    const result = {
      id: item.id,
      domain: item.domain,
      question: item.question,
      status,
      generationStatus: generation.data.status,
      explanation: generation.data.explanation,
      reasonCode:
        guarded.status === 'blocked' ? guarded.reasonCode : cost?.status === 'blocked' ? cost.reasonCode : undefined,
      reasonMessage:
        guarded.status === 'blocked' ? guarded.message : cost?.status === 'blocked' ? cost.message : undefined,
      selectedViews: guarded.status === 'pass' ? guarded.selectedViews.map((view) => view.viewName) : [],
      redactedSql: guarded.redactedSql,
      sqlFingerprint: guarded.sqlFingerprint,
      estimatedCost: cost?.estimatedCost,
      provider: generation.provider,
      model: generation.model,
      usage: generation.usage,
      generationAttempts,
      semanticIntent: semanticRoute?.semanticIntent,
      semanticRouteMode: semanticRoute?.routeMode,
      semanticCandidates: semanticRoute?.candidateViews.map((view) => view.viewName),
      durationMs: Date.now() - itemStartedAt,
    };
    console.error(`[ask-data-eval] ${item.id} ${status}`);
    return result;
  } catch (error) {
    const result = {
      id: item.id,
      domain: item.domain,
      question: item.question,
      status: 'generation_failed',
      reasonCode: error instanceof Error ? error.name : 'unknown_error',
      message: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - itemStartedAt,
    };
    console.error(`[ask-data-eval] ${item.id} generation_failed`);
    return result;
  }
});

const passed = results.filter((item) => item.status === 'pass').length;
const summary = {
  status: passed === results.length ? 'pass' : 'fail',
  strict,
  questionCount: results.length,
  passed,
  failed: results.length - passed,
  passRate: results.length ? Number((passed / results.length).toFixed(4)) : 0,
  durationMs: Date.now() - startedAt,
  results,
};
console.log(JSON.stringify(summary, null, 2));
if (strict && summary.status !== 'pass') process.exitCode = 1;

function argumentValue(prefix: string) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await run(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
