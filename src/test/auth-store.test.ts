import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import { getUserInfo, login as authLogin } from '@/api/auth';

vi.mock('@/api/auth', () => ({
  login: vi.fn(async () => ({
    token: 'real-test-token',
    user: {
      id: 1,
      username: 'admin',
      name: '系统管理员',
      roles: ['super_admin'],
      permissions: ['*'],
      storeIds: [],
    },
  })),
  getUserInfo: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}));

describe('authStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().logout();
    vi.mocked(authLogin).mockResolvedValue({
      token: 'real-test-token',
      user: {
        id: 1,
        username: 'admin',
        name: '系统管理员',
        phone: '13800138000',
        roles: ['super_admin'],
        permissions: ['*'],
        storeIds: [],
      },
    });
    vi.mocked(getUserInfo).mockResolvedValue({
      id: 1,
      username: 'admin',
      name: '系统管理员',
      phone: '13800138000',
      roles: ['super_admin'],
      permissions: ['*'],
      storeIds: [],
    });
  });

  it('stores token and user after successful login', async () => {
    await useAuthStore.getState().login({ username: 'admin', password: '11111111' });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('real-test-token');
    expect(state.user?.username).toBe('admin');
    expect(localStorage.getItem('token')).toBe(state.token);
  });

  it('clears auth state on logout', async () => {
    await useAuthStore.getState().login({ username: 'admin', password: '11111111' });
    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('normalizes missing role and store fields from login response', async () => {
    vi.mocked(authLogin).mockResolvedValueOnce({
      token: 'token-with-partial-user',
      user: {
        id: 2,
        username: 'manager',
        name: '店长',
        phone: '13900139000',
        primaryRole: 'store_manager',
        permissions: ['dashboard:view'],
        stores: ['3'],
      } as any,
    });

    await useAuthStore.getState().login({ username: 'manager', password: '11111111' });

    const state = useAuthStore.getState();
    expect(state.user?.roles).toEqual(['store_manager']);
    expect(state.user?.storeIds).toEqual([3]);
    expect(state.user?.permissions).toContain('core:dashboard:view');
  });

  it('clears stale token when user info cannot be loaded', async () => {
    localStorage.setItem('token', 'stale-token');
    useAuthStore.setState({ token: 'stale-token', user: null, isAuthenticated: true });
    vi.mocked(getUserInfo).mockResolvedValueOnce(undefined as any);

    await expect(useAuthStore.getState().loadUserInfo()).rejects.toThrow('认证返回缺少用户信息');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.token).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });
});
