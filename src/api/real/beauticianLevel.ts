import type { BeauticianLevel } from '../domain-types';
import apiClient from '../client';

export async function realGetBeauticianLevels(): Promise<BeauticianLevel[]> {
  return apiClient.get('/beautician-levels');
}

export async function realCreateBeauticianLevel(data: { name: string; status: '可用' | '停用' }): Promise<BeauticianLevel> {
  return apiClient.post('/beautician-levels', data);
}

export async function realUpdateBeauticianLevel(id: number, data: Partial<{ name: string; status: '可用' | '停用' }>): Promise<BeauticianLevel> {
  return apiClient.put(`/beautician-levels/${id}`, data);
}

export async function realDeleteBeauticianLevels(ids: number[]): Promise<void> {
  return apiClient.post('/beautician-levels/batch-delete', { ids });
}
