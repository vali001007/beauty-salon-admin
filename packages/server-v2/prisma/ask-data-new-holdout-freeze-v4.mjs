import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildAskDataGoldQuestionContract } from './ask-data-gold-question-contracts.ts';
import { ASK_DATA_NEW_HOLDOUT_V4_SOURCE } from './ask-data-new-holdout-v4-source.ts';

const outputPath = resolve(
  process.cwd(),
  argumentValue('--output=')
    ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout合同-v4.json',
);
const priorPaths = [
  '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask统一Gold题库-v1.json',
  '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout合同-v1.json',
  '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout合同-v2.json',
  '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout合同-v3.json',
].map((path) => resolve(process.cwd(), path));
const similarityThreshold = numericArgument('--similarity-threshold=', 0.86);

const errors = [];
const ids = new Set();
const normalizedQuestions = new Set();
for (const item of ASK_DATA_NEW_HOLDOUT_V4_SOURCE) {
  if (ids.has(item.id)) errors.push(`duplicate_id:${item.id}`);
  ids.add(item.id);
  const normalized = normalizeQuestion(item.question);
  if (normalizedQuestions.has(normalized)) errors.push(`duplicate_question:${item.id}`);
  normalizedQuestions.add(normalized);
  if (!item.productReviewNote) errors.push(`product_review_missing:${item.id}`);
  if (!item.technicalReviewNote) errors.push(`technical_review_missing:${item.id}`);
  if (item.supportClass === 'ask_query_supported') {
    if (!item.requiredViews?.length) errors.push(`query_required_views_missing:${item.id}`);
    if ((item.requiredViews?.length ?? 0) > 2) errors.push(`query_too_many_views:${item.id}`);
    if (!item.requiredOutputFields?.length) errors.push(`query_required_output_missing:${item.id}`);
    if (!item.requiredResultMode) errors.push(`query_result_mode_missing:${item.id}`);
  }
  if (item.supportClass === 'clarification_required' && !item.allowedClarificationSlots?.length) {
    errors.push(`clarification_slots_missing:${item.id}`);
  }
}

const sourceCounts = countBy(ASK_DATA_NEW_HOLDOUT_V4_SOURCE, (item) => item.supportClass);
if (ASK_DATA_NEW_HOLDOUT_V4_SOURCE.length !== 180) errors.push(`total_must_be_180:${ASK_DATA_NEW_HOLDOUT_V4_SOURCE.length}`);
if (sourceCounts.ask_query_supported !== 80) errors.push(`query_must_be_80:${sourceCounts.ask_query_supported ?? 0}`);
if (sourceCounts.clarification_required !== 50) errors.push(`clarification_must_be_50:${sourceCounts.clarification_required ?? 0}`);
const boundaryCount = ASK_DATA_NEW_HOLDOUT_V4_SOURCE.length
  - (sourceCounts.ask_query_supported ?? 0)
  - (sourceCounts.clarification_required ?? 0);
if (boundaryCount !== 50) errors.push(`boundary_must_be_50:${boundaryCount}`);

const priorContracts = priorPaths.flatMap((path) => {
  const report = JSON.parse(readFileSync(path, 'utf8'));
  return [...(report.queryContracts ?? []), ...(report.boundaryContracts ?? [])]
    .map((item) => ({ id: item.id, question: item.question, checksum: item.checksum }));
});
const exactPriorChecksums = new Set(priorContracts.map((item) => item.checksum));
const leakageAudit = [];
for (const item of ASK_DATA_NEW_HOLDOUT_V4_SOURCE) {
  const checksum = questionChecksum(item.question);
  if (exactPriorChecksums.has(checksum)) errors.push(`prior_exact_leak:${item.id}`);
  let best = { id: '', similarity: 0 };
  for (const prior of priorContracts) {
    const similarity = trigramDice(item.question, prior.question);
    if (similarity > best.similarity) best = { id: prior.id, similarity };
  }
  leakageAudit.push({ id: item.id, nearestPriorId: best.id, similarity: Number(best.similarity.toFixed(4)) });
  if (best.similarity >= similarityThreshold) {
    errors.push(`prior_near_duplicate:${item.id}:${best.id}:${best.similarity.toFixed(4)}`);
  }
}

const contracts = ASK_DATA_NEW_HOLDOUT_V4_SOURCE.map((item) => ({
  ...buildAskDataGoldQuestionContract({
    sourceSuite: 'ask_holdout_v4',
    sourceId: item.id,
    sourceRole: item.sourceRole,
    question: item.question,
    expectedView: item.expectedView,
    supportClass: item.supportClass,
    managementSupport: item.managementSupport,
    backendSupport: item.backendSupport,
    expectedMetricKeys: item.expectedMetricKeys,
    acceptableViews: item.acceptableViews,
    requiredViews: item.requiredViews,
    allowedClarificationSlots: item.allowedClarificationSlots,
    requiredOutputFields: item.requiredOutputFields,
    requiredResultMode: item.requiredResultMode,
    requiredDimensionKeys: item.requiredDimensionKeys,
    requiredAnswerFacts: item.requiredAnswerFacts,
  }),
  split: 'holdout',
  productReviewNote: item.productReviewNote,
  technicalReviewNote: item.technicalReviewNote,
}));
const queryContracts = contracts.filter((item) => item.supportClass === 'ask_query_supported' && !item.mustClarify);
const clarificationContracts = contracts.filter((item) => item.supportClass === 'clarification_required' && item.mustClarify);
const boundaryContracts = contracts.filter((item) => !queryContracts.includes(item));
if (queryContracts.length !== 80) errors.push(`built_query_must_be_80:${queryContracts.length}`);
if (clarificationContracts.length !== 50) errors.push(`built_clarification_must_be_50:${clarificationContracts.length}`);
const coveredViews = [...new Set(queryContracts.flatMap((item) => item.requiredViews))].sort();
if (coveredViews.length !== 34) errors.push(`query_view_coverage_must_be_34:${coveredViews.length}`);
if (errors.length) throw new Error(`new_holdout_v4_invalid:\n${errors.join('\n')}`);

