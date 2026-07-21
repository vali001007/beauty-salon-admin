import { BrainCapabilitySemanticVerifierService } from '../capability/brain-capability-semantic-verifier.service.js';
import {
  generatedProposalFixture,
  publishedSnapshotFixture,
} from '../capability/brain-generated-capability.test-fixtures.js';
import { createReleaseFingerprint } from './brain-capability-regeneration-fingerprint.js';
import { BrainReleaseService } from './brain-release.service.js';

function passingEvalSummary(items: any[]) {
  const requiredCapabilityKeys = items
    .filter((item) => item.resourceType === 'skill')
    .map((item) => item.resourceKey)
    .sort();
  return {
    canRelease: true,
    total: 1,
    gateMode: 'release_gate',
    coverageComplete: true,
    releaseFingerprint: createReleaseFingerprint(items),
    requiredCapabilityKeys,
    requiredCaseKeys: ['release_gate_case'],
    releaseGate: { passed: true },
  };
}

describe('BrainReleaseService', () => {
  it('never activates an evaluation-only release into production', async () => {
    const release = {
      id: 21,
      status: 'draft',
      scope: 'percentage',
      rollout: { mode: 'shadow', evaluationOnly: true, userPercentage: 100 },
      items: [],
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
      message: 'release_evaluation_only',
    });
  });

  it('activates a production canary with a passing evaluation-only release sharing the exact fingerprint', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_query',
      sourceResourceId: 31,
      snapshot: { permissions: [] },
    };
    const items = [
      { id: 101, resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion },
    ];
    const release = {
      id: 21,
      status: 'draft',
      scope: 'user',
      rollout: { mode: 'model', evaluationEvidenceReleaseId: 20, userIds: [28], storeIds: [6] },
      items,
    };
    const evidenceRelease = {
      id: 20,
      status: 'draft',
      scope: 'percentage',
      rollout: { mode: 'shadow', evaluationOnly: true, userPercentage: 100 },
      items,
    };
    const evalRun = { summary: passingEvalSummary(items) };
    const findRelease = ({ where }: { where: { id: number } }) =>
      Promise.resolve(where.id === evidenceRelease.id ? evidenceRelease : release);
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      brainRelease: {
        findUnique: jest.fn(findRelease),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ ...release, status: 'active' }),
      },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
      brainEvalRun: {
        findFirst: jest.fn(({ where }: { where: { releaseId: number } }) =>
          Promise.resolve(where.releaseId === evidenceRelease.id ? evalRun : null),
        ),
      },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainSkillRegistry: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn(findRelease) },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
      brainEvalRun: {
        findFirst: jest.fn(({ where }: { where: { releaseId: number } }) =>
          Promise.resolve(where.releaseId === evidenceRelease.id ? evalRun : null),
        ),
      },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: release.id, activatedBy: 9 })).resolves.toMatchObject({
      status: 'active',
    });
    expect(prisma.brainEvalRun.findFirst).toHaveBeenCalledWith({
      where: { releaseId: evidenceRelease.id, status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('rejects inherited evaluation evidence when the production fingerprint differs', async () => {
    const targetVersion = { id: 11, checksum: 'a'.repeat(64), resourceType: 'skill', resourceKey: 'customer_query', snapshot: {} };
    const evidenceVersion = { ...targetVersion, checksum: 'b'.repeat(64) };
    const release = {
      id: 21,
      status: 'draft',
      scope: 'user',
      rollout: { mode: 'model', evaluationEvidenceReleaseId: 20 },
      items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion: targetVersion }],
    };
    const evidenceRelease = {
      id: 20,
      rollout: { mode: 'shadow', evaluationOnly: true },
      items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion: evidenceVersion }],
    };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn(({ where }: { where: { id: number } }) =>
          Promise.resolve(where.id === evidenceRelease.id ? evidenceRelease : release),
        ),
      },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: release.id, activatedBy: 9 })).rejects.toMatchObject({
      message: 'release_eval_evidence_fingerprint_mismatch',
    });
  });

  it('serializes activation against a business-definition blocker sharing the five-stage release fingerprint', async () => {
    const resourceVersion = { id: 11, checksum: 'a', resourceType: 'skill', resourceKey: 'customer_query', sourceResourceId: 31, snapshot: {} };
    const release = { id: 21, status: 'draft', scope: 'percentage', items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion }] };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue({ id: 90, releaseFingerprint: 'x'.repeat(64), errorCode: 'business_definition_change_pending' }) },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({ message: 'modification_superseded' });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.brainCapabilityRegenerationJob.findFirst).toHaveBeenCalledWith({
      where: { releaseFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) },
      select: { id: true, status: true },
    });
  });

  it.each(['queued', 'leased', 'retry_scheduled', 'blocked', 'dead_letter', 'completed'])('rejects activation of the old release when regeneration is %s', async (status) => {
    const resourceVersion = { id: 11, checksum: 'a', resourceType: 'skill', resourceKey: 'customer_query', snapshot: {} };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue({ id: 21, status: 'draft', items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion }] }) },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue({ id: 5, status }) },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({ message: 'modification_superseded' });
  });

  it('rolls an active model release directly back to its rules ancestor in one transaction', async () => {
    const rulesVersion = {
      id: 31,
      resourceType: 'skill',
      resourceKey: 'customer_query',
      sourceResourceId: null,
      snapshot: { permissions: [] },
    };
    const releases = new Map<number, any>([
      [15, { id: 15, status: 'active', previousReleaseId: 14, rollout: { mode: 'model' } }],
      [14, { id: 14, status: 'active', previousReleaseId: 13, rollout: { mode: 'model' } }],
      [13, { id: 13, status: 'active', previousReleaseId: 10, rollout: { mode: 'shadow' } }],
      [10, {
        id: 10,
        status: 'archived',
        previousReleaseId: null,
        rollout: { mode: 'rules' },
        items: [{ id: 101, resourceType: 'skill', resourceKey: 'customer_query', resourceVersionId: 31, resourceVersion: rulesVersion }],
      }],
    ]);
    const tx = {
      brainRelease: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ ...releases.get(10), status: 'active' }),
      },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn(({ where }) => Promise.resolve(releases.get(where.id) ?? null)) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.rollbackToRules({ releaseId: 15, reason: 'emergency' })).resolves.toMatchObject({
      id: 10,
      status: 'active',
    });

    expect(tx.brainRelease.updateMany).toHaveBeenCalledWith({
      where: { id: 15, status: 'active' },
      data: { status: 'rolled_back', rolledBackAt: expect.any(Date), failureReason: 'emergency' },
    });
    expect(tx.brainRelease.updateMany).toHaveBeenCalledWith({
      where: { status: 'active', id: { not: 10 } },
      data: { status: 'archived' },
    });
  });

  it('archives and disables candidate resources when rolling back to an empty rules release', async () => {
    const candidateVersion = {
      id: 12,
      resourceType: 'skill',
      resourceKey: 'reservation_list',
      sourceResourceId: 19,
      snapshot: {},
    };
    const current = {
      id: 15,
      status: 'active',
      previousReleaseId: 10,
      rollout: { mode: 'model' },
      items: [{ resourceVersionId: 12, resourceType: 'skill', resourceKey: 'reservation_list', resourceVersion: candidateVersion }],
    };
    const rules = { id: 10, status: 'archived', previousReleaseId: null, rollout: { mode: 'rules' }, items: [] };
    const tx = {
      brainRelease: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ ...rules, status: 'active' }),
      },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainSkillRegistry: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn(({ where }) => Promise.resolve(where.id === 15 ? current : rules)) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };

    await new BrainReleaseService(prisma as never).rollbackToRules({ releaseId: 15, reason: 'test' });

    expect(tx.brainResourceVersion.updateMany).toHaveBeenCalledWith({
      where: { id: 12, status: 'active' },
      data: { status: 'archived', archivedAt: expect.any(Date) },
    });
    expect(tx.brainSkillRegistry.updateMany).toHaveBeenCalledWith({
      where: { id: 19 },
      data: { enabled: false },
    });
  });

  it('creates an independently auditable shadow-to-full rollout sequence', async () => {
    const prisma = { brainRelease: { update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)) } };
    const service = new BrainReleaseService(prisma as never);
    jest.spyOn(service, 'createRelease')
      .mockResolvedValueOnce({ id: 11, releaseKey: 'brain-r1-shadow' } as never)
      .mockResolvedValueOnce({ id: 12, releaseKey: 'brain-r1-canary-5' } as never)
      .mockResolvedValueOnce({ id: 13, releaseKey: 'brain-r1-canary-20' } as never)
      .mockResolvedValueOnce({ id: 14, releaseKey: 'brain-r1-canary-50' } as never)
      .mockResolvedValueOnce({ id: 15, releaseKey: 'brain-r1-full' } as never);

    const releases = await service.createRolloutSequence({
      releaseKey: 'brain-r1',
      resourceVersionIds: [21, 22],
      createdBy: 9,
    });

    expect(service.createRelease).toHaveBeenNthCalledWith(1, expect.objectContaining({
      releaseKey: 'brain-r1-shadow',
      scope: 'percentage',
      rollout: { stage: 'shadow', mode: 'shadow', userPercentage: 100 },
    }));
    expect(service.createRelease).toHaveBeenNthCalledWith(5, expect.objectContaining({
      releaseKey: 'brain-r1-full',
      rollout: { stage: 'full', mode: 'model', userPercentage: 100 },
    }));
    expect(prisma.brainRelease.update).toHaveBeenCalledWith({ where: { id: 12 }, data: { previousReleaseId: 11 } });
    expect(releases.items).toHaveLength(5);
    expect(releases.stages).toEqual(['shadow', 'canary_5', 'canary_20', 'canary_50', 'full']);
  });

  it('resolves a draft evaluation release with its immutable capability snapshots', async () => {
    const candidate = generatedProposalFixture(publishedSnapshotFixture()).manifest;
    const evaluationRelease = {
      id: 21,
      status: 'draft',
      rollout: { mode: 'model', stage: 'canary_5' },
      items: [
        {
          resourceVersionId: 3,
          resourceType: 'skill',
          resourceKey: candidate.key,
          snapshot: { ...candidate, generatedCapability: true },
          resourceVersion: { checksum: 'a'.repeat(64) },
        },
        {
          resourceVersionId: 4,
          resourceType: 'agent_profile',
          resourceKey: 'store_manager',
          snapshot: { roleKey: 'store_manager' },
          resourceVersion: { checksum: 'b'.repeat(64) },
        },
      ],
    };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue(evaluationRelease),
        findMany: jest.fn().mockResolvedValue([{ id: 10, status: 'active', rollout: { mode: 'rules' }, items: [] }]),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(
      (service as any).resolveRuntimeMode({
        storeId: 6,
        userId: 9,
        roleKey: 'store_manager',
        evaluationReleaseId: 21,
      }),
    ).resolves.toMatchObject({
      mode: 'model',
      release: { id: 21, status: 'draft' },
      capabilityCandidates: [expect.objectContaining({ key: candidate.key, generatedCapability: true })],
    });
    expect(prisma.brainRelease.findUnique).toHaveBeenCalledWith({
      where: { id: 21 },
      include: { items: { include: { resourceVersion: true } } },
    });
    expect(prisma.brainRelease.findMany).not.toHaveBeenCalled();
  });

  it('freezes one evaluation release fingerprint and capability snapshot for a whole eval run', async () => {
    const candidate = generatedProposalFixture(publishedSnapshotFixture()).manifest;
    const release = {
      id: 21,
      status: 'draft',
      rollout: { mode: 'model', stage: 'canary_5' },
      items: [
        {
          resourceVersionId: 3,
          resourceType: 'skill',
          resourceKey: candidate.key,
          snapshot: { ...candidate, generatedCapability: true },
          resourceVersion: { id: 3, checksum: 'a'.repeat(64), snapshot: candidate },
        },
      ],
    };
    const prisma = { brainRelease: { findUnique: jest.fn().mockResolvedValue(release) } };
    const service = new BrainReleaseService(prisma as never);

    const snapshot = await (service as any).freezeEvaluationRelease(21);

    expect(snapshot).toMatchObject({
      releaseId: 21,
      releaseStatus: 'draft',
      mode: 'model',
      declaredMode: 'model',
      resourceVersionIds: [3],
      capabilityKeys: [candidate.key],
      capabilityCandidates: [expect.objectContaining({ key: candidate.key })],
      releaseFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.capabilityCandidates)).toBe(true);
    expect(prisma.brainRelease.findUnique).toHaveBeenCalledTimes(1);
  });

  it('executes a shadow release through the candidate model path only during governance evaluation', async () => {
    const prisma = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({
          id: 22,
          status: 'draft',
          rollout: { mode: 'shadow', stage: 'shadow' },
          items: [{
            resourceVersionId: 3,
            resourceType: 'skill',
            resourceKey: 'customer_facts',
            snapshot: { key: 'customer_facts' },
            resourceVersion: { checksum: 'c'.repeat(64) },
          }],
        }),
        findMany: jest.fn(),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(
      (service as any).resolveRuntimeMode({
        storeId: 6,
        userId: 9,
        roleKey: 'store_manager',
        evaluationReleaseId: 22,
      }),
    ).resolves.toMatchObject({
      mode: 'model',
      declaredMode: 'shadow',
      capabilityCandidates: [{ key: 'customer_facts' }],
    });
  });

  it('uses the selected active release snapshots as the production model capability catalog', async () => {
    const candidate = { key: 'customer_facts', version: 9 };
    const prisma = {
      brainRelease: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 23,
            status: 'active',
            scope: 'user',
            rollout: { mode: 'model', userIds: [28], storeIds: [6], roleKeys: ['store_manager'] },
            items: [
              { resourceType: 'skill', resourceKey: 'customer_facts', snapshot: candidate },
              { resourceType: 'agent_profile', resourceKey: 'store_manager', snapshot: { roleKey: 'store_manager' } },
            ],
          },
        ]),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    const resolved = await service.resolveRuntimeMode({ storeId: 6, userId: 28, roleKey: 'store_manager' });

    expect(resolved).toMatchObject({
      mode: 'model',
      declaredMode: 'model',
      release: { id: 23, status: 'active' },
      capabilityCandidates: [candidate],
    });
    expect(Object.isFrozen(resolved.capabilityCandidates)).toBe(true);
    expect(Object.isFrozen(resolved.capabilityCandidates?.[0])).toBe(true);
  });

  it('rejects an explicitly supplied invalid evaluation release id without selecting the active release', async () => {
    const prisma = {
      brainRelease: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(
      (service as any).resolveRuntimeMode({
        storeId: 6,
        userId: 9,
        roleKey: 'store_manager',
        evaluationReleaseId: 0,
      }),
    ).rejects.toMatchObject({ message: 'evaluation_release_id_invalid' });
    expect(prisma.brainRelease.findMany).not.toHaveBeenCalled();
  });

  it('rejects a draft release without activating any resource version', async () => {
    const prisma = {
      brainRelease: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 21, status: 'archived', failureReason: '风险不可接受' }),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.rejectRelease({ releaseId: 21, reason: '风险不可接受' })).resolves.toMatchObject({ status: 'archived' });
    expect(prisma.brainRelease.updateMany).toHaveBeenCalledWith({
      where: { id: 21, status: 'draft' },
      data: { status: 'archived', failureReason: '风险不可接受' },
    });
  });
  it('creates a draft release with immutable resource items', async () => {
    const versions = [
      {
        id: 11,
        resourceType: 'skill',
        resourceKey: 'customer_query',
        version: 2,
        status: 'draft',
        snapshot: { permissions: ['core:customer:view'] },
      },
    ];
    const tx = {
      brainRelease: { create: jest.fn().mockResolvedValue({ id: 21, releaseKey: 'brain-r1', status: 'draft' }) },
      brainReleaseItem: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      brainResourceVersion: { findMany: jest.fn().mockResolvedValue(versions) },
      brainRelease: { findFirst: jest.fn().mockResolvedValue({ id: 20 }) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    const result = await service.createRelease({
      releaseKey: 'brain-r1',
      scope: 'store',
      rollout: { storeIds: [6] },
      resourceVersionIds: [11],
      createdBy: 9,
    });

    expect(tx.brainRelease.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ releaseKey: 'brain-r1', previousReleaseId: 20, status: 'draft' }),
    });
    expect(tx.brainReleaseItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ releaseId: 21, resourceVersionId: 11, resourceKey: 'customer_query' })],
    });
    expect(result).toMatchObject({ id: 21, status: 'draft' });
  });

  it.each(['metric', 'ontology_entity', 'ontology_relation'] as const)(
    'rejects adding legacy semantic resource %s before opening a release transaction',
    async (resourceType) => {
      const versions = [
        { id: 11, resourceType, resourceKey: 'legacy_definition', version: 1, status: 'draft', snapshot: {} },
      ];
      const prisma = {
        brainResourceVersion: { findMany: jest.fn().mockResolvedValue(versions) },
        brainRelease: { findFirst: jest.fn() },
        $transaction: jest.fn(),
      };
      const service = new BrainReleaseService(prisma as never);

      await expect(
        service.createRelease({
          releaseKey: 'brain-r1',
          scope: 'global',
          rollout: {},
          resourceVersionIds: [11],
          createdBy: 9,
        }),
      ).rejects.toMatchObject({ message: `business_definition_registry_required:${resourceType}` });

      expect(prisma.brainRelease.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('claims a draft atomically inside a serializable transaction and retries P2034 at most three times', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a',
      resourceType: 'skill',
      resourceKey: 'customer_query',
      sourceResourceId: 31,
      snapshot: { permissions: [] },
    };
    const release = {
      id: 21,
      status: 'draft',
      scope: 'global',
      items: [
        {
          id: 101,
          resourceVersionId: 11,
          resourceType: 'skill',
          resourceKey: 'customer_query',
          resourceVersion,
        },
      ],
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue(release),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ ...release, status: 'active' }),
      },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainSkillRegistry: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest
        .fn()
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockImplementationOnce((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).resolves.toMatchObject({
      status: 'active',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 10_000,
      timeout: 30_000,
    });
    expect(tx.brainRelease.updateMany).toHaveBeenCalledWith({
      where: { id: 21, status: 'draft' },
      data: { status: 'active', activatedAt: expect.any(Date), failureReason: null },
    });
  });

  it('fails activation when another transaction already claimed the draft', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a',
      resourceType: 'skill',
      resourceKey: 'customer_query',
      sourceResourceId: 31,
      snapshot: { permissions: [] },
    };
    const release = {
      id: 21,
      status: 'draft',
      scope: 'global',
      items: [
        { id: 101, resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_query', resourceVersion },
      ],
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release), updateMany: jest.fn().mockResolvedValue({ count: 0 }), update: jest.fn() },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
      name: 'ConflictException',
      message: 'release_activation_conflict',
    });
  });

  it('rechecks the release gate fingerprint after locking release resources', async () => {
    const originalVersion = {
      id: 11,
      checksum: 'a'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_facts',
      sourceResourceId: null,
      snapshot: {},
    };
    const changedVersion = { ...originalVersion, checksum: 'b'.repeat(64) };
    const originalRelease = {
      id: 21,
      status: 'draft',
      scope: 'percentage',
      items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_facts', resourceVersion: originalVersion }],
    };
    const lockedRelease = {
      ...originalRelease,
      items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_facts', resourceVersion: changedVersion }],
    };
    const evalSummary = passingEvalSummary(originalRelease.items);
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      brainRelease: { findUnique: jest.fn().mockResolvedValue(lockedRelease) },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: evalSummary }) },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(originalRelease) },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: evalSummary }) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
      message: 'release_eval_fingerprint_mismatch',
    });
    expect(tx.brainRelease.findUnique).toHaveBeenCalled();
    expect(tx.brainEvalRun.findFirst).toHaveBeenCalled();
  });

  it('maps three activation serialization conflicts to ConflictException', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_query',
      sourceResourceId: 31,
      snapshot: { permissions: [] },
    };
    const release = {
      id: 21,
      status: 'draft',
      scope: 'global',
      items: [
        {
          id: 101,
          resourceVersionId: 11,
          resourceType: 'skill',
          resourceKey: 'customer_query',
          resourceVersion,
        },
      ],
    };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue(release),
      },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockRejectedValue({ code: 'P2034' }),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
      name: 'ConflictException',
      message: 'release_activation_conflict',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('rejects mixed create-release versions when a legacy semantic resource appears after a non-semantic resource', async () => {
    const versions = [
      { id: 11, resourceType: 'skill', resourceKey: 'customer_query', version: 1, status: 'draft', snapshot: {} },
      { id: 12, resourceType: 'metric', resourceKey: 'paid_revenue', version: 1, status: 'draft', snapshot: {} },
    ];
    const prisma = {
      brainResourceVersion: { findMany: jest.fn().mockResolvedValue(versions) },
      brainRelease: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(
      service.createRelease({
        releaseKey: 'brain-r1',
        scope: 'global',
        rollout: {},
        resourceVersionIds: [11, 12],
        createdBy: 9,
      }),
    ).rejects.toMatchObject({ message: 'business_definition_registry_required:metric' });

    expect(prisma.brainRelease.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks activation when no completed passing eval exists', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'b'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_query',
      sourceResourceId: 31,
      snapshot: {},
    };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({
          id: 21,
          status: 'draft',
          scope: 'global',
          items: [
            {
              id: 101,
              resourceVersionId: 11,
              resourceType: 'skill',
              resourceKey: 'customer_query',
              resourceVersion,
            },
          ],
        }),
      },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
      message: 'release_eval_gate_failed',
    });
    expect(prisma.brainEvalRun.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a passing development sample that is not bound to the full release gate fingerprint', async () => {
    const resourceVersion = {
      id: 11,
      checksum: 'a'.repeat(64),
      resourceType: 'skill',
      resourceKey: 'customer_facts',
      sourceResourceId: null,
      snapshot: {},
    };
    const release = {
      id: 21,
      status: 'draft',
      scope: 'percentage',
      items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_facts', resourceVersion }],
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
      brainEvalRun: {
        findFirst: jest.fn().mockResolvedValue({
          summary: { total: 1, passed: 1, failed: 0, canRelease: true, gateMode: 'development_sample' },
        }),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
      message: 'release_eval_gate_incomplete',
    });
  });

  it('revalidates generated capability lineage and canonical semantics before activation', async () => {
    const resourceVersion = {
      id: 11,
      resourceType: 'skill',
      resourceKey: 'product_sales_ranking',
      sourceResourceId: 31,
      snapshot: { generatedCapability: true, sourceFingerprint: 'a'.repeat(64) },
    };
    const sourceRow = {
      id: 31,
      skillKey: 'product_sales_ranking',
      version: 1,
      sourceFingerprint: 'tampered',
    };
    const semanticVerifier = {
      verifyStoredCapabilities: jest.fn().mockRejectedValue(new Error('generated_capability_source_snapshot_mismatch')),
    };
    const release = {
      id: 21,
      status: 'draft',
      scope: 'global',
      items: [
        {
          id: 101,
          resourceVersionId: 11,
          resourceType: 'skill',
          resourceKey: 'product_sales_ranking',
          resourceVersion,
        },
      ],
    };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue(release),
      },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: {
        findMany: jest.fn().mockResolvedValueOnce([sourceRow]).mockResolvedValueOnce([]),
      },
      $transaction: jest.fn(),
    };
    const service = new BrainReleaseService(prisma as never, semanticVerifier as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toThrow(
      'generated_capability_source_snapshot_mismatch',
    );
    expect(prisma.brainSkillRegistry.findMany).toHaveBeenCalledWith({ where: { id: { in: [31] } } });
    expect(semanticVerifier.verifyStoredCapabilities).toHaveBeenCalledWith([
      { snapshot: resourceVersion.snapshot, sourceRow },
    ]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('batch-loads generated source rows and invokes one semantic snapshot verification per release operation', async () => {
    const versions = [1, 2].map((id) => ({
      id,
      checksum: String(id).repeat(64),
      resourceType: 'skill',
      resourceKey: `generated_${id}`,
      sourceResourceId: id + 30,
      snapshot: { generatedCapability: true },
    }));
    const sourceRows = versions.map((version) => ({ id: version.sourceResourceId, skillKey: version.resourceKey }));
    const semanticVerifier = {
      verifyStoredCapabilities: jest.fn().mockRejectedValue(new Error('stop_after_batch_verification')),
    };
    const release = {
      id: 21,
      status: 'draft',
      scope: 'global',
      items: versions.map((resourceVersion) => ({
        resourceVersionId: resourceVersion.id,
        resourceType: resourceVersion.resourceType,
        resourceKey: resourceVersion.resourceKey,
        resourceVersion,
      })),
    };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue(release),
      },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: passingEvalSummary(release.items) }) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue(sourceRows) },
      $transaction: jest.fn(),
    };
    const service = new BrainReleaseService(prisma as never, semanticVerifier as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toThrow(
      'stop_after_batch_verification',
    );

    expect(prisma.brainSkillRegistry.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.brainSkillRegistry.findMany).toHaveBeenCalledWith({ where: { id: { in: [31, 32] } } });
    expect(semanticVerifier.verifyStoredCapabilities).toHaveBeenCalledTimes(1);
    expect(semanticVerifier.verifyStoredCapabilities).toHaveBeenCalledWith([
      { snapshot: versions[0]!.snapshot, sourceRow: sourceRows[0] },
      { snapshot: versions[1]!.snapshot, sourceRow: sourceRows[1] },
    ]);
  });

  it('rejects mixed activation when the second release item is semantic even if its resource version is not', async () => {
    const tx = {
      brainRelease: { updateMany: jest.fn(), update: jest.fn().mockResolvedValue({ id: 21, status: 'active' }) },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainSkillRegistry: { updateMany: jest.fn(), update: jest.fn() },
      brainInspectionRule: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({
          id: 21,
          status: 'draft',
          scope: 'global',
          items: [
            {
              id: 101,
              resourceVersionId: 11,
              resourceType: 'skill',
              resourceKey: 'customer_query',
              resourceVersion: {
                id: 11,
                resourceType: 'skill',
                resourceKey: 'customer_query',
                sourceResourceId: 31,
                snapshot: {},
              },
            },
            {
              id: 102,
              resourceVersionId: 12,
              resourceType: 'metric',
              resourceKey: 'paid_revenue',
              resourceVersion: {
                id: 12,
                resourceType: 'inspection_rule',
                resourceKey: 'paid_revenue',
                sourceResourceId: 32,
                snapshot: {},
              },
            },
          ],
        }),
      },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: { canRelease: true, total: 1 } }) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
      message: 'business_definition_registry_required:metric',
    });

    expect(prisma.brainEvalRun.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects activation when non-semantic release item and resource version types do not match', async () => {
    const tx = {
      brainRelease: { updateMany: jest.fn(), update: jest.fn().mockResolvedValue({ id: 21, status: 'active' }) },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainAgentProfile: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({
          id: 21,
          status: 'draft',
          scope: 'global',
          items: [
            {
              id: 103,
              resourceVersionId: 11,
              resourceType: 'skill',
              resourceKey: 'shared_key',
              resourceVersion: {
                id: 11,
                resourceType: 'agent_profile',
                resourceKey: 'shared_key',
                sourceResourceId: 31,
                snapshot: {},
              },
            },
          ],
        }),
      },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: { canRelease: true, total: 1 } }) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
      message: 'release_resource_item_mismatch:103',
    });

    expect(prisma.brainEvalRun.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['metric', 'ontology_entity', 'ontology_relation'] as const)(
    'rejects activation when only the resource version side is legacy semantic type %s',
    async (resourceType) => {
      const prisma = {
        brainRelease: {
          findUnique: jest.fn().mockResolvedValue({
            id: 21,
            status: 'draft',
            scope: 'global',
            items: [
              {
                id: 104,
                resourceVersionId: 11,
                resourceType: 'skill',
                resourceKey: 'shared_key',
                resourceVersion: {
                  id: 11,
                  resourceType,
                  resourceKey: 'shared_key',
                  sourceResourceId: 31,
                  snapshot: {},
                },
              },
            ],
          }),
        },
        brainEvalRun: { findFirst: jest.fn() },
        $transaction: jest.fn(),
      };
      const service = new BrainReleaseService(prisma as never);

      await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
        message: `business_definition_registry_required:${resourceType}`,
      });

      expect(prisma.brainEvalRun.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['metric', 'brainMetric'],
    ['ontology_entity', 'brainOntologyEntity'],
    ['ontology_relation', 'brainOntologyRelation'],
  ] as const)(
    'rejects activating a release containing legacy semantic resource %s before transaction or source writes',
    async (resourceType, sourceModel) => {
      const resourceVersion = {
        id: 11,
        resourceType,
        resourceKey: 'legacy_definition',
        sourceResourceId: 31,
        snapshot: {},
      };
      const sourceUpdateMany = jest.fn();
      const sourceUpdate = jest.fn();
      const tx = {
        brainRelease: { updateMany: jest.fn(), update: jest.fn().mockResolvedValue({ id: 21, status: 'active' }) },
        brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
        [sourceModel]: { updateMany: sourceUpdateMany, update: sourceUpdate },
      };
      const prisma = {
        brainRelease: {
          findUnique: jest.fn().mockResolvedValue({
            id: 21,
            status: 'draft',
            scope: 'global',
            items: [{ resourceVersionId: 11, resourceType, resourceKey: 'legacy_definition', resourceVersion }],
          }),
        },
        brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: { canRelease: true, total: 1 } }) },
        role: { findMany: jest.fn().mockResolvedValue([]) },
        brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn((callback) => callback(tx)),
      };
      const service = new BrainReleaseService(prisma as never);

      await expect(service.activateRelease({ releaseId: 21, activatedBy: 9 })).rejects.toMatchObject({
        message: `business_definition_registry_required:${resourceType}`,
      });

      expect(prisma.brainEvalRun.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(sourceUpdateMany).not.toHaveBeenCalled();
      expect(sourceUpdate).not.toHaveBeenCalled();
    },
  );

  it('selects a store-scoped canary only for matching stores', async () => {
    const prisma = {
      brainRelease: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 2,
            releaseKey: 'canary',
            scope: 'store',
            rollout: { storeIds: [6] },
            activatedAt: new Date('2026-07-11'),
            items: [],
          },
          { id: 1, releaseKey: 'stable', scope: 'global', rollout: {}, activatedAt: new Date('2026-07-10'), items: [] },
        ]),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.selectRelease({ storeId: 6, userId: 9, roleKey: 'store_manager' })).resolves.toMatchObject({
      releaseKey: 'canary',
    });
    await expect(service.selectRelease({ storeId: 7, userId: 9, roleKey: 'store_manager' })).resolves.toMatchObject({
      releaseKey: 'stable',
    });
  });

  it('selects a user-scoped canary only for the approved user, store and normalized role', async () => {
    const prisma = {
      brainRelease: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 2,
            releaseKey: 'manager-pilot',
            scope: 'user',
            rollout: { userIds: [28], storeIds: [6], roleKeys: ['store_manager'] },
            activatedAt: new Date('2026-07-11'),
            items: [],
          },
          { id: 1, releaseKey: 'stable', scope: 'global', rollout: {}, activatedAt: new Date('2026-07-10'), items: [] },
        ]),
      },
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.selectRelease({ storeId: 6, userId: 28, roleKey: 'store_manager' })).resolves.toMatchObject({
      releaseKey: 'manager-pilot',
    });
    await expect(service.selectRelease({ storeId: 6, userId: 29, roleKey: 'store_manager' })).resolves.toMatchObject({
      releaseKey: 'stable',
    });
    await expect(service.selectRelease({ storeId: 7, userId: 28, roleKey: 'store_manager' })).resolves.toMatchObject({
      releaseKey: 'stable',
    });
    await expect(service.selectRelease({ storeId: 6, userId: 28, roleKey: 'finance' })).resolves.toMatchObject({
      releaseKey: 'stable',
    });
  });

  it('claims an active release atomically during rollback and retries P2034', async () => {
    const current = { id: 22, status: 'active', previousReleaseId: 21 };
    const previousVersion = {
      id: 11,
      resourceType: 'agent_profile',
      resourceKey: 'store_manager',
      sourceResourceId: 31,
      snapshot: {},
    };
    const previous = {
      id: 21,
      status: 'archived',
      items: [
        {
          resourceVersionId: 11,
          resourceType: 'agent_profile',
          resourceKey: 'store_manager',
          resourceVersion: previousVersion,
        },
      ],
    };
    const tx = {
      brainRelease: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockImplementation(({ where }) => ({ id: where.id, status: 'active', items: [] })),
      },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainAgentProfile: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(previous) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest
        .fn()
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockImplementationOnce((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await service.rollbackRelease({ releaseId: 22, reason: 'test' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 10_000,
      timeout: 30_000,
    });
    expect(tx.brainRelease.updateMany).toHaveBeenCalledWith({
      where: { id: 22, status: 'active' },
      data: { status: 'rolled_back', rolledBackAt: expect.any(Date), failureReason: 'test' },
    });
  });

  it('maps three rollback serialization conflicts to ConflictException', async () => {
    const current = { id: 22, status: 'active', previousReleaseId: 21 };
    const previousVersion = {
      id: 11,
      resourceType: 'agent_profile',
      resourceKey: 'store_manager',
      sourceResourceId: 31,
      snapshot: {},
    };
    const prisma = {
      brainRelease: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce({
            id: 21,
            status: 'archived',
            items: [
              {
                resourceVersionId: 11,
                resourceType: 'agent_profile',
                resourceKey: 'store_manager',
                resourceVersion: previousVersion,
              },
            ],
          }),
      },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockRejectedValue({ code: 'P2034' }),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.rollbackRelease({ releaseId: 22, reason: 'test' })).rejects.toMatchObject({
      name: 'ConflictException',
      message: 'release_rollback_conflict',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('archives the current resource version before restoring the previous release', async () => {
    const current = { id: 22, status: 'active', previousReleaseId: 21 };
    const previousVersion = {
      id: 11,
      resourceType: 'agent_profile',
      resourceKey: 'store_manager',
      sourceResourceId: 31,
    };
    const tx = {
      brainRelease: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockImplementation(({ where }) => ({ id: where.id, status: 'active', items: [] })),
      },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainAgentProfile: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce({
            id: 21,
            items: [
              {
                resourceVersionId: 11,
                resourceType: 'agent_profile',
                resourceKey: 'store_manager',
                resourceVersion: previousVersion,
              },
            ],
          }),
      },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await service.rollbackRelease({ releaseId: 22, reason: 'test' });

    expect(tx.brainResourceVersion.updateMany).toHaveBeenCalledWith({
      where: { resourceType: 'agent_profile', resourceKey: 'store_manager', status: 'active', id: { not: 11 } },
      data: { status: 'archived', archivedAt: expect.any(Date) },
    });
    expect(tx.brainAgentProfile.updateMany).toHaveBeenCalledWith({
      where: { roleKey: 'store_manager', enabled: true },
      data: { enabled: false },
    });
  });

  it('revalidates a previous generated capability against its source row and current published semantics before rollback', async () => {
    const publishedSnapshot = publishedSnapshotFixture();
    const proposal = generatedProposalFixture(publishedSnapshot);
    const staleManifest = { ...proposal.manifest, name: '旧商品销售排行' };
    const sourceRow = {
      id: 31,
      skillKey: staleManifest.key,
      version: staleManifest.version,
      sourceFingerprint: staleManifest.sourceFingerprint,
      name: staleManifest.name,
      description: staleManifest.description,
      domains: staleManifest.domains,
      intents: staleManifest.intents,
      inputSchema: staleManifest.inputSchema,
      outputSchema: staleManifest.outputSchema,
      permissions: staleManifest.requiredPermissions,
      allowedRoles: staleManifest.allowedRoles,
      readOnly: staleManifest.readOnly,
      sideEffect: staleManifest.sideEffect,
      riskLevel: staleManifest.riskLevel,
      requiresConfirmation: staleManifest.requiresConfirmation,
      idempotency: staleManifest.idempotency,
      timeoutMs: staleManifest.timeoutMs,
      grounding: staleManifest.grounding,
      examples: staleManifest.examples,
      definitionRefs: staleManifest.definitionRefs,
      synonyms: staleManifest.synonyms,
      negativeExamples: staleManifest.negativeExamples,
      successSchema: staleManifest.successSchema,
    };
    const resourceVersion = {
      id: 11,
      resourceType: 'skill',
      resourceKey: staleManifest.key,
      sourceResourceId: sourceRow.id,
      snapshot: {
        ...staleManifest,
        generatedCapability: true,
        sourceProposalVersion: 1,
        registryVersion: staleManifest.version,
        resourceKey: staleManifest.key,
      },
    };
    const prisma = {
      brainRelease: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 22, status: 'active', previousReleaseId: 21 })
          .mockResolvedValueOnce({
            id: 21,
            items: [
              {
                id: 201,
                resourceVersionId: resourceVersion.id,
                resourceType: resourceVersion.resourceType,
                resourceKey: resourceVersion.resourceKey,
                resourceVersion,
              },
            ],
          }),
      },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([sourceRow]) },
      $transaction: jest.fn(),
    };
    const snapshotSource = { loadPublishedSnapshot: jest.fn().mockResolvedValue(publishedSnapshot) };
    const semanticVerifier = new BrainCapabilitySemanticVerifierService(snapshotSource as never);
    const service = new BrainReleaseService(prisma as never, semanticVerifier);

    await expect(service.rollbackRelease({ releaseId: 22, reason: 'test' })).rejects.toMatchObject({
      message: 'generated_capability_semantics_mismatch',
    });

    expect(prisma.brainSkillRegistry.findMany).toHaveBeenCalledWith({ where: { id: { in: [sourceRow.id] } } });
    expect(snapshotSource.loadPublishedSnapshot).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks rollback before the transaction when a previous resource permission is no longer registered', async () => {
    const resourceVersion = {
      id: 11,
      resourceType: 'skill',
      resourceKey: 'customer_query',
      sourceResourceId: 31,
      snapshot: { permissions: ['core:customer:retired'] },
    };
    const prisma = {
      brainRelease: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 22, status: 'active', previousReleaseId: 21 })
          .mockResolvedValueOnce({
            id: 21,
            items: [
              {
                id: 201,
                resourceVersionId: resourceVersion.id,
                resourceType: resourceVersion.resourceType,
                resourceKey: resourceVersion.resourceKey,
                resourceVersion,
              },
            ],
          }),
      },
      role: { findMany: jest.fn().mockResolvedValue([{ permissions: ['core:customer:view'] }]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.rollbackRelease({ releaseId: 22, reason: 'test' })).rejects.toMatchObject({
      message: 'release_unregistered_permissions:core:customer:retired',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks rollback before the transaction when a previous agent profile depends on a retired skill', async () => {
    const resourceVersion = {
      id: 11,
      resourceType: 'agent_profile',
      resourceKey: 'store_manager',
      sourceResourceId: 31,
      snapshot: { permissions: ['core:customer:view'], allowedSkills: ['retired_skill'] },
    };
    const prisma = {
      brainRelease: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 22, status: 'active', previousReleaseId: 21 })
          .mockResolvedValueOnce({
            id: 21,
            items: [
              {
                id: 201,
                resourceVersionId: resourceVersion.id,
                resourceType: resourceVersion.resourceType,
                resourceKey: resourceVersion.resourceKey,
                resourceVersion,
              },
            ],
          }),
      },
      role: { findMany: jest.fn().mockResolvedValue([{ permissions: ['core:customer:view'] }]) },
      brainSkillRegistry: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.rollbackRelease({ releaseId: 22, reason: 'test' })).rejects.toMatchObject({
      message: 'release_missing_skills:retired_skill',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['metric', 'brainMetric'],
    ['ontology_entity', 'brainOntologyEntity'],
    ['ontology_relation', 'brainOntologyRelation'],
  ] as const)(
    'rejects rollback to legacy semantic resource %s before transaction or source writes',
    async (resourceType, sourceModel) => {
      const current = { id: 22, status: 'active', previousReleaseId: 21 };
      const resourceVersion = {
        id: 11,
        resourceType,
        resourceKey: 'legacy_definition',
        sourceResourceId: 31,
      };
      const sourceUpdateMany = jest.fn();
      const sourceUpdate = jest.fn();
      const tx = {
        brainRelease: { update: jest.fn() },
        brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
        [sourceModel]: { updateMany: sourceUpdateMany, update: sourceUpdate },
      };
      const prisma = {
        brainRelease: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce(current)
            .mockResolvedValueOnce({
              id: 21,
              items: [{ resourceVersionId: 11, resourceType, resourceKey: 'legacy_definition', resourceVersion }],
            }),
        },
        $transaction: jest.fn((callback) => callback(tx)),
      };
      const service = new BrainReleaseService(prisma as never);

      await expect(service.rollbackRelease({ releaseId: 22, reason: 'test' })).rejects.toMatchObject({
        message: `business_definition_registry_required:${resourceType}`,
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(sourceUpdateMany).not.toHaveBeenCalled();
      expect(sourceUpdate).not.toHaveBeenCalled();
    },
  );

  it('rejects mixed rollback when the second release item is semantic even if its resource version is not', async () => {
    const current = { id: 22, status: 'active', previousReleaseId: 21 };
    const tx = {
      brainRelease: { update: jest.fn().mockResolvedValue({ id: 21, status: 'active' }) },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainAgentProfile: { updateMany: jest.fn(), update: jest.fn() },
      brainInspectionRule: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce({
            id: 21,
            items: [
              {
                id: 201,
                resourceVersionId: 11,
                resourceType: 'agent_profile',
                resourceKey: 'store_manager',
                resourceVersion: {
                  id: 11,
                  resourceType: 'agent_profile',
                  resourceKey: 'store_manager',
                  sourceResourceId: 31,
                },
              },
              {
                id: 202,
                resourceVersionId: 12,
                resourceType: 'ontology_relation',
                resourceKey: 'customer_has_order',
                resourceVersion: {
                  id: 12,
                  resourceType: 'inspection_rule',
                  resourceKey: 'customer_has_order',
                  sourceResourceId: 32,
                },
              },
            ],
          }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.rollbackRelease({ releaseId: 22, reason: 'test' })).rejects.toMatchObject({
      message: 'business_definition_registry_required:ontology_relation',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects rollback when non-semantic release item and resource version keys do not match', async () => {
    const current = { id: 22, status: 'active', previousReleaseId: 21 };
    const tx = {
      brainRelease: { update: jest.fn().mockResolvedValue({ id: 21, status: 'active' }) },
      brainResourceVersion: { updateMany: jest.fn(), update: jest.fn() },
      brainSkillRegistry: { updateMany: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      brainRelease: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce({
            id: 21,
            items: [
              {
                id: 203,
                resourceVersionId: 11,
                resourceType: 'skill',
                resourceKey: 'customer_query',
                resourceVersion: {
                  id: 11,
                  resourceType: 'skill',
                  resourceKey: 'customer_lookup',
                  sourceResourceId: 31,
                },
              },
            ],
          }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainReleaseService(prisma as never);

    await expect(service.rollbackRelease({ releaseId: 22, reason: 'test' })).rejects.toMatchObject({
      message: 'release_resource_item_mismatch:203',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
