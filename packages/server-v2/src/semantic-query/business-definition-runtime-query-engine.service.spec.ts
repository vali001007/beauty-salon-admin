import { BusinessDefinitionRuntimeQueryEngineService } from './business-definition-runtime-query-engine.service.js';

describe('BusinessDefinitionRuntimeQueryEngineService', () => {
  it('executes the model and filters carried by the published runtime query binding', async () => {
    const prisma = { productOrder: { findMany: jest.fn().mockResolvedValue([{ totalAmount: 120 }]) } };
    const provider = { getRuntimeDataModel: () => dataModel() };
    const engine = new BusinessDefinitionRuntimeQueryEngineService(prisma as any, provider as any);

    const first = await engine.executeMetric({
      metric: metricBinding({ filters: [{ model: 'ProductOrder', field: 'status', operator: 'eq', value: 'paid' }] }),
      dimensions: [],
      storeId: 6,
      timeRange: range(),
    });
    const second = await engine.executeMetric({
      metric: metricBinding({ filters: [{ model: 'ProductOrder', field: 'status', operator: 'eq', value: 'completed' }] }),
      dimensions: [],
      storeId: 6,
      timeRange: range(),
    });

    expect(first.overallValue).toBe(120);
    expect(second.overallValue).toBe(120);
    expect(prisma.productOrder.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ AND: expect.arrayContaining([{ status: 'paid' }, { storeId: 6 }]) }),
    );
    expect(prisma.productOrder.findMany.mock.calls[1][0].where).toEqual(
      expect.objectContaining({ AND: expect.arrayContaining([{ status: 'completed' }, { storeId: 6 }]) }),
    );
  });

  it('changes the Prisma delegate when a new published binding changes the model', async () => {
    const prisma = {
      productOrder: { findMany: jest.fn().mockResolvedValue([{ totalAmount: 120 }]) },
      paymentRecord: { findMany: jest.fn().mockResolvedValue([{ amount: 80 }]) },
    };
    const provider = { getRuntimeDataModel: () => dataModel() };
    const engine = new BusinessDefinitionRuntimeQueryEngineService(prisma as any, provider as any);

    await engine.executeMetric({ metric: metricBinding(), dimensions: [], storeId: 6, timeRange: range() });
    await engine.executeMetric({
      metric: metricBinding({
        formula: { type: 'sum', model: 'PaymentRecord', field: 'amount' },
        storeScope: { mode: 'current_store', model: 'PaymentRecord', field: 'storeId', joinPath: [] },
        timePolicy: {
          mode: 'event_time',
          field: 'PaymentRecord.paidAt',
          boundary: '[start,end)',
          timezone: 'Asia/Shanghai',
        },
      }),
      dimensions: [],
      storeId: 6,
      timeRange: range(),
    });

    expect(prisma.productOrder.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.paymentRecord.findMany).toHaveBeenCalledTimes(1);
  });

  it('retries one transient read failure without retrying business query errors', async () => {
    const transientFindMany = jest
      .fn()
      .mockRejectedValueOnce(new Error('Transaction API error: connection terminated'))
      .mockResolvedValueOnce([{ totalAmount: 120 }]);
    const transientEngine = new BusinessDefinitionRuntimeQueryEngineService(
      { productOrder: { findMany: transientFindMany } } as any,
      { getRuntimeDataModel: () => dataModel() } as any,
    );

    const result = await transientEngine.executeMetric({
      metric: metricBinding(),
      dimensions: [],
      storeId: 6,
      timeRange: range(),
    });

    expect(result.overallValue).toBe(120);
    expect(transientFindMany).toHaveBeenCalledTimes(2);

    const businessFindMany = jest.fn().mockRejectedValue(new Error('semantic_field_not_found:ProductOrder.amount'));
    const businessEngine = new BusinessDefinitionRuntimeQueryEngineService(
      { productOrder: { findMany: businessFindMany } } as any,
      { getRuntimeDataModel: () => dataModel() } as any,
    );

    await expect(
      businessEngine.executeMetric({ metric: metricBinding(), dimensions: [], storeId: 6, timeRange: range() }),
    ).rejects.toThrow('semantic_field_not_found:ProductOrder.amount');
    expect(businessFindMany).toHaveBeenCalledTimes(1);
  });

  it('applies the server-owned beautician self scope to the published staff dimension', async () => {
    const findMany = jest.fn().mockResolvedValue([{ amount: 80, beauticianId: 17 }]);
    const engine = new BusinessDefinitionRuntimeQueryEngineService(
      { serviceTask: { findMany } } as any,
      { getRuntimeDataModel: () => selfScopeDataModel() } as any,
    );

    await (engine as any).executeMetric({
      metric: {
        metricKey: 'beautician_sales',
        formula: { type: 'sum', model: 'ServiceTask', field: 'amount' },
        runtimeQuery: {
          aggregation: 'sum',
          joinPath: [],
          dimensions: ['beauticianId'],
          filters: [],
          capabilityKeys: ['staff_performance_ranking'],
          executorKeys: ['BusinessDefinitionRuntimeQueryExecutor.execute'],
          outputFields: ['amount'],
          timePolicy: { mode: 'event_time', field: 'ServiceTask.createdAt', boundary: '[start,end)', timezone: 'Asia/Shanghai' },
          storeScope: { mode: 'current_store', model: 'ServiceTask', field: 'storeId', joinPath: [] },
        },
      },
      dimensions: [{ key: 'beauticianId', name: '美容师', model: 'ServiceTask', field: 'beauticianId' }],
      selfScope: { dimensionKey: 'beauticianId', value: 17 },
      storeId: 6,
      timeRange: range(),
    });

    expect(findMany.mock.calls[0][0].where.AND).toContainEqual({ beauticianId: 17 });
  });

  it('refuses self scope when the published metric has no staff dimension path', async () => {
    const engine = new BusinessDefinitionRuntimeQueryEngineService(
      { productOrder: { findMany: jest.fn() } } as any,
      { getRuntimeDataModel: () => dataModel() } as any,
    );

    await expect(
      (engine as any).executeMetric({
        metric: metricBinding(),
        dimensions: [],
        selfScope: { dimensionKey: 'beauticianId', value: 17 },
        storeId: 6,
        timeRange: range(),
      }),
    ).rejects.toThrow('semantic_self_scope_unapplicable:paid_amount:beauticianId');
  });
});

