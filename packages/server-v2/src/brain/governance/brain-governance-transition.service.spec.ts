import { BrainGovernanceTransitionService } from './brain-governance-transition.service.js';

function transition(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    transitionKey: 'transition-key',
    status: 'approved',
    candidateId: 3,
    oldPolicyReleaseId: 436,
    newPolicyReleaseId: 453,
    oldRuntimeReleaseId: 452,
    runtimeSequenceId: 9,
    policyApprovedAt: new Date(),
    runtimeApprovedAt: new Date(),
    startedAt: null,
    oldPolicy: { id: 436, status: 'active', items: [] },
    newPolicy: { id: 453, status: 'draft', items: [], productIdentity: { code: 'GP-003' } },
    oldRuntime: { id: 452, status: 'active' },
    runtimeSequence: {
      id: 9,
      runtimeVersionCode: 'RT-001',
      productProfile: 'query_only_v1',
      status: 'draft',
      currentStage: 'shadow',
      releases: [{ id: 454, rolloutStage: 'shadow', status: 'draft' }],
    },
    ...overrides,
  };
}

function transactionMock() {
  return jest.fn(async (work: Array<Promise<unknown>> | ((tx: { $queryRaw: jest.Mock }) => Promise<unknown>)) => {
    if (typeof work === 'function') return work({ $queryRaw: jest.fn().mockResolvedValue([]) });
    return Promise.all(work);
  });
}

