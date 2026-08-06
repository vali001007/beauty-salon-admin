import { BrainRolloutSequenceService } from './brain-rollout-sequence.service.js';

const HASH = 'a'.repeat(64);
const HEAD_COMMIT = 'abcdef1234567890abcdef1234567890abcdef12';
const PRERELEASE_GATES = [
  'release_contract',
  'permission_matrix',
  'cross_client_e2e',
  'target_database',
  'provider_fallback',
];

function prereleaseTransition() {
  return {
    candidate: { id: 17, candidateKey: 'repo:head:merge', headCommit: HEAD_COMMIT, sourceFingerprint: HASH },
    newPolicyReleaseId: 81,
    evidenceReceipt: {
      id: 903,
      stage: 'prerelease',
      status: 'passed',
      trustLevel: 'verified_prerelease',
      verificationStatus: 'verified',
      issuerType: 'release_service',
      issuer: 'Ami Brain Release Acceptance',
      expiresAt: new Date('2099-08-05T00:00:00.000Z'),
      candidateId: 17,
      headCommit: HEAD_COMMIT,
      sourceFingerprint: HASH,
      evaluationReleaseId: 901,
      evalRunId: 902,
      releaseFingerprint: HASH,
      suiteChecksum: HASH,
      provider: 'openai_compatible',
      model: 'gpt-5.6-luna',
      gates: PRERELEASE_GATES.map((gateKey) => ({ gateKey, status: 'passed', expiresAt: new Date('2099-08-05T00:00:00.000Z') })),
      result: {
        schemaVersion: 3,
        stage: 'prerelease',
        workflow: 'Ami Brain Release Acceptance',
        candidateKey: 'repo:head:merge',
        headCommit: HEAD_COMMIT,
        sourceFingerprint: HASH,
        verification: {
          status: 'verified',
          trustLevel: 'verified_prerelease',
          admissionEligible: true,
          authentication: 'github_oidc',
          issuer: 'Ami Brain Release Acceptance',
        },
      },
    },
  };
}

function releaseReadiness() {
  return {
    status: 'ready',
    canRelease: true,
    blockers: [],
    contractVersion: 'ami-brain-release-acceptance/v2',
    evaluationReleaseId: 901,
    evalRunId: 902,
    releaseFingerprint: HASH,
    suiteChecksum: HASH,
    provider: 'openai_compatible',
    model: 'gpt-5.6-luna',
    sourceCommit: HEAD_COMMIT,
    expiresAt: '2099-08-05T00:00:00.000Z',
  };
}

