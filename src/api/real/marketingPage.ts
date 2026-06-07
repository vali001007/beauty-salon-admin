import apiClient from '../client';
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

export async function realGetMarketingPagesPaginated(
  params: PaginationParams & {
    keyword?: string;
    status?: string;
    sourceType?: string;
    storeId?: number;
  },
): Promise<MarketingPagePaginatedResponse> {
  return apiClient.get('/marketing/pages', { params });
}

export async function realGetMarketingPage(id: number): Promise<MarketingPage> {
  return apiClient.get(`/marketing/pages/${id}`);
}

export async function realCreateMarketingPage(data: MarketingPageInput): Promise<MarketingPage> {
  return apiClient.post('/marketing/pages', data);
}

export async function realUpdateMarketingPage(id: number, data: Partial<MarketingPageInput>): Promise<MarketingPage> {
  return apiClient.put(`/marketing/pages/${id}`, data);
}

export async function realPublishMarketingPage(id: number): Promise<MarketingPage> {
  return apiClient.post(`/marketing/pages/${id}/publish`);
}

export async function realOfflineMarketingPage(id: number): Promise<MarketingPage> {
  return apiClient.post(`/marketing/pages/${id}/offline`);
}

export async function realDuplicateMarketingPage(id: number): Promise<MarketingPage> {
  return apiClient.post(`/marketing/pages/${id}/duplicate`);
}

export async function realGetMarketingPageEffects(id: number): Promise<MarketingPageEffects> {
  return apiClient.get(`/marketing/pages/${id}/effects`);
}

export async function realGetMarketingPageAttribution(id: number): Promise<MarketingPageAttributionSummary> {
  return apiClient.get(`/marketing/pages/${id}/attribution`);
}

export async function realGetMarketingPageAttributionSummary(params?: {
  storeId?: number;
  startDate?: string;
  endDate?: string;
}): Promise<MarketingPageAttributionOverview> {
  return apiClient.get('/marketing/pages/attribution/summary', { params });
}

export async function realGetMarketingPageLeads(id: number): Promise<MarketingPageLead[]> {
  return apiClient.get(`/marketing/pages/${id}/leads`);
}

export async function realGetMarketingPageEvents(id: number): Promise<MarketingPageEvent[]> {
  return apiClient.get(`/marketing/pages/${id}/events`);
}
