import type { Permission, Role } from '@/types';
import { realGetRoles, realCreateRole, realUpdateRole, realUpdateRolePermissions, realDeleteRole, realGetRolesPaginated, realGetPermissionCatalog } from './real/role';

export const getPermissionCatalog: () => Promise<Permission[]> = realGetPermissionCatalog;

export const getRoles: () => Promise<Role[]> =
  realGetRoles;

export const createRole: (data: Omit<Role, 'id'>) => Promise<Role> =
  realCreateRole;

export const updateRole: (id: number, data: Partial<Role>) => Promise<Role> =
  realUpdateRole;

export const updateRolePermissions: (roleId: number, permissions: string[]) => Promise<void> =
  realUpdateRolePermissions;

export const deleteRole: (id: number) => Promise<void> =
  realDeleteRole;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export const getRolesPaginated: (params: PaginationParams) => Promise<PaginatedResponse<Role>> =
  realGetRolesPaginated;