describe('BrainGovernanceTransitionService', () => {
  it('keeps preparation blocked until every query-only capability has trusted evidence', async () => {
    const prisma = {
      brainGovernanceCandidate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 3,
          candidateKey: 'candidate-1',
          headCommit: 'abcdef123456',
          status: 'checking',
          receipts: [],
        }),
      },
      brainRelease: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: 436, scope: 'governance_policy', status: 'active' })
          .mockResolvedValueOnce({ id: 452, scope: 'percentage', status: 'active' }),
      },
      brainGovernanceTransition: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.preview('candidate-1');
    expect(result.canPrepare).toBe(false);
    expect(result.missingEvidence).toHaveLength(41);
    expect(result.target).toMatchObject({ productProfile: 'query_only_v1', allowedCapabilityCount: 33, deniedCapabilityCount: 8 });
  });

  it('switches policy and runtime together before marking the transition observing', async () => {
    const row = transition();
    const prisma = {
      brainGovernanceTransition: {
        update: jest.fn().mockResolvedValue({}),
      },
      brainRelease: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ id: 453, status: 'active' }),
        findFirst: jest.fn().mockResolvedValue({ id: 436, status: 'active' }),
      },
      $transaction: transactionMock(),
    };
    const controlPlane = {
      publishPolicySnapshot: jest.fn().mockResolvedValue({ id: 453, status: 'active' }),
      rollbackPolicySnapshot: jest.fn(),
    };
    const releaseService = {
      resolveRuntimeDeploymentIdentity: jest.fn().mockResolvedValue({
        release: { id: 454 },
        productIdentity: { code: 'RT-001' },
        governancePolicyIdentity: { internalReleaseId: 453 },
        productProfile: { productProfile: 'query_only_v1' },
      }),
    };
    const rollout = { activateShadow: jest.fn().mockResolvedValue({}), rollback: jest.fn() };
    const events = { record: jest.fn().mockResolvedValue({}) };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      controlPlane as never,
      releaseService as never,
      rollout as never,
      events as never,
    );
    jest.spyOn(service, 'get')
      .mockResolvedValueOnce(row as never)
      .mockResolvedValueOnce({
        ...row,
        runtimeSequence: { ...row.runtimeSequence, releases: [{ id: 454, rolloutStage: 'shadow', status: 'active' }] },
      } as never)
      .mockResolvedValueOnce({ ...row, status: 'observing' } as never);

    await expect(service.switch({ id: 7, actorId: 5, storeId: 1, userId: 5, roleKey: 'manager' }))
      .resolves.toMatchObject({ status: 'observing' });
    expect(controlPlane.publishPolicySnapshot).toHaveBeenCalledWith(453, 5);
    expect(rollout.activateShadow).toHaveBeenCalledWith(9, 5);
    expect(releaseService.resolveRuntimeDeploymentIdentity).toHaveBeenCalledWith({ storeId: 1, userId: 5, roleKey: 'manager' });
    expect(prisma.brainRelease.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 436 },
      data: expect.objectContaining({ supersededByReleaseId: 453 }),
    }));
  });

  it('restores the previous policy when runtime activation fails', async () => {
    const row = transition();
    const prisma = {
      brainGovernanceTransition: { update: jest.fn().mockResolvedValue({}) },
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({ id: 453, status: 'active' }),
        findFirst: jest.fn().mockResolvedValue({ id: 436, status: 'active' }),
      },
      $transaction: transactionMock(),
    };
    const controlPlane = {
      publishPolicySnapshot: jest.fn().mockResolvedValue({ id: 453, status: 'active' }),
      rollbackPolicySnapshot: jest.fn().mockResolvedValue({ id: 436, status: 'active' }),
    };
    const rollout = {
      activateShadow: jest.fn().mockRejectedValue(new Error('runtime_activation_failed')),
      rollback: jest.fn(),
    };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      controlPlane as never,
      {} as never,
      rollout as never,
    );
    jest.spyOn(service, 'get').mockResolvedValue(row as never);

    await expect(service.switch({ id: 7, actorId: 5, storeId: 1, userId: 5, roleKey: 'manager' }))
      .rejects.toThrow('runtime_activation_failed');
    expect(controlPlane.rollbackPolicySnapshot).toHaveBeenCalledWith(453, 'governance_transition_compensation', 5);
    expect(prisma.brainGovernanceTransition.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'rolled_back', currentStep: 'compensation_completed' }),
    }));
  });

  it('reuses an existing open transition without creating duplicate GP or RT drafts', async () => {
    const existing = transition({ status: 'draft' });
    const service = new BrainGovernanceTransitionService(
      {} as never,
      { createQueryOnlyPolicyVersions: jest.fn(), createPolicySnapshot: jest.fn() } as never,
      {} as never,
      { create: jest.fn() } as never,
    );
    jest.spyOn(service, 'preview').mockResolvedValue({ existingTransition: existing, canPrepare: false } as never);

    await expect(service.prepare({ candidateKey: 'candidate-1', actorId: 5 })).resolves.toBe(existing);
  });

  it('marks the transition approved regardless of which approval arrives last and emits one audit event', async () => {
    const prisma = {
      brainGovernanceTransition: {
        findUniqueOrThrow: jest.fn()
          .mockResolvedValueOnce({ id: 7, status: 'validated', policyApprovedAt: null, runtimeApprovedAt: new Date('2026-08-04T00:00:00.000Z') })
          .mockResolvedValueOnce({ id: 7, status: 'validated', policyApprovedAt: new Date('2026-08-04T00:01:00.000Z'), runtimeApprovedAt: new Date('2026-08-04T00:00:00.000Z'), policyApprovedBy: 5 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 7, ...data })),
      },
    };
    const events = { record: jest.fn().mockResolvedValue({}) };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      events as never,
    );
    jest.spyOn(service, 'validate').mockResolvedValue({ transitionId: 7, valid: true, blockers: [], readiness: null } as never);

    await expect(service.approvePolicy(7, 5)).resolves.toMatchObject({ status: 'approved' });
    expect(prisma.brainGovernanceTransition.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ policyApprovedBy: 5 }),
    }));
    expect(events.record).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'policy_approved' }));
  });

  it('returns an existing approval without validating, rewriting, or duplicating its audit event', async () => {
    const approved = { id: 7, status: 'validated', policyApprovedAt: new Date(), runtimeApprovedAt: null };
    const prisma = {
      brainGovernanceTransition: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(approved),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const events = { record: jest.fn() };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      events as never,
    );
    const validate = jest.spyOn(service, 'validate');

    await expect(service.approvePolicy(7, 5)).resolves.toBe(approved);
    expect(validate).not.toHaveBeenCalled();
    expect(prisma.brainGovernanceTransition.updateMany).not.toHaveBeenCalled();
    expect(events.record).not.toHaveBeenCalled();
  });

  it('resumes an interrupted switching transition without publishing or activating twice', async () => {
    const row = transition({
      status: 'switching',
      newPolicy: { id: 453, status: 'active', items: [], productIdentity: { code: 'GP-003' } },
      runtimeSequence: {
        id: 9,
        runtimeVersionCode: 'RT-001',
        productProfile: 'query_only_v1',
        status: 'active',
        currentStage: 'shadow',
        releases: [{ id: 454, rolloutStage: 'shadow', status: 'active' }],
      },
    });
    const prisma = {
      brainGovernanceTransition: { update: jest.fn().mockResolvedValue({}) },
      brainRelease: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ id: 453, status: 'active' }),
      },
      $transaction: transactionMock(),
    };
    const controlPlane = { publishPolicySnapshot: jest.fn(), rollbackPolicySnapshot: jest.fn() };
    const rollout = { activateShadow: jest.fn(), rollback: jest.fn() };
    const releaseService = {
      resolveRuntimeDeploymentIdentity: jest.fn().mockResolvedValue({
        release: { id: 454 },
        productIdentity: { code: 'RT-001' },
        governancePolicyIdentity: { internalReleaseId: 453 },
        productProfile: { productProfile: 'query_only_v1' },
      }),
    };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      controlPlane as never,
      releaseService as never,
      rollout as never,
    );
    jest.spyOn(service, 'get')
      .mockResolvedValueOnce(row as never)
      .mockResolvedValueOnce(row as never)
      .mockResolvedValueOnce({ ...row, status: 'observing' } as never);

    await expect(service.switch({ id: 7, actorId: 5, storeId: 1, userId: 5, roleKey: 'manager' }))
      .resolves.toMatchObject({ status: 'observing' });
    expect(controlPlane.publishPolicySnapshot).not.toHaveBeenCalled();
    expect(rollout.activateShadow).not.toHaveBeenCalled();
  });

  it('returns an already rolled-back transition without repeating rollback side effects', async () => {
    const row = transition({ status: 'rolled_back' });
    const prisma = {
      brainGovernanceTransition: { update: jest.fn() },
      brainRelease: { findUnique: jest.fn() },
      $transaction: transactionMock(),
    };
    const controlPlane = { rollbackPolicySnapshot: jest.fn() };
    const rollout = { rollback: jest.fn() };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      controlPlane as never,
      {} as never,
      rollout as never,
    );
    jest.spyOn(service, 'get').mockResolvedValue(row as never);

    await expect(service.rollback(7, 'repeat request', 5)).resolves.toBe(row);
    expect(prisma.brainGovernanceTransition.update).not.toHaveBeenCalled();
    expect(controlPlane.rollbackPolicySnapshot).not.toHaveBeenCalled();
    expect(rollout.rollback).not.toHaveBeenCalled();
  });

  it('clears retirement and superseded markers when restoring the old GP and RT combination', async () => {
    const row = transition({
      status: 'observing',
      runtimeSequence: {
        id: 9,
        runtimeVersionCode: 'RT-001',
        productProfile: 'query_only_v1',
        status: 'active',
        currentStage: 'shadow',
        releases: [{ id: 454, rolloutStage: 'shadow', status: 'active' }],
      },
    });
    const prisma = {
      brainGovernanceTransition: { update: jest.fn().mockResolvedValue({}) },
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({ id: 453, status: 'active' }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: transactionMock(),
    };
    const controlPlane = { rollbackPolicySnapshot: jest.fn().mockResolvedValue({ id: 436, status: 'active' }) };
    const rollout = { rollback: jest.fn().mockResolvedValue({}) };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      controlPlane as never,
      {} as never,
      rollout as never,
    );
    jest.spyOn(service, 'get')
      .mockResolvedValueOnce(row as never)
      .mockResolvedValueOnce({ ...row, status: 'rolled_back' } as never);

    await expect(service.rollback(7, 'rollback drill', 5)).resolves.toMatchObject({ status: 'rolled_back' });
    expect(prisma.brainRelease.update).toHaveBeenCalledWith({
      where: { id: 436 },
      data: { retiredAt: null, retirementReason: null, supersededAt: null, supersededByReleaseId: null },
    });
    expect(prisma.brainRelease.update).toHaveBeenCalledWith({
      where: { id: 452 },
      data: { supersededAt: null, supersededByReleaseId: null },
    });
  });

  it('finalizes only after RT Full and archives the old runtime without deleting history', async () => {
    const row = transition({
      status: 'observing',
      runtimeSequence: {
        id: 9,
        status: 'completed',
        currentStage: 'full',
        releases: [{ id: 458, rolloutStage: 'full', status: 'active' }],
      },
    });
    const prisma = {
      brainRelease: { update: jest.fn().mockResolvedValue({}) },
      brainGovernanceTransition: { update: jest.fn().mockResolvedValue({}) },
      $transaction: transactionMock(),
    };
    const events = { record: jest.fn().mockResolvedValue({}) };
    const service = new BrainGovernanceTransitionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      events as never,
    );
    jest.spyOn(service, 'get')
      .mockResolvedValueOnce(row as never)
      .mockResolvedValueOnce({ ...row, status: 'completed' } as never);

    await expect(service.finalize(7, 5)).resolves.toMatchObject({ status: 'completed' });
    expect(prisma.brainRelease.update).toHaveBeenCalledWith({
      where: { id: 452 },
      data: expect.objectContaining({ status: 'archived', supersededByReleaseId: 458 }),
    });
    expect(prisma).not.toHaveProperty('brainRelease.delete');
  });
});
