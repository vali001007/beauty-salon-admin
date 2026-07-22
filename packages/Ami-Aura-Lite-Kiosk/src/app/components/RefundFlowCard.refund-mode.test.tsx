// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RefundFlowCard } from './RefundFlowCard';

describe('RefundFlowCard refund modes', () => {
  it('submits return mode and selected order items', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <RefundFlowCard
        data={{
          title: '订单退款', subtitle: '门店', source: 'test', generatedAt: '2026-07-12 10:00',
          orders: [{
            id: 1, orderNo: 'PO1', orderKind: 'product', kindLabel: '商品订单', customerName: '客户', itemSummary: '精华', paymentMethod: '微信', refundableAmount: 100, createdAt: '2026-07-12T10:00:00.000Z',
            allowedModes: ['refund_only', 'return_and_refund'],
            items: [{ orderItemId: 11, name: '精华', itemType: 'product', remainingRefundableQuantity: 2, remainingRefundableAmount: 100 }],
          }],
        } as any}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.focus(screen.getByPlaceholderText('搜索客户 / 手机号 / 收银号'));
    fireEvent.click(screen.getByText('客户'));
    fireEvent.click(screen.getByLabelText('退款退货'));
    fireEvent.click(screen.getByLabelText('选择精华'));
    fireEvent.click(screen.getByRole('button', { name: '确认退款' }));

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      refundMode: 'return_and_refund',
      items: [expect.objectContaining({ orderItemId: 11 })],
    }));
  });

  it('reuses the same request id when the confirmation is retried', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('network timeout'));
    render(
      <RefundFlowCard
        data={{
          title: '订单退款', subtitle: '门店', source: 'test', generatedAt: '2026-07-12 10:00',
          orders: [{
            id: 1, orderNo: 'PO1', orderKind: 'product', kindLabel: '商品订单', customerName: '客户', itemSummary: '精华', paymentMethod: '微信', refundableAmount: 100, createdAt: '2026-07-12T10:00:00.000Z',
            allowedModes: ['refund_only'],
            items: [{ orderItemId: 11, name: '精华', itemType: 'product', remainingRefundableQuantity: 1, remainingRefundableAmount: 100 }],
          }],
        } as any}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.focus(screen.getByPlaceholderText('搜索客户 / 手机号 / 收银号'));
    fireEvent.click(screen.getByText('客户'));
    fireEvent.click(screen.getByLabelText('选择精华'));
    fireEvent.click(screen.getByRole('button', { name: '确认退款' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((screen.getByRole('button', { name: '确认退款' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '确认退款' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));

    expect(onConfirm.mock.calls[1][0].requestId).toBe(onConfirm.mock.calls[0][0].requestId);
  });
});
