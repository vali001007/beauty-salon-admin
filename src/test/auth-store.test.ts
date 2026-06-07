import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/authStore';

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
});
