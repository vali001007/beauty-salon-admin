import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CommissionService } from '../commission/commission.service.js';
import { DiscountAllocationService, type DiscountAllocationInput } from './discount-allocation.service.js';
import { deductStockItems } from '../common/inventory-stock-deduction.js';

@Injectable()
export class OrdersService {
  private readonly MARKETING_PAGE_ATTRIBUTION_WINDOW_DAYS = 30;
  private readonly orderItemInclude = {
    beautician: { select: { id: true, name: true } },
  };

  constructor(
    private prisma: PrismaService,
    private commissionService: CommissionService,
    private discountAllocationService: DiscountAllocationService = new DiscountAllocationService(),
  ) {}

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  private toNonNegativeStock(value: unknown): number {
    const stock = this.toNumber(value);
    return Number.isFinite(stock) ? Math.max(0, stock) : 0;
  }

  private buildInventoryShortageRemark(baseRemark: string | undefined, requestedQty: number, appliedQty: number) {
    if (appliedQty >= requestedQty) return baseRemark;
    const shortageRemark = `库存不足：本次申请 ${requestedQty}，实际扣减 ${appliedQty}，不足 ${requestedQty - appliedQty}`;
    return [baseRemark, shortageRemark].filter(Boolean).join('；');
  }

  private round(value: number, precision = 2): number {
    const factor = 10 ** precision;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  }

  private resolveCardValidDays(card: any) {
    const validDays = this.toNumber(card?.validDays);
    return Number.isFinite(validDays) && validDays > 0 ? validDays : 365;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  private createPaymentNo() {
    return `PAY${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private createRefundNo() {
    return `REF${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private createStockMovementNo(prefix = 'SM') {
    return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private async assertStoreUserAllowed(storeId: number, userId: number) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        status: 'active',
        OR: [
          { stores: { some: { storeId } } },
          { roles: { some: { role: { key: { in: ['super_admin', 'store_manager'] } } } } },
        ],
      },
      include: { roles: { include: { role: true } }, stores: true },
    });
    if (!user) {
      throw new BadRequestException('销售人员不属于当前门店或已停用');
    }
    return user;
  }

  private buildCardPricingSnapshot(params: {
    card: any;
    paidAmount: number;
    totalTimes: number;
    giftTimes?: number;
    discountAmount?: number;
  }) {
    const totalTimes = Math.max(0, this.toNumber(params.totalTimes));
    const paidAmount = Math.max(0, this.toNumber(params.paidAmount));
    return {
      cardId: params.card?.id,
      cardName: params.card?.name,
      cardPrice: this.toNumber(params.card?.price),
      paidAmount,
      discountAmount: Math.max(0, this.toNumber(params.discountAmount)),
      totalTimes,
      giftTimes: Math.max(0, this.toNumber(params.giftTimes)),
      recognizedUnitValue: totalTimes > 0 ? this.round(paidAmount / totalTimes) : 0,
      projects: Array.isArray(params.card?.projects) ? params.card.projects : [],
    };
  }

  private isPaidLikeStatus(status?: string) {
    return ['completed', 'paid'].includes(String(status));
  }

  private normalizeOrderStatus(status?: string) {
    const map: Record<string, string> = {
      待付款: 'pending',
      已付款: 'paid',
      已完成: 'completed',
      已取消: 'cancelled',
      已退款: 'refunded',
      pending_payment: 'pending',
      pending: 'pending',
      unpaid: 'pending',
      paid: 'paid',
      completed: 'completed',
      cancelled: 'cancelled',
      canceled: 'cancelled',
      refunded: 'refunded',
    };
    return map[status || ''] || status || 'completed';
  }

  private normalizePaymentMethod(method?: string) {
      const map: Record<string, string> = {
        现金: 'cash',
        微信: 'wechat',
        支付宝: 'alipay',
        银行卡: 'card',
        会员卡划扣: 'member_balance',
        会员余额: 'member_balance',
        储值余额: 'member_balance',
        次卡抵扣: 'customer_card',
        cash: 'cash',
        wechat: 'wechat',
        alipay: 'alipay',
        card: 'card',
        bank_card: 'card',
        member_balance: 'member_balance',
        customer_card: 'customer_card',
      };
    return map[method || ''] || method || 'cash';
  }

  private normalizePaymentInputs(payments: any[] | undefined, paidAmount: number, fallbackMethod: string) {
    const amount = this.round(Math.max(0, this.toNumber(paidAmount)));
    const normalized = Array.isArray(payments)
      ? payments
          .map((payment) => ({
            method: this.normalizePaymentMethod(payment?.paymentMethod ?? payment?.method),
            amount: this.round(Math.max(0, this.toNumber(payment?.amount))),
            transactionNo: payment?.transactionNo,
          }))
          .filter((payment) => payment.amount > 0)
      : [];

    if (!normalized.length) return [{ method: fallbackMethod, amount, transactionNo: undefined }];

    const total = this.round(normalized.reduce((sum, payment) => sum + payment.amount, 0));
    const diff = this.round(amount - total);
    if (Math.abs(diff) > 0.01) throw new BadRequestException('组合支付金额必须等于订单实收金额');
    if (Math.abs(diff) > 0 && normalized.length) normalized[normalized.length - 1].amount = this.round(normalized[normalized.length - 1].amount + diff);
    return normalized;
  }

  private normalizeOrderItems(items: any[] = []) {
    return items.map((item) => {
      const quantity = this.toNumber(item.quantity ?? item.qty ?? 1) || 1;
      const unitPrice = this.toNumber(item.unitPrice ?? item.price ?? item.amount);
      const discount = this.toNumber(item.totalDiscountAmount ?? item.discount);
      const subtotal = this.toNumber(item.subtotal ?? quantity * unitPrice - discount);
      const itemType = String(item.itemType ?? item.type ?? 'product');
      const itemId = item.itemId ?? item.productId ?? item.projectId ?? item.cardId;
      return {
        itemType,
        itemId: itemId === undefined || itemId === null ? undefined : Number(itemId),
        name: String(item.name ?? item.productName ?? item.projectName ?? `${itemType}#${itemId ?? ''}`),
        quantity,
        unitPrice,
        listAmount: this.toNumber(item.listAmount) || quantity * unitPrice,
        subtotal,
        discount,
        itemDiscountAmount: this.toNumber(item.itemDiscountAmount),
        orderAllocatedDiscountAmount: this.toNumber(item.orderAllocatedDiscountAmount),
        totalDiscountAmount: this.toNumber(item.totalDiscountAmount ?? discount),
        netAmount: this.toNumber(item.netAmount ?? subtotal),
        discountSource: item.discountSource,
        allocationMethod: item.allocationMethod,
        discountPayload: item.discountPayload,
        isGift: Boolean(item.isGift),
        eligibleForOrderDiscount: item.eligibleForOrderDiscount,
        beauticianId: this.toNumber(item.beauticianId) || undefined,
        payload: item,
      };
    });
  }

  private buildDiscountAllocationInput(data: any, items: any[]): DiscountAllocationInput {
    return {
      items,
      discountMode: data.discountMode,
      discountAmount: data.discountAmount,
      discountRate: data.discountRate,
      packagePrice: data.packagePrice,
      allocationMethod: data.allocationMethod,
      discountSource: data.discountSource,
      promotionId: data.promotionId,
      couponId: data.couponId,
      packageId: data.packageId,
      authorizedBy: data.authorizedBy,
      reason: data.discountReason ?? data.reason,
    };
  }

  private buildPreAllocatedDiscountResult(data: any, items: any[]) {
    const listAmount = this.round(items.reduce((sum, item) => sum + this.toNumber(item.listAmount), 0));
    const itemDiscountAmount = this.round(items.reduce((sum, item) => sum + this.toNumber(item.itemDiscountAmount), 0));
    const orderDiscountAmount = this.round(items.reduce((sum, item) => sum + this.toNumber(item.orderAllocatedDiscountAmount), 0));
    const totalDiscountAmount = this.round(items.reduce((sum, item) => sum + this.toNumber(item.totalDiscountAmount), 0));
    const netAmount = this.round(items.reduce((sum, item) => sum + this.toNumber(item.netAmount ?? item.subtotal), 0));
    return {
      order: {
        listAmount,
        itemDiscountAmount,
        orderDiscountAmount,
        totalDiscountAmount,
        netAmount,
        discountSource: data.discountSource ?? (orderDiscountAmount > 0 ? 'order' : 'none'),
        allocationMethod: data.allocationMethod ?? (orderDiscountAmount > 0 ? 'manual' : 'none'),
        promotionId: data.promotionId,
        couponId: data.couponId,
        packageId: data.packageId,
        discountPayload: {
          discountMode: data.discountMode ?? (orderDiscountAmount > 0 ? 'manual' : 'none'),
          discountAmount: orderDiscountAmount,
          discountRate: this.toNumber(data.discountRate),
          packagePrice: this.toNumber(data.packagePrice),
          authorizedBy: data.authorizedBy,
          reason: data.discountReason ?? data.reason,
          preAllocated: true,
        },
      },
      items,
    };
  }

  private isProductOrderItemType(itemType?: string) {
    return ['product', 'goods'].includes(String(itemType ?? '').toLowerCase());
  }

  private getPayloadNumber(payload: unknown, keys: string[]) {
    if (!payload || typeof payload !== 'object') return undefined;
    const source = payload as Record<string, unknown>;
    for (const key of keys) {
      const value = source[key];
      if (value === null || value === undefined || value === '') continue;
      const normalized = Number(value);
      if (Number.isFinite(normalized) && normalized > 0) return normalized;
    }
    return undefined;
  }

  private getItemNetAmount(item: any) {
    return this.toNumber(item?.netAmount ?? item?.subtotal);
  }

  private getItemListAmount(item: any) {
    return this.toNumber(item?.listAmount ?? item?.subtotal);
  }

  private getOrderRefundAmount(order: any) {
    return (order?.refundRecords ?? [])
      .filter((refund: any) => ['completed', 'success', 'paid', 'refunded'].includes(String(refund.status)))
      .reduce((sum: number, refund: any) => sum + this.toNumber(refund.amount), 0);
  }

  private getRefundShare(item: any, order: any) {
    const orderTotal = Math.max(this.toNumber(order?.netAmount ?? order?.totalAmount), 0);
    if (orderTotal <= 0) return 0;
    const refundAmount = this.getOrderRefundAmount(order);
    if (refundAmount <= 0) return 0;
    const itemAmount = this.getItemNetAmount(item);
    return Math.min(itemAmount, refundAmount * (itemAmount / orderTotal));
  }

  private resolveProductItemCost(item: any, productCostById: Map<number, number>, stockMovementProductIds: Set<number>) {
    const quantity = this.toNumber(item.quantity || 1) || 1;
    const snapshotUnitCost = this.getPayloadNumber(item.payload, ['costPrice', 'unitCost', 'productCostPrice']);
    const snapshotCostAmount = this.getPayloadNumber(item.payload, ['costAmount', 'productCostAmount']);
    if (snapshotCostAmount !== undefined) {
      return {
        unitCost: quantity > 0 ? snapshotCostAmount / quantity : snapshotCostAmount,
        costAmount: snapshotCostAmount,
        source: 'order_snapshot',
      };
    }
    if (snapshotUnitCost !== undefined) {
      return {
        unitCost: snapshotUnitCost,
        costAmount: snapshotUnitCost * quantity,
        source: 'order_snapshot',
      };
    }

    const productId = Number(item.itemId);
    const masterUnitCost = this.toNumber(productCostById.get(productId));
    if (masterUnitCost > 0) {
      return {
        unitCost: masterUnitCost,
        costAmount: masterUnitCost * quantity,
        source: stockMovementProductIds.has(productId) ? 'stock_movement' : 'product_master',
      };
    }

    return { unitCost: 0, costAmount: 0, source: 'missing' };
  }

  private async attachProductCostSnapshots(
    tx: any,
    storeId: number | undefined,
    items: any[],
  ) {
    const productIds = [
      ...new Set(
        items
          .filter((item) => this.isProductOrderItemType(item.itemType) && item.itemId)
          .map((item) => Number(item.itemId))
          .filter(Boolean),
      ),
    ];
    if (!productIds.length) return items;

    const products = await tx.product.findMany({
      where: {
        id: { in: productIds },
        ...(storeId ? { storeId } : {}),
        deletedAt: null,
      },
      select: { id: true, costPrice: true, specQuantity: true, specUnit: true, packageUnit: true, unit: true },
    });
    const productById = new Map<number, any>(products.map((product: any) => [Number(product.id), product]));
    const capturedAt = new Date().toISOString();

    return items.map((item) => {
      if (!this.isProductOrderItemType(item.itemType) || !item.itemId) return item;
      const product = productById.get(Number(item.itemId));
      const costPrice = this.toNumber(product?.costPrice);
      const quantity = this.toNumber(item.quantity ?? 1) || 1;
      const packageUnit = String(product?.packageUnit ?? product?.unit ?? '').trim();
      const specUnit = String(product?.specUnit ?? '').trim();
      const unitSnapshot = Object.fromEntries(
        Object.entries({
          unit: packageUnit || specUnit || undefined,
          packageUnit: packageUnit || undefined,
          specUnit: specUnit || undefined,
          specQuantity: this.toNumber(product?.specQuantity) || undefined,
          salesUnitSource: packageUnit ? 'product.packageUnit' : specUnit ? 'product.specUnit' : undefined,
        }).filter(([, value]) => value !== undefined && value !== ''),
      );
      return {
        ...item,
        payload: {
          ...(item.payload && typeof item.payload === 'object' ? item.payload : {}),
          ...unitSnapshot,
          costPrice,
          productCostPrice: costPrice,
          costAmount: costPrice * quantity,
          productCostAmount: costPrice * quantity,
          costSource: 'product_master',
          costCapturedAt: capturedAt,
        },
      };
    });
  }

  private async consumeProductItemsForOrder(
    tx: any,
    order: { id: number; orderNo?: string | null; storeId?: number | null },
    items: Array<{ itemType?: string; itemId?: number | null; productId?: number | null; quantity?: unknown; payload?: any }>,
    remark?: string,
  ) {
    const storeId = this.toNumber(order.storeId);
    if (!storeId) return;
    const productItems = items.filter((item) => {
      const type = String(item.itemType ?? 'product').toLowerCase();
      return type === 'product' && (item.itemId ?? item.productId);
    });
    if (!productItems.length) return;

    const existed = await tx.stockMovement.findFirst({
      where: { sourceType: 'product_order', sourceId: order.id, movementType: 'sale_out' },
      select: { id: true },
    });
    if (existed) return;

    await deductStockItems(tx, {
      storeId,
      movementType: 'sale_out',
      source: {
        type: 'product_order',
        id: order.id,
        no: order.orderNo,
        remark: remark ?? '商品订单自动扣库存',
      },
      items: productItems.map((item) => ({
        productId: Number(item.itemId ?? item.productId),
        quantity: this.toNumber(item.quantity ?? 1) || 1,
        unit: item.payload?.packageUnit ?? item.payload?.unit,
        remark: remark ?? '商品订单自动扣库存',
      })),
    });
  }

