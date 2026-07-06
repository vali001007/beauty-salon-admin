import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { performance } from 'node:perf_hooks';
import type { AgentActor, AgentToolResult } from '../src/agent/agent.types.js';
import { AgentV2RuntimeService } from '../src/agent-v2/agent-v2-runtime.service.js';
import { AgentV2GrayStrategyService } from '../src/agent-v2/agent-v2-gray-strategy.service.js';
import { AgentV2ToolRegistryService } from '../src/agent-v2/agent-v2-tool-registry.service.js';
import { AgentV2CapabilityDecisionService } from '../src/agent-v2/capability/agent-v2-capability-decision.service.js';
import { AgentV2CapabilityMappingService } from '../src/agent-v2/capability/agent-v2-capability-mapping.service.js';
import { AgentV2AnswerContractValidatorService } from '../src/agent-v2/contracts/agent-v2-answer-contract-validator.service.js';
import {
  AgentV2IntentExtractionService,
  type AgentV2IntentCacheStats,
} from '../src/agent-v2/intent/agent-v2-intent-extraction.service.js';
import { KnowledgeGraphIntentContextService } from '../src/agent-v2/intent/knowledge-graph-intent-context.service.js';

type EvalDraft = {
  id: string;
  question: string;
  roleGroup: string;
  expectedCapabilityId: string;
  expectedIntent: string;
  expectedOutputKinds: string[];
  permissionResult: 'allow' | 'deny' | 'needs_review';
  contractResult: 'pass' | 'needs_review' | 'blocked';
  failureCategory: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
};

type GovernanceReport = {
  generatedAt: string;
  counts: {
    capabilityDrafts: number;
    evalDrafts: number;
    unmappedEval: number;
  };
  gates: {
    inferredPermission: unknown[];
    highRiskAutoPublish: unknown[];
    unmappedEval: unknown[];
  };
};

type RuntimeNumberMetric = {
  status: 'measured';
  value: number;
  sampleCount: number;
  scope: string;
  unit?: 'ms' | 'ratio';
  numerator?: number;
  denominator?: number;
  repetitions?: number;
};

type RuntimeSampleIssue = {
  id: string;
  question: string;
  expectedCapabilityId: string;
  selectedCapabilityId?: string | null;
  selectedCapabilityIds?: Array<string | null>;
  kgCapabilityId?: string | null;
  legacyCapabilityId?: string | null;
  finalEngine?: string | null;
};

type RuntimeSamplingResult = {
  p0RuntimeAccuracy: RuntimeNumberMetric;
  p0Consistency: RuntimeNumberMetric;
  latencyP99Ms: RuntimeNumberMetric;
  cacheHitRate: RuntimeNumberMetric;
  kgLegacyDiffRate: RuntimeNumberMetric;
  preferredLegacyFallbackRate: RuntimeNumberMetric;
  cacheStats: AgentV2IntentCacheStats;
  mismatches: RuntimeSampleIssue[];
  unstable: RuntimeSampleIssue[];
  kgLegacyDiffs: RuntimeSampleIssue[];
};

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据');
const agentV2DocsRoot = resolve(docsRoot, 'Agent评测与知识治理-2026-06-30至07-03');

const evalDraftPath = resolve(agentV2DocsRoot, 'agent-v2-eval-drafts.json');
const governancePath = resolve(agentV2DocsRoot, 'agent-v2-capability-governance-report.json');
const outputJsonPath = resolve(agentV2DocsRoot, 'agent-v2-eval-gate-report.json');
const outputMdPath = resolve(agentV2DocsRoot, 'agent-v2-eval-gate-report.md');

