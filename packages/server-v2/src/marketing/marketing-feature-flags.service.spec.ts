import { isMarketingFeatureEnabledForStore, MarketingFeatureFlagsService } from './marketing-feature-flags.service';

describe('MarketingFeatureFlagsService', () => {
  it('keeps instance writes enabled and risky reads disabled by default', () => {
    const config = { get: jest.fn().mockReturnValue(undefined) } as any;
    const service = new MarketingFeatureFlagsService(config);

    expect(service.snapshot()).toEqual({
      recommendationInstanceWrite: true,
      recommendationInstanceRead: false,
      recommendationAdoptionV2: false,
      deliveryJobEngine: false,
      effectFactWrite: false,
      effectFactRead: false,
    });
    expect((service as any).enabledStoreIds('recommendationInstanceWrite')).toEqual([]);
    expect((service as any).isEnabledForStore('recommendationInstanceWrite', 6)).toBe(false);
  });

  it('parses explicit true and false values', () => {
    const values: Record<string, string> = {
      MARKETING_RECOMMENDATION_INSTANCE_WRITE: 'false',
      MARKETING_RECOMMENDATION_INSTANCE_READ: 'true',
    };
    const config = { get: jest.fn((key: string) => values[key]) } as any;
    const service = new MarketingFeatureFlagsService(config);

    expect(service.recommendationInstanceWrite).toBe(false);
    expect(service.recommendationInstanceRead).toBe(true);
  });

  it('limits enabled marketing features to configured rollout stores', () => {
    const values: Record<string, string> = {
      MARKETING_RECOMMENDATION_INSTANCE_READ: 'true',
      MARKETING_DELIVERY_JOB_ENGINE: 'true',
      MARKETING_ROLLOUT_STORE_IDS: '6, 8, invalid, -1, 6',
    };
    const config = { get: jest.fn((key: string) => values[key]) } as any;
    const service = new MarketingFeatureFlagsService(config);

    expect((service as any).enabledStoreIds('recommendationInstanceRead')).toEqual([6, 8]);
    expect((service as any).isEnabledForStore('recommendationInstanceRead', 6)).toBe(true);
    expect((service as any).isEnabledForStore('recommendationInstanceRead', 7)).toBe(false);
    expect((service as any).isEnabledForStore('deliveryJobEngine', 8)).toBe(true);
    expect((service as any).enabledStoreIds('effectFactWrite')).toEqual([]);
  });

  it('supports an explicit all-store rollout without weakening the master flag', () => {
    const values: Record<string, string> = {
      MARKETING_RECOMMENDATION_ADOPTION_V2: 'true',
      MARKETING_ROLLOUT_STORE_IDS: '*',
    };
    const config = { get: jest.fn((key: string) => values[key]) } as any;
    const service = new MarketingFeatureFlagsService(config);

    expect((service as any).enabledStoreIds('recommendationAdoptionV2')).toBeNull();
    expect((service as any).isEnabledForStore('recommendationAdoptionV2', 999)).toBe(true);
    expect((service as any).enabledStoreIds('effectFactRead')).toEqual([]);
    expect((service as any).isEnabledForStore('effectFactRead', 6)).toBe(false);
  });

  it('keeps lightweight test doubles backward compatible while using scoped services when available', () => {
    expect(isMarketingFeatureEnabledForStore({ effectFactWrite: true } as any, 'effectFactWrite', 6)).toBe(true);
    expect(isMarketingFeatureEnabledForStore({ effectFactWrite: false } as any, 'effectFactWrite', 6)).toBe(false);
    expect(isMarketingFeatureEnabledForStore({
      effectFactWrite: true,
      isEnabledForStore: jest.fn().mockReturnValue(false),
    } as any, 'effectFactWrite', 6)).toBe(false);
  });
});
