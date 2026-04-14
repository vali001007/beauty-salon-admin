import type { SystemUser } from '@/types';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

const MOCK_USERS: SystemUser[] = [
  { id: 1, username: 'admin', name: '张管理员', phone: '13800000001', email: 'admin@beauty.com', roles: ['超级管理员'], storeIds: [], status: '启用', lastLogin: '2026-03-31 09:15', createdAt: '2023-01-01' },
  { id: 2, username: 'store_mgr_01', name: '李店长', phone: '13900000002', email: 'li@beauty.com', roles: ['门店管理员'], storeIds: [1], status: '启用', lastLogin: '2026-03-31 08:30', createdAt: '2024-03-15' },
  { id: 3, username: 'store_mgr_02', name: '王店长', phone: '13600000003', email: 'wang@beauty.com', roles: ['门店管理员'], storeIds: [2], status: '启用', lastLogin: '2026-03-30 17:45', createdAt: '2024-06-20' },
  { id: 4, username: 'cashier_01', name: '赵收银', phone: '13700000004', email: 'zhao@beauty.com', roles: ['收银员'], storeIds: [1], status: '启用', lastLogin: '2026-03-31 10:00', createdAt: '2025-01-10' },
  { id: 5, username: 'beautician_01', name: '陈美容师', phone: '13500000005', email: 'chen@beauty.com', roles: ['美容师'], storeIds: [1], status: '启用', lastLogin: '2026-03-29 14:20', createdAt: '2025-03-01' },
  { id: 6, username: 'warehouse_01', name: '刘仓管', phone: '13300000006', email: 'liu@beauty.com', roles: ['库存管理员'], storeIds: [], status: '禁用', lastLogin: '2026-02-15 11:00', createdAt: '2025-06-01' },
];

export async function mockGetUsers(): Promise<SystemUser[]> {
  return [...MOCK_USERS];
}

export async function mockCreateUser(data: Omit<SystemUser, 'id' | 'lastLogin' | 'createdAt' | 'status'>): Promise<SystemUser> {
  const newId = Math.max(...MOCK_USERS.map((u) => u.id)) + 1;
  const user: SystemUser = {
    ...data,
    id: newId,
    status: '启用',
    lastLogin: '-',
    createdAt: new Date().toISOString().slice(0, 10),
  };
  MOCK_USERS.push(user);
  return user;
}

export async function mockUpdateUser(id: number, data: Partial<SystemUser>): Promise<SystemUser> {
  const index = MOCK_USERS.findIndex((u) => u.id === id);
  if (index === -1) throw new Error('用户不存在');
  MOCK_USERS[index] = { ...MOCK_USERS[index], ...data };
  return MOCK_USERS[index];
}

export async function mockGetUsersPaginated(params: PaginationParams): Promise<PaginatedResponse<SystemUser>> {
  const all = [...MOCK_USERS];
  const total = all.length;
  const start = (params.page - 1) * params.pageSize;
  const data = all.slice(start, start + params.pageSize);
  return { data, total, page: params.page, pageSize: params.pageSize };
}
