import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AiService } from '../src/ai/ai.service.js';
import { ASK_DATA_FREE_SQL_VIEWS } from '../src/ask-data-free-sql/ask-data-free-sql.catalog.js';
import { selectAskDataViews } from '../src/ask-data-free-sql/ask-data-free-sql-view-selector.js';
import { resolveAskDataDateRange } from '../src/ask-data-free-sql/ask-data-free-sql.date-range.js';
import { AskDataFreeSqlAnswerService } from '../src/ask-data-free-sql/ask-data-free-sql.answer.service.js';
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

type EvalQuestion = { id: string; domain: string; question: string };
type EvalResult = {
  id: string;
  domain: string;
  status: string;
  executionStatus?: string;
  answerGrounded?: boolean;
  answerModelCalled?: boolean;
  reasonCode?: string;
  reasonMessage?: string;
  rowCount?: number;
  executionMs?: number;
  provider?: string;
  model?: string;
  generationAttempts?: number;
  redactedSql?: string;
};

const strict = process.argv.includes('--strict');
const storeId = positiveInt(argumentValue('--store-id='), 6);
const concurrency = positiveInt(argumentValue('--concurrency='), 2);
const questionId = argumentValue('--question-id=');
const allowDevelopmentAdmin = process.argv.includes('--allow-development-admin');
const dedicatedReadonlyUrl = process.env.ASK_DATA_FREE_SQL_READONLY_DATABASE_URL?.trim();
const developmentAdminUrl = allowDevelopmentAdmin ? process.env.DATABASE_URL?.trim() : undefined;
const connectionString = dedicatedReadonlyUrl || developmentAdminUrl;
const connectionMode = dedicatedReadonlyUrl
  ? 'dedicated_readonly'
  : developmentAdminUrl
    ? 'development_admin'
    : 'unavailable';
const questionPath = resolve(process.cwd(), 'src/ask-data-free-sql/ask-data-free-sql.questions.json');
const questions = JSON.parse(readFileSync(questionPath, 'utf8')) as EvalQuestion[];
const selectedQuestions = questionId ? questions.filter((item) => item.id === questionId) : questions;

