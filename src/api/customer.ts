import type { Customer } from '@/types';
import { mockGetCustomers, mockGetCustomerById, mockCreateCustomer, mockUpdateCustomer } from './mock/customer';
import { realGetCustomers, realGetCustomerById, realCreateCustomer, realUpdateCustomer } from './real/customer';

const isReal = import.meta.env.VITE_API_MODE === 'real';

export const getCustomers: (params?: { keyword?: string; memberLevel?: string; storeName?: string }) => Promise<Customer[]> =
  isReal ? realGetCustomers : mockGetCustomers;

export const getCustomerById: (id: number) => Promise<Customer | undefined> =
  isReal ? realGetCustomerById : mockGetCustomerById;

export const createCustomer: (data: Omit<Customer, 'id' | 'totalSpent' | 'visitCount' | 'lastVisitDate' | 'createdAt'>) => Promise<Customer> =
  isReal ? realCreateCustomer : mockCreateCustomer;

export const updateCustomer: (id: number, data: Partial<Customer>) => Promise<Customer> =
  isReal ? realUpdateCustomer : mockUpdateCustomer;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import { mockGetCustomersPaginated } from './mock/customer';
import { realGetCustomersPaginated } from './real/customer';

export const getCustomersPaginated: (params: PaginationParams & { keyword?: string; memberLevel?: string; storeName?: string }) => Promise<PaginatedResponse<Customer>> =
  isReal ? realGetCustomersPaginated : mockGetCustomersPaginated;

import type { ImportResult } from '@/types/excel';
import { mockImportCustomers } from './mock/customer';
import { realImportCustomers } from './real/customer';

export const importCustomers: (data: Record<string, any>[]) => Promise<ImportResult> =
  isReal ? realImportCustomers : mockImportCustomers;

import { mockDeleteCustomers } from './mock/customer';
import { realDeleteCustomers } from './real/customer';

export const deleteCustomers: (ids: number[]) => Promise<void> =
  isReal ? realDeleteCustomers : mockDeleteCustomers;
