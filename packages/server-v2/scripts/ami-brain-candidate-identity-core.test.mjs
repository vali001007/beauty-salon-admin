import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateEvidenceResultChecksum,
  closeCandidateEvidence,
  createCandidateIdentity,
  createCandidateLock,
  createEvidenceReceipt,
  sha256,
  validateCandidateLock,
  validateReleaseCandidateLockBinding,
} from './ami-brain-candidate-identity-core.mjs';

function identity(overrides = {}) {
  const releaseId = overrides.releaseId ?? 453;
  return {
    productProfile: 'query_only_v1',
    runtimeCommit: 'a'.repeat(40),
    diffChecksum: 'b'.repeat(64),
    releaseId,
    evaluationIdentity: { family: 'evaluation', code: 'EV-001', internalReleaseId: releaseId },
    releaseFingerprint: 'c'.repeat(64),
    suiteManifestChecksum: 'd'.repeat(64),
    dataSnapshot: 'store-6:snapshot-20260802',
    provider: 'openai_responses',
    model: 'gpt-5.6-terra',
    timeoutMs: 20_000,
    fallbackPolicy: 'deterministic',
    deployment: {
      commit: 'a'.repeat(40),
      buildId: 'deploy-453',
      environment: 'staging',
    },
    databaseTarget: {
      protocol: 'postgresql',
      host: 'db.example',
      port: '5432',
      database: 'ami',
      schema: 'public',
    },
    storeId: 6,
    runKey: 'query_only_v1_candidate_001',
    ...overrides,
  };
}

function evidenceInput(lock, evidenceType, index = 1, overrides = {}) {
  const artifactPath = `outputs/${evidenceType}-${index}.json`;
  const manual = ['permission_matrix', 'cross_client_e2e', 'provider_fallback', 'rollback_drill']
    .includes(evidenceType);
  const base = {
    candidateId: lock.candidateId,
    evidenceType,
    status: 'passed',
    artifactPaths: [artifactPath],
    artifactChecksums: { [artifactPath]: String(index).padStart(64, '0') },
    createdAt: '2026-08-02T12:00:00.000Z',
    expiresAt: '2026-08-09T12:00:00.000Z',
    reviewedBy: manual ? 'qa-lead' : null,
    reviewerRole: manual ? 'quality_owner' : null,
    traceRefs: manual ? [`trace-${evidenceType}`] : [],
    reviewContext: manual ? {
      accountRefs: ['qa-user-1'],
      roleRefs: ['qa'],
      storeRefs: ['store-6'],
      runRefs: [`run-${evidenceType}`],
      mediaPaths: [artifactPath],
    } : {
      accountRefs: [],
      roleRefs: [],
      storeRefs: [],
      runRefs: [],
      mediaPaths: [],
    },
  };
  const value = {
    ...base,
    ...overrides,
    reviewContext: overrides.reviewContext === undefined
      ? base.reviewContext
      : { ...(base.reviewContext ?? {}), ...overrides.reviewContext },
  };
  return {
    ...value,
    resultChecksum: overrides.resultChecksum ?? calculateEvidenceResultChecksum(value),
  };
}

test('creates one deterministic candidateId from the complete immutable identity', () => {
  const lock = createCandidateLock({ identity: identity(), branch: 'candidate/query-only' }, new Date('2026-08-02T10:00:00Z'));
  assert.match(lock.candidateId, /^[a-f0-9]{64}$/u);
  assert.equal(lock.candidateId, sha256(createCandidateIdentity(identity())));
  assert.deepEqual(validateCandidateLock(lock), lock);
});

test('changes candidateId whenever deployment, model, data or Release identity changes', () => {
  const base = createCandidateLock({ identity: identity() }).candidateId;
  for (const changed of [
    identity({ releaseId: 454 }),
    identity({ evaluationIdentity: { family: 'evaluation', code: 'EV-002', internalReleaseId: 453 } }),
    identity({ model: 'gpt-next' }),
    identity({ dataSnapshot: 'store-6:snapshot-next' }),
    identity({ deployment: { ...identity().deployment, buildId: 'deploy-next' } }),
    identity({ databaseTarget: { ...identity().databaseTarget, host: 'db-next.example' } }),
  ]) {
    assert.notEqual(createCandidateLock({ identity: changed }).candidateId, base);
  }
});

test('rejects incomplete identities and deployment commit drift', () => {
  assert.throws(() => createCandidateIdentity(identity({ provider: null })), /candidate_provider_missing/);
  assert.throws(
    () => createCandidateIdentity(identity({ evaluationIdentity: { family: 'evaluation', code: 'RT-001', internalReleaseId: 453 } })),
    /candidate_evaluation_version_code_invalid/,
  );
  assert.throws(
    () => createCandidateIdentity(identity({ deployment: { ...identity().deployment, commit: 'e'.repeat(40) } })),
    /candidate_deployment_commit_mismatch/,
  );
  assert.throws(() => validateCandidateLock({
    schemaVersion: 'ami-brain-candidate-lock/v1',
    identity: null,
  }), /candidate_product_profile_missing/);
});

