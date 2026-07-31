import type {
  BusinessActionDefinitionSnapshot,
  BusinessDefinitionSnapshotInput,
  BusinessDefinitionSnapshotProvider,
  PrismaRuntimeDataModel,
} from './business-definition-snapshot.types.js';
import { createBusinessDefinitionProjectionFingerprint } from '../../semantic-data/business-definition-projection-compiler.service.js';
import { createTestBusinessActionInformationArtifactProfile } from './business-action-information-artifact.testing.js';
import { createTestBusinessActionLexicalFrame } from './business-action-lexical-frame.testing.js';
import { createTestBusinessActionModalityPolicy } from './business-action-modality-policy.testing.js';
import { createTestBusinessActionSideEffectInvariantProfile } from './business-action-side-effect-invariant.testing.js';
import { createTestBusinessActionSituationContextProfile } from './business-action-situation-context.testing.js';
import { createBusinessActionParticipantProfile } from './business-action-participant-profile.js';
import { createBusinessActionRelationProfile } from './business-action-relation-profile.js';
import { createBusinessActionInstitutionalEffectProfile } from './business-action-institutional-effect.js';
import {
  BrainOntologyRuntimeService,
  buildProductionReadyBusinessDefinitionSnapshot,
} from './brain-ontology-runtime.service.js';

type EntityOverride = Partial<BusinessDefinitionSnapshotInput['entities'][number]>;

function entity(
  entityKey: string,
  model: string,
  aliases: string[] = [],
  override: EntityOverride = {},
): BusinessDefinitionSnapshotInput['entities'][number] {
  return {
    definitionKey: `entity:${entityKey}`,
    sourceFingerprint: `source:entity:${entityKey}`,
    version: 1,
    domain: 'operations',
    entityKey,
    name: entityKey,
    aliases,
    attributes: {},
    tableMap: { model, fields: { id: 'id', name: 'name' } },
    ...override,
    definitionFingerprint: override.definitionFingerprint ?? `definition:entity:${entityKey}`,
  };
}

function relation(
  relationKey: string,
  fromEntityKey: string,
  toEntityKey: string,
  path: string[],
): BusinessDefinitionSnapshotInput['relations'][number] {
  return {
    definitionKey: `relation:${relationKey}`,
    definitionFingerprint: `definition:relation:${relationKey}`,
    sourceFingerprint: `source:relation:${relationKey}`,
    version: 1,
    relationKey,
    fromEntityKey,
    toEntityKey,
    name: relationKey,
    joinPath: { path },
  };
}

function metric(): BusinessDefinitionSnapshotInput['metrics'][number] {
  return {
    definitionKey: 'metric:net_revenue',
    definitionFingerprint: 'definition:metric:net_revenue',
    sourceFingerprint: 'source:metric:net_revenue',
    version: 1,
    metricKey: 'net_revenue',
    name: '实收金额',
    domain: 'finance',
    formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' },
    source: [{ model: 'ProductOrder', field: 'netAmount' }],
    defaultFilters: null,
    permissions: ['core:brain:use'],
    description: '订单实收金额合计',
  };
}

function dimension(): BusinessDefinitionSnapshotInput['dimensions'][number] {
  return {
    definitionKey: 'dimension:customer_level',
    definitionFingerprint: 'definition:dimension:customer_level',
    sourceFingerprint: 'source:dimension:customer_level',
    version: 1,
    dimensionKey: 'customer_level',
    name: '会员等级',
    domain: 'customer',
    source: { model: 'Customer', field: 'memberLevel' },
    permissions: ['core:brain:use'],
  };
}

