import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketingActivityEffect } from './MarketingActivityEffect';

const api = vi.hoisted(() => ({
  getMarketingActivityById: vi.fn(),
  getUnifiedMarketingEffects: vi.fn(),
}));

vi.mock('@/api/marketing', () => api);

describe('MarketingActivityEffect metric sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getMarketingActivityById.mockResolvedValue({
      id: 2,
      title: '夏季补水活动',
      description: '活动说明',
      status: 'active',
      participants: 50,
      conversion: '15%',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      targetCustomers: '补水客户',
      discount: '满300减80',
    });
    api.getUnifiedMarketingEffects.mockResolvedValue({
      items: [{
        id: 'activity-2',
        objectId: 2,
        objectType: 'activity',
        objectTypeLabel: '推广活动',
        objectName: '夏季补水活动',
        status: '已记录',
        exposureCount: 10,
        clickCount: 2,
        conversionCount: 1,
        revenue: 480,
        cost: 40,
        roi: '12x',
        conversionRate: '10%',
        metricsSource: '真实收入 / 估算成本',
        metrics: {
          exposure: { value: 10, source: 'actual', definition: '真实曝光' },
          conversion: { value: 1, source: 'actual', definition: '真实转化' },
          revenue: { value: 480, source: 'actual', definition: '订单主归因收入' },
          cost: { value: 40, source: 'estimated', definition: '固定单价估算' },
        },
      }],
      summary: { totalObjects: 1, exposureCount: 10, clickCount: 2, conversionCount: 1, revenue: 480, cost: 40, roi: '12x' },
      emptyReasons: {},
      generatedAt: '2026-07-13T03:00:00.000Z',
    });
  });

  it('does not label configured participants as actual and distinguishes actual revenue from estimated cost', async () => {
    render(
      <MemoryRouter initialEntries={['/customer-marketing/activities/2/effect']}>
        <Routes>
          <Route path="/customer-marketing/activities/:id/effect" element={<MarketingActivityEffect />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: '夏季补水活动' })).toBeInTheDocument();
    expect(screen.getByText('活动配置值（非实际转化）')).toBeInTheDocument();
    expect(screen.getByText('真实收入')).toBeInTheDocument();
    expect(screen.getByText('估算成本')).toBeInTheDocument();
  });
});
