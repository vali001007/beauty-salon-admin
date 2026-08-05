import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface FinanceRiskSummary {
  refundAmount: number;
  refundCount: number;
  discountAmount: number;
  grossMarginRate?: number;
  riskItems: string[];
}

export interface FinanceIncomeAnalysis {
  totalCollected: number;
  paymentBreakdown: Array<{ method: string; amount: number; count: number }>;
  dailyTrend: Array<{
    date: string;
    revenue: number;
    orderCount: number;
    customerCount: number;
    avgTransaction: number;
  }>;
  orderKindBreakdown: Array<{ kind: string; amount: number }>;
  largestOrder?: { orderNo: string; amount: number; customerName?: string | null; createdAt: Date };
}

export interface FinanceCostAnalysis {
  revenue: number;
  materialCost: number;
  commissionCost: number;
  operatingCost: number;
  grossProfit: number;
  grossMarginRate?: number;
  operatingProfit: number;
  costIncomeRatio: number;
  storedValueLiability: number;
  unfulfilledCardLiability: number;
  settlementCount: number;
  reconciledSettlementCount: number;
  cashShiftReconciliationRate: number;
  cardLiability: number;
  costCategories: Array<{ category: string; amount: number }>;
}

export interface FinanceCardRecognitionRow {
  usageRecordId: number;
  customerId: number;
  customerCardId: number | null;
  projectId: number | null;
  cardName: string;
  times: number;
  recognizedAmount: number;
  verifiedAt: Date;
}

export type FinanceOrderProfitScope = 'all' | 'product' | 'project' | 'prepaid';

export interface FinanceOrderProfitRow {
  orderId: number;
  orderNo: string;
  orderKind: string;
  businessType: 'product' | 'project' | 'mixed' | 'prepaid' | 'other';
  totalCost: number;
  grossProfit: number;
  negativeMarginFlag: number;
}

export interface FinanceStaffCommissionRow {
  beauticianId: number;
  beauticianName: string;
  commissionType: string;
  amount: number;
}

export interface FinanceMemberBalanceFlowSummary {
  rechargeAmount: number;
  rechargeGiftAmount: number;
  rechargeCount: number;
  consumedAmount: number;
  consumedGiftAmount: number;
  consumedCount: number;
}

export interface FinanceRefundReasonAnalysis {
  refundAmount: number;
  refundCount: number;
  reasons: Array<{ reason: string; amount: number; count: number }>;
  records: Array<{
    refundNo: string;
    orderNo: string;
    customerName?: string | null;
    reason: string;
    amount: number;
    refundedAt: Date;
  }>;
}

export interface FinanceProductMarginRow {
  productId: number;
  productName: string;
  quantity: number;
  netRevenue: number;
  costAmount: number;
  grossProfit: number;
  grossMarginRate?: number;
  belowCostSaleCount: number;
  costCoverageRate: number;
  costSources: string[];
}

export interface FinanceProductMarginAnalysis {
  rows: FinanceProductMarginRow[];
  totalProductCount: number;
  belowCostProductCount: number;
  incompleteCostProductCount: number;
}

