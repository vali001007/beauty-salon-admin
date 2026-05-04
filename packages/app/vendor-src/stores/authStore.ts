import { create } from 'zustand';
import type { AuthUser, LoginRequest } from '../types';
import { login as authLogin, getUserInfo } from '../api/auth';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (req: LoginRequest) => Promise<void>;
  logout: () => void;
  loadUserInfo: () => Promise<void>;
  setAuth: (token: string, user: AuthUser) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  user: null,
  isAuthenticated: !!localStorage.getItem('token'),

  login: async (req: LoginRequest) => {
    const response = await authLogin(req);
    localStorage.setItem('token', response.token);
    set({
      token: response.token,
      user: response.user,
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
    set({ user });
  },

  setAuth: (token: string, user: AuthUser) => {
    localStorage.setItem('token', token);
    set({ token, user, isAuthenticated: true });
  },
}));
