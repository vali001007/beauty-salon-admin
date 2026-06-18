export type PromotionStatus = 'draft' | 'active' | 'offline' | string;

export interface Promotion {
  id: number;
  storeId?: number | null;
  storeName?: string;
  name: string;
  description?: string | null;
  discountText: string;
  applicableProjectIds: number[];
  startAt?: string | null;
  endAt?: string | null;
  status: PromotionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionPayload {
  storeId?: number | null;
  name: string;
  description?: string;
  discountText: string;
  applicableProjectIds?: number[];
  startAt?: string | null;
  endAt?: string | null;
  status?: PromotionStatus;
}
