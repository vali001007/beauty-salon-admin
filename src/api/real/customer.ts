import type {
  Customer,
  CustomerCardPortrait,
  CustomerCreatePayload,
  CustomerConsumptionRecord,
  CustomerHealthProfile,
  CustomerMiniappBehaviorAnalysis,
  CustomerProfile,
  CustomerProfileAnalytics,
  CustomerProfileAnalyticsOverview,
  CustomerProfileBehaviorAnalytics,
  CustomerProfileBehaviorQuery,
  CustomerProfilePredictionAnalytics,
  CustomerProfilePredictionQuery,
  CustomerProfileSegmentAnalytics,
  CustomerProfileSkinAnalytics,
  CustomerUpdatePayload,
} from '@/types';
import apiClient from '../client';

export async function realGetCustomers(params?: { keyword?: string; memberLevel?: string; storeName?: string }): Promise<Customer[]> {
  if (params?.keyword || params?.memberLevel || params?.storeName) {
    const response = await apiClient.get('/customers/paginated', {
      params: {
        page: 1,
        pageSize: 2000,
        ...params,
      },
    }) as unknown as { items?: Customer[] };
    return Array.isArray(response.items) ? response.items : [];
  }
  return apiClient.get('/customers', { params });
}

export async function realGetCustomerById(id: number): Promise<Customer | undefined> {
  return apiClient.get(`/customers/${id}`);
}

export async function realGetCustomerProfile(id: number): Promise<CustomerProfile> {
  return apiClient.get(`/customers/${id}/profile`);
}

export async function realCreateCustomer(data: CustomerCreatePayload): Promise<Customer> {
  return apiClient.post('/customers', data);
}

export async function realUpdateCustomer(id: number, data: CustomerUpdatePayload): Promise<Customer> {
  return apiClient.put(`/customers/${id}`, data);
}

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export async function realGetCustomersPaginated(params: PaginationParams & { keyword?: string; name?: string; phone?: string; memberLevel?: string; storeName?: string }): Promise<PaginatedResponse<Customer>> {
  return apiClient.get('/customers/paginated', { params });
}

export async function realGetCustomerCardPortraits(
  params: PaginationParams & { keyword?: string; name?: string; phone?: string; memberLevel?: string; storeName?: string },
): Promise<PaginatedResponse<CustomerCardPortrait>> {
  return apiClient.get('/customers/card-portraits', { params });
}

import type { ImportResult } from '@/types/excel';

export async function realImportCustomers(data: Record<string, any>[]): Promise<ImportResult> {
  return apiClient.post('/customers/import', { data });
}

export interface CustomerSegmentCountParams {
  storeId?: number;
  segment?: string;
  skinType?: string;
  memberLevel?: string;
  daysSinceLastVisit?: number;
  specialTags?: string[];
}

export interface CustomerSegmentCountResult {
  count: number;
  filters: CustomerSegmentCountParams;
}

export async function realGetCustomerSegmentCount(
  params: CustomerSegmentCountParams = {},
): Promise<CustomerSegmentCountResult> {
  return apiClient.get('/customers/segment-count', { params });
}

export async function realDeleteCustomers(ids: number[]): Promise<void> {
  return apiClient.post('/customers/batch-delete', { ids });
}

export async function realGetCustomerConsumptionRecords(): Promise<CustomerConsumptionRecord[]> {
  return apiClient.get('/customers/consumption-records');
}

export async function realGetCustomerConsumptionRecordsPaginated(
  params: PaginationParams & { keyword?: string } = { page: 1, pageSize: 10 },
): Promise<PaginatedResponse<CustomerConsumptionRecord>> {
  return apiClient.get('/customers/consumption-records/paginated', { params });
}

export async function realGetCustomerHealthProfiles(): Promise<CustomerHealthProfile[]> {
  return apiClient.get('/customers/health-profiles');
}

export async function realUpdateCustomerHealthProfile(
  customerId: number,
  data: Partial<Omit<CustomerHealthProfile, 'id' | 'customerId' | 'name'>>,
): Promise<CustomerHealthProfile> {
  return apiClient.put(`/customers/${customerId}/health-profile`, data);
}

export async function realGetCustomerMiniappBehaviorAnalysis(): Promise<CustomerMiniappBehaviorAnalysis> {
  return apiClient.get('/customers/miniapp-behavior-analysis', {
    timeout: 8000,
    skipRetry: true,
  } as any);
}

export async function realGetCustomerProfileAnalytics(): Promise<CustomerProfileAnalytics> {
  return apiClient.get('/customers/profile-analytics', {
    timeout: 8000,
    skipRetry: true,
  } as any);
}

export async function realGetCustomerProfileAnalyticsOverview(): Promise<CustomerProfileAnalyticsOverview> {
  return apiClient.get('/customers/profile-analytics/overview', {
    timeout: 8000,
    skipRetry: true,
  } as any);
}

export async function realGetCustomerProfileSegmentAnalytics(): Promise<CustomerProfileSegmentAnalytics> {
  return apiClient.get('/customers/profile-analytics/segment', {
    timeout: 8000,
    skipRetry: true,
  } as any);
}

export async function realGetCustomerProfileSkinAnalytics(): Promise<CustomerProfileSkinAnalytics> {
  return apiClient.get('/customers/profile-analytics/skin', {
    timeout: 8000,
    skipRetry: true,
  } as any);
}

export async function realGetCustomerProfileBehaviorAnalytics(
  params: CustomerProfileBehaviorQuery = {},
): Promise<CustomerProfileBehaviorAnalytics> {
  return apiClient.get('/customers/profile-analytics/behavior', {
    params,
    timeout: 8000,
    skipRetry: true,
  } as any);
}

export async function realGetCustomerProfilePredictionAnalytics(
  params: CustomerProfilePredictionQuery = {},
): Promise<CustomerProfilePredictionAnalytics> {
  return apiClient.get('/customers/profile-analytics/prediction', {
    params,
    timeout: 8000,
    skipRetry: true,
  } as any);
}
