import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import type { AgentActor, AgentToolResult } from '../src/agent/agent.types.js';
import { AgentV2RuntimeService } from '../src/agent-v2/agent-v2-runtime.service.js';
import { AgentV2GrayStrategyService } from '../src/agent-v2/agent-v2-gray-strategy.service.js';
import { AgentV2ToolRegistryService } from '../src/agent-v2/agent-v2-tool-registry.service.js';
import { AgentV2CapabilityDecisionService } from '../src/agent-v2/capability/agent-v2-capability-decision.service.js';
import { AgentV2CapabilityMappingService } from '../src/agent-v2/capability/agent-v2-capability-mapping.service.js';
import { AgentV2AnswerContractValidatorService } from '../src/agent-v2/contracts/agent-v2-answer-contract-validator.service.js';
import { AgentV2IntentExtractionService } from '../src/agent-v2/intent/agent-v2-intent-extraction.service.js';
import { KnowledgeGraphIntentContextService } from '../src/agent-v2/intent/knowledge-graph-intent-context.service.js';

type EvalDraft = {
  id: string;
  question: string;
  expectedCapabilityId: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
};

type DiffCategory =
  | 'kg_correct_legacy_gap'
  | 'legacy_correct_kg_gap'
  | 'kg_correct_legacy_different'
  | 'legacy_correct_kg_different'
  | 'both_different_from_expected'
  | 'both_missing_expected';

type DiffAttribution = {
  id: string;
  question: string;
  expectedCapabilityId: string;
  kgCapabilityId: string | null;
  legacyCapabilityId: string | null;
  preferredCapabilityId: string | null;
  preferredFinalEngine: string | null;
  category: DiffCategory;
  kgMatchesExpected: boolean;
  legacyMatchesExpected: boolean;
  needsKgFix: boolean;
  retirementImpact: string;
};

const workspaceRoot = resolve(process.cwd(), '../..');
const docsRoot = resolve(workspaceRoot, 'docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03');
const evalDraftPath = resolve(docsRoot, 'agent-v2-eval-drafts.json');
const outputJsonPath = resolve(docsRoot, 'agent-v2-legacy-diff-attribution.json');
const outputMdPath = resolve(docsRoot, 'agent-v2-legacy-diff-attribution.md');

function main() {
  if (!existsSync(evalDraftPath)) {
    throw new Error(`缺少 eval drafts：${relativePath(evalDraftPath)}。请先运行 agent-v2 eval 题库生成。`);
  }

  const drafts = readJson<{ drafts: EvalDraft[] }>(evalDraftPath).drafts ?? [];
  const p0 = drafts.filter((draft) => draft.priority === 'P0');
  const diffs = attributeDiffs(p0);
  const summary = summarize(p0.length, diffs);
  const report = {
    generatedAt: formatShanghaiTime(new Date()),
    source: {
      evalDrafts: relativePath(evalDraftPath),
    },
    summary,
    diffs,
  };

  writeJson(outputJsonPath, report);
  writeMarkdown(outputMdPath, report);
  console.log(JSON.stringify(summary, null, 2));

  if (process.argv.includes('--strict-kg') && summary.needsKgFix > 0) process.exit(1);
}

function attributeDiffs(p0: EvalDraft[]): DiffAttribution[] {
  const actor: AgentActor = {
    storeId: 1,
    userId: 1,
    role: 'manager',
    entrypoint: 'legacy-diff-attribution',
    personaCode: 'manager',
    permissions: ['*'],
  };
  const runtime = createRuntimeSampler();
  const diffs: DiffAttribution[] = [];

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
      const preferred = runtime.plan({
        message: draft.question,
        actor,
        context: { agentV2GrayMode: 'kg_llm_preferred' },
      });
      const kgCapabilityId = kg?.plan.capabilityPlan?.capabilityId ?? null;
      const legacyCapabilityId = legacy?.plan.capabilityPlan?.capabilityId ?? null;
      if (kgCapabilityId === legacyCapabilityId) continue;
      diffs.push(classifyDiff({
        id: draft.id,
        question: draft.question,
        expectedCapabilityId: draft.expectedCapabilityId,
        kgCapabilityId,
        legacyCapabilityId,
        preferredCapabilityId: preferred?.plan.capabilityPlan?.capabilityId ?? null,
        preferredFinalEngine: preferred?.strategy.finalEngine ?? null,
      }));
    }
  });

  return diffs;
}

