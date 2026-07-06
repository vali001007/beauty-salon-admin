import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';

type JsonRecord = Record<string, unknown>;

type ShadowEvidenceExport = {
  generatedAt?: string;
  source?: {
    environment?: string;
    window?: string;
    exportedBy?: string;
  };
  runs?: JsonRecord[];
  auditDetails?: JsonRecord[];
  toolCalls?: JsonRecord[];
  feedbacks?: JsonRecord[];
  regressions?: JsonRecord[];
  rollback?: {
    verified?: boolean;
    lastVerifiedAt?: string;
    method?: string;
    notes?: string;
  };
};

type NormalizedRun = {
  key: string;
  createdAt: Date | null;
  completedAt: Date | null;
  status: string;
  mode: string;
  finalEngine: string;
  hasLlmTrace: boolean;
  llmFailed: boolean;
  llmLatencyMs: number | null;
  costObserved: boolean;
};

type FeedbackSample = {
  runKey: string;
  helpful: boolean | null;
};

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const defaultInputPath = resolve(docsRoot, 'agent-v2-shadow-evidence-export.json');
const exampleInputPath = resolve(docsRoot, 'agent-v2-shadow-evidence-export.example.json');
const candidateEvidencePath = resolve(docsRoot, 'agent-v2-legacy-retirement-production-evidence.candidate.json');
const outputJsonPath = resolve(docsRoot, 'agent-v2-legacy-retirement-shadow-evidence-aggregate.json');
const outputMdPath = resolve(docsRoot, 'agent-v2-legacy-retirement-shadow-evidence-aggregate.md');

function main() {
  if (hasArg('--help')) {
    printHelp();
    return;
  }

  const inputArg = readArg('--input');
  const inputPath = inputArg ? resolveUserPath(inputArg) : defaultInputPath;
  const exportData = existsSync(inputPath) ? readJson<ShadowEvidenceExport>(inputPath) : null;
  const aggregate = exportData ? buildAggregate(exportData) : null;
  const candidate = aggregate ? buildCandidateEvidence(exportData, aggregate) : null;
  const generatedAt = formatShanghaiTime(new Date());
  const report = {
    generatedAt,
    source: {
      input: exportData ? relativePath(inputPath) : null,
      defaultInput: relativePath(defaultInputPath),
      exampleInput: relativePath(exampleInputPath),
      candidateOutput: candidate ? relativePath(candidateEvidencePath) : null,
    },
    summary: {
      passCandidate: Boolean(candidate && isCandidateLocallyStrong(candidate)),
      observedDays: candidate?.shadow.observedDays ?? 0,
      totalRuns: candidate?.shadow.totalRuns ?? 0,
      shadowRuns: candidate?.shadow.shadowRuns ?? 0,
      kgLlmPreferredRuns: candidate?.shadow.kgLlmPreferredRuns ?? 0,
      kgLlmOnlyRuns: candidate?.shadow.kgLlmOnlyRuns ?? 0,
      usefulnessSampleCount: candidate?.usefulness.sampleCount ?? 0,
      llmObserved: Boolean(candidate?.llmObservability.enabled),
      rollbackVerified: Boolean(candidate?.rollback.verified),
      recommendation: candidate
        ? '已生成 candidate 证据；必须再通过 agent-v2:legacy-retirement-evidence -- --input <candidate> 校验后，才能考虑写入正式生产证据。'
        : '未找到 shadow 审计导出文件；请先按 example 格式导出生产/准生产 AgentRun、AuditDetail、ToolCall 和 Feedback 数据。',
    },
    aggregate,
    candidate,
  };

  if (candidate) writeJson(candidateEvidencePath, candidate);
  writeJson(outputJsonPath, report);
  writeMarkdown(outputMdPath, report);
  console.log(JSON.stringify(report.summary, null, 2));
}

