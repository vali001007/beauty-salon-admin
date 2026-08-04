import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildAskDataGoldQuestionContract } from './ask-data-gold-question-contracts.ts';

const sourcePath = resolve(
  process.cwd(),
  argumentValue('--source=')
    ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v4-Coverage-R2-反馈名单轻量化/Ami-Ask统一Gold题库-v4-Coverage-R2-反馈名单轻量化.json',
);
const outputPath = resolve(
  process.cwd(),
  argumentValue('--output=')
    ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v5-Coverage-R2-商品项目贡献毛利/Ami-Ask统一Gold题库-v5-Coverage-R2-商品项目贡献毛利.json',
);
const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const marginView = 'ask_data_item_margin_view';
const addedContracts = itemMarginQuestions().map((item) => ({
  ...buildAskDataGoldQuestionContract({
    sourceSuite: 'ask_supplemental',
    sourceId: item.id,
    sourceRole: item.role,
    question: item.question,
    expectedView: marginView,
    supportClass: 'ask_query_supported',
    expectedMetricKeys: [item.metricKey],
    acceptableViews: [marginView],
    requiredViews: [marginView],
    requiredOutputFields: item.requiredOutputFields,
    requiredResultMode: item.requiredResultMode,
    requiredDimensionKeys: item.requiredDimensionKeys,
    requiredAnswerFacts: item.requiredAnswerFacts,
    managementSupport: 'supported',
    backendSupport: 'supported',
  }),
  split: 'development',
}));

const queryContracts = [...source.queryContracts, ...addedContracts];
const boundaryContracts = [...source.boundaryContracts];
validate(source, queryContracts, boundaryContracts, addedContracts);

const viewCounts = { ...source.viewCounts, [marginView]: addedContracts.length };
const developmentQueryCount = queryContracts.filter((item) => item.split === 'development').length;
const holdoutQueryCount = queryContracts.filter((item) => item.split === 'holdout').length;
const report = {
  ...source,
  version: 5,
  generatedAt: new Date().toISOString(),
  sources: [...source.sources, sourcePath, 'ask_data_coverage_r2_item_contribution_margin'],
  checksum: createHash('sha256').update(JSON.stringify(queryContracts.map((item) => item.checksum))).digest('hex'),
  summary: {
    ...source.summary,
    queryCaseCount: queryContracts.length,
    boundaryCaseCount: boundaryContracts.length,
    uniqueQuestionCount: new Set([...queryContracts, ...boundaryContracts].map((item) => item.checksum)).size,
    developmentQueryCount,
    holdoutQueryCount,
    holdoutRate: ratio(holdoutQueryCount, queryContracts.length),
    coveredViews: Object.keys(viewCounts).length,
    viewsAtLeastTen: Object.values(viewCounts).filter((count) => count >= 10).length,
    missingToTen: Object.values(viewCounts).reduce((total, count) => total + Math.max(0, 10 - count), 0),
    coverageR2ItemMarginAddedQueryCount: addedContracts.length,
  },
  viewCounts,
  queryContracts,
  boundaryContracts,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  checksum: report.checksum,
  boundaryChecksum: report.boundaryChecksum,
  ...report.summary,
  itemMarginCoverage: viewCounts[marginView],
  addedIds: addedContracts.map((item) => item.id),
}, null, 2));

