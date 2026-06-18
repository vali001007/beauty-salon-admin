import type { PaginatedResponse, PaginationParams, Promotion, PromotionPayload } from '@/types';
import apiClient from '../client';
import { normalizePaginatedResponse } from './response';

type ApiPromotion = Partial<Promotion> & { id: number; applicableProjectIds?: number[] | null };

function normalizePromotion(item: ApiPromotion): Promotion {
  return {
    id: Number(item.id),
    storeId: item.storeId ?? null,
    storeName: item.storeName ?? '',
    name: item.name ?? '',
    description: item.description ?? '',
    discountText: item.discountText ?? '',
    applicableProjectIds: Array.isArray(item.applicableProjectIds) ? item.applicableProjectIds.map(Number) : [],
    startAt: item.startAt ?? null,
    endAt: item.endAt ?? null,
    status: item.status ?? 'draft',
    createdAt: item.createdAt ?? '',
    updatedAt: item.updatedAt ?? '',
  };
}

export async function realGetPromotionsPaginated(
  params: PaginationParams & { status?: string; storeId?: number | null },
): Promise<PaginatedResponse<Promotion>> {
  const response = await apiClient.get<unknown, unknown>('/promotions/paginated', { params });
  return normalizePaginatedResponse<ApiPromotion, Promotion>(response, normalizePromotion);
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
