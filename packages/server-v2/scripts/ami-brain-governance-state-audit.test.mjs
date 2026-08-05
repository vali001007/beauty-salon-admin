import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertApprovedSupabaseTarget,
  buildGovernanceStateAudit,
  databaseProjectRef,
  sanitizeDatabaseTarget,
} from './ami-brain-governance-state-audit.mjs';

const target = { protocol: 'postgresql', host: 'pooler.supabase.com', port: '6543', database: 'postgres', schema: 'public' };

function readyInput() {
  return {
    target,
    counters: [
      { family: 'policy', lastNumber: 3 },
      { family: 'runtime', lastNumber: 1 },
      { family: 'evaluation', lastNumber: 1 },
    ],
    releases: [
      { id: 436, releaseKey: 'legacy-policy', scope: 'governance_policy', status: 'active', releaseFamily: 'policy', displayCode: 'GP-002', displayName: 'Legacy Shadow Policy' },
      { id: 452, releaseKey: 'legacy-runtime', scope: 'store:6', status: 'active', releaseFamily: 'legacy', displayCode: null, displayName: null },
      { id: 453, releaseKey: 'evaluation', scope: 'store:6', status: 'draft', releaseFamily: 'evaluation', displayCode: 'EV-001', displayName: 'Query Only V1 Evaluation' },
      { id: 455, releaseKey: `ami-brain-policy-query-only-v1-${'a'.repeat(12)}`, scope: 'governance_policy', status: 'draft', releaseFamily: 'policy', displayCode: 'GP-003', displayName: 'Query Only V1 强制治理策略', itemCount: 41, approvedCount: 33, deniedCount: 8, enforcedCount: 41 },
    ],
    runtimeSequences: [{ id: 1, candidateId: 7, status: 'draft', currentStage: 'shadow', runtimeVersionCode: 'RT-001', displayName: 'Query Only V1', productProfile: 'query_only_v1' }],
    transitions: [{ id: 2, transitionKey: 'transition-2', status: 'draft', currentStep: 'prepared', runtimeSequenceId: 1 }],
    candidates: [{ id: 7, candidateKey: 'candidate-7', headCommit: 'a'.repeat(40), status: 'ready' }],
    verifiedReleaseReceiptCount: 1,
    expectedHeadCommit: 'a'.repeat(40),
    generatedAt: '2026-08-06T00:00:00.000Z',
  };
}

test('sanitizes the target and extracts Supabase project ref without exposing credentials', () => {
  const connectionString = 'postgresql://postgres.pmvcxtnabhntwylvodig:secret@aws-1.pooler.supabase.com:6543/postgres?schema=public&sslmode=require';
  assert.deepEqual(sanitizeDatabaseTarget(connectionString), {
    protocol: 'postgresql',
    host: 'aws-1.pooler.supabase.com',
    port: '6543',
    database: 'postgres',
    schema: 'public',
  });
  assert.equal(databaseProjectRef(connectionString), 'pmvcxtnabhntwylvodig');
  assert.doesNotMatch(JSON.stringify(sanitizeDatabaseTarget(connectionString)), /secret|postgres\.pmvc/u);
});

test('rejects local, non-Supabase, and wrong-project targets before querying', () => {
  assert.throws(() => assertApprovedSupabaseTarget('postgresql://u:p@127.0.0.1:5432/db'), /local_database_forbidden/u);
  assert.throws(() => assertApprovedSupabaseTarget('postgresql://u:p@db.example.com:5432/db'), /non_supabase_target/u);
  assert.throws(
    () => assertApprovedSupabaseTarget('postgresql://postgres.other:p@aws-1.pooler.supabase.com:6543/db', 'pmvcxtnabhntwylvodig'),
    /project_ref_mismatch/u,
  );
});

test('reports ready only when GP, RT, EV, receipt, transition, and legacy rollback identities all align', () => {
  const report = buildGovernanceStateAudit(readyInput());
  assert.equal(report.status, 'ready');
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(report.gaps, []);
  assert.equal(report.databaseWritePerformed, false);
  assert.equal(report.targetIdentity.policy.state, 'reusable');
  assert.equal(report.targetIdentity.runtime.state, 'reusable');
});

test('blocks the observed invalid GP-003 occupation instead of silently allocating GP-004', () => {
  const input = readyInput();
  input.releases = input.releases.map((release) => release.displayCode === 'GP-003'
    ? { ...release, id: 454, releaseKey: 'governance-candidate-1-4189ee7a9ea1', displayName: 'Governance Policy', itemCount: 44, approvedCount: 34, deniedCount: 10, enforcedCount: 0 }
    : release);
  input.runtimeSequences = [];
  input.transitions = [];
  input.counters = input.counters.map((counter) => counter.family === 'runtime' ? { ...counter, lastNumber: 0 } : counter);
  input.verifiedReleaseReceiptCount = 0;

  const report = buildGovernanceStateAudit(input);
  assert.equal(report.status, 'blocked');
  assert.ok(report.blockers.includes('target_policy_identity_conflict:GP-003:release_454'));
  assert.ok(report.gaps.includes('target_policy_not_prepared:GP-003'));
  assert.ok(report.gaps.includes('target_runtime_not_prepared:RT-001'));
  assert.ok(report.gaps.includes('governance_transition_missing'));
});

test('keeps available target numbers non-blocking but reports preparation gaps', () => {
  const input = readyInput();
  input.releases = input.releases.filter((release) => release.displayCode !== 'GP-003');
  input.runtimeSequences = [];
  input.transitions = [];
  input.counters = input.counters.map((counter) => counter.family === 'policy'
    ? { ...counter, lastNumber: 2 }
    : counter.family === 'runtime' ? { ...counter, lastNumber: 0 } : counter);
  const report = buildGovernanceStateAudit(input);
  assert.equal(report.status, 'not_ready');
  assert.deepEqual(report.blockers, []);
  assert.equal(report.targetIdentity.policy.state, 'available');
  assert.equal(report.targetIdentity.runtime.state, 'available');
});

test('accepts retired legacy identities after a completed transition', () => {
  const input = readyInput();
  input.releases = input.releases.map((release) => Number(release.id) === 436
    ? { ...release, status: 'archived', retiredAt: '2026-08-06T01:00:00.000Z' }
    : Number(release.id) === 452
      ? { ...release, status: 'archived', supersededAt: '2026-08-06T01:00:00.000Z' }
      : release);
  input.runtimeSequences = input.runtimeSequences.map((sequence) => ({ ...sequence, status: 'completed', currentStage: 'full' }));
  input.transitions = input.transitions.map((transition) => ({ ...transition, status: 'completed', currentStep: 'completed' }));
  const report = buildGovernanceStateAudit(input);
  assert.equal(report.status, 'ready');
  assert.deepEqual(report.blockers, []);
});
