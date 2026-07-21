import { BrainMarketingSkillsService } from './skills/brain-marketing-skills.service.js';

describe('BrainMarketingSkillsService follow-up priority', () => {
  it('uses the current opportunity pool and keeps the highest row per customer', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        customerId: 7,
        customerName: '王女士',
        opportunityType: 'dormant_winback',
        priority: 'P0',
        score: 92,
        updatedAt: new Date('2026-07-15T08:00:00.000Z'),
      },
      {
        customerId: 8,
        customerName: '李女士',
        opportunityType: 'browse_abandonment',
        priority: 'P0',
        score: 88,
        updatedAt: new Date('2026-07-15T07:00:00.000Z'),
      },
    ]);
    const service = new BrainMarketingSkillsService({ $queryRaw: queryRaw } as never);
    const asOf = new Date('2026-07-15T09:00:00.000Z');

    const rows = await service.buildFollowUpPriorityRows({ storeId: 6, asOf });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const query = queryRaw.mock.calls[0][0];
    expect(query.values).toEqual([6, asOf, asOf]);
    expect(query.strings.join('?')).toContain('ROW_NUMBER() OVER');
    expect(rows).toEqual([
      {
        customerId: 7,
        customerName: '王女士',
        score: 92,
        opportunityType: 'dormant_winback',
        priority: 'P0',
      },
      {
        customerId: 8,
        customerName: '李女士',
        score: 88,
        opportunityType: 'browse_abandonment',
        priority: 'P0',
      },
    ]);
  });

  it('reports when the opportunity scan reaches its controlled read limit', async () => {
    const rows = Array.from({ length: 5001 }, (_, index) => ({
      customerId: index + 1,
      customerName: `客户${index + 1}`,
      opportunityType: 'care_cycle_due',
      priority: 'P1',
      score: 80,
      updatedAt: new Date('2026-07-15T08:00:00.000Z'),
    }));
    const service = new BrainMarketingSkillsService({ $queryRaw: jest.fn().mockResolvedValue(rows) } as never);

    const snapshot = await service.buildFollowUpPrioritySnapshot({ storeId: 6, asOf: new Date('2026-07-15T09:00:00.000Z') });

    expect(snapshot).toMatchObject({ truncated: true, scannedOpportunityCount: 5000 });
    expect(snapshot.rows).toHaveLength(5000);
  });

  it('uses database aggregation for exact marketing totals instead of loading capped detail rows', async () => {
    const service = new BrainMarketingSkillsService({
      marketingAutomationTouch: {
        count: jest.fn().mockResolvedValueOnce(5001).mockResolvedValueOnce(1),
        groupBy: jest.fn()
          .mockResolvedValueOnce([{ channel: 'sms', _count: { _all: 5001 }, _sum: { actualRevenue: 100 } }])
          .mockResolvedValueOnce([{ channel: 'sms', _count: { _all: 1 } }]),
      },
      marketingAttribution: { groupBy: jest.fn().mockResolvedValue([]) },
      marketingAutomationStrategy: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);

    const analytics = await service.buildMarketingAnalytics({
      storeId: 6,
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
    });

    expect(analytics.reachedCount).toBe(5001);
    expect(analytics.convertedCount).toBe(1);
    expect(analytics.channels).toEqual([{ channel: 'sms', reached: 5001, converted: 1, revenue: 100, conversionRate: 1 / 5001 }]);
    expect(analytics.dataCoverage).toEqual({
      touchesTruncated: false,
      attributionsTruncated: false,
      strategiesTruncated: false,
      touchSampleSize: 5001,
      attributionSampleSize: 0,
    });
  });
});
