import type { BehaviorProfile } from '@/utils/customerSegmentation';
import type { Recommendation } from '@/utils/marketingRecommendation';
import { realGetMarketingRecommendationAudience, realGetMarketingRecommendations, realCreateRecommendation, realUpdateRecommendation, realDeleteRecommendation } from './real/recommendation';

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
