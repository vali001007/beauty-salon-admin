import type { BrainCapabilityCard } from '../capability/brain-capability.types.js';
import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { BrainModule } from '../brain.module.js';
import { BrainCapabilityArgsValidatorService } from '../capability/brain-capability-args-validator.service.js';
import type { BrainRequestContext } from '../context/brain-request-context.js';
import { BrainExecutionBudgetService } from '../execution/brain-execution-budget.service.js';
import type { BrainExecutionPlan } from './brain-execution-plan.schema.js';
import { BrainExecutionPlanValidatorService } from './brain-execution-plan-validator.service.js';

describe('BrainExecutionPlanValidatorService', () => {
  const validator = () =>
    new BrainExecutionPlanValidatorService(
      new BrainCapabilityArgsValidatorService(),
      new BrainExecutionBudgetService(),
    );

  it('accepts a bounded DAG and returns a deeply frozen clone', () => {
    const value = plan({
      nodes: [
        node('facts', 'product_facts', []),
        node('ranking', 'product_ranking', ['facts'], {
          inputMappings: [{ fromNodeId: 'facts', sourcePath: '$.data.rows', targetPath: '$.entities' }],
        }),
      ],
    });

    const result = validator().validate({
      plan: value,
      cards: [card('product_facts'), card('product_ranking')],
      context: context(),
    });

    value.nodes[0]!.args.objective = '篡改';
    expect(result.nodes[0]!.args.objective).toBe('查询商品');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.nodes)).toBe(true);
  });

  it('accepts the controlled single-step marker emitted by the deterministic planner', () => {
    const value = { ...plan({ nodes: [node('capability_1', 'product_facts')] }), isSingleStep: true };

    expect(
      validator().validate({ plan: value, cards: [card('product_facts')], context: context() }),
    ).toMatchObject({ isSingleStep: true });
  });

  it.each([
    [
      'duplicate node id',
      plan({ nodes: [node('same', 'product_facts'), node('same', 'product_ranking')] }),
      'brain_execution_node_duplicate:same',
    ],
    [
      'missing dependency',
      plan({ nodes: [node('ranking', 'product_ranking', ['missing'])] }),
      'brain_execution_dependency_missing:ranking:missing',
    ],
    [
      'cycle',
      plan({ nodes: [node('left', 'product_facts', ['right']), node('right', 'product_ranking', ['left'])] }),
      'brain_execution_plan_cycle',
    ],
    [
      'unregistered capability version',
      plan({ nodes: [{ ...node('facts', 'product_facts'), capabilityVersion: 99 }] }),
      'brain_execution_capability_missing:product_facts',
    ],
  ])('rejects %s', (_case, value, message) => {
    expect(() =>
      validator().validate({
        plan: value,
        cards: [card('product_facts'), card('product_ranking')],
        context: context(),
      }),
    ).toThrow(message);
  });

  it('validates node args against the selected capability schema and rejects injected identity scope', () => {
    const strictCard = card('product_facts', {
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['objective', 'limit'],
        properties: {
          objective: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 20 },
        },
      },
    });

    expect(() =>
      validator().validate({
        plan: plan({ nodes: [node('facts', 'product_facts', [], { args: { objective: '查询商品' } })] }),
        cards: [strictCard],
        context: context(),
      }),
    ).toThrow('capability_args_invalid:product_facts');
    expect(() =>
      validator().validate({
        plan: plan({
          nodes: [node('facts', 'product_facts', [], { args: { objective: '查询商品', limit: 10, storeId: 9 } })],
        }),
        cards: [strictCard],
        context: context(),
      }),
    ).toThrow('capability_identity_arg_forbidden:storeId');

    for (const alias of ['store_id', 'currentStoreId', 'shopId', 'tenant_id', 'permissionCodes', 'role_hint']) {
      expect(() =>
        validator().validate({
          plan: plan({ nodes: [node('facts', 'product_facts', [], { args: { objective: '查询商品', limit: 10, [alias]: 9 } })] }),
          cards: [strictCard],
          context: context(),
        }),
      ).toThrow(`capability_identity_arg_forbidden:${alias}`);
    }
  });

  it('checks permission at planning time and checks the current context again before execution', () => {
    const capability = card('product_facts');
    const executionPlan = plan({ nodes: [node('facts', 'product_facts')] });

    expect(() =>
      validator().validate({ plan: executionPlan, cards: [capability], context: context({ permissions: [] }) }),
    ).toThrow('missing_permission:core:product:view');

    const validated = validator().validate({ plan: executionPlan, cards: [capability], context: context() });
    expect(() =>
      validator().revalidateNodeExecution({
        node: validated.nodes[0]!,
        card: capability,
        context: context({ deniedPermissions: ['core:product:view'] }),
      }),
    ).toThrow('permission_denied:core:product:view');
  });

  it('forces side-effect nodes to terminate at preview', () => {
    const action = card('purchase_draft', {
      readOnly: false,
      sideEffect: true,
      riskLevel: 'high',
      requiresConfirmation: true,
      idempotency: 'required',
    });

    expect(() =>
      validator().validate({
        plan: plan({ nodes: [node('purchase', 'purchase_draft', [], { previewOnly: false })] }),
        cards: [action],
        context: context(),
      }),
    ).toThrow('brain_execution_side_effect_preview_required:purchase');
  });

  it('enforces eight nodes, two replans and a twenty-second critical-path budget', () => {
    const tooMany = plan({ nodes: Array.from({ length: 9 }, (_, index) => node(`node_${index}`, 'product_facts')) });
    expect(() => validator().validate({ plan: tooMany, cards: [card('product_facts')], context: context() })).toThrow(
      'brain_execution_plan_invalid',
    );
    expect(() =>
      validator().validate({
        plan: { ...plan(), replanCount: 3 },
        cards: [card('product_facts')],
        context: context(),
      }),
    ).toThrow('brain_execution_plan_invalid');
    expect(() =>
      validator().validate({
        plan: plan({
          budgetMs: 20_000,
          nodes: [node('one', 'product_facts'), node('two', 'product_ranking', ['one'])],
        }),
        cards: [card('product_facts', { timeoutMs: 12_000 }), card('product_ranking', { timeoutMs: 9_000 })],
        context: context(),
      }),
    ).toThrow('brain_execution_budget_exceeded:21000:20000');
  });

  it('tracks runtime deadlines, allows a node to use the remaining budget and refuses a third replan', () => {
    const budget = new BrainExecutionBudgetService();
    const state = budget.start(plan({ budgetMs: 5000 }), 1000);

    expect(() => budget.assertCanStartNode(state, card('product_facts', { timeoutMs: 4000 }), 2500)).not.toThrow();
    expect(() => budget.assertCanStartNode(state, card('product_facts'), 6000)).toThrow(
      'brain_execution_budget_exhausted:0',
    );
    const once = budget.consumeReplan(state);
    const twice = budget.consumeReplan(once);
    expect(twice.replanCount).toBe(2);
    expect(() => budget.consumeReplan(twice)).toThrow('brain_execution_replan_limit_exceeded');
  });

  it('registers plan, args and budget gates in BrainModule', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, BrainModule) as unknown[];
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, BrainModule) as unknown[];
    for (const service of [
      BrainCapabilityArgsValidatorService,
      BrainExecutionBudgetService,
      BrainExecutionPlanValidatorService,
    ]) {
      expect(providers).toContain(service);
      expect(exports).toContain(service);
    }
  });
});

