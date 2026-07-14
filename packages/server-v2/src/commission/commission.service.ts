import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CreateCommissionRuleAssignmentDto, CreateCommissionRuleDto } from './dto/create-commission-rule.dto.js';
import { UpdateCommissionRuleDto } from './dto/update-commission-rule.dto.js';
import { UpdateCommissionRuleAssignmentDto } from './dto/update-commission-rule-assignment.dto.js';
import { FinanceMetricsService } from '../finance-metrics/finance-metrics.service.js';

type PrismaLike = PrismaService | any;

type CommissionRuleReferenceInput = Pick<CreateCommissionRuleDto, 'type' | 'targetType'> & {
  targetId?: number | null;
  levelId?: number | null;
  userId?: number | null;
};

type CommissionRuleAssignmentReferenceInput = Pick<CreateCommissionRuleAssignmentDto, 'type' | 'targetType'> & {
  ruleId?: number | null;
  targetId?: number | null;
  userId?: number | null;
  status?: string;
};

export type CalculateCommissionParams = {
  storeId: number;
  staffUserId?: number;
  beauticianId?: number;
  orderId?: number;
  orderItemId?: number;
  sourceType?: string;
  sourceId?: number;
  cardUsageRecordId?: number;
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
  staffUserId?: number;
  beauticianId?: number;
  levelId?: number;
  isDesignated?: boolean;
    items: Array<{
      itemType: string;
      itemId?: number | null;
      categoryId?: number | null;
      subtotal: number;
      netAmount?: number;
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

export type FinanceRequestContext = {
  userId: number;
  storeIds: number[];
  roles: string[];
  permissions: string[];
  reason?: string;
};

export type CommissionPaymentContext = FinanceRequestContext & {
  paymentBatchNo: string;
  paymentMethod: string;
  paymentVoucherNo: string;
};

export type DailySettlementConfirmationOptions = {
  confirmationMode?: 'auto' | 'manual';
  reconciliationRunId?: number;
  ruleVersion?: string;
  sourceDigest?: string;
};

const DEFAULT_AMI_BASE_FEE = 699;
const BUSINESS_TIMEZONE_OFFSET_MINUTES = 8 * 60;
const BUSINESS_DAY_MS = 24 * 60 * 60 * 1000;
const PREPAID_ORDER_ITEM_TYPES = new Set(['recharge', 'card', 'open']);

@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name);

  constructor(
    private prisma: PrismaService,
    private readonly financeMetricsService?: FinanceMetricsService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  private db(client: PrismaLike = this.prisma): PrismaLike {
    return client as PrismaLike;
  }

  private isSuperAdmin(context?: Pick<FinanceRequestContext, 'roles' | 'permissions'>) {
    return Boolean(context?.permissions?.includes('*') || context?.roles?.includes('super_admin') || context?.roles?.includes('admin'));
  }

  private assertStoreAccess(storeId: number, context?: Pick<FinanceRequestContext, 'storeIds' | 'roles' | 'permissions'>) {
    if (!context || this.isSuperAdmin(context)) return;
    if (!context.storeIds?.includes(storeId)) throw new ForbiddenException('无权访问该门店财务数据');
  }

  private async writeFinanceAudit(data: {
    storeId?: number;
    userId?: number | null;
    action: string;
    entityType: string;
    entityId: number;
    reason?: string;
    beforePayload?: any;
    afterPayload?: any;
  }) {
    if (!this.db().financeAuditLog?.create) return;
    await this.db().financeAuditLog.create({ data });
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

  private serializeAssignment(assignment: any) {
    if (!assignment) return assignment;
    return {
      ...assignment,
      rule: assignment.rule ? this.serializeRule(assignment.rule) : assignment.rule,
      ruleName: assignment.rule?.name,
      userName: assignment.user?.name ?? assignment.user?.username,
      storeName: assignment.store?.name,
    };
  }

  private serializeRecord(record: any) {
    if (!record) return record;
    const cardUsageItem = record.cardUsageRecord
      ? { id: record.cardUsageRecord.id, name: record.cardUsageRecord.projectName, itemType: 'card_usage' }
      : undefined;
    return {
      ...record,
      sourceAmount: this.toNumber(record.sourceAmount),
      rate: this.toNumber(record.rate),
      amount: this.toNumber(record.amount),
      staffUserName: record.staffUser?.name ?? record.beautician?.name,
      beauticianName: record.beautician?.name,
      storeName: record.store?.name,
      orderNo: record.order?.orderNo ?? record.cardUsageRecord?.cardName,
      orderItem: record.orderItem ?? cardUsageItem,
      ruleName: record.rule?.name,
      assignmentName: record.assignment?.rule?.name ?? record.rule?.name,
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
    const settlementRecords = Array.isArray(settlement.settlementRecords)
      ? settlement.settlementRecords.map((item: any) => ({
          id: item.id,
          settlementId: item.settlementId,
          commissionRecordId: item.commissionRecordId,
          amountSnapshot: this.toNumber(item.amountSnapshot),
          statusSnapshot: item.statusSnapshot,
          createdAt: item.createdAt,
          commissionRecord: item.commissionRecord ? this.serializeRecord(item.commissionRecord) : undefined,
        }))
      : undefined;
    const detailAmount = settlementRecords?.reduce((sum: number, item: any) => sum + this.toNumber(item.amountSnapshot), 0);
    const freshness = this.getSettlementFreshness(settlement, settlementRecords ?? []);
    const { _eligibleRecords, ...settlementPayload } = settlement;
    return {
      ...settlementPayload,
      projectAmount: this.toNumber(settlement.projectAmount),
      productAmount: this.toNumber(settlement.productAmount),
      cardSaleAmount: this.toNumber(settlement.cardSaleAmount),
      rechargeAmount: this.toNumber(settlement.rechargeAmount),
      otherAmount: this.toNumber(settlement.otherAmount),
      totalAmount: this.toNumber(settlement.totalAmount),
      deductions: this.toNumber(settlement.deductions),
      netAmount: this.toNumber(settlement.netAmount),
      detailCount: settlementRecords?.length,
      detailAmount,
      settlementRecords,
      ...freshness,
      staffUserName: settlement.staffUser?.name ?? settlement.beautician?.name,
      beauticianName: settlement.beautician?.name,
      storeName: settlement.store?.name,
    };
  }

  private getSettlementFreshness(settlement: any, settlementRecords: any[]) {
    if (settlement.status !== 'draft') {
      return {
        needsRegenerate: false,
        regenerateReason: undefined,
        regenerateDiffAmount: 0,
        regenerateMissingRecordCount: 0,
        regenerateChangedRecordCount: 0,
      };
    }

    const eligibleRecords = Array.isArray(settlement._eligibleRecords) ? settlement._eligibleRecords : [];
    if (!eligibleRecords.length && !settlementRecords.length) {
      return {
        needsRegenerate: false,
        regenerateReason: undefined,
        regenerateDiffAmount: 0,
        regenerateMissingRecordCount: 0,
        regenerateChangedRecordCount: 0,
      };
    }

    const lockedIds = new Set(settlementRecords.map((item: any) => this.toNumber(item.commissionRecordId)).filter((id: number) => id > 0));
    const eligibleById = new Map(eligibleRecords.map((record: any) => [this.toNumber(record.id), record]));
    const missingRecordCount = eligibleRecords.filter((record: any) => !lockedIds.has(this.toNumber(record.id))).length;
    let changedRecordCount = 0;

    for (const item of settlementRecords) {
      const recordId = this.toNumber(item.commissionRecordId);
      const current = item.commissionRecord ?? eligibleById.get(recordId);
      const amountChanged = current ? Math.round((this.toNumber(current.amount) - this.toNumber(item.amountSnapshot)) * 100) / 100 !== 0 : true;
      const statusChanged = current ? (item.statusSnapshot ?? '') !== (current.status ?? '') : true;
      if (amountChanged || statusChanged) changedRecordCount += 1;
    }

    const snapshotAmount = settlementRecords.reduce((sum: number, item: any) => sum + this.toNumber(item.amountSnapshot), 0);
    const eligibleAmount = eligibleRecords.reduce((sum: number, item: any) => sum + this.toNumber(item.amount), 0);
    const regenerateDiffAmount = Math.round((eligibleAmount - snapshotAmount) * 100) / 100;
    const needsRegenerate = missingRecordCount > 0 || changedRecordCount > 0;
    let regenerateReason: string | undefined;
    if (missingRecordCount > 0 && changedRecordCount > 0) {
      regenerateReason = `发现 ${missingRecordCount} 条新增可结算流水，且 ${changedRecordCount} 条锁定流水已变化，请重新生成结算单。`;
    } else if (missingRecordCount > 0) {
      regenerateReason = `发现 ${missingRecordCount} 条新增可结算流水，请重新生成结算单。`;
    } else if (changedRecordCount > 0) {
      regenerateReason = `${changedRecordCount} 条锁定流水金额或状态已变化，请重新生成结算单。`;
    }

    return {
      needsRegenerate,
      regenerateReason,
      regenerateDiffAmount,
      regenerateMissingRecordCount: missingRecordCount,
      regenerateChangedRecordCount: changedRecordCount,
    };
  }

  private async attachSettlementFreshness(settlements: any[]) {
    const draftSettlements = settlements.filter((item) => item?.status === 'draft' && item.storeId && item.staffUserId && item.settleMonth);
    await Promise.all(
      draftSettlements.map(async (settlement) => {
        settlement._eligibleRecords = await this.prisma.commissionRecord.findMany({
          where: {
            storeId: settlement.storeId,
            staffUserId: settlement.staffUserId,
            settleMonth: settlement.settleMonth,
            status: { in: ['pending', 'confirmed'] },
          },
          select: { id: true, amount: true, status: true },
        });
      }),
    );
    return settlements;
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
    const cardUsageRevenue = this.toNumber(settlement.cardUsageRevenue ?? settlement._cardUsageRevenue);
    const isUnifiedMetric = settlement.summary?.metricVersion === 'finance_metrics_v1';
    const calculatedTotalRevenue = isUnifiedMetric
      ? this.toNumber(settlement.totalRevenue)
      : Math.round((this.toNumber(settlement.totalRevenue) + cardUsageRevenue) * 100) / 100;
    const totalRevenue = settlement.finalSummary?.totalRevenue === undefined
      ? calculatedTotalRevenue
      : this.toNumber(settlement.finalSummary.totalRevenue);
    const materialCost = settlement.finalSummary?.materialCost === undefined
      ? this.toNumber(settlement.summary?.materialCost ?? settlement.materialCost)
      : this.toNumber(settlement.finalSummary.materialCost);
    const productCost = this.toNumber(settlement.summary?.productCost);
    const commissionTotal = this.toNumber(settlement.finalSummary?.commissionTotal ?? settlement.commissionTotal);
    const grossProfit = settlement.finalSummary
      ? this.toNumber(settlement.grossProfit)
      : Math.round((totalRevenue - materialCost - productCost - commissionTotal) * 100) / 100;
    const grossMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 10000) / 100 : 0;
    const orderCount = this.toNumber(settlement.orderCount);
    return {
      ...settlement,
      settleDate: this.normalizeBusinessDateText(settlement.settleDate),
      totalRevenue,
      cashRevenue: this.toNumber(settlement.finalSummary?.cashRevenue ?? settlement.cashRevenue),
      wechatRevenue: this.toNumber(settlement.finalSummary?.wechatRevenue ?? settlement.wechatRevenue),
      alipayRevenue: this.toNumber(settlement.finalSummary?.alipayRevenue ?? settlement.alipayRevenue),
      cardRevenue: this.toNumber(settlement.finalSummary?.cardRevenue ?? settlement.cardRevenue),
      balanceRevenue: this.toNumber(settlement.finalSummary?.balanceRevenue ?? settlement.balanceRevenue),
      rechargeIncome: this.toNumber(settlement.finalSummary?.rechargeIncome ?? settlement.rechargeIncome),
      prepaidIncome: this.toNumber(settlement.summary?.prepaidAmount ?? settlement.prepaidIncome ?? settlement._prepaidIncome ?? settlement.rechargeIncome),
      refundAmount: this.toNumber(settlement.finalSummary?.refundAmount ?? settlement.refundAmount),
      avgTransaction: orderCount > 0 ? Math.round((totalRevenue / orderCount) * 100) / 100 : this.toNumber(settlement.avgTransaction),
      materialCost,
      grossProfit,
      grossMargin,
      commissionTotal,
      productCost,
      cardUsageRevenue: this.toNumber(settlement.summary?.cardUsageRecognized ?? cardUsageRevenue),
      memberBalanceCashDeduct: this.toNumber(settlement.summary?.memberBalanceCashDeduct),
      memberBalanceGiftDeduct: this.toNumber(settlement.summary?.memberBalanceGiftDeduct),
      dataQuality: settlement.summary?.dataQuality,
      systemSummary: settlement.systemSummary ?? undefined,
      adjustmentSummary: settlement.adjustmentSummary ?? undefined,
      finalSummary: settlement.finalSummary ?? undefined,
      storeName: settlement.store?.name,
    };
  }

  private isPrepaidOrderItem(item: any) {
    return PREPAID_ORDER_ITEM_TYPES.has(String(item?.itemType ?? ''));
  }

  private prepaidItemAmount(item: any) {
    const netAmount = this.toNumber(item?.netAmount);
    if (netAmount > 0) return netAmount;
    const subtotal = this.toNumber(item?.subtotal);
    if (subtotal > 0) return subtotal;
    const quantity = this.toNumber(item?.quantity) || 1;
    const unitPrice = this.toNumber(item?.unitPrice);
    const discount = this.toNumber(item?.totalDiscountAmount ?? item?.discount ?? item?.discountAmount);
    return Math.max(0, quantity * unitPrice - discount);
  }

  private prepaidIncomeFromOrder(order: any, fallbackAmount = 0) {
    const prepaidItems = Array.isArray(order?.orderItems) ? order.orderItems.filter((item: any) => this.isPrepaidOrderItem(item)) : [];
    if (!prepaidItems.length) return 0;
    const itemTotal = prepaidItems.reduce((sum: number, item: any) => sum + this.prepaidItemAmount(item), 0);
    return itemTotal > 0 ? itemTotal : this.toNumber(fallbackAmount);
  }

  private async attachDailyCardUsageRevenue(settlements: any[]) {
    if (!settlements.length || !this.prisma.cardUsageRecord?.findMany) return settlements;

    const storeIds = [...new Set(settlements.map((item) => this.toNumber(item.storeId)).filter((id) => id > 0))];
    const dateTexts = [...new Set(settlements.map((item) => this.normalizeBusinessDateText(item.settleDate)).filter(Boolean))].sort();
    if (!storeIds.length || !dateTexts.length) return settlements;

    const rangeStart = this.getBusinessDayRange(dateTexts[0]).start;
    const rangeEnd = this.getBusinessDayRange(dateTexts[dateTexts.length - 1]).end;
    const records = await this.prisma.cardUsageRecord.findMany({
      where: {
        storeId: { in: storeIds },
        verifiedAt: { gte: rangeStart, lt: rangeEnd },
      },
      select: { storeId: true, verifiedAt: true, recognizedAmount: true },
    });
    if (!Array.isArray(records)) return settlements;

    const revenueByKey = new Map<string, number>();
    for (const record of records) {
      const storeId = this.toNumber(record.storeId);
      if (storeId <= 0 || !record.verifiedAt) continue;
      const key = `${storeId}:${this.normalizeBusinessDateText(record.verifiedAt)}`;
      revenueByKey.set(key, (revenueByKey.get(key) ?? 0) + this.toNumber(record.recognizedAmount));
    }

    for (const settlement of settlements) {
      const key = `${this.toNumber(settlement.storeId)}:${this.normalizeBusinessDateText(settlement.settleDate)}`;
      settlement._cardUsageRevenue = Math.round((revenueByKey.get(key) ?? 0) * 100) / 100;
    }
    return settlements;
  }

  private async attachDailyPrepaidIncome(settlements: any[]) {
    if (!settlements.length || !this.prisma.productOrder?.findMany) return settlements;

    const storeIds = [...new Set(settlements.map((item) => this.toNumber(item.storeId)).filter((id) => id > 0))];
    const dateTexts = [...new Set(settlements.map((item) => this.normalizeBusinessDateText(item.settleDate)).filter(Boolean))].sort();
    if (!storeIds.length || !dateTexts.length) return settlements;

    const rangeStart = this.getBusinessDayRange(dateTexts[0]).start;
    const rangeEnd = this.getBusinessDayRange(dateTexts[dateTexts.length - 1]).end;
    const orders = await this.prisma.productOrder.findMany({
      where: {
        storeId: { in: storeIds },
        createdAt: { gte: rangeStart, lt: rangeEnd },
        orderItems: { some: { itemType: { in: [...PREPAID_ORDER_ITEM_TYPES] } } },
        OR: [
          { status: { in: ['completed', 'paid', 'refunded'] } },
          { paymentRecords: { some: { status: 'success' } } },
        ],
      },
      include: {
        orderItems: true,
        paymentRecords: { where: { status: 'success' } },
      },
    });
    if (!Array.isArray(orders) || !orders.length) return settlements;

    const grouped = new Map<string, number>();
    for (const order of orders) {
      if (!order.createdAt) continue;
      const paid = Array.isArray(order.paymentRecords) ? order.paymentRecords.reduce((sum: number, payment: any) => sum + this.toNumber(payment.amount), 0) : 0;
      const orderAmount = paid > 0 ? paid : this.toNumber(order.netAmount ?? order.totalAmount);
      const amount = this.prepaidIncomeFromOrder(order, orderAmount);
      if (amount <= 0) continue;
      const key = `${this.toNumber(order.storeId)}:${this.normalizeBusinessDateText(order.createdAt)}`;
      grouped.set(key, this.toNumber(grouped.get(key)) + amount);
    }

    for (const settlement of settlements) {
      const key = `${this.toNumber(settlement.storeId)}:${this.normalizeBusinessDateText(settlement.settleDate)}`;
      settlement._prepaidIncome = this.toNumber(grouped.get(key));
    }
    return settlements;
  }

  private serializePaymentRecord(record: any) {
    if (!record) return record;
    return {
      ...record,
      amount: this.toNumber(record.amount),
      orderNo: record.order?.orderNo,
      checkoutGroupNo: record.order?.checkoutGroupNo,
      orderKind: record.order?.orderKind,
      source: record.order?.source,
      customerName: record.order?.customerName ?? record.order?.customer?.name,
      storeId: record.order?.storeId,
      storeName: record.order?.store?.name,
      paidAt: record.paidAt,
    };
  }

  private serializeRefundRecord(record: any) {
    if (!record) return record;
    return {
      ...record,
      amount: this.toNumber(record.amount),
      orderNo: record.order?.orderNo,
      orderKind: record.order?.orderKind,
      customerName: record.order?.customerName ?? record.order?.customer?.name,
      storeId: record.order?.storeId,
      storeName: record.order?.store?.name,
      payMethod: record.order?.payMethod,
      refundedAt: record.refundedAt,
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

  private normalizeBusinessDateText(dateInput: string | Date) {
    if (typeof dateInput === 'string') {
      const dateText = dateInput.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)?.[0];
      if (dateText) return dateText;
    }
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('日期格式不正确');
    const businessDate = new Date(date.getTime() + BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
    return `${businessDate.getUTCFullYear()}-${String(businessDate.getUTCMonth() + 1).padStart(2, '0')}-${String(businessDate.getUTCDate()).padStart(2, '0')}`;
  }

  private getBusinessDayRange(dateInput: string | Date) {
    const dateText = this.normalizeBusinessDateText(dateInput);
    const [year, month, day] = dateText.split('-').map(Number);
    if (!year || !month || !day) throw new BadRequestException('日期格式不正确');
    const canonicalUtcStart = Date.UTC(year, month - 1, day);
    const start = new Date(canonicalUtcStart - BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
    const end = new Date(start.getTime() + BUSINESS_DAY_MS);
    return {
      dateText,
      start,
      end,
      settleDate: new Date(canonicalUtcStart),
    };
  }

  private normalizeDay(dateInput: string | Date) {
    return this.getBusinessDayRange(dateInput).start;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private addBusinessDateText(dateText: string, days: number) {
    const [year, month, day] = dateText.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + days));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  }

  private getBusinessDateTexts(dateFrom?: string, dateTo?: string) {
    const fromText = this.normalizeBusinessDateText(dateFrom || new Date());
    const toText = this.normalizeBusinessDateText(dateTo || dateFrom || new Date());
    const items: string[] = [];
    let current = fromText;
    while (current <= toText && items.length < 62) {
      items.push(current);
      current = this.addBusinessDateText(current, 1);
    }
    return items;
  }

  private getYesterday(date = new Date()) {
    const todayStart = this.getBusinessDayRange(date).start;
    return this.normalizeBusinessDateText(new Date(todayStart.getTime() - 1));
  }

  private isCanonicalSettlementDate(settlement: any) {
    if (!settlement?.settleDate) return false;
    const settleDate = settlement.settleDate instanceof Date ? settlement.settleDate : new Date(settlement.settleDate);
    if (Number.isNaN(settleDate.getTime())) return false;
    return settleDate.toISOString().slice(0, 10) === this.normalizeBusinessDateText(settleDate);
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
      memberBalanceCashDeduct: 0,
      memberBalanceGiftDeduct: 0,
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

    const existingBill = await this.prisma.amiMonthlyBill.findFirst({
      where: { storeId, settleMonth },
      orderBy: { version: 'desc' },
    });
    if (existingBill && !['draft', 'voided'].includes(existingBill.status)) {
      throw new ConflictException('只有草稿账单可以重新生成');
    }

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
    const billData = {
        storeId,
        settleMonth,
        version: existingBill?.status === 'draft' ? existingBill.version : this.toNumber(existingBill?.version) + 1 || 1,
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
      };
    const bill = existingBill?.status === 'draft'
      ? await this.prisma.amiMonthlyBill.update({ where: { id: existingBill.id }, data: billData, include: { store: { select: { id: true, name: true } } } })
      : await this.prisma.amiMonthlyBill.create({ data: billData, include: { store: { select: { id: true, name: true } } } });
    return this.serializeAmiMonthlyBill(bill);
  }

  async transitionAmiMonthlyBill(
    id: number,
    nextStatus: 'confirmed' | 'invoiced' | 'paid' | 'voided',
    context: FinanceRequestContext,
    reason?: string,
  ) {
    const bill = await this.prisma.amiMonthlyBill.findUnique({ where: { id } });
    if (!bill) throw new NotFoundException('Ami 月度账单不存在');
    this.assertStoreAccess(this.toNumber(bill.storeId), context);

    const allowedTransitions: Record<string, string[]> = {
      draft: ['confirmed'],
      confirmed: ['invoiced', 'voided'],
      invoiced: ['paid', 'voided'],
    };
    if (!allowedTransitions[bill.status]?.includes(nextStatus)) {
      throw new ConflictException(`Ami 账单不允许从 ${bill.status} 变更为 ${nextStatus}`);
    }
    const normalizedReason = reason?.trim();
    if (nextStatus === 'voided' && (!normalizedReason || normalizedReason.length < 5 || normalizedReason.length > 500)) {
      throw new BadRequestException('作废原因需为 5–500 字');
    }

    const changedAt = new Date();
    const data: any = { status: nextStatus };
    if (nextStatus === 'confirmed') Object.assign(data, { confirmedBy: context.userId, confirmedAt: changedAt });
    if (nextStatus === 'invoiced') data.invoicedAt = changedAt;
    if (nextStatus === 'paid') data.paidAt = changedAt;
    if (nextStatus === 'voided') Object.assign(data, { voidedAt: changedAt, voidReason: normalizedReason });

    const updated = await this.prisma.amiMonthlyBill.update({ where: { id }, data });
    await this.writeFinanceAudit({
      storeId: this.toNumber(bill.storeId),
      userId: context.userId,
      action: `ami_bill_${nextStatus}`,
      entityType: 'AmiMonthlyBill',
      entityId: id,
      reason: normalizedReason,
      beforePayload: { status: bill.status },
      afterPayload: { status: nextStatus },
    });
    return this.serializeAmiMonthlyBill(updated);
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
    const bill = await this.prisma.amiMonthlyBill.findFirst({
      where: { storeId, settleMonth },
      orderBy: { version: 'desc' },
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

    const confirmedStatuses = ['confirmed', 'invoiced', 'paid'];
    const [amiBills, draftAmiBills, supplySettlements, activeStoreCount] = await Promise.all([
      this.prisma.amiMonthlyBill.findMany({
        where: { ...settleMonthWhere, status: { in: confirmedStatuses } },
        include: { store: { select: { id: true, name: true } } },
        orderBy: [{ settleMonth: 'asc' }, { storeId: 'asc' }],
      }),
      this.prisma.amiMonthlyBill.findMany({
        where: { ...settleMonthWhere, status: 'draft' },
        include: { store: { select: { id: true, name: true } } },
        orderBy: [{ settleMonth: 'asc' }, { storeId: 'asc' }],
      }),
      this.prisma.supplySettlement.findMany({
        where: { ...settleMonthWhere, status: { in: ['confirmed', 'supplier_confirmed', 'paid'] } },
        include: { supplier: { select: { id: true, name: true } } },
        orderBy: [{ settleMonth: 'asc' }, { supplierId: 'asc' }],
      }),
      this.prisma.store.count({ where: { deletedAt: null, status: { not: 'archived' } } }),
    ]);

    const normalizedAmiBills = Array.isArray(amiBills) ? amiBills : [];
    const normalizedDraftAmiBills = Array.isArray(draftAmiBills) ? draftAmiBills : [];
    const normalizedSupplySettlements = Array.isArray(supplySettlements) ? supplySettlements : [];
    const amiSubscriptionTotal = normalizedAmiBills.reduce((sum: number, bill: any) => sum + this.toNumber(bill.baseFee), 0);
    const amiCommissionTotal = normalizedAmiBills.reduce((sum: number, bill: any) => sum + this.toNumber(bill.commissionFee), 0);
    const supplyChainRebateTotal = normalizedSupplySettlements.reduce((sum: number, item: any) => sum + this.toNumber(item.rebateAmount), 0);
    const supplyChainFeeTotal = normalizedSupplySettlements.reduce((sum: number, item: any) => sum + this.toNumber(item.platformFee), 0);
    const storeIds = new Set(normalizedAmiBills.map((bill: any) => bill.storeId));
    const totalRevenue = amiSubscriptionTotal + amiCommissionTotal + supplyChainRebateTotal + supplyChainFeeTotal;
    const estimatedRevenue = normalizedDraftAmiBills.reduce((sum: number, bill: any) => sum + this.toNumber(bill.totalFee), 0);

    const monthTrend = months.map((month) => {
      const monthAmiBills = normalizedAmiBills.filter((bill: any) => bill.settleMonth === month);
      const monthSettlements = normalizedSupplySettlements.filter((item: any) => item.settleMonth === month);
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
    for (const bill of normalizedAmiBills as any[]) {
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
        records: normalizedAmiBills.map((bill: any) => ({
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
        records: normalizedAmiBills.map((bill: any) => ({
          id: bill.id,
          storeId: bill.storeId,
          storeName: bill.store?.name,
          settleMonth: bill.settleMonth,
          amount: this.toNumber(bill.commissionFee),
        })),
      },
      supplyChainRebate: {
        total: supplyChainRebateTotal,
        orderCount: normalizedSupplySettlements.reduce((sum: number, item: any) => sum + this.toNumber(item.orderCount), 0),
        records: normalizedSupplySettlements.map((item: any) => ({
          id: item.id,
          supplierId: item.supplierId,
          supplierName: item.supplier?.name,
          settleMonth: item.settleMonth,
          amount: this.toNumber(item.rebateAmount),
        })),
      },
      supplyChainFee: {
        total: supplyChainFeeTotal,
        records: normalizedSupplySettlements.map((item: any) => ({
          id: item.id,
          supplierId: item.supplierId,
          supplierName: item.supplier?.name,
          settleMonth: item.settleMonth,
          amount: this.toNumber(item.platformFee),
        })),
      },
      totalRevenue,
      estimatedRevenue,
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
      annualizedRevenueEstimate: activeStoreCount > 0 ? Math.round((totalRevenue / activeStoreCount / months.length) * 12 * 100) / 100 : 0,
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
    if (query.keyword) where.name = { contains: query.keyword, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.commissionRule.findMany({
        where,
        include: {
          store: { select: { id: true, name: true } },
          level: true,
          user: { select: { id: true, name: true, username: true } },
          assignments: { where: { status: { not: 'archived' } }, select: { id: true, status: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.commissionRule.count({ where }),
    ]);
    const normalizedItems = items.map((item: any) => this.serializeRule(item));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async getRuleById(id: number, context?: FinanceRequestContext) {
    const rule = await this.prisma.commissionRule.findUnique({
      where: { id },
      include: {
        store: { select: { id: true, name: true } },
        level: true,
        user: { select: { id: true, name: true, username: true } },
        assignments: { where: { status: { not: 'archived' } }, select: { id: true, status: true } },
      },
    });
    if (!rule) throw new NotFoundException('提成规则不存在');
    this.assertStoreAccess(this.toNumber(rule.storeId), context);
    return this.serializeRule(rule);
  }

  private async validateRuleAlgorithmReferences(storeId: number, dto: Pick<CreateCommissionRuleDto, 'type'>) {
    if (!dto.type) throw new BadRequestException('缺少提成规则类型');
    const store = await this.prisma.store.findMany({ where: { id: storeId }, take: 1 });
    if (!store.length) throw new BadRequestException('门店不存在');
  }

  private async validateAssignmentReferences(storeId: number, dto: CommissionRuleAssignmentReferenceInput) {
    if (!dto.ruleId) throw new BadRequestException('请选择提成规则');
    const rule = await this.prisma.commissionRule.findUnique({ where: { id: Number(dto.ruleId) } });
    if (!rule || rule.storeId !== storeId || rule.status === 'archived') throw new BadRequestException('提成规则不存在或已归档');
    if (rule.type !== dto.type) throw new BadRequestException('规则配置类型必须与规则库类型一致');

    if (dto.userId) {
      const user = await this.prisma.user.findFirst({
        where: {
          id: Number(dto.userId),
          status: 'active',
          deletedAt: null,
          stores: { some: { storeId } },
        },
      });
      if (!user) throw new BadRequestException('适用员工必须来自系统管理-用户管理，且已启用并绑定当前门店');
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

  private normalizeAssignmentScope(dto: CommissionRuleAssignmentReferenceInput) {
    const normalized = { ...dto } as CommissionRuleAssignmentReferenceInput;
    if (['project', 'product', 'card_sale'].includes(String(normalized.type))) {
      normalized.targetType = 'specific';
      if (!normalized.targetId) {
        const label = normalized.type === 'project' ? '项目' : normalized.type === 'product' ? '商品' : '卡项';
        throw new BadRequestException(`${label}提成规则必须指定适用对象`);
      }
    } else {
      normalized.targetType = 'all';
      normalized.targetId = null;
    }
    return normalized;
  }

  private async assertNoActiveAssignmentConflict(storeId: number, dto: CommissionRuleAssignmentReferenceInput, excludeId?: number) {
    if ((dto.status ?? 'active') !== 'active') return;
    const userId = Number(dto.userId);
    if (!Number.isFinite(userId) || userId <= 0) return;
    const conflict = await this.prisma.commissionRuleAssignment.findFirst({
      where: {
        storeId,
        type: dto.type,
        status: 'active',
        userId,
        targetType: dto.targetType,
        targetId: dto.targetId ?? null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      include: { rule: { select: { id: true, name: true } } },
    } as any);
    if (conflict) throw new BadRequestException(`同一对象与员工组合已存在启用提成配置：${(conflict as any).rule?.name ?? conflict.id}`);
  }

  async createRule(storeIdInput: number | string | undefined, dto: CreateCommissionRuleDto) {
    const storeId = this.asStoreId(storeIdInput);
    await this.validateRuleAlgorithmReferences(storeId, dto);
    const rule = await this.prisma.commissionRule.create({
      data: {
        storeId,
        name: dto.name,
        type: dto.type,
        targetType: 'all',
        targetId: null,
        levelId: null,
        userId: null,
        rate: dto.rate,
        fixedAmount: dto.fixedAmount,
        calcBase: dto.calcBase ?? 'total',
        isDesignated: dto.isDesignated ?? false,
        designatedBonus: dto.designatedBonus,
        minThreshold: dto.minThreshold,
        status: dto.status ?? 'active',
        priority: 0,
      },
      include: {
        store: { select: { id: true, name: true } },
        level: true,
        user: { select: { id: true, name: true, username: true } },
        assignments: { where: { status: { not: 'archived' } }, select: { id: true, status: true } },
      },
    });
    return this.serializeRule(rule);
  }

  async updateRule(id: number, dto: UpdateCommissionRuleDto, context?: FinanceRequestContext) {
    const current = await this.prisma.commissionRule.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('提成规则不存在');
    this.assertStoreAccess(this.toNumber(current.storeId), context);
    await this.validateRuleAlgorithmReferences(current.storeId, { type: dto.type ?? current.type });
    const rule = await this.prisma.commissionRule.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        targetType: 'all',
        targetId: null,
        levelId: null,
        userId: null,
        rate: dto.rate,
        fixedAmount: dto.fixedAmount,
        calcBase: dto.calcBase,
        isDesignated: dto.isDesignated,
        designatedBonus: dto.designatedBonus,
        minThreshold: dto.minThreshold,
        status: dto.status,
        priority: 0,
      },
      include: {
        store: { select: { id: true, name: true } },
        level: true,
        user: { select: { id: true, name: true, username: true } },
        assignments: { where: { status: { not: 'archived' } }, select: { id: true, status: true } },
      },
    });
    return this.serializeRule(rule);
  }

  async deleteRule(id: number, context?: FinanceRequestContext) {
    await this.getRuleById(id, context);
    const rule = await this.prisma.commissionRule.update({
      where: { id },
      data: { status: 'archived' },
      include: {
        store: { select: { id: true, name: true } },
        level: true,
        user: { select: { id: true, name: true, username: true } },
        assignments: { where: { status: { not: 'archived' } }, select: { id: true, status: true } },
      },
    });
    return this.serializeRule(rule);
  }

  async getAssignments(query: {
    page?: number | string;
    pageSize?: number | string;
    storeId?: number | string;
    ruleId?: number | string;
    type?: string;
    targetId?: number | string;
    userId?: number | string;
    status?: string;
    keyword?: string;
  }) {
    const page = Math.max(1, this.toNumber(query.page) || 1);
    const pageSize = Math.max(1, this.toNumber(query.pageSize) || 20);
    const where: any = {};
    const storeId = this.toNumber(query.storeId);
    if (storeId > 0) where.storeId = storeId;
    if (this.toNumber(query.ruleId) > 0) where.ruleId = this.toNumber(query.ruleId);
    if (query.type) where.type = query.type;
    if (this.toNumber(query.targetId) > 0) where.targetId = this.toNumber(query.targetId);
    if (this.toNumber(query.userId) > 0) where.userId = this.toNumber(query.userId);
    if (query.status) where.status = query.status;
    if (query.keyword) where.rule = { name: { contains: query.keyword, mode: 'insensitive' } };

    const [items, total] = await Promise.all([
      this.prisma.commissionRuleAssignment.findMany({
        where,
        include: {
          store: { select: { id: true, name: true } },
          rule: true,
          user: { select: { id: true, name: true, username: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ type: 'asc' }, { targetId: 'asc' }, { userId: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.commissionRuleAssignment.count({ where }),
    ]);
    const normalizedItems = items.map((item: any) => this.serializeAssignment(item));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async createAssignment(storeIdInput: number | string | undefined, dto: CreateCommissionRuleAssignmentDto) {
    const storeId = this.asStoreId(storeIdInput);
    const normalized = this.normalizeAssignmentScope(dto);
    await this.validateAssignmentReferences(storeId, normalized);
    await this.assertNoActiveAssignmentConflict(storeId, { ...normalized, status: dto.status ?? 'active' });
    const assignment = await this.prisma.commissionRuleAssignment.create({
      data: {
        storeId,
        ruleId: Number(dto.ruleId),
        type: normalized.type,
        targetType: normalized.targetType ?? 'all',
        targetId: normalized.targetId ?? null,
        userId: Number(dto.userId),
        status: dto.status ?? 'active',
        remark: dto.remark,
      },
      include: {
        store: { select: { id: true, name: true } },
        rule: true,
        user: { select: { id: true, name: true, username: true } },
      },
    });
    return this.serializeAssignment(assignment);
  }

  async updateAssignment(id: number, dto: UpdateCommissionRuleAssignmentDto, context?: FinanceRequestContext) {
    const current = await this.prisma.commissionRuleAssignment.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('提成规则配置不存在');
    this.assertStoreAccess(this.toNumber(current.storeId), context);
    const next = { ...current, ...dto };
    const normalized = this.normalizeAssignmentScope(next);
    await this.validateAssignmentReferences(current.storeId, normalized);
    await this.assertNoActiveAssignmentConflict(current.storeId, { ...normalized, status: next.status ?? 'active' }, id);
    const assignment = await this.prisma.commissionRuleAssignment.update({
      where: { id },
      data: {
        ruleId: dto.ruleId,
        type: normalized.type,
        targetType: normalized.targetType,
        targetId: normalized.targetId ?? null,
        userId: dto.userId,
        status: dto.status,
        remark: dto.remark,
      },
      include: {
        store: { select: { id: true, name: true } },
        rule: true,
        user: { select: { id: true, name: true, username: true } },
      },
    });
    return this.serializeAssignment(assignment);
  }

  async deleteAssignment(id: number, context?: FinanceRequestContext) {
    const current = await this.prisma.commissionRuleAssignment.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('提成规则配置不存在');
    this.assertStoreAccess(this.toNumber(current.storeId), context);
    const assignment = await this.prisma.commissionRuleAssignment.update({
      where: { id },
      data: { status: 'archived' },
      include: {
        store: { select: { id: true, name: true } },
        rule: true,
        user: { select: { id: true, name: true, username: true } },
      },
    });
    return this.serializeAssignment(assignment);
  }

  async batchCreateFromTemplate(storeIdInput: number | string | undefined, template = 'beauty_standard') {
    this.asStoreId(storeIdInput);
    throw new BadRequestException(`提成规则必须绑定到具体员工，请按员工新增规则（模板：${template}）`);
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

  async calculateCommission(params: CalculateCommissionParams, client: PrismaLike = this.prisma) {
    if (!params.storeId || !params.staffUserId || params.sourceAmount <= 0) return null;
    const objectScoped = ['project', 'product', 'card_sale'].includes(params.type);
    if (objectScoped && !params.itemId) return null;
    const assignmentWhere: any = {
      storeId: params.storeId,
      type: params.type,
      status: 'active',
      userId: params.staffUserId,
      targetType: objectScoped ? 'specific' : 'all',
      targetId: objectScoped ? params.itemId : null,
      rule: { status: 'active' },
    };
    const assignments = await client.commissionRuleAssignment.findMany({
      where: assignmentWhere,
      include: { rule: true },
    });

    if (assignments.length > 1) throw new BadRequestException('同一对象与员工组合存在多条启用提成配置，请先处理配置冲突');
    const assignment = assignments[0];
    const rule = assignment?.rule;
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
        staffUserId: params.staffUserId,
        beauticianId: params.beauticianId,
        orderId: params.orderId,
        orderItemId: params.orderItemId,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        cardUsageRecordId: params.cardUsageRecordId,
        ruleId: rule.id,
        assignmentId: assignment.id,
        type: params.type,
        sourceAmount: base,
        rate,
        amount,
        status: 'confirmed',
        confirmedAt: new Date(),
        settleMonth: this.getSettleMonth(),
        remark: params.remark,
      },
      include: {
        staffUser: { select: { id: true, name: true, username: true } },
        beautician: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        order: { select: { id: true, orderNo: true } },
        rule: { select: { id: true, name: true } },
        assignment: { include: { rule: { select: { id: true, name: true } } } },
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
          staffUserId: params.staffUserId,
          beauticianId: params.beauticianId,
          levelId: params.levelId,
          isDesignated: params.isDesignated,
          type: type as CalculateCommissionParams['type'],
          itemId: item.itemId ?? undefined,
          categoryId: item.categoryId ?? undefined,
          sourceAmount: this.toNumber(item.netAmount ?? item.subtotal),
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

  async reverseOrderCommissions(
    orderId: number,
    refundAmount?: number,
    client: PrismaLike = this.prisma,
    refundItems?: Array<{ orderItemId: number; refundAmount: number }>,
  ) {
    if (refundItems?.length) {
      const refundByOrderItem = new Map(refundItems.map((item) => [this.toNumber(item.orderItemId), this.toNumber(item.refundAmount)]));
      const records = await client.commissionRecord.findMany({
        where: { orderId, orderItemId: { in: Array.from(refundByOrderItem.keys()) }, status: { in: ['pending', 'confirmed', 'settled'] } },
        include: { settlementRecords: { orderBy: { id: 'desc' }, take: 1 } },
      });
      const unsettledIds = records.filter((record: any) => ['pending', 'confirmed'].includes(record.status)).map((record: any) => record.id);
      const cancelled = unsettledIds.length
        ? await client.commissionRecord.updateMany({
            where: { id: { in: unsettledIds } },
            data: { status: 'cancelled', remark: `退款明细冲销，退款金额 ${this.toNumber(refundAmount)}` },
          })
        : { count: 0 };
      let adjustmentCount = 0;
      for (const record of records.filter((item: any) => item.status === 'settled')) {
        const settlementId = record.settlementRecords?.[0]?.settlementId;
        if (!settlementId || !client.commissionAdjustment?.create) continue;
        const itemRefundAmount = this.toNumber(refundByOrderItem.get(this.toNumber(record.orderItemId)));
        const sourceAmount = Math.max(this.toNumber(record.sourceAmount), itemRefundAmount, 0.01);
        const recoveryAmount = Math.round(Math.min(this.toNumber(record.amount), this.toNumber(record.amount) * (itemRefundAmount / sourceAmount)) * 100) / 100;
        if (recoveryAmount <= 0) continue;
        await client.commissionAdjustment.create({
          data: {
            settlementId,
            commissionRecordId: record.id,
            storeId: record.storeId,
            type: 'refund_recovery',
            amount: -recoveryAmount,
            reason: `已结算订单退款追缴，订单 ${orderId}，明细 ${record.orderItemId}`,
            status: 'pending',
            createdBy: undefined,
          },
        });
        adjustmentCount += 1;
      }
      return { count: cancelled.count, adjustmentCount, refundAmount: this.toNumber(refundAmount) };
    }
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
    staffUserId?: number | string;
    beauticianId?: number | string;
    type?: string;
    status?: string;
    settleMonth?: string;
  }) {
    const page = Math.max(1, this.toNumber(query.page) || 1);
    const pageSize = Math.max(1, this.toNumber(query.pageSize) || 20);
    const where: any = {};
    const storeId = this.toNumber(query.storeId);
    const staffUserId = this.toNumber(query.staffUserId);
    const beauticianId = this.toNumber(query.beauticianId);
    if (storeId > 0) where.storeId = storeId;
    if (staffUserId > 0) where.staffUserId = staffUserId;
    if (beauticianId > 0) where.beauticianId = beauticianId;
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.settleMonth) where.settleMonth = query.settleMonth;

    const [items, total] = await Promise.all([
      this.prisma.commissionRecord.findMany({
        where,
        include: {
          staffUser: { select: { id: true, name: true, username: true } },
          beautician: { select: { id: true, name: true } },
          store: { select: { id: true, name: true } },
          order: { select: { id: true, orderNo: true, customerName: true } },
          orderItem: { select: { id: true, name: true, itemType: true, itemId: true } },
          cardUsageRecord: { select: { id: true, cardName: true, projectName: true } },
          rule: { select: { id: true, name: true } },
          assignment: { include: { rule: { select: { id: true, name: true } } } },
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

  async getRecordSummary(query: { storeId?: number | string; staffUserId?: number | string; beauticianId?: number | string; type?: string; status?: string; settleMonth?: string }) {
    const where: any = {};
    const storeId = this.toNumber(query.storeId);
    const staffUserId = this.toNumber(query.staffUserId);
    const beauticianId = this.toNumber(query.beauticianId);
    if (storeId > 0) where.storeId = storeId;
    if (staffUserId > 0) where.staffUserId = staffUserId;
    if (beauticianId > 0) where.beauticianId = beauticianId;
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.settleMonth) where.settleMonth = query.settleMonth;

    const records = await this.prisma.commissionRecord.findMany({
      where,
      include: { staffUser: { select: { id: true, name: true, username: true } }, beautician: { select: { id: true, name: true } } },
    });
    const settlementWhere: any = { status: { in: ['confirmed', 'paid'] } };
    if (storeId > 0) settlementWhere.storeId = storeId;
    if (staffUserId > 0) settlementWhere.staffUserId = staffUserId;
    if (beauticianId > 0) settlementWhere.beauticianId = beauticianId;
    if (query.settleMonth) settlementWhere.settleMonth = query.settleMonth;
    const settlementRecordWhere: any = { settlement: settlementWhere };
    if (query.type) settlementRecordWhere.commissionRecord = { type: query.type };
    const shouldLoadSettledAmount = !query.status || query.status === 'settled';
    const settledSettlementRecords = shouldLoadSettledAmount
      ? await this.prisma.commissionSettlementRecord.findMany({
          where: settlementRecordWhere,
          include: {
            commissionRecord: {
              include: {
                staffUser: { select: { id: true, name: true, username: true } },
                beautician: { select: { id: true, name: true } },
              },
            },
          },
        })
      : [];
    const summaryByStaff = new Map<number, any>();
    const totals = { totalAmount: 0, pendingAmount: 0, confirmedAmount: 0, settledAmount: 0, count: records.length };
    for (const record of records) {
      const amount = this.toNumber(record.amount);
      totals.totalAmount += amount;
      if (record.status === 'pending') totals.pendingAmount += amount;
      if (record.status === 'confirmed') totals.confirmedAmount += amount;

      const groupId = record.staffUserId ?? record.beauticianId ?? 0;
      const item = summaryByStaff.get(groupId) ?? {
        staffUserId: record.staffUserId,
        staffUserName: record.staffUser?.name ?? record.beautician?.name,
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
      item.count += 1;
      summaryByStaff.set(groupId, item);
    }

    for (const settlementRecord of settledSettlementRecords) {
      const record = settlementRecord.commissionRecord;
      const amount = this.toNumber(settlementRecord.amountSnapshot);
      totals.settledAmount += amount;
      const groupId = record?.staffUserId ?? record?.beauticianId ?? 0;
      const item = summaryByStaff.get(groupId) ?? {
        staffUserId: record?.staffUserId,
        staffUserName: record?.staffUser?.name ?? record?.beautician?.name,
        beauticianId: record?.beauticianId,
        beauticianName: record?.beautician?.name,
        totalAmount: 0,
        pendingAmount: 0,
        confirmedAmount: 0,
        settledAmount: 0,
        count: 0,
      };
      item.settledAmount += amount;
      summaryByStaff.set(groupId, item);
    }

    const summaryItems = Array.from(summaryByStaff.values());
    return {
      ...totals,
      items: summaryItems,
      data: summaryItems,
    };
  }

  async updateRecord(
    id: number,
    dto: { staffUserId?: number; sourceAmount?: number; rate?: number; amount?: number; remark?: string },
    context?: FinanceRequestContext,
  ) {
    const record = await this.prisma.commissionRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('提成流水不存在');
    this.assertStoreAccess(this.toNumber(record.storeId), context);
    if (record.status === 'settled') throw new BadRequestException('已结算提成不能修改');
    if (record.status === 'cancelled') throw new BadRequestException('已取消提成不能修改');

    const data: any = {};
    const staffUserId = this.toNumber(dto.staffUserId);
    if (staffUserId > 0 && staffUserId !== this.toNumber(record.staffUserId)) {
      const staffUser = await this.prisma.user.findFirst({
        where: { id: staffUserId, status: 'active', deletedAt: null, stores: { some: { storeId: record.storeId } } },
        select: { id: true },
      });
      if (!staffUser) throw new BadRequestException('员工不存在或不属于当前门店');
      const beautician = await this.prisma.beautician.findFirst({
        where: { storeId: record.storeId, userId: staffUserId, status: 'active' },
        select: { id: true },
      });
      data.staffUserId = staffUserId;
      data.beauticianId = beautician?.id ?? null;
    }

    const hasSourceAmount = dto.sourceAmount !== undefined && dto.sourceAmount !== null;
    const hasRate = dto.rate !== undefined && dto.rate !== null;
    const hasAmount = dto.amount !== undefined && dto.amount !== null;
    const sourceAmount = hasSourceAmount ? this.toNumber(dto.sourceAmount) : this.toNumber(record.sourceAmount);
    const rate = hasRate ? this.toNumber(dto.rate) : this.toNumber(record.rate);
    if (hasSourceAmount) {
      if (sourceAmount < 0) throw new BadRequestException('金额基数不能小于 0');
      data.sourceAmount = sourceAmount;
    }
    if (hasRate) {
      if (rate < 0) throw new BadRequestException('提成比例不能小于 0');
      data.rate = rate;
    }
    if (hasAmount) {
      const amount = this.toNumber(dto.amount);
      if (amount < 0) throw new BadRequestException('提成金额不能小于 0');
      data.amount = Math.round(amount * 100) / 100;
    } else if (hasSourceAmount || hasRate) {
      data.amount = Math.round(sourceAmount * rate * 100) / 100;
    }
    if (dto.remark !== undefined) data.remark = dto.remark?.trim() || null;
    data.status = 'confirmed';
    data.confirmedAt = record.confirmedAt ?? new Date();

    const updated = await this.prisma.commissionRecord.update({
      where: { id },
      data,
      include: {
        staffUser: { select: { id: true, name: true, username: true } },
        beautician: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        order: { select: { id: true, orderNo: true, customerName: true } },
        orderItem: { select: { id: true, name: true, itemType: true, itemId: true } },
        rule: { select: { id: true, name: true } },
      },
    });
    return this.serializeRecord(updated);
  }

  async confirmRecord(id: number, context?: FinanceRequestContext) {
    const record = await this.prisma.commissionRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('提成流水不存在');
    this.assertStoreAccess(this.toNumber(record.storeId), context);
    const updated = await this.prisma.commissionRecord.update({
      where: { id },
      data: { status: 'confirmed', confirmedAt: new Date() },
      include: {
        staffUser: { select: { id: true, name: true, username: true } },
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
      where: { storeId, settleMonth, status: { in: ['pending', 'confirmed'] } },
    });
    const grouped = new Map<number, any>();
    for (const record of records) {
      const staffUserId = this.toNumber(record.staffUserId);
      if (!staffUserId) continue;
      const item = grouped.get(staffUserId) ?? {
        staffUserId: record.staffUserId,
        beauticianId: record.beauticianId,
        projectAmount: 0,
        productAmount: 0,
        cardSaleAmount: 0,
        rechargeAmount: 0,
        otherAmount: 0,
        records: [],
      };
      const amount = this.toNumber(record.amount);
      if (record.type === 'project') item.projectAmount += amount;
      else if (record.type === 'product') item.productAmount += amount;
      else if (record.type === 'card_sale') item.cardSaleAmount += amount;
      else if (record.type === 'recharge') item.rechargeAmount += amount;
      else item.otherAmount += amount;
      item.records.push({
        commissionRecordId: record.id,
        amountSnapshot: amount,
        statusSnapshot: record.status,
      });
      grouped.set(staffUserId, item);
    }

    const settlements = [];
    for (const item of grouped.values()) {
      const totalAmount = item.projectAmount + item.productAmount + item.cardSaleAmount + item.rechargeAmount + item.otherAmount;
      const existed = await this.prisma.commissionSettlement.findUnique({
        where: { storeId_staffUserId_settleMonth: { storeId, staffUserId: item.staffUserId, settleMonth } },
        select: { id: true, status: true },
      });
      if (existed && existed.status !== 'draft') {
        throw new BadRequestException('已确认或已发放的结算单不能重新生成，请先处理差异流水');
      }
      const settlement = await this.prisma.commissionSettlement.upsert({
        where: { storeId_staffUserId_settleMonth: { storeId, staffUserId: item.staffUserId, settleMonth } },
        create: {
          storeId,
          staffUserId: item.staffUserId,
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
        include: {
          store: { select: { id: true, name: true } },
          staffUser: { select: { id: true, name: true, username: true } },
          beautician: { select: { id: true, name: true } },
          settlementRecords: true,
        },
      });
      await this.prisma.commissionSettlementRecord.deleteMany({ where: { settlementId: settlement.id } });
      if (item.records.length) {
        await this.prisma.commissionSettlementRecord.createMany({
          data: item.records.map((record: any) => ({
            settlementId: settlement.id,
            commissionRecordId: record.commissionRecordId,
            amountSnapshot: record.amountSnapshot,
            statusSnapshot: record.statusSnapshot,
          })),
        });
      }
      settlements.push(
        this.serializeSettlement({
          ...settlement,
          settlementRecords: item.records.map((record: any) => ({
            ...record,
            settlementId: settlement.id,
          })),
        }),
      );
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
        include: {
          store: { select: { id: true, name: true } },
          staffUser: { select: { id: true, name: true, username: true } },
          beautician: { select: { id: true, name: true } },
          settlementRecords: true,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ settleMonth: 'desc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.commissionSettlement.count({ where }),
    ]);
    await this.attachSettlementFreshness(items);
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
      include: {
        store: { select: { id: true, name: true } },
        staffUser: { select: { id: true, name: true, username: true } },
        beautician: { select: { id: true, name: true } },
        settlementRecords: true,
      },
      orderBy: [{ settleMonth: 'desc' }, { staffUserId: 'asc' }],
    });
    await this.attachSettlementFreshness(items);
    const rows = items.map((item: any) => this.serializeSettlement(item));
    const content = this.buildCsv(rows, [
      { key: 'settleMonth', header: '月份' },
      { key: 'storeName', header: '门店' },
      { key: 'staffUserName', header: '员工' },
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

  async getSettlementById(id: number, context?: FinanceRequestContext) {
    const settlement = await this.prisma.commissionSettlement.findUnique({
      where: { id },
      include: {
        store: { select: { id: true, name: true } },
        staffUser: { select: { id: true, name: true, username: true } },
        beautician: { select: { id: true, name: true } },
        settlementRecords: {
          include: {
            commissionRecord: {
              include: {
                staffUser: { select: { id: true, name: true, username: true } },
                beautician: { select: { id: true, name: true } },
                store: { select: { id: true, name: true } },
                order: { select: { id: true, orderNo: true, customerName: true } },
                orderItem: { select: { id: true, name: true, itemType: true, itemId: true } },
                cardUsageRecord: { select: { id: true, cardName: true, projectName: true } },
                rule: { select: { id: true, name: true } },
                assignment: { include: { rule: { select: { id: true, name: true } } } },
              },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!settlement) throw new NotFoundException('结算单不存在');
    this.assertStoreAccess(this.toNumber(settlement.storeId), context);
    await this.attachSettlementFreshness([settlement]);
    return this.serializeSettlement(settlement);
  }

  async confirmSettlement(id: number, confirmedBy?: number, context?: FinanceRequestContext) {
    const existed = await this.getSettlementById(id, context);
    if (existed.needsRegenerate) throw new BadRequestException(existed.regenerateReason ?? '结算单明细已变化，请重新生成后再确认');
    const recordIds = Array.isArray(existed.settlementRecords)
      ? existed.settlementRecords.map((item: any) => this.toNumber(item.commissionRecordId)).filter((recordId: number) => recordId > 0)
      : [];
    if (!recordIds.length) throw new BadRequestException('结算单缺少锁定明细，请重新生成后再确认');
    const confirmedAt = new Date();
    const settlement = await this.prisma.commissionSettlement.update({
      where: { id },
      data: { status: 'confirmed', confirmedAt, confirmedBy },
      include: {
        store: { select: { id: true, name: true } },
        staffUser: { select: { id: true, name: true, username: true } },
        beautician: { select: { id: true, name: true } },
        settlementRecords: true,
      },
    });
    if (!settlement.staffUserId) throw new BadRequestException('结算单缺少员工主体，无法确认');
    await this.prisma.commissionRecord.updateMany({
      where: {
        id: { in: recordIds },
        status: { in: ['pending', 'confirmed'] },
      },
      data: { status: 'settled', settledAt: confirmedAt },
    });
    return this.serializeSettlement(settlement);
  }

  async markSettlementPaid(id: number, context?: CommissionPaymentContext) {
    const existed = await this.getSettlementById(id);
    if (existed.status !== 'confirmed') throw new ConflictException('只有已确认结算单可以发放');
    this.assertStoreAccess(this.toNumber(existed.storeId), context);
    if (context) {
      if (!context.paymentBatchNo?.trim() || !context.paymentMethod?.trim() || !context.paymentVoucherNo?.trim()) {
        throw new BadRequestException('付款批次、支付方式和凭证号不能为空');
      }
    }
    const paidAt = new Date();
    const settlement = await this.prisma.commissionSettlement.update({
      where: { id },
      data: {
        status: 'paid',
        paidAt,
        ...(context
          ? {
              paidBy: context.userId,
              paymentBatchNo: context.paymentBatchNo.trim(),
              paymentMethod: context.paymentMethod.trim(),
              paymentVoucherNo: context.paymentVoucherNo.trim(),
            }
          : {}),
      },
      include: {
        store: { select: { id: true, name: true } },
        staffUser: { select: { id: true, name: true, username: true } },
        beautician: { select: { id: true, name: true } },
      },
    });
    await this.writeFinanceAudit({
      storeId: this.toNumber(existed.storeId),
      userId: context?.userId,
      action: 'commission_settlement_paid',
      entityType: 'CommissionSettlement',
      entityId: id,
      afterPayload: context
        ? {
            paidAt,
            paymentBatchNo: context.paymentBatchNo.trim(),
            paymentMethod: context.paymentMethod.trim(),
            paymentVoucherNo: context.paymentVoucherNo.trim(),
          }
        : { paidAt },
    });
    return this.serializeSettlement(settlement);
  }

  async createCommissionAdjustment(
    settlementId: number,
    input: { type: string; amount: number; reason: string; commissionRecordId?: number },
    context: FinanceRequestContext,
  ) {
    const settlement = await this.prisma.commissionSettlement.findUnique({ where: { id: settlementId } });
    if (!settlement) throw new NotFoundException('结算单不存在');
    this.assertStoreAccess(this.toNumber(settlement.storeId), context);
    if (!['deduction', 'bonus', 'refund_recovery', 'correction'].includes(input.type)) {
      throw new BadRequestException('提成调整类型不正确');
    }
    const amount = this.toNumber(input.amount);
    if (!Number.isFinite(amount) || amount === 0) throw new BadRequestException('调整金额不能为 0');
    const reason = input.reason?.trim();
    if (!reason || reason.length < 5 || reason.length > 500) throw new BadRequestException('调整原因需为 5–500 字');

    const adjustment = await this.prisma.commissionAdjustment.create({
      data: {
        settlementId,
        commissionRecordId: input.commissionRecordId,
        storeId: this.toNumber(settlement.storeId),
        type: input.type,
        amount,
        reason,
        status: 'pending',
        createdBy: context.userId,
      },
    });
    await this.writeFinanceAudit({
      storeId: this.toNumber(settlement.storeId),
      userId: context.userId,
      action: 'commission_adjustment_created',
      entityType: 'CommissionAdjustment',
      entityId: adjustment.id,
      reason,
      afterPayload: { settlementId, commissionRecordId: input.commissionRecordId, type: input.type, amount },
    });
    return adjustment;
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

  async getPaymentRecords(query: {
    page?: number | string;
    pageSize?: number | string;
    storeId?: number | string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    method?: string;
  }) {
    const page = Math.max(1, this.toNumber(query.page) || 1);
    const pageSize = Math.max(1, this.toNumber(query.pageSize) || 20);
    const where: any = {};
    const storeId = this.toNumber(query.storeId);
    if (query.status) where.status = query.status;
    if (query.method) where.method = query.method;
    if (query.dateFrom || query.dateTo) {
      where.paidAt = {};
      if (query.dateFrom) where.paidAt.gte = this.normalizeDay(query.dateFrom);
      if (query.dateTo) where.paidAt.lt = this.addDays(this.normalizeDay(query.dateTo), 1);
    }
    if (storeId > 0) where.order = { storeId };

    const [items, total, aggregate] = await Promise.all([
      this.prisma.paymentRecord.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              orderNo: true,
              checkoutGroupNo: true,
              orderKind: true,
              source: true,
              customerName: true,
              storeId: true,
              store: { select: { id: true, name: true } },
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { paidAt: 'desc' },
      }),
      this.prisma.paymentRecord.count({ where }),
      this.prisma.paymentRecord.aggregate({ where, _sum: { amount: true } }),
    ]);
    const normalizedItems = items.map((item: any) => this.serializePaymentRecord(item));
    return {
      items: normalizedItems,
      data: normalizedItems,
      total,
      page,
      pageSize,
      summary: {
        paymentAmount: this.toNumber(aggregate?._sum?.amount),
        paymentCount: total,
      },
    };
  }

  async getRefundRecords(query: {
    page?: number | string;
    pageSize?: number | string;
    storeId?: number | string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    method?: string;
  }) {
    const page = Math.max(1, this.toNumber(query.page) || 1);
    const pageSize = Math.max(1, this.toNumber(query.pageSize) || 20);
    const where: any = {};
    const storeId = this.toNumber(query.storeId);
    if (query.status) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
      where.refundedAt = {};
      if (query.dateFrom) where.refundedAt.gte = this.normalizeDay(query.dateFrom);
      if (query.dateTo) where.refundedAt.lt = this.addDays(this.normalizeDay(query.dateTo), 1);
    }
    const orderWhere: any = {};
    if (storeId > 0) orderWhere.storeId = storeId;
    if (query.method) orderWhere.payMethod = query.method;
    if (Object.keys(orderWhere).length) where.order = orderWhere;

    const [items, total, aggregate] = await Promise.all([
      this.prisma.refundRecord.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              orderNo: true,
              orderKind: true,
              customerName: true,
              storeId: true,
              payMethod: true,
              store: { select: { id: true, name: true } },
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { refundedAt: 'desc' },
      }),
      this.prisma.refundRecord.count({ where }),
      this.prisma.refundRecord.aggregate({ where, _sum: { amount: true } }),
    ]);
    const normalizedItems = items.map((item: any) => this.serializeRefundRecord(item));
    return {
      items: normalizedItems,
      data: normalizedItems,
      total,
      page,
      pageSize,
      summary: {
        refundAmount: this.toNumber(aggregate?._sum?.amount),
        refundCount: total,
      },
    };
  }

  async getReconciliationExceptions(query: {
    page?: number | string;
    pageSize?: number | string;
    storeId?: number | string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const page = Math.max(1, this.toNumber(query.page) || 1);
    const pageSize = Math.max(1, this.toNumber(query.pageSize) || 50);
    const storeId = this.asStoreId(query.storeId);
    const dateTexts = this.getBusinessDateTexts(query.dateFrom, query.dateTo);
    if (!dateTexts.length) return { items: [], data: [], total: 0, page, pageSize };

    const rangeStart = this.getBusinessDayRange(dateTexts[0]).start;
    const rangeEnd = this.getBusinessDayRange(dateTexts[dateTexts.length - 1]).end;

    const [settlements, payments, refunds, shifts] = await Promise.all([
      this.db().dailySettlement.findMany({
        where: { storeId, settleDate: { gte: rangeStart, lt: rangeEnd } },
        include: { store: { select: { id: true, name: true } } },
        orderBy: { settleDate: 'desc' },
      }),
      this.prisma.paymentRecord.findMany({
        where: {
          status: 'success',
          paidAt: { gte: rangeStart, lt: rangeEnd },
          order: { storeId },
        },
        include: { order: { select: { id: true, orderNo: true, customerName: true, storeId: true } } },
      }),
      this.prisma.refundRecord.findMany({
        where: {
          status: { in: ['success', 'completed', 'refunded'] },
          refundedAt: { gte: rangeStart, lt: rangeEnd },
          order: { storeId },
        },
        include: {
          items: { include: { stockMovements: true } },
          order: {
            select: {
              id: true,
              orderNo: true,
              customerName: true,
              storeId: true,
              netAmount: true,
              status: true,
              refundRecords: { where: { status: { in: ['success', 'completed', 'refunded'] } }, select: { amount: true } },
            },
          },
        },
      }),
      this.db().cashierShift.findMany({
        where: {
          storeId,
          startedAt: { gte: rangeStart, lt: rangeEnd },
          status: { in: ['closed', 'reconciled'] },
        },
        include: {
          store: { select: { id: true, name: true } },
          device: { select: { id: true, name: true } },
          operator: { select: { id: true, name: true } },
        },
        orderBy: { startedAt: 'desc' },
      }),
    ]);

    const settlementByDate = new Map<string, any>();
    for (const settlement of settlements) {
      const date = this.normalizeBusinessDateText(settlement.settleDate);
      const current = settlementByDate.get(date);
      if (!current || new Date(settlement.updatedAt ?? settlement.settleDate).getTime() > new Date(current.updatedAt ?? current.settleDate).getTime()) {
        settlementByDate.set(date, settlement);
      }
    }

    const paymentByDate = new Map<string, number>();
    for (const payment of payments) {
      const paidAt = payment.paidAt ?? payment.createdAt;
      if (!paidAt) continue;
      const date = this.normalizeBusinessDateText(paidAt);
      paymentByDate.set(date, (paymentByDate.get(date) ?? 0) + this.toNumber(payment.amount));
    }

    const refundByDate = new Map<string, number>();
    const latestRefundByDate = new Map<string, any>();
    for (const refund of refunds) {
      const refundedAt = refund.refundedAt ?? refund.createdAt;
      if (!refundedAt) continue;
      const date = this.normalizeBusinessDateText(refundedAt);
      refundByDate.set(date, (refundByDate.get(date) ?? 0) + this.toNumber(refund.amount));
      const current = latestRefundByDate.get(date);
      if (!current || new Date(refundedAt).getTime() > new Date(current.refundedAt ?? current.createdAt).getTime()) latestRefundByDate.set(date, refund);
    }

    const exceptions: any[] = [];
    const pushException = (item: any) => {
      exceptions.push({
        id: `${item.type}:${item.date}:${item.sourceId ?? exceptions.length}`,
        storeId,
        ...item,
      });
    };

    for (const date of dateTexts) {
      const settlement = settlementByDate.get(date);
      const paymentAmount = Math.round((paymentByDate.get(date) ?? 0) * 100) / 100;
      const refundAmount = Math.round((refundByDate.get(date) ?? 0) * 100) / 100;
      const expectedNet = Math.round((paymentAmount - refundAmount) * 100) / 100;
      const hasFlow = paymentAmount > 0 || refundAmount > 0;

      if (!settlement && hasFlow) {
        pushException({
          date,
          type: 'missing_daily_settlement',
          severity: 'high',
          title: '缺少日结单',
          detail: `当天已有支付 ${paymentAmount.toFixed(2)}、退款 ${refundAmount.toFixed(2)}，但未生成日结。`,
          actionTarget: 'daily',
          amountDiff: expectedNet,
        });
        continue;
      }

      if (!settlement) continue;

      if (settlement.status !== 'confirmed') {
        pushException({
          date,
          type: 'daily_unconfirmed',
          severity: 'medium',
          title: '日结未确认',
          detail: '当天日结仍处于草稿状态，需要财务复核后确认。',
          actionTarget: 'daily',
          sourceId: settlement.id,
        });
      }

      const settlementSummary = settlement.summary && typeof settlement.summary === 'object' ? settlement.summary : {};
      const settlementPayment = Math.round(
        this.toNumber(
          settlementSummary.total ??
            (this.toNumber(settlement.cashRevenue) +
              this.toNumber(settlement.wechatRevenue) +
              this.toNumber(settlement.alipayRevenue) +
              this.toNumber(settlement.cardRevenue) +
              this.toNumber(settlement.balanceRevenue)),
        ) * 100,
      ) / 100;
      const paymentDiff = Math.round((settlementPayment - paymentAmount) * 100) / 100;
      const settlementRefund = Math.round(this.toNumber(settlement.refundAmount) * 100) / 100;
      const refundDiff = Math.round((settlementRefund - refundAmount) * 100) / 100;
      if (Math.abs(paymentDiff) >= 0.01 || Math.abs(refundDiff) >= 0.01) {
        pushException({
          date,
          type: 'daily_amount_mismatch',
          severity: 'high',
          title: '日结金额与支付/退款流水不一致',
          detail: `日结支付 ${settlementPayment.toFixed(2)}，成功支付流水 ${paymentAmount.toFixed(2)}；日结退款 ${settlementRefund.toFixed(2)}，成功退款流水 ${refundAmount.toFixed(2)}。营业收入与预收资金不参与支付现金流勾稽。`,
          actionTarget: 'daily',
          sourceId: settlement.id,
          amountDiff: Math.abs(paymentDiff) >= 0.01 ? paymentDiff : refundDiff,
        });
      }

      const latestRefund = latestRefundByDate.get(date);
      if (latestRefund && settlement.updatedAt && new Date(latestRefund.refundedAt ?? latestRefund.createdAt).getTime() > new Date(settlement.updatedAt).getTime()) {
        pushException({
          date,
          type: 'refund_after_daily_settlement',
          severity: 'medium',
          title: '退款发生在日结刷新之后',
          detail: `最新退款 ${latestRefund.refundNo ?? latestRefund.id} 晚于日结更新时间，需要刷新当天日结。`,
          actionTarget: 'refunds',
          sourceId: latestRefund.id,
        });
      }
    }

    const checkedOrders = new Set<number>();
    const refundOrderIds = [...new Set(refunds.map((refund: any) => this.toNumber(refund.orderId ?? refund.order?.id)).filter((id: number) => id > 0))];
    const settledCommissionRecords = refundOrderIds.length
      ? await this.prisma.commissionRecord.findMany({
          where: { orderId: { in: refundOrderIds }, status: 'settled' },
          include: { adjustments: { where: { type: 'refund_recovery', status: { not: 'cancelled' } } } },
        })
      : [];
    const settledCommissionByOrderItem = new Map<number, any[]>();
    for (const record of Array.isArray(settledCommissionRecords) ? settledCommissionRecords : []) {
      if (!record.orderItemId) continue;
      const list = settledCommissionByOrderItem.get(record.orderItemId) ?? [];
      list.push(record);
      settledCommissionByOrderItem.set(record.orderItemId, list);
    }
    for (const refund of refunds) {
      const date = this.normalizeBusinessDateText(refund.refundedAt ?? refund.createdAt);
      const refundItems = Array.isArray(refund.items) ? refund.items : [];
      if (!refundItems.length) {
        pushException({
          date,
          type: 'refund_without_items',
          severity: 'high',
          title: '退款缺少明细',
          detail: `退款 ${refund.refundNo ?? refund.id} 无退款明细，无法核对退款数量和库存动作。`,
          actionTarget: 'refunds',
          sourceId: refund.id,
        });
      }
      const refundItemTotal = refundItems.reduce((sum: number, item: any) => sum + this.toNumber(item.refundAmount), 0);
      if (refundItems.length && Math.abs(refundItemTotal - this.toNumber(refund.amount)) >= 0.01) {
        pushException({ date, type: 'refund_item_amount_mismatch', severity: 'high', title: '退款总额与明细不一致', detail: `退款 ${refund.refundNo ?? refund.id} 总额 ${this.toNumber(refund.amount).toFixed(2)}，明细合计 ${refundItemTotal.toFixed(2)}。`, actionTarget: 'refunds', sourceId: refund.id, amountDiff: Math.round((refundItemTotal - this.toNumber(refund.amount)) * 100) / 100 });
      }
      if (refund.refundMode === 'return_and_refund' && refundItems.some((item: any) => item.inventoryAction !== 'none' && !(item.stockMovements ?? []).length)) {
        pushException({ date, type: 'return_refund_without_stock_movement', severity: 'high', title: '退货缺少库存流水', detail: `退款 ${refund.refundNo ?? refund.id} 选择退款退货，但未形成完整反向库存流水。`, actionTarget: 'refunds', sourceId: refund.id });
      }
      if (refund.refundMode === 'refund_only' && refundItems.some((item: any) => (item.stockMovements ?? []).length)) {
        pushException({ date, type: 'refund_only_with_stock_movement', severity: 'high', title: '仅退款误写库存', detail: `退款 ${refund.refundNo ?? refund.id} 为仅退款，但存在反向库存流水。`, actionTarget: 'refunds', sourceId: refund.id });
      }
      const missingCommissionRecovery = refundItems.some((item: any) =>
        (settledCommissionByOrderItem.get(this.toNumber(item.orderItemId)) ?? []).some((record: any) => !(record.adjustments ?? []).length),
      );
      if (missingCommissionRecovery) {
        pushException({ date, type: 'refund_without_commission_adjustment', severity: 'high', title: '已结算提成缺少退款追缴', detail: `退款 ${refund.refundNo ?? refund.id} 涉及已结算提成，但没有对应负向调整记录。`, actionTarget: 'refunds', sourceId: refund.id });
      }

      const order = refund.order;
      if (!order?.id || checkedOrders.has(order.id)) continue;
      checkedOrders.add(order.id);
      const refundedAmount = (order.refundRecords ?? []).reduce((sum: number, record: any) => sum + this.toNumber(record.amount), 0);
      const netAmount = this.toNumber(order.netAmount);
      if (netAmount > 0 && refundedAmount - netAmount >= 0.01) {
        pushException({ date, type: 'over_refunded', severity: 'high', title: '订单累计退款超额', detail: `订单 ${order.orderNo ?? order.id} 实收 ${netAmount.toFixed(2)}，累计成功退款 ${refundedAmount.toFixed(2)}。`, actionTarget: 'refunds', sourceId: order.id, amountDiff: Math.round((refundedAmount - netAmount) * 100) / 100 });
      } else if (order.status === 'refunded' && netAmount - refundedAmount >= 0.01) {
        pushException({ date, type: 'partial_refund_marked_full', severity: 'high', title: '部分退款被标记为全退', detail: `订单 ${order.orderNo ?? order.id} 尚有 ${(netAmount - refundedAmount).toFixed(2)} 未退，但状态已是 refunded。`, actionTarget: 'refunds', sourceId: order.id });
      }
    }

    for (const shift of shifts) {
      const cashDiff = Math.round(this.toNumber(shift.cashDiff) * 100) / 100;
      if (Math.abs(cashDiff) < 0.01) continue;
      pushException({
        date: this.normalizeBusinessDateText(shift.startedAt),
        type: 'cash_shift_diff',
        severity: Math.abs(cashDiff) >= 50 ? 'high' : 'medium',
        title: '班次现金差异',
        detail: `班次 ${shift.operator?.name ?? shift.device?.name ?? `#${shift.id}`} 现金差异 ${cashDiff.toFixed(2)}。`,
        actionTarget: 'shifts',
        sourceId: shift.id,
        amountDiff: cashDiff,
      });
    }

    const sorted = exceptions.sort((a, b) => {
      const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      const severityDiff = (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
      if (severityDiff) return severityDiff;
      return String(b.date).localeCompare(String(a.date));
    });
    const items = sorted.slice((page - 1) * pageSize, page * pageSize);
    return { items, data: items, total: sorted.length, page, pageSize, summary: { high: sorted.filter((item) => item.severity === 'high').length, medium: sorted.filter((item) => item.severity === 'medium').length, low: sorted.filter((item) => item.severity === 'low').length } };
  }

  private dailyMetricSummary(metric: any) {
    return {
      metricVersion: 'finance_metrics_v1',
      cash: this.toNumber(metric.paymentBreakdown?.cash),
      wechat: this.toNumber(metric.paymentBreakdown?.wechat),
      alipay: this.toNumber(metric.paymentBreakdown?.alipay),
      card: this.toNumber(metric.paymentBreakdown?.card),
      total: this.toNumber(metric.paymentBreakdown?.total ?? metric.cashIncome),
      member_balance: this.toNumber(metric.memberBalanceDeductTotal),
      memberBalanceCashDeduct: this.toNumber(metric.memberBalanceDeductCash),
      memberBalanceGiftDeduct: this.toNumber(metric.memberBalanceDeductGift),
      prepaidAmount: this.toNumber(metric.prepaidAmount),
      cardUsageRecognized: this.toNumber(metric.cardUsageRecognized),
      refund: this.toNumber(metric.refundAmount),
      materialCost: this.toNumber(metric.materialCost),
      productCost: this.toNumber(metric.productCost),
      commissionCost: this.toNumber(metric.commissionCost),
      dataQuality: metric.dataQuality,
    };
  }

  private async upsertDailySettlementFromMetric(storeId: number, settleDate: Date, metric: any) {
    const summary = this.dailyMetricSummary(metric);
    const materialCostTotal = this.toNumber(metric.materialCost) + this.toNumber(metric.productCost);
    const grossMarginPercent = this.toNumber(metric.grossMargin) * 100;
    const systemSummary = {
      totalRevenue: this.toNumber(metric.operatingRevenue),
      cashRevenue: this.toNumber(metric.paymentBreakdown?.cash),
      wechatRevenue: this.toNumber(metric.paymentBreakdown?.wechat),
      alipayRevenue: this.toNumber(metric.paymentBreakdown?.alipay),
      cardRevenue: this.toNumber(metric.paymentBreakdown?.card),
      balanceRevenue: this.toNumber(metric.memberBalanceDeductTotal),
      rechargeIncome: this.toNumber(metric.prepaidAmount),
      refundAmount: this.toNumber(metric.refundAmount),
      materialCost: materialCostTotal,
      commissionTotal: this.toNumber(metric.commissionCost),
    };
    const settlement = await this.db().dailySettlement.upsert({
      where: { storeId_settleDate: { storeId, settleDate } },
      create: {
        storeId,
        settleDate,
        totalRevenue: this.toNumber(metric.operatingRevenue),
        cashRevenue: this.toNumber(metric.paymentBreakdown?.cash),
        wechatRevenue: this.toNumber(metric.paymentBreakdown?.wechat),
        alipayRevenue: this.toNumber(metric.paymentBreakdown?.alipay),
        cardRevenue: this.toNumber(metric.paymentBreakdown?.card),
        balanceRevenue: this.toNumber(metric.memberBalanceDeductTotal),
        rechargeIncome: this.toNumber(metric.prepaidAmount),
        refundAmount: this.toNumber(metric.refundAmount),
        orderCount: this.toNumber(metric.orderCount),
        customerCount: this.toNumber(metric.customerCount),
        avgTransaction: this.toNumber(metric.avgTicket),
        materialCost: materialCostTotal,
        grossProfit: this.toNumber(metric.grossProfit),
        grossMargin: grossMarginPercent,
        commissionTotal: this.toNumber(metric.commissionCost),
        status: 'draft',
        summary,
        systemSummary,
      },
      update: {
        totalRevenue: this.toNumber(metric.operatingRevenue),
        cashRevenue: this.toNumber(metric.paymentBreakdown?.cash),
        wechatRevenue: this.toNumber(metric.paymentBreakdown?.wechat),
        alipayRevenue: this.toNumber(metric.paymentBreakdown?.alipay),
        cardRevenue: this.toNumber(metric.paymentBreakdown?.card),
        balanceRevenue: this.toNumber(metric.memberBalanceDeductTotal),
        rechargeIncome: this.toNumber(metric.prepaidAmount),
        refundAmount: this.toNumber(metric.refundAmount),
        orderCount: this.toNumber(metric.orderCount),
        customerCount: this.toNumber(metric.customerCount),
        avgTransaction: this.toNumber(metric.avgTicket),
        materialCost: materialCostTotal,
        grossProfit: this.toNumber(metric.grossProfit),
        grossMargin: grossMarginPercent,
        commissionTotal: this.toNumber(metric.commissionCost),
        summary,
        systemSummary,
      },
      include: { store: { select: { id: true, name: true } } },
    });
    return this.serializeDailySettlement(settlement);
  }

  async generateDailySettlement(storeIdInput: number | string | undefined, dateInput: string | Date) {
    const storeId = this.asStoreId(storeIdInput);
    const { start: dayStart, end: dayEnd, settleDate } = this.getBusinessDayRange(dateInput);
    const existed = await this.db().dailySettlement.findUnique({ where: { storeId_settleDate: { storeId, settleDate } } });
    if (existed?.status === 'confirmed') throw new ConflictException('已确认日结禁止重新生成，请先由平台管理员重开');
    if (this.financeMetricsService) {
      const metric = await this.financeMetricsService.getDailyMetricForStoreDate(storeId, settleDate);
      return this.upsertDailySettlementFromMetric(storeId, settleDate, metric);
    }

    const [orders, refunds] = await Promise.all([
      this.prisma.productOrder.findMany({
        where: {
          storeId,
          createdAt: { gte: dayStart, lt: dayEnd },
          OR: [
            { status: { in: ['completed', 'paid', 'refunded'] } },
            { paymentRecords: { some: { status: 'success' } } },
          ],
        },
        include: {
          orderItems: true,
          paymentRecords: { where: { status: 'success' } },
        },
      }),
      this.prisma.refundRecord.findMany({
        where: {
          status: { in: ['success', 'completed', 'refunded'] },
          refundedAt: { gte: dayStart, lt: dayEnd },
          order: { storeId },
        },
      }),
    ]);

    const paymentSummary = this.emptyPaymentSummary();
    let grossRevenue = 0;
    let rechargeIncome = 0;
    let prepaidIncome = 0;
    const customers = new Set<number>();
    const allOrderItems: any[] = [];
    for (const order of orders) {
      const paid = order.paymentRecords.reduce((sum: number, payment: any) => sum + this.toNumber(payment.amount), 0);
      const orderAmount = paid > 0 ? paid : this.toNumber(order.totalAmount);
      grossRevenue += orderAmount;
      prepaidIncome += this.prepaidIncomeFromOrder(order, orderAmount);
      if (order.customerId) customers.add(order.customerId);
      if (order.paymentRecords.length) {
        for (const payment of order.paymentRecords) this.addPayment(paymentSummary, payment.method, payment.amount);
      } else {
        this.addPayment(paymentSummary, order.payMethod, orderAmount);
      }
      allOrderItems.push(...order.orderItems);
      const hasRecharge = order.orderItems.some((item: any) => item.itemType === 'recharge');
      if (hasRecharge) rechargeIncome += orderAmount;
    }
    const orderIds = orders.map((order) => this.toNumber(order.id)).filter((id) => id > 0);
    const memberBalanceDeducts = orderIds.length
      ? await this.prisma.customerBalanceTransaction.findMany({
          where: { orderId: { in: orderIds }, type: 'deduct', paymentMethod: 'member_balance' },
          select: { amount: true, giftAmount: true },
        })
      : [];
    paymentSummary.memberBalanceCashDeduct =
      Math.round(memberBalanceDeducts.reduce((sum: number, item: any) => sum + this.toNumber(item.amount), 0) * 100) / 100;
    paymentSummary.memberBalanceGiftDeduct =
      Math.round(memberBalanceDeducts.reduce((sum: number, item: any) => sum + this.toNumber(item.giftAmount), 0) * 100) / 100;
    const refundAmount = refunds.reduce((sum: number, refund: any) => sum + this.toNumber(refund.amount), 0);
    paymentSummary.refund = refundAmount;

    const materialCost = await this.calculateMaterialCost(allOrderItems);
    const commissionRecords = await this.prisma.commissionRecord.findMany({
      where: {
        storeId,
        createdAt: { gte: dayStart, lt: dayEnd },
        status: { not: 'cancelled' },
      },
    });
    const commissionTotal = commissionRecords.reduce((sum: number, record: any) => sum + this.toNumber(record.amount), 0);
    const netRevenue = Math.round((grossRevenue - refundAmount) * 100) / 100;
    const grossProfit = Math.round((netRevenue - materialCost - commissionTotal) * 100) / 100;
    const grossMargin = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 10000) / 100 : 0;
    const avgTransaction = orders.length > 0 ? Math.round((netRevenue / orders.length) * 100) / 100 : 0;
    const systemSummary = {
      totalRevenue: netRevenue,
      cashRevenue: paymentSummary.cash,
      wechatRevenue: paymentSummary.wechat,
      alipayRevenue: paymentSummary.alipay,
      cardRevenue: paymentSummary.card,
      balanceRevenue: paymentSummary.member_balance,
      rechargeIncome,
      refundAmount,
      materialCost,
      commissionTotal,
    };
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
        systemSummary,
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
        systemSummary,
      },
      include: { store: { select: { id: true, name: true } } },
    });
    (settlement as any)._prepaidIncome = Math.round(prepaidIncome * 100) / 100;
    await this.attachDailyCardUsageRevenue([settlement]);
    return this.serializeDailySettlement(settlement);
  }

  async generateDailySettlementsForAllStores(dateInput: string | Date = this.getYesterday()) {
    const settleDate = this.normalizeBusinessDateText(dateInput);
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

  private getReconciliationRunner() {
    if (!this.moduleRef) return undefined;
    try {
      return this.moduleRef.get<any>('FINANCE_RECONCILIATION_RUNNER', { strict: false });
    } catch {
      return undefined;
    }
  }

  async refreshDailySettlementForFact(storeId: number, occurredAt: string | Date, source: string) {
    const runner = this.getReconciliationRunner();
    if (!runner?.runDailyClose) return this.generateDailySettlement(storeId, occurredAt);
    return runner.runDailyClose(storeId, occurredAt, { triggerType: 'late_fact', autoConfirm: true, source });
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleDailySettlementCron() {
    const runner = this.getReconciliationRunner();
    if (!runner?.runDailyClose) return this.generateDailySettlementsForAllStores(this.getYesterday());
    const settleDate = this.getYesterday();
    const stores = await this.prisma.store.findMany({
      where: { deletedAt: null, status: 'active' },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    const items = [];
    for (const store of stores) {
      items.push(await runner.runDailyClose(store.id, settleDate, { triggerType: 'scheduled', autoConfirm: true }));
    }
    return { items, total: items.length, settleDate };
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
      if (query.dateFrom) where.settleDate.gte = this.getBusinessDayRange(query.dateFrom).start;
      if (query.dateTo) where.settleDate.lt = this.getBusinessDayRange(query.dateTo).end;
    }

    const rawItems = await this.db().dailySettlement.findMany({
      where,
      include: { store: { select: { id: true, name: true } } },
      orderBy: { settleDate: 'desc' },
    });
    const snapshots = rawItems.length && this.db().dailySettlementSnapshot?.findMany
      ? await this.db().dailySettlementSnapshot.findMany({
          where: { dailySettlementId: { in: rawItems.map((item: any) => item.id) } },
          select: { dailySettlementId: true, version: true, confirmedAt: true, confirmedBy: true },
          orderBy: [{ dailySettlementId: 'asc' }, { version: 'desc' }],
        })
      : [];
    const latestSnapshotBySettlement = new Map<number, any>();
    for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
      if (!latestSnapshotBySettlement.has(snapshot.dailySettlementId)) latestSnapshotBySettlement.set(snapshot.dailySettlementId, snapshot);
    }
    for (const item of rawItems) {
      const latest = latestSnapshotBySettlement.get(item.id);
      item.latestVersion = this.toNumber(latest?.version);
      item.needsRefresh = item.status === 'draft' && Boolean(latest);
    }
    const deduped = new Map<string, any>();
    for (const item of rawItems) {
      const key = `${item.storeId}:${this.normalizeBusinessDateText(item.settleDate)}`;
      const current = deduped.get(key);
      if (!current) {
        deduped.set(key, item);
        continue;
      }
      const itemScore = (this.isCanonicalSettlementDate(item) ? 4 : 0) + (item.status === 'confirmed' ? 2 : 0);
      const currentScore = (this.isCanonicalSettlementDate(current) ? 4 : 0) + (current.status === 'confirmed' ? 2 : 0);
      if (
        itemScore > currentScore ||
        (itemScore === currentScore && new Date(item.updatedAt ?? item.settleDate).getTime() > new Date(current.updatedAt ?? current.settleDate).getTime())
      ) {
        deduped.set(key, item);
      }
    }
    const dedupedItems = Array.from(deduped.values()).sort((a, b) => this.normalizeBusinessDateText(b.settleDate).localeCompare(this.normalizeBusinessDateText(a.settleDate)));
    await Promise.all([
      this.attachDailyCardUsageRevenue(dedupedItems),
      this.attachDailyPrepaidIncome(dedupedItems),
    ]);
    const allItems = dedupedItems.map((item: any) => this.serializeDailySettlement(item));
    const normalizedItems = allItems.slice((page - 1) * pageSize, page * pageSize);
    return { items: normalizedItems, data: normalizedItems, total: allItems.length, page, pageSize };
  }

  async confirmDailySettlement(
    id: number,
    confirmedBy?: number,
    expectedStoreId?: number,
    options: DailySettlementConfirmationOptions = {},
  ) {
    const existed = await this.db().dailySettlement.findUnique({ where: { id } });
    if (!existed) throw new NotFoundException('日结单不存在');
    if (expectedStoreId && this.toNumber(existed.storeId) !== expectedStoreId) throw new ForbiddenException('无权确认其他门店日结');
    const confirmationMode = options.confirmationMode ?? 'manual';
    if (confirmationMode === 'manual' && !confirmedBy) throw new BadRequestException('缺少日结确认人');
    if (existed.status === 'confirmed') throw new ConflictException('日结已经确认');
    const version = (await this.db().dailySettlementSnapshot.count({ where: { dailySettlementId: id } })) + 1;
    const confirmedAt = new Date();
    const systemSummary = existed.systemSummary ?? {
      totalRevenue: existed.totalRevenue,
      cashRevenue: existed.cashRevenue,
      wechatRevenue: existed.wechatRevenue,
      alipayRevenue: existed.alipayRevenue,
      cardRevenue: existed.cardRevenue,
      balanceRevenue: existed.balanceRevenue,
      rechargeIncome: existed.rechargeIncome,
      refundAmount: existed.refundAmount,
      materialCost: existed.materialCost,
      commissionTotal: existed.commissionTotal,
    };
    const adjustmentSummary = existed.adjustmentSummary ?? {};
    const finalSummary = existed.finalSummary ?? systemSummary;
    const snapshotPayload = {
      summary: existed.summary ?? null,
      status: 'confirmed',
      sourceUpdatedAt: existed.updatedAt ?? null,
      systemSummary,
      adjustmentSummary,
      finalSummary,
      confirmationMode,
      reconciliationRunId: options.reconciliationRunId ?? null,
      ruleVersion: options.ruleVersion ?? null,
    };
    await this.db().dailySettlementSnapshot.create({
      data: {
        dailySettlementId: id,
        storeId: existed.storeId,
        settleDate: existed.settleDate,
        version,
        totalRevenue: existed.totalRevenue,
        cashRevenue: existed.cashRevenue,
        wechatRevenue: existed.wechatRevenue,
        alipayRevenue: existed.alipayRevenue,
        cardRevenue: existed.cardRevenue,
        balanceRevenue: existed.balanceRevenue,
        rechargeIncome: existed.rechargeIncome,
        refundAmount: existed.refundAmount,
        orderCount: existed.orderCount,
        customerCount: existed.customerCount,
        avgTransaction: existed.avgTransaction,
        materialCost: existed.materialCost,
        grossProfit: existed.grossProfit,
        grossMargin: existed.grossMargin,
        commissionTotal: existed.commissionTotal,
        snapshot: snapshotPayload,
        sourceDigest: options.sourceDigest ?? null,
        systemSummary,
        adjustmentSummary,
        finalSummary,
        confirmationMode,
        reconciliationRunId: options.reconciliationRunId ?? null,
        ruleVersion: options.ruleVersion ?? null,
        confirmedBy: confirmedBy ?? null,
        confirmedAt,
      },
    });
    const settlement = await this.db().dailySettlement.update({
      where: { id },
      data: { status: 'confirmed', confirmedAt, confirmedBy: confirmedBy ?? null, confirmationMode },
      include: { store: { select: { id: true, name: true } } },
    });
    await this.writeFinanceAudit({
      storeId: existed.storeId,
      userId: confirmedBy ?? null,
      action: confirmationMode === 'auto' ? 'daily_settlement_auto_confirm' : 'daily_settlement_confirm',
      entityType: 'DailySettlement',
      entityId: id,
      beforePayload: { status: existed.status },
      afterPayload: { status: 'confirmed', version, confirmationMode, reconciliationRunId: options.reconciliationRunId ?? null },
    });
    return { ...this.serializeDailySettlement(settlement), version };
  }

  async reopenDailySettlement(id: number, context: FinanceRequestContext) {
    if (!this.isSuperAdmin(context)) throw new ForbiddenException('仅平台管理员可以重开已确认日结');
    const reason = String(context.reason ?? '').trim();
    if (reason.length < 5 || reason.length > 500) throw new BadRequestException('重开原因需为 5-500 字');
    const existed = await this.db().dailySettlement.findUnique({ where: { id } });
    if (!existed) throw new NotFoundException('日结单不存在');
    if (existed.status !== 'confirmed') throw new BadRequestException('只有已确认日结可以重开');
    const settlement = await this.db().dailySettlement.update({
      where: { id },
      data: { status: 'draft', confirmedAt: null, confirmedBy: null },
    });
    await this.writeFinanceAudit({
      storeId: existed.storeId,
      userId: context.userId,
      action: 'daily_settlement_reopen',
      entityType: 'DailySettlement',
      entityId: id,
      reason,
      beforePayload: { status: existed.status },
      afterPayload: { status: 'draft' },
    });
    return this.serializeDailySettlement(settlement);
  }

  async getDailySettlementVersions(id: number, context?: Pick<FinanceRequestContext, 'storeIds' | 'roles' | 'permissions'>) {
    const settlement = await this.db().dailySettlement.findUnique({ where: { id }, select: { id: true, storeId: true } });
    if (!settlement) throw new NotFoundException('日结单不存在');
    this.assertStoreAccess(this.toNumber(settlement.storeId), context);
    const items = await this.db().dailySettlementSnapshot.findMany({
      where: { dailySettlementId: id },
      orderBy: { version: 'desc' },
    });
    return { items, total: items.length };
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
