import { MarketingRecommendationOrchestratorService } from './marketing-recommendation-orchestrator.service';
import type { RecommendationCandidate } from './marketing-recommendation.types';

function candidate(overrides: Partial<RecommendationCandidate> = {}): RecommendationCandidate {
  return {
    recommendationKey: 'lifecycle:dormant_winback',
    sourceType: 'lifecycle',
    sourceVersion: 'lifecycle-v1',
    title: '沉睡客户召回',
    description: '召回长期未到店客户',
    priority: 'P0',
    urgency: 'urgent',
    preferredMode: 'automation',
    executionModes: ['automation', 'terminal_follow_up'],
    customerIds: [1, 2],
    audienceRule: { type: 'dormant_winback' },
    audienceReasons: [
      { customerId: 1, score: 90, reason: '90 天未到店' },
      { customerId: 2, score: 80, reason: '75 天未到店' },
    ],
    evidenceSnapshot: { opportunityType: 'dormant_winback' },
    strategySnapshot: { triggerRule: { type: 'dormant' } },
    offerContext: {
      selectedPromotionId: 21,
      offer: { type: 'money_off', label: '回店立减 80' },
      alternatives: [],
      riskWarnings: [],
    },
    expiresAt: new Date('2026-07-14T08:00:00.000Z'),
    ...overrides,
  };
}

