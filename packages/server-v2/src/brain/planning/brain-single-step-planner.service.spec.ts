import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { BrainModule } from '../brain.module.js';
import type { BrainCapabilityRetrievalResult } from '../capability/brain-capability-retriever.service.js';
import type { BrainCapabilityCard } from '../capability/brain-capability.types.js';
import type { BrainSemanticIntent } from '../cognition/brain-semantic-intent.types.js';
import { BrainSingleStepPlannerService } from './brain-single-step-planner.service.js';

describe('BrainSingleStepPlannerService', () => {
  const planner = new BrainSingleStepPlannerService();
  const card = (override: Partial<BrainCapabilityCard> = {}): BrainCapabilityCard => ({
    key: 'product_sales_ranking',
    version: 2,
    name: '商品销售排行',
    description: '商品销售排行',
    domains: ['sales'],
    intents: ['ranking'],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    requiredPermissions: ['core:metric:view'],
    allowedRoles: ['store_manager'],
    readOnly: true,
    sideEffect: false,
    riskLevel: 'low',
    requiresConfirmation: false,
    idempotency: 'not_applicable',
    timeoutMs: 10_000,
    grounding: 'semantic_query',
    examples: ['本月商品销售排行'],
    sourceFingerprint: 'a'.repeat(64),
    definitionRefs: [
      {
        definitionId: 1,
        versionId: 2,
        definitionKey: 'metric.product_sales_quantity',
        version: 1,
        definitionFingerprint: 'b'.repeat(64),
        sourceFingerprint: 'c'.repeat(64),
      },
    ],
    synonyms: ['商品销量榜'],
    negativeExamples: [],
    successSchema: { type: 'object' },
    ...override,
  });
  const intent: BrainSemanticIntent = {
    schemaVersion: '1.0',
    objective: '查询本月商品销售排行',
    domains: ['sales'],
    intent: 'ranking',
    entities: [
      {
        entityType: 'product',
        entityKey: 'product-1',
        mention: '商品',
        source: 'user',
        confidence: 0.98,
        definitionRef: {
          definitionType: 'entity',
          definitionKey: 'entity.product',
          definitionVersion: 1,
          definitionFingerprint: 'c'.repeat(64),
          sourceFingerprint: 'd'.repeat(64),
        },
      },
    ],
    metrics: [
      {
        definitionType: 'metric',
        definitionKey: 'metric.product_sales_quantity',
        definitionVersion: 1,
        definitionFingerprint: 'b'.repeat(64),
        sourceFingerprint: 'c'.repeat(64),
      },
    ],
    dimensions: [
      {
        definitionType: 'dimension',
        definitionKey: 'dimension.product_name',
        definitionVersion: 1,
        definitionFingerprint: 'd'.repeat(64),
        sourceFingerprint: 'e'.repeat(64),
      },
    ],
    filters: [
      {
        fieldRef: {
          definitionType: 'field',
          definitionKey: 'field.order_status',
          definitionVersion: 1,
          definitionFingerprint: 'e'.repeat(64),
          sourceFingerprint: 'f'.repeat(64),
        },
        operator: 'eq',
        value: 'paid',
      },
    ],
    timeRange: { preset: 'this_month', label: '本月', timezone: 'Asia/Shanghai' },
    orderBy: [
      {
        definitionRef: {
          definitionType: 'metric',
          definitionKey: 'metric.product_sales_quantity',
          definitionVersion: 1,
          definitionFingerprint: 'b'.repeat(64),
          sourceFingerprint: 'c'.repeat(64),
        },
        direction: 'desc',
      },
    ],
    limit: 10,
    answerShape: 'ranking',
    successCriteria: [],
    ambiguities: [],
    missingSlots: [],
    assumptions: [],
    confidence: 0.96,
    decisionSummary: '商品销售排行',
  };
  const retrieval = (
    status: BrainCapabilityRetrievalResult['status'],
    selected?: BrainCapabilityCard,
  ): BrainCapabilityRetrievalResult => ({
    status,
    selected,
    topK: selected ? [{ card: selected, score: 0.9, matchedFields: ['name'] }] : [],
    confidence: selected ? 0.9 : 0,
    margin: selected ? 0.9 : 0,
    reason: status,
  });

  it('creates one executable node using only structured intent args', () => {
    const result = planner.plan({ intent, retrieval: retrieval('selected', card()) });

    expect(result).toEqual({
      status: 'planned',
      plan: {
        schemaVersion: '1.0',
        planId: 'single:product_sales_ranking:v2',
        objective: intent.objective,
        isSingleStep: true,
        replanCount: 0,
        budgetMs: 11_000,
        nodes: [
          {
            id: 'capability_1',
            capabilityKey: 'product_sales_ranking',
            capabilityVersion: 2,
            dependsOn: [],
            previewOnly: false,
            args: {
              objective: intent.objective,
              time: intent.timeRange,
              entities: intent.entities,
              metrics: intent.metrics,
              dimensions: intent.dimensions,
              filters: intent.filters,
              orderBy: intent.orderBy,
              limit: 10,
            },
          },
        ],
      },
    });
    const serialized = JSON.stringify(result);
    for (const forbidden of ['storeId', 'userId', 'permissions', 'roleHint']) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it('forces side-effect capabilities to preview-only', () => {
    const action = card({
      key: 'purchase_order_draft',
      readOnly: false,
      sideEffect: true,
      riskLevel: 'high',
      requiresConfirmation: true,
      idempotency: 'required',
      grounding: 'domain_service',
    });

    const result = planner.plan({ intent: { ...intent, intent: 'action' }, retrieval: retrieval('selected', action) });

    expect(result.status).toBe('planned');
    if (result.status !== 'planned') throw new Error('expected_planned_result');
    expect(result.plan.nodes).toEqual([expect.objectContaining({ previewOnly: true })]);
  });

  it('preserves the governed action frame in executable args', () => {
    const actionRef = {
      definitionType: 'action' as const,
      definitionKey: 'action.reschedule_reservation',
      definitionVersion: 3,
      definitionFingerprint: 'a'.repeat(64),
      sourceFingerprint: 'b'.repeat(64),
    };
    const actionSlots = [
      {
        slotKey: 'appointmentTime',
        semanticRole: 'time' as const,
        source: 'user' as const,
        timeValue: '2026-08-01T15:00:00+08:00',
        confidence: 0.99,
      },
    ];
    const result = planner.plan({
      intent: {
        ...intent,
        schemaVersion: '1.1',
        intent: 'action',
        answerShape: 'action_preview',
        actionRef,
        actionPolarity: 'affirmative',
        actionModality: 'request',
        actionSlots,
      },
      retrieval: retrieval(
        'selected',
        card({
          key: 'reservation_action_preview',
          intents: ['action'],
          readOnly: false,
          sideEffect: true,
          riskLevel: 'high',
          requiresConfirmation: true,
          idempotency: 'required',
          grounding: 'preview_action',
        }),
      ),
    });

    expect(result).toMatchObject({
      status: 'planned',
      plan: { nodes: [{ args: { actionRef, actionModality: 'request', actionSlots } }] },
    });
  });

  it('refuses to plan a selected capability for a negated action', () => {
    const actionRef = {
      definitionType: 'action' as const,
      definitionKey: 'action.create_purchase_order',
      definitionVersion: 1,
      definitionFingerprint: 'a'.repeat(64),
      sourceFingerprint: 'b'.repeat(64),
    };
    const action = card({
      key: 'purchase_order_draft',
      intents: ['action'],
      readOnly: false,
      sideEffect: true,
      riskLevel: 'high',
      requiresConfirmation: true,
      idempotency: 'required',
      grounding: 'preview_action',
    });

    expect(
      planner.plan({
        intent: {
          ...intent,
          schemaVersion: '1.1',
          intent: 'action',
          answerShape: 'action_preview',
          actionRef,
          actionPolarity: 'negated',
          actionModality: 'request',
          actionSlots: [],
        },
        retrieval: retrieval('selected', action),
      }),
    ).toEqual({ status: 'not_planned', reason: 'action_polarity_not_executable' });
  });

  it('preserves the governed comparison target in executable args', () => {
    const comparisonTarget = {
      type: 'time' as const,
      timeRange: { preset: 'last_month', label: '上月', timezone: 'Asia/Shanghai' as const },
    };
    const result = planner.plan({
      intent: { ...intent, intent: 'comparison', answerShape: 'comparison', comparisonTarget },
      retrieval: retrieval('selected', card({ intents: ['comparison'] })),
    });

    expect(result).toMatchObject({
      status: 'planned',
      plan: { nodes: [{ args: { comparisonTarget } }] },
    });
  });

  it.each(['clarify', 'none'] as const)('does not create an execution plan for %s retrieval', (status) => {
    const result = planner.plan({ intent, retrieval: retrieval(status) });
    expect(result).toEqual({ status: 'not_planned', reason: status });
  });

  it('is registered and exported by BrainModule', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BrainModule) as unknown[];
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, BrainModule) as unknown[];
    expect(providers).toContain(BrainSingleStepPlannerService);
    expect(exports).toContain(BrainSingleStepPlannerService);
  });
});
