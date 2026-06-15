import type { PaginatedResponse, PaginationParams, Promotion, PromotionPayload } from '@/types';
import {
  realCreatePromotion,
  realDeletePromotion,
  realGetPromotionsPaginated,
  realOfflinePromotion,
  realPublishPromotion,
  realUpdatePromotion,
} from './real/promotion';

export const getPromotionsPaginated: (
  params: PaginationParams & { status?: string; storeId?: number | null },
) => Promise<PaginatedResponse<Promotion>> = realGetPromotionsPaginated;

export const createPromotion: (data: PromotionPayload) => Promise<Promotion> = realCreatePromotion;

export const updatePromotion: (id: number, data: PromotionPayload) => Promise<Promotion> = realUpdatePromotion;

export const deletePromotion: (id: number) => Promise<void> = realDeletePromotion;

export const publishPromotion: (id: number) => Promise<Promotion> = realPublishPromotion;

export const offlinePromotion: (id: number) => Promise<Promotion> = realOfflinePromotion;
