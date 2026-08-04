import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AskDataClarificationPolicy } from '../src/ask-data-free-sql/ask-data-clarification-policy.js';
import { ASK_DATA_FREE_SQL_VIEWS } from '../src/ask-data-free-sql/ask-data-free-sql.catalog.js';
import { AskDataIntentParser } from '../src/ask-data-free-sql/ask-data-intent-parser.js';
import { rankAskDataSemanticIndex } from '../src/ask-data-free-sql/ask-data-semantic-index.js';
import { AskDataSemanticRouter } from '../src/ask-data-free-sql/ask-data-semantic-router.js';
import { buildAskDataQueryPlan } from '../src/ask-data-free-sql/ask-data-query-plan.js';
import { validateAskDataQueryPlan } from '../src/ask-data-free-sql/ask-data-query-plan-validator.js';
import { validateAskDataGoldRoutePlanMatch } from './ask-data-gold-plan-match.js';

type GoldContract = {
  id: string;
  split: 'development' | 'holdout';
  question: string;
  expectedMetricKeys: string[];
  acceptableViews: string[];
  requiredViews: string[];
  requiredOutputFields: string[];
  requiredResultMode?: 'scalar' | 'detail' | 'grouped' | 'ranking' | 'trend';
  runtimeResolutionRequired: boolean;
  mustClarify: boolean;
  allowedClarificationSlots: string[];
};

type GoldReport = { queryContracts: GoldContract[]; boundaryContracts: GoldContract[] };

type SemanticEvalResult = {
  id: string;
  split: GoldContract['split'];
  question: string;
  expectedMetricKeys: string[];
  acceptableViews: string[];
  requiredViews: string[];
  requiredOutputFields: string[];
  requiredResultMode: GoldContract['requiredResultMode'];
  mustClarify: boolean;
  indexMetrics: string[];
  indexViews: string[];
  routeViews: string[];
  metricTop1Hit: boolean;
  acceptableTop1Hit: boolean;
  acceptableRecallAt4: boolean;
  requiredRecallAt4: boolean;
  routeAcceptableHit: boolean;
  clarificationCorrect: boolean;
  clarificationQuestion?: string;
  clarificationReason?: string;
  fallbackEligible: boolean;
  confidence: number;
  planValid: boolean;
  planReason?: string;
  planRequiredViews: string[];
  planOutputFields: string[];
  planResultMode: GoldContract['requiredResultMode'];
  planRequiredOutputHit: boolean;
  planResultModeHit: boolean;
  routePlanContractMatched: boolean;
  routePlanContractReasons: string[];
  durationMs: number;
};

