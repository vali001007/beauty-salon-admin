import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  calculateEvidenceResultChecksum,
  createCandidateLock,
  createEvidenceReceipt,
} from './ami-brain-candidate-identity-core.mjs';
import {
  createManualEvidenceTemplate,
  PERMISSION_ROLE_KEYS,
} from './ami-brain-manual-evidence-contracts.mjs';
import {
  parseOptions,
  resolveEvidenceExpiresAt,
  validatePassedEvidenceArtifacts,
  verifyEvidenceArtifactFiles,
  verifyEvidenceReceiptForCandidate,
} from './ami-brain-release-candidate.mjs';

function candidateLock() {
  return createCandidateLock({
    identity: {
      productProfile: 'query_only_v1',
      runtimeCommit: 'a'.repeat(40),
      diffChecksum: 'b'.repeat(64),
      releaseId: 453,
      releaseFingerprint: 'c'.repeat(64),
      suiteManifestChecksum: 'd'.repeat(64),
      dataSnapshot: 'snapshot-6',
      provider: 'openai_responses',
      model: 'gpt-test',
      timeoutMs: 20_000,
      fallbackPolicy: 'deterministic',
      deployment: { commit: 'a'.repeat(40), buildId: 'build-453', environment: 'staging' },
      databaseTarget: {
        protocol: 'postgresql',
        host: 'db.example',
        port: '5432',
        database: 'ami',
        schema: 'public',
      },
      storeId: 6,
      runKey: 'candidate-453',
    },
  });
}

function validateArtifact(lock, evidenceType, value) {
  return validatePassedEvidenceArtifacts(
    lock,
    evidenceType,
    [{ relative: `${evidenceType}.json`, absolute: `/virtual/${evidenceType}.json` }],
    () => JSON.stringify(value),
  );
}

test('parses lock identity inputs without allowing caller-supplied fingerprints', () => {
  const options = parseOptions([
    'lock',
    '--product-profile=query_only_v1',
    '--release-id=453',
    `--runtime-commit=${'a'.repeat(40)}`,
    '--production-health-url=https://candidate.example/api/health/ready',
    '--store-id=6',
    '--run-key=query_only_v1_candidate_001',
    '--no-persist',
  ]);
  assert.equal(options.command, 'lock');
  assert.equal(options.releaseId, 453);
  assert.equal(options.storeId, 6);
  assert.equal(options.noPersist, true);
  assert.throws(() => parseOptions(['lock', '--release-fingerprint=x']), /unknown_argument/);
});

test('parses close evidence inputs and rejects invalid numeric identity', () => {
  const options = parseOptions([
    'close',
    '--candidate-lock=outputs/candidate-lock.json',
    '--evidence-dir=outputs/evidence',
    '--evidence-receipt=outputs/manual.json',
  ]);
  assert.equal(options.command, 'close');
  assert.equal(options.candidateLock, 'outputs/candidate-lock.json');
  assert.deepEqual(options.evidenceReceipts, ['outputs/manual.json']);
  assert.throws(() => parseOptions(['lock', '--release-id=0']), /candidate_release_id_invalid/);
});

test('parses evidence receipt artifact and manual review inputs', () => {
  const options = parseOptions([
    'receipt',
    '--candidate-lock=outputs/candidate-lock.json',
    '--evidence-type=permission_matrix',
    '--status=passed',
    '--artifact=outputs/permission-report.json',
    '--artifact=outputs/permission-recording.mp4',
    '--expires-in-hours=72',
    '--reviewed-by=qa-lead',
    '--reviewer-role=quality-owner',
    '--trace-ref=trace-1',
    '--review-account=manager-user',
    '--review-role=manager',
    '--review-store=store-6',
    '--review-run=run-1',
    '--review-media=outputs/permission-recording.mp4',
  ]);
  assert.equal(options.command, 'receipt');
  assert.equal(options.evidenceType, 'permission_matrix');
  assert.equal(options.expiresInHours, 72);
  assert.deepEqual(options.artifactPaths, [
    'outputs/permission-report.json',
    'outputs/permission-recording.mp4',
  ]);
  assert.deepEqual(options.reviewRunRefs, ['run-1']);
  assert.throws(
    () => parseOptions(['receipt', '--expires-in-hours=0']),
    /evidence_expires_in_hours_invalid/,
  );
  assert.throws(
    () => resolveEvidenceExpiresAt({ expiresAt: 'not-a-date', expiresInHours: 168 }),
    /evidence_expires_at_invalid/,
  );
});

