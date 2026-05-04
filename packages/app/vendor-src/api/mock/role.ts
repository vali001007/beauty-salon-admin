import type { Role } from '@/types';

const MOCK_ROLES: Role[] = [
  {
    id: 1,
    name: '超级管理员',
    code: 'super_admin',
    description: '拥有系统全部权限',
    isSystem: true,
    userCount: 1,
    permissions: ['*'],
  },
  {
    id: 2,
    name: '门店管理员',
    code: 'store_manager',
    description: '管理本店运营',
    isSystem: true,
    userCount: 3,
    permissions: [
      'dashboard:view',
      'customer:view', 'customer:create', 'customer:edit',
      'product:view',
      'order:view', 'order:create',
      'inventory:view',
      'scheduling:view', 'scheduling:edit',
      'marketing:view',
      'store:view',
    ],
  },
  {
    id: 3,
    name: '美容师',
    code: 'beautician',
    description: '查看排班和预约',
    isSystem: true,
    userCount: 12,
    permissions: ['dashboard:view', 'scheduling:view', 'customer:view'],
  },
  {
    id: 4,
    name: '收银员',
    code: 'cashier',
    description: '订单和核销权限',
    isSystem: true,
    userCount: 4,
    permissions: ['dashboard:view', 'order:view', 'order:create', 'card:verify'],
  },
  {
    id: 5,
    name: '库存管理员',
    code: 'inventory_manager',
    description: '库存和采购权限',
    isSystem: true,
    userCount: 2,
    permissions: [
      'dashboard:view',
      'inventory:view', 'inventory:create', 'inventory:edit',
      'product:view',
    ],
  },
];

export async function mockGetRoles(): Promise<Role[]> {
  return [...MOCK_ROLES];
}

export async function mockCreateRole(data: Omit<Role, 'id'>): Promise<Role> {
  const newId = Math.max(...MOCK_ROLES.map((r) => r.id)) + 1;
  const role: Role = { ...data, id: newId };
  MOCK_ROLES.push(role);
  return role;
}

export async function mockUpdateRole(id: number, data: Partial<Role>): Promise<Role> {
  const index = MOCK_ROLES.findIndex((r) => r.id === id);
  if (index === -1) throw new Error('角色不存在');
  MOCK_ROLES[index] = { ...MOCK_ROLES[index], ...data };
  return MOCK_ROLES[index];
}

export async function mockUpdateRolePermissions(
  roleId: number,
  permissions: string[],
): Promise<void> {
  const index = MOCK_ROLES.findIndex((r) => r.id === roleId);
  if (index === -1) throw new Error('角色不存在');
  MOCK_ROLES[index].permissions = permissions;
}
