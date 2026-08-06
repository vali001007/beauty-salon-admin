#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import {
  closeCandidateEvidence,
  QUERY_ONLY_REQUIRED_EVIDENCE_TYPES,
  validateCandidateLock,
} from './ami-brain-candidate-identity-core.mjs';
import { checksum, stableStringify } from './ami-brain-check-core.mjs';
import { createReceiptUploadHeaders } from './ami-brain-check.mjs';
import { verifyEvidenceReceiptForCandidate } from './ami-brain-release-candidate.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const serverRoot = resolve(dirname(scriptPath), '..');
const repoRoot = resolve(serverRoot, '../..');
const HASH_64 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const MAX_RELEASE_RECEIPT_VALIDITY_MS = 168 * 60 * 60 * 1000;

export const QUERY_ONLY_RELEASE_CAPABILITIES = Object.freeze([
  'appointment_gap_list',
  'beautician_customer_card_progress',
  'beautician_material_preparation',
  'beautician_personal_performance',
  'beautician_service_overview',
  'customer_facts',
  'customer_priority_recommendation',
  'customer_waiting_loss_overview',
  'finance_material_cost_summary',
  'finance_payment_breakdown',
  'finance_risk_overview',
  'finance_staff_refund_rate_boundary',
  'finance_transaction_anomaly_review',
  'front_desk_operations_overview',
  'inventory_operations_overview',
  'inventory_procurement_advice',
  'inventory_receipt_discrepancy_guidance',
  'inventory_risk_ranking',
  'manager_staff_overview',
  'marketing_automation_rule_preview',
  'marketing_campaign_cost_attribution_review',
  'marketing_campaign_plan',
  'marketing_customer_segment',
  'marketing_growth_overview',
  'marketing_message_draft',
  'order_revenue_analysis',
  'product_sales_ranking',
  'project_margin_analysis',
  'project_material_consumption_analysis',
  'project_service_ranking',
  'reservation_list',
  'staff_performance_ranking',
  'store_operations_overview',
  'card_usage_action_preview',
  'customer_follow_up_draft',
  'gap_fill_touch_preview',
  'marketing_strategy_execute_preview',
  'marketing_touch_draft',
  'purchase_order_draft',
  'reservation_action_preview',
  'service_record_completion_preview',
]);

