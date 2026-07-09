import 'reflect-metadata';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AiService } from '../src/ai/ai.service.js';
import { AiModule } from '../src/ai/ai.module.js';
import { AgentModule } from '../src/agent/agent.module.js';
import { AgentOrchestratorService } from '../src/agent/agent-orchestrator.service.js';
import type { AgentActor, AgentRole, AgentRunResult, AuraResponseBlock } from '../src/agent/agent.types.js';
import {
  annotateQuestionBankCoverage,
  parseAgentEvalQuestionMarkdown,
  type AgentEvalQuestionCase,
  type AgentQuestionBankPersona,
  type AgentQuestionOutputKind,
} from '../src/agent/agent-eval-question-bank.js';
import { AgentV2OrchestratorService } from '../src/agent-v2/agent-v2-orchestrator.service.js';
import { AgentV2Module } from '../src/agent-v2/agent-v2.module.js';
import { AgentV3OrchestratorService } from '../src/agent-v3/agent-v3-orchestrator.service.js';
import { AgentV3Module } from '../src/agent-v3/agent-v3.module.js';
import { AgentV4OrchestratorService } from '../src/agent-v4/agent-v4-orchestrator.service.js';
import { AgentV4Module } from '../src/agent-v4/agent-v4.module.js';
import { AgentV5OrchestratorService } from '../src/agent-v5/agent-v5-orchestrator.service.js';
import { AgentV5Module } from '../src/agent-v5/agent-v5.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AiModule,
    AgentModule,
    AgentV2Module,
    AgentV3Module,
    AgentV4Module,
    AgentV5Module,
  ],
})
class AgentAllVersionEvalModule {}

type AgentEvalVersion = 'ami_ai' | 'agent_v1' | 'agent_v2' | 'agent_v3' | 'agent_v4' | 'agent_v5';

type EvalStatus =
  | 'usable'
  | 'completed_no_signal'
  | 'failed'
  | 'blocked'
  | 'no_data'
  | 'clarify'
  | 'unsupported'
  | 'environment_blocked';

type OutputSignals = {
  hasAnswer: boolean;
  hasEvidence: boolean;
  hasTable: boolean;
  hasAction: boolean;
  hasStructuredBlocks: boolean;
  hasTrace: boolean;
  hasChineseHeaders: boolean;
  hasTimeRange: boolean;
  matchedExpectedOutputKinds: AgentQuestionOutputKind[];
};

type EvalRunRecord = {
  questionId: string;
  sourceSection: string;
  sourceCategory: string;
  sourceIndex: number;
  persona: AgentQuestionBankPersona;
  role: AgentRole;
  question: string;
  expectedOutputKinds: AgentQuestionOutputKind[];
  systemSupportStatus: string;
  systemSupportReason: string;
  coverageStage: string;
  version: AgentEvalVersion;
  status: EvalStatus;
  runtimeStatus?: string;
  latencyMs: number;
  runId?: number;
  runNo?: string;
  answerSummary: string;
  outputSignals: OutputSignals;
  failureReason?: string;
  error?: string;
  evidence?: unknown;
  trace?: unknown;
};

type EvalOptions = {
  limit?: number;
  persona?: AgentQuestionBankPersona;
  versions: AgentEvalVersion[];
  storeId: number;
  outputDir: string;
  concurrency: number;
  fromResults?: string;
};

type ServiceBag = {
  prisma: PrismaService;
  ai: AiService;
  agentV1: AgentOrchestratorService;
  agentV2: AgentV2OrchestratorService;
  agentV3: AgentV3OrchestratorService;
  agentV4: AgentV4OrchestratorService;
  agentV5: AgentV5OrchestratorService;
};