function buildAggregate(input: ShadowEvidenceExport) {
  const runMap = new Map<string, NormalizedRun>();
  for (const run of input.runs ?? []) {
    const normalized = normalizeRun(run);
    runMap.set(normalized.key, normalized);
  }
  for (const detail of input.auditDetails ?? []) {
    const normalized = normalizeRun(detail);
    const existing = runMap.get(normalized.key);
    runMap.set(normalized.key, mergeRun(existing, normalized));
  }

  const runs = [...runMap.values()];
  const dates = runs.map((run) => run.createdAt).filter((date): date is Date => Boolean(date));
  const distinctDays = new Set(dates.map((date) => date.toISOString().slice(0, 10)));
  const newChainRuns = runs.filter((run) => isNewChain(run));
  const llmRuns = runs.filter((run) => run.hasLlmTrace);
  const llmLatencies = llmRuns.map((run) => run.llmLatencyMs).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const feedbackSamples = normalizeFeedback(input.feedbacks ?? []);
  const feedbackByRun = new Map(feedbackSamples.map((item) => [item.runKey, item]));
  const kgFeedbacks = runs
    .filter((run) => isKgVisibleRun(run))
    .map((run) => feedbackByRun.get(run.key))
    .filter((item): item is FeedbackSample => Boolean(item) && item.helpful !== null);
  const legacyFeedbacks = runs
    .filter((run) => run.mode === 'legacy_regex' || run.finalEngine === 'legacy_regex')
    .map((run) => feedbackByRun.get(run.key))
    .filter((item): item is FeedbackSample => Boolean(item) && item.helpful !== null);

  return {
    observedDays: distinctDays.size,
    firstObservedAt: minDate(dates)?.toISOString() ?? null,
    lastObservedAt: maxDate(dates)?.toISOString() ?? null,
    runs: {
      total: runs.length,
      byMode: countBy(runs.map((run) => run.mode || 'unknown')),
      byFinalEngine: countBy(runs.map((run) => run.finalEngine || 'unknown')),
      byStatus: countBy(runs.map((run) => run.status || 'unknown')),
      shadow: runs.filter((run) => run.mode === 'shadow').length,
      kgLlmPreferred: runs.filter((run) => run.mode === 'kg_llm_preferred').length,
      kgLlmOnly: runs.filter((run) => run.mode === 'kg_llm_only' || run.mode === 'legacy_retired').length,
      newChain: newChainRuns.length,
    },
    safety: {
      majorRegressionCount: countMajorRegressions(input.regressions ?? [], runs),
      highRiskAutoExecutionCount: countHighRiskAutoExecution(input.toolCalls ?? []),
    },
    usefulness: {
      kgSampleCount: kgFeedbacks.length,
      legacySampleCount: legacyFeedbacks.length,
      kgHelpfulRate: helpfulRate(kgFeedbacks),
      legacyHelpfulRate: helpfulRate(legacyFeedbacks),
    },
    llm: {
      sampleCount: llmRuns.length,
      failedCount: llmRuns.filter((run) => run.llmFailed).length,
      latencyP99Ms: percentile(llmLatencies, 0.99),
      failureRate: ratio(llmRuns.filter((run) => run.llmFailed).length, llmRuns.length),
      costObserved: llmRuns.some((run) => run.costObserved),
      failureSamplesCaptured: llmRuns.filter((run) => run.llmFailed).every((run) => Boolean(run.status) || Boolean(run.finalEngine)),
    },
  };
}

