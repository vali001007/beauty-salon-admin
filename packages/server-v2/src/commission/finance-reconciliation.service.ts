import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { CommissionService, type FinanceRequestContext } from './commission.service.js';

const RULE_VERSION = 'finance_reconciliation_v1';
const AUTO_HEALABLE_CODES = new Set([
  'missing_daily_settlement',
  'daily_unconfirmed',
  'refund_after_daily_settlement',
]);
const INTEGRITY_CODES = new Set([
  'refund_without_items',
  'refund_item_amount_mismatch',
  'return_refund_without_stock_movement',
  'refund_only_with_stock_movement',
  'refund_without_commission_adjustment',
  'over_refunded',
  'partial_refund_marked_full',
]);
const BLOCKING_CODES = new Set([
  'daily_amount_mismatch',
  'cash_shift_diff',
  ...INTEGRITY_CODES,
  'manual_adjustment_pending',
  'auto_task_failure',
]);
const EFFECT_FIELDS = new Set([
  'totalRevenue',
  'cashRevenue',
  'wechatRevenue',
  'alipayRevenue',
  'cardRevenue',
  'balanceRevenue',
  'rechargeIncome',
  'refundAmount',
  'materialCost',
  'commissionTotal',
]);

type RunOptions = {
  triggerType?: 'scheduled' | 'manual' | 'late_fact';
  autoConfirm?: boolean;
};

type ReconciliationIssueDraft = {
  code: string;
  category: string;
  severity: string;
  title: string;
  detail: string;
  amount?: number;
  sourceType?: string;
  sourceId?: number;
  actionPath: string;
};

type DailySettlementAdjustmentInput = {
  adjustmentType: string;
  effectField: string;
  amount: number;
  reason: string;
  voucherNo?: string;
};

