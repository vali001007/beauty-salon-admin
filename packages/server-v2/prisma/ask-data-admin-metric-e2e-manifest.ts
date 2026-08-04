import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  ASK_DATA_ADMIN_EXPLICIT_QUERY_CONTRACT_BY_ID,
  ASK_DATA_ADMIN_METRIC_CORRECTIONS,
} from './ask-data-admin-metric-corrections.js';

type GoldContract = {
  id: string;
  sourceId: string;
  sourceRole: string;
  question: string;
  checksum: string;
  split: 'development' | 'holdout';
  supportClass: string;
  expectedMetricKeys: string[];
  acceptableViews: string[];
  requiredViews: string[];
  requiredOutputFields: string[];
  requiredResultMode: 'scalar' | 'detail' | 'grouped' | 'ranking' | 'trend';
  requiredDimensionKeys: string[];
  requiredAnswerFacts: string[];
  runtimeResolutionRequired: boolean;
  mustClarify: boolean;
  allowedClarificationSlots: string[];
  forbiddenClaims: string[];
};

type Gold = {
  checksum: string;
  queryContracts: GoldContract[];
};

const goldPath = resolve(
  process.cwd(),
  argumentValue('--gold=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask统一Gold题库-v1.json',
);
const outputPath = resolve(
  process.cwd(),
  argumentValue('--output=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask管理端52项现有事实指标真实E2E清单-v1.json',
);
const gold = JSON.parse(readFileSync(goldPath, 'utf8')) as Gold;
const correctionIds = ASK_DATA_ADMIN_METRIC_CORRECTIONS
  .filter((item) => item.supportClass === 'ask_query_supported')
  .map((item) => item.sourceId);
const correctionIdSet = new Set(correctionIds);
const selected = gold.queryContracts.filter((item) => correctionIdSet.has(item.sourceId));
const selectedSourceIds = new Set(selected.map((item) => item.sourceId));
const missing = correctionIds.filter((id) => !selectedSourceIds.has(id));
const duplicates = selected
  .map((item) => item.sourceId)
  .filter((id, index, values) => values.indexOf(id) !== index);

if (correctionIds.length !== 50) throw new Error(`admin_metric_query_count_mismatch:${correctionIds.length}`);
if (ASK_DATA_ADMIN_EXPLICIT_QUERY_CONTRACT_BY_ID.size !== correctionIds.length) {
  throw new Error(`admin_metric_explicit_contract_count_mismatch:contracts=${ASK_DATA_ADMIN_EXPLICIT_QUERY_CONTRACT_BY_ID.size}:queries=${correctionIds.length}`);
}
if (selected.length !== correctionIds.length || missing.length || duplicates.length) {
  throw new Error(`admin_metric_manifest_selection_invalid:selected=${selected.length}:missing=${missing.join(',')}:duplicates=${duplicates.join(',')}`);
}

const selectedQuestions = selected
  .sort((left, right) => left.id.localeCompare(right.id))
  .map((item) => ({
    id: item.id,
    domain: item.sourceRole,
    role: item.sourceRole,
    type: item.supportClass,
    difficulty: item.split === 'holdout' ? 'holdout' : 'development',
    question: item.question,
    expected_target: item.expectedMetricKeys.join(','),
    notes: `requiredViews=${item.requiredViews.join(',')}; requiredAnswerFacts=${item.requiredAnswerFacts.join(',')}`,
    expectedView: item.requiredViews[0],
    expectedViewLabel: item.requiredViews[0],
    expectedMetricKeys: item.expectedMetricKeys,
    acceptableViews: item.acceptableViews,
    requiredViews: item.requiredViews,
    requiredOutputFields: item.requiredOutputFields,
    requiredResultMode: item.requiredResultMode,
    requiredAnswerFacts: item.requiredAnswerFacts,
    split: item.split,
    questionChecksum: item.checksum,
  }));

const sourceContractChecksum = sha256(JSON.stringify(gold.queryContracts.map(contractIdentity)));
const selectedQuestionsChecksum = sha256(JSON.stringify(selectedQuestions.map(selectedIdentity)));
const viewNames = [...new Set(selectedQuestions.flatMap((item) => item.requiredViews))].sort();
const manifest = {
  generatedAt: new Date().toISOString(),
  sourcePath: goldPath,
  sourceQuestionCount: gold.queryContracts.length,
  selectionMode: 'admin_metric_corrections',
  targetPerView: 0,
  viewCount: viewNames.length,
  coveredViews: viewNames.length,
  selectedCaseCount: selectedQuestions.length,
  insufficientViews: [],
  sourceGoldChecksum: gold.checksum,
  sourceContractChecksum,
  selectedQuestionsChecksum,
  checksum: sha256(JSON.stringify({
    sourceGoldChecksum: gold.checksum,
    sourceContractChecksum,
    selectedQuestionsChecksum,
  })),
  selectedQuestions,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  selectedCaseCount: manifest.selectedCaseCount,
  coveredViews: manifest.coveredViews,
  sourceGoldChecksum: manifest.sourceGoldChecksum,
  checksum: manifest.checksum,
}, null, 2));

function contractIdentity(item: GoldContract) {
  return {
    id: item.id,
    checksum: item.checksum,
    split: item.split,
    supportClass: item.supportClass,
    expectedMetricKeys: item.expectedMetricKeys,
    acceptableViews: item.acceptableViews,
    requiredViews: item.requiredViews,
    requiredOutputFields: item.requiredOutputFields,
    requiredResultMode: item.requiredResultMode,
    requiredDimensionKeys: item.requiredDimensionKeys,
    requiredAnswerFacts: item.requiredAnswerFacts,
    runtimeResolutionRequired: item.runtimeResolutionRequired,
    mustClarify: item.mustClarify,
    allowedClarificationSlots: item.allowedClarificationSlots,
    forbiddenClaims: item.forbiddenClaims,
  };
}

function selectedIdentity(item: (typeof selectedQuestions)[number]) {
  return {
    id: item.id,
    questionChecksum: item.questionChecksum,
    expectedMetricKeys: item.expectedMetricKeys,
    acceptableViews: item.acceptableViews,
    requiredViews: item.requiredViews,
    requiredOutputFields: item.requiredOutputFields,
    requiredResultMode: item.requiredResultMode,
    requiredAnswerFacts: item.requiredAnswerFacts,
  };
}

function argumentValue(prefix: string) {
  return [...process.argv].reverse().find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
