import type { Store } from '@/types';
import { hasPermission } from '@/config/permissions';
import { mockGetUserInfo } from './auth';

const MOCK_STORES: Store[] = [
  {
    id: 1,
    name: '凤仪阁美容养生会所',
    address: '北京市朝阳区建国路88号',
    skuCount: 126,
    totalValue: 520000,
    healthScore: 93,
    mode: '集中',
  },
  {
    id: 2,
    name: '心悦美容养生会所',
    address: '北京市朝阳区望京街10号',
    skuCount: 98,
    totalValue: 360000,
    healthScore: 89,
    mode: '独立',
  },
  {
    id: 3,
    name: '兰亭美容SPA馆',
    address: '北京市朝阳区国贸大厦B座',
    skuCount: 86,
    totalValue: 310000,
    healthScore: 91,
    mode: '独立',
  },
  {
    id: 4,
    name: '心悦芸美容养生会所',
    address: '北京市朝阳区太阳宫中路16号',
    skuCount: 104,
    totalValue: 390000,
    healthScore: 90,
    mode: '集中',
  },
];

export async function mockGetStores(): Promise<Store[]> {
  return [...MOCK_STORES];
}

export async function mockGetAccessibleStores(): Promise<Store[]> {
  const user = await mockGetUserInfo();
  if (hasPermission(user.permissions, '*')) {
    return [...MOCK_STORES];
  }
  return MOCK_STORES.filter((store) => user.storeIds.includes(store.id));
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

export async function mockDeleteStore(id: number): Promise<void> {
  const index = MOCK_STORES.findIndex((s) => s.id === id);
  if (index === -1) throw new Error('门店不存在');
  MOCK_STORES.splice(index, 1);
}

import { createPaginatedResponse, type PaginatedResponse, type PaginationParams } from '@/types/pagination';

export async function mockGetStoresPaginated(params: PaginationParams): Promise<PaginatedResponse<Store>> {
  const all = [...MOCK_STORES];
  const total = all.length;
  const start = (params.page - 1) * params.pageSize;
  const data = all.slice(start, start + params.pageSize);
  return createPaginatedResponse(data, total, params.page, params.pageSize);
}