function metricBinding(overrides: Record<string, unknown> = {}) {
  const runtimeQuery = {
    aggregation: 'sum',
    joinPath: [],
    dimensions: [],
    filters: [],
    capabilityKeys: ['order_revenue_analysis'],
    executorKeys: ['BusinessDefinitionRuntimeQueryExecutor.execute'],
    outputFields: ['paidAmount'],
    timePolicy: {
      mode: 'event_time',
      field: 'ProductOrder.createdAt',
      boundary: '[start,end)',
      timezone: 'Asia/Shanghai',
    },
    storeScope: { mode: 'current_store', model: 'ProductOrder', field: 'storeId', joinPath: [] },
    ...overrides,
  };
  return {
    metricKey: 'paid_amount',
    formula: overrides.formula ?? { type: 'sum', model: 'ProductOrder', field: 'totalAmount' },
    runtimeQuery,
  } as any;
}

function range() {
  return {
    startDate: new Date('2026-07-01T00:00:00.000Z'),
    endExclusive: new Date('2026-08-01T00:00:00.000Z'),
    rangeLabel: '本月',
  };
}

function dataModel() {
  return {
    models: {
      ProductOrder: {
        fields: [
          { name: 'totalAmount', type: 'Decimal', kind: 'scalar', isList: false },
          { name: 'status', type: 'String', kind: 'scalar', isList: false },
          { name: 'storeId', type: 'Int', kind: 'scalar', isList: false },
          { name: 'createdAt', type: 'DateTime', kind: 'scalar', isList: false },
        ],
      },
      PaymentRecord: {
        fields: [
          { name: 'amount', type: 'Decimal', kind: 'scalar', isList: false },
          { name: 'storeId', type: 'Int', kind: 'scalar', isList: false },
          { name: 'paidAt', type: 'DateTime', kind: 'scalar', isList: false },
        ],
      },
    },
  };
}

function selfScopeDataModel() {
  return {
    models: {
      ServiceTask: {
        fields: [
          { name: 'amount', type: 'Decimal', kind: 'scalar', isList: false },
          { name: 'beauticianId', type: 'Int', kind: 'scalar', isList: false },
          { name: 'storeId', type: 'Int', kind: 'scalar', isList: false },
          { name: 'createdAt', type: 'DateTime', kind: 'scalar', isList: false },
        ],
      },
    },
  };
}
