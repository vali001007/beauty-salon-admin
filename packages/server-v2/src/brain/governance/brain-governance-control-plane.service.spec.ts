import { BadRequestException } from '@nestjs/common';
import { BrainGovernanceControlPlaneService } from './brain-governance-control-plane.service.js';

const HASH = 'a'.repeat(64);

function policyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 11,
    resourceType: 'capability_policy',
    resourceKey: 'customer_facts',
    version: 1,
    status: 'draft',
    checksum: HASH,
    createdBy: 9,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    activatedAt: null,
    archivedAt: null,
    snapshot: {
      schemaVersion: 1,
      capabilityKey: 'customer_facts',
      riskLevel: 'unclassified',
      mode: 'alert',
      whitelistStatus: 'not_allowed',
      runtimeEnforcementStatus: 'pending_runtime',
      permissions: [],
      owners: {},
      evidence: [],
      impact: {},
      reason: 'initial',
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

describe('BrainGovernanceControlPlaneService', () => {
  it('reports aligned only when the active runtime release binds the active policy snapshot', async () => {
    const service = new BrainGovernanceControlPlaneService({
      brainGovernanceTask: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      brainResourceVersion: {
        findMany: jest.fn().mockResolvedValue([
          policyRow({ snapshot: { ...policyRow().snapshot as object, riskLevel: 'low', mode: 'readonly', runtimeEnforcementStatus: 'shadow' } }),
        ]),
      },
      brainRelease: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: 81, releaseKey: 'policy-shadow', status: 'active', activatedAt: new Date(), createdAt: new Date(), _count: { items: 1 } })
          .mockResolvedValueOnce({ id: 82, releaseKey: 'runtime-shadow', scope: 'global', status: 'active', rollout: { governancePolicyReleaseId: 81, governancePolicyMode: 'shadow' }, activatedAt: new Date() }),
      },
    } as never);

    await expect(service.getOverview()).resolves.toMatchObject({
      runtimePending: 0,
      runtimeConsistency: 'aligned',
      runtimeGovernance: { policyReleaseId: 81, mode: 'shadow', aligned: true },
    });
  });

  it('does not treat first classification from unclassified to low as a risk downgrade', async () => {
    const prisma = {
      brainResourceVersion: { findFirst: jest.fn().mockResolvedValue(policyRow()) },
      brainGovernanceTask: { upsert: jest.fn().mockResolvedValue({ id: 41, status: 'pending' }) },
    };
    const service = new BrainGovernanceControlPlaneService(prisma as never);
    jest.spyOn(service as never, 'processTask' as never).mockResolvedValue(undefined as never);

    await expect(service.classifyCapability({
      capabilityKey: 'customer_facts',
      riskLevel: 'low',
      mode: 'readonly',
      reason: '只读事实查询',
      actorId: 9,
      actorPermissions: ['core:brain-governance:manage'],
    })).resolves.toMatchObject({ taskId: 41, status: 'pending' });
  });

  it('requires approve permission when a classified risk is manually lowered', async () => {
    const prisma = {
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(policyRow({
          snapshot: { ...policyRow().snapshot as object, riskLevel: 'high', mode: 'preview' },
        })),
      },
    };
    const service = new BrainGovernanceControlPlaneService(prisma as never);

    await expect(service.classifyCapability({
      capabilityKey: 'customer_facts',
      riskLevel: 'medium',
      mode: 'preview',
      reason: '人工降低风险',
      actorId: 9,
      actorPermissions: ['core:brain-governance:manage'],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['low', 'preview', 'low_risk_policy_requires_readonly_mode'],
    ['medium', 'readonly', 'medium_risk_policy_requires_preview_or_advisory_mode'],
    ['high', 'readonly', 'high_risk_policy_cannot_use_readonly_whitelist'],
    ['critical', 'preview', 'critical_policy_requires_alert_mode'],
    ['unclassified', 'readonly', 'unclassified_policy_requires_alert_mode'],
  ])('blocks invalid risk and governance-mode combinations: %s/%s', async (riskLevel, mode, message) => {
    const service = new BrainGovernanceControlPlaneService({} as never);
    await expect(service.classifyCapability({
      capabilityKey: 'customer_facts',
      riskLevel,
      mode,
      reason: 'test',
      actorId: 9,
      actorPermissions: ['*'],
    })).rejects.toMatchObject({ message });
  });

  it('marks prior capability receipts stale and creates an unclassified policy for new receipt capabilities', async () => {
    const receiptUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const resourceCreate = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 51, ...data }));
    const tx = {
      brainGateReceipt: {
        upsert: jest.fn().mockResolvedValue({ id: 31, receiptKey: 'receipt-new' }),
        updateMany: receiptUpdateMany,
      },
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: resourceCreate,
      },
    };
    const prisma = {
      brainResourceVersion: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (operation: unknown) => typeof operation === 'function'
        ? (operation as (client: typeof tx) => Promise<unknown>)(tx)
        : Promise.all(operation as Promise<unknown>[])),
    };
    const service = new BrainGovernanceControlPlaneService(prisma as never);

    await service.ingestReceipt({
      receiptId: 'receipt-new',
      stage: 'candidate',
      riskLevel: 'low',
      changedFilesChecksum: HASH,
      diffChecksum: HASH,
      sourceFingerprint: HASH,
      suiteChecksum: HASH,
      resultChecksum: HASH,
      status: 'passed',
      expiresAt: '2026-08-03T00:00:00.000Z',
      plan: { capabilities: ['customer_facts'] },
    }, 9);

    expect(receiptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        stage: 'candidate',
        status: 'passed',
        result: { path: ['plan', 'capabilities'], array_contains: ['customer_facts'] },
      }),
      data: { status: 'stale' },
    }));
    expect(resourceCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        resourceType: 'capability_policy',
        resourceKey: 'customer_facts',
        snapshot: expect.objectContaining({ riskLevel: 'unclassified', mode: 'alert', whitelistStatus: 'not_allowed' }),
      }),
    }));
  });

  it('keeps high-risk approval outside the ordinary execution whitelist', async () => {
    const current = policyRow({
      snapshot: {
        ...policyRow().snapshot as object,
        riskLevel: 'high',
        mode: 'preview',
        whitelistStatus: 'pending',
        evidence: [{ receiptId: 'receipt-1', expiresAt: '2099-08-03T00:00:00.000Z' }],
      },
    });
    const taskUpdate = jest.fn().mockResolvedValue({ id: 71 });
    const tx = {
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue({ version: 1 }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 52, createdAt: new Date(), ...data })),
      },
    };
    const prisma = {
      brainResourceVersion: { findFirst: jest.fn().mockResolvedValue(current) },
      brainGovernanceTask: {
        findMany: jest.fn().mockResolvedValue([{ id: 71, transitionLog: [] }]),
        update: taskUpdate,
      },
      $transaction: jest.fn(async (operation: unknown) => typeof operation === 'function'
        ? (operation as (client: typeof tx) => Promise<unknown>)(tx)
        : Promise.all(operation as Promise<unknown>[])),
    };
    const service = new BrainGovernanceControlPlaneService(prisma as never);

    const result = await service.approveCapability({ capabilityKey: 'customer_facts', decision: 'approve', reason: '仅批准预览', actorId: 9 });

    expect(result.policy.whitelistStatus).toBe('not_allowed');
    expect(taskUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'approved', approvedBy: 9 }) }));
  });

  it('creates immutable shadow policy versions from the active policy snapshot', async () => {
    const sourcePolicy = policyRow({
      status: 'active',
      snapshot: { ...policyRow().snapshot as object, riskLevel: 'low', mode: 'readonly' },
    });
    const created = { ...sourcePolicy, id: 21, version: 2, snapshot: { ...sourcePolicy.snapshot as object, runtimeEnforcementStatus: 'shadow' } };
    const findMany = jest.fn()
      .mockResolvedValueOnce([{ resourceKey: 'customer_facts', version: 1 }])
      .mockResolvedValueOnce([created]);
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = { brainResourceVersion: { findMany, createMany } };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({
          id: 81,
          scope: 'governance_policy',
          status: 'active',
          items: [{ resourceType: 'capability_policy', resourceKey: 'customer_facts', snapshot: sourcePolicy.snapshot }],
        }),
      },
      $transaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const service = new BrainGovernanceControlPlaneService(prisma as never);

    await expect(service.createRuntimePolicyTransition({
      sourcePolicySnapshotId: 81,
      runtimeStatus: 'shadow',
      actorId: 9,
      reason: '治理策略进入运行 Shadow',
    })).resolves.toEqual([created]);

    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        resourceType: 'capability_policy',
        resourceKey: 'customer_facts',
        version: 2,
        status: 'draft',
        snapshot: expect.objectContaining({
          runtimeEnforcementStatus: 'shadow',
          owners: expect.objectContaining({ runtimeTransition: expect.objectContaining({ sourcePolicySnapshotId: 81 }) }),
        }),
      })],
    });
  });

  it('publishes policy snapshots only inside governance_policy scope', async () => {
    const release = {
      id: 81,
      releaseKey: 'governance-v1',
      scope: 'governance_policy',
      status: 'draft',
      items: [{ resourceVersionId: 51, resourceType: 'capability_policy', resourceKey: 'customer_facts' }],
    };
    const releaseUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      brainRelease: {
        updateMany: releaseUpdateMany,
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...release, status: 'active' }),
      },
      brainResourceVersion: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 51, status: 'active' }),
      },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      $transaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const service = new BrainGovernanceControlPlaneService(prisma as never);

    await expect(service.publishPolicySnapshot(81)).resolves.toMatchObject({ id: 81, status: 'active' });
    expect(releaseUpdateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: 81, scope: 'governance_policy', status: 'draft' },
    }));
    expect(releaseUpdateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { scope: 'governance_policy', status: 'active', id: { not: 81 } },
    }));
  });

  it('refuses to roll back a runtime release through the policy-snapshot path', async () => {
    const service = new BrainGovernanceControlPlaneService({
      brainRelease: { findUnique: jest.fn().mockResolvedValue({ id: 91, scope: 'global', status: 'active' }) },
    } as never);

    await expect(service.rollbackPolicySnapshot(91, 'test')).rejects.toMatchObject({ message: 'policy_snapshot_not_found' });
  });

  it('clears leases and appends transition evidence when retrying a recoverable task', async () => {
    const task = {
      id: 101,
      status: 'failed',
      attemptCount: 1,
      maxAttempts: 3,
      transitionLog: [{ status: 'failed' }],
    };
    const update = jest.fn().mockResolvedValue({ ...task, status: 'pending' });
    const service = new BrainGovernanceControlPlaneService({
      brainGovernanceTask: { findUnique: jest.fn().mockResolvedValue(task), update },
    } as never);
    jest.spyOn(service as never, 'processTask' as never).mockResolvedValue(undefined as never);

    await service.retryTask(101);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'pending',
        leasedAt: null,
        leaseExpiresAt: null,
        leaseOwner: null,
        transitionLog: expect.arrayContaining([expect.objectContaining({ status: 'pending', reason: 'manual_retry' })]),
      }),
    }));
  });
});