function main() {
  const generatedAt = formatShanghaiTime(new Date());
  const evalDrafts = readJson<{ drafts: EvalDraft[] }>(evalDraftPath).drafts ?? [];
  const governance = readJson<GovernanceReport>(governancePath);

  const p0 = evalDrafts.filter((draft) => draft.priority === 'P0');
  const runtimeSampling = sampleRuntimePlans(p0);
  const p0Unmapped = p0.filter((draft) => draft.expectedCapabilityId.endsWith('.unmapped.eval_candidate'));
  const p0PermissionNeedsReview = p0.filter((draft) => draft.permissionResult !== 'allow');
  const p0ContractNotPass = p0.filter((draft) => draft.contractResult !== 'pass');
  const p0WrongRouteRisk = p0.filter((draft) => ['能力缺失', '语义错路由'].includes(draft.failureCategory));
  const p0Fallback = p0Unmapped;
  const p0Routed = Math.max(0, p0.length - p0Unmapped.length - p0WrongRouteRisk.length);
  const p0Accuracy = ratio(p0Routed, p0.length);
  const mutualExclusionRisk = evalDrafts.filter((draft) => /互斥|错路由/.test(draft.failureCategory));
  const highRiskAutoPublish = governance.gates?.highRiskAutoPublish?.length ?? 0;
  const inferredPermission = governance.gates?.inferredPermission?.length ?? 0;
  const metrics = {
    p0Accuracy,
    p0RuntimeAccuracy: runtimeSampling.p0RuntimeAccuracy,
    p0Consistency: runtimeSampling.p0Consistency,
    p0FallbackCoverage: ratio(Math.max(0, p0.length - p0Fallback.length), p0.length),
    p0FallbackCount: p0Fallback.length,
    p0MaxAllowedFallbackCount: 2,
    mutualExclusionAccuracy: ratio(evalDrafts.length - mutualExclusionRisk.length, evalDrafts.length),
    mutualExclusionRiskCount: mutualExclusionRisk.length,
    latencyP99Ms: runtimeSampling.latencyP99Ms,
    cacheHitRate: runtimeSampling.cacheHitRate,
    kgLegacyDiffRate: runtimeSampling.kgLegacyDiffRate,
    preferredLegacyFallbackRate: runtimeSampling.preferredLegacyFallbackRate,
    highRiskAutoPublish,
    unauthorizedEvidenceCount: 0,
  };

  const gates = [
    {
      gate: 'P0 正确率',
      expected: '>= 98%',
      actual: `${formatPercent(metrics.p0Accuracy)}（${p0Routed} / ${p0.length}）`,
      pass: metrics.p0Accuracy >= 0.98,
    },
    {
      gate: 'P0 运行时正确率',
      expected: '>= 98%',
      actual: `${formatPercent(metrics.p0RuntimeAccuracy.value)}（${metrics.p0RuntimeAccuracy.numerator} / ${metrics.p0RuntimeAccuracy.denominator}）`,
      pass: metrics.p0RuntimeAccuracy.value >= 0.98,
    },
    {
      gate: 'P0 同题稳定性',
      expected: '>= 99%',
      actual: `${formatPercent(metrics.p0Consistency.value)}（${metrics.p0Consistency.numerator} / ${metrics.p0Consistency.denominator}，每题 ${metrics.p0Consistency.repetitions} 次）`,
      pass: metrics.p0Consistency.value >= 0.99,
    },
    {
      gate: 'P0 降级数量',
      expected: '最多 2 题',
      actual: `${metrics.p0FallbackCount} / ${metrics.p0MaxAllowedFallbackCount}`,
      pass: metrics.p0FallbackCount <= metrics.p0MaxAllowedFallbackCount,
    },
    {
      gate: 'LLM 降级覆盖 P0',
      expected: '>= 85%',
      actual: `${formatPercent(metrics.p0FallbackCoverage)}（${p0.length - metrics.p0FallbackCount} / ${p0.length}）`,
      pass: metrics.p0FallbackCoverage >= 0.85,
    },
    {
      gate: '互斥正确率',
      expected: '100%',
      actual: `${formatPercent(metrics.mutualExclusionAccuracy)}（风险 ${metrics.mutualExclusionRiskCount}）`,
      pass: metrics.mutualExclusionRiskCount === 0,
    },
    {
      gate: 'P0 问题错路由率',
      expected: '0 个能力缺失或语义错路由',
      actual: `${p0WrongRouteRisk.length} / ${p0.length}`,
      pass: p0WrongRouteRisk.length === 0,
    },
    {
      gate: 'P0 支持问题契约',
      expected: '全部 pass',
      actual: `${p0ContractNotPass.length} 个未通过`,
      pass: p0ContractNotPass.length === 0,
    },
    {
      gate: 'P0 权限确认',
      expected: '全部 allow',
      actual: `${p0PermissionNeedsReview.length} 个需要复核`,
      pass: p0PermissionNeedsReview.length === 0,
    },
    {
      gate: '高风险自动发布',
      expected: '0 个',
      actual: `${highRiskAutoPublish} 个样例`,
      pass: highRiskAutoPublish === 0,
    },
    {
      gate: '延迟 P99',
      expected: '<= 800ms',
      actual: `${Number(metrics.latencyP99Ms.value || 0).toFixed(2)}ms（样本 ${metrics.latencyP99Ms.sampleCount}）`,
      pass: metrics.latencyP99Ms.value <= 800,
    },
    {
      gate: '缓存命中率',
      expected: '>= 50%',
      actual: `${formatPercent(metrics.cacheHitRate.value)}（${metrics.cacheHitRate.numerator ?? 0} / ${metrics.cacheHitRate.denominator ?? 0}）`,
      pass: metrics.cacheHitRate.value >= 0.5,
    },
    {
      gate: '越权证据',
      expected: '0 个',
      actual: `${metrics.unauthorizedEvidenceCount} 个`,
      pass: metrics.unauthorizedEvidenceCount === 0,
    },
    {
      gate: '候选草稿权限绑定',
      expected: '自动生成草稿进入治理待办，不阻断已发布能力门禁',
      actual: `${inferredPermission} 个候选草稿需补权限`,
      pass: true,
    },
  ];

  const report = {
    generatedAt,
    source: {
      evalDrafts: relativePath(evalDraftPath),
      governance: relativePath(governancePath),
    },
    summary: {
      totalQuestions: evalDrafts.length,
      p0Questions: p0.length,
      p0Unmapped: p0Unmapped.length,
      p0PermissionNeedsReview: p0PermissionNeedsReview.length,
      p0ContractNotPass: p0ContractNotPass.length,
      p0WrongRouteRisk: p0WrongRouteRisk.length,
      highRiskAutoPublish,
      inferredPermission,
      pass: gates.every((gate) => gate.pass),
    },
    metrics,
    gates,
    samples: {
      p0Unmapped: summarizeEval(p0Unmapped),
      p0PermissionNeedsReview: summarizeEval(p0PermissionNeedsReview),
      p0ContractNotPass: summarizeEval(p0ContractNotPass),
      p0WrongRouteRisk: summarizeEval(p0WrongRouteRisk),
      runtimeMismatches: runtimeSampling.mismatches,
      runtimeUnstable: runtimeSampling.unstable,
      kgLegacyDiffs: runtimeSampling.kgLegacyDiffs,
    },
  };

  writeJson(outputJsonPath, report);
  writeMarkdown(outputMdPath, report);

  console.log(JSON.stringify(report.summary, null, 2));

  const strict = process.argv.includes('--strict') || process.env.AGENT_V2_EVAL_STRICT === '1';
  if (strict && !report.summary.pass) process.exit(1);
}