describe('MarketingRecommendationOrchestratorService', () => {
  const prisma = {
    customer: { findMany: jest.fn() },
    marketingRecommendationInstance: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    marketingRecommendationAudienceSnapshot: { create: jest.fn() },
    marketingRecommendationAudienceMember: { createMany: jest.fn() },
    marketingRecommendationOfferSnapshot: { create: jest.fn() },
    $transaction: jest.fn(),
  } as any;
  const predictionRuns = { runForStore: jest.fn() } as any;
  const predictionProvider = { sourceType: 'prediction', build: jest.fn() } as any;
  const lifecycleProvider = { sourceType: 'lifecycle', build: jest.fn() } as any;
  const productProvider = { sourceType: 'product_project', build: jest.fn() } as any;
  const offerMatcher = { match: jest.fn(), matchMany: jest.fn() } as any;
  const flags = { recommendationInstanceWrite: true, isEnabledForStore: jest.fn() } as any;
  let service: MarketingRecommendationOrchestratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    flags.recommendationInstanceWrite = true;
    flags.isEnabledForStore.mockImplementation((flag: string) => Boolean(flags[flag]));
    prisma.$transaction.mockImplementation((callback: any) => callback(prisma));
    predictionRuns.runForStore.mockResolvedValue({
      run: { id: 55, storeId: 6, status: 'completed', modelVersion: 'rules-v2.1' },
      reused: true,
    });
    predictionProvider.build.mockResolvedValue([]);
    lifecycleProvider.build.mockResolvedValue([candidate()]);
    productProvider.build.mockResolvedValue([]);
    offerMatcher.match.mockImplementation(async (_storeId: number, input: RecommendationCandidate) => input);
    offerMatcher.matchMany.mockImplementation(async (_storeId: number, input: RecommendationCandidate[]) => input);
    prisma.customer.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    prisma.marketingRecommendationInstance.findUnique.mockResolvedValue(null);
    prisma.marketingRecommendationInstance.findMany.mockResolvedValue([]);
    prisma.marketingRecommendationInstance.updateMany.mockResolvedValue({ count: 0 });
    prisma.marketingRecommendationInstance.create.mockResolvedValue({
      id: 'instance-1',
      storeId: 6,
      recommendationKey: 'lifecycle:dormant_winback',
      fingerprint: 'fingerprint-1',
    });
    prisma.marketingRecommendationAudienceSnapshot.create.mockResolvedValue({ id: 'audience-1' });
    prisma.marketingRecommendationAudienceMember.createMany.mockResolvedValue({ count: 2 });
    prisma.marketingRecommendationOfferSnapshot.create.mockResolvedValue({ id: 'offer-1' });
    service = new MarketingRecommendationOrchestratorService(
      prisma,
      predictionRuns,
      predictionProvider,
      lifecycleProvider,
      productProvider,
      offerMatcher,
      flags,
    );
  });

  it('persists a stable recommendation instance with audience and offer snapshots', async () => {
    const result = await service.refreshForStore(6, new Date('2026-07-13T08:00:00.000Z'));

    expect(result.createdInstanceIds).toEqual(['instance-1']);
    expect(prisma.marketingRecommendationInstance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 6,
        recommendationKey: 'lifecycle:dormant_winback',
        predictionRunId: 55,
        targetCount: 2,
        fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(prisma.marketingRecommendationAudienceMember.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ storeId: 6, customerId: 1, rank: 1, score: 90 }),
        expect.objectContaining({ storeId: 6, customerId: 2, rank: 2, score: 80 }),
      ],
      skipDuplicates: true,
    });
    expect(prisma.marketingRecommendationOfferSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ recommendationInstanceId: 'instance-1', selectedPromotionId: 21 }),
    });
    expect(offerMatcher.matchMany).toHaveBeenCalledTimes(1);
    expect(prisma.customer.findMany).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent refreshes for the same store business day into one orchestration', async () => {
    const now = new Date('2026-07-13T08:00:00.000Z');

    const [first, second] = await Promise.all([
      service.refreshForStore(6, now),
      service.refreshForStore(6, new Date('2026-07-13T09:00:00.000Z')),
    ]);

    expect(second).toEqual(first);
    expect(predictionRuns.runForStore).toHaveBeenCalledTimes(1);
    expect(predictionProvider.build).toHaveBeenCalledTimes(1);
    expect(lifecycleProvider.build).toHaveBeenCalledTimes(1);
    expect(productProvider.build).toHaveBeenCalledTimes(1);
    expect(offerMatcher.matchMany).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('releases the store business-day lock after a failed orchestration', async () => {
    predictionRuns.runForStore.mockRejectedValueOnce(new Error('prediction_failed'));
    const now = new Date('2026-07-13T08:00:00.000Z');

    await expect(service.refreshForStore(6, now)).rejects.toThrow('prediction_failed');
    await expect(service.refreshForStore(6, now)).resolves.toEqual(
      expect.objectContaining({ createdInstanceIds: ['instance-1'] }),
    );

    expect(predictionRuns.runForStore).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('matches all provider candidates against one promotion-pool load', async () => {
    lifecycleProvider.build.mockResolvedValue([
      candidate(),
      candidate({ recommendationKey: 'lifecycle:coupon_claimed_unused', title: '领券未核销提醒' }),
    ]);
    prisma.marketingRecommendationInstance.create
      .mockResolvedValueOnce({ id: 'instance-1' })
      .mockResolvedValueOnce({ id: 'instance-2' });

    await service.refreshForStore(6, new Date('2026-07-13T08:00:00.000Z'));

    expect(offerMatcher.matchMany).toHaveBeenCalledTimes(1);
    expect(prisma.customer.findMany).toHaveBeenCalledTimes(1);
    expect(offerMatcher.matchMany).toHaveBeenCalledWith(
      6,
      expect.arrayContaining([
        expect.objectContaining({ recommendationKey: 'lifecycle:dormant_winback' }),
        expect.objectContaining({ recommendationKey: 'lifecycle:coupon_claimed_unused' }),
      ]),
      new Date('2026-07-13T08:00:00.000Z'),
    );
  });

  it('filters audience customers that do not belong to the current store', async () => {
    prisma.customer.findMany.mockResolvedValue([{ id: 1 }]);

    await service.refreshForStore(6, new Date('2026-07-13T08:00:00.000Z'));

    expect(prisma.marketingRecommendationInstance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ targetCount: 1 }),
    });
    expect(prisma.marketingRecommendationAudienceMember.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ customerId: 1 })],
      skipDuplicates: true,
    });
  });

  it('reuses an existing instance with the same fingerprint', async () => {
    prisma.marketingRecommendationInstance.findUnique.mockResolvedValue({ id: 'instance-existing' });

    const result = await service.refreshForStore(6, new Date('2026-07-13T08:00:00.000Z'));

    expect(result.reusedInstanceIds).toEqual(['instance-existing']);
    expect(prisma.marketingRecommendationInstance.create).not.toHaveBeenCalled();
  });

  it('returns superseded instance ids when the fingerprint changes', async () => {
    prisma.marketingRecommendationInstance.findMany.mockResolvedValue([{ id: 'instance-old' }]);
    prisma.marketingRecommendationInstance.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.refreshForStore(6, new Date('2026-07-13T08:00:00.000Z'));

    expect(result.supersededInstanceIds).toEqual(['instance-old']);
    expect(prisma.marketingRecommendationInstance.updateMany).toHaveBeenCalledWith({
      where: { storeId: 6, recommendationKey: 'lifecycle:dormant_winback', status: 'active' },
      data: { status: 'superseded', supersededAt: new Date('2026-07-13T08:00:00.000Z') },
    });
  });

  it('does not write instances when the write flag is disabled', async () => {
    flags.recommendationInstanceWrite = false;

    const result = await service.refreshForStore(6, new Date('2026-07-13T08:00:00.000Z'));

    expect(result.createdInstanceIds).toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    flags.recommendationInstanceWrite = true;
  });

  it('does not write instances outside the configured rollout stores', async () => {
    flags.isEnabledForStore.mockImplementation(
      (flag: string, storeId: number) => flag === 'recommendationInstanceWrite' && storeId === 6,
    );
    predictionRuns.runForStore.mockResolvedValue({
      run: { id: 56, storeId: 8, status: 'completed', modelVersion: 'rules-v2.1' },
      reused: true,
    });

    const result = await service.refreshForStore(8, new Date('2026-07-13T08:00:00.000Z'));

    expect(result.createdInstanceIds).toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
