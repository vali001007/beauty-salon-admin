import apiClient from './client';
import type { AuthUser, LoginRequest, LoginResponse } from '@/types';

export async function login(data: LoginRequest): Promise<LoginResponse> {
  return apiClient.post('/auth/login', data);
}

export async function getUserInfo(): Promise<AuthUser> {
  return apiClient.get('/auth/user-info');
}
