import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildAskDataGoldQuestionContract } from './ask-data-gold-question-contracts.ts';

const sourcePath = resolve(
  process.cwd(),
  argumentValue('--source=')
    ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask统一Gold题库-v1.json',
);
const outputPath = resolve(
  process.cwd(),
  argumentValue('--output=')
    ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v2-Coverage-R2/Ami-Ask统一Gold题库-v2-Coverage-R2.json',
);
const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const addedContracts = coverageR2Questions().map((item) => ({
  ...buildAskDataGoldQuestionContract({
    sourceSuite: 'ask_supplemental',
    sourceId: item.id,
    sourceRole: item.role,
    question: item.question,
    expectedView: 'ask_data_inventory_turnover_view',
    supportClass: 'ask_query_supported',
    expectedMetricKeys: [item.metricKey],
    acceptableViews: ['ask_data_inventory_turnover_view'],
    requiredViews: ['ask_data_inventory_turnover_view'],
    requiredOutputFields: item.requiredOutputFields,
    requiredResultMode: item.requiredResultMode,
    requiredDimensionKeys: item.requiredDimensionKeys,
    requiredAnswerFacts: item.requiredAnswerFacts,
    managementSupport: 'supported',
    backendSupport: 'supported',
  }),
  // Coverage R2 questions are authored alongside the feature and therefore
  // cannot be represented as unseen holdout evidence.
  split: 'development',
}));

const queryContracts = [...source.queryContracts, ...addedContracts];
const boundaryContracts = [...source.boundaryContracts];
validate(source, queryContracts, boundaryContracts, addedContracts);

const viewCounts = { ...source.viewCounts, ask_data_inventory_turnover_view: addedContracts.length };
const developmentQueryCount = queryContracts.filter((item) => item.split === 'development').length;
const holdoutQueryCount = queryContracts.filter((item) => item.split === 'holdout').length;
const report = {
  version: 2,
  generatedAt: new Date().toISOString(),
  sources: [...source.sources, sourcePath, 'ask_data_coverage_r2_inventory_turnover'],
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
    coverageR2AddedQueryCount: addedContracts.length,
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
  ...report.summary,
  inventoryTurnoverCoverage: viewCounts.ask_data_inventory_turnover_view,
}, null, 2));

