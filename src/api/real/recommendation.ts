import type { BehaviorProfile } from '@/utils/customerSegmentation';
import type { Recommendation } from '@/utils/marketingRecommendation';
import apiClient from '../client';

export type MarketingRecommendationQuery = {
  scope?: 'all' | 'customer' | 'product-project';
  type?: string;
  limit?: number;
  refresh?: boolean;
};

export type AdoptRecommendationRequest = {
  mode: 'activity' | 'automation' | 'terminal_follow_up';
  customerIds?: number[];
  activity?: { title?: string; startDate?: string; endDate?: string; publishPage: boolean };
};

export type AdoptRecommendationResponse = {
  adoptionId: number;
  recommendationId: number;
  mode: AdoptRecommendationRequest['mode'];
  status: 'draft' | 'published' | 'enabled' | 'dispatched';
  activityId?: number;
  pageId?: number;
  strategyId?: number;
  followUpTaskIds?: number[];
};

export async function realGetMarketingRecommendations(params?: MarketingRecommendationQuery): Promise<Recommendation[]> {
  return apiClient.get('/marketing/recommendations', { params });
}

export async function realGetMarketingRecommendationAudience(recommendationId: number): Promise<BehaviorProfile[]> {
  return apiClient.get(`/marketing/recommendations/${recommendationId}/audience`);
}

export async function realCreateRecommendation(data: Omit<Recommendation, 'id'>): Promise<Recommendation> {
  return apiClient.post('/marketing/recommendations', data);
}

export async function realUpdateRecommendation(id: number, data: Partial<Recommendation>): Promise<Recommendation> {
  return apiClient.put(`/marketing/recommendations/${id}`, data);
}

export async function realDeleteRecommendation(id: number): Promise<void> {
  return apiClient.delete(`/marketing/recommendations/${id}`);
}

export async function realAdoptMarketingRecommendation(
  id: number,
  data: { targetType?: 'activity' | 'automation'; storeId?: number; customerId?: number; audienceSnapshotId?: number | string },
): Promise<{ success: boolean; recommendationId: number; adoptedAt: string }> {
  return apiClient.post(`/marketing/recommendations/${id}/adopt`, data);
}

export async function realAdoptMarketingRecommendationTransaction(
  id: number,
  data: AdoptRecommendationRequest,
): Promise<AdoptRecommendationResponse> {
  return apiClient.post(`/marketing/recommendations/${id}/adoptions`, data);
}

export async function realCreateMarketingRecommendationActivityDraft(id: number): Promise<Record<string, unknown>> {
  return apiClient.post(`/marketing/recommendations/${id}/activity-draft`);
}

export async function realCreateMarketingRecommendationAutomationDraft(id: number): Promise<Record<string, unknown>> {
  return apiClient.post(`/marketing/recommendations/${id}/automation-draft`);
}
