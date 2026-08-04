#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative as pathRelative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import {
  closeCandidateEvidence,
  calculateEvidenceResultChecksum,
  createCandidateLock,
  createEvidenceReceipt,
  sha256,
  validateCandidateLock,
} from './ami-brain-candidate-identity-core.mjs';
import {
  createManualEvidenceTemplate,
  validateManualEvidenceArtifact,
} from './ami-brain-manual-evidence-contracts.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(SERVER_ROOT, '..', '..');
const DEFAULT_SUITE_MANIFEST = resolve(
  REPO_ROOT,
  'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-suite-manifest-v2.json',
);
const DEFAULT_DATA_SNAPSHOT = resolve(
  REPO_ROOT,
  'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-product-loop-data-facts-v1.json',
);
const OUTPUT_ROOT = resolve(REPO_ROOT, 'outputs/ami-brain-release-candidates');
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (options.command === 'lock') await lockCandidate(options);
  else if (options.command === 'template') writeEvidenceTemplate(options);
  else if (options.command === 'receipt') await writeEvidenceReceipt(options);
  else if (options.command === 'close') await closeCandidate(options);
  else throw new Error('candidate_command_required');
}

function writeEvidenceTemplate(options) {
  if (!options.candidateLock) throw new Error('candidate_lock_path_required');
  if (!options.evidenceType) throw new Error('evidence_type_required');
  const lockPath = resolveInput(options.candidateLock);
  const lock = validateCandidateLock(JSON.parse(readFileSync(lockPath, 'utf8')));
  const template = createManualEvidenceTemplate(lock, options.evidenceType);
  const outputPath = resolve(dirname(lockPath), 'artifacts', `${options.evidenceType}-evidence.json`);
  if (existsSync(outputPath)) throw new Error(`evidence_template_already_exists:${relative(outputPath)}`);
  writeJson(outputPath, template);
  process.stdout.write(`${JSON.stringify({ output: relative(outputPath), template }, null, 2)}\n`);
}

async function lockCandidate(options) {
  const required = ['productProfile', 'runtimeCommit', 'productionHealthUrl', 'storeId', 'runKey'];
  for (const key of required) if (!options[key]) throw new Error(`candidate_${key}_required`);
  if (!options.evaluationReleaseId) throw new Error('candidate_evaluation_release_id_required');
  if (workingTreeStatus()) throw new Error('candidate_lock_requires_clean_worktree');
  const head = git(['rev-parse', 'HEAD']).toLowerCase();
  if (head !== String(options.runtimeCommit).toLowerCase()) throw new Error('candidate_runtime_commit_head_mismatch');

  const health = await fetchHealth(options.productionHealthUrl);
  if (health.status !== 'ready') throw new Error('candidate_deployment_not_ready');
  if (health.deployment?.commit?.toLowerCase() !== head) throw new Error('candidate_deployment_commit_mismatch');
  const evaluation = await loadEvaluationIdentity(options.evaluationReleaseId, options.productProfile);
  assertDatabaseTarget(health.databaseTarget, databaseTargetFromUrl(process.env.DATABASE_URL));

  const suiteManifestPath = resolveInput(options.suiteManifest ?? DEFAULT_SUITE_MANIFEST);
  const dataSnapshotPath = resolveInput(options.dataSnapshot ?? DEFAULT_DATA_SNAPSHOT);
  const suiteManifestChecksum = sha256(readFileSync(suiteManifestPath, 'utf8'));
  const dataSnapshotArtifact = JSON.parse(readFileSync(dataSnapshotPath, 'utf8'));
  const dataSnapshot = String(dataSnapshotArtifact.snapshotChecksum ?? '').trim();
  if (!/^[a-f0-9]{64}$/u.test(dataSnapshot)) throw new Error('candidate_data_snapshot_checksum_invalid');
  const diffChecksum = calculateCommitDiffChecksum(options.runtimeCommit);
  const lock = createCandidateLock({
    identity: {
      productProfile: options.productProfile,
      runtimeCommit: options.runtimeCommit,
      diffChecksum,
      releaseId: evaluation.id,
      releaseFingerprint: evaluation.releaseFingerprint,
      evaluationIdentity: {
        family: 'evaluation',
        code: evaluation.code,
        internalReleaseId: evaluation.id,
      },
      suiteManifestChecksum,
      dataSnapshot,
      provider: health.brainModel?.provider,
      model: health.brainModel?.model,
      timeoutMs: health.brainModel?.timeoutMs,
      fallbackPolicy: health.brainModel?.fallbackPolicy,
      deployment: health.deployment,
      databaseTarget: health.databaseTarget,
      storeId: options.storeId,
      runKey: options.runKey,
    },
    branch: git(['branch', '--show-current']),
  });
  const outputPath = resolve(OUTPUT_ROOT, lock.candidateId, 'candidate-lock.json');
  writeJson(outputPath, lock);
  if (!options.noPersist) await persistCandidateLock(lock);
  process.stdout.write(`${JSON.stringify({ output: relative(outputPath), candidateId: lock.candidateId, lock }, null, 2)}\n`);
}

