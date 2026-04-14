import type { SystemUser } from '@/types';
import apiClient from '../client';

export async function realGetUsers(): Promise<SystemUser[]> {
  return apiClient.get('/users');
}

export async function realCreateUser(data: Omit<SystemUser, 'id' | 'lastLogin' | 'createdAt' | 'status'>): Promise<SystemUser> {
  return apiClient.post('/users', data);
}

export async function realUpdateUser(id: number, data: Partial<SystemUser>): Promise<SystemUser> {
  return apiClient.put(`/users/${id}`, data);
}

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export async function realGetUsersPaginated(params: PaginationParams): Promise<PaginatedResponse<SystemUser>> {
  return apiClient.get('/users/paginated', { params });
}
