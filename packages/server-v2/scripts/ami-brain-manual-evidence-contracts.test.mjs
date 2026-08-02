import assert from 'node:assert/strict';
import test from 'node:test';
import { createCandidateLock } from './ami-brain-candidate-identity-core.mjs';
import {
  CROSS_CLIENT_JOURNEY_KEYS,
  createManualEvidenceTemplate,
  validateManualEvidenceArtifact,
} from './ami-brain-manual-evidence-contracts.mjs';

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

function passingArtifact(lock, evidenceType) {
  const artifact = createManualEvidenceTemplate(lock, evidenceType, new Date('2026-08-02T12:00:00.000Z'));
  artifact.status = 'passed';
  artifact.blockers = [];
  if (evidenceType === 'permission_matrix') {
    artifact.roleResults = artifact.roleResults.map((result) => ({
      ...result,
      accountRef: `account-${result.roleKey}`,
      sameStoreAccessPassed: true,
      scopePolicyPassed: true,
      sensitiveFieldPolicyPassed: true,
      queryOnlyNoWrite: true,
      falseSuccessCount: 0,
      traceRefs: [`trace-${result.roleKey}`],
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
  } else if (evidenceType === 'cross_client_e2e') {
    artifact.clientResults = artifact.clientResults.map((result) => ({
      ...result,
      passedJourneyKeys: [...CROSS_CLIENT_JOURNEY_KEYS],
      failedJourneyKeys: [],
      confirmRequestsSent: 0,
      retryRequestsSent: 0,
      falseSuccessCount: 0,
      traceRefs: [`trace-${result.clientKey}`],
    }));
    artifact.summary = { falseSuccessCount: 0 };
  } else if (evidenceType === 'provider_fallback') {
    artifact.scenarioResults = artifact.scenarioResults.map((result) => ({
      ...result,
      passed: true,
      stuckRunning: false,
      falseSuccess: false,
      traceRefs: [`trace-${result.scenarioKey}`],
    }));
    artifact.summary = { longRunningCount: 0, falseSuccessCount: 0 };
  } else {
    artifact.executedStageResults = artifact.executedStageResults.map((result) => ({
      ...result,
      passed: true,
      traceRefs: [`trace-${result.stageKey}`],
    }));
    artifact.monitoringThresholdsConfigured = true;
    artifact.automaticPauseVerified = true;
    artifact.rollbackVerified = true;
    artifact.postRollbackReady = true;
    artifact.postRollbackActionsDisabled = true;
    artifact.summary = { businessWriteCount: 0, falseSuccessCount: 0 };
  }
  return artifact;
}

test('creates candidate-bound blocked templates that cannot be mistaken for passed evidence', () => {
  const lock = candidateLock();
  const template = createManualEvidenceTemplate(lock, 'permission_matrix');
  assert.equal(template.status, 'blocked');
  assert.equal(template.candidateId, lock.candidateId);
  assert.throws(
    () => validateManualEvidenceArtifact(lock, 'permission_matrix', template),
    /permission_matrix_artifact_not_ready/,
  );
});

test('accepts only super-admin plus all seven active Brain roles with zero safety violations', () => {
  const lock = candidateLock();
  const artifact = passingArtifact(lock, 'permission_matrix');
  assert.equal(validateManualEvidenceArtifact(lock, 'permission_matrix', artifact), artifact);
  artifact.roleResults[0].scopePolicyPassed = false;
  assert.throws(
    () => validateManualEvidenceArtifact(lock, 'permission_matrix', artifact),
    /permission_matrix_artifact_not_ready/,
  );
});

test('accepts only all-client E2E evidence covering every required product journey', () => {
  const lock = candidateLock();
  const artifact = passingArtifact(lock, 'cross_client_e2e');
  assert.equal(validateManualEvidenceArtifact(lock, 'cross_client_e2e', artifact), artifact);
  artifact.clientResults[0].passedJourneyKeys.pop();
  assert.throws(
    () => validateManualEvidenceArtifact(lock, 'cross_client_e2e', artifact),
    /cross_client_e2e_artifact_not_ready/,
  );
});

test('accepts provider fallback evidence only when every failure scenario is traceable and fail-safe', () => {
  const lock = candidateLock();
  const artifact = passingArtifact(lock, 'provider_fallback');
  assert.equal(validateManualEvidenceArtifact(lock, 'provider_fallback', artifact), artifact);
  artifact.scenarioResults[0].falseSuccess = true;
  assert.throws(
    () => validateManualEvidenceArtifact(lock, 'provider_fallback', artifact),
    /provider_fallback_artifact_not_ready/,
  );
});

test('requires a pre-Go shadow/canary rollback drill without pretending later rollout stages already ran', () => {
  const lock = candidateLock();
  const artifact = passingArtifact(lock, 'rollback_drill');
  assert.deepEqual(artifact.executedStageResults.map((result) => result.stageKey), ['shadow', '5_percent', 'rollback']);
  assert.equal(validateManualEvidenceArtifact(lock, 'rollback_drill', artifact), artifact);
  artifact.postRollbackActionsDisabled = false;
  assert.throws(
    () => validateManualEvidenceArtifact(lock, 'rollback_drill', artifact),
    /rollback_drill_artifact_not_ready/,
  );
});
