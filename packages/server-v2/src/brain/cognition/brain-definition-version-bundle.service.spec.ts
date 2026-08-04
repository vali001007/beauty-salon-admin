import { BrainDefinitionVersionBundleService } from './brain-definition-version-bundle.service.js';

function row(id: number, definitionKey = `metric.test_${id}`) {
  return {
    id,
    version: 1,
    schemaVersion: '1.0',
    payload: {},
    lifecycleStatus: 'validated',
    fingerprint: String(id).padStart(64, 'a').slice(-64),
    sourceFingerprint: String(id).padStart(64, 'b').slice(-64),
    validationStatus: 'passed',
    validationReport: null,
    canonicalQueryRef: null,
    fixtureSetKey: null,
    timezone: 'Asia/Shanghai',
    storeScope: {},
    definition: {
      id: id + 100,
      definitionKey,
      kind: 'metric',
      domain: 'finance',
      name: definitionKey,
      ownerType: 'system',
      ownerId: null,
      currentPublishedVersionId: null,
    },
    evidence: [],
    projections: [],
  };
}

describe('BrainDefinitionVersionBundleService', () => {
  it('loads missing versions once and reuses overlapping rows', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([row(1), row(2)])
      .mockResolvedValueOnce([row(3)]);
    const service = new BrainDefinitionVersionBundleService({
      businessDefinitionVersion: { findMany },
    } as never);

    const first = await service.load([2, 1, 2]);
    const second = await service.load([2, 3]);

    expect(first.versionIds).toEqual([1, 2]);
    expect(first.cacheMisses).toBe(2);
    expect(second.cacheHits).toBe(1);
    expect(second.cacheMisses).toBe(1);
    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: { in: [1, 2] } } }),
    );
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { id: { in: [3] } } }),
    );
  });

  it('coalesces concurrent loads with the same version identity', async () => {
    let resolveRows!: (value: ReturnType<typeof row>[]) => void;
    const findMany = jest.fn().mockReturnValue(
      new Promise<ReturnType<typeof row>[]>((resolve) => {
        resolveRows = resolve;
      }),
    );
    const service = new BrainDefinitionVersionBundleService({
      businessDefinitionVersion: { findMany },
    } as never);

    const first = service.load([7, 8]);
    const second = service.load([8, 7]);
    resolveRows([row(7), row(8)]);

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(firstResult.coalesced).toBe(false);
    expect(secondResult.coalesced).toBe(true);
    expect(secondResult.versionSetFingerprint).toBe(firstResult.versionSetFingerprint);
  });

  it('does not retain a failed loading and can recover on retry', async () => {
    const findMany = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary_failure'))
      .mockResolvedValueOnce([row(9)]);
    const service = new BrainDefinitionVersionBundleService({
      businessDefinitionVersion: { findMany },
    } as never);

    await expect(service.load([9])).rejects.toThrow('temporary_failure');
    await expect(service.load([9])).resolves.toMatchObject({ versionIds: [9], cacheMisses: 1 });
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('invalidates only the requested version rows', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([row(10), row(11)])
      .mockResolvedValueOnce([row(10)]);
    const service = new BrainDefinitionVersionBundleService({
      businessDefinitionVersion: { findMany },
    } as never);

    await service.load([10, 11]);
    service.invalidate([10]);
    const refreshed = await service.load([10, 11]);

    expect(refreshed.cacheHits).toBe(1);
    expect(refreshed.cacheMisses).toBe(1);
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { id: { in: [10] } } }),
    );
  });
});
