import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketingAnalytics } from './MarketingAnalytics';

const api = vi.hoisted(() => ({
  getUnifiedMarketingEffects: vi.fn(),
  getMarketingFollowUpTaskSummary: vi.fn(),
}));

vi.mock('@/api/marketing', () => api);
vi.mock('@/app/components/MarketingEffectDetailDialog', () => ({ MarketingEffectDetailDialog: () => null }));

describe('MarketingAnalytics fact metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      }],
      summary: {
        totalObjects: 1,
        exposureCount: 10,
        clickCount: 2,
        conversionCount: 1,
        revenue: 480,
        cost: 40,
        roi: '12x',
      },
      metricSummary: {
        exposure: { value: 10, source: 'actual', definition: '真实曝光' },
        clicks: { value: 2, source: 'actual', definition: '真实点击' },
        conversions: { value: 1, source: 'actual', definition: '主归因转化' },
        revenue: { value: 480, source: 'actual', definition: '订单收入减退款' },
        cost: { value: 40, source: 'estimated', definition: '固定单价估算' },
        roi: { value: 12, source: 'estimated', definition: '净收入除以估算成本' },
      },
      emptyReasons: {},
      generatedAt: '2026-07-13T03:00:00.000Z',
    });
    api.getMarketingFollowUpTaskSummary.mockResolvedValue({ pending: 0, completed: 0, overdue: 0 });
  });

  it('shows deduplicated actual revenue separately from estimated cost', async () => {
    render(<MemoryRouter><MarketingAnalytics /></MemoryRouter>);

    expect(await screen.findByText('真实收入：订单主归因减退款')).toBeInTheDocument();
    expect(screen.getByText('估算成本：非渠道账单')).toBeInTheDocument();
    expect(screen.getByText('1 转化 · 真实收入')).toBeInTheDocument();
    expect(screen.getByText('估算成本 ¥40')).toBeInTheDocument();
    expect(screen.getByText('汇总只计算一次，维度仅用于拆解')).toBeInTheDocument();
  });
});
