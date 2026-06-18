import { describe, expect, it } from 'vitest';
import { parseTrackingParams } from '../../packages/marketing-h5/src/api';

describe('marketing H5 tracking params', () => {
  it('reads channel QR params for event and lead attribution', () => {
    expect(
      parseTrackingParams(
        '?channel=wechat_group&staffId=12&utm_source=wechat&utm_medium=group&utm_campaign=summer_hydration',
        'https://example.com/referrer',
      ),
    ).toEqual({
      channel: 'wechat_group',
      staffId: 12,
      campaignId: 'summer_hydration',
      source: 'wechat',
      medium: 'group',
      referrer: 'https://example.com/referrer',
    });
  });

  it('falls back to utm_medium and direct channel when no explicit channel is present', () => {
    expect(parseTrackingParams('?utm_medium=sms&utm_campaign=member_wakeup')).toEqual({
      channel: 'sms',
      staffId: undefined,
      campaignId: 'member_wakeup',
      source: undefined,
      medium: 'sms',
      referrer: undefined,
    });

    expect(parseTrackingParams('')).toEqual({
      channel: 'direct',
      staffId: undefined,
      campaignId: undefined,
      source: undefined,
      medium: undefined,
      referrer: undefined,
    });
  });
});
