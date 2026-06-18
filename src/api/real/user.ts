import type { SystemUser, SystemUserCreateInput, SystemUserUpdateInput } from '@/types';
import {
  DEFAULT_APPROVAL_SCOPES,
  DEFAULT_DATA_SCOPES,
  DEFAULT_FIELD_SCOPES,
  DEFAULT_PLATFORM_SCOPES,
  ROLE_PERMISSIONS,
  normalizePermissions,
} from '@/config/permissions';
import apiClient from '../client';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import { extractArray, normalizePaginatedResponse } from './response';

type ApiUserRole = { roleId?: number; role?: { id?: number; key?: string; permissions?: string[] } };
type ApiUserStore = { storeId?: number; store?: { id?: number } };
type ApiSystemUser = Omit<Partial<SystemUser>, 'roles' | 'stores' | 'status'> & {
  roles?: Array<string | ApiUserRole>;
  stores?: Array<number | ApiUserStore>;
  status?: SystemUser['status'] | 'active' | 'disabled';
};

function normalizeUser(user: ApiSystemUser): SystemUser {
  const rawStatus = String(user.status ?? '');
  const roles = (user.roles ?? [])
    .map((item) => (typeof item === 'string' ? item : item.role?.key))
    .filter(Boolean) as string[];
  const storeIds = user.storeIds ?? (user.stores ?? [])
    .map((item) => (typeof item === 'number' ? item : item.storeId ?? item.store?.id))
    .filter((id): id is number => typeof id === 'number');
  const primaryRole = user.primaryRole ?? roles[0] ?? 'store_manager';
  const rolePermissions = (user.roles ?? [])
    .flatMap((item) => (typeof item === 'string' ? ROLE_PERMISSIONS[item] ?? [] : item.role?.permissions ?? []));

  return {
    id: Number(user.id),
    username: user.username ?? '',
    name: user.name ?? '',
    phone: user.phone ?? '',
    email: user.email ?? '',
    primaryRole,
    roles,
    extraPermissions: normalizePermissions(user.extraPermissions ?? rolePermissions),
    deniedPermissions: user.deniedPermissions ?? [],
    storeIds,
    status: rawStatus === 'disabled' || rawStatus === '禁用' ? '禁用' : '启用',
    lastLogin: user.lastLogin ?? '-',
    createdAt: typeof user.createdAt === 'string' ? user.createdAt.slice(0, 10) : '',
    platformScopes: user.platformScopes ?? DEFAULT_PLATFORM_SCOPES[primaryRole] ?? DEFAULT_PLATFORM_SCOPES.store_manager,
    dataScopes: user.dataScopes ?? DEFAULT_DATA_SCOPES[primaryRole] ?? DEFAULT_DATA_SCOPES.store_manager,
    fieldScopes: user.fieldScopes ?? DEFAULT_FIELD_SCOPES[primaryRole] ?? DEFAULT_FIELD_SCOPES.store_manager,
    approvalScopes: user.approvalScopes ?? DEFAULT_APPROVAL_SCOPES[primaryRole] ?? DEFAULT_APPROVAL_SCOPES.store_manager,
  };
}

async function getRoleIdsByKeys(roleKeys: string[]): Promise<number[]> {
  if (!roleKeys.length) return [];
  const roles = await apiClient.get<unknown, Array<{ id: number; key?: string; code?: string }>>('/roles');
  return roles
    .filter((role) => roleKeys.includes(role.key ?? role.code ?? ''))
    .map((role) => role.id);
}

async function toUserPayload(data: SystemUserUpdateInput & { username?: string }) {
  const roleIds = data.roles ? await getRoleIdsByKeys(data.roles) : undefined;
  const payload: Record<string, unknown> = {
    username: data.username,
    name: data.name,
    phone: data.phone,
    email: data.email,
    status: data.status === '禁用' ? 'disabled' : data.status === '启用' ? 'active' : data.status,
    roleIds,
    storeIds: data.storeIds,
  };
  if (data.password) payload.password = data.password;
  return payload;
}

export async function realGetUsers(): Promise<SystemUser[]> {
  const response = await apiClient.get<unknown, unknown>('/users');
  return extractArray<ApiSystemUser>(response).map(normalizeUser);
}

export async function realCreateUser(data: SystemUserCreateInput): Promise<SystemUser> {
  if (!data.password?.trim()) {
    throw new Error('创建用户必须设置初始密码');
  }
  const user = await apiClient.post<unknown, ApiSystemUser>('/users', await toUserPayload(data));
  return normalizeUser(user);
}

export async function realUpdateUser(id: number, data: SystemUserUpdateInput): Promise<SystemUser> {
  const user = await apiClient.put<unknown, ApiSystemUser>(`/users/${id}`, await toUserPayload(data));
  return normalizeUser(user);
}

export async function realDeleteUser(id: number): Promise<void> {
  return apiClient.delete(`/users/${id}`);
}

export async function realResetPassword(id: number, newPassword: string): Promise<void> {
  return apiClient.post(`/users/${id}/reset-password`, { password: newPassword });
}

export async function realGetUsersPaginated(params: PaginationParams): Promise<PaginatedResponse<SystemUser>> {
  const response = await apiClient.get<unknown, unknown>('/users/paginated', { params });
  return normalizePaginatedResponse<ApiSystemUser, SystemUser>(response, normalizeUser);
}