async function closeCandidate(options) {
  if (!options.candidateLock) throw new Error('candidate_lock_path_required');
  const lockPath = resolveInput(options.candidateLock);
  const lock = validateCandidateLock(JSON.parse(readFileSync(lockPath, 'utf8')));
  const evidencePaths = [
    ...(options.evidenceReceipts ?? []).map(resolveInput),
    ...evidenceFiles(options.evidenceDir ? resolveInput(options.evidenceDir) : resolve(dirname(lockPath), 'evidence')),
  ];
  const evidenceReceipts = [...new Set(evidencePaths)].map((path) => loadEvidenceReceipt(path, lock));
  const eligibility = closeCandidateEvidence({ candidateLock: lock, evidenceReceipts });
  const outputPath = resolve(dirname(lockPath), 'release-eligibility.json');
  writeJson(outputPath, eligibility);
  if (eligibility.releaseEligible && !options.noPersist) await persistReleaseEligibility(lock, eligibility);
  process.stdout.write(`${JSON.stringify({ output: relative(outputPath), ...eligibility }, null, 2)}\n`);
  if (!eligibility.releaseEligible) process.exitCode = 1;
}

async function writeEvidenceReceipt(options) {
  if (!options.candidateLock) throw new Error('candidate_lock_path_required');
  if (!options.evidenceType) throw new Error('evidence_type_required');
  if (!options.status) throw new Error('evidence_status_required');
  if (!options.artifactPaths.length) throw new Error('evidence_artifact_paths_missing');
  const lockPath = resolveInput(options.candidateLock);
  const lock = validateCandidateLock(JSON.parse(readFileSync(lockPath, 'utf8')));
  const artifacts = options.artifactPaths.map((path) => resolveRepoArtifact(path));
  if (options.status === 'passed') validatePassedEvidenceArtifacts(lock, options.evidenceType, artifacts);
  const artifactPaths = [...new Set(artifacts.map((artifact) => artifact.relative))].sort();
  const artifactChecksums = Object.fromEntries(artifactPaths.map((path) => {
    const artifact = artifacts.find((item) => item.relative === path);
    return [path, fileChecksum(artifact.absolute)];
  }));
  const now = new Date();
  const expiresAt = resolveEvidenceExpiresAt(options, now);
  const receiptInput = {
    candidateId: lock.candidateId,
    evidenceType: options.evidenceType,
    status: options.status,
    artifactPaths,
    artifactChecksums,
    createdAt: now.toISOString(),
    expiresAt,
    reviewedBy: options.reviewedBy,
    reviewerRole: options.reviewerRole,
    traceRefs: options.traceRefs,
    reviewContext: {
      accountRefs: options.reviewAccountRefs,
      roleRefs: options.reviewRoleRefs,
      storeRefs: options.reviewStoreRefs,
      runRefs: options.reviewRunRefs,
      mediaPaths: options.reviewMediaPaths.map((path) => resolveRepoArtifact(path).relative),
    },
  };
  const receipt = createEvidenceReceipt({
    ...receiptInput,
    resultChecksum: calculateEvidenceResultChecksum(receiptInput),
  }, now);
  const outputPath = resolve(dirname(lockPath), 'evidence', `${receipt.evidenceType}.json`);
  writeJson(outputPath, receipt);
  process.stdout.write(`${JSON.stringify({ output: relative(outputPath), receipt }, null, 2)}\n`);
}

