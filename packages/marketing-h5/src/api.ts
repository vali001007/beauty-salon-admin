import type { PublicMarketingPage } from './types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

export function getSlugFromLocation() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const lastPart = parts[parts.length - 1] || '';
  const routePrefixes = new Set(['activity', 'page', 'p']);
  if (!lastPart || (parts.length === 1 && routePrefixes.has(lastPart))) return '';
  return decodeURIComponent(lastPart);
}

export function getSessionId() {
  const key = 'ami_marketing_session_id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(key, next);
  return next;
}

export function getTrackingParams() {
  return parseTrackingParams(window.location.search, document.referrer || undefined);
}

export function parseTrackingParams(search: string, referrer?: string) {
  const params = new URLSearchParams(search);
  return {
    channel: params.get('channel') || params.get('utm_medium') || 'direct',
    staffId: params.get('staffId') ? Number(params.get('staffId')) : undefined,
    campaignId: params.get('campaignId') || params.get('utm_campaign') || undefined,
    source: params.get('utm_source') || undefined,
    medium: params.get('utm_medium') || undefined,
    referrer,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      ...init,
    });
  } catch {
    throw new Error('页面暂不可访问，请稍后再试');
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = typeof payload?.message === 'string' ? payload.message : '';
    if (response.status === 404 || message.includes('不存在') || message.includes('下线')) {
      throw new Error('页面不存在或已下线');
    }
    throw new Error('页面暂不可访问，请稍后再试');
  }
  return response.json();
}

export function getPublicMarketingPage(slug: string) {
  return request<PublicMarketingPage>(`/public/marketing/pages/${encodeURIComponent(slug)}`);
}

export function recordMarketingPageEvent(
  slug: string,
  eventType: 'view' | 'share' | 'click_cta' | 'lead_submit' | 'book' | 'coupon_claim',
  metadataJson?: Record<string, unknown>,
) {
  return request(`/public/marketing/pages/${encodeURIComponent(slug)}/events`, {
    method: 'POST',
    body: JSON.stringify({
      eventType,
      sessionId: getSessionId(),
      ...getTrackingParams(),
      metadataJson,
    }),
  }).catch(() => undefined);
}

export function submitMarketingLead(
  slug: string,
  data: {
    name?: string;
    phone: string;
    message?: string;
    intentType?: 'consult' | 'book';
  },
) {
  const path = data.intentType === 'book' ? 'bookings' : 'leads';
  return request(`/public/marketing/pages/${encodeURIComponent(slug)}/${path}`, {
    method: 'POST',
    body: JSON.stringify({
      ...data,
      sessionId: getSessionId(),
      ...getTrackingParams(),
    }),
  });
}