function node(
  id: string,
  capabilityKey: string,
  dependsOn: string[] = [],
  override: Partial<BrainExecutionPlan['nodes'][number]> = {},
): BrainExecutionPlan['nodes'][number] {
  return {
    id,
    capabilityKey,
    capabilityVersion: 1,
    dependsOn,
    previewOnly: false,
    args: { objective: '查询商品' },
    ...override,
  };
}

function plan(override: Partial<BrainExecutionPlan> = {}): BrainExecutionPlan {
  return {
    schemaVersion: '1.0',
    planId: 'plan_test',
    objective: '查询商品',
    nodes: [node('facts', 'product_facts')],
    replanCount: 0,
    budgetMs: 20_000,
    ...override,
  };
}

function card(key: string, override: Partial<BrainCapabilityCard> = {}): BrainCapabilityCard {
  return {
    key,
    version: 1,
    name: key,
    description: key,
    domains: ['product'],
    intents: ['query'],
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['objective'],
      properties: { objective: { type: 'string' } },
    },
    outputSchema: { type: 'object' },
    requiredPermissions: ['core:product:view'],
    allowedRoles: [],
    readOnly: true,
    sideEffect: false,
    riskLevel: 'low',
    requiresConfirmation: false,
    idempotency: 'not_applicable',
    timeoutMs: 5000,
    grounding: 'domain_service',
    examples: ['查询商品'],
    sourceFingerprint: 'a'.repeat(64),
    definitionRefs: [],
    synonyms: [],
    negativeExamples: [],
    successSchema: { type: 'object' },
    ...override,
  };
}

function context(override: Partial<BrainRequestContext> = {}): BrainRequestContext {
  return {
    userId: 9,
    storeId: 6,
    visibleStoreIds: [6],
    roles: ['store_manager'],
    permissions: ['core:product:view'],
    deniedPermissions: [],
    requestId: 'req_test',
    timezone: 'Asia/Shanghai',
    ...override,
  };
}
