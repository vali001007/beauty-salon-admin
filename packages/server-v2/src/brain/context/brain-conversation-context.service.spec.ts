import { BrainConversationContextService } from './brain-conversation-context.service.js';

const sha = (character: string) => character.repeat(64);

const entityRef = {
  definitionType: 'entity' as const,
  definitionKey: 'entity.customer',
  definitionVersion: 2,
  definitionFingerprint: sha('a'),
  sourceFingerprint: sha('b'),
};

const metricRef = {
  definitionType: 'metric' as const,
  definitionKey: 'metric.product_sales_quantity',
  definitionVersion: 3,
  definitionFingerprint: sha('c'),
  sourceFingerprint: sha('d'),
};

const productionSnapshot = {
  productionReady: true as const,
  fingerprint: sha('e'),
  entities: [
    {
      definitionKey: entityRef.definitionKey,
      version: entityRef.definitionVersion,
      definitionFingerprint: entityRef.definitionFingerprint,
      sourceFingerprint: entityRef.sourceFingerprint,
      domain: 'customer',
      entityKey: 'customer',
      name: '客户',
      aliases: ['客户'],
      attributes: {},
      tableMap: {},
    },
  ],
  relations: [],
  metrics: [
    {
      definitionKey: metricRef.definitionKey,
      version: metricRef.definitionVersion,
      definitionFingerprint: metricRef.definitionFingerprint,
      sourceFingerprint: metricRef.sourceFingerprint,
      metricKey: 'product_sales_quantity',
      name: '商品销量',
      domain: 'sales',
      formula: {},
      source: {},
      defaultFilters: [],
      permissions: [],
      description: '商品销量',
    },
  ],
  dimensions: [],
};

const validModelSnapshot = () => ({
  version: 1,
  objective: '查询本月商品销售排行',
  definitionRefs: [metricRef],
  metrics: [metricRef],
  dimensions: [],
  entities: [
    {
      entityType: 'customer',
      entityKey: 'customer:1',
      mention: '李女士',
      source: 'user',
      confidence: 1,
      definitionRef: entityRef,
    },
  ],
  intent: 'ranking',
  answerShape: 'ranking',
  capability: { key: 'product_sales_ranking', version: 2 },
  timeRange: {
    label: '本月',
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    timezone: 'Asia/Shanghai',
  },
  updatedFromRunId: 77,
  updatedAt: '2026-07-13T00:00:00.000Z',
});

