import { BrainGovernancePolicyOrchestratorService } from './brain-governance-policy-orchestrator.service.js';

describe('BrainGovernancePolicyOrchestratorService', () => {
  it('reuses the active governance snapshot when current policy versions have no diff', async () => {
    const candidateUpdate = jest.fn().mockResolvedValue({});
    const prisma = {
      brainGovernanceCandidate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 17,
          candidateKey: 'repo:head:merge',
          headCommit: 'head',
          status: 'governing',
          policySnapshot: null,
          receipts: [{ capabilities: [{ capabilityKey: 'customer_facts' }] }],
        }),
        update: candidateUpdate,
      },
      brainRelease: {
        findFirst: jest.fn().mockResolvedValue({ id: 81, status: 'active', items: [{ resourceKey: 'customer_facts', resourceVersionId: 61, snapshot: {} }] }),
      },
      brainResourceVersion: {
        findMany: jest.fn().mockResolvedValue([{
          id: 61,
          resourceKey: 'customer_facts',
          version: 3,
          snapshot: {
            riskLevel: 'low',
            whitelistStatus: 'approved',
            evidence: [{ receiptId: 'receipt-1', expiresAt: '2099-08-02T00:00:00.000Z' }],
          },
        }]),
      },
    };
    const service = new BrainGovernancePolicyOrchestratorService(prisma as never, {} as never);

    await expect(service.prepare({ candidateKey: 'repo:head:merge', actorId: 9 })).resolves.toMatchObject({
      decision: 'reuse_active',
      diff: { hasDiff: false },
      blockers: [],
    });
    expect(candidateUpdate).toHaveBeenCalledWith({
      where: { id: 17 },
      data: { status: 'ready', policyDecision: 'reuse_active', policySnapshotId: 81 },
    });
  });

  it('blocks policy preparation while an affected capability is still unclassified', async () => {
    const update = jest.fn();
    const prisma = {
      brainGovernanceCandidate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 17,
          candidateKey: 'repo:head:merge',
          headCommit: 'head',
          status: 'governing',
          policySnapshot: null,
          receipts: [{ capabilities: [{ capabilityKey: 'customer_facts' }] }],
        }),
        update,
      },
      brainRelease: { findFirst: jest.fn().mockResolvedValue(null) },
      brainResourceVersion: {
        findMany: jest.fn().mockResolvedValue([{ id: 61, resourceKey: 'customer_facts', version: 1, snapshot: { riskLevel: 'unclassified' } }]),
      },
    };
    const controlPlane = { createPolicySnapshot: jest.fn() };
    const service = new BrainGovernancePolicyOrchestratorService(prisma as never, controlPlane as never);

    await expect(service.prepare({ candidateKey: 'repo:head:merge', actorId: 9 })).resolves.toMatchObject({
      decision: 'blocked',
      blockers: [{ code: 'risk_classification_required', capabilityKey: 'customer_facts' }],
      snapshot: null,
    });
    expect(controlPlane.createPolicySnapshot).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('blocks policy preparation while governance tasks or capability approval are still pending', async () => {
    const prisma = {
      brainGovernanceCandidate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 17,
          candidateKey: 'repo:head:merge',
          headCommit: 'head',
          status: 'governing',
          policySnapshot: null,
          receipts: [{ capabilities: [{ capabilityKey: 'customer_facts' }] }],
          tasks: [{ id: 71, resourceKey: 'customer_facts', status: 'pending_approval', blockerCode: null }],
        }),
      },
      brainRelease: { findFirst: jest.fn().mockResolvedValue(null) },
      brainResourceVersion: {
        findMany: jest.fn().mockResolvedValue([{
          id: 61,
          resourceKey: 'customer_facts',
          version: 2,
          snapshot: {
            riskLevel: 'medium',
            whitelistStatus: 'pending',
            evidence: [{ receiptId: 'receipt-1', expiresAt: '2099-08-02T00:00:00.000Z' }],
          },
        }]),
      },
    };
    const service = new BrainGovernancePolicyOrchestratorService(prisma as never, {} as never);

    await expect(service.preview('repo:head:merge')).resolves.toMatchObject({
      decision: 'blocked',
      blockers: expect.arrayContaining([
        { code: 'capability_approval_required', capabilityKey: 'customer_facts' },
        { code: 'governance_task_pending_approval', capabilityKey: 'customer_facts', taskId: 71 },
      ]),
    });
  });
});
