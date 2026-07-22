import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiClientMock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));

vi.mock('../client', () => ({ default: apiClientMock }));

describe('order refund real API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the item-level refund preview', async () => {
    apiClientMock.get.mockResolvedValue({ orderId: 1, remainingRefundableAmount: 80, items: [] });
    const { realGetProductOrderRefundPreview } = await import('./order');

    await realGetProductOrderRefundPreview(1);

    expect(apiClientMock.get).toHaveBeenCalledWith('/orders/product/1/refund-preview');
  });

  it('submits refund mode, idempotency key and refund items without flattening them', async () => {
    apiClientMock.post.mockResolvedValue({ order: { id: 1 }, remainingRefundableAmount: 50 });
    const { realRefundProductOrder } = await import('./order');
    const payload = {
      requestId: 'req-1',
      refundMode: 'return_and_refund' as const,
      reason: '商品退货',
      items: [{ orderItemId: 11, quantity: 1, refundAmount: 50 }],
    };

    await realRefundProductOrder(1, payload);

    expect(apiClientMock.post).toHaveBeenCalledWith('/orders/product/1/refund', payload);
  });
});
