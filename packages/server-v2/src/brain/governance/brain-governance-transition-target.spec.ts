import {
  BRAIN_GOVERNANCE_TARGET_POLICY_CODE,
  BRAIN_GOVERNANCE_TARGET_RUNTIME_CODE,
  brainGovernanceTargetPolicyReleaseKey,
  brainGovernanceTargetRuntimeReleaseKey,
  inspectBrainGovernanceTransitionTargets,
} from './brain-governance-transition-target.js';

const HEAD_COMMIT = 'abcdef1234567890abcdef1234567890abcdef12';

describe('Brain governance transition target identity', () => {
  it('offers only GP-003 and RT-001 when their counters are immediately available', () => {
    const inspected = inspectBrainGovernanceTransitionTargets({
      candidateId: 17,
      headCommit: HEAD_COMMIT,
      policyCounterNumber: 2,
      runtimeCounterNumber: 0,
      policy: null,
      runtime: null,
    });

    expect(inspected).toEqual({
      policy: {
        code: BRAIN_GOVERNANCE_TARGET_POLICY_CODE,
        name: 'Query Only V1 强制治理策略',
        releaseKey: brainGovernanceTargetPolicyReleaseKey(HEAD_COMMIT),
        status: 'available',
        internalReleaseId: null,
        counterNumber: 2,
      },
      runtime: {
        code: BRAIN_GOVERNANCE_TARGET_RUNTIME_CODE,
        name: 'Query Only V1',
        releaseKey: brainGovernanceTargetRuntimeReleaseKey(HEAD_COMMIT),
        status: 'available',
        internalSequenceId: null,
        counterNumber: 0,
      },
      blockers: [],
    });
  });

  it('reuses exact GP-003 and RT-001 drafts owned by the same candidate', () => {
    const inspected = inspectBrainGovernanceTransitionTargets({
      candidateId: 17,
      headCommit: HEAD_COMMIT,
      policyCounterNumber: 3,
      runtimeCounterNumber: 1,
      policy: {
        id: 453,
        releaseKey: brainGovernanceTargetPolicyReleaseKey(HEAD_COMMIT),
        scope: 'governance_policy',
        releaseFamily: 'policy',
        displayCode: 'GP-003',
        displayName: 'Query Only V1 强制治理策略',
      },
      runtime: {
        id: 9,
        candidateId: 17,
        runtimeVersionCode: 'RT-001',
        displayName: 'Query Only V1',
        productProfile: 'query_only_v1',
      },
    });

    expect(inspected.blockers).toEqual([]);
    expect(inspected.policy).toMatchObject({ status: 'reusable', internalReleaseId: 453 });
    expect(inspected.runtime).toMatchObject({ status: 'reusable', internalSequenceId: 9 });
  });

  it('blocks occupied codes and counter drift instead of silently allocating another GP or RT', () => {
    const inspected = inspectBrainGovernanceTransitionTargets({
      candidateId: 17,
      headCommit: HEAD_COMMIT,
      policyCounterNumber: 3,
      runtimeCounterNumber: 1,
      policy: {
        id: 499,
        releaseKey: 'another-policy',
        scope: 'governance_policy',
        releaseFamily: 'policy',
        displayCode: 'GP-003',
        displayName: 'Another Policy',
      },
      runtime: {
        id: 29,
        candidateId: 99,
        runtimeVersionCode: 'RT-001',
        displayName: 'Another Runtime',
        productProfile: 'query_only_v1',
      },
    });

    expect(inspected.policy.status).toBe('conflict');
    expect(inspected.runtime.status).toBe('conflict');
    expect(inspected.blockers).toEqual([
      'target_policy_identity_conflict:GP-003:release_499',
      'target_policy_counter_conflict:GP-003:last_3',
      'target_runtime_identity_conflict:RT-001:sequence_29',
      'target_runtime_counter_conflict:RT-001:last_1',
    ]);
  });
});
