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
    rollout: { mode: input.mode ?? 'model' },
    items: (input.definitionVersionIds ?? [11]).map((versionId, index) => ({
      snapshot: {
        key: `capability_${index}`,
        definitionRefs: [{ definitionKey: `metric.test_${index}`, versionId }],
      },
    })),
  };
}

describe('BrainActiveReleaseWarmupService', () => {
  it('warms every active model release before bootstrap is ready and skips rules releases', async () => {
    const activeModel = releaseFixture({ id: 416, definitionVersionIds: [12, 11, 12] });
    const activeRules = releaseFixture({ id: 415, mode: 'rules', definitionVersionIds: [] });
    const findMany = jest.fn().mockResolvedValue([activeModel, activeRules]);
    const ontologyRuntime = {
      loadEvaluationSnapshot: jest.fn().mockResolvedValue({ fingerprint: 'f'.repeat(64) }),
    };
    const capabilityCatalog = { listEnabledCapabilities: jest.fn().mockResolvedValue([{ key: 'test' }]) };
    const service = new BrainActiveReleaseWarmupService(
      { brainRelease: { findMany } } as never,
      ontologyRuntime as never,
      capabilityCatalog as never,
    );

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(findMany).toHaveBeenCalledWith({
      where: { status: 'active' },
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
    const service = new BrainActiveReleaseWarmupService(
      {
        brainRelease: {
          findMany: jest.fn().mockResolvedValue([releaseFixture({ id: 416 })]),
        },
      } as never,
      {
        loadEvaluationSnapshot: jest.fn().mockRejectedValue(new Error('temporary_catalog_failure')),
      } as never,
      { listEnabledCapabilities: jest.fn().mockResolvedValue([]) } as never,
    );

    await expect(service.onApplicationBootstrap()).rejects.toThrow('temporary_catalog_failure');
    expect(service.getStatus()).toMatchObject({
      state: 'failed',
      warmedReleaseCount: 0,
      failureReason: 'temporary_catalog_failure',
    });
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

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'active' } }));
    expect(findUnique).not.toHaveBeenCalled();
    expect(ontologyRuntime.loadEvaluationSnapshot).not.toHaveBeenCalled();
    expect(service.getStatus()).toMatchObject({ state: 'ready', activeReleaseCount: 0, warmedReleaseCount: 0 });
  });

  it('warms a draft only when release activation explicitly names it', async () => {
    const findUnique = jest.fn().mockResolvedValue(
      releaseFixture({ id: 417, status: 'draft', definitionVersionIds: [47, 46] }),
    );
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
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([releaseFixture({ id: 416, definitionVersionIds: [11] })])
      .mockResolvedValueOnce([releaseFixture({ id: 418, definitionVersionIds: [12] })]);
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
});
