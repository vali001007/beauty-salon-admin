import type { AiService } from '../../ai/ai.service.js';
import type { BrainCapabilityRankedCandidate } from '../capability/brain-capability-retriever.service.js';
import type { BrainCapabilityCard } from '../capability/brain-capability.types.js';
import type { BrainSemanticIntent } from '../cognition/brain-semantic-intent.types.js';
import { BrainSupervisorPlannerService } from './brain-supervisor-planner.service.js';
import { withBrainCapabilityMappingOutputs } from '../capability/brain-capability-mapping-output-contract.js';

const contextConfig = { runtime: { modelTimeoutMs: 8000, capabilityTopK: 8 } };
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

describe('BrainSupervisorPlannerService', () => {
  it('accepts a governed expiring-stock DAG using only topK cards', async () => {
    const cards = [
      card('inventory_risk_ranking', ['inventory']),
      card('order_revenue_analysis', ['finance']),
      card('marketing_customer_segment', ['marketing']),
    ];
    const plan = {
      schemaVersion: '1.0', planId: 'stock-plan', objective: '临期商品处理方案', replanCount: 0, budgetMs: 20_000,
      nodes: [
        node('inventory', cards[0]),
        node('finance', cards[1], ['inventory']),
        node('marketing', cards[2], ['inventory', 'finance']),
      ],
    };
    const service = planner(plan);

    await expect(service.plan({ question: '临期商品处理方案', intent: intent(['inventory', 'finance', 'marketing']), topK: ranked(cards), audit: { userId: 9, storeId: 6 } })).resolves.toMatchObject({
      status: 'planned',
      plan: expect.objectContaining({ nodes: expect.arrayContaining([expect.objectContaining({ id: 'marketing', dependsOn: ['inventory', 'finance'] })]) }),
    });
  });

  it('accepts schedule -> candidates -> reminder -> touch preview ordering', async () => {
    const cards = [
      card('reservation_list', ['front_desk']),
      card('customer_facts', ['customer_service']),
      card('customer_follow_up_draft', ['customer_service'], true),
      card('marketing_touch_draft', ['marketing'], true),
    ];
    const plan = {
      schemaVersion: '1.0', planId: 'gap-plan', objective: '明天下午空档补齐', replanCount: 0, budgetMs: 20_000,
      nodes: [
        node('schedule', cards[0]),
        node('candidates', cards[1]),
        node('reminder', cards[2], ['schedule', 'candidates'], true),
        node('touch', cards[3], ['reminder'], true),
      ],
    };

    await expect(planner(plan).plan({ question: '明天下午空档补齐', intent: intent(['front_desk', 'customer_service', 'marketing']), topK: ranked(cards), audit: { userId: 9, storeId: 6 } })).resolves.toMatchObject({ status: 'planned' });
  });

  it('accepts a six-domain improvement DAG using the discoverable composite capabilities', async () => {
    const cards = [
      { ...card('store_operations_overview', ['reservation', 'payment', 'order', 'beautician']), timeoutMs: 10_000 },
      { ...card('front_desk_operations_overview', ['reservation']), timeoutMs: 10_000 },
      { ...card('beautician_service_overview', ['reservation', 'beautician']), timeoutMs: 10_000 },
      { ...card('inventory_operations_overview', ['product']), timeoutMs: 10_000 },
      { ...card('finance_risk_overview', ['payment']), timeoutMs: 10_000 },
      { ...card('marketing_growth_overview', ['customer']), timeoutMs: 10_000 },
    ];
    const plan = {
      schemaVersion: '1.0', planId: 'six-domain-review', objective: '门店六域经营诊断', replanCount: 0, budgetMs: 20_000,
      nodes: [
        node('store', cards[0]),
        node('front_desk', cards[1]),
        node('beautician', cards[2]),
        node('inventory', cards[3]),
        node('finance', cards[4]),
        node('marketing', cards[5]),
      ],
    };

    await expect(planner(plan).plan({
      question: '全面诊断门店经营、前台、美容师、库存、财务和营销问题',
      intent: intent(['reservation', 'payment', 'order', 'beautician', 'product', 'customer']),
      topK: ranked(cards),
      audit: { userId: 9, storeId: 6 },
    })).resolves.toMatchObject({
      status: 'planned',
      plan: {
        budgetMs: 20_000,
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: 'inventory', dependsOn: [] }),
          expect.objectContaining({ id: 'finance', dependsOn: [] }),
          expect.objectContaining({ id: 'marketing', dependsOn: [] }),
        ]),
      },
    });
  });

  it('fails closed when the model invents a capability or bypasses a required dependency', async () => {
    const cards = [card('inventory_risk_ranking', ['inventory']), card('order_revenue_analysis', ['finance']), card('marketing_customer_segment', ['marketing'])];
    const invented = {
      schemaVersion: '1.0', planId: 'bad', objective: 'bad', replanCount: 0, budgetMs: 20_000,
      nodes: [node('invented', card('delete_everything', ['inventory']))],
    };
    await expect(planner(invented).plan({ question: 'test', intent: intent(['inventory']), topK: ranked(cards), audit: { userId: 9, storeId: 6 } })).resolves.toMatchObject({ status: 'unavailable', errorCode: 'PLAN_POLICY_INVALID' });

    const missingDependency = {
      schemaVersion: '1.0', planId: 'bad-order', objective: 'bad', replanCount: 0, budgetMs: 20_000,
      nodes: [
        node('inventory', cards[0]),
        {
          ...node('finance', cards[1]),
          inputMappings: [{ fromNodeId: 'inventory', sourcePath: '$.data.metadata', targetPath: '$.inventoryContext' }],
        },
      ],
    };
    await expect(planner(missingDependency).plan({ question: 'test', intent: intent(['inventory', 'finance']), topK: ranked(cards), audit: { userId: 9, storeId: 6 } })).resolves.toMatchObject({ status: 'unavailable', errorCode: 'PLAN_POLICY_INVALID' });
  });

  it('repairs a model plan that references an undeclared mapping output', async () => {
    const source = {
      ...card('customer_priority_recommendation', ['customer']),
      outputSchema: withBrainCapabilityMappingOutputs({ type: 'object' }, ['resultRows']),
    };
    const target = card('marketing_campaign_plan', ['customer']);
    const invalidPlan = {
      schemaVersion: '1.0', planId: 'invalid-mapping', objective: '提升复购', replanCount: 0, budgetMs: 10_000,
      nodes: [
        node('priority', source),
        {
          ...node('campaign', target, ['priority']),
          inputMappings: [{ fromNodeId: 'priority', sourcePath: '$.data.customerSegments', targetPath: '$.entities' }],
        },
      ],
    };
    const repairedPlan = {
      ...invalidPlan,
      planId: 'repaired-mapping',
      nodes: [
        node('priority', source),
        {
          ...node('campaign', target, ['priority']),
          inputMappings: [{ fromNodeId: 'priority', sourcePath: '$.data.resultRows', targetPath: '$.entities' }],
        },
      ],
    };
    const generateStructured = jest
      .fn()
      .mockResolvedValueOnce({ data: invalidPlan, provider: 'test', model: 'test-model', usage })
      .mockResolvedValueOnce({ data: repairedPlan, provider: 'test', model: 'test-model', usage });
    const service = new BrainSupervisorPlannerService(
      { generateStructured } as unknown as AiService,
      contextConfig as never,
    );

    await expect(service.plan({
      question: '我想提升复购率',
      intent: intent(['customer']),
      topK: ranked([source, target]),
      audit: { userId: 9, storeId: 6 },
    })).resolves.toMatchObject({
      status: 'planned',
      plan: {
        planId: 'repaired-mapping',
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: 'campaign',
            inputMappings: [expect.objectContaining({ sourcePath: '$.data.resultRows' })],
          }),
        ]),
      },
    });
    expect(generateStructured).toHaveBeenCalledTimes(2);
    expect(generateStructured.mock.calls[1]?.[0].messages[1].content).toContain('contractRepair');
  });

  it('requires a replan to increment replanCount exactly once', async () => {
    const capability = card('customer_facts', ['customer_service']);
    const previous = { schemaVersion: '1.0', planId: 'p1', objective: 'facts', replanCount: 0, budgetMs: 10_000, nodes: [node('facts', capability)] } as const;
    const next = { ...previous, planId: 'p2', replanCount: 0 };
    await expect(planner(next).plan({ question: 'facts', intent: intent(['customer_service']), topK: ranked([capability]), audit: { userId: 9, storeId: 6 }, previousPlan: previous as any, observations: [] })).resolves.toMatchObject({ status: 'unavailable', errorCode: 'PLAN_POLICY_INVALID' });
  });

  it('raises a model budget to the governed critical path plus scheduling buffer', async () => {
    const capability = card('customer_facts', ['customer_service']);
    const plan = {
      schemaVersion: '1.0', planId: 'low-budget', objective: 'facts', replanCount: 0, budgetMs: 1000,
      nodes: [{ ...node('facts', capability), args: { time: { start: 'hallucinated' } } }],
    };

    await expect(planner(plan).plan({
      question: 'facts',
      intent: intent(['customer_service']),
      topK: ranked([capability]),
      audit: { userId: 9, storeId: 6 },
    })).resolves.toMatchObject({
      status: 'planned',
      plan: {
        budgetMs: 5000,
        nodes: [{ args: { time: { start: 'hallucinated' } } }],
      },
    });
  });

  it('replaces model-authored standard semantic args with the validated intent', async () => {
    const capability = {
      ...card('project_service_ranking', ['project']),
      inputSchema: {
        type: 'object',
        properties: {
          objective: { type: 'string' },
          time: { type: 'object' },
          comparisonTarget: { type: 'object' },
          entities: { type: 'array' },
          metrics: { type: 'array' },
          dimensions: { type: 'array' },
          filters: { type: 'array' },
          orderBy: { type: 'array' },
          limit: { type: 'number' },
        },
      },
    };
    const semanticIntent = {
      ...intent(['project']),
      timeRange: { preset: 'this_month', label: '本月', timezone: 'Asia/Shanghai' as const },
      comparisonTarget: {
        type: 'time' as const,
        timeRange: { preset: 'last_month', label: '上月', timezone: 'Asia/Shanghai' as const },
      },
      limit: 5,
    };
    const plan = {
      schemaVersion: '1.0', planId: 'normalized', objective: 'ranking', replanCount: 0, budgetMs: 1000,
      nodes: [{
        ...node('ranking', capability),
        args: { time: { start: '2025-01-01' }, objective: 'model objective' },
      }],
    };

    const result = await planner(plan).plan({
      question: '本月项目排行',
      intent: semanticIntent,
      topK: ranked([capability]),
      audit: { userId: 9, storeId: 6 },
    });

    expect(result).toMatchObject({
      status: 'planned',
      plan: {
        nodes: [{
          args: {
            objective: semanticIntent.objective,
            time: semanticIntent.timeRange,
            comparisonTarget: semanticIntent.comparisonTarget,
            entities: [],
            metrics: [],
            dimensions: [],
            filters: [],
            orderBy: [],
            limit: 5,
          },
        }],
      },
    });
  });

  it('fails closed when a sequential critical path exceeds the global execution budget', async () => {
    const first = card('customer_facts', ['customer_service']);
    const second = { ...card('reservation_list', ['front_desk']), timeoutMs: 17_000 };
    const plan = {
      schemaVersion: '1.0', planId: 'oversized', objective: 'facts', replanCount: 0, budgetMs: 20_000,
      nodes: [node('facts', first), node('schedule', second, ['facts'])],
    };

    await expect(planner(plan).plan({
      question: 'facts then schedule',
      intent: intent(['customer_service', 'front_desk']),
      topK: ranked([first, second]),
      audit: { userId: 9, storeId: 6 },
    })).resolves.toMatchObject({ status: 'unavailable', errorCode: 'PLAN_POLICY_INVALID' });
  });

  it('uses only the remaining shared deadline for Supervisor generation', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(10_000);
    const capability = card('customer_facts', ['customer_service']);
    const plan = {
      schemaVersion: '1.0', planId: 'deadline', objective: 'facts', replanCount: 0, budgetMs: 5000,
      nodes: [node('facts', capability)],
    };
    const generateStructured = jest.fn().mockResolvedValue({ data: plan, provider: 'test', model: 'test-model', usage });
    const service = new BrainSupervisorPlannerService({ generateStructured } as unknown as AiService, contextConfig as never);

    await expect(service.plan({
      question: 'facts',
      intent: intent(['customer_service']),
      topK: ranked([capability]),
      audit: { userId: 9, storeId: 6 },
      deadlineAt: 10_250,
    })).resolves.toMatchObject({ status: 'planned' });

    expect(generateStructured).toHaveBeenCalledWith(expect.objectContaining({
      timeoutMs: 250,
      allowFallback: true,
      fallbackMessages: expect.any(Array),
    }));
    expect(generateStructured.mock.calls[0]?.[0].fallbackMessages).toEqual(generateStructured.mock.calls[0]?.[0].messages);
  });

  it('does not call Supervisor after the shared deadline has expired', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(10_000);
    const capability = card('customer_facts', ['customer_service']);
    const generateStructured = jest.fn();
    const service = new BrainSupervisorPlannerService({ generateStructured } as unknown as AiService, contextConfig as never);

    await expect(service.plan({
      question: 'facts',
      intent: intent(['customer_service']),
      topK: ranked([capability]),
      audit: { userId: 9, storeId: 6 },
      deadlineAt: 9_999,
    })).resolves.toMatchObject({ status: 'unavailable', errorCode: 'BUDGET_EXCEEDED' });
    expect(generateStructured).not.toHaveBeenCalled();
  });
});