export function validatePassedEvidenceArtifacts(lockValue, evidenceType, artifacts, readFile = readFileSync) {
  const lock = validateCandidateLock(lockValue);
  const jsonArtifacts = artifacts.flatMap((artifact) => {
    try {
      return [{ path: artifact.relative, value: JSON.parse(readFile(artifact.absolute, 'utf8')) }];
    } catch {
      return [];
    }
  });
  if (evidenceType === 'release_contract') {
    const artifact = findJsonArtifact(
      jsonArtifacts,
      (value) => value.contractVersion === 'ami-brain-release-acceptance/v1',
      'release_contract_artifact_missing',
    );
    if (artifact.canActivate !== true || artifact.decision !== 'ready_for_activation' || artifact.blockingReasons?.length) {
      throw new Error('release_contract_artifact_not_ready');
    }
    assertCandidateArtifactIdentity(lock, artifact.pipelineIdentity, {
      runtimeCommit: true,
      sourceCommit: true,
      releaseId: true,
      releaseFingerprint: true,
      storeId: true,
      suiteManifestChecksum: true,
    }, 'release_contract');
    return;
  }
  if (evidenceType === 'gold_100') {
    const artifact = findJsonArtifact(
      jsonArtifacts,
      (value) => value.pipelineIdentity?.contractVersion === 'ami-brain-gold-standard-runtime/v1',
      'gold_100_artifact_missing',
    );
    const acceptance = artifact.acceptance ?? {};
    if (
      artifact.executionPurpose !== 'standard_regression_internal_gold_standard'
      || artifact.stage !== 'standard-regression-gold-internal'
      || artifact.completedCaseCount !== 100
      || artifact.remainingCaseCount !== 0
      || artifact.passed !== 100
      || artifact.failed !== 0
      || artifact.providerUnavailable !== 0
      || acceptance.status !== 'ready'
      || acceptance.caseCount !== 100
      || acceptance.evaluated !== 100
      || acceptance.passed !== 100
      || acceptance.failed !== 0
      || acceptance.blockingReasons?.length
    ) {
      throw new Error('gold_100_artifact_not_ready');
    }
    assertCandidateArtifactIdentity(lock, artifact.pipelineIdentity, {
      runtimeCommit: true,
      sourceCommit: true,
      releaseId: true,
      releaseFingerprint: true,
      storeId: true,
      suiteManifestChecksum: true,
    }, 'gold_100');
    return;
  }
  if (evidenceType === 'performance_60') {
    const artifact = findJsonArtifact(
      jsonArtifacts,
      (value) => value.schemaVersion === 'ami-brain-performance-acceptance/v1',
      'performance_60_artifact_missing',
    );
    if (
      artifact.status !== 'ready'
      || artifact.eligibleForProductActivation !== true
      || artifact.executionPurpose !== 'product_activation_performance'
      || artifact.blockingReasons?.length
      || Object.keys(artifact.buckets ?? {}).length !== 4
    ) {
      throw new Error('performance_60_artifact_not_ready');
    }
    assertCandidateArtifactIdentity(lock, artifact.runIdentity, {
      runtimeCommit: true,
      releaseId: true,
      storeId: true,
      suiteManifestChecksum: true,
    }, 'performance_60');
    assertCandidateArtifactIdentity(lock, artifact.identity, {
      runtimeCommit: true,
      releaseFingerprint: true,
      releaseId: true,
      storeId: true,
      suiteManifestChecksum: true,
    }, 'performance_60');
    return;
  }
  if (evidenceType === 'target_database') {
    const artifact = findJsonArtifact(
      jsonArtifacts,
      (value) => value.schemaVersion === 'ami-brain-target-migration-audit/v2',
      'target_database_artifact_missing',
    );
    if (
      artifact.status !== 'ready'
      || artifact.databaseWritePerformed !== false
      || artifact.blockers?.length
      || artifact.candidateId !== lock.candidateId
    ) {
      throw new Error('target_database_artifact_not_ready');
    }
    assertCandidateArtifactIdentity(lock, artifact.candidateIdentity, {
      productProfile: true,
      runtimeCommit: true,
      releaseId: true,
      releaseFingerprint: true,
      dataSnapshot: true,
      storeId: true,
    }, 'target_database');
    assertDatabaseTarget(lock.identity.databaseTarget, artifact.target);
    return;
  }
  if (['permission_matrix', 'cross_client_e2e', 'provider_fallback', 'rollback_drill'].includes(evidenceType)) {
    const artifact = findJsonArtifact(
      jsonArtifacts,
      (value) => value.schemaVersion === `ami-brain-${evidenceType.replaceAll('_', '-')}-evidence/v1`,
      `${evidenceType}_artifact_missing`,
    );
    validateManualEvidenceArtifact(lock, evidenceType, artifact);
  }
}

