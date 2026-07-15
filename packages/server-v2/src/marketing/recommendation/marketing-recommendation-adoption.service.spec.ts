import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MarketingRecommendationAdoptionService } from './marketing-recommendation-adoption.service';

function instance(overrides: Record<string, any> = {}) {
  const generatedAt = new Date('2026-07-13T02:00:00.000Z');
  return {
    id: 'instance-1',
    storeId: 6,
    recommendationKey: 'prediction:churn',
    sourceType: 'prediction',
    predictionRunId: 55,
    title: '高流失客户召回',
    description: '召回 2 位高流失客户',
    status: 'active',
    generatedAt,
    expiresAt: new Date('2026-07-14T02:00:00.000Z'),
    preferredMode: 'automation',
    executionModes: ['activity', 'automation', 'terminal_follow_up'],
    evidenceSnapshot: { legacyRecommendationId: 1 },
    strategySnapshot: {
      triggerRule: { type: 'dormant', params: { days: 60 } },
      recommendedActions: [{ type: 'coupon', channel: 'in_app' }],
    },
    audienceSnapshot: {
      id: 'audience-1',
      customerCount: 2,
      ruleJson: { type: 'dormant' },
      members: [{ customerId: 101 }, { customerId: 102 }],
    },
    offerSnapshot: {
      id: 'offer-1',
      selectedPromotionId: 21,
      offerJson: { promotionId: 21, label: '满300减80' },
      alternativesJson: [],
      riskWarningsJson: [],
    },
    predictionRun: { id: 55, status: 'completed', finishedAt: generatedAt, startedAt: generatedAt },
    ...overrides,
  };
}

