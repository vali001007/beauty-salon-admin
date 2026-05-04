import { useAuthStore } from '../stores/authStore';

export function usePermission(permissionCode: string): boolean {
  const user = useAuthStore((state) => state.user);
  const permissions = user?.permissions ?? [];

  if (permissions.includes('*')) {
    return true;
  }

  return permissions.includes(permissionCode);
}
