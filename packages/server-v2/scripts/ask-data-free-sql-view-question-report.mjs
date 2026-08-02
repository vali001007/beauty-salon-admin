#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const reportDir = resolve(
  process.cwd(),
  argumentValue('--report-dir=') ?? '../../docs/04-测试数据/Ami-Ask-34视图问题集实测-2026-08-02',
);
const manifest = readJson(resolve(reportDir, 'selection-manifest.json'));
const sources = [
  'detailed-results.json',
  'transient-rerun-results.json',
  'semantic-tightening-added-results.json',
  'semantic-tightening-transient-rerun.json',
  'unique-selection-added-results.json',
  'unique-selection-transient-rerun.json',
].map((name) => readJson(resolve(reportDir, name)));
const expectedKeys = new Set(manifest.selectedQuestions.map(caseKey));
const resultMap = new Map();
for (const source of sources) {
  for (const result of source.results ?? []) resultMap.set(caseKey(result), result);
}
const missing = manifest.selectedQuestions.filter((item) => !resultMap.has(caseKey(item)));
if (missing.length) throw new Error(`Missing ${missing.length} final results: ${missing.map(caseKey).join(', ')}`);
const results = manifest.selectedQuestions.map((item) => resultMap.get(caseKey(item))).filter(Boolean);
for (const key of [...resultMap.keys()]) if (!expectedKeys.has(key)) resultMap.delete(key);

const summary = summarize(results);
const byView = manifest.views.map((view) => {
  const items = results.filter((item) => item.expectedView === view.viewName);
  const metrics = summarize(items);
  return {
    viewName: view.viewName,
    label: view.label,
    coverageStatus: view.coverageStatus,
    selectedCount: view.selectedCount,
    targetCount: view.targetCount,
    gapReason: view.gapReason,
    acceptanceEligible: view.selectedCount >= view.targetCount,
    strictPassed: metrics.strictPassed,
    strictAccuracy: metrics.strictAccuracy,
    pipelinePassRate: metrics.pipelinePassRate,
    expectedViewHitRate: metrics.expectedViewHitRate,
    noDataRate: metrics.noDataRate,
    averageMs: metrics.averageMs,
    p95Ms: metrics.p95Ms,
    failureCounts: metrics.failureCounts,
  };
});
const final = {
  generatedAt: new Date().toISOString(),
  evaluationDate: '2026-08-02',
  environment: {
    connectionMode: 'development_admin',
    databaseHost: sources[0].databaseHost,
    storeId: sources[0].storeId,
    model: mostCommon(results.map((item) => item.model).filter(Boolean)),
    provider: mostCommon(results.map((item) => item.provider).filter(Boolean)),
  },
  methodology: {
    sourceQuestionCount: manifest.sourceQuestionCount,
    registeredViewCount: manifest.viewCount,
    targetPerView: manifest.targetPerView,
    coveredViewCount: manifest.coveredViews,
    evaluatedCaseCount: results.length,
    strictAccuracyDefinition: '预期视图命中，并且 Guard 与数据库执行成功，回答中的数字均可在返回结果或时间范围中找到。',
    limitation: '原题库没有 expected SQL 或 expected result；因此本报告的准确率是严格链路准确率，不是最终业务答案语义正确率。',
  },
  summary,
  initialTransientFailures: 6,
  transientRerunRecovered: 5,
  deterministicAnswerFallbackCount: results.filter((item) =>
    item.answer?.caveats?.some((caveat) => caveat.includes('回退为确定性摘要')),
  ).length,
  byView,
  insufficientViews: manifest.insufficientViews,
  results,
};

const finalJsonPath = resolve(reportDir, 'final-results.json');
const markdownPath = resolve(reportDir, 'Ami-Ask-34视图问题集实测报告-2026-08-02.md');
mkdirSync(dirname(finalJsonPath), { recursive: true });
writeFileSync(finalJsonPath, `${JSON.stringify(final, null, 2)}\n`);
writeFileSync(markdownPath, buildMarkdown(final));
console.log(JSON.stringify({ finalJsonPath, markdownPath, summary, coveredViewCount: manifest.coveredViews }, null, 2));

