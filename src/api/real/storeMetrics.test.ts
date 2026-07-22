import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));

vi.mock('../client', () => ({ default: apiClientMock }));

describe('store metrics real API contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes overview, drilldown and target writes to the public contract', async () => {
    const api = await import('./storeMetrics');
    await api.realGetStoreMetricsOverview({ storeId: 6, date: '2026-07-15' });
    await api.realGetStoreMetricDrilldown('reservation.no_show_rate', { storeId: 6, date: '2026-07-15', page: 1, pageSize: 20 });
    await api.realCreateStoreMetricTarget({ storeId: 6, metricKey: 'store.operating_revenue.today', periodType: 'month', periodStart: '2026-07-01', periodEnd: '2026-07-31', targetValue: 100000 });
    await api.realUpdateStoreMetricTarget(3, { targetValue: 120000 });

    expect(apiClientMock.get).toHaveBeenNthCalledWith(1, '/store-metrics/overview', { params: { storeId: 6, date: '2026-07-15' } });
    expect(apiClientMock.get).toHaveBeenNthCalledWith(2, '/store-metrics/reservation.no_show_rate/drilldown', { params: { storeId: 6, date: '2026-07-15', page: 1, pageSize: 20 } });
    expect(apiClientMock.post).toHaveBeenCalledWith('/store-metrics/targets', expect.objectContaining({ storeId: 6, targetValue: 100000 }));
    expect(apiClientMock.put).toHaveBeenCalledWith('/store-metrics/targets/3', { targetValue: 120000 });
  });
});