function findJsonArtifact(artifacts, predicate, code) {
  const match = artifacts.map((artifact) => artifact.value).find(predicate);
  if (!match) throw new Error(code);
  return match;
}

function assertCandidateArtifactIdentity(lock, identity, requirements, label) {
  const value = identity && typeof identity === 'object' ? identity : {};
  const expected = lock.identity;
  const mismatches = [];
  if (requirements.productProfile && value.productProfile !== expected.productProfile) mismatches.push('productProfile');
  if (requirements.runtimeCommit && value.runtimeCommit !== expected.runtimeCommit) mismatches.push('runtimeCommit');
  if (requirements.sourceCommit && value.sourceCommit !== expected.runtimeCommit) mismatches.push('sourceCommit');
  if (requirements.releaseId && Number(value.releaseId) !== expected.releaseId) mismatches.push('releaseId');
  if (requirements.releaseFingerprint && value.releaseFingerprint !== expected.releaseFingerprint) {
    mismatches.push('releaseFingerprint');
  }
  if (requirements.storeId && Number(value.storeId) !== expected.storeId) mismatches.push('storeId');
  if (requirements.suiteManifestChecksum && value.suiteManifestChecksum !== expected.suiteManifestChecksum) {
    mismatches.push('suiteManifestChecksum');
  }
  if (requirements.dataSnapshot && value.dataSnapshot !== expected.dataSnapshot) mismatches.push('dataSnapshot');
  if (mismatches.length) throw new Error(`${label}_candidate_identity_mismatch:${mismatches.join(',')}`);
}

function assertDatabaseTarget(expectedValue, actualValue) {
  const expected = expectedValue && typeof expectedValue === 'object' ? expectedValue : {};
  const actual = actualValue && typeof actualValue === 'object' ? actualValue : {};
  const mismatches = ['protocol', 'host', 'port', 'database', 'schema']
    .filter((key) => String(actual[key] ?? '') !== String(expected[key] ?? ''));
  if (mismatches.length) throw new Error(`target_database_candidate_identity_mismatch:${mismatches.join(',')}`);
}

