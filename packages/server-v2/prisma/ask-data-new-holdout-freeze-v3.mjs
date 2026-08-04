import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ASK_DATA_NEW_HOLDOUT_AUDIT_V3 } from './ask-data-new-holdout-audit-v3.ts';
import { buildAskDataGoldQuestionContract } from './ask-data-gold-question-contracts.ts';

const candidatePath = resolve(process.cwd(), argumentValue('--candidate=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout候选-v3.json');
const exclusionPath = resolve(process.cwd(), argumentValue('--exclusion=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout排除集-v3.json');
const outputPath = resolve(process.cwd(), argumentValue('--output=') ?? '../../docs/04-测试数据/Ami-Ask统一Gold题库-v1/Ami-Ask全新独立Holdout合同-v3.json');
const force = process.argv.includes('--force');
const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
const exclusion = JSON.parse(readFileSync(exclusionPath, 'utf8'));
const candidateById = new Map(candidate.selectedQuestions.map((item) => [item.id, item]));
const decisionById = new Map(ASK_DATA_NEW_HOLDOUT_AUDIT_V3.map((item) => [item.id, item]));
const errors = [];
if (decisionById.size !== ASK_DATA_NEW_HOLDOUT_AUDIT_V3.length) errors.push('duplicate_audit_id');
if (decisionById.size < 120) errors.push(`insufficient_audited_cases:${decisionById.size}`);
for (const decision of ASK_DATA_NEW_HOLDOUT_AUDIT_V3) if (!candidateById.has(decision.id)) errors.push(`audit_id_not_in_candidate:${decision.id}`);
for (const question of candidate.selectedQuestions) if (!decisionById.has(question.id)) errors.push(`candidate_missing_audit:${question.id}`);
const excludedChecksums = new Set(exclusion.queryContracts.map((item) => item.checksum));
for (const decision of ASK_DATA_NEW_HOLDOUT_AUDIT_V3) {
  const question = candidateById.get(decision.id);
  if (question && excludedChecksums.has(question.questionChecksum)) errors.push(`prior_set_leak:${decision.id}`);
}
if (errors.length) throw new Error(`new_holdout_v3_invalid:\n${errors.join('\n')}`);

const contracts = ASK_DATA_NEW_HOLDOUT_AUDIT_V3.map((audit) => {
  const question = candidateById.get(audit.id);
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
  return { ...contract, split: 'holdout', candidateExpectedView: question.expectedView, auditNote: audit.auditNote };
});
const queryContracts = contracts.filter((item) => ['ask_query_supported', 'ask_query_low_confidence'].includes(item.supportClass) && !item.mustClarify);
const boundaryContracts = contracts.filter((item) => !queryContracts.includes(item));
const contractChecksum = createHash('sha256').update(JSON.stringify(contracts.map(identity))).digest('hex');
const report = {
  version: 3,
  frozenAt: new Date().toISOString(),
  candidatePath,
  candidateChecksum: candidate.checksum,
  exclusionPath,
  exclusionChecksum: exclusion.checksum,
  checksum: createHash('sha256').update(JSON.stringify({ candidateChecksum: candidate.checksum, exclusionChecksum: exclusion.checksum, contractChecksum })).digest('hex'),
  contractChecksum,
  summary: {
    total: contracts.length,
    querySupported: queryContracts.length,
    clarificationRequired: boundaryContracts.filter((item) => item.mustClarify).length,
    adminSupportedAskNotOpen: boundaryContracts.filter((item) => item.supportClass === 'admin_supported_ask_not_open').length,
    adminBackendUnsupported: boundaryContracts.filter((item) => item.supportClass === 'admin_backend_unsupported').length,
    brainContentOrAdvice: boundaryContracts.filter((item) => item.supportClass === 'brain_content_or_advice').length,
    priorSetLeakCount: 0,
  },
  queryContracts,
  boundaryContracts,
};
if (existsSync(outputPath) && !force) {
  const existing = JSON.parse(readFileSync(outputPath, 'utf8'));
  if (existing.checksum !== report.checksum) throw new Error(`frozen_holdout_v3_checksum_changed:${existing.checksum}:${report.checksum}`);
  console.log(JSON.stringify({ outputPath, unchanged: true, checksum: existing.checksum, summary: existing.summary }, null, 2));
  process.exit(0);
}
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, checksum: report.checksum, summary: report.summary }, null, 2));

function identity(item) {
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

function argumentValue(prefix) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
