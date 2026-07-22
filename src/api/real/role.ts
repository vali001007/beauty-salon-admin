import type { Permission, Role } from '@/types';
import { PERMISSION_CATALOG } from '@/config/permissions';
import apiClient from '../client';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

type ApiRole = Partial<Role> & { key?: string; _count?: { users?: number } };

function normalizeRole(role: ApiRole): Role {
  return {
    ...role,
    id: Number(role.id),
    code: role.code ?? role.key ?? '',
    name: role.name ?? '',
    description: role.description ?? '',
    isSystem: Boolean(role.isSystem),
    userCount: Number(role.userCount ?? role._count?.users ?? 0),
    permissions: role.permissions ?? [],
    platformScopes: role.platformScopes ?? { core: true, assist: false, terminal: false },
    dataScopes: role.dataScopes ?? {
      store: 'none',
      customer: 'none',
      order: 'none',
      booking: 'none',
      inventory: 'none',
      report: 'none',
      device: 'none',
    },
    fieldScopes: role.fieldScopes ?? {
      customerPhone: 'hidden',
      customerWechat: 'hidden',
      customerBalance: 'hidden',
      customerCost: 'hidden',
      customerProfit: 'hidden',
      customerPrivateNote: 'hidden',
      customerRemark: 'hidden',
      staffCommission: 'hidden',
    },
    approvalScopes: role.approvalScopes ?? {
      refund: 'none',
      discount: 'none',
      priceChange: 'none',
      deleteCustomer: 'none',
      exportCustomer: 'none',
      inventoryAdjustment: 'none',
      deviceUnbind: 'none',
    },
  };
}

function toRolePayload(data: Partial<Role>) {
  return {
    key: data.code,
    name: data.name,
    description: data.description,
    permissions: data.permissions,
    platformScopes: data.platformScopes,
    dataScopes: data.dataScopes,
    fieldScopes: data.fieldScopes,
    approvalScopes: data.approvalScopes,
  };
}

export async function realGetRoles(): Promise<Role[]> {
  const roles = await apiClient.get<unknown, ApiRole[]>('/roles');
  return roles.map(normalizeRole);
}

type ApiPermissionCatalogItem = Permission & { riskLevel?: Permission['riskLevel'] };

export async function realGetPermissionCatalog(): Promise<Permission[]> {
  const response = await apiClient.get<unknown, { items?: ApiPermissionCatalogItem[] }>('/roles/permission-catalog');
  const localMetadata = new Map(PERMISSION_CATALOG.map((permission) => [permission.code, permission]));
  return (response.items ?? []).map((permission) => ({
    ...permission,
    ...localMetadata.get(permission.code),
    code: permission.code,
    platform: permission.platform,
    type: permission.type,
    riskLevel: permission.riskLevel,
  }));
}

export async function realCreateRole(data: Omit<Role, 'id'>): Promise<Role> {
  const role = await apiClient.post<unknown, ApiRole>('/roles', toRolePayload(data));
  return normalizeRole(role);
}

export async function realUpdateRole(id: number, data: Partial<Role>): Promise<Role> {
  const role = await apiClient.put<unknown, ApiRole>(`/roles/${id}`, toRolePayload(data));
  return normalizeRole(role);
}

export async function realUpdateRolePermissions(
  roleId: number,
  permissions: string[],
): Promise<void> {
  return apiClient.put(`/roles/${roleId}/permissions`, { permissions });
}

export async function realDeleteRole(id: number): Promise<void> {
  return apiClient.delete(`/roles/${id}`);
}

export async function realGetRolesPaginated(params: PaginationParams): Promise<PaginatedResponse<Role>> {
  const roles = await realGetRoles();
  const total = roles.length;
  const start = (params.page - 1) * params.pageSize;
  const items = roles.slice(start, start + params.pageSize);
  return { items, data: items, total, page: params.page, pageSize: params.pageSize };
}
