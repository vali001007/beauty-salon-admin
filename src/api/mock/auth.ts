import type { LoginRequest, LoginResponse, AuthUser } from '@/types';

const MOCK_USERS: Array<{ username: string; password: string; user: AuthUser }> = [
  {
    username: 'admin',
    password: '11111111',
    user: {
      id: 1,
      username: 'admin',
      name: '超级管理员',
      phone: '13800138000',
      email: 'admin@beauty.com',
      roles: ['super_admin'],
      permissions: ['*'],
      storeIds: [1, 2, 3],
    },
  },
  {
    username: 'manager',
    password: '123456',
    user: {
      id: 2,
      username: 'manager',
      name: '门店经理',
      phone: '13900139000',
      email: 'manager@beauty.com',
      roles: ['store_manager'],
      permissions: [
        'dashboard:view',
        'customer:view', 'customer:profile', 'customer:script',
        'marketing:view', 'marketing:recommend', 'marketing:template', 'marketing:analytics',
        'store:project-types', 'store:projects', 'store:beauticians', 'store:beautician-levels',
        'store:scheduling', 'store:reservations',
        'goods:types', 'goods:products', 'goods:cards',
        'order:products', 'order:card-orders', 'order:card-usage',
        'inventory:products', 'inventory:stock', 'inventory:purchase',
        'inventory:expiry', 'inventory:transfer', 'inventory:consumption',
      ],
      storeIds: [1],
    },
  },
];

let nextId = 100;

export async function mockRegister(req: { username: string; name: string; phone: string; password: string }): Promise<LoginResponse> {
  if (MOCK_USERS.some((u) => u.username === req.username)) {
    throw new Error('用户名已存在');
  }
  const id = nextId++;
  const user: AuthUser = {
    id,
    username: req.username,
    name: req.name,
    phone: req.phone,
    roles: ['store_manager'],
    permissions: [
      'dashboard:view',
      'customer:view', 'customer:profile', 'customer:script',
      'marketing:view', 'marketing:recommend', 'marketing:template', 'marketing:analytics',
      'store:project-types', 'store:projects', 'store:beauticians', 'store:beautician-levels',
      'store:scheduling', 'store:reservations',
      'goods:types', 'goods:products', 'goods:cards',
      'order:products', 'order:card-orders', 'order:card-usage',
      'inventory:products', 'inventory:stock', 'inventory:purchase',
      'inventory:expiry', 'inventory:transfer', 'inventory:consumption',
      'system:users', 'system:roles', 'system:permissions', 'system:stores',
    ],
    storeIds: [1],
  };
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
  // Return admin user by default in mock mode
  return MOCK_USERS[0].user;
}
