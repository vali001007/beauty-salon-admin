export type DashboardMetricTone = 'primary' | 'rose' | 'amber' | 'slate';

export type AdminWorkbenchRole =
  | 'super_admin'
  | 'store_manager'
  | 'cashier'
  | 'beautician'
  | 'inventory_manager'
  | 'default';

export type WorkbenchSeverity = 'normal' | 'warning' | 'critical';
export type WorkbenchMetricTone = DashboardMetricTone;

export interface DashboardMetric {
  key: string;
  label: string;
  value: string;
  hint: string;
  tone: DashboardMetricTone;
  path: string;
}

export interface DashboardPriority {
  key: string;
  title: string;
  detail: string;
  tag: string;
  path: string;
}

export interface DashboardOverview {
  scope: {
    storeId: number | null;
    storeName: string;
    mode: 'all' | 'store';
  };
  metrics: DashboardMetric[];
  priorities: DashboardPriority[];
  ai: {
    conclusion: string;
    basis: string;
    action: string;
    path: string;
  };
  terminalStatus?: {
    totalDevices: number;
    onlineDevices: number;
  };
  generatedAt: string;
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