function coverageR2Questions() {
  const common = {
    role: 'inventory',
    requiredAnswerFacts: ['metric_value', 'data_policy'],
  };
  return [
    {
      ...common,
      id: 'R2-INV-001',
      question: '库存运营周转率最低的前 10 个产品是哪些',
      metricKey: 'inventory_operational_turnover',
      requiredOutputFields: ['product_id', 'product_name', 'operational_turnover_ratio_30d', 'outbound_quantity_30d', 'event_weighted_avg_stock_30d'],
      requiredResultMode: 'ranking',
      requiredDimensionKeys: ['product'],
      requiredAnswerFacts: ['metric_value', 'data_policy', 'ranking_order', 'ranking_limit'],
    },
    {
      ...common,
      id: 'R2-INV-002',
      question: '当前门店整体的运营库存周转率是多少',
      metricKey: 'inventory_operational_turnover',
      requiredOutputFields: ['outbound_quantity_30d', 'event_weighted_avg_stock_30d', 'operational_turnover_ratio_30d'],
      requiredResultMode: 'scalar',
      requiredDimensionKeys: [],
    },
    {
      ...common,
      id: 'R2-INV-003',
      question: '按库存可用天数从短到长列出前 10 个耗材产品',
      metricKey: 'inventory_days_of_stock',
      requiredOutputFields: ['product_id', 'product_name', 'current_stock', 'avg_daily_outbound_30d', 'days_of_stock_30d'],
      requiredResultMode: 'ranking',
      requiredDimensionKeys: ['product'],
      requiredAnswerFacts: ['metric_value', 'data_policy', 'ranking_order', 'ranking_limit'],
    },
    {
      ...common,
      id: 'R2-INV-004',
      question: '哪些产品当前有库存但最近 90 天没有出库',
      metricKey: 'inventory_slow_moving',
      requiredOutputFields: ['product_id', 'product_name', 'current_stock', 'outbound_quantity_90d', 'slow_moving_status'],
      requiredResultMode: 'detail',
      requiredDimensionKeys: ['product'],
      requiredAnswerFacts: ['metric_value', 'data_policy', 'list_items'],
    },
    {
      ...common,
      id: 'R2-INV-005',
      question: '列出近 30 天运营周转率低于 0.5 的慢动销产品',
      metricKey: 'inventory_slow_moving',
      requiredOutputFields: ['product_id', 'product_name', 'current_stock', 'operational_turnover_ratio_30d', 'slow_moving_status'],
      requiredResultMode: 'detail',
      requiredDimensionKeys: ['product'],
      requiredAnswerFacts: ['metric_value', 'data_policy', 'list_items'],
    },
    {
      ...common,
      id: 'R2-INV-006',
      question: '最近 30 天需求比前 30 天增长超过 50% 的产品有哪些',
      metricKey: 'inventory_demand_change',
      requiredOutputFields: ['product_id', 'product_name', 'outbound_quantity_30d', 'outbound_quantity_previous_30d', 'demand_change_rate_30d'],
      requiredResultMode: 'detail',
      requiredDimensionKeys: ['product'],
      requiredAnswerFacts: ['metric_value', 'data_policy', 'list_items'],
    },
    {
      ...common,
      id: 'R2-INV-007',
      question: '哪些产品低于安全库存且没有未完成采购',
      metricKey: 'inventory_procurement_coverage',
      requiredOutputFields: ['product_id', 'product_name', 'current_stock', 'safety_stock', 'open_procurement_quantity', 'replenishment_fact_status'],
      requiredResultMode: 'detail',
      requiredDimensionKeys: ['product'],
      requiredAnswerFacts: ['metric_value', 'data_policy', 'list_items'],
    },
    {
      ...common,
      id: 'R2-INV-008',
      question: '哪些产品最近 90 天有消耗但没有采购记录',
      metricKey: 'inventory_procurement_coverage',
      requiredOutputFields: ['product_id', 'product_name', 'outbound_quantity_90d', 'procurement_order_count_90d', 'last_procurement_at'],
      requiredResultMode: 'detail',
      requiredDimensionKeys: ['product'],
      requiredAnswerFacts: ['metric_value', 'data_policy', 'list_items'],
    },
    {
      ...common,
      id: 'R2-INV-009',
      question: '本季度每个产品累计出库用量是多少',
      metricKey: 'inventory_outbound_usage',
      requiredOutputFields: ['product_id', 'product_name', 'outbound_quantity_current_quarter'],
      requiredResultMode: 'grouped',
      requiredDimensionKeys: ['product'],
      requiredAnswerFacts: ['metric_value', 'time_range', 'data_policy', 'all_requested_dimensions'],
    },
    {
      ...common,
      id: 'R2-INV-010',
      question: '本月每日平均耗材出库成本估算是多少',
      metricKey: 'inventory_outbound_cost_estimate',
      requiredOutputFields: ['estimated_avg_daily_outbound_cost_current_month'],
      requiredResultMode: 'scalar',
      requiredDimensionKeys: [],
      requiredAnswerFacts: ['metric_value', 'time_range', 'data_policy', 'amount_unit'],
    },
  ];
}

function validate(sourceGold, queryContracts, boundaryContracts, addedContracts) {
  const errors = [];
  if (sourceGold.summary.queryCaseCount !== 429) errors.push(`unexpected_v1_query_count:${sourceGold.summary.queryCaseCount}`);
  if (addedContracts.length !== 10) errors.push(`coverage_r2_must_add_10:${addedContracts.length}`);
  const ids = [...queryContracts, ...boundaryContracts].map((item) => item.id);
  if (new Set(ids).size !== ids.length) errors.push('duplicate_contract_id');
  const checksums = [...queryContracts, ...boundaryContracts].map((item) => item.checksum);
  if (new Set(checksums).size !== checksums.length) errors.push('duplicate_question_checksum');
  if (addedContracts.some((item) => item.requiredViews.join(',') !== 'ask_data_inventory_turnover_view')) {
    errors.push('coverage_r2_question_wrong_view');
  }
  if (addedContracts.some((item) => item.mustClarify || item.supportClass !== 'ask_query_supported')) {
    errors.push('coverage_r2_question_not_direct_query');
  }
  if (addedContracts.some((item) => item.split !== 'development')) {
    errors.push('coverage_r2_question_must_be_development');
  }
  if (errors.length) throw new Error(`coverage_r2_gold_invalid:${errors.join(',')}`);
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0;
}

function argumentValue(prefix) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
