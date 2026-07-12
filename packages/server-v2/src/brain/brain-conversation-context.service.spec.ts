import { BrainConversationContextService } from './context/brain-conversation-context.service.js';
import { BrainTimeRangeParserService } from './cognition/brain-time-range-parser.service.js';

describe('BrainConversationContextService', () => {
  const prisma = {
    brainConversation: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new BrainConversationContextService(prisma as never, new BrainTimeRangeParserService());

  beforeEach(() => jest.clearAllMocks());

  it('inherits the previous metric and time range for an elliptical follow-up', async () => {
    prisma.brainConversation.findUnique.mockResolvedValue({
      contextSnapshot: {
        roleHint: 'finance',
        metrics: ['paid_revenue'],
        dimensions: [],
        entities: [],
        timeRange: {
          label: '本月',
          startDate: '2026-07-01T00:00:00.000Z',
          endDate: '2026-07-31T23:59:59.999Z',
          granularity: 'month',
        },
        updatedAt: '2026-07-11T00:00:00.000Z',
      },
    });

    const result = await service.prepareTurn({
      conversationId: 1,
      dto: { message: '再看呢', timezone: 'Asia/Shanghai' },
      cognition: {
        normalizedText: '再看呢',
        terms: [],
        metrics: [],
        dimensions: [],
        entities: [],
        unsupportedTerms: [],
        intent: { key: 'general_assistant', confidence: 0.55, reason: 'fallback' },
        needsClarification: false,
      },
      runtimeIntent: {
        intent: 'unknown',
        expectedShape: 'unknown',
        allowsScalarMetric: false,
        reason: 'no_supported_question_intent_detected',
      },
    });

    expect(result.cognition.metrics).toEqual(['paid_revenue']);
    expect(result.runtimeIntent).toMatchObject({ intent: 'scalar_metric', expectedMetric: 'paid_revenue' });
    expect(result.dto).toMatchObject({ roleHint: 'finance' });
    expect(result.dto.message).toContain('本月');
    expect(result.inheritedSlots).toEqual(expect.arrayContaining(['metrics', 'timeRange', 'roleHint']));
  });

  it('asks for clarification when a pronoun can refer to multiple prior entities', async () => {
    prisma.brainConversation.findUnique.mockResolvedValue({
      contextSnapshot: {
        metrics: [],
        dimensions: [],
        entities: [
          { slot: 'beautician', entityKey: 'beautician:1', label: '张丽' },
          { slot: 'beautician', entityKey: 'beautician:2', label: '张敏' },
        ],
        updatedAt: '2026-07-11T00:00:00.000Z',
      },
    });

    const result = await service.prepareTurn({
      conversationId: 1,
      dto: { message: '那个美容师怎么样', timezone: 'Asia/Shanghai' },
      cognition: {
        normalizedText: '那个美容师怎么样',
        terms: [],
        metrics: [],
        dimensions: [],
        entities: [],
        unsupportedTerms: [],
        intent: { key: 'general_assistant', confidence: 0.55, reason: 'fallback' },
        needsClarification: false,
      },
      runtimeIntent: {
        intent: 'unknown',
        expectedShape: 'unknown',
        allowsScalarMetric: false,
        reason: 'no_supported_question_intent_detected',
      },
    });

    expect(result.cognition.needsClarification).toBe(true);
    expect(result.cognition.clarification?.question).toContain('张丽');
    expect(result.cognition.clarification?.question).toContain('张敏');
  });

  it('persists a versioned context snapshot after each run', async () => {
    prisma.brainConversation.findFirst.mockResolvedValue({ contextSnapshot: null, contextVersion: 2 });
    prisma.brainConversation.update.mockResolvedValue({ id: 1, contextVersion: 3 });

    await service.updateAfterRun({
      conversationId: 1,
      runId: 8,
      userId: 9,
      storeId: 6,
      dto: { message: '本月流水多少', roleHint: 'finance', timezone: 'Asia/Shanghai' },
      cognition: {
        normalizedText: '本月流水多少',
        terms: [],
        metrics: ['paid_revenue'],
        dimensions: [],
        entities: [],
        unsupportedTerms: [],
        intent: { key: 'metric_query', confidence: 0.86, reason: 'metric' },
        needsClarification: false,
      },
    });

    expect(prisma.brainConversation.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ contextVersion: 3, contextSnapshot: expect.objectContaining({ metrics: ['paid_revenue'] }) }),
    });
  });
});
