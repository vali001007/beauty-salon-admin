import type { AuthUser, LoginRequest, LoginResponse } from '@/types';
import { DEFAULT_APPROVAL_SCOPES, DEFAULT_DATA_SCOPES, DEFAULT_FIELD_SCOPES, DEFAULT_PLATFORM_SCOPES, ROLE_PERMISSIONS, normalizePermissions } from '@/config/permissions';

const makeUser = (user: AuthUser): AuthUser => ({
  ...user,
  permissions: normalizePermissions(user.permissions),
  deniedPermissions: normalizePermissions(user.deniedPermissions ?? []),
});

const MOCK_USERS: Array<{ username: string; password: string; user: AuthUser }> = [
  {
    username: 'admin',
    password: '11111111',
    user: makeUser({
      id: 1,
      username: 'admin',
      name: '超级管理员',
      phone: '13800138000',
      email: 'admin@beauty.com',
      roles: ['super_admin'],
      permissions: ['*'],
      storeIds: [1, 2, 3, 4],
      platformScopes: DEFAULT_PLATFORM_SCOPES.super_admin,
      dataScopes: DEFAULT_DATA_SCOPES.super_admin,
      fieldScopes: DEFAULT_FIELD_SCOPES.super_admin,
      approvalScopes: DEFAULT_APPROVAL_SCOPES.super_admin,
    }),
  },
  {
    username: 'manager',
    password: '123456',
    user: makeUser({
      id: 2,
      username: 'manager',
      name: '门店经理',
      phone: '13900139000',
      email: 'manager@beauty.com',
      roles: ['store_manager'],
      permissions: ROLE_PERMISSIONS.store_manager,
      storeIds: [1],
      platformScopes: DEFAULT_PLATFORM_SCOPES.store_manager,
      dataScopes: DEFAULT_DATA_SCOPES.store_manager,
      fieldScopes: DEFAULT_FIELD_SCOPES.store_manager,
      approvalScopes: DEFAULT_APPROVAL_SCOPES.store_manager,
    }),
  },
  {
    username: 'cashier',
    password: '123456',
    user: makeUser({
      id: 3,
      username: 'cashier',
      name: '前台收银',
      phone: '13700137000',
      email: 'cashier@beauty.com',
      roles: ['cashier'],
      permissions: ROLE_PERMISSIONS.cashier,
      storeIds: [1],
      platformScopes: DEFAULT_PLATFORM_SCOPES.cashier,
      dataScopes: DEFAULT_DATA_SCOPES.cashier,
      fieldScopes: DEFAULT_FIELD_SCOPES.cashier,
      approvalScopes: DEFAULT_APPROVAL_SCOPES.cashier,
    }),
  },
  {
    username: 'beautician',
    password: '123456',
    user: makeUser({
      id: 4,
      username: 'beautician',
      name: '美容师',
      phone: '13600136000',
      email: 'beautician@beauty.com',
      roles: ['beautician'],
      permissions: ROLE_PERMISSIONS.beautician,
      storeIds: [1],
      platformScopes: DEFAULT_PLATFORM_SCOPES.beautician,
      dataScopes: DEFAULT_DATA_SCOPES.beautician,
      fieldScopes: DEFAULT_FIELD_SCOPES.beautician,
      approvalScopes: DEFAULT_APPROVAL_SCOPES.beautician,
    }),
  },
];

let nextId = 100;

function getUserFromStoredToken(): AuthUser | null {
  if (typeof localStorage === 'undefined') return null;
  const token = localStorage.getItem('token');
  if (!token?.startsWith('mock-token-')) return null;

  const id = Number(token.replace('mock-token-', '').split('-')[0]);
  if (!Number.isFinite(id)) return null;

  return MOCK_USERS.find((item) => item.user.id === id)?.user ?? null;
}

export async function mockRegister(req: { username: string; name: string; phone: string; password: string }): Promise<LoginResponse> {
  if (MOCK_USERS.some((u) => u.username === req.username)) {
    throw new Error('用户名已存在');
  }

  const id = nextId++;
  const user = makeUser({
    id,
    username: req.username,
    name: req.name,
    phone: req.phone,
    roles: ['store_manager'],
    permissions: ROLE_PERMISSIONS.store_manager,
    storeIds: [1],
    platformScopes: DEFAULT_PLATFORM_SCOPES.store_manager,
    dataScopes: DEFAULT_DATA_SCOPES.store_manager,
    fieldScopes: DEFAULT_FIELD_SCOPES.store_manager,
    approvalScopes: DEFAULT_APPROVAL_SCOPES.store_manager,
  });

  MOCK_USERS.push({ username: req.username, password: req.password, user });
  return { token: `mock-token-${id}-${Date.now()}`, user };
}

export async function mockLogin(req: LoginRequest): Promise<LoginResponse> {
  const found = MOCK_USERS.find(
    (u) => u.username === req.username && u.password === req.password,
  );

  if (!found) {
    throw new Error('用户名或密码错误');
  }

  return {
    token: `mock-token-${found.user.id}-${Date.now()}`,
    user: found.user,
  };
}

export async function mockLogout(): Promise<void> {
  // no-op in mock mode
}

export async function mockGetUserInfo(): Promise<AuthUser> {
  return getUserFromStoredToken() ?? MOCK_USERS[0].user;
}
