import type { SystemUser, SystemUserCreateInput, SystemUserUpdateInput } from '@/types';
import { createPaginatedResponse, type PaginatedResponse, type PaginationParams } from '@/types/pagination';
import { DEFAULT_APPROVAL_SCOPES, DEFAULT_DATA_SCOPES, DEFAULT_FIELD_SCOPES, DEFAULT_PLATFORM_SCOPES, ROLE_PERMISSIONS } from '@/config/permissions';

const MOCK_USERS: SystemUser[] = [
  {
    id: 1,
    username: 'admin',
    name: '张管理员',
    phone: '13800000001',
    email: 'admin@beauty.com',
    primaryRole: 'super_admin',
    roles: ['super_admin'],
    extraPermissions: ['*'],
    storeIds: [],
    status: '启用',
    lastLogin: '2026-03-31 09:15',
    createdAt: '2023-01-01',
    platformScopes: DEFAULT_PLATFORM_SCOPES.super_admin,
    dataScopes: DEFAULT_DATA_SCOPES.super_admin,
    fieldScopes: DEFAULT_FIELD_SCOPES.super_admin,
    approvalScopes: DEFAULT_APPROVAL_SCOPES.super_admin,
  },
  {
    id: 2,
    username: 'store_mgr_01',
    name: '李店长',
    phone: '13900000002',
    email: 'li@beauty.com',
    primaryRole: 'store_manager',
    roles: ['store_manager'],
    extraPermissions: ROLE_PERMISSIONS.store_manager,
    storeIds: [1],
    status: '启用',
    lastLogin: '2026-03-31 08:30',
    createdAt: '2024-03-15',
    platformScopes: DEFAULT_PLATFORM_SCOPES.store_manager,
    dataScopes: DEFAULT_DATA_SCOPES.store_manager,
    fieldScopes: DEFAULT_FIELD_SCOPES.store_manager,
    approvalScopes: DEFAULT_APPROVAL_SCOPES.store_manager,
  },
  {
    id: 3,
    username: 'store_mgr_02',
    name: '王店长',
    phone: '13600000003',
    email: 'wang@beauty.com',
    primaryRole: 'store_manager',
    roles: ['store_manager'],
    extraPermissions: ROLE_PERMISSIONS.store_manager,
    storeIds: [2],
    status: '启用',
    lastLogin: '2026-03-30 17:45',
    createdAt: '2024-06-20',
    platformScopes: DEFAULT_PLATFORM_SCOPES.store_manager,
    dataScopes: DEFAULT_DATA_SCOPES.store_manager,
    fieldScopes: DEFAULT_FIELD_SCOPES.store_manager,
    approvalScopes: DEFAULT_APPROVAL_SCOPES.store_manager,
  },
  {
    id: 4,
    username: 'cashier_01',
    name: '赵收银',
    phone: '13700000004',
    email: 'zhao@beauty.com',
    primaryRole: 'cashier',
    roles: ['cashier'],
    extraPermissions: ROLE_PERMISSIONS.cashier,
    storeIds: [1],
    status: '启用',
    lastLogin: '2026-03-31 10:00',
    createdAt: '2025-01-10',
    platformScopes: DEFAULT_PLATFORM_SCOPES.cashier,
    dataScopes: DEFAULT_DATA_SCOPES.cashier,
    fieldScopes: DEFAULT_FIELD_SCOPES.cashier,
    approvalScopes: DEFAULT_APPROVAL_SCOPES.cashier,
  },
  {
    id: 5,
    username: 'beautician_01',
    name: '陈美容师',
    phone: '13500000005',
    email: 'chen@beauty.com',
    primaryRole: 'beautician',
    roles: ['beautician'],
    extraPermissions: ROLE_PERMISSIONS.beautician,
    storeIds: [1],
    status: '启用',
    lastLogin: '2026-03-29 14:20',
    createdAt: '2025-03-01',
    platformScopes: DEFAULT_PLATFORM_SCOPES.beautician,
    dataScopes: DEFAULT_DATA_SCOPES.beautician,
    fieldScopes: DEFAULT_FIELD_SCOPES.beautician,
    approvalScopes: DEFAULT_APPROVAL_SCOPES.beautician,
  },
  {
    id: 6,
    username: 'warehouse_01',
    name: '刘仓管',
    phone: '13300000006',
    email: 'liu@beauty.com',
    primaryRole: 'inventory_manager',
    roles: ['inventory_manager'],
    extraPermissions: ROLE_PERMISSIONS.inventory_manager,
    storeIds: [],
    status: '禁用',
    lastLogin: '2026-02-15 11:00',
    createdAt: '2025-06-01',
    platformScopes: DEFAULT_PLATFORM_SCOPES.inventory_manager,
    dataScopes: DEFAULT_DATA_SCOPES.inventory_manager,
    fieldScopes: DEFAULT_FIELD_SCOPES.inventory_manager,
    approvalScopes: DEFAULT_APPROVAL_SCOPES.inventory_manager,
  },
];

