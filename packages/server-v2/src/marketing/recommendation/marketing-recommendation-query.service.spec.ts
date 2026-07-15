import { NotFoundException } from '@nestjs/common';
import { MarketingRecommendationQueryService } from './marketing-recommendation-query.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('MarketingRecommendationQueryService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    marketingRecommendationInstance: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    marketingRecommendationAudienceMember: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    customer: { count: jest.fn() },
    predictionRun: { findFirst: jest.fn() },
    customerPredictionSnapshot: { count: jest.fn() },
  } as any;
  let service: MarketingRecommendationQueryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MarketingRecommendationQueryService(prisma as PrismaService);
  });

  it('returns not found when an instance belongs to another store', async () => {
    prisma.marketingRecommendationInstance.findFirst.mockResolvedValue(null);

    await expect(service.getById('instance-1', 7)).rejects.toThrow(NotFoundException);

    expect(prisma.marketingRecommendationInstance.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'instance-1', storeId: 7 },
      }),
    );
  });

  it('returns prediction coverage separately from recommendation target count', async () => {
    const generatedAt = new Date('2026-07-13T02:00:00.000Z');
    prisma.marketingRecommendationInstance.findMany.mockResolvedValue([
      {
        id: 'instance-1',
        targetCount: 1,
        generatedAt,
        expiresAt: new Date('2026-07-14T02:00:00.000Z'),
        audienceSnapshot: { id: 'audience-1', customerCount: 1, generatedAt, ruleJson: {} },
        offerSnapshot: null,
      },
    ]);
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          totalCustomers: 1252,
          predictedCustomers: 1244,
          predictionRunId: 55,
          generatedAt,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 71,
          recommendationInstanceId: 'instance-1',
          mode: 'terminal_follow_up',
          status: 'dispatched',
          activityId: null,
          pageId: null,
          strategyId: null,
          followUpTaskIds: [501],
          createdAt: new Date('2026-07-13T02:30:00.000Z'),
        },
      ]);
    prisma.marketingRecommendationInstance.count.mockResolvedValue(1);

    const response = await service.findMany(6, { page: 1, pageSize: 20 }, new Date('2026-07-13T03:00:00.000Z'));

    expect(response.coverage.totalCustomers).toBe(1252);
    expect(response.coverage.predictedCustomers).toBe(1244);
    expect(response.coverage.coverageRate).toBe(99.36);
    expect(response.coverage.freshness).toBe('fresh');
    expect(response.items[0].targetCount).toBe(1);
    expect(response.items[0].executionState.terminalFollowUp).toEqual(expect.objectContaining({ id: 71 }));
    expect(prisma.marketingRecommendationInstance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          audienceSnapshot: true,
          offerSnapshot: true,
        },
      }),
    );
    expect(prisma.$queryRaw.mock.calls[0]?.[0]?.strings?.join('')).toContain('latest_run');
    const adoptionQuery = prisma.$queryRaw.mock.calls[1]?.[0];
    expect(adoptionQuery?.strings?.join('')).toContain(
      'DISTINCT ON (adoption."recommendationInstanceId", adoption."mode")',
    );
    expect(adoptionQuery?.strings?.join('')).toContain('page_instances');
  });

  it('paginates persisted audience members without rebuilding rules', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        instanceId: 'instance-1',
        snapshotId: 'audience-1',
        customerCount: 2,
        generatedAt: new Date('2026-07-13T02:00:00.000Z'),
        total: 2,
        memberId: 1,
        customerId: 101,
        rank: 1,
        score: 92,
        reasonJson: { reason: '高流失风险' },
        predictionData: null,
        customerName: '客户A',
        customerPhone: '13800000000',
        memberLevel: 'gold',
        tags: [],
        lastVisitDate: null,
        skinType: null,
        visitCount: 3,
        totalSpent: '1000',
        storeName: 'Ami 全量演示门店',
      },
    ]);

    const response = await service.getAudience('instance-1', 6, { page: 1, pageSize: 1 });

    expect(response.total).toBe(2);
    expect(response.items[0].customerId).toBe(101);
    expect(response.items[0].customer).toEqual(expect.objectContaining({ id: 101, name: '客户A' }));
    expect(prisma.$queryRaw.mock.calls[0]?.[0]?.strings?.join('')).toContain('LEFT JOIN LATERAL');
  });

  it('returns not found when the audience query cannot find the scoped instance', async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(service.getAudience('instance-1', 7)).rejects.toThrow(NotFoundException);
  });

  it('reuses a hot recommendation list read within the short cache window', async () => {
    prisma.marketingRecommendationInstance.findMany.mockResolvedValue([]);
    prisma.marketingRecommendationInstance.count.mockResolvedValue(0);
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { totalCustomers: 10, predictedCustomers: 10, predictionRunId: 55, generatedAt: new Date() },
      ])
      .mockResolvedValueOnce([]);

    await service.findMany(6, { page: 1, pageSize: 20 });
    await service.findMany(6, { page: 1, pageSize: 20 });

    expect(prisma.marketingRecommendationInstance.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('reuses a hot audience page read within the short cache window', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        instanceId: 'instance-1',
        snapshotId: 'audience-1',
        customerCount: 0,
        generatedAt: new Date(),
        total: 0,
        memberId: null,
      },
    ]);

    await service.getAudience('instance-1', 6, { page: 1, pageSize: 50 });
    await service.getAudience('instance-1', 6, { page: 1, pageSize: 50 });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
