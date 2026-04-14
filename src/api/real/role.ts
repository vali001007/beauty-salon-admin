import type { Role } from '@/types';
import apiClient from '../client';

export async function realGetRoles(): Promise<Role[]> {
  return apiClient.get('/roles');
}

export async function realCreateRole(data: Omit<Role, 'id'>): Promise<Role> {
  return apiClient.post('/roles', data);
}

export async function realUpdateRole(id: number, data: Partial<Role>): Promise<Role> {
  return apiClient.put(`/roles/${id}`, data);
}

export async function realUpdateRolePermissions(
  roleId: number,
  permissions: string[],
): Promise<void> {
  return apiClient.put(`/roles/${roleId}/permissions`, { permissions });
}
