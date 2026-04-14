import type { MarketingActivity } from '@/types';
import { mockGetMarketingActivities, mockCreateMarketingActivity, mockUpdateMarketingActivity, mockCreateStrategy, mockSaveStrategyDraft, mockGetStrategyEffects } from './mock/marketing';
import { realGetMarketingActivities, realCreateMarketingActivity, realUpdateMarketingActivity, realCreateStrategy, realSaveStrategyDraft, realGetStrategyEffects } from './real/marketing';
import type { MarketingStrategy, StrategyEffectSummary } from './mock/marketing';

const isReal = import.meta.env.VITE_API_MODE === 'real';

export type { MarketingStrategy, StrategyEffectSummary };

export const getMarketingActivities: () => Promise<MarketingActivity[]> =
  isReal ? realGetMarketingActivities : mockGetMarketingActivities;

export const createMarketingActivity: (data: Omit<MarketingActivity, 'id'>) => Promise<MarketingActivity> =
  isReal ? realCreateMarketingActivity : mockCreateMarketingActivity;

export const updateMarketingActivity: (id: number, data: Partial<MarketingActivity>) => Promise<MarketingActivity> =
  isReal ? realUpdateMarketingActivity : mockUpdateMarketingActivity;

export const createStrategy: (data: { name: string; description: string; executionType: string; executionTime: string }) => Promise<MarketingStrategy> =
  isReal ? realCreateStrategy : mockCreateStrategy;

export const saveStrategyDraft: (data: { name: string; description: string; executionType: string; executionTime: string }) => Promise<MarketingStrategy> =
  isReal ? realSaveStrategyDraft : mockSaveStrategyDraft;

export const getStrategyEffects: () => Promise<StrategyEffectSummary[]> =
  isReal ? realGetStrategyEffects : mockGetStrategyEffects;
