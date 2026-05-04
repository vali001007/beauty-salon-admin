import { create } from 'zustand';
import type { Store } from '../types';
import { getAccessibleStores } from '../api/store';

interface StoreState {
  currentStoreId: number | null;
  stores: Store[];
  setCurrentStore: (id: number | null) => void;
  loadStores: () => Promise<void>;
}

export const useStoreStore = create<StoreState>((set) => ({
  currentStoreId: null,
  stores: [],

  setCurrentStore: (id: number | null) => {
    set({ currentStoreId: id });
  },

  loadStores: async () => {
    const stores = await getAccessibleStores();
    set({ stores });
  },
}));