const ALL_VERSIONS: AgentEvalVersion[] = ['ami_ai', 'agent_v1', 'agent_v2', 'agent_v3', 'agent_v4', 'agent_v5'];
const REPO_ROOT = resolveRepoRoot();
const DEFAULT_QUESTION_FILE = resolve(
  REPO_ROOT,
  'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-eval-questions.md',
);
const DEFAULT_OUTPUT_DIR = resolve(REPO_ROOT, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const DEFAULT_RESULTS_FILE = 'agent-v5-eval-results-2026-07-08.json';
const DEFAULT_REPORT_FILE = 'agent-v5-eval-report-2026-07-08.md';

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.fromResults) {
    await regenerateReportFromResults(options);
    return;
  }
  const markdown = readFileSync(DEFAULT_QUESTION_FILE, 'utf8');
  const bank = parseAgentEvalQuestionMarkdown(markdown);
  let questions = annotateQuestionBankCoverage(bank.questions);
  if (options.persona) questions = questions.filter((item) => item.persona === options.persona);
  if (options.limit && options.limit > 0) questions = questions.slice(0, options.limit);

  ensureDir(options.outputDir);
  console.log(
    `[agent-all-version-eval] questions=${questions.length} versions=${options.versions.join(',')} storeId=${options.storeId} concurrency=${options.concurrency}`,
  );
  if (options.concurrency !== 1) {
    console.warn('[agent-all-version-eval] 当前默认强制串行执行；concurrency 参数仅保留用于后续扩展。');
  }

  const app = await NestFactory.createApplicationContext(AgentAllVersionEvalModule, { logger: ['error', 'warn'] });
  try {
    const services: ServiceBag = {
      prisma: app.get(PrismaService, { strict: false }),
      ai: app.get(AiService, { strict: false }),
      agentV1: app.get(AgentOrchestratorService, { strict: false }),
      agentV2: app.get(AgentV2OrchestratorService, { strict: false }),
      agentV3: app.get(AgentV3OrchestratorService, { strict: false }),
      agentV4: app.get(AgentV4OrchestratorService, { strict: false }),
      agentV5: app.get(AgentV5OrchestratorService, { strict: false }),
    };
    const runtimeStoreId = await resolveRuntimeStoreId(services.prisma, options.storeId);
    const runOptions = { ...options, storeId: runtimeStoreId };
    if (runtimeStoreId !== options.storeId) {
      console.warn(`[agent-all-version-eval] requested storeId=${options.storeId} 不存在，已切换到本地可用 storeId=${runtimeStoreId}`);
    }

    const startedAt = new Date();
    const records: EvalRunRecord[] = [];
    const total = questions.length * options.versions.length;
    let current = 0;
    for (const question of questions) {
      for (const version of options.versions) {
        current += 1;
        const record = await runOne(question, version, runOptions, services);
        records.push(record);
        const marker = `[${current}/${total}] ${version} ${question.id} ${record.status} ${record.latencyMs}ms`;
        if (record.status === 'usable' || record.status === 'completed_no_signal' || record.status === 'no_data') {
          console.log(marker);
        } else {
          console.warn(`${marker} ${record.failureReason ?? record.error ?? ''}`.trim());
        }
      }
    }

    const finishedAt = new Date();
    const payload = {
      metadata: {
        generatedAt: finishedAt.toISOString(),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        sourceFile: DEFAULT_QUESTION_FILE,
        questionCount: questions.length,
        plannedRunCount: total,
        actualRunCount: records.length,
        versions: options.versions,
        persona: options.persona ?? 'all',
        requestedStoreId: options.storeId,
        storeId: runOptions.storeId,
        scoring: {
          usable: 'completed + 有回答/证据/表格/动作/结构化 block/trace 之一',
          failedBlockedNoDataClarifyUnsupported: '单独分类，不简单记为全失败',
          amiAi: '只评估兜底可读性和业务相关性，不作为事实型主链路',
        },
      },
      summary: buildSummary(records),
      records,
    };

    const resultsPath = resolve(options.outputDir, DEFAULT_RESULTS_FILE);
    const reportPath = resolve(options.outputDir, DEFAULT_REPORT_FILE);
    writeFileSync(resultsPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    writeFileSync(reportPath, buildMarkdownReport(payload), 'utf8');
    console.log(`[agent-all-version-eval] results=${resultsPath}`);
    console.log(`[agent-all-version-eval] report=${reportPath}`);
  } finally {
    await app.close();
  }
}

