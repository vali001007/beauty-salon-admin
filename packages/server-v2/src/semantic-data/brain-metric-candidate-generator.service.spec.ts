import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { canonicalizeBusinessDefinition } from './business-definition-projection-compiler.service.js';
import { BrainMetricCandidateGeneratorService } from './brain-metric-candidate-generator.service.js';
import {
  BrainMetricPublishedDefinitionSourceService,
  BrainMetricSourceAdapters,
} from './brain-metric-source-adapters.js';
import type {
  BrainMetricPayloadFragment,
  BrainMetricSourceKind,
  BrainMetricSourceObservation,
  CanonicalMetricPayload,
} from './brain-metric-candidate.types.js';
import type { PrismaDatamodelAst } from './brain-semantic-candidate.types.js';
import { LEGACY_SEMANTIC_METRICS } from './legacy-semantic-metric.fixture.js';

describe('BrainMetricCandidateGeneratorService', () => {
  it('does not let legacy fixture evidence fill missing governance fields in an executable canonical payload', () => {
    const observations = completeMetricObservations('item_quantity');
    const executable = observations.find((item) => item.sourceKind === 'verified_executable_binding');
    if (!executable?.payload) throw new Error('test executable observation missing');
    delete (executable.payload as any).allowedTaskTypes;
    delete (executable.payload as any).sensitive;
    observations.push({
      metricKey: 'item_quantity',
      sourceKind: 'metric_declaration',
      authority: 'metric_template_declaration',
      sourcePath: 'packages/server-v2/src/semantic-data/legacy-semantic-metric.fixture.ts',
      sourceSymbol: 'LEGACY_SEMANTIC_METRICS.item_quantity',
      payload: { allowedTaskTypes: ['query'], sensitive: false },
      evidence: {},
    } as any);

    const result = new BrainMetricCandidateGeneratorService().generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    });

    expect(result.candidates[0]).toMatchObject({
      status: 'blocked',
      blockedReasons: expect.arrayContaining(['missing_allowed_task_types', 'missing_sensitive_flag']),
    });
  });
  const generator = new BrainMetricCandidateGeneratorService();

  it('drafts a complete synthetic verified metric', () => {
    const result = generator.generate({
      observations: completeMetricObservations(),
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    });

    expect(result.candidates).toEqual([
      expect.objectContaining({
        metricKey: 'item_quantity',
        status: 'draft',
        blockedReasons: [],
        draftInput: expect.objectContaining({
          definitionKey: 'metric.item_quantity',
          lifecycleStatus: 'draft',
          payload: expect.objectContaining({ metricKey: 'item_quantity' }),
        }),
      }),
    ]);
    expect(result.candidates[0].draftInput).not.toHaveProperty('fingerprint');
    expect(result.candidates[0].draftInput).not.toHaveProperty('version');
  });

  it('blocks a metric without a verified executable binding', () => {
    const observations = completeMetricObservations().filter(
      (item) => item.sourceKind !== 'verified_executable_binding',
    );
    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];

    expect(candidate.status).toBe('blocked');
    expect(candidate.blockedReasons).toContain('missing_verified_executable_binding');
  });

  it('does not allow a published definition to bypass the real executor gate', () => {
    const complete = completeMetricObservations();
    const payload = structuredClone(verifiedPayload(complete));
    const observations: BrainMetricSourceObservation[] = complete.filter(
      (item) => item.sourceKind !== 'verified_executable_binding',
    );
    observations.push(publishedObservation(payload));
    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];

    expect(candidate.status).toBe('blocked');
    expect(candidate.blockedReasons).toContain('missing_verified_executable_binding');
  });

  it('requires binding-only executor evidence to prove output and permissions against published canonical data', () => {
    const complete = completeMetricObservations();
    const payload = structuredClone(verifiedPayload(complete));
    const observations: BrainMetricSourceObservation[] = complete.filter(
      (item) => item.sourceKind !== 'verified_executable_binding',
    );
    observations.push(publishedObservation(payload), {
      metricKey: payload.metricKey,
      sourceKind: 'verified_executable_binding',
      authority: 'verified_executable_binding',
      sourcePath: 'semantic-query-executor.service.ts',
      sourceSymbol: 'queryItemQuantity',
      binding: {
        queryKey: payload.metricKey,
        executorRef: payload.bindings.executor[0],
      },
      evidence: {},
    });
    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];

    expect(candidate.status).toBe('blocked');
    expect(candidate.blockedReasons).toEqual(
      expect.arrayContaining(['verified_binding_output_mismatch:missing', 'verified_binding_permission_mismatch']),
    );
    expect(candidate.blockedReasons).not.toContain('incomplete_verified_formula');
  });

  it('accepts matching published canonical data only when complete real executor evidence exists', () => {
    const observations = completeMetricObservations();
    observations.push(publishedObservation(structuredClone(verifiedPayload(observations)), 'semantic.item_quantity.v7'));
    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];

    expect(candidate.status).toBe('draft');
    expect(candidate.draftInput?.fixtureSetKey).toBe('semantic.item_quantity.v7');
  });

  it('creates a fingerprinted fixture key when a published metric contract changes', () => {
    const observations = completeMetricObservations();
    const publishedPayload = structuredClone(verifiedPayload(observations));
    publishedPayload.dimensions = ['legacyDimension'];
    observations.push(publishedObservation(publishedPayload, 'semantic.item_quantity.v1'));
    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];

    expect(candidate.status).toBe('draft');
    expect(candidate.draftInput?.fixtureSetKey).toMatch(/^semantic\.item_quantity\.[a-f0-9]{12}$/);
    expect(candidate.draftInput?.fixtureSetKey).not.toBe('semantic.item_quantity.v1');
  });

  it('drafts from real legacy binding and executor observations merged by metric key', () => {
    const base = completeMetricObservations();
    const payload = structuredClone(verifiedPayload(base));
    payload.bindings.executor = ['brain-readonly-query-executor.service.ts#queryItemQuantity'];
    payload.bindings.outputField = ['quantity'];
    const adapterObservations = new BrainMetricSourceAdapters().observeTypeScriptSources({
      knownMetricKeys: new Set(['item_quantity']),
      sources: [
        {
          path: 'packages/server-v2/src/brain/semantic/brain-query-compiler.service.ts',
          content: `
            const METRIC_SQL = {
              item_quantity: {
                requiredPermission: 'core:order:view',
                queryKey: 'item_quantity',
                valueField: 'quantity',
              },
            };
          `,
        },
        {
          path: 'packages/server-v2/src/brain/semantic/brain-readonly-query-executor.service.ts',
          content: `
            class BrainReadonlyQueryExecutorService {
              execute(query) {
                switch (query.queryKey) {
                  case 'item_quantity': return this.queryItemQuantity(query);
                }
              }
            }
          `,
        },
      ],
    });
    const observations = [
      ...base.filter(
        (observation) =>
          observation.sourceKind === 'metric_declaration' || observation.sourceKind === 'template_declaration',
      ),
      publishedObservation(payload),
      ...adapterObservations,
    ];

    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];
    const legacy = adapterObservations.find((observation) => observation.sourceKind === 'legacy_metric_binding');
    const executor = adapterObservations.find(
      (observation) => observation.sourceKind === 'verified_executable_binding',
    );

    expect(legacy?.binding).toEqual(
      expect.objectContaining({ outputField: 'quantity', permissionAllOf: ['core:order:view'] }),
    );
    expect(executor?.binding).toEqual(
      expect.objectContaining({
        queryKey: 'item_quantity',
        executorRef: 'brain-readonly-query-executor.service.ts#queryItemQuantity',
      }),
    );
    expect(executor?.binding).not.toHaveProperty('outputField');
    expect(executor?.binding).not.toHaveProperty('permissionAllOf');
    expect(candidate).toEqual(
      expect.objectContaining({ metricKey: 'item_quantity', status: 'draft', blockedReasons: [] }),
    );
  });

  it('blocks a legacy binding whose queryKey disagrees with the metric and verified executor', () => {
    const observations = completeMetricObservations();
    observations.push({
      metricKey: 'item_quantity',
      sourceKind: 'legacy_metric_binding',
      authority: 'metric_template_declaration',
      sourcePath: 'packages/server-v2/src/brain/semantic/brain-query-compiler.service.ts',
      sourceSymbol: 'METRIC_SQL.item_quantity',
      binding: {
        queryKey: 'other_metric',
        outputField: 'quantity',
        permissionAllOf: ['core:order:view'],
      },
      evidence: {},
    });

    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];

    expect(candidate.status).toBe('blocked');
    expect(candidate.blockedReasons).toContain('legacy_binding_query_mismatch:other_metric');
  });

  it('does not combine output and permission from different legacy metric bindings', () => {
    const observations = completeMetricObservations();
    const verified = observations.find((observation) => observation.sourceKind === 'verified_executable_binding');
    if (verified?.binding) {
      verified.binding = {
        queryKey: 'item_quantity',
        executorRef: 'executor:item_quantity',
      };
    }
    observations.push(
      {
        metricKey: 'item_quantity',
        sourceKind: 'legacy_metric_binding',
        authority: 'metric_template_declaration',
        sourcePath: 'packages/server-v2/src/brain/semantic/brain-query-compiler.service.ts',
        sourceSymbol: 'METRIC_SQL.item_quantity.output',
        binding: { queryKey: 'item_quantity', outputField: 'quantity' },
        evidence: {},
      },
      {
        metricKey: 'item_quantity',
        sourceKind: 'legacy_metric_binding',
        authority: 'metric_template_declaration',
        sourcePath: 'packages/server-v2/src/brain/semantic/brain-query-compiler.service.ts',
        sourceSymbol: 'METRIC_SQL.item_quantity.permission',
        binding: { queryKey: 'item_quantity', permissionAllOf: ['core:order:view'] },
        evidence: {},
      },
    );

    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];

    expect(candidate.status).toBe('blocked');
    expect(candidate.blockedReasons).toContain('legacy_metric_binding_incomplete');
  });

  it.each<[string, BrainMetricPayloadFragment]>([
    ['formula', { measure: { aggregation: 'count', model: 'OrderItem', field: 'id' } }],
    [
      'time',
      {
        timePolicy: {
          mode: 'event_time',
          field: 'updatedAt',
          boundary: '[start,end)',
          timezone: 'Asia/Shanghai',
        },
      },
    ],
    ['permission', { permissionPolicies: [{ bindingRef: 'capability:item_quantity', allOf: ['core:finance:view'] }] }],
  ])('blocks %s conflicts instead of union or majority voting', (_name, conflictingPayload) => {
    const observations = completeMetricObservations();
    observations.push(observation('item_quantity', 'verified_executable_binding', conflictingPayload));
    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view', 'core:finance:view']),
    }).candidates[0];

    expect(candidate.status).toBe('blocked');
    expect(candidate.blockedReasons).toEqual(expect.arrayContaining([expect.stringContaining('conflict:')]));
    expect(candidate.draftInput).toMatchObject({
      definitionKey: 'metric.item_quantity',
      lifecycleStatus: 'candidate',
      payload: expect.objectContaining({ metricKey: 'item_quantity' }),
    });
  });

  it('blocks unregistered permissions', () => {
    const candidate = generator.generate({
      observations: completeMetricObservations(),
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(),
    }).candidates[0];

    expect(candidate.blockedReasons).toContain('unregistered_permission:core:order:view');
  });

  it('blocks empty permission policies and bindings', () => {
    const observations = completeMetricObservations();
    for (const item of observations) {
      if (item.payload?.permissionPolicies) item.payload.permissionPolicies = [];
    }
    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];

    expect(candidate.blockedReasons).toEqual(
      expect.arrayContaining(['missing_permission_policy', 'missing_permission_binding']),
    );
  });

  it('blocks non-executable joins and store scope', () => {
    const datamodel = completeDatamodel();
    datamodel.models[0].fields.find((field) => field.name === 'order')!.relationFromFields = [];
    datamodel.models[0].fields.find((field) => field.name === 'order')!.relationToFields = [];
    const candidate = generator.generate({
      observations: completeMetricObservations(),
      datamodel,
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];

    expect(candidate.blockedReasons).toEqual(
      expect.arrayContaining(['non_executable_join:OrderItem.order', 'invalid_store_scope:OrderItem.order.storeId']),
    );
  });

  it.each([
    [
      'detached start model',
      { mode: 'current_store', model: 'ProductOrder', field: 'storeId', joinPath: [] },
      'invalid_store_scope_anchor',
    ],
    [
      'non-store terminal field',
      { mode: 'current_store', model: 'OrderItem', field: 'id', joinPath: [] },
      'invalid_store_scope_field:id',
    ],
  ])('blocks a forged store scope with %s', (_name, storeScope, reason) => {
    const observations = completeMetricObservations();
    verifiedPayload(observations).storeScope = storeScope as CanonicalMetricPayload['storeScope'];
    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];

    expect(candidate.blockedReasons).toContain(reason);
  });

  it('accepts Store.id as the terminal current-store field for a governed join path', () => {
    const observations = completeMetricObservations('store_order_count');
    const payload = verifiedPayload(observations);
    payload.valueType = 'count';
    payload.measure = { aggregation: 'count', model: 'ProductOrder', field: 'id' };
    payload.sourceModels = ['ProductOrder', 'Store'];
    payload.joinPath = [{ fromModel: 'ProductOrder', relationField: 'store', toModel: 'Store' }];
    payload.filters = [];
    payload.dimensions = [];
    payload.timePolicy.field = 'ProductOrder.createdAt';
    payload.storeScope = {
      mode: 'current_store',
      model: 'ProductOrder',
      field: 'id',
      joinPath: [{ fromModel: 'ProductOrder', relationField: 'store', toModel: 'Store' }],
    };
    payload.bindings.outputField = ['orderCount'];
    const declaration = observations.find((item) => item.sourceKind === 'metric_declaration');
    if (declaration?.payload) {
      declaration.payload.measure = { aggregation: 'count' };
      declaration.payload.sourceModels = payload.sourceModels;
      declaration.payload.valueType = 'count';
    }
    const template = observations.find((item) => item.sourceKind === 'template_declaration');
    if (template?.payload) {
      template.payload.sourceModels = payload.sourceModels;
      template.payload.dimensions = [];
    }
    const executable = observations.find((item) => item.sourceKind === 'verified_executable_binding');
    if (executable?.binding) executable.binding.outputField = 'orderCount';

    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];

    expect(candidate.status).toBe('draft');
    expect(candidate.blockedReasons).not.toContain('invalid_store_scope_field:id');
  });

  it('blocks a resolver candidate whose store model conflicts with the shared resolver contract', () => {
    const observations = completeMetricObservations('staff_performance_score');
    const payload = verifiedPayload(observations);
    payload.measure = {
      aggregation: 'score',
      resolver: {
        kind: 'domain_service',
        key: 'manager_staff_analysis',
        dimensionFields: { staff_name: 'name' },
        expression: { op: 'field', field: 'serviceCount' },
        overallAggregation: 'avg',
      },
    };
    payload.sourceModels = ['ProductOrder'];
    payload.joinPath = [];
    payload.filters = [];
    payload.dimensions = [];
    payload.timePolicy.field = 'ProductOrder.createdAt';
    payload.storeScope = { mode: 'current_store', model: 'ProductOrder', field: 'storeId', joinPath: [] };

    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];

    expect(candidate.status).toBe('blocked');
    expect(candidate.blockedReasons).toContain('invalid_metric_resolver_store_scope:anchor_model:ProductOrder');
  });

  it('blocks a canonical payload whose metric identity differs from its observation envelope', () => {
    const observations = completeMetricObservations('envelope_key');
    verifiedPayload(observations).metricKey = 'payload_key';
    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];

    expect(candidate.blockedReasons).toContain('metric_identity_mismatch:payload_key');
    expect(candidate.status).toBe('blocked');
  });

  it.each([
    ['invalid value type', (payload: any) => (payload.valueType = 'sql')],
    ['invalid aggregation', (payload: any) => (payload.measure.aggregation = 'eval')],
    ['relation measure field', (payload: any) => (payload.measure.field = 'order')],
    ['non-DateTime time field', (payload: any) => (payload.timePolicy.field = 'OrderItem.quantity')],
    ['invalid timezone', (payload: any) => (payload.timePolicy.timezone = 'Mars/Olympus')],
    ['empty executor binding', (payload: any) => (payload.bindings.executor = [])],
    ['empty output binding', (payload: any) => (payload.bindings.outputField = [])],
  ])('blocks runtime-forged canonical payload: %s', (_name, mutate) => {
    const observations = completeMetricObservations();
    mutate(verifiedPayload(observations));
    const candidate = generator.generate({
      observations: observations as unknown as BrainMetricSourceObservation[],
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];

    expect(candidate.status).toBe('blocked');
    expect(candidate.blockedReasons.length).toBeGreaterThan(0);
  });

  it.each([
    [
      'event time without field',
      (payload: CanonicalMetricPayload) => {
        delete payload.timePolicy.field;
      },
    ],
    [
      'event time with as_of boundary',
      (payload: CanonicalMetricPayload) => {
        payload.timePolicy.boundary = 'as_of';
      },
    ],
    [
      'snapshot time with range boundary',
      (payload: CanonicalMetricPayload) => {
        payload.timePolicy.mode = 'as_of_snapshot';
        payload.timePolicy.boundary = '[start,end)';
      },
    ],
  ])('blocks incomplete time policy: %s', (_name, mutate) => {
    const observations = completeMetricObservations();
    mutate(verifiedPayload(observations));
    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];
    expect(candidate.status).toBe('blocked');
  });

  it.each([
    [
      'missing distinct field',
      (payload: CanonicalMetricPayload) => {
        payload.measure.aggregation = 'count_distinct';
        payload.measure.distinctField = 'missingField';
      },
    ],
    [
      'measure model outside source models',
      (payload: CanonicalMetricPayload) => {
        payload.sourceModels = ['ProductOrder'];
      },
    ],
  ])('blocks inconsistent measure declarations: %s', (_name, mutate) => {
    const observations = completeMetricObservations();
    mutate(verifiedPayload(observations));
    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];
    expect(candidate.status).toBe('blocked');
  });

  it('blocks a verified executable binding that does not prove the canonical entrypoint', () => {
    const observations = completeMetricObservations();
    const verified = observations.find((item) => item.sourceKind === 'verified_executable_binding')!;
    verified.binding = {
      queryKey: 'other_metric',
      executorRef: 'executor:other',
      outputField: 'other',
      permissionAllOf: ['core:finance:view'],
    };
    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view', 'core:finance:view']),
    }).candidates[0];

    expect(candidate.status).toBe('blocked');
    expect(candidate.blockedReasons).toEqual(
      expect.arrayContaining([
        'verified_binding_query_mismatch:other_metric',
        'verified_binding_executor_mismatch:executor:other',
        'verified_binding_output_mismatch:other',
        'verified_binding_permission_mismatch',
      ]),
    );
  });

  it('treats binding arrays as deduplicated sets while preserving join path order', () => {
    const observations = completeMetricObservations();
    const duplicate = structuredClone(observations.find((item) => item.sourceKind === 'verified_executable_binding')!);
    const payload = duplicate.payload as CanonicalMetricPayload;
    payload.bindings.template = [...payload.bindings.template, ...payload.bindings.template];
    payload.bindings.capability = [...payload.bindings.capability].reverse();
    payload.bindings.executor = [...payload.bindings.executor, ...payload.bindings.executor];
    payload.bindings.outputField = [...payload.bindings.outputField].reverse();
    observations.push(duplicate);

    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];

    expect(candidate.status).toBe('draft');
  });

  it('ignores formula-shaped language evidence', () => {
    const observations = completeMetricObservations();
    observations.push({
      ...observation('item_quantity', 'language_evidence'),
      payload: { measure: { aggregation: 'count', model: 'OrderItem', field: 'id' } },
      evidence: { text: 'count ids instead' },
    } as unknown as BrainMetricSourceObservation);
    const candidate = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    }).candidates[0];

    expect(candidate.status).toBe('draft');
    expect(candidate.draftInput?.payload.measure).toEqual({
      aggregation: 'sum',
      model: 'OrderItem',
      field: 'quantity',
    });
  });

  it('blocks colliding metric aliases without merging keys', () => {
    const observations = [
      ...completeMetricObservations(),
      ...completeMetricObservations('reservation_count'),
      languageObservation('item_quantity', '预约数'),
      languageObservation('reservation_count', '预约数'),
    ];
    const result = generator.generate({
      observations,
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    });

    expect(result.candidates.map((item) => item.metricKey)).toEqual(['item_quantity', 'reservation_count']);
    for (const candidate of result.candidates) {
      expect(candidate.blockedReasons).toContain('metric_alias_collision:预约数');
    }
  });

  it('lets the verified executable contract replace stale published aliases for the same metric', () => {
    const performance = completeMetricObservations('staff_performance_score');
    const performanceVerified = performance.find((item) => item.sourceKind === 'verified_executable_binding')!;
    performanceVerified.aliases = ['员工表现评分', '员工综合表现'];
    performance.push({
      ...publishedObservation(performanceVerified.payload as CanonicalMetricPayload),
      aliases: ['员工表现评分', '员工业绩'],
    });
    const revenue = completeMetricObservations('staff_service_revenue');
    const revenueVerified = revenue.find((item) => item.sourceKind === 'verified_executable_binding')!;
    revenueVerified.aliases = ['员工业绩', '员工服务收入'];

    const result = generator.generate({
      observations: [...performance, ...revenue],
      datamodel: completeDatamodel(),
      registeredPermissions: new Set(['core:order:view']),
    });
    const byKey = new Map(result.candidates.map((candidate) => [candidate.metricKey, candidate]));

    expect(byKey.get('staff_performance_score')?.aliases).toEqual(['员工表现评分', '员工综合表现']);
    expect(byKey.get('staff_service_revenue')?.aliases).toEqual(['员工业绩', '员工服务收入']);
    expect(byKey.get('staff_performance_score')?.blockedReasons).not.toContain('metric_alias_collision:员工业绩');
    expect(byKey.get('staff_service_revenue')?.blockedReasons).not.toContain('metric_alias_collision:员工业绩');
  });

  it('scans the current repository and drafts only metrics backed by verified Ami Core contracts', async () => {
    const workspaceRoot = join(process.cwd(), '..', '..');
    const scan = await new BrainMetricSourceAdapters().scanWorkspace({
      workspaceRoot,
      publishedDefinitionSource: emptyPublishedDefinitionSource(),
      legacyMetricDefinitions: LEGACY_SEMANTIC_METRICS,
    });
    const result = generator.generate(scan);
    const byKey = new Map(result.candidates.map((item) => [item.metricKey, item]));

    for (const key of ['product_sales_quantity', 'paid_amount']) {
      expect(byKey.get(key)).toBeDefined();
      expect(byKey.get(key)?.status).toBe('draft');
      expect(byKey.get(key)?.blockedReasons).toEqual([]);
    }
    for (const key of ['appointment_count', 'reservation_count', 'card_liability']) {
      expect(byKey.get(key)).toBeDefined();
      expect(byKey.get(key)?.status).toBe('blocked');
    }
    expect(byKey.get('appointment_count')?.blockedReasons).toEqual(
      expect.arrayContaining(['opaque_sql_formula', expect.stringContaining('metric_alias_collision')]),
    );
    expect(byKey.get('reservation_count')?.blockedReasons).toEqual(
      expect.arrayContaining([expect.stringContaining('metric_alias_collision')]),
    );
    expect(byKey.get('card_liability')?.blockedReasons).toEqual(
      expect.arrayContaining([
        'missing_template_declaration',
        expect.stringContaining('fallback'),
        expect.stringContaining('timePolicy'),
      ]),
    );
    for (const key of ['product_sales_quantity', 'paid_amount']) {
      expect(scan.observations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            metricKey: key,
            sourceKind: 'verified_executable_binding',
            sourcePath: 'packages/server-v2/src/semantic-data/ami-core-business-semantic-contracts.ts',
          }),
        ]),
      );
    }
    expect(byKey.get('reservation_count')?.blockedReasons).toContain('missing_verified_executable_binding');
  }, 60_000);

  it('rejects an untrusted published definition snapshot before generating observations', async () => {
    const workspaceRoot = join(process.cwd(), '..', '..');
    await expect(
      new BrainMetricSourceAdapters().scanWorkspace({
        workspaceRoot,
        publishedDefinitionSource: publishedSource({ snapshotFingerprint: '0'.repeat(64), definitions: [] }),
      }),
    ).rejects.toThrow('metric_published_snapshot_fingerprint_invalid');
  });

  it('rejects a self-signed published snapshot with an invalid definition fingerprint', async () => {
    const workspaceRoot = join(process.cwd(), '..', '..');
    const definitions = [
      {
        definitionId: 999,
        versionId: 999,
        definitionKey: 'metric.forged',
        kind: 'metric',
        domain: 'finance',
        name: 'Forged',
        ownerType: 'attacker',
        ownerId: null,
        version: 1,
        schemaVersion: '1.0',
        fingerprint: '0'.repeat(64),
        sourceFingerprint: '1'.repeat(64),
        payload: verifiedPayload(completeMetricObservations('forged')),
        canonicalQueryRef: null,
        fixtureSetKey: null,
        timezone: 'Asia/Shanghai',
        storeScope: { mode: 'current_store' },
        projections: [],
      },
    ];
    const snapshotFingerprint = createHash('sha256').update(canonicalizeBusinessDefinition(definitions)).digest('hex');

    await expect(
      new BrainMetricSourceAdapters().scanWorkspace({
        workspaceRoot,
        publishedDefinitionSource: publishedSource({ snapshotFingerprint, definitions }),
      }),
    ).rejects.toThrow('metric_published_definition_invalid');
  });
});

