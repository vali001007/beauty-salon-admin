import type { Beautician } from '@/types';
import apiClient from '../client';

export async function realGetBeauticians(params?: { keyword?: string; storeName?: string }): Promise<Beautician[]> {
  return apiClient.get('/beauticians', { params });
}

export async function realGetBeauticianById(id: number): Promise<Beautician | undefined> {
  return apiClient.get(`/beauticians/${id}`);
}

export async function realCreateBeautician(data: Omit<Beautician, 'id' | 'createdAt'>): Promise<Beautician> {
  return apiClient.post('/beauticians', data);
}

export async function realUpdateBeautician(id: number, data: Partial<Beautician>): Promise<Beautician> {
  return apiClient.put(`/beauticians/${id}`, data);
}
