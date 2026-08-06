import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import { config } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const packageRoot = resolve(import.meta.dirname, '..');

export const GOVERNANCE_TARGET = Object.freeze({
  policyCode: 'GP-003',
  policyName: 'Query Only V1 强制治理策略',
  policyReleaseKeyPrefix: 'ami-brain-policy-query-only-v1-',
  policyItemCount: 41,
  approvedCount: 33,
  deniedCount: 8,
  runtimeCode: 'RT-001',
  runtimeName: 'Query Only V1',
  productProfile: 'query_only_v1',
});

function argValue(name) {
  const inlinePrefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function sanitizeDatabaseTarget(connectionString) {
  const parsed = new URL(connectionString);
  return {
    protocol: parsed.protocol.replace(':', ''),
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.replace(/^\//u, ''),
    schema: parsed.searchParams.get('schema') || 'public',
  };
}

export function databaseProjectRef(connectionString) {
  const parsed = new URL(connectionString);
  const directMatch = /^db\.([a-z0-9]+)\.supabase\.co$/u.exec(parsed.hostname);
  if (directMatch) return directMatch[1];
  const userMatch = /^[^.]+\.([a-z0-9]+)$/u.exec(decodeURIComponent(parsed.username));
  return userMatch?.[1] ?? null;
}

export function assertApprovedSupabaseTarget(connectionString, expectedProjectRef) {
  const parsed = new URL(connectionString);
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    throw new Error('ami_brain_governance_audit_local_database_forbidden');
  }
  if (!host.endsWith('.supabase.com') && !host.endsWith('.supabase.co')) {
    throw new Error(`ami_brain_governance_audit_non_supabase_target:${host}`);
  }
  if (expectedProjectRef) {
    const actualProjectRef = databaseProjectRef(connectionString);
    if (actualProjectRef !== expectedProjectRef) {
      throw new Error(`ami_brain_governance_audit_project_ref_mismatch:${expectedProjectRef}:${actualProjectRef ?? 'unknown'}`);
    }
  }
}

function counterNumber(counters, family) {
  return Number(counters.find((counter) => counter.family === family)?.lastNumber ?? 0);
}

function isTargetPolicyReusable(policy, expectedHeadCommit) {
  if (!policy) return false;
  const expectedReleaseKey = expectedHeadCommit
    ? `${GOVERNANCE_TARGET.policyReleaseKeyPrefix}${expectedHeadCommit.slice(0, 12)}`
    : null;
  return policy.scope === 'governance_policy'
    && policy.releaseFamily === 'policy'
    && policy.displayCode === GOVERNANCE_TARGET.policyCode
    && policy.displayName === GOVERNANCE_TARGET.policyName
    && (expectedReleaseKey
      ? policy.releaseKey === expectedReleaseKey
      : policy.releaseKey.startsWith(GOVERNANCE_TARGET.policyReleaseKeyPrefix))
    && Number(policy.itemCount) === GOVERNANCE_TARGET.policyItemCount
    && Number(policy.approvedCount) === GOVERNANCE_TARGET.approvedCount
    && Number(policy.deniedCount) === GOVERNANCE_TARGET.deniedCount
    && Number(policy.enforcedCount) === GOVERNANCE_TARGET.policyItemCount;
}

function isTargetRuntimeReusable(runtime, candidate) {
  if (!runtime) return false;
  return runtime.runtimeVersionCode === GOVERNANCE_TARGET.runtimeCode
    && runtime.displayName === GOVERNANCE_TARGET.runtimeName
    && runtime.productProfile === GOVERNANCE_TARGET.productProfile
    && (!candidate || Number(runtime.candidateId) === Number(candidate.id));
}

export function buildGovernanceStateAudit({
  target,
  counters = [],
  releases = [],
  runtimeSequences = [],
  transitions = [],
  candidates = [],
  verifiedReleaseReceiptCount = 0,
  expectedHeadCommit = null,
  generatedAt = new Date().toISOString(),
}) {
  const targetPolicy = releases.find((release) => release.displayCode === GOVERNANCE_TARGET.policyCode) ?? null;
  const oldPolicy = releases.find((release) => Number(release.id) === 436) ?? null;
  const oldRuntime = releases.find((release) => Number(release.id) === 452) ?? null;
  const evaluation = releases.find((release) => release.displayCode === 'EV-001') ?? null;
  const targetRuntime = runtimeSequences.find((sequence) => sequence.runtimeVersionCode === GOVERNANCE_TARGET.runtimeCode) ?? null;
  const candidate = candidates[0] ?? null;
  const policyReusable = isTargetPolicyReusable(targetPolicy, expectedHeadCommit ?? candidate?.headCommit ?? null);
  const runtimeReusable = isTargetRuntimeReusable(targetRuntime, candidate);
  const policyCounter = counterNumber(counters, 'policy');
  const runtimeCounter = counterNumber(counters, 'runtime');
  const evaluationCounter = counterNumber(counters, 'evaluation');
  const completedTransition = transitions.some((transition) => transition.status === 'completed');
  const blockers = [];
  const gaps = [];

  if (targetPolicy && !policyReusable) blockers.push(`target_policy_identity_conflict:${GOVERNANCE_TARGET.policyCode}:release_${targetPolicy.id}`);
  if (policyCounter !== (policyReusable ? 3 : 2)) blockers.push(`target_policy_counter_conflict:${GOVERNANCE_TARGET.policyCode}:last_${policyCounter}`);
  if (targetRuntime && !runtimeReusable) blockers.push(`target_runtime_identity_conflict:${GOVERNANCE_TARGET.runtimeCode}:sequence_${targetRuntime.id}`);
  if (runtimeCounter !== (runtimeReusable ? 1 : 0)) blockers.push(`target_runtime_counter_conflict:${GOVERNANCE_TARGET.runtimeCode}:last_${runtimeCounter}`);
  if (evaluationCounter < 1 || !evaluation) gaps.push('evaluation_identity_missing:EV-001');
  if (!candidate) gaps.push('governance_candidate_missing');
  if (Number(verifiedReleaseReceiptCount) < 1) gaps.push('verified_release_snapshot_missing');
  if (!policyReusable) gaps.push('target_policy_not_prepared:GP-003');
  if (!runtimeReusable) gaps.push('target_runtime_not_prepared:RT-001');
  if (!transitions.length) gaps.push('governance_transition_missing');
  if (completedTransition) {
    if (!oldPolicy || (!oldPolicy.retiredAt && oldPolicy.status !== 'archived')) {
      blockers.push('legacy_policy_retirement_missing:release_436');
    }
    if (!oldRuntime || (!oldRuntime.supersededAt && oldRuntime.status !== 'archived')) {
      blockers.push('legacy_runtime_supersession_missing:release_452');
    }
  } else {
    if (!oldPolicy || oldPolicy.status !== 'active') blockers.push('legacy_policy_active_identity_missing:release_436');
    if (!oldRuntime || oldRuntime.status !== 'active') blockers.push('legacy_runtime_active_identity_missing:release_452');
  }

  return {
    schemaVersion: 'ami-brain-governance-state-audit/v1',
    generatedAt,
    mode: 'read-only',
    databaseWritePerformed: false,
    target,
    status: blockers.length ? 'blocked' : gaps.length ? 'not_ready' : 'ready',
    counters: {
      policy: policyCounter,
      runtime: runtimeCounter,
      evaluation: evaluationCounter,
    },
    current: {
      policy: summarizeRelease(oldPolicy),
      runtime: summarizeRelease(oldRuntime),
      evaluation: summarizeRelease(evaluation),
    },
    targetIdentity: {
      policy: {
        code: GOVERNANCE_TARGET.policyCode,
        name: GOVERNANCE_TARGET.policyName,
        state: policyReusable ? 'reusable' : targetPolicy ? 'conflict' : 'available',
        release: summarizeRelease(targetPolicy),
      },
      runtime: {
        code: GOVERNANCE_TARGET.runtimeCode,
        name: GOVERNANCE_TARGET.runtimeName,
        state: runtimeReusable ? 'reusable' : targetRuntime ? 'conflict' : 'available',
        sequence: summarizeRuntime(targetRuntime),
      },
    },
    candidate: candidate ? {
      id: Number(candidate.id),
      candidateKey: candidate.candidateKey,
      headCommit: candidate.headCommit,
      status: candidate.status,
    } : null,
    verifiedReleaseReceiptCount: Number(verifiedReleaseReceiptCount),
    transitions: transitions.map((transition) => ({
      id: Number(transition.id),
      transitionKey: transition.transitionKey,
      status: transition.status,
      currentStep: transition.currentStep,
      runtimeSequenceId: Number(transition.runtimeSequenceId),
    })),
    blockers: [...new Set(blockers)],
    gaps: [...new Set(gaps)],
  };
}

function summarizeRelease(release) {
  if (!release) return null;
  return {
    id: Number(release.id),
    releaseKey: release.releaseKey,
    scope: release.scope,
    status: release.status,
    releaseFamily: release.releaseFamily,
    displayCode: release.displayCode,
    displayName: release.displayName,
    retiredAt: release.retiredAt ?? null,
    supersededAt: release.supersededAt ?? null,
    itemCount: Number(release.itemCount ?? 0),
    approvedCount: Number(release.approvedCount ?? 0),
    deniedCount: Number(release.deniedCount ?? 0),
    enforcedCount: Number(release.enforcedCount ?? 0),
  };
}

function summarizeRuntime(runtime) {
  if (!runtime) return null;
  return {
    id: Number(runtime.id),
    candidateId: Number(runtime.candidateId),
    status: runtime.status,
    currentStage: runtime.currentStage,
    runtimeVersionCode: runtime.runtimeVersionCode,
    displayName: runtime.displayName,
    productProfile: runtime.productProfile,
  };
}

async function queryRows(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

async function collectState(client) {
  const counters = await queryRows(client, `SELECT family, "lastNumber" FROM brain_version_counter ORDER BY family`);
  const releases = await queryRows(client, `
      SELECT
        release.id,
        release."releaseKey",
        release.scope,
        release.status::text,
        release."releaseFamily",
        release."displayCode",
        release."displayName",
        release."retiredAt",
        release."supersededAt",
        COUNT(item.id)::int AS "itemCount",
        COUNT(item.id) FILTER (WHERE item.snapshot->>'whitelistStatus' = 'approved')::int AS "approvedCount",
        COUNT(item.id) FILTER (WHERE item.snapshot->>'whitelistStatus' = 'not_allowed')::int AS "deniedCount",
        COUNT(item.id) FILTER (WHERE item.snapshot->>'runtimeEnforcementStatus' = 'enforced')::int AS "enforcedCount"
      FROM brain_release release
      LEFT JOIN brain_release_item item ON item."releaseId" = release.id
      WHERE release.id IN (436, 452)
         OR release."displayCode" IN ('GP-003', 'EV-001')
      GROUP BY release.id
      ORDER BY release.id
    `);
  const runtimeSequences = await queryRows(client, `
      SELECT id, "candidateId", status, "currentStage", "runtimeVersionCode", "displayName", "productProfile"
      FROM brain_rollout_sequence
      WHERE "runtimeVersionCode" = 'RT-001'
      ORDER BY id
    `);
  const transitions = await queryRows(client, `
      SELECT id, "transitionKey", status, "currentStep", "runtimeSequenceId"
      FROM brain_governance_transition
      ORDER BY id DESC
      LIMIT 10
    `);
  const candidates = await queryRows(client, `
      SELECT id, "candidateKey", "headCommit", status
      FROM brain_governance_candidate
      WHERE status IN ('governing', 'ready', 'releasing')
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `);
  const verifiedReceipts = await queryRows(client, `
      SELECT COUNT(*)::int AS count
      FROM brain_gate_receipt
      WHERE stage = 'release'
        AND status = 'passed'
        AND "trustLevel" = 'verified_release'
        AND "verificationStatus" = 'verified'
        AND "expiresAt" > NOW()
    `);
  return {
    counters,
    releases,
    runtimeSequences,
    transitions,
    candidates,
    verifiedReleaseReceiptCount: Number(verifiedReceipts[0]?.count ?? 0),
  };
}

async function main() {
  config({ path: resolve(packageRoot, '.env'), quiet: true });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for Ami Brain governance state audit.');
  const expectedProjectRef = argValue('expected-project-ref') ?? process.env.AMI_BRAIN_TARGET_SUPABASE_PROJECT_REF;
  assertApprovedSupabaseTarget(connectionString, expectedProjectRef);
  const client = new Client({ connectionString, application_name: 'ami-brain-governance-state-audit' });
  await client.connect();
  let state;
  try {
    await client.query('BEGIN READ ONLY');
    state = await collectState(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
  const report = buildGovernanceStateAudit({
    ...state,
    target: sanitizeDatabaseTarget(connectionString),
    expectedHeadCommit: argValue('head-commit') ?? null,
  });
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes('--strict') && report.status !== 'ready') process.exitCode = 1;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