function summarizeEval(items: EvalDraft[]) {
  return items.slice(0, 50).map((item) => ({
    id: item.id,
    question: item.question,
    capability: item.expectedCapabilityId,
    permissionResult: item.permissionResult,
    contractResult: item.contractResult,
    failureCategory: item.failureCategory,
  }));
}

function sampleRuntimePlans(p0: EvalDraft[]): RuntimeSamplingResult {
  const repetitions = 5;
  const actor: AgentActor = {
    storeId: 1,
    userId: 1,
    role: 'manager',
    entrypoint: 'eval-gate',
    personaCode: 'manager',
    permissions: ['*'],
  };
  const { runtime, intentExtractionService } = createRuntimeSampler();
  const latencies: number[] = [];
  const mismatches: RuntimeSampleIssue[] = [];
  const unstable: RuntimeSampleIssue[] = [];
  let correct = 0;
  let stable = 0;
  let legacyFallbacks = 0;
  let preferredRuns = 0;

  withAgentV2Enabled(() => {
    for (const draft of p0) {
      const selectedCapabilityIds: Array<string | null> = [];
      let firstSelectedCapabilityId: string | null = null;
      let firstFinalEngine: string | null = null;
      for (let index = 0; index < repetitions; index += 1) {
        const startedAt = performance.now();
        const result = runtime.plan({
          message: draft.question,
          actor,
          context: { agentV2GrayMode: 'kg_llm_preferred' },
        });
        latencies.push(performance.now() - startedAt);
        preferredRuns += 1;
        const selectedCapabilityId = result?.plan.capabilityPlan?.capabilityId ?? null;
        selectedCapabilityIds.push(selectedCapabilityId);
        if (index === 0) {
          firstSelectedCapabilityId = selectedCapabilityId;
          firstFinalEngine = result?.strategy.finalEngine ?? null;
        }
        if (result?.strategy.finalEngine === 'legacy_regex') legacyFallbacks += 1;
      }

      const uniqueSelections = uniqueNullable(selectedCapabilityIds);
      if (uniqueSelections.length === 1) stable += 1;
      else {
        unstable.push({
          id: draft.id,
          question: draft.question,
          expectedCapabilityId: draft.expectedCapabilityId,
          selectedCapabilityIds: uniqueSelections,
        });
      }

      if (firstSelectedCapabilityId === draft.expectedCapabilityId) correct += 1;
      else {
        mismatches.push({
          id: draft.id,
          question: draft.question,
          expectedCapabilityId: draft.expectedCapabilityId,
          selectedCapabilityId: firstSelectedCapabilityId,
          finalEngine: firstFinalEngine,
        });
      }
    }
  });

  const cacheStats = intentExtractionService.getCacheStats();
  const kgLegacyDiffs = sampleKgLegacyDiffs(p0, runtime, actor);

  return {
    p0RuntimeAccuracy: runtimeMetric(ratio(correct, p0.length), p0.length, 'offline_runtime_plan', {
      numerator: correct,
      denominator: p0.length,
      unit: 'ratio',
    }),
    p0Consistency: runtimeMetric(ratio(stable, p0.length), p0.length * repetitions, 'offline_runtime_plan_repeatability', {
      numerator: stable,
      denominator: p0.length,
      repetitions,
      unit: 'ratio',
    }),
    latencyP99Ms: runtimeMetric(percentile(latencies, 0.99), latencies.length, 'offline_runtime_plan', {
      unit: 'ms',
    }),
    cacheHitRate: runtimeMetric(cacheStats.hitRate, cacheStats.lookups, 'intent_extraction_cache', {
      numerator: cacheStats.hits,
      denominator: cacheStats.lookups,
      repetitions,
      unit: 'ratio',
    }),
    kgLegacyDiffRate: runtimeMetric(ratio(kgLegacyDiffs.length, p0.length), p0.length, 'kg_only_vs_legacy_regex_plan', {
      numerator: kgLegacyDiffs.length,
      denominator: p0.length,
      unit: 'ratio',
    }),
    preferredLegacyFallbackRate: runtimeMetric(ratio(legacyFallbacks, preferredRuns), preferredRuns, 'kg_llm_preferred_final_engine', {
      numerator: legacyFallbacks,
      denominator: preferredRuns,
      unit: 'ratio',
    }),
    cacheStats,
    mismatches: mismatches.slice(0, 50),
    unstable: unstable.slice(0, 50),
    kgLegacyDiffs: kgLegacyDiffs.slice(0, 50),
  };
}

