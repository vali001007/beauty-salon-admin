import { BrainRuntimeConfigService } from '../config/brain-runtime-config.service.js';
import type { BrainSemanticIntent } from '../cognition/brain-semantic-intent.types.js';
import { BrainSingleStepPlannerService } from '../planning/brain-single-step-planner.service.js';
import { BrainReleaseService } from '../governance/brain-release.service.js';
import { createReleaseFingerprint } from '../governance/brain-capability-regeneration-fingerprint.js';
import { BrainSkillRegistryService } from '../skills/brain-skill-registry.service.js';
import { BrainCapabilityCatalogService } from './brain-capability-catalog.service.js';
import { BrainCapabilityRetrieverService } from './brain-capability-retriever.service.js';
import { BrainCapabilitySemanticVerifierService } from './brain-capability-semantic-verifier.service.js';
import { BrainGeneratedCapabilityDraftService } from './brain-generated-capability-draft.service.js';
import { generatedProposalFixture, publishedSnapshotFixture } from './brain-generated-capability.test-fixtures.js';

describe('generated capability trusted flow', () => {
  it('runs proposal -> draft row -> catalog -> retriever -> single-step planner without a hand-built card', async () => {
    const rows: Array<Record<string, any>> = [];
    const resourceVersions: Array<Record<string, any>> = [];
    const release = {
      id: 51,
      status: 'draft',
      scope: 'global',
      items: [] as Array<Record<string, any>>,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      brainSkillRegistry: {
        create: jest.fn(async ({ data }) => {
          const row = { id: rows.length + 1, ...data, createdAt: new Date(), updatedAt: new Date() };
          rows.push(row);
          return row;
        }),
        groupBy: jest.fn(async ({ where }) => {
          const enabled = rows.filter(
            (row) => row.enabled && (where.sourceFingerprint === undefined || row.sourceFingerprint),
          );
          return enabled.map((row) => ({ skillKey: row.skillKey, _max: { version: row.version } }));
        }),
        findMany: jest.fn(async ({ where }) =>
          rows.filter(
            (row) =>
              row.enabled &&
              (where.sourceFingerprint === undefined || row.sourceFingerprint) &&
              (!where.OR ||
                where.OR.some(
                  (item: { skillKey: string; version: number }) =>
                    item.skillKey === row.skillKey && item.version === row.version,
                )),
          ),
        ),
        updateMany: jest.fn(async ({ where, data }) => {
          for (const row of rows) {
            if (row.skillKey === where.skillKey && row.enabled === where.enabled) Object.assign(row, data);
          }
          return { count: 1 };
        }),
        update: jest.fn(async ({ where, data }) => {
          const row = rows.find((item) => item.id === where.id)!;
          Object.assign(row, data);
          return row;
        }),
      },
      brainResourceVersion: {
        findFirst: jest.fn(async () => resourceVersions.at(-1) ?? null),
        create: jest.fn(async ({ data }) => {
          const row = { id: resourceVersions.length + 1, ...data };
          resourceVersions.push(row);
          return row;
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(async ({ where, data }) => {
          const row = resourceVersions.find((item) => item.id === where.id)!;
          Object.assign(row, data);
          return row;
        }),
      },
      brainRelease: {
        findUnique: jest.fn(async () => release),
        updateMany: jest.fn(async ({ where, data }) => {
          if (where.id === release.id && release.status === where.status) {
            Object.assign(release, data);
            return { count: 1 };
          }
          return { count: 0 };
        }),
        update: jest.fn(async ({ data }) => ({ ...release, ...data })),
      },
      brainEvalRun: { findFirst: jest.fn(async () => ({ summary: passingEvalSummary(release.items) })) },
      brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(tx)),
      brainRelease: { findUnique: jest.fn(async () => release) },
      brainEvalRun: { findFirst: jest.fn(async () => ({ summary: passingEvalSummary(release.items) })) },
      role: { findMany: jest.fn().mockResolvedValue([{ permissions: ['core:metric:view'] }]) },
      brainSkillRegistry: {
        findMany: jest.fn(async ({ where }) => {
          if (where.id?.in) return rows.filter((row) => where.id.in.includes(row.id));
          return rows.filter((row) => row.enabled);
        }),
      },
    };
    const publishedSnapshot = publishedSnapshotFixture();
    const snapshotSource = { loadPublishedSnapshot: jest.fn().mockResolvedValue(publishedSnapshot) };
    const generated = generatedProposalFixture(publishedSnapshot);
    const semanticVerifier = new BrainCapabilitySemanticVerifierService(snapshotSource as never);
    const publishedGate = {
      verify: jest.fn(async ({ proposal }) => semanticVerifier.verifyProposal(proposal)),
    };
    const draftService = new BrainGeneratedCapabilityDraftService(prisma as never, publishedGate as never);
    await draftService.createDraft({ proposal: generated, createdBy: 9 });
    release.items = [
      {
        id: 61,
        resourceVersionId: resourceVersions[0]!.id,
        resourceType: 'skill',
        resourceKey: generated.capabilityKey,
        resourceVersion: resourceVersions[0],
      },
    ];
    await new BrainReleaseService(prisma as never, semanticVerifier).activateRelease({
      releaseId: release.id,
      activatedBy: 9,
    });

    const registry = new BrainSkillRegistryService(prisma as never);
    const runtime = {
      runtime: {
        cognitionMode: 'model',
        plannerMode: 'model',
        capabilityTopK: 5,
        capabilityMinConfidence: 0.3,
      },
    } as BrainRuntimeConfigService;
    const catalog = new BrainCapabilityCatalogService(
      registry,
      runtime,
      new Set(['core:metric:view']),
      semanticVerifier as never,
    );
    const cards = await catalog.listEnabledCapabilities();
    const retriever = new BrainCapabilityRetrieverService(runtime);
    const intent = semanticIntent(publishedSnapshot);
    const retrieval = retriever.retrieve({
      intent,
      question: '本月商品销售排行',
      context: {
        userId: 9,
        storeId: 6,
        visibleStoreIds: [6],
        roles: ['store_manager'],
        permissions: ['core:metric:view'],
        deniedPermissions: [],
        requestId: 'integration',
        timezone: 'Asia/Shanghai',
      },
      cards,
    });
    const planning = new BrainSingleStepPlannerService().plan({ intent, retrieval });

    expect(rows[0]).toMatchObject({ skillKey: 'product_sales_ranking', sourceFingerprint: 'f'.repeat(64) });
    expect(snapshotSource.loadPublishedSnapshot).toHaveBeenCalledTimes(3);
    expect(tx.brainRelease.updateMany).toHaveBeenCalledWith({
      where: { id: release.id, status: 'draft' },
      data: { status: 'active', activatedAt: expect.any(Date), failureReason: null },
    });
    expect(retrieval).toMatchObject({ status: 'selected', selected: { key: 'product_sales_ranking' } });
    expect(planning).toMatchObject({
      status: 'planned',
      plan: { nodes: [{ capabilityKey: 'product_sales_ranking', previewOnly: false }] },
    });
  });
});

function passingEvalSummary(items: Array<Record<string, any>>) {
  return {
    canRelease: true,
    total: items.length,
    gateMode: 'release_gate',
    coverageComplete: true,
    releaseFingerprint: createReleaseFingerprint(items as never),
    requiredCapabilityKeys: items.map((item) => item.resourceKey).sort(),
    requiredCaseKeys: ['release_gate_case'],
    releaseGate: { passed: true },
  };
}

function semanticIntent(snapshot: ReturnType<typeof publishedSnapshotFixture>): BrainSemanticIntent {
  const definition = snapshot.definitions[0]!;
  return {
    schemaVersion: '1.0',
    objective: '查询本月商品销售排行',
    domains: ['sales'],
    intent: 'ranking',
    entities: [],
    metrics: [
      {
        definitionType: 'metric',
        definitionKey: definition.definitionKey,
        definitionVersion: definition.version,
        definitionFingerprint: definition.fingerprint,
        sourceFingerprint: definition.sourceFingerprint,
      },
    ],
    dimensions: [],
    filters: [],
    orderBy: [],
    limit: 10,
    answerShape: 'ranking',
    successCriteria: [],
    ambiguities: [],
    missingSlots: [],
    assumptions: [],
    confidence: 0.95,
    decisionSummary: '商品销量排行',
  };
}
