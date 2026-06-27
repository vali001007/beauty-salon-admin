export interface AuthUser {
  id: number;
  username: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  avatar?: string | null;
  roles?: string[];
  permissions?: string[];
  deniedPermissions?: string[];
  storeIds?: number[];
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  refreshToken?: string;
  user: AuthUser;
}

export interface Store {
  id: number;
  name: string;
  code?: string;
  address?: string | null;
  phone?: string | null;
  status?: string;
}
