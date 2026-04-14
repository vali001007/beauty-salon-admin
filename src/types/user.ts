export interface SystemUser {
  id: number;
  username: string;
  name: string;
  phone: string;
  email: string;
  roles: string[];
  storeIds: number[];
  status: '启用' | '禁用';
  lastLogin: string;
  createdAt: string;
}
