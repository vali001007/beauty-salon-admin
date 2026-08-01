import { DashboardStatsRepository } from './dashboard-stats.repository.js';

describe('DashboardStatsRepository', () => {
  it('collects dashboard statistics in six database statements', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ totalCustomers: 10n, monthNewCustomers: 2n, todayNewCustomers: 1n }])
      .mockResolvedValueOnce([{ todayProductIncome: 100, yesterdayProductIncome: 50, todayCardIncome: 20, yesterdayCardIncome: 10 }])
      .mockResolvedValueOnce([{ lowStockCount: 2n, expiringBatchCount: 1n, activeActivities: 3n }])
      .mockResolvedValueOnce([{ todayReservations: 4n, pendingReservations: 2n, pendingCheckIn: 3n, pendingTasks: 5n, inProgressTasks: 1n, todayCardUsage: 6n }])
      .mockResolvedValueOnce([{ pendingPurchaseOrders: 7n, pendingTransferOrders: 8n }])
      .mockResolvedValueOnce([{ activeStores: 1n, totalTerminals: 4n, onlineTerminals: 3n }]);
    const repository = new DashboardStatsRepository({ $queryRaw: queryRaw } as any);
    const todayStart = new Date('2026-08-01T00:00:00.000Z');

    const result = await repository.collect(
      { storeId: 6, accessibleStoreIds: [6], isSuperAdmin: false },
      {
        todayStart,
        tomorrowStart: new Date('2026-08-02T00:00:00.000Z'),
        yesterdayStart: new Date('2026-07-31T00:00:00.000Z'),
        monthStart: todayStart,
        expiringBefore: new Date('2026-08-31T00:00:00.000Z'),
      },
    );

    expect(queryRaw).toHaveBeenCalledTimes(6);
    expect(result).toMatchObject({
      totalCustomers: 10,
      todayIncome: 120,
      yesterdayIncome: 60,
      inventoryWarningCount: 3,
      offlineTerminals: 1,
    });
  });
});