export function parseOptions(argv) {
  const options = {
    evidenceReceipts: [],
    artifactPaths: [],
    traceRefs: [],
    reviewAccountRefs: [],
    reviewRoleRefs: [],
    reviewStoreRefs: [],
    reviewRunRefs: [],
    reviewMediaPaths: [],
    expiresInHours: 168,
    noPersist: false,
  };
  for (const argument of argv) {
    if (argument === 'lock' || argument === 'template' || argument === 'receipt' || argument === 'close') {
      options.command = argument;
    }
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--no-persist') options.noPersist = true;
    else if (argument.startsWith('--product-profile=')) options.productProfile = value(argument);
    else if (argument.startsWith('--evaluation-release-id=')) {
      options.evaluationReleaseId = positive(value(argument), 'candidate_evaluation_release_id_invalid');
    }
    else if (argument.startsWith('--release-id=')) {
      options.evaluationReleaseId = positive(value(argument), 'candidate_evaluation_release_id_invalid');
    }
    else if (argument.startsWith('--runtime-commit=')) options.runtimeCommit = value(argument).toLowerCase();
    else if (argument.startsWith('--production-health-url=')) options.productionHealthUrl = value(argument);
    else if (argument.startsWith('--store-id=')) options.storeId = positive(value(argument), 'candidate_store_id_invalid');
    else if (argument.startsWith('--run-key=')) options.runKey = value(argument);
    else if (argument.startsWith('--suite-manifest=')) options.suiteManifest = value(argument);
    else if (argument.startsWith('--data-snapshot=')) options.dataSnapshot = value(argument);
    else if (argument.startsWith('--candidate-lock=')) options.candidateLock = value(argument);
    else if (argument.startsWith('--evidence-dir=')) options.evidenceDir = value(argument);
    else if (argument.startsWith('--evidence-receipt=')) options.evidenceReceipts.push(value(argument));
    else if (argument.startsWith('--evidence-type=')) options.evidenceType = value(argument);
    else if (argument.startsWith('--status=')) options.status = value(argument);
    else if (argument.startsWith('--artifact=')) options.artifactPaths.push(value(argument));
    else if (argument.startsWith('--expires-at=')) options.expiresAt = value(argument);
    else if (argument.startsWith('--expires-in-hours=')) {
      options.expiresInHours = positive(value(argument), 'evidence_expires_in_hours_invalid');
    }
    else if (argument.startsWith('--reviewed-by=')) options.reviewedBy = value(argument);
    else if (argument.startsWith('--reviewer-role=')) options.reviewerRole = value(argument);
    else if (argument.startsWith('--trace-ref=')) options.traceRefs.push(value(argument));
    else if (argument.startsWith('--review-account=')) options.reviewAccountRefs.push(value(argument));
    else if (argument.startsWith('--review-role=')) options.reviewRoleRefs.push(value(argument));
    else if (argument.startsWith('--review-store=')) options.reviewStoreRefs.push(value(argument));
    else if (argument.startsWith('--review-run=')) options.reviewRunRefs.push(value(argument));
    else if (argument.startsWith('--review-media=')) options.reviewMediaPaths.push(value(argument));
    else throw new Error(`unknown_argument:${argument}`);
  }
  return options;
}

export function resolveEvidenceExpiresAt(options, now = new Date()) {
  if (options.expiresAt) return isoTimestamp(options.expiresAt, 'evidence_expires_at_invalid');
  const expiresAt = new Date(now.getTime() + options.expiresInHours * 60 * 60 * 1000);
  if (!Number.isFinite(expiresAt.getTime())) throw new Error('evidence_expires_at_invalid');
  return expiresAt.toISOString();
}

export function calculateCommitDiffChecksum(runtimeCommit, gitRunner = git) {
  const diff = gitRunner([
    'diff-tree',
    '--root',
    '-m',
    '--first-parent',
    '-p',
    '--binary',
    '--no-commit-id',
    runtimeCommit,
  ]);
  if (!String(diff).trim()) throw new Error('candidate_runtime_commit_diff_empty');
  return sha256(diff);
}

export function verifyEvidenceArtifactFiles(receipt, {
  repoRoot = REPO_ROOT,
  readFile = readFileSync,
} = {}) {
  const verified = createEvidenceReceipt(receipt);
  for (const path of verified.artifactPaths) {
    const artifact = resolveRepoArtifact(path, repoRoot);
    const actual = createHash('sha256').update(readFile(artifact.absolute)).digest('hex');
    if (verified.artifactChecksums[path] !== actual) {
      throw new Error(`evidence_artifact_checksum_mismatch:${verified.evidenceType}:${path}`);
    }
  }
  return verified;
}

export function verifyEvidenceReceiptForCandidate(lockValue, receipt, {
  repoRoot = REPO_ROOT,
  readFile = readFileSync,
} = {}) {
  const lock = validateCandidateLock(lockValue);
  const verified = verifyEvidenceArtifactFiles(receipt, { repoRoot, readFile });
  if (verified.status === 'passed') {
    const artifacts = verified.artifactPaths.map((path) => resolveRepoArtifact(path, repoRoot));
    validatePassedEvidenceArtifacts(lock, verified.evidenceType, artifacts, readFile);
  }
  return verified;
}

