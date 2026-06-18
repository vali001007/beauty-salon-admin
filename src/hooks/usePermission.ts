import { useAuthStore } from '../stores/authStore';
import { hasPermission } from '@/config/permissions';

export function usePermission(permissionCode: string): boolean {
  const user = useAuthStore((state) => state.user);
  const permissions = user?.permissions ?? [];
  const deniedPermissions = user?.deniedPermissions ?? [];

  return hasPermission(permissions, permissionCode) && !hasPermission(deniedPermissions, permissionCode);
}
