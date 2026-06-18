import type { ProjectType } from '../domain-types';
import apiClient from '../client';

type ApiProjectType = Omit<Partial<ProjectType>, 'status'> & {
  status?: ProjectType['status'] | 'active' | 'inactive' | 'disabled';
  createdAt?: string;
};

function normalizeProjectType(item: ApiProjectType): ProjectType {
  return {
    id: Number(item.id),
    name: item.name ?? '',
    description: item.description ?? '',
    status: item.status === '启用' || item.status === 'active' ? '启用' : '停用',
    createTime: item.createTime ?? item.createdAt ?? '',
  };
}

function normalizeProjectTypePayload<T extends { status?: '启用' | '停用' }>(data: T) {
  return {
    ...data,
    status: data.status === '启用' ? 'active' : data.status === '停用' ? 'inactive' : data.status,
  };
}

export async function realGetProjectTypes(): Promise<ProjectType[]> {
  const response = await apiClient.get<unknown, ApiProjectType[]>('/project-types');
  return response.map(normalizeProjectType);
}

export async function realCreateProjectType(data: { name: string; description: string; status: '启用' | '停用' }): Promise<ProjectType> {
  const response = await apiClient.post<unknown, ApiProjectType>('/project-types', normalizeProjectTypePayload(data));
  return normalizeProjectType(response);
}

export async function realUpdateProjectType(id: number, data: Partial<{ name: string; description: string; status: '启用' | '停用' }>): Promise<ProjectType> {
  const response = await apiClient.put<unknown, ApiProjectType>(`/project-types/${id}`, normalizeProjectTypePayload(data));
  return normalizeProjectType(response);
}

export async function realDeleteProjectTypes(ids: number[]): Promise<void> {
  return apiClient.post('/project-types/batch-delete', { ids });
}