export function buildProtectedReleaseReceipt({
  candidateReceipt: candidateReceiptValue,
  candidateLock: candidateLockValue,
  evidenceReceipts: evidenceReceiptValues,
  releaseContract: releaseContractValue,
  workflow,
  eventName,
  branch,
  now = new Date(),
  expiresInHours = 168,
}) {
  const lock = validateCandidateLock(candidateLockValue);
  if (lock.identity.productProfile !== 'query_only_v1') {
    throw new Error(`release_receipt_product_profile_unsupported:${lock.identity.productProfile}`);
  }
  const candidateReceipt = validateCandidateReceipt(candidateReceiptValue, lock, now);
  const receiptWorkflow = requiredText(workflow, 'release_receipt_workflow_missing');
  const receiptEventName = requiredText(eventName, 'release_receipt_event_name_missing');
  const receiptBranch = requiredText(branch ?? candidateReceipt.branch, 'release_receipt_branch_missing');
  if (candidateReceipt.branch && candidateReceipt.branch !== receiptBranch) {
    throw new Error('release_receipt_candidate_branch_mismatch');
  }

  const evidenceReceipts = evidenceReceiptValues.map((value) => value && typeof value === 'object' ? value : {});
  const evidenceTypes = evidenceReceipts.map((receipt) => String(receipt.evidenceType ?? '')).sort();
  if (
    evidenceTypes.length !== QUERY_ONLY_REQUIRED_EVIDENCE_TYPES.length
    || new Set(evidenceTypes).size !== QUERY_ONLY_REQUIRED_EVIDENCE_TYPES.length
    || !sameSet(evidenceTypes, QUERY_ONLY_REQUIRED_EVIDENCE_TYPES)
  ) {
    throw new Error('release_receipt_evidence_manifest_invalid');
  }
  const eligibility = closeCandidateEvidence({
    candidateLock: lock,
    evidenceReceipts,
    requiredEvidenceTypes: QUERY_ONLY_REQUIRED_EVIDENCE_TYPES,
  }, now);
  if (!eligibility.releaseEligible || eligibility.blockers.length) {
    throw new Error(`release_receipt_evidence_not_ready:${eligibility.blockers.join(',') || 'blocked'}`);
  }

  const releaseContract = validateReleaseContract(releaseContractValue, lock);
  const evalRunId = positiveInteger(releaseContract.stages.releaseCore.runId, 'release_receipt_eval_run_id_invalid');
  const evidenceByType = new Map(evidenceReceipts.map((receipt) => [receipt.evidenceType, receipt]));
  const results = QUERY_ONLY_REQUIRED_EVIDENCE_TYPES.map((gateKey) => {
    const evidence = evidenceByType.get(gateKey);
    const artifactChecksums = Object.fromEntries(
      Object.entries(evidence.artifactChecksums ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    );
    return {
      gateId: gateKey,
      gateKey,
      description: `Verified Ami Brain release evidence: ${gateKey}`,
      status: 'passed',
      inputChecksum: checksum({
        candidateId: lock.candidateId,
        gateKey,
        evidenceResultChecksum: evidence.resultChecksum,
      }),
      outputChecksum: checksum(artifactChecksums),
      resultChecksum: evidence.resultChecksum,
      evidenceReceiptChecksum: checksum(evidence),
      artifactPaths: [...evidence.artifactPaths],
      artifactChecksums,
      reviewedBy: evidence.reviewedBy ?? null,
      reviewerRole: evidence.reviewerRole ?? null,
      traceRefs: [...(evidence.traceRefs ?? [])],
      startedAt: evidence.createdAt,
      finishedAt: evidence.createdAt,
      durationMs: 0,
      modelInvocationCount: gateKey === 'release_contract' ? 350 : 0,
    };
  });
  const plan = {
    stage: 'release',
    productProfile: 'query_only_v1',
    files: Array.isArray(candidateReceipt.plan?.files) ? [...candidateReceipt.plan.files] : [],
    gates: QUERY_ONLY_REQUIRED_EVIDENCE_TYPES.map((id) => ({ id })),
    capabilities: [...QUERY_ONLY_RELEASE_CAPABILITIES],
    capabilityManifest: {
      id: 'ami-brain-query-only-v1',
      allowedCount: 33,
      disabledCount: 8,
      totalCount: QUERY_ONLY_RELEASE_CAPABILITIES.length,
    },
    evidenceChecksums: eligibility.evidenceChecksums,
  };
  const identity = {
    stage: 'release',
    riskLevel: 'critical',
    changedFilesChecksum: candidateReceipt.changedFilesChecksum,
    diffChecksum: candidateReceipt.diffChecksum,
    sourceFingerprint: candidateReceipt.sourceFingerprint,
    releaseFingerprint: lock.identity.releaseFingerprint,
    suiteChecksum: lock.identity.suiteManifestChecksum,
    dataSnapshot: lock.identity.dataSnapshot,
    provider: lock.identity.provider,
    model: lock.identity.model,
    timeout: lock.identity.timeoutMs,
    repository: candidateReceipt.repository,
    branch: receiptBranch,
    workflow: receiptWorkflow,
    eventName: receiptEventName,
    baseCommit: candidateReceipt.baseCommit,
    mergeBaseCommit: candidateReceipt.mergeBaseCommit,
    headCommit: candidateReceipt.headCommit,
    candidateKey: candidateReceipt.candidateKey,
    candidateId: lock.candidateId,
    evalRunId,
    evaluationReleaseId: lock.identity.evaluationIdentity.internalReleaseId,
  };
  const identityChecksum = checksum(identity);
  const resultChecksum = checksum(results);
  const configuredExpiry = new Date(now.getTime() + boundedHours(expiresInHours) * 60 * 60 * 1000);
  const evidenceExpiry = new Date(eligibility.expiresAt);
  const expiresAt = new Date(Math.min(configuredExpiry.getTime(), evidenceExpiry.getTime()));
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) throw new Error('release_receipt_expiry_invalid');
  const receiptId = `release-receipt:${lock.candidateId}:${evalRunId}:${resultChecksum.slice(0, 16)}`;
  return {
    schemaVersion: 3,
    receiptId,
    receiptKey: receiptId,
    ...identity,
    identityChecksum,
    resultChecksum,
    status: 'passed',
    plan,
    results,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    releaseEvidence: {
      contractVersion: releaseContract.contractVersion,
      decision: releaseContract.decision,
      candidateId: lock.candidateId,
      evaluationVersionCode: lock.identity.evaluationIdentity.code,
      evaluationReleaseId: lock.identity.evaluationIdentity.internalReleaseId,
      evalRunId,
      eligibilityResultChecksum: eligibility.resultChecksum,
      candidateReceiptId: candidateReceipt.receiptId,
      candidateReceiptIdentityChecksum: candidateReceipt.identityChecksum,
    },
  };
}