function classifyDiff(input: Omit<DiffAttribution, 'category' | 'kgMatchesExpected' | 'legacyMatchesExpected' | 'needsKgFix' | 'retirementImpact'>): DiffAttribution {
  const kgMatchesExpected = input.kgCapabilityId === input.expectedCapabilityId;
  const legacyMatchesExpected = input.legacyCapabilityId === input.expectedCapabilityId;
  const category = diffCategory(input.kgCapabilityId, input.legacyCapabilityId, input.expectedCapabilityId);
  const needsKgFix = !kgMatchesExpected;
  return {
    ...input,
    category,
    kgMatchesExpected,
    legacyMatchesExpected,
    needsKgFix,
    retirementImpact: retirementImpact(category),
  };
}

function diffCategory(kgCapabilityId: string | null, legacyCapabilityId: string | null, expectedCapabilityId: string): DiffCategory {
  const kgMatchesExpected = kgCapabilityId === expectedCapabilityId;
  const legacyMatchesExpected = legacyCapabilityId === expectedCapabilityId;
  if (kgMatchesExpected && !legacyCapabilityId) return 'kg_correct_legacy_gap';
  if (!kgCapabilityId && legacyMatchesExpected) return 'legacy_correct_kg_gap';
  if (kgMatchesExpected) return 'kg_correct_legacy_different';
  if (legacyMatchesExpected) return 'legacy_correct_kg_different';
  if (!kgCapabilityId && !legacyCapabilityId) return 'both_missing_expected';
  return 'both_different_from_expected';
}

function retirementImpact(category: DiffCategory) {
  switch (category) {
    case 'kg_correct_legacy_gap':
      return '新链路补齐旧链路缺口，删除旧正则不会降低该题命中能力。';
    case 'kg_correct_legacy_different':
      return '新链路与期望一致，旧链路命中相邻能力；可作为新链路改进样例。';
    case 'legacy_correct_kg_gap':
      return 'KG-only 未命中但旧链路正确；旧正则仍是兜底，需先补图谱/Manifest/映射。';
    case 'legacy_correct_kg_different':
      return 'KG-only 命中相邻能力但旧链路正确；需修正 KG 映射或互斥规则。';
    case 'both_missing_expected':
      return '新旧链路均未命中期望能力；需补能力或修正评测口径。';
    case 'both_different_from_expected':
      return '新旧链路均偏离期望或命中不同相邻能力；需产品/业务确认归因。';
  }
}

function summarize(totalP0: number, diffs: DiffAttribution[]) {
  const byCategory = diffs.reduce<Record<DiffCategory, number>>((acc, diff) => {
    acc[diff.category] = (acc[diff.category] ?? 0) + 1;
    return acc;
  }, {
    kg_correct_legacy_gap: 0,
    legacy_correct_kg_gap: 0,
    kg_correct_legacy_different: 0,
    legacy_correct_kg_different: 0,
    both_different_from_expected: 0,
    both_missing_expected: 0,
  });
  const kgMatchesExpected = diffs.filter((diff) => diff.kgMatchesExpected).length;
  const legacyMatchesExpected = diffs.filter((diff) => diff.legacyMatchesExpected).length;
  const needsKgFix = diffs.filter((diff) => diff.needsKgFix).length;
  return {
    totalP0,
    diffTotal: diffs.length,
    diffRate: ratio(diffs.length, totalP0),
    kgMatchesExpected,
    legacyMatchesExpected,
    needsKgFix,
    safeToRetireByAttribution: needsKgFix === 0,
    byCategory,
  };
}

