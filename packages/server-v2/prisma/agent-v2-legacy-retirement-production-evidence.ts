import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';

type ProductionEvidenceReport = {
  generatedAt?: string;
  source?: {
    environment?: string;
    window?: string;
    exportedBy?: string;
  };
  shadow?: {
    observedDays?: number;
    totalRuns?: number;
    shadowRuns?: number;
    kgLlmPreferredRuns?: number;
    kgLlmOnlyRuns?: number;
    majorRegressionCount?: number;
    highRiskAutoExecutionCount?: number;
    notes?: string;
  };
  usefulness?: {
    relativeToLegacy?: 'better' | 'equal' | 'worse' | 'unknown';
    sampleCount?: number;
    kgHelpfulRate?: number;
    legacyHelpfulRate?: number;
    notes?: string;
  };
  llmObservability?: {
    enabled?: boolean;
    latencyP99Ms?: number;
    failureRate?: number;
    costObserved?: boolean;
    failureSamplesCaptured?: boolean;
    notes?: string;
  };
  rollback?: {
    verified?: boolean;
    lastVerifiedAt?: string;
    method?: string;
    notes?: string;
  };
};

type EvidenceCheckStatus = 'pass' | 'blocked';

type EvidenceCheck = {
  id: string;
  title: string;
  expected: string;
  actual: string;
  status: EvidenceCheckStatus;
  impact: string;
};

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const canonicalEvidencePath = resolve(docsRoot, 'agent-v2-legacy-retirement-production-evidence.json');
const evidenceExamplePath = resolve(docsRoot, 'agent-v2-legacy-retirement-production-evidence.example.json');
const outputJsonPath = resolve(docsRoot, 'agent-v2-legacy-retirement-production-evidence-check.json');
const outputMdPath = resolve(docsRoot, 'agent-v2-legacy-retirement-production-evidence-check.md');

function main() {
  if (hasArg('--help')) {
    printHelp();
    return;
  }

  const inputArg = readArg('--input');
  const inputPath = inputArg ? resolveUserPath(inputArg) : canonicalEvidencePath;
  const writeCanonical = hasArg('--write-canonical');
  const strict = hasArg('--strict');
  const minimumUsefulnessSamples = Number(readArg('--min-usefulness-samples') ?? process.env.AGENT_V2_RETIREMENT_MIN_USEFULNESS_SAMPLES ?? 1);
  const evidence = existsSync(inputPath) ? readJson<ProductionEvidenceReport>(inputPath) : null;
  const checks = buildChecks(evidence, inputPath, minimumUsefulnessSamples);
  const pass = checks.every((check) => check.status === 'pass');
  let wroteCanonical = false;

  if (writeCanonical && pass && evidence) {
    writeJson(canonicalEvidencePath, evidence);
    wroteCanonical = true;
  }

  const report = {
    generatedAt: formatShanghaiTime(new Date()),
    source: {
      input: existsSync(inputPath) ? relativePath(inputPath) : null,
      canonicalOutput: relativePath(canonicalEvidencePath),
      example: relativePath(evidenceExamplePath),
      wroteCanonical,
      minimumUsefulnessSamples,
    },
    summary: {
      pass,
      blockerCount: checks.filter((check) => check.status !== 'pass').length,
      recommendation: pass
        ? writeCanonical
          ? '生产证据校验通过，已写入正式证据文件；可以复跑 agent-v2:legacy-retirement-preflight:local 查看旧正则退役预检。'
          : '生产证据校验通过；如确认来源可信，可加 --write-canonical 写入正式证据文件。'
        : '生产证据不足；不要删除旧正则，也不要把示例模板或零样本文件写入正式证据。',
    },
    checks,
  };

  writeJson(outputJsonPath, report);
  writeMarkdown(outputMdPath, report);
  console.log(JSON.stringify(report.summary, null, 2));

  if (strict && !pass) process.exit(1);
}

