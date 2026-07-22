import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FinanceMetricsService } from '../finance-metrics/finance-metrics.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { STORE_METRIC_DEFINITION_BY_KEY, STORE_METRIC_DEFINITIONS, STORE_METRIC_KEYS, STORE_METRIC_TARGET_KEYS } from './store-metric-definitions.js';
import type {
  StoreMetricAlert,
  StoreMetricDefinition,
  StoreMetricQualityStatus,
  StoreMetricsOverview,
  StoreMetricValue,
} from './store-metrics.types.js';
import type { CreateStoreMetricTargetDto, StoreMetricDrilldownDto, StoreMetricTrendDto, UpdateStoreMetricTargetDto } from './dto.js';

type DateRange = { key: string; start: Date; end: Date };
type RatioResult = { numerator: number; denominator: number; quality?: StoreMetricQualityStatus; reasons?: string[] };

@Injectable()
export class StoreMetricsService {
  private readonly cache = new Map<string, { expiresAt: number; value: StoreMetricsOverview }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly financeMetrics: FinanceMetricsService,
  ) {}

  listDefinitions(): readonly StoreMetricDefinition[] {
    return STORE_METRIC_DEFINITIONS;
  }

  async getOverview(storeId: number, dateInput?: string, options: { cache?: boolean; persist?: boolean; dailyFinance?: any; monthlyFinance?: any; confirmedSnapshot?: boolean } = {}): Promise<StoreMetricsOverview> {
    if (!Number.isInteger(storeId) || storeId < 1) throw new BadRequestException('门店 ID 无效');
    const range = this.dayRange(dateInput);
    const cacheKey = `${storeId}:${range.key}`;
    const cached = options.cache === false ? undefined : this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const store = await this.prisma.store.findFirst({ where: { id: storeId, deletedAt: null }, select: { id: true, name: true } });
    if (!store) throw new NotFoundException('门店不存在');

    const month = this.monthRange(range.start);
    const confirmedSnapshot = options.confirmedSnapshot === undefined
      ? await this.prisma.dailySettlementSnapshot.findFirst({
          where: { storeId, settleDate: { gte: range.start, lt: range.end }, supersededAt: null },
          select: { id: true },
        })
      : options.confirmedSnapshot ? { id: -1 } : null;
    const [dailyFinance, monthlyFinance, arrival, conversion, repurchase, rebooking, noShow, utilization, renewal, target] = await Promise.all([
      options.dailyFinance ?? this.financeMetrics.getDailyMetrics({ storeId, dateFrom: range.key, dateTo: range.key, mode: confirmedSnapshot ? 'confirmed' : 'live' }),
      options.monthlyFinance ?? this.financeMetrics.getDailyMetrics({ storeId, dateFrom: month.startKey, dateTo: range.key, mode: 'live' }),
      this.firstVisitArrival(storeId, range),
      this.firstVisitConversion(storeId, range),
      this.newCustomerRepurchase(storeId, range),
      this.checkoutRebooking(storeId, range),
      this.noShowRate(storeId, range),
      this.staffUtilization(storeId, range),
      this.memberRenewal(storeId, month.start, month.end),
      this.resolveMonthlyTarget(storeId, month.start, month.end),
    ]);

    const now = new Date().toISOString();
    const financeQuality = confirmedSnapshot
      ? { status: 'frozen' as StoreMetricQualityStatus, reasons: [] }
      : this.financeQuality(dailyFinance.summary.dataQuality?.status, dailyFinance.summary.dataQuality?.missingReasons ?? []);
    const paidRevenue = this.metric(STORE_METRIC_KEYS.paidRevenue, dailyFinance.summary.cashIncome, dailyFinance.summary.cashIncome, null, dailyFinance.summary.orderCount, financeQuality.status, financeQuality.reasons, now, null);
    const operatingRevenue = this.metric(STORE_METRIC_KEYS.operatingRevenue, dailyFinance.summary.operatingRevenue, dailyFinance.summary.operatingRevenue, null, dailyFinance.summary.orderCount, financeQuality.status, financeQuality.reasons, now, null);
    const grossMargin = this.metric(STORE_METRIC_KEYS.grossMarginRate, dailyFinance.summary.operatingRevenue > 0 ? dailyFinance.summary.grossMargin : null, dailyFinance.summary.grossProfit, dailyFinance.summary.operatingRevenue, dailyFinance.summary.orderCount, financeQuality.status, financeQuality.reasons, now, null);
    const monthlyActual = monthlyFinance.summary.operatingRevenue;
    const targetValue = target?.targetValue ?? null;
    const targetRate = targetValue && targetValue > 0 ? monthlyActual / targetValue : null;

    const metrics: StoreMetricValue[] = [
      paidRevenue,
      operatingRevenue,
      grossMargin,
      this.ratioMetric(STORE_METRIC_KEYS.firstVisitArrivalRate, arrival, now),
      this.ratioMetric(STORE_METRIC_KEYS.firstVisitConversionRate, conversion, now),
      this.ratioMetric(STORE_METRIC_KEYS.newCustomer30dRepurchaseRate, repurchase, now),
      this.ratioMetric(STORE_METRIC_KEYS.checkoutRebookingRate, rebooking, now),
      this.ratioMetric(STORE_METRIC_KEYS.noShowRate, noShow, now),
      this.ratioMetric(STORE_METRIC_KEYS.serviceTimeUtilizationRate, utilization, now),
      this.metric(
        STORE_METRIC_KEYS.revenuePerServiceHour,
        utilization.serviceRevenue !== null && utilization.actualMinutes > 0 ? utilization.serviceRevenue / (utilization.actualMinutes / 60) : null,
        utilization.serviceRevenue,
        utilization.actualMinutes > 0 ? utilization.actualMinutes / 60 : null,
        utilization.taskCount,
        utilization.revenueQuality,
        utilization.revenueReasons,
        now,
        null,
      ),
      this.ratioMetric(STORE_METRIC_KEYS.memberRenewalRate, renewal, now),
      this.metric(
        STORE_METRIC_KEYS.monthlyTargetCompletionRate,
        targetRate,
        monthlyActual,
        targetValue,
        monthlyFinance.summary.orderCount,
        targetRate === null ? 'unavailable' : financeQuality.status,
        targetRate === null ? ['monthly_target_missing'] : financeQuality.reasons,
        now,
        targetValue,
      ),
    ];

    const overview: StoreMetricsOverview = {
      scope: { storeId, storeName: store.name, timezone: 'Asia/Shanghai', date: range.key },
      metrics,
      alerts: this.buildAlerts(metrics),
      generatedAt: now,
    };
    if (options.cache !== false) this.cache.set(cacheKey, { expiresAt: Date.now() + 5 * 60 * 1000, value: overview });
    if (options.persist !== false) void this.persistSnapshots(storeId, range.start, metrics).catch(() => undefined);
    return overview;
  }

  async rebuildSnapshot(storeId: number, date: string, options: { dailyFinance?: any; monthlyFinance?: any; confirmedSnapshot?: boolean } = {}) {
    const overview = await this.getOverview(storeId, date, { cache: false, persist: false, ...options });
    await this.persistSnapshots(storeId, this.dayRange(date).start, overview.metrics);
    return overview;
  }

  async getTrends(query: StoreMetricTrendDto & { storeId: number }) {
    const keys = query.metricKeys.split(',').map((item) => item.trim()).filter(Boolean);
    this.assertMetricKeys(keys);
    const rows = await (this.prisma as any).storeMetricSnapshot.findMany({
      where: {
        storeId: query.storeId,
        metricKey: { in: keys },
        metricDate: { gte: new Date(query.from), lte: new Date(query.to) },
        granularity: query.granularity ?? 'day',
      },
      orderBy: [{ metricDate: 'asc' }, { metricKey: 'asc' }],
    });
    return {
      items: rows.map((row: any) => ({
        metricKey: row.metricKey,
        date: this.dateKey(row.metricDate),
        value: this.toNullableNumber(row.value),
        numerator: this.toNullableNumber(row.numerator),
        denominator: this.toNullableNumber(row.denominator),
        sampleCount: row.sampleCount ?? 0,
        quality: { status: row.qualityStatus, reasons: this.stringArray(row.qualityReasons) },
        definitionVersion: row.definitionVersion,
      })),
      total: rows.length,
    };
  }

  async getDrilldown(metricKey: string, query: StoreMetricDrilldownDto & { storeId: number }) {
    this.assertMetricKeys([metricKey]);
    const range = this.customRange(query.from ?? query.date, query.to ?? query.date);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;
    let items: unknown[] = [];
    let total = 0;

    if ([STORE_METRIC_KEYS.paidRevenue, STORE_METRIC_KEYS.operatingRevenue, STORE_METRIC_KEYS.grossMarginRate].includes(metricKey as any)) {
      const [payments, paymentCount, refunds] = await Promise.all([
        this.prisma.paymentRecord.findMany({ where: { paidAt: { gte: range.start, lt: range.end }, order: { storeId: query.storeId } }, include: { order: { select: { orderNo: true, customerName: true } } }, orderBy: { paidAt: 'desc' }, skip, take: pageSize }),
        this.prisma.paymentRecord.count({ where: { paidAt: { gte: range.start, lt: range.end }, order: { storeId: query.storeId } } }),
        this.prisma.refundRecord.findMany({ where: { refundedAt: { gte: range.start, lt: range.end }, order: { storeId: query.storeId } }, include: { order: { select: { orderNo: true, customerName: true } } }, orderBy: { refundedAt: 'desc' }, take: pageSize }),
      ]);
      items = [...payments.map((item) => ({ type: 'payment', ...item })), ...refunds.map((item) => ({ type: 'refund', ...item }))];
      total = paymentCount + refunds.length;
    } else if (metricKey.startsWith('customer.') || metricKey.startsWith('reservation.')) {
      [items, total] = await Promise.all([
        this.prisma.reservation.findMany({ where: { storeId: query.storeId, date: { gte: range.start, lt: range.end } }, include: { customer: { select: { id: true, name: true, source: true } }, project: { select: { id: true, name: true } }, beautician: { select: { id: true, name: true } } }, orderBy: { date: 'desc' }, skip, take: pageSize }),
        this.prisma.reservation.count({ where: { storeId: query.storeId, date: { gte: range.start, lt: range.end } } }),
      ]);
    } else if (metricKey.startsWith('staff.')) {
      [items, total] = await Promise.all([
        this.prisma.serviceTask.findMany({ where: { storeId: query.storeId, appointmentTime: { gte: range.start, lt: range.end } }, include: { beautician: { select: { id: true, name: true } }, project: { select: { id: true, name: true } } }, orderBy: { appointmentTime: 'desc' }, skip, take: pageSize }),
        this.prisma.serviceTask.count({ where: { storeId: query.storeId, appointmentTime: { gte: range.start, lt: range.end } } }),
      ]);
    } else if (metricKey === STORE_METRIC_KEYS.memberRenewalRate) {
      [items, total] = await Promise.all([
        this.prisma.customerCard.findMany({ where: { customer: { storeId: query.storeId }, expiryDate: { gte: range.start, lt: range.end } }, include: { customer: { select: { id: true, name: true } }, renewedCustomerCards: true }, orderBy: { expiryDate: 'asc' }, skip, take: pageSize }),
        this.prisma.customerCard.count({ where: { customer: { storeId: query.storeId }, expiryDate: { gte: range.start, lt: range.end } } }),
      ]);
    }
    const overview = await this.getOverview(query.storeId, query.date ?? query.from);
    return { metric: overview.metrics.find((item) => item.key === metricKey), items, total, page, pageSize };
  }

  async listTargets(storeId: number, period?: string) {
    const start = period ? new Date(`${period}-01T00:00:00+08:00`) : this.monthRange(new Date()).start;
    const end = this.monthRange(start).end;
    return (this.prisma as any).storeMetricTarget.findMany({ where: { storeId, periodStart: { gte: start, lt: end } }, orderBy: { metricKey: 'asc' } });
  }

  async createTarget(dto: CreateStoreMetricTargetDto, userId?: number) {
    this.assertTargetKeys([dto.metricKey]);
    this.invalidate(dto.storeId);
    return (this.prisma as any).storeMetricTarget.create({ data: { ...dto, periodStart: new Date(dto.periodStart), periodEnd: new Date(dto.periodEnd), createdById: userId } });
  }

  async updateTarget(id: number, dto: UpdateStoreMetricTargetDto) {
    const existing = await (this.prisma as any).storeMetricTarget.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('指标目标不存在');
    this.invalidate(existing.storeId);
    return (this.prisma as any).storeMetricTarget.update({ where: { id }, data: dto });
  }

  async updateTargetForStores(id: number, dto: UpdateStoreMetricTargetDto, allowedStores: number[] | '*') {
    const existing = await (this.prisma as any).storeMetricTarget.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('指标目标不存在');
    if (allowedStores !== '*' && !allowedStores.includes(existing.storeId)) throw new BadRequestException('无权修改该门店指标目标');
    this.invalidate(existing.storeId);
    return (this.prisma as any).storeMetricTarget.update({ where: { id }, data: dto });
  }

  async getQuality(storeId: number, date?: string) {
    const overview = await this.getOverview(storeId, date);
    const items = overview.metrics.filter((item) => item.quality.status !== 'complete' && item.quality.status !== 'frozen');
    return { items, total: items.length, generatedAt: overview.generatedAt };
  }

  invalidate(storeId: number) {
    for (const key of this.cache.keys()) if (key.startsWith(`${storeId}:`)) this.cache.delete(key);
  }

  private async firstVisitArrival(storeId: number, range: DateRange): Promise<RatioResult> {
    const reservations = await this.prisma.reservation.findMany({ where: { storeId, date: { gte: range.start, lt: range.end }, status: { not: 'cancelled' } }, orderBy: { date: 'asc' } });
    const customerIds = [...new Set(reservations.map((item) => item.customerId))];
    if (!customerIds.length) return { numerator: 0, denominator: 0, quality: 'unavailable', reasons: ['no_first_reservation_sample'] };
    const [priorVisits, priorOrders, priorUsages] = await Promise.all([
      this.prisma.reservation.findMany({ where: { storeId, customerId: { in: customerIds }, date: { lt: range.start }, OR: [{ checkedInAt: { not: null } }, { status: { in: ['checked_in', 'completed'] } }] }, select: { customerId: true } }),
      this.prisma.productOrder.findMany({ where: { storeId, customerId: { in: customerIds }, createdAt: { lt: range.start }, status: { in: ['completed', 'paid', 'refunded', '已完成', '已付款'] } }, select: { customerId: true } }),
      this.prisma.cardUsageRecord.findMany({ where: { storeId, customerId: { in: customerIds }, verifiedAt: { lt: range.start } }, select: { customerId: true } }),
    ]);
    const prior = new Set([...priorVisits, ...priorOrders, ...priorUsages].map((item) => Number(item.customerId)));
    const firstByCustomer = new Map<number, (typeof reservations)[number]>();
    for (const item of reservations) if (!prior.has(item.customerId) && !firstByCustomer.has(item.customerId)) firstByCustomer.set(item.customerId, item);
    const samples = [...firstByCustomer.values()];
    const numerator = samples.filter((item) => item.checkedInAt || ['checked_in', 'completed'].includes(item.status)).length;
    const estimated = samples.some((item) => ['checked_in', 'completed'].includes(item.status) && !item.checkedInAt);
    return { numerator, denominator: samples.length, quality: estimated ? 'estimated' : 'complete', reasons: estimated ? ['legacy_checked_in_time_missing'] : [] };
  }

  private async firstVisitConversion(storeId: number, range: DateRange): Promise<RatioResult> {
    const reservations = await this.prisma.reservation.findMany({ where: { storeId, date: { gte: range.start, lt: range.end }, OR: [{ checkedInAt: { not: null } }, { status: { in: ['checked_in', 'completed'] } }] }, orderBy: { date: 'asc' } });
    const customerIdsInRange = [...new Set(reservations.map((item) => item.customerId))];
    const [priorVisits, priorOrders, priorUsages] = customerIdsInRange.length ? await Promise.all([
      this.prisma.reservation.findMany({ where: { storeId, customerId: { in: customerIdsInRange }, date: { lt: range.start }, OR: [{ checkedInAt: { not: null } }, { status: { in: ['checked_in', 'completed'] } }] }, select: { customerId: true } }),
      this.prisma.productOrder.findMany({ where: { storeId, customerId: { in: customerIdsInRange }, createdAt: { lt: range.start }, status: { in: ['completed', 'paid', 'refunded', '已完成', '已付款'] } }, select: { customerId: true } }),
      this.prisma.cardUsageRecord.findMany({ where: { storeId, customerId: { in: customerIdsInRange }, verifiedAt: { lt: range.start } }, select: { customerId: true } }),
    ]) : [[], [], []];
    const priorCustomers = new Set([...priorVisits, ...priorOrders, ...priorUsages].map((item) => Number(item.customerId)));
    const first = new Map<number, (typeof reservations)[number]>();
    for (const item of reservations) if (!priorCustomers.has(item.customerId) && !first.has(item.customerId)) first.set(item.customerId, item);
    const samples = [...first.values()];
    if (!samples.length) return { numerator: 0, denominator: 0, quality: 'unavailable', reasons: ['no_first_arrival_sample'] };
    const ids = samples.map((item) => item.id);
    const customerIds = samples.map((item) => item.customerId);
    const explicit = await this.prisma.orderItem.findMany({ where: { reservationId: { in: ids }, netAmount: { gt: 0 }, recognizedAt: { gte: range.start, lt: new Date(range.end.getTime() + 24 * 60 * 60 * 1000) }, order: { storeId } }, select: { reservationId: true } });
    const converted = new Set(explicit.map((item) => Number(item.reservationId)));
    let estimated = false;
    if (converted.size < samples.length) {
      const fallback = await this.prisma.productOrder.findMany({ where: { storeId, customerId: { in: customerIds }, netAmount: { gt: 0 }, createdAt: { gte: range.start, lt: new Date(range.end.getTime() + 24 * 60 * 60 * 1000) }, status: { in: ['completed', 'paid', 'refunded', '已完成', '已付款'] } }, select: { customerId: true, createdAt: true } });
      for (const sample of samples) {
        if (converted.has(sample.id)) continue;
        const arrivalAt = sample.checkedInAt ?? sample.date;
        if (fallback.some((order) => order.customerId === sample.customerId && order.createdAt >= arrivalAt && order.createdAt.getTime() <= arrivalAt.getTime() + 24 * 60 * 60 * 1000)) {
          converted.add(sample.id);
          estimated = true;
        }
      }
    }
    return { numerator: converted.size, denominator: samples.length, quality: estimated ? 'estimated' : 'complete', reasons: estimated ? ['legacy_order_reservation_inferred'] : [] };
  }

  private async newCustomerRepurchase(storeId: number, range: DateRange): Promise<RatioResult> {
    const asOf = range.end;
    const cohortStart = new Date(asOf.getTime() - 60 * 24 * 60 * 60 * 1000);
    const cohortEnd = new Date(asOf.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [orders, cardUsages] = await Promise.all([
      this.prisma.productOrder.findMany({ where: { storeId, customerId: { not: null }, status: { in: ['completed', 'paid', 'refunded', '已完成', '已付款'] }, createdAt: { lt: asOf }, netAmount: { gt: 0 } }, select: { id: true, customerId: true, createdAt: true, paymentRecords: { where: { status: { in: ['success', 'completed', 'paid'] } }, select: { paidAt: true, createdAt: true } } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.cardUsageRecord.findMany({ where: { storeId, verifiedAt: { lt: asOf }, recognizedAmount: { gt: 0 } }, select: { customerId: true, verifiedAt: true } }),
    ]);
    const events = new Map<number, Date[]>();
    for (const order of orders) {
      if (!order.customerId) continue;
      const time = order.paymentRecords[0]?.paidAt ?? order.paymentRecords[0]?.createdAt ?? order.createdAt;
      const list = events.get(order.customerId) ?? [];
      list.push(time);
      events.set(order.customerId, list);
    }
    for (const usage of cardUsages) {
      const list = events.get(usage.customerId) ?? [];
      list.push(usage.verifiedAt);
      events.set(usage.customerId, list);
    }
    for (const dates of events.values()) dates.sort((a, b) => a.getTime() - b.getTime());
    const cohort = [...events.entries()].filter(([, dates]) => dates[0] >= cohortStart && dates[0] < cohortEnd);
    const repurchased = cohort.filter(([, dates]) => dates.slice(1).some((date) => date.getTime() <= dates[0].getTime() + 30 * 24 * 60 * 60 * 1000)).length;
    return { numerator: repurchased, denominator: cohort.length, quality: cohort.length ? 'complete' : 'unavailable', reasons: cohort.length ? [] : ['no_complete_30d_cohort'] };
  }

  private async checkoutRebooking(storeId: number, range: DateRange): Promise<RatioResult> {
    const completed = await this.prisma.reservation.findMany({ where: { storeId, date: { gte: range.start, lt: range.end }, status: 'completed' }, include: { derivedReservations: true } });
    let estimated = false;
    let numerator = completed.filter((item) => item.derivedReservations.some((next) => next.bookingSource === 'checkout_rebook' && next.createdAt < range.end)).length;
    const missing = completed.filter((item) => !item.derivedReservations.length);
    if (missing.length) {
      const fallback = await this.prisma.reservation.findMany({ where: { storeId, customerId: { in: missing.map((item) => item.customerId) }, createdAt: { gte: range.start, lt: range.end }, date: { gte: range.end } } });
      numerator += missing.filter((item) => fallback.some((next) => next.customerId === item.customerId && next.createdAt >= item.updatedAt)).length;
      estimated = fallback.length > 0;
    }
    return { numerator, denominator: completed.length, quality: completed.length ? (estimated ? 'estimated' : 'complete') : 'unavailable', reasons: estimated ? ['legacy_rebooking_inferred'] : completed.length ? [] : ['no_completed_reservations'] };
  }

  private async noShowRate(storeId: number, range: DateRange): Promise<RatioResult> {
    const reservations = await this.prisma.reservation.findMany({ where: { storeId, date: { gte: range.start, lt: range.end }, status: { in: ['pending', 'confirmed', 'checked_in', 'completed', 'no_show', 'cancelled'] } } });
    const observedUntil = new Date(Math.min(Date.now(), range.end.getTime()));
    const included = reservations.filter((item) => {
      const appointment = this.reservationStart(item);
      if (appointment > observedUntil) return false;
      return item.status !== 'cancelled' || !item.cancelledAt || item.cancelledAt >= appointment;
    });
    const numerator = included.filter((item) => {
      const appointment = this.reservationStart(item);
      return item.status === 'no_show'
        || (item.status === 'cancelled' && (!item.cancelledAt || item.cancelledAt >= appointment))
        || (['pending', 'confirmed'].includes(item.status) && appointment < observedUntil);
    }).length;
    const estimated = included.some((item) => (item.status === 'no_show' && !item.noShowAt) || ['pending', 'confirmed'].includes(item.status))
      || reservations.some((item) => item.status === 'cancelled' && !item.cancelledAt);
    return { numerator, denominator: included.length, quality: included.length ? (estimated ? 'estimated' : 'complete') : 'unavailable', reasons: estimated ? ['legacy_status_event_time_missing'] : included.length ? [] : ['no_due_reservations'] };
  }

  private async staffUtilization(storeId: number, range: DateRange) {
    const [schedules, timeOffs, tasks, serviceItems, cardUsages] = await Promise.all([
      this.prisma.schedule.findMany({ where: { storeId, date: { gte: range.start, lt: range.end }, status: { in: ['available', 'working', 'published'] } } }),
      this.prisma.beauticianTimeOff.findMany({ where: { storeId, date: { gte: range.start, lt: range.end }, status: 'approved' } }),
      this.prisma.serviceTask.findMany({ where: { storeId, appointmentTime: { gte: range.start, lt: range.end }, status: 'completed' } }),
      this.prisma.orderItem.findMany({ where: { order: { storeId }, serviceTaskId: { not: null }, recognizedAt: { gte: range.start, lt: range.end }, netAmount: { gt: 0 } }, select: { netAmount: true, serviceTaskId: true } }),
      this.prisma.cardUsageRecord.findMany({ where: { storeId, serviceTaskId: { not: null }, verifiedAt: { gte: range.start, lt: range.end } }, select: { recognizedAmount: true, serviceTaskId: true } }),
    ]);
    const scheduleIntervals = new Map<number, Array<[number, number]>>();
    for (const item of schedules) this.pushInterval(scheduleIntervals, item.beauticianId, this.hhmm(item.startTime), this.hhmm(item.endTime));
    const timeOffIntervals = new Map<number, Array<[number, number]>>();
    for (const item of timeOffs) this.pushInterval(timeOffIntervals, item.beauticianId, this.hhmm(item.startTime), this.hhmm(item.endTime));
    let availableMinutes = 0;
    for (const [beauticianId, intervals] of scheduleIntervals) {
      const timeOff = timeOffIntervals.get(beauticianId) ?? [];
      availableMinutes += Math.max(0, this.intervalMinutes(intervals) - this.overlapMinutes(intervals, timeOff));
    }
    const taskIntervals = new Map<number, Array<[number, number]>>();
    let estimated = false;
    for (const task of tasks) {
      if (!task.beauticianId) continue;
      const start = task.startedAt?.getTime() ?? task.appointmentTime.getTime();
      const end = task.completedAt?.getTime() ?? start + task.duration * 60_000;
      if (!task.startedAt || !task.completedAt) estimated = true;
      this.pushInterval(taskIntervals, task.beauticianId, start, end);
    }
    let actualMinutes = 0;
    for (const intervals of taskIntervals.values()) actualMinutes += this.intervalMinutes(intervals) / 60_000;
    const explicitRevenue = [...serviceItems, ...cardUsages].reduce((sum, item: any) => sum + this.toNumber(item.netAmount ?? item.recognizedAmount), 0);
    return {
      numerator: actualMinutes,
      denominator: availableMinutes,
      quality: availableMinutes ? (estimated ? 'estimated' : 'complete') : 'unavailable' as StoreMetricQualityStatus,
      reasons: estimated ? ['planned_duration_used'] : availableMinutes ? [] : ['published_schedule_missing'],
      actualMinutes,
      serviceRevenue: explicitRevenue || null,
      taskCount: tasks.length,
      revenueQuality: explicitRevenue > 0 ? (estimated ? 'estimated' : 'complete') : 'unavailable' as StoreMetricQualityStatus,
      revenueReasons: explicitRevenue > 0 ? (estimated ? ['planned_duration_used'] : []) : ['service_revenue_lineage_missing'],
    };
  }

  private async memberRenewal(storeId: number, periodStart: Date, periodEnd: Date): Promise<RatioResult> {
    const eligible = await this.prisma.customerCard.findMany({ where: { customer: { storeId }, OR: [{ expiryDate: { gte: periodStart, lt: periodEnd } }, { status: 'active' }] }, include: { renewedCustomerCards: true, customer: { select: { id: true } } } });
    const candidates = eligible.filter((item) => item.expiryDate < periodEnd || item.remainingTimes <= Math.ceil(item.totalTimes * 0.2));
    let numerator = candidates.filter((item) => item.renewedCustomerCards.some((renewal) => renewal.saleType === 'renewal')).length;
    let estimated = false;
    for (const item of candidates) {
      if (item.renewedCustomerCards.length) continue;
      const inferred = eligible.some((next) => next.id !== item.id && next.customerId === item.customerId && next.cardId === item.cardId && next.createdAt >= new Date(item.expiryDate.getTime() - 30 * 24 * 60 * 60 * 1000) && next.createdAt <= new Date(item.expiryDate.getTime() + 30 * 24 * 60 * 60 * 1000));
      if (inferred) { numerator += 1; estimated = true; }
    }
    return { numerator, denominator: candidates.length, quality: candidates.length ? (estimated ? 'estimated' : 'complete') : 'unavailable', reasons: estimated ? ['legacy_renewal_inferred'] : candidates.length ? [] : ['no_renewal_candidates'] };
  }

  private async resolveMonthlyTarget(storeId: number, start: Date, end: Date) {
    const generic = await (this.prisma as any).storeMetricTarget.findFirst({ where: { storeId, metricKey: 'store.operating_revenue.month', periodType: 'month', periodStart: { gte: start, lt: end }, status: 'active' }, orderBy: { definitionVersion: 'desc' } });
    if (generic) return { targetValue: this.toNumber(generic.targetValue), source: 'store_metric_target' };
    const legacy = await this.prisma.brainStoreOperatingTarget.findFirst({ where: { storeId, periodType: 'month', periodStart: { gte: start, lt: end }, status: 'active' }, orderBy: { updatedAt: 'desc' } });
    return legacy ? { targetValue: this.toNumber(legacy.revenueTarget), source: 'brain_store_operating_target' } : null;
  }

  private metric(key: string, value: number | null, numerator: number | null, denominator: number | null, sampleCount: number, status: StoreMetricQualityStatus, reasons: string[], updatedAt: string, target: number | null): StoreMetricValue {
    const definition = STORE_METRIC_DEFINITION_BY_KEY.get(key)!;
    return { key, name: definition.name, value: value === null ? null : this.round(value), unit: definition.unit, numerator: numerator === null ? null : this.round(numerator), denominator: denominator === null ? null : this.round(denominator), sampleCount, target, targetCompletionRate: target && value !== null ? this.round(value / target, 4) : null, quality: { status: value === null && status === 'complete' ? 'unavailable' : status, reasons }, definitionVersion: definition.version, updatedAt, drilldownPath: definition.drilldownPath };
  }

  private ratioMetric(key: string, result: RatioResult, updatedAt: string) {
    const value = result.denominator > 0 ? result.numerator / result.denominator : null;
    return this.metric(key, value, result.numerator, result.denominator, result.denominator, result.quality ?? (value === null ? 'unavailable' : 'complete'), result.reasons ?? [], updatedAt, null);
  }

  private buildAlerts(metrics: StoreMetricValue[]): StoreMetricAlert[] {
    const threshold: Record<string, { warning: number; critical: number; direction: 'low' | 'high'; action: string }> = {
      [STORE_METRIC_KEYS.firstVisitArrivalRate]: { warning: 0.65, critical: 0.5, direction: 'low', action: '处理预约确认' },
      [STORE_METRIC_KEYS.firstVisitConversionRate]: { warning: 0.55, critical: 0.4, direction: 'low', action: '复盘新客接待' },
      [STORE_METRIC_KEYS.newCustomer30dRepurchaseRate]: { warning: 0.3, critical: 0.2, direction: 'low', action: '创建新客回访' },
      [STORE_METRIC_KEYS.checkoutRebookingRate]: { warning: 0.45, critical: 0.3, direction: 'low', action: '推进现场再预约' },
      [STORE_METRIC_KEYS.noShowRate]: { warning: 0.08, critical: 0.12, direction: 'high', action: '处理爽约风险' },
      [STORE_METRIC_KEYS.serviceTimeUtilizationRate]: { warning: 0.6, critical: 0.45, direction: 'low', action: '调整排班与空档' },
      [STORE_METRIC_KEYS.memberRenewalRate]: { warning: 0.55, critical: 0.4, direction: 'low', action: '跟进到期会员' },
    };
    return metrics.flatMap((metric) => {
      const rule = threshold[metric.key];
      if (!rule || metric.value === null || metric.sampleCount < 3) return [];
      const critical = rule.direction === 'low' ? metric.value < rule.critical : metric.value > rule.critical;
      const warning = rule.direction === 'low' ? metric.value < rule.warning : metric.value > rule.warning;
      if (!critical && !warning) return [];
      return [{ key: `alert:${metric.key}`, metricKey: metric.key, severity: critical ? 'critical' : 'warning', title: `${metric.name}${critical ? '严重偏离' : '需要关注'}`, detail: `当前值 ${this.formatValue(metric)}，样本 ${metric.sampleCount}。`, action: rule.action, path: metric.drilldownPath } as StoreMetricAlert];
    });
  }

  private async persistSnapshots(storeId: number, metricDate: Date, metrics: StoreMetricValue[]) {
    const client = this.prisma as any;
    if (!client.storeMetricSnapshot?.upsert) return;
    await Promise.all(metrics.map((metric) => client.storeMetricSnapshot.upsert({
      where: { storeId_metricKey_metricDate_granularity_definitionVersion: { storeId, metricKey: metric.key, metricDate, granularity: 'day', definitionVersion: metric.definitionVersion } },
      create: { storeId, metricKey: metric.key, metricDate, value: metric.value, numerator: metric.numerator, denominator: metric.denominator, sampleCount: metric.sampleCount, qualityStatus: metric.quality.status, qualityReasons: metric.quality.reasons, definitionVersion: metric.definitionVersion, calculationMode: metric.quality.status === 'frozen' ? 'confirmed' : 'live', sourceVersion: 'store_metrics_v1', frozenAt: metric.quality.status === 'frozen' ? new Date() : null },
      update: { value: metric.value, numerator: metric.numerator, denominator: metric.denominator, sampleCount: metric.sampleCount, qualityStatus: metric.quality.status, qualityReasons: metric.quality.reasons, calculationMode: metric.quality.status === 'frozen' ? 'confirmed' : 'live', sourceVersion: 'store_metrics_v1', frozenAt: metric.quality.status === 'frozen' ? new Date() : null, generatedAt: new Date() },
    })));
  }

  private financeQuality(status: string | undefined, reasons: unknown[]): { status: StoreMetricQualityStatus; reasons: string[] } {
    if (status === 'complete') return { status: 'complete', reasons: [] };
    if (status === 'estimated') return { status: 'estimated', reasons: reasons.map(String) };
    if (status === 'unavailable') return { status: 'unavailable', reasons: reasons.map(String) };
    return { status: 'partial', reasons: reasons.map(String) };
  }

  private dayRange(input?: string): DateRange {
    const key = input ? input.slice(0, 10) : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const start = new Date(`${key}T00:00:00+08:00`);
    if (Number.isNaN(start.getTime())) throw new BadRequestException('日期无效');
    return { key, start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
  }

  private customRange(from?: string, to?: string): DateRange {
    const first = this.dayRange(from);
    const last = this.dayRange(to ?? from);
    return { key: first.key, start: first.start, end: last.end };
  }

  private monthRange(date: Date) {
    const key = this.dateKey(date);
    const [year, month] = key.split('-').map(Number);
    const startKey = `${year}-${String(month).padStart(2, '0')}-01`;
    const start = new Date(`${startKey}T00:00:00+08:00`);
    const end = new Date(`${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01T00:00:00+08:00`);
    return { start, end, startKey };
  }

  private dateKey(date: Date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }

  private reservationStart(item: { date: Date; startTime: string }) {
    return new Date(`${this.dateKey(item.date)}T${item.startTime || '00:00'}:00+08:00`);
  }

  private pushInterval(map: Map<number, Array<[number, number]>>, id: number, start: number, end: number) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    const list = map.get(id) ?? [];
    list.push([start, end]);
    map.set(id, list);
  }

  private intervalMinutes(intervals: Array<[number, number]>) {
    if (!intervals.length) return 0;
    const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
    let total = 0;
    let [start, end] = sorted[0];
    for (const [nextStart, nextEnd] of sorted.slice(1)) {
      if (nextStart <= end) end = Math.max(end, nextEnd);
      else { total += end - start; start = nextStart; end = nextEnd; }
    }
    return total + end - start;
  }

  private hhmm(value: string) {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }

  private overlapMinutes(left: Array<[number, number]>, right: Array<[number, number]>) {
    const a = this.mergeIntervals(left);
    const b = this.mergeIntervals(right);
    let total = 0;
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      total += Math.max(0, Math.min(a[i][1], b[j][1]) - Math.max(a[i][0], b[j][0]));
      if (a[i][1] < b[j][1]) i += 1;
      else j += 1;
    }
    return total;
  }

  private mergeIntervals(intervals: Array<[number, number]>) {
    if (!intervals.length) return [] as Array<[number, number]>;
    const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [[sorted[0][0], sorted[0][1]]];
    for (const [start, end] of sorted.slice(1)) {
      const current = merged[merged.length - 1];
      if (start <= current[1]) current[1] = Math.max(current[1], end);
      else merged.push([start, end]);
    }
    return merged;
  }

  private assertMetricKeys(keys: string[]) {
    const missing = keys.filter((key) => !STORE_METRIC_DEFINITION_BY_KEY.has(key));
    if (missing.length) throw new BadRequestException(`未知指标：${missing.join(', ')}`);
  }

  private assertTargetKeys(keys: string[]) {
    const allowed = new Set(STORE_METRIC_TARGET_KEYS);
    const missing = keys.filter((key) => !allowed.has(key));
    if (missing.length) throw new BadRequestException(`未知目标指标：${missing.join(', ')}`);
  }

  private toNumber(value: unknown) { const number = Number(value ?? 0); return Number.isFinite(number) ? number : 0; }
  private toNullableNumber(value: unknown) { return value === null || value === undefined ? null : this.toNumber(value); }
  private round(value: number, digits = 2) { const factor = 10 ** digits; return Math.round((value + Number.EPSILON) * factor) / factor; }
  private stringArray(value: unknown) { return Array.isArray(value) ? value.map(String) : []; }
  private formatValue(metric: StoreMetricValue) { return metric.unit === 'percent' ? `${this.round((metric.value ?? 0) * 100, 1)}%` : `¥${this.round(metric.value ?? 0).toLocaleString()}`; }
}
