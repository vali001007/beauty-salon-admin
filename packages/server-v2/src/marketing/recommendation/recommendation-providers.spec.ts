import { LifecycleRecommendationProvider } from './lifecycle-recommendation.provider';
import { PredictionRecommendationProvider } from './prediction-recommendation.provider';
import { ProductProjectRecommendationProvider } from './product-project-recommendation.provider';

const context = {
  storeId: 6,
  businessDate: '2026-07-13',
  predictionRunId: 55,
  predictionModelVersion: 'rules-v2.1',
  generatedAt: new Date('2026-07-13T08:00:00.000Z'),
};

describe('recommendation providers', () => {
  it('normalizes only base prediction cards from the legacy recommendation builder', async () => {
    const marketing = {
      getRecommendations: jest.fn().mockResolvedValue([
        {
          id: 1,
          predictionType: 'churn',
          title: '高流失客户召回',
          source: 'churn',
          targetCustomerIds: [1],
          audienceSnapshot: { customerIds: [1], sampleReasons: [{ customerId: 1, score: 90, reason: '高流失' }] },
          executionModes: ['automation'],
          preferredMode: 'automation',
          priority: 'P0',
          urgency: 'urgent',
          offer: { promotionId: 21, label: '回店立减' },
        },
        { id: 9001, source: 'customer_lifecycle', recommendationKey: 'lifecycle:dormant_winback' },
      ]),
    } as any;
    const provider = new PredictionRecommendationProvider(marketing);

    const result = await provider.build(context);
    const refreshed = await provider.build({ ...context, generatedAt: new Date('2026-07-13T08:05:00.000Z') });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      recommendationKey: 'prediction:churn',
      sourceType: 'prediction',
      customerIds: [1],
      evidenceSnapshot: expect.objectContaining({ legacyRecommendationId: 1 }),
    }));
    expect(refreshed[0].expiresAt.toISOString()).toBe(result[0].expiresAt.toISOString());
    expect(marketing.getRecommendations).toHaveBeenCalledWith(6, expect.objectContaining({ matchPromotion: false }));
  });

  it('normalizes lifecycle cards by their stable recommendation key', async () => {
    const lifecycle = {
      buildRecommendationCards: jest.fn().mockResolvedValue([
        {
          id: 9002,
          recommendationKey: 'lifecycle:dormant_winback',
          recommendationType: 'dormant_winback',
          title: '沉睡客户召回',
          targetCustomerIds: [1, 2],
          audienceSnapshot: { customerIds: [1, 2], sampleReasons: [] },
          executionModes: ['automation', 'advisor_task'],
          preferredMode: 'automation',
        },
      ]),
    } as any;
    const provider = new LifecycleRecommendationProvider(lifecycle);

    const result = await provider.build(context);

    expect(result[0]).toEqual(expect.objectContaining({
      recommendationKey: 'lifecycle:dormant_winback',
      sourceType: 'lifecycle',
      customerIds: [1, 2],
      executionModes: ['automation', 'terminal_follow_up'],
    }));
  });

  it('keeps product-project recommendation keys independent from array order', async () => {
    const productProject = {
      getCards: jest.fn().mockResolvedValue([
        {
          id: 2300,
          recommendationKey: 'product_replenishment:product:35',
          recommendationType: 'product_replenishment',
          title: '面膜补货提醒',
          targetCustomerIds: [3],
          executionModes: ['activity'],
          preferredMode: 'activity',
        },
      ]),
    } as any;
    const provider = new ProductProjectRecommendationProvider(productProject);

    const result = await provider.build(context);

    expect(result[0]).toEqual(expect.objectContaining({
      recommendationKey: 'product_replenishment:product:35',
      sourceType: 'product_project',
      customerIds: [3],
    }));
    expect(productProject.getCards).toHaveBeenCalledWith(6, expect.objectContaining({ matchPromotion: false }));
  });
});