function buildCandidateEvidence(input: ShadowEvidenceExport, aggregate: ReturnType<typeof buildAggregate>) {
  const kgHelpfulRate = aggregate.usefulness.kgHelpfulRate ?? 0;
  const legacyHelpfulRate = aggregate.usefulness.legacyHelpfulRate ?? 0;
  const usefulnessSampleCount = aggregate.usefulness.kgSampleCount + aggregate.usefulness.legacySampleCount;
  const relativeToLegacy = aggregate.usefulness.kgSampleCount > 0 && aggregate.usefulness.legacySampleCount > 0
    ? kgHelpfulRate >= legacyHelpfulRate
      ? kgHelpfulRate > legacyHelpfulRate
        ? 'better'
        : 'equal'
      : 'worse'
    : 'unknown';

  return {
    generatedAt: formatShanghaiTime(new Date()),
    source: {
      environment: input.source?.environment ?? 'unknown',
      window: input.source?.window ?? observedWindow(aggregate),
      exportedBy: input.source?.exportedBy ?? 'agent-v2-shadow-evidence-aggregate',
    },
    shadow: {
      observedDays: aggregate.observedDays,
      totalRuns: aggregate.runs.total,
      shadowRuns: aggregate.runs.shadow,
      kgLlmPreferredRuns: aggregate.runs.kgLlmPreferred,
      kgLlmOnlyRuns: aggregate.runs.kgLlmOnly,
      majorRegressionCount: aggregate.safety.majorRegressionCount,
      highRiskAutoExecutionCount: aggregate.safety.highRiskAutoExecutionCount,
      notes: '由 AgentRun / AgentRunAuditDetail / AgentToolCall 导出聚合生成；写入正式证据前必须复核真实生产窗口。',
    },
    usefulness: {
      relativeToLegacy,
      sampleCount: usefulnessSampleCount,
      kgHelpfulRate,
      legacyHelpfulRate,
      notes: '有用率按 rating>=4 或 adopted=true 计为 helpful；KG 与 legacy 都需要真实反馈样本才可证明不低于旧链路。',
    },
    llmObservability: {
      enabled: aggregate.llm.sampleCount > 0,
      latencyP99Ms: aggregate.llm.latencyP99Ms ?? 0,
      failureRate: aggregate.llm.failureRate,
      costObserved: aggregate.llm.costObserved,
      failureSamplesCaptured: aggregate.llm.failureSamplesCaptured,
      notes: 'LLM 观测来自 audit detail 的 llmPrompt/llmResponse/cost/latency trace；0ms 表示没有可用样本。',
    },
    rollback: {
      verified: Boolean(input.rollback?.verified),
      lastVerifiedAt: input.rollback?.lastVerifiedAt,
      method: input.rollback?.method,
      notes: input.rollback?.notes ?? '回滚验证必须来自生产或准生产，不由聚合脚本自动推断。',
    },
  };
}

function normalizeRun(value: JsonRecord): NormalizedRun {
  const key = String(value.runId ?? value.id ?? value.runNo ?? value.runNoText ?? `unknown-${Math.random()}`);
  const status = String(value.status ?? deepFindString(value, ['status']) ?? 'unknown');
  const mode = extractMode(value);
  const finalEngine = extractFinalEngine(value);
  const llmPrompt = asRecord(value.llmPromptJson) ?? deepFindRecord(value, 'llmPromptJson');
  const llmResponse = asRecord(value.llmResponseJson) ?? deepFindRecord(value, 'llmResponseJson');
  const latency = extractLlmLatency(value);
  const costJson = asRecord(value.costJson) ?? deepFindRecord(value, 'costJson');
  return {
    key,
    createdAt: parseDate(value.createdAt ?? value.startedAt),
    completedAt: parseDate(value.completedAt ?? value.updatedAt),
    status,
    mode,
    finalEngine,
    hasLlmTrace: Boolean(llmPrompt || llmResponse || latency !== null),
    llmFailed: /failed|error|invalid|parse/i.test(JSON.stringify(llmResponse ?? {})) || /llm|json|parse/i.test(String(value.errorCode ?? value.errorMessage ?? '')),
    llmLatencyMs: latency,
    costObserved: hasCostSignal(costJson),
  };
}

function mergeRun(left: NormalizedRun | undefined, right: NormalizedRun): NormalizedRun {
  if (!left) return right;
  return {
    key: left.key,
    createdAt: left.createdAt ?? right.createdAt,
    completedAt: left.completedAt ?? right.completedAt,
    status: left.status !== 'unknown' ? left.status : right.status,
    mode: left.mode !== 'unknown' ? left.mode : right.mode,
    finalEngine: left.finalEngine !== 'unknown' ? left.finalEngine : right.finalEngine,
    hasLlmTrace: left.hasLlmTrace || right.hasLlmTrace,
    llmFailed: left.llmFailed || right.llmFailed,
    llmLatencyMs: left.llmLatencyMs ?? right.llmLatencyMs,
    costObserved: left.costObserved || right.costObserved,
  };
}

