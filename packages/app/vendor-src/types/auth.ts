export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  name: string;
  phone: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  phone: string;
  email?: string;
  roles: string[];
  permissions: string[];
  storeIds: number[];
}
