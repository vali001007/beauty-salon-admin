import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';

type GateStatus = 'pass' | 'fail';

type AuditGate = {
  id: string;
  title: string;
  expected: string;
  actual: string;
  status: GateStatus;
  impact: string;
};

type EvalGateReport = {
  metrics?: {
    preferredLegacyFallbackRate?: {
      value?: number;
      numerator?: number;
      denominator?: number;
      sampleCount?: number;
    };
  };
  samples?: {
    kgLegacyDiffs?: RuntimeSampleIssue[];
  };
};

type DiffAttributionReport = {
  summary?: {
    diffTotal?: number;
    kgMatchesExpected?: number;
    legacyMatchesExpected?: number;
    needsKgFix?: number;
    safeToRetireByAttribution?: boolean;
  };
  diffs?: DiffAttribution[];
};

type RetirementPreflightReport = {
  summary?: {
    localPreflightPass?: boolean;
    retirementReady?: boolean;
    productionEvidenceBlockers?: number;
  };
};

type RuntimeSampleIssue = {
  id?: string;
  question?: string;
  expectedCapabilityId?: string;
  kgCapabilityId?: string | null;
  legacyCapabilityId?: string | null;
  finalEngine?: string | null;
};

type DiffAttribution = RuntimeSampleIssue & {
  preferredCapabilityId?: string | null;
  preferredFinalEngine?: string | null;
  category?: string;
  kgMatchesExpected?: boolean;
  legacyMatchesExpected?: boolean;
  needsKgFix?: boolean;
};

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const outputJsonPath = resolve(docsRoot, 'agent-v2-legacy-dependency-audit.json');
const outputMdPath = resolve(docsRoot, 'agent-v2-legacy-dependency-audit.md');

const files = {
  runtime: resolve(workspaceRoot, 'packages/server-v2/src/agent-v2/agent-v2-runtime.service.ts'),
  runtimeSpec: resolve(workspaceRoot, 'packages/server-v2/src/agent-v2/agent-v2-runtime.service.spec.ts'),
  module: resolve(workspaceRoot, 'packages/server-v2/src/agent-v2/agent-v2.module.ts'),
  legacyDecision: resolve(workspaceRoot, 'packages/server-v2/src/agent-v2/capability/agent-v2-capability-decision.service.ts'),
  evalGateReport: resolve(docsRoot, 'agent-v2-eval-gate-report.json'),
  diffAttributionReport: resolve(docsRoot, 'agent-v2-legacy-diff-attribution.json'),
  retirementPreflight: resolve(docsRoot, 'agent-v2-legacy-retirement-preflight.json'),
};

const allowedProductionReferenceFiles = new Set([
  'packages/server-v2/src/agent-v2/agent-v2-runtime.service.ts',
  'packages/server-v2/src/agent-v2/agent-v2.module.ts',
  'packages/server-v2/src/agent-v2/capability/agent-v2-capability-decision.service.ts',
]);

