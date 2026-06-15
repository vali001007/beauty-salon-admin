import { describe, expect, it } from 'vitest';
import type { AuthUser } from '@/types';
import { resolveAvailableWorkbenchRoles, resolveDefaultWorkbenchRole, isWorkbenchRole } from './resolveWorkbenchRole';

function makeUser(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: 1,
    username: 'tester',
    name: '测试用户',
    phone: '13800000000',
    roles: [],
    permissions: ['core:dashboard:view'],
    storeIds: [1],
    ...overrides,
  };
}

describe('resolveWorkbenchRole', () => {
  it('returns all workbench roles for super admin', () => {
    const user = makeUser({ roles: ['super_admin'], permissions: ['*'] });

    expect(resolveAvailableWorkbenchRoles(user)).toEqual([
      'super_admin',
      'store_manager',
      'inventory_manager',
      'cashier',
      'beautician',
    ]);
    expect(resolveDefaultWorkbenchRole(user)).toBe('super_admin');
  });

  it('defaults store manager to the manager workbench', () => {
    const user = makeUser({ roles: ['store_manager'] });

    expect(resolveAvailableWorkbenchRoles(user)).toEqual(['store_manager', 'cashier', 'beautician']);
    expect(resolveDefaultWorkbenchRole(user)).toBe('store_manager');
  });

  it('resolves cashier, beautician, and inventory users', () => {
    expect(resolveDefaultWorkbenchRole(makeUser({ roles: ['cashier'], permissions: ['core:dashboard:view'] }))).toBe('cashier');
    expect(resolveDefaultWorkbenchRole(makeUser({ roles: ['beautician'], permissions: ['core:dashboard:view'] }))).toBe('beautician');
    expect(resolveDefaultWorkbenchRole(makeUser({ roles: ['inventory_manager'], permissions: ['core:dashboard:view'] }))).toBe(
      'inventory_manager',
    );
  });

  it('falls back to default for unknown dashboard users', () => {
    const user = makeUser({ roles: ['report_viewer'], permissions: ['core:dashboard:view'] });

    expect(resolveAvailableWorkbenchRoles(user)).toEqual(['default']);
    expect(resolveDefaultWorkbenchRole(user)).toBe('default');
  });

  it('guards valid workbench role values', () => {
    expect(isWorkbenchRole('cashier')).toBe(true);
    expect(isWorkbenchRole('unknown')).toBe(false);
  });
});
