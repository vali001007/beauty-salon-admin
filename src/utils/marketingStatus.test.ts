import { describe, expect, it } from 'vitest';
import { getMarketingActivityStatusLabel, normalizeMarketingActivityStatus } from './marketingStatus';

describe('marketing activity status', () => {
  it('normalizes legacy Chinese status codes', () => {
    expect(normalizeMarketingActivityStatus('进行中')).toBe('active');
    expect(normalizeMarketingActivityStatus('草稿')).toBe('draft');
  });

  it('renders stable Chinese labels for API status codes', () => {
    expect(getMarketingActivityStatusLabel('scheduled')).toBe('即将开始');
    expect(getMarketingActivityStatusLabel('cancelled')).toBe('已取消');
  });
});
