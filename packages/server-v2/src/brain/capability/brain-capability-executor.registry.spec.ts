import type { BrainRequestContext } from '../context/brain-request-context.js';
import { BrainTimeRangeParserService } from '../cognition/brain-time-range-parser.service.js';
import type { BrainDomainAdapter } from '../domain/brain-domain-adapter.types.js';
import { BrainActionCapabilityExecutor } from './executors/brain-action-capability.executor.js';
import { BrainDomainServiceCapabilityExecutor } from './executors/brain-domain-service-capability.executor.js';
import { BrainSemanticQueryCapabilityExecutor } from './executors/brain-semantic-query-capability.executor.js';
import {
  BrainCapabilityExecutorRegistryService,
  type BrainCapabilityExecutionInput,
  type BrainCapabilityExecutor,
  type BrainCapabilityExecutorKind,
} from './brain-capability-executor.registry.js';
import type { BrainCapabilityCard } from './brain-capability.types.js';

const SEMANTIC_KEYS = [
  'product_sales_ranking',
  'project_service_ranking',
  'staff_performance_ranking',
  'order_revenue_analysis',
  'inventory_risk_ranking',
] as const;

const DOMAIN_KEYS = [
  'store_operations_overview',
  'manager_staff_overview',
  'front_desk_operations_overview',
  'beautician_service_overview',
  'inventory_operations_overview',
  'finance_risk_overview',
  'marketing_growth_overview',
  'reservation_list',
  'customer_facts',
  'marketing_customer_segment',
  'finance_payment_breakdown',
  'inventory_procurement_advice',
] as const;

const ACTION_KEYS = [
  'reservation_action_preview',
  'customer_follow_up_draft',
  'purchase_order_draft',
  'marketing_touch_draft',
] as const;

const context = (overrides: Partial<BrainRequestContext> = {}): BrainRequestContext => ({
  userId: 9,
  storeId: 6,
  visibleStoreIds: [6],
  roles: ['store_manager'],
  permissions: ['core:test', 'core:metric:view'],
  deniedPermissions: [],
  requestId: 'request-1',
  timezone: 'Asia/Shanghai',
  ...overrides,
});

const card = (
  key: string,
  kind: BrainCapabilityExecutorKind,
  overrides: Partial<BrainCapabilityCard> = {},
): BrainCapabilityCard => ({
  key,
  version: 3,
  name: key,
  description: key,
  domains: [],
  intents: [],
  inputSchema: {},
  outputSchema: {},
  requiredPermissions: ['core:test'],
  allowedRoles: [],
  readOnly: kind !== 'action',
  sideEffect: kind === 'action',
  riskLevel: kind === 'action' ? 'high' : 'low',
  requiresConfirmation: kind === 'action',
  idempotency: kind === 'action' ? 'required' : 'not_applicable',
  timeoutMs: 10_000,
  grounding: kind === 'semantic' ? 'semantic_query' : 'domain_service',
  examples: [],
  sourceFingerprint: 'a'.repeat(64),
  definitionRefs: [
    {
      definitionId: 1,
      versionId: 1,
      definitionKey: `capability.${key}`,
      version: 1,
      definitionFingerprint: 'b'.repeat(64),
      sourceFingerprint: 'c'.repeat(64),
    },
  ],
  synonyms: [],
  negativeExamples: [],
  successSchema: {},
  ...overrides,
});

const input = (
  capabilityCard: BrainCapabilityCard,
  overrides: Partial<BrainCapabilityExecutionInput> = {},
): BrainCapabilityExecutionInput => ({
  card: capabilityCard,
  context: context(),
  runId: 41,
  question: 'show the current result',
  args: {},
  ...overrides,
});

const stubExecutor = (
  kind: BrainCapabilityExecutorKind,
  capabilityKeys: readonly string[],
): BrainCapabilityExecutor => ({
  kind,
  capabilityKeys,
  execute: jest.fn().mockResolvedValue({
    status: 'completed',
    answer: 'ok',
    citations: [],
    grounding: kind === 'semantic' ? 'metric_query' : 'db_skill',
  }),
});

describe('BrainCapabilityExecutorRegistryService', () => {
  it('resolves all 20 discoverable capability keys', () => {
    const snapshot = { loadActiveDefinitions: jest.fn() };
    const timeParser = { parse: jest.fn() };
    const semanticQuery = { execute: jest.fn() };
    const skillRuntime = {};
    const customerFacts = {};
    const adapterRegistry = {};
    const registry = new BrainCapabilityExecutorRegistryService([
      new BrainSemanticQueryCapabilityExecutor(snapshot as never, timeParser as never, semanticQuery as never),
      new BrainDomainServiceCapabilityExecutor(skillRuntime as never, customerFacts as never, timeParser as never),
      new BrainActionCapabilityExecutor(adapterRegistry as never),
    ]);

    expect([...SEMANTIC_KEYS, ...DOMAIN_KEYS, ...ACTION_KEYS]).toHaveLength(21);
    for (const key of SEMANTIC_KEYS) expect(registry.resolve(key).kind).toBe('semantic');
    for (const key of DOMAIN_KEYS) expect(registry.resolve(key).kind).toBe('domain');
    for (const key of ACTION_KEYS) expect(registry.resolve(key).kind).toBe('action');
  });

  it('rejects duplicate and unknown capability keys', () => {
    expect(
      () =>
        new BrainCapabilityExecutorRegistryService([
          stubExecutor('domain', ['customer_facts']),
          stubExecutor('domain', ['customer_facts']),
        ]),
    ).toThrow('Duplicate Ami Brain capability executor key: customer_facts');

    const registry = new BrainCapabilityExecutorRegistryService([]);
    expect(() => registry.resolve('missing_capability')).toThrow(
      'Unknown Ami Brain capability executor key: missing_capability',
    );
  });

  it('fails closed for cross-store execution', async () => {
    const registry = new BrainCapabilityExecutorRegistryService([stubExecutor('domain', ['customer_facts'])]);

    await expect(
      registry.execute(
        input(card('customer_facts', 'domain'), { context: context({ storeId: 7, visibleStoreIds: [6] }) }),
      ),
    ).rejects.toThrow('store_scope_denied');
  });

  it('applies denied permissions before wildcard grants and rejects missing grants', async () => {
    const registry = new BrainCapabilityExecutorRegistryService([stubExecutor('domain', ['customer_facts'])]);
    const capabilityCard = card('customer_facts', 'domain', { requiredPermissions: ['core:customer:view'] });

    await expect(
      registry.execute(
        input(capabilityCard, { context: context({ permissions: ['*'], deniedPermissions: ['core:customer:view'] }) }),
      ),
    ).rejects.toThrow('permission_denied:core:customer:view');
    await expect(
      registry.execute(input(capabilityCard, { context: context({ permissions: ['core:test'] }) })),
    ).rejects.toThrow('missing_permission:core:customer:view');
  });

  it('requires an allowed role intersection and accepts a wildcard role', async () => {
    const registry = new BrainCapabilityExecutorRegistryService([stubExecutor('domain', ['customer_facts'])]);
    const capabilityCard = card('customer_facts', 'domain', { allowedRoles: ['store_manager'] });

    await expect(registry.execute(input(capabilityCard, { context: context({ roles: undefined }) }))).rejects.toThrow(
      'role_denied',
    );
    await expect(
      registry.execute(input(capabilityCard, { context: context({ roles: ['receptionist'] }) })),
    ).rejects.toThrow('role_denied');
    await expect(
      registry.execute(input(capabilityCard, { context: context({ roles: ['*'] }) })),
    ).resolves.toMatchObject({ answer: 'ok' });
  });

  it('recursively rejects identity and scope fields from model args', async () => {
    const registry = new BrainCapabilityExecutorRegistryService([stubExecutor('domain', ['customer_facts'])]);

    await expect(
      registry.execute(
        input(card('customer_facts', 'domain'), {
          args: { filters: [{ nested: { visibleStoreIds: [6, 7] } }] },
        }),
      ),
    ).rejects.toThrow('identity_arg_forbidden:visibleStoreIds');
  });

  it.each(['role', 'roleHint'])('rejects nested %s injection from model args', async (field) => {
    const registry = new BrainCapabilityExecutorRegistryService([stubExecutor('domain', ['customer_facts'])]);

    await expect(
      registry.execute(
        input(card('customer_facts', 'domain'), {
          args: { nested: { [field]: 'store_manager' } },
        }),
      ),
    ).rejects.toThrow(`identity_arg_forbidden:${field}`);
  });

  it.each(['store_id', 'currentStoreId', 'shopId', 'tenant_id', 'permissionCodes', 'role_hint'])(
    'rejects normalized identity alias %s from model args',
    async (field) => {
      const registry = new BrainCapabilityExecutorRegistryService([stubExecutor('domain', ['customer_facts'])]);

      await expect(
        registry.execute(
          input(card('customer_facts', 'domain'), {
            args: { nested: { [field]: 9 } },
          }),
        ),
      ).rejects.toThrow(`identity_arg_forbidden:${field}`);
    },
  );

  it('validates card declarations for each executor kind', async () => {
    const registry = new BrainCapabilityExecutorRegistryService([
      stubExecutor('semantic', ['product_sales_ranking']),
      stubExecutor('domain', ['customer_facts']),
      stubExecutor('action', ['purchase_order_draft']),
    ]);

    await expect(
      registry.execute(input(card('product_sales_ranking', 'semantic', { grounding: 'domain_service' }))),
    ).rejects.toThrow('invalid_capability_card:semantic');
    await expect(registry.execute(input(card('customer_facts', 'domain', { sideEffect: true })))).rejects.toThrow(
      'invalid_capability_card:domain',
    );
    await expect(
      registry.execute(input(card('purchase_order_draft', 'action', { requiresConfirmation: false }))),
    ).rejects.toThrow('invalid_capability_card:action');
  });

  it('adds immutable capability lineage to answer metadata', async () => {
    const executor = stubExecutor('domain', ['customer_facts']);
    (executor.execute as jest.Mock).mockResolvedValue({
      status: 'completed',
      answer: 'facts',
      citations: [],
      grounding: 'db_skill',
      metadata: { capabilityKey: 'spoofed', source: 'customer-db' },
    });
    const registry = new BrainCapabilityExecutorRegistryService([executor]);

    const answer = await registry.execute(input(card('customer_facts', 'domain')));

    expect(answer.metadata).toEqual({
      capabilityKey: 'customer_facts',
      capabilityVersion: 3,
      executorKind: 'domain',
      source: 'customer-db',
    });
  });
});

