export type AdminWorkbenchRole =
  | 'super_admin'
  | 'store_manager'
  | 'cashier'
  | 'beautician'
  | 'inventory_manager'
  | 'default';

export type WorkbenchSeverity = 'normal' | 'warning' | 'critical';
export type WorkbenchMetricTone = 'primary' | 'rose' | 'amber' | 'slate';

export interface WorkbenchJwtUser {
  id: number;
  username?: string;
  name?: string;
  phone?: string | null;
  roles?: string[];
  permissions?: string[];
  stores?: number[];
  storeIds?: number[];
  deniedPermissions?: string[];
}

export interface WorkbenchActor {
  userId: number;
  name: string;
  roles: string[];
  currentRole: AdminWorkbenchRole;
  availableRoles: AdminWorkbenchRole[];
}

export interface WorkbenchScope {
  storeId: number | null;
  storeName: string;
  mode: 'all' | 'store' | 'self';
}

export interface DashboardWorkbenchContext {
  user: WorkbenchJwtUser;
  actor: WorkbenchActor;
  scope: WorkbenchScope;
  permissions: string[];
  deniedPermissions: string[];
  accessibleStoreIds: number[];
  isSuperAdmin: boolean;
}

export interface WorkbenchMetric {
  key: string;
  label: string;
  value: string;
  hint: string;
  tone: WorkbenchMetricTone;
  severity: WorkbenchSeverity;
  path: string;
  permission: string;
}

export interface WorkbenchTodo {
  id: string;
  type: 'reservation' | 'service' | 'inventory' | 'order' | 'marketing' | 'device' | 'customer' | 'finance' | 'system';
  title: string;
  detail: string;
  tag: string;
  severity: WorkbenchSeverity;
  priority: number;
  count?: number;
  dueAt?: string;
  path: string;
  permission: string;
  primaryAction: string;
}

export interface WorkbenchQuickAction {
  key: string;
  label: string;
  path: string;
  icon: string;
  permission: string;
  group: 'operation' | 'management' | 'analytics' | 'system';
}

export interface WorkbenchInsight {
  conclusion: string;
  basis: string;
  action: string;
  path: string;
  permission: string;
}

export interface WorkbenchOverview {
  actor: WorkbenchActor;
  scope: WorkbenchScope;
  metrics: WorkbenchMetric[];
  todos: WorkbenchTodo[];
  quickActions: WorkbenchQuickAction[];
  insight: WorkbenchInsight;
  terminalStatus?: {
    totalDevices: number;
    onlineDevices: number;
  };
  generatedAt: string;
}
