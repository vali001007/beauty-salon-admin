import { MarketingAudienceService } from './marketing-audience.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('MarketingAudienceService', () => {
  const prisma = {
    customer: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    predictionRun: {
      findFirst: jest.fn(),
    },
    customerPredictionSnapshot: {
      findMany: jest.fn(),
    },
    marketingRecommendationAudienceMember: {
      findMany: jest.fn(),
    },
    marketingAutomationTouch: {
      findMany: jest.fn(),
    },
  } as any;

  let service: MarketingAudienceService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.customer.count.mockResolvedValue(1);
    prisma.predictionRun.findFirst.mockResolvedValue({ id: 53, finishedAt: new Date('2026-07-13T02:00:00.000Z') });
    prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
      {
        id: 71,
        customerId: 11,
        storeId: 6,
        marketingResponseScore: 82,
        repurchase30dScore: 70,
        churnScore: 40,
        ltv6m: 1200,
        ltvTier: '黄金',
        featureJson: {},
        reasonJson: ['营销响应高'],
        customer: { id: 11, storeId: 6, deletedAt: null, totalSpent: 3000, memberLevel: '金卡会员', store: { id: 6, name: '六店' } },
      },
    ]);
    prisma.marketingRecommendationAudienceMember.findMany.mockResolvedValue([]);
    prisma.marketingAutomationTouch.findMany.mockResolvedValue([]);
  });

  it('queries customers, predictions and touch fatigue only inside the strategy store', async () => {
    service = new MarketingAudienceService(prisma as PrismaService);

    const result = await service.buildForStrategy({
      id: 12,
      storeId: 6,
      triggerRules: [],
      ruleRelation: 'AND',
      actions: [{ channel: 'terminal' }],
    } as any);

    expect(prisma.customer.count).toHaveBeenCalledWith({ where: { storeId: 6, deletedAt: null } });
    expect(prisma.predictionRun.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 6, status: 'completed' }),
    }));
    expect(prisma.customerPredictionSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ runId: 53, storeId: 6, customer: { storeId: 6, deletedAt: null } }),
    }));
    expect(prisma.marketingAutomationTouch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        customerId: { in: [11] },
        execution: { storeId: 6 },
      }),
    }));
    expect(result.customers.map((item) => item.id)).toEqual([11]);
    expect(result.source).toEqual(expect.objectContaining({
      predictionRunId: 53,
      eligibleCustomerCount: 1,
      frequencyCapFilteredCount: 0,
    }));
  });

  it('uses a persisted recommendation audience only within the same store', async () => {
    prisma.marketingRecommendationAudienceMember.findMany.mockResolvedValue([
      {
        customerId: 21,
        predictionData: { predictionSnapshotId: 81, marketingResponseScore: 76, ltv6m: 900 },
        reasonJson: ['推荐实例受众'],
        customer: { id: 21, storeId: 6, deletedAt: null, totalSpent: 1800, store: { id: 6, name: '六店' } },
      },
    ]);
    service = new MarketingAudienceService(prisma as PrismaService);

    const result = await service.buildForStrategy({
      id: 12,
      storeId: 6,
      audienceSnapshotId: 'audience-1',
      predictionRunId: 53,
      triggerRules: [],
      ruleRelation: 'AND',
      actions: [],
    } as any);

    expect(prisma.marketingRecommendationAudienceMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { snapshotId: 'audience-1', storeId: 6, customer: { storeId: 6, deletedAt: null } },
    }));
    expect(prisma.customerPredictionSnapshot.findMany).not.toHaveBeenCalled();
    expect(result.customers.map((item) => item.id)).toEqual([21]);
    expect(result.source.predictionRunId).toBe(53);
  });

  it('filters recently touched customers and reports the excluded count', async () => {
    prisma.marketingAutomationTouch.findMany.mockResolvedValue([{ customerId: 11 }]);
    service = new MarketingAudienceService(prisma as PrismaService);

    const result = await service.buildForStrategy({
      id: 12,
      storeId: 6,
      triggerRules: [],
      ruleRelation: 'AND',
      actions: [{ channel: 'terminal' }],
    } as any);

    expect(result.customers).toEqual([]);
    expect(result.source.eligibleCustomerCount).toBe(0);
    expect(result.source.frequencyCapFilteredCount).toBe(1);
  });
});
