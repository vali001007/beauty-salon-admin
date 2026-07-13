import { BadRequestException } from '@nestjs/common';
import { OrderRefundService } from './order-refund.service';

describe('OrderRefundService', () => {
  const service = new OrderRefundService();

  it('keeps an order partially refundable until successful refunds reach net amount', () => {
    expect(service.calculateNextOrderStatus(100, 40)).toBe('partially_refunded');
    expect(service.calculateNextOrderStatus(100, 100)).toBe('refunded');
  });

  it('builds item remaining quantity and amount from successful refund items', () => {
    const preview = service.buildRefundPreview({
      id: 10,
      orderNo: 'PO10',
      status: 'partially_refunded',
      netAmount: 160,
      orderItems: [
        { id: 101, itemType: 'product', itemId: 8, name: '精华', quantity: 2, netAmount: 160 },
      ],
      refundRecords: [
        { status: 'success', amount: 80, items: [{ orderItemId: 101, quantity: 1, refundAmount: 80 }] },
      ],
    } as any);

    expect(preview.refundedAmount).toBe(80);
    expect(preview.remainingRefundableAmount).toBe(80);
    expect(preview.items[0]).toEqual(
      expect.objectContaining({
        refundedQuantity: 1,
        remainingRefundableQuantity: 1,
        refundedAmount: 80,
        remainingRefundableAmount: 80,
      }),
    );
  });

  it('rejects a refund quantity above the item remaining quantity', () => {
    const preview = service.buildRefundPreview({
      id: 10,
      orderNo: 'PO10',
      status: 'completed',
      netAmount: 160,
      orderItems: [{ id: 101, itemType: 'product', itemId: 8, name: '精华', quantity: 2, netAmount: 160 }],
      refundRecords: [],
    } as any);

    expect(() =>
      service.validateRefundItems(preview, [{ orderItemId: 101, quantity: 3 }]),
    ).toThrow(BadRequestException);
  });

  it('rejects return and refund when inventory trace is ambiguous', () => {
    const preview = service.buildRefundPreview({
      id: 10,
      orderNo: 'PO10',
      status: 'completed',
      netAmount: 100,
      orderItems: [
        {
          id: 101,
          itemType: 'project',
          itemId: 2,
          name: '护理',
          quantity: 1,
          netAmount: 100,
          stockMovements: [],
        },
      ],
      refundRecords: [],
    } as any);

    expect(() =>
      service.validateRefundMode(preview, 'return_and_refund', [{ orderItemId: 101, quantity: 1 }]),
    ).toThrow('REFUND_INVENTORY_TRACE_AMBIGUOUS');
  });
});
