import { describe, expect, it } from 'vitest';
import { hasPermission, normalizePermissionCode, normalizePermissions, PERMISSION_CATALOG, ROLE_PERMISSIONS } from '@/config/permissions';
import { MENU_ITEMS } from '@/app/components/Layout';
import { router } from '@/app/routes';
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
        'core:supply:supplier',
      ]),
    );
    expect(normalizePermissionCode('finance:view')).toBe('core:finance:view');
    expect(normalizePermissionCode('commission:manage')).toBe('core:finance:manage');
    expect(normalizePermissionCode('supplier:manage')).toBe('core:supply:manage');
    expect(normalizePermissionCode('supply:supplier')).toBe('core:supply:supplier');
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

  it('keeps supplier accounts isolated from store operations', () => {
    expect(hasPermission(ROLE_PERMISSIONS.supplier_admin, 'core:supply:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.supplier_admin, 'core:supply:supplier')).toBe(true);

    expect(hasPermission(ROLE_PERMISSIONS.supplier_admin, 'core:supply:manage')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.supplier_admin, 'core:inventory:purchase')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.supplier_admin, 'core:finance:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:supply:supplier')).toBe(false);
  });

  it('keeps operation profit permissions aligned with role matrix', () => {
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:operation-profit:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:product-margin:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:project-margin:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:project-order-profit:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:prepaid-liability:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:beautician-performance:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:operation-cost:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:operation-cost:manage')).toBe(false);

    expect(hasPermission(ROLE_PERMISSIONS.inventory_manager, 'core:project-margin:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.inventory_manager, 'core:project-order-profit:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.inventory_manager, 'core:product-margin:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.inventory_manager, 'core:operation-profit:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.inventory_manager, 'core:operation-cost:view')).toBe(false);

    expect(hasPermission(ROLE_PERMISSIONS.cashier, 'core:operation-profit:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.cashier, 'core:project-order-profit:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.beautician, 'core:operation-profit:view')).toBe(false);
  });

  it('keeps operation profit menu entries registered in the permission catalog', () => {
    const catalogCodes = new Set(PERMISSION_CATALOG.map((permission) => permission.code));
    const financeMenu = MENU_ITEMS.find((menu) => menu.path === '/finance');
    const operationProfitChildren = financeMenu?.children.filter((child) => child.path.startsWith('/operation-profit'));

    expect(MENU_ITEMS.find((menu) => menu.path === '/operation-profit')).toBeUndefined();
    expect(operationProfitChildren?.map((child) => ({
      title: child.title,
      path: child.path,
      permission: child.permission,
      group: child.group,
    }))).toEqual([
      { title: '员工人效', path: '/operation-profit/beautician-performance', permission: 'core:beautician-performance:view', group: '提成与人效' },
      { title: '利润看板', path: '/operation-profit/overview', permission: 'core:operation-profit:view', group: '经营利润' },
      { title: '商品毛利', path: '/operation-profit/product-margins', permission: 'core:product-margin:view', group: '经营利润' },
      { title: '项目毛利', path: '/operation-profit/project-margins', permission: 'core:project-margin:view', group: '经营利润' },
      { title: '会员卡履约', path: '/operation-profit/prepaid-liabilities', permission: 'core:prepaid-liability:view', group: '经营利润' },
      { title: '成本配置', path: '/operation-profit/costs', permission: 'core:operation-cost:view', group: '经营利润' },
    ]);
    expect(operationProfitChildren?.every((child) => catalogCodes.has(child.permission))).toBe(true);
    expect(catalogCodes.has('core:project-order-profit:view')).toBe(true);
  });

  it('keeps operation profit menu paths aligned with guarded routes', () => {
    type RouteLike = {
      path?: string;
      children?: RouteLike[];
      handle?: { permission?: string };
    };

    const financeMenu = MENU_ITEMS.find((menu) => menu.path === '/finance');
    const operationProfitChildren = financeMenu?.children.filter((child) => child.path.startsWith('/operation-profit'));
    const rootRoute = (router.routes as RouteLike[]).find((route) => route.path === '/');
    const guardedRoutes = new Map(
      rootRoute?.children
        ?.filter((route) => route.path?.startsWith('operation-profit/') && route.handle?.permission)
        .map((route) => [`/${route.path}`, route.handle?.permission]) ?? [],
    );

    expect(operationProfitChildren?.map((child) => [child.path, child.permission])).toEqual([
      ['/operation-profit/beautician-performance', 'core:beautician-performance:view'],
      ['/operation-profit/overview', 'core:operation-profit:view'],
      ['/operation-profit/product-margins', 'core:product-margin:view'],
      ['/operation-profit/project-margins', 'core:project-margin:view'],
      ['/operation-profit/prepaid-liabilities', 'core:prepaid-liability:view'],
      ['/operation-profit/costs', 'core:operation-cost:view'],
    ]);
    for (const child of operationProfitChildren ?? []) {
      expect(guardedRoutes.get(child.path)).toBe(child.permission);
    }
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
