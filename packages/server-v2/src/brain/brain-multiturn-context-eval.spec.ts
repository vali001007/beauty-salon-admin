import { BrainTimeRangeParserService } from './cognition/brain-time-range-parser.service.js';
import { BrainConversationContextService } from './context/brain-conversation-context.service.js';

describe('Brain multi-turn context evaluation gate', () => {
  const metrics = ['paid_revenue', 'gross_margin_rate', 'appointment_count', 'repurchase_rate', 'card_liability'];
  const followUps = ['再看呢', '继续呢', '那这个呢', '接着看呢', '刚才那个呢', '还是这个呢'];
  const inheritanceCases = Array.from({ length: 90 }, (_, index) => ({
    metric: metrics[index % metrics.length],
    message: followUps[index % followUps.length],
    roleHint: index % 2 === 0 ? 'finance' : 'store_manager',
  }));
  const ambiguityCases = Array.from({ length: 10 }, (_, index) => ({ index, message: index % 2 ? '那个美容师呢' : '这个美容师怎么样' }));

  it.each(inheritanceCases)('inherits metric, time and role: %#', async ({ metric, message, roleHint }) => {
    const prisma = {
      brainConversation: {
        findUnique: jest.fn().mockResolvedValue({
          contextSnapshot: {
            roleHint,
            metrics: [metric],
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
        }),
      },
    };
    const service = new BrainConversationContextService(prisma as never, new BrainTimeRangeParserService());
    const result = await service.prepareTurn({
      conversationId: 1,
      dto: { message, timezone: 'Asia/Shanghai' },
      cognition: {
        normalizedText: message,
        terms: [],
        metrics: [],
        dimensions: [],
        entities: [],
        unsupportedTerms: [],
        intent: { key: 'general_assistant', confidence: 0.55, reason: 'fallback' },
        needsClarification: false,
      },
      runtimeIntent: { intent: 'unknown', expectedShape: 'unknown', allowsScalarMetric: false, reason: 'fallback' },
    });

    expect(result.cognition.metrics).toEqual([metric]);
    expect(result.dto.roleHint).toBe(roleHint);
    expect(result.dto.message).toContain('本月');
  });

  it.each(ambiguityCases)('clarifies ambiguous entity reference: %#', async ({ message }) => {
    const prisma = {
      brainConversation: {
        findUnique: jest.fn().mockResolvedValue({
          contextSnapshot: {
            metrics: [],
            dimensions: [],
            entities: [
              { slot: 'beautician', entityKey: 'beautician:1', label: '张丽' },
              { slot: 'beautician', entityKey: 'beautician:2', label: '张敏' },
            ],
            updatedAt: '2026-07-11T00:00:00.000Z',
          },
        }),
      },
    };
    const service = new BrainConversationContextService(prisma as never, new BrainTimeRangeParserService());
    const result = await service.prepareTurn({
      conversationId: 1,
      dto: { message, timezone: 'Asia/Shanghai' },
      cognition: {
        normalizedText: message,
        terms: [],
        metrics: [],
        dimensions: [],
        entities: [],
        unsupportedTerms: [],
        intent: { key: 'general_assistant', confidence: 0.55, reason: 'fallback' },
        needsClarification: false,
      },
      runtimeIntent: { intent: 'unknown', expectedShape: 'unknown', allowsScalarMetric: false, reason: 'fallback' },
    });

    expect(result.cognition.needsClarification).toBe(true);
    expect(result.cognition.clarification?.options).toHaveLength(2);
  });
});