describe('BrainRolloutSequenceService', () => {
  it('creates one sequence and binds all five runtime release stages to it', async () => {
    const releaseCreate = jest.fn().mockImplementation(({ releaseKey }) => Promise.resolve({ id: releaseCreate.mock.calls.length + 100, releaseKey }));
    const releaseUpdate = jest.fn().mockResolvedValue({});
    const sequenceCreate = jest.fn().mockResolvedValue({
      id: 51,
      governanceMode: 'shadow',
      policySnapshotId: 81,
      previousRuntimeReleaseId: 82,
      releases: [],
    });
    const prisma = {
      brainGovernanceCandidate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 17,
          candidateKey: 'repo:head:merge',
          headCommit: 'head',
          status: 'ready',
          policySnapshot: { id: 81, scope: 'governance_policy', status: 'active' },
          rolloutSequence: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      brainRelease: {
        findFirst: jest.fn().mockResolvedValue({ id: 82, status: 'active', scope: 'global' }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: releaseUpdate,
      },
      brainRolloutSequence: { create: sequenceCreate },
    };
    const service = new BrainRolloutSequenceService(prisma as never, { createRelease: releaseCreate } as never);
    jest.spyOn(service, 'get').mockResolvedValue({ id: 51 } as never);

    await expect(service.create({
      candidateKey: 'repo:head:merge',
      releaseKey: 'candidate-17',
      resourceVersionIds: [1, 2],
      actorId: 9,
    })).resolves.toEqual({ id: 51 });

    expect(releaseCreate).toHaveBeenCalledTimes(5);
    expect(releaseUpdate).toHaveBeenCalledTimes(5);
    expect(releaseUpdate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ rolloutSequenceId: 51, rolloutStage: 'shadow', previousReleaseId: 82 }),
    }));
    expect(releaseUpdate).toHaveBeenNthCalledWith(5, expect.objectContaining({
      data: expect.objectContaining({ rolloutStage: 'full' }),
    }));
    expect(prisma.brainGovernanceCandidate.update).toHaveBeenCalledWith({
      where: { id: 17 },
      data: { status: 'releasing' },
    });
  });

  it('resumes a partially created sequence instead of returning an unusable rollout', async () => {
    const shadow = {
      id: 101,
      releaseKey: 'candidate-17-shadow',
      scope: 'percentage',
      status: 'draft',
      rollout: { candidateKey: 'repo:head:merge', stage: 'shadow', rolloutSequenceId: 51 },
      rolloutSequenceId: 51,
      rolloutStage: 'shadow',
      items: [{ resourceVersionId: 1 }, { resourceVersionId: 2 }],
    };
    const releaseCreate = jest.fn().mockImplementation(({ releaseKey }) => Promise.resolve({ id: releaseCreate.mock.calls.length + 101, releaseKey }));
    const releaseUpdate = jest.fn().mockResolvedValue({});
    const prisma = {
      brainGovernanceCandidate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 17,
          candidateKey: 'repo:head:merge',
          headCommit: 'head',
          status: 'releasing',
          policySnapshot: { id: 81, scope: 'governance_policy', status: 'active' },
          rolloutSequence: {
            id: 51,
            policySnapshotId: 81,
            governanceMode: 'shadow',
            previousRuntimeReleaseId: 82,
            releases: [shadow],
          },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      brainRelease: {
        findFirst: jest.fn().mockResolvedValue({ id: 82, status: 'active', scope: 'global' }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: releaseUpdate,
      },
      brainRolloutSequence: { create: jest.fn() },
    };
    const service = new BrainRolloutSequenceService(prisma as never, { createRelease: releaseCreate } as never);
    jest.spyOn(service, 'get').mockResolvedValue({ id: 51, releases: [101, 102, 103, 104, 105] } as never);

    await expect(service.create({
      candidateKey: 'repo:head:merge',
      releaseKey: 'candidate-17',
      resourceVersionIds: [1, 2],
      actorId: 9,
    })).resolves.toMatchObject({ id: 51 });

    expect(prisma.brainRolloutSequence.create).not.toHaveBeenCalled();
    expect(releaseCreate).toHaveBeenCalledTimes(4);
    expect(releaseUpdate).toHaveBeenCalledTimes(5);
    expect(releaseUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: 101 },
      data: { rolloutSequenceId: 51, rolloutStage: 'shadow', previousReleaseId: 82 },
    });
    expect(prisma.brainGovernanceCandidate.update).toHaveBeenCalledWith({
      where: { id: 17 },
      data: { status: 'releasing' },
    });
  });

  it('reuses a complete sequence only when release keys, policy, mode and resources still match', async () => {
    const stages = [
      ['shadow', 'shadow'],
      ['canary_5', 'canary-5'],
      ['canary_20', 'canary-20'],
      ['canary_50', 'canary-50'],
      ['full', 'full'],
    ] as const;
    const releases = stages.map(([stage, suffix], index) => ({
      id: 101 + index,
      releaseKey: `candidate-17-${suffix}`,
      scope: 'percentage',
      status: stage === 'full' ? 'active' : 'archived',
      rollout: { candidateKey: 'repo:head:merge', stage, rolloutSequenceId: 51 },
      rolloutSequenceId: 51,
      rolloutStage: stage,
      items: [{ resourceVersionId: 1 }, { resourceVersionId: 2 }],
    }));
    const prisma = {
      brainGovernanceCandidate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 17,
          candidateKey: 'repo:head:merge',
          headCommit: 'head',
          status: 'completed',
          policySnapshotId: 81,
          policySnapshot: { id: 81, scope: 'governance_policy', status: 'archived' },
          rolloutSequence: {
            id: 51,
            policySnapshotId: 81,
            governanceMode: 'shadow',
            releases,
          },
        }),
      },
    };
    const releaseCreate = jest.fn();
    const service = new BrainRolloutSequenceService(prisma as never, { createRelease: releaseCreate } as never);
    jest.spyOn(service, 'get').mockResolvedValue({ id: 51, status: 'completed' } as never);

    await expect(service.create({
      candidateKey: 'repo:head:merge',
      releaseKey: 'candidate-17',
      resourceVersionIds: [2, 1],
      actorId: 9,
    })).resolves.toMatchObject({ id: 51, status: 'completed' });

    await expect(service.create({
      candidateKey: 'repo:head:merge',
      releaseKey: 'candidate-17',
      resourceVersionIds: [1, 3],
      actorId: 9,
    })).rejects.toMatchObject({ message: 'rollout_sequence_release_conflict:shadow' });
    expect(releaseCreate).not.toHaveBeenCalled();
  });

  it('does not create release records before candidate governance is ready', async () => {
    const releaseCreate = jest.fn();
    const prisma = {
      brainGovernanceCandidate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 17,
          candidateKey: 'repo:head:merge',
          headCommit: 'head',
          status: 'governing',
          policySnapshot: { id: 81, scope: 'governance_policy', status: 'active' },
          rolloutSequence: null,
        }),
      },
    };
    const service = new BrainRolloutSequenceService(prisma as never, { createRelease: releaseCreate } as never);

    await expect(service.create({
      candidateKey: 'repo:head:merge',
      releaseKey: 'candidate-17',
      resourceVersionIds: [1, 2],
      actorId: 9,
    })).rejects.toMatchObject({ message: 'candidate_not_ready_for_rollout' });
    expect(releaseCreate).not.toHaveBeenCalled();
  });

  it('prepares RT-001 for a governing candidate without moving it to releasing', async () => {
    const releaseCreate = jest.fn().mockImplementation(({ releaseKey }) => Promise.resolve({
      id: releaseCreate.mock.calls.length + 100,
      releaseKey,
    }));
    const sequence = {
      id: 51,
      governanceMode: 'enforced',
      policySnapshotId: 81,
      previousRuntimeReleaseId: 82,
      runtimeVersionCode: null,
      productProfile: null,
      releases: [],
    };
    const identifiedSequence = {
      ...sequence,
      runtimeVersionCode: 'RT-001',
      runtimeVersionNumber: 1,
      displayName: 'Query Only V1',
      productProfile: 'query_only_v1',
    };
    const candidateUpdate = jest.fn().mockResolvedValue({});
    const prisma = {
      brainGovernanceCandidate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 17,
          candidateKey: 'repo:head:merge',
          headCommit: 'head',
          status: 'governing',
          policySnapshot: { id: 81, scope: 'governance_policy', status: 'draft' },
          rolloutSequence: null,
        }),
        update: candidateUpdate,
      },
      brainRelease: {
        findFirst: jest.fn().mockResolvedValue({ id: 82, status: 'active', scope: 'global' }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      brainRolloutSequence: { create: jest.fn().mockResolvedValue(sequence) },
    };
    const releaseIdentity = {
      assignRuntimeIdentity: jest.fn().mockResolvedValue(identifiedSequence),
    };
    const events = { record: jest.fn().mockResolvedValue({}) };
    const service = new BrainRolloutSequenceService(
      prisma as never,
      { createRelease: releaseCreate } as never,
      undefined,
      events as never,
      releaseIdentity as never,
    );
    jest.spyOn(service, 'get').mockResolvedValue({ id: 51, runtimeVersionCode: 'RT-001' } as never);

    await expect(service.create({
      candidateKey: 'repo:head:merge',
      releaseKey: 'ami-brain-runtime-query-only-v1-head',
      resourceVersionIds: [1, 2],
      governanceMode: 'enforced',
      displayName: 'Query Only V1',
      productProfile: 'query_only_v1',
      evaluationEvidenceReleaseId: 901,
      evaluationEvidenceEvalRunId: 902,
      evaluationEvidenceReceiptId: 903,
      allowDraftPolicy: true,
      expectedRuntimeVersionCode: 'RT-001',
      transitionPreparation: true,
      actorId: 9,
    })).resolves.toMatchObject({ id: 51, runtimeVersionCode: 'RT-001' });

    expect(releaseIdentity.assignRuntimeIdentity).toHaveBeenCalledWith(
      51,
      'Query Only V1',
      'query_only_v1',
      'RT-001',
    );
    expect(releaseCreate).toHaveBeenCalledTimes(5);
    expect(candidateUpdate).not.toHaveBeenCalled();
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ transitionPreparation: true }),
    }));
  });

  it('blocks promotion when health evidence exceeds the configured threshold', async () => {
    const service = new BrainRolloutSequenceService(
      {} as never,
      {} as never,
      { observe: jest.fn().mockResolvedValue({ status: 'blocked', blockers: ['rollout_health_threshold_exceeded:errorRate'] }) } as never,
    );
    jest.spyOn(service, 'get').mockResolvedValue({
      id: 51,
      status: 'active',
      currentStage: 'shadow',
      promotionPolicy: { observationMinutes: 30, minimumSampleSize: 20 },
      healthThresholds: { maxErrorRate: 0.02, maxTimeoutRate: 0.01, maxPermissionViolationCount: 0 },
      releases: [{ id: 101, rolloutStage: 'shadow', status: 'active', activatedAt: new Date() }],
    } as never);
    jest.spyOn(service as any, 'validateTransitionEvidence').mockResolvedValue([]);

    await expect(service.promote(51, { actorId: 9 }))
      .rejects.toMatchObject({ message: 'rollout_health_not_ready:rollout_health_threshold_exceeded:errorRate' });
  });

  it('promotes only to the immediate next stage through the guarded sequence transition', async () => {
    const releaseService = {
      getReleaseReadiness: jest.fn().mockResolvedValue({ canRelease: true, blockers: [] }),
      activateRelease: jest.fn().mockResolvedValue({ id: 103, status: 'active' }),
    };
    const prisma = {
      brainRolloutSequence: { update: jest.fn().mockResolvedValue({}) },
      brainGovernanceCandidate: { update: jest.fn() },
    };
    const events = { record: jest.fn().mockResolvedValue({}) };
    const service = new BrainRolloutSequenceService(
      prisma as never,
      releaseService as never,
      { observe: jest.fn().mockResolvedValue({ status: 'ready', blockers: [] }) } as never,
      events as never,
    );
    jest.spyOn(service, 'get')
      .mockResolvedValueOnce({
        id: 51,
        candidateId: 17,
        status: 'active',
        currentStage: 'canary_5',
        promotionPolicy: { observationMinutes: 30, minimumSampleSize: 20 },
        healthThresholds: { maxErrorRate: 0.02, maxTimeoutRate: 0.01, maxPermissionViolationCount: 0 },
        releases: [
          { id: 102, rolloutStage: 'canary_5', status: 'active', activatedAt: new Date() },
          { id: 103, rolloutStage: 'canary_20', status: 'draft', activatedAt: null },
          { id: 104, rolloutStage: 'canary_50', status: 'draft', activatedAt: null },
        ],
      } as never)
      .mockResolvedValueOnce({ id: 51, currentStage: 'canary_20' } as never);
    jest.spyOn(service as any, 'validateTransitionEvidence').mockResolvedValue([]);

    await expect(service.promote(51, { actorId: 9 })).resolves.toMatchObject({
      sequence: { id: 51, currentStage: 'canary_20' },
      release: { id: 103 },
    });
    expect(releaseService.activateRelease).toHaveBeenCalledWith({
      releaseId: 103,
      activatedBy: 9,
      rolloutTransition: { sequenceId: 51, fromStage: 'canary_5', toStage: 'canary_20' },
    });
    expect(releaseService.activateRelease).not.toHaveBeenCalledWith(expect.objectContaining({ releaseId: 104 }));
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'runtime_promoted',
      candidateId: 17,
      entityType: 'rollout_sequence',
      entityId: 51,
      payload: expect.objectContaining({
        fromStage: 'canary_5',
        toStage: 'canary_20',
        releaseId: 103,
        completed: false,
      }),
    }));
  });

  it('allows a protected prerelease receipt to promote Shadow to C05 for the rollback drill', async () => {
    const releaseService = {
      getReleaseReadiness: jest.fn().mockResolvedValue(releaseReadiness()),
      activateRelease: jest.fn().mockResolvedValue({ id: 102, status: 'active' }),
    };
    const prisma = {
      brainGovernanceTransition: { findFirst: jest.fn().mockResolvedValue(prereleaseTransition()) },
      brainRolloutSequence: { update: jest.fn().mockResolvedValue({}) },
      brainGovernanceCandidate: { update: jest.fn() },
    };
    const events = { record: jest.fn().mockResolvedValue({}) };
    const service = new BrainRolloutSequenceService(
      prisma as never,
      releaseService as never,
      { observe: jest.fn().mockResolvedValue({ status: 'ready', blockers: [] }) } as never,
      events as never,
    );
    jest.spyOn(service, 'get')
      .mockResolvedValueOnce({
        id: 51,
        candidateId: 17,
        status: 'active',
        currentStage: 'shadow',
        policySnapshot: { id: 81, status: 'active' },
        promotionPolicy: { observationMinutes: 30, minimumSampleSize: 20 },
        healthThresholds: {},
        releases: [
          {
            id: 101,
            rolloutStage: 'shadow',
            status: 'active',
            activatedAt: new Date(),
            rollout: { evaluationEvidenceReceiptId: 903, evaluationEvidenceReleaseId: 901, evaluationEvidenceEvalRunId: 902 },
          },
          { id: 102, rolloutStage: 'canary_5', status: 'draft', rollout: {} },
        ],
      } as never)
      .mockResolvedValueOnce({ id: 51, currentStage: 'canary_5', admissionPhase: 'prerelease' } as never);

    await expect(service.promote(51, { actorId: 9 })).resolves.toMatchObject({
      sequence: { id: 51, currentStage: 'canary_5' },
      release: { id: 102 },
    });
    expect(releaseService.activateRelease).toHaveBeenCalledWith({
      releaseId: 102,
      activatedBy: 9,
      rolloutTransition: { sequenceId: 51, fromStage: 'shadow', toStage: 'canary_5' },
    });
  });

  it('pauses at C05 and blocks C20 promotion while only prerelease evidence is bound', async () => {
    const prisma = {
      brainGovernanceTransition: { findFirst: jest.fn().mockResolvedValue(prereleaseTransition()) },
      brainRolloutSequence: { update: jest.fn().mockResolvedValue({}) },
      brainGovernanceCandidate: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const releaseService = { activateRelease: jest.fn(), getReleaseReadiness: jest.fn().mockResolvedValue(releaseReadiness()) };
    const service = new BrainRolloutSequenceService(prisma as never, releaseService as never);
    jest.spyOn(service, 'get').mockResolvedValue({
      id: 51,
      candidateId: 17,
      status: 'active',
      currentStage: 'canary_5',
      policySnapshot: { id: 81, status: 'active' },
      releases: [{
        id: 102,
        rolloutStage: 'canary_5',
        status: 'active',
        activatedAt: new Date(),
        rollout: { evaluationEvidenceReceiptId: 903, evaluationEvidenceReleaseId: 901, evaluationEvidenceEvalRunId: 902 },
      }],
    } as never);

    await expect(service.promote(51, { actorId: 9 })).rejects.toMatchObject({
      message: 'rollout_evidence_not_ready:rollout_transition_evidence_identity_invalid',
    });
    expect(prisma.brainRolloutSequence.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'paused' }),
    }));
    expect(releaseService.activateRelease).not.toHaveBeenCalled();
  });

  it('pauses rollout and blocks promotion when frozen release evidence expires or drifts', async () => {
    const prisma = {
      brainRolloutSequence: { update: jest.fn().mockResolvedValue({}) },
      brainGovernanceCandidate: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const events = { record: jest.fn().mockResolvedValue({}) };
    const service = new BrainRolloutSequenceService(prisma as never, {} as never, undefined, events as never);
    jest.spyOn(service, 'get').mockResolvedValue({
      id: 51,
      candidateId: 17,
      status: 'active',
      currentStage: 'shadow',
      releases: [{ id: 101, rolloutStage: 'shadow', status: 'active', rollout: {} }],
    } as never);
    jest.spyOn(service as any, 'validateTransitionEvidence')
      .mockResolvedValue(['rollout_evaluation_readiness_invalid']);

    await expect(service.promote(51, { actorId: 9 })).rejects.toMatchObject({
      message: 'rollout_evidence_not_ready:rollout_evaluation_readiness_invalid',
    });
    expect(prisma.brainRolloutSequence.update).toHaveBeenCalledWith({
      where: { id: 51 },
      data: {
        status: 'paused',
        pauseReason: 'evidence_drift:rollout_evaluation_readiness_invalid',
        approvedBy: 9,
      },
    });
    expect(prisma.brainGovernanceCandidate.update).toHaveBeenCalledWith({
      where: { id: 17 },
      data: { status: 'blocked' },
    });
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'rollout_evidence_drift_paused',
    }));
  });

  it('rolls back through the guarded sequence transition instead of the legacy release path', async () => {
    const releaseService = {
      rollbackRelease: jest.fn().mockResolvedValue({ id: 82, status: 'active' }),
    };
    const prisma = {
      brainRolloutSequence: { update: jest.fn().mockResolvedValue({}) },
      brainGovernanceCandidate: { update: jest.fn().mockResolvedValue({}) },
      brainRelease: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const service = new BrainRolloutSequenceService(prisma as never, releaseService as never);
    jest.spyOn(service, 'get')
      .mockResolvedValueOnce({
        id: 51,
        candidateId: 17,
        status: 'active',
        currentStage: 'canary_20',
        previousRuntimeReleaseId: 82,
        releases: [{ id: 103, rolloutStage: 'canary_20', status: 'active' }],
      } as never)
      .mockResolvedValueOnce({ id: 51, status: 'rolled_back', currentStage: 'canary_20' } as never);

    await expect(service.rollback(51, 'error rate increased', 9)).resolves.toMatchObject({
      sequence: { id: 51, status: 'rolled_back', currentStage: 'canary_20' },
      release: { id: 82 },
    });
    expect(releaseService.rollbackRelease).toHaveBeenCalledWith({
      releaseId: 103,
      reason: 'error rate increased',
      rolloutTransition: { sequenceId: 51, fromStage: 'canary_20', targetReleaseId: 82 },
    });
    expect(prisma.brainRelease.updateMany).toHaveBeenCalledWith({
      where: { rolloutSequenceId: 51, status: 'active' },
      data: { status: 'rolled_back', rolledBackAt: expect.any(Date), failureReason: 'error rate increased' },
    });
    expect(prisma.brainGovernanceCandidate.update).toHaveBeenCalledWith({
      where: { id: 17 },
      data: { status: 'blocked', completedAt: expect.any(Date) },
    });
  });

  it('resumes a paused active sequence and restores the candidate observation state', async () => {
    const prisma = {
      brainRolloutSequence: { update: jest.fn().mockResolvedValue({ id: 51, status: 'active' }) },
      brainGovernanceCandidate: { update: jest.fn().mockResolvedValue({}) },
    };
    const service = new BrainRolloutSequenceService(prisma as never, {} as never);
    jest.spyOn(service, 'get').mockResolvedValue({
      id: 51,
      candidateId: 17,
      status: 'paused',
      currentStage: 'canary_20',
      releases: [{ id: 103, rolloutStage: 'canary_20', status: 'active' }],
    } as never);

    await expect(service.resume(51, 9)).resolves.toMatchObject({ id: 51, status: 'active' });
    expect(prisma.brainRolloutSequence.update).toHaveBeenCalledWith({
      where: { id: 51 },
      data: { status: 'active', pauseReason: null, approvedBy: 9 },
    });
    expect(prisma.brainGovernanceCandidate.update).toHaveBeenCalledWith({
      where: { id: 17 },
      data: { status: 'observing' },
    });
  });
});