function buildChecks(
  evidence: ProductionEvidenceReport | null,
  inputPath: string,
  minimumUsefulnessSamples: number,
): EvidenceCheck[] {
  const shadow = evidence?.shadow;
  const usefulness = evidence?.usefulness;
  const llm = evidence?.llmObservability;
  const rollback = evidence?.rollback;
  const observedDays = Number(shadow?.observedDays ?? 0);
  const totalRuns = Number(shadow?.totalRuns ?? 0);
  const shadowRuns = Number(shadow?.shadowRuns ?? 0);
  const preferredRuns = Number(shadow?.kgLlmPreferredRuns ?? 0);
  const onlyRuns = Number(shadow?.kgLlmOnlyRuns ?? 0);
  const majorRegressionCount = Number(shadow?.majorRegressionCount ?? 0);
  const highRiskAutoExecutionCount = Number(shadow?.highRiskAutoExecutionCount ?? 0);
  const kgHelpfulRate = toFiniteNumber(usefulness?.kgHelpfulRate);
  const legacyHelpfulRate = toFiniteNumber(usefulness?.legacyHelpfulRate);
  const usefulnessSampleCount = Number(usefulness?.sampleCount ?? 0);
  const llmLatencyP99Ms = toFiniteNumber(llm?.latencyP99Ms);
  const llmFailureRate = toFiniteNumber(llm?.failureRate);
  const sourceEnvironment = String(evidence?.source?.environment ?? '').trim().toLowerCase();

  return [
    {
      id: 'file_exists',
      title: '生产证据文件',
      expected: '存在真实导出的 JSON 文件',
      actual: evidence ? relativePath(inputPath) : `未找到：${relativePath(inputPath)}`,
      status: evidence ? 'pass' : 'blocked',
      impact: '没有证据文件时，旧正则退役只能停留在本地预检通过，不能进入删除。',
    },
    {
      id: 'source_integrity',
      title: '证据来源',
      expected: 'environment=production，且包含 window/exportedBy/generatedAt',
      actual: evidence
        ? `environment=${evidence.source?.environment ?? '-'}，window=${evidence.source?.window ?? '-'}，exportedBy=${evidence.source?.exportedBy ?? '-'}，generatedAt=${evidence.generatedAt ?? '-'}`
        : '未提供',
      status: evidence
        && sourceEnvironment === 'production'
        && Boolean(evidence.source?.window)
        && Boolean(evidence.source?.exportedBy)
        && Boolean(evidence.generatedAt)
        ? 'pass'
        : 'blocked',
      impact: '证据必须来自生产观测窗口；本地 dry-run、示例模板或手填零样本都不能作为退役依据。',
    },
    {
      id: 'shadow_window',
      title: '7 天 shadow/灰度样本',
      expected: 'observedDays >= 7，总样本、shadow 样本和新链路样本均非 0',
      actual: `${observedDays} 天，总样本 ${totalRuns}，shadow ${shadowRuns}，preferred ${preferredRuns}，only ${onlyRuns}`,
      status: evidence
        && observedDays >= 7
        && totalRuns > 0
        && shadowRuns > 0
        && shadowRuns <= totalRuns
        && (preferredRuns + onlyRuns) > 0
        ? 'pass'
        : 'blocked',
      impact: '没有真实流量样本时，只能说明本地能力可用，不能说明线上接管稳定。',
    },
    {
      id: 'shadow_safety',
      title: 'shadow 安全结果',
      expected: '重大回归 0，高风险自动执行 0',
      actual: `重大回归 ${majorRegressionCount}，高风险自动执行 ${highRiskAutoExecutionCount}`,
      status: evidence && majorRegressionCount === 0 && highRiskAutoExecutionCount === 0 ? 'pass' : 'blocked',
      impact: '有重大回归或高风险自动执行时，必须先修复策略和审批边界。',
    },
    {
      id: 'usefulness',
      title: '线上有用率',
      expected: `relativeToLegacy=better/equal，样本 >= ${minimumUsefulnessSamples}，KG 有用率 >= legacy`,
      actual: evidence
        ? `${usefulness?.relativeToLegacy ?? 'unknown'}，样本 ${usefulnessSampleCount}，KG ${formatRate(kgHelpfulRate)}，legacy ${formatRate(legacyHelpfulRate)}`
        : '未提供',
      status: evidence
        && (usefulness?.relativeToLegacy === 'better' || usefulness?.relativeToLegacy === 'equal')
        && usefulnessSampleCount >= minimumUsefulnessSamples
        && rateInRange(kgHelpfulRate)
        && rateInRange(legacyHelpfulRate)
        && Number(kgHelpfulRate) >= Number(legacyHelpfulRate)
        ? 'pass'
        : 'blocked',
      impact: '用户感知不低于旧链路，才有产品理由把新架构切成唯一入口。',
    },
    {
      id: 'llm_observability',
      title: '生产 LLM 观测',
      expected: 'enabled=true，P99 > 0，失败率 0-100%，成本和失败样本已采集',
      actual: evidence
        ? `enabled=${Boolean(llm?.enabled)}，P99=${llmLatencyP99Ms ?? '-'}ms，失败率=${formatRate(llmFailureRate)}，成本=${Boolean(llm?.costObserved)}，失败样本=${Boolean(llm?.failureSamplesCaptured)}`
        : '未提供',
      status: evidence
        && Boolean(llm?.enabled)
        && Number(llmLatencyP99Ms) > 0
        && rateInRange(llmFailureRate)
        && Boolean(llm?.costObserved)
        && Boolean(llm?.failureSamplesCaptured)
        ? 'pass'
        : 'blocked',
      impact: '旧正则退役后，新链路成本和失败样本必须可观测，方便灰度止损。',
    },
    {
      id: 'rollback',
      title: '回滚验证',
      expected: 'verified=true，且包含验证时间和回滚方式',
      actual: evidence
        ? `${rollback?.verified ? '已验证' : '未验证'}，时间=${rollback?.lastVerifiedAt ?? '-'}，方式=${rollback?.method ?? '-'}`
        : '未提供',
      status: evidence
        && rollback?.verified
        && Boolean(rollback.lastVerifiedAt)
        && Boolean(rollback.method)
        ? 'pass'
        : 'blocked',
      impact: '切换后必须能快速回到 legacy_regex 或 kg_llm_preferred，避免门店问答中断。',
    },
  ];
}

