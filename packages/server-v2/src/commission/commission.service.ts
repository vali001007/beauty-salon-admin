import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto.js';
import { UpdateCommissionRuleDto } from './dto/update-commission-rule.dto.js';

type PrismaLike = PrismaService | any;

type CommissionRuleReferenceInput = Pick<CreateCommissionRuleDto, 'type' | 'targetType'> & {
  targetId?: number | null;
  levelId?: number | null;
};

export type CalculateCommissionParams = {
  storeId: number;
  beauticianId: number;
  orderId?: number;
  orderItemId?: number;
  type: 'project' | 'product' | 'card_sale' | 'recharge' | 'new_customer';
  itemId?: number;
  categoryId?: number;
  sourceAmount: number;
  serviceFee?: number;
  profit?: number;
  isDesignated?: boolean;
  levelId?: number;
  remark?: string;
};

export type CalculateOrderCommissionsParams = {
  storeId: number;
  orderId: number;
  beauticianId: number;
  levelId?: number;
  isDesignated?: boolean;
  items: Array<{
    itemType: string;
    itemId?: number | null;
    categoryId?: number | null;
    subtotal: number;
    orderItemId?: number;
    serviceFee?: number;
    profit?: number;
  }>;
};

export type RecordAmiContributionParams = {
  storeId: number;
  category: string;
  triggerType: string;
  triggerId?: number;
  customerId?: number | null;
  orderId?: number | null;
  revenueAmount?: number;
  commissionRate?: number;
  workMinutes?: number;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
};

const TARGET_TYPE_WEIGHT: Record<string, number> = {
  specific: 3,
  category: 2,
  all: 1,
};

const DEFAULT_AMI_BASE_FEE = 699;