describe('BrainConversationContextService model conversation preparation', () => {
  const createService = (contextSnapshot: unknown) => {
    const prisma = {
      brainConversation: {
        findUnique: jest.fn().mockResolvedValue({ contextSnapshot }),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    const timeRangeParser = { parse: jest.fn() };
    return {
      prisma,
      timeRangeParser,
      service: new BrainConversationContextService(prisma as never, timeRangeParser as never),
    };
  };

  it('keeps the current model question unchanged and exposes only a structurally valid snapshot', async () => {
    const { prisma, service } = createService({
      roleHint: 'finance',
      metrics: ['paid_revenue'],
      model: validModelSnapshot(),
    });

    const prepared = await service.prepareModelTurn({
      conversationId: 12,
      dto: { message: '这个月呢', roleHint: 'receptionist' },
      snapshot: productionSnapshot as never,
    } as never);

    expect(prisma.brainConversation.findUnique).toHaveBeenCalledWith({
      where: { id: 12 },
      select: { contextSnapshot: true },
    });
    expect(prepared.dto.message).toBe('这个月呢');
    expect(prepared.dto.roleHint).toBe('receptionist');
    expect(prepared.previous).toMatchObject({
      version: 1,
      intent: 'ranking',
      answerShape: 'ranking',
      entities: [expect.objectContaining({ mention: '李女士' })],
    });
    expect(prepared.previous).not.toHaveProperty('roleHint');
    expect(prepared.previous).toMatchObject({ metrics: [metricRef] });
  });

  it('replaces the previous time range while inheriting the business object and metric for follow-up questions', async () => {
    const { service, timeRangeParser } = createService({ model: validModelSnapshot() });
    timeRangeParser.parse.mockReturnValue({
      mentionedTime: true,
      range: {
        label: '上月',
        startDate: new Date('2026-05-31T16:00:00.000Z'),
        endDate: new Date('2026-06-30T15:59:59.999Z'),
        granularity: 'month',
      },
      filters: [],
      requiresComparison: false,
      unsupportedExpressions: [],
    });

    const prepared = await service.prepareModelTurn({
      conversationId: 12,
      dto: { message: '那上个月呢', timezone: 'Asia/Shanghai' },
      snapshot: productionSnapshot as never,
    });

    expect(prepared.previous).toMatchObject({
      objective: '查询本月商品销售排行',
      metrics: [metricRef],
      capability: { key: 'product_sales_ranking', version: 2 },
    });
    expect(prepared.directives).toMatchObject({
      inherit: ['objective', 'entities', 'metrics', 'dimensions', 'capability'],
      replace: {
        timeRange: {
          label: '上月',
          startDate: '2026-06-01',
          endDate: '2026-06-30',
          timezone: 'Asia/Shanghai',
        },
      },
    });
  });

  it('records explicit entity corrections and prevents the previous entity from being inherited', async () => {
    const { service, timeRangeParser } = createService({ model: validModelSnapshot() });
    timeRangeParser.parse.mockReturnValue({ mentionedTime: false, filters: [], requiresComparison: false, unsupportedExpressions: [] });

    const prepared = await service.prepareModelTurn({
      conversationId: 12,
      dto: { message: '不是员工，是商品' },
      snapshot: productionSnapshot as never,
    });

    expect(prepared.directives).toMatchObject({
      doNotInherit: ['entities', 'objective'],
      corrections: [{ slot: 'entities', previous: '员工', next: '商品' }],
    });
  });

  it('treats the next turn as pending-slot resolution without relying on continuation wording', async () => {
    const model = {
      ...validModelSnapshot(),
      pendingClarification: {
        missingSlots: ['timeRange'],
        questions: ['请补充时间范围'],
        ambiguities: [],
      },
    };
    const { service, timeRangeParser } = createService({ model });
    timeRangeParser.parse.mockReturnValue({
      mentionedTime: true,
      range: {
        label: '本月',
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        endDate: new Date('2026-07-17T00:00:00.000Z'),
        granularity: 'month',
      },
      filters: [],
      requiresComparison: false,
      unsupportedExpressions: [],
    });

    const prepared = await service.prepareModelTurn({
      conversationId: 12,
      dto: { message: '本月', timezone: 'Asia/Shanghai' },
      snapshot: productionSnapshot as never,
    });

    expect(prepared.directives).toMatchObject({
      mode: 'resolve_pending_or_new',
      pendingSlots: ['timeRange'],
      pendingQuestion: '请补充时间范围',
      inherit: ['objective', 'entities', 'metrics', 'dimensions', 'capability'],
      replace: { timeRange: expect.objectContaining({ label: '本月' }) },
    });
  });

  it('resolves a pending comparison target without replacing the inherited current period', async () => {
    const model = {
      ...validModelSnapshot(),
      pendingClarification: {
        missingSlots: ['comparisonTarget'],
        questions: ['请补充对比周期'],
        ambiguities: [],
      },
    };
    const { service, timeRangeParser } = createService({ model });
    timeRangeParser.parse.mockReturnValue({
      mentionedTime: true,
      range: {
        label: '上月',
        startDate: new Date('2026-05-31T16:00:00.000Z'),
        endDate: new Date('2026-06-30T15:59:59.999Z'),
        granularity: 'month',
      },
      filters: [],
      requiresComparison: false,
      unsupportedExpressions: [],
    });

    const prepared = await service.prepareModelTurn({
      conversationId: 12,
      dto: { message: '上个月', timezone: 'Asia/Shanghai' },
      snapshot: productionSnapshot as never,
    });

    expect(prepared.directives).toMatchObject({
      mode: 'resolve_pending_or_new',
      pendingSlots: ['comparisonTarget'],
      inherit: expect.arrayContaining(['objective', 'metrics', 'timeRange']),
      resolve: { comparisonTarget: expect.objectContaining({ label: '上月' }) },
    });
    expect(prepared.directives?.resolve?.comparisonTarget).toMatchObject({
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    expect(prepared.directives).not.toHaveProperty('replace');
  });

  it('drops forged model snapshots with identity fields instead of attempting model-side inheritance', async () => {
    const { service } = createService({
      model: {
        ...validModelSnapshot(),
        definitionRefs: [{ ...metricRef, storeId: 2 }],
      },
    });

    await expect(
      service.prepareModelTurn({
        conversationId: 12,
        dto: { message: '继续' },
        snapshot: productionSnapshot as never,
      } as never),
    ).resolves.toMatchObject({
      dto: { message: '继续' },
      rejectionCode: 'MODEL_CONTEXT_INVALID',
    });
  });

  it('rejects model snapshots with unsupported intent or answer shape values', async () => {
    const { service } = createService({
      model: {
        version: 1,
        definitionRefs: [],
        entities: [],
        intent: 'metric_query',
        answerShape: 'non_metric',
        updatedFromRunId: 77,
        updatedAt: '2026-07-13T00:00:00.000Z',
      },
    });

    await expect(
      service.prepareModelTurn({ conversationId: 12, dto: { message: '继续' } }),
    ).resolves.toEqual({ dto: { message: '继续' }, rejectionCode: 'MODEL_CONTEXT_INVALID' });
  });

  it('drops stale model context when any published definition binding no longer matches', async () => {
    const { service } = createService({
      model: {
        ...validModelSnapshot(),
        definitionRefs: [{ ...metricRef, definitionVersion: 4 }],
      },
    });

    await expect(
      service.prepareModelTurn({
        conversationId: 12,
        dto: { message: '继续' },
        snapshot: productionSnapshot as never,
      } as never),
    ).resolves.toMatchObject({ rejectionCode: 'MODEL_CONTEXT_STALE' });
  });

  it('drops historical field references because the production snapshot cannot bind them', async () => {
    const { service } = createService({
      model: {
        ...validModelSnapshot(),
        definitionRefs: [
          {
            definitionType: 'field',
            definitionKey: 'field.customer.phone',
            definitionVersion: 1,
            definitionFingerprint: sha('f'),
            sourceFingerprint: sha('0'),
          },
        ],
      },
    });

    await expect(
      service.prepareModelTurn({
        conversationId: 12,
        dto: { message: '继续' },
        snapshot: productionSnapshot as never,
      } as never),
    ).resolves.toMatchObject({ rejectionCode: 'MODEL_CONTEXT_STALE' });
  });

  it('keeps a fully matched model snapshot with strict dates and published definition bindings', async () => {
    const { service } = createService({ model: validModelSnapshot() });

    await expect(
      service.prepareModelTurn({
        conversationId: 12,
        dto: { message: '继续' },
        snapshot: productionSnapshot as never,
      } as never),
    ).resolves.toMatchObject({
      previous: expect.objectContaining({
        definitionRefs: [metricRef],
        entities: [expect.objectContaining({ definitionRef: entityRef })],
      }),
    });
  });

  it('writes only a versioned model context from a validator-accepted semantic intent', async () => {
    const { prisma, service } = createService({ metrics: ['paid_revenue'], roleHint: 'finance' });
    prisma.brainConversation.findFirst.mockResolvedValue({
      contextSnapshot: { metrics: ['paid_revenue'], roleHint: 'finance' },
      contextVersion: 3,
    });
    prisma.brainConversation.update.mockResolvedValue({ id: 12 });
    const metricRef = {
      definitionType: 'metric' as const,
      definitionKey: 'metric.paid_revenue',
      definitionVersion: 2,
      definitionFingerprint: 'metric-fingerprint',
      sourceFingerprint: 'metric-source',
    };

    await service.updateAfterModelRun({
      conversationId: 12,
      runId: 77,
      userId: 9,
      storeId: 2,
      intent: {
        schemaVersion: '1.0',
        objective: '查询本月实收',
        domains: ['sales'],
        intent: 'ranking',
        entities: [
          {
            entityType: 'customer',
            entityKey: 'customer_1',
            mention: '李女士',
            source: 'user',
            confidence: 1,
          },
        ],
        metrics: [metricRef],
        dimensions: [],
        filters: [],
        timeRange: {
          label: '本月',
          startDate: '2026-07-01T00:00:00.000Z',
          endDate: '2026-07-31T23:59:59.999Z',
          timezone: 'Asia/Shanghai',
        },
        orderBy: [],
        answerShape: 'ranking',
        successCriteria: ['返回排名'],
        ambiguities: [],
        missingSlots: [],
        assumptions: [],
        confidence: 0.95,
        decisionSummary: '本月实收排行',
      },
      capability: { key: 'product_sales_ranking', version: 2 },
      corrections: [{ slot: 'entities', previous: '员工', next: '商品' }],
      pendingClarification: {
        missingSlots: ['timeRange'],
        questions: ['请补充时间范围'],
        ambiguities: [],
      },
    });

    expect(prisma.brainConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 12 },
        data: expect.objectContaining({
          contextVersion: 4,
          contextSnapshot: expect.objectContaining({
            model: expect.objectContaining({
              version: 1,
              intent: 'ranking',
              answerShape: 'ranking',
              definitionRefs: [metricRef],
              objective: '查询本月实收',
              metrics: [metricRef],
              capability: { key: 'product_sales_ranking', version: 2 },
              lastCorrections: [{ slot: 'entities', previous: '员工', next: '商品' }],
              pendingClarification: {
                missingSlots: ['timeRange'],
                questions: ['请补充时间范围'],
                ambiguities: [],
              },
              entities: [expect.objectContaining({ mention: '李女士' })],
            }),
          }),
        }),
      }),
    );
  });

  it('preserves the model context slot when a rules turn updates legacy context', async () => {
    const model = {
      version: 1,
      definitionRefs: [],
      entities: [],
      intent: 'ranking',
      answerShape: 'ranking',
      updatedFromRunId: 77,
      updatedAt: '2026-07-13T00:00:00.000Z',
    };
    const { prisma, timeRangeParser, service } = createService({ metrics: ['paid_revenue'], model });
    timeRangeParser.parse.mockReturnValue({ mentionedTime: false, filters: [], requiresComparison: false, unsupportedExpressions: [] });
    prisma.brainConversation.findFirst.mockResolvedValue({
      contextSnapshot: { metrics: ['paid_revenue'], model },
      contextVersion: 4,
    });
    prisma.brainConversation.update.mockResolvedValue({ id: 12 });
    const cognition = {
      normalizedText: '今天预约多少',
      terms: [],
      metrics: ['appointment_count'],
      dimensions: [],
      entities: [],
      unsupportedTerms: [],
      intent: { key: 'metric_query', confidence: 0.9, reason: 'test' },
      needsClarification: false,
    };

    await service.updateAfterRun({
      conversationId: 12,
      runId: 78,
      userId: 9,
      storeId: 2,
      dto: { message: '今天预约多少' },
      cognition: cognition as any,
    });

    expect(prisma.brainConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contextSnapshot: expect.objectContaining({
            model: expect.objectContaining({
              version: 1,
              intent: 'ranking',
              answerShape: 'ranking',
              updatedFromRunId: 77,
            }),
          }),
        }),
      }),
    );
  });
});
