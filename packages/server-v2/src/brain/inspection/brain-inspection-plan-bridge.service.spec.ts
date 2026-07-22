import type { BrainCapabilityCard } from '../capability/brain-capability.types.js';
import { BrainInspectionPlanBridgeService } from './brain-inspection-plan-bridge.service.js';

const card = (key: string, sideEffect = false): BrainCapabilityCard => ({
  key,
  version: 1,
  name: key,
  description: key,
  domains: ['inventory'],
  intents: ['workflow'],
  inputSchema: {},
  outputSchema: {},
  requiredPermissions: [],
  allowedRoles: [],
  readOnly: !sideEffect,
  sideEffect,
  riskLevel: sideEffect ? 'high' : 'low',
  requiresConfirmation: sideEffect,
  idempotency: sideEffect ? 'required' : 'not_applicable',
  timeoutMs: 1000,
  grounding: 'domain_service',
  examples: [],
  sourceFingerprint: 'a'.repeat(64),
  definitionRefs: [],
  synonyms: [],
  negativeExamples: [],
  successSchema: {},
});

describe('BrainInspectionPlanBridgeService', () => {
  it('converts a finding into a system semantic intent and calls the shared Supervisor', async () => {
    const cards = [card('inventory_risk_facts'), card('purchase_order_draft', true)];
    const catalog = { listEnabledCapabilities: jest.fn().mockResolvedValue(cards) };
    const retriever = {
      retrieveTopKForSupervisor: jest.fn().mockReturnValue(cards.map((item) => ({ card: item, score: 0.9, matchedFields: ['domain'] }))),
    };
    const orchestrator = {
      createModelExecutionPlan: jest.fn().mockResolvedValue({
        status: 'planned',
        plan: {
          schemaVersion: '1.0',
          planId: 'inspection:inventory:1',
          objective: '处理低库存风险',
          isSingleStep: false,
          replanCount: 0,
          budgetMs: 5000,
          nodes: [
            { id: 'facts', capabilityKey: 'inventory_risk_facts', capabilityVersion: 1, dependsOn: [], previewOnly: false, args: {} },
            { id: 'preview-1', capabilityKey: 'purchase_order_draft', capabilityVersion: 1, dependsOn: ['facts'], previewOnly: true, args: { productId: 7 } },
            { id: 'preview-2', capabilityKey: 'purchase_order_draft', capabilityVersion: 1, dependsOn: ['facts'], previewOnly: true, args: { productId: 7 } },
          ],
        },
      }),
    };
    const service = new BrainInspectionPlanBridgeService(catalog as never, retriever as never, orchestrator as never);

    const result = await service.planFinding({
      storeId: 6,
      finding: {
        dedupeKey: 'stockout_sku:product:7',
        ruleKey: 'stockout_sku',
        domain: 'inventory',
        objectType: 'product',
        objectId: '7',
        severity: 'high',
        title: '补水面膜低于安全库存',
        evidence: { currentStock: 2, safetyStock: 5 },
        suggestion: { action: '生成采购单预览' },
      },
    });

    expect(result.semanticIntent).toMatchObject({
      intent: 'workflow',
      entities: [expect.objectContaining({ entityType: 'product', entityKey: '7', source: 'system' })],
      assumptions: ['system_generated_inspection_finding'],
    });
    expect(orchestrator.createModelExecutionPlan).toHaveBeenCalledWith(expect.objectContaining({
      audit: { storeId: 6, systemActor: 'brain_inspection' },
      intent: expect.objectContaining({ intent: 'workflow' }),
    }));
    expect(result.actionPreviews).toEqual([
      expect.objectContaining({ capabilityKey: 'purchase_order_draft', previewOnly: true }),
    ]);
  });
});