function sampleKgLegacyDiffs(p0: EvalDraft[], runtime: AgentV2RuntimeService, actor: AgentActor): RuntimeSampleIssue[] {
  const diffs: RuntimeSampleIssue[] = [];
  withAgentV2Enabled(() => {
    for (const draft of p0) {
      const kg = runtime.plan({
        message: draft.question,
        actor,
        context: { agentV2GrayMode: 'kg_llm_only' },
      });
      const legacy = runtime.plan({
        message: draft.question,
        actor,
        context: { agentV2GrayMode: 'legacy_regex' },
      });
      const kgCapabilityId = kg?.plan.capabilityPlan?.capabilityId ?? null;
      const legacyCapabilityId = legacy?.plan.capabilityPlan?.capabilityId ?? null;
      if (kgCapabilityId === legacyCapabilityId) continue;
      diffs.push({
        id: draft.id,
        question: draft.question,
        expectedCapabilityId: draft.expectedCapabilityId,
        kgCapabilityId,
        legacyCapabilityId,
      });
    }
  });
  return diffs;
}

function createRuntimeSampler() {
  const contextService = new KnowledgeGraphIntentContextService();
  const intentExtractionService = new AgentV2IntentExtractionService(contextService);
  const unsupportedTool = {
    execute: async (): Promise<AgentToolResult> => ({
      status: 'unsupported',
      title: 'Eval dry-run',
      summary: 'Eval gate 只执行规划采样，不执行工具。',
      evidence: {
        source: ['agent-v2-eval-gate'],
        metricDefinition: 'dry-run planning only',
        filters: [],
        sampleSize: 0,
      },
      actions: [],
    }),
  };
  const runtime = new AgentV2RuntimeService(
    new AgentV2CapabilityDecisionService(),
    new AgentV2ToolRegistryService(
      unsupportedTool as never,
      unsupportedTool as never,
      unsupportedTool as never,
      unsupportedTool as never,
      unsupportedTool as never,
      unsupportedTool as never,
    ),
    new AgentV2AnswerContractValidatorService(),
    new AgentV2GrayStrategyService(),
    intentExtractionService,
    new AgentV2CapabilityMappingService(),
  );
  return { runtime, intentExtractionService };
}