export function validateCandidateReceipt(value, lockValue, now = new Date()) {
  const lock = validateCandidateLock(lockValue);
  const receipt = value && typeof value === 'object' ? value : {};
  if (Number(receipt.schemaVersion) !== 3 || receipt.stage !== 'candidate' || receipt.status !== 'passed') {
    throw new Error('release_receipt_candidate_receipt_invalid');
  }
  const normalized = {
    ...receipt,
    receiptId: requiredText(receipt.receiptId ?? receipt.receiptKey, 'release_receipt_candidate_receipt_id_missing'),
    repository: requiredText(receipt.repository, 'release_receipt_candidate_repository_missing'),
    branch: optionalText(receipt.branch),
    workflow: requiredText(receipt.workflow, 'release_receipt_candidate_workflow_missing'),
    eventName: requiredText(receipt.eventName, 'release_receipt_candidate_event_missing'),
    baseCommit: commit(receipt.baseCommit, 'release_receipt_candidate_base_commit_invalid'),
    mergeBaseCommit: commit(receipt.mergeBaseCommit, 'release_receipt_candidate_merge_base_invalid'),
    headCommit: commit(receipt.headCommit, 'release_receipt_candidate_head_commit_invalid'),
    candidateKey: requiredText(receipt.candidateKey, 'release_receipt_candidate_key_missing'),
    changedFilesChecksum: hash64(receipt.changedFilesChecksum, 'release_receipt_candidate_changed_files_invalid'),
    diffChecksum: hash64(receipt.diffChecksum, 'release_receipt_candidate_diff_invalid'),
    sourceFingerprint: hash64(receipt.sourceFingerprint, 'release_receipt_candidate_source_invalid'),
    suiteChecksum: hash64(receipt.suiteChecksum, 'release_receipt_candidate_suite_invalid'),
    identityChecksum: hash64(receipt.identityChecksum, 'release_receipt_candidate_identity_invalid'),
    resultChecksum: hash64(receipt.resultChecksum, 'release_receipt_candidate_result_invalid'),
  };
  if (normalized.headCommit !== lock.identity.runtimeCommit) throw new Error('release_receipt_candidate_head_mismatch');
  const expiresAt = new Date(requiredText(receipt.expiresAt, 'release_receipt_candidate_expiry_missing'));
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) throw new Error('release_receipt_candidate_receipt_expired');
  const candidateIdentity = {
    stage: 'candidate',
    riskLevel: requiredText(receipt.riskLevel, 'release_receipt_candidate_risk_missing'),
    changedFilesChecksum: normalized.changedFilesChecksum,
    diffChecksum: normalized.diffChecksum,
    sourceFingerprint: normalized.sourceFingerprint,
    releaseFingerprint: nullableText(receipt.releaseFingerprint),
    suiteChecksum: normalized.suiteChecksum,
    dataSnapshot: nullableText(receipt.dataSnapshot),
    provider: nullableText(receipt.provider),
    model: nullableText(receipt.model),
    timeout: receipt.timeout === null || receipt.timeout === undefined ? null : positiveInteger(receipt.timeout, 'release_receipt_candidate_timeout_invalid'),
    repository: normalized.repository,
    branch: normalized.branch,
    workflow: normalized.workflow,
    eventName: normalized.eventName,
    baseCommit: normalized.baseCommit,
    mergeBaseCommit: normalized.mergeBaseCommit,
    headCommit: normalized.headCommit,
    candidateKey: normalized.candidateKey,
    candidateId: nullableText(receipt.candidateId),
    evalRunId: receipt.evalRunId === null || receipt.evalRunId === undefined ? null : positiveInteger(receipt.evalRunId, 'release_receipt_candidate_eval_run_invalid'),
    evaluationReleaseId: receipt.evaluationReleaseId === null || receipt.evaluationReleaseId === undefined
      ? null
      : positiveInteger(receipt.evaluationReleaseId, 'release_receipt_candidate_evaluation_release_invalid'),
  };
  if (checksum(candidateIdentity) !== normalized.identityChecksum) throw new Error('release_receipt_candidate_identity_checksum_mismatch');
  if (!Array.isArray(receipt.results) || checksum(receipt.results) !== normalized.resultChecksum) {
    throw new Error('release_receipt_candidate_result_checksum_mismatch');
  }
  return normalized;
}

