import React from 'react';
import { useAuthStore } from '../../stores/authStore';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { hasPermission } from '@/config/permissions';

interface PermissionGuardProps {
  children: React.ReactNode;
  permission: string;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({ children, permission }) => {
  const user = useAuthStore((state) => state.user);
  const permissions = user?.permissions ?? [];
  const deniedPermissions = user?.deniedPermissions ?? [];

  if (hasPermission(permissions, permission) && !hasPermission(deniedPermissions, permission)) {
    return <>{children}</>;
  }

  return <ForbiddenPage />;
};
