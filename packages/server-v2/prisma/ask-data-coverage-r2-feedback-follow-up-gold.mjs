import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildAskDataGoldQuestionContract } from './ask-data-gold-question-contracts.ts';

const sourcePath = resolve(
  process.cwd(),
  argumentValue('--source=')
    ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v3-Coverage-R2-供应商报价/Ami-Ask统一Gold题库-v3-Coverage-R2-供应商报价.json',
);
const outputPath = resolve(
  process.cwd(),
  argumentValue('--output=')
    ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v4-Coverage-R2-反馈名单轻量化/Ami-Ask统一Gold题库-v4-Coverage-R2-反馈名单轻量化.json',
);
const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const correctedIds = new Set([
  'ami_brain_2000:BQ0128',
  'agent_650:manager-025',
  'agent_650:manager-090',
]);
const supplierBoundaryCorrectionIds = new Set([
  'agent_650:inventory-050',
  'agent_650:inventory-061',
]);
const supplierPromotedQueryId = 'agent_650:inventory-065';
const supplierPromotedSource = source.boundaryContracts.find((item) => item.id === supplierPromotedQueryId);
if (!supplierPromotedSource) throw new Error(`missing_supplier_promoted_source:${supplierPromotedQueryId}`);

const queryContracts = [
  ...source.queryContracts.map((item) => (
    correctedIds.has(item.id) ? refreshFeedbackFollowUpContract(item) : item
  )),
  refreshSupplierBoundaryContract(supplierPromotedSource),
];
const boundaryContracts = source.boundaryContracts
  .filter((item) => item.id !== supplierPromotedQueryId)
  .map((item) => (
    supplierBoundaryCorrectionIds.has(item.id) ? refreshSupplierBoundaryContract(item) : item
  ));
const developmentQueryCount = queryContracts.filter((item) => item.split === 'development').length;
const holdoutQueryCount = queryContracts.filter((item) => item.split === 'holdout').length;
const changedIds = queryContracts
  .slice(0, source.queryContracts.length)
  .filter((item, index) => JSON.stringify(item) !== JSON.stringify(source.queryContracts[index]))
  .map((item) => item.id)
  .sort();
if (JSON.stringify(changedIds) !== JSON.stringify([...correctedIds].sort())) {
  throw new Error(`unexpected_feedback_follow_up_contract_changes:${changedIds.join(',')}`);
}
if (boundaryContracts.length !== source.boundaryContracts.length - 1) {
  throw new Error(`unexpected_supplier_boundary_contract_count:${boundaryContracts.length}`);
}

for (const id of correctedIds) {
  const contract = queryContracts.find((item) => item.id === id);
  if (!contract) throw new Error(`missing_feedback_follow_up_contract:${id}`);
  if (contract.requiredOutputFields.includes('feedback_count') || contract.requiredOutputFields.includes('average_rating')) {
    throw new Error(`feedback_follow_up_statistics_not_removed:${id}`);
  }
  for (const field of ['feedback_id', 'customer_id', 'customer_name_masked', 'feedback_type', 'rating']) {
    if (!contract.requiredOutputFields.includes(field)) throw new Error(`feedback_follow_up_field_missing:${id}:${field}`);
  }
}

assertSupplierBoundaryContract(boundaryContracts, 'agent_650:inventory-050', {
  supportClass: 'clarification_required',
  mustClarify: true,
  allowedClarificationSlots: ['comparison_baseline'],
});
assertSupplierBoundaryContract(boundaryContracts, 'agent_650:inventory-061', {
  supportClass: 'ask_scope_limit',
  mustClarify: false,
  allowedClarificationSlots: [],
});
const supplierAlternative = queryContracts.find((item) => item.id === supplierPromotedQueryId);
if (!supplierAlternative) throw new Error('missing_supplier_boundary_contract:agent_650:inventory-065');
if (
  supplierAlternative.supportClass !== 'ask_query_supported'
  || supplierAlternative.expectedMetricKeys.join(',') !== 'supplier_price_comparison'
  || supplierAlternative.requiredViews.join(',') !== 'ask_data_supplier_quote_terms_view'
) {
  throw new Error('supplier_alternative_fact_contract_invalid:agent_650:inventory-065');
}

