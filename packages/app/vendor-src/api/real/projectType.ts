import type { ProjectType } from '../mock/projectType';
import apiClient from '../client';

export async function realGetProjectTypes(): Promise<ProjectType[]> {
  return apiClient.get('/project-types');
}

export async function realCreateProjectType(data: { name: string; description: string; status: '启用' | '停用' }): Promise<ProjectType> {
  return apiClient.post('/project-types', data);
}

export async function realUpdateProjectType(id: number, data: Partial<{ name: string; description: string; status: '启用' | '停用' }>): Promise<ProjectType> {
  return apiClient.put(`/project-types/${id}`, data);
}

export async function realDeleteProjectTypes(ids: number[]): Promise<void> {
  return apiClient.post('/project-types/batch-delete', { ids });
}
