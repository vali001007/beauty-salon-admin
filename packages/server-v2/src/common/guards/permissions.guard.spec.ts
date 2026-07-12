import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  function context(user: { permissions?: string[]; deniedPermissions?: string[] }): ExecutionContext {
    return {
      getHandler: () => function handler() {},
      getClass: () => class TestController {},
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  it('denies when deniedPermissions contains required permission', () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => ['core:brain-governance:manage']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(
        context({
          permissions: ['*'],
          deniedPermissions: ['core:brain-governance:manage'],
        }),
      ),
    ).toBe(false);
  });

  it('requires all listed permissions', () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => ['core:brain:use', 'core:brain-governance:view']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(context({ permissions: ['core:brain:use'], deniedPermissions: [] }))).toBe(false);
  });
});
