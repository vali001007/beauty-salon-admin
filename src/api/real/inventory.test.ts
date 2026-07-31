import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../client', () => ({ default: apiClientMock }));

describe('inventory real API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.post.mockResolvedValue({
      id: 31,
      storeId: 6,
      orderNo: 'PUR20260730001',
      supplier: '供应商A',
      totalAmount: 160,
      status: '待审核',
      createdAt: '2026-07-30T09:00:00.000Z',
      updatedAt: '2026-07-30T10:00:01.000Z',
      items: { items: [] },
    });
  });

  it('uses the caller-owned idempotency key for purchase-order submission retries', async () => {
    const { realSubmitPurchaseOrderForApproval } = await import('./inventory');

    await realSubmitPurchaseOrderForApproval(31, '2026-07-30T10:00:00.000Z', 'purchase-submit-stable-31');

    expect(apiClientMock.post).toHaveBeenCalledWith(
      '/inventory/purchase-orders/31/submit-for-approval',
      { expectedPurchaseOrderUpdatedAt: '2026-07-30T10:00:00.000Z' },
      { headers: { 'Idempotency-Key': 'purchase-submit-stable-31' } },
    );
  });

  it('fails before the request when the caller does not provide an idempotency key', async () => {
    const { realSubmitPurchaseOrderForApproval } = await import('./inventory');

    await expect(realSubmitPurchaseOrderForApproval(31, '2026-07-30T10:00:00.000Z', '')).rejects.toThrow(
      '采购单送审缺少幂等键',
    );
    expect(apiClientMock.post).not.toHaveBeenCalled();
  });
});
