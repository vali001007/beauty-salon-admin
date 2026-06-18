import type { Store } from '@/types';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import apiClient from '../client';
import { extractArray, normalizePaginatedResponse } from './response';

function normalizeStore(store: Partial<Store> & { id: number; name: string }): Store {
  return {
    ...store,
    city: store.city ?? '',
    address: store.address ?? '',
    phone: store.phone ?? '',
    status: store.status ?? 'active',
    shiftRequired: store.shiftRequired !== false,
    skuCount: Number(store.skuCount ?? 0),
    totalValue: Number(store.totalValue ?? 0),
    healthScore: Number(store.healthScore ?? 0),
    mode: store.mode ?? '独立',
  };
}

export type StoreMutationPayload = Pick<Store, 'name'> &
  Partial<Pick<Store, 'city' | 'address' | 'phone' | 'status' | 'shiftRequired'>>;

export async function realGetStores(): Promise<Store[]> {
  const response = await apiClient.get<unknown, unknown>('/stores');
  return extractArray<Store>(response).map(normalizeStore);
}

export async function realGetAccessibleStores(): Promise<Store[]> {
  const response = await apiClient.get<unknown, unknown>('/stores/accessible');
  return extractArray<Store>(response).map(normalizeStore);
}

export async function realCreateStore(data: StoreMutationPayload): Promise<Store> {
  const store = await apiClient.post<unknown, Store>('/stores', data);
  return normalizeStore(store);
}

export async function realUpdateStore(id: number, data: Partial<StoreMutationPayload>): Promise<Store> {
  const store = await apiClient.put<unknown, Store>(`/stores/${id}`, data);
  return normalizeStore(store);
}

export async function realDeleteStore(id: number): Promise<void> {
  return apiClient.delete(`/stores/${id}`);
}

export async function realGetStoresPaginated(params: PaginationParams): Promise<PaginatedResponse<Store>> {
  const response = await apiClient.get<unknown, unknown>('/stores/paginated', { params });
  return normalizePaginatedResponse<Store, Store>(response, normalizeStore);
}
