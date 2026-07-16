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
  dailyTrend: Array<{ date: string; revenue: number; orderCount: number; customerCount: number; avgTransaction: number }>;
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
  cardLiability: number;
  costCategories: Array<{ category: string; amount: number }>;
}

export interface FinanceMemberBalanceFlowSummary {
  rechargeAmount: number;
  rechargeGiftAmount: number;
  rechargeCount: number;
  consumedAmount: number;
  consumedGiftAmount: number;
  consumedCount: number;
}

@Injectable()
export class BrainFinanceSkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async buildFinanceRiskSummary(input: { storeId: number; startDate: Date; endDate: Date }): Promise<FinanceRiskSummary> {
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

  async buildIncomeAnalysis(input: { storeId: number; startDate: Date; endDate: Date }): Promise<FinanceIncomeAnalysis> {
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
          status: { notIn: ['failed', 'cancelled', 'refunded'] },
          OR: [
            { paidAt: { gte: input.startDate, lte: input.endDate } },
            { paidAt: null, createdAt: { gte: input.startDate, lte: input.endDate } },
          ],
        },
        select: { method: true, amount: true },
      }),
      this.prisma.productOrder.findMany({
        where: {
          storeId: input.storeId,
          createdAt: { gte: input.startDate, lte: input.endDate },
          status: { notIn: ['cancelled', 'canceled', 'refunded'] },
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

  async buildCostAnalysis(input: { storeId: number; startDate: Date; endDate: Date }): Promise<FinanceCostAnalysis> {
    const [settlements, operatingCosts, commissions, activeCards] = await Promise.all([
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
    ]);
    const authoritativeSettlements = this.selectAuthoritativeSettlements(settlements);
    const revenue = authoritativeSettlements.reduce((sum, row) => sum + this.toNumber(row.totalRevenue), 0);
    const materialCost = authoritativeSettlements.reduce((sum, row) => sum + this.toNumber(row.materialCost), 0);
    const grossProfit = authoritativeSettlements.reduce((sum, row) => sum + this.toNumber(row.grossProfit), 0);
    const settlementCommission = authoritativeSettlements.reduce((sum, row) => sum + this.toNumber(row.commissionTotal), 0);
    const commissionCost = commissions.length
      ? commissions.reduce((sum, row) => sum + this.toNumber(row.amount), 0)
      : settlementCommission;
    const categoryMap = new Map<string, number>();
    for (const cost of operatingCosts) {
      const category = cost.category || '未分类';
      categoryMap.set(category, (categoryMap.get(category) ?? 0) + this.toNumber(cost.amount));
    }
    const operatingCost = [...categoryMap.values()].reduce((sum, amount) => sum + amount, 0);
    const cardLiability = activeCards.reduce(
      (sum, card) => sum + this.toNumber(card.remainingTimes) * this.toNumber(card.recognizedUnitValue),
      0,
    );
    return {
      revenue,
      materialCost,
      commissionCost,
      operatingCost,
      grossProfit,
      grossMarginRate: revenue > 0 ? grossProfit / revenue : undefined,
      cardLiability,
      costCategories: [...categoryMap.entries()]
        .map(([category, amount]) => ({ category, amount }))
        .sort((left, right) => right.amount - left.amount),
    };
  }

  private toNumber(value: unknown) {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') return Number(value);
    if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
    return 0;
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private selectAuthoritativeSettlements<T extends {
    settleDate: Date;
    status: string;
    reconciliationStatus: string;
    confirmedAt: Date | null;
    updatedAt: Date;
  }>(rows: T[]) {
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