function main() {
  const runtime = readText(files.runtime);
  const runtimeSpec = readText(files.runtimeSpec);
  const module = readText(files.module);
  const legacyDecision = readText(files.legacyDecision);
  const evalGateReport = existsSync(files.evalGateReport) ? readJson<EvalGateReport>(files.evalGateReport) : null;
  const diffAttributionReport = existsSync(files.diffAttributionReport) ? readJson<DiffAttributionReport>(files.diffAttributionReport) : null;
  const retirementPreflight = existsSync(files.retirementPreflight) ? readJson<RetirementPreflightReport>(files.retirementPreflight) : null;
  const references = findLegacyDecisionReferences();
  const predicateNames = Array.from(new Set([...legacyDecision.matchAll(/private\s+(is[A-Z][A-Za-z0-9_]*)\s*\(/g)].map((match) => match[1]))).sort();
  const maxPredicates = Number(process.env.AGENT_V2_LEGACY_REGEX_MAX_PREDICATES ?? 33);
  const gates = buildGates({
    runtime,
    runtimeSpec,
    module,
    legacyDecision,
    evalGateReport,
    diffAttributionReport,
    retirementPreflight,
    references,
    predicateNames,
    maxPredicates,
  });
  const pass = gates.every((gate) => gate.status === 'pass');
  const blockers = gates.filter((gate) => gate.status !== 'pass');
  const report = {
    generatedAt: formatShanghaiTime(new Date()),
    summary: {
      pass,
      gateCount: gates.length,
      blockerCount: blockers.length,
      legacyRegexPredicateCount: predicateNames.length,
      maxAllowedLegacyRegexPredicateCount: maxPredicates,
      productionReferenceCount: references.production.length,
      recommendation: pass
        ? '旧正则依赖边界已完成本地审计：保留为 legacy/shadow/kg_llm_preferred 回退和退役前对照，不作为 kg_llm_only 或 legacy_retired 正式选择路径。旧正则仍不可删除，需等待生产证据。'
        : '旧正则依赖边界不清晰；先修复失败门禁，再继续灰度或退役。',
    },
    source: Object.fromEntries(Object.entries(files).map(([key, path]) => [key, relativePath(path)])),
    legacyRegexPredicates: predicateNames,
    references,
    gates,
    blockers,
  };

  writeJson(outputJsonPath, report);
  writeMarkdown(outputMdPath, report);
  console.log(JSON.stringify(report.summary, null, 2));

  if (process.argv.includes('--strict') && !pass) {
    console.error('[agent-v2:legacy-dependency-audit] blockers');
    for (const blocker of blockers) {
      console.error(`- ${blocker.id}: ${blocker.actual}`);
    }
    printFailureSamples({ evalGateReport, diffAttributionReport });
    process.exit(1);
  }
}

function printFailureSamples(input: {
  evalGateReport: EvalGateReport | null;
  diffAttributionReport: DiffAttributionReport | null;
}) {
  const preferredFallbacks = (input.diffAttributionReport?.diffs ?? [])
    .filter((diff) => diff.preferredFinalEngine === 'legacy_regex')
    .slice(0, 10);
  const kgFixes = (input.diffAttributionReport?.diffs ?? [])
    .filter((diff) => diff.needsKgFix)
    .slice(0, 10);
  const kgLegacyDiffs = (input.evalGateReport?.samples?.kgLegacyDiffs ?? []).slice(0, 10);

  printSampleList('preferred legacy fallback samples', preferredFallbacks);
  printSampleList('KG fix required samples', kgFixes);
  printSampleList('eval KG/legacy diff samples', kgLegacyDiffs);
}

function printSampleList(title: string, samples: RuntimeSampleIssue[]) {
  if (!samples.length) return;
  console.error(`[agent-v2:legacy-dependency-audit] ${title}`);
  for (const sample of samples) {
    const diff = sample as DiffAttribution;
    console.error(
      [
        `- id=${sample.id ?? 'n/a'}`,
        `question=${JSON.stringify(sample.question ?? '')}`,
        `expected=${sample.expectedCapabilityId ?? 'n/a'}`,
        `kg=${sample.kgCapabilityId ?? 'n/a'}`,
        `legacy=${sample.legacyCapabilityId ?? 'n/a'}`,
        `preferred=${diff.preferredCapabilityId ?? 'n/a'}`,
        `preferredEngine=${diff.preferredFinalEngine ?? sample.finalEngine ?? 'n/a'}`,
        `category=${diff.category ?? 'n/a'}`,
        `needsKgFix=${diff.needsKgFix ?? 'n/a'}`,
      ].join(', '),
    );
  }
}

function buildGates(input: {
  runtime: string;
  runtimeSpec: string;
  module: string;
  legacyDecision: string;
  evalGateReport: EvalGateReport | null;
  diffAttributionReport: DiffAttributionReport | null;
  retirementPreflight: RetirementPreflightReport | null;
  references: ReturnType<typeof findLegacyDecisionReferences>;
  predicateNames: string[];
  maxPredicates: number;
}): AuditGate[] {
  const preferredFallback = input.evalGateReport?.metrics?.preferredLegacyFallbackRate;
  const preferredFallbackValue = toFiniteNumber(preferredFallback?.value);
  const diffSummary = input.diffAttributionReport?.summary;
  const retirementSummary = input.retirementPreflight?.summary;
  const unexpectedReferences = input.references.production.filter((item) => !allowedProductionReferenceFiles.has(item.file));

  return [
    gate(
      'legacy_service_reference_scope',
      '旧 CapabilityDecisionService 只在允许的生产边界被引用',
      '生产代码引用仅限 runtime、module 和 service 自身；测试引用不计入生产边界',
      unexpectedReferences.length
        ? unexpectedReferences.map((item) => `${item.file}:${item.lines.join(',')}`).join('; ')
        : input.references.production.map((item) => item.file).join(', '),
      unexpectedReferences.length === 0,
      '避免旧正则被新的正式能力选择链路、工具或治理 API 重新直接依赖。',
    ),
    gate(
      'legacy_predicate_inventory_frozen',
      '旧 isXxx 正则谓词不再继续扩张',
      `谓词数量 <= ${input.maxPredicates}`,
      `${input.predicateNames.length} predicates: ${input.predicateNames.slice(0, 8).join(', ')}${input.predicateNames.length > 8 ? ', ...' : ''}`,
      input.predicateNames.length > 0 && input.predicateNames.length <= input.maxPredicates,
      '旧规则未删除前允许保留审计对象，但不能再把新能力继续写进旧正则。',
    ),
    gate(
      'kg_modes_select_kg',
      '`kg_llm_only` / `legacy_retired` 正式路径不返回旧正则决策',
      'preferred 分支之后的默认返回使用 KG decision，finalEngine=kg_llm',
      input.runtime.includes('return {\n      decision: kg') && input.runtime.includes("finalEngine: 'kg_llm'") ? 'kg decision finalEngine present' : 'missing kg final path',
      input.runtime.includes('return {\n      decision: kg')
        && input.runtime.includes("finalEngine: 'kg_llm'")
        && input.runtime.includes("strategy.mode === 'kg_llm_preferred'")
        && input.runtime.includes("strategy.mode === 'legacy_regex'")
        && input.runtime.includes("strategy.mode === 'shadow'"),
      '最终接管模式下，能力选择来自 KG/LLM + Manifest，不从旧 `isXxx` 正则取正式结果。',
    ),
    gate(
      'legacy_fallback_labeled',
      '`kg_llm_preferred` 的旧链路回退有显式原因和架构标签',
      '回退原因包含 legacy_high_confidence_disagreement / kgFallbackReason，架构标记 agent_v2_legacy_fallback',
      [
        input.runtime.includes('legacy_high_confidence_disagreement') ? 'disagreement_reason=present' : 'disagreement_reason=missing',
        input.runtime.includes('kgFallbackReason') ? 'kg_fallback_reason=present' : 'kg_fallback_reason=missing',
        input.runtime.includes('agent_v2_legacy_fallback') ? 'architecture=present' : 'architecture=missing',
      ].join(', '),
      input.runtime.includes('legacy_high_confidence_disagreement')
        && input.runtime.includes('kgFallbackReason')
        && input.runtime.includes('agent_v2_legacy_fallback'),
      '回退不是隐形正式路径，运行审计和治理中心能识别这是旧链路兜底。',
    ),
    gate(
      'shadow_returns_legacy_by_design',
      'shadow 模式返回旧链路但记录 KG 对照',
      'shadow 分支有 fallbackReason=shadow_mode_returns_legacy_decision，并记录 kg/legacy capabilityId',
      input.runtime.includes('shadow_mode_returns_legacy_decision') ? 'shadow trace present' : 'shadow trace missing',
      input.runtime.includes('shadow_mode_returns_legacy_decision')
        && input.runtime.includes('kgSelectedCapabilityId')
        && input.runtime.includes('legacySelectedCapabilityId')
        && input.runtime.includes('agent_v2_shadow'),
      'shadow 仍是对照观察，不代表新架构正式接管。',
    ),
    gate(
      'runtime_tests_cover_boundaries',
      '运行时测试覆盖 KG 正式路径、旧链路回退和 shadow 对照',
      'spec 覆盖 KG preferred、legacy fallback、shadow returning legacy',
      [
        input.runtimeSpec.includes('can prefer KG intent') ? 'kg_preferred=present' : 'kg_preferred=missing',
        input.runtimeSpec.includes('falls back to legacy in kg_llm_preferred') ? 'fallback=present' : 'fallback=missing',
        input.runtimeSpec.includes('records shadow KG selection while returning legacy decision') ? 'shadow=present' : 'shadow=missing',
      ].join(', '),
      input.runtimeSpec.includes('can prefer KG intent')
        && input.runtimeSpec.includes('falls back to legacy in kg_llm_preferred')
        && input.runtimeSpec.includes('records shadow KG selection while returning legacy decision'),
      '后续改 runtime 时，测试能捕捉旧链路边界被误改的问题。',
    ),
    gate(
      'eval_preferred_fallback_rate_zero',
      '离线 strict gate 中 kg_llm_preferred 回退旧链路率为 0',
      '`preferredLegacyFallbackRate.value === 0`',
      preferredFallback
        ? `value=${preferredFallbackValue ?? 'n/a'}, numerator=${preferredFallback.numerator ?? 'n/a'}, denominator=${preferredFallback.denominator ?? preferredFallback.sampleCount ?? 'n/a'}`
        : 'missing preferredLegacyFallbackRate',
      preferredFallbackValue === 0,
      '本地评测口径下，新架构优先路径没有依赖旧正则完成 P0/P1 能力选择。',
    ),
    gate(
      'legacy_diff_attribution_safe',
      'KG-only 与 legacy 差异归因没有 KG 待修项',
      '`safeToRetireByAttribution=true` 且 `needsKgFix=0`',
      diffSummary
        ? `safe=${diffSummary.safeToRetireByAttribution}, needsKgFix=${diffSummary.needsKgFix ?? 'n/a'}, diffTotal=${diffSummary.diffTotal ?? 'n/a'}`
        : 'missing diff attribution report',
      Boolean(diffSummary?.safeToRetireByAttribution) && Number(diffSummary?.needsKgFix ?? 1) === 0,
      '差异主要体现旧链路缺口，不是新链路需要回退旧正则才能正确。',
    ),
    gate(
      'retirement_still_blocks_production_deletion',
      '旧正则仍被生产证据门禁阻止删除',
      'localPreflightPass=true，retirementReady=false，productionEvidenceBlockers>0',
      retirementSummary
        ? `local=${retirementSummary.localPreflightPass}, ready=${retirementSummary.retirementReady}, productionBlockers=${retirementSummary.productionEvidenceBlockers ?? 'n/a'}`
        : 'missing retirement preflight report',
      retirementSummary?.localPreflightPass === true
        && retirementSummary.retirementReady === false
        && Number(retirementSummary.productionEvidenceBlockers ?? 0) > 0,
      '本地审计通过不等于可删除旧正则；生产 7 天 shadow/有用率/回滚证据仍是硬门槛。',
    ),
  ];
}

function findLegacyDecisionReferences() {
  const srcRoot = resolve(workspaceRoot, 'packages/server-v2/src/agent-v2');
  const files = listTsFiles(srcRoot).filter((file) => !file.endsWith('.spec.ts') && !file.includes('/generated/'));
  const production = files
    .map((file) => {
      const text = readText(file);
      const lines = text.split(/\r?\n/);
      const matchedLines = lines
        .map((line, index) => ({ line, index: index + 1 }))
        .filter((item) => item.line.includes('AgentV2CapabilityDecisionService') || item.line.includes('decisionService.decide('))
        .map((item) => item.index);
      return matchedLines.length ? { file: relativePath(file), lines: matchedLines } : null;
    })
    .filter((item): item is { file: string; lines: number[] } => Boolean(item));
  return { production };
}

function listTsFiles(root: string): string[] {
  const entries = readdirSync(root);
  const result: string[] = [];
  for (const entry of entries) {
    const path = resolve(root, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      result.push(...listTsFiles(path));
    } else if (entry.endsWith('.ts')) {
      result.push(path);
    }
  }
  return result;
}

function gate(id: string, title: string, expected: string, actual: string, pass: boolean, impact: string): AuditGate {
  return { id, title, expected, actual, status: pass ? 'pass' : 'fail', impact };
}

function readText(path: string) {
  if (!existsSync(path)) throw new Error(`缺少旧正则依赖审计文件：${relativePath(path)}`);
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

function readJson<T>(path: string): T {
  return JSON.parse(readText(path)) as T;
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeMarkdown(path: string, report: {
  generatedAt: string;
  summary: {
    pass: boolean;
    blockerCount: number;
    legacyRegexPredicateCount: number;
    productionReferenceCount: number;
    recommendation: string;
  };
  source: Record<string, string>;
  legacyRegexPredicates: string[];
  references: ReturnType<typeof findLegacyDecisionReferences>;
  gates: AuditGate[];
}) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [
    '# Agent V2 旧正则依赖边界审计',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 结论',
    '',
    `- 通过：${report.summary.pass ? '是' : '否'}`,
    `- 阻塞项：${report.summary.blockerCount}`,
    `- 旧 isXxx 谓词数量：${report.summary.legacyRegexPredicateCount}`,
    `- 生产引用文件数：${report.summary.productionReferenceCount}`,
    `- 建议：${report.summary.recommendation}`,
    '',
    '## 检查文件',
    '',
    ...Object.entries(report.source).map(([key, value]) => `- ${key}: \`${value}\``),
    '',
    '## 门禁',
    '',
    '| 门禁 | 状态 | 期望 | 当前 | 交付影响 |',
    '| --- | --- | --- | --- | --- |',
    ...report.gates.map((gate) => [
      escapeMd(gate.title),
      gate.status === 'pass' ? '通过' : '失败',
      escapeMd(gate.expected),
      escapeMd(gate.actual),
      escapeMd(gate.impact),
    ].join(' | ')).map((line) => `| ${line} |`),
    '',
    '## 旧 isXxx 谓词清单',
    '',
    ...report.legacyRegexPredicates.map((name) => `- \`${name}\``),
    '',
    '## 生产引用边界',
    '',
    ...report.references.production.map((item) => `- \`${item.file}\`: ${item.lines.join(', ')}`),
    '',
    '## 边界',
    '',
    '- 本审计只读取本地源码和报告，不连接生产数据库，不调用生产 API。',
    '- 通过只证明旧正则依赖边界清晰；不代表旧正则已经可以删除。',
  ];
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

function escapeMd(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function relativePath(path: string) {
  return relative(workspaceRoot, path).replace(/\\/g, '/');
}

function formatShanghaiTime(date: Date) {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `${formatter.format(date).replace(/\//g, '-')} Asia/Shanghai`;
}

main();