function completeMetricObservations(metricKey = 'item_quantity'): BrainMetricSourceObservation[] {
  const payload: CanonicalMetricPayload = {
    metricKey,
    description: 'Verified item quantity',
    valueType: 'count',
    allowedTaskTypes: ['query', 'ranking', 'diagnosis'],
    sensitive: false,
    measure: { aggregation: 'sum', model: 'OrderItem', field: 'quantity' },
    sourceModels: ['OrderItem', 'ProductOrder'],
    joinPath: [{ fromModel: 'OrderItem', relationField: 'order', toModel: 'ProductOrder' }],
    filters: [{ model: 'OrderItem', field: 'itemType', operator: 'eq', value: 'product' }],
    dimensions: ['productId'],
    timePolicy: {
      mode: 'event_time',
      field: 'ProductOrder.createdAt',
      boundary: '[start,end)',
      timezone: 'Asia/Shanghai',
    },
    storeScope: {
      mode: 'current_store',
      model: 'OrderItem',
      field: 'storeId',
      joinPath: [{ fromModel: 'OrderItem', relationField: 'order', toModel: 'ProductOrder' }],
    },
    permissionPolicies: [{ bindingRef: `capability:${metricKey}`, allOf: ['core:order:view'] }],
    exceptionPolicy: {
      cancelled: 'exclude',
      refunded: 'exclude',
      gifts: 'not_applicable',
      fallback: 'none',
    },
    bindings: {
      template: [`template:${metricKey}`],
      capability: [`capability:${metricKey}`],
      executor: [`executor:${metricKey}`],
      outputField: ['quantity'],
    },
  };
  return [
    observation(metricKey, 'metric_declaration', {
      description: payload.description,
      valueType: payload.valueType,
      measure: { aggregation: 'sum' },
      sourceModels: payload.sourceModels,
    }),
    observation(metricKey, 'template_declaration', {
      sourceModels: payload.sourceModels,
      dimensions: payload.dimensions,
      bindings: { template: payload.bindings.template, capability: payload.bindings.capability },
      permissionPolicies: payload.permissionPolicies,
    }),
    observation(metricKey, 'verified_executable_binding', payload),
  ];
}