async function runOne(
  question: AgentEvalQuestionCase,
  version: AgentEvalVersion,
  options: EvalOptions,
  services: ServiceBag,
): Promise<EvalRunRecord> {
  const started = performance.now();
  const base = buildBaseRecord(question, version);
  try {
    const actor = buildActor(question, options.storeId, version);
    const context = buildEvalContext(question, version);
    if (version === 'ami_ai') {
      const result = await runAmiAi(question, actor, context, services);
      const latencyMs = Math.round(performance.now() - started);
      return classifyRecord({
        ...base,
        latencyMs,
        runId: result.runId,
        runNo: result.runNo,
        runtimeStatus: result.runtimeStatus,
        answerSummary: summarize(result.answer),
        outputSignals: detectSignals(result, question.expectedOutputKinds ?? []),
        failureReason: result.failureReason,
        evidence: result.evidence,
        trace: result.trace,
      });
    }

    const result = await runAgentVersion(version, question.input, actor, context, services);
    const latencyMs = Math.round(performance.now() - started);
    return classifyRecord({
      ...base,
      latencyMs,
      runId: result.runId,
      runNo: result.runNo,
      runtimeStatus: result.status,
      answerSummary: summarize(result.answer),
      outputSignals: detectSignals(result, question.expectedOutputKinds ?? []),
      failureReason: result.status === 'failed' ? result.answer : undefined,
      evidence: result.evidence,
      trace: extractTrace(result),
    });
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started);
    const message = errorMessage(error);
    return {
      ...base,
      status: isEnvironmentError(message) ? 'environment_blocked' : 'failed',
      runtimeStatus: 'failed',
      latencyMs,
      answerSummary: '',
      outputSignals: emptySignals(question.expectedOutputKinds ?? []),
      failureReason: message,
      error: message,
    };
  }
}

async function runAgentVersion(
  version: Exclude<AgentEvalVersion, 'ami_ai'>,
  message: string,
  actor: AgentActor,
  context: Record<string, unknown>,
  services: ServiceBag,
) {
  if (version === 'agent_v1') return services.agentV1.createRun({ message, actor, context });
  if (version === 'agent_v2') return services.agentV2.createRun({ message, actor, context });
  if (version === 'agent_v3') return services.agentV3.createRun({ message, actor, context });
  if (version === 'agent_v4') return services.agentV4.createRun({ message, actor, context });
  return services.agentV5.createRun({ message, actor, context });
}