async function loadEvaluationIdentity(evaluationReleaseId, expectedProductProfile) {
  return withPrisma(async (prisma) => {
    const release = await prisma.brainRelease.findUnique({
      where: { id: evaluationReleaseId },
      select: {
        id: true,
        status: true,
        scope: true,
        rollout: true,
        releaseFamily: true,
        displayCode: true,
        displayName: true,
        items: {
          select: {
            resourceVersionId: true,
            resourceType: true,
            resourceVersion: { select: { checksum: true } },
          },
        },
      },
    });
    if (!release) throw new Error('candidate_evaluation_release_not_found');
    const rollout = object(release.rollout);
    if (release.status !== 'draft' || release.scope === 'governance_policy' || rollout.evaluationOnly !== true) {
      throw new Error('candidate_evaluation_release_contract_invalid');
    }
    if (release.releaseFamily !== 'evaluation' || !/^EV-\d{3,}$/u.test(release.displayCode ?? '')) {
      throw new Error('candidate_evaluation_version_identity_missing');
    }
    if (rollout.productProfile !== expectedProductProfile) {
      throw new Error('candidate_evaluation_product_profile_mismatch');
    }
    if (
      rollout.actionsEnabled !== false
      || rollout.actionExecutionPolicy !== 'deny'
      || rollout.sideEffectCapabilityCount !== 0
      || rollout.allowedCapabilityCount !== 33
      || release.items.filter((item) => item.resourceType === 'skill').length !== 33
    ) {
      throw new Error('candidate_evaluation_query_only_contract_invalid');
    }
    return {
      id: release.id,
      code: release.displayCode,
      name: release.displayName,
      releaseFingerprint: evaluationReleaseFingerprint(release.items, rollout),
    };
  });
}

function evaluationReleaseFingerprint(items, rollout) {
  const resources = items
    .map((item) => ({
      resourceVersionId: item.resourceVersionId,
      checksum: item.resourceVersion.checksum,
    }))
    .sort((left, right) => left.resourceVersionId - right.resourceVersionId || left.checksum.localeCompare(right.checksum));
  const productProfile = {
    productProfile: String(rollout.productProfile ?? ''),
    actionsEnabled: rollout.actionsEnabled === true,
    actionExecutionPolicy: String(rollout.actionExecutionPolicy ?? ''),
    allowedCapabilityManifest: String(rollout.allowedCapabilityManifest ?? ''),
    allowedCapabilityCount: Number.isInteger(rollout.allowedCapabilityCount) ? Number(rollout.allowedCapabilityCount) : null,
    sideEffectCapabilityCount: Number.isInteger(rollout.sideEffectCapabilityCount) ? Number(rollout.sideEffectCapabilityCount) : null,
    productProfileFingerprint: String(rollout.productProfileFingerprint ?? ''),
  };
  return sha256({ resources, productProfile });
}

