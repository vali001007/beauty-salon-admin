import { BrainPermissionService } from './security/brain-permission.service.js';

describe('BrainPermissionService', () => {
  const service = new BrainPermissionService();

  it('does not allow an agent role to amplify user permissions', () => {
    const result = service.canUseSkill({
      userPermissions: ['core:customer:view'],
      requiredPermissions: ['core:finance:view'],
      userDeniedPermissions: [],
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('missing_permission:core:finance:view');
  });

  it('allows super admin wildcard unless explicitly denied', () => {
    const result = service.canUseSkill({
      userPermissions: ['*'],
      requiredPermissions: ['core:finance:view'],
      userDeniedPermissions: [],
    });

    expect(result.allowed).toBe(true);
  });

  it('denies access when the requested store is outside the visible store scope', () => {
    const result = service.assertStoreScope(3, [1, 2]);

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('store_scope_denied:3');
  });
});