async function runAmiAi(
  question: AgentEvalQuestionCase,
  actor: AgentActor,
  context: Record<string, unknown>,
  services: ServiceBag,
) {
  const startedAt = new Date();
  const runNo = `ar_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const systemPrompt =
    '你是 Ami AI 兜底问答助手。请用中文回答美容门店经营问题。只能基于通用业务常识和用户问题作答；没有真实数据时必须明确说明缺少数据，不要编造客户、员工、订单、金额或库存。';
  const aiResult = await services.ai.chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question.input },
    ],
    actor.userId,
    actor.storeId,
  );
  const text = normalizeAiText(aiResult);
  const blocked = Boolean((aiResult as any)?.safety?.blocked);
  const status = blocked ? 'failed' : 'completed';
  const completedAt = new Date();
  const run = await (services.prisma as any).agentRun.create({
    data: {
      runNo,
      storeId: actor.storeId,
      userId: actor.userId,
      deviceId: actor.deviceId,
      role: actor.role,
      entrypoint: actor.entrypoint,
      agentCode: 'ami_ai',
      personaCode: actor.personaCode,
      status,
      userInput: question.input,
      contextJson: toJson(context),
      resultJson: toJson({
        answer: text,
        aiResult,
        architecture: 'ami_ai_fallback',
        evalQuestionId: question.id,
      }),
      errorMessage: blocked ? text : null,
      startedAt,
      completedAt,
    },
  });
  await (services.prisma as any).agentMessage.createMany({
    data: [
      {
        runId: run.id,
        role: 'user',
        content: question.input,
        metadata: toJson({ entrypoint: actor.entrypoint, personaCode: actor.personaCode, evalQuestionId: question.id }),
      },
      {
        runId: run.id,
        role: 'assistant',
        content: text,
        metadata: toJson({ architecture: 'ami_ai_fallback', safety: (aiResult as any)?.safety }),
      },
    ],
  });
  return {
    runId: Number(run.id),
    runNo: String(run.runNo),
    runtimeStatus: String(run.status),
    answer: text,
    evidence: undefined,
    trace: { aiAudit: true, scenario: (aiResult as any)?.scenario, usage: (aiResult as any)?.usage },
    failureReason: blocked ? text : undefined,
  };
}

function buildBaseRecord(question: AgentEvalQuestionCase, version: AgentEvalVersion): Omit<
  EvalRunRecord,
  'status' | 'latencyMs' | 'answerSummary' | 'outputSignals'
> {
  return {
    questionId: question.id,
    sourceSection: question.sourceSection,
    sourceCategory: question.sourceCategory,
    sourceIndex: question.sourceIndex,
    persona: question.persona,
    role: question.evalRole,
    question: question.input,
    expectedOutputKinds: question.expectedOutputKinds ?? [],
    systemSupportStatus: question.systemSupportStatus,
    systemSupportReason: question.systemSupportReason,
    coverageStage: question.coverageStage,
    version,
  };
}

function buildActor(question: AgentEvalQuestionCase, storeId: number, version: AgentEvalVersion): AgentActor {
  return {
    storeId,
    userId: 1,
    role: question.evalRole,
    entrypoint: 'agent-all-version-eval',
    personaCode: question.persona === 'edge' ? 'manager' : question.persona,
    permissions: ['*'],
    fieldScopes: {},
    deviceId: undefined,
  };
}

function buildEvalContext(question: AgentEvalQuestionCase, version: AgentEvalVersion) {
  return {
    evalRun: true,
    evalSource: 'agent-all-version-eval',
    evalQuestionId: question.id,
    evalPersona: question.persona,
    evalSection: question.sourceSection,
    evalCategory: question.sourceCategory,
    expectedOutputKinds: question.expectedOutputKinds ?? [],
    systemSupportStatus: question.systemSupportStatus,
    ...(version === 'agent_v3' ? { agentV3Mode: 'execute' } : {}),
    ...(version === 'agent_v4' ? { agentV4Mode: 'execute', boundary: 'drafts_and_approval_only' } : {}),
    ...(version === 'agent_v5' ? { agentV5Mode: 'execute', boundary: 'drafts_followups_and_approval_only' } : {}),
  };
}

function classifyRecord(record: Omit<EvalRunRecord, 'status'>): EvalRunRecord {
  const text = `${record.answerSummary} ${record.failureReason ?? ''}`.toLowerCase();
  const runtimeStatus = String(record.runtimeStatus ?? '').toLowerCase();
  const signals = record.outputSignals;
  if (runtimeStatus === 'failed') {
    return {
      ...record,
      status: isEnvironmentError(record.failureReason ?? record.answerSummary) ? 'environment_blocked' : 'failed',
    };
  }
  if (/无法生成安全查询计划|未能生成安全查询|安全查询计划|blocked|阻断|权限|guard|sql guard/.test(text)) {
    return { ...record, status: 'blocked' };
  }
  if (/no_data|暂无数据|没有匹配|没有查询到|无匹配|当前筛选范围内没有/.test(text)) return { ...record, status: 'no_data' };
  if (/clarify|澄清|请补充|需要明确|请选择|请先说明|请提供|需要你提供/.test(text)) return { ...record, status: 'clarify' };
  if (/unsupported|暂不支持|不支持|未命中|无法处理/.test(text)) return { ...record, status: 'unsupported' };
  if (
    signals.hasAnswer ||
    signals.hasEvidence ||
    signals.hasTable ||
    signals.hasAction ||
    signals.hasStructuredBlocks ||
    signals.hasTrace
  ) {
    return { ...record, status: 'usable' };
  }
  return { ...record, status: 'completed_no_signal' };
}

function detectSignals(result: Partial<AgentRunResult> & Record<string, any>, expected: AgentQuestionOutputKind[]): OutputSignals {
  const renderedBlocks = Array.isArray(result.renderedBlocks) ? (result.renderedBlocks as AuraResponseBlock[]) : [];
  const blockKinds = new Set(renderedBlocks.map((block) => block.kind));
  const answer = String(result.answer ?? '');
  const evidence = result.evidence;
  const hasTable = blockKinds.has('table') || /<table|表格|rows|columns/i.test(JSON.stringify(result).slice(0, 4000));
  const hasAction =
    (Array.isArray(result.actions) && result.actions.length > 0) ||
    blockKinds.has('action_card') ||
    blockKinds.has('confirm_action') ||
    blockKinds.has('activity_draft_card');
  const hasEvidence =
    Boolean(evidence) || blockKinds.has('evidence_panel') || /evidence|source|数据来源|证据|sourceTables/i.test(JSON.stringify(result).slice(0, 4000));
  const hasTrace = /queryTrace|trace|auditRunId|sqlSummaries|toolResults|capability/i.test(JSON.stringify(result).slice(0, 4000));
  const hasTimeRange = /近|最近|本周|上周|本月|上月|今天|昨天|dateRange|timeRange|日期范围/.test(JSON.stringify(result).slice(0, 4000));
  const hasChineseHeaders =
    renderedBlocks.some((block) => block.kind === 'table' && block.columns.some((column) => /[\u4e00-\u9fa5]/.test(column))) ||
    /[\u4e00-\u9fa5]/.test(answer);
  const matchedExpectedOutputKinds = expected.filter((kind) => {
    if (kind === 'text') return answer.trim().length > 0;
    if (kind === 'table') return hasTable;
    if (kind === 'action_card') return hasAction;
    if (kind === 'evidence') return hasEvidence;
    if (kind === 'clarify') return blockKinds.has('clarification_card') || /澄清|补充|明确/.test(answer);
    if (kind === 'kpi') return blockKinds.has('kpi_card') || /¥|\d+(\.\d+)?%|订单|客户|库存|营业额/.test(answer);
    if (kind === 'chart') return blockKinds.has('chart') || /趋势|同比|环比/.test(answer);
    return false;
  });
  return {
    hasAnswer: answer.trim().length > 0,
    hasEvidence,
    hasTable,
    hasAction,
    hasStructuredBlocks: renderedBlocks.length > 0,
    hasTrace,
    hasChineseHeaders,
    hasTimeRange,
    matchedExpectedOutputKinds,
  };
}

function emptySignals(expected: AgentQuestionOutputKind[]): OutputSignals {
  return {
    hasAnswer: false,
    hasEvidence: false,
    hasTable: false,
    hasAction: false,
    hasStructuredBlocks: false,
    hasTrace: false,
    hasChineseHeaders: false,
    hasTimeRange: false,
    matchedExpectedOutputKinds: expected.filter(() => false),
  };
}

function extractTrace(result: AgentRunResult) {
  return {
    toolResults: result.toolResults?.map((item) => ({ status: item.status, title: item.title, evidence: item.evidence })),
    routeDecision: result.routeDecision,
    answerContract: result.answerContract,
    phaseOutputs: result.phaseOutputs?.map((item) => ({ phase: item.phase, title: item.title, blockKinds: item.blockKinds })),
  };
}

function buildSummary(records: EvalRunRecord[]) {
  return {
    byVersion: groupSummary(records, (item) => item.version),
    byPersona: groupSummary(records, (item) => item.persona),
    byCategory: groupSummary(records, (item) => item.sourceCategory),
    byVersionCategory: groupSummary(records, (item) => `${item.version}:${item.sourceCategory}`),
    byVersionPersona: groupSummary(records, (item) => `${item.version}:${item.persona}`),
    topFailureReasons: topFailureReasons(records),
  };
}

function groupSummary(records: EvalRunRecord[], keyFn: (record: EvalRunRecord) => string) {
  const groups = new Map<string, EvalRunRecord[]>();
  for (const record of records) {
    const key = keyFn(record);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => summarizeGroup(key, items));
}

function summarizeGroup(key: string, items: EvalRunRecord[]) {
  const total = items.length;
  const count = (status: EvalStatus) => items.filter((item) => item.status === status).length;
  const usable = count('usable');
  const latencies = items.map((item) => item.latencyMs).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const avgLatencyMs = latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : 0;
  const p95LatencyMs = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] : 0;
  return {
    key,
    total,
    usable,
    usableRate: total ? Number((usable / total).toFixed(4)) : 0,
    completedNoSignal: count('completed_no_signal'),
    failed: count('failed'),
    blocked: count('blocked'),
    noData: count('no_data'),
    clarify: count('clarify'),
    unsupported: count('unsupported'),
    environmentBlocked: count('environment_blocked'),
    avgLatencyMs,
    p95LatencyMs,
  };
}

function topFailureReasons(records: EvalRunRecord[]) {
  const failed = records.filter((record) => record.status !== 'usable');
  const buckets = new Map<string, number>();
  for (const record of failed) {
    const reason = normalizeReason(record.failureReason || record.answerSummary || record.status);
    buckets.set(reason, (buckets.get(reason) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([reason, count]) => ({ reason, count }));
}

function buildMarkdownReport(payload: { metadata: any; summary: any; records: EvalRunRecord[] }) {
  const rows = (payload.summary.byVersion as any[])
    .map(
      (item) =>
        `| ${versionLabel(item.key)} | ${item.total} | ${item.usable} | ${percent(item.usableRate)} | ${item.noData} | ${item.blocked} | ${item.clarify} | ${item.unsupported} | ${item.failed} | ${item.environmentBlocked} | ${item.avgLatencyMs} | ${item.p95LatencyMs} |`,
    )
    .join('\n');
  const personaRows = (payload.summary.byVersionPersona as any[])
    .map((item) => {
      const [version, persona] = String(item.key).split(':');
      return `| ${versionLabel(version)} | ${personaLabel(persona)} | ${item.total} | ${item.usable} | ${percent(item.usableRate)} | ${item.noData} | ${item.blocked} | ${item.failed + item.environmentBlocked} |`;
    })
    .join('\n');
  const categoryRows = (payload.summary.byCategory as any[])
    .map(
      (item) =>
        `| ${item.key} | ${item.total} | ${item.usable} | ${percent(item.usableRate)} | ${item.noData} | ${item.blocked} | ${item.clarify} | ${item.unsupported} | ${item.failed + item.environmentBlocked} |`,
    )
    .join('\n');
  const failures = (payload.summary.topFailureReasons as any[])
    .map((item, index) => `${index + 1}. ${item.reason}：${item.count} 次`)
    .join('\n');
  const goodSamples = pickSamples(payload.records, (item) => item.status === 'usable');
  const badSamples = pickSamples(payload.records, (item) => item.status !== 'usable');
  const goodText = goodSamples.map(formatSample).join('\n');
  const badText = badSamples.map(formatSample).join('\n');

  return `# Agent 650题全版本真实测评分析报告

生成时间：${formatShanghai(new Date(payload.metadata.generatedAt))}

## 评测范围

- 问题来源：${payload.metadata.sourceFile}
- 问题数：${payload.metadata.questionCount}
- 计划运行数：${payload.metadata.plannedRunCount}
- 实际记录数：${payload.metadata.actualRunCount}
- 版本范围：${payload.metadata.versions.map(versionLabel).join(' / ')}
- 门店：storeId=${payload.metadata.storeId}
- 评分口径：completed 且具备回答、证据、表格、动作、结构化 block 或 trace 之一记为“可用”；no_data、blocked、clarify、unsupported、environment_blocked 单独分类。

## 总体结论

本报告按真实运行结果生成，用于比较各版本“能否被正式版复用”。Ami AI 作为兜底可读性基线；V1 代表早期角色工具编排；V2 代表 Manifest 与治理链路；V3 代表受控 Text-to-SQL 数据问数；V4 代表生命周期经营 Agent 与 V3 只读问数融合；V5 代表全业务 Ontology Router + 独立 Adapter 的经营 Agent。

## 各版本结果

| 版本 | 总数 | 可用 | 可用率 | 无数据 | 阻断 | 澄清 | 不支持 | 失败 | 环境阻塞 | 平均耗时ms | P95耗时ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

## 角色与版本交叉

| 版本 | 角色 | 总数 | 可用 | 可用率 | 无数据 | 阻断 | 失败/环境 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
${personaRows}

## 问题类型分布

| 问题类型 | 运行数 | 可用 | 可用率 | 无数据 | 阻断 | 澄清 | 不支持 | 失败/环境 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${categoryRows}

## Top 失败原因

${failures || '- 暂无失败原因。'}

## 典型可用样本

${goodText || '- 暂无。'}

## 典型问题样本

${badText || '- 暂无。'}

## 正式版复用建议

1. V5 应作为新的正式入口继续推进：它用全业务 Ontology 先路由，再通过独立 Adapter 复用底层能力，边界比 V4 清晰。
2. V3 的受控 Text-to-SQL 适合作为 V5 的事实型问数工具，但必须继续加强语义路由、中文表头、日期格式、金额/小数标准化和问题意图校验。
3. V4 适合作为 V5 的客户生命周期领域服务：负责生命周期机会、经营计划、审批草稿、归因复盘；不建议继续扩大成全业务入口。
4. V2 的 Manifest、能力治理、发布门禁、dry-run、审计视图应作为“能力治理系统”保留，不建议继续作为用户自然语言主运行入口。
5. V1 可作为历史工具编排和角色路由参考，正式版不应继续扩展 V1 新能力。
6. Ami AI 只作为兜底话术和异常解释层，不应承担事实问数或经营决策。

## V5 优先修复清单

1. 对员工、前台、财务、库存、营销、边界多轮分别扩展 V5 domain adapter，减少过度回落到 V3 Text-to-SQL。
2. 对“最受欢迎/最好/不足/风险/趋势”等高频业务词建立强语义路由，先定位业务对象，再选择 V5 adapter 或 V3 问数。
3. 统一所有表格输出中文表头、中文日期、金额两位小数、数量两位以内展示。
4. 对 no_data、unsupported、blocked 做可解释诊断：说明缺哪个 ontology domain、adapter、语义视图、字段、权限或数据。
5. 把用户“无用”反馈和本评测失败样本打通，形成 V5 ontology route 和 adapter backlog。
6. V5 需要把生命周期本体、全业务计划、审批状态、执行归因和质量校验持续沉淀到统一运行审计。
`;
}

function pickSamples(records: EvalRunRecord[], predicate: (record: EvalRunRecord) => boolean) {
  const used = new Set<AgentEvalVersion>();
  const samples: EvalRunRecord[] = [];
  for (const record of records) {
    if (!predicate(record)) continue;
    if (used.has(record.version)) continue;
    used.add(record.version);
    samples.push(record);
  }
  return samples;
}

function formatSample(record: EvalRunRecord) {
  return `- ${versionLabel(record.version)} / ${personaLabel(record.persona)} / ${record.status}：${record.question} -> ${record.answerSummary || record.failureReason || '无摘要'}`;
}

function parseArgs(args: string[]): EvalOptions {
  const outputDir = stringArg(args, 'output-dir') ?? DEFAULT_OUTPUT_DIR;
  const versions = parseVersions(stringArg(args, 'versions'));
  return {
    limit: numberArg(args, 'limit'),
    persona: parsePersona(stringArg(args, 'persona')),
    versions,
    storeId: numberArg(args, 'store-id') ?? 1,
    outputDir: resolve(outputDir),
    concurrency: numberArg(args, 'concurrency') ?? 1,
    fromResults: stringArg(args, 'from-results'),
  };
}

function stringArg(args: string[], name: string) {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : undefined;
}

function numberArg(args: string[], name: string) {
  const value = Number(stringArg(args, name));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function parseVersions(value?: string): AgentEvalVersion[] {
  if (!value) return ALL_VERSIONS;
  const requested = value.split(',').map((item) => item.trim()).filter(Boolean);
  const invalid = requested.filter((item) => !ALL_VERSIONS.includes(item as AgentEvalVersion));
  if (invalid.length) throw new Error(`Unsupported versions: ${invalid.join(', ')}`);
  return requested as AgentEvalVersion[];
}

function parsePersona(value?: string): AgentQuestionBankPersona | undefined {
  if (!value) return undefined;
  const allowed: AgentQuestionBankPersona[] = ['manager', 'marketing', 'reception', 'beautician', 'inventory', 'finance', 'edge'];
  if (!allowed.includes(value as AgentQuestionBankPersona)) throw new Error(`Unsupported persona: ${value}`);
  return value as AgentQuestionBankPersona;
}

function ensureDir(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
  const parent = dirname(resolve(path, DEFAULT_RESULTS_FILE));
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
}

async function regenerateReportFromResults(options: EvalOptions) {
  const inputPath = resolveMaybeRepoPath(options.fromResults ?? resolve(options.outputDir, DEFAULT_RESULTS_FILE));
  const payload = JSON.parse(readFileSync(inputPath, 'utf8'));
  payload.summary = buildSummary(payload.records ?? []);
  payload.metadata = {
    ...(payload.metadata ?? {}),
    reportRegeneratedAt: new Date().toISOString(),
  };
  ensureDir(options.outputDir);
  const reportPath = resolve(options.outputDir, DEFAULT_REPORT_FILE);
  writeFileSync(inputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  writeFileSync(reportPath, buildMarkdownReport(payload), 'utf8');
  console.log(`[agent-all-version-eval] report-only results=${inputPath}`);
  console.log(`[agent-all-version-eval] report-only report=${reportPath}`);
}

function resolveMaybeRepoPath(value: string) {
  const direct = resolve(value);
  if (existsSync(direct)) return direct;
  return resolve(REPO_ROOT, value);
}

async function resolveRuntimeStoreId(prisma: PrismaService, requestedStoreId: number) {
  const storeDelegate = (prisma as any).store;
  if (!storeDelegate?.findUnique) return requestedStoreId;
  const requested = await storeDelegate.findUnique({ where: { id: requestedStoreId }, select: { id: true } });
  if (requested?.id) return requestedStoreId;
  const first = await storeDelegate.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
  return Number(first?.id ?? requestedStoreId);
}

function resolveRepoRoot() {
  const candidates = [
    process.cwd(),
    resolve(process.cwd(), '..'),
    resolve(process.cwd(), '../..'),
    resolve(process.cwd(), '../../..'),
  ];
  const found = candidates.find((candidate) => existsSync(resolve(candidate, 'docs/04-测试数据')));
  return found ?? process.cwd();
}

function normalizeAiText(result: unknown) {
  if (!result || typeof result !== 'object') return String(result ?? '');
  const record = result as Record<string, unknown>;
  return String(record.text ?? record.content ?? record.answer ?? JSON.stringify(result));
}

function summarize(text: unknown) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function normalizeReason(value: string) {
  return String(value || 'unknown').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function isEnvironmentError(value: string) {
  return /DATABASE_URL|READONLY_DATABASE_URL|LLM_|API Key|API_KEY|ECONNREFUSED|connect ECONN|ENOTFOUND|timeout|PrismaClientInitialization|认证失败|服务尚未配置|请求超时/i.test(
    value,
  );
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function versionLabel(value: string) {
  const labels: Record<string, string> = {
    ami_ai: 'Ami AI',
    agent_v1: 'V1',
    agent_v2: 'V2',
    agent_v3: 'V3',
    agent_v4: 'V4',
    agent_v5: 'V5',
  };
  return labels[value] ?? value;
}

function personaLabel(value: string) {
  const labels: Record<string, string> = {
    manager: '店长经营',
    marketing: '营销增长',
    reception: '前台接待',
    beautician: '美容师服务',
    inventory: '库存采购',
    finance: '财务风控',
    edge: '边界/多轮',
  };
  return labels[value] ?? value;
}

function formatShanghai(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

main().catch((error) => {
  console.error('[agent-all-version-eval] failed', error);
  process.exitCode = 1;
});