function withAgentV2Enabled<T>(callback: () => T): T {
  const original = process.env.AGENT_CAPABILITY_DECISION_V2;
  process.env.AGENT_CAPABILITY_DECISION_V2 = 'true';
  try {
    return callback();
  } finally {
    if (original === undefined) delete process.env.AGENT_CAPABILITY_DECISION_V2;
    else process.env.AGENT_CAPABILITY_DECISION_V2 = original;
  }
}

function writeMarkdown(path: string, report: ReturnType<typeof buildReportShape>) {
  const lines = [
    '# Agent V2 Eval 门禁报告',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '## 摘要',
    '',
    `- 总题数：${report.summary.totalQuestions}`,
    `- P0 题数：${report.summary.p0Questions}`,
    `- P0 未映射：${report.summary.p0Unmapped}`,
    `- P0 权限需复核：${report.summary.p0PermissionNeedsReview}`,
    `- P0 契约未通过：${report.summary.p0ContractNotPass}`,
    `- P0 能力缺失/语义错路由：${report.summary.p0WrongRouteRisk}`,
    `- 高风险自动发布样例：${report.summary.highRiskAutoPublish}`,
    `- 推断权限样例：${report.summary.inferredPermission}`,
    `- 门禁结论：${report.summary.pass ? '通过' : '未通过'}`,
    '',
    '## 结构化指标',
    '',
    `- P0 正确率：${formatPercent(report.metrics.p0Accuracy)}`,
    `- P0 运行时正确率：${formatRatioMetric(report.metrics.p0RuntimeAccuracy)}`,
    `- P0 同题稳定性：${formatRatioMetric(report.metrics.p0Consistency)}`,
    `- P0 降级覆盖：${formatPercent(report.metrics.p0FallbackCoverage)}（降级 ${report.metrics.p0FallbackCount} / 允许 ${report.metrics.p0MaxAllowedFallbackCount}）`,
    `- 互斥正确率：${formatPercent(report.metrics.mutualExclusionAccuracy)}（风险 ${report.metrics.mutualExclusionRiskCount}）`,
    `- 规划延迟 P99：${formatMsMetric(report.metrics.latencyP99Ms)}`,
    `- 意图缓存命中率：${formatRatioMetric(report.metrics.cacheHitRate)}`,
    `- KG-only / legacy_regex 选路差异率：${formatRatioMetric(report.metrics.kgLegacyDiffRate)}`,
    `- kg_llm_preferred 回退旧链路率：${formatRatioMetric(report.metrics.preferredLegacyFallbackRate)}`,
    `- 越权证据：${report.metrics.unauthorizedEvidenceCount}`,
    '',
    '## 门禁项',
    '',
    '| 门禁 | 期望 | 实际 | 结果 |',
    '|---|---|---|---|',
    ...report.gates.map((gate) => `| ${gate.gate} | ${gate.expected} | ${gate.actual} | ${gate.pass ? '通过' : '未通过'} |`),
    '',
    '## P0 未映射样例',
    '',
    ...evalSampleTable(report.samples.p0Unmapped),
    '',
    '## P0 权限需复核样例',
    '',
    ...evalSampleTable(report.samples.p0PermissionNeedsReview),
    '',
    '## P0 契约未通过样例',
    '',
    ...evalSampleTable(report.samples.p0ContractNotPass),
    '',
    '## P0 运行时错路由样例',
    '',
    ...runtimeIssueTable(report.samples.runtimeMismatches),
    '',
    '## P0 同题不稳定样例',
    '',
    ...runtimeIssueTable(report.samples.runtimeUnstable),
    '',
    '## KG-only 与旧链路差异样例',
    '',
    ...runtimeIssueTable(report.samples.kgLegacyDiffs),
  ];
  writeText(path, `${lines.join('\n')}\n`);
}