function normalizeFeedback(items: JsonRecord[]): FeedbackSample[] {
  return items.map((item) => {
    const rating = toFiniteNumber(item.rating);
    const adopted = typeof item.adopted === 'boolean' ? item.adopted : null;
    return {
      runKey: String(item.runId ?? item.id ?? ''),
      helpful: adopted === true || (rating !== null && rating >= 4)
        ? true
        : adopted === false || (rating !== null && rating <= 2)
          ? false
          : null,
    };
  }).filter((item) => item.runKey);
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

function isNewChain(run: NormalizedRun) {
  return ['kg_llm', 'kg_llm_preferred', 'kg_llm_only', 'legacy_retired', 'shadow'].includes(run.mode)
    || (run.finalEngine !== 'legacy_regex' && run.finalEngine !== 'unknown');
}

function isKgVisibleRun(run: NormalizedRun) {
  return ['kg_llm', 'kg_llm_preferred', 'kg_llm_only', 'legacy_retired'].includes(run.mode)
    || (run.mode !== 'shadow' && run.finalEngine !== 'legacy_regex' && run.finalEngine !== 'unknown');
}

function countMajorRegressions(regressions: JsonRecord[], runs: NormalizedRun[]) {
  const explicit = regressions.filter((item) => /major|critical|p0/i.test(String(item.severity ?? item.level ?? item.type ?? ''))).length;
  const flaggedRuns = runs.filter((run) => isNewChain(run) && /major_regression|critical_regression/i.test(run.status)).length;
  return explicit + flaggedRuns;
}

function countHighRiskAutoExecution(toolCalls: JsonRecord[]) {
  return toolCalls.filter((tool) => {
    const risk = String(tool.riskLevel ?? getNested(tool, ['resultJson', 'riskLevel']) ?? '');
    const status = String(tool.status ?? '');
    const approvalId = tool.approvalId ?? getNested(tool, ['resultJson', 'approvalId']);
    return /high/i.test(risk) && /success|completed|executed/i.test(status) && !approvalId;
  }).length;
}

function isCandidateLocallyStrong(candidate: ReturnType<typeof buildCandidateEvidence>) {
  return candidate.shadow.observedDays >= 7
    && candidate.shadow.totalRuns > 0
    && candidate.shadow.shadowRuns > 0
    && (candidate.shadow.kgLlmPreferredRuns + candidate.shadow.kgLlmOnlyRuns) > 0
    && candidate.shadow.majorRegressionCount === 0
    && candidate.shadow.highRiskAutoExecutionCount === 0
    && candidate.usefulness.sampleCount > 0
    && candidate.usefulness.relativeToLegacy !== 'unknown'
    && candidate.llmObservability.enabled
    && candidate.llmObservability.latencyP99Ms > 0
    && candidate.rollback.verified === true;
}

function writeMarkdown(path: string, report: ReturnType<typeof reportShape>) {
  const lines = [
    '# Agent V2 Shadow 证据聚合报告',
    '',
    `生成时间：${report.generatedAt}`,
    `输入文件：${report.source.input ?? '-'}`,
    `默认输入：${report.source.defaultInput}`,
    `示例输入：${report.source.exampleInput}`,
    `候选证据输出：${report.source.candidateOutput ?? '-'}`,
    '',
    '## 结论',
    '',
    `- Candidate 强度：${report.summary.passCandidate ? '满足本地候选条件' : '不足'}`,
    `- 观察天数：${report.summary.observedDays}`,
    `- 总运行：${report.summary.totalRuns}`,
    `- shadow 运行：${report.summary.shadowRuns}`,
    `- kg_llm_preferred 运行：${report.summary.kgLlmPreferredRuns}`,
    `- kg_llm_only / legacy_retired 运行：${report.summary.kgLlmOnlyRuns}`,
    `- 有用率样本：${report.summary.usefulnessSampleCount}`,
    `- LLM 观测：${report.summary.llmObserved ? '有' : '无'}`,
    `- 回滚验证：${report.summary.rollbackVerified ? '有' : '无'}`,
    `- 建议：${report.summary.recommendation}`,
    '',
    '## 聚合明细',
    '',
    `- 运行模式分布：${JSON.stringify(report.aggregate?.runs.byMode ?? {})}`,
    `- 最终引擎分布：${JSON.stringify(report.aggregate?.runs.byFinalEngine ?? {})}`,
    `- 状态分布：${JSON.stringify(report.aggregate?.runs.byStatus ?? {})}`,
    `- 重大回归：${report.aggregate?.safety.majorRegressionCount ?? 0}`,
    `- 高风险自动执行：${report.aggregate?.safety.highRiskAutoExecutionCount ?? 0}`,
    `- KG 有用率：${formatRate(report.aggregate?.usefulness.kgHelpfulRate ?? null)} / 样本 ${report.aggregate?.usefulness.kgSampleCount ?? 0}`,
    `- Legacy 有用率：${formatRate(report.aggregate?.usefulness.legacyHelpfulRate ?? null)} / 样本 ${report.aggregate?.usefulness.legacySampleCount ?? 0}`,
    `- LLM P99：${report.aggregate?.llm.latencyP99Ms ?? 0}ms`,
    `- LLM 失败率：${formatRate(report.aggregate?.llm.failureRate ?? null)}`,
  ];
  writeText(path, `${lines.join('\n')}\n`);
}

function reportShape() {
  return {
    generatedAt: '',
    source: {
      input: null as string | null,
      defaultInput: '',
      exampleInput: '',
      candidateOutput: null as string | null,
    },
    summary: {
      passCandidate: false,
      observedDays: 0,
      totalRuns: 0,
      shadowRuns: 0,
      kgLlmPreferredRuns: 0,
      kgLlmOnlyRuns: 0,
      usefulnessSampleCount: 0,
      llmObserved: false,
      rollbackVerified: false,
      recommendation: '',
    },
    aggregate: null as ReturnType<typeof buildAggregate> | null,
    candidate: null as ReturnType<typeof buildCandidateEvidence> | null,
  };
}

function observedWindow(aggregate: ReturnType<typeof buildAggregate>) {
  if (aggregate.firstObservedAt && aggregate.lastObservedAt) return `${aggregate.firstObservedAt} ~ ${aggregate.lastObservedAt}`;
  return 'unknown';
}

function helpfulRate(items: FeedbackSample[]) {
  if (!items.length) return null;
  return ratio(items.filter((item) => item.helpful === true).length, items.length);
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[index];
}

function ratio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(4));
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function minDate(values: Date[]) {
  if (!values.length) return null;
  return values.reduce((min, value) => value < min ? value : min, values[0]);
}