test('verifies every receipt artifact against the current repository file bytes', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'ami-brain-evidence-'));
  const artifactPath = 'evidence/report.json';
  const absolute = join(repoRoot, artifactPath);
  mkdirSync(join(repoRoot, 'evidence'));
  writeFileSync(absolute, '{"status":"passed"}\n', { encoding: 'utf8', flag: 'wx' });
  const checksum = createHash('sha256').update('{"status":"passed"}\n').digest('hex');
  const base = {
    candidateId: 'a'.repeat(64),
    evidenceType: 'release_contract',
    status: 'passed',
    artifactPaths: [artifactPath],
    artifactChecksums: { [artifactPath]: checksum },
    createdAt: '2026-08-02T12:00:00.000Z',
    expiresAt: '2026-08-09T12:00:00.000Z',
    reviewedBy: null,
    reviewerRole: null,
    traceRefs: [],
    reviewContext: { accountRefs: [], roleRefs: [], storeRefs: [], runRefs: [], mediaPaths: [] },
  };
  const receipt = createEvidenceReceipt({
    ...base,
    resultChecksum: calculateEvidenceResultChecksum(base),
  });
  assert.deepEqual(verifyEvidenceArtifactFiles(receipt, { repoRoot }), receipt);

  writeFileSync(absolute, '{"status":"tampered"}\n', 'utf8');
  assert.throws(
    () => verifyEvidenceArtifactFiles(receipt, { repoRoot }),
    /evidence_artifact_checksum_mismatch:release_contract:evidence\/report.json/,
  );
});

test('final candidate verification revalidates artifact content instead of trusting a self-consistent forged receipt', () => {
  const lock = candidateLock();
  const repoRoot = mkdtempSync(join(tmpdir(), 'ami-brain-forged-evidence-'));
  const artifactPath = 'evidence/release-contract.json';
  const absolute = join(repoRoot, artifactPath);
  mkdirSync(join(repoRoot, 'evidence'));
  writeFileSync(absolute, '{"status":"passed","note":"not a release contract"}\n', 'utf8');
  const artifactChecksums = {
    [artifactPath]: createHash('sha256')
      .update('{"status":"passed","note":"not a release contract"}\n')
      .digest('hex'),
  };
  const input = {
    candidateId: lock.candidateId,
    evidenceType: 'release_contract',
    status: 'passed',
    artifactPaths: [artifactPath],
    artifactChecksums,
    createdAt: '2026-08-02T12:00:00.000Z',
    expiresAt: '2026-08-09T12:00:00.000Z',
    reviewedBy: null,
    reviewerRole: null,
    traceRefs: [],
    reviewContext: { accountRefs: [], roleRefs: [], storeRefs: [], runRefs: [], mediaPaths: [] },
  };
  const receipt = createEvidenceReceipt({
    ...input,
    resultChecksum: calculateEvidenceResultChecksum(input),
  });
  assert.throws(
    () => verifyEvidenceReceiptForCandidate(lock, receipt, { repoRoot }),
    /release_contract_artifact_missing/,
  );
});

test('accepts only a ready Release contract bound to the locked candidate', () => {
  const lock = candidateLock();
  const artifact = {
    contractVersion: 'ami-brain-release-acceptance/v1',
    canActivate: true,
    decision: 'ready_for_activation',
    blockingReasons: [],
    pipelineIdentity: {
      runtimeCommit: lock.identity.runtimeCommit,
      sourceCommit: lock.identity.runtimeCommit,
      releaseId: lock.identity.releaseId,
      releaseFingerprint: lock.identity.releaseFingerprint,
      storeId: lock.identity.storeId,
      suiteManifestChecksum: lock.identity.suiteManifestChecksum,
    },
  };
  assert.doesNotThrow(() => validateArtifact(lock, 'release_contract', artifact));
  assert.throws(
    () => validateArtifact(lock, 'release_contract', {
      ...artifact,
      pipelineIdentity: { ...artifact.pipelineIdentity, releaseId: 999 },
    }),
    /release_contract_candidate_identity_mismatch:releaseId/,
  );
});

test('accepts only formal same-candidate 100 Gold evidence, never a diagnostic run', () => {
  const lock = candidateLock();
  const artifact = {
    executionPurpose: 'standard_regression_internal_gold_standard',
    stage: 'standard-regression-gold-internal',
    pipelineIdentity: {
      contractVersion: 'ami-brain-gold-standard-runtime/v1',
      runtimeCommit: lock.identity.runtimeCommit,
      sourceCommit: lock.identity.runtimeCommit,
      releaseId: lock.identity.releaseId,
      releaseFingerprint: lock.identity.releaseFingerprint,
      storeId: lock.identity.storeId,
      suiteManifestChecksum: lock.identity.suiteManifestChecksum,
    },
    completedCaseCount: 100,
    remainingCaseCount: 0,
    passed: 100,
    failed: 0,
    providerUnavailable: 0,
    acceptance: {
      status: 'ready',
      caseCount: 100,
      evaluated: 100,
      passed: 100,
      failed: 0,
      blockingReasons: [],
    },
  };
  assert.doesNotThrow(() => validateArtifact(lock, 'gold_100', artifact));
  assert.throws(
    () => validateArtifact(lock, 'gold_100', {
      ...artifact,
      executionPurpose: 'task9_gold_standard_diagnostic_only',
      stage: 'gold-standard-diagnostic-internal',
    }),
    /gold_100_artifact_not_ready/,
  );
});

