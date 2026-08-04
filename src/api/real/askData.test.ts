import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('../client', () => ({ default: apiClientMock }));

describe('ask data real API contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses a long single-attempt request for the model and SQL workflow', async () => {
    const api = await import('./askData');
    const request = { question: '最近30天营销ROI最高的渠道是什么？', history: [] };

    await api.queryAskData(request);

    expect(apiClientMock.post).toHaveBeenCalledWith('/ask-data/free-sql', request, {
      timeout: 70_000,
      skipRetry: true,
    });
  });

  it('keeps the catalog request on the normal lightweight client policy', async () => {
    const api = await import('./askData');

    await api.getAskDataCatalog();

    expect(apiClientMock.get).toHaveBeenCalledWith('/ask-data/free-sql/catalog');
  });
});
