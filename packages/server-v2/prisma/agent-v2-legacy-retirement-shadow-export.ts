import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { PrismaClient } from '@prisma/client';

type JsonRecord = Record<string, unknown>;

type ExportOptions = {
  dryRun: boolean;
  readDb: boolean;
  start: Date;
  end: Date;
  days: number;
  storeId?: number;
  limit: number;
  outputPath: string;
  environment: string;
  regressionFile?: string;
  rollback: {
    verified?: boolean;
    lastVerifiedAt?: string;
    method?: string;
    notes?: string;
  };
};

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const defaultOutputPath = resolve(docsRoot, 'agent-v2-shadow-evidence-export.json');

async function main() {
  if (hasArg('--help')) {
    printHelp();
    return;
  }

  const options = parseOptions();
  const plan = {
    generatedAt: formatShanghaiTime(new Date()),
    mode: options.dryRun ? 'dry_run' : 'read_db_export',
    readDb: options.readDb,
    window: `${options.start.toISOString()} ~ ${options.end.toISOString()}`,
    storeId: options.storeId ?? null,
    limit: options.limit,
    output: relativePath(options.outputPath),
    environment: options.environment,
  };

  if (options.dryRun) {
    console.log(JSON.stringify({
      ...plan,
      recommendation: 'dry-run 只展示导出计划，不连接数据库，不写文件。正式导出需显式增加 --read-db。',
    }, null, 2));
    return;
  }

  if (!options.readDb) {
    console.error('Refusing to read database without --read-db. Use --dry-run to inspect the plan first.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const exportData = await exportShadowEvidence(prisma, options);
    writeJson(options.outputPath, exportData);
    console.log(JSON.stringify({
      ...plan,
      runs: exportData.runs.length,
      auditDetails: exportData.auditDetails.length,
      toolCalls: exportData.toolCalls.length,
      feedbacks: exportData.feedbacks.length,
      output: relativePath(options.outputPath),
      recommendation: '已导出只读 shadow 证据 JSON；下一步运行 agent-v2:legacy-retirement-shadow-evidence 聚合 candidate。',
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

async function exportShadowEvidence(prisma: PrismaClient, options: ExportOptions) {
  const runWhere = {
    createdAt: { gte: options.start, lt: options.end },
    ...(options.storeId ? { storeId: options.storeId } : {}),
  };
  const runs = await prisma.agentRun.findMany({
    where: runWhere,
    orderBy: { createdAt: 'asc' },
    take: options.limit,
    select: {
      id: true,
      runNo: true,
      storeId: true,
      userId: true,
      role: true,
      entrypoint: true,
      agentCode: true,
      personaCode: true,
      status: true,
      planJson: true,
      contextJson: true,
      evidenceJson: true,
      resultJson: true,
      errorMessage: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const runIds = runs.map((run) => run.id);
  const [auditDetails, toolCalls, feedbacks] = runIds.length
    ? await Promise.all([
        prisma.agentRunAuditDetail.findMany({
          where: { runId: { in: runIds } },
          orderBy: { createdAt: 'asc' },
          select: {
            runId: true,
            storeId: true,
            userId: true,
            role: true,
            entrypoint: true,
            agentCode: true,
            personaCode: true,
            question: true,
            status: true,
            capabilityId: true,
            llmPromptJson: true,
            llmResponseJson: true,
            capabilityMappingJson: true,
            latencyBreakdownJson: true,
            costJson: true,
            riskJson: true,
            errorCode: true,
            errorMessage: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.agentToolCall.findMany({
          where: { runId: { in: runIds } },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            runId: true,
            toolName: true,
            riskLevel: true,
            status: true,
            resultJson: true,
            approvalId: true,
            latencyMs: true,
            createdAt: true,
            completedAt: true,
          },
        }),
        prisma.agentFeedback.findMany({
          where: { runId: { in: runIds } },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            runId: true,
            userId: true,
            storeId: true,
            rating: true,
            adopted: true,
            createdAt: true,
          },
        }),
      ])
    : [[], [], []];

  return {
    generatedAt: formatShanghaiTime(new Date()),
    source: {
      environment: options.environment,
      window: `${options.start.toISOString()} ~ ${options.end.toISOString()}`,
      exportedBy: 'agent-v2-legacy-retirement-shadow-export',
      redaction: 'Only evidence fields are exported. Raw user input, comments, tool args, and full LLM prompt/response bodies are omitted.',
      storeId: options.storeId ?? null,
    },
    runs: runs.map((run) => safeRun(run)),
    auditDetails: auditDetails.map((detail) => safeAuditDetail(detail)),
    toolCalls: toolCalls.map((toolCall) => safeToolCall(toolCall)),
    feedbacks: feedbacks.map((feedback) => ({
      id: feedback.id,
      runId: feedback.runId,
      userId: feedback.userId,
      storeId: feedback.storeId,
      rating: feedback.rating,
      adopted: feedback.adopted,
      createdAt: feedback.createdAt,
    })),
    regressions: readRegressionFile(options.regressionFile),
    rollback: options.rollback,
  };
}

function safeRun(run: JsonRecord) {
  return {
    id: run.id,
    runId: run.id,
    runNo: run.runNo,
    storeId: run.storeId,
    userId: run.userId,
    role: run.role,
    entrypoint: run.entrypoint,
    agentCode: run.agentCode,
    personaCode: run.personaCode,
    status: run.status,
    mode: extractMode(run),
    finalEngine: extractFinalEngine(run),
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    updatedAt: run.updatedAt,
    errorMessage: redactMessage(run.errorMessage),
  };
}

function safeAuditDetail(detail: JsonRecord) {
  const llmPromptObserved = Boolean(detail.llmPromptJson);
  const llmResponse = asRecord(detail.llmResponseJson);
  const latency = extractLlmLatency(detail);
  return {
    runId: detail.runId,
    storeId: detail.storeId,
    userId: detail.userId,
    role: detail.role,
    entrypoint: detail.entrypoint,
    agentCode: detail.agentCode,
    personaCode: detail.personaCode,
    status: detail.status,
    capabilityId: detail.capabilityId,
    mode: extractMode(detail),
    finalEngine: extractFinalEngine(detail),
    llmPromptJson: llmPromptObserved ? { observed: true } : null,
    llmResponseJson: llmResponse ? {
      observed: true,
      status: llmResponse.status ?? llmResponse.finishReason ?? llmResponse.stopReason ?? 'observed',
      error: Boolean(llmResponse.error || detail.errorCode || detail.errorMessage),
    } : null,
    llmLatencyMs: latency,
    latencyBreakdownJson: pickLatency(detail.latencyBreakdownJson),
    costJson: pickCost(detail.costJson),
    riskJson: pickRisk(detail.riskJson),
    errorCode: detail.errorCode,
    errorMessage: redactMessage(detail.errorMessage),
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  };
}

function safeToolCall(toolCall: JsonRecord) {
  return {
    id: toolCall.id,
    runId: toolCall.runId,
    toolName: toolCall.toolName,
    riskLevel: toolCall.riskLevel,
    status: toolCall.status,
    approvalId: toolCall.approvalId,
    latencyMs: toolCall.latencyMs,
    resultJson: pickToolResult(toolCall.resultJson),
    createdAt: toolCall.createdAt,
    completedAt: toolCall.completedAt,
  };
}

function parseOptions(): ExportOptions {
  const days = readNumberArg('--days', 7);
  const now = new Date();
  const end = parseDateArg('--end') ?? now;
  const start = parseDateArg('--start') ?? new Date(end.getTime() - days * 86_400_000);
  return {
    dryRun: hasArg('--dry-run'),
    readDb: hasArg('--read-db'),
    start,
    end,
    days,
    storeId: readNumberArg('--store-id'),
    limit: readNumberArg('--limit', 5000),
    outputPath: resolveUserPath(readArg('--output') ?? defaultOutputPath),
    environment: readArg('--environment') ?? 'local_or_staging',
    regressionFile: readArg('--regression-file'),
    rollback: {
      verified: hasArg('--rollback-verified') ? true : undefined,
      lastVerifiedAt: readArg('--rollback-at'),
      method: readArg('--rollback-method'),
      notes: readArg('--rollback-notes'),
    },
  };
}

function extractMode(value: JsonRecord) {
  return String(
    value.mode ??
    value.grayMode ??
    value.agentV2GrayMode ??
    getNested(value, ['contextJson', 'agentV2GrayMode']) ??
    getNested(value, ['contextJson', 'grayMode']) ??
    getNested(value, ['planJson', 'strategy', 'mode']) ??
    getNested(value, ['resultJson', 'strategy', 'mode']) ??
    getNested(value, ['capabilityMappingJson', 'strategy', 'mode']) ??
    getNested(value, ['capabilityMappingJson', 'mode']) ??
    'unknown',
  );
}

function extractFinalEngine(value: JsonRecord) {
  return String(
    value.finalEngine ??
    getNested(value, ['planJson', 'strategy', 'finalEngine']) ??
    getNested(value, ['resultJson', 'strategy', 'finalEngine']) ??
    getNested(value, ['capabilityMappingJson', 'strategy', 'finalEngine']) ??
    getNested(value, ['capabilityMappingJson', 'finalEngine']) ??
    'unknown',
  );
}

function extractLlmLatency(value: JsonRecord) {
  const candidates = [
    value.llmLatencyMs,
    getNested(value, ['latencyBreakdownJson', 'llmLatencyMs']),
    getNested(value, ['latencyBreakdownJson', 'llmMs']),
    getNested(value, ['latencyBreakdownJson', 'intentExtraction', 'llmLatencyMs']),
    getNested(value, ['llmResponseJson', 'latencyMs']),
    getNested(value, ['costJson', 'latencyMs']),
  ];
  for (const candidate of candidates) {
    const parsed = toFiniteNumber(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function pickLatency(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;
  return pick(record, ['llmLatencyMs', 'llmMs', 'intentExtraction', 'totalMs', 'durationMs']);
}

function pickCost(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;
  return pick(record, ['cost', 'costAmount', 'costCny', 'costUsd', 'promptTokens', 'completionTokens', 'totalTokens', 'latencyMs']);
}

function pickRisk(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;
  return pick(record, ['riskLevel', 'highRiskAutoExecution', 'policy', 'status']);
}

function pickToolResult(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;
  return pick(record, ['status', 'riskLevel', 'approvalId', 'errorCode', 'errorMessage']);
}

function pick(record: JsonRecord, keys: string[]) {
  return Object.fromEntries(keys.filter((key) => record[key] !== undefined).map((key) => [key, record[key]]));
}

function readRegressionFile(path: string | undefined) {
  if (!path) return [];
  const resolved = resolveUserPath(path);
  if (!existsSync(resolved)) return [];
  const parsed = JSON.parse(readFileSync(resolved, 'utf8'));
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.regressions) ? parsed.regressions : [];
}

function getNested(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function toFiniteNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function redactMessage(value: unknown) {
  if (!value) return undefined;
  return String(value).slice(0, 160);
}

function readArg(name: string) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function readNumberArg(name: string, fallback?: number) {
  const value = readArg(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDateArg(name: string) {
  const value = readArg(name);
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${name}: ${value}`);
  return date;
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function resolveUserPath(path: string) {
  if (resolve(path) === path) return path;
  return resolve(workspaceRoot, path);
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function relativePath(path: string) {
  return relative(workspaceRoot, path).replace(/\\/g, '/');
}

function formatShanghaiTime(date: Date) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} Asia/Shanghai`;
}

function printHelp() {
  console.log([
    'Usage:',
    '  npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-shadow-export -- --dry-run',
    '  npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-shadow-export -- --read-db --days 7 --environment staging',
    '',
    'Options:',
    '  --dry-run                 Show export plan only. No database read, no file write.',
    '  --read-db                 Explicitly allow read-only Prisma queries.',
    '  --start <iso>             Inclusive createdAt lower bound.',
    '  --end <iso>               Exclusive createdAt upper bound. Defaults to now.',
    '  --days <n>                Window size when --start is omitted. Defaults to 7.',
    '  --store-id <id>           Optional store filter.',
    '  --limit <n>               Max AgentRun rows. Defaults to 5000.',
    '  --output <path>           Defaults to docs/.../agent-v2-shadow-evidence-export.json.',
    '  --environment <name>      local, staging, production, etc.',
    '  --regression-file <path>  Optional JSON array or { regressions: [] }.',
    '  --rollback-verified --rollback-at <iso> --rollback-method <text> --rollback-notes <text>',
    '',
    '说明：脚本只读 AgentRun / AgentRunAuditDetail / AgentToolCall / AgentFeedback；默认拒绝连库。',
  ].join('\n'));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
