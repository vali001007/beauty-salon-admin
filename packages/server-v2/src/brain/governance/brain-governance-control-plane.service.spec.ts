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
  it('exposes runtime ontology warmup summary, detail and single-flight retry result', async () => {
    const status = {
      state: 'ready',
      currentPhase: null,
      startedAt: '2026-08-02T07:59:40.655Z',
      completedAt: '2026-08-02T08:00:00.000Z',
      latencyMs: 19_345,
      activeReleaseCount: 2,
      warmedReleaseCount: 2,
      phases: { releaseDiscoveryMs: 1996, artifactLookupMs: 17_349, itemFetchMs: 0, definitionPreloadMs: 0, releaseWarmupMs: 0 },
      releases: [{ releaseId: 416, artifactSource: 'persistent' }],
      failureReason: null,
    };
    const warmup = {
      getStatus: jest.fn().mockReturnValue(status),
      warmActiveReleases: jest.fn().mockResolvedValue(status),
    };
    const prisma = {
      brainGovernanceTask: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
      brainResourceVersion: { findMany: jest.fn().mockResolvedValue([]) },
      brainRelease: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new BrainGovernanceControlPlaneService(prisma as never, undefined, warmup as never);

    await expect(service.getOverview()).resolves.toMatchObject({
      runtimeWarmup: {
        state: 'ready',
        latencyMs: 19_345,
        runtimeReleaseCount: 2,
        warmedReleaseCount: 2,
        cacheStatus: 'warm',
        artifactSource: 'persistent',
        performanceTargetMet: false,
      },
    });
    expect(service.getRuntimeOntologyWarmup()).toMatchObject({ activeReleaseCount: 2, phases: { artifactLookupMs: 17_349 } });
    await expect(service.retryRuntimeOntologyWarmup()).resolves.toMatchObject({ state: 'ready' });
    expect(warmup.warmActiveReleases).toHaveBeenCalledTimes(1);
  });

  it('classifies database warmup failures separately from lineage blockers', () => {
    const databaseService = new BrainGovernanceControlPlaneService({} as never, undefined, {
      getStatus: () => ({
        state: 'failed', currentPhase: 'artifact_lookup', startedAt: null, completedAt: null, latencyMs: 10_000,
        activeReleaseCount: 2, warmedReleaseCount: 0,
        phases: { releaseDiscoveryMs: 0, artifactLookupMs: 0, itemFetchMs: 0, definitionPreloadMs: 0, releaseWarmupMs: 0 },
        releases: [], failureReason: 'timeout exceeded when trying to connect',
      }),
    } as never);
    const lineageService = new BrainGovernanceControlPlaneService({} as never, undefined, {
      getStatus: () => ({
        state: 'failed', currentPhase: 'definition_preload', startedAt: null, completedAt: null, latencyMs: 100,
        activeReleaseCount: 1, warmedReleaseCount: 0,
        phases: { releaseDiscoveryMs: 0, artifactLookupMs: 0, itemFetchMs: 0, definitionPreloadMs: 0, releaseWarmupMs: 0 },
        releases: [], failureReason: 'brain_release_warmup_definition_refs_missing:416',
      }),
    } as never);

    expect(databaseService.getRuntimeOntologyWarmup()).toMatchObject({ failureCategory: 'database' });
    expect(lineageService.getRuntimeOntologyWarmup()).toMatchObject({ failureCategory: 'lineage' });
  });

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

  it('filters only latest capability policies by owner, blocker and actionable state', async () => {
    const latest = policyRow({
      id: 12,
      version: 2,
      snapshot: {
        ...policyRow().snapshot as object,
        riskLevel: 'medium',
        mode: 'preview',
        whitelistStatus: 'pending',
        owners: { product: 'finance' },
      },
    });
    const resourceFindMany = jest.fn()
      .mockResolvedValueOnce([{ id: 12, resourceKey: 'customer_facts' }])
      .mockResolvedValueOnce([latest]);
    const taskFindMany = jest.fn()
      .mockResolvedValueOnce([{ resourceKey: 'customer_facts' }])
      .mockResolvedValueOnce([{ resourceKey: 'customer_facts', blockerType: 'business', blockerCode: 'approval_required', status: 'pending_approval' }]);
    const service = new BrainGovernanceControlPlaneService({
      brainResourceVersion: { findMany: resourceFindMany, count: jest.fn().mockResolvedValue(1) },
      brainGovernanceTask: { findMany: taskFindMany },
    } as never);

    await expect(service.listCapabilityPolicies({
      owner: 'finance',
      blockerType: 'business',
      actionableOnly: true,
    })).resolves.toMatchObject({
      total: 1,
      items: [{
        id: 12,
        governance: { actionable: true, blockerTypes: ['business'], activeTaskCount: 1 },
      }],
    });
    expect(resourceFindMany.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([expect.objectContaining({ id: { in: [12] } })]) }),
    }));
    expect(taskFindMany.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      where: expect.objectContaining({ blockerType: 'business', status: { in: expect.arrayContaining(['pending_approval', 'failed']) } }),
    }));
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

  it('updates owners without resetting risk, evidence, whitelist or runtime enforcement', async () => {
    const current = policyRow({
      version: 2,
      snapshot: {
        ...policyRow().snapshot as object,
        riskLevel: 'medium',
        mode: 'preview',
        whitelistStatus: 'pending',
        runtimeEnforcementStatus: 'shadow',
        permissions: ['core:customer:view'],
        owners: { product: 'crm' },
        evidence: [{ receiptId: 'receipt-1' }],
        impact: { source: 'candidate' },
      },
    });
    const events = { record: jest.fn() };
    const service = new BrainGovernanceControlPlaneService({
      brainResourceVersion: { findFirst: jest.fn().mockResolvedValue(current) },
    } as never, events as never);
    const created = policyRow({ id: 12, version: 3, snapshot: current.snapshot });
    const createPolicyVersion = jest.spyOn(service as never, 'createPolicyVersion' as never).mockResolvedValue(created as never);

    await service.updateCapabilityOwners({
      capabilityKey: 'customer_facts',
      owners: { product: 'crm', primary: 'risk-team' },
      reason: '更新治理负责人：risk-team',
      actorId: 9,
    });

    expect(createPolicyVersion).toHaveBeenCalledWith(expect.objectContaining({
      capabilityKey: 'customer_facts',
      actorId: 9,
      snapshot: expect.objectContaining({
        riskLevel: 'medium',
        mode: 'preview',
        whitelistStatus: 'pending',
        runtimeEnforcementStatus: 'shadow',
        permissions: ['core:customer:view'],
        evidence: [{ receiptId: 'receipt-1' }],
        impact: { source: 'candidate' },
        owners: { product: 'crm', primary: 'risk-team' },
      }),
    }));
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'capability_owner_updated', actorId: 9 }));
  });

  it('returns candidate impacts, governance tasks and audit events in capability details', async () => {
    const receipt = { id: 31, receiptKey: 'receipt-31', status: 'passed' };
    const candidateImpact = { id: 41, impactRuleId: 'resolver-change', changeType: 'modified', receipt: { candidate: { candidateKey: 'owner/repo:head:merge' } } };
    const task = { id: 51, resourceKey: 'customer_facts', status: 'pending_approval' };
    const auditEvent = { id: 61, eventType: 'task_pending_approval' };
    const service = new BrainGovernanceControlPlaneService({
      brainResourceVersion: { findMany: jest.fn().mockResolvedValue([policyRow()]) },
      brainGateReceipt: { findMany: jest.fn().mockResolvedValue([receipt]) },
      brainGateReceiptCapability: { findMany: jest.fn().mockResolvedValue([candidateImpact]) },
      brainGovernanceTask: { findMany: jest.fn().mockResolvedValue([task]) },
      brainGovernanceEvent: { findMany: jest.fn().mockResolvedValue([auditEvent]) },
    } as never);

    await expect(service.getCapabilityPolicy('customer_facts')).resolves.toMatchObject({
      current: { resourceKey: 'customer_facts' },
      evidence: [receipt],
      candidateImpacts: [candidateImpact],
      tasks: [task],
      auditEvents: [auditEvent],
    });
  });

  it('keeps task list rows lightweight while exposing Candidate identity and required Gate summaries', async () => {
    const findMany = jest.fn().mockResolvedValue([{
      id: 51,
      idempotencyKey: 'task-51',
      taskType: 'evaluate',
      stage: 'candidate',
      resourceType: 'capability_policy',
      resourceKey: 'customer_facts',
      riskLevel: 'low',
      status: 'revision_required',
      attemptCount: 0,
      maxAttempts: 3,
      availableAt: new Date('2026-08-02T00:00:00.000Z'),
      errorCode: null,
      errorMessage: null,
      createdBy: 9,
      approvedBy: null,
      completedAt: null,
      createdAt: new Date('2026-08-02T00:00:00.000Z'),
      updatedAt: new Date('2026-08-02T00:00:00.000Z'),
      candidateId: 17,
      receiptId: null,
      blockerType: 'evidence',
      blockerCode: 'valid_gate_receipt_missing',
      resolutionType: 'wait_ci',
      supersededByTaskId: null,
      candidate: {
        id: 17,
        candidateKey: 'owner/repo:head:merge',
        branch: 'feature/governance',
        headCommit: 'c'.repeat(40),
        status: 'governing',
        receipts: [{ gates: [{ gateKey: 'brain_contract', status: 'passed' }] }],
      },
    }]);
    const service = new BrainGovernanceControlPlaneService({
      brainGovernanceTask: { findMany, count: jest.fn().mockResolvedValue(1) },
    } as never);

    const result = await service.listTasks({ page: 1, pageSize: 20, blockerType: 'evidence' });

    expect(result.items[0]).toMatchObject({
      id: 51,
      candidate: { candidateKey: 'owner/repo:head:merge', branch: 'feature/governance' },
      requiredGates: ['brain_contract'],
    });
    expect(result.items[0]).not.toHaveProperty('payload');
    expect(result.items[0]).not.toHaveProperty('result');
    expect(result.items[0]).not.toHaveProperty('transitionLog');
    const listQuery = findMany.mock.calls[0]?.[0];
    expect(listQuery.select).not.toHaveProperty('payload');
    expect(listQuery.select).not.toHaveProperty('result');
    expect(listQuery.select).not.toHaveProperty('transitionLog');
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
      brainGateReceiptGate: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      brainGateReceiptCapability: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
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
    }, 9, 'trusted_candidate');

    expect(receiptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        stage: 'candidate',
        status: 'passed',
        capabilities: { some: { capabilityKey: 'customer_facts' } },
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

  it('stores human-uploaded receipts as untrusted and does not create governance policies', async () => {
    const upsert = jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: 32, ...create }));
    const updateMany = jest.fn();
    const tx = { brainGateReceipt: { findUnique: jest.fn().mockResolvedValue(null), upsert, updateMany } };
    const prisma = {
      $transaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
      brainResourceVersion: { findFirst: jest.fn() },
    };
    const service = new BrainGovernanceControlPlaneService(prisma as never);

    const result = await service.ingestReceipt({
      receiptId: 'manual-receipt',
      stage: 'candidate',
      riskLevel: 'low',
      changedFilesChecksum: HASH,
      diffChecksum: HASH,
      sourceFingerprint: HASH,
      suiteChecksum: HASH,
      resultChecksum: HASH,
      status: 'passed',
      expiresAt: '2099-08-03T00:00:00.000Z',
      plan: { capabilities: ['customer_facts'] },
    }, 9);

    expect(result.status).toBe('untrusted');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        status: 'untrusted',
        result: expect.objectContaining({
          verification: expect.objectContaining({ trustLevel: 'untrusted_dev', status: 'untrusted' }),
        }),
      }),
    }));
    expect(updateMany).not.toHaveBeenCalled();
    expect(prisma.brainResourceVersion.findFirst).not.toHaveBeenCalled();
  });

  it('prevents the legacy human path from overwriting a trusted machine receipt key', async () => {
    const upsert = jest.fn();
    const tx = {
      brainGateReceipt: {
        findUnique: jest.fn().mockResolvedValue({ trustLevel: 'trusted_candidate', verificationStatus: 'verified' }),
        upsert,
        updateMany: jest.fn(),
      },
    };
    const service = new BrainGovernanceControlPlaneService({
      $transaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
      brainResourceVersion: { findFirst: jest.fn() },
    } as never);

    await expect(service.ingestReceipt({
      schemaVersion: 3,
      receiptId: 'trusted-receipt-key',
      stage: 'candidate',
      riskLevel: 'low',
      changedFilesChecksum: HASH,
      diffChecksum: HASH,
      sourceFingerprint: HASH,
      suiteChecksum: HASH,
      resultChecksum: HASH,
      status: 'passed',
      expiresAt: '2099-08-03T00:00:00.000Z',
      plan: { capabilities: ['customer_facts'] },
    }, 9)).rejects.toMatchObject({ message: 'trusted_receipt_key_reserved' });

    expect(upsert).not.toHaveBeenCalled();
  });

  it('automatically creates a replacement evaluation when trusted evidence arrives', async () => {
    const currentPolicy = policyRow({
      id: 61,
      checksum: HASH,
      snapshot: { ...policyRow().snapshot as object, riskLevel: 'low', mode: 'readonly' },
    });
    const taskUpsert = jest.fn().mockResolvedValue({ id: 202, status: 'pending' });
    const taskUpdate = jest.fn().mockResolvedValue({ id: 201, supersededByTaskId: 202 });
    const tx = {
      brainGateReceipt: {
        upsert: jest.fn().mockResolvedValue({ id: 41, receiptKey: 'receipt-admission' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      brainGateReceiptGate: { deleteMany: jest.fn(), createMany: jest.fn() },
      brainGateReceiptCapability: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
      brainResourceVersion: { findFirst: jest.fn().mockResolvedValue(currentPolicy) },
      brainGovernanceTask: {
        findMany: jest.fn().mockResolvedValue([{
          id: 201,
          taskType: 'evaluate',
          stage: 'candidate',
          resourceKey: 'customer_facts',
          riskLevel: 'low',
          status: 'revision_required',
          payload: {},
          result: { blockingReason: 'valid_gate_receipt_missing' },
          transitionLog: [],
          createdBy: 9,
        }]),
        upsert: taskUpsert,
        update: taskUpdate,
      },
      brainGovernanceCandidate: { update: jest.fn().mockResolvedValue({ id: 17, status: 'governing' }) },
    };
    const service = new BrainGovernanceControlPlaneService(prisma as never);

    const result = await service.ingestReceipt({
      schemaVersion: 3,
      receiptId: 'receipt-admission',
      candidateId: HASH,
      governanceCandidateId: 17,
      stage: 'candidate',
      riskLevel: 'low',
      changedFilesChecksum: HASH,
      diffChecksum: HASH,
      sourceFingerprint: HASH,
      suiteChecksum: HASH,
      identityChecksum: HASH,
      resultChecksum: HASH,
      status: 'passed',
      expiresAt: '2099-08-03T00:00:00.000Z',
      verification: { admissionEligible: true, issuer: 'CI/CD', verifiedAt: '2026-08-02T00:00:00.000Z' },
      plan: { capabilities: ['customer_facts'] },
      results: [{ gateKey: 'brain_contract', status: 'passed', inputChecksum: HASH, resultChecksum: HASH }],
    }, undefined, 'trusted_candidate');

    expect(result.rescheduledTaskIds).toEqual([202]);
    expect(tx.brainGateReceipt.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        candidateId: 17,
        result: expect.objectContaining({ candidateId: HASH, governanceCandidateId: 17 }),
      }),
    }));
    expect(taskUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ candidateId: 17, receiptId: 41, resourceKey: 'customer_facts' }),
    }));
    expect(taskUpdate).toHaveBeenCalledWith({ where: { id: 201 }, data: { supersededByTaskId: 202 } });
  });

  it('automatically creates an evaluation for a classified capability even without an older blocked task', async () => {
    const currentPolicy = policyRow({
      id: 62,
      checksum: HASH,
      snapshot: { ...policyRow().snapshot as object, riskLevel: 'low', mode: 'readonly' },
    });
    const taskUpsert = jest.fn().mockResolvedValue({ id: 203, status: 'pending' });
    const tx = {
      brainGateReceipt: {
        upsert: jest.fn().mockResolvedValue({ id: 42, receiptKey: 'receipt-fresh' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      brainGateReceiptGate: { deleteMany: jest.fn(), createMany: jest.fn() },
      brainGateReceiptCapability: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const service = new BrainGovernanceControlPlaneService({
      $transaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
      brainResourceVersion: { findFirst: jest.fn().mockResolvedValue(currentPolicy) },
      brainGovernanceTask: { findMany: jest.fn().mockResolvedValue([]), upsert: taskUpsert, update: jest.fn() },
      brainGovernanceCandidate: { update: jest.fn().mockResolvedValue({ id: 18, status: 'governing' }) },
    } as never);

    const result = await service.ingestReceipt({
      schemaVersion: 3,
      receiptId: 'receipt-fresh',
      candidateId: 18,
      stage: 'candidate',
      riskLevel: 'low',
      changedFilesChecksum: HASH,
      diffChecksum: HASH,
      sourceFingerprint: HASH,
      suiteChecksum: HASH,
      identityChecksum: HASH,
      resultChecksum: HASH,
      status: 'passed',
      expiresAt: '2099-08-03T00:00:00.000Z',
      verification: { admissionEligible: true, issuer: 'CI/CD' },
      plan: { capabilities: ['customer_facts'] },
      results: [{ gateKey: 'brain_contract', status: 'passed', inputChecksum: HASH, resultChecksum: HASH }],
    }, undefined, 'trusted_candidate');

    expect(result.rescheduledTaskIds).toEqual([203]);
    expect(taskUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ candidateId: 18, receiptId: 42, resourceKey: 'customer_facts' }),
    }));
  });

  it('classifies missing evidence as a business blocker without consuming a retry attempt', async () => {
    const task = {
      id: 301,
      idempotencyKey: 'task-301',
      taskType: 'evaluate',
      stage: 'candidate',
      resourceType: 'capability_policy',
      resourceKey: 'customer_facts',
      riskLevel: 'low',
      status: 'pending',
      payload: { capabilityKey: 'customer_facts', stage: 'candidate', policyVersionId: 61 },
      transitionLog: [],
      attemptCount: 0,
      maxAttempts: 3,
      availableAt: new Date(0),
      leaseExpiresAt: null,
      candidateId: 17,
      createdBy: 9,
    };
    const leaseExpiresAt = new Date('2099-08-02T10:05:00.000Z');
    const validating = { ...task, status: 'validating', attemptCount: 1, leaseOwner: 'worker-1', leaseExpiresAt };
    const evaluating = { ...validating, status: 'evaluating' };
    const blocked = { ...evaluating, status: 'revision_required', leaseOwner: null, leaseExpiresAt: null };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUnique = jest.fn()
      .mockResolvedValueOnce(task)
      .mockResolvedValueOnce(validating)
      .mockResolvedValueOnce(validating)
      .mockResolvedValueOnce(evaluating)
      .mockResolvedValueOnce(evaluating)
      .mockResolvedValueOnce(blocked);
    const service = new BrainGovernanceControlPlaneService({
      brainGovernanceTask: {
        findUnique,
        updateMany,
      },
      brainGovernanceCandidate: {
        findUnique: jest.fn().mockResolvedValue({ id: 17, status: 'governing' }),
      },
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(policyRow({
          id: 61,
          snapshot: { ...policyRow().snapshot as object, riskLevel: 'low', mode: 'readonly' },
        })),
      },
      brainGateReceipt: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never);

    await expect(service.processTask(301, 'worker-1')).resolves.toBe(true);
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 301, leaseOwner: 'worker-1' }),
      data: expect.objectContaining({
        status: 'revision_required',
        blockerType: 'evidence',
        blockerCode: 'valid_gate_receipt_missing',
        resolutionType: 'wait_ci',
        attemptCount: { decrement: 1 },
      }),
    }));
  });

  it('cancels work for a superseded candidate before it can create stale policy versions', async () => {
    const task = {
      id: 304,
      idempotencyKey: 'task-304',
      taskType: 'evaluate',
      stage: 'candidate',
      resourceType: 'capability_policy',
      resourceKey: 'customer_facts',
      riskLevel: 'low',
      status: 'pending',
      payload: { capabilityKey: 'customer_facts', stage: 'candidate' },
      transitionLog: [],
      attemptCount: 0,
      maxAttempts: 3,
      availableAt: new Date(0),
      leaseExpiresAt: null,
      candidateId: 17,
      createdBy: 9,
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new BrainGovernanceControlPlaneService({
      brainGovernanceTask: {
        findUnique: jest.fn().mockResolvedValue(task),
        updateMany,
      },
      brainGovernanceCandidate: {
        findUnique: jest.fn().mockResolvedValue({ id: 17, status: 'superseded' }),
      },
    } as never);

    await expect(service.processTask(304, 'worker-1')).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 304, attemptCount: 0 }),
      data: expect.objectContaining({
        status: 'cancelled',
        blockerCode: 'candidate_superseded',
        resolutionType: 'candidate_superseded',
        completedAt: expect.any(Date),
      }),
    }));
  });

  it('automatically schedules a delayed retry for a recoverable system failure', async () => {
    const before = {
      id: 302,
      taskType: 'unsupported',
      stage: 'candidate',
      status: 'pending',
      payload: {},
      transitionLog: [],
      attemptCount: 0,
      maxAttempts: 3,
      availableAt: new Date(0),
      leaseExpiresAt: null,
      createdBy: 9,
    };
    const claimed = {
      ...before,
      status: 'validating',
      attemptCount: 1,
      leaseOwner: 'worker-1',
      leaseExpiresAt: new Date('2099-08-02T10:05:00.000Z'),
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUnique = jest.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(claimed).mockResolvedValueOnce(claimed);
    const service = new BrainGovernanceControlPlaneService({
      brainGovernanceTask: { findUnique, updateMany },
    } as never);

    await expect(service.processTask(302, 'worker-1')).resolves.toBe(true);
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 302, leaseOwner: 'worker-1' }),
      data: expect.objectContaining({
        status: 'pending',
        blockerType: 'system',
        blockerCode: 'governance_task_retry_scheduled',
        completedAt: null,
      }),
    }));
  });

  it('moves an exhausted system failure to failed instead of scheduling another retry', async () => {
    const before = {
      id: 303,
      taskType: 'unsupported',
      stage: 'candidate',
      status: 'pending',
      payload: {},
      transitionLog: [],
      attemptCount: 2,
      maxAttempts: 3,
      availableAt: new Date(0),
      leaseExpiresAt: null,
      createdBy: 9,
    };
    const claimed = {
      ...before,
      status: 'validating',
      attemptCount: 3,
      leaseOwner: 'worker-1',
      leaseExpiresAt: new Date('2099-08-02T10:05:00.000Z'),
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUnique = jest.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(claimed).mockResolvedValueOnce(claimed);
    const service = new BrainGovernanceControlPlaneService({
      brainGovernanceTask: { findUnique, updateMany },
    } as never);

    await expect(service.processTask(303, 'worker-1')).resolves.toBe(true);
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 303, leaseOwner: 'worker-1' }),
      data: expect.objectContaining({
        status: 'failed',
        blockerCode: 'governance_task_failed',
        completedAt: expect.any(Date),
      }),
    }));
  });

  it('stops without side effects when another worker owns the lease before task execution', async () => {
    const before = {
      id: 306,
      taskType: 'classify',
      stage: 'candidate',
      status: 'pending',
      payload: {
        capabilityKey: 'customer_facts',
        riskLevel: 'low',
        mode: 'readonly',
        reason: 'candidate_change',
      },
      transitionLog: [],
      attemptCount: 0,
      maxAttempts: 3,
      availableAt: new Date(0),
      leaseExpiresAt: null,
      createdBy: 9,
    };
    const stolen = {
      ...before,
      status: 'validating',
      attemptCount: 1,
      leaseOwner: 'worker-2',
      leaseExpiresAt: new Date('2099-08-02T10:05:00.000Z'),
    };
    const updateMany = jest.fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const findUnique = jest.fn()
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(stolen)
      .mockResolvedValueOnce(stolen);
    const create = jest.fn();
    const service = new BrainGovernanceControlPlaneService({
      brainGovernanceTask: { findUnique, updateMany },
      brainResourceVersion: { create },
    } as never);

    await expect(service.processTask(306, 'worker-1')).resolves.toBe(false);
    expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 306, leaseOwner: 'worker-1' }),
    }));
    expect(create).not.toHaveBeenCalled();
  });

  it('renews only the live lease owned by the current worker', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = new BrainGovernanceControlPlaneService({
      brainGovernanceTask: { updateMany },
    } as never);
    const now = new Date('2026-08-02T10:00:00.000Z');

    await expect(service.renewTaskLease(305, 'worker-1', now)).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 305,
        leaseOwner: 'worker-1',
        status: { in: ['validating', 'classifying', 'evaluating'] },
        leaseExpiresAt: { gt: now },
      },
      data: { leaseExpiresAt: new Date('2026-08-02T10:05:00.000Z') },
    });
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
      brainGovernanceCandidate: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      $transaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const events = { record: jest.fn().mockResolvedValue({}) };
    const service = new BrainGovernanceControlPlaneService(prisma as never, events as never);

    await expect(service.publishPolicySnapshot(81, 9)).resolves.toMatchObject({ id: 81, status: 'active' });
    expect(releaseUpdateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: 81, scope: 'governance_policy', status: 'draft' },
    }));
    expect(releaseUpdateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { scope: 'governance_policy', status: 'active', id: { not: 81 } },
    }));
    expect(tx.brainGovernanceCandidate.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ policySnapshotId: 81 }),
      data: { status: 'ready' },
    }));
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'policy_published',
      actorType: 'user',
      actorId: 9,
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
      blockerType: 'system',
      attemptCount: 1,
      maxAttempts: 3,
      transitionLog: [{ status: 'failed' }],
    };
    const update = jest.fn().mockResolvedValue({ ...task, status: 'pending' });
    const service = new BrainGovernanceControlPlaneService({
      brainGovernanceTask: { findUnique: jest.fn().mockResolvedValue(task), update },
    } as never);
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