export function validateReleaseContract(value, lockValue) {
  const lock = validateCandidateLock(lockValue);
  const artifact = value && typeof value === 'object' ? value : {};
  if (
    artifact.contractVersion !== 'ami-brain-release-acceptance/v2'
    || artifact.canActivate !== true
    || artifact.decision !== 'ready_for_activation'
    || (artifact.blockingReasons ?? []).length
    || artifact.releaseGate?.suite !== 'release-core'
    || artifact.releaseGate?.expectedCaseCount !== 350
    || artifact.releaseGate?.manifestCaseCount !== 350
    || artifact.releaseGate?.resultCount !== 350
    || artifact.releaseGate?.complete !== true
    || artifact.stages?.releaseCore?.total !== 350
    || artifact.stages?.releaseCore?.expectedTotal !== 350
    || artifact.stages?.releaseCore?.failed !== 0
    || artifact.stages?.releaseCore?.providerUnavailable !== 0
    || artifact.stages?.releaseCore?.providerEvidence?.candidatePrimaryRouteEligible !== true
    || artifact.stages?.releaseCore?.scorecards?.suspectedFalseSuccess?.count !== 0
  ) throw new Error('release_receipt_release_contract_not_ready');
  const identity = artifact.pipelineIdentity ?? {};
  const mismatches = [];
  if (identity.runtimeCommit !== lock.identity.runtimeCommit) mismatches.push('runtimeCommit');
  if (identity.sourceCommit !== lock.identity.runtimeCommit) mismatches.push('sourceCommit');
  if (Number(identity.releaseId) !== lock.identity.releaseId) mismatches.push('releaseId');
  if (identity.releaseFingerprint !== lock.identity.releaseFingerprint) mismatches.push('releaseFingerprint');
  if (identity.suiteManifestChecksum !== lock.identity.suiteManifestChecksum) mismatches.push('suiteManifestChecksum');
  if (Number(identity.storeId) !== lock.identity.storeId) mismatches.push('storeId');
  if (mismatches.length) throw new Error(`release_receipt_release_contract_identity_mismatch:${mismatches.join(',')}`);
  return artifact;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const candidateLockPath = resolveRepoFile(options.candidateLock, 'release_receipt_candidate_lock_missing');
  const candidateReceiptPath = resolveRepoFile(options.candidateReceipt, 'release_receipt_candidate_receipt_missing');
  const lock = validateCandidateLock(readJson(candidateLockPath));
  const evidenceDirectory = resolveRepoDirectory(options.evidenceDir, 'release_receipt_evidence_directory_missing');
  const evidenceReceipts = readdirSync(evidenceDirectory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => verifyEvidenceReceiptForCandidate(lock, readJson(resolve(evidenceDirectory, name)), { repoRoot }));
  const releaseEvidenceReceipt = evidenceReceipts.find((receipt) => receipt.evidenceType === 'release_contract');
  if (!releaseEvidenceReceipt) throw new Error('release_receipt_release_contract_receipt_missing');
  const releaseContract = releaseEvidenceReceipt.artifactPaths
    .map((path) => readJson(resolveRepoFile(path, 'release_receipt_release_contract_artifact_missing')))
    .find((artifact) => artifact.contractVersion === 'ami-brain-release-acceptance/v2');
  if (!releaseContract) throw new Error('release_receipt_release_contract_artifact_missing');
  const receipt = buildProtectedReleaseReceipt({
    candidateReceipt: readJson(candidateReceiptPath),
    candidateLock: lock,
    evidenceReceipts,
    releaseContract,
    workflow: options.workflow ?? process.env.GITHUB_WORKFLOW,
    eventName: options.eventName ?? process.env.GITHUB_EVENT_NAME,
    branch: options.branch ?? process.env.GITHUB_REF_NAME,
    expiresInHours: options.expiresInHours,
  });
  const outputPath = resolveRepoOutput(options.receiptOutput ?? `outputs/ami-brain-release-receipts/${receipt.receiptId.replaceAll(':', '-')}.json`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (options.uploadReceipt) await uploadProtectedReceipt(receipt);
  process.stdout.write(`${JSON.stringify({
    status: 'passed',
    receiptId: receipt.receiptId,
    candidateId: receipt.candidateId,
    evalRunId: receipt.evalRunId,
    evaluationReleaseId: receipt.evaluationReleaseId,
    provider: receipt.provider,
    model: receipt.model,
    output: relativeToRepo(outputPath),
    uploaded: options.uploadReceipt,
  }, null, 2)}\n`);
}

async function uploadProtectedReceipt(receipt) {
  const endpoint = requiredText(process.env.BRAIN_GOVERNANCE_RECEIPT_URL, 'release_receipt_upload_url_missing');
  if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL || !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    throw new Error('release_receipt_github_oidc_required');
  }
  const headers = await createReceiptUploadHeaders(receipt, {
    environment: { ...process.env, BRAIN_GOVERNANCE_RECEIPT_ALLOW_HMAC_FALLBACK: 'false' },
  });
  if (!headers.authorization) throw new Error('release_receipt_github_oidc_required');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(receipt),
  });
  if (!response.ok) throw new Error(`release_receipt_upload_failed:${response.status}:${(await response.text()).slice(0, 300)}`);
}

