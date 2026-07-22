import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { formatBusinessDate, toBusinessDateOnly } from '../../common/utils/business-time.js';

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
  status: 'available' | 'limited' | 'insufficient';
  modelVersion: 'deterministic_daily_revenue_v2';
  generatedAt: string;
  historyStart: string;
  historyEnd: string;
  forecastStart: string;
  forecastEnd: string;
  historyWindowDays: number;
  sampleDays: number;
  missingDays: number;
  duplicateBusinessDateCount: number;
  trustedDays: number;
  dataCoverageRate: number;
  reconciliationRate: number;
  latestSettlementDate: string | null;
  freshnessDays: number | null;
  forecastDays: number;
  averageDailyRevenue: number | null;
  estimatedRevenue: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  confidence: number;
  confidenceLabel: 'high' | 'medium' | 'low';
  backtest: {
    status: 'available' | 'limited' | 'insufficient';
    evaluationDays: number;
    meanAbsoluteError: number | null;
    weightedAbsolutePercentageError: number | null;
    accuracyRate: number | null;
  };
  methodology: string;
  limitations: string[];
}

@Injectable()
export class BrainManagerSkillsService {
  private static readonly STAFF_FACT_PAGE_SIZE = 1000;
  private static readonly STAFF_FACT_MAX_ROWS = 100000;

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