@Injectable()
export class BrainFinanceSkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async buildFinanceRiskSummary(input: {
    storeId: number;
    startDate: Date;
    endDate: Date;
  }): Promise<FinanceRiskSummary> {
    const [refunds, orders, settlements] = await Promise.all([
      this.prisma.refundRecord.findMany({
        where: {
          refundedAt: { gte: input.startDate, lte: input.endDate },
          status: { notIn: ['cancelled', 'rejected'] },
          order: { storeId: input.storeId },
        },
        select: { amount: true },
      }),
      this.prisma.productOrder.findMany({
        where: {
          storeId: input.storeId,
          createdAt: { gte: input.startDate, lte: input.endDate },
          status: { notIn: ['cancelled', 'refunded'] },
        },
        select: { totalDiscountAmount: true },
      }),
      this.prisma.dailySettlement.findMany({
        where: {
          storeId: input.storeId,
          settleDate: { gte: input.startDate, lte: input.endDate },
        },
        select: {
          settleDate: true,
          totalRevenue: true,
          grossProfit: true,
          status: true,
          reconciliationStatus: true,
          confirmedAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const refundAmount = refunds.reduce((sum, row) => sum + this.toNumber(row.amount), 0);
    const discountAmount = orders.reduce((sum, row) => sum + this.toNumber(row.totalDiscountAmount), 0);
    const authoritativeSettlements = this.selectAuthoritativeSettlements(settlements);
    const totalRevenue = authoritativeSettlements.reduce((sum, row) => sum + this.toNumber(row.totalRevenue), 0);
    const grossProfit = authoritativeSettlements.reduce((sum, row) => sum + this.toNumber(row.grossProfit), 0);
    const hasSettlementData = authoritativeSettlements.length > 0 && totalRevenue > 0;
    const grossMarginRate = hasSettlementData ? grossProfit / totalRevenue : undefined;
    const riskItems = [
      ...(refundAmount > 0 ? [`退款金额 ${refundAmount.toFixed(2)} 元，需要复核原因。`] : []),
      ...(discountAmount > 0 ? [`优惠金额 ${discountAmount.toFixed(2)} 元，需要确认授权来源。`] : []),
      ...(grossMarginRate !== undefined && grossMarginRate > 0 && grossMarginRate < 0.4
        ? [`毛利率 ${(grossMarginRate * 100).toFixed(1)}%，低于 40% 预警线。`]
        : []),
    ];

    return { refundAmount, refundCount: refunds.length, discountAmount, grossMarginRate, riskItems };
  }

  async buildRefundReasonAnalysis(input: {
    storeId: number;
    startDate: Date;
    endDate: Date;
  }): Promise<FinanceRefundReasonAnalysis> {
    const refunds = await this.prisma.refundRecord.findMany({
      where: {
        refundedAt: { gte: input.startDate, lte: input.endDate },
        status: { notIn: ['cancelled', 'rejected'] },
        order: { storeId: input.storeId },
      },
      select: {
        refundNo: true,
        amount: true,
        reason: true,
        refundedAt: true,
        order: { select: { orderNo: true, customerName: true } },
      },
      orderBy: [{ refundedAt: 'desc' }, { id: 'desc' }],
      take: 1000,
    });
    const reasonMap = new Map<string, { amount: number; count: number }>();
    for (const refund of refunds) {
      const reason = refund.reason?.trim() || '未填写原因';
      const current = reasonMap.get(reason) ?? { amount: 0, count: 0 };
      current.amount += this.toNumber(refund.amount);
      current.count += 1;
      reasonMap.set(reason, current);
    }
    const records = refunds.flatMap((refund) =>
      refund.refundedAt
        ? [
            {
              refundNo: refund.refundNo,
              orderNo: refund.order.orderNo,
              customerName: refund.order.customerName,
              reason: refund.reason?.trim() || '未填写原因',
              amount: this.roundMoney(this.toNumber(refund.amount)),
              refundedAt: refund.refundedAt,
            },
          ]
        : [],
    );
    return {
      refundAmount: this.roundMoney(refunds.reduce((sum, refund) => sum + this.toNumber(refund.amount), 0)),
      refundCount: refunds.length,
      reasons: [...reasonMap.entries()]
        .map(([reason, value]) => ({ reason, amount: this.roundMoney(value.amount), count: value.count }))
        .sort(
          (left, right) =>
            right.amount - left.amount || right.count - left.count || left.reason.localeCompare(right.reason),
        ),
      records,
    };
  }

  async buildProductMarginAnalysis(input: {
    storeId: number;
    startDate: Date;
    endDate: Date;
  }): Promise<FinanceProductMarginAnalysis> {
    const items = await this.prisma.orderItem.findMany({
      where: {
        itemType: { in: ['product', 'goods'] },
        itemId: { not: null },
        order: {
          storeId: input.storeId,
          createdAt: { gte: input.startDate, lte: input.endDate },
          status: { notIn: ['cancelled', 'canceled', 'refunded'] },
        },
      },
      select: {
        itemId: true,
        name: true,
        quantity: true,
        netAmount: true,
        payload: true,
        isGift: true,
        refundItems: {
          where: { refund: { status: { notIn: ['cancelled', 'rejected'] } } },
          select: { quantity: true, refundAmount: true },
        },
      },
      take: 20_000,
    });
    const productIds = [
      ...new Set(items.map((item) => Number(item.itemId)).filter((id) => Number.isInteger(id) && id > 0)),
    ];
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { storeId: input.storeId, id: { in: productIds } },
          select: { id: true, name: true, costPrice: true },
        })
      : [];
    const productMap = new Map(products.map((product) => [product.id, product]));
    const grouped = new Map<
      number,
      {
        productName: string;
        quantity: number;
        netRevenue: number;
        costAmount: number;
        belowCostSaleCount: number;
        knownCostQuantity: number;
        costSources: Set<string>;
      }
    >();
    for (const item of items) {
      const productId = Number(item.itemId);
      if (!Number.isInteger(productId) || productId < 1) continue;
      const soldQuantity = this.toNumber(item.quantity);
      const refundedQuantity = item.refundItems.reduce((sum, refund) => sum + this.toNumber(refund.quantity), 0);
      const remainingQuantity = Math.max(0, soldQuantity - refundedQuantity);
      if (remainingQuantity <= 0) continue;
      const refundedAmount = item.refundItems.reduce((sum, refund) => sum + this.toNumber(refund.refundAmount), 0);
      const netRevenue = Math.max(0, this.toNumber(item.netAmount) - refundedAmount);
      const snapshotUnitCost = this.payloadNumber(item.payload, ['costPrice', 'unitCost', 'productCostPrice']);
      const masterUnitCost = this.toNumber(productMap.get(productId)?.costPrice);
      const unitCost = snapshotUnitCost > 0 ? snapshotUnitCost : masterUnitCost;
      const costSource =
        snapshotUnitCost > 0 ? 'order_snapshot' : masterUnitCost > 0 ? 'product_master_fallback' : 'missing';
      const costAmount = unitCost > 0 ? unitCost * remainingQuantity : 0;
      const current = grouped.get(productId) ?? {
        productName: productMap.get(productId)?.name ?? item.name,
        quantity: 0,
        netRevenue: 0,
        costAmount: 0,
        belowCostSaleCount: 0,
        knownCostQuantity: 0,
        costSources: new Set<string>(),
      };
      current.quantity += remainingQuantity;
      current.netRevenue += netRevenue;
      current.costAmount += costAmount;
      if (unitCost > 0) current.knownCostQuantity += remainingQuantity;
      current.costSources.add(costSource);
      if (!item.isGift && unitCost > 0 && netRevenue / remainingQuantity < unitCost) current.belowCostSaleCount += 1;
      grouped.set(productId, current);
    }
    const rows = [...grouped.entries()].map(([productId, value]) => {
      const grossProfit = value.netRevenue - value.costAmount;
      return {
        productId,
        productName: value.productName,
        quantity: this.roundMoney(value.quantity),
        netRevenue: this.roundMoney(value.netRevenue),
        costAmount: this.roundMoney(value.costAmount),
        grossProfit: this.roundMoney(grossProfit),
        grossMarginRate: value.netRevenue > 0 ? grossProfit / value.netRevenue : undefined,
        belowCostSaleCount: value.belowCostSaleCount,
        costCoverageRate: value.quantity > 0 ? value.knownCostQuantity / value.quantity : 0,
        costSources: [...value.costSources].sort(),
      };
    });
    return {
      rows: rows.sort(
        (left, right) =>
          (right.grossMarginRate ?? -Infinity) - (left.grossMarginRate ?? -Infinity) ||
          right.netRevenue - left.netRevenue,
      ),
      totalProductCount: rows.length,
      belowCostProductCount: rows.filter((row) => row.belowCostSaleCount > 0).length,
      incompleteCostProductCount: rows.filter((row) => row.costCoverageRate < 1).length,
    };
  }

  async buildIncomeAnalysis(input: {
    storeId: number;
    startDate: Date;
    endDate: Date;
  }): Promise<FinanceIncomeAnalysis> {
    const [settlements, payments, orders] = await Promise.all([
      this.prisma.dailySettlement.findMany({
        where: { storeId: input.storeId, settleDate: { gte: input.startDate, lte: input.endDate } },
        orderBy: { settleDate: 'asc' },
        select: {
          settleDate: true,
          totalRevenue: true,
          cashRevenue: true,
          wechatRevenue: true,
          alipayRevenue: true,
          cardRevenue: true,
          balanceRevenue: true,
          rechargeIncome: true,
          orderCount: true,
          customerCount: true,
          avgTransaction: true,
          status: true,
          reconciliationStatus: true,
          confirmedAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.paymentRecord.findMany({
        where: {
          order: { storeId: input.storeId },
          status: { in: ['paid', 'success', 'completed'] },
          paidAt: { gte: input.startDate, lte: input.endDate },
        },
        select: { method: true, amount: true },
      }),
      this.prisma.productOrder.findMany({
        where: {
          storeId: input.storeId,
          createdAt: { gte: input.startDate, lte: input.endDate },
          status: { in: ['completed', 'paid'] },
        },
        orderBy: { netAmount: 'desc' },
        select: { orderNo: true, orderKind: true, netAmount: true, customerName: true, createdAt: true },
        take: 1000,
      }),
    ]);

    const authoritativeSettlements = this.selectAuthoritativeSettlements(settlements);
    const paymentMap = new Map<string, { amount: number; count: number }>();
    for (const payment of payments) {
      const method = payment.method || 'unknown';
      const current = paymentMap.get(method) ?? { amount: 0, count: 0 };
      current.amount += this.toNumber(payment.amount);
      current.count += 1;
      paymentMap.set(method, current);
    }
    if (!payments.length) {
      const fallback = [
        ['cash', authoritativeSettlements.reduce((sum, row) => sum + this.toNumber(row.cashRevenue), 0)],
        ['wechat', authoritativeSettlements.reduce((sum, row) => sum + this.toNumber(row.wechatRevenue), 0)],
        ['alipay', authoritativeSettlements.reduce((sum, row) => sum + this.toNumber(row.alipayRevenue), 0)],
        ['card', authoritativeSettlements.reduce((sum, row) => sum + this.toNumber(row.cardRevenue), 0)],
        ['balance', authoritativeSettlements.reduce((sum, row) => sum + this.toNumber(row.balanceRevenue), 0)],
      ] as const;
      for (const [method, amount] of fallback) if (amount > 0) paymentMap.set(method, { amount, count: 0 });
    }

    const orderKindMap = new Map<string, number>();
    for (const order of orders) {
      const kind = order.orderKind || 'product';
      orderKindMap.set(kind, (orderKindMap.get(kind) ?? 0) + this.toNumber(order.netAmount));
    }
    const totalCollected = payments.length
      ? payments.reduce((sum, payment) => sum + this.toNumber(payment.amount), 0)
      : authoritativeSettlements.reduce((sum, settlement) => sum + this.toNumber(settlement.totalRevenue), 0);
    const dailyMap = new Map<string, { revenue: number; orderCount: number; customerCount: number }>();
    for (const settlement of authoritativeSettlements) {
      const date = this.shanghaiDateKey(settlement.settleDate);
      dailyMap.set(date, {
        revenue: this.toNumber(settlement.totalRevenue),
        orderCount: settlement.orderCount,
        customerCount: settlement.customerCount,
      });
    }
    const dailyTrend = this.dateKeysBetween(
      this.shanghaiDateKey(input.startDate),
      this.shanghaiDateKey(input.endDate),
    ).map((date) => {
      const item = dailyMap.get(date) ?? { revenue: 0, orderCount: 0, customerCount: 0 };
      const revenue = this.roundMoney(item.revenue);
      return {
        date,
        revenue,
        orderCount: item.orderCount,
        customerCount: item.customerCount,
        avgTransaction: item.orderCount > 0 ? this.roundMoney(revenue / item.orderCount) : 0,
      };
    });

    return {
      totalCollected: this.roundMoney(totalCollected),
      paymentBreakdown: [...paymentMap.entries()]
        .map(([method, value]) => ({ method, amount: this.roundMoney(value.amount), count: value.count }))
        .sort((left, right) => right.amount - left.amount),
      dailyTrend,
      orderKindBreakdown: [...orderKindMap.entries()]
        .map(([kind, amount]) => ({ kind, amount: this.roundMoney(amount) }))
        .sort((left, right) => right.amount - left.amount),
      largestOrder: orders[0]
        ? {
            orderNo: orders[0].orderNo,
            amount: this.toNumber(orders[0].netAmount),
            customerName: orders[0].customerName,
            createdAt: orders[0].createdAt,
          }
        : undefined,
    };
  }

  async buildMemberBalanceFlowSummary(input: {
    storeId: number;
    startDate: Date;
    endDate: Date;
  }): Promise<FinanceMemberBalanceFlowSummary> {
    const transactions = await this.prisma.customerBalanceTransaction.findMany({
      where: {
        storeId: input.storeId,
        createdAt: { gte: input.startDate, lte: input.endDate },
        type: { in: ['recharge', 'open', 'deduct', 'consume'] },
      },
      select: { type: true, amount: true, giftAmount: true },
    });

    const summary: FinanceMemberBalanceFlowSummary = {
      rechargeAmount: 0,
      rechargeGiftAmount: 0,
      rechargeCount: 0,
      consumedAmount: 0,
      consumedGiftAmount: 0,
      consumedCount: 0,
    };
    for (const transaction of transactions) {
      const amount = this.toNumber(transaction.amount);
      const giftAmount = this.toNumber(transaction.giftAmount);
      if (transaction.type === 'recharge' || transaction.type === 'open') {
        summary.rechargeAmount += amount;
        summary.rechargeGiftAmount += giftAmount;
        summary.rechargeCount += 1;
      } else {
        summary.consumedAmount += amount;
        summary.consumedGiftAmount += giftAmount;
        summary.consumedCount += 1;
      }
    }
    return summary;
  }

  async buildCardRecognitionRows(input: {
    storeId: number;
    startDate: Date;
    endDate: Date;
    cardName?: string;
  }): Promise<FinanceCardRecognitionRow[]> {
    const rows = await this.prisma.cardUsageRecord.findMany({
      where: {
        storeId: input.storeId,
        verifiedAt: { gte: input.startDate, lte: input.endDate },
        ...(input.cardName ? { cardName: input.cardName } : {}),
      },
      select: {
        id: true,
        customerId: true,
        customerCardId: true,
        projectId: true,
        cardName: true,
        times: true,
        recognizedUnitValue: true,
        recognizedAmount: true,
        verifiedAt: true,
      },
      orderBy: { id: 'asc' },
      take: 20_000,
    });
    return rows.map((row) => {
      const recognizedAmount = this.toNumber(row.recognizedAmount);
      return {
        usageRecordId: row.id,
        customerId: row.customerId,
        customerCardId: row.customerCardId,
        projectId: row.projectId,
        cardName: row.cardName,
        times: row.times,
        recognizedAmount: this.roundMoney(
          recognizedAmount > 0 ? recognizedAmount : this.toNumber(row.recognizedUnitValue) * this.toNumber(row.times),
        ),
        verifiedAt: row.verifiedAt,
      };
    });
  }

  async buildOrderProfitRows(input: {
    storeId: number;
    startDate: Date;
    endDate: Date;
    scope?: FinanceOrderProfitScope;
  }): Promise<FinanceOrderProfitRow[]> {
    const scope = input.scope ?? 'all';
    const orders = await this.prisma.productOrder.findMany({
      where: {
        storeId: input.storeId,
        createdAt: { gte: input.startDate, lte: input.endDate },
        status: { notIn: ['cancelled', 'canceled', 'refunded', '已取消'] },
      },
      select: {
        id: true,
        orderNo: true,
        orderKind: true,
        netAmount: true,
        totalAmount: true,
        refundRecords: {
          where: { status: { notIn: ['failed', 'cancelled', 'canceled', 'refunded', 'rejected'] } },
          select: { amount: true },
        },
        orderItems: {
          select: {
            id: true,
            itemType: true,
            itemId: true,
            quantity: true,
            subtotal: true,
            netAmount: true,
            payload: true,
            commissionRecords: {
              where: { status: { notIn: ['cancelled', 'canceled', 'rejected'] } },
              select: { amount: true },
            },
          },
          orderBy: { id: 'asc' },
        },
        commissionRecords: {
          where: { orderItemId: null, status: { notIn: ['cancelled', 'canceled', 'rejected'] } },
          select: { amount: true },
        },
      },
      orderBy: { id: 'asc' },
      take: 20_000,
    });
    const scopedOrders = orders.filter((order) => this.orderMatchesProfitScope(order, scope));
    const orderItemIds = scopedOrders.flatMap((order) => order.orderItems.map((item) => item.id));
    const productIds = scopedOrders
      .flatMap((order) => order.orderItems)
      .filter((item) => this.isProductItem(item.itemType) && item.itemId !== null)
      .map((item) => Number(item.itemId));
    const projectIds = scopedOrders
      .flatMap((order) => order.orderItems)
      .filter((item) => this.isProjectItem(item.itemType) && item.itemId !== null)
      .map((item) => Number(item.itemId));
    const [products, bomItems, movements] = await Promise.all([
      productIds.length
        ? this.prisma.product.findMany({
            where: { storeId: input.storeId, id: { in: [...new Set(productIds)] } },
            select: { id: true, costPrice: true },
          })
        : [],
      projectIds.length
        ? this.prisma.projectBomItem.findMany({
            where: { projectId: { in: [...new Set(projectIds)] } },
            select: {
              projectId: true,
              standardQty: true,
              product: { select: { costPrice: true } },
            },
          })
        : [],
      scopedOrders.length
        ? this.prisma.stockMovement.findMany({
            where: {
              storeId: input.storeId,
              movementType: { in: ['service_consume', 'service_consumption', 'sale_out'] },
              OR: [
                ...(orderItemIds.length ? [{ orderItemId: { in: orderItemIds } }] : []),
                {
                  sourceType: { in: ['project_order', 'product_order'] },
                  sourceId: { in: scopedOrders.map((order) => order.id) },
                },
              ],
            },
            select: {
              movementType: true,
              productId: true,
              orderItemId: true,
              sourceId: true,
              quantity: true,
              unitCost: true,
              costAmount: true,
              product: { select: { costPrice: true } },
            },
          })
        : [],
    ]);
    const productById = new Map(products.map((product) => [product.id, product]));
    const movementRows = movements as Array<{
      movementType: string;
      productId: number;
      orderItemId: number | null;
      sourceId: number | null;
      quantity: unknown;
      unitCost: unknown;
      costAmount: unknown;
      product: { costPrice: unknown };
    }>;
    const bomByProject = new Map<number, typeof bomItems>();
    for (const item of bomItems) {
      const rows = bomByProject.get(item.projectId) ?? [];
      rows.push(item);
      bomByProject.set(item.projectId, rows);
    }

    return scopedOrders.map((order) => {
      const selectedItems = order.orderItems.filter((item) => {
        if (scope === 'product') return this.isProductItem(item.itemType);
        if (scope === 'project') return this.isProjectItem(item.itemType);
        if (scope === 'prepaid') return false;
        return this.isProductItem(item.itemType) || this.isProjectItem(item.itemType);
      });
      const orderNetAmount = Math.max(0, this.toNumber(order.netAmount) || this.toNumber(order.totalAmount));
      const refundAmount = order.refundRecords.reduce((sum, refund) => sum + this.toNumber(refund.amount), 0);
      const income = selectedItems.reduce((sum, item) => {
        const itemIncome = Math.max(0, this.toNumber(item.netAmount) || this.toNumber(item.subtotal));
        const refundShare = orderNetAmount > 0 ? Math.min(itemIncome, refundAmount * (itemIncome / orderNetAmount)) : 0;
        return sum + Math.max(0, itemIncome - refundShare);
      }, 0);
      let itemCost = 0;
      for (const item of selectedItems) {
        const quantity = this.toNumber(item.quantity) || 1;
        if (this.isProductItem(item.itemType) && item.itemId !== null) {
          const productId = Number(item.itemId);
          const movement = movementRows.find(
            (candidate) =>
              candidate.movementType === 'sale_out' &&
              (candidate.orderItemId === item.id || candidate.sourceId === order.id) &&
              candidate.productId === productId,
          );
          const movementCost = movement
            ? this.toNumber(movement.costAmount) ||
              Math.abs(this.toNumber(movement.quantity)) *
                (this.toNumber(movement.unitCost) || this.toNumber(movement.product.costPrice))
            : 0;
          const snapshotCostAmount = this.payloadNumber(item.payload, ['costAmount', 'productCostAmount']);
          const snapshotUnitCost = this.payloadNumber(item.payload, ['costPrice', 'unitCost', 'productCostPrice']);
          itemCost +=
            movementCost > 0
              ? movementCost
              : snapshotCostAmount > 0
                ? snapshotCostAmount
                : quantity *
                  (snapshotUnitCost > 0 ? snapshotUnitCost : this.toNumber(productById.get(productId)?.costPrice));
        }
        if (this.isProjectItem(item.itemType) && item.itemId !== null) {
          const actualCost = movementRows
            .filter(
              (movement) =>
                ['service_consume', 'service_consumption'].includes(movement.movementType) &&
                (movement.orderItemId === item.id || (movement.orderItemId === null && movement.sourceId === order.id)),
            )
            .reduce((sum, movement) => {
              const recorded = this.toNumber(movement.costAmount);
              return (
                sum +
                (recorded > 0
                  ? recorded
                  : Math.abs(this.toNumber(movement.quantity)) *
                    (this.toNumber(movement.unitCost) || this.toNumber(movement.product.costPrice)))
              );
            }, 0);
          const standardCost = (bomByProject.get(Number(item.itemId)) ?? []).reduce(
            (sum, bomItem) =>
              sum + quantity * this.toNumber(bomItem.standardQty) * this.toNumber(bomItem.product.costPrice),
            0,
          );
          itemCost += actualCost > 0 ? actualCost : standardCost;
        }
      }
      const commissionCost = [
        ...(selectedItems.length ? order.commissionRecords : []),
        ...selectedItems.flatMap((item) => item.commissionRecords),
      ].reduce((sum, commission) => sum + this.toNumber(commission.amount), 0);
      const totalCost = this.roundMoney(itemCost + commissionCost);
      const grossProfit = this.roundMoney(income - totalCost);
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        orderKind: order.orderKind,
        businessType: this.resolveOrderBusinessType(order),
        totalCost,
        grossProfit,
        negativeMarginFlag: grossProfit < 0 ? 1 : 0,
      };
    });
  }

  async buildStaffCommissionRows(input: {
    storeId: number;
    startDate: Date;
    endDate: Date;
    beauticianId?: number;
  }): Promise<FinanceStaffCommissionRow[]> {
    const records = await this.prisma.commissionRecord.findMany({
      where: {
        storeId: input.storeId,
        createdAt: { gte: input.startDate, lte: input.endDate },
        status: { notIn: ['cancelled', 'canceled', 'rejected'] },
        beauticianId: input.beauticianId ? input.beauticianId : { not: null },
        beautician: { storeId: input.storeId },
      },
      select: {
        beauticianId: true,
        type: true,
        amount: true,
        beautician: { select: { name: true } },
      },
      orderBy: { id: 'asc' },
      take: 20_000,
    });
    const grouped = new Map<string, FinanceStaffCommissionRow>();
    for (const record of records) {
      if (!record.beauticianId) continue;
      const key = `${record.beauticianId}:${record.type}`;
      const current = grouped.get(key) ?? {
        beauticianId: record.beauticianId,
        beauticianName: record.beautician?.name ?? `美容师 ${record.beauticianId}`,
        commissionType: record.type,
        amount: 0,
      };
      current.amount += this.toNumber(record.amount);
      grouped.set(key, current);
    }
    return [...grouped.values()]
      .map((row) => ({ ...row, amount: this.roundMoney(row.amount) }))
      .sort((left, right) => right.amount - left.amount || left.commissionType.localeCompare(right.commissionType));
  }

  async buildCostAnalysis(input: { storeId: number; startDate: Date; endDate: Date }): Promise<FinanceCostAnalysis> {
    const [settlements, operatingCosts, commissions, activeCards, balanceAccounts] = await Promise.all([
      this.prisma.dailySettlement.findMany({
        where: { storeId: input.storeId, settleDate: { gte: input.startDate, lte: input.endDate } },
        select: {
          settleDate: true,
          totalRevenue: true,
          materialCost: true,
          grossProfit: true,
          commissionTotal: true,
          status: true,
          reconciliationStatus: true,
          confirmedAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.operatingCost.findMany({
        where: { storeId: input.storeId, costDate: { gte: input.startDate, lte: input.endDate } },
        select: { category: true, amount: true },
      }),
      this.prisma.commissionRecord.findMany({
        where: {
          storeId: input.storeId,
          createdAt: { gte: input.startDate, lte: input.endDate },
          status: { notIn: ['cancelled', 'rejected'] },
        },
        select: { amount: true },
      }),
      this.prisma.customerCard.findMany({
        where: {
          status: 'active',
          remainingTimes: { gt: 0 },
          customer: { storeId: input.storeId, deletedAt: null },
        },
        select: { remainingTimes: true, recognizedUnitValue: true },
      }),
      this.prisma.customerBalanceAccount.findMany({
        where: { storeId: input.storeId, status: 'active' },
        select: { cashBalance: true, giftBalance: true },
      }),
    ]);
    const authoritativeSettlements = this.selectAuthoritativeSettlements(settlements);
    const revenue = authoritativeSettlements.reduce((sum, row) => sum + this.toNumber(row.totalRevenue), 0);
    const materialCost = authoritativeSettlements.reduce((sum, row) => sum + this.toNumber(row.materialCost), 0);
    const grossProfit = authoritativeSettlements.reduce((sum, row) => sum + this.toNumber(row.grossProfit), 0);
    const settlementCommission = authoritativeSettlements.reduce(
      (sum, row) => sum + this.toNumber(row.commissionTotal),
      0,
    );
    const commissionCost = commissions.length
      ? commissions.reduce((sum, row) => sum + this.toNumber(row.amount), 0)
      : settlementCommission;
    const categoryMap = new Map<string, number>();
    for (const cost of operatingCosts) {
      const category = cost.category || '未分类';
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + this.toNumber(cost.amount));
    }
    const operatingCost = [...categoryMap.values()].reduce((sum, amount) => sum + amount, 0);
    const unfulfilledCardLiability = activeCards.reduce(
      (sum, card) => sum + this.toNumber(card.remainingTimes) * this.toNumber(card.recognizedUnitValue),
      0,
    );
    const storedValueLiability = balanceAccounts.reduce(
      (sum, account) => sum + this.toNumber(account.cashBalance) + this.toNumber(account.giftBalance),
      0,
    );
    const settlementCount = authoritativeSettlements.length;
    const reconciledSettlementCount = authoritativeSettlements.filter(
      (row) => row.status === 'confirmed' && row.reconciliationStatus === 'passed',
    ).length;
    const cashShiftReconciliationRate = settlementCount > 0 ? reconciledSettlementCount / settlementCount : 0;
    const operatingProfit = grossProfit - commissionCost - operatingCost;
    const totalCost = materialCost + commissionCost + operatingCost;
    return {
      revenue: this.roundMoney(revenue),
      materialCost: this.roundMoney(materialCost),
      commissionCost: this.roundMoney(commissionCost),
      operatingCost: this.roundMoney(operatingCost),
      grossProfit: this.roundMoney(grossProfit),
      grossMarginRate: revenue > 0 ? grossProfit / revenue : undefined,
      operatingProfit: this.roundMoney(operatingProfit),
      costIncomeRatio: revenue > 0 ? Number((totalCost / revenue).toFixed(4)) : 0,
      storedValueLiability: this.roundMoney(storedValueLiability),
      unfulfilledCardLiability: this.roundMoney(unfulfilledCardLiability),
      settlementCount,
      reconciledSettlementCount,
      cashShiftReconciliationRate,
      cardLiability: this.roundMoney(unfulfilledCardLiability),
      costCategories: [...categoryMap.entries()]
        .map(([category, amount]) => ({ category, amount: this.roundMoney(amount) }))
        .sort((left, right) => right.amount - left.amount),
    };
  }

  private orderMatchesProfitScope(
    order: { orderKind: string; orderItems: Array<{ itemType: string }> },
    scope: FinanceOrderProfitScope,
  ) {
    if (scope === 'all') return true;
    if (scope === 'product') return order.orderItems.some((item) => this.isProductItem(item.itemType));
    if (scope === 'project') return order.orderItems.some((item) => this.isProjectItem(item.itemType));
    return (
      order.orderKind === 'member_card_open' || order.orderItems.some((item) => this.isCardSaleItem(item.itemType))
    );
  }

  private resolveOrderBusinessType(order: { orderKind: string; orderItems: Array<{ itemType: string }> }) {
    const hasProduct = order.orderItems.some((item) => this.isProductItem(item.itemType));
    const hasProject = order.orderItems.some((item) => this.isProjectItem(item.itemType));
    if (order.orderKind === 'member_card_open' || order.orderItems.some((item) => this.isCardSaleItem(item.itemType))) {
      return 'prepaid' as const;
    }
    if (hasProduct && hasProject) return 'mixed' as const;
    if (hasProduct) return 'product' as const;
    if (hasProject) return 'project' as const;
    return 'other' as const;
  }

  private isProductItem(itemType: string) {
    return ['product', 'goods'].includes(String(itemType ?? '').toLowerCase());
  }

  private isProjectItem(itemType: string) {
    return ['project', 'service', 'service_project'].includes(String(itemType ?? '').toLowerCase());
  }

  private isCardSaleItem(itemType: string) {
    return ['card', 'customer_card', 'card_sale', 'member_card'].includes(String(itemType ?? '').toLowerCase());
  }

  private toNumber(value: unknown) {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') return Number(value);
    if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
    return 0;
  }

  private payloadNumber(value: unknown, keys: string[]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
    const payload = value as Record<string, unknown>;
    for (const key of keys) {
      const number = this.toNumber(payload[key]);
      if (Number.isFinite(number) && number > 0) return number;
    }
    return 0;
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private selectAuthoritativeSettlements<
    T extends {
      settleDate: Date;
      status: string;
      reconciliationStatus: string;
      confirmedAt: Date | null;
      updatedAt: Date;
    },
  >(rows: T[]) {
    const selected = new Map<string, T>();
    for (const row of rows) {
      const date = this.shanghaiDateKey(row.settleDate);
      const current = selected.get(date);
      if (!current || this.compareSettlementAuthority(row, current) > 0) selected.set(date, row);
    }
    return [...selected.values()].sort((left, right) => left.settleDate.getTime() - right.settleDate.getTime());
  }

  private compareSettlementAuthority(
    left: { status: string; reconciliationStatus: string; confirmedAt: Date | null; updatedAt: Date },
    right: { status: string; reconciliationStatus: string; confirmedAt: Date | null; updatedAt: Date },
  ) {
    const leftScore = [
      left.status === 'confirmed' ? 1 : 0,
      left.reconciliationStatus === 'passed' ? 1 : 0,
      left.confirmedAt?.getTime() ?? 0,
      left.updatedAt.getTime(),
    ];
    const rightScore = [
      right.status === 'confirmed' ? 1 : 0,
      right.reconciliationStatus === 'passed' ? 1 : 0,
      right.confirmedAt?.getTime() ?? 0,
      right.updatedAt.getTime(),
    ];
    for (let index = 0; index < leftScore.length; index += 1) {
      if (leftScore[index] !== rightScore[index]) return leftScore[index]! - rightScore[index]!;
    }
    return 0;
  }

  private shanghaiDateKey(value: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  private dateKeysBetween(startDate: string, endDate: string) {
    const dates: string[] = [];
    const cursor = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }
}