describe('BrainSemanticQueryCapabilityExecutor', () => {
  const runtimeDataModel = {
    models: {
      ProductOrder: {
        fields: [
          { name: 'id', kind: 'scalar', type: 'Int', isList: false },
          { name: 'netAmount', kind: 'scalar', type: 'Decimal', isList: false },
          { name: 'totalAmount', kind: 'scalar', type: 'Decimal', isList: false },
          { name: 'status', kind: 'scalar', type: 'String', isList: false },
          { name: 'storeId', kind: 'scalar', type: 'Int', isList: false },
          { name: 'paidAt', kind: 'scalar', type: 'DateTime', isList: false },
        ],
      },
      OrderItem: {
        fields: [
          { name: 'id', kind: 'scalar', type: 'Int', isList: false },
          { name: 'quantity', kind: 'scalar', type: 'Int', isList: false },
          { name: 'createdAt', kind: 'scalar', type: 'DateTime', isList: false },
          { name: 'order', kind: 'object', type: 'ProductOrder', isList: false },
          { name: 'product', kind: 'object', type: 'Product', isList: false },
        ],
      },
      Product: {
        fields: [
          { name: 'id', kind: 'scalar', type: 'Int', isList: false },
          { name: 'name', kind: 'scalar', type: 'String', isList: false },
        ],
      },
      Customer: {
        fields: [
          { name: 'id', kind: 'scalar', type: 'Int', isList: false },
          { name: 'storeId', kind: 'scalar', type: 'Int', isList: false },
          { name: 'createdAt', kind: 'scalar', type: 'DateTime', isList: false },
          { name: 'productOrders', kind: 'object', type: 'ProductOrder', isList: true },
        ],
      },
    },
  };
  const parsedTime = {
    mentionedTime: true,
    filters: [],
    range: {
      label: '本月',
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-13T23:59:59.999Z'),
      granularity: 'month',
    },
    requiresComparison: false,
    unsupportedExpressions: [],
  };
  const publishedMetric = (
    metricKey: string,
    runtimeOverrides: Record<string, unknown> = {},
    overrides: Record<string, unknown> = {},
  ) => ({
    definitionKey: `metric.${metricKey}`,
    version: 2,
    sourceFingerprint: `fingerprint-${metricKey}`,
    metricKey,
    name: metricKey,
    domain: 'sales',
    formula: { type: 'sum', model: 'ProductOrder', field: 'amount' },
    source: [{ model: 'ProductOrder', field: 'amount' }],
    defaultFilters: [{ model: 'ProductOrder', field: 'status', operator: 'eq', value: 'paid' }],
    permissions: ['core:metric:view'],
    description: metricKey,
    allowedTaskTypes: ['query', 'ranking'],
    runtimeQuery: {
      aggregation: 'sum',
      joinPath: [],
      dimensions: ['productId', 'productName'],
      filters: [{ model: 'ProductOrder', field: 'status', operator: 'eq', value: 'paid' }],
      capabilityKeys: ['product_sales_ranking'],
      executorKeys: ['BusinessDefinitionRuntimeQueryExecutor.execute'],
      outputFields: ['productSalesQuantity'],
      timePolicy: {
        mode: 'event_time',
        field: 'ProductOrder.paidAt',
        boundary: '[start,end)',
        timezone: 'Asia/Shanghai',
      },
      storeScope: {
        mode: 'current_store',
        model: 'ProductOrder',
        field: 'storeId',
        joinPath: [],
      },
      ...runtimeOverrides,
    },
    ...overrides,
  });
  const publishedDimension = (
    dimensionKey: string,
    source: { model: string; field: string },
    permissions: string[] = ['core:metric:view'],
  ) => ({
    definitionKey: `dimension.${dimensionKey}`,
    version: 1,
    sourceFingerprint: `fingerprint-${dimensionKey}`,
    dimensionKey,
    name: dimensionKey,
    domain: 'sales',
    source,
    permissions,
  });
  const provider = (metrics: unknown[], dimensions: unknown[] = [], dataModel = runtimeDataModel) => ({
    loadActiveDefinitions: jest.fn().mockResolvedValue({ entities: [], relations: [], metrics, dimensions }),
    getRuntimeDataModel: jest.fn().mockReturnValue(dataModel),
  });
  const parser = { parse: jest.fn().mockReturnValue(parsedTime) };

  it('fails closed when no published metric is bound to the capability', async () => {
    const snapshot = {
      loadActiveDefinitions: jest.fn().mockResolvedValue({ entities: [], relations: [], dimensions: [], metrics: [] }),
    };
    const semanticQuery = { execute: jest.fn() };
    const executor = new BrainSemanticQueryCapabilityExecutor(
      { ...snapshot, getRuntimeDataModel: jest.fn().mockReturnValue(runtimeDataModel) } as never,
      parser as never,
      semanticQuery as never,
    );

    await expect(executor.execute(input(card('product_sales_ranking', 'semantic')))).rejects.toThrow(
      'semantic_capability_binding_missing:product_sales_ranking',
    );
    expect(semanticQuery.execute).not.toHaveBeenCalled();
  });

  it('rejects a ranking capability bound only to diagnosis metrics', async () => {
    const semanticQuery = { productOrder: { findMany: jest.fn() } };
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider([
        publishedMetric(
          'published_sales',
          { dimensions: [], outputFields: ['salesAmount'] },
          {
            formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' },
            allowedTaskTypes: ['diagnosis'],
          },
        ),
      ]) as never,
      parser as never,
      semanticQuery as never,
    );

    await expect(
      executor.execute(
        input(card('product_sales_ranking', 'semantic', { requiredPermissions: ['core:metric:view'] })),
      ),
    ).rejects.toThrow(
      'semantic_capability_task_type_not_allowed:product_sales_ranking:published_sales:diagnosis',
    );
    expect(semanticQuery.productOrder.findMany).not.toHaveBeenCalled();
  });

  it('fails closed when a legacy metric snapshot has no runtime binding', async () => {
    const semanticQuery = { execute: jest.fn() };
    const executor = new BrainSemanticQueryCapabilityExecutor(
      {
        loadActiveDefinitions: jest.fn().mockResolvedValue({
          entities: [],
          relations: [],
          dimensions: [],
          metrics: [{ metricKey: 'legacy_metric_without_binding' }],
        }),
        getRuntimeDataModel: jest.fn().mockReturnValue(runtimeDataModel),
      } as never,
      parser as never,
      semanticQuery as never,
    );

    await expect(executor.execute(input(card('product_sales_ranking', 'semantic')))).rejects.toThrow(
      'semantic_capability_binding_missing:product_sales_ranking',
    );
    expect(semanticQuery.execute).not.toHaveBeenCalled();
  });

  it('changes Prisma select and aggregated result when the published measure field changes', async () => {
    const definitionProvider = provider([]);
    definitionProvider.loadActiveDefinitions
      .mockResolvedValueOnce({
        entities: [],
        relations: [],
        dimensions: [],
        metrics: [
          publishedMetric(
            'published_sales',
            { dimensions: [], outputFields: ['publishedValue'] },
            {
              formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' },
            },
          ),
        ],
      })
      .mockResolvedValueOnce({
        entities: [],
        relations: [],
        dimensions: [],
        metrics: [
          publishedMetric(
            'published_sales',
            { dimensions: [], outputFields: ['publishedValue'] },
            {
              formula: { type: 'sum', model: 'ProductOrder', field: 'totalAmount' },
            },
          ),
        ],
      });
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ netAmount: 120 }])
      .mockResolvedValueOnce([{ totalAmount: 75 }]);
    const executor = new BrainSemanticQueryCapabilityExecutor(
      definitionProvider as never,
      parser as never,
      { productOrder: { findMany } } as never,
    );
    const capabilityInput = input(
      card('product_sales_ranking', 'semantic', {
        requiredPermissions: ['core:metric:view'],
      }),
    );

    const net = await executor.execute(capabilityInput);
    const total = await executor.execute(capabilityInput);

    expect(findMany.mock.calls[0][0].select).toEqual(expect.objectContaining({ netAmount: true }));
    expect(findMany.mock.calls[1][0].select).toEqual(expect.objectContaining({ totalAmount: true }));
    expect((net as any).blocks[0].rows).toEqual([{ publishedValue: 120 }]);
    expect((total as any).blocks[0].rows).toEqual([{ publishedValue: 75 }]);
  });

  it('changes Prisma where and count result when a published filter changes', async () => {
    const definitionProvider = provider([]);
    definitionProvider.loadActiveDefinitions
      .mockResolvedValueOnce({
        entities: [],
        relations: [],
        dimensions: [],
        metrics: [
          publishedMetric(
            'published_orders',
            {
              aggregation: 'count',
              dimensions: [],
              outputFields: ['orderCount'],
              filters: [{ model: 'ProductOrder', field: 'status', operator: 'eq', value: 'paid' }],
            },
            { formula: { type: 'count', model: 'ProductOrder', field: 'id' } },
          ),
        ],
      })
      .mockResolvedValueOnce({
        entities: [],
        relations: [],
        dimensions: [],
        metrics: [
          publishedMetric(
            'published_orders',
            {
              aggregation: 'count',
              dimensions: [],
              outputFields: ['orderCount'],
              filters: [{ model: 'ProductOrder', field: 'status', operator: 'eq', value: 'completed' }],
            },
            { formula: { type: 'count', model: 'ProductOrder', field: 'id' } },
          ),
        ],
      });
    const findMany = jest.fn(async (query: unknown) =>
      JSON.stringify(query).includes('completed') ? [{ id: 1 }, { id: 2 }] : [{ id: 1 }],
    );
    const executor = new BrainSemanticQueryCapabilityExecutor(
      definitionProvider as never,
      parser as never,
      { productOrder: { findMany } } as never,
    );
    const capabilityInput = input(
      card('product_sales_ranking', 'semantic', {
        requiredPermissions: ['core:metric:view'],
      }),
    );

    const paid = await executor.execute(capabilityInput);
    const completed = await executor.execute(capabilityInput);

    expect(JSON.stringify((findMany.mock.calls[0][0] as any).where)).toContain('paid');
    expect(JSON.stringify((findMany.mock.calls[1][0] as any).where)).toContain('completed');
    expect((paid as any).blocks[0].rows).toEqual([{ orderCount: 1 }]);
    expect((completed as any).blocks[0].rows).toEqual([{ orderCount: 2 }]);
  });

  it('uses only context storeId in Prisma where and groups by a published dimension', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { netAmount: 80, status: 'paid' },
      { netAmount: 20, status: 'paid' },
    ]);
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider(
        [
          publishedMetric(
            'published_sales',
            {
              dimensions: ['order_status'],
              outputFields: ['salesAmount'],
            },
            { formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' } },
          ),
        ],
        [publishedDimension('order_status', { model: 'ProductOrder', field: 'status' })],
      ) as never,
      parser as never,
      { productOrder: { findMany } } as never,
    );

    const answer = await executor.execute(
      input(
        card('product_sales_ranking', 'semantic', {
          requiredPermissions: ['core:metric:view'],
          intents: ['ranking'],
        }),
        { context: context({ storeId: 6, visibleStoreIds: [6, 99] }), args: { storeId: 99, limit: 999 } },
      ),
    );

    expect(JSON.stringify(findMany.mock.calls[0][0].where)).toContain('"storeId":6');
    expect(JSON.stringify(findMany.mock.calls[0][0].where)).not.toContain('"storeId":99');
    expect(findMany.mock.calls[0][0].take).toBe(5001);
    expect((answer as any).blocks[0].rows).toEqual([{ order_status: 'paid', salesAmount: 100 }]);
  });

  it('uses structured time args before question text and rejects unsupported dynamic filters', async () => {
    const findMany = jest.fn().mockResolvedValue([{ netAmount: 80 }]);
    const timeParser = { parse: jest.fn(() => parsedTime) };
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider([
        publishedMetric(
          'published_sales',
          { dimensions: [], outputFields: ['salesAmount'] },
          { formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' } },
        ),
      ]) as never,
      timeParser as never,
      { productOrder: { findMany } } as never,
    );
    const capabilityInput = input(
      card('product_sales_ranking', 'semantic', { requiredPermissions: ['core:metric:view'] }),
      {
        question: '本月商品销售额',
        args: {
          objective: '查询六月商品销售额',
          time: { label: '六月', startDate: '2026-06-01', endDate: '2026-06-30', timezone: 'Asia/Shanghai' },
          entities: [],
          metrics: [],
          dimensions: [],
          filters: [],
          orderBy: [],
        },
      },
    );

    await executor.execute(capabilityInput);

    expect(timeParser.parse).not.toHaveBeenCalled();
    expect(findMany.mock.calls[0][0].where.AND).toEqual(
      expect.arrayContaining([
        {
          paidAt: {
            gte: new Date('2026-05-31T16:00:00.000Z'),
            lt: new Date('2026-06-30T16:00:00.000Z'),
          },
        },
      ]),
    );

    await expect(
      executor.execute({
        ...capabilityInput,
        args: { ...capabilityInput.args, filters: [{ fieldRef: { definitionKey: 'field.status' }, operator: 'eq', value: 'paid' }] },
      }),
    ).rejects.toThrow('semantic_filter_args_unsupported:product_sales_ranking');

    await expect(
      executor.execute({
        ...capabilityInput,
        args: {
          ...capabilityInput.args,
          orderBy: [{
            definitionRef: { definitionKey: 'metric.published_sales' },
            direction: 'desc',
          }],
        },
      }),
    ).resolves.toMatchObject({ status: 'completed' });

    await expect(
      executor.execute({
        ...capabilityInput,
        args: {
          ...capabilityInput.args,
          entities: [{ entityType: 'Product', entityKey: 'product', mention: '商品' }],
        },
      }),
    ).resolves.toMatchObject({ status: 'completed' });

    await expect(
      executor.execute({
        ...capabilityInput,
        args: {
          ...capabilityInput.args,
          entities: [{ entityType: 'product', entityKey: 'product:18', mention: '某商品' }],
        },
      }),
    ).rejects.toThrow('semantic_entity_filter_args_unsupported:product_sales_ranking');
  });

  it('parses the structured Chinese time label before the machine preset', async () => {
    const findMany = jest.fn().mockResolvedValue([{ netAmount: 80 }]);
    const timeParser = { parse: jest.fn(() => parsedTime) };
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider([
        publishedMetric(
          'published_sales',
          { dimensions: [], outputFields: ['salesAmount'] },
          { formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' } },
        ),
      ]) as never,
      timeParser as never,
      { productOrder: { findMany } } as never,
    );

    await executor.execute(
      input(card('product_sales_ranking', 'semantic', { requiredPermissions: ['core:metric:view'] }), {
        question: 'words without a time expression',
        args: {
          time: { label: '今天', preset: 'today', timezone: 'Asia/Shanghai' },
          entities: [],
          metrics: [],
          dimensions: [],
          filters: [],
          orderBy: [],
        },
      }),
    );

    expect(timeParser.parse).toHaveBeenCalledWith('今天', expect.objectContaining({ now: expect.any(Date) }));
  });

  it('fails closed when card permissions do not cover metric permissions', async () => {
    const executor = new BrainSemanticQueryCapabilityExecutor(
      {
        loadActiveDefinitions: jest.fn().mockResolvedValue({
          entities: [],
          relations: [],
          dimensions: [],
          metrics: [publishedMetric('product_sales_quantity')],
        }),
        getRuntimeDataModel: jest.fn().mockReturnValue(runtimeDataModel),
      } as never,
      parser as never,
      { productOrder: { findMany: jest.fn() } } as never,
    );

    await expect(executor.execute(input(card('product_sales_ranking', 'semantic')))).rejects.toThrow(
      'metric_permission_not_covered:product_sales_quantity:core:metric:view',
    );
  });

  it('fails closed when card and actor permissions do not cover a published dimension', async () => {
    const findMany = jest.fn();
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider(
        [
          publishedMetric(
            'sales_amount',
            { dimensions: ['order_status'], outputFields: ['salesAmount'] },
            {
              formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' },
            },
          ),
        ],
        [publishedDimension('order_status', { model: 'ProductOrder', field: 'status' }, ['core:staff:sensitive'])],
      ) as never,
      parser as never,
      { productOrder: { findMany } } as never,
    );

    await expect(
      executor.execute(
        input(
          card('product_sales_ranking', 'semantic', {
            requiredPermissions: ['core:metric:view'],
          }),
          {
            context: context({ permissions: ['core:metric:view'] }),
          },
        ),
      ),
    ).rejects.toThrow('dimension_permission_not_covered:order_status:core:staff:sensitive');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects an executor binding that is not the published runtime executor without calling Prisma', async () => {
    const findMany = jest.fn();
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider([
        publishedMetric('product_sales_quantity', {
          executorKeys: ['SemanticQueryExecutorService.execute'],
          dimensions: [],
        }),
      ]) as never,
      parser as never,
      { productOrder: { findMany } } as never,
    );

    await expect(
      executor.execute(input(card('product_sales_ranking', 'semantic', { requiredPermissions: ['core:metric:view'] }))),
    ).rejects.toThrow('semantic_executor_binding_unsupported:SemanticQueryExecutorService.execute');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects a UTC metric definition before calling Prisma', async () => {
    const findMany = jest.fn();
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider([
        publishedMetric(
          'product_sales_quantity',
          {
            dimensions: [],
            timePolicy: {
              mode: 'event_time',
              field: 'ProductOrder.paidAt',
              boundary: '[start,end)',
              timezone: 'UTC',
            },
          },
          { formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' } },
        ),
      ]) as never,
      parser as never,
      { productOrder: { findMany } } as never,
    );

    await expect(
      executor.execute(
        input(
          card('product_sales_ranking', 'semantic', {
            requiredPermissions: ['core:metric:view'],
          }),
          { context: context({ timezone: 'UTC' }) },
        ),
      ),
    ).rejects.toThrow('semantic_timezone_unsupported:UTC');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects a context timezone mismatch before calling Prisma', async () => {
    const findMany = jest.fn();
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider([
        publishedMetric(
          'product_sales_quantity',
          { dimensions: [] },
          {
            formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' },
          },
        ),
      ]) as never,
      parser as never,
      { productOrder: { findMany } } as never,
    );

    await expect(
      executor.execute(
        input(
          card('product_sales_ranking', 'semantic', {
            requiredPermissions: ['core:metric:view'],
          }),
          { context: context({ timezone: 'UTC' }) },
        ),
      ),
    ).rejects.toThrow('semantic_timezone_mismatch:Asia/Shanghai:UTC');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('fails closed when a bound dimension is not published', async () => {
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider([
        publishedMetric(
          'product_sales_quantity',
          { dimensions: ['missing_dimension'] },
          {
            formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' },
          },
        ),
      ]) as never,
      parser as never,
      { productOrder: { findMany: jest.fn() } } as never,
    );

    await expect(
      executor.execute(
        input(
          card('product_sales_ranking', 'semantic', {
            requiredPermissions: ['core:metric:view'],
          }),
        ),
      ),
    ).rejects.toThrow('semantic_dimension_not_published:missing_dimension');
  });

  it('fails closed when a published join path does not match the Prisma runtime model', async () => {
    const findMany = jest.fn();
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider([
        publishedMetric(
          'item_quantity',
          {
            joinPath: [{ fromModel: 'OrderItem', relationField: 'missingOrder', toModel: 'ProductOrder' }],
            dimensions: [],
            outputFields: ['quantity'],
            timePolicy: {
              mode: 'event_time',
              field: 'OrderItem.createdAt',
              boundary: '[start,end)',
              timezone: 'Asia/Shanghai',
            },
            storeScope: {
              mode: 'current_store',
              model: 'OrderItem',
              field: 'storeId',
              joinPath: [{ fromModel: 'OrderItem', relationField: 'missingOrder', toModel: 'ProductOrder' }],
            },
          },
          { formula: { type: 'sum', model: 'OrderItem', field: 'quantity' } },
        ),
      ]) as never,
      parser as never,
      { orderItem: { findMany } } as never,
    );

    await expect(
      executor.execute(
        input(
          card('product_sales_ranking', 'semantic', {
            requiredPermissions: ['core:metric:view'],
          }),
        ),
      ),
    ).rejects.toThrow('semantic_join_path_invalid:OrderItem.missingOrder');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('reads one sentinel row and fails closed instead of silently truncating', async () => {
    const findMany = jest.fn().mockResolvedValue(Array.from({ length: 5001 }, (_, index) => ({ id: index + 1 })));
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider([
        publishedMetric(
          'order_count',
          {
            aggregation: 'count',
            dimensions: [],
            outputFields: ['orderCount'],
          },
          { formula: { type: 'count', model: 'ProductOrder', field: 'id' } },
        ),
      ]) as never,
      parser as never,
      { productOrder: { findMany } } as never,
    );

    await expect(
      executor.execute(
        input(
          card('product_sales_ranking', 'semantic', {
            requiredPermissions: ['core:metric:view'],
          }),
        ),
      ),
    ).rejects.toThrow('semantic_query_row_limit_exceeded');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5001 }));
  });

  it('computes KPI from all rows before applying the display limit and keeps rows out of metadata', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { netAmount: 30, status: 'paid' },
      { netAmount: 20, status: 'completed' },
      { netAmount: 10, status: 'cancelled' },
    ]);
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider(
        [
          publishedMetric(
            'sales_amount',
            {
              dimensions: ['order_status'],
              outputFields: ['salesAmount'],
            },
            { formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' } },
          ),
        ],
        [publishedDimension('order_status', { model: 'ProductOrder', field: 'status' })],
      ) as never,
      parser as never,
      { productOrder: { findMany } } as never,
    );

    const answer = await executor.execute(
      input(
        card('product_sales_ranking', 'semantic', {
          requiredPermissions: ['core:metric:view'],
          intents: ['ranking'],
        }),
        { args: { limit: 1 } },
      ),
    );
    const blocks = (answer as any).blocks;

    expect(blocks[0]).toMatchObject({ kind: 'ranking', rows: [{ order_status: 'paid', salesAmount: 30 }] });
    expect(blocks[1]).toMatchObject({ kind: 'kpi', items: [expect.objectContaining({ value: '60' })] });
    expect(answer.metadata).toEqual(expect.objectContaining({ resultCount: 3, outputLimit: 1 }));
    expect(answer.metadata).not.toHaveProperty('rows');
    expect(answer.metadata).not.toHaveProperty('kpis');
    expect(answer.metadata).not.toHaveProperty('runtimeQueries');
  });

  it('rejects duplicate published output fields before calling Prisma', async () => {
    const findMany = jest.fn();
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider([
        publishedMetric(
          'net_sales',
          { dimensions: [], outputFields: ['value'] },
          {
            formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' },
          },
        ),
        publishedMetric(
          'gross_sales',
          { dimensions: [], outputFields: ['value'] },
          {
            formula: { type: 'sum', model: 'ProductOrder', field: 'totalAmount' },
          },
        ),
      ]) as never,
      parser as never,
      { productOrder: { findMany } } as never,
    );

    await expect(
      executor.execute(
        input(
          card('product_sales_ranking', 'semantic', {
            requiredPermissions: ['core:metric:view'],
          }),
        ),
      ),
    ).rejects.toThrow('semantic_output_field_duplicate:value');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('counts only non-null values and excludes null values from averages', async () => {
    const definitionProvider = provider([]);
    definitionProvider.loadActiveDefinitions
      .mockResolvedValueOnce({
        entities: [],
        relations: [],
        dimensions: [],
        metrics: [
          publishedMetric(
            'order_count',
            {
              aggregation: 'count',
              dimensions: [],
              outputFields: ['value'],
            },
            { formula: { type: 'count', model: 'ProductOrder', field: 'id' } },
          ),
        ],
      })
      .mockResolvedValueOnce({
        entities: [],
        relations: [],
        dimensions: [],
        metrics: [
          publishedMetric(
            'average_amount',
            {
              aggregation: 'avg',
              dimensions: [],
              outputFields: ['value'],
            },
            { formula: { type: 'avg', model: 'ProductOrder', field: 'netAmount' } },
          ),
        ],
      });
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 1 }, { id: null }, { id: undefined }])
      .mockResolvedValueOnce([{ netAmount: 10 }, { netAmount: null }, { netAmount: 20 }]);
    const executor = new BrainSemanticQueryCapabilityExecutor(
      definitionProvider as never,
      parser as never,
      { productOrder: { findMany } } as never,
    );
    const capabilityInput = input(
      card('product_sales_ranking', 'semantic', {
        requiredPermissions: ['core:metric:view'],
      }),
    );

    const countAnswer = await executor.execute(capabilityInput);
    const avgAnswer = await executor.execute(capabilityInput);

    expect((countAnswer as any).blocks[0].rows).toEqual([{ value: 1 }]);
    expect((avgAnswer as any).blocks[0].rows).toEqual([{ value: 15 }]);
  });

  it('computes a dimensioned average KPI from all source rows instead of summing group averages', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { netAmount: 10, status: 'paid' },
      { netAmount: 20, status: 'completed' },
      { netAmount: 30, status: 'completed' },
    ]);
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider(
        [
          publishedMetric(
            'average_amount',
            {
              aggregation: 'avg',
              dimensions: ['order_status'],
              outputFields: ['averageAmount'],
            },
            { formula: { type: 'avg', model: 'ProductOrder', field: 'netAmount' } },
          ),
        ],
        [publishedDimension('order_status', { model: 'ProductOrder', field: 'status' })],
      ) as never,
      parser as never,
      { productOrder: { findMany } } as never,
    );

    const answer = await executor.execute(
      input(
        card('product_sales_ranking', 'semantic', {
          requiredPermissions: ['core:metric:view'],
          intents: ['ranking'],
        }),
      ),
    );

    expect((answer as any).blocks[0].rows).toEqual([
      { order_status: 'completed', averageAmount: 25 },
      { order_status: 'paid', averageAmount: 10 },
    ]);
    expect((answer as any).blocks[1]).toMatchObject({
      kind: 'kpi',
      items: [expect.objectContaining({ value: '20' })],
    });
  });

  it.each(['ratio', 'score'])('fails closed for %s without a published expression', async (aggregation) => {
    const findMany = jest.fn();
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider([
        publishedMetric(
          `${aggregation}_metric`,
          {
            aggregation,
            dimensions: [],
            outputFields: ['value'],
          },
          { formula: { type: aggregation, model: 'ProductOrder', field: 'netAmount' } },
        ),
      ]) as never,
      parser as never,
      { productOrder: { findMany } } as never,
    );

    await expect(
      executor.execute(
        input(
          card('product_sales_ranking', 'semantic', {
            requiredPermissions: ['core:metric:view'],
          }),
        ),
      ),
    ).rejects.toThrow(`semantic_aggregation_expression_required:${aggregation}_metric:${aggregation}`);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('converts Shanghai today wall-clock boundaries to fixed UTC instants', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-13T16:30:00.000Z'));
    const realParser = new BrainTimeRangeParserService();
    const parse = jest.fn((question: string, options?: { now?: Date }) => realParser.parse(question, options));
    const findMany = jest.fn().mockResolvedValue([]);
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider([
        publishedMetric(
          'sales_amount',
          { dimensions: [], outputFields: ['value'] },
          {
            formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' },
          },
        ),
      ]) as never,
      { parse } as never,
      { productOrder: { findMany } } as never,
    );

    try {
      await executor.execute(
        input(
          card('product_sales_ranking', 'semantic', {
            requiredPermissions: ['core:metric:view'],
          }),
          { question: '今天' },
        ),
      );
      const where = JSON.stringify((findMany.mock.calls[0][0] as any).where);
      expect(parse).toHaveBeenCalledWith('今天', { now: expect.any(Date) });
      expect(where).toContain('2026-07-13T16:00:00.000Z');
      expect(where).toContain('2026-07-14T16:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ['today', '今天', '2026-07-14T16:00:00.000Z', '2026-07-15T16:00:00.000Z'],
    ['tomorrow', '明天', '2026-07-15T16:00:00.000Z', '2026-07-16T16:00:00.000Z'],
    ['yesterday', '昨天', '2026-07-13T16:00:00.000Z', '2026-07-14T16:00:00.000Z'],
    ['this_week', '本周', '2026-07-12T16:00:00.000Z', '2026-07-15T16:00:00.000Z'],
    ['last_week', '上周', '2026-07-05T16:00:00.000Z', '2026-07-12T16:00:00.000Z'],
    ['this_month', '本月', '2026-06-30T16:00:00.000Z', '2026-07-15T16:00:00.000Z'],
    ['last_month', '上月', '2026-05-31T16:00:00.000Z', '2026-06-30T16:00:00.000Z'],
  ])('applies the %s preset as an exact Shanghai SQL boundary', async (_preset, label, expectedStart, expectedEnd) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T04:00:00.000Z'));
    const findMany = jest.fn().mockResolvedValue([]);
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider([
        publishedMetric(
          'sales_amount',
          { dimensions: [], outputFields: ['value'] },
          { formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' } },
        ),
      ]) as never,
      new BrainTimeRangeParserService(),
      { productOrder: { findMany } } as never,
    );

    try {
      const answer = await executor.execute(
        input(card('product_sales_ranking', 'semantic', { requiredPermissions: ['core:metric:view'] }), {
          question: `${label}商品销售额`,
          args: {
            time: { label, preset: _preset, timezone: 'Asia/Shanghai' },
            entities: [],
            metrics: [],
            dimensions: [],
            filters: [],
            orderBy: [],
          },
        }),
      );
      const timeFilter = (findMany.mock.calls[0][0] as any).where.AND.find((item: any) => item.paidAt)?.paidAt;
      expect(timeFilter).toEqual({ gte: new Date(expectedStart), lt: new Date(expectedEnd) });
      expect(answer.metadata).toMatchObject({
        rangeLabel: label,
        timeRange: {
          startDate: expectedStart,
          endExclusive: expectedEnd,
          boundary: '[start,end)',
          timezone: 'Asia/Shanghai',
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('resolves branched join paths and treats storeScope.model as the target model', async () => {
    const findMany = jest.fn().mockResolvedValue([{ quantity: 2, product: { name: '精华液' } }]);
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider(
        [
          publishedMetric(
            'item_quantity',
            {
              joinPath: [
                { fromModel: 'OrderItem', relationField: 'order', toModel: 'ProductOrder' },
                { fromModel: 'OrderItem', relationField: 'product', toModel: 'Product' },
              ],
              dimensions: ['product_name'],
              outputFields: ['quantity'],
              timePolicy: {
                mode: 'event_time',
                field: 'ProductOrder.paidAt',
                boundary: '[start,end)',
                timezone: 'Asia/Shanghai',
              },
              storeScope: {
                mode: 'current_store',
                model: 'ProductOrder',
                field: 'storeId',
                joinPath: [{ fromModel: 'OrderItem', relationField: 'order', toModel: 'ProductOrder' }],
              },
            },
            { formula: { type: 'sum', model: 'OrderItem', field: 'quantity' } },
          ),
        ],
        [publishedDimension('product_name', { model: 'Product', field: 'name' })],
      ) as never,
      parser as never,
      { orderItem: { findMany } } as never,
    );

    const answer = await executor.execute(
      input(
        card('product_sales_ranking', 'semantic', {
          requiredPermissions: ['core:metric:view'],
          intents: ['ranking'],
        }),
      ),
    );
    const query = findMany.mock.calls[0][0] as any;

    expect(query.select).toEqual(expect.objectContaining({ product: { select: { name: true } } }));
    expect(JSON.stringify(query.where)).toContain('"order":{"storeId":6}');
    expect((answer as any).blocks[0].rows).toEqual([{ product_name: '精华液', quantity: 2 }]);
  });

  it('rejects arbitrary scalar store-scope fields before querying Prisma', async () => {
    const findMany = jest.fn();
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider([
        publishedMetric(
          'sales_amount',
          {
            dimensions: [],
            outputFields: ['salesAmount'],
            storeScope: { mode: 'current_store', model: 'ProductOrder', field: 'status', joinPath: [] },
          },
          { formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' } },
        ),
      ]) as never,
      parser as never,
      { productOrder: { findMany } } as never,
    );

    await expect(
      executor.execute(
        input(
          card('product_sales_ranking', 'semantic', {
            requiredPermissions: ['core:metric:view'],
          }),
        ),
      ),
    ).rejects.toThrow('semantic_store_scope_field_invalid:ProductOrder.status');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('executes the exact declared store-scope path instead of finding another graph path', async () => {
    const findMany = jest.fn();
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider([
        publishedMetric(
          'item_quantity',
          {
            joinPath: [
              { fromModel: 'OrderItem', relationField: 'order', toModel: 'ProductOrder' },
              { fromModel: 'OrderItem', relationField: 'product', toModel: 'Product' },
            ],
            dimensions: [],
            outputFields: ['quantity'],
            timePolicy: {
              mode: 'event_time',
              field: 'ProductOrder.paidAt',
              boundary: '[start,end)',
              timezone: 'Asia/Shanghai',
            },
            storeScope: {
              mode: 'current_store',
              model: 'ProductOrder',
              field: 'storeId',
              joinPath: [{ fromModel: 'OrderItem', relationField: 'product', toModel: 'Product' }],
            },
          },
          { formula: { type: 'sum', model: 'OrderItem', field: 'quantity' } },
        ),
      ]) as never,
      parser as never,
      { orderItem: { findMany } } as never,
    );

    await expect(
      executor.execute(
        input(
          card('product_sales_ranking', 'semantic', {
            requiredPermissions: ['core:metric:view'],
          }),
        ),
      ),
    ).rejects.toThrow('semantic_store_scope_path_target_mismatch:Product:ProductOrder');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('sorts multi-metric rankings by the explicitly published primary output', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        { netAmount: 100, status: 'A' },
        { netAmount: 50, status: 'B' },
      ])
      .mockResolvedValueOnce([
        { totalAmount: 1, status: 'A' },
        { totalAmount: 10, status: 'B' },
      ]);
    const sort = { outputField: 'quantity', direction: 'desc', missing: 'error' };
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider(
        [
          publishedMetric(
            'sales_amount',
            {
              dimensions: ['order_status'],
              outputFields: ['salesAmount'],
              sort,
            },
            { formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' } },
          ),
          publishedMetric(
            'sales_quantity',
            {
              dimensions: ['order_status'],
              outputFields: ['quantity'],
              sort,
            },
            { formula: { type: 'sum', model: 'ProductOrder', field: 'totalAmount' } },
          ),
        ],
        [publishedDimension('order_status', { model: 'ProductOrder', field: 'status' })],
      ) as never,
      parser as never,
      { productOrder: { findMany } } as never,
    );

    const answer = await executor.execute(
      input(
        card('product_sales_ranking', 'semantic', {
          requiredPermissions: ['core:metric:view'],
          intents: ['ranking'],
        }),
      ),
    );

    expect((answer as any).blocks[0].rows).toEqual([
      { order_status: 'B', salesAmount: 50, quantity: 10 },
      { order_status: 'A', salesAmount: 100, quantity: 1 },
    ]);
  });

  it('enforces missing=error before sorting even when only one merged row exists', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ netAmount: 100, status: 'A' }])
      .mockResolvedValueOnce([]);
    const sort = { outputField: 'quantity', direction: 'desc', missing: 'error' };
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider(
        [
          publishedMetric(
            'sales_amount',
            { dimensions: ['order_status'], outputFields: ['salesAmount'], sort },
            { formula: { type: 'sum', model: 'ProductOrder', field: 'netAmount' } },
          ),
          publishedMetric(
            'sales_quantity',
            { dimensions: ['order_status'], outputFields: ['quantity'], sort },
            { formula: { type: 'sum', model: 'ProductOrder', field: 'totalAmount' } },
          ),
        ],
        [publishedDimension('order_status', { model: 'ProductOrder', field: 'status' })],
      ) as never,
      parser as never,
      { productOrder: { findMany } } as never,
    );

    await expect(
      executor.execute(
        input(
          card('product_sales_ranking', 'semantic', {
            requiredPermissions: ['core:metric:view'],
            intents: ['ranking'],
          }),
        ),
      ),
    ).rejects.toThrow('semantic_primary_output_missing:quantity');
  });

  it('adds some for list-relation filters', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 1 }]);
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider([
        publishedMetric(
          'customer_count',
          {
            aggregation: 'count',
            joinPath: [{ fromModel: 'Customer', relationField: 'productOrders', toModel: 'ProductOrder' }],
            dimensions: [],
            outputFields: ['customerCount'],
            filters: [{ model: 'ProductOrder', field: 'status', operator: 'eq', value: 'paid' }],
            timePolicy: {
              mode: 'event_time',
              field: 'Customer.createdAt',
              boundary: '[start,end)',
              timezone: 'Asia/Shanghai',
            },
            storeScope: { mode: 'current_store', model: 'Customer', field: 'storeId', joinPath: [] },
          },
          { formula: { type: 'count', model: 'Customer', field: 'id' } },
        ),
      ]) as never,
      parser as never,
      { customer: { findMany } } as never,
    );

    await executor.execute(
      input(
        card('product_sales_ranking', 'semantic', {
          requiredPermissions: ['core:metric:view'],
        }),
      ),
    );

    expect(JSON.stringify((findMany.mock.calls[0][0] as any).where)).toContain(
      '"productOrders":{"some":{"status":"paid"}}',
    );
  });

  it('fails closed when a list relation is used for a dimension', async () => {
    const findMany = jest.fn();
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider(
        [
          publishedMetric(
            'customer_count',
            {
              aggregation: 'count',
              joinPath: [{ fromModel: 'Customer', relationField: 'productOrders', toModel: 'ProductOrder' }],
              dimensions: ['order_status'],
              outputFields: ['customerCount'],
              timePolicy: {
                mode: 'event_time',
                field: 'Customer.createdAt',
                boundary: '[start,end)',
                timezone: 'Asia/Shanghai',
              },
              storeScope: { mode: 'current_store', model: 'Customer', field: 'storeId', joinPath: [] },
            },
            { formula: { type: 'count', model: 'Customer', field: 'id' } },
          ),
        ],
        [publishedDimension('order_status', { model: 'ProductOrder', field: 'status' })],
      ) as never,
      parser as never,
      { customer: { findMany } } as never,
    );

    await expect(
      executor.execute(
        input(
          card('product_sales_ranking', 'semantic', {
            requiredPermissions: ['core:metric:view'],
          }),
        ),
      ),
    ).rejects.toThrow('semantic_list_relation_dimension_unsupported:Customer.productOrders');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('executes staff performance ranking from a published resolver expression', async () => {
    const skillRuntime = {
      buildManagerStaffAnalysis: jest.fn().mockResolvedValue({
        staff: [
          { beauticianId: 2, name: '李老师', serviceCount: 8, revenueAmount: 3000, repeatCustomerCount: 2 },
          { beauticianId: 1, name: '王老师', serviceCount: 5, revenueAmount: 5000, repeatCustomerCount: 1 },
        ],
      }),
    };
    const expression = {
      op: 'multiply',
      left: {
        op: 'add',
        operands: [
          {
            op: 'multiply',
            left: {
              op: 'clamp',
              value: {
                op: 'divide',
                numerator: { op: 'field', field: 'serviceCount' },
                denominator: { op: 'constant', value: 10 },
                zero: 'error',
              },
              min: 0,
              max: 1,
            },
            right: { op: 'constant', value: 0.5 },
          },
          {
            op: 'multiply',
            left: {
              op: 'clamp',
              value: {
                op: 'divide',
                numerator: { op: 'field', field: 'revenueAmount' },
                denominator: { op: 'constant', value: 5000 },
                zero: 'error',
              },
              min: 0,
              max: 1,
            },
            right: { op: 'constant', value: 0.3 },
          },
          {
            op: 'multiply',
            left: {
              op: 'clamp',
              value: {
                op: 'divide',
                numerator: { op: 'field', field: 'repeatCustomerCount' },
                denominator: { op: 'constant', value: 5 },
                zero: 'error',
              },
              min: 0,
              max: 1,
            },
            right: { op: 'constant', value: 0.2 },
          },
        ],
      },
      right: { op: 'constant', value: 100 },
    };
    const resolver = {
      kind: 'domain_service',
      key: 'manager_staff_analysis',
      dimensionFields: { staff_id: 'beauticianId', staff_name: 'name' },
      expression,
      overallAggregation: 'avg',
    };
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider(
        [
          publishedMetric(
            'staff_performance_score',
            {
              aggregation: 'score',
              dimensions: ['staff_id', 'staff_name'],
              capabilityKeys: ['staff_performance_ranking'],
              outputFields: ['performanceScore'],
              sort: { outputField: 'performanceScore', direction: 'desc', missing: 'error' },
              resolver,
              storeScope: { mode: 'current_store', model: 'Beautician', field: 'storeId', joinPath: [] },
            },
            { formula: { type: 'score', resolver }, source: [{ model: 'Beautician' }] },
          ),
        ],
        [
          publishedDimension('staff_id', { model: 'Beautician', field: 'id' }),
          publishedDimension('staff_name', { model: 'Beautician', field: 'name' }),
        ],
      ) as never,
      parser as never,
      {} as never,
      skillRuntime as never,
    );

    const answer = await executor.execute(
      input(
        card('staff_performance_ranking', 'semantic', {
          requiredPermissions: ['core:metric:view'],
          intents: ['ranking'],
        }),
      ),
    );

    expect(skillRuntime.buildManagerStaffAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 6, startDate: expect.any(Date), endDate: expect.any(Date) }),
    );
    expect((answer as any).blocks[0].rows).toEqual([
      { staff_id: 2, staff_name: '李老师', performanceScore: 66 },
      { staff_id: 1, staff_name: '王老师', performanceScore: 59 },
    ]);
  });

  it('executes inventory risk ranking from a published subtraction expression', async () => {
    const skillRuntime = {
      buildInventoryRiskSummary: jest.fn().mockResolvedValue({
        lowStockProducts: [
          { productId: 7, name: '补水精华', currentStock: 2, safetyStock: 8 },
          { productId: 8, name: '洁面乳', currentStock: 4, safetyStock: 6 },
        ],
        expiringProducts: [],
        expiringStockValue: 0,
        suggestedAction: '',
        stockoutSkuCount: 2,
      }),
    };
    const resolver = {
      kind: 'domain_service',
      key: 'inventory_risk_summary',
      dimensionFields: { product_id: 'productId', product_name: 'name' },
      expression: {
        op: 'clamp',
        value: {
          op: 'subtract',
          left: { op: 'field', field: 'safetyStock' },
          right: { op: 'field', field: 'currentStock' },
        },
        min: 0,
        max: 1000000,
      },
      overallAggregation: 'sum',
    };
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider(
        [
          publishedMetric(
            'stock_gap',
            {
              aggregation: 'score',
              dimensions: ['product_id', 'product_name'],
              capabilityKeys: ['inventory_risk_ranking'],
              outputFields: ['stockGap'],
              sort: { outputField: 'stockGap', direction: 'desc', missing: 'error' },
              resolver,
              storeScope: { mode: 'current_store', model: 'Product', field: 'storeId', joinPath: [] },
            },
            { formula: { type: 'score', resolver }, source: [{ model: 'Product' }] },
          ),
        ],
        [
          publishedDimension('product_id', { model: 'Product', field: 'id' }),
          publishedDimension('product_name', { model: 'Product', field: 'name' }),
        ],
      ) as never,
      parser as never,
      {} as never,
      skillRuntime as never,
    );

    const answer = await executor.execute(
      input(
        card('inventory_risk_ranking', 'semantic', {
          requiredPermissions: ['core:metric:view'],
          intents: ['ranking'],
        }),
      ),
    );

    expect((answer as any).blocks[0].rows).toEqual([
      { product_id: 7, product_name: '补水精华', stockGap: 6 },
      { product_id: 8, product_name: '洁面乳', stockGap: 2 },
    ]);
  });

  it.each([
    [
      'unknown resolver field',
      {
        dimensionFields: { staff_name: 'privateValue' },
        expression: { op: 'field', field: 'serviceCount' },
      },
      'semantic_resolver_dimension_field_not_allowed:manager_staff_analysis:privateValue',
    ],
    [
      'invalid resolver store scope',
      {
        dimensionFields: { staff_name: 'name' },
        expression: { op: 'field', field: 'serviceCount' },
        storeScope: { mode: 'current_store', model: 'Beautician', field: 'status', joinPath: [] },
      },
      'semantic_resolver_store_scope_invalid:field:status',
    ],
    [
      'text field used in arithmetic',
      {
        dimensionFields: { staff_name: 'name' },
        expression: { op: 'field', field: 'name' },
      },
      'semantic_resolver_numeric_field_not_allowed:manager_staff_analysis:name',
    ],
    [
      'sensitive numeric field exposed as a dimension',
      {
        dimensionFields: { staff_name: 'commissionAmount' },
        expression: { op: 'field', field: 'serviceCount' },
      },
      'semantic_resolver_dimension_field_not_allowed:manager_staff_analysis:commissionAmount',
    ],
  ])('fails closed before calling a resolver for %s', async (_case, override, expectedError) => {
    const skillRuntime = { buildManagerStaffAnalysis: jest.fn().mockResolvedValue({ staff: [] }) };
    const resolver = {
      kind: 'domain_service',
      key: 'manager_staff_analysis',
      dimensionFields: override.dimensionFields,
      expression: override.expression,
      overallAggregation: 'avg',
    };
    const executor = new BrainSemanticQueryCapabilityExecutor(
      provider(
        [
          publishedMetric(
            'staff_performance_score',
            {
              aggregation: 'score',
              dimensions: ['staff_name'],
              capabilityKeys: ['staff_performance_ranking'],
              outputFields: ['performanceScore'],
              sort: { outputField: 'performanceScore', direction: 'desc', missing: 'error' },
              resolver,
              storeScope: (override as any).storeScope ?? {
                mode: 'current_store',
                model: 'Beautician',
                field: 'storeId',
                joinPath: [],
              },
            },
            { formula: { type: 'score', resolver }, source: [{ model: 'Beautician' }] },
          ),
        ],
        [publishedDimension('staff_name', { model: 'Beautician', field: 'name' })],
      ) as never,
      parser as never,
      {} as never,
      skillRuntime as never,
    );

    await expect(
      executor.execute(
        input(
          card('staff_performance_ranking', 'semantic', {
            requiredPermissions: ['core:metric:view'],
            intents: ['ranking'],
          }),
        ),
      ),
    ).rejects.toThrow(expectedError);
    expect(skillRuntime.buildManagerStaffAnalysis).not.toHaveBeenCalled();
  });
});

