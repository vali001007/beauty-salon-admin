import { BrainSemanticCandidateSyncService } from './brain-semantic-candidate-sync.service.js';

describe('BrainSemanticCandidateSyncService', () => {
  it('creates safe drafts, records blocked candidates for review and skips unchanged fingerprints', async () => {
    const prisma = {
      businessDefinition: { findUnique: jest.fn().mockResolvedValue(null) },
      businessDefinitionVersion: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 99, version: 2 }),
      },
    };
    const registry = {
      createDraft: jest
        .fn()
        .mockResolvedValueOnce({ id: 11, version: 1 })
        .mockResolvedValueOnce({ id: 12, version: 1 }),
    };
    const service = new BrainSemanticCandidateSyncService(prisma as never, registry as never);
    const draft = candidate('draft', []);
    const blocked = candidate('blocked', ['conflict:measure.field']);
    const unchanged = candidate('draft', []);

    const result = await service.sync({
      candidates: [
        draft,
        blocked,
        unchanged,
        { status: 'blocked', blockedReasons: ['incomplete'], draftInput: undefined },
      ],
      createdBy: 7,
      source: 'scheduled_capability_scanner',
    });

    expect(result.summary).toEqual({ total: 4, created: 2, unchanged: 1, blockedWithoutProposal: 1 });
    expect(registry.createDraft).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ lifecycleStatus: 'draft', candidateDiagnostics: undefined, createdBy: 7 }),
    );
    expect(registry.createDraft).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        lifecycleStatus: 'candidate',
        candidateDiagnostics: {
          source: 'scheduled_capability_scanner',
          blockedReasons: ['conflict:measure.field'],
        },
      }),
    );
    expect(result.items[2]).toMatchObject({ status: 'unchanged', versionId: 99 });
  });

  it('inherits immutable identity from the registry when generating a new version', async () => {
    const prisma = {
      businessDefinition: {
        findUnique: jest.fn().mockResolvedValue({
          domain: 'payment',
          name: '实收金额',
          ownerType: 'ami_core_metric_candidate_generator',
          ownerId: 'paid_amount',
        }),
      },
      businessDefinitionVersion: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const registry = { createDraft: jest.fn().mockResolvedValue({ id: 21, version: 5 }) };
    const service = new BrainSemanticCandidateSyncService(prisma as never, registry as never);
    const generated = candidate('draft', []);
    generated.draftInput.definitionKey = 'metric.paid_amount';
    generated.draftInput.domain = 'finance';
    generated.draftInput.name = '营业额';
    generated.draftInput.ownerId = 'paid_amount';

    await service.sync({ candidates: [generated], createdBy: 7, source: 'scanner' });

    expect(registry.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        definitionKey: 'metric.paid_amount',
        domain: 'payment',
        name: '实收金额',
        ownerType: 'ami_core_metric_candidate_generator',
        ownerId: 'paid_amount',
      }),
    );
  });

  it('requires a positive governance actor id', async () => {
    const service = new BrainSemanticCandidateSyncService({} as never, {} as never);
    await expect(service.sync({ candidates: [], createdBy: 0, source: 'test' })).rejects.toThrow(
      'semantic_candidate_sync_created_by_invalid',
    );
  });
});

function candidate(status: 'draft' | 'blocked', blockedReasons: string[]) {
  return {
    status,
    blockedReasons,
    draftInput: {
      definitionKey: 'metric.product_sales_quantity',
      kind: 'metric' as const,
      domain: 'product',
      name: '商品销量',
      ownerType: 'ami_core_metric_candidate_generator',
      ownerId: 'product_sales_quantity',
      lifecycleStatus: status === 'draft' ? ('draft' as const) : ('candidate' as const),
      schemaVersion: '1.0',
      payload: { metricKey: 'product_sales_quantity' },
      canonicalQueryRef: 'semantic_query.product_sales_quantity',
      fixtureSetKey: 'fixture.product_sales_quantity',
      timezone: 'Asia/Shanghai' as const,
      storeScope: { mode: 'current_store' },
      evidence: [
        {
          sourceType: 'metric_declaration',
          sourcePath: 'packages/server-v2/src/semantic-data/semantic-metric-registry.service.ts',
          sourceSymbol: 'product_sales_quantity',
          evidenceKind: 'metric_template_declaration',
          confidence: 1,
        },
      ],
    },
  };
}
