import type { AuthUser, DataScopes, Store } from '@/types';
import type { AuraAction, AuraBootstrap, AuraRole, AuraRoleDefinition } from '@/types/aura';

export const AURA_ROLES: AuraRole[] = ['manager', 'reception', 'beautician'];

export const AURA_ROLE_LABELS: Record<AuraRole, string> = {
  manager: '店长',
  reception: '前台',
  beautician: '美容师',
};

export const AURA_ROLE_SUBTITLES: Record<AuraRole, string> = {
  manager: '先看经营、风险和员工，再处理门店协同',
  reception: '围绕接待、预约、核销和收银快速处理',
  beautician: '只看自己的排班、客户和服务动作',
};

export const AURA_ACTION_META: Record<AuraAction, { label: string; icon: string }> = {
  'manager.dashboard': { label: '经营', icon: 'BarChart3' },
  'manager.staff': { label: '员工', icon: 'Users' },
  'manager.customers': { label: '客户增长', icon: 'Sparkles' },
  'manager.inventory': { label: '库存', icon: 'PackageCheck' },
  'reception.appointments': { label: '预约', icon: 'CalendarCheck' },
  'operation.verify': { label: '核销', icon: 'CheckSquare' },
  'operation.register': { label: '登记', icon: 'UserPlus' },
  'operation.cashier': { label: '收银', icon: 'CreditCard' },
  'operation.card': { label: '办卡', icon: 'Wallet' },
  'operation.recharge': { label: '充值', icon: 'Wallet' },
  'operation.print': { label: '打印', icon: 'Printer' },
  'operation.service-complete': { label: '服务记录', icon: 'FileText' },
  'beautician.schedule': { label: '我的预约', icon: 'CalendarCheck' },
  'beautician.commission': { label: '我的提成', icon: 'Wallet' },
  'beautician.customer': { label: '我的客户', icon: 'Users' },
  'beautician.record': { label: '服务记录', icon: 'FileText' },
  'beautician.advice': { label: '护理建议', icon: 'HeartPulse' },
};

export const AURA_ROLE_ACTIONS: Record<AuraRole, AuraAction[]> = {
  manager: [
    'manager.dashboard',
    'manager.staff',
    'manager.customers',
    'manager.inventory',
    'reception.appointments',
    'operation.cashier',
  ],
  reception: [
    'reception.appointments',
    'operation.verify',
    'operation.register',
    'operation.cashier',
    'operation.card',
    'operation.recharge',
    'operation.print',
  ],
  beautician: [
    'beautician.schedule',
    'beautician.commission',
    'beautician.customer',
    'beautician.record',
    'beautician.advice',
  ],
};

export const AURA_ROLE_PERMISSIONS: Record<AuraRole, string[]> = {
  manager: [
    'aura:manager:view',
    'aura:customer:read',
    'aura:appointment:read',
    'aura:appointment:write',
    'aura:card:consume',
    'aura:cashier:create',
    'aura:card-order:create',
    'aura:recharge:create',
    'aura:inventory:read',
    'aura:staff:read',
  ],
  reception: [
    'aura:reception:view',
    'aura:customer:read',
    'aura:appointment:read',
    'aura:appointment:write',
    'aura:card:consume',
    'aura:cashier:create',
    'aura:card-order:create',
    'aura:recharge:create',
  ],
  beautician: ['aura:beautician:view', 'aura:customer:read', 'aura:appointment:read', 'aura:service-record:create'],
};

export const AURA_ROLE_DATA_SCOPES: Record<AuraRole, Partial<DataScopes>> = {
  manager: {
    store: 'own_store',
    customer: 'own_store',
    order: 'own_store',
    booking: 'own_store',
    inventory: 'own_store',
    report: 'own_store',
    device: 'own_store',
  },
  reception: {
    store: 'own_store',
    customer: 'own_store',
    order: 'own_store',
    booking: 'own_store',
    inventory: 'own_store',
    report: 'self',
    device: 'own_store',
  },
  beautician: {
    store: 'own_store',
    customer: 'served_customers',
    order: 'served_customers',
    booking: 'self',
    inventory: 'none',
    report: 'self',
    device: 'current_device',
  },
};

export function resolveAuraAvailableRoles(user: AuthUser | null): AuraRole[] {
  if (!user) return ['reception'];
  const roles = new Set(user.roles ?? []);
  if (roles.has('super_admin')) return ['manager', 'reception', 'beautician'];
  if (roles.has('store_manager')) return ['manager', 'reception', 'beautician'];
  if (roles.has('cashier')) return ['reception'];
  if (roles.has('beautician')) return ['beautician'];
  return ['reception'];
}

export function resolveAuraRole(user: AuthUser | null): AuraRole {
  return resolveAuraAvailableRoles(user)[0] ?? 'reception';
}

export function getAuraRoleDefinition(role: AuraRole): AuraRoleDefinition {
  const quickActions = AURA_ROLE_ACTIONS[role].map((action) => ({
    action,
    label: AURA_ACTION_META[action].label,
    icon: AURA_ACTION_META[action].icon,
  }));

  return {
    role,
    title: AURA_ROLE_LABELS[role],
    subtitle: AURA_ROLE_SUBTITLES[role],
    quickActions,
    availableActions: [...AURA_ROLE_ACTIONS[role]],
  };
}

export function buildAuraBootstrap(params: {
  user: AuthUser | null;
  store: Store | null;
  stores: Store[];
  currentRole?: AuraRole;
}): AuraBootstrap {
  const currentRole = params.currentRole ?? resolveAuraRole(params.user);
  const roleDefinition = getAuraRoleDefinition(currentRole);

  return {
    currentUser: params.user,
    currentStore: params.store,
    availableStores: params.stores,
    terminalUsers: params.user
      ? [
          {
            ...params.user,
            availableRoles: resolveAuraAvailableRoles(params.user),
            defaultRole: resolveAuraRole(params.user),
            roleLabel: AURA_ROLE_LABELS[resolveAuraRole(params.user)],
            status: 'active',
          },
        ]
      : [],
    currentRole,
    availableRoles: resolveAuraAvailableRoles(params.user),
    availableActions: [...roleDefinition.availableActions],
    quickActions: [...roleDefinition.quickActions],
    permissions: [...AURA_ROLE_PERMISSIONS[currentRole]],
    dataScopes: { ...AURA_ROLE_DATA_SCOPES[currentRole] },
    roleDefinition,
  };
}
