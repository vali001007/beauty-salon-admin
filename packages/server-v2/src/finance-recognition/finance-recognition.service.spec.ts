import { FinanceRecognitionService } from './finance-recognition.service.js';

describe('FinanceRecognitionService', () => {
  const service = new FinanceRecognitionService({} as any);

  it('uses explicit recognition time before stock movement, payment and legacy creation time', () => {
    const recognizedAt = service.resolveOrderItemRecognizedAt({
      item: { recognizedAt: new Date('2026-07-03T08:00:00.000Z'), recognitionSource: 'service_completed' },
      order: { createdAt: new Date('2026-07-01T08:00:00.000Z'), paymentRecords: [{ paidAt: new Date('2026-07-02T08:00:00.000Z') }] },
      stockMovement: { occurredAt: new Date('2026-07-02T09:00:00.000Z') },
    });

    expect(recognizedAt).toEqual({ recognizedAt: new Date('2026-07-03T08:00:00.000Z'), recognitionSource: 'service_completed', quality: 'actual' });
  });

  it('uses sale out time for product revenue and payment time for service revenue when explicit recognition is absent', () => {
    const payment = { paidAt: new Date('2026-07-02T08:00:00.000Z') };
    expect(service.resolveOrderItemRecognizedAt({ item: { itemType: 'product' }, order: { paymentRecords: [payment], createdAt: new Date('2026-07-01') }, stockMovement: { occurredAt: new Date('2026-07-02T09:00:00.000Z') } })).toEqual({
      recognizedAt: new Date('2026-07-02T09:00:00.000Z'), recognitionSource: 'sale_out', quality: 'actual',
    });
    expect(service.resolveOrderItemRecognizedAt({ item: { itemType: 'project' }, order: { paymentRecords: [payment], createdAt: new Date('2026-07-01') } })).toEqual({
      recognizedAt: payment.paidAt, recognitionSource: 'payment_paid_at', quality: 'estimated',
    });
  });

  it('creates exact operating and prepaid refund facts from refund items', () => {
    const facts = service.buildRefundFacts({
      id: 91,
      orderId: 10,
      refundedAt: new Date('2026-07-05T08:00:00.000Z'),
      items: [
        { id: 1, orderItemId: 101, itemType: 'project', refundAmount: 120 },
        { id: 2, orderItemId: 102, itemType: 'recharge', refundAmount: 300 },
      ],
      order: { storeId: 3 },
    } as any);

    expect(facts).toEqual([
      expect.objectContaining({ factType: 'operating_revenue', amount: -120, orderItemId: 101, recognitionSource: 'refund_item' }),
      expect.objectContaining({ factType: 'prepaid_addition', amount: -300, orderItemId: 102, recognitionSource: 'refund_item' }),
    ]);
  });

  it('marks refunds without item details as legacy instead of inventing an exact allocation', () => {
    const facts = service.buildRefundFacts({ id: 92, orderId: 10, amount: 200, refundedAt: new Date('2026-07-05'), order: { storeId: 3 } } as any);
    expect(facts).toEqual([expect.objectContaining({ factType: 'external_cash_out', amount: 200, quality: 'legacy', recognitionSource: 'refund_record_without_items' })]);
  });
});
