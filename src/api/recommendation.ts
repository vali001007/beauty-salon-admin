import type { BehaviorProfile } from '@/utils/customerSegmentation';
import type { Recommendation } from '@/utils/marketingRecommendation';
import {
  realAdoptMarketingRecommendation,
  realCreateMarketingRecommendationActivityDraft,
  realCreateMarketingRecommendationAutomationDraft,
  realCreateRecommendation,
  realDeleteRecommendation,
  realGetMarketingRecommendationAudience,
  realGetMarketingRecommendations,
  realUpdateRecommendation,
} from './real/recommendation';

export const getMarketingRecommendations: () => Promise<Recommendation[]> =
  realGetMarketingRecommendations;

export const getMarketingRecommendationAudience: (recommendationId: number) => Promise<BehaviorProfile[]> =
  realGetMarketingRecommendationAudience;

export const createRecommendation: (data: Omit<Recommendation, 'id'>) => Promise<Recommendation> =
  realCreateRecommendation;

export const updateRecommendation: (id: number, data: Partial<Recommendation>) => Promise<Recommendation> =
  realUpdateRecommendation;

export const deleteRecommendation: (id: number) => Promise<void> =
  realDeleteRecommendation;

export const adoptMarketingRecommendation: (
  id: number,
  data: { targetType?: 'activity' | 'automation'; storeId?: number; customerId?: number; audienceSnapshotId?: number | string },
) => Promise<{ success: boolean; recommendationId: number; adoptedAt: string }> =
  realAdoptMarketingRecommendation;

export const createMarketingRecommendationActivityDraft: (id: number) => Promise<Record<string, unknown>> =
  realCreateMarketingRecommendationActivityDraft;

export const createMarketingRecommendationAutomationDraft: (id: number) => Promise<Record<string, unknown>> =
  realCreateMarketingRecommendationAutomationDraft;
