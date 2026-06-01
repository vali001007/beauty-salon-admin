import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

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
      次卡抵扣: 'customer_card',
      cash: 'cash',
      wechat: 'wechat',
      alipay: 'alipay',
      card: 'card',
      bank_card: 'card',
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
        payload: item,
      };
    });
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

  async findProductOrders(query: { page?: number; pageSize?: number; keyword?: string; status?: string; storeId?: number | string }) {
    const { page = 1, pageSize = 20, keyword, status, storeId } = query;
    const where: any = {};
    if (status) {
      const normalizedStatus = this.normalizeOrderStatus(status);
      where.status = normalizedStatus === status ? status : { in: [normalizedStatus, status] };
    }
    const normalizedStoreId = this.toNumber(storeId);
    if (normalizedStoreId > 0) where.storeId = normalizedStoreId;
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
            payload: item.payload,
          })),
        });
      }

      if (['completed', 'paid'].includes(status)) {
        await tx.paymentRecord.create({
          data: {
            orderId: order.id,
            paymentNo: this.createPaymentNo(),
            method: payMethod,
            amount: this.toNumber(data.paidAmount ?? totalAmount),
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

      if (['completed', 'paid'].includes(String(data.status))) {
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
          items: [{ itemType: 'recharge', quantity: 1, unitPrice: rechargeAmount, giftAmount }],
          remark: data.remark ?? (type === 'open' ? '会员开卡' : '会员充值'),
        },
      });

      await tx.orderItem.create({
        data: {
          orderId: order.id,
          itemType: 'recharge',
          name: type === 'open' ? '会员开卡' : '会员充值',
          quantity: 1,
          unitPrice: rechargeAmount,
          subtotal: rechargeAmount,
          discount: 0,
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
          customer: { select: { name: true } },
          card: { select: { price: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customerCard.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  // Card usage records
  async findCardUsageRecordsPaginated(query: { page?: number; pageSize?: number; customerId?: number }) {
    const { page = 1, pageSize = 20, customerId } = query;
    const where: any = {};
    if (customerId) where.customerId = customerId;

    const [items, total] = await Promise.all([
      this.prisma.cardUsageRecord.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { verifiedAt: 'desc' },
      }),
      this.prisma.cardUsageRecord.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }
}
