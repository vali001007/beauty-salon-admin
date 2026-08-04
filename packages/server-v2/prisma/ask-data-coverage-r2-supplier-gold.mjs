import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildAskDataGoldQuestionContract } from './ask-data-gold-question-contracts.ts';

const sourcePath = resolve(
  process.cwd(),
  argumentValue('--source=')
    ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v2-Coverage-R2/Ami-Ask统一Gold题库-v2-Coverage-R2.json',
);
const outputPath = resolve(
  process.cwd(),
  argumentValue('--output=')
    ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v3-Coverage-R2-供应商报价/Ami-Ask统一Gold题库-v3-Coverage-R2-供应商报价.json',
);
const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const supplierView = 'ask_data_supplier_quote_terms_view';
const addedContracts = supplierQuestions().map((item) => ({
  ...buildAskDataGoldQuestionContract({
    sourceSuite: 'ask_supplemental',
    sourceId: item.id,
    sourceRole: 'inventory',
    question: item.question,
    expectedView: supplierView,
    supportClass: 'ask_query_supported',
    expectedMetricKeys: [item.metricKey],
    acceptableViews: [supplierView],
    requiredViews: [supplierView],
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

const viewCounts = { ...source.viewCounts, [supplierView]: addedContracts.length };
const developmentQueryCount = queryContracts.filter((item) => item.split === 'development').length;
const holdoutQueryCount = queryContracts.filter((item) => item.split === 'holdout').length;
const report = {
  version: 3,
  generatedAt: new Date().toISOString(),
  sources: [...source.sources, sourcePath, 'ask_data_coverage_r2_supplier_quote_terms'],
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
    coverageR2SupplierAddedQueryCount: addedContracts.length,
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
  supplierQuoteTermsCoverage: viewCounts[supplierView],
}, null, 2));

function supplierQuestions() {
  const commonFacts = ['metric_value', 'data_policy'];
  return [
    {
      id: 'R2-SUP-001',
      question: '列出各供应商当前已审批的商品报价',
      metricKey: 'supplier_latest_quote',
      requiredOutputFields: ['product_id', 'product_name', 'supplier_id', 'supplier_name', 'quote_price'],
      requiredResultMode: 'detail',
      requiredDimensionKeys: ['supplier'],
      requiredAnswerFacts: [...commonFacts, 'list_items'],
    },
    {
      id: 'R2-SUP-002',
      question: '每个商品当前对应的供应商报价是多少',
      metricKey: 'supplier_latest_quote',
      requiredOutputFields: ['product_id', 'product_name', 'supplier_id', 'supplier_name', 'quote_price'],
      requiredResultMode: 'grouped',
      requiredDimensionKeys: ['product'],
      requiredAnswerFacts: [...commonFacts, 'list_items'],
    },
    {
      id: 'R2-SUP-003',
      question: '列出各供应商当前报价的含税状态和库存状态',
      metricKey: 'supplier_latest_quote',
      requiredOutputFields: ['supplier_id', 'supplier_name', 'quote_price', 'tax_included', 'stock_status'],
      requiredResultMode: 'detail',
      requiredDimensionKeys: ['supplier'],
      requiredAnswerFacts: [...commonFacts, 'list_items'],
    },
    {
      id: 'R2-SUP-004',
      question: '哪些商品存在更低的供应商报价，差额是多少',
      metricKey: 'supplier_price_comparison',
      requiredOutputFields: ['product_id', 'product_name', 'supplier_id', 'supplier_name', 'quote_price', 'lowest_current_quote_price', 'price_difference_from_lowest'],
      requiredResultMode: 'detail',
      requiredDimensionKeys: ['product'],
      requiredAnswerFacts: [...commonFacts, 'list_items'],
    },
    {
      id: 'R2-SUP-005',
      question: '同一商品哪个供应商报价最低',
      metricKey: 'supplier_price_comparison',
      requiredOutputFields: ['product_id', 'product_name', 'supplier_id', 'supplier_name', 'quote_price'],
      requiredResultMode: 'ranking',
      requiredDimensionKeys: ['supplier'],
      requiredAnswerFacts: [...commonFacts, 'ranking_order', 'ranking_limit'],
    },
    {
      id: 'R2-SUP-006',
      question: '各品类的最低采购量要求是什么',
      metricKey: 'supplier_minimum_order_quantity',
      requiredOutputFields: ['category_name', 'minimum_order_quantity'],
      requiredResultMode: 'detail',
      requiredDimensionKeys: ['product_category'],
      requiredAnswerFacts: [...commonFacts, 'list_items'],
    },
    {
      id: 'R2-SUP-007',
      question: '列出各商品的供应商起订量',
      metricKey: 'supplier_minimum_order_quantity',
      requiredOutputFields: ['product_id', 'product_name', 'supplier_id', 'supplier_name', 'minimum_order_quantity'],
      requiredResultMode: 'detail',
      requiredDimensionKeys: ['product'],
      requiredAnswerFacts: [...commonFacts, 'list_items'],
    },
    {
      id: 'R2-SUP-008',
      question: '我们和各供应商的账期及结算方式是怎么约定的',
      metricKey: 'supplier_payment_terms',
      requiredOutputFields: ['supplier_id', 'supplier_name', 'payment_terms', 'settlement_mode'],
      requiredResultMode: 'detail',
      requiredDimensionKeys: ['supplier'],
      requiredAnswerFacts: [...commonFacts, 'list_items'],
    },
    {
      id: 'R2-SUP-009',
      question: '哪些供应商报价交期最短',
      metricKey: 'supplier_lead_time',
      requiredOutputFields: ['supplier_id', 'supplier_name', 'lead_days'],
      requiredResultMode: 'ranking',
      requiredDimensionKeys: ['supplier'],
      requiredAnswerFacts: [...commonFacts, 'ranking_order', 'ranking_limit'],
    },
    {
      id: 'R2-SUP-010',
      question: '当前首选供应商报价与同商品最低报价差多少',
      metricKey: 'supplier_price_comparison',
      requiredOutputFields: ['product_id', 'product_name', 'supplier_id', 'supplier_name', 'quote_price', 'lowest_current_quote_price', 'price_difference_from_lowest'],
      requiredResultMode: 'detail',
      requiredDimensionKeys: ['supplier'],
      requiredAnswerFacts: [...commonFacts, 'list_items'],
    },
  ];
}

function validate(sourceGold, queryContracts, boundaryContracts, addedContracts) {
  const errors = [];
  if (sourceGold.summary.queryCaseCount !== 439) errors.push(`unexpected_v2_query_count:${sourceGold.summary.queryCaseCount}`);
  if (sourceGold.summary.coveredViews !== 35) errors.push(`unexpected_v2_view_count:${sourceGold.summary.coveredViews}`);
  if (addedContracts.length !== 10) errors.push(`supplier_r2_must_add_10:${addedContracts.length}`);
  const ids = [...queryContracts, ...boundaryContracts].map((item) => item.id);
  if (new Set(ids).size !== ids.length) errors.push('duplicate_contract_id');
  const checksums = [...queryContracts, ...boundaryContracts].map((item) => item.checksum);
  if (new Set(checksums).size !== checksums.length) errors.push('duplicate_question_checksum');
  if (addedContracts.some((item) => item.requiredViews.join(',') !== supplierView)) {
    errors.push('supplier_r2_question_wrong_view');
  }
  if (addedContracts.some((item) => item.mustClarify || item.supportClass !== 'ask_query_supported')) {
    errors.push('supplier_r2_question_not_direct_query');
  }
  if (addedContracts.some((item) => item.split !== 'development')) {
    errors.push('supplier_r2_question_must_be_development');
  }
  if (errors.length) throw new Error(`supplier_r2_gold_invalid:${errors.join(',')}`);
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0;
}

function argumentValue(prefix) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
