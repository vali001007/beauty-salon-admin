import { hasPermission } from '@/config/permissions';
import type { AuthUser } from '@/types';
import type { AdminWorkbenchRole } from '@/types/dashboard';
import { ADMIN_WORKBENCH_ROLE_PRIORITY } from './workbenchConfig';

const WORKBENCH_ROLES = new Set<AdminWorkbenchRole>(ADMIN_WORKBENCH_ROLE_PRIORITY);

export function isWorkbenchRole(value: unknown): value is AdminWorkbenchRole {
  return typeof value === 'string' && WORKBENCH_ROLES.has(value as AdminWorkbenchRole);
}

function hasRole(roles: string[], ...targets: string[]) {
  return targets.some((target) => roles.includes(target));
}

function hasRoleKeyword(roles: string[], keyword: string) {
  return roles.some((role) => role.includes(keyword));
}

export function resolveAvailableWorkbenchRoles(user: AuthUser | null): AdminWorkbenchRole[] {
  if (!user) return ['default'];

  const roles = user.roles ?? [];
  const permissions = user.permissions ?? [];
  const resolved = new Set<AdminWorkbenchRole>();

  if (hasPermission(permissions, '*') || hasRole(roles, 'super_admin', 'admin')) {
    return ['super_admin', 'store_manager', 'inventory_manager', 'cashier', 'beautician'];
  }

  if (hasRole(roles, 'store_manager') || hasRoleKeyword(roles, 'store_manager') || hasRoleKeyword(roles, 'full_manager')) {
    resolved.add('store_manager');
    resolved.add('cashier');
    resolved.add('beautician');
  }

  if (hasRole(roles, 'inventory_manager') || hasPermission(permissions, 'core:inventory:stock')) {
    resolved.add('inventory_manager');
  }

  if (hasRole(roles, 'cashier') || hasRoleKeyword(roles, 'cashier') || hasPermission(permissions, 'core:order:card-usage')) {
    resolved.add('cashier');
  }

  if (hasRole(roles, 'beautician') || hasRoleKeyword(roles, 'beautician') || hasPermission(permissions, 'terminal:service:view')) {
    resolved.add('beautician');
  }

  if (resolved.size === 0 && hasPermission(permissions, 'core:dashboard:view')) {
    resolved.add('default');
  }

  const ordered = ADMIN_WORKBENCH_ROLE_PRIORITY.filter((role) => resolved.has(role));
  return ordered.length > 0 ? ordered : ['default'];
}

export function resolveDefaultWorkbenchRole(user: AuthUser | null): AdminWorkbenchRole {
  return resolveAvailableWorkbenchRoles(user)[0] ?? 'default';
}

export function resolveRequestedWorkbenchRole(
  requestedRole: unknown,
  availableRoles: AdminWorkbenchRole[],
): AdminWorkbenchRole {
  if (isWorkbenchRole(requestedRole) && availableRoles.includes(requestedRole)) {
    return requestedRole;
  }
  return availableRoles[0] ?? 'default';
}
