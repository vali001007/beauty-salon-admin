import assert from 'node:assert/strict';
import test from 'node:test';
import { createCandidateLock } from './ami-brain-candidate-identity-core.mjs';
import {
  buildTargetMigrationAuditSummary,
  isAmiBrainOutOfScopeMigration,
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
      evaluationIdentity: { family: 'evaluation', code: 'EV-001', internalReleaseId: 453 },
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

test('reports Ami Ask migration history without treating it as an Ami Brain blocker', () => {
  const lock = candidateLock();
  const input = readyInput(lock);
  input.rawHistory.unexpected = [
    '20260804090000_ask_data_inventory_turnover',
    '20260804100000_ask_data_customer_behavior_profile',
  ];
  const summary = buildTargetMigrationAuditSummary(input);

  assert.equal(summary.status, 'ready');
  assert.deepEqual(summary.history.unexpected, []);
  assert.deepEqual(summary.history.outOfScopeAppliedMigrations, input.rawHistory.unexpected);
  assert.equal(isAmiBrainOutOfScopeMigration('20260804090000_ask_data_inventory_turnover'), true);
  assert.equal(isAmiBrainOutOfScopeMigration('20260804183000_brain_release_identity_and_transition'), false);
});

test('still blocks unexpected migrations that are not explicitly outside Ami Brain scope', () => {
  const lock = candidateLock();
  const input = readyInput(lock);
  input.rawHistory.unexpected = [
    '20260804090000_ask_data_inventory_turnover',
    '20260804190000_unknown_shared_schema_change',
  ];
  const summary = buildTargetMigrationAuditSummary(input);

  assert.equal(summary.status, 'blocked');
  assert.deepEqual(summary.history.outOfScopeAppliedMigrations, ['20260804090000_ask_data_inventory_turnover']);
  assert.deepEqual(summary.history.unexpected, ['20260804190000_unknown_shared_schema_change']);
  assert.ok(summary.blockers.includes('unexpected_migrations'));
});