const sourceChecksum = createHash('sha256')
  .update(JSON.stringify(ASK_DATA_NEW_HOLDOUT_V4_SOURCE.map(sourceIdentity)))
  .digest('hex');
const contractChecksum = createHash('sha256')
  .update(JSON.stringify(contracts.map(contractIdentity)))
  .digest('hex');
const checksum = createHash('sha256')
  .update(JSON.stringify({ sourceChecksum, contractChecksum, priorChecksums: priorPaths.map(priorChecksum), similarityThreshold }))
  .digest('hex');
const report = {
  version: 4,
  frozenAt: new Date().toISOString(),
  checksum,
  sourceChecksum,
  contractChecksum,
  priorPaths,
  similarityThreshold,
  reviewStatus: {
    productContractReview: 'codex_completed',
    technicalContractReview: 'codex_completed',
    independentHumanSignoff: 'pending',
  },
  summary: {
    total: contracts.length,
    querySupported: queryContracts.length,
    clarificationRequired: clarificationContracts.length,
    boundary: contracts.length - queryContracts.length - clarificationContracts.length,
    coveredViews: coveredViews.length,
    exactPriorLeakCount: 0,
    nearDuplicatePriorLeakCount: 0,
    maxPriorSimilarity: Math.max(...leakageAudit.map((item) => item.similarity)),
  },
  coveredViews,
  queryContracts,
  boundaryContracts,
  leakageAudit,
};

if (existsSync(outputPath)) {
  const existing = JSON.parse(readFileSync(outputPath, 'utf8'));
  if (existing.checksum !== report.checksum) {
    throw new Error(`frozen_holdout_v4_checksum_changed:${existing.checksum}:${report.checksum}; create v5 instead of mutating v4`);
  }
  console.log(JSON.stringify({ outputPath, unchanged: true, checksum: existing.checksum, summary: existing.summary }, null, 2));
  process.exit(0);
}
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, checksum, summary: report.summary, reviewStatus: report.reviewStatus }, null, 2));

function sourceIdentity(item) {
  return {
    id: item.id,
    question: item.question,
    supportClass: item.supportClass,
    expectedView: item.expectedView,
    requiredViews: item.requiredViews,
    allowedClarificationSlots: item.allowedClarificationSlots,
    requiredOutputFields: item.requiredOutputFields,
    requiredResultMode: item.requiredResultMode,
    managementSupport: item.managementSupport,
    backendSupport: item.backendSupport,
    productReviewNote: item.productReviewNote,
    technicalReviewNote: item.technicalReviewNote,
  };
}

function contractIdentity(item) {
  return {
    id: item.id,
    checksum: item.checksum,
    supportClass: item.supportClass,
    expectedMetricKeys: item.expectedMetricKeys,
    acceptableViews: item.acceptableViews,
    requiredViews: item.requiredViews,
    requiredOutputFields: item.requiredOutputFields,
    requiredResultMode: item.requiredResultMode,
    requiredDimensionKeys: item.requiredDimensionKeys,
    requiredAnswerFacts: item.requiredAnswerFacts,
    mustClarify: item.mustClarify,
    allowedClarificationSlots: item.allowedClarificationSlots,
    managementSupport: item.managementSupport,
    backendSupport: item.backendSupport,
    productReviewNote: item.productReviewNote,
    technicalReviewNote: item.technicalReviewNote,
  };
}

function priorChecksum(path) {
  const report = JSON.parse(readFileSync(path, 'utf8'));
  return report.checksum ?? createHash('sha256').update(JSON.stringify(report)).digest('hex');
}

function countBy(items, selector) {
  return Object.fromEntries([...items.reduce((map, item) => {
    const key = selector(item);
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function questionChecksum(question) {
  return createHash('sha256').update(normalizeQuestion(question)).digest('hex');
}

function normalizeQuestion(value) {
  return value.trim().toLowerCase().replace(/[\s，。！？?、；;：:（）()“”"'`]+/g, '');
}

function trigramDice(left, right) {
  const leftGrams = grams(normalizeQuestion(left), 3);
  const rightGrams = grams(normalizeQuestion(right), 3);
  if (!leftGrams.size || !rightGrams.size) return normalizeQuestion(left) === normalizeQuestion(right) ? 1 : 0;
  let overlap = 0;
  for (const value of leftGrams) if (rightGrams.has(value)) overlap += 1;
  return (2 * overlap) / (leftGrams.size + rightGrams.size);
}

function grams(value, size) {
  const result = new Set();
  for (let index = 0; index <= value.length - size; index += 1) result.add(value.slice(index, index + size));
  return result;
}

function numericArgument(prefix, fallback) {
  const raw = argumentValue(prefix);
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : fallback;
}

function argumentValue(prefix) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
