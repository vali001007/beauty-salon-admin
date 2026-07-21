import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../client', () => ({ default: apiClientMock }));

describe('customer feedback real API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.get.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    apiClientMock.post.mockResolvedValue({ id: 1 });
    apiClientMock.put.mockResolvedValue({ id: 1, status: 'resolved' });
  });

  it('maps list and analytics to the shared feedback fact endpoints', async () => {
    const api = await import('./customerFeedback');
    await api.realGetCustomerFeedback({ page: 1, pageSize: 20, feedbackType: 'complaint' });
    await api.realGetCustomerFeedbackAnalytics({ startDate: '2026-07-01T00:00:00.000Z' });

    expect(apiClientMock.get).toHaveBeenCalledWith('/customer-feedback', {
      params: { page: 1, pageSize: 20, feedbackType: 'complaint' },
    });
    expect(apiClientMock.get).toHaveBeenCalledWith('/customer-feedback/analytics', {
      params: { startDate: '2026-07-01T00:00:00.000Z' },
    });
  });

  it('maps create and resolution updates without double data unwrap', async () => {
    const api = await import('./customerFeedback');
    await api.realCreateCustomerFeedback({ feedbackType: 'complaint', content: '等待过久' });
    const result = await api.realUpdateCustomerFeedback(1, { status: 'resolved', resolutionNote: '已回访' });

    expect(apiClientMock.post).toHaveBeenCalledWith('/customer-feedback', {
      feedbackType: 'complaint',
      content: '等待过久',
    });
    expect(apiClientMock.put).toHaveBeenCalledWith('/customer-feedback/1', {
      status: 'resolved',
      resolutionNote: '已回访',
    });
    expect(result.status).toBe('resolved');
  });
});
