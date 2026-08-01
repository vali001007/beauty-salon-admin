import { DashboardService, resolveDashboardStatsMode } from './dashboard.service';

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

  it('defaults dashboard statistics to legacy and accepts explicit rollout modes', () => {
    expect(resolveDashboardStatsMode(undefined)).toBe('legacy');
    expect(resolveDashboardStatsMode('shadow')).toBe('shadow');
    expect(resolveDashboardStatsMode('batched')).toBe('batched');
    expect(resolveDashboardStatsMode('invalid')).toBe('legacy');
  });

  it('uses the batched repository when explicitly enabled', async () => {
    const repository = { collect: jest.fn().mockResolvedValue({
      totalCustomers: 1,
      monthNewCustomers: 1,
      todayIncome: 2,
      yesterdayIncome: 1,
      incomeHint: 'test',
      lowStockCount: 0,
      expiringBatchCount: 0,
      inventoryWarningCount: 0,
      activeActivities: 0,
      todayReservations: 0,
      pendingReservations: 0,
      pendingCheckIn: 0,
      pendingTasks: 0,
      inProgressTasks: 0,
      todayCardUsage: 0,
      todayNewCustomers: 0,
      pendingPurchaseOrders: 0,
      pendingTransferOrders: 0,
      activeStores: 1,
      totalTerminals: 0,
      onlineTerminals: 0,
      offlineTerminals: 0,
    }) };
    const service = new DashboardService({} as any, {} as any, repository as any);
    const previous = process.env.DASHBOARD_STATS_MODE;
    process.env.DASHBOARD_STATS_MODE = 'batched';
    try {
      const result = await (service as any).collectCommonStats({
        scope: { storeId: 6, storeName: '测试门店', mode: 'store' },
        accessibleStoreIds: [6],
        isSuperAdmin: false,
        actor: { currentRole: 'store_manager' },
      }, {
        now: new Date(),
        todayStart: new Date(),
        tomorrowStart: new Date(),
        yesterdayStart: new Date(),
        monthStart: new Date(),
        expiringBefore: new Date(),
      });
      expect(repository.collect).toHaveBeenCalledTimes(1);
      expect(result.totalCustomers).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.DASHBOARD_STATS_MODE;
      else process.env.DASHBOARD_STATS_MODE = previous;
    }
  });
});
