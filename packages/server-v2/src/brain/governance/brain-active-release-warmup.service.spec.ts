import { BrainActiveReleaseWarmupService } from './brain-active-release-warmup.service.js';

function releaseFixture(input: {
  id: number;
  status?: 'active' | 'draft' | 'archived' | 'rolled_back';
  mode?: 'model' | 'shadow' | 'rules';
  definitionVersionIds?: number[];
}) {
  return {
    id: input.id,
    status: input.status ?? 'active',
    scope: 'percentage',
    versionMap: { skill: input.id },
    rollout: { mode: input.mode ?? 'model' },
    items: (input.definitionVersionIds ?? [11]).map((versionId, index) => ({
      resourceVersionId: input.id * 100 + index,
      resourceType: 'skill',
      resourceKey: `capability_${index}`,
      resourceVersion: { checksum: String(versionId).padStart(64, '0') },
      snapshot: {
        key: `capability_${index}`,
        definitionRefs: [{ definitionKey: `metric.test_${index}`, versionId }],
      },
    })),
  };
}

function automaticPrisma(releases: ReturnType<typeof releaseFixture>[]) {
  return {
    brainRelease: {
      findMany: jest.fn().mockResolvedValue(releases),
    },
  };
}

describe('BrainActiveReleaseWarmupService', () => {
  it('skips unrelated active runtime warmup inside the release pilot process', async () => {
    const previous = process.env.BRAIN_RELEASE_PILOT_MODE;
    process.env.BRAIN_RELEASE_PILOT_MODE = 'true';
    const findMany = jest.fn();
    const service = new BrainActiveReleaseWarmupService(
      { brainRelease: { findMany } } as never,
      { loadEvaluationSnapshot: jest.fn() } as never,
      { listEnabledCapabilities: jest.fn() } as never,
    );

    try {
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
      expect(findMany).not.toHaveBeenCalled();
      expect(service.getStatus()).toMatchObject({
        state: 'ready',
        activeReleaseCount: 0,
        warmedReleaseCount: 0,
        releases: [],
        failureReason: null,
      });
    } finally {
      if (previous === undefined) delete process.env.BRAIN_RELEASE_PILOT_MODE;
      else process.env.BRAIN_RELEASE_PILOT_MODE = previous;
    }
  });

  it('warms every active model release before bootstrap is ready and skips rules releases', async () => {
    const activeModel = releaseFixture({ id: 416, definitionVersionIds: [12, 11, 12] });
    const activeRules = releaseFixture({ id: 415, mode: 'rules', definitionVersionIds: [] });
    const prisma = automaticPrisma([activeModel, activeRules]);
    const ontologyRuntime = {
      loadEvaluationSnapshot: jest.fn().mockResolvedValue({ fingerprint: 'f'.repeat(64) }),
    };
    const capabilityCatalog = { listEnabledCapabilities: jest.fn().mockResolvedValue([{ key: 'test' }]) };
    const service = new BrainActiveReleaseWarmupService(
      prisma as never,
      ontologyRuntime as never,
      capabilityCatalog as never,
    );

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(prisma.brainRelease.findMany).toHaveBeenCalledWith({
      where: { status: 'active', scope: { in: ['global', 'store', 'user', 'role', 'percentage'] } },
      orderBy: { activatedAt: 'desc' },
      select: expect.any(Object),
    });
    expect(ontologyRuntime.loadEvaluationSnapshot).toHaveBeenCalledTimes(1);
    expect(ontologyRuntime.loadEvaluationSnapshot).toHaveBeenCalledWith([11, 12]);
    expect(capabilityCatalog.listEnabledCapabilities).toHaveBeenCalledTimes(1);
    expect(service.getStatus()).toMatchObject({
      state: 'ready',
      activeReleaseCount: 2,
      warmedReleaseCount: 1,
      releases: [{ releaseId: 416, releaseStatus: 'active', definitionVersionIds: [11, 12] }],
      failureReason: null,
    });
  });

  it('does not report ready when an active ontology snapshot fails to warm', async () => {
    const previousFailFast = process.env.BRAIN_ACTIVE_RELEASE_WARMUP_FAIL_FAST;
    const previousMaxAttempts = process.env.BRAIN_ACTIVE_RELEASE_WARMUP_MAX_ATTEMPTS;
    process.env.BRAIN_ACTIVE_RELEASE_WARMUP_FAIL_FAST = 'true';
    process.env.BRAIN_ACTIVE_RELEASE_WARMUP_MAX_ATTEMPTS = '1';
    const service = new BrainActiveReleaseWarmupService(
      automaticPrisma([releaseFixture({ id: 416 })]) as never,
      {
        loadEvaluationSnapshot: jest.fn().mockRejectedValue(new Error('temporary_catalog_failure')),
      } as never,
      { listEnabledCapabilities: jest.fn().mockResolvedValue([]) } as never,
    );

    try {
      await expect(service.onApplicationBootstrap()).rejects.toThrow('temporary_catalog_failure');
      expect(service.getStatus()).toMatchObject({
        state: 'failed',
        warmedReleaseCount: 0,
        failureReason: 'temporary_catalog_failure',
      });
    } finally {
      restoreEnv('BRAIN_ACTIVE_RELEASE_WARMUP_FAIL_FAST', previousFailFast);
      restoreEnv('BRAIN_ACTIVE_RELEASE_WARMUP_MAX_ATTEMPTS', previousMaxAttempts);
    }
  });

  it('retries a transient database connection failure and recovers', async () => {
    const previousFailFast = process.env.BRAIN_ACTIVE_RELEASE_WARMUP_FAIL_FAST;
    const previousMaxAttempts = process.env.BRAIN_ACTIVE_RELEASE_WARMUP_MAX_ATTEMPTS;
    const previousDelay = process.env.BRAIN_ACTIVE_RELEASE_WARMUP_RETRY_DELAY_MS;
    process.env.BRAIN_ACTIVE_RELEASE_WARMUP_FAIL_FAST = 'true';
    process.env.BRAIN_ACTIVE_RELEASE_WARMUP_MAX_ATTEMPTS = '2';
    process.env.BRAIN_ACTIVE_RELEASE_WARMUP_RETRY_DELAY_MS = '1';
    const findMany = jest
      .fn()
      .mockRejectedValueOnce(new Error('timeout exceeded when trying to connect'))
      .mockResolvedValueOnce([]);
    const service = new BrainActiveReleaseWarmupService(
      { brainRelease: { findMany } } as never,
      { loadEvaluationSnapshot: jest.fn() } as never,
      { listEnabledCapabilities: jest.fn() } as never,
    );

    try {
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
      expect(findMany).toHaveBeenCalledTimes(2);
      expect(service.getStatus()).toMatchObject({ state: 'ready', failureReason: null });
    } finally {
      restoreEnv('BRAIN_ACTIVE_RELEASE_WARMUP_FAIL_FAST', previousFailFast);
      restoreEnv('BRAIN_ACTIVE_RELEASE_WARMUP_MAX_ATTEMPTS', previousMaxAttempts);
      restoreEnv('BRAIN_ACTIVE_RELEASE_WARMUP_RETRY_DELAY_MS', previousDelay);
    }
  });

  it('keeps local development alive in a failed readiness state after retries are exhausted', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousFailFast = process.env.BRAIN_ACTIVE_RELEASE_WARMUP_FAIL_FAST;
    const previousMaxAttempts = process.env.BRAIN_ACTIVE_RELEASE_WARMUP_MAX_ATTEMPTS;
    process.env.NODE_ENV = 'development';
    delete process.env.BRAIN_ACTIVE_RELEASE_WARMUP_FAIL_FAST;
    process.env.BRAIN_ACTIVE_RELEASE_WARMUP_MAX_ATTEMPTS = '1';
    const service = new BrainActiveReleaseWarmupService(
      {
        brainRelease: {
          findMany: jest.fn().mockRejectedValue(new Error('temporary_catalog_failure')),
        },
      } as never,
      { loadEvaluationSnapshot: jest.fn() } as never,
      { listEnabledCapabilities: jest.fn() } as never,
    );

    try {
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
      expect(service.getStatus()).toMatchObject({
        state: 'failed',
        failureReason: 'temporary_catalog_failure',
      });
    } finally {
      restoreEnv('NODE_ENV', previousNodeEnv);
      restoreEnv('BRAIN_ACTIVE_RELEASE_WARMUP_FAIL_FAST', previousFailFast);
      restoreEnv('BRAIN_ACTIVE_RELEASE_WARMUP_MAX_ATTEMPTS', previousMaxAttempts);
    }
  });

  it('never discovers draft candidates during automatic production warmup', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const findUnique = jest.fn().mockResolvedValue(releaseFixture({ id: 417, status: 'draft' }));
    const ontologyRuntime = {
      loadEvaluationSnapshot: jest.fn().mockResolvedValue({ fingerprint: 'a'.repeat(64) }),
    };
    const service = new BrainActiveReleaseWarmupService(
      { brainRelease: { findMany, findUnique } } as never,
      ontologyRuntime as never,
      { listEnabledCapabilities: jest.fn().mockResolvedValue([]) } as never,
    );

    await service.warmActiveReleases();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'active', scope: { in: ['global', 'store', 'user', 'role', 'percentage'] } },
      }),
    );
    expect(findUnique).not.toHaveBeenCalled();
    expect(ontologyRuntime.loadEvaluationSnapshot).not.toHaveBeenCalled();
    expect(service.getStatus()).toMatchObject({ state: 'ready', activeReleaseCount: 0, warmedReleaseCount: 0 });
  });

  it('warms a draft only when release activation explicitly names it', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue(releaseFixture({ id: 417, status: 'draft', definitionVersionIds: [47, 46] }));
    const ontologyRuntime = {
      loadEvaluationSnapshot: jest.fn().mockResolvedValue({ fingerprint: 'b'.repeat(64) }),
    };
    const service = new BrainActiveReleaseWarmupService(
      { brainRelease: { findUnique } } as never,
      ontologyRuntime as never,
      { listEnabledCapabilities: jest.fn().mockResolvedValue([{ key: 'test' }]) } as never,
    );

    await expect(service.warmRelease({ releaseId: 417, expectedStatus: 'draft' })).resolves.toMatchObject({
      releaseId: 417,
      releaseStatus: 'draft',
      definitionVersionIds: [46, 47],
    });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 417 }, select: expect.any(Object) });
  });

  it('loads the new definition set after the active release changes', async () => {
    const firstRelease = releaseFixture({ id: 416, definitionVersionIds: [11] });
    const secondRelease = releaseFixture({ id: 418, definitionVersionIds: [12] });
    const findMany = jest.fn().mockResolvedValueOnce([firstRelease]).mockResolvedValueOnce([secondRelease]);
    const ontologyRuntime = {
      loadEvaluationSnapshot: jest.fn().mockResolvedValue({ fingerprint: 'c'.repeat(64) }),
    };
    const service = new BrainActiveReleaseWarmupService(
      { brainRelease: { findMany } } as never,
      ontologyRuntime as never,
      { listEnabledCapabilities: jest.fn().mockResolvedValue([{ key: 'test' }]) } as never,
    );

    await service.warmActiveReleases();
    await service.warmActiveReleases();

    expect(ontologyRuntime.loadEvaluationSnapshot).toHaveBeenNthCalledWith(1, [11]);
    expect(ontologyRuntime.loadEvaluationSnapshot).toHaveBeenNthCalledWith(2, [12]);
    expect(service.getStatus()).toMatchObject({
      state: 'ready',
      releases: [{ releaseId: 418, definitionVersionIds: [12] }],
    });
  });

  it('preloads the union of active release definition versions before parallel warmup', async () => {
    const firstRelease = releaseFixture({ id: 451, definitionVersionIds: [11, 12] });
    const secondRelease = releaseFixture({ id: 452, definitionVersionIds: [12, 13] });
    const prisma = automaticPrisma([firstRelease, secondRelease]);
    const ontologyRuntime = {
      loadEvaluationSnapshot: jest.fn().mockResolvedValue({ fingerprint: 'd'.repeat(64) }),
    };
    const capabilityCatalog = {
      listEnabledCapabilities: jest.fn().mockResolvedValue([{ key: 'test' }]),
    };
    const bundle = { load: jest.fn().mockResolvedValue({ rows: [] }) };
    const service = new BrainActiveReleaseWarmupService(
      prisma as never,
      ontologyRuntime as never,
      capabilityCatalog as never,
      bundle as never,
    );

    await service.warmActiveReleases();

    expect(bundle.load).toHaveBeenCalledWith([11, 12, 13]);
    expect(bundle.load.mock.invocationCallOrder[0]).toBeLessThan(
      ontologyRuntime.loadEvaluationSnapshot.mock.invocationCallOrder[0],
    );
    expect(service.getStatus()).toMatchObject({
      state: 'ready',
      activeReleaseCount: 2,
      warmedReleaseCount: 2,
      phases: expect.objectContaining({ definitionPreloadMs: expect.any(Number) }),
    });
  });

  it('uses persistent artifacts without fetching release snapshots or definition bundles', async () => {
    const previousPipeline = process.env.BRAIN_ONTOLOGY_WARMUP_PIPELINE;
    process.env.BRAIN_ONTOLOGY_WARMUP_PIPELINE = 'artifact';
    const release = releaseFixture({ id: 452, definitionVersionIds: [12, 13] });
    const findMany = jest.fn().mockResolvedValueOnce([release]);
    const artifact = {
      loadReadyMany: jest.fn().mockResolvedValue(
        new Map([
          [
            452,
            {
              releaseId: 452,
              releaseFingerprint: 'a'.repeat(64),
              versionMapChecksum: 'b'.repeat(64),
              definitionSetFingerprint: 'c'.repeat(64),
              definitionVersionIds: [12, 13],
              candidates: [],
              ontology: { productionReady: true, fingerprint: 'd'.repeat(64) },
              catalog: { valid: true, cards: [{ key: 'test' }], issues: [] },
              source: 'persistent',
              builtAt: new Date().toISOString(),
              ontologyLatencyMs: 0,
              capabilityCatalogLatencyMs: 0,
            },
          ],
        ]),
      ),
      loadReady: jest.fn(),
      build: jest.fn(),
    };
    const bundle = { load: jest.fn() };
    const service = new BrainActiveReleaseWarmupService(
      { brainRelease: { findMany } } as never,
      { loadEvaluationSnapshot: jest.fn() } as never,
      { listEnabledCapabilities: jest.fn() } as never,
      bundle as never,
      artifact as never,
    );

    try {
      await service.warmActiveReleases();
      expect(findMany).toHaveBeenCalledTimes(1);
      expect(bundle.load).not.toHaveBeenCalled();
      expect(artifact.build).not.toHaveBeenCalled();
      expect(service.getStatus()).toMatchObject({
        state: 'ready',
        warmedReleaseCount: 1,
        releases: [{ releaseId: 452, artifactSource: 'persistent' }],
      });
    } finally {
      restoreEnv('BRAIN_ONTOLOGY_WARMUP_PIPELINE', previousPipeline);
    }
  });

  it('builds and persists only releases that miss the artifact lookup', async () => {
    const previousPipeline = process.env.BRAIN_ONTOLOGY_WARMUP_PIPELINE;
    process.env.BRAIN_ONTOLOGY_WARMUP_PIPELINE = 'artifact';
    const release = releaseFixture({ id: 452, definitionVersionIds: [12, 13] });
    const findMany = jest.fn().mockResolvedValueOnce([release]).mockResolvedValueOnce([release]);
    const artifactResult = {
      releaseId: 452,
      releaseFingerprint: 'a'.repeat(64),
      versionMapChecksum: 'b'.repeat(64),
      definitionSetFingerprint: 'c'.repeat(64),
      definitionVersionIds: [12, 13],
      candidates: [],
      ontology: { productionReady: true, fingerprint: 'd'.repeat(64) },
      catalog: { valid: true, cards: [{ key: 'test' }], issues: [] },
      source: 'computed',
      builtAt: new Date().toISOString(),
      ontologyLatencyMs: 3,
      capabilityCatalogLatencyMs: 4,
    };
    const artifact = {
      loadReadyMany: jest.fn().mockResolvedValue(new Map()),
      loadReady: jest.fn().mockResolvedValue(null),
      build: jest.fn().mockResolvedValue(artifactResult),
    };
    const bundle = { load: jest.fn().mockResolvedValue({}) };
    const service = new BrainActiveReleaseWarmupService(
      { brainRelease: { findMany } } as never,
      { loadEvaluationSnapshot: jest.fn() } as never,
      { listEnabledCapabilities: jest.fn() } as never,
      bundle as never,
      artifact as never,
    );

    try {
      await service.warmActiveReleases();
      expect(findMany).toHaveBeenCalledTimes(2);
      expect(artifact.build).toHaveBeenCalledWith(
        expect.objectContaining({ releaseId: 452, definitionVersionIds: [12, 13] }),
      );
      expect(service.getStatus()).toMatchObject({
        state: 'ready',
        warmedReleaseCount: 1,
        releases: [{ releaseId: 452, artifactSource: 'computed' }],
      });
    } finally {
      restoreEnv('BRAIN_ONTOLOGY_WARMUP_PIPELINE', previousPipeline);
    }
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
