import { BrainWarmupArtifactService } from './brain-warmup-artifact.service.js';
import type { BrainCapabilityCandidate } from '../capability/brain-capability.types.js';

const releaseFingerprint = 'a'.repeat(64);
const definitionSetFingerprint = 'b'.repeat(64);
const ontologyFingerprint = 'c'.repeat(64);

function candidate(): BrainCapabilityCandidate {
  return {
    key: 'test_capability',
    executorBinding: undefined,
    definitionRefs: [
      {
        definitionId: 1,
        versionId: 11,
        definitionKey: 'metric.test',
        version: 1,
        definitionFingerprint: 'd'.repeat(64),
        sourceFingerprint: 'e'.repeat(64),
      },
    ],
  } as unknown as BrainCapabilityCandidate;
}

function createHarness() {
  const prisma = {
    brainWarmupArtifact: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const bundle = {
    load: jest.fn().mockResolvedValue({
      versionSetFingerprint: definitionSetFingerprint,
      queryLatencyMs: 7,
      cacheHits: 0,
      cacheMisses: 1,
    }),
  };
  const ontology = {
    getRuntimeDataModelFingerprint: jest.fn().mockReturnValue('f'.repeat(64)),
    loadEvaluationSnapshot: jest.fn().mockResolvedValue({
      productionReady: true,
      fingerprint: ontologyFingerprint,
    }),
    primeEvaluationSnapshot: jest.fn(),
  };
  const catalog = {
    validateEnabledCapabilities: jest.fn().mockResolvedValue({
      valid: true,
      cards: [{ key: 'test_capability' }],
      issues: [],
    }),
    primeValidatedCapabilities: jest.fn(),
  };
  const service = new BrainWarmupArtifactService(prisma as never, bundle as never, ontology as never, catalog as never);
  return { service, prisma, bundle, ontology, catalog };
}

describe('BrainWarmupArtifactService', () => {
  it('coalesces identical builds and does not freeze caller-owned snapshots', async () => {
    const { service, prisma, bundle, ontology, catalog } = createHarness();
    const inputCandidate = candidate();
    const input = {
      releaseId: 416,
      releaseFingerprint,
      versionMap: { skill: 1 },
      candidates: [inputCandidate],
      definitionVersionIds: [11],
    };

    const [first, second] = await Promise.all([service.build(input), service.build(input)]);

    expect(first).toBe(second);
    expect(bundle.load).toHaveBeenCalledTimes(1);
    expect(ontology.loadEvaluationSnapshot).toHaveBeenCalledTimes(1);
    expect(catalog.validateEnabledCapabilities).toHaveBeenCalledTimes(1);
    expect(prisma.brainWarmupArtifact.upsert).toHaveBeenCalledTimes(2);
    expect(Object.isFrozen(inputCandidate)).toBe(false);
    expect(first.source).toBe('computed');
  });

  it('hydrates a checksum-valid persistent artifact and primes runtime caches', async () => {
    const { service, prisma, ontology, catalog } = createHarness();
    await service.build({
      releaseId: 416,
      releaseFingerprint,
      versionMap: { skill: 1 },
      candidates: [candidate()],
      definitionVersionIds: [11],
    });
    const readyUpsert = prisma.brainWarmupArtifact.upsert.mock.calls[1]![0];
    const persisted = JSON.parse(
      JSON.stringify({
        definitionVersionIds: readyUpsert.update.definitionVersionIds,
        candidates: readyUpsert.update.candidates,
        ontologyPayload: readyUpsert.update.ontologyPayload,
        catalogPayload: readyUpsert.update.catalogPayload,
      }),
    );
    prisma.brainWarmupArtifact.findMany.mockResolvedValueOnce([
      {
        releaseId: 416,
        releaseFingerprint,
        versionMapChecksum: readyUpsert.update.versionMapChecksum ?? readyUpsert.create.versionMapChecksum,
        definitionSetFingerprint: readyUpsert.update.definitionSetFingerprint,
        builderVersion: readyUpsert.create.builderVersion,
        definitionVersionIds: persisted.definitionVersionIds,
        candidates: persisted.candidates,
        ontologyPayload: persisted.ontologyPayload,
        catalogPayload: persisted.catalogPayload,
        payloadCompressed: readyUpsert.update.payloadCompressed,
        compression: readyUpsert.update.compression,
        resultChecksum: readyUpsert.update.resultChecksum,
        builtAt: readyUpsert.update.builtAt,
      },
    ]);

    const loaded = await service.loadReady({
      id: 416,
      releaseFingerprint,
      versionMap: { skill: 1 },
    });

    expect(loaded).toMatchObject({ releaseId: 416, source: 'persistent' });
    expect(ontology.primeEvaluationSnapshot).toHaveBeenCalledWith(
      [11],
      definitionSetFingerprint,
      expect.objectContaining({ fingerprint: ontologyFingerprint }),
    );
    expect(catalog.primeValidatedCapabilities).toHaveBeenCalledTimes(1);
  });

  it('rejects a tampered persistent payload checksum', async () => {
    const { service, prisma, ontology, catalog } = createHarness();
    prisma.brainWarmupArtifact.findMany.mockResolvedValueOnce([
      {
        releaseId: 416,
        releaseFingerprint,
        versionMapChecksum: '1'.repeat(64),
        definitionSetFingerprint,
        builderVersion: '2'.repeat(64),
        definitionVersionIds: [11],
        candidates: [candidate()],
        ontologyPayload: { productionReady: true, fingerprint: ontologyFingerprint },
        catalogPayload: { valid: true, cards: [{}], issues: [] },
        payloadCompressed: null,
        compression: null,
        resultChecksum: 'tampered',
        builtAt: new Date(),
      },
    ]);

    await expect(service.loadReady({ id: 416, releaseFingerprint, versionMap: { skill: 1 } })).resolves.toBeNull();
    expect(ontology.primeEvaluationSnapshot).not.toHaveBeenCalled();
    expect(catalog.primeValidatedCapabilities).not.toHaveBeenCalled();
  });

  it('records failed builds and allows the next attempt to retry', async () => {
    const { service, prisma, bundle } = createHarness();
    bundle.load.mockRejectedValueOnce(new Error('definition_load_failed'));
    const input = {
      releaseId: 416,
      releaseFingerprint,
      versionMap: { skill: 1 },
      candidates: [candidate()],
      definitionVersionIds: [11],
    };

    await expect(service.build(input)).rejects.toThrow('definition_load_failed');
    expect(prisma.brainWarmupArtifact.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', errorCode: 'artifact_build_failed' }),
      }),
    );

    await expect(service.build(input)).resolves.toMatchObject({ source: 'computed' });
    expect(bundle.load).toHaveBeenCalledTimes(2);
  });

  it('changes lookup identity when the runtime data model changes', async () => {
    const { service, prisma, ontology } = createHarness();

    await service.loadReady({ id: 416, releaseFingerprint, versionMap: { skill: 1 } });
    const firstBuilderVersion = prisma.brainWarmupArtifact.findMany.mock.calls[0]![0].where.builderVersion;
    ontology.getRuntimeDataModelFingerprint.mockReturnValue('9'.repeat(64));
    await service.loadReady({ id: 416, releaseFingerprint, versionMap: { skill: 1 } });
    const secondBuilderVersion = prisma.brainWarmupArtifact.findMany.mock.calls[1]![0].where.builderVersion;

    expect(secondBuilderVersion).not.toBe(firstBuilderVersion);
  });
});
