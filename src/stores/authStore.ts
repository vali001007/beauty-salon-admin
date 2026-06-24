import { create } from 'zustand';
import type { AuthUser, LoginRequest, LoginResponse } from '../types';
import { login as authLogin, getUserInfo } from '../api/auth';
import { normalizePermissions } from '@/config/permissions';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (req: LoginRequest) => Promise<void>;
  logout: () => void;
  loadUserInfo: () => Promise<void>;
  setAuth: (token: string, user: AuthUser) => void;
}

function normalizeAuthUser(user: AuthUser): AuthUser {
  const rawUser = user as AuthUser & { stores?: number[]; primaryRole?: string };
  return {
    ...user,
    roles: user.roles ?? (rawUser.primaryRole ? [rawUser.primaryRole] : []),
    permissions: normalizePermissions(user.permissions),
    deniedPermissions: normalizePermissions(user.deniedPermissions ?? []),
    storeIds: user.storeIds ?? rawUser.stores ?? [],
  };
}

function unwrapLoginResponse(response: LoginResponse | { data?: LoginResponse }): LoginResponse {
  const record = response && typeof response === 'object' ? response : {};
  const normalized = 'token' in record ? record : (record as { data?: LoginResponse }).data;
  if (!normalized?.token || !normalized.user) {
    throw new Error('登录返回缺少用户信息，请检查后端认证接口。');
  }
  return normalized;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  user: null,
  isAuthenticated: !!localStorage.getItem('token'),

  login: async (req: LoginRequest) => {
    const response = unwrapLoginResponse(await authLogin(req) as LoginResponse | { data?: LoginResponse });
    const user = normalizeAuthUser(response.user);
    localStorage.setItem('token', response.token);
    set({
      token: response.token,
      user,
      isAuthenticated: true,
    });
  },

  logout: () => {
    localStorage.removeItem('token');
    set({
      token: null,
      user: null,
      isAuthenticated: false,
    });
  },

  loadUserInfo: async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const user = await getUserInfo();
    set({
      user: normalizeAuthUser(user),
    });
  },

  setAuth: (token: string, user: AuthUser) => {
    localStorage.setItem('token', token);
    set({
      token,
      user: normalizeAuthUser(user),
      isAuthenticated: true,
    });
  },
}));