function buildMarkdown(report) {
  const s = report.summary;
  const eligiblePerfect = report.byView.filter((view) => view.acceptanceEligible && view.strictAccuracy === 1);
  const eligibleZero = report.byView.filter((view) => view.acceptanceEligible && view.strictAccuracy === 0);
  const totalRequired = report.methodology.registeredViewCount * report.methodology.targetPerView;
  const missingQuestionCount = totalRequired - report.methodology.evaluatedCaseCount;
  const lines = [
    '# Ami Ask 34 视图问题集实测报告',
    '',
    `- 测试日期：${report.evaluationDate}`,
    `- 源题库：\`Ami-Brain-全领域实测问题集-2000.csv\`，共 ${report.methodology.sourceQuestionCount} 题`,
    `- 运行环境：\`${report.environment.connectionMode}\`，门店 ID ${report.environment.storeId}`,
    `- 模型：\`${report.environment.provider}/${report.environment.model}\``,
    '',
    '## 一、结论',
    '',
    '**当前结果不能作为“34 个视图每个不少于 10 题并通过”的验收结论。**',
    '',
    `原题库只有 ${report.methodology.coveredViewCount}/34 个视图能严格选满 10 道与视图字段相符的只读查询题；最终实测 ${report.methodology.evaluatedCaseCount} 道题，题号全局不重复，距离 340 题要求缺 ${missingQuestionCount} 题。若强行补足，只能通过重复问题或把不相关问题错配给视图，会制造虚假准确率。`,
    '',
    `复跑瞬时失败后，严格链路准确率为 **${percent(s.strictAccuracy)}（${s.strictPassed}/${s.caseCount}）**；链路通过率为 **${percent(s.pipelinePassRate)}**；预期视图命中率为 **${percent(s.expectedViewHitRate)}**。平均耗时 **${seconds(s.averageMs)} 秒**，P50 **${seconds(s.p50Ms)} 秒**，P95 **${seconds(s.p95Ms)} 秒**。`,
    '',
    `满足 10 题且 10/10 通过的视图有 ${eligiblePerfect.length} 个：${eligiblePerfect.map((view) => view.label).join('、') || '无'}。满足 10 题但 0/10 的视图有 ${eligibleZero.length} 个：${eligibleZero.map((view) => view.label).join('、') || '无'}。`,
    '',
    '本次使用开发管理员数据库连接，只证明开发环境真实执行，不代表生产专用只读角色已经通过最小权限验收。',
    '',
    '## 二、指标口径',
    '',
    '- 严格准确率：预期视图命中、Guard/数据库执行成功、回答数字可由结果或时间范围支撑，三项同时满足才算通过。',
    '- 链路通过率：SQL 和回答可以完成且数字有依据，即使选中了另一个可回答的重叠视图也可通过。',
    '- 预期视图命中率：用于判断当前 Catalog、关键词候选和模型路由能否把问题送到目标视图。',
    '- 选题唯一性：同一道源题只能分配给一个视图；语义重叠题通过全局匹配分配，不重复计入多个视图。',
    '- 无数据率：仅统计 SQL 返回 0 行；聚合 SQL 返回 1 行但值为空时不会计入，因此只能作为物理空结果参考。',
    '- 题库没有 expected SQL/expected result，本报告不能把“回答有依据”进一步宣称为最终业务语义完全正确。',
    '',
    '## 三、总体结果',
    '',
    '| 指标 | 结果 |',
    '|---|---:|',
    `| 题库可覆盖视图 | ${report.methodology.coveredViewCount}/34 |`,
    `| 实测题数 | ${s.caseCount} |`,
    `| 严格通过 | ${s.strictPassed} |`,
    `| 严格准确率 | ${percent(s.strictAccuracy)} |`,
    `| 链路通过率 | ${percent(s.pipelinePassRate)} |`,
    `| 预期视图命中率 | ${percent(s.expectedViewHitRate)} |`,
    `| 物理 0 行率 | ${percent(s.noDataRate)} |`,
    `| 平均 / P50 / P95 | ${seconds(s.averageMs)} / ${seconds(s.p50Ms)} / ${seconds(s.p95Ms)} 秒 |`,
    `| 回答模型数字校验后回退为确定性摘要 | ${report.deterministicAnswerFallbackCount} 题 |`,
    `| 模型瞬时失败 / 复跑恢复 | ${report.initialTransientFailures} / ${report.transientRerunRecovered} |`,
    '',
    '## 四、逐视图结果',
    '',
    '| 视图 | 题数 | 满 10 题 | 严格准确率 | 链路通过率 | 视图命中率 | 平均耗时 | 主要失败原因 |',
    '|---|---:|:---:|---:|---:|---:|---:|---|',
    ...report.byView.map((view) =>
      `| ${view.label}<br>\`${view.viewName}\` | ${view.selectedCount} | ${view.acceptanceEligible ? '是' : '否'} | ${percent(view.strictAccuracy)} | ${percent(view.pipelinePassRate)} | ${percent(view.expectedViewHitRate)} | ${seconds(view.averageMs)} 秒 | ${failureSummary(view.failureCounts, view.gapReason)} |`,
    ),
    '',
    '## 五、题库覆盖缺口',
    '',
    '| 视图 | 已有题数 | 缺少题数 | 原因 |',
    '|---|---:|---:|---|',
    ...report.insufficientViews.map((view) =>
      `| ${view.label}<br>\`${view.viewName}\` | ${view.selectedCount} | ${report.methodology.targetPerView - view.selectedCount} | ${view.gapReason} |`,
    ),
    '',
    `合计缺少 ${missingQuestionCount} 道 Ask 专用查询题。建议另建补充题集并标注“由原题库缺口派生”，不要混回 Ami Brain 2000 题原始口径。`,
    '',
    '## 六、答错原因',
    '',
    '| 原因 | 次数 | 产品含义 |',
    '|---|---:|---|',
    ...Object.entries(s.failureCounts).map(([cause, count]) =>
      `| ${cause} | ${count} | ${failureMeaning(cause)} |`,
    ),
    '',
    '最主要的问题不是数据库不可读，而是从自然语言到语义视图之间的路由：大量清晰问题被过度澄清，或目标视图没有进入最多 8 个候选视图。重叠指标缺少唯一的数据归属，也使模型在订单/日结、采购/供应商、营销转化/ROI 之间摇摆。',
    '',
    '## 七、建议修复顺序',
    '',
    '1. P0：修复轻量候选选择器。补齐项目价格/时长/类型、项目销量、经营成本、财务对账、客户价值分层、营销归因与 ROI 等同义词，并为明确问题禁止无理由澄清。',
    '2. P0：建立指标归属优先级。例如订单营业额、日结收入、支付实收分别明确默认视图；供应商金额优先汇总视图还是采购明细视图也必须固定。',
    '3. P1：对合理的跨域问题建设组合语义视图，而不是放开任意 Join。优先处理“客户余额 + 次卡资产”“卡项 + 预约”“对账运行 + 订单支付”三类高频问题。',
    '4. P1：降低回答阶段回退率。当前较多回答因生成了结果外数字而回退为确定性摘要，虽然安全，但用户体验偏机械。',
    `5. P1：补齐 ${missingQuestionCount} 道 Ask 专用题后，再执行真正的 34×10 验收；本报告中的不足样本视图只能作为探索性结果。`,
    '6. P2：完成生产专用只读角色的 34 视图授权、真实权限矩阵和浏览器验收后，才能宣称生产可用。',
    '',
    '## 八、证据文件',
    '',
    '- `selection-manifest.json`：严格语义选题清单与覆盖缺口。',
    '- `final-results.json`：最终合并后的逐题结果、SQL、耗时、回答和失败原因。',
    '- `detailed-results.json`：首轮 291 题运行证据。',
    '- `transient-rerun-results.json`：首轮瞬时失败复跑证据。',
    '- `semantic-tightening-added-results.json`：语义收紧后新增替换题证据。',
    '- `semantic-tightening-transient-rerun.json`：新增题瞬时失败复跑证据。',
    '- `unique-selection-added-results.json`：全局去重后 11 道替换题的真实执行证据。',
    '- `unique-selection-transient-rerun.json`：全局去重替换题的瞬时失败复跑证据。',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function summarize(items) {
  const durations = items.map((item) => item.totalMs ?? 0).sort((left, right) => left - right);
  const strictPassed = items.filter((item) => item.status === 'pass').length;
  const pipelinePassed = items.filter((item) => item.pipelineStatus === 'pass').length;
  const expectedViewHits = items.filter((item) => item.expectedViewHit).length;
  return {
    caseCount: items.length,
    strictPassed,
    strictFailed: items.length - strictPassed,
    strictAccuracy: ratio(strictPassed, items.length),
    pipelinePassRate: ratio(pipelinePassed, items.length),
    expectedViewHitRate: ratio(expectedViewHits, items.length),
    noDataRate: ratio(items.filter((item) => item.noData).length, items.length),
    averageMs: average(durations),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    failureCounts: countBy(items.filter((item) => item.failureCategory), (item) => item.failureCategory),
  };
}

function failureMeaning(cause) {
  const meanings = {
    clarification: '问题本可由现有字段回答，但模型要求补充信息；主要影响直接可用性。',
    candidate_selector_miss: '目标视图未进入候选集合，后续模型不可能选中。',
    model_view_selection_miss: '目标视图已进入候选，但模型选了语义重叠的其他视图。',
    guard_view_join_not_allowed: '题目需要跨视图组合，当前安全策略禁止 Join。',
    guard_time_range_exceeded: '查询超过 730 天或时间范围解析无效。',
    guard_field_not_allowed: '模型生成了目录未登记字段或错误 SQL 结构。',
    guard_source_view_not_allowed: '模型使用了未登记视图或错误来源。',
    blocked: '目录字段与题意不匹配，系统主动拒绝。',
  };
  return meanings[cause] ?? '详见逐题结果。';
}

function failureSummary(counts, gapReason) {
  const entries = Object.entries(counts ?? {});
  if (entries.length) return entries.slice(0, 3).map(([key, value]) => `${key} ${value}`).join('；');
  return gapReason ?? '-';
}

function caseKey(item) {
  return `${item.expectedView}|${item.id}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function argumentValue(prefix) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0;
}

function average(values) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  return values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentileValue) - 1))];
}

function countBy(items, key) {
  return Object.fromEntries(
    [...items.reduce((map, item) => map.set(key(item), (map.get(key(item)) ?? 0) + 1), new Map())].sort(
      (left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])),
    ),
  );
}

function mostCommon(values) {
  return Object.entries(countBy(values, (value) => value))[0]?.[0] ?? 'unknown';
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function seconds(value) {
  return (value / 1000).toFixed(1);
}
