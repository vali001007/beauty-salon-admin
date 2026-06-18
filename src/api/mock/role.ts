import type { Role } from '@/types';
import { createDefaultRole, DEFAULT_APPROVAL_SCOPES, DEFAULT_DATA_SCOPES, DEFAULT_FIELD_SCOPES, DEFAULT_PLATFORM_SCOPES, normalizePermissions, ROLE_PERMISSIONS } from '@/config/permissions';

const buildRole = (
  role: Omit<Role, 'id'> & Partial<Pick<Role, 'id'>>,
): Role => ({
  id: role.id ?? 0,
  name: role.name,
  code: role.code,
  description: role.description,
  isSystem: role.isSystem,
  userCount: role.userCount,
  permissions: normalizePermissions(role.permissions),
  platformScopes: role.platformScopes ?? DEFAULT_PLATFORM_SCOPES[role.code] ?? { core: false, assist: false, terminal: false },
  dataScopes: role.dataScopes ?? DEFAULT_DATA_SCOPES[role.code] ?? createDefaultRole(role.code, role.name, role.description, role.isSystem, role.userCount).dataScopes,
  fieldScopes: role.fieldScopes ?? DEFAULT_FIELD_SCOPES[role.code] ?? createDefaultRole(role.code, role.name, role.description, role.isSystem, role.userCount).fieldScopes,
  approvalScopes: role.approvalScopes ?? DEFAULT_APPROVAL_SCOPES[role.code] ?? createDefaultRole(role.code, role.name, role.description, role.isSystem, role.userCount).approvalScopes,
});

const MOCK_ROLES: Role[] = [
  buildRole({
    id: 1,
    name: '超级管理员',
    code: 'super_admin',
    description: '拥有系统全部权限',
    isSystem: true,
    userCount: 1,
    permissions: ['*'],
    platformScopes: DEFAULT_PLATFORM_SCOPES.super_admin,
    dataScopes: DEFAULT_DATA_SCOPES.super_admin,
    fieldScopes: DEFAULT_FIELD_SCOPES.super_admin,
    approvalScopes: DEFAULT_APPROVAL_SCOPES.super_admin,
  }),
  buildRole({
    id: 2,
    name: '门店经理',
    code: 'store_manager',
    description: '管理本店运营',
    isSystem: true,
    userCount: 3,
    permissions: ROLE_PERMISSIONS.store_manager,
    platformScopes: DEFAULT_PLATFORM_SCOPES.store_manager,
    dataScopes: DEFAULT_DATA_SCOPES.store_manager,
    fieldScopes: DEFAULT_FIELD_SCOPES.store_manager,
    approvalScopes: DEFAULT_APPROVAL_SCOPES.store_manager,
  }),
  buildRole({
    id: 3,
    name: '美容师',
    code: 'beautician',
    description: '查看排班和预约',
    isSystem: true,
    userCount: 12,
    permissions: ROLE_PERMISSIONS.beautician,
    platformScopes: DEFAULT_PLATFORM_SCOPES.beautician,
    dataScopes: DEFAULT_DATA_SCOPES.beautician,
    fieldScopes: DEFAULT_FIELD_SCOPES.beautician,
    approvalScopes: DEFAULT_APPROVAL_SCOPES.beautician,
  }),
  buildRole({
    id: 4,
    name: '收银员',
    code: 'cashier',
    description: '订单和核销权限',
    isSystem: true,
    userCount: 4,
    permissions: ROLE_PERMISSIONS.cashier,
    platformScopes: DEFAULT_PLATFORM_SCOPES.cashier,
    dataScopes: DEFAULT_DATA_SCOPES.cashier,
    fieldScopes: DEFAULT_FIELD_SCOPES.cashier,
    approvalScopes: DEFAULT_APPROVAL_SCOPES.cashier,
  }),
  buildRole({
    id: 5,
    name: '库存管理员',
    code: 'inventory_manager',
    description: '库存和采购权限',
    isSystem: true,
    userCount: 2,
    permissions: ROLE_PERMISSIONS.inventory_manager,
    platformScopes: DEFAULT_PLATFORM_SCOPES.inventory_manager,
    dataScopes: DEFAULT_DATA_SCOPES.inventory_manager,
    fieldScopes: DEFAULT_FIELD_SCOPES.inventory_manager,
    approvalScopes: DEFAULT_APPROVAL_SCOPES.inventory_manager,
  }),
];

export async function mockGetRoles(): Promise<Role[]> {
  return [...MOCK_ROLES];
}

export async function mockCreateRole(data: Omit<Role, 'id'>): Promise<Role> {
  const newId = Math.max(...MOCK_ROLES.map((r) => r.id)) + 1;
  const role = buildRole({ ...data, id: newId });
  MOCK_ROLES.push(role);
  return role;
}

export async function mockUpdateRole(id: number, data: Partial<Role>): Promise<Role> {
  const index = MOCK_ROLES.findIndex((r) => r.id === id);
  if (index === -1) throw new Error('角色不存在');
  MOCK_ROLES[index] = buildRole({ ...MOCK_ROLES[index], ...data, id });
  return MOCK_ROLES[index];
}

export async function mockUpdateRolePermissions(
  roleId: number,
  permissions: string[],
): Promise<void> {
  const index = MOCK_ROLES.findIndex((r) => r.id === roleId);
  if (index === -1) throw new Error('角色不存在');
  MOCK_ROLES[index] = {
    ...MOCK_ROLES[index],
    permissions: normalizePermissions(permissions),
  };
}

export async function mockDeleteRole(id: number): Promise<void> {
  const index = MOCK_ROLES.findIndex((r) => r.id === id);
  if (index === -1) throw new Error('角色不存在');
  if (MOCK_ROLES[index].isSystem) throw new Error('系统角色不可删除');
  MOCK_ROLES.splice(index, 1);
}

import { createPaginatedResponse, type PaginatedResponse, type PaginationParams } from '@/types/pagination';

export async function mockGetRolesPaginated(params: PaginationParams): Promise<PaginatedResponse<Role>> {
  const all = [...MOCK_ROLES];
  const total = all.length;
  const start = (params.page - 1) * params.pageSize;
  const data = all.slice(start, start + params.pageSize);
  return createPaginatedResponse(data, total, params.page, params.pageSize);
}