  async buildOperationsAnalysis(input: {
    storeId: number;
    startDate: Date;
    endDate: Date;
  }): Promise<BrainOperationsAnalysis> {
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
      reservations
        .filter((reservation) => reservation.customer.createdAt < input.startDate)
        .map((reservation) => reservation.customerId),
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
      inStoreCount: reservations.filter((reservation) =>
        ['checked_in', 'in_service', 'arrived', '已到店', '服务中'].includes(reservation.status),
      ).length,
      newCustomerCount,
      returningCustomerCount,
      paymentBreakdown,
      dailyTrend: settlements.map((row) => ({
        date: row.settleDate.toISOString().slice(0, 10),
        revenue: this.toNumber(row.totalRevenue),
      })),
      projectRanking: [...projectCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 10),
      beauticianRanking: [...beauticianCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 10),
      largestOrder: orders[0]
        ? {
            orderNo: orders[0].orderNo,
            amount: this.toNumber(orders[0].netAmount),
            customerName: orders[0].customerName,
          }
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
      this.readStaffFactPages((page) =>
        this.prisma.serviceTask.findMany({
          where: {
            storeId: input.storeId,
            beauticianId: { not: null },
            appointmentTime: { gte: input.startDate, lte: input.endDate },
            status: { not: 'cancelled' },
          },
          select: { id: true, beauticianId: true, customerId: true, status: true },
          ...page,
        }),
      ),
      this.readStaffFactPages((page) =>
        this.prisma.commissionRecord.findMany({
          where: {
            storeId: input.storeId,
            beauticianId: { not: null },
            createdAt: { gte: input.startDate, lte: input.endDate },
            status: { notIn: ['cancelled', 'rejected'] },
          },
          select: { id: true, beauticianId: true, sourceAmount: true, amount: true },
          ...page,
        }),
      ),
      this.readStaffFactPages((page) =>
        this.prisma.beauticianTimeOff.findMany({
          where: {
            storeId: input.storeId,
            date: { gte: input.startDate, lte: input.endDate },
            status: 'approved',
          },
          select: { id: true, beauticianId: true, startTime: true, endTime: true },
          ...page,
        }),
      ),
    ]);
    return {
      staff: beauticians
        .map((beautician) => {
          const ownTasks = tasks.filter((task) => task.beauticianId === beautician.id);
          const ownCommissions = commissions.filter((record) => record.beauticianId === beautician.id);
          const customerCounts = new Map<number, number>();
          for (const task of ownTasks)
            customerCounts.set(task.customerId, (customerCounts.get(task.customerId) ?? 0) + 1);
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

  private async readStaffFactPages<T extends { id: number }>(
    loadPage: (page: { orderBy: { id: 'asc' }; take: number; cursor?: { id: number }; skip?: 1 }) => Promise<T[]>,
  ): Promise<T[]> {
    const rows: T[] = [];
    let cursor: number | undefined;
    while (true) {
      const page = await loadPage({
        orderBy: { id: 'asc' },
        take: BrainManagerSkillsService.STAFF_FACT_PAGE_SIZE,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 as const }),
      });
      if (rows.length + page.length > BrainManagerSkillsService.STAFF_FACT_MAX_ROWS) {
        throw new Error('brain_staff_analysis_row_limit_exceeded');
      }
      rows.push(...page);
      if (page.length < BrainManagerSkillsService.STAFF_FACT_PAGE_SIZE) return rows;
      const lastId = page.at(-1)?.id;
      if (!Number.isInteger(lastId) || lastId === cursor) throw new Error('brain_staff_analysis_cursor_invalid');
      cursor = lastId;
    }
  }

  async buildRevenueForecastBaseline(input: { storeId: number; asOf: Date }): Promise<BrainRevenueForecastBaseline> {
    const businessAsOf = toBusinessDateOnly(input.asOf);
    const historyEndDate = new Date(businessAsOf);
    historyEndDate.setUTCDate(historyEndDate.getUTCDate() - 1);
    const historyStartDate = new Date(historyEndDate);
    historyStartDate.setUTCDate(historyStartDate.getUTCDate() - 89);
    const queryStart = new Date(historyStartDate);
    queryStart.setUTCDate(queryStart.getUTCDate() - 1);
    const queryEnd = new Date(historyEndDate);
    queryEnd.setUTCDate(queryEnd.getUTCDate() + 1);
    queryEnd.setUTCHours(23, 59, 59, 999);
    const settlements = await this.prisma.dailySettlement.findMany({
      where: {
        storeId: input.storeId,
        settleDate: { gte: queryStart, lte: queryEnd },
      },
      orderBy: [{ settleDate: 'asc' }, { updatedAt: 'asc' }],
      select: {
        id: true,
        settleDate: true,
        totalRevenue: true,
        status: true,
        reconciliationStatus: true,
        updatedAt: true,
      },
    });

    const currentQuarter = Math.floor(businessAsOf.getUTCMonth() / 3);
    const forecastStart = new Date(Date.UTC(businessAsOf.getUTCFullYear(), (currentQuarter + 1) * 3, 1));
    const forecastEndExclusive = new Date(Date.UTC(businessAsOf.getUTCFullYear(), (currentQuarter + 2) * 3, 1));
    const forecastEnd = new Date(forecastEndExclusive.getTime() - 1);
    const historyWindowDays = 90;
    const forecastDays = Math.round((forecastEndExclusive.getTime() - forecastStart.getTime()) / 86_400_000);
    const historyStartKey = formatBusinessDate(historyStartDate);
    const historyEndKey = formatBusinessDate(historyEndDate);
    const byBusinessDate = new Map<string, (typeof settlements)[number][]>();
    for (const settlement of settlements) {
      const businessDate = formatBusinessDate(settlement.settleDate);
      if (businessDate < historyStartKey || businessDate > historyEndKey) continue;
      const rows = byBusinessDate.get(businessDate) ?? [];
      rows.push(settlement);
      byBusinessDate.set(businessDate, rows);
    }
    const duplicateBusinessDateCount = [...byBusinessDate.values()].reduce(
      (sum, rows) => sum + Math.max(0, rows.length - 1),
      0,
    );
    const dailyFacts = [...byBusinessDate.entries()]
      .map(([businessDate, rows]) => {
        const selected = [...rows].sort((left, right) => {
          const trustDiff = Number(this.isTrustedSettlement(right)) - Number(this.isTrustedSettlement(left));
          if (trustDiff !== 0) return trustDiff;
          const updatedDiff = right.updatedAt.getTime() - left.updatedAt.getTime();
          return updatedDiff !== 0 ? updatedDiff : right.id - left.id;
        })[0];
        return {
          businessDate,
          revenue: this.toNumber(selected.totalRevenue),
          trusted: this.isTrustedSettlement(selected),
        };
      })
      .sort((left, right) => left.businessDate.localeCompare(right.businessDate));

    const sampleDays = dailyFacts.length;
    const missingDays = historyWindowDays - sampleDays;
    const trustedDays = dailyFacts.filter((fact) => fact.trusted).length;
    const dataCoverageRate = sampleDays / historyWindowDays;
    const reconciliationRate = sampleDays > 0 ? trustedDays / sampleDays : 0;
    const latestSettlementDate = dailyFacts.at(-1)?.businessDate ?? null;
    const freshnessDays = latestSettlementDate
      ? Math.max(0, Math.round((historyEndDate.getTime() - new Date(`${latestSettlementDate}T00:00:00.000Z`).getTime()) / 86_400_000))
      : null;
    const backtest = this.backtestRevenue(dailyFacts.map((fact) => fact.revenue));
    const coverageScore = Math.min(1, sampleDays / 60) * Math.min(1, dataCoverageRate / 0.8);
    const reconciliationScore = reconciliationRate;
    const backtestScore = backtest.accuracyRate ?? 0;
    const freshnessScore = freshnessDays === null ? 0 : freshnessDays <= 1 ? 1 : freshnessDays <= 3 ? 0.7 : 0.2;
    const rawConfidence = coverageScore * 0.35 + reconciliationScore * 0.25 + backtestScore * 0.3 + freshnessScore * 0.1;
    const confidence = Math.min(0.95, Math.max(0.05, rawConfidence));
    const confidenceLabel = confidence >= 0.75 ? 'high' : confidence >= 0.5 ? 'medium' : 'low';
    const backtestError = backtest.weightedAbsolutePercentageError;
    const status = sampleDays < 7 || confidence < 0.35 || (backtestError !== null && backtestError > 1)
      ? 'insufficient'
      : confidenceLabel === 'high' ? 'available' : 'limited';
    const recentFacts = dailyFacts.slice(-Math.min(28, dailyFacts.length));
    const averageDailyRevenue = status === 'insufficient'
      ? null
      : recentFacts.reduce((sum, fact) => sum + fact.revenue, 0) / recentFacts.length;
    const estimatedRevenue = averageDailyRevenue === null ? null : averageDailyRevenue * forecastDays;
    const intervalMargin = Math.min(1, Math.max(0.2, (backtestError ?? 0.5) + (1 - confidence) * 0.5));
    const lowerBound = estimatedRevenue === null ? null : Math.max(0, estimatedRevenue * (1 - intervalMargin));
    const upperBound = estimatedRevenue === null ? null : estimatedRevenue * (1 + intervalMargin);
    const limitations: string[] = [];
    if (sampleDays < 60) limitations.push(`90 天窗口仅有 ${sampleDays} 个营业日结算样本。`);
    if (dataCoverageRate < 0.8) limitations.push(`结算日覆盖率仅 ${(dataCoverageRate * 100).toFixed(1)}%，缺失日期不按零营收处理。`);
    if (reconciliationRate < 0.8) limitations.push(`已确认且对账通过的样本占比仅 ${(reconciliationRate * 100).toFixed(1)}%。`);
    if (duplicateBusinessDateCount > 0) limitations.push(`发现 ${duplicateBusinessDateCount} 条重复营业日记录，已优先采用已确认且对账通过的版本。`);
    if (backtest.status === 'insufficient') limitations.push('历史样本不足，暂时无法形成有效滚动回测。');
    else if ((backtest.weightedAbsolutePercentageError ?? 0) > 1) limitations.push(`历史回测误差 ${(backtest.weightedAbsolutePercentageError! * 100).toFixed(1)}%，超过 100% 门禁，停止输出预测金额。`);
    else if ((backtest.weightedAbsolutePercentageError ?? 0) > 0.35) limitations.push(`历史回测误差 ${(backtest.weightedAbsolutePercentageError! * 100).toFixed(1)}%，预测区间已相应放宽。`);
    if (freshnessDays === null || freshnessDays > 3) limitations.push('最近日结数据不够新鲜，预测不能用于经营承诺。');

    return {
      status,
      modelVersion: 'deterministic_daily_revenue_v2',
      generatedAt: input.asOf.toISOString(),
      historyStart: historyStartDate.toISOString(),
      historyEnd: new Date(historyEndDate.getTime() + 86_400_000 - 1).toISOString(),
      forecastStart: forecastStart.toISOString(),
      forecastEnd: forecastEnd.toISOString(),
      historyWindowDays,
      sampleDays,
      missingDays,
      duplicateBusinessDateCount,
      trustedDays,
      dataCoverageRate,
      reconciliationRate,
      latestSettlementDate,
      freshnessDays,
      forecastDays,
      averageDailyRevenue,
      estimatedRevenue,
      lowerBound,
      upperBound,
      confidence,
      confidenceLabel,
      backtest,
      methodology: '最近 28 个可用营业日日结流水均值外推，并使用历史滚动均值回测误差、数据覆盖率、对账通过率和数据新鲜度共同计算置信度与区间。',
      limitations,
    };
  }

  private isTrustedSettlement(settlement: { status: string; reconciliationStatus: string }) {
    return settlement.status === 'confirmed' && settlement.reconciliationStatus === 'passed';
  }

  private backtestRevenue(values: number[]): BrainRevenueForecastBaseline['backtest'] {
    const minimumTrainingDays = 14;
    if (values.length <= minimumTrainingDays) {
      return { status: 'insufficient', evaluationDays: 0, meanAbsoluteError: null, weightedAbsolutePercentageError: null, accuracyRate: null };
    }
    const errors: number[] = [];
    let actualTotal = 0;
    for (let index = minimumTrainingDays; index < values.length; index += 1) {
      const training = values.slice(Math.max(0, index - 28), index);
      const predicted = training.reduce((sum, value) => sum + value, 0) / training.length;
      const actual = values[index];
      errors.push(Math.abs(actual - predicted));
      actualTotal += Math.abs(actual);
    }
    const meanAbsoluteError = errors.reduce((sum, value) => sum + value, 0) / errors.length;
    const weightedAbsolutePercentageError = actualTotal > 0
      ? errors.reduce((sum, value) => sum + value, 0) / actualTotal
      : meanAbsoluteError === 0 ? 0 : 1;
    return {
      status: errors.length >= 14 ? 'available' : 'limited',
      evaluationDays: errors.length,
      meanAbsoluteError,
      weightedAbsolutePercentageError,
      accuracyRate: Math.max(0, Math.min(1, 1 - weightedAbsolutePercentageError)),
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
