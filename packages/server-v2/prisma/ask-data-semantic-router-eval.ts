import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AskDataClarificationPolicy } from '../src/ask-data-free-sql/ask-data-clarification-policy.js';
import { ASK_DATA_FREE_SQL_VIEWS } from '../src/ask-data-free-sql/ask-data-free-sql.catalog.js';
import { AskDataIntentParser } from '../src/ask-data-free-sql/ask-data-intent-parser.js';
import { AskDataSemanticRouter } from '../src/ask-data-free-sql/ask-data-semantic-router.js';
import { selectAskDataViews } from '../src/ask-data-free-sql/ask-data-free-sql-view-selector.js';

type BaselineResult = {
  id: string;
  question: string;
  expectedView: string;
  candidateViews: string[];
  status: string;
};

type BaselineReport = {
  summary: { caseCount: number; expectedViewHitRate: number; strictAccuracy: number; p95Ms: number };
  results: BaselineResult[];
};

type ShadowResult = {
  id: string;
  question: string;
  expectedView: string;
  legacyCandidates: string[];
  semanticCandidates: string[];
  legacyHit: boolean;
  semanticHit: boolean;
  metricKeys: string[];
  answerShape: string;
  confidence: number;
  clarificationQuestion?: string;
  clarificationReason?: string;
  fallbackReason?: string;
  durationMs: number;
};

const strict = process.argv.includes('--strict');
const reportDir = resolve(
  process.cwd(),
  argumentValue('--report-dir=') ?? '../../docs/04-测试数据/Ami-Ask-34视图问题集实测-2026-08-02',
);
const baselinePath = resolve(reportDir, 'final-results.json');
const outputPath = resolve(reportDir, 'semantic-router-shadow-results.json');
const markdownPath = resolve(reportDir, 'Ami-Ask独立语义路由Shadow评测-2026-08-02.md');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as BaselineReport;
const context = { userId: 0, storeId: 6, permissions: ['*'], deniedPermissions: [] as string[] };
const modelStub = { generateStructured: async () => { throw new Error('model_fallback_disabled'); } };
const router = new AskDataSemanticRouter(
  modelStub as never,
  new AskDataIntentParser(),
  new AskDataClarificationPolicy(),
);

const results: ShadowResult[] = [];
for (const item of baseline.results) {
  const startedAt = performance.now();
  const legacyCandidates = selectAskDataViews(item.question, context);
  const route = await router.route({
    question: item.question,
    context,
    authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
    config: { enabled: true, shadow: false, modelFallback: false, minConfidence: 0.75 },
  });
  const durationMs = performance.now() - startedAt;
  results.push({
    id: item.id,
    question: item.question,
    expectedView: item.expectedView,
    legacyCandidates: legacyCandidates.map((view) => view.viewName),
    semanticCandidates: route.candidateViews.map((view) => view.viewName),
    legacyHit: legacyCandidates.some((view) => view.viewName === item.expectedView),
    semanticHit: route.candidateViews.some((view) => view.viewName === item.expectedView),
    metricKeys: route.semanticIntent.metricKeys,
    answerShape: route.semanticIntent.answerShape,
    confidence: route.semanticIntent.confidence,
    clarificationQuestion: route.clarificationQuestion,
    clarificationReason: route.clarificationReason,
    fallbackReason: route.fallbackReason,
    durationMs: Number(durationMs.toFixed(3)),
  });
}

const durations = results.map((item) => item.durationMs).sort((left, right) => left - right);
const legacyHits = results.filter((item) => item.legacyHit).length;
const semanticHits = results.filter((item) => item.semanticHit).length;
const clarifications = results.filter((item) => item.clarificationQuestion).length;
const unjustifiedClarifications = results.filter(
  (item) => item.clarificationQuestion && !item.clarificationReason,
).length;
const modelFallbackEligible = results.filter((item) => item.fallbackReason).length;
const summary = {
  caseCount: results.length,
  baselineStrictAccuracy: baseline.summary.strictAccuracy,
  baselineCandidateRecall: ratio(legacyHits, results.length),
  semanticCandidateRecall: ratio(semanticHits, results.length),
  candidateRecallLift: ratio(semanticHits, results.length) - ratio(legacyHits, results.length),
  materialClarificationRate: ratio(clarifications, results.length),
  unjustifiedClarificationRate: ratio(unjustifiedClarifications, results.length),
  modelFallbackEligibleRate: ratio(modelFallbackEligible, results.length),
  averageCandidateCount: average(results.map((item) => item.semanticCandidates.length)),
  deterministicAverageMs: average(durations),
  deterministicP95Ms: percentile(durations, 0.95),
  targetCandidateRecall: 0.95,
  targetModelFallbackEligibleRate: 0.2,
  targetUnjustifiedClarificationRate: 0.08,
  targetP95Ms: 50,
};
const report = {
  generatedAt: new Date().toISOString(),
  mode: 'deterministic_shadow_without_model_or_database',
  baselinePath,
  summary,
  byView: ASK_DATA_FREE_SQL_VIEWS.map((view) => {
    const items = results.filter((item) => item.expectedView === view.viewName);
    return {
      viewName: view.viewName,
      label: view.label,
      caseCount: items.length,
      legacyRecall: ratio(items.filter((item) => item.legacyHit).length, items.length),
      semanticRecall: ratio(items.filter((item) => item.semanticHit).length, items.length),
    };
  }),
  results,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(markdownPath, markdown(report));
console.log(JSON.stringify({ outputPath, markdownPath, summary }, null, 2));
if (
  strict &&
  (summary.semanticCandidateRecall < 0.95 ||
    summary.modelFallbackEligibleRate > 0.2 ||
    summary.unjustifiedClarificationRate > 0.08 ||
    summary.deterministicP95Ms >= 50)
) process.exitCode = 1;

function markdown(input: typeof report) {
  const s = input.summary;
  return [
    '# Ami Ask 独立语义路由 Shadow 评测',
    '',
    `- 样本：${s.caseCount} 道现有全局不重复问题`,
    '- 模式：只评估确定性语义候选，不调用模型、不执行 SQL、不访问数据库',
    '',
    '## 结论',
    '',
    `- 旧候选召回率：${percent(s.baselineCandidateRecall)}`,
    `- 新语义候选召回率：${percent(s.semanticCandidateRecall)}`,
    `- 召回率变化：${percent(s.candidateRecallLift)}`,
    `- 真实歧义澄清比例：${percent(s.materialClarificationRate)}`,
    `- 无理由澄清比例：${percent(s.unjustifiedClarificationRate)}`,
    `- 需语义模型回退比例：${percent(s.modelFallbackEligibleRate)}`,
    `- 确定性路由平均 / P95：${s.deterministicAverageMs.toFixed(2)}ms / ${s.deterministicP95Ms.toFixed(2)}ms`,
    '',
    '该结果只证明“问题进入正确候选视图”的离线路由能力，不代表 SQL 生成准确率、数据库执行成功率或最终回答准确率。完整 286 题真实模型与数据库复测仍需单独执行。',
    '',
    '## 逐视图候选召回',
    '',
    '| 视图 | 题数 | 旧召回 | 新召回 |',
    '|---|---:|---:|---:|',
    ...input.byView.map((item) =>
      `| ${item.label}<br>\`${item.viewName}\` | ${item.caseCount} | ${percent(item.legacyRecall)} | ${percent(item.semanticRecall)} |`,
    ),
    '',
  ].join('\n');
}

function argumentValue(prefix: string) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function ratio(numerator: number, denominator: number) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values: number[], quantile: number) {
  if (!values.length) return 0;
  return values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * quantile) - 1))];
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
