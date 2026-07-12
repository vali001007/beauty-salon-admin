import { BrainManagerSkillsService } from './skills/brain-manager-skills.service.js';

describe('BrainManagerSkillsService revenue forecast baseline', () => {
  it('builds a transparent next-quarter baseline from the latest 90 calendar days', async () => {
    const asOf = new Date('2026-07-11T04:00:00.000Z');
    const settlements = Array.from({ length: 90 }, (_, index) => ({
      settleDate: new Date(Date.UTC(2026, 3, 12 + index)),
      totalRevenue: 100,
    }));
    const prisma = {
      dailySettlement: { findMany: jest.fn().mockResolvedValue(settlements) },
    };
    const service = new BrainManagerSkillsService(prisma as never);

    const result = await service.buildRevenueForecastBaseline({ storeId: 6, asOf });

    expect(result).toMatchObject({
      modelVersion: 'deterministic_daily_revenue_v1',
      sampleDays: 90,
      forecastDays: 92,
      averageDailyRevenue: 100,
      estimatedRevenue: 9200,
      confidence: 0.75,
    });
    expect(result.lowerBound).toBe(7360);
    expect(result.upperBound).toBe(11040);
  });
});
