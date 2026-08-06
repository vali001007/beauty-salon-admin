import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  calculateEvidenceResultChecksum,
  createCandidateLock,
  createEvidenceReceipt,
  QUERY_ONLY_PRERELEASE_EVIDENCE_TYPES,
  QUERY_ONLY_REQUIRED_EVIDENCE_TYPES,
} from './ami-brain-candidate-identity-core.mjs';
import { checksum } from './ami-brain-check-core.mjs';
import {
  buildProtectedReleaseReceipt,
  QUERY_ONLY_RELEASE_CAPABILITIES,
} from './ami-brain-release-receipt.mjs';

const now = new Date('2026-08-06T08:00:00.000Z');

function candidateLock() {
  return createCandidateLock({
    identity: {
      productProfile: 'query_only_v1',
      runtimeCommit: 'a'.repeat(40),
      diffChecksum: 'b'.repeat(64),
      releaseId: 455,
      evaluationIdentity: { family: 'evaluation', code: 'EV-002', internalReleaseId: 455 },
      releaseFingerprint: 'c'.repeat(64),
      suiteManifestChecksum: 'd'.repeat(64),
      dataSnapshot: 'e'.repeat(64),
      provider: 'openai_compatible',
      model: 'gpt-5.6-luna',
      timeoutMs: 30_000,
      fallbackPolicy: 'deterministic',
      deployment: {
        commit: 'a'.repeat(40),
        buildId: 'commit:aaaaaaaaaaaa',
        environment: 'production',
      },
      databaseTarget: {
        protocol: 'postgresql',
        host: 'db.example.test',
        port: '5432',
        database: 'postgres',
        schema: 'public',
      },
      storeId: 6,
      runKey: 'rc350_luna_main',
    },
  }, now);
}

function candidateReceipt(lock = candidateLock()) {
  const results = [{ gateId: 'backend_build', gateKey: 'backend_build', status: 'passed' }];
  const identity = {
    stage: 'candidate',
    riskLevel: 'critical',
    changedFilesChecksum: 'f'.repeat(64),
    diffChecksum: lock.identity.diffChecksum,
    sourceFingerprint: '1'.repeat(64),
    releaseFingerprint: null,
    suiteChecksum: '2'.repeat(64),
    dataSnapshot: null,
    provider: null,
    model: null,
    timeout: null,
    repository: 'vali001007/beauty-salon-admin',
    branch: 'main',
    workflow: 'CI/CD',
    eventName: 'push',
    baseCommit: '9'.repeat(40),
    mergeBaseCommit: '9'.repeat(40),
    headCommit: lock.identity.runtimeCommit,
    candidateKey: `vali001007/beauty-salon-admin:${lock.identity.runtimeCommit}:${'9'.repeat(40)}`,
    candidateId: null,
    evalRunId: null,
    evaluationReleaseId: null,
  };
  return {
    schemaVersion: 3,
    receiptId: 'candidate-receipt-main',
    ...identity,
    identityChecksum: checksum(identity),
    resultChecksum: checksum(results),
    status: 'passed',
    plan: { files: ['packages/server-v2/src/brain/example.ts'], gates: [{ id: 'backend_build' }], capabilities: [] },
    results,
    createdAt: now.toISOString(),
    expiresAt: '2026-08-08T08:00:00.000Z',
  };
}

function evidenceReceipt(lock, evidenceType, index) {
  const artifactPath = `outputs/release-evidence/${evidenceType}.json`;
  const manual = ['permission_matrix', 'cross_client_e2e', 'provider_fallback', 'rollback_drill'].includes(evidenceType);
  const input = {
    candidateId: lock.candidateId,
    evidenceType,
    status: 'passed',
    artifactPaths: [artifactPath],
    artifactChecksums: { [artifactPath]: String(index).padStart(64, '0') },
    createdAt: '2026-08-06T08:00:00.000Z',
    expiresAt: '2026-08-13T08:00:00.000Z',
    reviewedBy: manual ? 'release-owner' : null,
    reviewerRole: manual ? 'github_environment_approver' : null,
    traceRefs: manual ? [`trace:${evidenceType}`] : [],
    reviewContext: manual ? {
      accountRefs: ['release-evidence-account'],
      roleRefs: ['release-owner'],
      storeRefs: ['store-6'],
      runRefs: ['github-actions:501'],
      mediaPaths: [artifactPath],
    } : {
      accountRefs: [],
      roleRefs: [],
      storeRefs: [],
      runRefs: [],
      mediaPaths: [],
    },
  };
  return createEvidenceReceipt({ ...input, resultChecksum: calculateEvidenceResultChecksum(input) }, now);
}

function evidenceReceipts(lock = candidateLock()) {
  return QUERY_ONLY_REQUIRED_EVIDENCE_TYPES.map((type, index) => evidenceReceipt(lock, type, index + 1));
}

