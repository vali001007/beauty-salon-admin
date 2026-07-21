import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { FinanceFactQuality, FinanceRecognitionFact } from './finance-recognition.types.js';

const OFFSET_MS = 8 * 60 * 60 * 1000;
const PREPAID_TYPES = new Set(['recharge', 'member_recharge', 'balance_recharge', 'card', 'open', 'card_sale']);
const OPERATING_TYPES = new Set(['project', 'service', 'product', 'goods']);

@Injectable()
export class FinanceRecognitionService {
  constructor(private readonly prisma: PrismaService) {}

  businessDate(value: Date) {
    const date = new Date(value.getTime() + OFFSET_MS);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  resolveOrderItemRecognizedAt(input: { item: any; order: any; stockMovement?: any }): {
    recognizedAt: Date;
    recognitionSource: string;
    quality: FinanceFactQuality;
  } {
    if (input.item?.recognizedAt) {
      return {
        recognizedAt: new Date(input.item.recognizedAt),
        recognitionSource: String(input.item.recognitionSource || 'order_item_recognized_at'),
        quality: 'actual',
      };
    }
    const type = String(input.item?.itemType ?? '').toLowerCase();
    if (['product', 'goods'].includes(type) && input.stockMovement?.occurredAt) {
      return { recognizedAt: new Date(input.stockMovement.occurredAt), recognitionSource: 'sale_out', quality: 'actual' };
    }
    const payments = Array.isArray(input.order?.paymentRecords) ? input.order.paymentRecords : [];
    const payment = payments
      .filter((item: any) => item?.paidAt || item?.createdAt)
      .sort((a: any, b: any) => new Date(a.paidAt ?? a.createdAt).getTime() - new Date(b.paidAt ?? b.createdAt).getTime())[0];
    if (payment) {
      return { recognizedAt: new Date(payment.paidAt ?? payment.createdAt), recognitionSource: 'payment_paid_at', quality: 'estimated' };
    }
    return { recognizedAt: new Date(input.order?.createdAt ?? input.item?.createdAt), recognitionSource: 'legacy_created_at', quality: 'legacy' };
  }

  buildRefundFacts(refund: any): FinanceRecognitionFact[] {
    const recognizedAt = new Date(refund.refundedAt ?? refund.createdAt);
    const storeId = Number(refund.order?.storeId ?? refund.storeId ?? 0);
    const base = {
      storeId,
      businessDate: this.businessDate(recognizedAt),
      recognizedAt,
      sourceType: 'refund_record',
      sourceId: Number(refund.id),
      orderId: Number(refund.orderId ?? refund.order?.id) || undefined,
    };
    const items = Array.isArray(refund.items) ? refund.items : [];
    if (!items.length) {
      return [{ ...base, factType: 'external_cash_out', amount: Number(refund.amount ?? 0), quality: 'legacy', recognitionSource: 'refund_record_without_items' }];
    }
    return items.map((item: any) => {
      const itemType = String(item.itemType ?? item.orderItem?.itemType ?? '').toLowerCase();
      const factType = PREPAID_TYPES.has(itemType) ? 'prepaid_addition' : OPERATING_TYPES.has(itemType) ? 'operating_revenue' : 'external_cash_out';
      return {
        ...base,
        factType,
        amount: factType === 'external_cash_out' ? Number(item.refundAmount ?? 0) : -Number(item.refundAmount ?? 0),
        orderItemId: Number(item.orderItemId) || undefined,
        quality: 'actual',
        recognitionSource: 'refund_item',
      } as FinanceRecognitionFact;
    });
  }

  buildRefundCostReversalFacts(refund: any): FinanceRecognitionFact[] {
    if (refund.refundMode !== 'return_and_refund') return [];
    const recognizedAt = new Date(refund.refundedAt ?? refund.createdAt);
    return (refund.items ?? []).flatMap((item: any) =>
      (item.stockMovements ?? [])
        .filter((movement: any) => ['sale_return_in', 'service_consume_reverse'].includes(String(movement.movementType)))
        .map((movement: any) => ({
          storeId: Number(refund.order?.storeId ?? movement.storeId ?? 0),
          businessDate: this.businessDate(new Date(movement.occurredAt ?? recognizedAt)),
          recognizedAt: new Date(movement.occurredAt ?? recognizedAt),
          factType: movement.movementType === 'sale_return_in' ? 'product_cost' : 'material_cost',
          sourceType: 'stock_movement',
          sourceId: Number(movement.id),
          orderId: Number(refund.orderId) || undefined,
          orderItemId: Number(item.orderItemId) || undefined,
          amount: -Math.abs(Number(movement.costAmount ?? movement.totalAmount ?? 0)),
          quality: movement.costAmount == null && movement.totalAmount == null ? 'missing' : 'actual',
          recognitionSource: movement.movementType,
        } as FinanceRecognitionFact)),
    );
  }
}
