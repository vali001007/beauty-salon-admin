import type { Store } from '@/types';

const MOCK_STORES: Store[] = [
  {
    id: 1,
    name: '总店',
    address: '北京市朝阳区建国路88号',
    skuCount: 120,
    totalValue: 500000,
    healthScore: 95,
    mode: '集中',
  },
  {
    id: 2,
    name: '望京分店',
    address: '北京市朝阳区望京街10号',
    skuCount: 80,
    totalValue: 300000,
    healthScore: 88,
    mode: '独立',
  },
  {
    id: 3,
    name: '国贸分店',
    address: '北京市朝阳区国贸大厦B座',
    skuCount: 95,
    totalValue: 420000,
    healthScore: 92,
    mode: '集中',
  },
];

export async function mockGetStores(): Promise<Store[]> {
  return [...MOCK_STORES];
}

export async function mockGetAccessibleStores(): Promise<Store[]> {
  // In mock mode, return all stores (simulating super_admin)
  return [...MOCK_STORES];
}

export async function mockCreateStore(data: Omit<Store, 'id'>): Promise<Store> {
  const newId = Math.max(...MOCK_STORES.map((s) => s.id)) + 1;
  const store: Store = { ...data, id: newId };
  MOCK_STORES.push(store);
  return store;
}

export async function mockUpdateStore(id: number, data: Partial<Store>): Promise<Store> {
  const index = MOCK_STORES.findIndex((s) => s.id === id);
  if (index === -1) throw new Error('门店不存在');
  MOCK_STORES[index] = { ...MOCK_STORES[index], ...data };
  return MOCK_STORES[index];
}