test('binds a release candidate lock to the current immutable HEAD', () => {
  const lock = createCandidateLock({ identity: identity() });
  assert.deepEqual(validateReleaseCandidateLockBinding(lock, 'a'.repeat(40)), lock);
  assert.throws(
    () => validateReleaseCandidateLockBinding(lock, 'e'.repeat(40)),
    /release_candidate_lock_head_mismatch/,
  );
});

test('requires reviewer identity for semi-automatic evidence', () => {
  const lock = createCandidateLock({ identity: identity() });
  assert.throws(
    () => createEvidenceReceipt(evidenceInput(lock, 'permission_matrix', 1, { reviewedBy: null })),
    /evidence_reviewer_missing:permission_matrix/,
  );
  assert.throws(
    () => createEvidenceReceipt(evidenceInput(lock, 'permission_matrix', 1, { reviewerRole: null })),
    /evidence_reviewer_role_missing:permission_matrix/,
  );
  assert.throws(
    () => createEvidenceReceipt(evidenceInput(lock, 'permission_matrix', 1, { traceRefs: [] })),
    /evidence_trace_refs_missing:permission_matrix/,
  );
  assert.throws(
    () => createEvidenceReceipt(evidenceInput(lock, 'permission_matrix', 1, {
      reviewContext: { accountRefs: [] },
    })),
    /evidence_review_context_missing:permission_matrix:accountRefs/,
  );
});

test('binds evidence result checksum to the allowlisted type, status and every artifact checksum', () => {
  const lock = createCandidateLock({ identity: identity() });
  const receipt = evidenceInput(lock, 'release_contract');
  assert.deepEqual(createEvidenceReceipt(receipt), {
    schemaVersion: 'ami-brain-evidence-receipt/v2',
    ...receipt,
  });
  assert.throws(
    () => createEvidenceReceipt({ ...receipt, resultChecksum: 'f'.repeat(64) }),
    /evidence_result_checksum_mismatch/,
  );
  assert.throws(
    () => createEvidenceReceipt({ ...receipt, evidenceType: 'invented_gate' }),
    /evidence_type_invalid/,
  );
  assert.throws(
    () => createEvidenceReceipt({ ...receipt, artifactChecksums: {} }),
    /evidence_artifact_checksum_paths_mismatch/,
  );
  assert.throws(
    () => createEvidenceReceipt({ ...receipt, expiresAt: '2026-08-11T00:00:00.000Z' }),
    /evidence_validity_window_exceeded/,
  );
  const reviewed = evidenceInput(lock, 'permission_matrix');
  assert.throws(
    () => createEvidenceReceipt({ ...reviewed, reviewedBy: 'different-reviewer' }),
    /evidence_result_checksum_mismatch/,
  );
  assert.throws(
    () => createEvidenceReceipt({ ...reviewed, traceRefs: ['different-trace'] }),
    /evidence_result_checksum_mismatch/,
  );
});

test('closes only when every required receipt is passed, current and bound to the same candidate', () => {
  const now = new Date('2026-08-02T12:00:00Z');
  const lock = createCandidateLock({ identity: identity() }, now);
  const evidenceTypes = [
    'release_contract',
    'gold_100',
    'performance_60',
    'permission_matrix',
    'cross_client_e2e',
    'target_database',
    'provider_fallback',
    'rollback_drill',
  ];
  const evidenceReceipts = evidenceTypes.map((evidenceType, index) => evidenceInput(lock, evidenceType, index + 1));

  const result = closeCandidateEvidence({ candidateLock: lock, evidenceReceipts }, now);
  assert.equal(result.releaseEligible, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(Object.keys(result.evidenceChecksums).length, 8);
  assert.equal(result.expiresAt, '2026-08-09T12:00:00.000Z');

  const blocked = closeCandidateEvidence({ candidateLock: lock, evidenceReceipts: evidenceReceipts.slice(0, -1) }, now);
  assert.equal(blocked.releaseEligible, false);
  assert.ok(blocked.blockers.includes('required_evidence_missing:rollback_drill'));
});

test('never aggregates evidence from another candidate', () => {
  const now = new Date('2026-08-02T12:00:00Z');
  const lock = createCandidateLock({ identity: identity() }, now);
  const result = closeCandidateEvidence({
    candidateLock: lock,
    requiredEvidenceTypes: ['release_contract'],
    evidenceReceipts: [evidenceInput(lock, 'release_contract', 1, { candidateId: 'f'.repeat(64) })],
  }, now);
  assert.equal(result.releaseEligible, false);
  assert.ok(result.blockers.includes('evidence_candidate_mismatch:release_contract'));
  assert.ok(result.blockers.includes('required_evidence_missing:release_contract'));
});