describe('BrainDomainServiceCapabilityExecutor', () => {
  it('composes the store overview from operations, reception, and finance facts', async () => {
    const skillRuntime = {
      buildManagerOperationsAnalysis: jest.fn().mockResolvedValue({
        revenue: 1200,
        orderCount: 8,
        customerCount: 6,
        avgTransaction: 150,
        inStoreCount: 2,
        newCustomerCount: 2,
        returningCustomerCount: 4,
        largestOrder: null,
        paymentBreakdown: [],
        projectRanking: [{ name: '补水护理', count: 5 }, { name: '舒缓护理', count: 3 }],
        beauticianRanking: [],
        dailyTrend: [{ date: '2026-07-15', revenue: 1200 }],
        target: null,
      }),
      buildReceptionOperationsSnapshot: jest.fn().mockResolvedValue({
        total: 10,
        checkedIn: 6,
        noShow: 1,
        noShowRate: 0.1,
        staff: [{ name: '小美', appointmentCount: 3, inService: true, onTimeOff: false, available: false }],
      }),
      buildFinanceRiskSummary: jest.fn().mockResolvedValue({
        refundAmount: 88,
        refundCount: 1,
        riskItems: ['退款金额 88.00 元，需要复核原因。'],
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      {} as never,
      {
        parse: jest.fn().mockReturnValue({
          range: { label: '本月', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31') },
        }),
      } as never,
    );

    const answer = await executor.execute(input(card('store_operations_overview', 'domain')));

    expect(answer).toMatchObject({
      status: 'completed',
      grounding: 'db_skill',
      metadata: expect.objectContaining({
        capabilityKey: 'store_operations_overview',
        componentCapabilities: [
          'store_manager_operations_analysis',
          'reception_operations_snapshot',
          'finance_risk_summary',
        ],
      }),
    });
    expect(answer.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'kpi' }),
      expect.objectContaining({ kind: 'ranking' }),
      expect.objectContaining({ kind: 'chart' }),
      expect.objectContaining({ kind: 'table' }),
      expect.objectContaining({ kind: 'diagnosis' }),
    ]));
    expect(answer.citations).toHaveLength(3);
  });

  it('calls the declared domain service directly without keyword routing', async () => {
    const skillRuntime = {
      listReceptionReservations: jest.fn().mockResolvedValue({
        count: 1,
        reservations: [{ date: '2026-07-13', startTime: '10:00', customerName: 'Amy', projectName: 'Care' }],
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      { answerCustomerFactQuestion: jest.fn() } as never,
      {
        parse: jest.fn().mockReturnValue({
          mentionedTime: false,
          filters: [],
          requiresComparison: false,
          unsupportedExpressions: [],
        }),
      } as never,
    );

    const answer = await executor.execute(
      input(card('reservation_list', 'domain'), {
        question: 'words without a reservation keyword',
        args: {
          objective: '查看预约',
          entities: [
            {
              entityType: 'reservation',
              entityKey: 'reservation',
              mention: '预约',
              source: 'user',
              confidence: 1,
            },
          ],
          metrics: [],
          dimensions: [],
          filters: [],
          orderBy: [],
        },
      }),
    );

    expect(skillRuntime.listReceptionReservations).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 6, startDate: expect.any(Date), endDate: expect.any(Date) }),
    );
    expect(answer).toMatchObject({ grounding: 'db_skill' });
    expect(answer.answer).toMatch(/[\u4e00-\u9fff]/);
    expect(answer.citations).toEqual([
      expect.objectContaining({
        sourceId: 'capability_reservation_list',
        label: expect.stringMatching(/[\u4e00-\u9fff]/),
      }),
    ]);
    expect(answer.metadata).toEqual({ rangeLabel: '今天', count: 1 });
  });

  it('uses dedicated handlers for exact customer facts and marketing segments', async () => {
    const customerFacts = {
      answerCustomerQuestion: jest.fn().mockResolvedValue('客户事实'),
      summarizeCustomerSegments: jest.fn().mockResolvedValue('VIP 客户 2 人，沉睡客户 1 人。'),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      {} as never,
      customerFacts as never,
      {
        parse: jest.fn().mockReturnValue({
          mentionedTime: false,
          filters: [],
          requiresComparison: false,
          unsupportedExpressions: [],
        }),
      } as never,
    );

    const facts = await executor.execute(input(card('customer_facts', 'domain')));
    const segment = await executor.execute(input(card('marketing_customer_segment', 'domain')));

    expect(facts.citations[0].sourceId).toBe('capability_customer_facts');
    expect(segment.citations[0].sourceId).toBe('capability_marketing_customer_segment');
    expect(facts.answer).toBe('客户事实');
    expect(segment.answer).toContain('营销客户分群');
    expect(customerFacts.answerCustomerQuestion).toHaveBeenCalledWith({
      storeId: 6,
      message: 'show the current result',
      specificCustomerMention: undefined,
      permissions: ['core:test', 'core:metric:view'],
      startDate: expect.any(Date),
      endDate: expect.any(Date),
    });
    expect(customerFacts.summarizeCustomerSegments).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: 6, startDate: expect.any(Date), endDate: expect.any(Date) }),
    );
    expect(facts.metadata).toEqual({ rangeLabel: '今天' });
    expect(segment.metadata).toEqual({ rangeLabel: '今天' });
  });

  it('uses structured time and customer entity args instead of reparsing the question', async () => {
    const skillRuntime = {
      listReceptionReservations: jest.fn().mockResolvedValue({ count: 0, reservations: [] }),
    };
    const customerFacts = { answerCustomerQuestion: jest.fn().mockResolvedValue('李女士客户事实') };
    const timeParser = { parse: jest.fn() };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      customerFacts as never,
      timeParser as never,
    );
    const structuredArgs = {
      objective: '查询六月预约',
      time: { label: '六月', startDate: '2026-06-01', endDate: '2026-06-30', timezone: 'Asia/Shanghai' },
      entities: [],
      metrics: [],
      dimensions: [],
      filters: [],
      orderBy: [],
    };

    await executor.execute(input(card('reservation_list', 'domain'), { question: '本月预约', args: structuredArgs }));
    await executor.execute(
      input(card('customer_facts', 'domain'), {
        question: '她的消费情况',
        args: {
          ...structuredArgs,
          entities: [{ entityType: 'customer', entityKey: 'customer:18', mention: '李女士', source: 'user', confidence: 0.99 }],
        },
      }),
    );

    expect(timeParser.parse).not.toHaveBeenCalled();
    expect(skillRuntime.listReceptionReservations).toHaveBeenCalledWith({
      storeId: 6,
      startDate: new Date('2026-05-31T16:00:00.000Z'),
      endDate: new Date('2026-06-30T15:59:59.999Z'),
      timezone: 'Asia/Shanghai',
    });
    expect(customerFacts.answerCustomerQuestion).toHaveBeenCalledWith({
      storeId: 6,
      message: '她的消费情况',
      specificCustomerMention: '李女士',
      permissions: ['core:test', 'core:metric:view'],
      startDate: new Date('2026-05-31T16:00:00.000Z'),
      endDate: new Date('2026-06-30T15:59:59.999Z'),
    });
  });

  it('parses a domain capability Chinese time label before its machine preset', async () => {
    const skillRuntime = {
      listReceptionReservations: jest.fn().mockResolvedValue({ count: 0, reservations: [] }),
    };
    const parser = new BrainTimeRangeParserService();
    const parse = jest.spyOn(parser, 'parse');
    const executor = new BrainDomainServiceCapabilityExecutor(skillRuntime as never, {} as never, parser);

    const answer = await executor.execute(input(card('reservation_list', 'domain'), {
      question: 'words without a time expression',
      args: {
        time: { label: '本月', preset: 'this_month', timezone: 'Asia/Shanghai' },
        entities: [],
        metrics: [],
        dimensions: [],
        filters: [],
        orderBy: [],
      },
    }));

    expect(parse).toHaveBeenCalledWith('本月');
    expect(answer.metadata).toMatchObject({ rangeLabel: '本月' });
  });

  it('accepts descending order bound to the capability definitions and rejects unsupported ordering', async () => {
    const skillRuntime = {
      listReceptionReservations: jest.fn().mockResolvedValue({ count: 0, reservations: [] }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      {} as never,
      {
        parse: jest.fn().mockReturnValue({
          range: {
            label: '本月',
            startDate: new Date('2026-07-01T00:00:00.000Z'),
            endDate: new Date('2026-07-31T23:59:59.999Z'),
          },
        }),
      } as never,
    );
    const capabilityCard = card('reservation_list', 'domain');
    const args = {
      objective: '预约排行',
      entities: [],
      metrics: [],
      dimensions: [],
      filters: [],
      orderBy: [{
        direction: 'desc',
        definitionRef: { definitionKey: 'capability.reservation_list' },
      }],
    };

    await expect(executor.execute(input(capabilityCard, { args }))).resolves.toMatchObject({ status: 'completed' });
    await expect(
      executor.execute(input(capabilityCard, {
        args: { ...args, orderBy: [{ ...args.orderBy[0], direction: 'asc' }] },
      })),
    ).rejects.toThrow('domain_order_args_unsupported:reservation_list');
  });

  it('returns Chinese finance and procurement summaries with Chinese citations', async () => {
    const skillRuntime = {
      buildFinanceIncomeAnalysis: jest.fn().mockResolvedValue({
        totalCollected: 1200,
        paymentBreakdown: [{ method: 'wechat', amount: 1200, count: 3 }],
      }),
      buildInventoryProcurementAnalysis: jest.fn().mockResolvedValue({
        suggestions: [
          { productName: '补水精华', currentStock: 2, safetyStock: 5, suggestedQty: 8, supplierName: '供应商A' },
        ],
        recentOrders: [],
        suppliers: [],
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      {} as never,
      {
        parse: jest.fn().mockReturnValue({
          mentionedTime: false,
          filters: [],
          requiresComparison: false,
          unsupportedExpressions: [],
        }),
      } as never,
    );

    const finance = await executor.execute(input(card('finance_payment_breakdown', 'domain')));
    const inventory = await executor.execute(input(card('inventory_procurement_advice', 'domain')));

    for (const answer of [finance, inventory]) {
      expect(answer.answer).toMatch(/[\u4e00-\u9fff]/);
      expect(answer.citations[0].label).toMatch(/[\u4e00-\u9fff]/);
    }
    expect(finance.metadata).toEqual({
      rangeLabel: '今天',
      totalCollected: 1200,
      paymentMethodCount: 1,
      requestedPaymentMethods: [],
    });
    expect(inventory.metadata).toEqual({
      capabilityKey: 'inventory_procurement_advice',
      rangeLabel: '今天',
      suggestionCount: 1,
      recentOrderCount: 0,
      supplierCount: 0,
    });
  });

  it('composes four role overviews from read-only domain services', async () => {
    const skillRuntime = {
      buildReceptionOperationsSnapshot: jest.fn().mockResolvedValue({
        total: 6,
        checkedIn: 3,
        pendingArrival: 2,
        noShow: 1,
        cancelled: 0,
        arrivalRate: 0.5,
        noShowRate: 1 / 6,
        staff: [{ name: '小美', appointmentCount: 3, inService: false, onTimeOff: false, available: true }],
      }),
      buildReceptionServiceOverrunAnalysis: jest.fn().mockResolvedValue({
        overrunCount: 1,
        impactedCount: 1,
        items: [{
          taskId: 1,
          beauticianName: '小美',
          customerName: '李女士',
          projectName: '补水护理',
          plannedEnd: '14:00',
          actualEnd: '14:20',
          overrunMinutes: 20,
          impactedReservation: { startTime: '14:10', customerName: '王女士', projectName: '舒缓护理' },
        }],
      }),
      listReceptionReservations: jest.fn().mockResolvedValue({
        count: 1,
        reservations: [{ date: '2026-07-15', startTime: '14:10', customerName: '王女士', projectName: '舒缓护理', beauticianName: '小美' }],
      }),
      buildBeauticianServiceSummary: jest.fn().mockResolvedValue({
        serviceCount: 1,
        nextTasks: [{ customerName: '李女士', projectName: '补水护理', appointmentTime: '2026-07-15 14:00', attentionItems: ['过敏史：酒精'] }],
      }),
      buildBeauticianPersonalPerformance: jest.fn().mockResolvedValue({
        beauticianName: '小美',
        serviceCount: 8,
        completedCount: 7,
        scheduledMinutes: 480,
        actualMinutes: 450,
        revenueAmount: 6800,
        commissionAmount: 680,
        uniqueCustomerCount: 6,
        repeatCustomerCount: 2,
        projectRanking: [{ name: '补水护理', count: 5 }],
      }),
      buildInventoryRiskSummary: jest.fn().mockResolvedValue({
        stockoutSkuCount: 1,
        expiringStockValue: 300,
        suggestedAction: '复核补货',
        lowStockProducts: [{ productId: 1, name: '补水精华', currentStock: 2, safetyStock: 5 }],
        expiringProducts: [{ productId: 2, name: '修护面膜', stock: 3, expiryDate: '2026-08-01', estimatedValue: 300 }],
      }),
      buildInventoryDetailAnalysis: jest.fn().mockResolvedValue({
        totalSku: 10,
        totalStockValue: 5000,
        products: [{ productId: 1, sku: 'P1', name: '补水精华', stock: 2, safetyStock: 5, stockValue: 200, outboundQty: 6, inboundQty: 0, coverageDays: 4 }],
        movements: [],
      }),
      buildInventoryProcurementAnalysis: jest.fn().mockResolvedValue({
        suggestions: [{ productId: 1, sku: 'P1', productName: '补水精华', currentStock: 2, safetyStock: 5, suggestedQty: 8, supplierName: '供应商A', estimatedCost: 800 }],
        recentOrders: [],
        suppliers: [{ supplierName: '供应商A', qualificationStatus: 'approved', quoteCount: 1 }],
      }),
      buildFinanceRiskSummary: jest.fn().mockResolvedValue({
        refundAmount: 100,
        refundCount: 1,
        discountAmount: 80,
        grossMarginRate: 0.55,
        riskItems: ['退款金额 100.00 元，需要复核原因。'],
      }),
      buildFinanceIncomeAnalysis: jest.fn().mockResolvedValue({
        totalCollected: 3000,
        paymentBreakdown: [{ method: 'wechat', amount: 3000, count: 5 }],
        dailyTrend: [{ date: '2026-07-15', revenue: 3000, orderCount: 5, customerCount: 4, avgTransaction: 600 }],
        orderKindBreakdown: [],
      }),
      buildFinanceCostAnalysis: jest.fn().mockResolvedValue({
        revenue: 3000,
        materialCost: 500,
        commissionCost: 300,
        operatingCost: 200,
        grossProfit: 1650,
        grossMarginRate: 0.55,
        cardLiability: 12000,
        costCategories: [{ category: '房租', amount: 200 }],
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      {} as never,
      {
        parse: jest.fn().mockReturnValue({
          range: { label: '本月', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31') },
        }),
      } as never,
    );

    const answers = await Promise.all([
      executor.execute(input(card('front_desk_operations_overview', 'domain'))),
      executor.execute(input(card('beautician_service_overview', 'domain'))),
      executor.execute(input(card('inventory_operations_overview', 'domain'))),
      executor.execute(input(card('finance_risk_overview', 'domain'))),
    ]);

    for (const answer of answers) {
      expect(answer).toMatchObject({ status: 'completed', grounding: 'db_skill' });
      expect(answer.blocks).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'kpi' })]));
      expect(answer.citations.length).toBeGreaterThanOrEqual(2);
    }
    expect(skillRuntime.buildBeauticianServiceSummary).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, storeId: 6 }));
    expect(skillRuntime.buildBeauticianPersonalPerformance).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, storeId: 6 }));
    expect(answers[1].metadata).toMatchObject({ identitySource: 'server_context_user' });
    expect(answers[2].blocks).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'limitations' })]));
  });

  it('composes a marketing growth overview from governed analytics and customer facts', async () => {
    const skillRuntime = {
      buildMarketingAnalytics: jest.fn().mockResolvedValue({
        reachedCount: 20,
        convertedCount: 3,
        conversionRate: 0.15,
        attributedRevenue: 1800,
        channels: [
          { channel: 'wechat', reached: 12, converted: 2, conversionRate: 1 / 6, revenue: 1200 },
          { channel: 'phone', reached: 8, converted: 1, conversionRate: 0.125, revenue: 600 },
        ],
        strategies: [{ name: '沉睡客户召回', status: 'enabled', executionType: 'manual', lastExecutedAt: new Date('2026-07-15') }],
        attributionByStrategy: [{ id: 1, name: '沉睡客户召回', revenue: 1800 }],
        dataCoverage: { touchesTruncated: false, attributionsTruncated: false, strategiesTruncated: false, touchSampleSize: 20, attributionSampleSize: 1 },
      }),
      buildMarketingFollowUpPrioritySnapshot: jest.fn().mockResolvedValue({
        rows: [
          { customerId: 1, customerName: '李女士', score: 92, opportunityType: 'recall', priority: 'high' },
          { customerId: 2, customerName: '王女士', score: 85, opportunityType: 'repurchase', priority: 'medium' },
        ],
        truncated: false,
        scannedOpportunityCount: 2,
      }),
    };
    const customerFacts = { summarizeCustomerSegments: jest.fn().mockResolvedValue('客户分层摘要：VIP 2 人，沉睡客户 5 人。') };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      customerFacts as never,
      { parse: jest.fn().mockReturnValue({ range: { label: '本月', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-31') } }) } as never,
    );

    const answer = await executor.execute(input(card('marketing_growth_overview', 'domain')));

    expect(answer).toMatchObject({
      status: 'completed',
      grounding: 'db_skill',
      metadata: expect.objectContaining({
        capabilityKey: 'marketing_growth_overview',
        componentCapabilities: [
          'marketing_attribution_analytics',
          'marketing_follow_up_opportunities',
          'marketing_customer_segment_summary',
        ],
      }),
    });
    expect(answer.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'kpi' }),
      expect.objectContaining({ kind: 'table' }),
      expect.objectContaining({ kind: 'ranking' }),
      expect.objectContaining({ kind: 'text' }),
      expect.objectContaining({ kind: 'diagnosis' }),
      expect.objectContaining({ kind: 'limitations' }),
    ]));
    expect(answer.citations).toHaveLength(3);
    expect(skillRuntime.buildMarketingFollowUpPrioritySnapshot).toHaveBeenCalledWith(expect.objectContaining({ storeId: 6 }));
    expect(customerFacts.summarizeCustomerSegments).toHaveBeenCalledWith(expect.objectContaining({ storeId: 6 }));
  });

  it('reuses marketing recommendations and real projects for a high-end package audience', async () => {
    const marketing = {
      getRecommendations: jest.fn().mockResolvedValue([{
        id: 4,
        category: 'ltv-nurture',
        triggerType: 'vip_privilege_care',
        reason: '高 LTV 客户适合权益维护',
        recommendedItems: [{ type: 'package', name: '季度高端护理礼遇' }],
      }]),
      getRecommendationAudience: jest.fn().mockResolvedValue([{
        name: '张女士', segment: '钻石会员', totalSpent: 12800, matchReason: '高 LTV 且近期有复购机会',
      }]),
    };
    const prisma = {
      project: {
        findMany: jest.fn().mockResolvedValue([
          { id: 31, name: '抗衰紧致护理', price: 1280, recommend: true, type: { name: '面部护理' } },
        ]),
      },
      customer: { findMany: jest.fn() },
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      {} as never,
      {} as never,
      new BrainTimeRangeParserService(),
      undefined,
      marketing as never,
      prisma as never,
    );

    const answer = await executor.execute(input(card('marketing_growth_overview', 'domain'), {
      question: '我想做个高端护理套餐推广，找哪些客户合适',
      args: { objective: '筛选高端护理套餐推广客户', limit: 10 },
    }));

    expect(answer).toMatchObject({
      status: 'completed',
      grounding: 'db_skill',
      metadata: expect.objectContaining({
        capabilityKey: 'marketing_growth_overview',
        mode: 'package_audience',
        recommendationId: 4,
        customerCount: 1,
        projectIds: [31],
      }),
    });
    expect(answer.answer).toContain('张女士');
    expect(answer.answer).toContain('季度高端护理礼遇');
    expect(answer.answer).toContain('抗衰紧致护理');
    expect(answer.answer).toContain('不是肤质或医疗适应症结论');
    expect(answer.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'table' }),
      expect.objectContaining({ kind: 'ranking' }),
      expect.objectContaining({ kind: 'limitations' }),
    ]));
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
  });

  it('falls back to store customer facts when a dynamic recommendation audience id is unavailable', async () => {
    const marketing = {
      getRecommendations: jest.fn().mockResolvedValue([{
        id: 901,
        category: 'ltv-nurture',
        triggerType: 'vip_privilege_care',
        recommendedItems: [{ type: 'package', name: '高端护理年卡' }],
      }]),
      getRecommendationAudience: jest.fn().mockRejectedValue(new Error('Recommendation not found')),
    };
    const prisma = {
      project: {
        findMany: jest.fn().mockResolvedValue([
          { id: 32, name: '高端修护护理', price: 1680, recommend: true, type: { name: '面部护理' } },
        ]),
      },
      customer: {
        findMany: jest.fn().mockResolvedValue([
          { id: 11, name: '李女士', memberLevel: '黄金会员', totalSpent: 9800, visitCount: 12, lastVisitDate: null },
        ]),
      },
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      {} as never,
      {} as never,
      new BrainTimeRangeParserService(),
      undefined,
      marketing as never,
      prisma as never,
    );

    const answer = await executor.execute(input(card('marketing_growth_overview', 'domain'), {
      question: '我想做个高端护理套餐推广，找哪些客户合适',
      args: { objective: '筛选高端护理套餐推广客户', limit: 10 },
    }));

    expect(answer).toMatchObject({
      status: 'completed',
      grounding: 'db_skill',
      metadata: expect.objectContaining({
        recommendationId: 901,
        recommendationAudienceFallback: true,
        customerCount: 1,
      }),
    });
    expect(answer.answer).toContain('李女士');
    expect(answer.answer).toContain('受众映射不可用');
    expect(answer.answer).toContain('累计消费与到店次数初筛');
    expect(answer.citations).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'customer_value_fallback' }),
      expect.objectContaining({ sourceId: 'marketing_recommendation_card:901' }),
    ]));
    expect(prisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 6 }),
    }));
  });

  it('removes untrusted procurement facts and emits a data-quality limitation', async () => {
    const skillRuntime = {
      buildInventoryProcurementAnalysis: jest.fn().mockResolvedValue({
        suggestions: [{ productId: 1, sku: 'P1', productName: '补水精华', currentStock: 2, safetyStock: 5, suggestedQty: 8, supplierName: '供应商A' }],
        recentOrders: [],
        suppliers: [{ supplierName: '供应商A' }],
      }),
    };
    const dataQuality = {
      assess: jest.fn().mockResolvedValue({
        status: 'degraded',
        ruleCounts: { inventory_safety_stock_invalid: 26 },
        blockedFacts: ['procurement_advice'],
        limitations: ['发现 26 个商品安全库存无效，当前不能生成完整采购建议。'],
        candidateRulesIncluded: true,
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      {} as never,
      { parse: jest.fn().mockReturnValue({ mentionedTime: false, filters: [], requiresComparison: false, unsupportedExpressions: [] }) } as never,
      dataQuality as never,
    );

    const answer = await executor.execute(input(card('inventory_procurement_advice', 'domain')));

    expect(answer.answer).toBe('当前不能生成完整库存采购建议。数据质量限制：发现 26 个商品安全库存无效，当前不能生成完整采购建议。');
    expect(answer.answer).not.toContain('补水精华');
    expect(answer.blocks).toEqual([{ kind: 'limitations', items: ['发现 26 个商品安全库存无效，当前不能生成完整采购建议。'] }]);
    expect(answer.citations).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: 'inspection_finding', sourceId: 'inventory_safety_stock_invalid' }),
    ]));
    expect(answer.metadata).toMatchObject({ dataQuality: expect.objectContaining({ status: 'degraded' }) });
  });
});

