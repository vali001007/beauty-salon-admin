import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type MarketingFeatureFlags = {
  recommendationInstanceWrite: boolean;
  recommendationInstanceRead: boolean;
  recommendationAdoptionV2: boolean;
  deliveryJobEngine: boolean;
  effectFactWrite: boolean;
  effectFactRead: boolean;
};

export type MarketingFeatureFlagName = keyof MarketingFeatureFlags;

type MarketingFeatureFlagReader = Partial<MarketingFeatureFlags> & {
  isEnabledForStore?: (flag: MarketingFeatureFlagName, storeId: number) => boolean;
};

export function isMarketingFeatureEnabledForStore(
  flags: MarketingFeatureFlagReader | null | undefined,
  flag: MarketingFeatureFlagName,
  storeId: number,
) {
  if (!flags) return false;
  if (typeof flags.isEnabledForStore === 'function') return flags.isEnabledForStore(flag, storeId);
  return Boolean(flags[flag]);
}

@Injectable()
export class MarketingFeatureFlagsService {
  constructor(private readonly config: ConfigService) {}

  private boolean(key: string, fallback: boolean) {
    const value = this.config.get<string | boolean>(key);
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return fallback;
  }

  get recommendationInstanceWrite() {
    return this.boolean('MARKETING_RECOMMENDATION_INSTANCE_WRITE', true);
  }

  get recommendationInstanceRead() {
    return this.boolean('MARKETING_RECOMMENDATION_INSTANCE_READ', false);
  }

  get recommendationAdoptionV2() {
    return this.boolean('MARKETING_RECOMMENDATION_ADOPTION_V2', false);
  }

  get deliveryJobEngine() {
    return this.boolean('MARKETING_DELIVERY_JOB_ENGINE', false);
  }

  get effectFactWrite() {
    return this.boolean('MARKETING_EFFECT_FACT_WRITE', false);
  }

  get effectFactRead() {
    return this.boolean('MARKETING_EFFECT_FACT_READ', false);
  }

  enabledStoreIds(flag: MarketingFeatureFlagName): number[] | null {
    if (!this[flag]) return [];
    const configured = this.config.get<string | number[]>('MARKETING_ROLLOUT_STORE_IDS');
    if (configured === undefined || configured === null || configured === '') return [];
    const values = Array.isArray(configured) ? configured.map(String) : String(configured).split(',');
    if (values.some((value) => value.trim() === '*')) return null;
    return [...new Set(values
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0))]
      .sort((left, right) => left - right);
  }

  isEnabledForStore(flag: MarketingFeatureFlagName, storeId: number) {
    if (!Number.isInteger(storeId) || storeId <= 0) return false;
    const storeIds = this.enabledStoreIds(flag);
    return storeIds === null || storeIds.includes(storeId);
  }

  snapshot(): MarketingFeatureFlags {
    return {
      recommendationInstanceWrite: this.recommendationInstanceWrite,
      recommendationInstanceRead: this.recommendationInstanceRead,
      recommendationAdoptionV2: this.recommendationAdoptionV2,
      deliveryJobEngine: this.deliveryJobEngine,
      effectFactWrite: this.effectFactWrite,
      effectFactRead: this.effectFactRead,
    };
  }
}