test('accepts only ready formal 60-case performance and candidate-bound target database evidence', () => {
  const lock = candidateLock();
  const identity = {
    runtimeCommit: lock.identity.runtimeCommit,
    releaseId: lock.identity.releaseId,
    releaseFingerprint: lock.identity.releaseFingerprint,
    storeId: lock.identity.storeId,
    suiteManifestChecksum: lock.identity.suiteManifestChecksum,
  };
  assert.doesNotThrow(() => validateArtifact(lock, 'performance_60', {
    schemaVersion: 'ami-brain-performance-acceptance/v1',
    status: 'ready',
    eligibleForProductActivation: true,
    executionPurpose: 'product_activation_performance',
    blockingReasons: [],
    buckets: { fast: {}, single: {}, multi: {}, followup: {} },
    runIdentity: identity,
    identity,
  }));
  assert.doesNotThrow(() => validateArtifact(lock, 'target_database', {
    schemaVersion: 'ami-brain-target-migration-audit/v2',
    status: 'ready',
    databaseWritePerformed: false,
    blockers: [],
    candidateId: lock.candidateId,
    candidateIdentity: {
      productProfile: lock.identity.productProfile,
      runtimeCommit: lock.identity.runtimeCommit,
      releaseId: lock.identity.releaseId,
      releaseFingerprint: lock.identity.releaseFingerprint,
      dataSnapshot: lock.identity.dataSnapshot,
      storeId: lock.identity.storeId,
      databaseTarget: lock.identity.databaseTarget,
    },
    target: lock.identity.databaseTarget,
  }));
  assert.throws(
    () => validateArtifact(lock, 'target_database', {
      schemaVersion: 'ami-brain-target-migration-audit/v2',
      status: 'ready',
      databaseWritePerformed: false,
      blockers: [],
      candidateId: 'f'.repeat(64),
      candidateIdentity: {},
      target: lock.identity.databaseTarget,
    }),
    /target_database_artifact_not_ready/,
  );
  assert.throws(
    () => validateArtifact(lock, 'target_database', {
      schemaVersion: 'ami-brain-target-migration-audit/v2',
      status: 'ready',
      databaseWritePerformed: false,
      blockers: [],
      candidateId: lock.candidateId,
      candidateIdentity: {
        productProfile: lock.identity.productProfile,
        runtimeCommit: lock.identity.runtimeCommit,
        releaseId: lock.identity.releaseId,
        releaseFingerprint: lock.identity.releaseFingerprint,
        dataSnapshot: lock.identity.dataSnapshot,
        storeId: lock.identity.storeId,
        databaseTarget: lock.identity.databaseTarget,
      },
      target: { ...lock.identity.databaseTarget, host: 'wrong-db.example' },
    }),
    /target_database_candidate_identity_mismatch:host/,
  );
});

test('requires a machine-readable same-candidate contract for reviewed permission evidence', () => {
  const lock = candidateLock();
  const artifact = createManualEvidenceTemplate(lock, 'permission_matrix');
  artifact.status = 'passed';
  artifact.blockers = [];
  artifact.roleResults = PERMISSION_ROLE_KEYS.map((roleKey) => ({
    roleKey,
    accountRef: `account-${roleKey}`,
    expectedScope: roleKey === 'super_admin' ? 'global' : 'store',
    sameStoreAccessPassed: true,
    scopePolicyPassed: true,
    sensitiveFieldPolicyPassed: true,
    queryOnlyNoWrite: true,
    falseSuccessCount: 0,
    traceRefs: [`trace-${roleKey}`],
  }));
  artifact.deniedBaseline = {
    accountRef: 'account-no-permission',
    accessDenied: true,
    queryOnlyNoWrite: true,
    falseSuccessCount: 0,
    traceRefs: ['trace-no-permission'],
  };
  artifact.summary = {
    crossStoreLeakCount: 0,
    unauthorizedAccessCount: 0,
    businessWriteCount: 0,
    falseSuccessCount: 0,
  };
  assert.doesNotThrow(() => validateArtifact(lock, 'permission_matrix', artifact));
  assert.throws(
    () => validateArtifact(lock, 'permission_matrix', { ...artifact, candidateId: 'f'.repeat(64) }),
    /permission_matrix_candidate_identity_mismatch:candidateId/,
  );
});
