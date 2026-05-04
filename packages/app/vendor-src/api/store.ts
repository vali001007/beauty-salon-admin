import type { Store } from '@/types';
import { mockGetStores, mockGetAccessibleStores, mockCreateStore, mockUpdateStore } from './mock/store';
import { realGetStores, realGetAccessibleStores, realCreateStore, realUpdateStore } from './real/store';

const isReal = import.meta.env.VITE_API_MODE === 'real';

export const getStores: () => Promise<Store[]> =
  isReal ? realGetStores : mockGetStores;

export const getAccessibleStores: () => Promise<Store[]> =
  isReal ? realGetAccessibleStores : mockGetAccessibleStores;

export const createStore: (data: Omit<Store, 'id'>) => Promise<Store> =
  isReal ? realCreateStore : mockCreateStore;

export const updateStore: (id: number, data: Partial<Store>) => Promise<Store> =
  isReal ? realUpdateStore : mockUpdateStore;
