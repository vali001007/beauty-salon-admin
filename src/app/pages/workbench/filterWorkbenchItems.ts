import { hasPermission } from '@/config/permissions';

export function filterWorkbenchItems<T extends { permission?: string }>(
  items: T[],
  permissions: string[] = [],
  deniedPermissions: string[] = [],
): T[] {
  return items.filter((item) => {
    if (!item.permission) return true;
    if (hasPermission(deniedPermissions, '*') || hasPermission(deniedPermissions, item.permission)) return false;
    return hasPermission(permissions, item.permission);
  });
}