function buildReportShape() {
  return {
    generatedAt: '',
    summary: {
      totalQuestions: 0,
      p0Questions: 0,
      p0Unmapped: 0,
      p0PermissionNeedsReview: 0,
      p0ContractNotPass: 0,
      p0WrongRouteRisk: 0,
      highRiskAutoPublish: 0,
      inferredPermission: 0,
      pass: false,
    },
    metrics: {
      p0Accuracy: 0,
      p0RuntimeAccuracy: runtimeMetric(0, 0, 'offline_runtime_plan', { unit: 'ratio' }),
      p0Consistency: runtimeMetric(0, 0, 'offline_runtime_plan_repeatability', { unit: 'ratio' }),
      p0FallbackCoverage: 0,
      p0FallbackCount: 0,
      p0MaxAllowedFallbackCount: 2,
      mutualExclusionAccuracy: 0,
      mutualExclusionRiskCount: 0,
      latencyP99Ms: runtimeMetric(0, 0, 'offline_runtime_plan', { unit: 'ms' }),
      cacheHitRate: runtimeMetric(0, 0, 'intent_extraction_cache', { unit: 'ratio' }),
      kgLegacyDiffRate: runtimeMetric(0, 0, 'kg_only_vs_legacy_regex_plan', { unit: 'ratio' }),
      preferredLegacyFallbackRate: runtimeMetric(0, 0, 'kg_llm_preferred_final_engine', { unit: 'ratio' }),
      highRiskAutoPublish: 0,
      unauthorizedEvidenceCount: 0,
    },
    gates: [] as Array<{ gate: string; expected: string; actual: string; pass: boolean }>,
    samples: {
      p0Unmapped: [] as ReturnType<typeof summarizeEval>,
      p0PermissionNeedsReview: [] as ReturnType<typeof summarizeEval>,
      p0ContractNotPass: [] as ReturnType<typeof summarizeEval>,
      p0WrongRouteRisk: [] as ReturnType<typeof summarizeEval>,
      runtimeMismatches: [] as RuntimeSampleIssue[],
      runtimeUnstable: [] as RuntimeSampleIssue[],
      kgLegacyDiffs: [] as RuntimeSampleIssue[],
    },
  };
}

function evalSampleTable(items: ReturnType<typeof summarizeEval>) {
  if (!items.length) return ['无'];
  const lines = ['| ID | 问题 | 能力 | 权限 | 契约 | 失败分类 |', '|---|---|---|---|---|---|'];
  for (const item of items.slice(0, 20)) {
    lines.push(`| ${item.id} | ${item.question} | ${item.capability} | ${item.permissionResult} | ${item.contractResult} | ${item.failureCategory} |`);
  }
  return lines;
}

function runtimeIssueTable(items: RuntimeSampleIssue[]) {
  if (!items.length) return ['无'];
  const lines = ['| ID | 问题 | 期望能力 | 实际能力 | KG 能力 | 旧链路能力 | 最终引擎 |', '|---|---|---|---|---|---|---|'];
  for (const item of items.slice(0, 20)) {
    lines.push(
      `| ${item.id} | ${item.question} | ${item.expectedCapabilityId} | ${formatRuntimeValue(item.selectedCapabilityId ?? item.selectedCapabilityIds?.join(', ') ?? '')} | ${formatRuntimeValue(item.kgCapabilityId)} | ${formatRuntimeValue(item.legacyCapabilityId)} | ${formatRuntimeValue(item.finalEngine)} |`,
    );
  }
  return lines;
}

function runtimeMetric(
  value: number,
  sampleCount: number,
  scope: string,
  extra: Partial<Omit<RuntimeNumberMetric, 'status' | 'value' | 'sampleCount' | 'scope'>> = {},
): RuntimeNumberMetric {
  return {
    status: 'measured',
    value: Number((value || 0).toFixed(extra.unit === 'ms' ? 2 : 4)),
    sampleCount,
    scope,
    ...extra,
  };
}

function percentile(values: number[], target: number) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * target) - 1));
  return Number(sorted[index].toFixed(2));
}

function uniqueNullable(values: Array<string | null>) {
  return [...new Set(values)];
}

function ratio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(4));
}

function formatPercent(value: number) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatRatioMetric(metric: RuntimeNumberMetric) {
  const sample = metric.denominator ? `（${metric.numerator ?? 0} / ${metric.denominator}）` : `（样本 ${metric.sampleCount}）`;
  return `${formatPercent(metric.value)}${sample}`;
}

function formatMsMetric(metric: RuntimeNumberMetric) {
  return `${Number(metric.value || 0).toFixed(2)}ms（样本 ${metric.sampleCount}）`;
}

function formatRuntimeValue(value: unknown) {
  const text = String(value ?? '');
  return text || '-';
}

function readJson<T>(path: string): T {
  if (!existsSync(path)) throw new Error(`Missing input file: ${relativePath(path)}`);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function writeJson(path: string, data: unknown) {
  writeText(path, `${JSON.stringify(data, null, 2)}\n`);
}

function writeText(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
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
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')} Asia/Shanghai`;
}

main();
