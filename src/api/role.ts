import type { Role } from '@/types';
import { mockGetRoles, mockCreateRole, mockUpdateRole, mockUpdateRolePermissions } from './mock/role';
import { realGetRoles, realCreateRole, realUpdateRole, realUpdateRolePermissions } from './real/role';

const isReal = import.meta.env.VITE_API_MODE === 'real';

export const getRoles: () => Promise<Role[]> =
  isReal ? realGetRoles : mockGetRoles;

export const createRole: (data: Omit<Role, 'id'>) => Promise<Role> =
  isReal ? realCreateRole : mockCreateRole;

export const updateRole: (id: number, data: Partial<Role>) => Promise<Role> =
  isReal ? realUpdateRole : mockUpdateRole;

export const updateRolePermissions: (roleId: number, permissions: string[]) => Promise<void> =
  isReal ? realUpdateRolePermissions : mockUpdateRolePermissions;
