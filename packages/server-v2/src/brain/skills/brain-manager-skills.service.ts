import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface BrainDailyOverview {
  revenue: number;
  appointmentCount: number;
  activeCustomerCount: number;
  grossMarginRate: number;
  riskItems: string[];
}

export interface BrainOperationsAnalysis {
  revenue: number;
  orderCount: number;
  customerCount: number;
  avgTransaction: number;
  inStoreCount: number;
  newCustomerCount: number;
  returningCustomerCount: number;
  paymentBreakdown: Array<{ method: string; amount: number }>;
  dailyTrend: Array<{ date: string; revenue: number }>;
  projectRanking: Array<{ name: string; count: number }>;
  beauticianRanking: Array<{ name: string; count: number }>;
  largestOrder?: { orderNo: string; amount: number; customerName?: string | null };
  target?: {
    revenueTarget: number;
    appointmentTarget: number;
    newCustomerTarget: number;
  };
}

export interface BrainStaffAnalysis {
  staff: Array<{
    beauticianId: number;
    name: string;
    serviceCount: number;
    completedCount: number;
    uniqueCustomerCount: number;
    repeatCustomerCount: number;
    revenueAmount: number;
    commissionAmount: number;
    timeOffHours: number;
  }>;
}

export interface BrainRevenueForecastBaseline {
  modelVersion: 'deterministic_daily_revenue_v1';
  generatedAt: string;
  historyStart: string;
  historyEnd: string;
  forecastStart: string;
  forecastEnd: string;
  sampleDays: number;
  forecastDays: number;
  averageDailyRevenue: number;
  estimatedRevenue: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
}

@Injectable()
export class BrainManagerSkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async buildDailyOverview(input: { storeId: number; startDate: Date; endDate: Date }): Promise<BrainDailyOverview> {
    const [settlements, appointmentCount, orders, lowStockProducts] = await Promise.all([
      this.prisma.dailySettlement.findMany({
        where: {
          storeId: input.storeId,
          settleDate: { gte: input.startDate, lte: input.endDate },
        },
        select: { totalRevenue: true, grossProfit: true },
      }),
      this.prisma.reservation.count({
        where: {
          storeId: input.storeId,
          date: { gte: input.startDate, lte: input.endDate },
          status: { notIn: ['cancelled', 'canceled'] },
        },
      }),
      this.prisma.productOrder.findMany({
        where: {
          storeId: input.storeId,
          createdAt: { gte: input.startDate, lte: input.endDate },
          status: { notIn: ['cancelled', 'refunded'] },
          customerId: { not: null },
        },
        select: { customerId: true },
      }),
      this.prisma.product.findMany({
        where: { storeId: input.storeId, deletedAt: null, status: 'active' },
        select: { name: true, currentStock: true, safetyStock: true },
        take: 200,
      }),
    ]);

    const revenue = settlements.reduce((sum, row) => sum + this.toNumber(row.totalRevenue), 0);
    const grossProfit = settlements.reduce((sum, row) => sum + this.toNumber(row.grossProfit), 0);
    const activeCustomerCount = new Set(orders.map((order) => order.customerId).filter(Boolean)).size;
    const riskItems = lowStockProducts
      .filter((product) => {
        const safetyStock = this.toNumber(product.safetyStock);
        return safetyStock > 0 && this.toNumber(product.currentStock) < safetyStock;
      })
      .slice(0, 5)
      .map((product) => `低库存：${product.name}`);

