import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MarketingActivity } from '@/types';
import { buildActivityEffectFallback, MarketingEffectDetailDialog } from './MarketingEffectDetailDialog';

describe('MarketingEffectDetailDialog activity status', () => {
  it('maps an active status code to the Chinese running label and remaining days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T00:00:00.000Z'));
    const activity: MarketingActivity = {
      id: 1,
      title: '会员召回活动',
      description: '召回高价值客户',
      image: '',
      status: 'active',
      participants: 0,
      conversion: '0%',
      startDate: '2026-07-13T00:00:00.000Z',
      endDate: '2026-07-16T00:00:00.000Z',
      targetCustomers: '高价值客户',
      discount: '到店礼',
      source: '手动创建',
    };

    render(
      <MarketingEffectDetailDialog
        open
        onOpenChange={() => undefined}
        activity={activity}
        item={buildActivityEffectFallback(activity)}
      />,
    );

    expect(screen.getByText('进行中（剩余 2 天）')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
