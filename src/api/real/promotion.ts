import type {
  PaginatedResponse,
  PaginationParams,
  Promotion,
  PromotionMatchParams,
  PromotionMatchResponse,
  PromotionPayload,
} from '@/types';
import apiClient from '../client';
import { normalizePaginatedResponse } from './response';

type ApiPromotion = Partial<Promotion> & { id: number; applicableProjectIds?: number[] | null };

function normalizePromotion(item: ApiPromotion): Promotion {
  return {
    id: Number(item.id),
    storeId: item.storeId ?? null,
    storeName: item.storeName ?? '',
    code: item.code ?? null,
    name: item.name ?? '',
    description: item.description ?? '',
    discountText: item.discountText ?? '',
    type: item.type ?? 'money_off',
    source: item.source ?? 'store',
    scenario: item.scenario ?? null,
    audienceTags: Array.isArray(item.audienceTags) ? item.audienceTags.map(String) : [],
    applicableCustomerLevels: Array.isArray(item.applicableCustomerLevels)
      ? item.applicableCustomerLevels.map(String)
      : [],
    applicableProjectIds: Array.isArray(item.applicableProjectIds) ? item.applicableProjectIds.map(Number) : [],
    thresholdAmount: item.thresholdAmount == null ? null : Number(item.thresholdAmount),
    discountAmount: item.discountAmount == null ? null : Number(item.discountAmount),
    discountRate: item.discountRate == null ? null : Number(item.discountRate),
    giftText: item.giftText ?? null,
    validDays: item.validDays == null ? null : Number(item.validDays),
    maxIssueCount: item.maxIssueCount == null ? null : Number(item.maxIssueCount),
    issuedCount: item.issuedCount == null ? 0 : Number(item.issuedCount),
    usedCount: item.usedCount == null ? 0 : Number(item.usedCount),
    estimatedCost: item.estimatedCost == null ? null : Number(item.estimatedCost),
    grossMarginGuard: item.grossMarginGuard ?? null,
    stackable: Boolean(item.stackable),
    approvalStatus: item.approvalStatus ?? 'approved',
    createdByRecommendationId: item.createdByRecommendationId ?? null,
    metadata: item.metadata ?? null,
    startAt: item.startAt ?? null,
    endAt: item.endAt ?? null,
    status: item.status ?? 'draft',
    createdAt: item.createdAt ?? '',
    updatedAt: item.updatedAt ?? '',
  };
}

export async function realGetPromotionsPaginated(
  params: PaginationParams & {
    status?: string;
    storeId?: number | null;
    type?: string;
    source?: string;
    scenario?: string;
    approvalStatus?: string;
    keyword?: string;
  },
): Promise<PaginatedResponse<Promotion>> {
  const response = await apiClient.get<unknown, unknown>('/promotions/paginated', { params });
  return normalizePaginatedResponse<ApiPromotion, Promotion>(response, normalizePromotion);
}

export async function realMatchPromotions(params: PromotionMatchParams): Promise<PromotionMatchResponse> {
  const response = await apiClient.post<unknown, PromotionMatchResponse>('/promotions/recommend-match', params);
  return {
    items: (response.items ?? []).map((item) => ({
      ...item,
      promotion: normalizePromotion(item.promotion as ApiPromotion),
    })),
    draftSuggestion: response.draftSuggestion,
  };
}

export async function realCreatePromotion(data: PromotionPayload): Promise<Promotion> {
  const item = await apiClient.post<unknown, ApiPromotion>('/promotions', data);
  return normalizePromotion(item);
}

export async function realUpdatePromotion(id: number, data: PromotionPayload): Promise<Promotion> {
  const item = await apiClient.put<unknown, ApiPromotion>(`/promotions/${id}`, data);
  return normalizePromotion(item);
}

export async function realDeletePromotion(id: number): Promise<void> {
  await apiClient.delete(`/promotions/${id}`);
}

export async function realPublishPromotion(id: number): Promise<Promotion> {
  const item = await apiClient.post<unknown, ApiPromotion>(`/promotions/${id}/publish`);
  return normalizePromotion(item);
}

export async function realOfflinePromotion(id: number): Promise<Promotion> {
  const item = await apiClient.post<unknown, ApiPromotion>(`/promotions/${id}/offline`);
  return normalizePromotion(item);
}

export async function realApprovePromotion(id: number): Promise<Promotion> {
  const item = await apiClient.post<unknown, ApiPromotion>(`/promotions/${id}/approve`);
  return normalizePromotion(item);
}

export async function realRejectPromotion(id: number): Promise<Promotion> {
  const item = await apiClient.post<unknown, ApiPromotion>(`/promotions/${id}/reject`);
  return normalizePromotion(item);
}
