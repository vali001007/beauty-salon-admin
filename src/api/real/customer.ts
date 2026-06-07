import type {
  Customer,
  CustomerConsumptionRecord,
  CustomerHealthProfile,
  CustomerMiniappBehaviorAnalysis,
} from '@/types';
import apiClient from '../client';

export async function realGetCustomers(params?: { keyword?: string; memberLevel?: string; storeName?: string }): Promise<Customer[]> {
  return apiClient.get('/customers', { params });
}

export async function realGetCustomerById(id: number): Promise<Customer | undefined> {
  return apiClient.get(`/customers/${id}`);
}

export async function realCreateCustomer(data: Omit<Customer, 'id' | 'totalSpent' | 'visitCount' | 'lastVisitDate' | 'createdAt'>): Promise<Customer> {
  return apiClient.post('/customers', data);
}

export async function realUpdateCustomer(id: number, data: Partial<Customer>): Promise<Customer> {
  return apiClient.put(`/customers/${id}`, data);
}

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export async function realGetCustomersPaginated(params: PaginationParams & { keyword?: string; memberLevel?: string; storeName?: string }): Promise<PaginatedResponse<Customer>> {
  return apiClient.get('/customers/paginated', { params });
}

import type { ImportResult } from '@/types/excel';

export async function realImportCustomers(data: Record<string, any>[]): Promise<ImportResult> {
  return apiClient.post('/customers/import', { data });
}

export async function realDeleteCustomers(ids: number[]): Promise<void> {
  return apiClient.post('/customers/batch-delete', { ids });
}

export async function realGetCustomerConsumptionRecords(): Promise<CustomerConsumptionRecord[]> {
  return apiClient.get('/customers/consumption-records');
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
  return apiClient.get('/customers/miniapp-behavior-analysis');
}