function databaseTargetFromUrl(value) {
  if (!value) throw new Error('DATABASE_URL is required');
  const parsed = new URL(value);
  return {
    protocol: parsed.protocol.replace(':', ''),
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.replace(/^\//u, ''),
    schema: parsed.searchParams.get('schema') || 'public',
  };
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function fetchHealth(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`candidate_health_request_failed:${response.status}`);
  return response.json();
}

async function persistCandidateLock(lock) {
  await withPrisma(async (prisma) => {
    const resultChecksum = sha256(lock);
    const pointerResult = { candidateId: lock.candidateId, candidateLockReceiptKey: lock.receiptKey };
    const pointerResultChecksum = sha256(pointerResult);
    const existing = await prisma.brainGateReceipt.findUnique({ where: { receiptKey: lock.receiptKey } });
    if (existing && existing.resultChecksum !== resultChecksum) throw new Error('candidate_lock_receipt_conflict');
    if (!existing) await prisma.brainGateReceipt.create({ data: receiptData(lock.receiptKey, lock, lock, resultChecksum) });
    await prisma.brainGateReceipt.upsert({
      where: { receiptKey: lock.officialCandidateKey },
      create: receiptData(lock.officialCandidateKey, lock, pointerResult, pointerResultChecksum),
      update: {
        result: pointerResult,
        resultChecksum: pointerResultChecksum,
        releaseFingerprint: lock.identity.releaseFingerprint,
        dataSnapshot: lock.identity.dataSnapshot,
        provider: lock.identity.provider,
        model: lock.identity.model,
        timeoutMs: lock.identity.timeoutMs,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  });
}

async function persistReleaseEligibility(lock, eligibility) {
  await withPrisma(async (prisma) => {
    const existing = await prisma.brainGateReceipt.findUnique({ where: { receiptKey: eligibility.receiptKey } });
    if (existing && existing.resultChecksum !== eligibility.resultChecksum) {
      throw new Error('release_eligibility_receipt_conflict');
    }
    if (!existing) {
      await prisma.brainGateReceipt.create({
        data: {
          ...receiptData(eligibility.receiptKey, lock, eligibility, eligibility.resultChecksum, 'release'),
          expiresAt: new Date(eligibility.expiresAt),
        },
      });
    }
  });
}

function receiptData(receiptKey, lock, result, resultChecksum, stage = 'candidate') {
  return {
    receiptKey,
    stage,
    riskLevel: 'critical',
    changedFilesChecksum: sha256([lock.identity.runtimeCommit]),
    diffChecksum: lock.identity.diffChecksum,
    sourceFingerprint: sha256(lock.identity),
    releaseFingerprint: lock.identity.releaseFingerprint,
    suiteChecksum: lock.identity.suiteManifestChecksum,
    dataSnapshot: lock.identity.dataSnapshot,
    provider: lock.identity.provider,
    model: lock.identity.model,
    timeoutMs: lock.identity.timeoutMs,
    resultChecksum,
    status: 'passed',
    result,
    schemaVersion: 3,
    baseCommit: lock.identity.runtimeCommit,
    headCommit: lock.identity.runtimeCommit,
    mergeBaseCommit: lock.identity.runtimeCommit,
    identityChecksum: lock.candidateId,
    issuerType: 'release_candidate_tool',
    issuer: 'ami-brain-release-candidate',
    trustLevel: stage === 'release' ? 'verified_release' : 'candidate_lock',
    verificationStatus: 'self_verified',
    verifiedAt: new Date(),
    evaluationReleaseId: lock.identity.evaluationIdentity.internalReleaseId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
}

async function withPrisma(callback) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10_000 }),
  });
  try {
    return await callback(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

function evidenceFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => resolve(directory, name));
}

function loadEvidenceReceipt(path, lock) {
  return verifyEvidenceReceiptForCandidate(lock, JSON.parse(readFileSync(path, 'utf8')));
}

function workingTreeStatus() {
  return git(['status', '--porcelain=v1', '--untracked-files=all']);
}

function git(args) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function resolveInput(path) {
  return resolve(REPO_ROOT, path);
}

function resolveRepoArtifact(path, repoRoot = REPO_ROOT) {
  const root = realpathSync(repoRoot);
  const requested = resolve(root, path);
  if (!existsSync(requested) || !statSync(requested).isFile()) {
    throw new Error(`evidence_artifact_missing:${path}`);
  }
  const absolute = realpathSync(requested);
  const relativePath = pathRelative(root, absolute);
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`evidence_artifact_outside_repository:${path}`);
  }
  return { absolute, relative: relativePath.split('\\').join('/') };
}

function fileChecksum(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function relative(path) {
  return path.replace(`${REPO_ROOT}/`, '');
}

function value(argument) {
  return argument.slice(argument.indexOf('=') + 1).trim();
}

function positive(value, code) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(code);
  return number;
}

function isoTimestamp(value, code) {
  const parsed = Date.parse(String(value ?? '').trim());
  if (!Number.isFinite(parsed)) throw new Error(code);
  return new Date(parsed).toISOString();
}

function printHelp() {
  process.stdout.write(
    'Usage: npm run brain:release:candidate -- lock --product-profile=query_only_v1 --evaluation-release-id=<EV internal id> --runtime-commit=<sha> --production-health-url=<ready-url> --store-id=<id> --run-key=<key>\n' +
    '       npm run brain:release:candidate -- template --candidate-lock=<path> --evidence-type=<manual-type>\n' +
    '       npm run brain:release:candidate -- receipt --candidate-lock=<path> --evidence-type=<type> --status=passed --artifact=<path> [--expires-in-hours=168] [review options]\n' +
    '       npm run brain:release:candidate -- close --candidate-lock=<path> [--evidence-dir=<dir>] [--evidence-receipt=<path>]\n',
  );
}

function fail(message) {
  process.stderr.write(`ami-brain-release-candidate: ${message}\n`);
  process.exit(1);
}
