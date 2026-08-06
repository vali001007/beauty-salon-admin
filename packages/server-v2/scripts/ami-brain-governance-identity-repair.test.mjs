import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertApplyAuthorization,
  assertRepairActor,
  buildIdentityRepairPreview,
  REPAIR_CONTRACT,
} from './ami-brain-governance-identity-repair.mjs';

function anomalyState() {
  return {
    policyCounter: 3,
    release: {
      id: 454,
      releaseKey: 'governance-candidate-1-4189ee7a9ea1',
      scope: 'governance_policy',
      status: 'draft',
      releaseFamily: 'policy',
      displayCode: 'GP-003',
      displayName: 'Governance Policy',
      retiredAt: null,
      retirementReason: null,
      itemCount: 44,
      approvedCount: 34,
      deniedCount: 10,
      enforcedCount: 0,
    },
    candidate: {
      id: 1,
      candidateKey: 'candidate-1',
      headCommit: '4189ee7a9ea1d7f81cb294829f2e2fb4cdba8bb6',
      status: 'governing',
      policySnapshotId: 454,
    },
    transitionReferenceCount: 0,
    rolloutReferenceCount: 0,
    targetCodeOwnerCount: 1,
    higherPolicyCodeCount: 0,
    reclaimEventCount: 0,
  };
}

test('builds a no-delete reclaim plan only for the exact observed GP-003 anomaly', () => {
  const preview = buildIdentityRepairPreview(anomalyState(), { generatedAt: '2026-08-06T00:00:00.000Z' });
  assert.equal(preview.status, 'ready');
  assert.equal(preview.deletesRows, false);
  assert.equal(preview.mutatesReleaseItems, false);
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.planChecksum, /^[a-f0-9]{64}$/u);
  assert.ok(preview.operations.includes('archive_release_454_as_legacy_without_deleting_items'));
});

test('blocks reclaim when policy shape, counter, or references drift', () => {
  const state = anomalyState();
  state.release.itemCount = 41;
  state.policyCounter = 4;
  state.transitionReferenceCount = 1;
  state.rolloutReferenceCount = 1;
  state.higherPolicyCodeCount = 1;
  const preview = buildIdentityRepairPreview(state);
  assert.equal(preview.status, 'blocked');
  assert.ok(preview.blockers.includes('repair_target_release_policy_shape_drifted'));
  assert.ok(preview.blockers.includes('repair_policy_counter_drifted:4'));
  assert.ok(preview.blockers.includes('repair_transition_reference_exists:1'));
  assert.ok(preview.blockers.includes('repair_rollout_reference_exists:1'));
  assert.ok(preview.blockers.includes('repair_higher_policy_identity_exists:1'));
});

test('requires double confirmation, exact preview checksum, and actor identity', () => {
  const preview = buildIdentityRepairPreview(anomalyState());
  assert.throws(() => assertApplyAuthorization({ apply: false, yes: true, planChecksum: preview.planChecksum, preview, actorId: 9 }), /requires_apply_and_yes/u);
  assert.throws(() => assertApplyAuthorization({ apply: true, yes: false, planChecksum: preview.planChecksum, preview, actorId: 9 }), /requires_apply_and_yes/u);
  assert.throws(() => assertApplyAuthorization({ apply: true, yes: true, planChecksum: 'f'.repeat(64), preview, actorId: 9 }), /plan_checksum_mismatch/u);
  assert.throws(() => assertApplyAuthorization({ apply: true, yes: true, planChecksum: preview.planChecksum, preview, actorId: 0 }), /actor_id_invalid/u);
  assert.doesNotThrow(() => assertApplyAuthorization({ apply: true, yes: true, planChecksum: preview.planChecksum, preview, actorId: 9 }));
});

test('requires the repair actor to be an active, existing super administrator', () => {
  const actor = {
    id: 1,
    username: 'admin',
    status: 'active',
    deletedAt: null,
    isSuperAdmin: true,
  };
  assert.deepEqual(assertRepairActor(actor, 1), { id: 1, username: 'admin', role: 'super_admin' });
  assert.throws(() => assertRepairActor(null, 1), /actor_not_found/u);
  assert.throws(() => assertRepairActor({ ...actor, id: 2 }, 1), /actor_identity_mismatch/u);
  assert.throws(() => assertRepairActor({ ...actor, status: 'disabled' }, 1), /actor_inactive/u);
  assert.throws(() => assertRepairActor({ ...actor, deletedAt: '2026-08-06T00:00:00.000Z' }, 1), /actor_inactive/u);
  assert.throws(() => assertRepairActor({ ...actor, isSuperAdmin: false }, 1), /super_admin_required/u);
  assert.throws(() => assertRepairActor({ ...actor, username: ' ' }, 1), /actor_username_missing/u);
});

test('builds a reversible restore plan only before GP-003 is reallocated', () => {
  const state = anomalyState();
  state.policyCounter = 2;
  state.release = {
    ...state.release,
    status: 'archived',
    releaseFamily: 'legacy',
    displayCode: null,
    displayName: REPAIR_CONTRACT.archivedDisplayName,
    retiredAt: '2026-08-06T01:00:00.000Z',
    retirementReason: REPAIR_CONTRACT.retirementReason,
  };
  state.targetCodeOwnerCount = 0;
  state.reclaimEventCount = 1;
  const preview = buildIdentityRepairPreview(state, { mode: 'restore' });
  assert.equal(preview.status, 'ready');
  assert.equal(preview.deletesRows, false);

  state.targetCodeOwnerCount = 1;
  const blocked = buildIdentityRepairPreview(state, { mode: 'restore' });
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.blockers.includes('restore_target_code_already_owned:1'));
});

test('does not restore an archived object without the reclaim audit event', () => {
  const state = anomalyState();
  state.policyCounter = 2;
  state.release = {
    ...state.release,
    status: 'archived',
    releaseFamily: 'legacy',
    displayCode: null,
    displayName: REPAIR_CONTRACT.archivedDisplayName,
    retiredAt: '2026-08-06T01:00:00.000Z',
    retirementReason: REPAIR_CONTRACT.retirementReason,
  };
  state.targetCodeOwnerCount = 0;
  const preview = buildIdentityRepairPreview(state, { mode: 'restore' });
  assert.equal(preview.status, 'blocked');
  assert.ok(preview.blockers.includes('restore_reclaim_audit_event_missing'));
});

test('rejects unsupported repair modes', () => {
  assert.throws(() => buildIdentityRepairPreview(anomalyState(), { mode: 'replace' }), /mode_invalid/u);
});

test('repair implementation contains no row deletion or release-item mutation statement', () => {
  const source = readFileSync(new URL('./ami-brain-governance-identity-repair.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bDELETE\s+FROM\b/iu);
  assert.doesNotMatch(source, /UPDATE\s+brain_release_item\b/iu);
});
