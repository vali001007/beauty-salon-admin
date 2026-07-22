import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('../client', () => ({
  default: apiClientMock,
}));

describe('ask data real API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.post.mockResolvedValue({ status: 'success', rows: [] });
    apiClientMock.get.mockResolvedValue({ tables: [] });
  });

  it('routes query requests to the clean-room ask-data endpoint', async () => {
    const { queryAskData } = await import('./askData');
    const payload = {
      question: '上个月收入按项目看',
      history: [{ role: 'assistant' as const, content: '上次查的是项目收入' }],
    };

    await queryAskData(payload);

    expect(apiClientMock.post).toHaveBeenCalledWith('/ask-data/query', payload);
  });

  it('loads the query catalog from ask-data endpoint', async () => {
    const { getAskDataCatalog } = await import('./askData');

    await getAskDataCatalog();

    expect(apiClientMock.get).toHaveBeenCalledWith('/ask-data/catalog');
  });
});
