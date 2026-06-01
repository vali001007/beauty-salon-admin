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
  deniedPermissions?: string[];
  storeIds: number[];
  platformScopes?: import('./permission').PlatformScopes;
  dataScopes?: import('./permission').DataScopes;
  fieldScopes?: import('./permission').FieldScopes;
  approvalScopes?: import('./permission').ApprovalScopes;
}
