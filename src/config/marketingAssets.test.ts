import { describe, expect, it } from 'vitest';
import { MARKETING_SHARE_BASE_URL, buildMarketingPageUrl, normalizeMarketingShareUrl } from './marketingAssets';

describe('marketing page share URLs', () => {
  it('builds a stable public page URL with channel attribution params', () => {
    const url = new URL(
      buildMarketingPageUrl('mp-product-101', {
        channel: 'wechat_group',
        staffId: 12,
        utm_source: 'wechat',
        utm_medium: 'group',
        utm_campaign: 'summer_hydration',
        empty: '',
        skipped: undefined,
      }),
    );

    expect(`${url.origin}${url.pathname}`).toBe(`${MARKETING_SHARE_BASE_URL}/page/mp-product-101`);
    expect(url.searchParams.get('channel')).toBe('wechat_group');
    expect(url.searchParams.get('staffId')).toBe('12');
    expect(url.searchParams.get('utm_source')).toBe('wechat');
    expect(url.searchParams.get('utm_medium')).toBe('group');
    expect(url.searchParams.get('utm_campaign')).toBe('summer_hydration');
    expect(url.searchParams.has('empty')).toBe(false);
    expect(url.searchParams.has('skipped')).toBe(false);
  });

  it('encodes slugs without losing the public page route', () => {
    expect(buildMarketingPageUrl('mp product 101')).toBe(`${MARKETING_SHARE_BASE_URL}/page/mp%20product%20101`);
  });

  it('rewrites legacy placeholder miniapp domain to the configured H5 base URL', () => {
    expect(normalizeMarketingShareUrl('https://mini.ami-core.com/page/mp-product-101')).toBe(
      `${MARKETING_SHARE_BASE_URL}/page/mp-product-101`,
    );
  });

  it('rewrites local terminal or legacy conflicting ports to the marketing H5 base URL', () => {
    expect(normalizeMarketingShareUrl('http://127.0.0.1:5175/page/mp-product-101')).toBe(
      `${MARKETING_SHARE_BASE_URL}/page/mp-product-101`,
    );
    expect(normalizeMarketingShareUrl('http://localhost:5176/page/mp-product-101')).toBe(
      `${MARKETING_SHARE_BASE_URL}/page/mp-product-101`,
    );
  });

  it('does not rewrite unrelated local admin origins unless explicitly unsafe', () => {
    expect(normalizeMarketingShareUrl('http://localhost:5174/page/mp-product-101')).toBe(
      'http://localhost:5174/page/mp-product-101',
    );
  });
});