@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name);

  constructor(private prisma: PrismaService) {}

  private db(client: PrismaLike = this.prisma): PrismaLike {
    return client as PrismaLike;
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  private toCsvValue(value: unknown) {
    if (value === null || value === undefined) return '';
    const text = value instanceof Date ? value.toISOString() : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  private buildCsv(rows: Array<Record<string, unknown>>, columns: Array<{ key: string; header: string }>) {
    const header = columns.map((column) => this.toCsvValue(column.header)).join(',');
    const body = rows.map((row) => columns.map((column) => this.toCsvValue(row[column.key])).join(','));
    return [header, ...body].join('\r\n');
  }

  private asStoreId(storeId?: number | string) {
    const normalized = this.toNumber(storeId);
    if (!normalized || normalized <= 0) throw new BadRequestException('缺少门店 ID');
    return normalized;
  }

  private getSettleMonth(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private getPreviousSettleMonth(date = new Date()) {
    return this.getSettleMonth(new Date(date.getFullYear(), date.getMonth() - 1, 1));
  }

  private padMonth(month: number) {
    return String(month).padStart(2, '0');
  }

  private getMonthRangeForPeriod(period: string = 'month', value?: string) {
    const now = new Date();
    if (period === 'year') {
      const year = Number(value ?? now.getFullYear());
      if (!Number.isFinite(year) || year < 2000) throw new BadRequestException('年份格式应为 YYYY');
      return Array.from({ length: 12 }, (_, index) => `${year}-${this.padMonth(index + 1)}`);
    }

    if (period === 'quarter') {
      const fallbackQuarter = Math.floor(now.getMonth() / 3) + 1;
      const match = String(value ?? `${now.getFullYear()}-Q${fallbackQuarter}`).match(/^(\d{4})-Q([1-4])$/);
      if (!match) throw new BadRequestException('季度格式应为 YYYY-Qn');
      const year = Number(match[1]);
      const quarter = Number(match[2]);
      const startMonth = (quarter - 1) * 3 + 1;
      return Array.from({ length: 3 }, (_, index) => `${year}-${this.padMonth(startMonth + index)}`);
    }

    const month = value ?? this.getSettleMonth();
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('月份格式应为 YYYY-MM');
    return [month];
  }

  private getAmiCommissionRate(category: string, inputRate?: number) {
    if (inputRate !== undefined && inputRate !== null) return this.toNumber(inputRate);
    if (category === 'churn_recovery') return 0.1;
    if (category === 'card_renewal') return 0.05;
    if (category === 'marketing_conversion') return 0.08;
    return 0;
  }

  private serializeRule(rule: any) {
    if (!rule) return rule;
    return {
      ...rule,
      rate: this.toNumber(rule.rate),
      fixedAmount: rule.fixedAmount === null || rule.fixedAmount === undefined ? undefined : this.toNumber(rule.fixedAmount),
      designatedBonus:
        rule.designatedBonus === null || rule.designatedBonus === undefined ? undefined : this.toNumber(rule.designatedBonus),
      minThreshold: rule.minThreshold === null || rule.minThreshold === undefined ? undefined : this.toNumber(rule.minThreshold),
    };
  }

  private serializeRecord(record: any) {
    if (!record) return record;
    return {
      ...record,
      sourceAmount: this.toNumber(record.sourceAmount),
      rate: this.toNumber(record.rate),
      amount: this.toNumber(record.amount),
      beauticianName: record.beautician?.name,
      storeName: record.store?.name,
      orderNo: record.order?.orderNo,
      ruleName: record.rule?.name,
    };
  }

  private getCommissionTypeLabel(type?: string) {
    const labels: Record<string, string> = {
      project: '项目服务',
      product: '商品销售',
      card_sale: '次卡开卡',
      recharge: '会员充值',
      other: '其他',
    };
    return labels[type || ''] || type || '其他';
  }

  private serializeSettlement(settlement: any) {
    if (!settlement) return settlement;
    return {
      ...settlement,
      projectAmount: this.toNumber(settlement.projectAmount),
      productAmount: this.toNumber(settlement.productAmount),
      cardSaleAmount: this.toNumber(settlement.cardSaleAmount),
      rechargeAmount: this.toNumber(settlement.rechargeAmount),
      otherAmount: this.toNumber(settlement.otherAmount),
      totalAmount: this.toNumber(settlement.totalAmount),
      deductions: this.toNumber(settlement.deductions),
      netAmount: this.toNumber(settlement.netAmount),
      beauticianName: settlement.beautician?.name,
      storeName: settlement.store?.name,
    };
  }

  private serializeCashierShift(shift: any) {
    if (!shift) return shift;
    return {
      ...shift,
      openingCash: this.toNumber(shift.openingCash),
      closingCash: shift.closingCash === null || shift.closingCash === undefined ? undefined : this.toNumber(shift.closingCash),
      systemCash: shift.systemCash === null || shift.systemCash === undefined ? undefined : this.toNumber(shift.systemCash),
      cashDiff: shift.cashDiff === null || shift.cashDiff === undefined ? undefined : this.toNumber(shift.cashDiff),
      storeName: shift.store?.name,
      deviceName: shift.device?.name,
      operatorName: shift.operator?.name,
      alertLevel: Math.abs(this.toNumber(shift.cashDiff)) > 50 ? 'warning' : 'normal',
    };
  }

  private serializeDailySettlement(settlement: any) {
    if (!settlement) return settlement;
    return {
      ...settlement,
      totalRevenue: this.toNumber(settlement.totalRevenue),
      cashRevenue: this.toNumber(settlement.cashRevenue),
      wechatRevenue: this.toNumber(settlement.wechatRevenue),
      alipayRevenue: this.toNumber(settlement.alipayRevenue),
      cardRevenue: this.toNumber(settlement.cardRevenue),
      balanceRevenue: this.toNumber(settlement.balanceRevenue),
      rechargeIncome: this.toNumber(settlement.rechargeIncome),
      refundAmount: this.toNumber(settlement.refundAmount),
      avgTransaction: this.toNumber(settlement.avgTransaction),
      materialCost: this.toNumber(settlement.materialCost),
      grossProfit: this.toNumber(settlement.grossProfit),
      grossMargin: this.toNumber(settlement.grossMargin),
      commissionTotal: this.toNumber(settlement.commissionTotal),
      storeName: settlement.store?.name,
    };
  }

  private serializeAmiPerformanceRecord(record: any) {
    if (!record) return record;
    return {
      ...record,
      revenueAmount: record.revenueAmount === null || record.revenueAmount === undefined ? undefined : this.toNumber(record.revenueAmount),
      commissionRate: record.commissionRate === null || record.commissionRate === undefined ? undefined : this.toNumber(record.commissionRate),
      commissionAmount:
        record.commissionAmount === null || record.commissionAmount === undefined ? undefined : this.toNumber(record.commissionAmount),
      storeName: record.store?.name,
      customerName: record.customer?.name,
      orderNo: record.order?.orderNo,
    };
  }

  private serializeAmiMonthlyBill(bill: any) {
    if (!bill) return bill;
    return {
      ...bill,
      baseFee: this.toNumber(bill.baseFee),
      commissionFee: this.toNumber(bill.commissionFee),
      totalFee: this.toNumber(bill.totalFee),
      revenueGenerated: this.toNumber(bill.revenueGenerated),
      roi: bill.roi === null || bill.roi === undefined ? undefined : this.toNumber(bill.roi),
      storeName: bill.store?.name,
    };
  }

  private normalizeDay(dateInput: string | Date) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('日期格式不正确');
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private getYesterday(date = new Date()) {
    return this.addDays(this.normalizeDay(date), -1);
  }

  private normalizePaymentMethod(method?: string | null) {
    const value = String(method ?? 'other').toLowerCase();
    if (['wechat', 'weixin', 'wx'].includes(value)) return 'wechat';
    if (['alipay', 'ali'].includes(value)) return 'alipay';
    if (['cash', '现金'].includes(value)) return 'cash';
    if (['card', 'bank_card', 'bankcard'].includes(value)) return 'card';
    if (['member_balance', 'balance', 'stored_value'].includes(value)) return 'member_balance';
    if (['customer_card', 'member_card'].includes(value)) return 'customer_card';
    return value || 'other';
  }

  private emptyPaymentSummary() {
    return {
      cash: 0,
      wechat: 0,
      alipay: 0,
      card: 0,
      member_balance: 0,
      customer_card: 0,
      other: 0,
      refund: 0,
      total: 0,
    };
  }

  private addPayment(summary: Record<string, number>, method: string | null | undefined, amount: unknown) {
    const key = this.normalizePaymentMethod(method);
    const value = this.toNumber(amount);
    if (key in summary) summary[key] += value;
    else summary.other += value;
    summary.total += value;
  }

  async recordAmiContribution(params: RecordAmiContributionParams, client: PrismaLike = this.prisma) {
    const storeId = this.toNumber(params.storeId);
    if (storeId <= 0 || !params.category || !params.triggerType) return null;

    const triggerId = params.triggerId === undefined || params.triggerId === null ? undefined : this.toNumber(params.triggerId);
    const occurredAt = params.occurredAt ?? new Date();
    const revenueAmount = this.toNumber(params.revenueAmount);
    const commissionRate = this.getAmiCommissionRate(params.category, params.commissionRate);
    const commissionAmount = revenueAmount > 0 && commissionRate > 0 ? Math.round(revenueAmount * commissionRate * 100) / 100 : 0;
    const workMinutes = this.toNumber(params.workMinutes);
    if (revenueAmount <= 0 && workMinutes <= 0) return null;

    const db = this.db(client);
    if (triggerId !== undefined && triggerId > 0) {
      const oneDayAgo = new Date(occurredAt.getTime() - 24 * 60 * 60 * 1000);
      const existed = await db.amiPerformanceRecord.findFirst({
        where: {
          storeId,
          category: params.category,
          triggerType: params.triggerType,
          triggerId,
          occurredAt: { gte: oneDayAgo },
        },
      });
      if (existed) return existed;
    }

    return db.amiPerformanceRecord.create({
      data: {
        storeId,
        category: params.category,
        triggerType: params.triggerType,
        triggerId: triggerId && triggerId > 0 ? triggerId : undefined,
        customerId: this.toNumber(params.customerId) || undefined,
        orderId: this.toNumber(params.orderId) || undefined,
        revenueAmount: revenueAmount > 0 ? revenueAmount : undefined,
        commissionRate: commissionRate > 0 ? commissionRate : undefined,
        commissionAmount: commissionAmount > 0 ? commissionAmount : undefined,
        workMinutes: workMinutes > 0 ? workMinutes : undefined,
        occurredAt,
        settleMonth: this.getSettleMonth(occurredAt),
        metadata: params.metadata,
      },
    });
  }

  async getAmiPerformanceRecords(query: {
    page?: number | string;
    pageSize?: number | string;
    storeId?: number | string;
    settleMonth?: string;
    category?: string;
  }) {
    const page = Math.max(1, this.toNumber(query.page) || 1);
    const pageSize = Math.max(1, this.toNumber(query.pageSize) || 20);
    const where: any = {};
    const storeId = this.toNumber(query.storeId);
    if (storeId > 0) where.storeId = storeId;
    if (query.settleMonth) where.settleMonth = query.settleMonth;
    if (query.category) where.category = query.category;

    const [items, total] = await Promise.all([
      this.prisma.amiPerformanceRecord.findMany({
        where,
        include: {
          store: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
          order: { select: { id: true, orderNo: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { occurredAt: 'desc' },
      }),
      this.prisma.amiPerformanceRecord.count({ where }),
    ]);
    const normalizedItems = items.map((item: any) => this.serializeAmiPerformanceRecord(item));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async generateAmiMonthlyBill(storeIdInput: number | string | undefined, settleMonth: string) {
    const storeId = this.asStoreId(storeIdInput);
    if (!settleMonth) throw new BadRequestException('缺少账单月份');

    const records = await this.prisma.amiPerformanceRecord.findMany({ where: { storeId, settleMonth } });
    const breakdown: Record<string, any> = {};
    let rawCommissionFee = 0;
    let revenueGenerated = 0;
    let workMinutes = 0;
    for (const record of records) {
      const category = record.category || 'other';
      const item = breakdown[category] ?? {
        category,
        count: 0,
        revenueAmount: 0,
        commissionAmount: 0,
        workMinutes: 0,
      };
      const revenueAmount = this.toNumber(record.revenueAmount);
      const commissionAmount = this.toNumber(record.commissionAmount);
      item.count += 1;
      item.revenueAmount += revenueAmount;
      item.commissionAmount += commissionAmount;
      item.workMinutes += this.toNumber(record.workMinutes);
      breakdown[category] = item;
      revenueGenerated += revenueAmount;
      rawCommissionFee += commissionAmount;
      workMinutes += this.toNumber(record.workMinutes);
    }

    const baseFee = DEFAULT_AMI_BASE_FEE;
    const commissionCap = baseFee * 3;
    const commissionFee = Math.min(rawCommissionFee, commissionCap);
    const totalFee = Math.round((baseFee + commissionFee) * 100) / 100;
    const roi = totalFee > 0 ? Math.round((revenueGenerated / totalFee) * 100) / 100 : 0;
    const bill = await this.prisma.amiMonthlyBill.upsert({
      where: { storeId_settleMonth: { storeId, settleMonth } },
      create: {
        storeId,
        settleMonth,
        baseFee,
        commissionFee,
        totalFee,
        revenueGenerated,
        roi,
        breakdown: {
          items: Object.values(breakdown),
          recordCount: records.length,
          workMinutes,
          rawCommissionFee,
          commissionCap,
        },
        status: 'draft',
      },
      update: {
        baseFee,
        commissionFee,
        totalFee,
        revenueGenerated,
        roi,
        breakdown: {
          items: Object.values(breakdown),
          recordCount: records.length,
          workMinutes,
          rawCommissionFee,
          commissionCap,
        },
      },
      include: { store: { select: { id: true, name: true } } },
    });
    return this.serializeAmiMonthlyBill(bill);
  }

  async generateAmiMonthlyBillsForAllStores(settleMonth: string = this.getPreviousSettleMonth()) {
    const stores = await this.prisma.store.findMany({
      where: { deletedAt: null, status: 'active' },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });

    const items = [];
    const errors = [];
    for (const store of stores) {
      try {
        items.push(await this.generateAmiMonthlyBill(store.id, settleMonth));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ storeId: store.id, storeName: store.name, message });
        this.logger.error(`门店 ${store.id} Ami 月账单自动生成失败：${message}`, error instanceof Error ? error.stack : undefined);
      }
    }

    return { items, data: items, total: items.length, failed: errors.length, errors, settleMonth };
  }

  @Cron('0 2 1 * *')
  async handleAmiMonthlyBillCron() {
    await this.generateAmiMonthlyBillsForAllStores(this.getPreviousSettleMonth());
  }

  async getAmiMonthlyBills(query: {
    page?: number | string;
    pageSize?: number | string;
    storeId?: number | string;
    settleMonth?: string;
    status?: string;
  }) {
    const page = Math.max(1, this.toNumber(query.page) || 1);
    const pageSize = Math.max(1, this.toNumber(query.pageSize) || 20);
    const where: any = {};
    const storeId = this.toNumber(query.storeId);
    if (storeId > 0) where.storeId = storeId;
    if (query.settleMonth) where.settleMonth = query.settleMonth;
    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      this.prisma.amiMonthlyBill.findMany({
        where,
        include: { store: { select: { id: true, name: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ settleMonth: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.amiMonthlyBill.count({ where }),
    ]);
    const normalizedItems = items.map((item: any) => this.serializeAmiMonthlyBill(item));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async getAmiMonthlyBillByMonth(storeIdInput: number | string | undefined, settleMonth: string) {
    const storeId = this.asStoreId(storeIdInput);
    const bill = await this.prisma.amiMonthlyBill.findUnique({
      where: { storeId_settleMonth: { storeId, settleMonth } },
      include: { store: { select: { id: true, name: true } } },
    });
    if (!bill) throw new NotFoundException('Ami 月度账单不存在');
    return this.serializeAmiMonthlyBill(bill);
  }

  async getAmiDashboard(query: { storeId?: number | string; settleMonth?: string }) {
    const storeId = this.toNumber(query.storeId);
    const settleMonth = query.settleMonth ?? this.getSettleMonth();
    const where: any = { settleMonth };
    if (storeId > 0) where.storeId = storeId;

    const [records, bills] = await Promise.all([
      this.prisma.amiPerformanceRecord.findMany({ where }),
      this.prisma.amiMonthlyBill.findMany({ where: storeId > 0 ? { storeId, settleMonth } : { settleMonth } }),
    ]);
    const revenueGenerated = records.reduce((sum: number, record: any) => sum + this.toNumber(record.revenueAmount), 0);
    const commissionAmount = records.reduce((sum: number, record: any) => sum + this.toNumber(record.commissionAmount), 0);
    const workMinutes = records.reduce((sum: number, record: any) => sum + this.toNumber(record.workMinutes), 0);
    const totalFee = bills.reduce((sum: number, bill: any) => sum + this.toNumber(bill.totalFee), 0);
    const categories = Array.from(
      records.reduce((map: Map<string, any>, record: any) => {
        const item = map.get(record.category) ?? { category: record.category, count: 0, revenueAmount: 0, commissionAmount: 0, workMinutes: 0 };
        item.count += 1;
        item.revenueAmount += this.toNumber(record.revenueAmount);
        item.commissionAmount += this.toNumber(record.commissionAmount);
        item.workMinutes += this.toNumber(record.workMinutes);
        map.set(record.category, item);
        return map;
      }, new Map<string, any>()).values(),
    );
    return {
      settleMonth,
      revenueGenerated,
      commissionAmount,
      workMinutes,
      totalFee,
      roi: totalFee > 0 ? Math.round((revenueGenerated / totalFee) * 100) / 100 : 0,
      recordCount: records.length,
      billCount: bills.length,
      categories,
    };
  }

  async getPlatformRevenue(query: { period?: string; value?: string }) {
    const period = query.period ?? 'month';
    const months = this.getMonthRangeForPeriod(period, query.value);
    const settleMonthWhere = months.length === 1 ? { settleMonth: months[0] } : { settleMonth: { in: months } };

    const [amiBills, supplySettlements, activeStoreCount] = await Promise.all([
      this.prisma.amiMonthlyBill.findMany({
        where: settleMonthWhere,
        include: { store: { select: { id: true, name: true } } },
        orderBy: [{ settleMonth: 'asc' }, { storeId: 'asc' }],
      }),
      this.prisma.supplierSettlement.findMany({
        where: settleMonthWhere,
        include: { supplier: { select: { id: true, name: true } } },
        orderBy: [{ settleMonth: 'asc' }, { supplierId: 'asc' }],
      }),
      this.prisma.store.count({ where: { deletedAt: null, status: { not: 'archived' } } }),
    ]);

    const amiSubscriptionTotal = amiBills.reduce((sum: number, bill: any) => sum + this.toNumber(bill.baseFee), 0);
    const amiCommissionTotal = amiBills.reduce((sum: number, bill: any) => sum + this.toNumber(bill.commissionFee), 0);
    const supplyChainRebateTotal = supplySettlements.reduce((sum: number, item: any) => sum + this.toNumber(item.rebateAmount), 0);
    const supplyChainFeeTotal = supplySettlements.reduce((sum: number, item: any) => sum + this.toNumber(item.platformFee), 0);
    const storeIds = new Set(amiBills.map((bill: any) => bill.storeId));
    const totalRevenue = amiSubscriptionTotal + amiCommissionTotal + supplyChainRebateTotal + supplyChainFeeTotal;

    const monthTrend = months.map((month) => {
      const monthAmiBills = amiBills.filter((bill: any) => bill.settleMonth === month);
      const monthSettlements = supplySettlements.filter((item: any) => item.settleMonth === month);
      const amiSubscription = monthAmiBills.reduce((sum: number, bill: any) => sum + this.toNumber(bill.baseFee), 0);
      const amiCommission = monthAmiBills.reduce((sum: number, bill: any) => sum + this.toNumber(bill.commissionFee), 0);
      const supplyChainRebate = monthSettlements.reduce((sum: number, item: any) => sum + this.toNumber(item.rebateAmount), 0);
      const supplyChainFee = monthSettlements.reduce((sum: number, item: any) => sum + this.toNumber(item.platformFee), 0);
      return {
        month,
        amiSubscription,
        amiCommission,
        supplyChainRebate,
        supplyChainFee,
        totalRevenue: amiSubscription + amiCommission + supplyChainRebate + supplyChainFee,
      };
    });

    const storeMap = new Map<number, { storeId: number; storeName: string; amiSubscription: number; amiCommission: number; totalRevenue: number }>();
    for (const bill of amiBills as any[]) {
      const item =
        storeMap.get(bill.storeId) ??
        {
          storeId: bill.storeId,
          storeName: bill.store?.name ?? `门店 ${bill.storeId}`,
          amiSubscription: 0,
          amiCommission: 0,
          totalRevenue: 0,
        };
      item.amiSubscription += this.toNumber(bill.baseFee);
      item.amiCommission += this.toNumber(bill.commissionFee);
      item.totalRevenue = item.amiSubscription + item.amiCommission;
      storeMap.set(bill.storeId, item);
    }

    return {
      period,
      value: query.value ?? (period === 'month' ? months[0] : period === 'year' ? months[0].slice(0, 4) : undefined),
      months,
      amiSubscription: {
        total: amiSubscriptionTotal,
        storeCount: storeIds.size,
        records: amiBills.map((bill: any) => ({
          id: bill.id,
          storeId: bill.storeId,
          storeName: bill.store?.name,
          settleMonth: bill.settleMonth,
          amount: this.toNumber(bill.baseFee),
        })),
      },
      amiCommission: {
        total: amiCommissionTotal,
        avgPerStore: storeIds.size ? Math.round((amiCommissionTotal / storeIds.size) * 100) / 100 : 0,
        records: amiBills.map((bill: any) => ({
          id: bill.id,
          storeId: bill.storeId,
          storeName: bill.store?.name,
          settleMonth: bill.settleMonth,
          amount: this.toNumber(bill.commissionFee),
        })),
      },
      supplyChainRebate: {
        total: supplyChainRebateTotal,
        orderCount: supplySettlements.reduce((sum: number, item: any) => sum + this.toNumber(item.orderCount), 0),
        records: supplySettlements.map((item: any) => ({
          id: item.id,
          supplierId: item.supplierId,
          supplierName: item.supplier?.name,
          settleMonth: item.settleMonth,
          amount: this.toNumber(item.rebateAmount),
        })),
      },
      supplyChainFee: {
        total: supplyChainFeeTotal,
        records: supplySettlements.map((item: any) => ({
          id: item.id,
          supplierId: item.supplierId,
          supplierName: item.supplier?.name,
          settleMonth: item.settleMonth,
          amount: this.toNumber(item.platformFee),
        })),
      },
      totalRevenue,
      monthOverMonth:
        monthTrend.length > 1 && monthTrend[monthTrend.length - 2].totalRevenue > 0
          ? Math.round(
              ((monthTrend[monthTrend.length - 1].totalRevenue - monthTrend[monthTrend.length - 2].totalRevenue) /
                monthTrend[monthTrend.length - 2].totalRevenue) *
                10000,
            ) / 100
          : 0,
      arpu: activeStoreCount > 0 ? Math.round((totalRevenue / activeStoreCount / months.length) * 100) / 100 : 0,
      ltvEstimate: activeStoreCount > 0 ? Math.round((totalRevenue / activeStoreCount / months.length) * 12 * 100) / 100 : 0,
      storeRanking: Array.from(storeMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 10),
      monthTrend,
    };
  }

  private async calculateMaterialCost(orderItems: any[]) {
    let total = 0;
    for (const item of orderItems) {
      const itemType = String(item.itemType ?? '');
      const itemId = this.toNumber(item.itemId);
      const quantity = this.toNumber(item.quantity) || 1;
      if (itemType === 'product' && itemId > 0) {
        const product = await this.prisma.product.findUnique({ where: { id: itemId }, select: { costPrice: true } });
        total += this.toNumber(product?.costPrice) * quantity;
      }
      if (itemType === 'project' && itemId > 0) {
        const bomItems = await this.prisma.projectBomItem.findMany({
          where: { projectId: itemId },
          include: { product: { select: { costPrice: true } } },
        });
        total += bomItems.reduce(
          (sum: number, bom: any) => sum + this.toNumber(bom.standardQty) * this.toNumber(bom.product?.costPrice) * quantity,
          0,
        );
      }
    }
    return Math.round(total * 100) / 100;
  }

  async getRules(query: {
    page?: number | string;
    pageSize?: number | string;
    storeId?: number | string;
    type?: string;
    levelId?: number | string;
    status?: string;
    keyword?: string;
  }) {
    const page = Math.max(1, this.toNumber(query.page) || 1);
    const pageSize = Math.max(1, this.toNumber(query.pageSize) || 20);
    const where: any = {};
    const storeId = this.toNumber(query.storeId);
    if (storeId > 0) where.storeId = storeId;
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (this.toNumber(query.levelId) > 0) where.levelId = this.toNumber(query.levelId);
    if (query.keyword) where.name = { contains: query.keyword, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.commissionRule.findMany({
        where,
        include: { store: { select: { id: true, name: true } }, level: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.commissionRule.count({ where }),
    ]);
    const normalizedItems = items.map((item: any) => this.serializeRule(item));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async getRuleById(id: number) {
    const rule = await this.prisma.commissionRule.findUnique({
      where: { id },
      include: { store: { select: { id: true, name: true } }, level: true },
    });
    if (!rule) throw new NotFoundException('提成规则不存在');
    return this.serializeRule(rule);
  }

  private async validateRuleReferences(storeId: number, dto: CommissionRuleReferenceInput) {
    if (dto.levelId) {
      const level = await this.prisma.beauticianLevel.findUnique({ where: { id: Number(dto.levelId) } });
      if (!level) throw new BadRequestException('美容师等级不存在');
    }

    if (dto.targetType === 'specific' && dto.targetId) {
      if (dto.type === 'project') {
        const existed = await this.prisma.project.findFirst({ where: { id: Number(dto.targetId), storeId } });
        if (!existed) throw new BadRequestException('指定项目不存在');
      }
      if (dto.type === 'product') {
        const existed = await this.prisma.product.findFirst({ where: { id: Number(dto.targetId), storeId } });
        if (!existed) throw new BadRequestException('指定商品不存在');
      }
      if (dto.type === 'card_sale') {
        const existed = await this.prisma.card.findUnique({ where: { id: Number(dto.targetId) } });
        if (!existed) throw new BadRequestException('指定卡项不存在');
      }
    }
  }

  async createRule(storeIdInput: number | string | undefined, dto: CreateCommissionRuleDto) {
    const storeId = this.asStoreId(storeIdInput);
    await this.validateRuleReferences(storeId, dto);
    const rule = await this.prisma.commissionRule.create({
      data: {
        storeId,
        name: dto.name,
        type: dto.type,
        targetType: dto.targetType ?? 'all',
        targetId: dto.targetId,
        levelId: dto.levelId,
        rate: dto.rate,
        fixedAmount: dto.fixedAmount,
        calcBase: dto.calcBase ?? 'total',
        isDesignated: dto.isDesignated ?? false,
        designatedBonus: dto.designatedBonus,
        minThreshold: dto.minThreshold,
        status: dto.status ?? 'active',
        priority: dto.priority ?? 0,
      },
      include: { store: { select: { id: true, name: true } }, level: true },
    });
    return this.serializeRule(rule);
  }

  async updateRule(id: number, dto: UpdateCommissionRuleDto) {
    const current = await this.prisma.commissionRule.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('提成规则不存在');
    await this.validateRuleReferences(current.storeId, { ...current, ...dto });
    const rule = await this.prisma.commissionRule.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        targetType: dto.targetType,
        targetId: dto.targetId,
        levelId: dto.levelId,
        rate: dto.rate,
        fixedAmount: dto.fixedAmount,
        calcBase: dto.calcBase,
        isDesignated: dto.isDesignated,
        designatedBonus: dto.designatedBonus,
        minThreshold: dto.minThreshold,
        status: dto.status,
        priority: dto.priority,
      },
      include: { store: { select: { id: true, name: true } }, level: true },
    });
    return this.serializeRule(rule);
  }

  async deleteRule(id: number) {
    await this.getRuleById(id);
    const rule = await this.prisma.commissionRule.update({
      where: { id },
      data: { status: 'archived' },
      include: { store: { select: { id: true, name: true } }, level: true },
    });
    return this.serializeRule(rule);
  }

  async batchCreateFromTemplate(storeIdInput: number | string | undefined, template = 'beauty_standard') {
    const storeId = this.asStoreId(storeIdInput);
    const rules: CreateCommissionRuleDto[] = [
      { name: '项目通用提成 8%', type: 'project', targetType: 'all', rate: 0.08, priority: 10 },
      { name: '商品销售提成 5%', type: 'product', targetType: 'all', rate: 0.05, priority: 10 },
      { name: '次卡开卡提成 6%', type: 'card_sale', targetType: 'all', rate: 0.06, priority: 10 },
      { name: '会员充值提成 3%', type: 'recharge', targetType: 'all', rate: 0.03, priority: 10 },
      { name: '指定服务加成', type: 'project', targetType: 'all', rate: 0.08, isDesignated: true, designatedBonus: 0.2, priority: 20 },
    ];
    const created = [];
    for (const rule of rules) {
      created.push(await this.createRule(storeId, { ...rule, name: template === 'beauty_standard' ? rule.name : `${template}-${rule.name}` }));
    }
    return { items: created, data: created, total: created.length };
  }

  private async resolveCategory(params: CalculateCommissionParams, client: PrismaLike) {
    if (params.categoryId) return params.categoryId;
    if (params.type === 'project' && params.itemId) {
      const project = await client.project.findUnique({ where: { id: params.itemId }, select: { typeId: true } });
      return project?.typeId ?? undefined;
    }
    if (params.type === 'product' && params.itemId) {
      const product = await client.product.findUnique({ where: { id: params.itemId }, select: { categoryId: true } });
      return product?.categoryId ?? undefined;
    }
    return undefined;
  }

  private selectRule(rules: any[], params: CalculateCommissionParams, categoryId?: number) {
    const matched = rules.filter((rule) => {
      if (rule.targetType === 'all') return true;
      if (rule.targetType === 'category') return Boolean(categoryId && this.toNumber(rule.targetId) === categoryId);
      if (rule.targetType === 'specific') return Boolean(params.itemId && this.toNumber(rule.targetId) === params.itemId);
      return false;
    });

    return matched.sort((a, b) => {
      const priorityDiff = this.toNumber(b.priority) - this.toNumber(a.priority);
      if (priorityDiff !== 0) return priorityDiff;
      const levelDiff = (b.levelId ? 1 : 0) - (a.levelId ? 1 : 0);
      if (levelDiff !== 0) return levelDiff;
      return (TARGET_TYPE_WEIGHT[b.targetType] ?? 0) - (TARGET_TYPE_WEIGHT[a.targetType] ?? 0);
    })[0];
  }

  async calculateCommission(params: CalculateCommissionParams, client: PrismaLike = this.prisma) {
    if (!params.storeId || !params.beauticianId || params.sourceAmount <= 0) return null;
    const categoryId = await this.resolveCategory(params, client);
    const ruleWhere: any = {
      storeId: params.storeId,
      type: params.type,
      status: 'active',
    };
    ruleWhere.OR = params.levelId ? [{ levelId: null }, { levelId: params.levelId }] : [{ levelId: null }];
    const rules = await client.commissionRule.findMany({
      where: ruleWhere,
    });

    const rule = this.selectRule(rules, params, categoryId);
    if (!rule) return null;

    const base =
      rule.calcBase === 'service_fee'
        ? this.toNumber(params.serviceFee ?? params.sourceAmount)
        : rule.calcBase === 'profit'
          ? this.toNumber(params.profit ?? params.sourceAmount)
          : this.toNumber(params.sourceAmount);
    if (base <= 0) return null;

    const fixedAmount = rule.fixedAmount === null || rule.fixedAmount === undefined ? undefined : this.toNumber(rule.fixedAmount);
    const rate = this.toNumber(rule.rate);
    let amount = fixedAmount ?? base * rate;
    if (params.isDesignated && rule.isDesignated) {
      amount *= 1 + this.toNumber(rule.designatedBonus);
    }
    amount = Math.round(amount * 100) / 100;
    const minThreshold = this.toNumber(rule.minThreshold);
    if (minThreshold > 0 && amount < minThreshold) return null;

    const record = await client.commissionRecord.create({
      data: {
        storeId: params.storeId,
        beauticianId: params.beauticianId,
        orderId: params.orderId,
        orderItemId: params.orderItemId,
        ruleId: rule.id,
        type: params.type,
        sourceAmount: base,
        rate,
        amount,
        status: 'pending',
        settleMonth: this.getSettleMonth(),
        remark: params.remark,
      },
      include: {
        beautician: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        order: { select: { id: true, orderNo: true } },
        rule: { select: { id: true, name: true } },
      },
    });
    return this.serializeRecord(record);
  }

  async calculateOrderCommissions(params: CalculateOrderCommissionsParams, client: PrismaLike = this.prisma) {
    const records = [];
    for (const item of params.items) {
      const type = item.itemType === 'card' ? 'card_sale' : item.itemType === 'recharge' ? 'recharge' : item.itemType;
      if (!['project', 'product', 'card_sale', 'recharge', 'new_customer'].includes(type)) continue;
      const record = await this.calculateCommission(
        {
          storeId: params.storeId,
          orderId: params.orderId,
          beauticianId: params.beauticianId,
          levelId: params.levelId,
          isDesignated: params.isDesignated,
          type: type as CalculateCommissionParams['type'],
          itemId: item.itemId ?? undefined,
          categoryId: item.categoryId ?? undefined,
          sourceAmount: this.toNumber(item.subtotal),
          serviceFee: item.serviceFee,
          profit: item.profit,
          orderItemId: item.orderItemId,
        },
        client,
      );
      if (record) records.push(record);
    }
    return records;
  }

  async reverseOrderCommissions(orderId: number, refundAmount?: number, client: PrismaLike = this.prisma) {
    const records = await client.commissionRecord.findMany({
      where: { orderId, status: { in: ['pending', 'confirmed'] } },
      select: { id: true },
    });
    if (!records.length) return { count: 0, refundAmount: this.toNumber(refundAmount) };
    const result = await client.commissionRecord.updateMany({
      where: { id: { in: records.map((item: any) => item.id) } },
      data: { status: 'cancelled', remark: refundAmount ? `订单退款，退款金额 ${refundAmount}` : '订单退款' },
    });
    return { count: result.count, refundAmount: this.toNumber(refundAmount) };
  }

  async getRecords(query: {
    page?: number | string;
    pageSize?: number | string;
    storeId?: number | string;
    beauticianId?: number | string;
    type?: string;
    status?: string;
    settleMonth?: string;
  }) {
    const page = Math.max(1, this.toNumber(query.page) || 1);
    const pageSize = Math.max(1, this.toNumber(query.pageSize) || 20);
    const where: any = {};
    const storeId = this.toNumber(query.storeId);
    const beauticianId = this.toNumber(query.beauticianId);
    if (storeId > 0) where.storeId = storeId;
    if (beauticianId > 0) where.beauticianId = beauticianId;
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.settleMonth) where.settleMonth = query.settleMonth;

    const [items, total] = await Promise.all([
      this.prisma.commissionRecord.findMany({
        where,
        include: {
          beautician: { select: { id: true, name: true } },
          store: { select: { id: true, name: true } },
          order: { select: { id: true, orderNo: true, customerName: true } },
          orderItem: { select: { id: true, name: true, itemType: true, itemId: true } },
          rule: { select: { id: true, name: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.commissionRecord.count({ where }),
    ]);
    const normalizedItems = items.map((item: any) => this.serializeRecord(item));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async getRecordSummary(query: { storeId?: number | string; beauticianId?: number | string; type?: string; status?: string; settleMonth?: string }) {
    const where: any = {};
    const storeId = this.toNumber(query.storeId);
    const beauticianId = this.toNumber(query.beauticianId);
    if (storeId > 0) where.storeId = storeId;
    if (beauticianId > 0) where.beauticianId = beauticianId;
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.settleMonth) where.settleMonth = query.settleMonth;

    const records = await this.prisma.commissionRecord.findMany({
      where,
      include: { beautician: { select: { id: true, name: true } } },
    });
    const summaryByBeautician = new Map<number, any>();
    const totals = { totalAmount: 0, pendingAmount: 0, confirmedAmount: 0, settledAmount: 0, count: records.length };
    for (const record of records) {
      const amount = this.toNumber(record.amount);
      totals.totalAmount += amount;
      if (record.status === 'pending') totals.pendingAmount += amount;
      if (record.status === 'confirmed') totals.confirmedAmount += amount;
      if (record.status === 'settled') totals.settledAmount += amount;

      const item = summaryByBeautician.get(record.beauticianId) ?? {
        beauticianId: record.beauticianId,
        beauticianName: record.beautician?.name,
        totalAmount: 0,
        pendingAmount: 0,
        confirmedAmount: 0,
        settledAmount: 0,
        count: 0,
      };
      item.totalAmount += amount;
      if (record.status === 'pending') item.pendingAmount += amount;
      if (record.status === 'confirmed') item.confirmedAmount += amount;
      if (record.status === 'settled') item.settledAmount += amount;
      item.count += 1;
      summaryByBeautician.set(record.beauticianId, item);
    }

    return {
      ...totals,
      items: Array.from(summaryByBeautician.values()),
      data: Array.from(summaryByBeautician.values()),
    };
  }

  async confirmRecord(id: number) {
    const record = await this.prisma.commissionRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('提成流水不存在');
    const updated = await this.prisma.commissionRecord.update({
      where: { id },
      data: { status: 'confirmed', confirmedAt: new Date() },
      include: {
        beautician: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        order: { select: { id: true, orderNo: true } },
        rule: { select: { id: true, name: true } },
      },
    });
    return this.serializeRecord(updated);
  }

  async batchConfirmRecords(input: { ids?: number[]; storeId?: number | string; settleMonth?: string }) {
    const where: any = { status: 'pending' };
    if (input.ids?.length) where.id = { in: input.ids.map((id) => Number(id)) };
    const storeId = this.toNumber(input.storeId);
    if (storeId > 0) where.storeId = storeId;
    if (input.settleMonth) where.settleMonth = input.settleMonth;
    const result = await this.prisma.commissionRecord.updateMany({
      where,
      data: { status: 'confirmed', confirmedAt: new Date() },
    });
    return { count: result.count };
  }

  async generateSettlement(storeIdInput: number | string | undefined, settleMonth: string) {
    const storeId = this.asStoreId(storeIdInput);
    if (!settleMonth) throw new BadRequestException('缺少结算月份');

    const records = await this.prisma.commissionRecord.findMany({
      where: { storeId, settleMonth, status: 'confirmed' },
    });
    const grouped = new Map<number, any>();
    for (const record of records) {
      const item = grouped.get(record.beauticianId) ?? {
        beauticianId: record.beauticianId,
        projectAmount: 0,
        productAmount: 0,
        cardSaleAmount: 0,
        rechargeAmount: 0,
        otherAmount: 0,
      };
      const amount = this.toNumber(record.amount);
      if (record.type === 'project') item.projectAmount += amount;
      else if (record.type === 'product') item.productAmount += amount;
      else if (record.type === 'card_sale') item.cardSaleAmount += amount;
      else if (record.type === 'recharge') item.rechargeAmount += amount;
      else item.otherAmount += amount;
      grouped.set(record.beauticianId, item);
    }

    const settlements = [];
    for (const item of grouped.values()) {
      const totalAmount = item.projectAmount + item.productAmount + item.cardSaleAmount + item.rechargeAmount + item.otherAmount;
      const settlement = await this.prisma.commissionSettlement.upsert({
        where: { storeId_beauticianId_settleMonth: { storeId, beauticianId: item.beauticianId, settleMonth } },
        create: {
          storeId,
          beauticianId: item.beauticianId,
          settleMonth,
          projectAmount: item.projectAmount,
          productAmount: item.productAmount,
          cardSaleAmount: item.cardSaleAmount,
          rechargeAmount: item.rechargeAmount,
          otherAmount: item.otherAmount,
          totalAmount,
          netAmount: totalAmount,
          status: 'draft',
        },
        update: {
          projectAmount: item.projectAmount,
          productAmount: item.productAmount,
          cardSaleAmount: item.cardSaleAmount,
          rechargeAmount: item.rechargeAmount,
          otherAmount: item.otherAmount,
          totalAmount,
          netAmount: totalAmount,
        },
        include: { store: { select: { id: true, name: true } }, beautician: { select: { id: true, name: true } } },
      });
      settlements.push(this.serializeSettlement(settlement));
    }
    return { items: settlements, data: settlements, total: settlements.length, settleMonth };
  }

  async getSettlements(query: {
    page?: number | string;
    pageSize?: number | string;
    storeId?: number | string;
    settleMonth?: string;
    status?: string;
  }) {
    const page = Math.max(1, this.toNumber(query.page) || 1);
    const pageSize = Math.max(1, this.toNumber(query.pageSize) || 20);
    const where: any = {};
    const storeId = this.toNumber(query.storeId);
    if (storeId > 0) where.storeId = storeId;
    if (query.settleMonth) where.settleMonth = query.settleMonth;
    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      this.prisma.commissionSettlement.findMany({
        where,
        include: { store: { select: { id: true, name: true } }, beautician: { select: { id: true, name: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ settleMonth: 'desc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.commissionSettlement.count({ where }),
    ]);
    const normalizedItems = items.map((item: any) => this.serializeSettlement(item));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async exportSettlements(query: { storeId?: number | string; settleMonth?: string; status?: string }) {
    const where: any = {};
    const storeId = this.toNumber(query.storeId);
    if (storeId > 0) where.storeId = storeId;
    if (query.settleMonth) where.settleMonth = query.settleMonth;
    if (query.status) where.status = query.status;

    const items = await this.prisma.commissionSettlement.findMany({
      where,
      include: { store: { select: { id: true, name: true } }, beautician: { select: { id: true, name: true } } },
      orderBy: [{ settleMonth: 'desc' }, { beauticianId: 'asc' }],
    });
    const rows = items.map((item: any) => this.serializeSettlement(item));
    const content = this.buildCsv(rows, [
      { key: 'settleMonth', header: '月份' },
      { key: 'storeName', header: '门店' },
      { key: 'beauticianName', header: '美容师' },
      { key: 'projectAmount', header: '项目提成' },
      { key: 'productAmount', header: '商品提成' },
      { key: 'cardSaleAmount', header: '开卡提成' },
      { key: 'rechargeAmount', header: '充值提成' },
      { key: 'otherAmount', header: '其他提成' },
      { key: 'totalAmount', header: '应发提成' },
      { key: 'deductions', header: '扣款' },
      { key: 'netAmount', header: '实发提成' },
      { key: 'status', header: '状态' },
      { key: 'confirmedAt', header: '确认时间' },
      { key: 'paidAt', header: '发放时间' },
    ]);
    const suffix = query.settleMonth || 'all';
    return {
      filename: `commission-settlements-${suffix}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content: `\ufeff${content}`,
      total: rows.length,
    };
  }

  async getSettlementById(id: number) {
    const settlement = await this.prisma.commissionSettlement.findUnique({
      where: { id },
      include: { store: { select: { id: true, name: true } }, beautician: { select: { id: true, name: true } } },
    });
    if (!settlement) throw new NotFoundException('结算单不存在');
    return this.serializeSettlement(settlement);
  }

  async confirmSettlement(id: number, confirmedBy?: number) {
    await this.getSettlementById(id);
    const settlement = await this.prisma.commissionSettlement.update({
      where: { id },
      data: { status: 'confirmed', confirmedAt: new Date(), confirmedBy },
      include: { store: { select: { id: true, name: true } }, beautician: { select: { id: true, name: true } } },
    });
    await this.prisma.commissionRecord.updateMany({
      where: {
        storeId: settlement.storeId,
        beauticianId: settlement.beauticianId,
        settleMonth: settlement.settleMonth,
        status: 'confirmed',
      },
      data: { status: 'settled', settledAt: new Date() },
    });
    return this.serializeSettlement(settlement);
  }

  async markSettlementPaid(id: number) {
    await this.getSettlementById(id);
    const settlement = await this.prisma.commissionSettlement.update({
      where: { id },
      data: { status: 'paid', paidAt: new Date() },
      include: { store: { select: { id: true, name: true } }, beautician: { select: { id: true, name: true } } },
    });
    return this.serializeSettlement(settlement);
  }

  async openCashierShift(input: {
    storeId?: number | string;
    deviceId?: number | string;
    operatorId?: number | string;
    operatorType?: string;
    openingCash?: number | string;
  }) {
    const storeId = this.asStoreId(input.storeId);
    const deviceId = this.toNumber(input.deviceId);
    const operatorId = this.toNumber(input.operatorId);
    const openWhere: any = { storeId, status: 'open' };
    if (deviceId > 0) openWhere.deviceId = deviceId;
    else if (operatorId > 0) openWhere.operatorId = operatorId;

    const existed = await this.db().cashierShift.findFirst({
      where: openWhere,
      include: {
        store: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
    if (existed) return this.serializeCashierShift(existed);

    const shift = await this.db().cashierShift.create({
      data: {
        storeId,
        deviceId: deviceId > 0 ? deviceId : undefined,
        operatorId: operatorId > 0 ? operatorId : undefined,
        operatorType: input.operatorType ?? (operatorId > 0 ? 'user' : 'device'),
        openingCash: this.toNumber(input.openingCash),
        status: 'open',
      },
      include: {
        store: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
    });
    return this.serializeCashierShift(shift);
  }

  async getCurrentCashierShift(query: { storeId?: number | string; deviceId?: number | string; operatorId?: number | string }) {
    const storeId = this.asStoreId(query.storeId);
    const where: any = { storeId, status: 'open' };
    const deviceId = this.toNumber(query.deviceId);
    const operatorId = this.toNumber(query.operatorId);
    if (deviceId > 0) where.deviceId = deviceId;
    else if (operatorId > 0) where.operatorId = operatorId;

    const shift = await this.db().cashierShift.findFirst({
      where,
      include: {
        store: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
    return shift ? this.serializeCashierShift(shift) : null;
  }

  async getCashierShiftHistory(query: {
    page?: number | string;
    pageSize?: number | string;
    storeId?: number | string;
    deviceId?: number | string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const page = Math.max(1, this.toNumber(query.page) || 1);
    const pageSize = Math.max(1, this.toNumber(query.pageSize) || 20);
    const where: any = {};
    const storeId = this.toNumber(query.storeId);
    const deviceId = this.toNumber(query.deviceId);
    if (storeId > 0) where.storeId = storeId;
    if (deviceId > 0) where.deviceId = deviceId;
    if (query.status) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
      where.startedAt = {};
      if (query.dateFrom) where.startedAt.gte = this.normalizeDay(query.dateFrom);
      if (query.dateTo) where.startedAt.lt = this.addDays(this.normalizeDay(query.dateTo), 1);
    }

    const [items, total] = await Promise.all([
      this.db().cashierShift.findMany({
        where,
        include: {
          store: { select: { id: true, name: true } },
          device: { select: { id: true, name: true } },
          operator: { select: { id: true, name: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { startedAt: 'desc' },
      }),
      this.db().cashierShift.count({ where }),
    ]);
    const normalizedItems = items.map((item: any) => this.serializeCashierShift(item));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async closeCashierShift(input: {
    storeId?: number | string;
    shiftId?: number | string;
    deviceId?: number | string;
    operatorId?: number | string;
    closingCash?: number | string;
  }) {
    const storeId = this.asStoreId(input.storeId);
    const shiftId = this.toNumber(input.shiftId);
    const deviceId = this.toNumber(input.deviceId);
    const operatorId = this.toNumber(input.operatorId);
    const where: any = { storeId, status: 'open' };
    if (shiftId > 0) where.id = shiftId;
    else if (deviceId > 0) where.deviceId = deviceId;
    else if (operatorId > 0) where.operatorId = operatorId;

    const shift = await this.db().cashierShift.findFirst({ where, orderBy: { startedAt: 'desc' } });
    if (!shift) throw new NotFoundException('当前没有打开的收银班次');

    const endedAt = new Date();
    const payments = await this.prisma.paymentRecord.findMany({
      where: {
        status: 'success',
        paidAt: { gte: shift.startedAt, lte: endedAt },
        order: { storeId },
      },
    });
    const refunds = await this.prisma.refundRecord.findMany({
      where: {
        status: 'success',
        refundedAt: { gte: shift.startedAt, lte: endedAt },
        order: { storeId },
      },
    });
    const summary = this.emptyPaymentSummary();
    for (const payment of payments) this.addPayment(summary, payment.method, payment.amount);
    for (const refund of refunds) summary.refund += this.toNumber(refund.amount);

    const systemCash = Math.round((this.toNumber(shift.openingCash) + summary.cash - summary.refund) * 100) / 100;
    const closingCash = this.toNumber(input.closingCash);
    const cashDiff = Math.round((closingCash - systemCash) * 100) / 100;
    const updated = await this.db().cashierShift.update({
      where: { id: shift.id },
      data: {
        endedAt,
        status: 'closed',
        closingCash,
        systemCash,
        cashDiff,
        summary,
      },
      include: {
        store: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
    });
    return this.serializeCashierShift(updated);
  }

  async generateDailySettlement(storeIdInput: number | string | undefined, dateInput: string | Date) {
    const storeId = this.asStoreId(storeIdInput);
    const settleDate = this.normalizeDay(dateInput);
    const dayEnd = this.addDays(settleDate, 1);

    const orders = await this.prisma.productOrder.findMany({
      where: {
        storeId,
        createdAt: { gte: settleDate, lt: dayEnd },
        status: { in: ['completed', 'paid'] },
      },
      include: {
        orderItems: true,
        paymentRecords: { where: { status: 'success' } },
        refundRecords: { where: { status: 'success' } },
      },
    });

    const paymentSummary = this.emptyPaymentSummary();
    let totalRevenue = 0;
    let refundAmount = 0;
    let rechargeIncome = 0;
    const customers = new Set<number>();
    const allOrderItems: any[] = [];
    for (const order of orders) {
      const paid = order.paymentRecords.reduce((sum: number, payment: any) => sum + this.toNumber(payment.amount), 0);
      const orderAmount = paid > 0 ? paid : this.toNumber(order.totalAmount);
      totalRevenue += orderAmount;
      if (order.customerId) customers.add(order.customerId);
      if (order.paymentRecords.length) {
        for (const payment of order.paymentRecords) this.addPayment(paymentSummary, payment.method, payment.amount);
      } else {
        this.addPayment(paymentSummary, order.payMethod, orderAmount);
      }
      const orderRefund = order.refundRecords.reduce((sum: number, refund: any) => sum + this.toNumber(refund.amount), 0);
      refundAmount += orderRefund;
      allOrderItems.push(...order.orderItems);
      const hasRecharge = order.orderItems.some((item: any) => item.itemType === 'recharge');
      if (hasRecharge) rechargeIncome += orderAmount;
    }

    const materialCost = await this.calculateMaterialCost(allOrderItems);
    const commissionRecords = await this.prisma.commissionRecord.findMany({
      where: {
        storeId,
        createdAt: { gte: settleDate, lt: dayEnd },
        status: { not: 'cancelled' },
      },
    });
    const commissionTotal = commissionRecords.reduce((sum: number, record: any) => sum + this.toNumber(record.amount), 0);
    const netRevenue = Math.max(0, totalRevenue - refundAmount);
    const grossProfit = Math.round((netRevenue - materialCost - commissionTotal) * 100) / 100;
    const grossMargin = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 10000) / 100 : 0;
    const avgTransaction = orders.length > 0 ? Math.round((netRevenue / orders.length) * 100) / 100 : 0;
    const settlement = await this.db().dailySettlement.upsert({
      where: { storeId_settleDate: { storeId, settleDate } },
      create: {
        storeId,
        settleDate,
        totalRevenue: netRevenue,
        cashRevenue: paymentSummary.cash,
        wechatRevenue: paymentSummary.wechat,
        alipayRevenue: paymentSummary.alipay,
        cardRevenue: paymentSummary.card,
        balanceRevenue: paymentSummary.member_balance,
        rechargeIncome,
        refundAmount,
        orderCount: orders.length,
        customerCount: customers.size,
        avgTransaction,
        materialCost,
        grossProfit,
        grossMargin,
        commissionTotal,
        status: 'draft',
        summary: paymentSummary,
      },
      update: {
        totalRevenue: netRevenue,
        cashRevenue: paymentSummary.cash,
        wechatRevenue: paymentSummary.wechat,
        alipayRevenue: paymentSummary.alipay,
        cardRevenue: paymentSummary.card,
        balanceRevenue: paymentSummary.member_balance,
        rechargeIncome,
        refundAmount,
        orderCount: orders.length,
        customerCount: customers.size,
        avgTransaction,
        materialCost,
        grossProfit,
        grossMargin,
        commissionTotal,
        summary: paymentSummary,
      },
      include: { store: { select: { id: true, name: true } } },
    });
    return this.serializeDailySettlement(settlement);
  }

  async generateDailySettlementsForAllStores(dateInput: string | Date = this.getYesterday()) {
    const settleDate = this.normalizeDay(dateInput);
    const stores = await this.prisma.store.findMany({
      where: { deletedAt: null, status: 'active' },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });

    const items = [];
    const errors = [];
    for (const store of stores) {
      try {
        items.push(await this.generateDailySettlement(store.id, settleDate));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ storeId: store.id, storeName: store.name, message });
        this.logger.error(`门店 ${store.id} 自动日结失败：${message}`, error instanceof Error ? error.stack : undefined);
      }
    }

    return { items, data: items, total: items.length, failed: errors.length, errors, settleDate };
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleDailySettlementCron() {
    await this.generateDailySettlementsForAllStores(this.getYesterday());
  }

  async getDailySettlements(query: {
    page?: number | string;
    pageSize?: number | string;
    storeId?: number | string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
  }) {
    const page = Math.max(1, this.toNumber(query.page) || 1);
    const pageSize = Math.max(1, this.toNumber(query.pageSize) || 20);
    const where: any = {};
    const storeId = this.toNumber(query.storeId);
    if (storeId > 0) where.storeId = storeId;
    if (query.status) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
      where.settleDate = {};
      if (query.dateFrom) where.settleDate.gte = this.normalizeDay(query.dateFrom);
      if (query.dateTo) where.settleDate.lt = this.addDays(this.normalizeDay(query.dateTo), 1);
    }

    const [items, total] = await Promise.all([
      this.db().dailySettlement.findMany({
        where,
        include: { store: { select: { id: true, name: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { settleDate: 'desc' },
      }),
      this.db().dailySettlement.count({ where }),
    ]);
    const normalizedItems = items.map((item: any) => this.serializeDailySettlement(item));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async confirmDailySettlement(id: number, confirmedBy?: number) {
    const existed = await this.db().dailySettlement.findUnique({ where: { id } });
    if (!existed) throw new NotFoundException('日结单不存在');
    const settlement = await this.db().dailySettlement.update({
      where: { id },
      data: { status: 'confirmed', confirmedAt: new Date(), confirmedBy },
      include: { store: { select: { id: true, name: true } } },
    });
    return this.serializeDailySettlement(settlement);
  }

  async getBeauticianSummary(query: { storeId?: number | string; beauticianId: number | string; period?: string; detailLimit?: number | string }) {
    const beauticianId = this.toNumber(query.beauticianId);
    if (beauticianId <= 0) throw new BadRequestException('缺少美容师 ID');
    const storeId = this.toNumber(query.storeId);
    const detailLimit = Math.max(1, Math.min(100, this.toNumber(query.detailLimit) || 5));
    const recentLimit = Math.min(detailLimit, 5);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const settleMonth = this.getSettleMonth(now);
    const baseWhere: any = { beauticianId, status: { not: 'cancelled' } };
    if (storeId > 0) baseWhere.storeId = storeId;

    const [todayRecords, monthRecords, recentRecords] = await Promise.all([
      this.prisma.commissionRecord.findMany({
        where: { ...baseWhere, createdAt: { gte: startOfToday } },
      }),
      this.prisma.commissionRecord.findMany({ where: { ...baseWhere, settleMonth } }),
      this.prisma.commissionRecord.findMany({
        where: { ...baseWhere, settleMonth },
        include: {
          order: { select: { id: true, orderNo: true, customerName: true } },
          orderItem: { select: { id: true, name: true } },
          rule: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: detailLimit,
      }),
    ]);

    const sum = (records: any[], status?: string) =>
      records
        .filter((record) => !status || record.status === status)
        .reduce((total, record) => total + this.toNumber(record.amount), 0);

    const breakdownMap = new Map<
      string,
      {
        type: string;
        label: string;
        amount: number;
        sourceAmount: number;
        pendingAmount: number;
        confirmedAmount: number;
        count: number;
      }
    >();
    for (const record of monthRecords) {
      const type = String(record.type || 'other');
      const item =
        breakdownMap.get(type) ??
        {
          type,
          label: this.getCommissionTypeLabel(type),
          amount: 0,
          sourceAmount: 0,
          pendingAmount: 0,
          confirmedAmount: 0,
          count: 0,
        };
      const amount = this.toNumber(record.amount);
      item.amount += amount;
      item.sourceAmount += this.toNumber(record.sourceAmount);
      if (record.status === 'pending') item.pendingAmount += amount;
      if (record.status === 'confirmed' || record.status === 'settled') item.confirmedAmount += amount;
      item.count += 1;
      breakdownMap.set(type, item);
    }

    return {
      todayAmount: sum(todayRecords),
      monthAmount: sum(monthRecords),
      monthPendingAmount: sum(monthRecords, 'pending'),
      monthConfirmedAmount: sum(monthRecords, 'confirmed') + sum(monthRecords, 'settled'),
      todayCount: todayRecords.length,
      monthCount: monthRecords.length,
      breakdown: Array.from(breakdownMap.values()).sort((a, b) => b.amount - a.amount),
      recentRecords: recentRecords.slice(0, recentLimit).map((item: any) => this.serializeRecord(item)),
      monthRecords: recentRecords.map((item: any) => this.serializeRecord(item)),
    };
  }
}