const report = {
  ...source,
  version: 4,
  generatedAt: new Date().toISOString(),
  sources: [...source.sources, sourcePath, 'ask_data_feedback_follow_up_detail_contract'],
  checksum: createHash('sha256').update(JSON.stringify(queryContracts.map((item) => item.checksum))).digest('hex'),
  boundaryChecksum: createHash('sha256')
    .update(JSON.stringify(boundaryContracts.map((item) => ({
      checksum: item.checksum,
      supportClass: item.supportClass,
      expectedMetricKeys: item.expectedMetricKeys,
      acceptableViews: item.acceptableViews,
      requiredViews: item.requiredViews,
      mustClarify: item.mustClarify,
      allowedClarificationSlots: item.allowedClarificationSlots,
      managementSupport: item.managementSupport,
      backendSupport: item.backendSupport,
    }))))
    .digest('hex'),
  summary: {
    ...source.summary,
    queryCaseCount: queryContracts.length,
    boundaryCaseCount: boundaryContracts.length,
    uniqueQuestionCount: new Set([...queryContracts, ...boundaryContracts].map((item) => item.checksum)).size,
    developmentQueryCount,
    holdoutQueryCount,
    holdoutRate: Number((holdoutQueryCount / queryContracts.length).toFixed(4)),
    feedbackFollowUpContractCorrectionCount: correctedIds.size,
    supplierBoundaryContractCorrectionCount: supplierBoundaryCorrectionIds.size + 1,
    supplierBoundaryPromotedQueryCount: 1,
  },
  viewCounts: {
    ...source.viewCounts,
    ask_data_supplier_quote_terms_view: source.viewCounts.ask_data_supplier_quote_terms_view + 1,
  },
  queryContracts,
  boundaryContracts,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  checksum: report.checksum,
  boundaryChecksum: report.boundaryChecksum,
  queryCaseCount: report.queryContracts.length,
  boundaryCaseCount: report.boundaryContracts.length,
  coveredViews: report.summary.coveredViews,
  viewsAtLeastTen: report.summary.viewsAtLeastTen,
  feedbackFollowUpContractCorrectionCount: report.summary.feedbackFollowUpContractCorrectionCount,
  supplierBoundaryContractCorrectionCount: report.summary.supplierBoundaryContractCorrectionCount,
  supplierBoundaryPromotedQueryCount: report.summary.supplierBoundaryPromotedQueryCount,
  correctedIds: [...correctedIds].sort(),
  supplierBoundaryCorrectedIds: [...supplierBoundaryCorrectionIds, supplierPromotedQueryId].sort(),
}, null, 2));

function refreshFeedbackFollowUpContract(item) {
  return {
    ...buildAskDataGoldQuestionContract({
      sourceSuite: item.sourceSuite,
      sourceId: item.sourceId,
      sourceRole: item.sourceRole,
      question: item.question,
      supportClass: item.supportClass,
      expectedMetricKeys: item.expectedMetricKeys,
      acceptableViews: item.acceptableViews,
      requiredViews: item.requiredViews,
      allowedClarificationSlots: item.allowedClarificationSlots,
      requiredResultMode: item.requiredResultMode,
      requiredDimensionKeys: item.requiredDimensionKeys,
      requiredAnswerFacts: item.requiredAnswerFacts,
      managementSupport: item.managementSupport,
      backendSupport: item.backendSupport,
    }),
    split: item.split,
  };
}

function refreshSupplierBoundaryContract(item) {
  if (item.id === 'agent_650:inventory-050') {
    return {
      ...buildAskDataGoldQuestionContract({
        sourceSuite: item.sourceSuite,
        sourceId: item.sourceId,
        sourceRole: item.sourceRole,
        question: item.question,
        supportClass: 'clarification_required',
        expectedMetricKeys: [],
        acceptableViews: [],
        requiredViews: [],
        allowedClarificationSlots: ['comparison_baseline'],
        requiredResultMode: 'ranking',
        requiredDimensionKeys: ['supplier'],
        requiredAnswerFacts: ['data_policy'],
        managementSupport: 'partial',
        backendSupport: 'partial',
      }),
      split: item.split,
    };
  }
  if (item.id === 'agent_650:inventory-061') {
    return {
      ...buildAskDataGoldQuestionContract({
        sourceSuite: item.sourceSuite,
        sourceId: item.sourceId,
        sourceRole: item.sourceRole,
        question: item.question,
        supportClass: 'ask_scope_limit',
        expectedMetricKeys: [],
        acceptableViews: [],
        requiredViews: [],
        allowedClarificationSlots: [],
        requiredResultMode: 'trend',
        requiredDimensionKeys: ['date'],
        requiredAnswerFacts: ['time_range', 'data_policy'],
        managementSupport: 'unsupported',
        backendSupport: 'partial',
      }),
      split: item.split,
    };
  }
  return {
    ...buildAskDataGoldQuestionContract({
      sourceSuite: item.sourceSuite,
      sourceId: item.sourceId,
      sourceRole: item.sourceRole,
      question: item.question,
      expectedView: 'ask_data_supplier_quote_terms_view',
      supportClass: 'ask_query_supported',
      expectedMetricKeys: ['supplier_price_comparison'],
      acceptableViews: ['ask_data_supplier_quote_terms_view'],
      requiredViews: ['ask_data_supplier_quote_terms_view'],
      allowedClarificationSlots: [],
      requiredResultMode: 'detail',
      requiredDimensionKeys: ['product', 'supplier'],
      requiredOutputFields: [
        'product_id',
        'product_name',
        'supplier_id',
        'supplier_name',
        'quote_price',
        'lowest_current_quote_price',
        'price_difference_from_lowest',
      ],
      requiredAnswerFacts: ['metric_value', 'data_policy', 'list_items', 'amount_unit'],
      managementSupport: 'supported',
      backendSupport: 'supported',
    }),
    split: item.split,
  };
}

function assertSupplierBoundaryContract(contracts, id, expected) {
  const contract = contracts.find((item) => item.id === id);
  if (!contract) throw new Error(`missing_supplier_boundary_contract:${id}`);
  if (
    contract.supportClass !== expected.supportClass
    || contract.mustClarify !== expected.mustClarify
    || JSON.stringify(contract.allowedClarificationSlots) !== JSON.stringify(expected.allowedClarificationSlots)
    || contract.expectedMetricKeys.length
    || contract.requiredViews.length
    || contract.acceptableViews.length
  ) {
    throw new Error(`supplier_boundary_contract_invalid:${id}`);
  }
}

function argumentValue(prefix) {
  const values = process.argv.filter((argument) => argument.startsWith(prefix));
  return values.length ? values.at(-1).slice(prefix.length) : undefined;
}