function itemMarginQuestions() {
  const scalarFields = [
    'gross_revenue',
    'discount_amount',
    'refund_amount',
    'net_revenue',
    'attributed_cost',
    'contribution_margin',
    'contribution_margin_rate',
    'estimated_cost_event_count',
    'cost_missing_event_count',
  ];
  const commonFacts = ['metric_value', 'time_range', 'data_policy', 'amount_unit'];
  return [
    {
      id: 'R2-MARGIN-001',
      role: 'finance',
      question: '本月商品贡献毛利和毛利率是多少',
      metricKey: 'item_contribution_margin',
      requiredOutputFields: scalarFields,
      requiredResultMode: 'scalar',
      requiredDimensionKeys: [],
      requiredAnswerFacts: commonFacts,
    },
    {
      id: 'R2-MARGIN-002',
      role: 'manager',
      question: '本月各项目贡献毛利是多少',
      metricKey: 'item_contribution_margin',
      requiredOutputFields: ['project_id', 'project_name', ...scalarFields],
      requiredResultMode: 'grouped',
      requiredDimensionKeys: ['project'],
      requiredAnswerFacts: [...commonFacts, 'all_requested_dimensions', 'list_items'],
    },
    {
      id: 'R2-MARGIN-003',
      role: 'manager',
      question: '最近30天商品毛利率最高的前10个产品',
      metricKey: 'item_contribution_margin',
      requiredOutputFields: ['product_id', 'product_name', 'sku', ...scalarFields],
      requiredResultMode: 'ranking',
      requiredDimensionKeys: ['product'],
      requiredAnswerFacts: [...commonFacts, 'ranking_order', 'ranking_limit'],
    },
    {
      id: 'R2-MARGIN-004',
      role: 'manager',
      question: '哪个项目耗材成本最高',
      metricKey: 'project_attributed_cost',
      requiredOutputFields: ['project_id', 'project_name', 'net_revenue', 'attributed_cost', 'attributed_cost_rate', 'estimated_cost_event_count', 'cost_missing_event_count'],
      requiredResultMode: 'ranking',
      requiredDimensionKeys: ['project'],
      requiredAnswerFacts: [...commonFacts, 'ranking_order', 'ranking_limit'],
    },
    {
      id: 'R2-MARGIN-005',
      role: 'finance',
      question: '有没有产品卖价低于成本',
      metricKey: 'below_cost_sale',
      requiredOutputFields: ['product_id', 'product_name', 'sku', ...scalarFields],
      requiredResultMode: 'ranking',
      requiredDimensionKeys: ['product'],
      requiredAnswerFacts: [...commonFacts, 'ranking_order', 'ranking_limit', 'list_items'],
    },
    {
      id: 'R2-MARGIN-006',
      role: 'manager',
      question: '最近三个月商品与项目贡献毛利趋势',
      metricKey: 'item_contribution_margin',
      requiredOutputFields: ['item_type', 'trend_month', ...scalarFields],
      requiredResultMode: 'trend',
      requiredDimensionKeys: ['item_type', 'date'],
      requiredAnswerFacts: [...commonFacts, 'all_requested_dimensions', 'trend_granularity', 'trend_points'],
    },
    {
      id: 'R2-MARGIN-007',
      role: 'manager',
      question: '产品销售和服务项目毛利哪个高',
      metricKey: 'item_contribution_margin',
      requiredOutputFields: ['item_type', ...scalarFields],
      requiredResultMode: 'grouped',
      requiredDimensionKeys: ['item_type'],
      requiredAnswerFacts: [...commonFacts, 'all_requested_dimensions'],
    },
    {
      id: 'R2-MARGIN-008',
      role: 'finance',
      question: '本月按成本口径统计项目贡献毛利',
      metricKey: 'item_contribution_margin',
      requiredOutputFields: ['cost_basis', 'cost_completeness', ...scalarFields],
      requiredResultMode: 'grouped',
      requiredDimensionKeys: ['cost_basis'],
      requiredAnswerFacts: [...commonFacts, 'all_requested_dimensions'],
    },
    {
      id: 'R2-MARGIN-009',
      role: 'finance',
      question: '本月次卡核销项目贡献毛利是多少',
      metricKey: 'item_contribution_margin',
      requiredOutputFields: scalarFields,
      requiredResultMode: 'scalar',
      requiredDimensionKeys: [],
      requiredAnswerFacts: commonFacts,
    },
    {
      id: 'R2-MARGIN-010',
      role: 'finance',
      question: '本月商品退款冲减了多少收入和成本',
      metricKey: 'item_contribution_margin',
      requiredOutputFields: scalarFields,
      requiredResultMode: 'scalar',
      requiredDimensionKeys: [],
      requiredAnswerFacts: commonFacts,
    },
  ];
}

function validate(sourceGold, queryContracts, boundaryContracts, addedContracts) {
  const errors = [];
  if (sourceGold.version !== 4) errors.push(`unexpected_v4_version:${sourceGold.version}`);
  if (sourceGold.summary.queryCaseCount !== 450) errors.push(`unexpected_v4_query_count:${sourceGold.summary.queryCaseCount}`);
  if (sourceGold.summary.coveredViews !== 36) errors.push(`unexpected_v4_view_count:${sourceGold.summary.coveredViews}`);
  if (addedContracts.length !== 10) errors.push(`item_margin_r2_must_add_10:${addedContracts.length}`);
  const ids = [...queryContracts, ...boundaryContracts].map((item) => item.id);
  if (new Set(ids).size !== ids.length) errors.push('duplicate_contract_id');
  const checksums = [...queryContracts, ...boundaryContracts].map((item) => item.checksum);
  if (new Set(checksums).size !== checksums.length) errors.push('duplicate_question_checksum');
  if (addedContracts.some((item) => item.requiredViews.join(',') !== marginView)) {
    errors.push('item_margin_r2_question_wrong_view');
  }
  if (addedContracts.some((item) => item.mustClarify || item.supportClass !== 'ask_query_supported')) {
    errors.push('item_margin_r2_question_not_direct_query');
  }
  if (addedContracts.some((item) => item.split !== 'development')) {
    errors.push('item_margin_r2_question_must_be_development');
  }
  if (errors.length) throw new Error(`item_margin_r2_gold_invalid:${errors.join(',')}`);
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0;
}

function argumentValue(prefix) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
