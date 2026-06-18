export type PromotionStatus = 'draft' | 'active' | 'offline' | string;
export type PromotionSource = 'system' | 'store' | 'recommendation' | string;
export type PromotionApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected' | string;
export type PromotionType =
  | 'money_off'
  | 'percentage_off'
  | 'gift'
  | 'trial_price'
  | 'member_privilege'
  | 'package_upgrade'
  | 'bundle'
  | string;

export interface Promotion {
  id: number;
  storeId?: number | null;
  storeName?: string;
  code?: string | null;
  name: string;
  description?: string | null;
  discountText: string;
  type: PromotionType;
  source: PromotionSource;
  scenario?: string | null;
  audienceTags?: string[];
  applicableCustomerLevels?: string[];
  applicableProjectIds: number[];
  thresholdAmount?: number | null;
  discountAmount?: number | null;
  discountRate?: number | null;
  giftText?: string | null;
  validDays?: number | null;
  maxIssueCount?: number | null;
  issuedCount: number;
  usedCount: number;
  estimatedCost?: number | null;
  grossMarginGuard?: Record<string, unknown> | null;
  stackable: boolean;
  approvalStatus: PromotionApprovalStatus;
  createdByRecommendationId?: string | null;
  metadata?: Record<string, unknown> | null;
  startAt?: string | null;
  endAt?: string | null;
  status: PromotionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionPayload {
  storeId?: number | null;
  code?: string | null;
  name: string;
  description?: string;
  discountText: string;
  type?: PromotionType;
  source?: PromotionSource;
  scenario?: string | null;
  audienceTags?: string[];
  applicableCustomerLevels?: string[];
  applicableProjectIds?: number[];
  thresholdAmount?: number | null;
  discountAmount?: number | null;
  discountRate?: number | null;
  giftText?: string | null;
  validDays?: number | null;
  maxIssueCount?: number | null;
  issuedCount?: number;
  usedCount?: number;
  estimatedCost?: number | null;
  grossMarginGuard?: Record<string, unknown> | null;
  stackable?: boolean;
  approvalStatus?: PromotionApprovalStatus;
  createdByRecommendationId?: string | null;
  metadata?: Record<string, unknown> | null;
  startAt?: string | null;
  endAt?: string | null;
  status?: PromotionStatus;
}

export interface PromotionMatchParams {
  scenario?: string;
  customerSegment?: string;
  ltvTier?: string;
  skinType?: string;
  projectIds?: number[];
  storeId?: number | null;
}

export interface PromotionMatchItem {
  promotionId: number;
  name: string;
  discountText: string;
  type: PromotionType;
  scenario?: string | null;
  source: PromotionSource;
  fitScore: number;
  fitReason: string;
  promotion: Promotion;
}

export interface PromotionDraftSuggestion {
  name: string;
  type: PromotionType;
  discountText: string;
  reason: string;
}

export interface PromotionMatchResponse {
  items: PromotionMatchItem[];
  draftSuggestion?: PromotionDraftSuggestion;
}