function parseOptions(argv) {
  const options = { uploadReceipt: false, expiresInHours: 168 };
  for (const argument of argv) {
    if (argument === '--upload-receipt') options.uploadReceipt = true;
    else if (argument.startsWith('--candidate-lock=')) options.candidateLock = optionValue(argument);
    else if (argument.startsWith('--candidate-receipt=')) options.candidateReceipt = optionValue(argument);
    else if (argument.startsWith('--evidence-dir=')) options.evidenceDir = optionValue(argument);
    else if (argument.startsWith('--workflow=')) options.workflow = optionValue(argument);
    else if (argument.startsWith('--event-name=')) options.eventName = optionValue(argument);
    else if (argument.startsWith('--branch=')) options.branch = optionValue(argument);
    else if (argument.startsWith('--receipt-output=')) options.receiptOutput = optionValue(argument);
    else if (argument.startsWith('--expires-in-hours=')) options.expiresInHours = boundedHours(optionValue(argument));
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`release_receipt_unknown_argument:${argument}`);
  }
  if (options.help) {
    process.stdout.write('Usage: npm run brain:release:receipt -- --candidate-lock=<path> --candidate-receipt=<path> --evidence-dir=<path> [--workflow=<name> --event-name=workflow_dispatch --branch=main --upload-receipt]\n');
    process.exit(0);
  }
  return options;
}

function resolveRepoFile(path, code) {
  const text = requiredText(path, code);
  const absolute = resolve(repoRoot, text);
  if (!absolute.startsWith(`${repoRoot}/`) || !existsSync(absolute)) throw new Error(code);
  return absolute;
}

function resolveRepoDirectory(path, code) {
  return resolveRepoFile(path, code);
}

function resolveRepoOutput(path) {
  const absolute = resolve(repoRoot, path);
  if (!absolute.startsWith(`${repoRoot}/`)) throw new Error('release_receipt_output_outside_repository');
  return absolute;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function relativeToRepo(path) {
  return path.slice(repoRoot.length + 1);
}

function optionValue(argument) {
  return argument.slice(argument.indexOf('=') + 1).trim();
}

function boundedHours(value) {
  const hours = Number(value);
  if (!Number.isInteger(hours) || hours <= 0 || hours * 60 * 60 * 1000 > MAX_RELEASE_RECEIPT_VALIDITY_MS) {
    throw new Error('release_receipt_validity_window_invalid');
  }
  return hours;
}

function requiredText(value, code) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(code);
  return text;
}

function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function nullableText(value) {
  return value === null || value === undefined || value === '' ? null : String(value).trim();
}

function hash64(value, code) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!HASH_64.test(text)) throw new Error(code);
  return text;
}

function commit(value, code) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!COMMIT.test(text)) throw new Error(code);
  return text;
}

function positiveInteger(value, code) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(code);
  return number;
}

function sameSet(left, right) {
  const normalizedLeft = [...new Set(left)].sort();
  const normalizedRight = [...new Set(right)].sort();
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

if (resolve(process.argv[1] ?? '') === scriptPath) {
  main().catch((error) => {
    process.stderr.write(`ami-brain-release-receipt: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
