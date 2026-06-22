import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CommissionService } from '../commission/commission.service.js';
import { DiscountAllocationService, type DiscountAllocationInput } from './discount-allocation.service.js';

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

  private round(value: number, precision = 2): number {
    const factor = 10 ** precision;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
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

  private isProductOrderItemType(itemType?: string) {
    return ['product', 'goods'].includes(String(itemType ?? '').toLowerCase());
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
      select: { id: true, costPrice: true },
    });
    const costByProductId = new Map(products.map((product: any) => [product.id, this.toNumber(product.costPrice)]));
    const capturedAt = new Date().toISOString();

    return items.map((item) => {
      if (!this.isProductOrderItemType(item.itemType) || !item.itemId) return item;
      const costPrice = this.toNumber(costByProductId.get(Number(item.itemId)));
      const quantity = this.toNumber(item.quantity ?? 1) || 1;
      return {
        ...item,
        payload: {
          ...(item.payload && typeof item.payload === 'object' ? item.payload : {}),
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

  private async createProjectBomStockMovement(
    tx: any,
    params: {
      storeId: number;
      productId: number;
      quantity: number;
      order: { id: number; orderNo?: string | null };
      projectName?: string;
      remark?: string;
    },
  ) {
    if (!params.storeId || !params.productId || params.quantity <= 0) return;
    const product = await tx.product.findFirst({
      where: { id: params.productId, storeId: params.storeId, deletedAt: null },
    });
    if (!product) return;

    const beforeStock = this.toNumber(product.currentStock);
    const afterStock = beforeStock - params.quantity;

    await tx.product.update({
      where: { id: product.id },
      data: { currentStock: { decrement: params.quantity } },
    });

    await tx.stockMovement.create({
      data: {
        storeId: params.storeId,
        productId: product.id,
        movementNo: this.createStockMovementNo('SM'),
        movementType: 'service_consume',
        quantity: -params.quantity,
        beforeStock,
        afterStock,
        unit: product.unit,
        sourceType: 'project_order',
        sourceId: params.order.id,
        sourceNo: params.order.orderNo,
        remark: params.remark ?? (params.projectName ? `项目订单自动扣耗材：${params.projectName}` : '项目订单自动扣耗材'),
      },
    });
  }

  private async createProductOrderStockMovement(
    tx: any,
    params: {
      storeId: number;
      productId: number;
      quantity: number;
      order: { id: number; orderNo?: string | null };
      remark?: string;
    },
  ) {
    if (!params.storeId || !params.productId || params.quantity <= 0) return;
    const product = await tx.product.findFirst({
      where: { id: params.productId, storeId: params.storeId, deletedAt: null },
    });
    if (!product) return;

    const beforeStock = this.toNumber(product.currentStock);
    const afterStock = beforeStock - params.quantity;

    await tx.product.update({
      where: { id: product.id },
      data: { currentStock: { decrement: params.quantity } },
    });

    await tx.stockMovement.create({
      data: {
        storeId: params.storeId,
        productId: product.id,
        movementNo: this.createStockMovementNo('SM'),
        movementType: 'sale_out',
        quantity: -params.quantity,
        beforeStock,
        afterStock,
        unit: product.unit,
        sourceType: 'product_order',
        sourceId: params.order.id,
        sourceNo: params.order.orderNo,
        remark: params.remark ?? '商品订单自动扣库存',
      },
    });
  }

  private async consumeProductItemsForOrder(
    tx: any,
    order: { id: number; orderNo?: string | null; storeId?: number | null },
    items: Array<{ itemType?: string; itemId?: number | null; productId?: number | null; quantity?: unknown }>,
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

    for (const item of productItems) {
      await this.createProductOrderStockMovement(tx, {
        storeId,
        productId: Number(item.itemId ?? item.productId),
        quantity: this.toNumber(item.quantity ?? 1) || 1,
        order,
        remark,
      });
    }
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

    for (const item of projectItems) {
      const multiplier = this.toNumber(item.quantity ?? 1) || 1;
      for (const bomItem of bomByProject.get(Number(item.itemId)) ?? []) {
        await this.createProjectBomStockMovement(tx, {
          storeId,
          productId: bomItem.productId,
          quantity: this.toNumber(bomItem.standardQty) * multiplier,
          order,
          projectName: item.name,
          remark,
        });
      }
    }
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

  private serializeProductOrder(order: any) {
    const rawItems = Array.isArray(order.orderItems) && order.orderItems.length
      ? order.orderItems
      : Array.isArray(order.items)
        ? order.items
        : [];
    const payment = Array.isArray(order.paymentRecords) ? order.paymentRecords[0] : undefined;
    return {
      ...order,
      customerId: order.customerId ?? order.customer?.id,
      customerName: order.customerName ?? order.customer?.name ?? '散客',
      customerPhone: order.customer?.phone ?? '',
      storeId: order.storeId ?? order.store?.id,
      storeName: order.store?.name ?? '',
      items: rawItems.map((item: any, index: number) => this.toProductOrderItem(item, index)),
      totalAmount: this.toNumber(order.totalAmount),
      listAmount: this.toNumber(order.listAmount || order.totalAmount),
      itemDiscountAmount: this.toNumber(order.itemDiscountAmount),
      orderDiscountAmount: this.toNumber(order.orderDiscountAmount),
      totalDiscountAmount: this.toNumber(order.totalDiscountAmount),
      netAmount: this.toNumber(order.netAmount || order.totalAmount),
      discountSource: order.discountSource,
      allocationMethod: order.allocationMethod,
      promotionId: order.promotionId,
      couponId: order.couponId,
      packageId: order.packageId,
      discountPayload: order.discountPayload,
      paymentMethod: order.payMethod ?? payment?.method ?? 'cash',
      payMethod: order.payMethod ?? payment?.method,
      createdAt: order.createdAt,
      completedAt: payment?.paidAt ?? undefined,
    };
  }

  private async calculateOrderCommissionIfNeeded(tx: any, order: any, data: any) {
    const storeId = this.toNumber(order.storeId ?? data.storeId);
    if (!storeId || !['completed', 'paid'].includes(String(order.status))) return;

    try {
      if (typeof tx.orderItem?.findMany !== 'function') return;
      const orderItems = await tx.orderItem.findMany({ where: { orderId: order.id } });
      const fallbackBeauticianId = this.toNumber(data.beauticianId) || undefined;
      const beauticianIds = [
        ...new Set(
          orderItems
            .map((item: any) => this.toNumber(item.beauticianId) || fallbackBeauticianId)
            .filter((item: number | undefined): item is number => Boolean(item)),
        ),
      ];
      if (!beauticianIds.length) return;

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

      for (const item of orderItems) {
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
    const availableTotal = cashBalanceBefore + giftBalanceBefore;
    if (amount > availableTotal) throw new BadRequestException('会员卡余额不足');

    const giftDeduct = Math.min(giftBalanceBefore, amount);
    const cashDeduct = amount - giftDeduct;
    const cashBalanceAfter = cashBalanceBefore - cashDeduct;
    const giftBalanceAfter = giftBalanceBefore - giftDeduct;

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
        type: 'deduct',
        amount: cashDeduct,
        giftAmount: giftDeduct,
        cashBalanceBefore,
        cashBalanceAfter,
        giftBalanceBefore,
        giftBalanceAfter,
        paymentMethod: 'member_balance',
        remark: remark || `订单 ${order.orderNo} 会员卡划扣`,
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
          marketingAttributions: true,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.productOrder.count({ where }),
    ]);

    const normalizedItems = items.map((item) => this.serializeProductOrder(item));
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
        marketingAttributions: true,
        recommendationEvents: true,
      },
    });
    if (!order) throw new NotFoundException('订单不存在');
    return this.serializeProductOrder(order);
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
        marketingAttributions: true,
        recommendationEvents: true,
      },
    });
    if (!order) throw new NotFoundException('项目订单不存在');
    return this.serializeProductOrder(order);
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
            include: { product: { select: { id: true, name: true, unit: true, costPrice: true } } },
          })
        : Promise.resolve([]),
      this.prisma.stockMovement.findMany({
        where: { sourceType: 'project_order', sourceId: order.id, movementType: { in: ['service_consume', 'service_consumption'] } },
        include: { product: { select: { id: true, name: true, unit: true, costPrice: true } } },
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
          unit: bomItem.unit ?? bomItem.product?.unit,
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
        unit: movement.unit ?? movement.product?.unit,
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
    const orderNo = `PO${Date.now()}`;
    const normalizedInputItems = this.normalizeOrderItems(Array.isArray(data.items) ? data.items : []);
    const allocation = this.discountAllocationService.allocate(this.buildDiscountAllocationInput(data, normalizedInputItems));
    const items = allocation.items;
    const totalAmount = allocation.order.netAmount;
    const status = this.normalizeOrderStatus(data.status);
    const payMethod = this.normalizePaymentMethod(data.payMethod ?? data.paymentMethod);

    return this.prisma.$transaction(async (tx) => {
      const customer = await this.resolveOrderCustomer(tx, data);
      const storeId = data.storeId ? Number(data.storeId) : undefined;
      const orderItems = await this.attachProductCostSnapshots(tx, storeId, items);
      const order = await tx.productOrder.create({
        data: {
          orderNo,
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
          items: this.toJson(items),
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
          if (payMethod === 'member_balance') {
            await this.deductMemberBalanceForOrder(tx, order, paidAmount, data.remark);
          }

          await this.consumeProductItemsForOrder(tx, order, orderItems, data.remark);
          await this.consumeProjectBomForOrder(tx, order, orderItems, data.remark);

          await tx.paymentRecord.create({
            data: {
              orderId: order.id,
              paymentNo: this.createPaymentNo(),
              method: payMethod,
              amount: paidAmount,
            status: 'success',
            transactionNo: data.transactionNo,
            paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
          },
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
          marketingAttributions: true,
        },
      }).then((createdOrder) => this.serializeProductOrder(createdOrder));
    });
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
    const amount = typeof reasonOrDto === 'object' ? this.toNumber(reasonOrDto.amount ?? refundableAmount) : refundableAmount;
    if (amount > refundableAmount) throw new BadRequestException('退款金额不能大于订单实收金额');

    return this.prisma.$transaction(async (tx) => {
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
      await this.reverseMarketingAttribution(tx, id, amount);
      await this.commissionService.reverseOrderCommissions(id, amount, tx);

      return tx.productOrder.findUnique({
        where: { id },
        include: { orderItems: { include: this.orderItemInclude }, paymentRecords: true, refundRecords: true, marketingAttributions: true },
      });
    });
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
    const openTransaction = transactions.find((item: any) => String(item.type) === 'open');
    const handler = openTransaction?.operator;

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
      orderNo: transaction.order?.orderNo ?? '',
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
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.customerBalanceTransaction.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          store: { select: { id: true, name: true } },
          order: { select: { id: true, orderNo: true } },
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
            include: { operator: { select: { id: true, name: true, username: true } } },
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

  private async createMemberCardRecharge(data: any, type: 'open' | 'recharge') {
    const customerId = this.toNumber(data.customerId);
    const storeId = this.toNumber(data.storeId);
    const rechargeAmount = this.toNumber(data.rechargeAmount ?? data.amount);
    const giftAmount = this.toNumber(data.giftAmount);
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
          customerId,
          customerName: customer.name,
          storeId,
          totalAmount: rechargeAmount,
          listAmount: rechargeAmount,
          netAmount: rechargeAmount,
          discountSource: 'none',
          allocationMethod: 'none',
          discountPayload: { giftAmount },
          status: 'completed',
          payMethod: this.normalizePaymentMethod(data.paymentMethod),
          source: data.source ?? 'admin',
          items: [{ itemType: 'recharge', quantity: 1, unitPrice: rechargeAmount, giftAmount }],
          remark: data.remark ?? (type === 'open' ? '会员开卡' : '会员充值'),
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
          payload: { giftAmount, remark: data.remark },
        },
      });

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

      await tx.customerBalanceTransaction.create({
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
          remark: data.remark,
        },
      });

      await this.applyMarketingAttribution(tx, order, rechargeAmount);
      await this.applyMarketingPageAttribution(tx, order, rechargeAmount);
      return updatedAccount;
    });

    const account = await this.prisma.customerBalanceAccount.findUnique({
      where: { id: result.id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
        transactions: {
          include: { operator: { select: { id: true, name: true, username: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    return this.serializeMemberCardAccount(account);
  }

  async giftMemberCard(id: number, data: any, operatorId?: number) {
    const giftAmount = this.toNumber(data.giftAmount);
    if (giftAmount <= 0) throw new BadRequestException('赠送金额必须大于 0');
    return this.adjustMemberCardBalance(id, { amount: 0, giftAmount, type: 'gift', remark: data.remark, operatorId });
  }

  async deductMemberCard(id: number, data: any, operatorId?: number) {
    const deductAmount = this.toNumber(data.amount);
    if (deductAmount <= 0) throw new BadRequestException('划扣金额必须大于 0');

    const account = await this.prisma.customerBalanceAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('会员卡不存在');
    const availableTotal = this.toNumber(account.cashBalance) + this.toNumber(account.giftBalance);
    if (deductAmount > availableTotal) throw new BadRequestException('会员卡余额不足');

    const giftDeduct = Math.min(this.toNumber(account.giftBalance), deductAmount);
    const cashDeduct = deductAmount - giftDeduct;
    return this.adjustMemberCardBalance(id, {
      amount: cashDeduct,
      giftAmount: giftDeduct,
      type: 'deduct',
      remark: data.remark,
      operatorId,
    });
  }

  private async adjustMemberCardBalance(
    id: number,
    data: { amount: number; giftAmount: number; type: 'gift' | 'deduct'; remark?: string; operatorId?: number },
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
        data.type === 'deduct' ? cashBalanceBefore - this.toNumber(data.amount) : cashBalanceBefore;
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
          paymentMethod: data.type === 'deduct' ? 'member_balance' : undefined,
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
          include: { operator: { select: { id: true, name: true, username: true } } },
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
      include: { operator: { select: { id: true, name: true, username: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((item) => this.serializeMemberCardTransaction(item));
  }

  async createCardOrder(storeId: number, data: any, operatorId?: number) {
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

    const amount = Math.max(0, this.toNumber(data.amount ?? data.actualPrice ?? data.cardPrice ?? card.price));
    const discount = Math.max(0, this.toNumber(card.price) - amount);
    const totalTimes = this.toNumber(data.totalTimes ?? card.totalTimes) || this.toNumber(card.totalTimes);
    const expiryDate = data.expiryDate ?? data.expireTime
      ? new Date(data.expiryDate ?? data.expireTime)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const payMethod = this.normalizePaymentMethod(data.paymentMethod ?? data.payMethod ?? 'cash');

    const result = await this.prisma.$transaction(async (tx) => {
      const customerCard = await tx.customerCard.create({
        data: {
          customerId,
          cardId: card.id,
          operatorId: operatorId || undefined,
          cardName: data.cardName ?? card.name,
          totalTimes,
          remainingTimes: this.toNumber(data.remainingTimes ?? totalTimes) || totalTimes,
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
          discountPayload: { cardPrice: this.toNumber(card.price), actualAmount: amount },
          status: 'completed',
          payMethod,
          source: data.source ?? 'admin',
          items: [{ itemType: 'card', itemId: card.id, quantity: 1, unitPrice: amount }],
          remark: data.remark ?? `次卡开卡：${card.name}`,
        },
      });

      await tx.orderItem.create({
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
          discountPayload: { cardPrice: this.toNumber(card.price), actualAmount: amount },
          isGift: false,
          eligibleForOrderDiscount: true,
          beauticianId: this.toNumber(data.beauticianId) || undefined,
          payload: { cardName: card.name, totalTimes, expiryDate: expiryDate.toISOString() },
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
      return { customerCard, order };
    });

    await this.calculateOrderCommissionIfNeeded(this.prisma, result.order, data);
    return {
      id: result.customerCard.id,
      orderId: result.order.id,
      orderNo: result.order.orderNo,
      customerId,
      customerName: customer.name,
      customerPhone: customer.phone ?? '',
      cardId: card.id,
      cardName: card.name,
      storeId,
      storeName: store.name,
      amount,
      totalTimes,
      remainingTimes: result.customerCard.remainingTimes,
      status: result.customerCard.status,
      purchaseTime: result.customerCard.createdAt,
      expireTime: result.customerCard.expiryDate,
      paymentMethod: payMethod,
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

    const mapped = items.map((item: any) => {
      const projects = Array.isArray(item.card?.projects) ? item.card.projects : [];
      return {
        ...item,
        customerId: item.customerId,
        customerName: item.customer?.name ?? '',
        customerPhone: item.customer?.phone ?? '',
        handlerId: item.operatorId ?? item.operator?.id,
        handlerName: item.operator?.name ?? item.operator?.username ?? '',
        cardId: item.cardId,
        customerCardId: item.id,
        totalTimes: item.totalTimes,
        remainingTimes: item.remainingTimes,
        cardProjects: projects
          .map((project: any) => {
            const projectName = String(project.projectName ?? project.name ?? '').trim();
            if (!projectName) return null;
            const totalCount = Number(project.timesPerCard ?? project.totalCount ?? project.times ?? item.totalTimes ?? 0);
            const openedAt = new Date(item.createdAt).getTime();
            const expiredAt = new Date(item.expiryDate).getTime();
            const usedCount = usageRecords
              .filter((record: any) => {
                const verifiedAt = new Date(record.verifiedAt).getTime();
                return (
                  record.customerId === item.customerId &&
                  record.cardName === item.cardName &&
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
          .filter(Boolean),
      };
    });
    return { items: mapped, data: mapped, total, page, pageSize };
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
