import { MarketingEffectFactService } from './marketing-effect-fact.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('MarketingEffectFactService', () => {
  const prisma = {
    marketingEffectFact: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
  } as any;
  let service: MarketingEffectFactService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MarketingEffectFactService(prisma as PrismaService);
  });

  it('records facts idempotently by source event and fact type', async () => {
    prisma.marketingEffectFact.upsert.mockResolvedValue({ id: 1 });

    await service.recordFact({
      storeId: 6,
      factType: 'delivery',
      metricSource: 'actual',
      sourceSystem: 'marketing_delivery_worker',
      sourceEventId: 'job:91',
      countValue: 1,
      dimensions: { strategyId: 12, executionId: 90, channel: 'terminal' },
      occurredAt: new Date('2026-07-13T03:00:00.000Z'),
    });

    expect(prisma.marketingEffectFact.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        sourceSystem_sourceEventId_factType: {
          sourceSystem: 'marketing_delivery_worker',
          sourceEventId: 'job:91',
          factType: 'delivery',
        },
      },
      create: expect.objectContaining({ storeId: 6, countValue: 1, strategyId: 12, channel: 'terminal' }),
    }));
  });

  it('counts one attributed order once in summary while exposing the same fact in every dimension', async () => {
    prisma.marketingEffectFact.findMany.mockResolvedValue([
      {
        id: 1,
        factType: 'revenue',
        metricSource: 'actual',
        countValue: null,
        amountValue: 680,
        isPrimary: true,
        recommendationInstanceId: 'r1',
        activityId: 2,
        promotionId: 3,
        pageId: null,
        strategyId: null,
        channel: null,
      },
    ]);

    const result = await service.getUnifiedEffects(6, { objectType: 'all' });

    expect(result.summary.revenue).toEqual(expect.objectContaining({ value: 680, source: 'actual' }));
    expect(result.dimensions.recommendations[0].revenue.value).toBe(680);
    expect(result.dimensions.activities[0].revenue.value).toBe(680);
    expect(result.dimensions.promotions[0].revenue.value).toBe(680);
  });

  it('nets refund facts against revenue without mixing estimated cost into actual revenue', async () => {
    prisma.marketingEffectFact.findMany.mockResolvedValue([
      { id: 1, factType: 'revenue', metricSource: 'actual', amountValue: 680, countValue: null, isPrimary: true, strategyId: 12 },
      { id: 2, factType: 'revenue_refund', metricSource: 'actual', amountValue: -200, countValue: null, isPrimary: true, strategyId: 12 },
      { id: 3, factType: 'cost', metricSource: 'estimated', amountValue: 40, countValue: null, isPrimary: true, strategyId: 12 },
    ]);

    const result = await service.getUnifiedEffects(6, {});

    expect(result.summary.revenue).toEqual(expect.objectContaining({ value: 480, source: 'actual' }));
    expect(result.summary.cost).toEqual(expect.objectContaining({ value: 40, source: 'estimated' }));
    expect(result.summary.roi).toEqual(expect.objectContaining({ value: 12, source: 'estimated' }));
  });
});
