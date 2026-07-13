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

  it('keeps Agent governance behind dedicated permissions', () => {
    const codes = PERMISSION_CATALOG.map((permission) => permission.code);
    const systemMenu = MENU_ITEMS.find((menu) => menu.path === '/system');

    expect(codes).toEqual(expect.arrayContaining(['core:agent-governance:view', 'core:agent-governance:manage']));
    expect(hasPermission(ROLE_PERMISSIONS.super_admin, 'core:agent-governance:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:agent-governance:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:agent-governance:manage')).toBe(false);
    expect(systemMenu?.children.find((child) => child.path === '/system/agent-governance')).toMatchObject({
      title: 'AI 治理中心',
      permission: 'core:agent-governance:view',
    });
    expect(systemMenu?.children.some((child) => child.path === '/system/ai-audit')).toBe(false);
    expect(systemMenu?.children.some((child) => child.path === '/system/agent-audit')).toBe(false);
    expect(systemMenu?.children.some((child) => child.path === '/system/agent-capabilities')).toBe(false);
  });

  it('registers Ami Brain runtime and governance permissions', () => {
    const codes = PERMISSION_CATALOG.map((permission) => permission.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        'core:brain:use',
        'core:brain:execute',
        'core:brain:sensitive:view',
        'core:brain-governance:view',
        'core:brain-governance:manage',
      ]),
    );
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:brain:use')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:brain:execute')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.cashier, 'core:brain-governance:view')).toBe(false);
  });

  it('registers financial and supply-platform permission codes', () => {
    const codes = PERMISSION_CATALOG.map((permission) => permission.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        'core:finance:view',
        'core:finance:manage',
        'core:finance:export',
        'core:platform-revenue:view',
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

  it('keeps inventory operation permissions separated from stock viewing', () => {
    const codes = PERMISSION_CATALOG.map((permission) => permission.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        'core:inventory:stock',
        'core:inventory:adjustment',
        'core:inventory:stocktake',
      ]),
    );
    expect(normalizePermissionCode('inventory:adjustment')).toBe('core:inventory:adjustment');
    expect(normalizePermissionCode('inventory:stocktake')).toBe('core:inventory:stocktake');

    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:inventory:adjustment')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:inventory:stocktake')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.inventory_manager, 'core:inventory:adjustment')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.inventory_manager, 'core:inventory:stocktake')).toBe(true);

    expect(hasPermission(ROLE_PERMISSIONS.cashier, 'core:inventory:stock')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.cashier, 'core:inventory:adjustment')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.cashier, 'core:inventory:stocktake')).toBe(false);
  });

  it('keeps finance access scoped to admin roles', () => {
    expect(hasPermission(ROLE_PERMISSIONS.super_admin, 'core:finance:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:finance:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:finance:manage')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:supply:manage')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:platform-revenue:view')).toBe(false);

    expect(hasPermission(ROLE_PERMISSIONS.cashier, 'core:finance:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.cashier, 'core:supply:manage')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.cashier, 'core:platform-revenue:view')).toBe(false);
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
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:product-order-profit:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:card-order-profit:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:prepaid-liability:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:beautician-performance:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:operation-cost:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.store_manager, 'core:operation-cost:manage')).toBe(false);

    expect(hasPermission(ROLE_PERMISSIONS.inventory_manager, 'core:project-margin:view')).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.inventory_manager, 'core:project-order-profit:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.inventory_manager, 'core:product-order-profit:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.inventory_manager, 'core:card-order-profit:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.inventory_manager, 'core:product-margin:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.inventory_manager, 'core:operation-profit:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.inventory_manager, 'core:operation-cost:view')).toBe(false);

    expect(hasPermission(ROLE_PERMISSIONS.cashier, 'core:operation-profit:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.cashier, 'core:project-order-profit:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.cashier, 'core:product-order-profit:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.cashier, 'core:card-order-profit:view')).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.beautician, 'core:operation-profit:view')).toBe(false);
  });

  it('keeps finance center menu entries registered in the permission catalog', () => {
    const catalogCodes = new Set(PERMISSION_CATALOG.map((permission) => permission.code));
    const financeMenu = MENU_ITEMS.find((menu) => menu.path === '/finance');
    const systemMenu = MENU_ITEMS.find((menu) => menu.path === '/system');

    expect(MENU_ITEMS.find((menu) => menu.path === '/operation-profit')).toBeUndefined();
    expect(financeMenu?.children.map((child) => ({
      title: child.title,
      path: child.path,
      permission: child.permission,
      group: child.group,
    }))).toEqual([
      { title: '收银对账', path: '/finance/reconciliation', permission: 'core:finance:view', group: '结算与对账' },
      { title: '员工提成', path: '/finance/staff-commission', permission: 'core:finance:view', group: '提成与人效' },
      { title: '经营利润', path: '/finance/profit', permission: 'core:operation-profit:view', group: '经营利润' },
      { title: '会员资产', path: '/finance/member-assets', permission: 'core:prepaid-liability:view', group: '会员资产' },
      { title: '数字员工账单', path: '/finance/ami-billing', permission: 'core:finance:view', group: '数字员工' },
    ]);
    expect(financeMenu?.children.every((child) => catalogCodes.has(child.permission))).toBe(true);
    expect(systemMenu?.children.find((child) => child.path === '/finance/platform-revenue')?.permission).toBe('core:platform-revenue:view');
    expect(catalogCodes.has('core:project-order-profit:view')).toBe(true);
    expect(catalogCodes.has('core:product-order-profit:view')).toBe(true);
    expect(catalogCodes.has('core:card-order-profit:view')).toBe(true);
  });

  it('keeps finance center menu paths backed by guarded routes', () => {
    type RouteLike = {
      path?: string;
      children?: RouteLike[];
      handle?: { permission?: string };
    };

    const financeMenu = MENU_ITEMS.find((menu) => menu.path === '/finance');
    const rootRoute = (router.routes as RouteLike[]).find((route) => route.path === '/');
    const routePaths = new Set(rootRoute?.children?.map((route) => (route.path === 'finance' ? '/finance' : `/${route.path}`)) ?? []);

    for (const child of financeMenu?.children ?? []) {
      expect(routePaths.has(child.path)).toBe(true);
    }
    expect(routePaths.has('/finance/platform-revenue')).toBe(true);
  });

  it('keeps legacy operation profit routes available with their original permissions', () => {
    type RouteLike = {
      path?: string;
      children?: RouteLike[];
      handle?: { permission?: string };
    };

    const rootRoute = (router.routes as RouteLike[]).find((route) => route.path === '/');
    const guardedRoutes = new Map(
      rootRoute?.children
        ?.filter((route) => route.path?.startsWith('operation-profit/') && route.handle?.permission)
        .map((route) => [`/${route.path}`, route.handle?.permission]) ?? [],
    );

    expect(Array.from(guardedRoutes.entries())).toEqual([
      ['/operation-profit/overview', 'core:operation-profit:view'],
      ['/operation-profit/product-margins', 'core:product-margin:view'],
      ['/operation-profit/project-margins', 'core:project-margin:view'],
      ['/operation-profit/prepaid-liabilities', 'core:prepaid-liability:view'],
      ['/operation-profit/card-liabilities', 'core:prepaid-liability:view'],
      ['/operation-profit/beautician-performance', 'core:beautician-performance:view'],
      ['/operation-profit/costs', 'core:operation-cost:view'],
    ]);
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
