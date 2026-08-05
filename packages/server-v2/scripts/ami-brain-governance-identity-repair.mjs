import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import { config } from 'dotenv';
import pg from 'pg';
import {
  assertApprovedSupabaseTarget,
  sanitizeDatabaseTarget,
} from './ami-brain-governance-state-audit.mjs';

const { Client } = pg;
const packageRoot = resolve(import.meta.dirname, '..');

export const REPAIR_CONTRACT = Object.freeze({
  releaseId: 454,
  candidateId: 1,
  targetPolicyCode: 'GP-003',
  expectedCounterBeforeReclaim: 3,
  expectedCounterAfterReclaim: 2,
  originalDisplayName: 'Governance Policy',
  archivedDisplayName: 'Invalid Governance Candidate Snapshot',
  retirementReason: 'invalid_gp003_identity_reclaimed',
  eventType: 'invalid_policy_identity_reclaimed',
  restoreEventType: 'invalid_policy_identity_restored',
});

function argValue(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

function number(value) {
  return Number(value ?? 0);
}

function timestamp(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function normalizeState(input) {
  const release = input.release ? {
    id: number(input.release.id),
    releaseKey: String(input.release.releaseKey ?? ''),
    scope: String(input.release.scope ?? ''),
    status: String(input.release.status ?? ''),
    releaseFamily: String(input.release.releaseFamily ?? ''),
    displayCode: input.release.displayCode === null ? null : String(input.release.displayCode ?? ''),
    displayName: input.release.displayName === null ? null : String(input.release.displayName ?? ''),
    retiredAt: timestamp(input.release.retiredAt),
    retirementReason: input.release.retirementReason === null ? null : String(input.release.retirementReason ?? ''),
    itemCount: number(input.release.itemCount),
    approvedCount: number(input.release.approvedCount),
    deniedCount: number(input.release.deniedCount),
    enforcedCount: number(input.release.enforcedCount),
  } : null;
  return {
    policyCounter: number(input.policyCounter),
    release,
    candidate: input.candidate ? {
      id: number(input.candidate.id),
      candidateKey: String(input.candidate.candidateKey ?? ''),
      headCommit: String(input.candidate.headCommit ?? ''),
      status: String(input.candidate.status ?? ''),
      policySnapshotId: input.candidate.policySnapshotId === null ? null : number(input.candidate.policySnapshotId),
    } : null,
    transitionReferenceCount: number(input.transitionReferenceCount),
    rolloutReferenceCount: number(input.rolloutReferenceCount),
    targetCodeOwnerCount: number(input.targetCodeOwnerCount),
    higherPolicyCodeCount: number(input.higherPolicyCodeCount),
    reclaimEventCount: number(input.reclaimEventCount),
  };
}

export function buildIdentityRepairPreview(input, { mode = 'reclaim', generatedAt = new Date().toISOString() } = {}) {
  if (!['reclaim', 'restore'].includes(mode)) throw new Error(`identity_repair_mode_invalid:${mode}`);
  const state = normalizeState(input);
  const blockers = mode === 'reclaim' ? reclaimBlockers(state) : restoreBlockers(state);
  const operations = mode === 'reclaim'
    ? [
        `archive_release_${REPAIR_CONTRACT.releaseId}_as_legacy_without_deleting_items`,
        `restore_policy_counter_${REPAIR_CONTRACT.expectedCounterBeforeReclaim}_to_${REPAIR_CONTRACT.expectedCounterAfterReclaim}`,
        `append_governance_audit_event:${REPAIR_CONTRACT.eventType}`,
      ]
    : [
        `restore_release_${REPAIR_CONTRACT.releaseId}_identity_${REPAIR_CONTRACT.targetPolicyCode}`,
        `restore_policy_counter_${REPAIR_CONTRACT.expectedCounterAfterReclaim}_to_${REPAIR_CONTRACT.expectedCounterBeforeReclaim}`,
        `append_governance_audit_event:${REPAIR_CONTRACT.restoreEventType}`,
      ];
  const identity = {
    schemaVersion: 'ami-brain-governance-identity-repair/v1',
    mode,
    releaseId: REPAIR_CONTRACT.releaseId,
    candidateId: REPAIR_CONTRACT.candidateId,
    targetPolicyCode: REPAIR_CONTRACT.targetPolicyCode,
    state,
    operations,
    deletesRows: false,
    mutatesReleaseItems: false,
  };
  return {
    ...identity,
    generatedAt,
    status: blockers.length ? 'blocked' : 'ready',
    blockers,
    planChecksum: sha256(identity),
    applyContract: {
      requiredFlags: ['--apply', '--yes', '--plan-checksum=<preview checksum>', '--actor-id=<admin user id>'],
      serializable: true,
      compareAndSwap: true,
      databaseDeletePerformed: false,
    },
  };
}

function reclaimBlockers(state) {
  const blockers = [];
  const release = state.release;
  if (!release || release.id !== REPAIR_CONTRACT.releaseId) blockers.push('repair_target_release_missing');
  if (release && (
    release.scope !== 'governance_policy'
    || release.status !== 'draft'
    || release.releaseFamily !== 'policy'
    || release.displayCode !== REPAIR_CONTRACT.targetPolicyCode
    || release.displayName !== REPAIR_CONTRACT.originalDisplayName
    || !/^governance-candidate-1-[a-f0-9]{12}$/u.test(release.releaseKey)
  )) blockers.push('repair_target_release_identity_drifted');
  if (release && (
    release.itemCount !== 44
    || release.approvedCount !== 34
    || release.deniedCount !== 10
    || release.enforcedCount !== 0
  )) blockers.push('repair_target_release_policy_shape_drifted');
  if (state.policyCounter !== REPAIR_CONTRACT.expectedCounterBeforeReclaim) blockers.push(`repair_policy_counter_drifted:${state.policyCounter}`);
  if (state.targetCodeOwnerCount !== 1) blockers.push(`repair_target_code_owner_count_invalid:${state.targetCodeOwnerCount}`);
  if (state.higherPolicyCodeCount !== 0) blockers.push(`repair_higher_policy_identity_exists:${state.higherPolicyCodeCount}`);
  if (state.transitionReferenceCount !== 0) blockers.push(`repair_transition_reference_exists:${state.transitionReferenceCount}`);
  if (state.rolloutReferenceCount !== 0) blockers.push(`repair_rollout_reference_exists:${state.rolloutReferenceCount}`);
  if (!state.candidate || state.candidate.id !== REPAIR_CONTRACT.candidateId || state.candidate.policySnapshotId !== REPAIR_CONTRACT.releaseId) {
    blockers.push('repair_candidate_binding_drifted');
  }
  return [...new Set(blockers)];
}

function restoreBlockers(state) {
  const blockers = [];
  const release = state.release;
  if (!release || release.id !== REPAIR_CONTRACT.releaseId) blockers.push('restore_target_release_missing');
  if (release && (
    release.status !== 'archived'
    || release.releaseFamily !== 'legacy'
    || release.displayCode !== null
    || release.displayName !== REPAIR_CONTRACT.archivedDisplayName
    || release.retirementReason !== REPAIR_CONTRACT.retirementReason
    || !release.retiredAt
  )) blockers.push('restore_target_release_identity_drifted');
  if (state.policyCounter !== REPAIR_CONTRACT.expectedCounterAfterReclaim) blockers.push(`restore_policy_counter_drifted:${state.policyCounter}`);
  if (state.targetCodeOwnerCount !== 0) blockers.push(`restore_target_code_already_owned:${state.targetCodeOwnerCount}`);
  if (state.higherPolicyCodeCount !== 0) blockers.push(`restore_higher_policy_identity_exists:${state.higherPolicyCodeCount}`);
  if (state.transitionReferenceCount !== 0) blockers.push(`restore_transition_reference_exists:${state.transitionReferenceCount}`);
  if (state.rolloutReferenceCount !== 0) blockers.push(`restore_rollout_reference_exists:${state.rolloutReferenceCount}`);
  if (state.reclaimEventCount < 1) blockers.push('restore_reclaim_audit_event_missing');
  if (!state.candidate || state.candidate.id !== REPAIR_CONTRACT.candidateId || state.candidate.policySnapshotId !== REPAIR_CONTRACT.releaseId) {
    blockers.push('restore_candidate_binding_drifted');
  }
  return [...new Set(blockers)];
}

export function assertApplyAuthorization({ apply, yes, planChecksum, preview, actorId }) {
  if (!apply || !yes) throw new Error('identity_repair_apply_requires_apply_and_yes');
  if (!preview || preview.status !== 'ready') throw new Error('identity_repair_preview_not_ready');
  if (!/^[a-f0-9]{64}$/u.test(String(planChecksum ?? '')) || planChecksum !== preview.planChecksum) {
    throw new Error('identity_repair_plan_checksum_mismatch');
  }
  if (!Number.isInteger(Number(actorId)) || Number(actorId) <= 0) throw new Error('identity_repair_actor_id_invalid');
}

async function queryRows(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

async function collectRepairState(client, { lock = false } = {}) {
  const lockSuffix = lock ? ' FOR UPDATE' : '';
  const counterRows = await queryRows(client, `SELECT "lastNumber" FROM brain_version_counter WHERE family = 'policy'${lockSuffix}`);
  const releaseRows = await queryRows(client, `
    SELECT
      id,
      "releaseKey",
      scope,
      status::text,
      "releaseFamily",
      "displayCode",
      "displayName",
      "retiredAt",
      "retirementReason"
    FROM brain_release
    WHERE id = $1${lockSuffix}
  `, [REPAIR_CONTRACT.releaseId]);
  const itemRows = await queryRows(client, `
    SELECT
      COUNT(id)::int AS "itemCount",
      COUNT(id) FILTER (WHERE snapshot->>'whitelistStatus' = 'approved')::int AS "approvedCount",
      COUNT(id) FILTER (WHERE snapshot->>'whitelistStatus' = 'not_allowed')::int AS "deniedCount",
      COUNT(id) FILTER (WHERE snapshot->>'runtimeEnforcementStatus' = 'enforced')::int AS "enforcedCount"
    FROM brain_release_item
    WHERE "releaseId" = $1
  `, [REPAIR_CONTRACT.releaseId]);
  const candidateRows = await queryRows(client, `
    SELECT id, "candidateKey", "headCommit", status, "policySnapshotId"
    FROM brain_governance_candidate
    WHERE id = $1${lockSuffix}
  `, [REPAIR_CONTRACT.candidateId]);
  const transitionRows = await queryRows(client, `
    SELECT COUNT(*)::int AS count
    FROM brain_governance_transition
    WHERE "oldPolicyReleaseId" = $1 OR "newPolicyReleaseId" = $1
  `, [REPAIR_CONTRACT.releaseId]);
  const rolloutRows = await queryRows(client, `
    SELECT COUNT(*)::int AS count
    FROM brain_rollout_sequence
    WHERE "policySnapshotId" = $1
  `, [REPAIR_CONTRACT.releaseId]);
  const targetOwnerRows = await queryRows(client, `
    SELECT COUNT(*)::int AS count
    FROM brain_release
    WHERE "displayCode" = $1
  `, [REPAIR_CONTRACT.targetPolicyCode]);
  const higherPolicyRows = await queryRows(client, `
    SELECT COUNT(*)::int AS count
    FROM brain_release
    WHERE "releaseFamily" = 'policy'
      AND "displayCode" ~ '^GP-[0-9]{3,}$'
      AND SUBSTRING("displayCode" FROM 4)::int > $1
  `, [REPAIR_CONTRACT.expectedCounterBeforeReclaim]);
  const reclaimEventRows = await queryRows(client, `
    SELECT COUNT(*)::int AS count
    FROM brain_governance_event
    WHERE "candidateId" = $1
      AND "eventType" = $2
      AND "entityType" = 'policy_snapshot'
      AND "entityId" = $3
  `, [REPAIR_CONTRACT.candidateId, REPAIR_CONTRACT.eventType, String(REPAIR_CONTRACT.releaseId)]);
  return {
    policyCounter: counterRows[0]?.lastNumber ?? 0,
    release: releaseRows[0] ? { ...releaseRows[0], ...itemRows[0] } : null,
    candidate: candidateRows[0] ?? null,
    transitionReferenceCount: transitionRows[0]?.count ?? 0,
    rolloutReferenceCount: rolloutRows[0]?.count ?? 0,
    targetCodeOwnerCount: targetOwnerRows[0]?.count ?? 0,
    higherPolicyCodeCount: higherPolicyRows[0]?.count ?? 0,
    reclaimEventCount: reclaimEventRows[0]?.count ?? 0,
  };
}

async function applyRepair(client, { mode, expectedPlanChecksum, actorId }) {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    const state = await collectRepairState(client, { lock: true });
    const preview = buildIdentityRepairPreview(state, { mode });
    assertApplyAuthorization({ apply: true, yes: true, planChecksum: expectedPlanChecksum, preview, actorId });
    if (mode === 'reclaim') {
      const releaseResult = await client.query(`
        UPDATE brain_release
        SET
          status = 'archived',
          "releaseFamily" = 'legacy',
          "displayCode" = NULL,
          "displayName" = $1,
          "retiredAt" = NOW(),
          "retirementReason" = $2,
          "updatedAt" = NOW()
        WHERE id = $3
          AND status = 'draft'
          AND "releaseFamily" = 'policy'
          AND "displayCode" = $4
      `, [REPAIR_CONTRACT.archivedDisplayName, REPAIR_CONTRACT.retirementReason, REPAIR_CONTRACT.releaseId, REPAIR_CONTRACT.targetPolicyCode]);
      const counterResult = await client.query(`
        UPDATE brain_version_counter
        SET "lastNumber" = $1, "updatedAt" = NOW()
        WHERE family = 'policy' AND "lastNumber" = $2
      `, [REPAIR_CONTRACT.expectedCounterAfterReclaim, REPAIR_CONTRACT.expectedCounterBeforeReclaim]);
      if (releaseResult.rowCount !== 1 || counterResult.rowCount !== 1) throw new Error('identity_repair_compare_and_swap_failed');
    } else {
      const releaseResult = await client.query(`
        UPDATE brain_release
        SET
          status = 'draft',
          "releaseFamily" = 'policy',
          "displayCode" = $1,
          "displayName" = $2,
          "retiredAt" = NULL,
          "retirementReason" = NULL,
          "updatedAt" = NOW()
        WHERE id = $3
          AND status = 'archived'
          AND "releaseFamily" = 'legacy'
          AND "displayCode" IS NULL
          AND "retirementReason" = $4
      `, [REPAIR_CONTRACT.targetPolicyCode, REPAIR_CONTRACT.originalDisplayName, REPAIR_CONTRACT.releaseId, REPAIR_CONTRACT.retirementReason]);
      const counterResult = await client.query(`
        UPDATE brain_version_counter
        SET "lastNumber" = $1, "updatedAt" = NOW()
        WHERE family = 'policy' AND "lastNumber" = $2
      `, [REPAIR_CONTRACT.expectedCounterBeforeReclaim, REPAIR_CONTRACT.expectedCounterAfterReclaim]);
      if (releaseResult.rowCount !== 1 || counterResult.rowCount !== 1) throw new Error('identity_restore_compare_and_swap_failed');
    }
    await client.query(`
      INSERT INTO brain_governance_event
        ("candidateId", "eventType", "entityType", "entityId", "actorType", "actorId", payload, "resultChecksum", "createdAt")
      VALUES ($1, $2, 'policy_snapshot', $3, 'user', $4, $5::jsonb, $6, NOW())
    `, [
      REPAIR_CONTRACT.candidateId,
      mode === 'reclaim' ? REPAIR_CONTRACT.eventType : REPAIR_CONTRACT.restoreEventType,
      String(REPAIR_CONTRACT.releaseId),
      String(actorId),
      JSON.stringify({
        schemaVersion: 'ami-brain-governance-identity-repair-event/v1',
        mode,
        planChecksum: preview.planChecksum,
        previousState: preview.state,
        deletesRows: false,
        mutatesReleaseItems: false,
      }),
      preview.planChecksum,
    ]);
    await client.query('COMMIT');
    return { ...preview, applied: true, appliedAt: new Date().toISOString(), actorId: Number(actorId) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function main() {
  config({ path: resolve(packageRoot, '.env'), quiet: true });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for Ami Brain governance identity repair.');
  const expectedProjectRef = argValue('expected-project-ref') ?? process.env.AMI_BRAIN_TARGET_SUPABASE_PROJECT_REF;
  assertApprovedSupabaseTarget(connectionString, expectedProjectRef);
  const mode = argValue('mode') ?? 'reclaim';
  const apply = process.argv.includes('--apply');
  const yes = process.argv.includes('--yes');
  const actorId = argValue('actor-id');
  const planChecksum = argValue('plan-checksum');
  const client = new Client({ connectionString, application_name: 'ami-brain-governance-identity-repair' });
  await client.connect();
  try {
    if (apply) {
      if (!yes) throw new Error('identity_repair_apply_requires_apply_and_yes');
      const report = await applyRepair(client, { mode, expectedPlanChecksum: planChecksum, actorId });
      console.log(JSON.stringify({ ...report, target: sanitizeDatabaseTarget(connectionString) }, null, 2));
      return;
    }
    await client.query('BEGIN READ ONLY');
    const state = await collectRepairState(client);
    await client.query('COMMIT');
    const preview = buildIdentityRepairPreview(state, { mode });
    console.log(JSON.stringify({ ...preview, target: sanitizeDatabaseTarget(connectionString), applied: false }, null, 2));
    if (process.argv.includes('--strict') && preview.status !== 'ready') process.exitCode = 1;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
