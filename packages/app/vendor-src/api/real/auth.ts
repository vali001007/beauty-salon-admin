import type { LoginRequest, LoginResponse, AuthUser } from '@/types';
import apiClient from '../client';

export async function realLogin(req: LoginRequest): Promise<LoginResponse> {
  return apiClient.post('/auth/login', req);
}

export async function realLogout(): Promise<void> {
  return apiClient.post('/auth/logout');
}

export async function realGetUserInfo(): Promise<AuthUser> {
  return apiClient.get('/auth/user-info');
}

export async function realRegister(req: { username: string; name: string; phone: string; password: string }): Promise<LoginResponse> {
  return apiClient.post('/auth/register', req);
}