function observation(
  metricKey: string,
  sourceKind: Exclude<BrainMetricSourceKind, 'published_definition'>,
  payload?: BrainMetricPayloadFragment,
): BrainMetricSourceObservation {
  const base = {
    metricKey,
    sourceKind,
    sourcePath: `src/${sourceKind}.ts`,
    sourceSymbol: `${sourceKind}:${metricKey}`,
    evidence: {},
  };
  if (sourceKind === 'language_evidence') {
    return { ...base, sourceKind, authority: 'language_evidence' };
  }
  if (sourceKind === 'verified_executable_binding') {
    const canonical = payload as CanonicalMetricPayload | undefined;
    return {
      ...base,
      sourceKind,
      authority: 'verified_executable_binding',
      payload,
      binding: {
        queryKey: metricKey,
        executorRef: canonical?.bindings?.executor?.[0] ?? `executor:${metricKey}`,
        outputField: canonical?.bindings?.outputField?.[0],
        permissionAllOf: canonical?.permissionPolicies?.flatMap((policy) => policy.allOf),
      },
    };
  }
  return { ...base, sourceKind, authority: 'metric_template_declaration', payload };
}

function languageObservation(metricKey: string, label: string): BrainMetricSourceObservation {
  return {
    ...observation(metricKey, 'language_evidence'),
    aliases: [label],
    evidence: { label },
  };
}

