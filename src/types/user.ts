export interface SystemUser {
  id: number;
  username: string;
  name: string;
  phone: string;
  email: string;
  primaryRole?: string;
  roles: string[];
  extraPermissions?: string[];
  deniedPermissions?: string[];
  storeIds: number[];
  supplySupplierId?: number | null;
  supplySupplierName?: string | null;
  status: '启用' | '禁用';
  lastLogin: string;
  createdAt: string;
  platformScopes?: import('./permission').PlatformScopes;
  dataScopes?: import('./permission').DataScopes;
  fieldScopes?: import('./permission').FieldScopes;
  approvalScopes?: import('./permission').ApprovalScopes;
}

export type SystemUserCreateInput = Omit<SystemUser, 'id' | 'lastLogin' | 'createdAt' | 'status'> & {
  password: string;
};

export type SystemUserUpdateInput = Partial<SystemUser> & {
  password?: string;
};
