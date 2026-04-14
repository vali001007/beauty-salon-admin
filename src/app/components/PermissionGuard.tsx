import React from 'react';
import { useAuthStore } from '../../stores/authStore';
import { ForbiddenPage } from '../pages/ForbiddenPage';

interface PermissionGuardProps {
  children: React.ReactNode;
  permission: string;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({ children, permission }) => {
  const user = useAuthStore((state) => state.user);
  const permissions = user?.permissions ?? [];

  if (permissions.includes('*') || permissions.includes(permission)) {
    return <>{children}</>;
  }

  return <ForbiddenPage />;
};
