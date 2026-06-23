import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../client', () => ({
  default: apiClientMock,
}));

describe('operation profit real API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.get.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    apiClientMock.post.mockResolvedValue({});
    apiClientMock.patch.mockResolvedValue({});
    apiClientMock.delete.mockResolvedValue({ success: true });
  });

  it('routes read queries to operation profit endpoints with params', async () => {
    const {
      realGetBeauticianPerformance,
      realGetOperationCosts,
      realGetOperationProfitOverview,
      realGetPrepaidLiabilities,
      realGetProductMargins,
      realGetProjectMargins,
    } = await import('./operationProfit');

    await realGetOperationProfitOverview({ storeId: 6, from: '2026-06-01', to: '2026-06-30', basis: 'operating' });
    await realGetProductMargins({ storeId: 6, page: 1, pageSize: 20, from: '2026-06-01', to: '2026-06-30', sortBy: 'grossProfit' });
    await realGetProjectMargins({ storeId: 6, page: 1, pageSize: 20, from: '2026-06-01', to: '2026-06-30', status: 'cost_missing' });
    await realGetPrepaidLiabilities({ storeId: 6, page: 1, pageSize: 20, riskOnly: true });
    await realGetBeauticianPerformance({ storeId: 6, from: '2026-06-01', to: '2026-06-30', beauticianId: 12 });
    await realGetOperationCosts({ storeId: 6, page: 1, pageSize: 50, periodMonth: '2026-06', category: 'rent' });

    expect(apiClientMock.get).toHaveBeenNthCalledWith(1, '/operation-profit/overview', {
      params: { storeId: 6, from: '2026-06-01', to: '2026-06-30', basis: 'operating' },
    });
    expect(apiClientMock.get).toHaveBeenNthCalledWith(2, '/operation-profit/product-margins', {
      params: { storeId: 6, page: 1, pageSize: 20, from: '2026-06-01', to: '2026-06-30', sortBy: 'grossProfit' },
    });
    expect(apiClientMock.get).toHaveBeenNthCalledWith(3, '/operation-profit/project-margins', {
      params: { storeId: 6, page: 1, pageSize: 20, from: '2026-06-01', to: '2026-06-30', status: 'cost_missing' },
    });
    expect(apiClientMock.get).toHaveBeenNthCalledWith(4, '/operation-profit/prepaid-liabilities', {
      params: { storeId: 6, page: 1, pageSize: 20, riskOnly: true },
    });
    expect(apiClientMock.get).toHaveBeenNthCalledWith(5, '/operation-profit/beautician-performance', {
      params: { storeId: 6, from: '2026-06-01', to: '2026-06-30', beauticianId: 12 },
    });
    expect(apiClientMock.get).toHaveBeenNthCalledWith(6, '/operation-costs', {
      params: { storeId: 6, page: 1, pageSize: 50, periodMonth: '2026-06', category: 'rent' },
    });
  });

  it('normalizes legacy paginated data aliases from list endpoints', async () => {
    const { realGetProductMargins } = await import('./operationProfit');
    const row = { productId: 10, productName: '面膜', grossProfit: 88 };
    apiClientMock.get.mockResolvedValueOnce({ data: [row], total: '1', page: '2', pageSize: '10' });

    const page = await realGetProductMargins({ page: 2, pageSize: 10, from: '2026-06-01', to: '2026-06-30' });

    expect(page.items).toEqual([row]);
    expect(page.data).toBe(page.items);
    expect(page.total).toBe(1);
    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(10);
  });

  it('routes operation cost writes and copy actions to operation cost endpoints', async () => {
    const {
      realCopyOperationCostsFromPreviousMonth,
      realCreateOperationCost,
      realDeleteOperationCost,
      realUpdateOperationCost,
    } = await import('./operationProfit');
    const payload = {
      storeId: 6,
      periodMonth: '2026-06',
      costDate: '2026-06-01',
      category: 'rent' as const,
      amount: 1200,
      allocationType: 'fixed',
      remark: '6月租金',
    };

    await realCreateOperationCost(payload);
    await realUpdateOperationCost(3, { amount: 1300 });
    await realDeleteOperationCost(3);
    apiClientMock.post.mockResolvedValueOnce({ data: [{ id: 8, amount: 800 }], total: 1, page: 1, pageSize: 50 });
    const copied = await realCopyOperationCostsFromPreviousMonth({ storeId: 6, fromPeriodMonth: '2026-05', toPeriodMonth: '2026-06' });

    expect(apiClientMock.post).toHaveBeenNthCalledWith(1, '/operation-costs', payload);
    expect(apiClientMock.patch).toHaveBeenCalledWith('/operation-costs/3', { amount: 1300 });
    expect(apiClientMock.delete).toHaveBeenCalledWith('/operation-costs/3');
    expect(apiClientMock.post).toHaveBeenNthCalledWith(2, '/operation-costs/copy-from-previous-month', {
      storeId: 6,
      fromPeriodMonth: '2026-05',
      toPeriodMonth: '2026-06',
    });
    expect(copied.items).toEqual([{ id: 8, amount: 800 }]);
  });
});