const strict = process.argv.includes('--strict');
const goldPath = resolve(
  process.cwd(),
  argumentValue('--gold=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask统一Gold题库-v1.json',
);
const outputPath = resolve(
  process.cwd(),
  argumentValue('--output=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask统一Gold语义路由评测-v1.json',
);
const markdownPath = resolve(
  process.cwd(),
  argumentValue('--markdown=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask统一Gold语义路由评测-v1.md',
);
const gold = JSON.parse(readFileSync(goldPath, 'utf8')) as GoldReport;
const parser = new AskDataIntentParser();
const modelStub = { generateStructured: async () => { throw new Error('model_disabled'); } };
const router = new AskDataSemanticRouter(modelStub as never, parser, new AskDataClarificationPolicy());
const context = { userId: 0, storeId: 6, permissions: ['*'], deniedPermissions: [] as string[] };

const results: SemanticEvalResult[] = [];
for (const item of gold.queryContracts) {
  const startedAt = performance.now();
  const parsed = parser.parse(item.question, new Date('2026-08-02T00:00:00.000Z'));
  const ranked = rankAskDataSemanticIndex({
    question: item.question,
    parsed,
    authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
    maxCandidates: 8,
  });
  const route = await router.route({
    question: item.question,
    context,
    authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
    config: { enabled: true, shadow: false, modelFallback: false, minConfidence: 0.75 },
  });
  const indexViews = ranked.map((entry) => entry.view.viewName);
  const routeViews = route.candidateViews.map((view) => view.viewName);
  const indexMetrics = ranked.map((entry) => entry.contract.metricKey);
  const plan = buildAskDataQueryPlan({
    question: item.question,
    semanticIntent: route.semanticIntent,
    candidateViews: route.candidateViews,
  });
  const planValidation = validateAskDataQueryPlan(plan, route.candidateViews);
  const routePlanContract = validateAskDataGoldRoutePlanMatch(item, {
    semanticMetricKeys: route.semanticIntent.metricKeys,
    candidateViews: routeViews,
    planMetricKeys: plan.metricKeys,
    planRequiredViews: plan.requiredViewNames,
  });
  results.push({
    id: item.id,
    split: item.split,
    question: item.question,
    expectedMetricKeys: item.expectedMetricKeys,
    acceptableViews: item.acceptableViews,
    requiredViews: item.requiredViews,
    requiredOutputFields: item.requiredOutputFields,
    requiredResultMode: item.requiredResultMode,
    mustClarify: item.mustClarify,
    indexMetrics,
    indexViews,
    routeViews,
    metricTop1Hit: item.expectedMetricKeys.includes(indexMetrics[0]),
    acceptableTop1Hit: item.acceptableViews.includes(indexViews[0]),
    acceptableRecallAt4: indexViews.slice(0, 4).some((viewName) => item.acceptableViews.includes(viewName)),
    requiredRecallAt4: item.requiredViews.every((viewName) => routeViews.slice(0, 4).includes(viewName)),
    routeAcceptableHit: routeViews.some((viewName) => item.acceptableViews.includes(viewName)),
    clarificationCorrect: item.mustClarify === Boolean(route.clarificationQuestion),
    clarificationQuestion: route.clarificationQuestion,
    clarificationReason: route.clarificationReason,
    fallbackEligible: Boolean(route.fallbackReason),
    confidence: route.semanticIntent.confidence,
    planValid: planValidation.valid,
    ...(!planValidation.valid ? { planReason: planValidation.reasonCode } : {}),
    planRequiredViews: plan.requiredViewNames,
    planOutputFields: plan.requiredOutputFields,
    planResultMode: plan.resultMode,
    planRequiredOutputHit: (item.requiredOutputFields ?? []).every((field) => plan.requiredOutputFields.includes(field)),
    planResultModeHit: !item.requiredResultMode || item.requiredResultMode === plan.resultMode,
    routePlanContractMatched: routePlanContract.valid,
    routePlanContractReasons: routePlanContract.reasonCodes,
    durationMs: Number((performance.now() - startedAt).toFixed(3)),
  });
}

const ambiguityResults = [];
for (const item of gold.boundaryContracts.filter((contract) => contract.mustClarify && !contract.runtimeResolutionRequired)) {
  const route = await router.route({
    question: item.question,
    context,
    authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
    config: { enabled: true, shadow: false, modelFallback: false, minConfidence: 0.75 },
  });
  const actualSlots = route.semanticIntent.ambiguities.map((ambiguity) => ambiguity.slot);
  ambiguityResults.push({
    id: item.id,
    question: item.question,
    expectedSlots: item.allowedClarificationSlots,
    actualSlots,
    retained: Boolean(route.clarificationQuestion),
    slotMatched: item.allowedClarificationSlots.every((slot) => actualSlots.includes(slot)),
    clarificationQuestion: route.clarificationQuestion,
  });
}

const ambiguitySummary = {
  caseCount: ambiguityResults.length,
  retentionRate: ratio(ambiguityResults.filter((item) => item.retained).length, ambiguityResults.length),
  slotAccuracy: ratio(ambiguityResults.filter((item) => item.slotMatched).length, ambiguityResults.length),
};

const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  goldPath,
  summary: summarize(results),
  ambiguitySummary,
  bySplit: {
    development: summarize(results.filter((item) => item.split === 'development')),
    holdout: summarize(results.filter((item) => item.split === 'holdout')),
  },
  results,
  ambiguityResults,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(markdownPath, markdown(report));
console.log(JSON.stringify({ outputPath, markdownPath, summary: report.summary, ambiguitySummary, bySplit: report.bySplit }, null, 2));

if (
  strict &&
  (report.bySplit.holdout.acceptableRecallAt4 < 0.97 ||
    report.bySplit.holdout.acceptableTop1Hit < 0.9 ||
    report.summary.unjustifiedClarificationRate > 0.03 ||
    ambiguitySummary.retentionRate < 1 ||
    ambiguitySummary.slotAccuracy < 1 ||
    report.bySplit.holdout.controlledPlanValidRate < 0.97 ||
    report.bySplit.holdout.controlledPlanGoldOutputRate < 0.97 ||
    report.summary.routePlanContractMatchRate < 1 ||
    report.summary.fallbackEligibleRate > 0.15 ||
    report.summary.p95Ms >= 50)
) process.exitCode = 1;

function summarize(items: typeof results) {
  const durations = items.map((item) => item.durationMs).sort((left, right) => left - right);
  const expectedAmbiguities = items.filter((item) => item.mustClarify).length;
  const retainedAmbiguities = items.filter((item) => item.mustClarify && item.clarificationQuestion).length;
  const unjustified = items.filter((item) => !item.mustClarify && item.clarificationQuestion).length;
  return {
    caseCount: items.length,
    metricTop1Hit: ratio(items.filter((item) => item.metricTop1Hit).length, items.length),
    acceptableTop1Hit: ratio(items.filter((item) => item.acceptableTop1Hit).length, items.length),
    acceptableRecallAt4: ratio(items.filter((item) => item.acceptableRecallAt4).length, items.length),
    requiredRecallAt4: ratio(items.filter((item) => item.requiredRecallAt4).length, items.length),
    routeAcceptableHit: ratio(items.filter((item) => item.routeAcceptableHit).length, items.length),
    controlledPlanValidRate: ratio(items.filter((item) => item.planValid).length, items.length),
    controlledPlanGoldOutputRate: ratio(items.filter((item) => item.planRequiredOutputHit && item.planResultModeHit).length, items.length),
    routePlanContractMatchRate: ratio(items.filter((item) => item.routePlanContractMatched).length, items.length),
    fallbackEligibleRate: ratio(items.filter((item) => item.fallbackEligible).length, items.length),
    clarificationAccuracy: ratio(items.filter((item) => item.clarificationCorrect).length, items.length),
    unjustifiedClarificationRate: ratio(unjustified, items.length),
    trueAmbiguityRetention: expectedAmbiguities ? ratio(retainedAmbiguities, expectedAmbiguities) : 1,
    averageMs: average(durations),
    p95Ms: percentile(durations, 0.95),
  };
}

function markdown(input: typeof report) {
  const rows = [
    ['全部', input.summary],
    ['开发集', input.bySplit.development],
    ['保留集', input.bySplit.holdout],
  ] as const;
  return [
    '# Ami Ask 统一 Gold 语义路由评测 v1', '',
    '- 模式：确定性语义索引与路由离线评测，不调用模型、不执行 SQL。',
    '- 保留集不参与规则开发，用于观察新问法泛化。',
    `- 必须澄清边界：${input.ambiguitySummary.caseCount} 题，保留率 ${percent(input.ambiguitySummary.retentionRate)}，槽位准确率 ${percent(input.ambiguitySummary.slotAccuracy)}。`, '',
    '| 集合 | 题数 | 指标 Top1 | 允许视图 Top1 | 允许视图 Recall@4 | 必需视图 Recall@4 | 路由命中 | 路由/Plan 精确合同 | Plan 有效 | Gold 输出/粒度 | 回退候选 | 澄清准确 | P95 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...rows.map(([label, value]) => `| ${label} | ${value.caseCount} | ${percent(value.metricTop1Hit)} | ${percent(value.acceptableTop1Hit)} | ${percent(value.acceptableRecallAt4)} | ${percent(value.requiredRecallAt4)} | ${percent(value.routeAcceptableHit)} | ${percent(value.routePlanContractMatchRate)} | ${percent(value.controlledPlanValidRate)} | ${percent(value.controlledPlanGoldOutputRate)} | ${percent(value.fallbackEligibleRate)} | ${percent(value.clarificationAccuracy)} | ${value.p95Ms.toFixed(2)}ms |`),
    '',
    '该报告只证明语义计划前半段，不代表 SQL 执行率和最终业务答案正确率。',
  ].join('\n');
}

function argumentValue(prefix: string) { return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length); }
function ratio(numerator: number, denominator: number) { return denominator ? Number((numerator / denominator).toFixed(4)) : 0; }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function percentile(values: number[], quantile: number) { return values.length ? values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * quantile) - 1))] : 0; }
function percent(value: number) { return `${(value * 100).toFixed(1)}%`; }
