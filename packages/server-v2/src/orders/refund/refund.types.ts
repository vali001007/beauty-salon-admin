export type OrderRefundMode = 'refund_only' | 'return_and_refund';
export type OrderRefundStatus = 'partially_refunded' | 'refunded';
export type RefundInventoryTraceStatus = 'complete' | 'ambiguous' | 'missing' | 'not_required';

export interface CreateOrderRefundItemInput {
  orderItemId: number;
  quantity: number;
  refundAmount?: number;
}

export interface CreateOrderRefundInput {
  requestId: string;
  refundMode: OrderRefundMode;
  reason?: string;
  items: CreateOrderRefundItemInput[];
  operatorId?: number;
  operatorType?: string;
}
