import type { AuthUser } from './auth';
import type { DataScopes } from './permission';
import type { Store } from './store';

export type AuraRole = 'manager' | 'reception' | 'beautician';

export type AuraAction =
  | 'manager.dashboard'
  | 'manager.staff'
  | 'manager.customers'
  | 'manager.inventory'
  | 'reception.appointments'
  | 'operation.verify'
  | 'operation.register'
  | 'operation.cashier'
  | 'operation.card'
  | 'operation.recharge'
  | 'operation.print'
  | 'operation.service-complete'
  | 'beautician.schedule'
  | 'beautician.customer'
  | 'beautician.record'
  | 'beautician.advice';

export interface AuraQuickAction {
  label: string;
  action: AuraAction;
  icon: string;
}

export interface AuraRoleDefinition {
  role: AuraRole;
  title: string;
  subtitle: string;
  quickActions: AuraQuickAction[];
  availableActions: AuraAction[];
}

export interface AuraBootstrap {
  currentUser: AuthUser | null;
  currentStore: Store | null;
  availableStores: Store[];
  currentRole: AuraRole;
  availableRoles: AuraRole[];
  availableActions: AuraAction[];
  quickActions: AuraQuickAction[];
  permissions: string[];
  dataScopes: Partial<DataScopes>;
  roleDefinition: AuraRoleDefinition;
}
