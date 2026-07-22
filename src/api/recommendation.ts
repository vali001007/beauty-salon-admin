import type { BehaviorProfile } from '@/utils/customerSegmentation';
import type { Recommendation } from '@/utils/marketingRecommendation';
import {
  realAdoptMarketingRecommendation,
  realAdoptMarketingRecommendationTransaction,
  realCreateMarketingRecommendationActivityDraft,
  realCreateMarketingRecommendationAutomationDraft,
  realCreateRecommendation,
  realDeleteRecommendation,
  realGetMarketingRecommendationAudience,
  realGetMarketingRecommendationCapabilities,
  realGetMarketingRecommendationWorkspace,
  realGetMarketingRecommendations,
  realUpdateRecommendation,
  realGetRecommendationInstances,
  realGetRecommendationInstance,
  realGetRecommendationInstanceAudience,
  realRefreshRecommendationInstances,
  realAdoptRecommendationInstance,
  type MarketingRecommendationQuery,
  type MarketingRecommendationCapabilities,
  type RecommendationWorkspaceResponse,
  type RecommendationInstanceQuery,
  type RefreshRecommendationInstancesResponse,
  type AdoptRecommendationRequest,
  type AdoptRecommendationResponse,
} from './real/recommendation';
import type {
  AdoptRecommendationInstanceRequest,
  AdoptRecommendationInstanceResponse,
  MarketingRecommendationInstanceView,
  RecommendationInstanceAudienceResponse,
  RecommendationInstanceListResponse,
} from '@/types/marketing';

export const getMarketingRecommendations: (params?: MarketingRecommendationQuery) => Promise<Recommendation[]> =
  realGetMarketingRecommendations;

export const getMarketingRecommendationCapabilities: () => Promise<MarketingRecommendationCapabilities> =
  realGetMarketingRecommendationCapabilities;

export const getMarketingRecommendationWorkspace: (
  params?: { sourceType?: RecommendationInstanceQuery['sourceType']; priority?: RecommendationInstanceQuery['priority']; status?: string; page?: number; pageSize?: number; refresh?: boolean },
) => Promise<RecommendationWorkspaceResponse> = realGetMarketingRecommendationWorkspace;

export const getRecommendationInstances: (params?: RecommendationInstanceQuery) => Promise<RecommendationInstanceListResponse> =
  realGetRecommendationInstances;

export const getRecommendationInstance: (instanceId: string) => Promise<MarketingRecommendationInstanceView> =
  realGetRecommendationInstance;

export const getRecommendationInstanceAudience: (
  instanceId: string,
  params?: { page?: number; pageSize?: number },
) => Promise<RecommendationInstanceAudienceResponse> = realGetRecommendationInstanceAudience;

export const refreshRecommendationInstances: () => Promise<RefreshRecommendationInstancesResponse> =
  realRefreshRecommendationInstances;

export const adoptRecommendationInstance: (
  instanceId: string,
  data: AdoptRecommendationInstanceRequest,
) => Promise<AdoptRecommendationInstanceResponse> = realAdoptRecommendationInstance;

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
  data: { targetType?: 'activity' | 'automation'; customerId?: number; audienceSnapshotId?: number | string },
) => Promise<{ success: boolean; recommendationId: number; adoptedAt: string }> =
  realAdoptMarketingRecommendation;

export const adoptMarketingRecommendationTransaction: (
  id: number,
  data: AdoptRecommendationRequest,
) => Promise<AdoptRecommendationResponse> = realAdoptMarketingRecommendationTransaction;

export type { AdoptRecommendationRequest, AdoptRecommendationResponse };
export type { RecommendationInstanceQuery, RefreshRecommendationInstancesResponse };
export type { MarketingRecommendationCapabilities };
export type { RecommendationWorkspaceResponse };

export const createMarketingRecommendationActivityDraft: (id: number) => Promise<Record<string, unknown>> =
  realCreateMarketingRecommendationActivityDraft;

export const createMarketingRecommendationAutomationDraft: (id: number) => Promise<Record<string, unknown>> =
  realCreateMarketingRecommendationAutomationDraft;
