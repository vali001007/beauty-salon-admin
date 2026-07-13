import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderRefundDialog } from './OrderRefundDialog';

const api = vi.hoisted(() => ({ getProductOrderRefundPreview: vi.fn(), refundProductOrder: vi.fn() }));
vi.mock('@/api/order', () => api);

describe('OrderRefundDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getProductOrderRefundPreview.mockResolvedValue({
      orderId: 1,
      orderNo: 'PO1',
      netAmount: 100,
      refundedAmount: 0,
      remainingRefundableAmount: 100,
      inventoryTraceStatus: 'complete',
      allowedModes: ['refund_only', 'return_and_refund'],
      items: [{ orderItemId: 11, itemType: 'product', itemId: 8, name: '精华', soldQuantity: 2, refundedQuantity: 0, remainingRefundableQuantity: 2, netAmount: 100, refundedAmount: 0, remainingRefundableAmount: 100, inventoryTraceStatus: 'complete' }],
    });
    api.refundProductOrder.mockResolvedValue({ id: 1, remainingRefundableAmount: 50 });
  });

  it('submits the selected refund mode and item quantity', async () => {
    render(<OrderRefundDialog orderId={1} open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);

    await screen.findByText('精华');
    fireEvent.click(screen.getByLabelText('退款退货'));
    fireEvent.click(screen.getByLabelText('选择精华'));
    fireEvent.change(screen.getByLabelText('精华退款数量'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '确认退款' }));

    await waitFor(() => expect(api.refundProductOrder).toHaveBeenCalled());
    expect(api.refundProductOrder).toHaveBeenCalledWith(1, expect.objectContaining({
      requestId: expect.any(String),
      refundMode: 'return_and_refund',
      items: [{ orderItemId: 11, quantity: 1, refundAmount: 50 }],
    }));
  });
});