function publishedObservation(payload: CanonicalMetricPayload, fixtureSetKey?: string): BrainMetricSourceObservation {
  return {
    metricKey: payload.metricKey,
    sourceKind: 'published_definition',
    authority: 'published_definition',
    sourcePath: 'business-definition-registry://1',
    sourceSymbol: `metric.${payload.metricKey}@1`,
    payload,
    evidence: fixtureSetKey ? { fixtureSetKey } : {},
  };
}

function completeDatamodel(): PrismaDatamodelAst {
  return {
    models: [
      {
        name: 'OrderItem',
        fields: [
          { name: 'id', kind: 'scalar', type: 'Int', isRequired: true },
          { name: 'quantity', kind: 'scalar', type: 'Int', isRequired: true },
          { name: 'itemType', kind: 'scalar', type: 'String', isRequired: true },
          { name: 'productId', kind: 'scalar', type: 'Int', isRequired: false },
          {
            name: 'order',
            kind: 'object',
            type: 'ProductOrder',
            relationFromFields: ['orderId'],
            relationToFields: ['id'],
          },
          { name: 'orderId', kind: 'scalar', type: 'Int', isRequired: true },
        ],
      },
      {
        name: 'ProductOrder',
        fields: [
          { name: 'id', kind: 'scalar', type: 'Int', isRequired: true, isId: true },
          { name: 'storeId', kind: 'scalar', type: 'Int', isRequired: true },
          { name: 'createdAt', kind: 'scalar', type: 'DateTime', isRequired: true },
          {
            name: 'store',
            kind: 'object',
            type: 'Store',
            relationFromFields: ['storeId'],
            relationToFields: ['id'],
          },
        ],
      },
      {
        name: 'Store',
        fields: [{ name: 'id', kind: 'scalar', type: 'Int', isRequired: true, isId: true }],
      },
    ],
    enums: [],
  };
}

function verifiedPayload(observations: BrainMetricSourceObservation[]): CanonicalMetricPayload {
  const observation = observations.find((item) => item.sourceKind === 'verified_executable_binding');
  if (!observation?.payload) throw new Error('verified payload missing');
  return observation.payload as CanonicalMetricPayload;
}

function emptyPublishedDefinitionSource() {
  const definitions: unknown[] = [];
  return publishedSource({
    snapshotFingerprint: createHash('sha256').update(canonicalizeBusinessDefinition(definitions)).digest('hex'),
    definitions,
  });
}

function publishedSource(snapshot: { snapshotFingerprint: string; definitions: unknown[] }) {
  return new BrainMetricPublishedDefinitionSourceService({
    async getPublishedSnapshot() {
      return snapshot;
    },
  } as any);
}
