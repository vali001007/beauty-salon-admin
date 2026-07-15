import type { BehaviorProfile } from '@/utils/customerSegmentation';
import type { Recommendation } from '@/utils/marketingRecommendation';
import type {
  AdoptRecommendationInstanceRequest,
  AdoptRecommendationInstanceResponse,
  MarketingRecommendationInstanceView,
  RecommendationInstanceAudienceResponse,
  RecommendationInstanceListResponse,
} from '@/types/marketing';
import apiClient from '../client';

export type MarketingRecommendationQuery = {
  scope?: 'all' | 'customer' | 'product-project';
  type?: string;
  limit?: number;
  refresh?: boolean;
};

export type RecommendationInstanceQuery = {
  sourceType?: 'prediction' | 'lifecycle' | 'product_project';
  priority?: 'P0' | 'P1' | 'P2';
  status?: string;
  page?: number;
  pageSize?: number;
};

export type RefreshRecommendationInstancesResponse = {
  predictionRunId: number;
  reusedPredictionRun: boolean;
  createdInstanceIds: string[];
  reusedInstanceIds: string[];
  supersededInstanceIds: string[];
  generatedAt: string;
};

export type MarketingRecommendationCapabilities = {
  recommendationInstanceWrite: boolean;
  recommendationInstanceRead: boolean;
  recommendationAdoptionV2: boolean;
  managementUiV2: boolean;
};

export type RecommendationWorkspaceResponse =
  | ({ mode: 'v2' } & RecommendationInstanceListResponse)
  | {
      mode: 'legacy';
      items: Recommendation[];
      total: number;
      page: number;
      pageSize: number;
      coverage: RecommendationInstanceListResponse['coverage'];
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
  status: 'draft' | 'published' | 'enabled' | 'dispatched' | 'partial_failed' | 'failed';
  activityId?: number;
  pageId?: number;
  strategyId?: number;
  followUpTaskIds?: number[];
  failedCustomerIds?: number[];
  duplicatedCustomerIds?: number[];
  createdCount?: number;
  duplicatedCount?: number;
  failedCount?: number;
  failures?: Array<{ customerId: number; message: string }>;
};

export async function realGetMarketingRecommendations(params?: MarketingRecommendationQuery): Promise<Recommendation[]> {
  return apiClient.get('/marketing/recommendations', { params });
}

export async function realGetMarketingRecommendationCapabilities(): Promise<MarketingRecommendationCapabilities> {
  return apiClient.get('/marketing/recommendation-capabilities');
}

export async function realGetMarketingRecommendationWorkspace(params?: {
  sourceType?: RecommendationInstanceQuery['sourceType'];
  priority?: RecommendationInstanceQuery['priority'];
  status?: string;
  page?: number;
  pageSize?: number;
  refresh?: boolean;
}): Promise<RecommendationWorkspaceResponse> {
  return apiClient.get('/marketing/recommendation-workspace', { params });
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
  data: { targetType?: 'activity' | 'automation'; customerId?: number; audienceSnapshotId?: number | string },
): Promise<{ success: boolean; recommendationId: number; adoptedAt: string }> {
  return apiClient.post(`/marketing/recommendations/${id}/adopt`, data);
}

export async function realGetRecommendationInstances(params?: RecommendationInstanceQuery): Promise<RecommendationInstanceListResponse> {
  return apiClient.get('/marketing/recommendation-instances', { params });
}

export async function realGetRecommendationInstance(instanceId: string): Promise<MarketingRecommendationInstanceView> {
  return apiClient.get(`/marketing/recommendation-instances/${instanceId}`);
}

export async function realGetRecommendationInstanceAudience(
  instanceId: string,
  params?: { page?: number; pageSize?: number },
): Promise<RecommendationInstanceAudienceResponse> {
  return apiClient.get(`/marketing/recommendation-instances/${instanceId}/audience`, { params });
}

export async function realRefreshRecommendationInstances(): Promise<RefreshRecommendationInstancesResponse> {
  return apiClient.post('/marketing/recommendation-instances/refresh');
}

export async function realAdoptRecommendationInstance(
  instanceId: string,
  data: AdoptRecommendationInstanceRequest,
): Promise<AdoptRecommendationInstanceResponse> {
  return apiClient.post(`/marketing/recommendation-instances/${instanceId}/adoptions`, data, {
    headers: { 'Idempotency-Key': data.clientRequestId },
  });
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
