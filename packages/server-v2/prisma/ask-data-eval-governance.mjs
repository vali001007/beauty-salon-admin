import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  ASK_DATA_VIEW_METRIC_KEYS,
  buildAskDataGoldQuestionContract,
} from './ask-data-gold-question-contracts.ts';
import {
  ASK_DATA_ADMIN_METRIC_CORRECTIONS,
  ASK_DATA_ADMIN_METRIC_CORRECTION_BY_ID,
  ASK_DATA_ADMIN_EXPLICIT_QUERY_CONTRACT_BY_ID,
} from './ask-data-admin-metric-corrections.ts';
import { ASK_DATA_SUPPLEMENTAL_QUESTIONS } from './ask-data-supplemental-question-bank.ts';

const firstManifestPath = resolve(process.cwd(), argumentValue('--first=') ?? '../../docs/04-测试数据/Ami-Ask-34视图问题集实测-2026-08-02/selection-manifest.json');
const secondManifestPath = resolve(process.cwd(), argumentValue('--second=') ?? '../../docs/04-测试数据/Ami-Ask-Agent问题库实测-2026-08-02/agent-question-bank-manifest.json');
const outputPath = resolve(process.cwd(), argumentValue('--output=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask统一Gold题库-v1.json');
const methodologyPath = resolve(process.cwd(), argumentValue('--methodology=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask评测口径说明-v1.md');

const first = JSON.parse(readFileSync(firstManifestPath, 'utf8'));
const second = JSON.parse(readFileSync(secondManifestPath, 'utf8'));
const selectedSecondIds = new Set(second.selectedQuestions.map((item) => item.id));
const promotedAdminMetricQuestions = second.questions.filter((item) => {
  const correction = ASK_DATA_ADMIN_METRIC_CORRECTION_BY_ID.get(item.id);
  return !selectedSecondIds.has(item.id) && correction?.supportClass === 'ask_query_supported';
});
const rawQueryContracts = [
  ...first.selectedQuestions.map((item) => buildAskDataGoldQuestionContract({
    sourceSuite: 'ami_brain_2000', sourceId: item.id, sourceRole: item.role, question: item.question,
    expectedView: item.expectedView, supportClass: 'ask_query_supported', managementSupport: 'supported', backendSupport: 'supported',
  })),
  ...second.selectedQuestions.map((item) => {
    const source = second.questions.find((question) => question.id === item.id);
    const correction = ASK_DATA_ADMIN_METRIC_CORRECTION_BY_ID.get(item.id);
    const explicitContract = ASK_DATA_ADMIN_EXPLICIT_QUERY_CONTRACT_BY_ID.get(item.id);
    return buildAskDataGoldQuestionContract({
      sourceSuite: 'agent_650', sourceId: item.id, sourceRole: item.role, question: item.question,
      expectedView: correction ? undefined : item.expectedView,
      supportClass: correction?.supportClass ?? item.type,
      expectedMetricKeys: correction?.expectedMetricKeys,
      acceptableViews: correction?.acceptableViews,
      requiredViews: correction?.requiredViews,
      allowedClarificationSlots: correction?.allowedClarificationSlots,
      requiredOutputFields: explicitContract?.requiredOutputFields,
      requiredResultMode: explicitContract?.requiredResultMode,
      requiredDimensionKeys: explicitContract?.requiredDimensionKeys,
      requiredAnswerFacts: explicitContract?.requiredAnswerFacts,
      managementSupport: correction?.auditClass === 'backend_fact_incomplete'
        ? 'partial'
        : source?.managementSupport ?? 'unknown',
      backendSupport: correction?.auditClass === 'backend_fact_incomplete'
        ? 'partial'
        : source?.backendSupport ?? 'unknown',
    });
  }),
  ...ASK_DATA_SUPPLEMENTAL_QUESTIONS.map((item) => buildAskDataGoldQuestionContract({
    sourceSuite: 'ask_supplemental', sourceId: item.id, sourceRole: item.role, question: item.question,
    expectedView: item.expectedView, supportClass: 'ask_query_supported', managementSupport: 'supported', backendSupport: 'supported',
  })),
  ...promotedAdminMetricQuestions.map((item) => {
    const correction = ASK_DATA_ADMIN_METRIC_CORRECTION_BY_ID.get(item.id);
    if (!correction) throw new Error(`missing_admin_metric_correction:${item.id}`);
    const explicitContract = ASK_DATA_ADMIN_EXPLICIT_QUERY_CONTRACT_BY_ID.get(item.id);
    return buildAskDataGoldQuestionContract({
      sourceSuite: 'agent_650',
      sourceId: item.id,
      sourceRole: item.sourceRole,
      question: item.question,
      supportClass: correction.supportClass,
      expectedMetricKeys: correction.expectedMetricKeys,
      acceptableViews: correction.acceptableViews,
      requiredViews: correction.requiredViews,
      allowedClarificationSlots: correction.allowedClarificationSlots,
      requiredOutputFields: explicitContract?.requiredOutputFields,
      requiredResultMode: explicitContract?.requiredResultMode,
      requiredDimensionKeys: explicitContract?.requiredDimensionKeys,
      requiredAnswerFacts: explicitContract?.requiredAnswerFacts,
      managementSupport: 'supported',
      backendSupport: 'supported',
    });
  }),
];
const queryContracts = rawQueryContracts.filter((item) => isQuerySupportClass(item.supportClass) && !item.mustClarify);
const boundaryContracts = [
  ...rawQueryContracts.filter((item) => !isQuerySupportClass(item.supportClass) || item.mustClarify),
  ...second.questions
  .filter((item) => !selectedSecondIds.has(item.id) && !promotedAdminMetricQuestions.some((promoted) => promoted.id === item.id))
  .map((item) => {
    const correction = ASK_DATA_ADMIN_METRIC_CORRECTION_BY_ID.get(item.id);
    return buildAskDataGoldQuestionContract({
      sourceSuite: 'agent_650', sourceId: item.id, sourceRole: item.sourceRole, question: item.question,
      expectedView: correction ? undefined : item.expectedView,
      supportClass: correction?.supportClass ?? item.supportClass,
      expectedMetricKeys: correction?.expectedMetricKeys,
      acceptableViews: correction?.acceptableViews,
      requiredViews: correction?.requiredViews,
      allowedClarificationSlots: correction?.allowedClarificationSlots,
      managementSupport: correction?.auditClass === 'backend_fact_incomplete' ? 'partial' : item.managementSupport,
      backendSupport: correction?.auditClass === 'backend_fact_incomplete' ? 'partial' : item.backendSupport,
    });
  }),
];

const errors = validate(queryContracts, boundaryContracts);
if (errors.length) throw new Error(`gold_governance_invalid:\n${errors.join('\n')}`);

const views = countBy(
  queryContracts.flatMap((item) => item.requiredViews),
  Object.keys(ASK_DATA_VIEW_METRIC_KEYS),
);
const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  sources: [firstManifestPath, secondManifestPath],
  checksum: createHash('sha256').update(JSON.stringify(queryContracts.map((item) => item.checksum))).digest('hex'),
  summary: {
    queryCaseCount: queryContracts.length,
    boundaryCaseCount: boundaryContracts.length,
    uniqueQuestionCount: new Set([...queryContracts, ...boundaryContracts].map((item) => item.checksum)).size,
    developmentQueryCount: queryContracts.filter((item) => item.split === 'development').length,
    holdoutQueryCount: queryContracts.filter((item) => item.split === 'holdout').length,
    holdoutRate: ratio(queryContracts.filter((item) => item.split === 'holdout').length, queryContracts.length),
    coveredViews: Object.keys(views).length,
    viewsAtLeastTen: Object.values(views).filter((count) => count >= 10).length,
    missingToTen: Object.values(views).reduce((total, count) => total + Math.max(0, 10 - count), 0),
    adminMetricCorrections: countBy(ASK_DATA_ADMIN_METRIC_CORRECTIONS.map((item) => item.supportClass)),
  },
  viewCounts: views,
  queryContracts,
  boundaryContracts,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(methodologyPath, `${methodology(report)}\n`);
console.log(JSON.stringify({ outputPath, methodologyPath, ...report.summary }, null, 2));

function validate(queryItems, boundaryItems) {
  const errors = [];
  const all = [...queryItems, ...boundaryItems];
  const queryCorrectionIds = new Set(ASK_DATA_ADMIN_METRIC_CORRECTIONS
    .filter((item) => item.supportClass === 'ask_query_supported')
    .map((item) => item.sourceId));
  const explicitContractIds = new Set(ASK_DATA_ADMIN_EXPLICIT_QUERY_CONTRACT_BY_ID.keys());
  for (const sourceId of queryCorrectionIds) {
    if (!explicitContractIds.has(sourceId)) errors.push(`admin_query_without_explicit_contract:${sourceId}`);
  }
  for (const sourceId of explicitContractIds) {
    if (!queryCorrectionIds.has(sourceId)) errors.push(`orphan_admin_explicit_contract:${sourceId}`);
  }
  const ids = new Set();
  const checksums = new Set();
  for (const item of all) {
    const isQueryItem = queryItems.includes(item);
    if (ids.has(item.id)) errors.push(`duplicate_id:${item.id}`);
    ids.add(item.id);
    if (checksums.has(item.checksum)) errors.push(`duplicate_question:${item.id}`);
    checksums.add(item.checksum);
    if (!item.question.trim()) errors.push(`empty_question:${item.id}`);
    if (isQueryItem && !item.acceptableViews.length) errors.push(`query_without_view:${item.id}`);
    if (isQueryItem && !item.requiredOutputFields.length) errors.push(`query_without_required_output:${item.id}`);
    if (isQueryItem && !item.requiredResultMode) errors.push(`query_without_result_mode:${item.id}`);
    if (isQueryItem && /次卡.*核销率/.test(item.question)) errors.push(`card_redemption_rate_without_denominator:${item.id}`);
    if (isQueryItem && /各品类销售额/.test(item.question)
      && (item.requiredResultMode !== 'grouped' || !item.requiredOutputFields.includes('category_name'))) {
      errors.push(`category_sales_without_category_grain:${item.id}`);
    }
    if (isQueryItem && /活动.*(?:roi|投产|投入产出).*(?:最高|最低)|哪些活动.*(?:roi|投产|投入产出)/i.test(item.question)
      && !['activity_id', 'activity_title'].every((field) => item.requiredOutputFields.includes(field))) {
      errors.push(`activity_ranking_without_identity:${item.id}`);
    }
    if (isQueryItem && /机会评分.*(?:最高|排行|排名|前\s*\d+)/.test(item.question)
      && !['customer_id', 'customer_name_masked', 'top_score'].every((field) => item.requiredOutputFields.includes(field))) {
      errors.push(`opportunity_ranking_without_identity_or_score:${item.id}`);
    }
    if (isQueryItem && /转化率|完成率|成功率|毛利率|利润率|利用率|损耗率|偏差率/.test(item.question)
      && !item.requiredOutputFields.some((field) => /(?:_rate|_ratio)$/.test(field))) {
      errors.push(`rate_question_without_rate_output:${item.id}`);
    }
    if (isQueryItem && /客户.*(?:总余额|储值余额).*从高到低/.test(item.question)
      && item.requiredResultMode !== 'ranking') {
      errors.push(`customer_balance_ordering_not_ranking:${item.id}`);
    }
    const isAdminExplicitQuery = isQueryItem && queryCorrectionIds.has(item.sourceId);
    if (isAdminExplicitQuery && /(?:谁|哪些|什么|是谁的)/.test(item.question) && item.requiredResultMode === 'scalar') {
      errors.push(`object_question_cannot_be_scalar:${item.id}`);
    }
    if (isAdminExplicitQuery
      && /(?:哪些|所有|列一下|列出).*(?:客户|会员|顾客|客人)|(?:客户|会员|顾客|客人).*(?:基本信息|是谁的)/.test(item.question)
      && !item.requiredOutputFields.includes('customer_id')) {
      errors.push(`customer_object_without_identity:${item.id}`);
    }
    if (isAdminExplicitQuery && /(?:员工|美容师)/.test(item.question)
      && /(?:谁|哪个|哪位|排名|排行|最多|最好|最快)/.test(item.question)
      && !item.requiredOutputFields.some((field) => ['staff_id', 'beautician_id'].includes(field))) {
      errors.push(`staff_object_without_identity:${item.id}`);
    }
    if (isAdminExplicitQuery
      && /(?:上月|上周|去年同期|环比|同比|进步最快|异常增加|增加了多少|下降了多少|差多少)/.test(item.question)
      && !/耗材消耗和收入.*对比/.test(item.question)
      && !item.requiredAnswerFacts.includes('comparison_difference')) {
      errors.push(`comparison_without_difference_fact:${item.id}`);
    }
    if (isAdminExplicitQuery && /(?:高不高|是否高|偏高|正常吗|异常吗)/.test(item.question)
      && !/(?:大于|超过|高于|低于|不超过|至少|至多|\d+(?:\.\d+)?%|上月|上周|同期|平均)/.test(item.question)) {
      errors.push(`ungoverned_judgement_in_query_denominator:${item.id}`);
    }
    if (item.requiredViews.some((viewName) => !item.acceptableViews.includes(viewName))) errors.push(`required_view_not_acceptable:${item.id}`);
    if (item.mustClarify !== Boolean(item.allowedClarificationSlots.length)) errors.push(`clarification_contract_mismatch:${item.id}`);
  }
  return errors;
}

function methodology(report) {
  return [
    '# Ami Ask 统一评测口径说明 v1', '',
    `- 查询 Gold：${report.summary.queryCaseCount} 题`,
    `- 边界题：${report.summary.boundaryCaseCount} 题`,
    `- 开发集/保留集：${report.summary.developmentQueryCount}/${report.summary.holdoutQueryCount}`,
    `- 保留集比例：${(report.summary.holdoutRate * 100).toFixed(2)}%`,
    `- 题库 checksum：\`${report.checksum}\``, '',
    '## 判定原则', '',
    '1. 以 expectedMetricKeys、requiredDimensions 和 requiredAnswerFacts 判定业务语义，不再只用唯一 expectedView。',
    '2. acceptableViews 表示可接受的治理口径；requiredViews 表示必须同时覆盖的视图。',
    '3. mustClarify 只允许 year、threshold、entity_identity、comparison_relation、comparison_baseline 和 time_point 六类治理槽位。',
    '4. development 用于规则开发，holdout 不参与规则调优，只用于泛化验收。',
    '5. 边界题不进入 SQL 准确率分母，单独计算分流正确率。', '',
    '## 指标', '',
    '- boundary accuracy：支持边界与分流是否正确。',
    '- semantic plan accuracy：指标、维度、时间、筛选和答案形态是否正确。',
    '- route recall@1/recall@4：允许视图是否进入候选。',
    '- SQL execution rate：Guard 和数据库执行是否成功。',
    '- answer completeness：requiredAnswerFacts 是否全部覆盖。',
    '- factual grounding：数字和事实是否来自查询证据。', '',
    '## 禁止事项', '',
    '- 不把开发集 100% 当作泛化结论。',
    '- 不重复分配同一问题给多个视图凑覆盖。',
    '- 不把数据库执行成功当作最终回答正确。',
    '- 不把 Brain、写操作、敏感字段和后台不支持题放入 Ask SQL 分母。',
  ].join('\n');
}

function countBy(values, knownValues = []) {
  const counts = new Map(knownValues.map((value) => [value, 0]));
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts].sort());
}
function ratio(numerator, denominator) { return denominator ? Number((numerator / denominator).toFixed(4)) : 0; }
function isQuerySupportClass(value) { return value === 'ask_query_supported' || value === 'ask_query_low_confidence'; }
function argumentValue(prefix) { return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length); }
