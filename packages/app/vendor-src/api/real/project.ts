import type { Project } from '@/types';
import apiClient from '../client';

export async function realGetProjects(params?: { keyword?: string; type?: string }): Promise<Project[]> {
  return apiClient.get('/projects', { params });
}

export async function realGetProjectById(id: number): Promise<Project | undefined> {
  return apiClient.get(`/projects/${id}`);
}

export async function realCreateProject(data: Omit<Project, 'id'>): Promise<Project> {
  return apiClient.post('/projects', data);
}

export async function realUpdateProject(id: number, data: Partial<Project>): Promise<Project> {
  return apiClient.put(`/projects/${id}`, data);
}

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export async function realGetReservationsPaginated(params: PaginationParams & { storeName?: string; userName?: string; projectName?: string; status?: string }): Promise<PaginatedResponse<any>> {
  return apiClient.get('/reservations/paginated', { params });
}
