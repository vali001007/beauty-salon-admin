import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../client', () => ({ default: apiClientMock }));

describe('recommendation real API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.get.mockResolvedValue({ mode: 'legacy', items: [], total: 0 });
  });

  it('loads rollout mode and recommendation data through one workspace request', async () => {
    const { realGetMarketingRecommendationWorkspace } = await import('./recommendation');

    await realGetMarketingRecommendationWorkspace({ page: 1, pageSize: 50, refresh: false });

    expect(apiClientMock.get).toHaveBeenCalledTimes(1);
    expect(apiClientMock.get).toHaveBeenCalledWith('/marketing/recommendation-workspace', {
      params: { page: 1, pageSize: 50, refresh: false },
    });
  });
});
