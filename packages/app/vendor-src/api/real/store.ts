import type { Store } from '@/types';
import apiClient from '../client';

export async function realGetStores(): Promise<Store[]> {
  return apiClient.get('/stores');
}

export async function realGetAccessibleStores(): Promise<Store[]> {
  return apiClient.get('/stores/accessible');
}

export async function realCreateStore(data: Omit<Store, 'id'>): Promise<Store> {
  return apiClient.post('/stores', data);
}

export async function realUpdateStore(id: number, data: Partial<Store>): Promise<Store> {
  return apiClient.put(`/stores/${id}`, data);
}
