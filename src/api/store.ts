import type { Store } from '@/types';
import {
  realGetStores,
  realGetAccessibleStores,
  realCreateStore,
  realUpdateStore,
  realDeleteStore,
  realGetStoresPaginated,
  type StoreMutationPayload,
} from './real/store';

export const getStores: () => Promise<Store[]> =
  realGetStores;

export const getAccessibleStores: () => Promise<Store[]> =
  realGetAccessibleStores;

export const createStore: (data: StoreMutationPayload) => Promise<Store> =
  realCreateStore;

export const updateStore: (id: number, data: Partial<StoreMutationPayload>) => Promise<Store> =
  realUpdateStore;

export const deleteStore: (id: number) => Promise<void> =
  realDeleteStore;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export const getStoresPaginated: (params: PaginationParams) => Promise<PaginatedResponse<Store>> =
  realGetStoresPaginated;
