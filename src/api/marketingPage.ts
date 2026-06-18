import type {
  MarketingPage,
  MarketingPageAttributionOverview,
  MarketingPageAttributionSummary,
  MarketingPageEvent,
  MarketingPageEffects,
  MarketingPageInput,
  MarketingPageLead,
  MarketingPagePaginatedResponse,
} from '@/types/marketing-page';
import type { PaginationParams } from '@/types/pagination';
import {
  realCreateMarketingPage,
  realDuplicateMarketingPage,
  realGetMarketingPage,
  realGetMarketingPageAttribution,
  realGetMarketingPageAttributionSummary,
  realGetMarketingPageEvents,
  realGetMarketingPageEffects,
  realGetMarketingPageLeads,
  realGetMarketingPagesPaginated,
  realOfflineMarketingPage,
  realPublishMarketingPage,
  realUpdateMarketingPage,
} from './real/marketingPage';

export const getMarketingPagesPaginated: (
  params: PaginationParams & { keyword?: string; status?: string; sourceType?: string; storeId?: number },
) => Promise<MarketingPagePaginatedResponse> = realGetMarketingPagesPaginated;

export const getMarketingPage: (id: number) => Promise<MarketingPage> =
  realGetMarketingPage;

export const createMarketingPage: (data: MarketingPageInput) => Promise<MarketingPage> =
  realCreateMarketingPage;

export const updateMarketingPage: (id: number, data: Partial<MarketingPageInput>) => Promise<MarketingPage> =
  realUpdateMarketingPage;

export const publishMarketingPage: (id: number) => Promise<MarketingPage> =
  realPublishMarketingPage;

export const offlineMarketingPage: (id: number) => Promise<MarketingPage> =
  realOfflineMarketingPage;

export const duplicateMarketingPage: (id: number) => Promise<MarketingPage> =
  realDuplicateMarketingPage;

export const getMarketingPageEffects: (id: number) => Promise<MarketingPageEffects> =
  realGetMarketingPageEffects;

export const getMarketingPageAttribution: (id: number) => Promise<MarketingPageAttributionSummary> =
  realGetMarketingPageAttribution;

export const getMarketingPageAttributionSummary: (params?: {
  storeId?: number;
  startDate?: string;
  endDate?: string;
}) => Promise<MarketingPageAttributionOverview> = realGetMarketingPageAttributionSummary;

export const getMarketingPageLeads: (id: number) => Promise<MarketingPageLead[]> =
  realGetMarketingPageLeads;

export const getMarketingPageEvents: (id: number) => Promise<MarketingPageEvent[]> =
  realGetMarketingPageEvents;
