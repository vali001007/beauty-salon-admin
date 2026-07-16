import { BrainCompletionVerifierService } from './brain-completion-verifier.service.js';
import type { BrainObservation } from './brain-observation.service.js';

describe('BrainCompletionVerifierService', () => {
  const verifier = new BrainCompletionVerifierService();

  it('requires citations for factual output and at least two rows for rankings', async () => {
    const result = await verifier.verify({
      plan: plan(),
      cards: [card({ intents: ['ranking'] })],
      observations: [observation({ citations: [], data: { blocks: [{ kind: 'ranking', rows: [{ name: 'A' }] }], metadata: {}, suggestedActions: [] } })],
      intent: 'ranking',
    });
    expect(result).toEqual({
      status: 'incomplete',
      missingCriteria: ['citation_required:facts', 'ranking_rows_insufficient:facts'],
      recoverable: true,
    });
  });

  it('never lets a rejected observation pass or become recoverable', async () => {
    await expect(verifier.verify({
      plan: plan(), cards: [card()],
      observations: [observation({ status: 'rejected', errorCode: 'permission_denied' })],
    })).resolves.toEqual({
      status: 'rejected', missingCriteria: ['rejected:facts:permission_denied'], recoverable: false,
    });
  });

  it('accepts fully cited structured results', async () => {
    await expect(verifier.verify({
      plan: plan(), cards: [card({ intents: ['ranking'] })],
      observations: [observation({ data: { blocks: [{ kind: 'ranking', rows: [{ name: 'A' }, { name: 'B' }] }], metadata: {}, suggestedActions: [] } })],
      intent: 'ranking',
    })).resolves.toEqual({ status: 'complete', missingCriteria: [], recoverable: false });
  });

  it('does not require ranking rows when a multi-intent capability is used for a query', async () => {
    await expect(verifier.verify({
      plan: plan(),
      cards: [card({ intents: ['query', 'ranking'] })],
      observations: [observation()],
      intent: 'query',
    })).resolves.toEqual({ status: 'complete', missingCriteria: [], recoverable: false });
  });

  it('accepts a cited empty ranking as a grounded no-data result', async () => {
    await expect(verifier.verify({
      plan: plan(),
      cards: [card({ intents: ['query', 'ranking'] })],
      observations: [observation({ status: 'no_data', data: { blocks: [{ kind: 'ranking', rows: [] }], metadata: {}, suggestedActions: [] } })],
      intent: 'ranking',
    })).resolves.toEqual({ status: 'complete', missingCriteria: [], recoverable: false });
  });

  it('uses the governed domain capability contract as the diagnosis completion boundary', async () => {
    const aiService = { generateStructured: jest.fn().mockResolvedValue({ data: { complete: false, missingCriteria: ['invented_scope'] } }) };
    const configured = new BrainCompletionVerifierService(aiService as never, { runtime: { modelTimeoutMs: 1000 } } as never);

    await expect(configured.verify({
      plan: plan(),
      cards: [card({ grounding: 'domain_service' })],
      observations: [observation()],
      intent: 'diagnosis',
      successCriteria: ['返回经营诊断'],
      audit: { userId: 1, storeId: 6 },
    })).resolves.toEqual({ status: 'complete', missingCriteria: [], recoverable: false });
    expect(aiService.generateStructured).not.toHaveBeenCalled();
  });

  it('marks a cited result incomplete when open data-quality findings degraded its facts', async () => {
    await expect(verifier.verify({
      plan: plan(),
      cards: [card()],
      observations: [observation({
        data: {
          blocks: [{ kind: 'limitations', items: ['当前在店状态不可信'] }],
          metadata: {
            dataQuality: {
              status: 'degraded',
              ruleCounts: { reception_in_store_state_stale: 15 },
            },
          },
          suggestedActions: [],
        },
      })],
    })).resolves.toEqual({
      status: 'incomplete',
      missingCriteria: ['data_quality:facts:reception_in_store_state_stale'],
      recoverable: true,
    });
  });

  it('requires every node in a six-domain workflow to return a cited result', async () => {
    const keys = [
      'store_operations_overview',
      'front_desk_operations_overview',
      'beautician_service_overview',
      'inventory_operations_overview',
      'finance_risk_overview',
      'marketing_growth_overview',
    ];
    const workflowPlan = {
      schemaVersion: '1.0' as const,
      planId: 'six-domain',
      objective: '门店六域经营诊断',
      replanCount: 0,
      budgetMs: 20_000,
      nodes: keys.map((key) => ({ id: key, capabilityKey: key, capabilityVersion: 1, dependsOn: [], previewOnly: false, args: {} })),
    };
    const cards = keys.map((key) => card({ key, name: key, description: key }));
    const completed = keys.map((key) => observation({ nodeId: key, capabilityKey: key }));

    await expect(verifier.verify({
      plan: workflowPlan,
      cards,
      observations: completed,
      intent: 'workflow',
    })).resolves.toEqual({ status: 'complete', missingCriteria: [], recoverable: false });

    await expect(verifier.verify({
      plan: workflowPlan,
      cards,
      observations: completed.map((item) => item.nodeId === 'marketing_growth_overview' ? { ...item, status: 'no_data' as const } : item),
      intent: 'workflow',
    })).resolves.toEqual({ status: 'complete', missingCriteria: [], recoverable: false });

    await expect(verifier.verify({
      plan: workflowPlan,
      cards,
      observations: completed.map((item) => item.nodeId === 'marketing_growth_overview'
        ? { ...item, status: 'no_data' as const, grounding: 'none' as const, citations: [] }
        : item),
      intent: 'workflow',
    })).resolves.toEqual({ status: 'incomplete', missingCriteria: ['no_data:marketing_growth_overview'], recoverable: true });
  });
});

function plan() {
  return { schemaVersion: '1.0' as const, planId: 'p1', objective: 'facts', replanCount: 0, budgetMs: 10_000, nodes: [{ id: 'facts', capabilityKey: 'facts', capabilityVersion: 1, dependsOn: [], previewOnly: false, args: {} }] };
}
function card(overrides: Record<string, unknown> = {}) {
  return { key: 'facts', version: 1, name: 'facts', description: 'facts', domains: [], intents: ['query'], inputSchema: {}, outputSchema: {}, requiredPermissions: [], allowedRoles: [], readOnly: true, sideEffect: false, riskLevel: 'low', requiresConfirmation: false, idempotency: 'not_applicable', timeoutMs: 1000, grounding: 'domain_service', examples: [], sourceFingerprint: 'a'.repeat(64), definitionRefs: [], synonyms: [], negativeExamples: [], successSchema: {}, ...overrides } as any;
}
function observation(overrides: Partial<BrainObservation> = {}): BrainObservation {
  return { nodeId: 'facts', capabilityKey: 'facts', capabilityVersion: 1, status: 'completed', grounding: 'db_skill', summary: 'facts', data: { blocks: [], metadata: {}, suggestedActions: [] }, citations: [{ sourceType: 'db', sourceId: '1' }], startedAt: new Date(0).toISOString(), completedAt: new Date(1).toISOString(), ...overrides };
}
