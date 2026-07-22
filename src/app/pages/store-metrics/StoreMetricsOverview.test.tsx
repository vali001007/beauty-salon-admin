import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreMetricsOverview } from './StoreMetricsOverview';

const apiMocks = vi.hoisted(() => ({
  getStoreMetricsOverview: vi.fn(),
  getStoreMetricDrilldown: vi.fn(),
}));

vi.mock('@/api/storeMetrics', () => apiMocks);
vi.mock('@/stores/storeStore', () => ({
  useStoreStore: (selector: (state: { currentStoreId: number }) => unknown) => selector({ currentStoreId: 6 }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const metrics = [
  ['store.paid_revenue.today', '今日实收', 'CNY', 12000, 'complete'],
  ['store.operating_revenue.today', '今日经营收入', 'CNY', 10000, 'complete'],
  ['store.gross_margin_rate.today', '毛利率', 'percent', 0.42, 'frozen'],
  ['store.monthly_target_completion_rate', '门店月度目标达成率', 'percent', 0.68, 'complete'],
  ['customer.first_visit_arrival_rate', '新客首次到店率', 'percent', 0.8, 'complete'],
  ['customer.first_visit_conversion_rate', '首次到店成交率', 'percent', 0.5, 'estimated'],
  ['reservation.checkout_rebooking_rate', '现场再预约率', 'percent', 0.4, 'complete'],
  ['customer.new_customer_30d_repurchase_rate', '30天新客复购率', 'percent', null, 'unavailable'],
  ['reservation.no_show_rate', '预约爽约率', 'percent', 0.1, 'partial'],
  ['staff.service_time_utilization_rate', '美容师工时利用率', 'percent', 0.7, 'complete'],
  ['staff.operating_revenue_per_service_hour', '单位服务工时产值', 'CNY_PER_HOUR', 560, 'complete'],
  ['member.renewal_rate', '会员续费率', 'percent', 0.6, 'complete'],
].map(([key, name, unit, value, quality]) => ({
  key,
  name,
  unit,
  value,
  numerator: value === null ? 0 : 4,
  denominator: value === null ? 0 : 5,
  sampleCount: value === null ? 0 : 5,
  target: null,
  targetCompletionRate: null,
  quality: { status: quality, reasons: quality === 'estimated' ? ['legacy_order_reservation_inferred'] : [] },
  definitionVersion: 1,
  updatedAt: '2026-07-15T00:00:00.000Z',
  drilldownPath: '/stores/reservations',
}));

describe('StoreMetricsOverview', () => {
  beforeEach(() => {
    apiMocks.getStoreMetricsOverview.mockReset();
    apiMocks.getStoreMetricDrilldown.mockReset();
    apiMocks.getStoreMetricsOverview.mockResolvedValue({
      scope: { storeId: 6, storeName: '测试门店', timezone: 'Asia/Shanghai', date: '2026-07-15' },
      metrics,
      alerts: [],
      generatedAt: '2026-07-15T00:00:00.000Z',
    });
  });

  it('renders all twelve metrics and keeps null and quality states explicit', async () => {
    render(<MemoryRouter><StoreMetricsOverview /></MemoryRouter>);

    expect(await screen.findByText('门店经营指标')).toBeInTheDocument();
    for (const metric of metrics) expect(screen.getByText(String(metric.name))).toBeInTheDocument();
    expect(screen.getByText('暂无样本')).toBeInTheDocument();
    expect(screen.getByText('历史估算')).toBeInTheDocument();
    expect(screen.getByText('部分缺失')).toBeInTheDocument();
    expect(screen.getByText('已冻结')).toBeInTheDocument();
    expect(apiMocks.getStoreMetricsOverview).toHaveBeenCalledWith(expect.objectContaining({ storeId: 6 }));
  });
});
