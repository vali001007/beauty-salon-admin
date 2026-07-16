import {
  createBusinessDefinitionProjectionFingerprint,
  createBusinessDefinitionProjectionV2Payload,
} from '../../semantic-data/business-definition-projection-compiler.service.js';
import { PublishedBusinessDefinitionSnapshotProviderService } from './published-business-definition-snapshot-provider.service.js';

describe('PublishedBusinessDefinitionSnapshotProviderService', () => {
  it('reads immutable published version projections without opening a Prisma transaction', async () => {
    const prisma = {
      businessDefinition: { findMany: jest.fn().mockResolvedValue([]) },
      businessDefinitionProjection: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockRejectedValue(new Error('transaction path must not be used')),
    };

    await expect(
      new PublishedBusinessDefinitionSnapshotProviderService(prisma as never).loadActiveDefinitions(),
    ).resolves.toEqual({ entities: [], relations: [], metrics: [], dimensions: [] });

    expect(prisma.businessDefinition.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('retries one transient snapshot transaction failure and preserves business failures', async () => {
    const tx = {
      businessDefinition: { findMany: jest.fn().mockResolvedValue([]) },
      businessDefinitionProjection: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const transientPrisma = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce(new Error('Transaction API error: connection terminated'))
        .mockImplementationOnce(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    const snapshot = await new PublishedBusinessDefinitionSnapshotProviderService(
      transientPrisma as never,
    ).loadActiveDefinitions();

    expect(snapshot).toEqual({ entities: [], relations: [], metrics: [], dimensions: [] });
    expect(transientPrisma.$transaction).toHaveBeenCalledTimes(2);

    const businessPrisma = { $transaction: jest.fn().mockRejectedValue(new Error('definition_projection_invalid')) };
    await expect(
      new PublishedBusinessDefinitionSnapshotProviderService(businessPrisma as never).loadActiveDefinitions(),
    ).rejects.toThrow('definition_projection_invalid');
    expect(businessPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('uses the last verified snapshot when a refresh transaction remains transiently unavailable', async () => {
    const tx = {
      businessDefinition: { findMany: jest.fn().mockResolvedValue([]) },
      businessDefinitionProjection: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementationOnce(async (callback: (client: typeof tx) => unknown) => callback(tx))
        .mockRejectedValueOnce(new Error('Transaction API error: connection terminated'))
        .mockRejectedValueOnce(new Error('Transaction API error: connection terminated'))
        .mockRejectedValueOnce(new Error('Transaction API error: connection terminated')),
    };
    const provider = new PublishedBusinessDefinitionSnapshotProviderService(prisma as never);
    const first = await provider.loadActiveDefinitions();
    (provider as any).activeDefinitionSnapshot.expiresAt = 0;

    const fallback = await provider.loadActiveDefinitions();

    expect(fallback).toBe(first);
    expect(prisma.$transaction).toHaveBeenCalledTimes(4);
  });

  it('loads metric projections independently from unrelated ontology projections', async () => {
    const metric = projectionV2('metric.paid_amount', 'metric', {
      metricKey: 'paid_amount',
      description: '支付成功实收金额',
      valueType: 'money',
      allowedTaskTypes: ['query'],
      sensitive: true,
      measure: { aggregation: 'sum', model: 'PaymentRecord', field: 'amount' },
      sourceModels: ['PaymentRecord'],
      joinPath: [],
      filters: [],
      dimensions: [],
      timePolicy: { mode: 'event_time', field: 'PaymentRecord.paidAt', boundary: '[start,end)', timezone: 'Asia/Shanghai' },
      storeScope: { mode: 'current_store', model: 'PaymentRecord', field: 'storeId', joinPath: [] },
      permissionPolicies: [{ bindingRef: 'order_revenue_analysis', allOf: ['core:finance:view'] }],
      bindings: {
        capability: ['order_revenue_analysis'],
        executor: ['BusinessDefinitionRuntimeQueryExecutor.execute'],
        outputField: ['paidAmount'],
      },
    });
    const tx = {
      businessDefinition: { findMany: jest.fn().mockResolvedValue([publishedDefinitionV2(metric)]) },
      businessDefinitionProjection: { findMany: jest.fn().mockResolvedValue([metric]) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const provider = new PublishedBusinessDefinitionSnapshotProviderService(prisma as never);

    const metrics = await provider.loadActiveMetricDefinitions();

    expect(tx.businessDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ kind: 'metric' }) }),
    );
    expect(tx.businessDefinitionProjection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { definitionVersionId: { in: [metric.definitionVersionId] }, targetType: 'metric_query_view' } }),
    );
    expect(metrics).toEqual([expect.objectContaining({ metricKey: 'paid_amount', sensitive: true })]);
  });

  it('loads target-specific V2 projections without falling back to the legacy definition envelope', async () => {
    const entity = projectionV2('entity.product', 'entity', {
      model: 'Product',
      aliases: ['商品'],
      fields: ['id', 'name', 'storeId'],
      relationFields: [],
      storeScopeField: 'storeId',
    });
    const metric = projectionV2('metric.paid_amount', 'metric', {
      metricKey: 'paid_amount',
      description: '支付成功实收金额',
      measure: { aggregation: 'sum', model: 'PaymentRecord', field: 'amount' },
      sourceModels: ['PaymentRecord'],
      joinPath: [],
      filters: [],
      dimensions: [],
      timePolicy: {
        mode: 'event_time',
        field: 'PaymentRecord.paidAt',
        boundary: '[start,end)',
        timezone: 'Asia/Shanghai',
      },
      storeScope: { mode: 'current_store', model: 'PaymentRecord', field: 'storeId', joinPath: [] },
      permissionPolicies: [{ bindingRef: 'capability:order_revenue', allOf: ['core:finance:view'] }],
      bindings: {
        capability: ['order_revenue_analysis'],
        executor: ['SemanticQueryExecutorService.execute'],
        outputField: ['paidAmount'],
      },
    });
    const rows = [entity, metric];
    const tx = {
      businessDefinition: { findMany: jest.fn().mockResolvedValue(rows.map(publishedDefinitionV2)) },
      businessDefinitionProjection: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };

    const snapshot = await new PublishedBusinessDefinitionSnapshotProviderService(
      prisma as never,
    ).loadActiveDefinitions();

    expect(snapshot.entities[0]).toMatchObject({ entityKey: 'product', aliases: ['商品'] });
    expect(snapshot.metrics[0]).toMatchObject({
      metricKey: 'paid_amount',
      formula: { type: 'sum', model: 'PaymentRecord', field: 'amount' },
    });
  });

  it('maps only current published read-only projections into the Brain runtime snapshot', async () => {
    const rows = [
      projection('entity.product', 'entity', {
        model: 'Product',
        aliases: ['商品'],
        fields: ['id', 'name', 'storeId'],
        relationFields: [],
        storeScopeField: 'storeId',
      }),
      projection('relation.customer.product_orders', 'relation', {
        fromModel: 'Customer',
        relationField: 'productOrders',
        toModel: 'ProductOrder',
        relationFromFields: [],
        relationToFields: [],
        executableJoin: false,
      }),
      projection('metric.paid_amount', 'metric', {
        metricKey: 'paid_amount',
        description: '支付成功实收金额',
        measure: { aggregation: 'sum', model: 'PaymentRecord', field: 'amount' },
        sourceModels: ['PaymentRecord'],
        joinPath: [],
        filters: [{ model: 'PaymentRecord', field: 'status', operator: 'eq', value: 'success' }],
        permissionPolicies: [{ bindingRef: 'capability:order_revenue', allOf: ['core:finance:view'] }],
      }),
      projection('dimension.customer_level', 'dimension', {
        dimensionKey: 'customer_level',
        source: { model: 'Customer', field: 'memberLevel' },
        permissionPolicies: [{ bindingRef: 'capability:customer', allOf: ['core:customer:view'] }],
      }),
    ];
    const definitions = rows.map(publishedDefinition);
    const tx = {
      businessDefinition: { findMany: jest.fn().mockResolvedValue(definitions) },
      businessDefinitionProjection: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const provider = new PublishedBusinessDefinitionSnapshotProviderService(prisma as never);

    const snapshot = await provider.loadActiveDefinitions();

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(tx.businessDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active', currentPublishedVersionId: { not: null } }),
        include: expect.objectContaining({ currentPublishedVersion: expect.any(Object) }),
      }),
    );
    expect(tx.businessDefinitionProjection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { definitionVersionId: { in: [3] }, targetType: 'metric_query_view' },
            { definitionVersionId: { in: [1, 2, 4] }, targetType: 'intent_semantic_index' },
          ],
        },
      }),
    );
    expect(snapshot.entities).toEqual([
      expect.objectContaining({
        definitionKey: 'entity.product',
        entityKey: 'product',
        aliases: ['商品'],
        tableMap: expect.objectContaining({ model: 'Product' }),
      }),
    ]);
    expect(snapshot.relations[0]).toMatchObject({
      definitionKey: 'relation.customer.product_orders',
      fromEntityKey: 'customer',
      toEntityKey: 'product_order',
    });
    expect(snapshot.metrics[0]).toMatchObject({
      definitionKey: 'metric.paid_amount',
      metricKey: 'paid_amount',
      formula: { type: 'sum', model: 'PaymentRecord', field: 'amount' },
      permissions: ['core:finance:view'],
      runtimeQuery: {
        aggregation: 'sum',
        joinPath: [],
        dimensions: ['productId', 'productName'],
        filters: [{ model: 'PaymentRecord', field: 'status', operator: 'eq', value: 'success' }],
        capabilityKeys: ['order_revenue_analysis'],
        executorKeys: ['SemanticQueryExecutorService.execute'],
        outputFields: ['paidAmount'],
        sort: { outputField: 'paidAmount', direction: 'desc', missing: 'error' },
        timePolicy: {
          mode: 'event_time',
          field: 'PaymentRecord.paidAt',
          boundary: '[start,end)',
          timezone: 'Asia/Shanghai',
        },
        storeScope: {
          mode: 'current_store',
          anchorModel: 'PaymentRecord',
          model: 'PaymentRecord',
          field: 'storeId',
          joinPath: [],
        },
      },
    });
    expect(snapshot.dimensions[0]).toMatchObject({
      definitionKey: 'dimension.customer_level',
      dimensionKey: 'customer_level',
      source: { model: 'Customer', field: 'memberLevel' },
    });
  });

  it.each([
    ['writable', (row: any) => (row.readOnly = false)],
    ['missing', (row: any) => (row.omit = true)],
    ['wrong target type', (row: any) => (row.targetType = 'intent_semantic_index')],
  ])('rejects a %s current projection instead of returning a partial snapshot', async (_case, mutate) => {
    const row = projection('metric.paid_amount', 'metric', {
      metricKey: 'paid_amount',
      description: '实收',
      measure: { aggregation: 'sum', model: 'PaymentRecord', field: 'amount' },
      sourceModels: ['PaymentRecord'],
      filters: [],
      permissionPolicies: [{ bindingRef: 'capability:order_revenue', allOf: ['core:finance:view'] }],
    });
    mutate(row);
    const definition = publishedDefinition(row);
    const tx = {
      businessDefinition: { findMany: jest.fn().mockResolvedValue([definition]) },
      businessDefinitionProjection: {
        findMany: jest.fn().mockResolvedValue((row as any).omit ? [] : [row]),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const provider = new PublishedBusinessDefinitionSnapshotProviderService(prisma as never);

    await expect(provider.loadActiveDefinitions()).rejects.toThrow(
      'published_business_definition_projection_invalid:metric.paid_amount',
    );
    expect((tx as any).brainMetric).toBeUndefined();
  });

  it('uses distinctField for count_distinct even when a normal field is also declared', async () => {
    const row = projection('metric.customer_count', 'metric', {
      metricKey: 'customer_count',
      description: '消费客户数',
      measure: {
        aggregation: 'count_distinct',
        model: 'PaymentRecord',
        field: 'id',
        distinctField: 'customerId',
      },
      sourceModels: ['PaymentRecord'],
      filters: [],
      permissionPolicies: [{ bindingRef: 'capability:customer_count', allOf: ['core:finance:view'] }],
    });
    const tx = {
      businessDefinition: { findMany: jest.fn().mockResolvedValue([publishedDefinition(row)]) },
      businessDefinitionProjection: { findMany: jest.fn().mockResolvedValue([row]) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };

    const snapshot = await new PublishedBusinessDefinitionSnapshotProviderService(
      prisma as never,
    ).loadActiveDefinitions();

    expect(snapshot.metrics[0].formula).toEqual({
      type: 'count_distinct',
      model: 'PaymentRecord',
      field: 'customerId',
    });
  });

  it('maps a published domain-service expression into a governed runtime resolver', async () => {
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
    const row = projection('metric.stock_gap', 'metric', {
      metricKey: 'stock_gap',
      description: '安全库存缺口',
      measure: { aggregation: 'score', resolver },
      sourceModels: ['Product'],
      dimensions: ['product_id', 'product_name'],
      filters: [],
      permissionPolicies: [{ bindingRef: 'capability:inventory', allOf: ['core:inventory:stock'] }],
      storeScope: { mode: 'current_store', model: 'Product', field: 'storeId', joinPath: [] },
      bindings: {
        template: ['inventory_risk'],
        capability: ['inventory_risk_ranking'],
        executor: ['BusinessDefinitionRuntimeQueryExecutor.execute'],
        outputField: ['stockGap'],
        sort: { outputField: 'stockGap', direction: 'desc', missing: 'error' },
      },
    });
    const tx = {
      businessDefinition: { findMany: jest.fn().mockResolvedValue([publishedDefinition(row)]) },
      businessDefinitionProjection: { findMany: jest.fn().mockResolvedValue([row]) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };

    const snapshot = await new PublishedBusinessDefinitionSnapshotProviderService(
      prisma as never,
    ).loadActiveDefinitions();

    expect(snapshot.metrics[0]).toMatchObject({
      formula: { type: 'score', resolver },
      source: [{ model: 'Product' }],
      runtimeQuery: {
        aggregation: 'score',
        resolver,
        dimensions: ['product_id', 'product_name'],
        capabilityKeys: ['inventory_risk_ranking'],
        outputFields: ['stockGap'],
        storeScope: expect.objectContaining({ anchorModel: 'Product', model: 'Product' }),
      },
    });
  });

  it('compiles canonical store-scope anchor and join-path target into explicit runtime fields', async () => {
    const row = projection('metric.item_quantity', 'metric', {
      metricKey: 'item_quantity',
      description: '商品明细数量',
      measure: { aggregation: 'sum', model: 'OrderItem', field: 'quantity' },
      sourceModels: ['OrderItem', 'ProductOrder'],
      joinPath: [{ fromModel: 'OrderItem', relationField: 'order', toModel: 'ProductOrder' }],
      filters: [],
      dimensions: [],
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
      permissionPolicies: [{ bindingRef: 'capability:item_quantity', allOf: ['core:order:view'] }],
      bindings: {
        template: ['item_quantity'],
        capability: ['product_sales_ranking'],
        executor: ['BusinessDefinitionRuntimeQueryExecutor.execute'],
        outputField: ['quantity'],
        sort: { outputField: 'quantity', direction: 'desc', missing: 'error' },
      },
    });
    const tx = {
      businessDefinition: { findMany: jest.fn().mockResolvedValue([publishedDefinition(row)]) },
      businessDefinitionProjection: { findMany: jest.fn().mockResolvedValue([row]) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };

    const snapshot = await new PublishedBusinessDefinitionSnapshotProviderService(
      prisma as never,
    ).loadActiveDefinitions();

    expect(snapshot.metrics[0].runtimeQuery?.storeScope).toEqual({
      mode: 'current_store',
      anchorModel: 'OrderItem',
      model: 'ProductOrder',
      field: 'storeId',
      joinPath: [{ fromModel: 'OrderItem', relationField: 'order', toModel: 'ProductOrder' }],
    });
  });

  it('rejects a resolver whose published store scope does not match its shared contract', async () => {
    const resolver = {
      kind: 'domain_service',
      key: 'manager_staff_analysis',
      dimensionFields: { staff_name: 'name' },
      expression: { op: 'field', field: 'serviceCount' },
      overallAggregation: 'avg',
    };
    const row = projection('metric.staff_performance_score', 'metric', {
      metricKey: 'staff_performance_score',
      description: '员工表现评分',
      measure: { aggregation: 'score', resolver },
      sourceModels: ['Product'],
      dimensions: ['staff_name'],
      filters: [],
      storeScope: { mode: 'current_store', model: 'Product', field: 'storeId', joinPath: [] },
      permissionPolicies: [{ bindingRef: 'capability:staff', allOf: ['core:staff:view'] }],
      bindings: {
        template: ['staff_performance'],
        capability: ['staff_performance_ranking'],
        executor: ['BusinessDefinitionRuntimeQueryExecutor.execute'],
        outputField: ['performanceScore'],
        sort: { outputField: 'performanceScore', direction: 'desc', missing: 'error' },
      },
    });
    const tx = {
      businessDefinition: { findMany: jest.fn().mockResolvedValue([publishedDefinition(row)]) },
      businessDefinitionProjection: { findMany: jest.fn().mockResolvedValue([row]) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };

    await expect(
      new PublishedBusinessDefinitionSnapshotProviderService(prisma as never).loadActiveDefinitions(),
    ).rejects.toThrow('metric_resolver_store_scope_invalid:anchor_model:Product');
  });

  it.each([
    ['filters', { filters: {} }],
    ['permission policies', { permissionPolicies: {} }],
    ['metric identity', { metricKey: 'other_metric' }],
    ['filter item', { filters: [{ model: 'PaymentRecord', value: 'success' }] }],
    [
      'empty permission policy',
      {
        permissionPolicies: [
          { bindingRef: 'capability:empty', allOf: [] },
          { bindingRef: 'capability:valid', allOf: ['core:finance:view'] },
        ],
      },
    ],
    ['unsupported aggregation', { measure: { aggregation: 'median', model: 'PaymentRecord', field: 'amount' } }],
    ['missing bindings', { bindings: null }],
    [
      'empty executor binding',
      {
        bindings: {
          template: ['order_revenue'],
          capability: ['order_revenue_analysis'],
          executor: [],
          outputField: ['paidAmount'],
          sort: { outputField: 'paidAmount', direction: 'desc', missing: 'error' },
        },
      },
    ],
    ['missing time policy', { timePolicy: null }],
    ['missing store scope', { storeScope: null }],
    ['invalid join path', { joinPath: [{ fromModel: 'PaymentRecord', relationField: '', toModel: 'ProductOrder' }] }],
  ])('fails closed when metric %s are invalid', async (_case, override) => {
    const row = projection('metric.paid_amount', 'metric', {
      metricKey: 'paid_amount',
      description: '实收',
      measure: { aggregation: 'sum', model: 'PaymentRecord', field: 'amount' },
      sourceModels: ['PaymentRecord'],
      filters: [],
      permissionPolicies: [{ bindingRef: 'capability:order_revenue', allOf: ['core:finance:view'] }],
      ...override,
    });
    const tx = {
      businessDefinition: { findMany: jest.fn().mockResolvedValue([publishedDefinition(row)]) },
      businessDefinitionProjection: { findMany: jest.fn().mockResolvedValue([row]) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };

    await expect(
      new PublishedBusinessDefinitionSnapshotProviderService(prisma as never).loadActiveDefinitions(),
    ).rejects.toThrow('published_business_definition_projection_invalid:metric.paid_amount');
  });

  it('fails closed when dimensionKey does not match the registry definition key', async () => {
    const row = projection('dimension.customer_level', 'dimension', {
      dimensionKey: 'other_dimension',
      source: { model: 'Customer', field: 'memberLevel' },
      permissionPolicies: [{ bindingRef: 'capability:customer', allOf: ['core:customer:view'] }],
    });
    const tx = {
      businessDefinition: { findMany: jest.fn().mockResolvedValue([publishedDefinition(row)]) },
      businessDefinitionProjection: { findMany: jest.fn().mockResolvedValue([row]) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };

    await expect(
      new PublishedBusinessDefinitionSnapshotProviderService(prisma as never).loadActiveDefinitions(),
    ).rejects.toThrow('published_business_definition_projection_invalid:dimension.customer_level');
  });

  it('uses the canonical entity key algorithm for model names containing version numbers', async () => {
    const row = projection('relation.agent_v2_text_to_sql_run.candidates', 'relation', {
      fromModel: 'AgentV2TextToSqlRun',
      relationField: 'candidates',
      toModel: 'AgentV2TextToSqlCandidate',
      relationFromFields: [],
      relationToFields: [],
      executableJoin: false,
    });
    const tx = {
      businessDefinition: { findMany: jest.fn().mockResolvedValue([publishedDefinition(row)]) },
      businessDefinitionProjection: { findMany: jest.fn().mockResolvedValue([row]) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };

    const snapshot = await new PublishedBusinessDefinitionSnapshotProviderService(
      prisma as never,
    ).loadActiveDefinitions();

    expect(snapshot.relations[0]).toMatchObject({
      fromEntityKey: 'agent_v2_text_to_sql_run',
      toEntityKey: 'agent_v2_text_to_sql_candidate',
    });
  });
});

let nextDefinitionVersionId = 1;
let nextV2DefinitionVersionId = 1001;

function projection(definitionKey: string, kind: 'entity' | 'relation' | 'metric' | 'dimension', definition: any) {
  const definitionVersionId = nextDefinitionVersionId++;
  const definitionVersion = 1;
  const definitionFingerprint = 'a'.repeat(64);
  const sourceFingerprint = 'b'.repeat(64);
  const targetType = kind === 'metric' ? 'metric_query_view' : 'intent_semantic_index';
  const targetKey = `${definitionKey}@${definitionVersion}`;
  const definitionRef = {
    definitionKey,
    definitionVersion,
    definitionFingerprint,
    sourceFingerprint,
  };
  const canonicalDefinition =
    kind === 'metric'
      ? {
          metricKey: definitionKey.slice('metric.'.length),
          description: definitionKey,
          valueType: 'money',
          measure: { aggregation: 'sum', model: 'PaymentRecord', field: 'amount' },
          sourceModels: ['PaymentRecord'],
          joinPath: [],
          filters: [],
          dimensions: ['productId', 'productName'],
          timePolicy: {
            mode: 'event_time',
            field: 'PaymentRecord.paidAt',
            boundary: '[start,end)',
            timezone: 'Asia/Shanghai',
          },
          storeScope: {
            mode: 'current_store',
            model: 'PaymentRecord',
            field: 'storeId',
            joinPath: [],
          },
          permissionPolicies: [{ bindingRef: 'order_revenue_analysis', allOf: ['core:finance:view'] }],
          exceptionPolicy: {
            cancelled: 'exclude',
            refunded: 'exclude',
            gifts: 'exclude',
            fallback: 'reject',
          },
          bindings: {
            template: ['order_revenue'],
            capability: ['order_revenue_analysis'],
            executor: ['SemanticQueryExecutorService.execute'],
            outputField: ['paidAmount'],
            sort: { outputField: 'paidAmount', direction: 'desc', missing: 'error' },
          },
          ...definition,
        }
      : definition;
  const payload = {
    preview: false,
    projectionType: targetType,
    definitionRef,
    kind,
    domain: kind === 'metric' ? 'finance' : 'catalog',
    name: definitionKey,
    schemaVersion: '1.0',
    timezone: 'Asia/Shanghai',
    storeScope: { mode: 'current_store' },
    canonicalQueryRef: kind === 'metric' ? 'semantic_query.paid_amount' : null,
    fixtureSetKey: kind === 'metric' ? 'semantic.paid_amount.v1' : null,
    definition: canonicalDefinition,
  };
  return {
    definitionVersionId,
    targetType,
    targetKey,
    definitionKey,
    definitionVersion,
    definitionFingerprint,
    sourceFingerprint,
    payload,
    projectionFingerprint: createBusinessDefinitionProjectionFingerprint({
      targetType,
      targetKey,
      definitionVersionId,
      definitionRef,
      payload,
      readOnly: true,
    }),
    readOnly: true,
  };
}

function publishedDefinition(row: ReturnType<typeof projection>) {
  return {
    definitionKey: row.definitionKey,
    kind: row.payload.kind,
    domain: row.payload.domain,
    name: row.payload.name,
    status: 'active',
    currentPublishedVersionId: row.definitionVersionId,
    currentPublishedVersion: {
      id: row.definitionVersionId,
      version: row.definitionVersion,
      lifecycleStatus: 'published',
      fingerprint: row.definitionFingerprint,
      sourceFingerprint: row.sourceFingerprint,
    },
  };
}

function projectionV2(definitionKey: string, kind: 'entity' | 'relation' | 'metric' | 'dimension', definition: any) {
  const definitionVersionId = nextV2DefinitionVersionId++;
  const definitionVersion = 1;
  const definitionFingerprint = 'c'.repeat(64);
  const sourceFingerprint = 'd'.repeat(64);
  const targetType = kind === 'metric' ? 'metric_query_view' : 'intent_semantic_index';
  const targetKey = `${definitionKey}@${definitionVersion}`;
  const version = {
    id: definitionVersionId,
    definitionId: definitionVersionId,
    version: definitionVersion,
    schemaVersion: '1.0',
    payload: definition,
    lifecycleStatus: 'published',
    fingerprint: definitionFingerprint,
    sourceFingerprint,
    validationStatus: 'passed',
    canonicalQueryRef: kind === 'metric' ? `semantic_query.${definitionKey.slice('metric.'.length)}` : null,
    fixtureSetKey: kind === 'metric' ? `semantic.${definitionKey}.v1` : null,
    timezone: 'Asia/Shanghai',
    storeScope: { mode: 'current_store' },
    definition: {
      id: definitionVersionId,
      definitionKey,
      kind,
      domain: kind === 'metric' ? 'finance' : 'catalog',
      name: definitionKey,
      ownerType: 'system',
      ownerId: 'semantic-data',
    },
  };
  const payload = createBusinessDefinitionProjectionV2Payload(version, targetType, false);
  return {
    definitionVersionId,
    targetType,
    targetKey,
    definitionKey,
    definitionVersion,
    definitionFingerprint,
    sourceFingerprint,
    payload,
    projectionFingerprint: createBusinessDefinitionProjectionFingerprint({
      targetType,
      targetKey,
      definitionVersionId,
      definitionRef: payload.definitionRef,
      payload,
      readOnly: true,
    }),
    readOnly: true,
    kind,
    domain: version.definition.domain,
    name: version.definition.name,
  };
}

function publishedDefinitionV2(row: ReturnType<typeof projectionV2>) {
  return {
    definitionKey: row.definitionKey,
    kind: row.kind,
    domain: row.domain,
    name: row.name,
    status: 'active',
    currentPublishedVersionId: row.definitionVersionId,
    currentPublishedVersion: {
      id: row.definitionVersionId,
      version: row.definitionVersion,
      lifecycleStatus: 'published',
      fingerprint: row.definitionFingerprint,
      sourceFingerprint: row.sourceFingerprint,
    },
  };
}
