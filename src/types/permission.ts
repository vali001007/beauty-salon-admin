export type PermissionPlatform = 'core' | 'assist' | 'terminal';

export type PermissionType = 'menu' | 'operation' | 'action' | 'api';

export type DataScopeValue =
  | 'all'
  | 'assigned_stores'
  | 'own_store'
  | 'own_team'
  | 'self'
  | 'assigned_customers'
  | 'served_customers'
  | 'current_device'
  | 'none';

export type FieldScopeValue = 'visible' | 'masked' | 'hidden';

export type ApprovalScopeValue = 'none' | 'request' | 'approve' | 'approve_limited';

export type ScopeMap<T extends string> = Partial<Record<string, T>>;

export interface Permission {
  code: string;
  name: string;
  type: PermissionType;
  module: string;
  platform: PermissionPlatform;
  description: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  legacyCodes?: string[];
  children?: Permission[];
}

export interface DataScopes {
  store: DataScopeValue;
  customer: DataScopeValue;
  order: DataScopeValue;
  booking: DataScopeValue;
  inventory: DataScopeValue;
  report: DataScopeValue;
  device: DataScopeValue;
}

export interface FieldScopes {
  customerPhone: FieldScopeValue;
  customerWechat: FieldScopeValue;
  customerBalance: FieldScopeValue;
  customerCost: FieldScopeValue;
  customerProfit: FieldScopeValue;
  customerPrivateNote: FieldScopeValue;
  customerRemark: FieldScopeValue;
  staffCommission: FieldScopeValue;
}

export interface ApprovalScopes {
  refund: ApprovalScopeValue;
  discount: ApprovalScopeValue;
  priceChange: ApprovalScopeValue;
  deleteCustomer: ApprovalScopeValue;
  exportCustomer: ApprovalScopeValue;
  inventoryAdjustment: ApprovalScopeValue;
  deviceUnbind: ApprovalScopeValue;
}

export interface PlatformScopes {
  core: boolean;
  assist: boolean;
  terminal: boolean;
}

export interface Role {
  id: number;
  name: string;
  code: string;
  description: string;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
  platformScopes: PlatformScopes;
  dataScopes: DataScopes;
  fieldScopes: FieldScopes;
  approvalScopes: ApprovalScopes;
}

export interface PermissionAssignment {
  permissions: string[];
  deniedPermissions?: string[];
  platformScopes?: Partial<PlatformScopes>;
  dataScopes?: Partial<DataScopes>;
  fieldScopes?: Partial<FieldScopes>;
  approvalScopes?: Partial<ApprovalScopes>;
}
