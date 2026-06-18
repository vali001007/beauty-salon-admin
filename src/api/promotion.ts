import type {
  PaginatedResponse,
  PaginationParams,
  Promotion,
  PromotionMatchParams,
  PromotionMatchResponse,
  PromotionPayload,
} from '@/types';
import {
  realApprovePromotion,
  realCreatePromotion,
  realDeletePromotion,
  realGetPromotionsPaginated,
  realMatchPromotions,
  realOfflinePromotion,
  realPublishPromotion,
  realRejectPromotion,
  realUpdatePromotion,
} from './real/promotion';

export const getPromotionsPaginated: (
  params: PaginationParams & {
    status?: string;
    storeId?: number | null;
    type?: string;
    source?: string;
    scenario?: string;
    approvalStatus?: string;
    keyword?: string;
  },
) => Promise<PaginatedResponse<Promotion>> = realGetPromotionsPaginated;

export const matchPromotions: (params: PromotionMatchParams) => Promise<PromotionMatchResponse> = realMatchPromotions;

export const createPromotion: (data: PromotionPayload) => Promise<Promotion> = realCreatePromotion;

export const updatePromotion: (id: number, data: PromotionPayload) => Promise<Promotion> = realUpdatePromotion;

export const deletePromotion: (id: number) => Promise<void> = realDeletePromotion;

export const publishPromotion: (id: number) => Promise<Promotion> = realPublishPromotion;

export const offlinePromotion: (id: number) => Promise<Promotion> = realOfflinePromotion;

export const approvePromotion: (id: number) => Promise<Promotion> = realApprovePromotion;

export const rejectPromotion: (id: number) => Promise<Promotion> = realRejectPromotion;
