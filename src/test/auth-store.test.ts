import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/stores/authStore';

describe('authStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().logout();
  });

  it('stores token and user after successful login', async () => {
    await useAuthStore.getState().login({ username: 'admin', password: '11111111' });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toMatch(/^mock-token-/);
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