function maxDate(values: Date[]) {
  if (!values.length) return null;
  return values.reduce((max, value) => value > max ? value : max, values[0]);
}

function hasCostSignal(value: JsonRecord | null) {
  if (!value) return false;
  return JSON.stringify(value).match(/cost|token|amount|price|usd|cny/i) !== null;
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

function deepFindRecord(value: unknown, key: string): JsonRecord | null {
  const found = deepFind(value, [key]);
  return asRecord(found);
}

function deepFindString(value: unknown, keys: string[]): string | null {
  const found = deepFind(value, keys);
  return typeof found === 'string' ? found : null;
}

function deepFind(value: unknown, keys: string[]): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as JsonRecord;
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  for (const child of Object.values(record)) {
    const nested = deepFind(child, keys);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function parseDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toFiniteNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRate(value: number | null) {
  if (value === null) return '-';
  return `${(value * 100).toFixed(2)}%`;
}

function readArg(name: string) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function resolveUserPath(path: string) {
  const cwdPath = resolve(process.cwd(), path);
  if (existsSync(cwdPath)) return cwdPath;
  return resolve(workspaceRoot, path);
}

function printHelp() {
  console.log([
    'Usage:',
    '  npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-shadow-evidence -- --input <json>',
    '',
    '说明：本脚本只聚合生产/准生产导出的 JSON，不连接数据库，不调用生产 API，不写正式生产证据文件。',
  ].join('\n'));
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJson(path: string, value: unknown) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(path: string, value: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, 'utf8');
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
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')} Asia/Shanghai`;
}

main();