function planner(data: unknown) {
  const aiService = { generateStructured: jest.fn().mockResolvedValue({ data, provider: 'test', model: 'test-model', usage }) } as unknown as AiService;
  return new BrainSupervisorPlannerService(aiService, contextConfig as never);
}

function ranked(cards: BrainCapabilityCard[]): BrainCapabilityRankedCandidate[] {
  return cards.map((card) => ({ card, score: 0.9, matchedFields: ['name'] }));
}

function card(key: string, domains: string[], sideEffect = false): BrainCapabilityCard {
  return {
    key, version: 1, name: key, description: key, domains, intents: ['workflow'],
    inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, requiredPermissions: [], allowedRoles: [],
    readOnly: !sideEffect, sideEffect, riskLevel: sideEffect ? 'high' : 'low', requiresConfirmation: sideEffect,
    idempotency: sideEffect ? 'required' : 'not_applicable', timeoutMs: 4000,
    grounding: sideEffect ? 'domain_service' : key.includes('ranking') || key.includes('analysis') ? 'semantic_query' : 'domain_service',
    examples: [], sourceFingerprint: 'a'.repeat(64), definitionRefs: [], synonyms: [], negativeExamples: [], successSchema: {},
  };
}

function node(id: string, capability: BrainCapabilityCard, dependsOn: string[] = [], previewOnly = false) {
  return { id, capabilityKey: capability.key, capabilityVersion: capability.version, dependsOn, previewOnly, args: {} };
}

function intent(domains: string[]): BrainSemanticIntent {
  return {
    schemaVersion: '1.0', objective: '复合经营任务', domains, intent: 'workflow', entities: [], metrics: [], dimensions: [], filters: [], orderBy: [], answerShape: 'diagnosis', successCriteria: [], ambiguities: [], missingSlots: [], assumptions: [], confidence: 0.95, decisionSummary: '复合经营任务',
  };
}