  private async consumeProjectBomForOrder(
    tx: any,
    order: { id: number; orderNo?: string | null; storeId?: number | null },
    items: Array<{ itemType?: string; itemId?: number | null; quantity?: unknown; name?: string }>,
    remark?: string,
  ) {
    const storeId = this.toNumber(order.storeId);
    if (!storeId) return;
    const projectItems = items.filter((item) => String(item.itemType).toLowerCase() === 'project' && item.itemId);
    if (!projectItems.length) return;

    const existed = await tx.stockMovement.findFirst({
      where: { sourceType: 'project_order', sourceId: order.id, movementType: 'service_consume' },
      select: { id: true },
    });
    if (existed) return;

    const projectIds = [...new Set(projectItems.map((item) => Number(item.itemId)).filter(Boolean))];
    const bomItems = await tx.projectBomItem.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, productId: true, standardQty: true, unit: true },
    });
    if (!bomItems.length) return;

    const bomByProject = new Map<number, typeof bomItems>();
    for (const bomItem of bomItems) {
      const list = bomByProject.get(bomItem.projectId) ?? [];
      list.push(bomItem);
      bomByProject.set(bomItem.projectId, list);
    }

    const deductionItems = [];
    for (const item of projectItems) {
      const multiplier = this.toNumber(item.quantity ?? 1) || 1;
      for (const bomItem of bomByProject.get(Number(item.itemId)) ?? []) {
        deductionItems.push({
          productId: bomItem.productId,
          quantity: this.toNumber(bomItem.standardQty) * multiplier,
          remark: remark ?? (item.name ? `项目订单自动扣耗材：${item.name}` : '项目订单自动扣耗材'),
        });
      }
    }
    await deductStockItems(tx, {
      storeId,
      movementType: 'service_consume',
      source: {
        type: 'project_order',
        id: order.id,
        no: order.orderNo,
        remark: remark ?? '项目订单自动扣耗材',
      },
      items: deductionItems,
    });
  }

  private toProductOrderItem(item: any, index: number) {
    const quantity = this.toNumber(item.quantity ?? item.qty ?? 1) || 1;
    const unitPrice = this.toNumber(item.unitPrice ?? item.price ?? item.amount);
    const subtotal = this.toNumber(item.subtotal ?? quantity * unitPrice);
    const listAmount = this.toNumber(item.listAmount) || this.round(quantity * unitPrice);
    const itemDiscountAmount = this.toNumber(item.itemDiscountAmount);
    const orderAllocatedDiscountAmount = this.toNumber(item.orderAllocatedDiscountAmount);
    const totalDiscountAmount = this.toNumber(item.totalDiscountAmount ?? item.discount);
    const netAmount = this.toNumber(item.netAmount ?? subtotal);
    const beautician = item.beautician ?? item.payload?.beautician;
    const beauticianId = this.toNumber(item.beauticianId ?? item.payload?.beauticianId);
    return {
      id: item.id ?? index + 1,
      itemId: item.itemId ?? item.productId ?? item.projectId ?? item.cardId,
      itemType: item.itemType ?? item.type ?? 'product',
      productName: item.productName ?? item.name ?? item.projectName ?? item.cardName ?? '未命名商品',
      sku: item.sku ?? '',
      quantity,
      unitPrice,
      subtotal,
      listAmount,
      discount: totalDiscountAmount,
      itemDiscountAmount,
      orderAllocatedDiscountAmount,
      totalDiscountAmount,
      netAmount,
      discountSource: item.discountSource,
      allocationMethod: item.allocationMethod,
      discountPayload: item.discountPayload,
      isGift: Boolean(item.isGift),
      eligibleForOrderDiscount: item.eligibleForOrderDiscount !== false,
      beauticianId: beauticianId || undefined,
      beauticianName: item.beauticianName ?? item.payload?.beauticianName ?? beautician?.name,
      payload: item.payload ?? item,
    };
  }

  private getOrderItemScopeSummary(items: any[]) {
    const listAmount = this.round(items.reduce((sum, item) => sum + this.toNumber(item.listAmount ?? item.quantity * item.unitPrice), 0));
    const itemDiscountAmount = this.round(items.reduce((sum, item) => sum + this.toNumber(item.itemDiscountAmount), 0));
    const orderDiscountAmount = this.round(items.reduce((sum, item) => sum + this.toNumber(item.orderAllocatedDiscountAmount), 0));
    const totalDiscountAmount = this.round(items.reduce((sum, item) => sum + this.toNumber(item.totalDiscountAmount ?? item.discount), 0));
    const netAmount = this.round(items.reduce((sum, item) => sum + this.toNumber(item.netAmount ?? item.subtotal), 0));
    return {
      listAmount,
      itemDiscountAmount,
      orderDiscountAmount,
      totalDiscountAmount,
      netAmount,
      totalAmount: netAmount,
    };
  }

  private toCents(value: unknown) {
    return Math.round(this.toNumber(value) * 100);
  }

  private fromCents(value: number) {
    return this.round(value / 100);
  }

  private allocateMemberBalanceDeduction(amount: unknown, cashBalanceBefore: unknown, giftBalanceBefore: unknown) {
    const amountCents = this.toCents(amount);
    const cashCents = Math.max(0, this.toCents(cashBalanceBefore));
    const giftCents = Math.max(0, this.toCents(giftBalanceBefore));
    const totalCents = cashCents + giftCents;
    if (amountCents <= 0) throw new BadRequestException('会员卡划扣金额必须大于 0');
    if (amountCents > totalCents) throw new BadRequestException('会员卡余额不足');

    let cashDeductCents = 0;
    let giftDeductCents = 0;
    if (cashCents <= 0) {
      giftDeductCents = amountCents;
    } else if (giftCents <= 0) {
      cashDeductCents = amountCents;
    } else {
      cashDeductCents = Math.round((amountCents * cashCents) / totalCents);
      giftDeductCents = amountCents - cashDeductCents;
      if (cashDeductCents > cashCents) {
        const overflow = cashDeductCents - cashCents;
        cashDeductCents = cashCents;
        giftDeductCents += overflow;
      }
      if (giftDeductCents > giftCents) {
        const overflow = giftDeductCents - giftCents;
        giftDeductCents = giftCents;
        cashDeductCents += overflow;
      }
    }

    return {
      cashDeduct: this.fromCents(cashDeductCents),
      giftDeduct: this.fromCents(giftDeductCents),
      cashBalanceAfter: this.fromCents(cashCents - cashDeductCents),
      giftBalanceAfter: this.fromCents(giftCents - giftDeductCents),
    };
  }

  private serializeMemberBalanceDeduction(transaction: any) {
    if (!transaction) return undefined;
    const cashAmount = this.toNumber(transaction.amount);
    const giftAmount = this.toNumber(transaction.giftAmount);
    return {
      transactionId: transaction.id,
      transactionNo: transaction.transactionNo,
      totalAmount: this.round(cashAmount + giftAmount),
      cashAmount,
      giftAmount,
      cashBalanceBefore: this.toNumber(transaction.cashBalanceBefore),
      cashBalanceAfter: this.toNumber(transaction.cashBalanceAfter),
      giftBalanceBefore: this.toNumber(transaction.giftBalanceBefore),
      giftBalanceAfter: this.toNumber(transaction.giftBalanceAfter),
    };
  }

  private serializeProductOrder(order: any, scopeItemType?: string) {
    const rawItems = Array.isArray(order.orderItems) && order.orderItems.length
      ? order.orderItems
      : Array.isArray(order.items)
        ? order.items
        : [];
    const payment = Array.isArray(order.paymentRecords) ? order.paymentRecords[0] : undefined;
    const memberBalanceDeduction = this.serializeMemberBalanceDeduction(
      Array.isArray(order.balanceTransactions)
        ? order.balanceTransactions.find((item: any) => item.type === 'deduct' && item.paymentMethod === 'member_balance')
        : undefined,
    );
    const items = rawItems
      .map((item: any, index: number) => this.toProductOrderItem(item, index))
      .filter((item: any) => !scopeItemType || String(item.itemType).toLowerCase() === scopeItemType);
    const scopedSummary = scopeItemType ? this.getOrderItemScopeSummary(items) : undefined;
    return {
      ...order,
      customerId: order.customerId ?? order.customer?.id,
      customerName: order.customerName ?? order.customer?.name ?? '散客',
      customerPhone: order.customer?.phone ?? '',
      storeId: order.storeId ?? order.store?.id,
      storeName: order.store?.name ?? '',
      checkoutGroupNo: order.checkoutGroupNo ?? order.orderNo,
      orderKind: order.orderKind,
      items,
      totalAmount: scopedSummary?.totalAmount ?? this.toNumber(order.totalAmount),
      listAmount: scopedSummary?.listAmount ?? this.toNumber(order.listAmount || order.totalAmount),
      itemDiscountAmount: scopedSummary?.itemDiscountAmount ?? this.toNumber(order.itemDiscountAmount),
      orderDiscountAmount: scopedSummary?.orderDiscountAmount ?? this.toNumber(order.orderDiscountAmount),
      totalDiscountAmount: scopedSummary?.totalDiscountAmount ?? this.toNumber(order.totalDiscountAmount),
      netAmount: scopedSummary?.netAmount ?? this.toNumber(order.netAmount || order.totalAmount),
      discountSource: order.discountSource,
      allocationMethod: order.allocationMethod,
      promotionId: order.promotionId,
      couponId: order.couponId,
      packageId: order.packageId,
      discountPayload: order.discountPayload,
      paymentMethod: order.payMethod ?? payment?.method ?? 'cash',
      payMethod: order.payMethod ?? payment?.method,
      memberBalanceDeduction,
      createdAt: order.createdAt,
      completedAt: payment?.paidAt ?? undefined,
    };
  }

  private async refreshDailySettlementForOrder(order: any, source: string) {
    const storeId = this.toNumber(order?.storeId);
    if (!storeId || !['completed', 'paid', 'refunded'].includes(String(order?.status))) return;
    if (typeof this.commissionService?.generateDailySettlement !== 'function') return;
    try {
      await this.commissionService.generateDailySettlement(storeId, order.createdAt ?? new Date());
    } catch (error) {
      console.warn(`Daily settlement refresh failed after ${source}`, error);
    }
  }

  private async calculateOrderCommissionIfNeeded(tx: any, order: any, data: any) {
    const storeId = this.toNumber(order.storeId ?? data.storeId);
    if (!storeId || !['completed', 'paid'].includes(String(order.status))) return;

    try {
      if (typeof tx.orderItem?.findMany !== 'function') return;
      const orderItems = await tx.orderItem.findMany({ where: { orderId: order.id } });
      const records: any[] = [];
      const salesUserId = this.toNumber(data.operatorId) || undefined;
      const cardSaleItems = salesUserId ? orderItems.filter((item: any) => item.itemType === 'card') : [];
      if (salesUserId && cardSaleItems.length) {
        const itemRecords = await this.commissionService.calculateOrderCommissions(
          {
            storeId,
            orderId: order.id,
            staffUserId: salesUserId,
            items: cardSaleItems.map((item: any) => ({
              itemType: item.itemType,
              itemId: item.itemId,
              categoryId: undefined,
              subtotal: this.toNumber(item.netAmount ?? item.subtotal),
              orderItemId: item.id,
            })),
          },
          tx,
        );
        records.push(...itemRecords);
      }

      const beauticianCommissionItems = orderItems.filter((item: any) => !(salesUserId && item.itemType === 'card'));
      const fallbackBeauticianId = this.toNumber(data.beauticianId) || undefined;
      const beauticianIds = [
        ...new Set(
          beauticianCommissionItems
            .map((item: any) => this.toNumber(item.beauticianId) || fallbackBeauticianId)
            .filter((item: number | undefined): item is number => Boolean(item)),
        ),
      ];
      if (!beauticianIds.length) return records;

      const select = { id: true, levelId: true, userId: true };
      const beauticians =
        typeof tx.beautician?.findMany === 'function'
          ? await tx.beautician.findMany({ where: { id: { in: beauticianIds }, storeId }, select })
          : typeof tx.beautician?.findUnique === 'function'
            ? (
                await Promise.all(
                  beauticianIds.map((id) => tx.beautician.findUnique({ where: { id }, select })),
                )
              ).filter(Boolean)
            : [];
      const beauticianById = new Map<number, { id: number; levelId?: number | null; userId?: number | null }>(
        beauticians.map((beautician: any) => [beautician.id, beautician]),
      );

      for (const item of beauticianCommissionItems) {
        const itemBeauticianId = this.toNumber(item.beauticianId) || fallbackBeauticianId;
        if (!itemBeauticianId) continue;
        const beautician = beauticianById.get(itemBeauticianId);
        if (!beautician?.userId) continue;

        await this.commissionService.calculateOrderCommissions(
          {
            storeId,
            orderId: order.id,
            staffUserId: beautician.userId,
            beauticianId: itemBeauticianId,
            levelId: this.toNumber(data.levelId) || beautician.levelId || undefined,
            isDesignated: Boolean(data.isDesignated),
            items: [
              {
                itemType: item.itemType,
                itemId: item.itemId,
                categoryId: undefined,
                subtotal: this.toNumber(item.netAmount ?? item.subtotal),
                orderItemId: item.id,
              },
            ],
          },
          tx,
        );
      }
    } catch (error) {
      console.warn('提成流水生成失败', error);
    }
  }

  private async resolveOrderCustomer(tx: any, data: any) {
    if (data.customerId) {
      return tx.customer.findUnique({ where: { id: Number(data.customerId) } });
    }
    const phone = String(data.customerPhone ?? '').trim();
    if (!phone) return null;
    const where: any = { phone, deletedAt: null };
    if (data.storeId) where.storeId = Number(data.storeId);
    return tx.customer.findFirst({ where, orderBy: { updatedAt: 'desc' } });
  }

  private async applyMarketingAttribution(tx: any, order: { id: number; customerId?: number | null }, amount: number) {
    if (!order.customerId || amount <= 0) return;

    const existed = await tx.marketingAttribution.findFirst({
      where: { orderId: order.id },
      select: { id: true },
    });
    if (existed) return;

    const touches = await tx.marketingAutomationTouch.findMany({
      where: {
        customerId: order.customerId,
        touchedAt: { lte: new Date() },
        status: { in: ['reached', 'sent', 'delivered', 'clicked', 'opened', 'converted'] },
      },
      orderBy: { touchedAt: 'desc' },
      take: 10,
    });

    const now = new Date();
    const touch = touches.find((item: any) => {
      const windowDays = Number(item.attributionWindowDays ?? 30);
      return item.touchedAt.getTime() >= now.getTime() - windowDays * 86400000;
    });
    if (!touch) return;

    await tx.marketingAttribution.create({
      data: {
        touchId: touch.id,
        strategyId: touch.strategyId,
        executionId: touch.executionId,
        customerId: order.customerId,
        orderId: order.id,
        attributionType: 'last_touch',
        attributedRevenue: amount,
        attributionWindowDays: touch.attributionWindowDays ?? 30,
        occurredAt: now,
      },
    });

    await tx.marketingAutomationTouch.update({
      where: { id: touch.id },
      data: {
        status: 'converted',
        convertedAt: now,
        conversionType: 'order',
        actualRevenue: { increment: amount },
      },
    });

    const category =
      String(touch.conversionType ?? touch.metadata?.category ?? touch.metadata?.strategyType ?? '')
        .toLowerCase()
        .includes('churn')
        ? 'churn_recovery'
        : 'marketing_conversion';
    await this.commissionService.recordAmiContribution(
      {
        storeId: this.toNumber((order as any).storeId),
        category,
        triggerType: 'automation',
        triggerId: touch.id,
        customerId: order.customerId,
        orderId: order.id,
        revenueAmount: amount,
        metadata: {
          strategyId: touch.strategyId,
          executionId: touch.executionId,
          attributionWindowDays: touch.attributionWindowDays ?? 30,
        },
      },
      tx,
    );
  }

  private async applyMarketingPageAttribution(tx: any, order: { id: number; customerId?: number | null }, amount: number) {
    if (!order.customerId || amount <= 0) return;
    if (!tx.marketingPageLead || !tx.marketingPageAttribution) return;

    try {
      const existed = await tx.marketingPageAttribution.findFirst({
        where: { orderId: order.id },
        select: { id: true },
      });
      if (existed) return;

      const now = new Date();
      const windowStart = new Date(now.getTime() - this.MARKETING_PAGE_ATTRIBUTION_WINDOW_DAYS * 86400000);
      const eligibleLeads = await tx.marketingPageLead.findMany({
        where: {
          customerId: order.customerId,
          status: { not: 'expired' },
          createdAt: { gte: windowStart },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      const lastLead = eligibleLeads[0];
      if (!lastLead) return;

      const duplicated = await tx.marketingPageAttribution.findFirst({
        where: { leadId: lastLead.id, orderId: order.id },
        select: { id: true },
      });
      if (duplicated) return;

      await tx.marketingPageAttribution.create({
        data: {
          leadId: lastLead.id,
          pageId: lastLead.pageId,
          customerId: order.customerId,
          orderId: order.id,
          attributionType: 'last_touch',
          attributedRevenue: amount,
          attributionWindowDays: this.MARKETING_PAGE_ATTRIBUTION_WINDOW_DAYS,
          touchedAt: lastLead.createdAt,
          convertedAt: now,
        },
      });

      await tx.marketingPageLead.update({
        where: { id: lastLead.id },
        data: { status: 'converted', convertedAt: now },
      });
    } catch (error) {
      console.warn('营销页面归因写入失败', error);
    }
  }

  private async reverseMarketingAttribution(tx: any, orderId: number, refundAmount: number) {
    if (refundAmount <= 0) return;

    const attributions = await tx.marketingAttribution.findMany({
      where: { orderId },
      include: { touch: true },
    });

    for (const attribution of attributions) {
      const nextRevenue = Math.max(0, this.toNumber(attribution.attributedRevenue) - refundAmount);
      const nextTouchRevenue = Math.max(0, this.toNumber(attribution.touch.actualRevenue) - refundAmount);
      await tx.marketingAttribution.update({
        where: { id: attribution.id },
        data: { attributedRevenue: nextRevenue },
      });
      await tx.marketingAutomationTouch.update({
        where: { id: attribution.touchId },
        data: { actualRevenue: nextTouchRevenue },
      });
    }
  }

  private async deductMemberBalanceForOrder(tx: any, order: any, amount: number, remark?: string) {
    if (!order.customerId) throw new BadRequestException('会员卡划扣需要先选择客户');
    if (!order.storeId) throw new BadRequestException('会员卡划扣需要先选择门店');
    if (amount <= 0) throw new BadRequestException('会员卡划扣金额必须大于 0');

    const account = await tx.customerBalanceAccount.findUnique({
      where: { customerId_storeId: { customerId: order.customerId, storeId: order.storeId } },
    });
    if (!account) throw new BadRequestException('该客户在当前门店没有可用会员卡账户');

    const cashBalanceBefore = this.toNumber(account.cashBalance);
    const giftBalanceBefore = this.toNumber(account.giftBalance);
    const allocation = this.allocateMemberBalanceDeduction(amount, cashBalanceBefore, giftBalanceBefore);

    await tx.customerBalanceAccount.update({
      where: { id: account.id },
      data: {
        cashBalance: allocation.cashBalanceAfter,
        giftBalance: allocation.giftBalanceAfter,
        status: 'active',
      },
    });

    return tx.customerBalanceTransaction.create({
      data: {
        accountId: account.id,
        customerId: order.customerId,
        storeId: order.storeId,
        orderId: order.id,
        transactionNo: this.createBalanceTransactionNo(),
        type: 'deduct',
        amount: allocation.cashDeduct,
        giftAmount: allocation.giftDeduct,
        cashBalanceBefore,
        cashBalanceAfter: allocation.cashBalanceAfter,
        giftBalanceBefore,
        giftBalanceAfter: allocation.giftBalanceAfter,
        paymentMethod: 'member_balance',
        remark: remark || `订单 ${order.orderNo} 会员卡划扣`,
      },
    });
  }

  private async restoreMemberBalanceForOrderRefund(
    tx: any,
    order: any,
    refundAmount: number,
    refundableAmount: number,
    remainingRefundableAmount: number,
    reason?: string,
  ) {
    if (!order?.id || !order.customerId || !order.storeId || refundAmount <= 0 || refundableAmount <= 0) return;

    const originalTransactions = await tx.customerBalanceTransaction.findMany({
      where: { orderId: order.id, type: 'deduct', paymentMethod: 'member_balance' },
      orderBy: { createdAt: 'asc' },
    });
    if (!originalTransactions.length) return;

    const restoredTransactions = await tx.customerBalanceTransaction.findMany({
      where: { orderId: order.id, type: 'refund', paymentMethod: 'member_balance' },
    });
    const originalCash = this.round(originalTransactions.reduce((sum: number, item: any) => sum + this.toNumber(item.amount), 0));
    const originalGift = this.round(originalTransactions.reduce((sum: number, item: any) => sum + this.toNumber(item.giftAmount), 0));
    const restoredCash = this.round(restoredTransactions.reduce((sum: number, item: any) => sum + this.toNumber(item.amount), 0));
    const restoredGift = this.round(restoredTransactions.reduce((sum: number, item: any) => sum + this.toNumber(item.giftAmount), 0));
    const remainingCash = this.round(Math.max(0, originalCash - restoredCash));
    const remainingGift = this.round(Math.max(0, originalGift - restoredGift));
    if (remainingCash <= 0 && remainingGift <= 0) return;

    const isFinalRefund = this.round(refundAmount) >= this.round(remainingRefundableAmount);
    const ratio = Math.min(1, Math.max(0, refundAmount / refundableAmount));
    const cashRestore = isFinalRefund ? remainingCash : Math.min(remainingCash, this.round(originalCash * ratio));
    const giftRestore = isFinalRefund ? remainingGift : Math.min(remainingGift, this.round(originalGift * ratio));
    if (cashRestore <= 0 && giftRestore <= 0) return;

    const accountId = originalTransactions[0].accountId;
    const account = await tx.customerBalanceAccount.findUnique({ where: { id: accountId } });
    if (!account) return;
    const cashBalanceBefore = this.toNumber(account.cashBalance);
    const giftBalanceBefore = this.toNumber(account.giftBalance);
    const cashBalanceAfter = this.round(cashBalanceBefore + cashRestore);
    const giftBalanceAfter = this.round(giftBalanceBefore + giftRestore);

    await tx.customerBalanceAccount.update({
      where: { id: account.id },
      data: {
        cashBalance: cashBalanceAfter,
        giftBalance: giftBalanceAfter,
        status: 'active',
      },
    });
    await tx.customerBalanceTransaction.create({
      data: {
        accountId: account.id,
        customerId: order.customerId,
        storeId: order.storeId,
        orderId: order.id,
        transactionNo: this.createBalanceTransactionNo(),
        type: 'refund',
        amount: cashRestore,
        giftAmount: giftRestore,
        cashBalanceBefore,
        cashBalanceAfter,
        giftBalanceBefore,
        giftBalanceAfter,
        paymentMethod: 'member_balance',
        remark: reason || `订单 ${order.orderNo} 会员卡划扣退款恢复`,
      },
    });
  }

  async findProductOrders(query: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
    storeId?: number | string;
    itemType?: string;
  }) {
    const { page = 1, pageSize = 20, keyword, status, storeId, itemType } = query;
    const where: any = {};
    if (status) {
      const normalizedStatus = this.normalizeOrderStatus(status);
      where.status = normalizedStatus === status ? status : { in: [normalizedStatus, status] };
    }
    const normalizedStoreId = this.toNumber(storeId);
    if (normalizedStoreId > 0) where.storeId = normalizedStoreId;
    if (itemType) {
      where.orderItems = { some: { itemType } };
    }
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword, mode: 'insensitive' } },
        { customerName: { contains: keyword, mode: 'insensitive' } },
        { customer: { phone: { contains: keyword, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.productOrder.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          store: { select: { id: true, name: true } },
          orderItems: { include: this.orderItemInclude },
          paymentRecords: true,
          refundRecords: true,
          balanceTransactions: {
            where: { type: 'deduct', paymentMethod: 'member_balance' },
            orderBy: { createdAt: 'desc' },
          },
          marketingAttributions: true,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.productOrder.count({ where }),
    ]);

    const normalizedItems = items.map((item) => this.serializeProductOrder(item, itemType?.toLowerCase()));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async findProjectOrders(query: { page?: number; pageSize?: number; keyword?: string; status?: string; storeId?: number | string }) {
    return this.findProductOrders({ ...query, itemType: 'project' });
  }

  async findProductOrderById(id: number) {
    const order = await this.prisma.productOrder.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
        orderItems: { include: this.orderItemInclude },
        paymentRecords: true,
        refundRecords: true,
        balanceTransactions: {
          where: { type: 'deduct', paymentMethod: 'member_balance' },
          orderBy: { createdAt: 'desc' },
        },
        marketingAttributions: true,
        recommendationEvents: true,
      },
    });
    if (!order) throw new NotFoundException('订单不存在');
    return this.serializeProductOrder(order, 'product');
  }

  async findProjectOrderById(id: number) {
    const order = await this.prisma.productOrder.findFirst({
      where: { id, orderItems: { some: { itemType: 'project' } } },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
        orderItems: { include: this.orderItemInclude },
        paymentRecords: true,
        refundRecords: true,
        balanceTransactions: {
          where: { type: 'deduct', paymentMethod: 'member_balance' },
          orderBy: { createdAt: 'desc' },
        },
        marketingAttributions: true,
        recommendationEvents: true,
      },
    });
    if (!order) throw new NotFoundException('项目订单不存在');
    return this.serializeProductOrder(order, 'project');
  }

  async findProductOrderProfit(id: number) {
    const order = await this.prisma.productOrder.findFirst({
      where: { id, orderItems: { some: { itemType: { in: ['product', 'goods'] } } } },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
        orderItems: {
          where: { itemType: { in: ['product', 'goods'] } },
          include: {
            commissionRecords: {
              where: { status: { not: 'cancelled' } },
              include: {
                staffUser: { select: { id: true, name: true, username: true } },
                beautician: { select: { id: true, name: true } },
                rule: { select: { id: true, name: true } },
              },
            },
          },
        },
        paymentRecords: true,
        refundRecords: true,
      },
    });
    if (!order) throw new NotFoundException('商品订单不存在');

    const productItems = order.orderItems.filter((item: any) => this.isProductOrderItemType(item.itemType));
    const productIds = [...new Set(productItems.map((item: any) => this.toNumber(item.itemId)).filter(Boolean))];
    const [products, movements, unassignedCommissionRecords] = await Promise.all([
      productIds.length
        ? this.prisma.product.findMany({
            where: { id: { in: productIds }, ...(order.storeId ? { storeId: order.storeId } : {}) },
            include: { category: { select: { id: true, name: true } } },
          })
        : Promise.resolve([]),
      productIds.length
        ? this.prisma.stockMovement.findMany({
            where: {
              productId: { in: productIds },
              sourceType: 'product_order',
              sourceId: order.id,
              movementType: 'sale_out',
            },
            include: { product: { select: { id: true, name: true, unit: true, specUnit: true, costPrice: true } } },
            orderBy: { occurredAt: 'asc' },
          })
        : Promise.resolve([]),
      this.prisma.commissionRecord.findMany({
        where: {
          orderId: order.id,
          orderItemId: null,
          type: 'product',
          status: { not: 'cancelled' },
        },
        include: {
          staffUser: { select: { id: true, name: true, username: true } },
          beautician: { select: { id: true, name: true } },
          rule: { select: { id: true, name: true } },
        },
      }),
    ]);

    const productById = new Map((products as any[]).map((product) => [Number(product.id), product]));
    const productCostById = new Map((products as any[]).map((product) => [Number(product.id), this.toNumber(product.costPrice)]));
    const stockMovementProductIds = new Set((movements as any[]).map((movement) => Number(movement.productId)));
    const serializeCommissionRecord = (record: any) => ({
      id: record.id,
      staffUserId: record.staffUserId,
      staffUserName: record.staffUser?.name ?? record.staffUser?.username ?? record.beautician?.name ?? '未关联员工',
      beauticianId: record.beauticianId,
      beauticianName: record.beautician?.name,
      ruleId: record.ruleId,
      ruleName: record.rule?.name,
      sourceAmount: this.round(this.toNumber(record.sourceAmount)),
      rate: this.round(this.toNumber(record.rate), 4),
      amount: this.round(this.toNumber(record.amount)),
      status: record.status,
      settleMonth: record.settleMonth,
    });

    const items = productItems.map((item: any) => {
      const quantity = this.toNumber(item.quantity) || 1;
      const productId = this.toNumber(item.itemId) || undefined;
      const product = productId ? productById.get(productId) : undefined;
      const listAmount = this.getItemListAmount(item);
      const salesAmount = this.getItemNetAmount(item);
      const refundAmount = this.getRefundShare(item, order);
      const netSalesAmount = Math.max(0, salesAmount - refundAmount);
      const cost = this.resolveProductItemCost(item, productCostById, stockMovementProductIds);
      const commissionRecords = (item.commissionRecords ?? []).map(serializeCommissionRecord);
      const commissionCost = commissionRecords.reduce((sum: number, record: any) => sum + this.toNumber(record.amount), 0);
      const productCost = cost.costAmount;
      const totalCost = productCost + commissionCost;
      const grossProfit = netSalesAmount - totalCost;
      const missingReasons = new Set<string>();
      if (!productId || !product) missingReasons.add('商品档案缺失');
      if (cost.source === 'missing') missingReasons.add('商品成本缺失');
      if (salesAmount > 0 && commissionCost <= 0) missingReasons.add('提成记录缺失');

      return {
        orderItemId: item.id,
        productId,
        productName: product?.name ?? item.name,
        sku: product?.sku ?? '',
        categoryName: product?.category?.name,
        brand: product?.brand,
        quantity: this.round(quantity, 4),
        unitPrice: this.round(this.toNumber(item.unitPrice)),
        listAmount: this.round(listAmount),
        discountAmount: this.round(this.toNumber(item.totalDiscountAmount ?? item.discount)),
        salesAmount: this.round(salesAmount),
        refundAmount: this.round(refundAmount),
        netSalesAmount: this.round(netSalesAmount),
        unitCost: this.round(cost.unitCost),
        costSource: cost.source,
        productCost: this.round(productCost),
        commissionCost: this.round(commissionCost),
        totalCost: this.round(totalCost),
        grossProfit: this.round(grossProfit),
        grossMargin: netSalesAmount > 0 ? this.round(grossProfit / netSalesAmount, 4) : 0,
        commissionRecords,
        missingReasons: Array.from(missingReasons),
      };
    });

    const stockMovements = (movements as any[]).map((movement) => {
      const quantity = Math.abs(this.toNumber(movement.quantity));
      const costPrice = this.toNumber(movement.product?.costPrice);
      return {
        id: movement.id,
        productId: movement.productId,
        productName: movement.product?.name ?? `商品#${movement.productId}`,
        quantity: this.round(quantity, 4),
        unit: movement.unit ?? movement.product?.specUnit ?? movement.product?.unit,
        costPrice: this.round(costPrice),
        costAmount: this.round(quantity * costPrice),
        occurredAt: movement.occurredAt,
        remark: movement.remark,
      };
    });
    const unassignedCommission = (unassignedCommissionRecords as any[]).map(serializeCommissionRecord);
    const unassignedCommissionCost = unassignedCommission.reduce((sum: number, record: any) => sum + this.toNumber(record.amount), 0);
    const totalSalesAmount = items.reduce((sum, item) => sum + item.netSalesAmount, 0);
    const productCost = items.reduce((sum, item) => sum + item.productCost, 0);
    const commissionCost = items.reduce((sum, item) => sum + item.commissionCost, 0);
    const totalCost = productCost + commissionCost + unassignedCommissionCost;
    const grossProfit = totalSalesAmount - totalCost;
    const costSources = [...new Set(items.map((item) => item.costSource))];
    const missingReasons = new Set<string>();
    if (items.some((item) => item.missingReasons.length)) missingReasons.add('存在商品行成本或提成缺口');
    if (unassignedCommissionCost > 0) missingReasons.add('存在未分配到订单行的历史提成记录');

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      customerId: order.customerId,
      customerName: order.customerName ?? order.customer?.name ?? '散客',
      customerPhone: order.customer?.phone ?? '',
      storeId: order.storeId,
      storeName: order.store?.name ?? '',
      status: order.status,
      source: order.source,
      createdAt: order.createdAt,
      paymentMethod: order.payMethod ?? order.paymentRecords?.[0]?.method,
      listAmount: this.round(items.reduce((sum, item) => sum + item.listAmount, 0)),
      discountAmount: this.round(items.reduce((sum, item) => sum + item.discountAmount, 0)),
      refundAmount: this.round(items.reduce((sum, item) => sum + item.refundAmount, 0)),
      totalSalesAmount: this.round(totalSalesAmount),
      productCost: this.round(productCost),
      commissionCost: this.round(commissionCost),
      unassignedCommissionCost: this.round(unassignedCommissionCost),
      totalCost: this.round(totalCost),
      grossProfit: this.round(grossProfit),
      grossMargin: totalSalesAmount > 0 ? this.round(grossProfit / totalSalesAmount, 4) : 0,
      costSource: costSources.length === 1 ? costSources[0] : costSources.includes('missing') ? 'missing' : 'mixed',
      dataQuality: missingReasons.size > 0 ? 'partial' : 'complete',
      missingReasons: Array.from(missingReasons),
      items,
      stockMovements,
      unassignedCommissionRecords: unassignedCommission,
    };
  }

  async findProjectOrderProfit(id: number) {
    const order = await this.prisma.productOrder.findFirst({
      where: { id, orderItems: { some: { itemType: 'project' } } },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
        orderItems: {
          where: { itemType: 'project' },
          include: {
            beautician: { select: { id: true, name: true } },
            commissionRecords: {
              where: { status: { not: 'cancelled' } },
              include: {
                staffUser: { select: { id: true, name: true, username: true } },
                beautician: { select: { id: true, name: true } },
                rule: { select: { id: true, name: true } },
              },
            },
          },
        },
        paymentRecords: true,
      },
    });
    if (!order) throw new NotFoundException('项目订单不存在');

    const projectItems = order.orderItems.filter((item: any) => String(item.itemType).toLowerCase() === 'project');
    const projectIds = [...new Set(projectItems.map((item: any) => this.toNumber(item.itemId)).filter(Boolean))];
    const [bomItems, movements, unassignedCommissionRecords] = await Promise.all([
      projectIds.length
        ? this.prisma.projectBomItem.findMany({
            where: { projectId: { in: projectIds } },
            include: { product: { select: { id: true, name: true, unit: true, specUnit: true, costPrice: true } } },
          })
        : Promise.resolve([]),
      this.prisma.stockMovement.findMany({
        where: { sourceType: 'project_order', sourceId: order.id, movementType: { in: ['service_consume', 'service_consumption'] } },
        include: { product: { select: { id: true, name: true, unit: true, specUnit: true, costPrice: true } } },
        orderBy: { occurredAt: 'asc' },
      }),
      this.prisma.commissionRecord.findMany({
        where: {
          orderId: order.id,
          orderItemId: null,
          type: 'project',
          status: { not: 'cancelled' },
        },
        include: {
          staffUser: { select: { id: true, name: true, username: true } },
          beautician: { select: { id: true, name: true } },
          rule: { select: { id: true, name: true } },
        },
      }),
    ]);

    const bomByProjectId = new Map<number, any[]>();
    for (const item of bomItems as any[]) {
      const list = bomByProjectId.get(Number(item.projectId)) ?? [];
      list.push(item);
      bomByProjectId.set(Number(item.projectId), list);
    }

    const serializeCommissionRecord = (record: any) => ({
      id: record.id,
      staffUserId: record.staffUserId,
      staffUserName: record.staffUser?.name ?? record.staffUser?.username ?? record.beautician?.name ?? '未关联员工',
      beauticianId: record.beauticianId,
      beauticianName: record.beautician?.name,
      ruleId: record.ruleId,
      ruleName: record.rule?.name,
      sourceAmount: this.round(this.toNumber(record.sourceAmount)),
      rate: this.round(this.toNumber(record.rate), 4),
      amount: this.round(this.toNumber(record.amount)),
      status: record.status,
      settleMonth: record.settleMonth,
    });

    const items = projectItems.map((item: any) => {
      const quantity = this.toNumber(item.quantity) || 1;
      const income = Math.max(0, this.toNumber(item.subtotal));
      const projectId = this.toNumber(item.itemId) || undefined;
      const missingReasons = new Set<string>();
      const itemBomItems = projectId ? bomByProjectId.get(projectId) ?? [] : [];
      if (!projectId) missingReasons.add('项目档案缺失');
      if (projectId && itemBomItems.length === 0) missingReasons.add('未配置项目 BOM');
      if (!item.beauticianId) missingReasons.add('未选择服务员工');

      const bomDetails = itemBomItems.map((bomItem: any) => {
        const standardQty = this.toNumber(bomItem.standardQty);
        const totalQty = standardQty * quantity;
        const costPrice = this.toNumber(bomItem.product?.costPrice);
        return {
          projectId,
          productId: bomItem.productId,
          productName: bomItem.product?.name ?? `耗材#${bomItem.productId}`,
          unit: bomItem.unit ?? bomItem.product?.specUnit ?? bomItem.product?.unit,
          standardQty: this.round(standardQty, 4),
          quantity: this.round(totalQty, 4),
          costPrice: this.round(costPrice),
          costAmount: this.round(totalQty * costPrice),
        };
      });
      const standardMaterialCost = bomDetails.reduce((sum, bomItem) => sum + bomItem.costAmount, 0);
      const commissionRecords = (item.commissionRecords ?? []).map(serializeCommissionRecord);
      const commissionCost = commissionRecords.reduce((sum: number, record: any) => sum + this.toNumber(record.amount), 0);
      if (income > 0 && commissionCost <= 0) missingReasons.add('未生成行级提成');
      const cost = standardMaterialCost + commissionCost;
      const grossProfit = income - cost;

      return {
        orderItemId: item.id,
        projectId,
        projectName: item.name,
        quantity: this.round(quantity, 4),
        unitPrice: this.round(this.toNumber(item.unitPrice)),
        income: this.round(income),
        standardMaterialCost: this.round(standardMaterialCost),
        commissionCost: this.round(commissionCost),
        totalCost: this.round(cost),
        grossProfit: this.round(grossProfit),
        grossMargin: income > 0 ? this.round(grossProfit / income, 4) : 0,
        beauticianId: item.beauticianId,
        beauticianName: item.beautician?.name ?? item.payload?.beauticianName,
        bomItems: bomDetails,
        commissionRecords,
        missingReasons: Array.from(missingReasons),
      };
    });

    const actualMaterialMovements = (movements as any[]).map((movement) => {
      const quantity = Math.abs(this.toNumber(movement.quantity));
      const costPrice = this.toNumber(movement.product?.costPrice);
      return {
        id: movement.id,
        productId: movement.productId,
        productName: movement.product?.name ?? `耗材#${movement.productId}`,
        quantity: this.round(quantity, 4),
        unit: movement.unit ?? movement.product?.specUnit ?? movement.product?.unit,
        costPrice: this.round(costPrice),
        costAmount: this.round(quantity * costPrice),
        occurredAt: movement.occurredAt,
        remark: movement.remark,
      };
    });
    const standardMaterialCost = items.reduce((sum, item) => sum + item.standardMaterialCost, 0);
    const actualMaterialCost = actualMaterialMovements.reduce((sum, movement) => sum + movement.costAmount, 0);
    const materialCost = actualMaterialCost > 0 ? actualMaterialCost : standardMaterialCost;
    const commissionCost = items.reduce((sum, item) => sum + item.commissionCost, 0);
    const unassignedCommission = (unassignedCommissionRecords as any[]).map(serializeCommissionRecord);
    const unassignedCommissionCost = unassignedCommission.reduce((sum: number, record: any) => sum + this.toNumber(record.amount), 0);
    const totalIncome = items.reduce((sum, item) => sum + item.income, 0);
    const totalCost = materialCost + commissionCost + unassignedCommissionCost;
    const grossProfit = totalIncome - totalCost;
    const missingReasons = new Set<string>();
    if (items.some((item) => item.missingReasons.length)) missingReasons.add('存在项目行成本或提成缺口');
    if (projectItems.length > 0 && actualMaterialCost <= 0) missingReasons.add('未找到实际耗材扣减流水，已按标准 BOM 估算耗材成本');
    if (unassignedCommissionCost > 0) missingReasons.add('存在未分配到订单行的历史提成记录');

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      customerId: order.customerId,
      customerName: order.customerName ?? order.customer?.name ?? '散客',
      customerPhone: order.customer?.phone ?? '',
      storeId: order.storeId,
      storeName: order.store?.name ?? '',
      status: order.status,
      source: order.source,
      createdAt: order.createdAt,
      paymentMethod: order.payMethod ?? order.paymentRecords?.[0]?.method,
      totalIncome: this.round(totalIncome),
      standardMaterialCost: this.round(standardMaterialCost),
      actualMaterialCost: this.round(actualMaterialCost),
      materialCost: this.round(materialCost),
      commissionCost: this.round(commissionCost),
      unassignedCommissionCost: this.round(unassignedCommissionCost),
      totalCost: this.round(totalCost),
      grossProfit: this.round(grossProfit),
      grossMargin: totalIncome > 0 ? this.round(grossProfit / totalIncome, 4) : 0,
      materialCostSource: actualMaterialCost > 0 ? 'actual_stock_movement' : 'standard_bom',
      dataQuality: missingReasons.size > 0 ? 'partial' : 'complete',
      missingReasons: Array.from(missingReasons),
      items,
      actualMaterialMovements,
      unassignedCommissionRecords: unassignedCommission,
    };
  }

  async createProductOrder(data: any) {
    const orderNo = data.orderNo ?? `PO${Date.now()}`;
    const normalizedInputItems = this.normalizeOrderItems(Array.isArray(data.items) ? data.items : []);
    const allocation = data.preAllocatedDiscount
      ? this.buildPreAllocatedDiscountResult(data, normalizedInputItems)
      : this.discountAllocationService.allocate(this.buildDiscountAllocationInput(data, normalizedInputItems));
    const items = allocation.items;
    const totalAmount = allocation.order.netAmount;
    const status = this.normalizeOrderStatus(data.status);
    const payMethod = this.normalizePaymentMethod(data.payMethod ?? data.paymentMethod);

    const createdOrder = await this.prisma.$transaction(async (tx) => {
      const customer = await this.resolveOrderCustomer(tx, data);
      const storeId = data.storeId ? Number(data.storeId) : undefined;
      const orderItems = await this.attachProductCostSnapshots(tx, storeId, items);
      const order = await tx.productOrder.create({
        data: {
          orderNo,
          checkoutGroupNo: data.checkoutGroupNo ?? orderNo,
          orderKind: data.orderKind ?? (items.some((item) => String(item.itemType).toLowerCase() === 'project') ? 'project' : 'product'),
          customerId: customer?.id,
          customerName: data.customerName ?? customer?.name,
          storeId,
          totalAmount,
          listAmount: allocation.order.listAmount,
          itemDiscountAmount: allocation.order.itemDiscountAmount,
          orderDiscountAmount: allocation.order.orderDiscountAmount,
          totalDiscountAmount: allocation.order.totalDiscountAmount,
          netAmount: allocation.order.netAmount,
          discountSource: allocation.order.discountSource,
          allocationMethod: allocation.order.allocationMethod,
          promotionId: allocation.order.promotionId,
          couponId: allocation.order.couponId,
          packageId: allocation.order.packageId,
          discountPayload: this.toJson(allocation.order.discountPayload),
          status,
          payMethod,
          source: data.source ?? 'admin',
          items: this.toJson(orderItems),
          remark: data.remark,
        },
      });

      if (orderItems.length) {
        await tx.orderItem.createMany({
          data: orderItems.map((item) => ({
            orderId: order.id,
            itemType: item.itemType,
            itemId: item.itemId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            listAmount: item.listAmount,
            subtotal: item.subtotal,
            discount: item.discount,
            itemDiscountAmount: item.itemDiscountAmount,
            orderAllocatedDiscountAmount: item.orderAllocatedDiscountAmount,
            totalDiscountAmount: item.totalDiscountAmount,
            netAmount: item.netAmount,
            discountSource: item.discountSource,
            allocationMethod: item.allocationMethod,
            discountPayload: item.discountPayload,
            isGift: item.isGift,
            eligibleForOrderDiscount: item.eligibleForOrderDiscount,
            beauticianId: this.toNumber(item.beauticianId ?? data.beauticianId) || undefined,
            payload: item.payload,
          })),
        });
      }

      if (this.isPaidLikeStatus(status)) {
        const paidAmount = this.toNumber(data.paidAmount ?? totalAmount);
        const paymentInputs = this.normalizePaymentInputs(data.payments, paidAmount, payMethod);
        for (const payment of paymentInputs) {
          if (payment.method === 'member_balance') {
            await this.deductMemberBalanceForOrder(tx, order, payment.amount, data.remark);
          }
        }

        await this.consumeProductItemsForOrder(tx, order, orderItems, data.remark);
        await this.consumeProjectBomForOrder(tx, order, orderItems, data.remark);

        await tx.paymentRecord.createMany({
          data: paymentInputs.map((payment) => ({
            orderId: order.id,
            paymentNo: this.createPaymentNo(),
            method: payment.method,
            amount: payment.amount,
            status: 'success',
            transactionNo: payment.transactionNo ?? data.transactionNo,
            paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
          })),
        });

        if (order.customerId) {
          await tx.customer.update({
            where: { id: order.customerId },
            data: {
              totalSpent: { increment: totalAmount },
              visitCount: { increment: 1 },
              lastVisitDate: new Date(),
            },
          });
        }
        await this.applyMarketingAttribution(tx, order, totalAmount);
        await this.applyMarketingPageAttribution(tx, order, totalAmount);
        await this.calculateOrderCommissionIfNeeded(tx, order, data);
      }

      return tx.productOrder.findUnique({
        where: { id: order.id },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          store: { select: { id: true, name: true } },
          orderItems: { include: this.orderItemInclude },
          paymentRecords: true,
          refundRecords: true,
          balanceTransactions: {
            where: { type: 'deduct', paymentMethod: 'member_balance' },
            orderBy: { createdAt: 'desc' },
          },
          marketingAttributions: true,
        },
      }).then((createdOrder) => this.serializeProductOrder(createdOrder));
    }, { timeout: 20000 });
    if (!data.skipDailySettlementRefresh) {
      await this.refreshDailySettlementForOrder(createdOrder, data.dailySettlementSource ?? 'admin_order');
    }
    return createdOrder;
  }

  async createProjectOrder(data: any) {
    const items = Array.isArray(data.items) ? data.items : [];
    const projectItems = items.map((item: any) => ({
      ...item,
      itemType: 'project',
      type: 'project',
      itemId: item.itemId ?? item.projectId,
      projectId: item.projectId ?? item.itemId,
      name: item.name ?? item.projectName ?? item.productName,
      productName: item.productName ?? item.projectName ?? item.name,
    }));

    return this.createProductOrder({
      ...data,
      items: projectItems,
      source: data.source ?? 'admin',
    });
  }

  async updateProductOrder(id: number, data: any) {
    await this.findProductOrderById(id);
    const items = Array.isArray(data.items) ? this.normalizeOrderItems(data.items) : undefined;

    return this.prisma.$transaction(async (tx) => {
      const updateData: any = { ...data };
      delete updateData.orderItems;
      delete updateData.paymentRecords;
      delete updateData.refundRecords;
      if (data.customerId) updateData.customerId = Number(data.customerId);
      if (data.storeId) updateData.storeId = Number(data.storeId);
      if (data.status !== undefined) updateData.status = this.normalizeOrderStatus(data.status);

      const order = await tx.productOrder.update({ where: { id }, data: updateData });
      const orderItems = items ? await this.attachProductCostSnapshots(tx, this.toNumber(order.storeId) || undefined, items) : undefined;

      if (orderItems) {
        await tx.orderItem.deleteMany({ where: { orderId: id } });
        if (orderItems.length) {
          await tx.orderItem.createMany({
            data: orderItems.map((item) => ({
              orderId: id,
              itemType: item.itemType,
              itemId: item.itemId,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              listAmount: item.listAmount,
              subtotal: item.subtotal,
              discount: item.discount,
              itemDiscountAmount: item.itemDiscountAmount,
              orderAllocatedDiscountAmount: item.orderAllocatedDiscountAmount,
              totalDiscountAmount: item.totalDiscountAmount,
              netAmount: item.netAmount,
              discountSource: item.discountSource,
              allocationMethod: item.allocationMethod,
              discountPayload: item.discountPayload,
              isGift: item.isGift,
              eligibleForOrderDiscount: item.eligibleForOrderDiscount,
              payload: item.payload,
            })),
          });
        }
      }

      if (this.isPaidLikeStatus(this.normalizeOrderStatus(data.status ?? order.status))) {
        const orderItemsForConsumption = orderItems ?? (await tx.orderItem.findMany({ where: { orderId: id } }));
        await this.consumeProductItemsForOrder(tx, order, orderItemsForConsumption, data.remark ?? order.remark);
        await this.consumeProjectBomForOrder(tx, order, orderItemsForConsumption, data.remark ?? order.remark);

        const paid = await tx.paymentRecord.findFirst({ where: { orderId: id, status: 'success' } });
        if (!paid) {
          const amount = this.toNumber(data.paidAmount ?? order.totalAmount);
          await tx.paymentRecord.create({
            data: {
              orderId: id,
              paymentNo: this.createPaymentNo(),
              method: data.payMethod ?? data.paymentMethod ?? order.payMethod ?? 'cash',
              amount,
              status: 'success',
              transactionNo: data.transactionNo,
              paidAt: new Date(),
            },
          });
          await this.applyMarketingAttribution(tx, order, amount);
          await this.applyMarketingPageAttribution(tx, order, amount);
        }
      }

      return tx.productOrder.findUnique({
        where: { id },
        include: { orderItems: { include: this.orderItemInclude }, paymentRecords: true, refundRecords: true, marketingAttributions: true },
      });
    });
  }

  async refundOrder(id: number, reasonOrDto?: string | { reason?: string; amount?: number }) {
    const order = await this.findProductOrderById(id);
    const reason = typeof reasonOrDto === 'string' ? reasonOrDto : reasonOrDto?.reason;
    const refundableAmount = this.toNumber((order as any).netAmount ?? order.totalAmount);
    const refundedAmount = Array.isArray((order as any).refundRecords)
      ? (order as any).refundRecords.reduce((sum: number, record: any) => sum + this.toNumber(record.amount), 0)
      : 0;
    const remainingRefundableAmount = this.round(Math.max(0, refundableAmount - refundedAmount));
    const amount = typeof reasonOrDto === 'object' ? this.toNumber(reasonOrDto.amount ?? remainingRefundableAmount) : remainingRefundableAmount;
    if (amount <= 0) throw new BadRequestException('退款金额必须大于 0');
    if (amount > remainingRefundableAmount) throw new BadRequestException('退款金额不能大于订单剩余可退金额');

    const refundedOrder = await this.prisma.$transaction(async (tx) => {
      await tx.refundRecord.create({
        data: {
          orderId: id,
          refundNo: this.createRefundNo(),
          amount,
          reason,
          status: 'success',
          refundedAt: new Date(),
        },
      });

      const updated = await tx.productOrder.update({
        where: { id },
        data: { status: 'refunded', remark: reason },
      });

      if (updated.customerId) {
        await tx.customer.update({
          where: { id: updated.customerId },
          data: { totalSpent: { decrement: amount } },
        });
      }
      await this.restoreMemberBalanceForOrderRefund(tx, order, amount, refundableAmount, remainingRefundableAmount, reason);
      await this.reverseMarketingAttribution(tx, id, amount);
      await this.commissionService.reverseOrderCommissions(id, amount, tx);

      return tx.productOrder.findUnique({
        where: { id },
        include: {
          orderItems: { include: this.orderItemInclude },
          paymentRecords: true,
          refundRecords: true,
          balanceTransactions: {
            where: { type: 'deduct', paymentMethod: 'member_balance' },
            orderBy: { createdAt: 'desc' },
          },
          marketingAttributions: true,
        },
      });
    });
    await this.refreshDailySettlementForOrder(refundedOrder, 'admin_order_refund');
    return this.serializeProductOrder(refundedOrder);
  }

  private createBalanceTransactionNo() {
    return `BAL${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private getMemberCardTypeLabel(type: string) {
    const labels: Record<string, string> = {
      open: '开卡',
      recharge: '充值',
      gift: '赠送',
      deduct: '划扣',
      refund: '退款',
    };
    return labels[type] ?? type;
  }

  private serializeMemberCardAccount(account: any) {
    const transactions = Array.isArray(account.transactions) ? account.transactions : [];
    const totalRecharge = transactions
      .filter((item: any) => ['open', 'recharge', 'gift'].includes(String(item.type)))
      .reduce((sum: number, item: any) => sum + this.toNumber(item.amount) + this.toNumber(item.giftAmount), 0);
    const totalConsumed = transactions
      .filter((item: any) => ['deduct', 'consume'].includes(String(item.type)))
      .reduce((sum: number, item: any) => sum + this.toNumber(item.amount) + this.toNumber(item.giftAmount), 0);
    const latestRemark = transactions.find((item: any) => item.remark)?.remark;
    const latestTransaction = transactions[0];
    const openTransaction = transactions.find((item: any) => String(item.type) === 'open');
    const handler = openTransaction?.operator;
    const latestOrderNo = latestTransaction?.order?.checkoutGroupNo ?? latestTransaction?.order?.orderNo;

    return {
      id: account.id,
      accountNo: String(10000 + account.id),
      customerId: account.customerId,
      userName: account.customer?.name ?? '',
      customerPhone: account.customer?.phone ?? '',
      storeId: account.storeId,
      storeName: account.store?.name ?? '',
      totalRecharge,
      totalConsumed,
      availableBalance: this.toNumber(account.cashBalance),
      giftBalance: this.toNumber(account.giftBalance),
      handlerId: openTransaction?.operatorId ?? handler?.id,
      handlerName: handler?.name ?? handler?.username ?? '',
      remark: latestRemark ?? undefined,
      lastTransactionNo: latestTransaction?.transactionNo ?? undefined,
      lastOrderNo: latestOrderNo ?? undefined,
      lastTransactionType: latestTransaction?.type ?? undefined,
      lastTransactionAmount: latestTransaction
        ? this.toNumber(latestTransaction.amount) + this.toNumber(latestTransaction.giftAmount)
        : undefined,
      lastTransactionAt: latestTransaction?.createdAt ?? undefined,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  private serializeMemberCardTransaction(transaction: any) {
    return {
      id: transaction.id,
      accountId: transaction.accountId,
      accountNo: transaction.accountId ? String(transaction.accountId) : undefined,
      customerId: transaction.customerId ?? transaction.customer?.id,
      customerName: transaction.customer?.name ?? '',
      customerPhone: transaction.customer?.phone ?? '',
      storeId: transaction.storeId ?? transaction.store?.id,
      storeName: transaction.store?.name ?? '',
      orderId: transaction.orderId ?? transaction.order?.id,
      orderNo: transaction.order?.checkoutGroupNo ?? transaction.order?.orderNo ?? '',
      transactionNo: transaction.transactionNo,
      type: transaction.type,
      typeLabel: this.getMemberCardTypeLabel(transaction.type),
      amount: this.toNumber(transaction.amount),
      giftAmount: this.toNumber(transaction.giftAmount),
      cashBalanceBefore: this.toNumber(transaction.cashBalanceBefore),
      cashBalanceAfter: this.toNumber(transaction.cashBalanceAfter),
      giftBalanceBefore: this.toNumber(transaction.giftBalanceBefore),
      giftBalanceAfter: this.toNumber(transaction.giftBalanceAfter),
      paymentMethod: transaction.paymentMethod,
      operatorId: transaction.operatorId,
      operatorName: transaction.operator?.name ?? transaction.operator?.username ?? '',
      remark: transaction.remark,
      createdAt: transaction.createdAt,
    };
  }

  async findMemberCardDeductTransactionsPaginated(query: {
    page?: number | string;
    pageSize?: number | string;
    keyword?: string;
    storeId?: number | string;
  }) {
    const page = Math.max(1, this.toNumber(query.page) || 1);
    const pageSize = Math.max(1, this.toNumber(query.pageSize) || 20);
    const storeId = this.toNumber(query.storeId);
    const keyword = query.keyword?.trim();
    const where: any = { type: 'deduct' };
    if (storeId > 0) where.storeId = storeId;
    if (keyword) {
      where.OR = [
        { transactionNo: { contains: keyword, mode: 'insensitive' } },
        { remark: { contains: keyword, mode: 'insensitive' } },
        { customer: { name: { contains: keyword, mode: 'insensitive' } } },
        { customer: { phone: { contains: keyword, mode: 'insensitive' } } },
        { store: { name: { contains: keyword, mode: 'insensitive' } } },
        { order: { orderNo: { contains: keyword, mode: 'insensitive' } } },
        { order: { checkoutGroupNo: { contains: keyword, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.customerBalanceTransaction.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          store: { select: { id: true, name: true } },
          order: { select: { id: true, orderNo: true, checkoutGroupNo: true } },
          operator: { select: { id: true, name: true, username: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customerBalanceTransaction.count({ where }),
    ]);

    const normalizedItems = items.map((item) => this.serializeMemberCardTransaction(item));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async findMemberCardsPaginated(query: { page?: number | string; pageSize?: number | string; keyword?: string; storeId?: number | string }) {
    const page = Math.max(1, this.toNumber(query.page) || 1);
    const pageSize = Math.max(1, this.toNumber(query.pageSize) || 20);
    const storeId = this.toNumber(query.storeId);
    const keyword = query.keyword?.trim();
    const where: any = {};
    if (storeId > 0) where.storeId = storeId;
    if (keyword) {
      const numericKeyword = Number(keyword);
      const accountId = Number.isFinite(numericKeyword) ? numericKeyword - 10000 : 0;
      const keywordConditions: any[] = [
        { customer: { name: { contains: keyword, mode: 'insensitive' } } },
        { customer: { phone: { contains: keyword, mode: 'insensitive' } } },
        { transactions: { some: { remark: { contains: keyword, mode: 'insensitive' } } } },
        { transactions: { some: { transactionNo: { contains: keyword, mode: 'insensitive' } } } },
        { transactions: { some: { order: { orderNo: { contains: keyword, mode: 'insensitive' } } } } },
        { transactions: { some: { order: { checkoutGroupNo: { contains: keyword, mode: 'insensitive' } } } } },
      ];
      if (accountId > 0) keywordConditions.push({ id: accountId });
      where.OR = keywordConditions;
    }

    const [items, total] = await Promise.all([
      this.prisma.customerBalanceAccount.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          store: { select: { id: true, name: true } },
          transactions: {
            include: {
              operator: { select: { id: true, name: true, username: true } },
              order: { select: { id: true, orderNo: true, checkoutGroupNo: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customerBalanceAccount.count({ where }),
    ]);
    const normalizedItems = items.map((item) => this.serializeMemberCardAccount(item));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async openMemberCard(data: any, operatorId?: number) {
    return this.createMemberCardRecharge({ ...data, operatorId }, 'open');
  }

  async rechargeMemberCard(id: number, data: any, operatorId?: number) {
    const account = await this.prisma.customerBalanceAccount.findUnique({
      where: { id },
      include: { customer: true, store: true },
    });
    if (!account) throw new NotFoundException('会员卡不存在');
    return this.createMemberCardRecharge(
      {
        ...data,
        customerId: account.customerId,
        customerName: account.customer?.name,
        storeId: account.storeId,
        operatorId,
      },
      'recharge',
    );
  }

  async createRechargeOrder(data: any, operatorId?: number) {
    return this.createMemberCardRecharge(
      {
        ...data,
        operatorId: data.operatorId ?? operatorId,
      },
      'recharge',
    );
  }

  private async createMemberCardRecharge(data: any, type: 'open' | 'recharge') {
    const customerId = this.toNumber(data.customerId);
    const storeId = this.toNumber(data.storeId);
    const rechargeAmount = this.toNumber(data.rechargeAmount ?? data.amount);
    const giftAmount = this.toNumber(data.giftAmount ?? data.discountAmount);
    const giftProjects = Array.isArray(data.giftProjects)
      ? data.giftProjects.map((project: unknown) => String(project).trim()).filter(Boolean)
      : [];
    const giftProjectRemark = giftProjects.length ? `赠送项目：${giftProjects.join('、')}` : '';
    if (!customerId) throw new BadRequestException('请选择客户');
    if (!storeId) throw new BadRequestException('请选择门店');
    if (rechargeAmount <= 0) throw new BadRequestException('充值金额必须大于 0');

    const [customer, store] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: customerId } }),
      this.prisma.store.findUnique({ where: { id: storeId } }),
    ]);
    if (!customer) throw new BadRequestException('客户不存在');
    if (!store) throw new BadRequestException('门店不存在');

    const result = await this.prisma.$transaction(async (tx) => {
      const account = await tx.customerBalanceAccount.upsert({
        where: { customerId_storeId: { customerId, storeId } },
        update: { status: 'active' },
        create: {
          customerId,
          storeId,
          cashBalance: 0,
          giftBalance: 0,
          status: 'active',
        },
        include: { transactions: true },
      });
      const cashBalanceBefore = this.toNumber(account.cashBalance);
      const giftBalanceBefore = this.toNumber(account.giftBalance);
      const cashBalanceAfter = cashBalanceBefore + rechargeAmount;
      const giftBalanceAfter = giftBalanceBefore + giftAmount;

      const order = await tx.productOrder.create({
        data: {
          orderNo: `${type === 'open' ? 'MO' : 'MR'}${Date.now().toString(36).toUpperCase()}`,
          orderKind: type === 'open' ? 'member_card_open' : 'member_card_recharge',
          customerId,
          customerName: customer.name,
          storeId,
          totalAmount: rechargeAmount,
          listAmount: rechargeAmount,
          netAmount: rechargeAmount,
          discountSource: 'none',
          allocationMethod: 'none',
          discountPayload: { giftAmount, giftProjects },
          status: 'completed',
          payMethod: this.normalizePaymentMethod(data.paymentMethod),
          source: data.source ?? 'admin',
          items: [{ itemType: 'recharge', quantity: 1, unitPrice: rechargeAmount, giftAmount, giftProjects }],
          remark: data.remark ?? [type === 'open' ? '会员开卡' : '会员充值', giftProjectRemark].filter(Boolean).join('，'),
        },
      });

      await (tx as any).orderItem.create({
        data: {
          orderId: order.id,
          itemType: 'recharge',
          name: type === 'open' ? '会员开卡' : '会员充值',
          quantity: 1,
          unitPrice: rechargeAmount,
          listAmount: rechargeAmount,
          subtotal: rechargeAmount,
          discount: 0,
          itemDiscountAmount: 0,
          orderAllocatedDiscountAmount: 0,
          totalDiscountAmount: 0,
          netAmount: rechargeAmount,
          discountSource: 'none',
          allocationMethod: 'none',
          isGift: false,
          eligibleForOrderDiscount: false,
          beauticianId: this.toNumber(data.beauticianId) || undefined,
          payload: { giftAmount, giftProjects, remark: data.remark },
        },
      });

      if (typeof tx.consumptionRecord?.create === 'function') {
        await tx.consumptionRecord.create({
          data: {
            customerId,
            consumeType: type === 'open' ? '会员开卡' : '充值',
            consumeContent: `${type === 'open' ? '会员开卡' : '充值'} ${rechargeAmount}，赠送 ${giftAmount}${
              giftProjects.length ? `，赠送项目：${giftProjects.join('、')}` : ''
            }`,
            payMethod: this.normalizePaymentMethod(data.paymentMethod),
            amount: rechargeAmount,
            campaign: data.remark,
          },
        });
      }

      await tx.paymentRecord.create({
        data: {
          orderId: order.id,
          paymentNo: this.createPaymentNo(),
          method: this.normalizePaymentMethod(data.paymentMethod),
          amount: rechargeAmount,
          status: 'success',
          transactionNo: data.transactionNo,
          paidAt: new Date(),
        },
      });

      await tx.customer.update({
        where: { id: customerId },
        data: {
          totalSpent: { increment: rechargeAmount },
          visitCount: { increment: 1 },
          lastVisitDate: new Date(),
        },
      });

      const updatedAccount = await tx.customerBalanceAccount.update({
        where: { id: account.id },
        data: {
          cashBalance: cashBalanceAfter,
          giftBalance: giftBalanceAfter,
          status: 'active',
        },
      });

      const balanceTransaction = await tx.customerBalanceTransaction.create({
        data: {
          accountId: account.id,
          customerId,
          storeId,
          orderId: order.id,
          transactionNo: this.createBalanceTransactionNo(),
          type,
          amount: rechargeAmount,
          giftAmount,
          cashBalanceBefore,
          cashBalanceAfter,
          giftBalanceBefore,
          giftBalanceAfter,
          paymentMethod: this.normalizePaymentMethod(data.paymentMethod),
          operatorId: this.toNumber(data.operatorId) || undefined,
          remark: data.remark ?? giftProjectRemark,
        },
      });

      await this.applyMarketingAttribution(tx, order, rechargeAmount);
      await this.applyMarketingPageAttribution(tx, order, rechargeAmount);
      await this.calculateOrderCommissionIfNeeded(tx, order, data);
      return { account: updatedAccount, order, balanceTransaction };
    }, { timeout: 20000 });

    const account = await this.prisma.customerBalanceAccount.findUnique({
      where: { id: result.account.id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
        transactions: {
          include: {
            operator: { select: { id: true, name: true, username: true } },
            order: { select: { id: true, orderNo: true, checkoutGroupNo: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    await this.refreshDailySettlementForOrder(result.order, type === 'open' ? 'admin_member_card_open' : 'member_card_recharge');
    return {
      ...this.serializeMemberCardAccount(account),
      orderId: result.order.id,
      orderNo: result.order.orderNo,
      orderCreatedAt: result.order.createdAt,
      balanceTransactionId: result.balanceTransaction.id,
      cashBalance: this.toNumber(account?.cashBalance),
      paymentMethod: this.normalizePaymentMethod(data.paymentMethod),
    };
  }

  async giftMemberCard(id: number, data: any, operatorId?: number) {
    const giftAmount = this.toNumber(data.giftAmount);
    if (giftAmount <= 0) throw new BadRequestException('赠送金额必须大于 0');
    return this.adjustMemberCardBalance(id, { amount: 0, giftAmount, type: 'gift', remark: data.remark, operatorId });
  }

  async deductMemberCard(id: number, data: any, operatorId?: number) {
    const items = Array.isArray(data.items) ? this.normalizeOrderItems(data.items) : [];
    if (!items.length) throw new BadRequestException('请选择会员卡划扣项目或商品明细');
    const invalidItem = items.find(
      (item) =>
        !['project', 'product'].includes(String(item.itemType)) ||
        !String(item.name ?? '').trim() ||
        this.toNumber(item.quantity) <= 0 ||
        this.toNumber(item.unitPrice) < 0 ||
        !this.toNumber(item.beauticianId),
    );
    if (invalidItem) throw new BadRequestException('会员卡划扣明细需包含项目/商品、次数/数量、单价和服务人员');
    const deductAmount = this.round(items.reduce((sum, item) => sum + this.toNumber(item.netAmount ?? item.subtotal), 0));
    if (deductAmount <= 0) throw new BadRequestException('划扣明细金额必须大于 0');
    if (data.amount !== undefined && Math.abs(this.round(this.toNumber(data.amount) - deductAmount)) > 0.01) {
      throw new BadRequestException('划扣金额必须等于明细合计');
    }

    const account = await this.prisma.customerBalanceAccount.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
      },
    });
    if (!account) throw new NotFoundException('会员卡不存在');
    const order = await this.createProductOrder({
      orderNo: data.orderNo,
      checkoutGroupNo: data.checkoutGroupNo,
      customerId: account.customerId,
      customerName: account.customer?.name,
      storeId: account.storeId,
      storeName: account.store?.name,
      status: 'completed',
      payMethod: 'member_balance',
      paymentMethod: 'member_balance',
      paidAmount: deductAmount,
      source: 'admin_member_card_deduct',
      remark: data.remark || '会员卡划扣',
      dailySettlementSource: 'admin_member_card_deduct',
      items: items.map((item) => ({
        ...item,
        subtotal: this.round(this.toNumber(item.subtotal ?? item.quantity * item.unitPrice)),
        netAmount: this.round(this.toNumber(item.netAmount ?? item.subtotal ?? item.quantity * item.unitPrice)),
      })),
    });
    const updatedAccount = await this.prisma.customerBalanceAccount.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
        transactions: {
          include: {
            operator: { select: { id: true, name: true, username: true } },
            order: { select: { id: true, orderNo: true, checkoutGroupNo: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    return { ...this.serializeMemberCardAccount(updatedAccount), lastOrderNo: order.orderNo };
  }

  async refundMemberCard(id: number, data: any, operatorId?: number) {
    const refundAmount = this.toNumber(data.amount);
    if (refundAmount <= 0) throw new BadRequestException('退款金额必须大于 0');

    const account = await this.prisma.customerBalanceAccount.findUnique({
      where: { id },
      include: { customer: true, store: true },
    });
    if (!account) throw new NotFoundException('会员卡不存在');
    const cashBalance = this.toNumber(account.cashBalance);
    if (refundAmount > cashBalance) throw new BadRequestException('退款金额不能大于储值现金余额');

    const sourceTransactions = await this.prisma.customerBalanceTransaction.findMany({
      where: {
        accountId: id,
        type: { in: ['open', 'recharge'] },
        orderId: { not: null },
      },
      include: { order: { include: { refundRecords: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const refundedOrderIds = new Set<number>();
    await this.prisma.$transaction(async (tx) => {
      const cashBalanceBefore = this.toNumber(account.cashBalance);
      const giftBalanceBefore = this.toNumber(account.giftBalance);
      const cashBalanceAfter = cashBalanceBefore - refundAmount;
      const giftBalanceAfter = 0;

      await tx.customerBalanceAccount.update({
        where: { id },
        data: { cashBalance: cashBalanceAfter, giftBalance: giftBalanceAfter, status: 'active' },
      });
      await tx.customerBalanceTransaction.create({
        data: {
          accountId: id,
          customerId: account.customerId,
          storeId: account.storeId,
          transactionNo: this.createBalanceTransactionNo(),
          type: 'refund',
          amount: refundAmount,
          giftAmount: 0,
          cashBalanceBefore,
          cashBalanceAfter,
          giftBalanceBefore,
          giftBalanceAfter,
          paymentMethod: data.paymentMethod ? this.normalizePaymentMethod(data.paymentMethod) : undefined,
          operatorId: this.toNumber(operatorId) || undefined,
          remark: data.remark,
        },
      });

      let remainingRefund = refundAmount;
      for (const transaction of sourceTransactions) {
        if (remainingRefund <= 0) break;
        const order = transaction.order;
        if (!order) continue;
        const orderAmount = this.toNumber(order.netAmount ?? order.totalAmount);
        const existingRefundAmount = (order.refundRecords ?? []).reduce((sum: number, record: any) => sum + this.toNumber(record.amount), 0);
        const orderRefundable = this.round(Math.max(0, orderAmount - existingRefundAmount));
        if (orderRefundable <= 0) continue;
        const allocatedRefund = this.round(Math.min(remainingRefund, orderRefundable));
        await tx.refundRecord.create({
          data: {
            orderId: order.id,
            refundNo: this.createRefundNo(),
            amount: allocatedRefund,
            reason: data.remark ?? '会员卡余额退款',
            status: 'success',
            refundedAt: new Date(),
          },
        });
        await tx.productOrder.update({
          where: { id: order.id },
          data: { status: 'refunded', remark: data.remark ?? '会员卡余额退款' },
        });
        await this.reverseMarketingAttribution(tx, order.id, allocatedRefund);
        await this.commissionService.reverseOrderCommissions(order.id, allocatedRefund, tx);
        refundedOrderIds.add(order.id);
        remainingRefund = this.round(remainingRefund - allocatedRefund);
      }

      if (account.customerId) {
        await tx.customer.update({
          where: { id: account.customerId },
          data: { totalSpent: { decrement: refundAmount } },
        });
      }
    });

    const refreshedOrders = refundedOrderIds.size
      ? await this.prisma.productOrder.findMany({ where: { id: { in: Array.from(refundedOrderIds) } } })
      : [];
    await Promise.all(refreshedOrders.map((order) => this.refreshDailySettlementForOrder(order, 'admin_member_card_refund')));

    const updatedAccount = await this.prisma.customerBalanceAccount.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
        transactions: {
          include: {
            operator: { select: { id: true, name: true, username: true } },
            order: { select: { id: true, orderNo: true, checkoutGroupNo: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    return this.serializeMemberCardAccount(updatedAccount);
  }

  private async adjustMemberCardBalance(
    id: number,
    data: {
      amount: number;
      giftAmount: number;
      type: 'gift' | 'deduct' | 'refund';
      paymentMethod?: string;
      remark?: string;
      operatorId?: number;
    },
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const account = await tx.customerBalanceAccount.findUnique({
        where: { id },
        include: { customer: true, store: true },
      });
      if (!account) throw new NotFoundException('会员卡不存在');

      const cashBalanceBefore = this.toNumber(account.cashBalance);
      const giftBalanceBefore = this.toNumber(account.giftBalance);
      const cashBalanceAfter =
        data.type === 'deduct' || data.type === 'refund' ? cashBalanceBefore - this.toNumber(data.amount) : cashBalanceBefore;
      const giftBalanceAfter =
        data.type === 'deduct'
          ? giftBalanceBefore - this.toNumber(data.giftAmount)
          : giftBalanceBefore + this.toNumber(data.giftAmount);

      const updatedAccount = await tx.customerBalanceAccount.update({
        where: { id },
        data: {
          cashBalance: cashBalanceAfter,
          giftBalance: giftBalanceAfter,
          status: 'active',
        },
      });

      await tx.customerBalanceTransaction.create({
        data: {
          accountId: id,
          customerId: account.customerId,
          storeId: account.storeId,
          transactionNo: this.createBalanceTransactionNo(),
          type: data.type,
          amount: this.toNumber(data.amount),
          giftAmount: this.toNumber(data.giftAmount),
          cashBalanceBefore,
          cashBalanceAfter,
          giftBalanceBefore,
          giftBalanceAfter,
          paymentMethod: data.type === 'deduct' ? 'member_balance' : data.paymentMethod ? this.normalizePaymentMethod(data.paymentMethod) : undefined,
          operatorId: this.toNumber(data.operatorId) || undefined,
          remark: data.remark,
        },
      });
      return updatedAccount;
    });

    const account = await this.prisma.customerBalanceAccount.findUnique({
      where: { id: result.id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
        transactions: {
          include: {
            operator: { select: { id: true, name: true, username: true } },
            order: { select: { id: true, orderNo: true, checkoutGroupNo: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    return this.serializeMemberCardAccount(account);
  }

  async findMemberCardTransactions(accountId: number) {
    const account = await this.prisma.customerBalanceAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('会员卡不存在');
    const items = await this.prisma.customerBalanceTransaction.findMany({
      where: { accountId },
      include: {
        operator: { select: { id: true, name: true, username: true } },
        order: { select: { id: true, orderNo: true, checkoutGroupNo: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((item) => this.serializeMemberCardTransaction(item));
  }

  async createCardOrder(storeId: number, data: any, _currentUserId?: number) {
    if (!storeId) throw new BadRequestException('请选择门店');
    const cardId = this.toNumber(data.cardId);
    if (!cardId) throw new BadRequestException('请选择次卡');

    let customerId = this.toNumber(data.customerId ?? data.userId);
    let customer = customerId
      ? await this.prisma.customer.findFirst({ where: { id: customerId, storeId, deletedAt: null } })
      : null;
    const customerName = String(data.customerName ?? data.userName ?? '').trim();
    if (!customer && customerName) {
      customer = await this.prisma.customer.findFirst({
        where: { name: customerName, storeId, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
      });
    }
    if (!customer) throw new BadRequestException('请选择客户');
    customerId = customer.id;

    const [store, card] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: storeId } }),
      this.prisma.card.findUnique({ where: { id: cardId } }),
    ]);
    if (!store) throw new BadRequestException('门店不存在');
    if (!card) throw new NotFoundException('次卡不存在');

    const originalAmount = this.toNumber(card.price);
    const explicitDiscount = data.discountAmount === undefined ? undefined : Math.min(originalAmount, Math.max(0, this.toNumber(data.discountAmount)));
    const amount = Math.max(0, this.toNumber(data.amount ?? data.actualPrice ?? (explicitDiscount !== undefined ? originalAmount - explicitDiscount : undefined) ?? data.cardPrice ?? card.price));
    const discount = explicitDiscount ?? Math.max(0, originalAmount - amount);
    const totalTimes = this.toNumber(data.totalTimes ?? card.totalTimes) || this.toNumber(card.totalTimes);
    const giftProjects = Array.isArray(data.giftProjects)
      ? data.giftProjects.map((project: unknown) => String(project).trim()).filter(Boolean)
      : [];
    const expiryDate = data.expiryDate ?? data.expireTime
      ? new Date(data.expiryDate ?? data.expireTime)
      : new Date(Date.now() + this.resolveCardValidDays(card) * 24 * 60 * 60 * 1000);
    const payMethod = this.normalizePaymentMethod(data.paymentMethod ?? data.payMethod ?? 'cash');
    const pricingSnapshot = this.buildCardPricingSnapshot({ card, paidAmount: amount, totalTimes, discountAmount: discount });
    const selectedOperatorId = this.toNumber(data.operatorId) || undefined;
    const selectedOperator = selectedOperatorId
      ? await this.assertStoreUserAllowed(storeId, selectedOperatorId)
      : null;

    const result = await this.prisma.$transaction(async (tx) => {
      const customerCard = await tx.customerCard.create({
        data: {
          customerId,
          cardId: card.id,
          operatorId: selectedOperator?.id,
          cardName: data.cardName ?? card.name,
          totalTimes,
          remainingTimes: this.toNumber(data.remainingTimes ?? totalTimes) || totalTimes,
          paidAmount: amount,
          discountAmount: discount,
          giftTimes: 0,
          recognizedUnitValue: pricingSnapshot.recognizedUnitValue,
          pricingSnapshot,
          expiryDate,
          status: data.status ?? 'active',
        },
      });

      const order = await tx.productOrder.create({
        data: {
          orderNo: `CO${Date.now().toString(36).toUpperCase()}`,
          customerId,
          customerName: customer.name,
          storeId,
          totalAmount: amount,
          listAmount: this.toNumber(card.price),
          itemDiscountAmount: discount,
          totalDiscountAmount: discount,
          netAmount: amount,
          discountSource: discount > 0 ? 'item' : 'none',
          allocationMethod: discount > 0 ? 'direct' : 'none',
          discountPayload: { cardPrice: originalAmount, actualAmount: amount, giftProjects },
          status: 'completed',
          payMethod,
          source: data.source ?? 'admin',
          items: [{ itemType: 'card', itemId: card.id, quantity: 1, unitPrice: amount, discountAmount: discount, giftProjects }],
          remark: data.remark ?? `次卡开卡：${card.name}`,
        },
      });

      const orderItem = await tx.orderItem.create({
        data: {
          orderId: order.id,
          itemType: 'card',
          itemId: card.id,
          name: card.name,
          quantity: 1,
          unitPrice: amount,
          listAmount: this.toNumber(card.price),
          subtotal: amount,
          discount,
          itemDiscountAmount: discount,
          orderAllocatedDiscountAmount: 0,
          totalDiscountAmount: discount,
          netAmount: amount,
          discountSource: discount > 0 ? 'item' : 'none',
          allocationMethod: discount > 0 ? 'direct' : 'none',
          discountPayload: { cardPrice: originalAmount, actualAmount: amount, giftProjects },
          isGift: false,
          eligibleForOrderDiscount: true,
          beauticianId: this.toNumber(data.beauticianId) || undefined,
          payload: { cardName: card.name, totalTimes, expiryDate: expiryDate.toISOString(), giftProjects },
        },
      });

      await tx.customerCard.update({
        where: { id: customerCard.id },
        data: {
          sourceOrderId: order.id,
          sourceOrderItemId: orderItem.id,
        },
      });

      await tx.paymentRecord.create({
        data: {
          orderId: order.id,
          paymentNo: this.createPaymentNo(),
          method: payMethod,
          amount,
          status: 'success',
          transactionNo: data.transactionNo,
          paidAt: new Date(),
        },
      });
      if (payMethod === 'member_balance' && amount > 0) {
        await this.deductMemberBalanceForOrder(tx, order, amount, data.remark);
      }

      await tx.customer.update({
        where: { id: customerId },
        data: {
          totalSpent: { increment: amount },
          visitCount: { increment: 1 },
          lastVisitDate: new Date(),
        },
      });

      await this.applyMarketingAttribution(tx, order, amount);
      await this.applyMarketingPageAttribution(tx, order, amount);
      return { customerCard: { ...customerCard, sourceOrderId: order.id, sourceOrderItemId: orderItem.id }, order };
    });

    await this.calculateOrderCommissionIfNeeded(this.prisma, result.order, data);
    await this.refreshDailySettlementForOrder(result.order, 'admin_card_order');
    return {
      id: result.customerCard.id,
      orderId: result.order.id,
      orderNo: result.order.orderNo,
      customerId,
      customerName: customer.name,
      customerPhone: customer.phone ?? '',
      cardId: card.id,
      cardName: card.name,
      operatorId: selectedOperator?.id,
      operatorName: selectedOperator?.name ?? selectedOperator?.username ?? '',
      storeId,
      storeName: store.name,
      amount,
      discountAmount: discount,
      giftProjects,
      totalTimes,
      remainingTimes: result.customerCard.remainingTimes,
      status: result.customerCard.status,
      purchaseTime: result.customerCard.createdAt,
      expireTime: result.customerCard.expiryDate,
      paymentMethod: payMethod,
    };
  }

  private buildCardOrderProjectSummary(card: any, customerCard: any, usageRecords: any[] = []) {
    const projects = Array.isArray(card?.projects) ? card.projects : [];
    return projects
      .map((project: any) => {
        const projectName = String(project.projectName ?? project.name ?? '').trim();
        if (!projectName) return null;
        const totalCount = Number(project.timesPerCard ?? project.totalCount ?? project.times ?? customerCard.totalTimes ?? 0);
        const openedAt = new Date(customerCard.createdAt).getTime();
        const expiredAt = new Date(customerCard.expiryDate).getTime();
        const usedCount = usageRecords
          .filter((record: any) => {
            const verifiedAt = new Date(record.verifiedAt).getTime();
            return (
              record.projectName === projectName &&
              (!Number.isFinite(openedAt) || verifiedAt >= openedAt) &&
              (!Number.isFinite(expiredAt) || verifiedAt <= expiredAt)
            );
          })
          .reduce((sum: number, record: any) => sum + Number(record.times ?? 0), 0);
        return {
          projectName,
          totalCount,
          usedCount,
          remainCount: Math.max(totalCount - usedCount, 0),
        };
      })
      .filter(Boolean);
  }

  private serializeCardOrder(item: any, usageRecords: any[] = []) {
    const sourceOrder = item.sourceOrder;
    const sourceOrderItem = item.sourceOrderItem;
    const refundRecords = sourceOrder?.refundRecords ?? [];
    const serializedRefundRecords = refundRecords.map((record: any) => ({
      ...record,
      amount: this.round(this.toNumber(record.amount)),
    }));
    const latestRefundRecord = [...serializedRefundRecords].sort((left: any, right: any) => {
      const leftTime = new Date(left.refundedAt ?? left.createdAt ?? 0).getTime();
      const rightTime = new Date(right.refundedAt ?? right.createdAt ?? 0).getTime();
      return rightTime - leftTime;
    })[0];
    const refundAmount = serializedRefundRecords.reduce((sum: number, record: any) => sum + this.toNumber(record.amount), 0);
    const recognizedAmount = usageRecords.reduce((sum: number, record: any) => {
      const amount = this.toNumber(record.recognizedAmount);
      return sum + (amount > 0 ? amount : this.toNumber(record.recognizedUnitValue) * this.toNumber(record.times));
    }, 0);
    return {
      ...item,
      id: item.id,
      customerId: item.customerId,
      customerName: item.customer?.name ?? '',
      userName: item.customer?.name ?? '',
      customerPhone: item.customer?.phone ?? '',
      handlerId: item.operatorId ?? item.operator?.id,
      handlerName: item.operator?.name ?? item.operator?.username ?? '',
      cardId: item.cardId,
      customerCardId: item.id,
      sourceOrderId: item.sourceOrderId,
      sourceOrderNo: sourceOrder?.checkoutGroupNo ?? sourceOrder?.orderNo,
      sourceOrderItemId: item.sourceOrderItemId,
      totalTimes: item.totalTimes,
      remainingTimes: item.remainingTimes,
      actualPrice: this.round(this.toNumber(item.paidAmount ?? sourceOrderItem?.netAmount ?? sourceOrder?.netAmount ?? sourceOrder?.totalAmount)),
      listAmount: this.round(this.toNumber(sourceOrderItem?.listAmount ?? item.card?.price)),
      discountAmount: this.round(this.toNumber(item.discountAmount ?? sourceOrderItem?.totalDiscountAmount)),
      refundAmount: this.round(refundAmount),
      refundNo: latestRefundRecord?.refundNo,
      refundRecords: serializedRefundRecords,
      recognizedAmount: this.round(recognizedAmount),
      cardProjects: this.buildCardOrderProjectSummary(item.card, item, usageRecords),
      purchaseTime: item.createdAt,
      expireTime: item.expiryDate,
      paymentMethod: sourceOrder?.payMethod ?? sourceOrder?.paymentRecords?.[0]?.method,
      remark: sourceOrder?.remark,
      storeId: sourceOrder?.storeId,
      storeName: sourceOrder?.store?.name ?? '',
    };
  }

  // Card orders
  async findCardOrdersPaginated(query: { page?: number; pageSize?: number; userName?: string; cardName?: string }) {
    const { page = 1, pageSize = 20, userName, cardName } = query;
    const where: any = {};
    if (cardName) where.cardName = { contains: cardName, mode: 'insensitive' };
    if (userName) where.customer = { name: { contains: userName, mode: 'insensitive' } };

    const [items, total] = await Promise.all([
      this.prisma.customerCard.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          card: { select: { id: true, price: true, totalTimes: true, projects: true } },
          operator: { select: { id: true, name: true, username: true } },
          sourceOrder: { include: { paymentRecords: true, refundRecords: true, store: { select: { id: true, name: true } } } },
          sourceOrderItem: true,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customerCard.count({ where }),
    ]);
    const usageWhere =
      items.length > 0
        ? {
            OR: items.map((item: any) => ({
              customerId: item.customerId,
              cardName: item.cardName,
            })),
          }
        : {};
    const usageRecords = items.length
      ? await this.prisma.cardUsageRecord.findMany({
          where: usageWhere,
          select: { customerId: true, cardName: true, projectName: true, times: true, verifiedAt: true },
        })
      : [];

    const mapped = items.map((item: any) => this.serializeCardOrder(
      item,
      usageRecords.filter((record: any) => record.customerId === item.customerId && record.cardName === item.cardName),
    ));
    return { items: mapped, data: mapped, total, page, pageSize };
  }

  async findCardOrderById(id: number) {
    const item = await this.prisma.customerCard.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        card: { select: { id: true, price: true, totalTimes: true, projects: true } },
        operator: { select: { id: true, name: true, username: true } },
        sourceOrder: { include: { paymentRecords: true, refundRecords: true, store: { select: { id: true, name: true } } } },
        sourceOrderItem: true,
      },
    });
    if (!item) throw new NotFoundException('次卡订单不存在');
    const usageRecords = await this.prisma.cardUsageRecord.findMany({
      where: {
        OR: [
          { customerCardId: id },
          { customerId: item.customerId, cardName: item.cardName },
        ],
      },
      select: { customerId: true, cardName: true, projectName: true, times: true, remainingTimes: true, recognizedUnitValue: true, recognizedAmount: true, verifiedAt: true },
      orderBy: { verifiedAt: 'desc' },
    });
    return this.serializeCardOrder(item, usageRecords);
  }

  async updateCardOrder(id: number, data: any) {
    const item = await this.prisma.customerCard.findUnique({
      where: { id },
      include: { sourceOrder: true },
    });
    if (!item) throw new NotFoundException('次卡订单不存在');
    if (item.status === 'voided') throw new BadRequestException('已作废次卡不可编辑');

    const nextStatus = data.status === undefined ? undefined : String(data.status);
    if (nextStatus && !['active', 'expired'].includes(nextStatus)) {
      throw new BadRequestException('编辑只允许调整为已激活或已过期，退卡请使用退款功能');
    }
    const expiryValue = data.expiryDate ?? data.expireTime;
    const updateData: any = {};
    if (nextStatus) updateData.status = nextStatus;
    if (expiryValue) {
      const expiryDate = new Date(expiryValue);
      if (Number.isNaN(expiryDate.getTime())) throw new BadRequestException('过期时间格式不正确');
      updateData.expiryDate = expiryDate;
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length) {
        await tx.customerCard.update({ where: { id }, data: updateData });
      }
      if (item.sourceOrderId && data.remark !== undefined) {
        await tx.productOrder.update({
          where: { id: item.sourceOrderId },
          data: { remark: String(data.remark ?? '') },
        });
      }
    });

    return this.findCardOrderById(id);
  }

  async voidCardOrder(id: number, data?: { reason?: string; refundAmount?: number }) {
    const item = await this.prisma.customerCard.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        card: { select: { id: true, name: true, price: true, storeId: true } },
        sourceOrder: { include: { refundRecords: true } },
        usageRecords: true,
      },
    });
    if (!item) throw new NotFoundException('次卡订单不存在');
    if (item.status === 'voided') throw new BadRequestException('该次卡已作废');

    const paidAmount = this.toNumber(item.paidAmount ?? item.sourceOrder?.netAmount ?? item.sourceOrder?.totalAmount);
    const recognizedAmount = item.usageRecords.reduce((sum: number, record: any) => {
      const amount = this.toNumber(record.recognizedAmount);
      return sum + (amount > 0 ? amount : this.toNumber(record.recognizedUnitValue) * this.toNumber(record.times));
    }, 0);
    const existingRefundAmount = (item.sourceOrder?.refundRecords ?? []).reduce((sum: number, record: any) => sum + this.toNumber(record.amount), 0);
    const maxRefundAmount = this.round(Math.max(0, paidAmount - recognizedAmount - existingRefundAmount));
    const requestedRefundAmount = data?.refundAmount === undefined ? maxRefundAmount : this.toNumber(data.refundAmount);
    const refundAmount = this.round(Math.max(0, Math.min(requestedRefundAmount, maxRefundAmount)));
    const reason = data?.reason ?? '次卡退卡作废';

    const { updated, refundRecord, refundSourceOrder } = await this.prisma.$transaction(async (tx) => {
      let refundRecord: any = null;
      let sourceOrderId = item.sourceOrderId;
      let refundSourceOrder: any = item.sourceOrder;

      if (!sourceOrderId && refundAmount > 0) {
        const recoveredOrder = await tx.productOrder.create({
          data: {
            orderNo: `COR${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
            checkoutGroupNo: `COR${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
            orderKind: 'card',
            customerId: item.customerId,
            customerName: item.customer?.name,
            storeId: item.card?.storeId,
            totalAmount: paidAmount,
            listAmount: this.toNumber(item.card?.price ?? paidAmount),
            totalDiscountAmount: this.toNumber(item.discountAmount),
            netAmount: paidAmount,
            discountSource: this.toNumber(item.discountAmount) > 0 ? 'item' : 'none',
            allocationMethod: this.toNumber(item.discountAmount) > 0 ? 'direct' : 'none',
            discountPayload: { recoveredFromCustomerCardId: item.id, recoveredReason: 'card_refund_without_source_order' },
            status: 'refunded',
            source: 'card_refund_recovery',
            items: [{ itemType: 'card', itemId: item.cardId, quantity: 1, unitPrice: paidAmount, cardName: item.cardName }],
            remark: reason,
            createdAt: item.createdAt,
          },
        });
        const recoveredOrderItem = await tx.orderItem.create({
          data: {
            orderId: recoveredOrder.id,
            itemType: 'card',
            itemId: item.cardId,
            name: item.cardName,
            quantity: 1,
            unitPrice: paidAmount,
            listAmount: this.toNumber(item.card?.price ?? paidAmount),
            subtotal: paidAmount,
            discount: this.toNumber(item.discountAmount),
            totalDiscountAmount: this.toNumber(item.discountAmount),
            netAmount: paidAmount,
            discountSource: this.toNumber(item.discountAmount) > 0 ? 'item' : 'none',
            allocationMethod: this.toNumber(item.discountAmount) > 0 ? 'direct' : 'none',
            payload: { recoveredFromCustomerCardId: item.id },
          },
        });
        await tx.customerCard.update({
          where: { id },
          data: { sourceOrderId: recoveredOrder.id, sourceOrderItemId: recoveredOrderItem.id },
        });
        sourceOrderId = recoveredOrder.id;
        refundSourceOrder = recoveredOrder;
      }

      if (sourceOrderId && refundAmount > 0) {
        refundRecord = await tx.refundRecord.create({
          data: {
            orderId: sourceOrderId,
            refundNo: this.createRefundNo(),
            amount: refundAmount,
            reason,
            status: 'success',
            refundedAt: new Date(),
          },
        });
        await tx.productOrder.update({
          where: { id: sourceOrderId },
          data: { status: 'refunded', remark: reason },
        });
        await this.reverseMarketingAttribution(tx, sourceOrderId, refundAmount);
        await this.commissionService.reverseOrderCommissions(sourceOrderId, refundAmount, tx);
      }
      if (item.customerId && refundAmount > 0) {
        await tx.customer.update({
          where: { id: item.customerId },
          data: { totalSpent: { decrement: refundAmount } },
        });
      }
      const updated = await tx.customerCard.update({
        where: { id },
        data: { status: 'voided', remainingTimes: 0 },
      });
      return { updated, refundRecord, refundSourceOrder };
    });

    if (refundSourceOrder) {
      await this.refreshDailySettlementForOrder(refundSourceOrder, 'admin_card_order_void');
    }
    return {
      ...(await this.findCardOrderById(id)),
      refundAmount,
      refundNo: refundRecord?.refundNo,
      refundRecord: refundRecord
        ? {
            ...refundRecord,
            amount: this.round(this.toNumber(refundRecord.amount)),
          }
        : undefined,
      maxRefundAmount,
      recognizedAmount: this.round(recognizedAmount),
      status: updated.status,
    };
  }

  async findCardOrderProfit(id: number) {
    const item = await this.prisma.customerCard.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        card: { select: { id: true, name: true, price: true, totalTimes: true, projects: true } },
        operator: { select: { id: true, name: true, username: true } },
        usageRecords: {
          include: {
            project: { select: { id: true, name: true } },
            commissionRecords: {
              where: { status: { not: 'cancelled' } },
              include: {
                staffUser: { select: { id: true, name: true, username: true } },
                beautician: { select: { id: true, name: true } },
                rule: { select: { id: true, name: true } },
              },
            },
          },
        },
        sourceOrder: {
          include: {
            store: { select: { id: true, name: true } },
            paymentRecords: true,
            refundRecords: true,
          },
        },
        sourceOrderItem: {
          include: {
            commissionRecords: {
              where: { status: { not: 'cancelled' } },
              include: {
                staffUser: { select: { id: true, name: true, username: true } },
                beautician: { select: { id: true, name: true } },
                rule: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('次卡订单不存在');

    const serializeCommissionRecord = (record: any) => ({
      id: record.id,
      staffUserId: record.staffUserId,
      staffUserName: record.staffUser?.name ?? record.staffUser?.username ?? record.beautician?.name ?? '未关联员工',
      beauticianId: record.beauticianId,
      beauticianName: record.beautician?.name,
      ruleId: record.ruleId,
      ruleName: record.rule?.name,
      sourceAmount: this.round(this.toNumber(record.sourceAmount)),
      rate: this.round(this.toNumber(record.rate), 4),
      amount: this.round(this.toNumber(record.amount)),
      status: record.status,
      settleMonth: record.settleMonth,
    });

    const unassignedCommissionRecords = item.sourceOrderId
      ? await this.prisma.commissionRecord.findMany({
          where: {
            orderId: item.sourceOrderId,
            orderItemId: null,
            type: 'card_sale',
            status: { not: 'cancelled' },
          },
          include: {
            staffUser: { select: { id: true, name: true, username: true } },
            beautician: { select: { id: true, name: true } },
            rule: { select: { id: true, name: true } },
          },
        })
      : [];

    const usageProjectIds = [...new Set(item.usageRecords.map((record: any) => this.toNumber(record.projectId)).filter(Boolean))];
    const usageRecordIds = item.usageRecords.map((record: any) => this.toNumber(record.id)).filter(Boolean);
    const [usageBomItems, usageMaterialMovements] = await Promise.all([
      usageProjectIds.length
        ? this.prisma.projectBomItem.findMany({
            where: { projectId: { in: usageProjectIds } },
            include: { product: { select: { id: true, name: true, unit: true, specUnit: true, costPrice: true } } },
          })
        : Promise.resolve([]),
      usageRecordIds.length
        ? this.prisma.stockMovement.findMany({
            where: {
              sourceType: 'card_usage',
              sourceId: { in: usageRecordIds },
              movementType: { in: ['service_consume', 'service_consumption'] },
            },
            include: { product: { select: { id: true, name: true, unit: true, specUnit: true, costPrice: true } } },
            orderBy: { occurredAt: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    const usageBomByProjectId = new Map<number, any[]>();
    for (const bomItem of usageBomItems as any[]) {
      const list = usageBomByProjectId.get(Number(bomItem.projectId)) ?? [];
      list.push(bomItem);
      usageBomByProjectId.set(Number(bomItem.projectId), list);
    }
    const materialMovementsByUsageId = new Map<number, any[]>();
    for (const movement of usageMaterialMovements as any[]) {
      const usageId = Number(movement.sourceId);
      const list = materialMovementsByUsageId.get(usageId) ?? [];
      list.push(movement);
      materialMovementsByUsageId.set(usageId, list);
    }

    const listAmount = this.toNumber(item.sourceOrderItem?.listAmount ?? item.card?.price);
    const paidAmount = this.toNumber(item.paidAmount ?? item.sourceOrderItem?.netAmount ?? item.sourceOrder?.netAmount ?? item.sourceOrder?.totalAmount);
    const discountAmount = this.toNumber(item.discountAmount ?? item.sourceOrderItem?.totalDiscountAmount);
    const refundAmount = (item.sourceOrder?.refundRecords ?? []).reduce((sum: number, record: any) => sum + this.toNumber(record.amount), 0);
    const netSalesAmount = Math.max(0, paidAmount - refundAmount);
    const recognizedAmount = item.usageRecords.reduce((sum: number, record: any) => {
      const amount = this.toNumber(record.recognizedAmount);
      return sum + (amount > 0 ? amount : this.toNumber(record.recognizedUnitValue) * this.toNumber(record.times));
    }, 0);
    const remainingLiability = item.status === 'voided'
      ? 0
      : Math.max(0, paidAmount - refundAmount - recognizedAmount);
    const saleCommissionRecords = (item.sourceOrderItem?.commissionRecords ?? []).map(serializeCommissionRecord);
    const saleCommissionCost = saleCommissionRecords.reduce((sum: number, record: any) => sum + this.toNumber(record.amount), 0);
    const unassignedCommission = unassignedCommissionRecords.map(serializeCommissionRecord);
    const unassignedCommissionCost = unassignedCommission.reduce((sum: number, record: any) => sum + this.toNumber(record.amount), 0);
    const totalCost = saleCommissionCost + unassignedCommissionCost;
    const recognizedRatio = netSalesAmount > 0 ? Math.min(1, Math.max(0, recognizedAmount / netSalesAmount)) : 0;
    const recognizedCommissionCost = this.round(totalCost * recognizedRatio);
    const recognizedGrossProfit = recognizedAmount - recognizedCommissionCost;
    const salesContribution = netSalesAmount - totalCost;
    const usageRecords = item.usageRecords.map((record: any) => {
      const usageId = this.toNumber(record.id);
      const times = this.toNumber(record.times) || 1;
      const usageRecognizedAmount = this.toNumber(record.recognizedAmount);
      const projectId = this.toNumber(record.projectId) || undefined;
      const itemBomItems = projectId ? usageBomByProjectId.get(projectId) ?? [] : [];
      const materialMovements = materialMovementsByUsageId.get(usageId) ?? [];
      const actualMaterialCost = materialMovements.reduce((sum: number, movement: any) => (
        sum + Math.abs(this.toNumber(movement.quantity)) * this.toNumber(movement.product?.costPrice)
      ), 0);
      const standardMaterialCost = itemBomItems.reduce((sum: number, bomItem: any) => {
        const quantity = this.toNumber(bomItem.standardQty) * times;
        return sum + quantity * this.toNumber(bomItem.product?.costPrice);
      }, 0);
      const materialCost = actualMaterialCost > 0 ? actualMaterialCost : standardMaterialCost;
      const commissionCost = (record.commissionRecords ?? []).reduce((sum: number, commission: any) => sum + this.toNumber(commission.amount), 0);
      const projectCost = materialCost + commissionCost;
      const projectGrossProfit = usageRecognizedAmount - projectCost;
      const recordMissingReasons = new Set<string>();
      if (!projectId) recordMissingReasons.add('项目档案缺失');
      if (actualMaterialCost <= 0 && standardMaterialCost <= 0) recordMissingReasons.add('项目耗材成本缺失');
      if (usageRecognizedAmount > 0 && commissionCost <= 0) recordMissingReasons.add('项目提成记录缺失');

      return {
        id: record.id,
        projectId,
        projectName: record.project?.name ?? record.projectName,
        times,
        recognizedUnitValue: this.round(this.toNumber(record.recognizedUnitValue)),
        recognizedAmount: this.round(usageRecognizedAmount),
        remainingTimes: this.toNumber(record.remainingTimes),
        verifiedAt: record.verifiedAt,
        standardMaterialCost: this.round(standardMaterialCost),
        actualMaterialCost: this.round(actualMaterialCost),
        materialCost: this.round(materialCost),
        materialCostSource: actualMaterialCost > 0 ? 'actual_stock_movement' : standardMaterialCost > 0 ? 'standard_bom' : 'missing',
        commissionCost: this.round(commissionCost),
        projectCost: this.round(projectCost),
        projectGrossProfit: this.round(projectGrossProfit),
        projectGrossMargin: usageRecognizedAmount > 0 ? this.round(projectGrossProfit / usageRecognizedAmount, 4) : 0,
        missingReasons: Array.from(recordMissingReasons),
        materialMovements: materialMovements.map((movement: any) => {
          const quantity = Math.abs(this.toNumber(movement.quantity));
          const costPrice = this.toNumber(movement.product?.costPrice);
          return {
            id: movement.id,
            productId: movement.productId,
            productName: movement.product?.name ?? `商品#${movement.productId}`,
            quantity: this.round(quantity, 4),
            unit: movement.unit ?? movement.product?.specUnit ?? movement.product?.unit,
            costPrice: this.round(costPrice),
            costAmount: this.round(quantity * costPrice),
            occurredAt: movement.occurredAt,
            remark: movement.remark,
          };
        }),
        commissionRecords: (record.commissionRecords ?? []).map(serializeCommissionRecord),
      };
    });
    const missingReasons = new Set<string>();
    if (!item.sourceOrderId) missingReasons.add('来源订单缺失');
    if (!item.sourceOrderItemId) missingReasons.add('来源订单行缺失');
    if (paidAmount > 0 && saleCommissionCost <= 0 && unassignedCommissionCost <= 0) missingReasons.add('开卡提成记录缺失');
    if (usageRecords.some((record: any) => record.missingReasons.length)) missingReasons.add('存在核销项目成本或提成缺口');

    return {
      customerCardId: item.id,
      sourceOrderId: item.sourceOrderId,
      sourceOrderNo: item.sourceOrder?.orderNo,
      customerId: item.customerId,
      customerName: item.customer?.name ?? '',
      customerPhone: item.customer?.phone ?? '',
      storeId: item.sourceOrder?.storeId,
      storeName: item.sourceOrder?.store?.name ?? '',
      cardId: item.cardId,
      cardName: item.cardName,
      status: item.status,
      totalTimes: item.totalTimes,
      remainingTimes: item.remainingTimes,
      paymentMethod: item.sourceOrder?.payMethod ?? item.sourceOrder?.paymentRecords?.[0]?.method,
      purchaseTime: item.createdAt,
      expireTime: item.expiryDate,
      listAmount: this.round(listAmount),
      discountAmount: this.round(discountAmount),
      paidAmount: this.round(paidAmount),
      refundAmount: this.round(refundAmount),
      netSalesAmount: this.round(netSalesAmount),
      recognizedAmount: this.round(recognizedAmount),
      remainingLiability: this.round(remainingLiability),
      saleCommissionCost: this.round(saleCommissionCost),
      unassignedCommissionCost: this.round(unassignedCommissionCost),
      totalCost: this.round(totalCost),
      recognizedCommissionCost,
      recognizedGrossProfit: this.round(recognizedGrossProfit),
      recognizedGrossMargin: recognizedAmount > 0 ? this.round(recognizedGrossProfit / recognizedAmount, 4) : 0,
      salesContribution: this.round(salesContribution),
      grossProfit: this.round(recognizedGrossProfit),
      grossMargin: recognizedAmount > 0 ? this.round(recognizedGrossProfit / recognizedAmount, 4) : 0,
      dataQuality: missingReasons.size > 0 ? 'partial' : 'complete',
      missingReasons: Array.from(missingReasons),
      saleCommissionRecords,
      unassignedCommissionRecords: unassignedCommission,
      usageRecords,
    };
  }

  async findCardUsageProfit(id: number) {
    const record = await this.prisma.cardUsageRecord.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        customerCard: { select: { id: true, cardName: true, totalTimes: true, remainingTimes: true, status: true } },
        card: { select: { id: true, name: true, price: true, totalTimes: true } },
        project: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        sourceOrder: { select: { id: true, orderNo: true, store: { select: { id: true, name: true } } } },
        operator: { select: { id: true, name: true, username: true } },
        beautician: { select: { id: true, name: true } },
        commissionRecords: {
          where: { status: { not: 'cancelled' } },
          include: {
            staffUser: { select: { id: true, name: true, username: true } },
            beautician: { select: { id: true, name: true } },
            rule: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!record) throw new NotFoundException('次卡核销记录不存在');

    const serializeCommissionRecord = (commission: any) => ({
      id: commission.id,
      staffUserId: commission.staffUserId,
      staffUserName: commission.staffUser?.name ?? commission.staffUser?.username ?? commission.beautician?.name ?? '未关联员工',
      beauticianId: commission.beauticianId,
      beauticianName: commission.beautician?.name,
      ruleId: commission.ruleId,
      ruleName: commission.rule?.name,
      sourceAmount: this.round(this.toNumber(commission.sourceAmount)),
      rate: this.round(this.toNumber(commission.rate), 4),
      amount: this.round(this.toNumber(commission.amount)),
      status: commission.status,
      settleMonth: commission.settleMonth,
    });

    const projectId = this.toNumber(record.projectId) || undefined;
    const [bomItems, materialMovements] = await Promise.all([
      projectId
        ? this.prisma.projectBomItem.findMany({
            where: { projectId },
            include: { product: { select: { id: true, name: true, unit: true, specUnit: true, costPrice: true } } },
          })
        : Promise.resolve([]),
      this.prisma.stockMovement.findMany({
        where: {
          sourceType: 'card_usage',
          sourceId: id,
          movementType: { in: ['service_consume', 'service_consumption'] },
        },
        include: { product: { select: { id: true, name: true, unit: true, specUnit: true, costPrice: true } } },
        orderBy: { occurredAt: 'asc' },
      }),
    ]);

    const times = this.toNumber(record.times) || 1;
    const recognizedAmount = this.toNumber(record.recognizedAmount) > 0
      ? this.toNumber(record.recognizedAmount)
      : this.toNumber(record.recognizedUnitValue) * times;
    const actualMaterialCost = (materialMovements as any[]).reduce((sum: number, movement: any) => (
      sum + Math.abs(this.toNumber(movement.quantity)) * this.toNumber(movement.product?.costPrice)
    ), 0);
    const standardMaterialCost = (bomItems as any[]).reduce((sum: number, bomItem: any) => {
      const quantity = this.toNumber(bomItem.standardQty) * times;
      return sum + quantity * this.toNumber(bomItem.product?.costPrice);
    }, 0);
    const materialCost = actualMaterialCost > 0 ? actualMaterialCost : standardMaterialCost;
    const commissionRecords = (record.commissionRecords ?? []).map(serializeCommissionRecord);
    const commissionCost = commissionRecords.reduce((sum: number, commission: any) => sum + this.toNumber(commission.amount), 0);
    const projectCost = materialCost + commissionCost;
    const projectGrossProfit = recognizedAmount - projectCost;
    const missingReasons = new Set<string>();
    if (!projectId) missingReasons.add('项目档案缺失');
    if (actualMaterialCost <= 0 && standardMaterialCost <= 0) missingReasons.add('项目耗材成本缺失');
    if (recognizedAmount > 0 && commissionCost <= 0) missingReasons.add('项目提成记录缺失');

    return {
      id: record.id,
      customerCardId: record.customerCardId,
      sourceOrderId: record.sourceOrderId,
      sourceOrderNo: record.sourceOrder?.orderNo,
      customerId: record.customerId,
      customerName: record.customer?.name ?? record.customerName,
      customerPhone: record.customer?.phone ?? '',
      storeId: record.storeId ?? record.sourceOrder?.store?.id,
      storeName: record.store?.name ?? record.sourceOrder?.store?.name ?? '',
      cardId: record.cardId,
      cardName: record.customerCard?.cardName ?? record.card?.name ?? record.cardName,
      cardStatus: record.customerCard?.status,
      projectId,
      projectName: record.project?.name ?? record.projectName,
      times,
      remainingTimes: this.toNumber(record.remainingTimes),
      recognizedUnitValue: this.round(this.toNumber(record.recognizedUnitValue)),
      recognizedAmount: this.round(recognizedAmount),
      verifiedAt: record.verifiedAt,
      operatorId: record.operatorId,
      operatorName: record.operator?.name ?? record.operator?.username ?? '',
      beauticianId: record.beauticianId,
      beauticianName: record.beautician?.name ?? '',
      standardMaterialCost: this.round(standardMaterialCost),
      actualMaterialCost: this.round(actualMaterialCost),
      materialCost: this.round(materialCost),
      materialCostSource: actualMaterialCost > 0 ? 'actual_stock_movement' : standardMaterialCost > 0 ? 'standard_bom' : 'missing',
      commissionCost: this.round(commissionCost),
      projectCost: this.round(projectCost),
      projectGrossProfit: this.round(projectGrossProfit),
      projectGrossMargin: recognizedAmount > 0 ? this.round(projectGrossProfit / recognizedAmount, 4) : 0,
      dataQuality: missingReasons.size > 0 ? 'partial' : 'complete',
      missingReasons: Array.from(missingReasons),
      materialMovements: (materialMovements as any[]).map((movement: any) => {
        const quantity = Math.abs(this.toNumber(movement.quantity));
        const costPrice = this.toNumber(movement.product?.costPrice);
        return {
          id: movement.id,
          productId: movement.productId,
          productName: movement.product?.name ?? `商品#${movement.productId}`,
          quantity: this.round(quantity, 4),
          unit: movement.unit ?? movement.product?.specUnit ?? movement.product?.unit,
          costPrice: this.round(costPrice),
          costAmount: this.round(quantity * costPrice),
          occurredAt: movement.occurredAt,
          remark: movement.remark,
        };
      }),
      commissionRecords,
    };
  }

  // Card usage records
  async findCardUsageRecordsPaginated(query: {
    page?: number;
    pageSize?: number;
    customerId?: number;
    cardName?: string;
    userName?: string;
    projectName?: string;
  }) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 10);
    const customerId = query.customerId ? Number(query.customerId) : undefined;
    const cardName = String(query.cardName ?? '').trim();
    const userName = String(query.userName ?? '').trim();
    const projectName = String(query.projectName ?? '').trim();
    const where: any = {};
    if (customerId) where.customerId = customerId;
    if (cardName) where.cardName = { contains: cardName, mode: 'insensitive' };
    if (projectName) where.projectName = { contains: projectName, mode: 'insensitive' };
    if (userName) {
      where.OR = [
        { customerName: { contains: userName, mode: 'insensitive' } },
        { customer: { name: { contains: userName, mode: 'insensitive' } } },
        { customer: { phone: { contains: userName, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.cardUsageRecord.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              store: { select: { id: true, name: true } },
              customerCards: {
                orderBy: { createdAt: 'desc' },
                select: {
                  id: true,
                  cardName: true,
                  totalTimes: true,
                  remainingTimes: true,
                  expiryDate: true,
                  status: true,
                  createdAt: true,
                  card: { select: { id: true, price: true, totalTimes: true, projects: true } },
                },
              },
            },
          },
          operator: { select: { id: true, name: true, username: true } },
          beautician: { select: { id: true, name: true } },
          device: { select: { id: true, name: true, deviceCode: true, model: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { verifiedAt: 'desc' },
      }),
      this.prisma.cardUsageRecord.count({ where }),
    ]);
    const mapped = items.map((item: any) => {
      const matchedCard =
        item.customer?.customerCards?.find((card: any) => card.cardName === item.cardName) ??
        item.customer?.customerCards?.[0];
      const cardPrice = Number(matchedCard?.card?.price ?? 0);
      const cardTotalTimes = Number(matchedCard?.card?.totalTimes ?? matchedCard?.totalTimes ?? 0);
      const unitValue = cardTotalTimes > 0 ? Math.round((cardPrice / cardTotalTimes) * 100) / 100 : 0;
      const times = Number(item.times ?? 0);
      const remainingTimes = Number(item.remainingTimes ?? matchedCard?.remainingTimes ?? 0);
      const beforeRemainingTimes = remainingTimes + times;

      return {
        id: item.id,
        customerId: item.customerId,
        customerName: item.customer?.name ?? item.customerName,
        userName: item.customer?.name ?? item.customerName,
        customerPhone: item.customer?.phone ?? '',
        storeId: item.customer?.store?.id,
        storeName: item.customer?.store?.name ?? '未关联门店',
        customerCardId: matchedCard?.id,
        cardId: matchedCard?.card?.id,
        cardName: item.cardName,
        cardStatus: matchedCard?.status ?? 'unknown',
        cardTotalTimes: Number(matchedCard?.totalTimes ?? cardTotalTimes),
        totalTimes: Number(matchedCard?.totalTimes ?? cardTotalTimes),
        cardRemainingTimes: Number(matchedCard?.remainingTimes ?? remainingTimes),
        remainingTimes,
        beforeRemainingTimes,
        projectName: item.projectName,
        times,
        usedTimes: times,
        consumedTimes: times,
        cardPrice,
        unitValue,
        consumedValue: Math.round(unitValue * times * 100) / 100,
        expiryDate: matchedCard?.expiryDate,
        openedAt: matchedCard?.createdAt,
        verifiedAt: item.verifiedAt,
        usageTime: item.verifiedAt,
        operatorId: item.operatorId,
        operatorName: item.operator?.name ?? item.operator?.username ?? '',
        beauticianId: item.beauticianId,
        beauticianName: item.operator?.name ?? item.operator?.username ?? item.beautician?.name ?? '',
        operationPermission: item.operator?.name ?? item.operator?.username ?? item.beautician?.name ?? '',
        deviceId: item.deviceId,
        deviceName: item.device?.name ?? '',
        deviceCode: item.device?.deviceCode ?? '',
        deviceModel: item.device?.model ?? '',
        orderTime: matchedCard?.createdAt,
      };
    });
    return { items: mapped, data: mapped, total, page, pageSize };
  }
}
