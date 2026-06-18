import type { ActivityPageSchema } from './ai';
import type { PaginatedResponse } from './pagination';

export type MarketingPageSourceType = 'product' | 'project' | 'activity' | 'card' | 'package' | 'recommendation' | 'store_topic';
export type MarketingPageStatus = 'draft' | 'published' | 'offline';

export interface MarketingPage {
  id: number;
  storeId?: number | null;
  activityId?: number | null;
  sourceType: MarketingPageSourceType | string;
  sourceId?: string | null;
  title: string;
  slug: string;
  runtimeType: 'h5' | 'miniapp' | 'both' | string;
  pageSchema: ActivityPageSchema;
  snapshotJson?: Record<string, unknown> | null;
  themeJson?: Record<string, unknown> | null;
  shareTitle?: string | null;
  shareDescription?: string | null;
  shareImage?: string | null;
  status: MarketingPageStatus | string;
  shareUrl?: string | null;
  miniappPath?: string | null;
  qrCodeUrl?: string | null;
  aiGenerationId?: string | null;
  promptVersion?: string | null;
  publishedAt?: string | null;
  offlineAt?: string | null;
  createdBy?: number | null;
  createdAt: string;
  updatedAt: string;
  effectSummary?: {
    pv: number;
    uv: number;
    leadCount: number;
    bookingCount: number;
    attributionCount?: number;
    attributedRevenue?: number;
  };
}

export interface MarketingPageInput {
  storeId?: number;
  activityId?: number;
  sourceType: MarketingPageSourceType;
  sourceId?: string | number;
  title: string;
  runtimeType?: 'h5' | 'miniapp' | 'both';
  pageSchema: ActivityPageSchema;
  snapshotJson?: Record<string, unknown>;
  themeJson?: Record<string, unknown>;
  shareTitle?: string;
  shareDescription?: string;
  shareImage?: string;
  aiGenerationId?: string;
  promptVersion?: string;
}

export interface MarketingPageEffects {
  pageId: number;
  pv: number;
  uv: number;
  shareCount: number;
  ctaClickCount: number;
  leadCount: number;
  bookingCount: number;
  attributionCount?: number;
  attributedRevenue?: number;
  conversionRate: string;
  channelStats: Array<{
    channel: string;
    pv: number;
    uv: number;
    leadCount: number;
    bookingCount: number;
  }>;
  dailyTrend: Array<{
    date: string;
    pv: number;
    uv: number;
    leadCount: number;
    bookingCount: number;
  }>;
}

export interface MarketingPageLead {
  id: number;
  pageId: number;
  storeId?: number | null;
  customerId?: number | null;
  sessionId?: string | null;
  name?: string | null;
  phone: string;
  intentType?: string | null;
  message?: string | null;
  channel?: string | null;
  staffId?: number | null;
  status: string;
  convertedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingPageEvent {
  id: number;
  pageId: number;
  storeId?: number | null;
  customerId?: number | null;
  sessionId?: string | null;
  openId?: string | null;
  eventType: string;
  channel?: string | null;
  referrer?: string | null;
  staffId?: number | null;
  campaignId?: string | null;
  source?: string | null;
  medium?: string | null;
  metadataJson?: Record<string, unknown> | null;
  occurredAt: string;
}

export interface MarketingPageAttribution {
  id: number;
  leadId: number;
  customerId: number;
  orderId: number;
  revenue: number;
  touchedAt: string;
  convertedAt: string;
  attributionType: string;
  windowDays: number;
}

export interface MarketingPageAttributionSummary {
  pageId: number;
  attributionCount: number;
  totalRevenue: number;
  averageOrderValue: number;
  attributions: MarketingPageAttribution[];
}

export interface MarketingPageAttributionOverview {
  totalAttributions: number;
  totalRevenue: number;
  byPage: Array<{
    pageId: number;
    title: string;
    sourceType: string;
    count: number;
    revenue: number;
  }>;
}

export type MarketingPagePaginatedResponse = PaginatedResponse<MarketingPage>;