describe('BrainActionCapabilityExecutor', () => {
  it('invokes the mapped adapter with an action plan and returns preview only', async () => {
    const adapter: BrainDomainAdapter = {
      key: 'front_desk',
      role: 'receptionist',
      requiredPermissions: [],
      canHandle: jest.fn().mockReturnValue(true),
      execute: jest.fn().mockResolvedValue({
        status: 'completed',
        answer: 'Reservation preview',
        citations: [{ sourceType: 'skill', sourceId: 'preview' }],
        suggestedActions: [{ actionId: 'action-1', actionType: 'create_reservation', requiresConfirmation: true }],
        grounding: 'preview_action',
      }),
    };
    const adapterRegistry = { resolve: jest.fn().mockReturnValue(adapter) };
    const executor = new BrainActionCapabilityExecutor(adapterRegistry as never);

    const answer = await executor.execute(
      input(card('reservation_action_preview', 'action'), {
        question: 'Create a reservation for Amy tomorrow at 3pm',
        args: {
          objective: 'Create a reservation for Amy tomorrow at 3pm',
          entities: [{ entityType: 'customer', entityKey: 'customer:18', mention: 'Amy', source: 'user', confidence: 0.99 }],
          metrics: [],
          dimensions: [],
          filters: [],
          orderBy: [],
        },
      }),
    );

    expect(adapterRegistry.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterKey: 'front_desk',
        capabilityKey: 'reservation_action_preview',
        intent: 'action',
        grounding: 'preview_action',
      }),
    );
    expect(adapter.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        dto: { message: 'Create a reservation for Amy tomorrow at 3pm', timezone: 'Asia/Shanghai' },
        context: expect.objectContaining({ storeId: 6 }),
        cognition: expect.objectContaining({
          entities: [{ slot: 'customer', entityKey: 'customer:18', label: 'Amy' }],
        }),
        plan: expect.objectContaining({ intent: 'action' }),
      }),
    );
    expect(answer.grounding).toBe('preview_action');
  });

  it('returns a Chinese clarification when the selected adapter is unavailable', async () => {
    const executor = new BrainActionCapabilityExecutor({ resolve: jest.fn().mockReturnValue(undefined) } as never);

    const answer = await executor.execute(input(card('marketing_touch_draft', 'action')));

    expect(answer).toMatchObject({ grounding: 'none' });
    expect(answer.answer).toMatch(/[\u4e00-\u9fff]/);
  });

  it('allows target clarification but rejects non-preview execution results', async () => {
    const adapter = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({
          status: 'completed',
          answer: 'Select a customer first',
          citations: [],
          suggestedActions: [],
          grounding: 'none',
          metadata: { unsupportedReason: 'action_target_requires_clarification' },
        })
        .mockResolvedValueOnce({
          status: 'completed',
          answer: 'Database result',
          citations: [],
          grounding: 'db_skill',
        }),
    };
    const executor = new BrainActionCapabilityExecutor({ resolve: jest.fn().mockReturnValue(adapter) } as never);
    const capabilityInput = input(card('customer_follow_up_draft', 'action'));

    await expect(executor.execute(capabilityInput)).resolves.toMatchObject({ grounding: 'none' });
    await expect(executor.execute(capabilityInput)).rejects.toThrow('action_executor_non_preview_result:db_skill');
  });

  it('rejects incomplete previews and receipt semantics', async () => {
    const adapter = {
      execute: jest
        .fn()
        .mockResolvedValueOnce({
          status: 'completed',
          answer: 'Preview',
          citations: [],
          suggestedActions: [],
          grounding: 'preview_action',
        })
        .mockResolvedValueOnce({
          status: 'completed',
          answer: 'Already executed. Receipt: 42',
          citations: [],
          suggestedActions: [{ actionId: 'action-2', requiresConfirmation: true }],
          grounding: 'preview_action',
        }),
    };
    const executor = new BrainActionCapabilityExecutor({ resolve: jest.fn().mockReturnValue(adapter) } as never);
    const capabilityInput = input(card('purchase_order_draft', 'action'));

    await expect(executor.execute(capabilityInput)).rejects.toThrow('action_preview_missing_suggested_action');
    await expect(executor.execute(capabilityInput)).rejects.toThrow('action_preview_contains_execution_receipt');
  });
});
