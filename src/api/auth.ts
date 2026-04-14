import type { LoginRequest, LoginResponse, AuthUser } from '@/types';
import { mockLogin, mockLogout, mockGetUserInfo, mockRegister } from './mock/auth';
import { realLogin, realLogout, realGetUserInfo, realRegister } from './real/auth';

const isReal = import.meta.env.VITE_API_MODE === 'real';

export const login: (req: LoginRequest) => Promise<LoginResponse> =
  isReal ? realLogin : mockLogin;

export const logout: () => Promise<void> =
  isReal ? realLogout : mockLogout;

export const getUserInfo: () => Promise<AuthUser> =
  isReal ? realGetUserInfo : mockGetUserInfo;

export const register: (req: { username: string; name: string; phone: string; password: string }) => Promise<LoginResponse> =
  isReal ? realRegister : mockRegister;
