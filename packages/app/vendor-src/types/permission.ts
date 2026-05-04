export interface Role {
  id: number;
  name: string;
  code: string;
  description: string;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

export interface Permission {
  code: string;
  name: string;
  type: 'menu' | 'operation';
  module: string;
  children?: Permission[];
}
