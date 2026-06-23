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
import {
  realGetCustomers,
  realGetCustomerById,
  realGetCustomerCardPortraits,
  realGetCustomerProfile,
  realCreateCustomer,
  realUpdateCustomer,
  realGetCustomerConsumptionRecords,
  realGetCustomerConsumptionRecordsPaginated,
  realGetCustomerHealthProfiles,
  realUpdateCustomerHealthProfile,
  realGetCustomerMiniappBehaviorAnalysis,
  realGetCustomerProfileAnalytics,
  realGetCustomerProfileAnalyticsOverview,
  realGetCustomerProfileBehaviorAnalytics,
  realGetCustomerProfilePredictionAnalytics,
  realGetCustomerProfileSegmentAnalytics,
  realGetCustomerProfileSkinAnalytics,
  realGetCustomerSegmentCount,
  type CustomerSegmentCountParams,
  type CustomerSegmentCountResult,
} from './real/customer';

export const getCustomers: (params?: { keyword?: string; memberLevel?: string; storeName?: string }) => Promise<Customer[]> =
  realGetCustomers;

export const getCustomerById: (id: number) => Promise<Customer | undefined> =
  realGetCustomerById;

export const getCustomerProfile: (id: number) => Promise<CustomerProfile> =
  realGetCustomerProfile;

export const createCustomer: (data: CustomerCreatePayload) => Promise<Customer> =
  realCreateCustomer;

export const updateCustomer: (id: number, data: CustomerUpdatePayload) => Promise<Customer> =
  realUpdateCustomer;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import { realGetCustomersPaginated } from './real/customer';

export const getCustomersPaginated: (params: PaginationParams & { keyword?: string; name?: string; phone?: string; memberLevel?: string; storeName?: string }) => Promise<PaginatedResponse<Customer>> =
  realGetCustomersPaginated;

export const getCustomerCardPortraits: (
  params: PaginationParams & { keyword?: string; name?: string; phone?: string; memberLevel?: string; storeName?: string },
) => Promise<PaginatedResponse<CustomerCardPortrait>> = realGetCustomerCardPortraits;

import type { ImportResult } from '@/types/excel';
import { realImportCustomers } from './real/customer';

export const importCustomers: (data: Record<string, any>[]) => Promise<ImportResult> =
  realImportCustomers;

import { realDeleteCustomers } from './real/customer';

export const deleteCustomers: (ids: number[]) => Promise<void> =
  realDeleteCustomers;

export const getCustomerConsumptionRecords: () => Promise<CustomerConsumptionRecord[]> =
  realGetCustomerConsumptionRecords;

export const getCustomerConsumptionRecordsPaginated: (
  params: PaginationParams & { keyword?: string },
) => Promise<PaginatedResponse<CustomerConsumptionRecord>> = realGetCustomerConsumptionRecordsPaginated;

export const getCustomerHealthProfiles: () => Promise<CustomerHealthProfile[]> =
  realGetCustomerHealthProfiles;

export type CustomerHealthProfilePayload = Partial<Omit<CustomerHealthProfile, 'id' | 'customerId' | 'name'>>;

export const updateCustomerHealthProfile: (
  customerId: number,
  data: CustomerHealthProfilePayload,
) => Promise<CustomerHealthProfile> = realUpdateCustomerHealthProfile;

export const getCustomerMiniappBehaviorAnalysis: () => Promise<CustomerMiniappBehaviorAnalysis> =
  realGetCustomerMiniappBehaviorAnalysis;

export const getCustomerProfileAnalytics: () => Promise<CustomerProfileAnalytics> =
  realGetCustomerProfileAnalytics;

export const getCustomerProfileAnalyticsOverview: () => Promise<CustomerProfileAnalyticsOverview> =
  realGetCustomerProfileAnalyticsOverview;

export const getCustomerProfileSegmentAnalytics: () => Promise<CustomerProfileSegmentAnalytics> =
  realGetCustomerProfileSegmentAnalytics;

export const getCustomerProfileSkinAnalytics: () => Promise<CustomerProfileSkinAnalytics> =
  realGetCustomerProfileSkinAnalytics;

export const getCustomerProfileBehaviorAnalytics: (
  params?: CustomerProfileBehaviorQuery,
) => Promise<CustomerProfileBehaviorAnalytics> = realGetCustomerProfileBehaviorAnalytics;

export const getCustomerProfilePredictionAnalytics: (
  params?: CustomerProfilePredictionQuery,
) => Promise<CustomerProfilePredictionAnalytics> = realGetCustomerProfilePredictionAnalytics;

export type { CustomerSegmentCountParams, CustomerSegmentCountResult };

export const getCustomerSegmentCount: (
  params?: CustomerSegmentCountParams,
) => Promise<CustomerSegmentCountResult> = realGetCustomerSegmentCount;
