import { DashboardService } from './dashboard.service';

describe('DashboardService workbench helpers', () => {
  let service: DashboardService;

  beforeEach(() => {
    service = new DashboardService({} as any, {} as any);
  });

  it('returns all workbench roles for super admin', () => {
    const roles = (service as any).resolveAvailableRoles(['super_admin'], ['*'], true);

    expect(roles).toEqual(['super_admin', 'store_manager', 'inventory_manager', 'cashier', 'beautician']);
  });

  it('maps store managers to manager, cashier, and beautician views', () => {
    const roles = (service as any).resolveAvailableRoles(['store_manager'], ['core:dashboard:view'], false);

    expect(roles).toEqual(['store_manager', 'cashier', 'beautician']);
  });

  it('infers inventory workbench from inventory permission', () => {
    const roles = (service as any).resolveAvailableRoles(['custom_role'], ['core:dashboard:view', 'core:inventory:stock'], false);

    expect(roles).toContain('inventory_manager');
  });

  it('filters denied permissions after wildcard permission', () => {
    const items = [
      { key: 'dashboard' },
      { key: 'customers', permission: 'core:customer:view' },
      { key: 'stock', permission: 'core:inventory:stock' },
    ];

    expect((service as any).filterByPermission(items, ['*'], ['core:inventory:stock'])).toEqual([
      { key: 'dashboard' },
      { key: 'customers', permission: 'core:customer:view' },
    ]);
  });
});
