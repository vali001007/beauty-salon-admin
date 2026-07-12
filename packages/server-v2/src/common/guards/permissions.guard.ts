import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/index.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    const permissions: string[] = user.permissions ?? [];
    const deniedPermissions: string[] = user.deniedPermissions ?? [];

    if (deniedPermissions.includes('*')) return false;
    if (requiredPermissions.some((permission) => deniedPermissions.includes(permission))) {
      return false;
    }

    if (permissions.includes('*')) return true;

    return requiredPermissions.every((permission) => permissions.includes(permission));
  }
}
