import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CommissionService } from '../commission/commission.service.js';

@Injectable()
export class OrdersService {
  private readonly MARKETING_PAGE_ATTRIBUTION_WINDOW_DAYS = 30;

  constructor(
    private prisma: PrismaService,
    private commissionService: CommissionService,
  ) {}

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
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
      const discount = this.toNumber(item.discount);
      const subtotal = this.toNumber(item.subtotal ?? quantity * unitPrice - discount);
      const itemType = String(item.itemType ?? item.type ?? 'product');
      const itemId = item.itemId ?? item.productId ?? item.projectId ?? item.cardId;
      return {
        itemType,
        itemId: itemId === undefined || itemId === null ? undefined : Number(itemId),
        name: String(item.name ?? item.productName ?? item.projectName ?? `${itemType}#${itemId ?? ''}`),
        quantity,
        unitPrice,
        subtotal,
        discount,
        beauticianId: this.toNumber(item.beauticianId) || undefined,
        payload: item,
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
    return {
      id: item.id ?? index + 1,
      itemId: item.itemId ?? item.productId ?? item.projectId ?? item.cardId,
      itemType: item.itemType ?? item.type ?? 'product',
      productName: item.productName ?? item.name ?? item.projectName ?? item.cardName ?? '未命名商品',
      sku: item.sku ?? '',
      quantity,
      unitPrice,
      subtotal,
      discount: this.toNumber(item.discount),
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
      paymentMethod: order.payMethod ?? payment?.method ?? 'cash',
      payMethod: order.payMethod ?? payment?.method,
      createdAt: order.createdAt,
      completedAt: payment?.paidAt ?? undefined,
    };
  }

  private async calculateOrderCommissionIfNeeded(tx: any, order: any, data: any) {
    const beauticianId = this.toNumber(data.beauticianId);
    const storeId = this.toNumber(order.storeId ?? data.storeId);
    if (!beauticianId || !storeId || !['completed', 'paid'].includes(String(order.status))) return;

    try {
      const [beautician, orderItems] = await Promise.all([
        tx.beautician.findUnique({ where: { id: beauticianId }, select: { id: true, levelId: true } }),
        tx.orderItem.findMany({ where: { orderId: order.id } }),
      ]);
      if (!beautician) return;

      await this.commissionService.calculateOrderCommissions(
        {
          storeId,
          orderId: order.id,
          beauticianId,
          levelId: this.toNumber(data.levelId) || beautician.levelId || undefined,
          isDesignated: Boolean(data.isDesignated),
          items: orderItems.map((item: any) => ({
            itemType: item.itemType,
            itemId: item.itemId,
            beauticianId: item.beauticianId,
            subtotal: this.toNumber(item.subtotal),
            orderItemId: item.id,
          })),
        },
        tx,
      );
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
          orderItems: true,
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
        orderItems: true,
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
        orderItems: true,
        paymentRecords: true,
        refundRecords: true,
        marketingAttributions: true,
        recommendationEvents: true,
      },
    });
    if (!order) throw new NotFoundException('项目订单不存在');
    return this.serializeProductOrder(order);
  }

  async createProductOrder(data: any) {
    const orderNo = `PO${Date.now()}`;
    const items = this.normalizeOrderItems(Array.isArray(data.items) ? data.items : []);
    const totalAmount = this.toNumber(data.totalAmount ?? items.reduce((sum, item) => sum + item.subtotal, 0));
    const status = this.normalizeOrderStatus(data.status);
    const payMethod = this.normalizePaymentMethod(data.payMethod ?? data.paymentMethod);

    return this.prisma.$transaction(async (tx) => {
      const customer = await this.resolveOrderCustomer(tx, data);
      const order = await tx.productOrder.create({
        data: {
          orderNo,
          customerId: customer?.id,
          customerName: data.customerName ?? customer?.name,
          storeId: data.storeId ? Number(data.storeId) : undefined,
          totalAmount,
          status,
          payMethod,
          source: data.source ?? 'admin',
          items: Array.isArray(data.items) ? data.items : [],
          remark: data.remark,
        },
      });

      if (items.length) {
        await tx.orderItem.createMany({
          data: items.map((item) => ({
            orderId: order.id,
            itemType: item.itemType,
            itemId: item.itemId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            discount: item.discount,
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

          await this.consumeProductItemsForOrder(tx, order, items, data.remark);
          await this.consumeProjectBomForOrder(tx, order, items, data.remark);

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
          orderItems: true,
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

      if (items) {
        await tx.orderItem.deleteMany({ where: { orderId: id } });
        if (items.length) {
          await tx.orderItem.createMany({
            data: items.map((item) => ({
              orderId: id,
              itemType: item.itemType,
              itemId: item.itemId,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.subtotal,
              discount: item.discount,
              payload: item.payload,
            })),
          });
        }
      }

      if (this.isPaidLikeStatus(this.normalizeOrderStatus(data.status ?? order.status))) {
        const orderItemsForConsumption = items ?? (await tx.orderItem.findMany({ where: { orderId: id } }));
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
        include: { orderItems: true, paymentRecords: true, refundRecords: true, marketingAttributions: true },
      });
    });
  }

  async refundOrder(id: number, reasonOrDto?: string | { reason?: string; amount?: number }) {
    const order = await this.findProductOrderById(id);
    const reason = typeof reasonOrDto === 'string' ? reasonOrDto : reasonOrDto?.reason;
    const amount = typeof reasonOrDto === 'object' ? this.toNumber(reasonOrDto.amount ?? order.totalAmount) : this.toNumber(order.totalAmount);

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
        include: { orderItems: true, paymentRecords: true, refundRecords: true, marketingAttributions: true },
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
          transactions: { orderBy: { createdAt: 'desc' } },
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

  async openMemberCard(data: any) {
    return this.createMemberCardRecharge(data, 'open');
  }

  async rechargeMemberCard(id: number, data: any) {
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
          subtotal: rechargeAmount,
          discount: 0,
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
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });
    return this.serializeMemberCardAccount(account);
  }

  async giftMemberCard(id: number, data: any) {
    const giftAmount = this.toNumber(data.giftAmount);
    if (giftAmount <= 0) throw new BadRequestException('赠送金额必须大于 0');
    return this.adjustMemberCardBalance(id, { amount: 0, giftAmount, type: 'gift', remark: data.remark });
  }

  async deductMemberCard(id: number, data: any) {
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
    });
  }

  private async adjustMemberCardBalance(
    id: number,
    data: { amount: number; giftAmount: number; type: 'gift' | 'deduct'; remark?: string },
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
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });
    return this.serializeMemberCardAccount(account);
  }

  async findMemberCardTransactions(accountId: number) {
    const account = await this.prisma.customerBalanceAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('会员卡不存在');
    const items = await this.prisma.customerBalanceTransaction.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((item) => this.serializeMemberCardTransaction(item));
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
        beauticianId: item.beauticianId,
        beauticianName: item.beautician?.name ?? '未记录',
        operationPermission: item.beautician?.name ?? '未记录',
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