if (allowDevelopmentAdmin && process.env.NODE_ENV === 'production') {
  const result = {
    status: 'fail',
    reason: 'development_admin_database_forbidden_in_production',
    questionCount: selectedQuestions.length,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} else if (!connectionString) {
  const result = {
    status: strict ? 'fail' : 'skip',
    reason: 'readonly_database_url_missing',
    questionCount: selectedQuestions.length,
  };
  console.log(JSON.stringify(result, null, 2));
  if (strict) process.exitCode = 1;
} else if (!selectedQuestions.length) {
  throw new Error(`Unknown evaluation question: ${questionId}`);
} else {
  const databaseHost = new URL(connectionString).hostname;
  const prismaAuditStub = { aiAuditLog: { create: async () => ({ id: 0 }) } };
  const ai = new AiService(prismaAuditStub as never, new ConfigService(process.env));
  const parser = new ReadOnlySqlParser();
  const guard = new ReadOnlySqlGuard(parser);
  const costGuard = new ReadOnlySqlCostGuard();
  const executor = new ReadOnlySqlExecutor();
  const context = {
    storeId,
    visibleStoreIds: [storeId],
    permissions: ['*'],
    deniedPermissions: [] as string[],
  };
  const startedAt = Date.now();
  const results = await mapWithConcurrency(selectedQuestions, concurrency, async (item) =>
    evaluateQuestion(item, {
      ai,
      guard,
      costGuard,
      executor,
      context,
      connectionString,
    }),
  );
  const passed = results.filter((item) => item.status === 'pass').length;
  const report = {
    status: passed === results.length ? 'pass' : 'fail',
    strict,
    databaseHost,
    connectionMode,
    questionCount: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length ? Number((passed / results.length).toFixed(4)) : 0,
    durationMs: Date.now() - startedAt,
    answerModelCalls: results.filter((item) => item.answerModelCalled).length,
    results,
  };
  console.log(JSON.stringify(report, null, 2));
  if (strict && report.status !== 'pass') process.exitCode = 1;
}

async function evaluateQuestion(
  item: EvalQuestion,
  input: {
    ai: AiService;
    guard: ReadOnlySqlGuard;
    costGuard: ReadOnlySqlCostGuard;
    executor: ReadOnlySqlExecutor;
    context: { storeId: number; visibleStoreIds: number[]; permissions: string[]; deniedPermissions: string[] };
    connectionString: string;
  },
): Promise<EvalResult> {
  try {
    const candidateViews = selectAskDataViews(item.question, input.context);
    let generation = await input.ai.generateStructured<AskDataSqlGeneration>({
      scenario: 'ask_data_free_sql_live_eval_generation',
      messages: buildSqlGenerationMessages({ request: { question: item.question }, context: input.context, views: candidateViews }),
      schema: ASK_DATA_SQL_GENERATION_SCHEMA,
      timeoutMs: 20000,
      temperature: 0,
      storeId: input.context.storeId,
    });
    let generationAttempts = 1;
    if (generation.data.status === 'clarification' && shouldRetryClearQuestionClarification(item.question, candidateViews)) {
      generation = await input.ai.generateStructured<AskDataSqlGeneration>({
        scenario: 'ask_data_free_sql_live_eval_clarification_repair',
        messages: buildClarificationRepairMessages({
          request: { question: item.question },
          context: input.context,
          views: candidateViews,
          previous: generation.data,
        }),
        schema: ASK_DATA_SQL_GENERATION_SCHEMA,
        timeoutMs: 20000,
        temperature: 0,
        storeId: input.context.storeId,
      });
      generationAttempts = 2;
    }
    if (generation.data.status !== 'ready') {
      return {
        id: item.id,
        domain: item.domain,
        status: generation.data.status,
        reasonCode: generation.data.status,
        provider: generation.provider,
        model: generation.model,
        generationAttempts,
      };
    }
    const resolvedDateRange = resolveAskDataDateRange(item.question);
    const guardContext = {
      storeIds: [input.context.storeId],
      permissions: input.context.permissions,
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
    let guarded = input.guard.inspect(generation.data.sql, ASK_DATA_FREE_SQL_VIEWS, guardContext);
    if (guarded.status === 'blocked' && isRepairableSqlGuardReason(guarded.reasonCode)) {
      const repaired = await input.ai.generateStructured<AskDataSqlGeneration>({
        scenario: 'ask_data_free_sql_live_eval_generation_repair',
        messages: buildSqlRepairMessages({
          request: { question: item.question },
          context: input.context,
          views: candidateViews,
          previous: generation.data,
          reasonCode: guarded.reasonCode,
          reasonMessage: guarded.message,
          redactedSql: guarded.redactedSql ?? '',
        }),
        schema: ASK_DATA_SQL_GENERATION_SCHEMA,
        timeoutMs: 20000,
        temperature: 0,
        storeId: input.context.storeId,
      });
      generationAttempts += 1;
      if (repaired.data.status === 'ready') {
        generation = repaired;
        guarded = input.guard.inspect(repaired.data.sql, ASK_DATA_FREE_SQL_VIEWS, {
          ...guardContext,
          parameters: {
            ...repaired.data.parameters,
            ...(resolvedDateRange ? { startAt: resolvedDateRange.startAt, endAt: resolvedDateRange.endAt } : {}),
          },
        });
      }
    }
    if (guarded.status === 'blocked') {
      return {
        id: item.id,
        domain: item.domain,
        status: 'guard_blocked',
        reasonCode: guarded.reasonCode,
        reasonMessage: guarded.message,
        provider: generation.provider,
        model: generation.model,
        generationAttempts,
        redactedSql: guarded.redactedSql,
      };
    }
    const cost = input.costGuard.inspect(guarded, 100);
    if (cost.status === 'blocked') {
      return {
        id: item.id,
        domain: item.domain,
        status: 'cost_blocked',
        reasonCode: cost.reasonCode,
        reasonMessage: cost.message,
        provider: generation.provider,
        model: generation.model,
        generationAttempts,
        redactedSql: guarded.redactedSql,
      };
    }
    const execution = await input.executor.execute({
      guard: guarded,
      connectionString: input.connectionString,
      timeoutMs: 5000,
      maxRows: 100,
      dryRunOnly: false,
    });
    if (execution.status === 'blocked' || execution.status === 'failed') {
      return {
        id: item.id,
        domain: item.domain,
        status: 'execution_failed',
        executionStatus: execution.status,
        reasonCode: execution.blockedReason,
        rowCount: execution.rows.length,
        executionMs: execution.executionMs,
        provider: generation.provider,
        model: generation.model,
        generationAttempts,
        redactedSql: guarded.redactedSql,
      };
    }
    const rows = sanitizeRows(execution.rows);
    let answerModelCalled = false;
    const answerAi = {
      generateStructured: async <T>(request: Parameters<AiService['generateStructured']>[0]) => {
        answerModelCalled = true;
        return input.ai.generateStructured<T>(request as never);
      },
    } as unknown as AiService;
    const answer = await new AskDataFreeSqlAnswerService(answerAi).compose({
      question: item.question,
      explanation: generation.data.explanation,
      rows,
      selectedViews: guarded.selectedViews,
      context: input.context,
      timeRange: timeRange(guarded.params),
      truncated: Boolean(execution.truncated),
    });
    const answerGrounded = isGrounded(answer, rows, timeRange(guarded.params));
    return {
      id: item.id,
      domain: item.domain,
      status: answerGrounded ? 'pass' : 'answer_not_grounded',
      executionStatus: execution.status,
      answerGrounded,
      answerModelCalled,
      rowCount: rows.length,
      executionMs: execution.executionMs,
      provider: generation.provider,
      model: generation.model,
      generationAttempts,
      redactedSql: guarded.redactedSql,
    };
  } catch (error) {
    return {
      id: item.id,
      domain: item.domain,
      status: 'evaluation_failed',
      reasonCode: error instanceof Error ? error.name : 'unknown_error',
      reasonMessage: error instanceof Error ? error.message : String(error),
    };
  }

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
