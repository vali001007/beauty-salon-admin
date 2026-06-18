import { TerminalDashboardCacheService } from './terminal-dashboard-cache.service';

describe('TerminalDashboardCacheService', () => {
  let service: TerminalDashboardCacheService;

  beforeEach(() => {
    service = new TerminalDashboardCacheService();
  });

  it('invalidates only matching prefixes in the requested store', () => {
    const store1Manager = service.getKey(['manager', 1, '2026-06-07']);
    const store1Inventory = service.getKey(['inventory-alerts', 1]);
    const store2Inventory = service.getKey(['inventory-alerts', 2]);
    const store1Cashier = service.getKey(['cashier-context', 1, '2026-06-07']);

    service.set(store1Manager, { value: 'manager' }, 60_000);
    service.set(store1Inventory, { value: 'inventory-1' }, 60_000);
    service.set(store2Inventory, { value: 'inventory-2' }, 60_000);
    service.set(store1Cashier, { value: 'cashier' }, 60_000);

    service.invalidate(1, ['manager', 'inventory-alerts']);

    expect(service.get(store1Manager)).toBeUndefined();
    expect(service.get(store1Inventory)).toBeUndefined();
    expect(service.get(store2Inventory)).toMatchObject({ value: { value: 'inventory-2' } });
    expect(service.get(store1Cashier)).toMatchObject({ value: { value: 'cashier' } });
  });

  it('can invalidate a prefix across all stores', () => {
    const store1Role = service.getKey(['role', 1, '2026-06-07', 'all']);
    const store2Role = service.getKey(['role', 2, '2026-06-07', 'all']);
    const store1Inventory = service.getKey(['inventory-alerts', 1]);

    service.set(store1Role, { value: 'role-1' }, 60_000);
    service.set(store2Role, { value: 'role-2' }, 60_000);
    service.set(store1Inventory, { value: 'inventory' }, 60_000);

    service.invalidate(undefined, ['role']);

    expect(service.get(store1Role)).toBeUndefined();
    expect(service.get(store2Role)).toBeUndefined();
    expect(service.get(store1Inventory)).toMatchObject({ value: { value: 'inventory' } });
  });
});
