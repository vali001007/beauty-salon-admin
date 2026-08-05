export const BRAIN_GOVERNANCE_TARGET_POLICY_CODE = 'GP-003';
export const BRAIN_GOVERNANCE_TARGET_POLICY_NAME = 'Query Only V1 强制治理策略';
export const BRAIN_GOVERNANCE_TARGET_RUNTIME_CODE = 'RT-001';
export const BRAIN_GOVERNANCE_TARGET_RUNTIME_NAME = 'Query Only V1';
export const BRAIN_GOVERNANCE_TARGET_PRODUCT_PROFILE = 'query_only_v1';

export interface BrainGovernanceTransitionTargetInspectionInput {
  candidateId: number;
  headCommit: string;
  policyCounterNumber: number | null;
  runtimeCounterNumber: number | null;
  policy: {
    id: number;
    releaseKey: string;
    scope: string;
    releaseFamily: string;
    displayCode: string | null;
    displayName: string | null;
  } | null;
  runtime: {
    id: number;
    candidateId: number;
    runtimeVersionCode: string | null;
    displayName: string | null;
    productProfile: string | null;
  } | null;
}

export function inspectBrainGovernanceTransitionTargets(input: BrainGovernanceTransitionTargetInspectionInput) {
  const policyReleaseKey = brainGovernanceTargetPolicyReleaseKey(input.headCommit);
  const runtimeReleaseKey = brainGovernanceTargetRuntimeReleaseKey(input.headCommit);
  const blockers: string[] = [];

  const policyReusable = Boolean(
    input.policy
    && input.policy.scope === 'governance_policy'
    && input.policy.releaseFamily === 'policy'
    && input.policy.displayCode === BRAIN_GOVERNANCE_TARGET_POLICY_CODE
    && input.policy.displayName === BRAIN_GOVERNANCE_TARGET_POLICY_NAME
    && input.policy.releaseKey === policyReleaseKey,
  );
  if (input.policy && !policyReusable) {
    blockers.push(`target_policy_identity_conflict:${BRAIN_GOVERNANCE_TARGET_POLICY_CODE}:release_${input.policy.id}`);
  }
  if (input.policyCounterNumber !== (policyReusable ? 3 : 2)) {
    blockers.push(`target_policy_counter_conflict:${BRAIN_GOVERNANCE_TARGET_POLICY_CODE}:last_${input.policyCounterNumber ?? 0}`);
  }

  const runtimeReusable = Boolean(
    input.runtime
    && input.runtime.candidateId === input.candidateId
    && input.runtime.runtimeVersionCode === BRAIN_GOVERNANCE_TARGET_RUNTIME_CODE
    && input.runtime.displayName === BRAIN_GOVERNANCE_TARGET_RUNTIME_NAME
    && input.runtime.productProfile === BRAIN_GOVERNANCE_TARGET_PRODUCT_PROFILE,
  );
  if (input.runtime && !runtimeReusable) {
    blockers.push(`target_runtime_identity_conflict:${BRAIN_GOVERNANCE_TARGET_RUNTIME_CODE}:sequence_${input.runtime.id}`);
  }
  if (input.runtimeCounterNumber !== (runtimeReusable ? 1 : 0)) {
    blockers.push(`target_runtime_counter_conflict:${BRAIN_GOVERNANCE_TARGET_RUNTIME_CODE}:last_${input.runtimeCounterNumber ?? 0}`);
  }

  return {
    policy: {
      code: BRAIN_GOVERNANCE_TARGET_POLICY_CODE,
      name: BRAIN_GOVERNANCE_TARGET_POLICY_NAME,
      releaseKey: policyReleaseKey,
      status: policyReusable ? 'reusable' as const : input.policy ? 'conflict' as const : 'available' as const,
      internalReleaseId: input.policy?.id ?? null,
      counterNumber: input.policyCounterNumber ?? 0,
    },
    runtime: {
      code: BRAIN_GOVERNANCE_TARGET_RUNTIME_CODE,
      name: BRAIN_GOVERNANCE_TARGET_RUNTIME_NAME,
      releaseKey: runtimeReleaseKey,
      status: runtimeReusable ? 'reusable' as const : input.runtime ? 'conflict' as const : 'available' as const,
      internalSequenceId: input.runtime?.id ?? null,
      counterNumber: input.runtimeCounterNumber ?? 0,
    },
    blockers: [...new Set(blockers)],
  };
}

export function brainGovernanceTargetPolicyReleaseKey(headCommit: string) {
  return `ami-brain-policy-query-only-v1-${headCommit.slice(0, 12)}`;
}

export function brainGovernanceTargetRuntimeReleaseKey(headCommit: string) {
  return `ami-brain-runtime-query-only-v1-${headCommit.slice(0, 12)}`;
}
