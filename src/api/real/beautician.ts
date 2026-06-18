import type { Beautician } from '@/types';
import apiClient from '../client';
import { extractArray, normalizePaginatedResponse } from './response';

type ApiBeautician = Omit<Partial<Beautician>, 'level' | 'status'> & {
  store?: { name?: string };
  level?: string | { name?: string };
  status?: Beautician['status'] | 'active' | 'inactive' | 'disabled';
};

function normalizeBeautician(item: ApiBeautician): Beautician {
  const rawStatus = String(item.status ?? '');
  return {
    id: Number(item.id),
    userId: item.userId,
    name: item.name ?? '',
    phone: item.phone ?? '',
    level: typeof item.level === 'string' ? item.level : item.level?.name ?? '美容师',
    specialties: item.specialties ?? ['面部护理', '肌肤管理'],
    status: rawStatus === 'active' || rawStatus === '在职' ? '在职' : rawStatus === '休假' ? '休假' : '离职',
    storeName: item.storeName ?? item.store?.name ?? '',
    joinDate: item.joinDate ?? (typeof item.createdAt === 'string' ? item.createdAt.slice(0, 10) : ''),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt.slice(0, 10) : '',
  };
}

export async function realGetBeauticians(params?: { keyword?: string; storeName?: string }): Promise<Beautician[]> {
  const response = await apiClient.get<unknown, unknown>('/beauticians', { params });
  return extractArray<ApiBeautician>(response).map(normalizeBeautician);
}

export async function realGetBeauticianById(id: number): Promise<Beautician | undefined> {
  const item = await apiClient.get<unknown, ApiBeautician>(`/beauticians/${id}`);
  return normalizeBeautician(item);
}

export async function realCreateBeautician(data: Omit<Beautician, 'id' | 'createdAt'>): Promise<Beautician> {
  const item = await apiClient.post<unknown, ApiBeautician>('/beauticians', data);
  return normalizeBeautician(item);
}

export async function realUpdateBeautician(id: number, data: Partial<Beautician>): Promise<Beautician> {
  const item = await apiClient.put<unknown, ApiBeautician>(`/beauticians/${id}`, data);
  return normalizeBeautician(item);
}

export async function realDeleteBeautician(id: number): Promise<void> {
  return apiClient.delete(`/beauticians/${id}`);
}

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export async function realGetBeauticiansPaginated(params: PaginationParams & { keyword?: string; storeName?: string }): Promise<PaginatedResponse<Beautician>> {
  const response = await apiClient.get<unknown, unknown>('/beauticians/paginated', { params });
  return normalizePaginatedResponse<ApiBeautician, Beautician>(response, normalizeBeautician);
}
