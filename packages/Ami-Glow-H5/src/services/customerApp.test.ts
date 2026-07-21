import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('./request', () => ({
  request: mocks.request,
  buildQuery: (params: Record<string, unknown>) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) query.set(key, String(value));
    });
    const value = query.toString();
    return value ? `?${value}` : '';
  },
}));

import { getNotifications, openNotification } from './customerApp';

describe('Ami Glow notification API', () => {
  beforeEach(() => mocks.request.mockReset());

  it('loads the authenticated customer notification page', async () => {
    mocks.request.mockResolvedValue({ items: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });

    await getNotifications({ page: 1, pageSize: 20 });

    expect(mocks.request).toHaveBeenCalledWith('/customer-app/me/notifications?page=1&pageSize=20');
  });

  it('marks one notification opened through the customer-scoped endpoint', async () => {
    mocks.request.mockResolvedValue({ id: 51, status: 'opened' });

    await openNotification(51);

    expect(mocks.request).toHaveBeenCalledWith('/customer-app/me/notifications/51/open', { method: 'POST' });
  });
});