@Injectable()
export class FinanceReconciliationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService | any,
    @Inject(CommissionService) private readonly commissionService: CommissionService | any,
  ) {}

  private toNumber(value: unknown) {
    return Number(value ?? 0);
  }

  private dateText(value: string | Date) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10)) && value.length <= 10) return value.slice(0, 10);
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('经营日格式不正确');
    return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  private businessDate(value: string | Date) {
    return new Date(`${this.dateText(value)}T00:00:00.000Z`);
  }

  private digest(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private category(code: string) {
    if (code === 'auto_task_failure') return 'automation_failure';
    if (INTEGRITY_CODES.has(code)) return 'data_integrity';
    return 'operating_exception';
  }

  private actionPath(target?: string) {
    if (target === 'refunds') return '/finance/reconciliation?tab=refunds';
    if (target === 'shifts') return '/finance/reconciliation?tab=shifts';
    return '/finance/reconciliation?tab=daily';
  }

  private hasProfitQualityWarning(settlement: any) {
    const quality = settlement?.summary?.dataQuality ?? settlement?.dataQuality;
    if (!quality) return false;
    const status = String(quality.status ?? quality.quality ?? '').toLowerCase();
    return Boolean(status && !['complete', 'ready', 'actual'].includes(status));
  }

  private issueFingerprint(storeId: number, businessDate: string, code: string, sourceId?: number) {
    return this.digest({ storeId, businessDate, code, sourceId: sourceId ?? null });
  }

  private settlementAmountSummary(settlement: any) {
    return Object.fromEntries(Array.from(EFFECT_FIELDS).map((field) => [field, this.toNumber(settlement?.[field])]));
  }

  private async refreshAdjustedSettlement(settlement: any) {
    const adjustments = await this.prisma.dailySettlementAdjustment.findMany({
      where: { dailySettlementId: settlement.id, status: 'applied' },
      orderBy: { createdAt: 'asc' },
    });
    const systemSummary = settlement.systemSummary ?? this.settlementAmountSummary(settlement);
    const adjustmentSummary = Object.fromEntries(Array.from(EFFECT_FIELDS).map((field) => [field, 0]));
    for (const adjustment of adjustments) {
      if (EFFECT_FIELDS.has(adjustment.effectField)) {
        adjustmentSummary[adjustment.effectField] = this.toNumber(adjustmentSummary[adjustment.effectField]) + this.toNumber(adjustment.amount);
      }
    }
    const finalSummary = Object.fromEntries(Array.from(EFFECT_FIELDS).map((field) => [
      field,
      Math.round((this.toNumber(systemSummary[field]) + this.toNumber(adjustmentSummary[field])) * 100) / 100,
    ]));
    const grossProfit = Math.round((
      this.toNumber(finalSummary.totalRevenue)
      - this.toNumber(finalSummary.materialCost)
      - this.toNumber(finalSummary.commissionTotal)
    ) * 100) / 100;
    const grossMargin = this.toNumber(finalSummary.totalRevenue) > 0
      ? Math.round((grossProfit / this.toNumber(finalSummary.totalRevenue)) * 10000) / 100
      : 0;
    const updated = await this.prisma.dailySettlement.update({
      where: { id: settlement.id },
      data: {
        systemSummary,
        adjustmentSummary,
        finalSummary,
        ...finalSummary,
        grossProfit,
        grossMargin,
        reconciliationStatus: adjustments.length > 0 ? 'blocked' : settlement.reconciliationStatus,
      },
    });
    return { settlement: updated, adjustments, systemSummary, adjustmentSummary, finalSummary };
  }

  async runDailyClose(storeId: number, dateInput: string | Date, options: RunOptions = {}) {
    const triggerType = options.triggerType ?? 'manual';
    const autoConfirm = options.autoConfirm ?? false;
    const businessDateText = this.dateText(dateInput);
    const businessDate = this.businessDate(dateInput);
    let run: any;
    let reopenedConfirmedSettlement: any;

    try {
      const existingSettlement = await this.prisma.dailySettlement.findUnique({
        where: { storeId_settleDate: { storeId, settleDate: businessDate } },
      });
      if (existingSettlement?.status === 'confirmed' && triggerType === 'late_fact') {
        reopenedConfirmedSettlement = existingSettlement;
        await this.prisma.dailySettlement.update({
          where: { id: existingSettlement.id },
          data: { status: 'draft', reconciliationStatus: 'running', confirmedAt: null, confirmedBy: null },
        });
      } else if (existingSettlement?.status === 'confirmed') {
        const completed = await this.prisma.financeReconciliationRun.findMany?.({
          where: { dailySettlementId: existingSettlement.id, status: { in: ['passed', 'warning'] } },
          orderBy: { completedAt: 'desc' },
          take: 1,
        });
        if (completed?.[0]) return completed[0];
      }

      const settlement = await this.commissionService.generateDailySettlement(storeId, businessDateText);
      const exceptionPage = await this.commissionService.getReconciliationExceptions({
        storeId,
        dateFrom: businessDateText,
        dateTo: businessDateText,
        page: 1,
        pageSize: 200,
      });
      const rawExceptions = (exceptionPage.items ?? []).filter((item: any) => !AUTO_HEALABLE_CODES.has(item.type));
      const adjusted = await this.refreshAdjustedSettlement(settlement);
      const adjustedSettlement = adjusted.settlement ?? settlement;
      const adjustmentCount = adjusted.adjustments.length;
      const profitWarning = this.hasProfitQualityWarning(settlement);
      const sourceDigest = this.digest({
        settlement: {
          totalRevenue: adjustedSettlement.totalRevenue,
          cashRevenue: adjustedSettlement.cashRevenue,
          wechatRevenue: adjustedSettlement.wechatRevenue,
          alipayRevenue: adjustedSettlement.alipayRevenue,
          refundAmount: adjustedSettlement.refundAmount,
          materialCost: adjustedSettlement.materialCost,
          commissionTotal: adjustedSettlement.commissionTotal,
          summary: settlement.summary,
        },
        exceptions: rawExceptions.map((item: any) => ({ type: item.type, amountDiff: item.amountDiff, sourceId: item.sourceId })),
        adjustmentCount,
      });
      const idempotencyKey = this.digest({ storeId, businessDateText, ruleVersion: RULE_VERSION, sourceDigest });
      const existedRun = await this.prisma.financeReconciliationRun.findUnique({ where: { idempotencyKey } });
      if (existedRun && existedRun.status !== 'running') {
        if (reopenedConfirmedSettlement) {
          const latestSnapshot = await this.prisma.dailySettlementSnapshot.findFirst({
            where: { dailySettlementId: reopenedConfirmedSettlement.id },
            orderBy: { version: 'desc' },
          });
          await this.prisma.dailySettlement.update({
            where: { id: reopenedConfirmedSettlement.id },
            data: {
              status: 'confirmed',
              confirmedBy: latestSnapshot?.confirmedBy ?? reopenedConfirmedSettlement.confirmedBy ?? null,
              confirmedAt: latestSnapshot?.confirmedAt ?? reopenedConfirmedSettlement.confirmedAt ?? null,
              confirmationMode: latestSnapshot?.confirmationMode ?? reopenedConfirmedSettlement.confirmationMode ?? 'auto',
              reconciliationStatus: existedRun.status,
              latestReconciliationRunId: existedRun.id,
            },
          });
        }
        return existedRun;
      }

      run = existedRun ?? await this.prisma.financeReconciliationRun.create({
        data: {
          storeId,
          dailySettlementId: settlement.id,
          businessDate,
          triggerType,
          status: 'running',
          ruleVersion: RULE_VERSION,
          sourceDigest,
          idempotencyKey,
          summary: {},
        },
      });

      const issues: ReconciliationIssueDraft[] = rawExceptions.map((item: any) => ({
        code: item.type,
        category: this.category(item.type),
        severity: item.severity ?? 'high',
        title: item.title ?? item.type,
        detail: item.detail ?? '',
        amount: item.amountDiff,
        sourceType: item.actionTarget,
        sourceId: item.sourceId,
        actionPath: this.actionPath(item.actionTarget),
      }));
      if (adjustmentCount > 0) {
        issues.push({
          code: 'manual_adjustment_pending',
          category: 'operating_exception',
          severity: 'medium',
          title: '日结包含人工调整',
          detail: '存在有效人工调整，系统不会自动确认，请财务管理员人工确认。',
          amount: undefined,
          sourceType: 'daily',
          sourceId: settlement.id,
          actionPath: '/finance/reconciliation?tab=daily',
        });
      }
      if (profitWarning) {
        issues.push({
          code: 'profit_data_quality_warning',
          category: 'operating_exception',
          severity: 'low',
          title: '利润数据质量提醒',
          detail: '成本、BOM 或提成数据存在质量提醒，本次不阻断日结确认。',
          amount: undefined,
          sourceType: 'daily',
          sourceId: settlement.id,
          actionPath: '/finance/profit',
        });
      }

      const fingerprints: string[] = [];
      for (const issue of issues) {
        const fingerprint = this.issueFingerprint(storeId, businessDateText, issue.code, issue.sourceId);
        fingerprints.push(fingerprint);
        await this.prisma.financeReconciliationIssue.upsert({
          where: { fingerprint },
          create: {
            runId: run.id,
            storeId,
            dailySettlementId: settlement.id,
            businessDate,
            fingerprint,
            ...issue,
            status: 'open',
          },
          update: {
            runId: run.id,
            severity: issue.severity,
            title: issue.title,
            detail: issue.detail,
            amount: issue.amount,
            actionPath: issue.actionPath,
            status: 'open',
            lastDetectedAt: new Date(),
            resolvedAt: null,
          },
        });
      }
      await this.prisma.financeReconciliationIssue.updateMany({
        where: {
          storeId,
          businessDate,
          status: { in: ['open', 'acknowledged'] },
          ...(fingerprints.length ? { fingerprint: { notIn: fingerprints } } : {}),
        },
        data: { status: 'resolved', resolvedAt: new Date(), resolutionNote: '后续对账运行未再次检测到该异常' },
      });

      const blockingIssueCount = issues.filter((issue) => BLOCKING_CODES.has(issue.code)).length;
      const warningCount = issues.length - blockingIssueCount;
      const runStatus = blockingIssueCount > 0 ? 'blocked' : warningCount > 0 ? 'warning' : 'passed';
      let autoConfirmed = false;
      if (autoConfirm && blockingIssueCount === 0 && adjustmentCount === 0) {
        await this.commissionService.confirmDailySettlement(settlement.id, undefined, storeId, {
          confirmationMode: 'auto',
          reconciliationRunId: run.id,
          ruleVersion: RULE_VERSION,
          sourceDigest,
        });
        autoConfirmed = true;
      }
      const summary = { autoConfirmed, blockingIssueCount, warningCount, issueCount: issues.length };
      await this.prisma.dailySettlement.update({
        where: { id: settlement.id },
        data: {
          reconciliationStatus: runStatus,
          latestReconciliationRunId: run.id,
          confirmationMode: autoConfirmed ? 'auto' : settlement.confirmationMode,
        },
      });
      const completed = await this.prisma.financeReconciliationRun.update({
        where: { id: run.id },
        data: { status: runStatus, summary, completedAt: new Date() },
      });
      return { ...completed, ...summary, status: runStatus };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      let failedRun = run;
      if (run?.id) {
        failedRun = await this.prisma.financeReconciliationRun.update({
          where: { id: run.id },
          data: { status: 'failed', errorMessage: message, completedAt: new Date(), summary: { autoConfirmed: false } },
        });
      } else {
        const sourceDigest = this.digest({ error: message });
        const idempotencyKey = this.digest({ storeId, businessDateText, ruleVersion: RULE_VERSION, sourceDigest, status: 'failed' });
        failedRun = await this.prisma.financeReconciliationRun.upsert({
          where: { idempotencyKey },
          create: {
            storeId,
            businessDate,
            triggerType,
            status: 'failed',
            ruleVersion: RULE_VERSION,
            sourceDigest,
            idempotencyKey,
            summary: { autoConfirmed: false },
            errorMessage: message,
            completedAt: new Date(),
          },
          update: { status: 'failed', errorMessage: message, completedAt: new Date() },
        });
      }
      if (failedRun?.id) {
        const fingerprint = this.issueFingerprint(storeId, businessDateText, 'auto_task_failure');
        await this.prisma.financeReconciliationIssue.upsert({
          where: { fingerprint },
          create: {
            runId: failedRun.id,
            storeId,
            businessDate,
            fingerprint,
            code: 'auto_task_failure',
            category: 'automation_failure',
            severity: 'high',
            status: 'open',
            title: '自动对账任务执行失败',
            detail: message,
            actionPath: '/finance/reconciliation?tab=exceptions',
          },
          update: {
            runId: failedRun.id,
            status: 'open',
            detail: message,
            lastDetectedAt: new Date(),
            resolvedAt: null,
          },
        });
      }
      return { id: failedRun?.id, status: 'failed', autoConfirmed: false, errorMessage: message };
    }
  }

  private assertStoreAccess(storeId: number, context: FinanceRequestContext) {
    if (context.permissions?.includes('*') || context.roles?.includes('super_admin')) return;
    if (!context.storeIds?.includes(storeId)) throw new ForbiddenException('无权访问该门店财务数据');
  }

  async getRuns(query: any, context: FinanceRequestContext) {
    const storeId = this.toNumber(query.storeId);
    this.assertStoreAccess(storeId, context);
    const page = Math.max(1, this.toNumber(query.page) || 1);
    const pageSize = Math.max(1, this.toNumber(query.pageSize) || 20);
    const where: any = { storeId };
    if (query.status) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
      where.businessDate = {};
      if (query.dateFrom) where.businessDate.gte = this.businessDate(query.dateFrom);
      if (query.dateTo) where.businessDate.lte = this.businessDate(query.dateTo);
    }
    const [items, total] = await Promise.all([
      this.prisma.financeReconciliationRun.findMany({ where, orderBy: { startedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.financeReconciliationRun.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  async getIssues(query: any, context: FinanceRequestContext) {
    const storeId = this.toNumber(query.storeId);
    this.assertStoreAccess(storeId, context);
    const page = Math.max(1, this.toNumber(query.page) || 1);
    const pageSize = Math.max(1, this.toNumber(query.pageSize) || 50);
    const where: any = { storeId };
    if (query.status) where.status = query.status === 'unresolved' ? { in: ['open', 'acknowledged'] } : query.status;
    if (query.category) where.category = query.category;
    if (query.severity) where.severity = query.severity;
    if (query.dateFrom || query.dateTo) {
      where.businessDate = {};
      if (query.dateFrom) where.businessDate.gte = this.businessDate(query.dateFrom);
      if (query.dateTo) where.businessDate.lte = this.businessDate(query.dateTo);
    }
    const [items, total] = await Promise.all([
      this.prisma.financeReconciliationIssue.findMany({ where, orderBy: [{ severity: 'asc' }, { lastDetectedAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.financeReconciliationIssue.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  async getCompatibilityExceptions(query: any, context: FinanceRequestContext) {
    const result = await this.getIssues(query, context);
    const items = result.items.map((issue: any) => ({
      id: issue.id,
      date: this.dateText(issue.businessDate),
      type: issue.code,
      severity: issue.severity,
      title: issue.title,
      detail: issue.detail,
      amountDiff: issue.amount === null || issue.amount === undefined ? undefined : this.toNumber(issue.amount),
      actionTarget: issue.sourceType,
      sourceId: issue.sourceId,
      status: issue.status,
      category: issue.category,
      actionPath: issue.actionPath,
    }));
    return {
      ...result,
      items,
      data: items,
      summary: {
        high: items.filter((item: any) => item.severity === 'high').length,
        medium: items.filter((item: any) => item.severity === 'medium').length,
        low: items.filter((item: any) => item.severity === 'low').length,
      },
    };
  }

  async acknowledgeIssue(id: number, context: FinanceRequestContext) {
    const issue = await this.prisma.financeReconciliationIssue.findUnique({ where: { id } });
    if (!issue) throw new NotFoundException('对账异常不存在');
    this.assertStoreAccess(issue.storeId, context);
    return this.prisma.financeReconciliationIssue.update({
      where: { id },
      data: { status: 'acknowledged', acknowledgedBy: context.userId, acknowledgedAt: new Date() },
    });
  }

  async createAdjustment(id: number, input: DailySettlementAdjustmentInput, context: FinanceRequestContext) {
    const settlement = await this.prisma.dailySettlement.findUnique({ where: { id } });
    if (!settlement) throw new NotFoundException('日结单不存在');
    this.assertStoreAccess(settlement.storeId, context);
    if (settlement.status !== 'draft') throw new BadRequestException('仅草稿日结允许新增调整');
    const reason = String(input.reason ?? '').trim();
    if (reason.length < 5 || reason.length > 500) throw new BadRequestException('调整原因需为 5-500 字');
    if (!EFFECT_FIELDS.has(input.effectField)) throw new BadRequestException('不支持的日结调整字段');
    const amount = this.toNumber(input.amount);
    if (!Number.isFinite(amount) || amount === 0) throw new BadRequestException('调整金额必须为非零有效金额');
    const adjustment = await this.prisma.dailySettlementAdjustment.create({
      data: {
        dailySettlementId: id,
        storeId: settlement.storeId,
        adjustmentType: input.adjustmentType,
        effectField: input.effectField,
        amount,
        reason,
        voucherNo: input.voucherNo?.trim() || null,
        createdBy: context.userId,
        status: 'applied',
      },
    });
    const refreshed = await this.refreshAdjustedSettlement(settlement);
    let reconciliationRunId = settlement.latestReconciliationRunId;
    if (!reconciliationRunId) {
      const businessDateText = this.dateText(settlement.settleDate);
      const sourceDigest = this.digest({ adjustmentId: adjustment.id, effectField: input.effectField, amount });
      const idempotencyKey = this.digest({ storeId: settlement.storeId, businessDateText, ruleVersion: RULE_VERSION, sourceDigest });
      const adjustmentRun = await this.prisma.financeReconciliationRun.create({
        data: {
          storeId: settlement.storeId,
          dailySettlementId: settlement.id,
          businessDate: this.businessDate(settlement.settleDate),
          triggerType: 'manual',
          status: 'blocked',
          ruleVersion: RULE_VERSION,
          sourceDigest,
          idempotencyKey,
          summary: { autoConfirmed: false, blockingIssueCount: 1, warningCount: 0, issueCount: 1 },
          completedAt: new Date(),
        },
      });
      reconciliationRunId = adjustmentRun.id;
      await this.prisma.dailySettlement.update({
        where: { id: settlement.id },
        data: { latestReconciliationRunId: reconciliationRunId },
      });
    }
    if (reconciliationRunId) {
      const businessDateText = this.dateText(settlement.settleDate);
      const fingerprint = this.issueFingerprint(settlement.storeId, businessDateText, 'manual_adjustment_pending', settlement.id);
      await this.prisma.financeReconciliationIssue.upsert({
        where: { fingerprint },
        create: {
          runId: reconciliationRunId,
          storeId: settlement.storeId,
          dailySettlementId: settlement.id,
          businessDate: this.businessDate(settlement.settleDate),
          fingerprint,
          code: 'manual_adjustment_pending',
          category: 'operating_exception',
          severity: 'medium',
          status: 'open',
          title: '日结包含人工调整',
          detail: '存在有效人工调整，请财务管理员人工确认。',
          sourceType: 'daily',
          sourceId: settlement.id,
          actionPath: '/finance/reconciliation?tab=daily',
        },
        update: { status: 'open', lastDetectedAt: new Date(), resolvedAt: null },
      });
    }
    await this.prisma.financeAuditLog?.create?.({
      data: {
        storeId: settlement.storeId,
        userId: context.userId,
        action: 'daily_settlement_adjustment_create',
        entityType: 'DailySettlementAdjustment',
        entityId: adjustment.id,
        reason,
        afterPayload: { dailySettlementId: id, effectField: input.effectField, amount },
      },
    });
    return { adjustment, settlement: refreshed.settlement };
  }

  async getAdjustments(id: number, context: FinanceRequestContext) {
    const settlement = await this.prisma.dailySettlement.findUnique({ where: { id }, select: { id: true, storeId: true } });
    if (!settlement) throw new NotFoundException('日结单不存在');
    this.assertStoreAccess(settlement.storeId, context);
    const items = await this.prisma.dailySettlementAdjustment.findMany({
      where: { dailySettlementId: id },
      orderBy: { createdAt: 'desc' },
    });
    return { items, data: items, total: items.length };
  }

  async cancelAdjustment(id: number, adjustmentId: number, reasonInput: string, context: FinanceRequestContext) {
    const adjustment = await this.prisma.dailySettlementAdjustment.findUnique({
      where: { id: adjustmentId },
      include: { dailySettlement: true },
    });
    if (!adjustment || adjustment.dailySettlementId !== id) throw new NotFoundException('日结调整不存在');
    this.assertStoreAccess(adjustment.storeId, context);
    if (adjustment.dailySettlement.status !== 'draft') throw new BadRequestException('仅草稿日结允许取消调整');
    if (adjustment.status !== 'applied') throw new BadRequestException('该调整已取消');
    const reason = String(reasonInput ?? '').trim();
    if (reason.length < 5 || reason.length > 500) throw new BadRequestException('取消原因需为 5-500 字');
    const cancelled = await this.prisma.dailySettlementAdjustment.update({
      where: { id: adjustmentId },
      data: { status: 'cancelled', cancelledBy: context.userId, cancelledAt: new Date(), cancelReason: reason },
    });
    const refreshed = await this.refreshAdjustedSettlement(adjustment.dailySettlement);
    if (refreshed.adjustments.length === 0) {
      await this.prisma.financeReconciliationIssue.updateMany({
        where: { dailySettlementId: id, code: 'manual_adjustment_pending', status: { in: ['open', 'acknowledged'] } },
        data: { status: 'resolved', resolvedAt: new Date(), resolutionNote: '所有人工调整均已取消' },
      });
      await this.prisma.dailySettlement.update({
        where: { id },
        data: { reconciliationStatus: 'pending' },
      });
    }
    await this.prisma.financeAuditLog?.create?.({
      data: {
        storeId: adjustment.storeId,
        userId: context.userId,
        action: 'daily_settlement_adjustment_cancel',
        entityType: 'DailySettlementAdjustment',
        entityId: adjustmentId,
        reason,
        beforePayload: { status: 'applied' },
        afterPayload: { status: 'cancelled' },
      },
    });
    return { adjustment: cancelled, settlement: refreshed.settlement };
  }

  async confirmDailySettlementManually(id: number, context: FinanceRequestContext, expectedStoreId?: number) {
    const settlement = await this.prisma.dailySettlement.findUnique({ where: { id } });
    if (!settlement) throw new NotFoundException('日结单不存在');
    this.assertStoreAccess(settlement.storeId, context);
    if (expectedStoreId && this.toNumber(settlement.storeId) !== expectedStoreId) throw new ForbiddenException('无权确认其他门店日结');
    if (settlement.status !== 'draft') throw new BadRequestException('仅草稿日结允许确认');
    const openIssues = await this.prisma.financeReconciliationIssue.findMany({
      where: { dailySettlementId: id, status: { in: ['open', 'acknowledged'] } },
    });
    const integrityIssues = openIssues.filter((issue: any) => INTEGRITY_CODES.has(issue.code));
    if (integrityIssues.length) throw new BadRequestException('存在未解决的数据完整性故障，必须先修复来源数据');
    const otherBlockingIssues = openIssues.filter((issue: any) => BLOCKING_CODES.has(issue.code) && issue.code !== 'manual_adjustment_pending');
    if (otherBlockingIssues.length) throw new BadRequestException('存在未解决的阻断异常，不能确认日结');
    const result = await this.commissionService.confirmDailySettlement(id, context.userId, settlement.storeId, { confirmationMode: 'manual' });
    await this.prisma.financeReconciliationIssue.updateMany({
      where: { dailySettlementId: id, code: 'manual_adjustment_pending', status: { in: ['open', 'acknowledged'] } },
      data: { status: 'resolved', resolvedAt: new Date(), resolutionNote: '包含人工调整的日结已由财务管理员人工确认' },
    });
    const finalReconciliationStatus = openIssues.some((issue: any) => issue.code !== 'manual_adjustment_pending') ? 'warning' : 'passed';
    await this.prisma.dailySettlement.update({
      where: { id },
      data: { reconciliationStatus: finalReconciliationStatus, confirmationMode: 'manual' },
    });
    return result;
  }
}
