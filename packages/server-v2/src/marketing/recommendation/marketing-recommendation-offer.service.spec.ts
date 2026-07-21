import { MarketingRecommendationOfferService } from './marketing-recommendation-offer.service';
import type { RecommendationCandidate } from './marketing-recommendation.types';

function candidate(): RecommendationCandidate {
  return {
    recommendationKey: 'prediction:churn',
    sourceType: 'prediction',
    sourceVersion: 'rules-v2.1',
    title: '高流失客户召回',
    priority: 'P0',
    urgency: 'urgent',
    preferredMode: 'automation',
    executionModes: ['automation'],
    customerIds: [1],
    audienceRule: { segment: 'high_churn' },
    audienceReasons: [],
    evidenceSnapshot: {},
    strategySnapshot: { triggerRule: { type: 'dormant' }, recommendedItems: [] },
    offerContext: { offer: { type: 'money_off', amount: 80 }, riskWarnings: [] },
    expiresAt: new Date('2026-07-14T06:00:00.000Z'),
  };
}

describe('MarketingRecommendationOfferService', () => {
  const prisma = { promotion: { findMany: jest.fn() } } as any;
  const service = new MarketingRecommendationOfferService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('selects an active promotion only from the current store or platform pool', async () => {
    prisma.promotion.findMany.mockResolvedValue([
      { id: 21, storeId: 6, name: '召回立减', discountText: '满300减80', type: 'money_off', scenario: 'dormant', issuedCount: 2, maxIssueCount: 100 },
      { id: 22, storeId: null, name: '平台召回券', discountText: '满300减60', type: 'money_off', scenario: 'dormant', issuedCount: 1, maxIssueCount: 100 },
    ]);

    const result = await service.match(6, candidate(), new Date('2026-07-13T08:00:00.000Z'));

    expect(result.offerContext.selectedPromotionId).toBe(21);
    expect(prisma.promotion.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: [{ storeId: 6 }, { storeId: null }] }),
    }));
  });

  it('keeps the canonical offer without inventing a promotion when no candidate is relevant', async () => {
    prisma.promotion.findMany.mockResolvedValue([
      { id: 30, storeId: 6, name: '生日礼', discountText: '生日赠礼', type: 'gift', scenario: 'birthday', issuedCount: 0, maxIssueCount: 100 },
    ]);

    const result = await service.match(6, candidate(), new Date('2026-07-13T08:00:00.000Z'));

    expect(result.offerContext.selectedPromotionId).toBeNull();
    expect(result.offerContext.offer).toEqual({ type: 'money_off', amount: 80 });
  });

  it('loads the promotion pool once when matching multiple recommendation candidates', async () => {
    prisma.promotion.findMany.mockResolvedValue([
      { id: 21, storeId: 6, name: '召回立减', discountText: '满300减80', type: 'money_off', scenario: 'dormant', issuedCount: 2, maxIssueCount: 100 },
    ]);

    const results = await service.matchMany(6, [
      candidate(),
      { ...candidate(), recommendationKey: 'lifecycle:dormant_winback' },
    ], new Date('2026-07-13T08:00:00.000Z'));

    expect(results).toHaveLength(2);
    expect(prisma.promotion.findMany).toHaveBeenCalledTimes(1);
  });
});