function action(override: Partial<BusinessActionDefinitionSnapshot> = {}): BusinessActionDefinitionSnapshot {
  const capabilityBindings = override.capabilityBindings ?? [
    {
      capabilityKey: 'purchase_order_draft',
      bindingMode: 'preview_and_execute',
      gatewayActionKey: 'create_purchase_order',
      priority: 0,
      enabled: true,
    },
  ];
  const actionKey = override.actionKey ?? 'action.create_purchase_order';
  const inputSlots: BusinessActionDefinitionSnapshot['inputSlots'] = [
    {
      slotKey: 'product',
      label: '商品',
      semanticRole: 'object',
      valueType: 'entity_ref',
      entityTypeRef: 'entity:product',
      requiredAt: ['recognition', 'preview', 'execution'],
      cardinality: 'one',
      sensitive: false,
      confirmationDisplay: true,
    },
    {
      slotKey: 'quantity',
      label: '采购数量',
      semanticRole: 'quantity',
      valueType: 'number',
      unitPolicy: 'product_purchase_unit',
      requiredAt: ['recognition', 'preview', 'execution'],
      cardinality: 'one',
      sensitive: false,
      confirmationDisplay: true,
    },
  ];
  const preconditions = override.preconditions ?? ['product_belongs_to_context_store', 'quantity_positive'];
  const preconditionPredicateRefs = override.preconditionPredicateRefs ?? [
    { key: 'product_belongs_to_context_store', version: 1, fingerprint: 'a'.repeat(64) },
    { key: 'quantity_positive', version: 1, fingerprint: 'b'.repeat(64) },
  ];
  const effects = override.effects ?? ['purchase_order_created'];
  const effectAssertionRefs = override.effectAssertionRefs ?? [
    { key: 'purchase_order_created', version: 1, fingerprint: 'c'.repeat(64) },
  ];
  const participantProfile =
    override.participantProfile ?? createBusinessActionParticipantProfile({ actionKey, inputSlots });
  const relationProfile =
    override.relationProfile ??
    createBusinessActionRelationProfile({
      actionKey,
      actionClass: 'create',
      targetEntityRefs: ['entity:product'],
      participantProfile,
    });
  return {
    definitionKey: actionKey,
    definitionFingerprint: 'definition:action:create_purchase_order',
    sourceFingerprint: 'source:action:create_purchase_order',
    version: 1,
    domain: 'inventory',
    actionKey,
    name: '创建采购单',
    aliases: ['下采购单', '采购下单'],
    description: '为商品创建待确认采购单预览',
    actionClass: 'create',
    targetEntityRefs: ['entity:product'],
    inputSlots,
    preconditions,
    preconditionPredicateRefs,
    effects,
    effectAssertionRefs,
    lexicalFrame:
      override.lexicalFrame ??
      createTestBusinessActionLexicalFrame({
        actionKey,
        actionClass: 'create',
        name: '创建采购单',
        aliases: ['下采购单', '采购下单'],
        targetEntityRefs: ['entity:product'],
        inputSlots,
        preconditions: ['product_belongs_to_context_store', 'quantity_positive'],
        effects: ['purchase_order_created'],
      }),
    situationContext: override.situationContext ?? createTestBusinessActionSituationContextProfile(actionKey),
    modalityPolicy: override.modalityPolicy ?? createTestBusinessActionModalityPolicy(actionKey),
    informationArtifact: override.informationArtifact ?? createTestBusinessActionInformationArtifactProfile(actionKey),
    sideEffectInvariant:
      override.sideEffectInvariant ??
      createTestBusinessActionSideEffectInvariantProfile(actionKey, {
        preconditions,
        preconditionPredicateRefs,
        effects,
        effectAssertionRefs,
      }),
    participantProfile,
    relationProfile,
    triggeredByEventRefs: [],
    emitsEventRefs: ['event.purchase_order_created'],
    riskPolicy: 'high',
    confirmationPolicy: 'required',
    idempotencyPolicy: 'required',
    capabilityBindings,
    bindingFingerprint: createBusinessDefinitionProjectionFingerprint({ actionKey, capabilityBindings }),
    ...override,
  };
}

function runtimeDataModel(): PrismaRuntimeDataModel {
  return {
    models: {
      Product: {
        fields: [
          { name: 'id', kind: 'scalar', type: 'Int', isList: false },
          { name: 'name', kind: 'scalar', type: 'String', isList: false },
          { name: 'storeId', kind: 'scalar', type: 'Int', isList: false },
        ],
      },
      Project: {
        fields: [
          { name: 'id', kind: 'scalar', type: 'Int', isList: false },
          { name: 'name', kind: 'scalar', type: 'String', isList: false },
        ],
      },
      Customer: {
        fields: [
          { name: 'id', kind: 'scalar', type: 'Int', isList: false },
          { name: 'name', kind: 'scalar', type: 'String', isList: false },
          { name: 'memberLevel', kind: 'scalar', type: 'String', isList: false },
          { name: 'orders', kind: 'object', type: 'ProductOrder', isList: true },
        ],
      },
      ProductOrder: {
        fields: [
          { name: 'id', kind: 'scalar', type: 'Int', isList: false },
          { name: 'name', kind: 'scalar', type: 'String', isList: false },
          { name: 'netAmount', kind: 'scalar', type: 'Decimal', isList: false },
        ],
      },
    },
  };
}

function validInput(): BusinessDefinitionSnapshotInput {
  return {
    entities: [
      entity('product', 'Product', ['产品', '商品']),
      entity('project', 'Project', ['项目', '服务项目']),
      entity('customer', 'Customer', ['客户', '顾客']),
      entity('order', 'ProductOrder', ['订单']),
    ],
    relations: [relation('customer_orders', 'customer', 'order', ['orders'])],
    metrics: [metric()],
    dimensions: [dimension()],
  };
}

function providerFor(
  input: BusinessDefinitionSnapshotInput,
  dataModel: PrismaRuntimeDataModel = runtimeDataModel(),
): BusinessDefinitionSnapshotProvider & { loadActiveDefinitions: jest.Mock } {
  return {
    loadActiveDefinitions: jest.fn().mockResolvedValue(input),
    getRuntimeDataModel: jest.fn().mockReturnValue(dataModel),
  };
}

function runtimeFor(
  input: BusinessDefinitionSnapshotInput,
  mode: 'rules' | 'shadow' | 'model' = 'model',
  dataModel?: PrismaRuntimeDataModel,
) {
  const provider = providerFor(input, dataModel);
  const runtime = new BrainOntologyRuntimeService(provider, {
    runtime: { cognitionMode: mode },
  } as never);
  return { runtime, provider };
}