export async function mockGetUsers(): Promise<SystemUser[]> {
  return [...MOCK_USERS];
}

export async function mockCreateUser(data: SystemUserCreateInput): Promise<SystemUser> {
  const newId = Math.max(...MOCK_USERS.map((u) => u.id)) + 1;
  const { password: _password, ...userData } = data;
  const user: SystemUser = {
    ...userData,
    id: newId,
    status: '启用',
    lastLogin: '-',
    createdAt: new Date().toISOString().slice(0, 10),
    primaryRole: data.primaryRole ?? data.roles[0],
    extraPermissions: data.extraPermissions ?? [],
    deniedPermissions: data.deniedPermissions ?? [],
    platformScopes: data.platformScopes ?? DEFAULT_PLATFORM_SCOPES[data.primaryRole ?? data.roles[0]] ?? { core: false, assist: false, terminal: false },
    dataScopes: data.dataScopes ?? DEFAULT_DATA_SCOPES[data.primaryRole ?? data.roles[0]] ?? {
      store: 'none',
      customer: 'none',
      order: 'none',
      booking: 'none',
      inventory: 'none',
      report: 'none',
      device: 'none',
    },
    fieldScopes: data.fieldScopes ?? DEFAULT_FIELD_SCOPES[data.primaryRole ?? data.roles[0]] ?? {
      customerPhone: 'hidden',
      customerWechat: 'hidden',
      customerBalance: 'hidden',
      customerCost: 'hidden',
      customerProfit: 'hidden',
      customerPrivateNote: 'hidden',
      customerRemark: 'hidden',
      staffCommission: 'hidden',
    },
    approvalScopes: data.approvalScopes ?? DEFAULT_APPROVAL_SCOPES[data.primaryRole ?? data.roles[0]] ?? {
      refund: 'none',
      discount: 'none',
      priceChange: 'none',
      deleteCustomer: 'none',
      exportCustomer: 'none',
      inventoryAdjustment: 'none',
      deviceUnbind: 'none',
    },
  };
  MOCK_USERS.push(user);
  return user;
}

export async function mockUpdateUser(id: number, data: SystemUserUpdateInput): Promise<SystemUser> {
  const index = MOCK_USERS.findIndex((u) => u.id === id);
  if (index === -1) throw new Error('用户不存在');
  const { password: _password, ...userData } = data;
  MOCK_USERS[index] = { ...MOCK_USERS[index], ...userData };
  return MOCK_USERS[index];
}

export async function mockGetUsersPaginated(params: PaginationParams): Promise<PaginatedResponse<SystemUser>> {
  const all = [...MOCK_USERS];
  const total = all.length;
  const start = (params.page - 1) * params.pageSize;
  const data = all.slice(start, start + params.pageSize);
  return createPaginatedResponse(data, total, params.page, params.pageSize);
}

export async function mockDeleteUser(id: number): Promise<void> {
  const index = MOCK_USERS.findIndex((u) => u.id === id);
  if (index === -1) throw new Error('用户不存在');
  MOCK_USERS.splice(index, 1);
}

export async function mockResetPassword(id: number, _newPassword: string): Promise<void> {
  const user = MOCK_USERS.find((u) => u.id === id);
  if (!user) throw new Error('用户不存在');
}
