import { describe, expect, it } from 'vitest';
import { hasPermission, normalizePermissionCode, normalizePermissions, PERMISSION_CATALOG, ROLE_PERMISSIONS } from '@/config/permissions';
import { formatScopedValue, maskPhone } from '@/utils/fieldMask';
import { resolveStoreFilter } from '@/utils/dataAccess';

describe('permission catalog helpers', () => {
  it('normalizes legacy permission codes to platform-scoped codes', () => {
    expect(normalizePermissionCode('customer:view')).toBe('core:customer:view');
    expect(normalizePermissionCode('system:role:manage')).toBe('core:system:roles');
    expect(normalizePermissions(['customer:view', 'core:customer:view'])).toEqual(['core:customer:view']);
  });

  it('supports wildcard and explicit permissions', () => {
    expect(hasPermission(['*'], 'core:customer:export')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.cashier, 'order:card-usage')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.beautician, 'core:customer:export')).toBe(false);
  });

  it('registers financial and supply-chain permission codes', () => {
    const codes = PERMISSION_CATALOG.map((permission) => permission.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        'core:finance:view',
        'core:finance:manage',
        'core:finance:export',
        'core:supply:view',
        'core:supply:manage',
      ]),
    );
    expect(normalizePermissionCode('finance:view')).toBe('core:finance:view');
    expect(normalizePermissionCode('commission:manage')).toBe('core:finance:manage');
    expect(normalizePermissionCode('supplier:manage')).toBe('core:supply:manage');
  });

  it('keeps finance access scoped to admin roles', () => {
    expect(hasPermission(ROLE_PERMISSIONS.super_admin, 'core:finance:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:finance:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:finance:manage')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:supply:manage')).toBe(true);

    expect(hasPermission(ROLE_PERMISSIONS.cashier, 'core:finance:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.cashier, 'core:supply:manage')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.beautician, 'core:finance:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.inventory_manager, 'core:finance:view')).toBe(false);
  });
});

describe('field masking helpers', () => {
  it('masks or hides scoped field values', () => {
    expect(maskPhone('13800138000')).toBe('138****8000');
    expect(formatScopedValue('13800138000', 'masked', 'phone')).toBe('138****8000');
    expect(formatScopedValue('13800138000', 'hidden', 'phone')).toBe('-');
  });
});

describe('data access helpers', () => {
  it('resolves store filters from current user scope', () => {
    expect(resolveStoreFilter({ storeIds: [1, 2], permissions: [], dataScopes: { store: 'own_store' } as any }, null)).toEqual([1, 2]);
    expect(resolveStoreFilter({ storeIds: [1, 2], permissions: [], dataScopes: { store: 'own_store' } as any }, 2)).toEqual([2]);
    expect(resolveStoreFilter({ storeIds: [1], permissions: ['*'], dataScopes: { store: 'all' } as any }, null)).toBeNull();
  });
});