function writeMarkdown(path: string, report: ReturnType<typeof buildReportShape>) {
  const lines = [
    '# Agent V2 旧正则退役生产证据校验',
    '',
    `生成时间：${report.generatedAt}`,
    `输入证据：${report.source.input ?? '-'}`,
    `正式证据输出：${report.source.canonicalOutput}`,
    `证据模板：${report.source.example}`,
    `是否写入正式证据：${report.source.wroteCanonical ? '是' : '否'}`,
    `线上有用率最小样本数：${report.source.minimumUsefulnessSamples}`,
    '',
    '## 结论',
    '',
    `- 证据校验：${report.summary.pass ? '通过' : '未通过'}`,
    `- 阻塞项数量：${report.summary.blockerCount}`,
    `- 建议：${report.summary.recommendation}`,
    '',
    '## 明细',
    '',
    '| 检查项 | 期望 | 当前证据 | 状态 | 交付影响 |',
    '|---|---|---|---|---|',
    ...report.checks.map((check) => `| ${check.title} | ${check.expected} | ${check.actual} | ${statusLabel(check.status)} | ${check.impact} |`),
  ];
  writeText(path, `${lines.join('\n')}\n`);
}

function buildReportShape() {
  return {
    generatedAt: '',
    source: {
      input: null as string | null,
      canonicalOutput: '',
      example: '',
      wroteCanonical: false,
      minimumUsefulnessSamples: 1,
    },
    summary: {
      pass: false,
      blockerCount: 0,
      recommendation: '',
    },
    checks: [] as EvidenceCheck[],
  };
}

function printHelp() {
  console.log([
    'Usage:',
    '  npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence',
    '  npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence -- --input <json>',
    '  npm.cmd --prefix packages/server-v2 run agent-v2:legacy-retirement-evidence -- --input <json> --write-canonical',
    '',
    '说明：本脚本只校验/归档生产证据 JSON，不连接生产库，不调用生产 API。',
  ].join('\n'));
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

function statusLabel(status: EvidenceCheckStatus) {
  return status === 'pass' ? '通过' : '阻塞';
}

function formatRate(value: number | null) {
  if (value === null) return '-';
  return `${(value * 100).toFixed(2)}%`;
}

function toFiniteNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rateInRange(value: number | null) {
  return value !== null && value >= 0 && value <= 1;
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