    return {
      revenue,
      appointmentCount,
      activeCustomerCount,
      grossMarginRate: revenue === 0 ? 0 : grossProfit / revenue,
      riskItems,
    };
  }

  async buildOperationsAnalysis(input: { storeId: number; startDate: Date; endDate: Date }): Promise<BrainOperationsAnalysis> {
    const [settlements, reservations, orders, newCustomerCount, target] = await Promise.all([
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
          orderCount: true,
          customerCount: true,
          avgTransaction: true,
        },
      }),
      this.prisma.reservation.findMany({
        where: {
          storeId: input.storeId,
          date: { gte: input.startDate, lte: input.endDate },
          status: { notIn: ['cancelled', 'canceled', '已取消'] },
        },
        include: {
          customer: { select: { createdAt: true } },
          project: { select: { name: true } },
          beautician: { select: { name: true } },
        },
        take: 2000,
      }),
      this.prisma.productOrder.findMany({
        where: {
          storeId: input.storeId,
          createdAt: { gte: input.startDate, lte: input.endDate },
          status: { notIn: ['cancelled', 'canceled', 'refunded'] },
        },
        orderBy: { netAmount: 'desc' },
        select: { orderNo: true, netAmount: true, customerName: true },
        take: 1000,
      }),
      this.prisma.customer.count({
        where: { storeId: input.storeId, deletedAt: null, createdAt: { gte: input.startDate, lte: input.endDate } },
      }),
      this.prisma.brainStoreOperatingTarget.findFirst({
        where: {
          storeId: input.storeId,
          status: 'active',
          periodStart: { lte: input.endDate },
          periodEnd: { gte: input.startDate },
        },
        orderBy: { periodStart: 'desc' },
      }),
    ]);
    const projectCounts = new Map<string, number>();
    const beauticianCounts = new Map<string, number>();
    for (const reservation of reservations) {
      projectCounts.set(reservation.project.name, (projectCounts.get(reservation.project.name) ?? 0) + 1);
      const beautician = reservation.beautician?.name ?? '未指定美容师';
      beauticianCounts.set(beautician, (beauticianCounts.get(beautician) ?? 0) + 1);
    }
    const paymentBreakdown = [
      ['现金', settlements.reduce((sum, row) => sum + this.toNumber(row.cashRevenue), 0)],
      ['微信', settlements.reduce((sum, row) => sum + this.toNumber(row.wechatRevenue), 0)],
      ['支付宝', settlements.reduce((sum, row) => sum + this.toNumber(row.alipayRevenue), 0)],
      ['银行卡', settlements.reduce((sum, row) => sum + this.toNumber(row.cardRevenue), 0)],
      ['储值余额', settlements.reduce((sum, row) => sum + this.toNumber(row.balanceRevenue), 0)],
    ]
      .filter((item): item is [string, number] => Number(item[1]) > 0)
      .map(([method, amount]) => ({ method, amount }));
    const uniqueCustomers = new Set(reservations.map((reservation) => reservation.customerId));
    const returningCustomerCount = new Set(
      reservations.filter((reservation) => reservation.customer.createdAt < input.startDate).map((reservation) => reservation.customerId),
    ).size;
    return {
      revenue: settlements.reduce((sum, row) => sum + this.toNumber(row.totalRevenue), 0),
      orderCount: settlements.reduce((sum, row) => sum + row.orderCount, 0),
      customerCount: uniqueCustomers.size || settlements.reduce((sum, row) => sum + row.customerCount, 0),
      avgTransaction:
        settlements.reduce((sum, row) => sum + row.orderCount, 0) > 0
          ? settlements.reduce((sum, row) => sum + this.toNumber(row.totalRevenue), 0) /
            settlements.reduce((sum, row) => sum + row.orderCount, 0)
          : 0,
      inStoreCount: reservations.filter((reservation) => ['checked_in', 'in_service', 'arrived', '已到店', '服务中'].includes(reservation.status)).length,
      newCustomerCount,
      returningCustomerCount,
      paymentBreakdown,
      dailyTrend: settlements.map((row) => ({ date: row.settleDate.toISOString().slice(0, 10), revenue: this.toNumber(row.totalRevenue) })),
      projectRanking: [...projectCounts.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count).slice(0, 10),
      beauticianRanking: [...beauticianCounts.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count).slice(0, 10),
      largestOrder: orders[0]
        ? { orderNo: orders[0].orderNo, amount: this.toNumber(orders[0].netAmount), customerName: orders[0].customerName }
        : undefined,
      target: target
        ? {
            revenueTarget: this.toNumber(target.revenueTarget),
            appointmentTarget: target.appointmentTarget,
            newCustomerTarget: target.newCustomerTarget,
          }
        : undefined,
    };
  }

  async buildStaffAnalysis(input: { storeId: number; startDate: Date; endDate: Date }): Promise<BrainStaffAnalysis> {
    const [beauticians, tasks, commissions, timeOffs] = await Promise.all([
      this.prisma.beautician.findMany({
        where: { storeId: input.storeId, status: 'active' },
        select: { id: true, name: true },
      }),
      this.prisma.serviceTask.findMany({
        where: {
          storeId: input.storeId,
          beauticianId: { not: null },
          appointmentTime: { gte: input.startDate, lte: input.endDate },
        },
        select: { beauticianId: true, customerId: true, status: true },
        take: 5000,
      }),
      this.prisma.commissionRecord.findMany({
        where: {
          storeId: input.storeId,
          beauticianId: { not: null },
          createdAt: { gte: input.startDate, lte: input.endDate },
          status: { notIn: ['cancelled', 'rejected'] },
        },
        select: { beauticianId: true, sourceAmount: true, amount: true },
        take: 5000,
      }),
      this.prisma.beauticianTimeOff.findMany({
        where: {
          storeId: input.storeId,
          date: { gte: input.startDate, lte: input.endDate },
          status: 'approved',
        },
        select: { beauticianId: true, startTime: true, endTime: true },
        take: 1000,
      }),
    ]);
    return {
      staff: beauticians
        .map((beautician) => {
          const ownTasks = tasks.filter((task) => task.beauticianId === beautician.id);
          const ownCommissions = commissions.filter((record) => record.beauticianId === beautician.id);
          const customerCounts = new Map<number, number>();
          for (const task of ownTasks) customerCounts.set(task.customerId, (customerCounts.get(task.customerId) ?? 0) + 1);
          return {
            beauticianId: beautician.id,
            name: beautician.name,
            serviceCount: ownTasks.length,
            completedCount: ownTasks.filter((task) => String(task.status) === 'completed').length,
            uniqueCustomerCount: customerCounts.size,
            repeatCustomerCount: [...customerCounts.values()].filter((count) => count > 1).length,
            revenueAmount: ownCommissions.reduce((sum, record) => sum + this.toNumber(record.sourceAmount), 0),
            commissionAmount: ownCommissions.reduce((sum, record) => sum + this.toNumber(record.amount), 0),
            timeOffHours: timeOffs
              .filter((timeOff) => timeOff.beauticianId === beautician.id)
              .reduce((sum, timeOff) => sum + this.durationHours(timeOff.startTime, timeOff.endTime), 0),
          };
        })
        .sort((left, right) => right.serviceCount - left.serviceCount || right.revenueAmount - left.revenueAmount),
    };
  }

  async buildRevenueForecastBaseline(input: { storeId: number; asOf: Date }): Promise<BrainRevenueForecastBaseline> {
    const historyEnd = new Date(
      Date.UTC(input.asOf.getUTCFullYear(), input.asOf.getUTCMonth(), input.asOf.getUTCDate(), 23, 59, 59, 999),
    );
    const historyStart = new Date(historyEnd);
    historyStart.setUTCHours(0, 0, 0, 0);
    historyStart.setUTCDate(historyStart.getUTCDate() - 89);
    const settlements = await this.prisma.dailySettlement.findMany({
      where: {
        storeId: input.storeId,
        settleDate: { gte: historyStart, lte: historyEnd },
      },
      orderBy: { settleDate: 'asc' },
      select: { settleDate: true, totalRevenue: true },
    });

    const currentQuarter = Math.floor(input.asOf.getUTCMonth() / 3);
    const forecastStart = new Date(Date.UTC(input.asOf.getUTCFullYear(), (currentQuarter + 1) * 3, 1));
    const forecastEndExclusive = new Date(Date.UTC(input.asOf.getUTCFullYear(), (currentQuarter + 2) * 3, 1));
    const forecastEnd = new Date(forecastEndExclusive.getTime() - 1);
    const sampleDays = 90;
    const forecastDays = Math.round((forecastEndExclusive.getTime() - forecastStart.getTime()) / 86_400_000);
    const totalRevenue = settlements.reduce((sum, row) => sum + this.toNumber(row.totalRevenue), 0);
    const averageDailyRevenue = totalRevenue / sampleDays;
    const estimatedRevenue = averageDailyRevenue * forecastDays;
    const confidence = settlements.length >= 60 ? 0.75 : settlements.length >= 30 ? 0.55 : 0.35;
    const margin = confidence >= 0.75 ? 0.2 : 0.35;

    return {
      modelVersion: 'deterministic_daily_revenue_v1',
      generatedAt: input.asOf.toISOString(),
      historyStart: historyStart.toISOString(),
      historyEnd: historyEnd.toISOString(),
      forecastStart: forecastStart.toISOString(),
      forecastEnd: forecastEnd.toISOString(),
      sampleDays,
      forecastDays,
      averageDailyRevenue,
      estimatedRevenue,
      lowerBound: estimatedRevenue * (1 - margin),
      upperBound: estimatedRevenue * (1 + margin),
      confidence,
    };
  }

  private durationHours(startTime: string, endTime: string) {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    return Math.max(0, (endHour * 60 + endMinute - startHour * 60 - startMinute) / 60);
  }

  private toNumber(value: unknown) {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') return Number(value);
    if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
    return 0;
  }
}
