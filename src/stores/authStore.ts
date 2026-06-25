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

type LoginResponseEnvelope = LoginResponse & {
  accessToken?: string;
  data?: LoginResponseEnvelope;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'number' ? item : Number(item)))
        .filter((item) => Number.isFinite(item))
    : [];
}

function normalizeAuthUser(user: AuthUser | null | undefined): AuthUser {
  if (!isRecord(user)) {
    throw new Error('认证返回缺少用户信息，请重新登录。');
  }
  const rawUser = user as AuthUser & { stores?: unknown; primaryRole?: string; permissions?: unknown; deniedPermissions?: unknown; roles?: unknown };
  const roles = toStringArray(rawUser.roles);
  const fallbackRoles = rawUser.primaryRole ? [rawUser.primaryRole] : [];
  const storeIds = toNumberArray(rawUser.storeIds).length ? toNumberArray(rawUser.storeIds) : toNumberArray(rawUser.stores);
  return {
    ...(user as AuthUser),
    roles: roles.length ? roles : fallbackRoles,
    permissions: normalizePermissions(toStringArray(rawUser.permissions)),
    deniedPermissions: normalizePermissions(toStringArray(rawUser.deniedPermissions)),
    storeIds,
  };
}

function resetAuthState(set: (state: Partial<AuthState>) => void) {
  localStorage.removeItem('token');
  set({
    token: null,
    user: null,
    isAuthenticated: false,
  });
}

function unwrapLoginResponse(response: unknown): LoginResponse {
  let current = response as LoginResponseEnvelope | undefined;
  for (let depth = 0; depth < 3 && isRecord(current); depth += 1) {
    const token = typeof current.token === 'string' ? current.token : current.accessToken;
    if (token && current.user) {
      return {
        ...current,
        token,
        user: current.user,
      };
    }
    current = current.data;
  }

  if (isRecord(response) && typeof response.message === 'string') {
    throw new Error(response.message);
  }

  throw new Error('登录返回缺少用户信息，请检查后端认证接口。');
}

function unwrapUserInfo(response: unknown): AuthUser {
  let current = response;
  for (let depth = 0; depth < 3 && isRecord(current); depth += 1) {
    if ('username' in current || 'id' in current) {
      return normalizeAuthUser(current as unknown as AuthUser);
    }
    current = current.data as unknown;
  }

  if (isRecord(response) && typeof response.message === 'string') {
    throw new Error(response.message);
  }

  throw new Error('认证返回缺少用户信息，请重新登录。');
}

function assertLoginResponse(response: LoginResponse): LoginResponse {
  if (!response.token || !response.user) {
    throw new Error('登录返回缺少用户信息，请检查后端认证接口。');
  }
  return response;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  user: null,
  isAuthenticated: !!localStorage.getItem('token'),

  login: async (req: LoginRequest) => {
    const response = assertLoginResponse(unwrapLoginResponse(await authLogin(req)));
    const user = normalizeAuthUser(response.user);
    localStorage.setItem('token', response.token);
    set({
      token: response.token,
      user,
      isAuthenticated: true,
    });
  },

  logout: () => {
    resetAuthState(set);
  },

  loadUserInfo: async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const user = unwrapUserInfo(await getUserInfo());
      set({
        user,
      });
    } catch (error) {
      resetAuthState(set);
      throw error;
    }
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