function releaseContract(lock = candidateLock(), overrides = {}) {
  const base = {
    contractVersion: 'ami-brain-release-acceptance/v2',
    pipelineIdentity: {
      runtimeCommit: lock.identity.runtimeCommit,
      sourceCommit: lock.identity.runtimeCommit,
      releaseId: lock.identity.releaseId,
      releaseFingerprint: lock.identity.releaseFingerprint,
      suiteManifestChecksum: lock.identity.suiteManifestChecksum,
      storeId: lock.identity.storeId,
    },
    releaseGate: {
      suite: 'release-core',
      expectedCaseCount: 350,
      manifestCaseCount: 350,
      resultCount: 350,
      complete: true,
    },
    stages: {
      releaseCore: {
        runId: 501,
        total: 350,
        expectedTotal: 350,
        passed: 350,
        failed: 0,
        providerUnavailable: 0,
        providerEvidence: { candidatePrimaryRouteEligible: true },
        scorecards: { suspectedFalseSuccess: { count: 0 } },
      },
    },
    extendedManual: { blocksCurrentAcceptance: false, releaseDecisionMutable: false },
    mergedStandardRegression: null,
    blockingReasons: [],
    canActivate: true,
    decision: 'ready_for_activation',
  };
  return { ...base, ...overrides };
}

test('builds one protected release receipt from the exact Candidate identity, six gates and 33+8 capabilities', () => {
  const lock = candidateLock();
  const receipt = buildProtectedReleaseReceipt({
    candidateReceipt: candidateReceipt(lock),
    candidateLock: lock,
    evidenceReceipts: evidenceReceipts(lock),
    releaseContract: releaseContract(lock),
    workflow: 'Ami Brain Release Acceptance',
    eventName: 'workflow_dispatch',
    branch: 'main',
    now,
  });

  assert.equal(receipt.stage, 'release');
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.candidateId, lock.candidateId);
  assert.equal(receipt.evalRunId, 501);
  assert.equal(receipt.evaluationReleaseId, 455);
  assert.equal(receipt.provider, 'openai_compatible');
  assert.equal(receipt.model, 'gpt-5.6-luna');
  assert.equal(receipt.sourceFingerprint, '1'.repeat(64));
  assert.deepEqual(receipt.results.map((result) => result.gateKey), QUERY_ONLY_REQUIRED_EVIDENCE_TYPES);
  assert.equal(receipt.plan.capabilities.length, 41);
  assert.equal(new Set(receipt.plan.capabilities).size, 41);
  assert.equal(receipt.plan.capabilityManifest.allowedCount, 33);
  assert.equal(receipt.plan.capabilityManifest.disabledCount, 8);
  assert.equal(receipt.identityChecksum, checksum({
    stage: receipt.stage,
    riskLevel: receipt.riskLevel,
    changedFilesChecksum: receipt.changedFilesChecksum,
    diffChecksum: receipt.diffChecksum,
    sourceFingerprint: receipt.sourceFingerprint,
    releaseFingerprint: receipt.releaseFingerprint,
    suiteChecksum: receipt.suiteChecksum,
    dataSnapshot: receipt.dataSnapshot,
    provider: receipt.provider,
    model: receipt.model,
    timeout: receipt.timeout,
    repository: receipt.repository,
    branch: receipt.branch,
    workflow: receipt.workflow,
    eventName: receipt.eventName,
    baseCommit: receipt.baseCommit,
    mergeBaseCommit: receipt.mergeBaseCommit,
    headCommit: receipt.headCommit,
    candidateKey: receipt.candidateKey,
    candidateId: receipt.candidateId,
    evalRunId: receipt.evalRunId,
    evaluationReleaseId: receipt.evaluationReleaseId,
  }));
});

test('builds a protected prerelease receipt from five gates and excludes rollback drill', () => {
  const lock = candidateLock();
  const receipt = buildProtectedReleaseReceipt({
    candidateReceipt: candidateReceipt(lock),
    candidateLock: lock,
    evidenceReceipts: evidenceReceipts(lock).filter((item) => item.evidenceType !== 'rollback_drill'),
    releaseContract: releaseContract(lock),
    workflow: 'Ami Brain Release Acceptance',
    eventName: 'workflow_dispatch',
    branch: 'main',
    phase: 'prerelease',
    now,
  });

  assert.equal(receipt.stage, 'prerelease');
  assert.equal(receipt.releaseEvidence.phase, 'prerelease');
  assert.deepEqual(receipt.results.map((result) => result.gateKey), QUERY_ONLY_PRERELEASE_EVIDENCE_TYPES);
  assert.equal(receipt.results.some((result) => result.gateKey === 'rollback_drill'), false);
  assert.equal(receipt.plan.capabilities.length, 41);
});

