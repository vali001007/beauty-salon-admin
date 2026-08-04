import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ASK_DATA_NEW_HOLDOUT_AUDIT } from './ask-data-new-holdout-audit.ts';
import { buildAskDataGoldQuestionContract } from './ask-data-gold-question-contracts.ts';

const candidatePath = resolve(
  process.cwd(),
  argumentValue('--candidate=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout候选-v1.json',
);
const goldPath = resolve(
  process.cwd(),
  argumentValue('--gold=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask统一Gold题库-v1.json',
);
const outputPath = resolve(
  process.cwd(),
  argumentValue('--output=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout合同-v1.json',
);
const force = process.argv.includes('--force');
const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
const gold = JSON.parse(readFileSync(goldPath, 'utf8'));
const questions = candidate.selectedQuestions;
const questionById = new Map(questions.map((item) => [item.id, item]));
const decisionById = new Map(ASK_DATA_NEW_HOLDOUT_AUDIT.map((item) => [item.id, item]));

const errors = [];
if (candidate.selectionMode !== 'new_holdout_candidate') errors.push('candidate_not_new_holdout');
if (questions.length < 100) errors.push(`insufficient_candidate_count:${questions.length}`);
if (decisionById.size !== ASK_DATA_NEW_HOLDOUT_AUDIT.length) errors.push('duplicate_audit_id');
for (const item of questions) if (!decisionById.has(item.id)) errors.push(`missing_audit_decision:${item.id}`);
for (const item of ASK_DATA_NEW_HOLDOUT_AUDIT) if (!questionById.has(item.id)) errors.push(`audit_id_not_in_candidate:${item.id}`);
const goldChecksums = new Set([...gold.queryContracts, ...gold.boundaryContracts].map((item) => item.checksum));
for (const item of questions) if (goldChecksums.has(item.questionChecksum)) errors.push(`gold_leak:${item.id}`);
if (errors.length) throw new Error(`new_holdout_audit_invalid:\n${errors.join('\n')}`);

const contracts = questions.map((question) => {
  const audit = decisionById.get(question.id);
  const contract = buildAskDataGoldQuestionContract({
    sourceSuite: 'ami_brain_2000',
    sourceId: question.id,
    sourceRole: question.role,
    question: question.question,
    expectedView: audit.expectedView,
    supportClass: audit.supportClass,
    managementSupport: audit.managementSupport,
    backendSupport: audit.backendSupport,
    expectedMetricKeys: audit.expectedMetricKeys,
    acceptableViews: audit.acceptableViews,
    requiredViews: audit.requiredViews,
    allowedClarificationSlots: audit.allowedClarificationSlots,
    requiredOutputFields: audit.requiredOutputFields,
    requiredResultMode: audit.requiredResultMode,
  });
  return {
    ...contract,
    split: 'holdout',
    candidateExpectedView: question.expectedView,
    auditNote: audit.auditNote,
  };
});
const queryContracts = contracts.filter((item) => isQuerySupportClass(item.supportClass) && !item.mustClarify);
const boundaryContracts = contracts.filter((item) => !isQuerySupportClass(item.supportClass) || item.mustClarify);
const contractChecksum = createHash('sha256').update(JSON.stringify(contracts.map(contractIdentity))).digest('hex');
const report = {
  version: 1,
  frozenAt: new Date().toISOString(),
  candidatePath,
  candidateChecksum: candidate.checksum,
  sourceChecksum: candidate.sourceChecksum,
  excludedGoldPath: goldPath,
  candidateExcludedGoldChecksum: candidate.excludedGoldChecksum,
  verificationGoldChecksum: gold.checksum,
  goldAdvancedSinceCandidate: candidate.excludedGoldChecksum !== gold.checksum,
  candidateCount: questions.length,
  checksum: createHash('sha256').update(JSON.stringify({
    candidateChecksum: candidate.checksum,
    candidateExcludedGoldChecksum: candidate.excludedGoldChecksum,
    verificationGoldChecksum: gold.checksum,
    contractChecksum,
  })).digest('hex'),
  contractChecksum,
  summary: {
    total: contracts.length,
    querySupported: queryContracts.length,
    clarificationRequired: boundaryContracts.filter((item) => item.mustClarify).length,
    adminSupportedAskNotOpen: boundaryContracts.filter((item) => item.supportClass === 'admin_supported_ask_not_open').length,
    adminBackendUnsupported: boundaryContracts.filter((item) => item.supportClass === 'admin_backend_unsupported').length,
    candidateViewCorrections: contracts.filter((item) => item.requiredViews[0] && item.requiredViews[0] !== item.candidateExpectedView).length,
    goldLeakCount: 0,
  },
  queryContracts,
  boundaryContracts,
};

if (existsSync(outputPath) && !force) {
  const existing = JSON.parse(readFileSync(outputPath, 'utf8'));
  if (existing.checksum !== report.checksum) {
    throw new Error(`frozen_holdout_checksum_changed:${existing.checksum}:${report.checksum}; write a new version instead of mutating v1`);
  }
  console.log(JSON.stringify({ outputPath, unchanged: true, checksum: existing.checksum, summary: existing.summary }, null, 2));
  process.exit(0);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, checksum: report.checksum, summary: report.summary }, null, 2));

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
    mustClarify: item.mustClarify,
    allowedClarificationSlots: item.allowedClarificationSlots,
    managementSupport: item.managementSupport,
    backendSupport: item.backendSupport,
    auditNote: item.auditNote,
  };
}

function isQuerySupportClass(value) {
  return value === 'ask_query_supported' || value === 'ask_query_low_confidence';
}

function argumentValue(prefix) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
