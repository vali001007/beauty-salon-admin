import type { LoginRequest, LoginResponse, AuthUser } from '@/types';
import { realLogin, realLogout, realGetUserInfo, realRegister } from './real/auth';

export const login: (req: LoginRequest) => Promise<LoginResponse> =
  realLogin;

export const logout: () => Promise<void> =
  realLogout;

export const getUserInfo: () => Promise<AuthUser> =
  realGetUserInfo;

export const register: (req: { username: string; name: string; phone: string; password: string }) => Promise<LoginResponse> =
  realRegister;