describe('BrainOntologyRuntimeService', () => {
  it('accepts a governed action with typed roles and a deterministic capability binding', async () => {
    const input = validInput();
    input.actions = [action()];
    const { runtime } = runtimeFor(input);

    const snapshot = await runtime.loadProductionReadySnapshot();

    expect(snapshot.actions).toEqual([
      expect.objectContaining({
        actionKey: 'action.create_purchase_order',
        targetEntityRefs: ['entity:product'],
        confirmationPolicy: 'required',
        idempotencyPolicy: 'required',
        situationContext: expect.objectContaining({
          profileKey: 'action.create_purchase_order.situation_context',
          tenantBoundary: 'current_store',
        }),
        modalityPolicy: expect.objectContaining({
          policyKey: 'action.create_purchase_order.speech_act_modality',
          supportedModalities: ['request'],
        }),
        informationArtifact: expect.objectContaining({
          profileKey: 'action.create_purchase_order.information_artifact',
          artifactTypePolicy: 'governed_result_reference',
        }),
        sideEffectInvariant: expect.objectContaining({
          profileKey: 'action.create_purchase_order.side_effect_invariant',
          successEvidencePolicy: 'all_declared_effects_observed',
        }),
        capabilityBindings: [
          expect.objectContaining({
            capabilityKey: 'purchase_order_draft',
            gatewayActionKey: 'create_purchase_order',
            enabled: true,
          }),
        ],
      }),
    ]);
    expect(snapshot.productionReady).toBe(true);
  });

  it('preserves the governed institutional participant role order during runtime normalization', async () => {
    const input = validInput();
    const base = action();
    const actionKey = 'action.cancel_reservation';
    const preconditions = [...base.preconditions];
    const participantProfile = createBusinessActionParticipantProfile({
      actionKey,
      inputSlots: base.inputSlots,
    });
    const relationProfile = createBusinessActionRelationProfile({
      actionKey,
      actionClass: 'transition',
      targetEntityRefs: base.targetEntityRefs,
      participantProfile,
    });
    const capabilityBindings = [
      {
        capabilityKey: 'reservation_action_preview',
        bindingMode: 'preview_and_execute' as const,
        gatewayActionKey: 'cancel_reservation',
        priority: 0,
        enabled: true,
      },
    ];
    input.actions = [
      action({
        actionKey,
        definitionKey: actionKey,
        definitionFingerprint: 'definition:action:cancel_reservation',
        sourceFingerprint: 'source:action:cancel_reservation',
        name: '取消预约',
        aliases: ['取消预约'],
        actionClass: 'transition',
        lexicalFrame: createTestBusinessActionLexicalFrame({
          actionKey,
          actionClass: 'transition',
          name: '取消预约',
          aliases: ['取消预约'],
          targetEntityRefs: base.targetEntityRefs,
          inputSlots: base.inputSlots,
          preconditions,
          effects: base.effects,
        }),
        situationContext: createTestBusinessActionSituationContextProfile(actionKey),
        modalityPolicy: createTestBusinessActionModalityPolicy(actionKey),
        informationArtifact: createTestBusinessActionInformationArtifactProfile(actionKey),
        sideEffectInvariant: createTestBusinessActionSideEffectInvariantProfile(actionKey, {
          preconditions,
          preconditionPredicateRefs: base.preconditionPredicateRefs,
          effects: base.effects,
          effectAssertionRefs: base.effectAssertionRefs,
        }),
        participantProfile,
        relationProfile,
        institutionalEffect: createBusinessActionInstitutionalEffectProfile({ actionKey, preconditions }),
        capabilityBindings,
        bindingFingerprint: createBusinessDefinitionProjectionFingerprint({ actionKey, capabilityBindings }),
      }),
    ];

    const { runtime } = runtimeFor(input);
    const snapshot = await runtime.loadProductionReadySnapshot();

    expect(snapshot.actions[0].institutionalEffect?.constitutionPolicy.requiredParticipantRoles).toEqual([
      'requester',
      'authorizer',
      'performer',
      'accountable_party',
    ]);
  });

  it('keeps normalized predicate contract references aligned with their semantic keys', async () => {
    const input = validInput();
    input.actions = [
      action({
        preconditions: ['quantity_positive', 'product_belongs_to_context_store'],
        preconditionPredicateRefs: [
          { key: 'quantity_positive', version: 1, fingerprint: 'b'.repeat(64) },
          { key: 'product_belongs_to_context_store', version: 1, fingerprint: 'a'.repeat(64) },
        ],
      }),
    ];
    const { runtime } = runtimeFor(input);

    const snapshot = await runtime.loadProductionReadySnapshot();

    expect(snapshot.actions[0].preconditions).toEqual(['product_belongs_to_context_store', 'quantity_positive']);
    expect(snapshot.actions[0].preconditionPredicateRefs.map((item) => item.key)).toEqual(
      snapshot.actions[0].preconditions,
    );
  });

  it.each([
    [
      'missing target entity',
      () => action({ targetEntityRefs: ['entity:purchase_order'] }),
      'action action.create_purchase_order target entity:purchase_order is missing',
    ],
    [
      'duplicate semantic slot',
      () => {
        const definition = action();
        return action({ inputSlots: [...definition.inputSlots, definition.inputSlots[0]] });
      },
      'duplicate active action action.create_purchase_order slot key: product',
    ],
    [
      'invalid binding fingerprint',
      () => action({ bindingFingerprint: 'invalid-binding-fingerprint' }),
      'action action.create_purchase_order binding fingerprint is invalid',
    ],
    [
      'invalid lexical frame fingerprint',
      () => {
        const definition = action();
        return action({ lexicalFrame: { ...definition.lexicalFrame, fingerprint: '0'.repeat(64) } });
      },
      'action action.create_purchase_order lexical frame fingerprint is invalid',
    ],
    [
      'invalid situation context fingerprint',
      () => {
        const definition = action();
        return action({ situationContext: { ...definition.situationContext, fingerprint: '0'.repeat(64) } });
      },
      'action action.create_purchase_order situation context fingerprint is invalid',
    ],
    [
      'invalid modality policy fingerprint',
      () => {
        const definition = action();
        return action({ modalityPolicy: { ...definition.modalityPolicy, fingerprint: '0'.repeat(64) } });
      },
      'action action.create_purchase_order modality policy fingerprint is invalid',
    ],
    [
      'unsupported modality policy field',
      () => {
        const definition = action();
        const modalityPolicy = { ...definition.modalityPolicy, modelMayExecuteDirectly: true } as never;
        const fingerprintInput = { ...(modalityPolicy as any) };
        delete fingerprintInput.fingerprint;
        return action({
          modalityPolicy: {
            ...(modalityPolicy as any),
            fingerprint: createBusinessDefinitionProjectionFingerprint(fingerprintInput),
          },
        });
      },
      'action action.create_purchase_order modality policy contains unsupported keys: modelMayExecuteDirectly',
    ],
    [
      'invalid information artifact fingerprint',
      () => {
        const definition = action();
        return action({
          informationArtifact: { ...definition.informationArtifact, fingerprint: '0'.repeat(64) },
        });
      },
      'action action.create_purchase_order information artifact fingerprint is invalid',
    ],
    [
      'unsupported information artifact field',
      () => {
        const definition = action();
        const informationArtifact = { ...definition.informationArtifact, trustModelValue: true } as never;
        const fingerprintInput = { ...(informationArtifact as any) };
        delete fingerprintInput.fingerprint;
        return action({
          informationArtifact: {
            ...(informationArtifact as any),
            fingerprint: createBusinessDefinitionProjectionFingerprint(fingerprintInput),
          },
        });
      },
      'action action.create_purchase_order information artifact profile contains unsupported keys: trustModelValue',
    ],
    [
      'invalid side-effect invariant fingerprint',
      () => {
        const definition = action();
        return action({
          sideEffectInvariant: { ...definition.sideEffectInvariant, fingerprint: '0'.repeat(64) },
        });
      },
      'action action.create_purchase_order side effect invariant fingerprint is invalid',
    ],
    [
      'unsupported side-effect invariant field',
      () => {
        const definition = action();
        const sideEffectInvariant = { ...definition.sideEffectInvariant, trustGatewaySuccess: true } as never;
        const fingerprintInput = { ...(sideEffectInvariant as any) };
        delete fingerprintInput.fingerprint;
        return action({
          sideEffectInvariant: {
            ...(sideEffectInvariant as any),
            fingerprint: createBusinessDefinitionProjectionFingerprint(fingerprintInput),
          },
        });
      },
      'action action.create_purchase_order side effect invariant profile contains unsupported keys: trustGatewaySuccess',
    ],
    [
      'uncontrolled confirmation policy',
      () => action({ confirmationPolicy: 'none' }),
      'action action.create_purchase_order confirmation policy must be controlled',
    ],
    [
      'missing idempotency policy',
      () => action({ idempotencyPolicy: 'not_applicable' }),
      'action action.create_purchase_order idempotency policy must be required',
    ],
  ])('rejects action ontology with %s', async (_name, makeAction, message) => {
    const input = validInput();
    input.actions = [makeAction()];
    const { runtime } = runtimeFor(input);

    await expect(runtime.loadProductionReadySnapshot()).rejects.toThrow(message);
    expect(runtime.getSnapshot()).toBeNull();
  });

  it.each([
    [
      'semantic_layer_mapping_required entity placeholder',
      () => {
        const input = validInput();
        input.entities[0].tableMap = { strategy: 'semantic_layer_mapping_required' };
        return input;
      },
      'semantic_layer_mapping_required',
    ],
    [
      'knowledge_graph_path relation placeholder',
      () => {
        const input = validInput();
        input.relations[0].joinPath = { strategy: 'knowledge_graph_path' };
        return input;
      },
      'knowledge_graph_path',
    ],
    [
      'metric without source',
      () => {
        const input = validInput();
        input.metrics[0].source = [];
        return input;
      },
      'metric net_revenue source is required',
    ],
    [
      'metric without formula',
      () => {
        const input = validInput();
        input.metrics[0].formula = null;
        return input;
      },
      'metric net_revenue formula is required',
    ],
    [
      'metric formula with an unknown Prisma field',
      () => {
        const input = validInput();
        input.metrics[0].formula = { type: 'sum', model: 'ProductOrder', field: 'missingField' };
        return input;
      },
      'Prisma field ProductOrder.missingField does not exist',
    ],
    [
      'metric formula without a controlled aggregation type',
      () => {
        const input = validInput();
        input.metrics[0].formula = { model: 'ProductOrder', field: 'netAmount' };
        return input;
      },
      'metric net_revenue formula.type is required',
    ],
    [
      'metric formula with an unknown aggregation type',
      () => {
        const input = validInput();
        input.metrics[0].formula = { type: 'median', model: 'ProductOrder', field: 'netAmount' };
        return input;
      },
      'metric net_revenue formula.type must be one of sum, count, count_distinct, avg, min, max',
    ],
    [
      'metric formula with an extra field',
      () => {
        const input = validInput();
        input.metrics[0].formula = {
          type: 'sum',
          model: 'ProductOrder',
          field: 'netAmount',
          precision: 2,
        };
        return input;
      },
      'metric net_revenue formula contains unsupported keys: precision',
    ],
    [
      'metric formula without an explicit Prisma model',
      () => {
        const input = validInput();
        input.metrics[0].formula = { type: 'sum', field: 'netAmount' };
        return input;
      },
      'metric net_revenue formula.model is required',
    ],
    [
      'metric string source without a governed Prisma model',
      () => {
        const input = validInput();
        input.metrics[0].source = ['MissingModel'];
        return input;
      },
      'metric net_revenue source must declare a Prisma model',
    ],
    [
      'metric object source without a governed Prisma model',
      () => {
        const input = validInput();
        input.metrics[0].source = [{ field: 'netAmount' }];
        return input;
      },
      'metric net_revenue source must declare a Prisma model',
    ],
    [
      'metric source with an unknown Prisma field',
      () => {
        const input = validInput();
        input.metrics[0].source = [{ model: 'ProductOrder', field: 'missingField' }];
        return input;
      },
      'Prisma field ProductOrder.missingField does not exist',
    ],
    [
      'metric source without a governed Prisma field',
      () => {
        const input = validInput();
        input.metrics[0].source = [{ model: 'ProductOrder' }];
        return input;
      },
      'metric net_revenue source must declare a Prisma model and field',
    ],
    [
      'metric source with an extra field',
      () => {
        const input = validInput();
        input.metrics[0].source = [{ model: 'ProductOrder', field: 'netAmount', alias: 'revenue' }];
        return input;
      },
      'metric net_revenue source contains unsupported keys: alias',
    ],
    [
      'metric string formula instead of a governed formula object',
      () => {
        const input = validInput();
        input.metrics[0].formula = 'sum(netAmount)';
        return input;
      },
      'metric net_revenue formula must be a controlled object',
    ],
    [
      'metric formula containing raw sql',
      () => {
        const input = validInput();
        input.metrics[0].formula = { type: 'sum', field: 'netAmount', sql: 'select 1' };
        return input;
      },
      'metric net_revenue formula cannot contain sql or query',
    ],
    [
      'metric formula containing a raw query type',
      () => {
        const input = validInput();
        input.metrics[0].formula = { type: 'query', field: 'netAmount' };
        return input;
      },
      'metric net_revenue formula cannot contain sql or query',
    ],
    [
      'metric formula without a governed aggregation field',
      () => {
        const input = validInput();
        input.metrics[0].formula = { type: 'sum' };
        return input;
      },
      'metric net_revenue formula.field is required',
    ],
    [
      'metric formula whose model cannot be uniquely derived from source',
      () => {
        const input = validInput();
        input.metrics[0].source = [
          { model: 'ProductOrder', field: 'netAmount' },
          { model: 'Customer', field: 'id' },
        ];
        input.metrics[0].formula = { type: 'sum', field: 'netAmount' };
        return input;
      },
      'metric net_revenue formula.model is required',
    ],
    [
      'dimension semantic placeholder without a physical source',
      () => {
        const input = validInput();
        input.dimensions[0].source = { type: 'semantic_dimension' };
        return input;
      },
      'dimension customer_level source must declare a Prisma model and field',
    ],
    [
      'dimension string source without a physical source',
      () => {
        const input = validInput();
        input.dimensions[0].source = 'Customer.memberLevel';
        return input;
      },
      'dimension customer_level source must declare a Prisma model and field',
    ],
    [
      'dimension source with an extra field',
      () => {
        const input = validInput();
        input.dimensions[0].source = { model: 'Customer', field: 'memberLevel', label: '等级' };
        return input;
      },
      'dimension customer_level source contains unsupported keys: label',
    ],
  ])('rejects %s', async (_name, makeInput, message) => {
    const { runtime } = runtimeFor(makeInput());

    await expect(runtime.loadProductionReadySnapshot()).rejects.toThrow(message);
    expect(runtime.getSnapshot()).toBeNull();
  });

  it('rejects a metric formula reference that is not covered by its declared source lineage', async () => {
    const input = validInput();
    input.metrics[0].source = [{ model: 'Customer', field: 'id' }];
    input.metrics[0].formula = { type: 'sum', model: 'ProductOrder', field: 'netAmount' };
    const { runtime } = runtimeFor(input);

    await expect(runtime.loadProductionReadySnapshot()).rejects.toThrow(
      'metric net_revenue formula reference ProductOrder.netAmount is not declared in source',
    );
    expect(runtime.getSnapshot()).toBeNull();
  });

  it('accepts a metric formula reference covered by a reasonable multi-source declaration', async () => {
    const input = validInput();
    input.metrics[0].source = [
      { model: 'Customer', field: 'id' },
      { model: 'ProductOrder', field: 'netAmount' },
    ];
    input.metrics[0].formula = { type: 'sum', model: 'ProductOrder', field: 'netAmount' };
    const { runtime } = runtimeFor(input);

    await expect(runtime.loadProductionReadySnapshot()).resolves.toMatchObject({ productionReady: true });
  });

  it('accepts a governed domain resolver metric without inventing a physical measure field', async () => {
    const input = validInput();
    const resolver = {
      kind: 'domain_service' as const,
      key: 'inventory_risk_summary' as const,
      dimensionFields: { productId: 'productId', productName: 'name' },
      expression: {
        op: 'subtract' as const,
        left: { op: 'field' as const, field: 'safetyStock' },
        right: { op: 'field' as const, field: 'currentStock' },
      },
      overallAggregation: 'max' as const,
    };
    input.metrics[0] = {
      ...input.metrics[0],
      metricKey: 'stock_risk_score',
      definitionKey: 'metric:stock_risk_score',
      formula: { type: 'score', resolver },
      source: [{ model: 'Product' }],
      runtimeQuery: {
        aggregation: 'score',
        joinPath: [],
        dimensions: ['productId', 'productName'],
        filters: [],
        capabilityKeys: ['inventory_risk_ranking'],
        executorKeys: ['BrainSemanticQueryCapabilityExecutor.inventoryRiskRanking'],
        outputFields: ['stock_risk_score'],
        resolver,
        timePolicy: { mode: 'as_of_snapshot', boundary: 'as_of', timezone: 'Asia/Shanghai' },
        storeScope: { mode: 'current_store', model: 'Product', field: 'storeId', joinPath: [] },
      },
    };
    const { runtime } = runtimeFor(input);

    await expect(runtime.loadProductionReadySnapshot()).resolves.toMatchObject({ productionReady: true });
  });

  it('rejects duplicate active logical keys even when versions differ', async () => {
    const input = validInput();
    input.entities.push(
      entity('product', 'Product', ['货品'], {
        definitionKey: 'entity:product:v2',
        sourceFingerprint: 'source:entity:product:v2',
        version: 2,
      }),
    );
    const { runtime } = runtimeFor(input);

    await expect(runtime.loadProductionReadySnapshot()).rejects.toThrow('duplicate active entity key: product');
  });

  it('rejects a relation whose endpoint is not in the published entity set', async () => {
    const input = validInput();
    input.relations.push(relation('order_payments', 'order', 'payment', ['payments']));
    const { runtime } = runtimeFor(input);

    await expect(runtime.loadProductionReadySnapshot()).rejects.toThrow(
      'relation order_payments endpoint payment is missing',
    );
  });

  it.each([
    [
      'unknown model',
      () => {
        const input = validInput();
        input.entities[0].tableMap = { model: 'MissingModel', fields: { id: 'id' } };
        return input;
      },
      'Prisma model MissingModel does not exist',
    ],
    [
      'unknown field',
      () => {
        const input = validInput();
        input.entities[0].tableMap = { model: 'Product', fields: { id: 'missingField' } };
        return input;
      },
      'Prisma field Product.missingField does not exist',
    ],
    [
      'invalid relation field path',
      () => {
        const input = validInput();
        input.relations[0].joinPath = { path: ['missingRelation'] };
        return input;
      },
      'Prisma relation field Customer.missingRelation does not exist',
    ],
  ])('keeps %s out of a production-ready snapshot', async (_name, makeInput, message) => {
    const { runtime } = runtimeFor(makeInput());

    await expect(runtime.loadProductionReadySnapshot()).rejects.toThrow(message);
    expect(runtime.getSnapshot()).toBeNull();
  });

  it('resolves Chinese aliases by exact, unique prefix, and controlled fuzzy match', async () => {
    const { runtime } = runtimeFor(validInput());
    await runtime.loadProductionReadySnapshot();

    expect(runtime.resolveEntityAlias('客户')).toMatchObject({
      status: 'resolved',
      matchType: 'exact',
      refs: [
        {
          definitionType: 'entity',
          definitionKey: 'entity:customer',
          definitionVersion: 1,
        },
      ],
    });
    expect(runtime.resolveEntityAlias('服务')).toMatchObject({
      status: 'resolved',
      matchType: 'prefix',
      refs: [{ definitionType: 'entity', definitionKey: 'entity:project', definitionVersion: 1 }],
    });
    expect(runtime.resolveEntityAlias('顾可')).toMatchObject({
      status: 'resolved',
      matchType: 'fuzzy',
      refs: [{ definitionType: 'entity', definitionKey: 'entity:customer', definitionVersion: 1 }],
    });
  });

  it('builds the alias index once per loaded snapshot and reuses it across resolutions', async () => {
    const { runtime } = runtimeFor(validInput());
    await runtime.loadProductionReadySnapshot();
    const firstIndex = (runtime as unknown as { aliasIndex: unknown }).aliasIndex;

    runtime.resolveEntityAlias('客户');
    runtime.resolveEntityAlias('服务');
    runtime.resolveEntityAlias('顾可');

    expect(firstIndex).toBeDefined();
    expect((runtime as unknown as { aliasIndex: unknown }).aliasIndex).toBe(firstIndex);
  });

  it('resolves aliases from an evaluation snapshot without requiring a production snapshot', () => {
    const { runtime } = runtimeFor(validInput(), 'rules');
    const evaluationSnapshot = buildProductionReadyBusinessDefinitionSnapshot(validInput(), runtimeDataModel());

    expect(runtime.getSnapshot()).toBeNull();
    expect(runtime.resolveEntityAlias('客户', evaluationSnapshot)).toMatchObject({
      status: 'resolved',
      matchType: 'exact',
      refs: [{ definitionType: 'entity', definitionKey: 'entity:customer', definitionVersion: 1 }],
    });
    expect(runtime.getSnapshot()).toBeNull();
  });

  it('returns ambiguity for alias collisions instead of selecting an entity', async () => {
    const input = validInput();
    input.entities[0].aliases.push('业务');
    input.entities[1].aliases.push('业务');
    const { runtime } = runtimeFor(input);
    await runtime.loadProductionReadySnapshot();

    expect(runtime.resolveEntityAlias('业务')).toMatchObject({
      status: 'ambiguity',
      matchType: 'exact',
      refs: [
        { definitionType: 'entity', definitionKey: 'entity:product' },
        { definitionType: 'entity', definitionKey: 'entity:project' },
      ],
    });
  });

  it('reuses immutable evaluation snapshots for the same normalized version set', async () => {
    const { runtime, provider } = runtimeFor(validInput(), 'rules');
    const loadEvaluationDefinitions = jest.fn().mockResolvedValue(validInput());
    (provider as BusinessDefinitionSnapshotProvider).loadEvaluationDefinitions = loadEvaluationDefinitions;

    const first = await runtime.loadEvaluationSnapshot([12, 11, 12]);
    const second = await runtime.loadEvaluationSnapshot([11, 12]);

    expect(second).toBe(first);
    expect(loadEvaluationDefinitions).toHaveBeenCalledTimes(1);
    expect(loadEvaluationDefinitions).toHaveBeenCalledWith([11, 12]);
  });

  it('evicts a failed evaluation snapshot load so the next request can recover', async () => {
    const { runtime, provider } = runtimeFor(validInput(), 'rules');
    const loadEvaluationDefinitions = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary_catalog_failure'))
      .mockResolvedValueOnce(validInput());
    (provider as BusinessDefinitionSnapshotProvider).loadEvaluationDefinitions = loadEvaluationDefinitions;

    await expect(runtime.loadEvaluationSnapshot([21])).rejects.toThrow('temporary_catalog_failure');
    await expect(runtime.loadEvaluationSnapshot([21])).resolves.toBeDefined();
    expect(loadEvaluationDefinitions).toHaveBeenCalledTimes(2);
  });

  it('does not fuzzy-match an unrelated short Chinese word through a long English entity key', async () => {
    const input = validInput();
    input.entities = [entity('customer', 'Customer', ['客户', '顾客'])];
    input.relations = [];
    input.metrics = [];
    input.dimensions = [];
    const { runtime } = runtimeFor(input);
    await runtime.loadProductionReadySnapshot();

    expect(runtime.resolveEntityAlias('天气')).toEqual({ status: 'not_found', refs: [] });
  });

  it('returns only declared governed joins up to four hops', async () => {
    const entities = Array.from({ length: 6 }, (_, index) => entity(`e${index + 1}`, `E${index + 1}`));
    const relations = Array.from({ length: 5 }, (_, index) =>
      relation(`r${index + 1}`, `e${index + 1}`, `e${index + 2}`, [`e${index + 2}`]),
    );
    const models = Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => {
        const current = index + 1;
        return [
          `E${current}`,
          {
            fields: [
              { name: 'id', kind: 'scalar', type: 'Int', isList: false },
              { name: 'name', kind: 'scalar', type: 'String', isList: false },
              ...(current < 6
                ? [{ name: `e${current + 1}`, kind: 'object', type: `E${current + 1}`, isList: false }]
                : []),
            ],
          },
        ];
      }),
    );
    const input = { entities, relations, metrics: [], dimensions: [] };
    const { runtime } = runtimeFor(input, 'model', { models });
    await runtime.loadProductionReadySnapshot();

    expect(runtime.findJoinPath('e1', 'e5')).toMatchObject({
      hopCount: 4,
      refs: [
        { definitionType: 'relation', definitionKey: 'relation:r1' },
        { definitionType: 'relation', definitionKey: 'relation:r2' },
        { definitionType: 'relation', definitionKey: 'relation:r3' },
        { definitionType: 'relation', definitionKey: 'relation:r4' },
      ],
    });
    expect(runtime.findJoinPath('e1', 'e6')).toBeNull();
    expect(runtime.findJoinPath('e1', 'not_declared')).toBeNull();
  });

  it('does not infer a join when no published relation declares it', async () => {
    const input = validInput();
    input.relations = [];
    const { runtime } = runtimeFor(input);
    await runtime.loadProductionReadySnapshot();

    expect(runtime.findJoinPath('customer', 'order')).toBeNull();
  });

  it('does not invent a reverse join path when only the forward path is governed', async () => {
    const { runtime } = runtimeFor(validInput());
    await runtime.loadProductionReadySnapshot();

    expect(runtime.findJoinPath('customer', 'order')).toMatchObject({ hopCount: 1 });
    expect(runtime.findJoinPath('order', 'customer')).toBeNull();
  });

  it('deep-freezes a normalized snapshot and keeps its fingerprint stable across input order', async () => {
    const firstInput = validInput();
    firstInput.entities[0].attributes = { z: 1, nested: { b: 2, a: 1 } };
    const secondInput = validInput();
    secondInput.entities[0].attributes = { nested: { a: 1, b: 2 }, z: 1 };
    secondInput.entities.reverse();
    secondInput.relations.reverse();
    const first = runtimeFor(firstInput).runtime;
    const second = runtimeFor(secondInput).runtime;

    const firstSnapshot = await first.loadProductionReadySnapshot();
    const secondSnapshot = await second.loadProductionReadySnapshot();

    expect(firstSnapshot.fingerprint).toBe(secondSnapshot.fingerprint);
    expect(firstSnapshot.productionReady).toBe(true);
    expect(Object.isFrozen(firstSnapshot)).toBe(true);
    expect(Object.isFrozen(firstSnapshot.entities)).toBe(true);
    expect(Object.isFrozen(firstSnapshot.entities[0].tableMap)).toBe(true);
  });

  it('canonicalizes semantic collection arrays before calculating the snapshot fingerprint', async () => {
    const firstInput = validInput();
    firstInput.entities[0].aliases = ['商品', '产品', '商品'];
    firstInput.metrics[0].permissions = ['finance:read', 'core:brain:use', 'finance:read'];
    firstInput.metrics[0].source = [
      { model: 'ProductOrder', field: 'netAmount' },
      { field: 'id', model: 'ProductOrder' },
    ];
    firstInput.dimensions[0].permissions = ['customer:read', 'core:brain:use', 'customer:read'];

    const secondInput = validInput();
    secondInput.entities[0].aliases = ['产品', '商品'];
    secondInput.metrics[0].permissions = ['core:brain:use', 'finance:read'];
    secondInput.metrics[0].source = [
      { model: 'ProductOrder', field: 'id' },
      { model: 'ProductOrder', field: 'netAmount' },
    ];
    secondInput.dimensions[0].permissions = ['core:brain:use', 'customer:read'];

    const firstSnapshot = await runtimeFor(firstInput).runtime.loadProductionReadySnapshot();
    const secondSnapshot = await runtimeFor(secondInput).runtime.loadProductionReadySnapshot();

    expect(firstSnapshot.fingerprint).toBe(secondSnapshot.fingerprint);
    expect(firstSnapshot.entities.find((item) => item.entityKey === 'product')?.aliases).toEqual(['产品', '商品']);
    expect(firstSnapshot.metrics[0].permissions).toEqual(['core:brain:use', 'finance:read']);
    expect(firstSnapshot.metrics[0].source).toEqual([
      { field: 'id', model: 'ProductOrder' },
      { field: 'netAmount', model: 'ProductOrder' },
    ]);
    expect(firstSnapshot.dimensions[0].permissions).toEqual(['core:brain:use', 'customer:read']);
  });

  it('keeps relation join path order significant in the snapshot fingerprint', async () => {
    const firstInput = validInput();
    firstInput.relations[0].joinPath = { path: ['orders', 'next'] };
    const secondInput = validInput();
    secondInput.relations[0].joinPath = { path: ['next', 'orders'] };
    const baseDataModel = runtimeDataModel();
    const dataModel: PrismaRuntimeDataModel = {
      models: {
        ...baseDataModel.models,
        Customer: {
          fields: [
            ...baseDataModel.models.Customer.fields,
            { name: 'next', kind: 'object', type: 'Customer', isList: false },
          ],
        },
        ProductOrder: {
          fields: [
            ...baseDataModel.models.ProductOrder.fields,
            { name: 'next', kind: 'object', type: 'ProductOrder', isList: false },
          ],
        },
      },
    };

    const firstSnapshot = await runtimeFor(firstInput, 'model', dataModel).runtime.loadProductionReadySnapshot();
    const secondSnapshot = await runtimeFor(secondInput, 'model', dataModel).runtime.loadProductionReadySnapshot();

    expect(firstSnapshot.fingerprint).not.toBe(secondSnapshot.fingerprint);
  });

  it('does not load definitions during module init in rules mode', async () => {
    const { runtime, provider } = runtimeFor(validInput(), 'rules');

    await runtime.onModuleInit();

    expect(provider.loadActiveDefinitions).not.toHaveBeenCalled();
    expect(runtime.getSnapshot()).toBeNull();
  });

  it('fails module init in model mode when the database definitions are placeholders', async () => {
    const input = validInput();
    input.entities[0].tableMap = { strategy: 'semantic_layer_mapping_required' };
    const { runtime } = runtimeFor(input, 'model');

    await expect(runtime.onModuleInit()).rejects.toThrow('semantic_layer_mapping_required');
    expect(runtime.getSnapshot()).toBeNull();
  });
});
