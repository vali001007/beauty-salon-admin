import { create } from 'zustand';
import { getAccessibleStores } from '@/api/store';
import type { Store } from '@/types';

interface StoreState {
  currentStoreId: number | null;
  stores: Store[];
  setCurrentStore: (id: number | null) => void;
  loadStores: () => Promise<void>;
}

export const useStoreStore = create<StoreState>((set) => ({
  currentStoreId: null,
  stores: [],

  setCurrentStore: (id) => {
    set({ currentStoreId: id });
  },

  loadStores: async () => {
    const stores = await getAccessibleStores();
    set({ stores });
  },
}));
