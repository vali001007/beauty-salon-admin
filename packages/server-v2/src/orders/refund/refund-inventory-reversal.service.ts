import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class RefundInventoryReversalService {
  private toNumber(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
  }

  private round(value: number, digits = 4) {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  private movementNo() {
    return `SMR${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  }

  async reverseForRefund(tx: any, refund: any) {
    if (refund.refundMode !== 'return_and_refund') return [];
    const created: any[] = [];

    for (const item of refund.items ?? []) {
      const type = String(item.itemType ?? '').toLowerCase();
      if (!['product', 'goods', 'project'].includes(type)) continue;
      const movementType = type === 'project' ? 'service_consume_reverse' : 'sale_return_in';
      const originalMovementType = type === 'project' ? 'service_consume' : 'sale_out';
      const existing = await tx.stockMovement.findFirst({
        where: { sourceType: 'refund_item', sourceId: item.id, movementType },
      });
      if (existing) continue;

      let originalMovements = await tx.stockMovement.findMany({
        where: {
          sourceId: refund.order.id,
          sourceType: type === 'project' ? 'project_order' : 'product_order',
          movementType: originalMovementType,
          ...(item.orderItemId ? { orderItemId: item.orderItemId } : {}),
          ...(type !== 'project' && item.itemId ? { productId: item.itemId } : {}),
        },
        orderBy: { id: 'asc' },
      });
      if (!originalMovements.length && item.orderItemId) {
        originalMovements = await tx.stockMovement.findMany({
          where: {
            sourceId: refund.order.id,
            sourceType: type === 'project' ? 'project_order' : 'product_order',
            movementType: originalMovementType,
            ...(type !== 'project' && item.itemId ? { productId: item.itemId } : {}),
          },
          orderBy: { id: 'asc' },
        });
      }
      if (!originalMovements.length) throw new BadRequestException('REFUND_INVENTORY_TRACE_AMBIGUOUS');

      const originalOrderItemQuantity = this.toNumber(item.originalOrderItemQuantity ?? item.orderItem?.quantity ?? item.quantity) || 1;
      const ratio = type === 'project' ? this.toNumber(item.quantity) / originalOrderItemQuantity : 1;
      let remaining = type === 'project' ? Number.POSITIVE_INFINITY : this.toNumber(item.quantity);

      for (const movement of originalMovements) {
        const originalQuantity = Math.abs(this.toNumber(movement.quantity));
        const quantity = type === 'project' ? this.round(originalQuantity * ratio) : this.round(Math.min(originalQuantity, remaining));
        if (quantity <= 0) continue;
        const product = await tx.product.findUnique({ where: { id: movement.productId }, select: { currentStock: true } });
        const beforeStock = this.toNumber(product?.currentStock);
        const afterStock = this.round(beforeStock + quantity);
        await tx.product.update({ where: { id: movement.productId }, data: { currentStock: afterStock } });
        if (movement.batchId && tx.stockBatch) {
          const batch = await tx.stockBatch.findUnique({ where: { id: movement.batchId }, select: { stock: true } });
          await tx.stockBatch.update({
            where: { id: movement.batchId },
            data: { stock: this.round(this.toNumber(batch?.stock) + quantity) },
          });
        }
        const unitCost = this.toNumber(movement.unitCost);
        const record = await tx.stockMovement.create({
          data: {
            storeId: refund.order.storeId,
            productId: movement.productId,
            batchId: movement.batchId,
            movementNo: this.movementNo(),
            movementType,
            quantity,
            beforeStock,
            afterStock,
            unit: movement.unit,
            unitCost: movement.unitCost,
            costAmount: this.round(unitCost * quantity, 2),
            costSource: movement.costSource,
            sourceType: 'refund_item',
            sourceId: item.id,
            sourceNo: refund.refundNo,
            orderItemId: item.orderItemId,
            refundItemId: item.id,
            remark: refund.reason ?? '订单退款退货',
            occurredAt: refund.refundedAt ?? new Date(),
          },
        });
        created.push(record);
        if (type !== 'project') remaining = this.round(remaining - quantity);
        if (type !== 'project' && remaining <= 0) break;
      }
      if (type !== 'project' && remaining > 0.0001) throw new BadRequestException('退货数量超过原出库数量');
    }
    return created;
  }
}
