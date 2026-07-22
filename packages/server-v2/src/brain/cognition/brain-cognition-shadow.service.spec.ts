import type { BrainCognitionResult } from './brain-cognition.service.js';
import { BrainCognitionShadowService } from './brain-cognition-shadow.service.js';
import type { ProductionReadyBusinessDefinitionSnapshot } from './business-definition-snapshot.types.js';

describe('BrainCognitionShadowService', () => {
  const snapshot = {
    productionReady: true,
    fingerprint: 'snapshot-v1',
    entities: [
      {
        definitionKey: 'entity.product.v1',
        version: 1,
        definitionFingerprint: 'entity-product-definition-fp',
        sourceFingerprint: 'entity-product-fp',
        domain: 'inventory_procurement',
        entityKey: 'product',
        name: '商品',
        aliases: ['产品'],
        attributes: {},
        tableMap: {},
      },
    ],
    relations: [],
    metrics: [
      {
        definitionKey: 'metric.product_sales.v1',
        version: 3,
        definitionFingerprint: 'metric-product-sales-definition-fp',
        sourceFingerprint: 'metric-product-sales-fp',
        metricKey: 'product_sales_quantity',
        name: '商品销量',
        domain: 'inventory_procurement',
        formula: {},
        source: {},
        defaultFilters: {},
        permissions: [],
        description: '商品销售数量',
      },
    ],
    dimensions: [
      {
        definitionKey: 'dimension.product.v1',
        version: 2,
        definitionFingerprint: 'dimension-product-definition-fp',
        sourceFingerprint: 'dimension-product-fp',
        dimensionKey: 'product',
        name: '商品',
        domain: 'inventory_procurement',
        source: {},
        permissions: [],
      },
    ],
  } satisfies ProductionReadyBusinessDefinitionSnapshot;

  const rulesCognition: BrainCognitionResult = {
    normalizedText: '本月商品销售排行',
    terms: [],
    metrics: ['paid_revenue'],
    dimensions: ['date'],
    entities: [],
    unsupportedTerms: [],
    intent: { key: 'metric_query', confidence: 0.86, reason: 'known_metric' },
    needsClarification: false,
  };

  const modelIntent = {
    schemaVersion: '1.0' as const,
    objective: '返回本月商品销量排行',
    domains: ['inventory_procurement'],
    intent: 'ranking' as const,
    entities: [
      {
        entityType: 'product',
        mention: '商品',
        source: 'user' as const,
        definitionRef: {
          definitionType: 'entity' as const,
          definitionKey: 'entity.product.v1',
          definitionVersion: 1,
          definitionFingerprint: 'entity-product-definition-fp',
          sourceFingerprint: 'entity-product-fp',
        },
        confidence: 0.96,
      },
    ],
    metrics: [
      {
        definitionType: 'metric' as const,
        definitionKey: 'metric.product_sales.v1',
        definitionVersion: 3,
        definitionFingerprint: 'metric-product-sales-definition-fp',
        sourceFingerprint: 'metric-product-sales-fp',
      },
    ],
    dimensions: [
      {
        definitionType: 'dimension' as const,
        definitionKey: 'dimension.product.v1',
        definitionVersion: 2,
        definitionFingerprint: 'dimension-product-definition-fp',
        sourceFingerprint: 'dimension-product-fp',
      },
    ],
    filters: [],
    timeRange: { preset: 'this_month', label: '本月', timezone: 'Asia/Shanghai' as const },
    orderBy: [],
    limit: 10,
    answerShape: 'ranking' as const,
    successCriteria: ['返回商品排名和销量'],
    ambiguities: [],
    missingSlots: [],
    assumptions: [],
    confidence: 0.94,
    decisionSummary: '商品销量排行',
  };

  function createService(
    options: {
      mode?: 'rules' | 'shadow' | 'model';
      inShadow?: boolean;
      compile?: jest.Mock;
      validate?: jest.Mock;
      recordStep?: jest.Mock;
    } = {},
  ) {
    const compiler = {
      compile:
        options.compile ??
        jest.fn().mockResolvedValue({
          status: 'completed',
          intent: modelIntent,
          provider: 'mock',
          model: 'mock-model',
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        }),
    };
    const validator = {
      validate:
        options.validate ??
        jest.fn(() => ({ status: 'valid', intent: modelIntent, snapshotFingerprint: snapshot.fingerprint })),
    };
    const ontologyRuntime = { getSnapshot: jest.fn(() => snapshot) };
    const trace = { recordStep: options.recordStep ?? jest.fn().mockResolvedValue({ id: 1 }) };
    const config = {
      runtime: { cognitionMode: options.mode ?? 'shadow' },
      isInShadow: jest.fn(() => options.inShadow ?? true),
    };
    const service = new BrainCognitionShadowService(
      config as never,
      compiler as never,
      validator as never,
      ontologyRuntime as never,
      trace as never,
    );
    return { service, compiler, validator, ontologyRuntime, trace, config };
  }

  function observeInput() {
    return {
      runId: 77,
      requestId: 'req-shadow-77',
      userId: 9,
      storeId: 2,
      question: '本月商品销售排行',
      timezone: 'Asia/Shanghai' as const,
      role: 'inventory' as const,
      conversationSlots: { timeRange: { label: '本月' } },
      rules: {
        cognition: rulesCognition,
        routePlan: {
          role: 'inventory' as const,
          domain: 'inventory_procurement' as const,
          intent: 'ranking' as const,
          answerShape: 'ranking' as const,
          adapterKey: 'inventory_procurement' as const,
          requiredPermissions: [],
          confidence: 0.91,
          grounding: 'db_skill' as const,
          reason: 'rules_ranking',
        },
      },
    };
  }

  it('does not call the model in rules mode or outside the stable shadow bucket', async () => {
    const rules = createService({ mode: 'rules' });
    const rulesObservation = rules.service.observe(observeInput());
    await expect(rulesObservation.completion).resolves.toBeUndefined();
    expect(rulesObservation.scheduled).toBe(false);
    expect(rules.compiler.compile).not.toHaveBeenCalled();

    const outsideBucket = createService({ mode: 'shadow', inShadow: false });
    const bucketObservation = outsideBucket.service.observe(observeInput());
    await expect(bucketObservation.completion).resolves.toBeUndefined();
    expect(bucketObservation.scheduled).toBe(false);
    expect(outsideBucket.config.isInShadow).toHaveBeenCalledWith('req-shadow-77');
    expect(outsideBucket.compiler.compile).not.toHaveBeenCalled();
  });

  it('defers shadow compilation to a microtask and sends governed model input', async () => {
    const { service, compiler } = createService();

    const observation = service.observe(observeInput());

    expect(observation.scheduled).toBe(true);
    expect(compiler.compile).not.toHaveBeenCalled();
    expect(service.getInFlightCount()).toBe(1);

    await expect(observation.completion).resolves.toBeUndefined();
    expect(service.getInFlightCount()).toBe(0);
    expect(compiler.compile).toHaveBeenCalledWith(
      expect.objectContaining({
        question: '本月商品销售排行',
        audit: { userId: 9, storeId: 2 },
        timezone: 'Asia/Shanghai',
        role: 'inventory',
        ontologySnapshot: snapshot,
        metricRefs: [
          {
            definitionType: 'metric',
            definitionKey: 'metric.product_sales.v1',
            definitionVersion: 3,
            definitionFingerprint: 'metric-product-sales-definition-fp',
            sourceFingerprint: 'metric-product-sales-fp',
          },
        ],
        dimensionRefs: [
          {
            definitionType: 'dimension',
            definitionKey: 'dimension.product.v1',
            definitionVersion: 2,
            definitionFingerprint: 'dimension-product-definition-fp',
            sourceFingerprint: 'dimension-product-fp',
          },
        ],
        capabilitySummaries: [],
        conversationSlots: expect.objectContaining({
          timeRange: { label: '本月' },
          metadata: { catalogPhase: 'p11_not_available' },
        }),
      }),
    );
  });

  it('records model cognition and a logical-key diff without changing completion semantics', async () => {
    const { service, trace } = createService();

    await expect(service.observe(observeInput()).completion).resolves.toBeUndefined();

    expect(trace.recordStep).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 77,
        stepKey: 'cognition_model',
        layer: 'cognition',
        status: 'completed',
        output: expect.objectContaining({
          domain: ['inventory_procurement'],
          intent: 'ranking',
          metric: ['product_sales_quantity'],
          dimension: ['product'],
          entity: ['product'],
          time: expect.objectContaining({ preset: 'this_month' }),
          answerShape: 'ranking',
          confidence: 0.94,
        }),
      }),
    );
    expect(trace.recordStep).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 77,
        stepKey: 'cognition_diff',
        layer: 'cognition',
        status: 'completed',
        output: expect.objectContaining({
          domain: expect.objectContaining({ model: ['inventory_procurement'] }),
          intent: expect.objectContaining({ model: 'ranking' }),
          metric: expect.objectContaining({ model: ['product_sales_quantity'] }),
          dimension: expect.objectContaining({ model: ['product'] }),
          entity: expect.objectContaining({ model: ['product'] }),
          time: expect.objectContaining({ model: expect.objectContaining({ preset: 'this_month' }) }),
          answerShape: expect.objectContaining({ model: 'ranking' }),
          confidence: expect.objectContaining({ model: 0.94 }),
        }),
      }),
    );
  });

  it('never rejects completion and still attempts cognition_diff after compiler, clarification or trace failures', async () => {
    const compilerFailure = createService({
      compile: jest.fn().mockRejectedValue(new Error('provider down')),
    });
    await expect(compilerFailure.service.observe(observeInput()).completion).resolves.toBeUndefined();
    expect(compilerFailure.trace.recordStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepKey: 'cognition_diff' }),
    );

    const clarification = createService({
      validate: jest.fn(() => ({
        status: 'clarification_required',
        intent: modelIntent,
        snapshotFingerprint: snapshot.fingerprint,
        issues: [{ code: 'MISSING_REQUIRED_SLOT', message: 'missing customer', slot: 'customer' }],
        clarification: { questions: ['请确认客户'], missingSlots: ['customer'], ambiguities: [] },
      })),
    });
    await expect(clarification.service.observe(observeInput()).completion).resolves.toBeUndefined();
    expect(clarification.trace.recordStep).toHaveBeenCalledWith(expect.objectContaining({ stepKey: 'cognition_diff' }));

    const traceFailure = createService({
      recordStep: jest.fn().mockRejectedValueOnce(new Error('trace down')).mockResolvedValue({ id: 2 }),
    });
    await expect(traceFailure.service.observe(observeInput()).completion).resolves.toBeUndefined();
    expect(traceFailure.trace.recordStep).toHaveBeenCalledTimes(2);
    expect(traceFailure.trace.recordStep).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ stepKey: 'cognition_diff' }),
    );
  });

  it('permits model mode startup because Task 12 owns the primary model path', () => {
    const { service } = createService({ mode: 'model' });

    expect(() => service.onModuleInit()).not.toThrow();
  });
});