function createRuntimeSampler() {
  const contextService = new KnowledgeGraphIntentContextService();
  const intentExtractionService = new AgentV2IntentExtractionService(contextService);
  const unsupportedTool = {
    execute: async (): Promise<AgentToolResult> => ({
      status: 'unsupported',
      title: 'Legacy diff attribution dry-run',
      summary: '差异归因只执行规划采样，不执行工具。',
      evidence: {
        source: ['agent-v2-legacy-diff-attribution'],
        metricDefinition: 'dry-run planning only',
        filters: [],
        sampleSize: 0,
      },
      actions: [],
    }),
  };
  return new AgentV2RuntimeService(
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
    '# Agent V2 KG-only 与旧正则差异归因报告',
    '',
    `生成时间：${report.generatedAt}`,
    `评测题来源：${report.source.evalDrafts}`,
    '',
    '## 摘要',
    '',
    `- P0 总数：${report.summary.totalP0}`,
    `- 差异数：${report.summary.diffTotal}`,
    `- 差异率：${formatPercent(report.summary.diffRate)}`,
    `- KG 命中期望：${report.summary.kgMatchesExpected}`,
    `- legacy 命中期望：${report.summary.legacyMatchesExpected}`,
    `- 需要修正 KG 的差异：${report.summary.needsKgFix}`,
    `- 是否可凭归因进入退役：${report.summary.safeToRetireByAttribution ? '可以' : '不可以'}`,
    '',
    '## 分类统计',
    '',
    '| 分类 | 数量 | 含义 |',
    '|---|---:|---|',
    ...Object.entries(report.summary.byCategory).map(([category, count]) => `| ${categoryLabel(category as DiffCategory)} | ${count} | ${retirementImpact(category as DiffCategory)} |`),
    '',
    '## 差异明细',
    '',
    '| ID | 问题 | 期望 | KG-only | legacy | preferred | 分类 | 退役影响 |',
    '|---|---|---|---|---|---|---|---|',
    ...report.diffs.map((diff) => `| ${diff.id} | ${escapeCell(diff.question)} | ${diff.expectedCapabilityId} | ${diff.kgCapabilityId ?? '-'} | ${diff.legacyCapabilityId ?? '-'} | ${diff.preferredCapabilityId ?? '-'} / ${diff.preferredFinalEngine ?? '-'} | ${categoryLabel(diff.category)} | ${diff.retirementImpact} |`),
  ];
  writeText(path, `${lines.join('\n')}\n`);
}

function buildReportShape() {
  return {
    generatedAt: '',
    source: {
      evalDrafts: '',
    },
    summary: {
      totalP0: 0,
      diffTotal: 0,
      diffRate: 0,
      kgMatchesExpected: 0,
      legacyMatchesExpected: 0,
      needsKgFix: 0,
      safeToRetireByAttribution: false,
      byCategory: {
        kg_correct_legacy_gap: 0,
        legacy_correct_kg_gap: 0,
        kg_correct_legacy_different: 0,
        legacy_correct_kg_different: 0,
        both_different_from_expected: 0,
        both_missing_expected: 0,
      } as Record<DiffCategory, number>,
    },
    diffs: [] as DiffAttribution[],
  };
}

function categoryLabel(category: DiffCategory) {
  switch (category) {
    case 'kg_correct_legacy_gap':
      return 'KG 正确 / legacy 缺口';
    case 'kg_correct_legacy_different':
      return 'KG 正确 / legacy 相邻';
    case 'legacy_correct_kg_gap':
      return 'legacy 正确 / KG 缺口';
    case 'legacy_correct_kg_different':
      return 'legacy 正确 / KG 相邻';
    case 'both_missing_expected':
      return '新旧均缺口';
    case 'both_different_from_expected':
      return '新旧均需复核';
  }
}

function ratio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(4));
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function escapeCell(value: string) {
  return value.replace(/\|/g, '/').replace(/\n/g, ' ');
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
