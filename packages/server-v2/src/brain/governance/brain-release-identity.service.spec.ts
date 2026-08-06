import { BrainReleaseIdentityService } from './brain-release-identity.service.js';

describe('BrainReleaseIdentityService', () => {
  it('allocates policy codes independently from runtime codes', async () => {
    const counters = new Map<string, number>([['policy', 2], ['runtime', 0]]);
    const releases = new Map<number, Record<string, unknown>>([
      [10, { id: 10, scope: 'governance_policy', releaseKey: 'policy-draft', displayCode: null }],
      [11, { id: 11, scope: 'fixed', releaseKey: 'evaluation-draft', displayCode: null, rollout: { evaluationOnly: true } }],
    ]);
    const sequences = new Map<number, Record<string, unknown>>([
      [20, { id: 20, sequenceKey: 'sequence', runtimeVersionCode: null }],
    ]);
    const tx = {
      brainVersionCounter: {
        upsert: jest.fn(async ({ where }: { where: { family: string } }) => {
          const next = (counters.get(where.family) ?? 0) + 1;
          counters.set(where.family, next);
          return { lastNumber: next };
        }),
      },
      brainRelease: {
        findUnique: jest.fn(async ({ where }: { where: { id: number } }) => releases.get(where.id) ?? null),
        update: jest.fn(async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
          const updated = { ...releases.get(where.id), ...data };
          releases.set(where.id, updated);
          return updated;
        }),
      },
      brainRolloutSequence: {
        findUnique: jest.fn(async ({ where }: { where: { id: number } }) => sequences.get(where.id) ?? null),
        update: jest.fn(async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
          const updated = { ...sequences.get(where.id), ...data };
          sequences.set(where.id, updated);
          return updated;
        }),
      },
    };
    const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
    const service = new BrainReleaseIdentityService(prisma as never);

    await expect(service.assignPolicyIdentity(10, 'Query Only V1 强制治理策略')).resolves.toMatchObject({
      displayCode: 'GP-003',
      releaseFamily: 'policy',
    });
    await expect(service.assignRuntimeIdentity(20, 'Query Only V1', 'query_only_v1')).resolves.toMatchObject({
      runtimeVersionCode: 'RT-001',
      runtimeVersionNumber: 1,
      productProfile: 'query_only_v1',
    });
    await expect(service.assignEvaluationIdentity(11, 'Query Only V1 评测基准')).resolves.toMatchObject({
      displayCode: 'EV-001',
      releaseFamily: 'evaluation',
    });
  });

  it('maps rollout stages to a single runtime product version', () => {
    const service = new BrainReleaseIdentityService({} as never);
    expect(service.productIdentity({
      id: 460,
      scope: 'percentage',
      releaseKey: 'internal-stage-key',
      rolloutStage: 'canary_20',
      rolloutSequence: { runtimeVersionCode: 'RT-001', displayName: 'Query Only V1' },
    })).toEqual({
      family: 'runtime',
      code: 'RT-001',
      stageCode: 'RT-001-C20',
      name: 'Query Only V1',
      internalReleaseId: 460,
    });
  });

  it('keeps database ids only as legacy audit identities', () => {
    const service = new BrainReleaseIdentityService({} as never);
    expect(service.productIdentity({
      id: 452,
      scope: 'percentage',
      releaseKey: 'legacy-runtime',
    })).toMatchObject({ family: 'legacy', code: 'LEGACY-RT-452' });
    expect(service.productIdentity({
      id: 436,
      scope: 'governance_policy',
      releaseKey: 'legacy-policy',
    })).toMatchObject({ family: 'legacy', code: 'LEGACY-GP-436' });
  });

  it('never exposes a code from the wrong product family', () => {
    const service = new BrainReleaseIdentityService({} as never);
    expect(service.productIdentity({
      id: 460,
      scope: 'governance_policy',
      releaseKey: 'corrupted-policy',
      releaseFamily: 'policy',
      displayCode: 'RT-001',
    })).toMatchObject({ family: 'legacy', code: 'LEGACY-GP-460' });
    expect(service.productIdentity({
      id: 461,
      scope: 'percentage',
      releaseKey: 'corrupted-runtime',
      rolloutSequence: { runtimeVersionCode: 'GP-003', displayName: 'Wrong family' },
    })).toMatchObject({ family: 'legacy', code: 'LEGACY-RT-461' });
  });

  it('rejects display names that claim another product family', async () => {
    const releases = new Map<number, Record<string, unknown>>([
      [10, { id: 10, scope: 'governance_policy', releaseKey: 'policy-draft', displayCode: null }],
      [11, { id: 11, scope: 'fixed', releaseKey: 'evaluation-draft', displayCode: null, rollout: { evaluationOnly: true } }],
    ]);
    const sequences = new Map<number, Record<string, unknown>>([
      [20, { id: 20, sequenceKey: 'sequence', runtimeVersionCode: null }],
    ]);
    const tx = {
      brainVersionCounter: { upsert: jest.fn().mockResolvedValue({ lastNumber: 1 }) },
      brainRelease: {
        findUnique: jest.fn(async ({ where }: { where: { id: number } }) => releases.get(where.id) ?? null),
        update: jest.fn(),
      },
      brainRolloutSequence: {
        findUnique: jest.fn(async ({ where }: { where: { id: number } }) => sequences.get(where.id) ?? null),
        update: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
    const service = new BrainReleaseIdentityService(prisma as never);

    await expect(service.assignPolicyIdentity(10, 'Query Only V1 运行版本')).rejects.toThrow('policy_display_name_family_mismatch');
    await expect(service.assignRuntimeIdentity(20, 'Query Only V1 治理策略')).rejects.toThrow('runtime_display_name_family_mismatch');
    await expect(service.assignEvaluationIdentity(11, 'RT-001 回归')).rejects.toThrow('evaluation_display_name_family_mismatch');
  });

  it('generates typed internal keys without exposing database ids', () => {
    const service = new BrainReleaseIdentityService({} as never);
    expect(service.releaseKey({
      family: 'runtime',
      code: 'RT-001',
      name: 'Query Only V1',
      stage: 'canary_05',
      date: '2026-08-04',
    })).toBe('ami-brain-runtime-rt-001-query-only-v1-canary-05-20260804');
    expect(() => service.releaseKey({
      family: 'policy',
      code: 'RT-001',
      name: 'Wrong family',
    })).toThrow('policy_identity_code_mismatch');
    expect(() => service.releaseKey({
      family: 'policy',
      code: 'GP-003',
      name: 'Policy',
      stage: 'shadow',
    })).toThrow('release_stage_runtime_only');
  });

  it('rejects an existing identity that was stored under the wrong family', async () => {
    const tx = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({
          id: 10,
          scope: 'governance_policy',
          releaseKey: 'policy-draft',
          releaseFamily: 'runtime',
          displayCode: 'RT-001',
        }),
      },
    };
    const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
    const service = new BrainReleaseIdentityService(prisma as never);

    await expect(service.assignPolicyIdentity(10, 'Query Only V1 强制治理策略'))
      .rejects.toThrow('policy_identity_family_mismatch');
  });

  it('allocates the explicitly reserved GP-003 and RT-001 identities', async () => {
    const releases = new Map<number, Record<string, unknown>>([
      [10, { id: 10, scope: 'governance_policy', releaseKey: 'policy-draft', displayCode: null }],
    ]);
    const sequences = new Map<number, Record<string, unknown>>([
      [20, { id: 20, sequenceKey: 'runtime-draft', runtimeVersionCode: null }],
    ]);
    const counters = new Map<string, number>([['policy', 2], ['runtime', 0]]);
    const tx = {
      brainVersionCounter: {
        findUnique: jest.fn(async ({ where }: { where: { family: string } }) => ({
          lastNumber: counters.get(where.family) ?? 0,
        })),
        upsert: jest.fn(async ({ where }: { where: { family: string } }) => {
          const next = (counters.get(where.family) ?? 0) + 1;
          counters.set(where.family, next);
          return { lastNumber: next };
        }),
      },
      brainRelease: {
        findUnique: jest.fn(async ({ where }: { where: { id: number } }) => releases.get(where.id) ?? null),
        update: jest.fn(async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
          const updated = { ...releases.get(where.id), ...data };
          releases.set(where.id, updated);
          return updated;
        }),
      },
      brainRolloutSequence: {
        findUnique: jest.fn(async ({ where }: { where: { id: number } }) => sequences.get(where.id) ?? null),
        update: jest.fn(async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
          const updated = { ...sequences.get(where.id), ...data };
          sequences.set(where.id, updated);
          return updated;
        }),
      },
    };
    const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
    const service = new BrainReleaseIdentityService(prisma as never);

    await expect(service.assignPolicyIdentity(10, 'Query Only V1 强制治理策略', 'GP-003'))
      .resolves.toMatchObject({ displayCode: 'GP-003', releaseFamily: 'policy' });
    await expect(service.assignRuntimeIdentity(20, 'Query Only V1', 'query_only_v1', 'RT-001'))
      .resolves.toMatchObject({ runtimeVersionCode: 'RT-001', runtimeVersionNumber: 1 });
  });

  it('rejects an expected code when the release or sequence already owns a different identity', async () => {
    const tx = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({
          id: 10,
          scope: 'governance_policy',
          releaseKey: 'policy-draft',
          releaseFamily: 'policy',
          displayCode: 'GP-004',
          displayName: 'Another Policy',
        }),
      },
      brainRolloutSequence: {
        findUnique: jest.fn().mockResolvedValue({
          id: 20,
          runtimeVersionNumber: 2,
          runtimeVersionCode: 'RT-002',
          displayName: 'Another Runtime',
        }),
      },
    };
    const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
    const service = new BrainReleaseIdentityService(prisma as never);

    await expect(service.assignPolicyIdentity(10, 'Query Only V1 强制治理策略', 'GP-003'))
      .rejects.toThrow('policy_identity_expected_code_mismatch:GP-003:GP-004');
    await expect(service.assignRuntimeIdentity(20, 'Query Only V1', 'query_only_v1', 'RT-001'))
      .rejects.toThrow('runtime_identity_expected_code_mismatch:RT-001:RT-002');
  });

  it('rejects GP-003 when its counter has already been consumed', async () => {
    const tx = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({
          id: 10,
          scope: 'governance_policy',
          releaseKey: 'policy-draft',
          displayCode: null,
        }),
        update: jest.fn(),
      },
      brainVersionCounter: {
        findUnique: jest.fn().mockResolvedValue({ lastNumber: 3 }),
        upsert: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
    const service = new BrainReleaseIdentityService(prisma as never);

    await expect(service.assignPolicyIdentity(10, 'Query Only V1 强制治理策略', 'GP-003'))
      .rejects.toThrow('policy_identity_expected_code_unavailable:GP-003');
    expect(tx.brainVersionCounter.upsert).not.toHaveBeenCalled();
    expect(tx.brainRelease.update).not.toHaveBeenCalled();
  });

  it('detects an expected-code race after the availability precheck', async () => {
    const tx = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue({
          id: 10,
          scope: 'governance_policy',
          releaseKey: 'policy-draft',
          displayCode: null,
        }),
        update: jest.fn(),
      },
      brainVersionCounter: {
        findUnique: jest.fn().mockResolvedValue({ lastNumber: 2 }),
        upsert: jest.fn().mockResolvedValue({ lastNumber: 4 }),
      },
    };
    const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)) };
    const service = new BrainReleaseIdentityService(prisma as never);

    await expect(service.assignPolicyIdentity(10, 'Query Only V1 强制治理策略', 'GP-003'))
      .rejects.toThrow('policy_identity_expected_code_raced:GP-003');
    expect(tx.brainRelease.update).not.toHaveBeenCalled();
  });

  it('retries a serializable conflict while reserving GP-003', async () => {
    const release = { id: 10, scope: 'governance_policy', releaseKey: 'policy-draft', displayCode: null };
    const tx = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue(release),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...release, ...data })),
      },
      brainVersionCounter: {
        findUnique: jest.fn().mockResolvedValue({ lastNumber: 2 }),
        upsert: jest.fn().mockResolvedValue({ lastNumber: 3 }),
      },
    };
    const prisma = {
      $transaction: jest.fn()
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockImplementationOnce(async (work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = new BrainReleaseIdentityService(prisma as never);

    await expect(service.assignPolicyIdentity(10, 'Query Only V1 强制治理策略', 'GP-003'))
      .resolves.toMatchObject({ displayCode: 'GP-003' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('retries a serializable allocation conflict without skipping or duplicating the next code', async () => {
    const release = { id: 10, scope: 'governance_policy', releaseKey: 'policy-draft', displayCode: null };
    let counter = 2;
    const tx = {
      brainRelease: {
        findUnique: jest.fn().mockResolvedValue(release),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...release, ...data })),
      },
      brainVersionCounter: {
        upsert: jest.fn(async () => ({ lastNumber: ++counter })),
      },
    };
    const prisma = {
      $transaction: jest.fn()
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockImplementationOnce(async (work: (client: typeof tx) => unknown) => work(tx)),
    };
    const service = new BrainReleaseIdentityService(prisma as never);

    await expect(service.assignPolicyIdentity(10, 'Query Only V1')).resolves.toMatchObject({ displayCode: 'GP-003' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
