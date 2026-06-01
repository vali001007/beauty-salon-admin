import type { Customer, CustomerConsumptionRecord, CustomerHealthProfile } from '@/types';
import { realGetCustomers, realGetCustomerById, realCreateCustomer, realUpdateCustomer, realGetCustomerConsumptionRecords, realGetCustomerHealthProfiles, realUpdateCustomerHealthProfile } from './real/customer';

export const getCustomers: (params?: { keyword?: string; memberLevel?: string; storeName?: string }) => Promise<Customer[]> =
  realGetCustomers;

export const getCustomerById: (id: number) => Promise<Customer | undefined> =
  realGetCustomerById;

export const createCustomer: (data: Omit<Customer, 'id' | 'totalSpent' | 'visitCount' | 'lastVisitDate' | 'createdAt'>) => Promise<Customer> =
  realCreateCustomer;

export const updateCustomer: (id: number, data: Partial<Customer>) => Promise<Customer> =
  realUpdateCustomer;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import { realGetCustomersPaginated } from './real/customer';

export const getCustomersPaginated: (params: PaginationParams & { keyword?: string; memberLevel?: string; storeName?: string }) => Promise<PaginatedResponse<Customer>> =
  realGetCustomersPaginated;

import type { ImportResult } from '@/types/excel';
import { realImportCustomers } from './real/customer';

export const importCustomers: (data: Record<string, any>[]) => Promise<ImportResult> =
  realImportCustomers;

import { realDeleteCustomers } from './real/customer';

export const deleteCustomers: (ids: number[]) => Promise<void> =
  realDeleteCustomers;

export const getCustomerConsumptionRecords: () => Promise<CustomerConsumptionRecord[]> =
  realGetCustomerConsumptionRecords;

export const getCustomerHealthProfiles: () => Promise<CustomerHealthProfile[]> =
  realGetCustomerHealthProfiles;

export type CustomerHealthProfilePayload = Partial<Omit<CustomerHealthProfile, 'id' | 'customerId' | 'name'>>;

export const updateCustomerHealthProfile: (
  customerId: number,
  data: CustomerHealthProfilePayload,
) => Promise<CustomerHealthProfile> = realUpdateCustomerHealthProfile;
