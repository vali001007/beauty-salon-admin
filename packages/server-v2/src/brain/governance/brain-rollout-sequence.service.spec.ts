import { BrainRolloutSequenceService } from './brain-rollout-sequence.service.js';

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
    const service = new BrainRolloutSequenceService(
      prisma as never,
      releaseService as never,
      { observe: jest.fn().mockResolvedValue({ status: 'ready', blockers: [] }) } as never,
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
  });

  it('rolls back through the guarded sequence transition instead of the legacy release path', async () => {
    const releaseService = {
      rollbackRelease: jest.fn().mockResolvedValue({ id: 82, status: 'active' }),
    };
    const prisma = {
      brainRolloutSequence: { update: jest.fn().mockResolvedValue({}) },
      brainGovernanceCandidate: { update: jest.fn().mockResolvedValue({}) },
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
