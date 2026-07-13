import { BadRequestException, Injectable } from '@nestjs/common';
import type { CreateOrderRefundItemInput, OrderRefundMode, OrderRefundStatus, RefundInventoryTraceStatus } from './refund.types.js';

@Injectable()
export class OrderRefundService {
  private toNumber(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private isSuccessfulRefund(record: any) {
    return ['success', 'completed', 'refunded'].includes(String(record?.status));
  }

  calculateNextOrderStatus(netAmount: number, successfulRefundAmount: number): OrderRefundStatus {
    return this.round(netAmount - successfulRefundAmount) <= 0.01 ? 'refunded' : 'partially_refunded';
  }

  private traceStatus(item: any): RefundInventoryTraceStatus {
    const type = String(item?.itemType ?? '').toLowerCase();
    if (!['product', 'goods', 'project'].includes(type)) return 'not_required';
    const movements = Array.isArray(item?.stockMovements) ? item.stockMovements : [];
    if (movements.some((movement: any) => movement?.orderItemId === item.id)) return 'complete';
    return movements.length ? 'ambiguous' : 'missing';
  }

  buildRefundPreview(order: any) {
    const successfulRefunds = (order?.refundRecords ?? []).filter((record: any) => this.isSuccessfulRefund(record));
    const refundedAmount = this.round(successfulRefunds.reduce((sum: number, record: any) => sum + this.toNumber(record.amount), 0));
    const netAmount = this.round(this.toNumber(order?.netAmount ?? order?.totalAmount));

    const items = (order?.orderItems ?? []).map((item: any) => {
      const itemRefunds = successfulRefunds.flatMap((record: any) => record.items ?? []).filter((refundItem: any) => Number(refundItem.orderItemId) === Number(item.id));
      const quantity = this.toNumber(item.quantity);
      const itemNetAmount = this.round(this.toNumber(item.netAmount ?? item.subtotal));
      const refundedQuantity = this.round(itemRefunds.reduce((sum: number, refundItem: any) => sum + this.toNumber(refundItem.quantity), 0));
      const itemRefundedAmount = this.round(itemRefunds.reduce((sum: number, refundItem: any) => sum + this.toNumber(refundItem.refundAmount), 0));
      return {
        orderItemId: Number(item.id),
        itemType: String(item.itemType),
        itemId: item.itemId == null ? undefined : Number(item.itemId),
        name: String(item.name ?? ''),
        soldQuantity: quantity,
        refundedQuantity,
        remainingRefundableQuantity: this.round(Math.max(0, quantity - refundedQuantity)),
        netAmount: itemNetAmount,
        refundedAmount: itemRefundedAmount,
        remainingRefundableAmount: this.round(Math.max(0, itemNetAmount - itemRefundedAmount)),
        inventoryTraceStatus: this.traceStatus(item),
      };
    });

    const traceStatuses = items.map((item: any) => item.inventoryTraceStatus).filter((status: string) => status !== 'not_required');
    const inventoryTraceStatus = traceStatuses.includes('ambiguous')
      ? 'ambiguous'
      : traceStatuses.includes('missing')
        ? 'missing'
        : 'complete';

    return {
      orderId: Number(order.id),
      orderNo: String(order.orderNo ?? ''),
      checkoutGroupNo: order.checkoutGroupNo ?? undefined,
      status: String(order.status ?? ''),
      netAmount,
      refundedAmount,
      remainingRefundableAmount: this.round(Math.max(0, netAmount - refundedAmount)),
      inventoryTraceStatus,
      allowedModes: inventoryTraceStatus === 'complete' ? (['refund_only', 'return_and_refund'] as OrderRefundMode[]) : (['refund_only'] as OrderRefundMode[]),
      items,
    };
  }

  validateRefundItems(preview: any, requestedItems: CreateOrderRefundItemInput[]) {
    if (!Array.isArray(requestedItems) || !requestedItems.length) throw new BadRequestException('请选择退款明细');
    const seen = new Set<number>();
    return requestedItems.map((requested) => {
      const orderItemId = Number(requested.orderItemId);
      if (seen.has(orderItemId)) throw new BadRequestException('退款明细不能重复');
      seen.add(orderItemId);
      const item = preview.items.find((candidate: any) => candidate.orderItemId === orderItemId);
      if (!item) throw new BadRequestException('退款明细不属于当前订单');
      const quantity = this.round(this.toNumber(requested.quantity));
      if (quantity <= 0) throw new BadRequestException('退款数量必须大于 0');
      if (quantity > item.remainingRefundableQuantity + 0.0001) throw new BadRequestException('退款数量不能大于剩余可退数量');
      const suggestedAmount = item.soldQuantity > 0 ? this.round((item.netAmount / item.soldQuantity) * quantity) : 0;
      const refundAmount = requested.refundAmount == null ? suggestedAmount : this.round(this.toNumber(requested.refundAmount));
      if (refundAmount <= 0) throw new BadRequestException('退款金额必须大于 0');
      if (refundAmount > item.remainingRefundableAmount + 0.01) throw new BadRequestException('退款金额不能大于明细剩余可退金额');
      return { ...requested, orderItemId, quantity, refundAmount, previewItem: item };
    });
  }

  validateRefundMode(preview: any, mode: OrderRefundMode, requestedItems: CreateOrderRefundItemInput[]) {
    if (!['refund_only', 'return_and_refund'].includes(mode)) throw new BadRequestException('不支持的退款方式');
    if (mode === 'refund_only') return;
    for (const requested of requestedItems) {
      const item = preview.items.find((candidate: any) => candidate.orderItemId === Number(requested.orderItemId));
      if (!item) throw new BadRequestException('退款明细不属于当前订单');
      if (['ambiguous', 'missing'].includes(item.inventoryTraceStatus)) {
        throw new BadRequestException('REFUND_INVENTORY_TRACE_AMBIGUOUS');
      }
    }
  }
}
