export type AuraTerminalRole = 'manager' | 'reception' | 'beautician';
export type AuraFieldScopeValue = 'visible' | 'masked' | 'hidden';
export type AuraFieldScopes = Partial<
  Record<
    | 'customerPhone'
    | 'customerWechat'
    | 'customerBalance'
    | 'customerCost'
    | 'customerProfit'
    | 'customerPrivateNote'
    | 'customerRemark'
    | 'staffCommission',
    AuraFieldScopeValue
  >
>;

const DEFAULT_AURA_FIELD_SCOPES: Record<'manager' | 'reception' | 'beautician' | 'inventory', AuraFieldScopes> = {
  manager: {
    customerPhone: 'visible',
    customerWechat: 'visible',
    customerBalance: 'visible',
    customerCost: 'visible',
    customerProfit: 'visible',
    customerPrivateNote: 'visible',
    customerRemark: 'visible',
    staffCommission: 'visible',
  },
  reception: {
    customerPhone: 'masked',
    customerWechat: 'masked',
    customerBalance: 'visible',
    customerCost: 'hidden',
    customerProfit: 'hidden',
    customerPrivateNote: 'hidden',
    customerRemark: 'visible',
    staffCommission: 'hidden',
  },
  beautician: {
    customerPhone: 'masked',
    customerWechat: 'masked',
    customerBalance: 'hidden',
    customerCost: 'hidden',
    customerProfit: 'hidden',
    customerPrivateNote: 'hidden',
    customerRemark: 'visible',
    staffCommission: 'hidden',
  },
  inventory: {
    customerPhone: 'hidden',
    customerWechat: 'hidden',
    customerBalance: 'hidden',
    customerCost: 'visible',
    customerProfit: 'hidden',
    customerPrivateNote: 'hidden',
    customerRemark: 'hidden',
    staffCommission: 'hidden',
  },
};

const FIELD_SCOPE_WEIGHT: Record<AuraFieldScopeValue, number> = {
  hidden: 0,
  masked: 1,
  visible: 2,
};

function getUserRoleKeys(user: any): string[] {
  return (user?.roles ?? [])
    .map((item: any) => item.role?.key)
    .filter((key: unknown): key is string => typeof key === 'string' && key.length > 0);
}

function getUserPermissionList(user: any): string[] {
  const permissions = (user?.roles ?? [])
    .flatMap((item: any) => (Array.isArray(item.role?.permissions) ? item.role.permissions : []))
    .filter((permission: unknown): permission is string => typeof permission === 'string');
  return [...new Set<string>(permissions)];
}

function hasRoleKeyLike(roleKeys: Set<string>, keywords: string[]) {
  return [...roleKeys].some((key) => {
    const normalized = key.toLowerCase();
    return keywords.some((keyword) => normalized === keyword || normalized.includes(keyword));
  });
}

function hasAnyPermission(permissions: Set<string>, values: string[]) {
  return values.some((permission) => permissions.has(permission));
}

function hasTerminalPermissionPrefix(permissions: Set<string>, prefixes: string[]) {
  return [...permissions].some((permission) => prefixes.some((prefix) => permission.startsWith(prefix)));
}

function normalizeFieldScopeValue(value: unknown): AuraFieldScopeValue | undefined {
  return value === 'visible' || value === 'masked' || value === 'hidden' ? value : undefined;
}

function normalizeFieldScopes(value: unknown): AuraFieldScopes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: AuraFieldScopes = {};
  for (const [key, raw] of Object.entries(value)) {
    const normalized = normalizeFieldScopeValue(raw);
    if (normalized) result[key as keyof AuraFieldScopes] = normalized;
  }
  return result;
}

function mergeFieldScopes(target: AuraFieldScopes, source: AuraFieldScopes) {
  for (const [key, value] of Object.entries(source) as [keyof AuraFieldScopes, AuraFieldScopeValue][]) {
    const previous = target[key];
    if (!previous || FIELD_SCOPE_WEIGHT[value] > FIELD_SCOPE_WEIGHT[previous]) {
      target[key] = value;
    }
  }
}

function getDefaultFieldScopesForRoleKey(roleKey: string): AuraFieldScopes {
  const normalized = roleKey.toLowerCase();
  if (normalized === 'super_admin' || normalized.includes('store_manager') || normalized.includes('manager')) {
    return DEFAULT_AURA_FIELD_SCOPES.manager;
  }
  if (normalized.includes('cashier') || normalized.includes('reception') || normalized.includes('frontdesk')) {
    return DEFAULT_AURA_FIELD_SCOPES.reception;
  }
  if (normalized.includes('beautician')) {
    return DEFAULT_AURA_FIELD_SCOPES.beautician;
  }
  if (normalized.includes('inventory')) {
    return DEFAULT_AURA_FIELD_SCOPES.inventory;
  }
  return {};
}

export function resolveAuraAvailableRolesFromSignals(input: {
  roleKeys?: string[];
  permissions?: string[];
}): AuraTerminalRole[] {
  const roleKeys = new Set(input.roleKeys ?? []);
  const permissions = new Set(input.permissions ?? []);
  const isManager =
    hasRoleKeyLike(roleKeys, ['super_admin', 'store_manager', 'manager', 'admin']) ||
    permissions.has('*') ||
    permissions.has('aura:manager:view');

  if (isManager) return ['manager', 'reception', 'beautician'];

  const availableRoles: AuraTerminalRole[] = [];
  if (
    hasRoleKeyLike(roleKeys, ['cashier', 'reception', 'frontdesk']) ||
    hasAnyPermission(permissions, [
      'aura:reception:view',
      'aura:cashier:create',
      'core:order:create',
      'core:order:products',
      'core:order:projects',
      'core:goods:cards',
    ]) ||
    hasTerminalPermissionPrefix(permissions, ['terminal:cashier:', 'terminal:reception:'])
  ) {
    availableRoles.push('reception');
  }
  if (
    hasRoleKeyLike(roleKeys, ['beautician']) ||
    permissions.has('aura:beautician:view') ||
    hasTerminalPermissionPrefix(permissions, ['terminal:service:', 'terminal:beautician:'])
  ) {
    availableRoles.push('beautician');
  }

  return [...new Set(availableRoles)];
}

export function resolveAuraAvailableRolesForUser(user: any): AuraTerminalRole[] {
  if (!user) return ['reception'];
  return resolveAuraAvailableRolesFromSignals({
    roleKeys: getUserRoleKeys(user),
    permissions: getUserPermissionList(user),
  });
}

export function collectAuraUserPermissions(user: any): string[] {
  return getUserPermissionList(user);
}

export function collectAuraUserRoleKeys(user: any): string[] {
  return getUserRoleKeys(user);
}

export function collectAuraUserFieldScopes(user: any): AuraFieldScopes {
  const result: AuraFieldScopes = {};
  for (const item of user?.roles ?? []) {
    const roleKey = typeof item?.role?.key === 'string' ? item.role.key : '';
    if (roleKey) mergeFieldScopes(result, getDefaultFieldScopesForRoleKey(roleKey));
    mergeFieldScopes(result, normalizeFieldScopes(item?.role?.fieldScopes));
  }
  return result;
}