describe('MarketingRecommendationAdoptionService', () => {
  const prisma = {
    marketingRecommendationInstance: { findFirst: jest.fn(), findMany: jest.fn() },
    marketingRecommendationAdoption: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    marketingActivity: { create: jest.fn() },
    marketingPage: { create: jest.fn() },
    marketingPageVersion: { create: jest.fn() },
    marketingAutomationStrategy: { create: jest.fn() },
    promotion: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  } as any;
  const terminal = { batchCreateFollowUpTasks: jest.fn() } as any;
  let service: MarketingRecommendationAdoptionService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: any) => callback(prisma));
    prisma.marketingRecommendationInstance.findFirst.mockResolvedValue(instance());
    prisma.marketingRecommendationAdoption.findUnique.mockResolvedValue(null);
    prisma.marketingRecommendationAdoption.create.mockResolvedValue({ id: 70, status: 'pending' });
    prisma.marketingActivity.create.mockResolvedValue({ id: 80, title: '高流失客户召回' });
    prisma.marketingPage.create.mockResolvedValue({ id: 90 });
    prisma.marketingPageVersion.create.mockResolvedValue({ id: 91 });
    prisma.marketingAutomationStrategy.create.mockResolvedValue({ id: 100 });
    prisma.marketingRecommendationAdoption.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 70, ...data }));
    prisma.promotion.findFirst.mockResolvedValue({ id: 21 });
    terminal.batchCreateFollowUpTasks.mockResolvedValue({
      items: [{ id: 120, customerId: 101, duplicated: false }, { id: 121, customerId: 102, duplicated: true }],
      total: 2,
      createdCount: 1,
      duplicatedCount: 1,
      failedCount: 0,
      failures: [],
    });
    service = new MarketingRecommendationAdoptionService(prisma, terminal);
  });

  it('adopts the persisted audience and offer without rebuilding the recommendation', async () => {
    const response = await service.adopt('instance-1', 6, {
      mode: 'activity',
      clientRequestId: 'request-1',
      activity: { publishPage: true },
    }, 9, new Date('2026-07-13T03:00:00.000Z'));

    expect(response).toEqual(expect.objectContaining({ adoptionId: 70, activityId: 80, pageId: 90, status: 'published' }));
    expect(prisma.marketingActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 6,
        recommendationInstanceId: 'instance-1',
        adoptionId: 70,
        audienceSnapshotId: 'audience-1',
        primaryPromotionId: 21,
      }),
    });
    expect(prisma.marketingPageVersion.create).toHaveBeenCalled();
  });

  it('returns the existing adoption for the same idempotency key', async () => {
    prisma.marketingRecommendationAdoption.findUnique.mockResolvedValue({
      id: 70,
      recommendationInstanceId: 'instance-1',
      mode: 'activity',
      status: 'published',
      activityId: 80,
      pageId: 90,
    });

    const response = await service.adopt('instance-1', 6, {
      mode: 'activity', clientRequestId: 'request-1', activity: { publishPage: true },
    }, undefined, new Date('2026-07-13T03:00:00.000Z'));

    expect(response.adoptionId).toBe(70);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates an enabled strategy from fresh persisted snapshots without executing it', async () => {
    const response = await service.adopt('instance-1', 6, {
      mode: 'automation', clientRequestId: 'request-2',
    }, 9, new Date('2026-07-13T03:00:00.000Z'));

    expect(response).toEqual(expect.objectContaining({ strategyId: 100, status: 'enabled' }));
    expect(prisma.marketingAutomationStrategy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 6,
        status: 'enabled',
        recommendationInstanceId: 'instance-1',
        adoptionId: 70,
        predictionRunId: 55,
        audienceSnapshotId: 'audience-1',
      }),
    });
  });

  it('rejects automation when the prediction snapshot is stale', async () => {
    await expect(service.adopt('instance-1', 6, {
      mode: 'automation', clientRequestId: 'request-3',
    }, undefined, new Date('2026-07-14T10:01:00.000Z'))).rejects.toThrow(BadRequestException);

    expect(prisma.marketingAutomationStrategy.create).not.toHaveBeenCalled();
  });

  it('records partial terminal dispatches and returns failed customers', async () => {
    terminal.batchCreateFollowUpTasks.mockResolvedValue({
      items: [{ id: 120, customerId: 101, duplicated: false }],
      total: 2,
      createdCount: 1,
      duplicatedCount: 0,
      failedCount: 1,
      failures: [{ customerId: 102, message: '未匹配系统用户' }],
    });

    const response = await service.adopt('instance-1', 6, {
      mode: 'terminal_follow_up', clientRequestId: 'request-4', customerIds: [101, 102],
    }, 9, new Date('2026-07-13T03:00:00.000Z'));

    expect(response.status).toBe('partial_failed');
    expect(response.followUpTaskIds).toEqual([120]);
    expect(response.failedCustomers).toEqual([{ customerId: 102, code: 'terminal_task_create_failed', message: '未匹配系统用户' }]);
    expect(terminal.batchCreateFollowUpTasks).toHaveBeenCalledWith(6, expect.objectContaining({
      recommendationInstanceId: 'instance-1', adoptionId: 70, customerIds: [101, 102],
    }), 9);
  });

  it('marks a terminal adoption failed when no follow-up task is created', async () => {
    terminal.batchCreateFollowUpTasks.mockResolvedValue({
      items: [],
      total: 2,
      createdCount: 0,
      duplicatedCount: 0,
      failedCount: 2,
      failures: [
        { customerId: 101, message: '客户不存在' },
        { customerId: 102, message: '未匹配系统用户' },
      ],
    });

    const response = await service.adopt('instance-1', 6, {
      mode: 'terminal_follow_up', clientRequestId: 'request-all-failed', customerIds: [101, 102],
    }, 9, new Date('2026-07-13T03:00:00.000Z'));

    expect(response.status).toBe('failed');
    expect(response.followUpTaskIds).toEqual([]);
    expect(prisma.marketingRecommendationAdoption.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'failed', errorCode: 'terminal_task_failed' }),
    }));
  });

  it('returns not found for a cross-store instance', async () => {
    prisma.marketingRecommendationInstance.findFirst.mockResolvedValue(null);

    await expect(service.adopt('instance-1', 7, {
      mode: 'activity', clientRequestId: 'request-5', activity: { publishPage: false },
    })).rejects.toThrow(NotFoundException);
  });
});