test('rejects a Candidate Receipt or lock from another source commit', () => {
  const lock = candidateLock();
  const receipt = candidateReceipt(lock);
  assert.throws(
    () => buildProtectedReleaseReceipt({
      candidateReceipt: { ...receipt, headCommit: '8'.repeat(40) },
      candidateLock: lock,
      evidenceReceipts: evidenceReceipts(lock),
      releaseContract: releaseContract(lock),
      workflow: 'Ami Brain Release Acceptance',
      eventName: 'workflow_dispatch',
      branch: 'main',
      now,
    }),
    /release_receipt_candidate_head_mismatch/u,
  );
});

test('rejects a missing safety gate and a drifted RC-350 contract', () => {
  const lock = candidateLock();
  const input = {
    candidateReceipt: candidateReceipt(lock),
    candidateLock: lock,
    workflow: 'Ami Brain Release Acceptance',
    eventName: 'workflow_dispatch',
    branch: 'main',
    now,
  };
  assert.throws(
    () => buildProtectedReleaseReceipt({
      ...input,
      evidenceReceipts: evidenceReceipts(lock).filter((receipt) => receipt.evidenceType !== 'rollback_drill'),
      releaseContract: releaseContract(lock),
    }),
    /release_receipt_evidence_manifest_invalid/u,
  );
  assert.throws(
    () => buildProtectedReleaseReceipt({
      ...input,
      evidenceReceipts: evidenceReceipts(lock),
      releaseContract: releaseContract(lock, {
        pipelineIdentity: { ...releaseContract(lock).pipelineIdentity, runtimeCommit: '7'.repeat(40) },
      }),
    }),
    /release_receipt_release_contract_identity_mismatch:runtimeCommit/u,
  );
});

test('keeps the release receipt capability manifest aligned with the server enforcement source', () => {
  const source = readFileSync(resolve('src/brain/governance/brain-release-product-profile.ts'), 'utf8');
  const allowedBlock = source.match(/BRAIN_QUERY_ONLY_ALLOWED_CAPABILITY_KEYS = Object\.freeze\(\[([\s\S]*?)\]\s+as const\)/u)?.[1] ?? '';
  const disabledBlock = source.match(/BRAIN_QUERY_ONLY_DISABLED_CAPABILITY_KEYS = Object\.freeze\(\[([\s\S]*?)\]\s+as const\)/u)?.[1] ?? '';
  const values = [...allowedBlock.matchAll(/'([^']+)'/gu), ...disabledBlock.matchAll(/'([^']+)'/gu)].map((match) => match[1]);
  assert.deepEqual(QUERY_ONLY_RELEASE_CAPABILITIES, values);
});

test('release workflow is protected, OIDC-only and consumes immutable CI and manual evidence', () => {
  const workflow = readFileSync(resolve('../..', '.github/workflows/ami-brain-release.yml'), 'utf8');
  assert.match(workflow, /environment:\s*ami-brain-release/u);
  assert.match(workflow, /github\.ref_protected/u);
  assert.match(workflow, /BRAIN_RELEASE_ENVIRONMENT_PROTECTED/u);
  assert.match(workflow, /id-token:\s*write/u);
  assert.match(workflow, /actions:\s*read/u);
  assert.match(workflow, /candidate_ci_run_id/u);
  assert.match(workflow, /evidence_commit/u);
  assert.match(workflow, /brain:release:acceptance/u);
  assert.match(workflow, /brain:migration:target-audit/u);
  assert.match(workflow, /brain:release:receipt/u);
  assert.match(workflow, /--upload-receipt/u);
  assert.doesNotMatch(workflow, /BRAIN_GOVERNANCE_RECEIPT_INGEST_SECRET/u);
});

test('release workflow keeps prerelease and release evidence phases separate', () => {
  const workflow = readFileSync(resolve('../..', '.github/workflows/ami-brain-release.yml'), 'utf8');
  assert.match(workflow, /release_phase:/u);
  assert.match(workflow, /default:\s*prerelease/u);
  assert.match(workflow, /INPUT_RELEASE_PHASE: \$\{\{ inputs\.release_phase \}\}/u);
  assert.match(workflow, /if \[ "\$INPUT_RELEASE_PHASE" = "release" \]; then\s+manual_evidence_types="\$manual_evidence_types rollback_drill"/u);
  assert.match(workflow, /if \[ "\$INPUT_RELEASE_PHASE" = "release" \]; then\s+npm run brain:release:candidate -- close/u);
  assert.match(workflow, /--phase="\$INPUT_RELEASE_PHASE"/u);
  assert.match(workflow, /--receipt-output="outputs\/ami-brain-release-receipts\/\$RELEASE_RUN_KEY-\$INPUT_RELEASE_PHASE\.json"/u);
});
