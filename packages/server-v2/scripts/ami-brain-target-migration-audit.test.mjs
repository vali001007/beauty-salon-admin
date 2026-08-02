import assert from 'node:assert/strict';
import test from 'node:test';
import { createCandidateLock } from './ami-brain-candidate-identity-core.mjs';
import {
  buildTargetMigrationAuditSummary,
  sanitizeDatabaseTarget,
} from './ami-brain-target-migration-audit.mjs';
import { validatePassedEvidenceArtifacts } from './ami-brain-release-candidate.mjs';

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

function readyInput(lock) {
  return {
    candidateLock: lock,
    target: { protocol: 'postgresql', host: 'db.example', port: '5432', database: 'ami', schema: 'public' },
    inventory: {
      count: 2,
      first: '001_init',
      latest: '002_brain',
      rawChainHash: 'a'.repeat(64),
      canonicalLfChainHash: 'b'.repeat(64),
    },
    rawHistory: {
      migrationTableExists: true,
      appliedCount: 2,
      pending: [],
      checksumMismatches: [],
      checksumMismatchDetails: [],
      lineEndingVariants: [],
      failedOrRolledBack: [],
      unexpected: [],
      duplicateHistory: [],
    },
    structure: { agentV3SemanticViewCount: 13, missingTables: [], missingColumns: [], missingIndexes: [] },
    checksumExceptions: { version: 1, targets: [] },
    generatedAt: '2026-08-02T12:00:00.000Z',
  };
}

test('sanitizes database target without leaking username, password, or unrelated query parameters', () => {
  const target = sanitizeDatabaseTarget(
    'postgresql://readonly-user:super-secret@db.example:6543/ami?schema=brain&sslmode=require',
  );
  assert.deepEqual(target, {
    protocol: 'postgresql',
    host: 'db.example',
    port: '6543',
    database: 'ami',
    schema: 'brain',
  });
  assert.doesNotMatch(JSON.stringify(target), /readonly-user|super-secret|sslmode/u);
});

test('binds a ready target migration audit to the validated candidate identity', () => {
  const lock = candidateLock();
  const summary = buildTargetMigrationAuditSummary(readyInput(lock));
  assert.equal(summary.status, 'ready');
  assert.equal(summary.databaseWritePerformed, false);
  assert.equal(summary.candidateId, lock.candidateId);
  assert.deepEqual(summary.candidateIdentity, {
    productProfile: lock.identity.productProfile,
    runtimeCommit: lock.identity.runtimeCommit,
    releaseId: lock.identity.releaseId,
    releaseFingerprint: lock.identity.releaseFingerprint,
    dataSnapshot: lock.identity.dataSnapshot,
    storeId: lock.identity.storeId,
    databaseTarget: lock.identity.databaseTarget,
  });
});

test('never invents a candidate binding when no candidate lock is supplied', () => {
  const lock = candidateLock();
  const summary = buildTargetMigrationAuditSummary(readyInput(null));
  assert.equal(summary.status, 'ready');
  assert.equal(summary.candidateId, null);
  assert.equal(summary.candidateIdentity, null);
  assert.throws(
    () => validatePassedEvidenceArtifacts(
      lock,
      'target_database',
      [{ relative: 'target-database.json', absolute: '/virtual/target-database.json' }],
      () => JSON.stringify(summary),
    ),
    /target_database_artifact_not_ready/,
  );
});

test('rejects a drifted or tampered candidate lock before producing an audit summary', () => {
  const lock = candidateLock();
  assert.throws(
    () => buildTargetMigrationAuditSummary(readyInput({ ...lock, candidateId: 'f'.repeat(64) })),
    /candidate_id_mismatch/,
  );
});
