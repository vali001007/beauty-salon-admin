import { Injectable, Optional } from '@nestjs/common';
import { BrainRiskLevel, Prisma } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BrainSkillRuntimeService } from '../skills/brain-skill-runtime.service.js';
import { BrainInspectionPlanBridgeService } from './brain-inspection-plan-bridge.service.js';

interface InspectionFindingCandidate {
  dedupeKey: string;
  objectType: string;
  objectId: string;
  severity: BrainRiskLevel;
  title: string;
  evidence: Record<string, unknown>;
  suggestion: Record<string, unknown>;
}

interface InspectionRuleRecord {
  ruleKey: string;
  name: string;
  domain: string;
  condition: Prisma.JsonValue;
  suggestionTpl: Prisma.JsonValue;
  riskLevel: BrainRiskLevel;
  version: number;
}

@Injectable()
export class BrainInspectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skillRuntime: BrainSkillRuntimeService,
    @Optional() private readonly planBridge?: BrainInspectionPlanBridgeService,
  ) {}

  listRules() {
    return this.prisma.brainInspectionRule.findMany({
      where: { enabled: true },
      orderBy: [{ domain: 'asc' }, { ruleKey: 'asc' }, { version: 'desc' }],
    });
  }

  async runInspection(input: {
    storeId: number;
    triggerType: 'manual' | 'schedule' | 'event';
    now?: Date;
    ruleKeys?: string[];
    includeDisabledRules?: boolean;
    planFindings?: boolean;
  }) {
    const now = input.now ?? new Date();
    const allRules = input.ruleKeys?.length
      ? await this.prisma.brainInspectionRule.findMany({
          where: {
            ruleKey: { in: [...new Set(input.ruleKeys)] },
            ...(input.includeDisabledRules ? {} : { enabled: true }),
          },
          orderBy: [{ domain: 'asc' }, { ruleKey: 'asc' }, { version: 'desc' }],
        })
      : await this.listRules();
    const rules = this.latestRules(allRules);
    const run = await this.prisma.brainInspectionRun.create({
      data: { storeId: input.storeId, triggerType: input.triggerType, status: 'running', ruleCount: rules.length },
    });
    let findingCount = 0;
    try {
      for (const rule of rules) {
        const candidates = await this.evaluateRule(rule, input.storeId, now);
        findingCount += candidates.length;
        const activeKeys: string[] = [];
        for (const candidate of candidates) {
          activeKeys.push(candidate.dedupeKey);
          const planning = input.planFindings === false
            ? undefined
            : await this.planFinding({
                storeId: input.storeId,
                rule,
                candidate,
              });
          const suggestion = {
            ...candidate.suggestion,
            ...(planning ? { planning } : {}),
          };
          await this.prisma.brainInspectionFinding.upsert({
            where: { storeId_dedupeKey: { storeId: input.storeId, dedupeKey: candidate.dedupeKey } },
            create: {
              runId: run.id,
              storeId: input.storeId,
              ruleKey: rule.ruleKey,
              ruleVersion: rule.version,
              domain: rule.domain,
              ...candidate,
              evidence: this.toJson(candidate.evidence),
              suggestion: this.toJson(suggestion),
              status: 'open',
              firstDetectedAt: now,
              lastDetectedAt: now,
            },
            update: {
              runId: run.id,
              ruleVersion: rule.version,
              domain: rule.domain,
              objectType: candidate.objectType,
              objectId: candidate.objectId,
              severity: candidate.severity,
              title: candidate.title,
              evidence: this.toJson(candidate.evidence),
              suggestion: this.toJson(suggestion),
              status: 'open',
              lastDetectedAt: now,
              resolvedAt: null,
            },
          });
        }
        await this.prisma.brainInspectionFinding.updateMany({
          where: {
            storeId: input.storeId,
            ruleKey: rule.ruleKey,
            status: 'open',
            ...(activeKeys.length ? { dedupeKey: { notIn: activeKeys } } : {}),
          },
          data: { status: 'resolved', resolvedAt: now, lastDetectedAt: now },
        });
      }
      await this.prisma.brainInspectionRun.update({
        where: { id: run.id },
        data: { status: 'completed', ruleCount: rules.length, findingCount, finishedAt: new Date() },
      });
      return { runId: run.id, storeId: input.storeId, ruleCount: rules.length, findingCount, status: 'completed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'inspection_failed';
      await this.prisma.brainInspectionRun.update({
        where: { id: run.id },
        data: { status: 'failed', findingCount, finishedAt: new Date(), error: { message } },
      });
      throw error;
    }
  }

  listFindings(input: { storeId: number; status?: string }) {
    return this.prisma.brainInspectionFinding.findMany({
      where: { storeId: input.storeId, ...(input.status ? { status: input.status } : {}) },
      orderBy: [{ status: 'asc' }, { severity: 'desc' }, { lastDetectedAt: 'desc' }],
      take: 100,
    });
  }

  updateFinding(input: { storeId: number; findingId: number; disposition: 'adopted' | 'ignored' | 'false_positive'; note?: string }) {
    return this.prisma.brainInspectionFinding.update({
      where: { id: input.findingId, storeId: input.storeId },
      data: {
        disposition: input.disposition,
        dispositionNote: input.note,
        feedback: input.disposition === 'false_positive' ? 'false_positive' : undefined,
        status: input.disposition === 'adopted' ? 'in_progress' : 'closed',
        resolvedAt: input.disposition === 'adopted' ? undefined : new Date(),
      },
    });
  }

  @Cron('0 8 * * *')
  async runMorningInspection() {
    const stores = await this.prisma.store.findMany({ where: { status: 'active', deletedAt: null }, select: { id: true } });
    const results = [];
    for (const store of stores) results.push(await this.runInspection({ storeId: store.id, triggerType: 'schedule' }));
    return { storeCount: stores.length, results };
  }

  private latestRules<T extends InspectionRuleRecord>(rules: T[]) {
    const latest = new Map<string, T>();
    for (const rule of rules) {
      const current = latest.get(rule.ruleKey);
      if (!current || rule.version > current.version) latest.set(rule.ruleKey, rule);
    }
    return [...latest.values()];
  }

  private async evaluateRule(rule: InspectionRuleRecord, storeId: number, now: Date): Promise<InspectionFindingCandidate[]> {
    switch (rule.ruleKey) {
      case 'customer_churn_risk':
      case 'high_value_customer_not_visited':
        return this.evaluateDormantHighValue(rule, storeId, now);
      case 'fulfillment_no_show':
      case 'appointment_no_show_anomaly':
        return this.evaluateNoShow(rule, storeId, now);
      case 'finance_margin_drop':
      case 'gross_margin_drop':
        return this.evaluateMargin(rule, storeId, now);
      case 'inventory_expiry':
      case 'stockout_sku':
        return this.evaluateInventory(rule, storeId, now);
      case 'marketing_low_roi':
      case 'low_marketing_roi':
        return this.evaluateMarketing(rule, storeId, now);
      case 'staff_productivity_drop':
      case 'beautician_capacity_gap':
        return this.evaluateStaffCapacity(rule, storeId, now);
      case 'reception_in_store_state_stale':
        return this.evaluateStaleInStoreState(rule, storeId, now);
      case 'service_task_state_inconsistent':
        return this.evaluateServiceTaskState(rule, storeId, now);
      case 'inventory_safety_stock_invalid':
        return this.evaluateInventorySafetyStock(rule, storeId);
      case 'procurement_evidence_missing':
        return this.evaluateProcurementEvidence(rule, storeId);
      default:
        return [];
    }
  }

  private async evaluateDormantHighValue(rule: InspectionRuleRecord, storeId: number, now: Date) {
    const condition = this.record(rule.condition);
    const inactiveDays = this.number(condition.inactiveDays, 60);
    const minTotalSpent = this.number(condition.minTotalSpent, 5000);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - inactiveDays);
    const customers = await this.prisma.customer.findMany({
      where: {
        storeId,
        deletedAt: null,
        totalSpent: { gte: minTotalSpent },
        OR: [{ lastVisitDate: { lt: cutoff } }, { lastVisitDate: null }],
      },
      select: { id: true, name: true, totalSpent: true, lastVisitDate: true },
      orderBy: { totalSpent: 'desc' },
      take: 50,
    });
    return customers.map((customer) => ({
      dedupeKey: `${rule.ruleKey}:customer:${customer.id}`,
      objectType: 'customer',
      objectId: String(customer.id),
      severity: rule.riskLevel,
      title: `高价值客户 ${customer.name} 已超过 ${inactiveDays} 天未到店`,
      evidence: {
        customerName: customer.name,
        totalSpent: this.number(customer.totalSpent, 0),
        lastVisitDate: customer.lastVisitDate?.toISOString() ?? null,
        cutoff: cutoff.toISOString(),
      },
      suggestion: this.suggestion(rule, { action: '创建一对一召回跟进任务', entry: '/customer-marketing/workbench' }),
    }));
  }

  private async evaluateNoShow(rule: InspectionRuleRecord, storeId: number, now: Date) {
    const startDate = this.daysAgo(now, 30);
    const snapshot = await this.skillRuntime.buildReceptionOperationsSnapshot({ storeId, startDate, endDate: now });
    const threshold = this.number(this.record(rule.condition).rateThreshold, 0.15);
    if (snapshot.total < 5 || snapshot.noShowRate < threshold) return [];
    return [{
      dedupeKey: `${rule.ruleKey}:store:${storeId}`,
      objectType: 'store',
      objectId: String(storeId),
      severity: rule.riskLevel,
      title: `近 30 天预约爽约率 ${(snapshot.noShowRate * 100).toFixed(1)}%`,
      evidence: { totalReservations: snapshot.total, noShowCount: snapshot.noShow, noShowRate: snapshot.noShowRate, threshold },
      suggestion: this.suggestion(rule, { action: '对未到店预约建立提前确认任务', entry: '/stores/reservations' }),
    }];
  }

  private async evaluateMargin(rule: InspectionRuleRecord, storeId: number, now: Date) {
    const currentStart = this.daysAgo(now, 30);
    const previousStart = this.daysAgo(now, 60);
    const [current, previous] = await Promise.all([
      this.skillRuntime.buildFinanceCostAnalysis({ storeId, startDate: currentStart, endDate: now }),
      this.skillRuntime.buildFinanceCostAnalysis({ storeId, startDate: previousStart, endDate: currentStart }),
    ]);
    if (current.grossMarginRate == null || previous.grossMarginRate == null) return [];
    const dropThreshold = this.number(this.record(rule.condition).dropThreshold, 0.08);
    const drop = previous.grossMarginRate - current.grossMarginRate;
    if (drop < dropThreshold) return [];
    return [{
      dedupeKey: `${rule.ruleKey}:store:${storeId}`,
      objectType: 'store',
      objectId: String(storeId),
      severity: rule.riskLevel,
      title: `近 30 天毛利率下降 ${(drop * 100).toFixed(1)} 个百分点`,
      evidence: { currentGrossMarginRate: current.grossMarginRate, previousGrossMarginRate: previous.grossMarginRate, drop, dropThreshold },
      suggestion: this.suggestion(rule, { action: '复核折扣、耗材成本和项目结构', entry: '/finance' }),
    }];
  }

  private async evaluateInventory(rule: InspectionRuleRecord, storeId: number, now: Date) {
    const expiringBefore = new Date(now);
    expiringBefore.setDate(expiringBefore.getDate() + this.number(this.record(rule.condition).expiryDays, 30));
    const summary = await this.skillRuntime.buildInventoryRiskSummary({ storeId, expiringBefore });
    const candidates: InspectionFindingCandidate[] = summary.lowStockProducts.slice(0, 50).map((product) => ({
      dedupeKey: `${rule.ruleKey}:product:${product.productId}`,
      objectType: 'product',
      objectId: String(product.productId),
      severity: rule.riskLevel,
      title: `${product.name} 低于安全库存`,
      evidence: { currentStock: product.currentStock, safetyStock: product.safetyStock },
      suggestion: this.suggestion(rule, { action: '复核库存占用并生成采购单预览', entry: '/inventory' }),
    }));
    if (summary.expiringProducts.length) {
      candidates.push({
        dedupeKey: `${rule.ruleKey}:expiring:store:${storeId}`,
        objectType: 'store',
        objectId: String(storeId),
        severity: rule.riskLevel,
        title: `${summary.expiringProducts.length} 个库存批次进入临期窗口`,
        evidence: { expiringStockValue: summary.expiringStockValue, products: summary.expiringProducts.slice(0, 20) },
        suggestion: this.suggestion(rule, { action: '下架复核批次并制定合规消耗方案', entry: '/inventory' }),
      });
    }
    return candidates;
  }

  private async evaluateMarketing(rule: InspectionRuleRecord, storeId: number, now: Date) {
    const startDate = this.daysAgo(now, 30);
    const analytics = await this.skillRuntime.buildMarketingAnalytics({ storeId, startDate, endDate: now });
    const threshold = this.number(this.record(rule.condition).conversionRateThreshold, 0.05);
    if (analytics.reachedCount < 20 || analytics.conversionRate >= threshold) return [];
    return [{
      dedupeKey: `${rule.ruleKey}:store:${storeId}`,
      objectType: 'store',
      objectId: String(storeId),
      severity: rule.riskLevel,
      title: `营销触达转化率仅 ${(analytics.conversionRate * 100).toFixed(1)}%，ROI 成本口径尚未建立`,
      evidence: {
        reachedCount: analytics.reachedCount,
        convertedCount: analytics.convertedCount,
        conversionRate: analytics.conversionRate,
        attributedRevenue: analytics.attributedRevenue,
        roiStatus: 'cost_not_modelled',
      },
      suggestion: this.suggestion(rule, { action: '先复核客群和渠道；补录活动成本后再计算 ROI', entry: '/customer-marketing' }),
    }];
  }

  private async evaluateStaffCapacity(rule: InspectionRuleRecord, storeId: number, now: Date) {
    const startDate = this.daysAgo(now, 7);
    const analysis = await this.skillRuntime.buildManagerStaffAnalysis({ storeId, startDate, endDate: now });
    const maxServiceCount = this.number(this.record(rule.condition).maxServiceCount, 2);
    return analysis.staff
      .filter((staff) => staff.serviceCount <= maxServiceCount && staff.timeOffHours < 20)
      .map((staff) => ({
        dedupeKey: `${rule.ruleKey}:beautician:${staff.beauticianId}`,
        objectType: 'beautician',
        objectId: String(staff.beauticianId),
        severity: rule.riskLevel,
        title: `${staff.name} 近 7 天服务量偏低`,
        evidence: { serviceCount: staff.serviceCount, completedCount: staff.completedCount, timeOffHours: staff.timeOffHours, threshold: maxServiceCount },
        suggestion: this.suggestion(rule, { action: '复核排班、空档和客户分配', entry: '/scheduling' }),
      }));
  }

  private async evaluateStaleInStoreState(rule: InspectionRuleRecord, storeId: number, now: Date) {
    const staleHours = this.number(this.record(rule.condition).staleHours, 12);
    const cutoff = new Date(now.getTime() - staleHours * 60 * 60_000);
    const reservations = await this.prisma.reservation.findMany({
      where: {
        storeId,
        checkedInAt: { not: null, lt: cutoff },
        status: { in: ['checked_in', 'in_service', 'arrived', '已到店', '服务中'] },
      },
      include: {
        customer: { select: { name: true } },
        project: { select: { name: true } },
      },
      orderBy: { checkedInAt: 'asc' },
      take: 50,
    });
    return reservations.map((reservation) => ({
      dedupeKey: `${rule.ruleKey}:reservation:${reservation.id}`,
      objectType: 'reservation',
      objectId: String(reservation.id),
      severity: rule.riskLevel,
      title: `${reservation.customer.name} 的到店状态已持续超过 ${staleHours} 小时`,
      evidence: {
        reservationId: reservation.id,
        customerName: reservation.customer.name,
        projectName: reservation.project.name,
        status: reservation.status,
        checkedInAt: reservation.checkedInAt?.toISOString() ?? null,
        staleHours,
      },
      suggestion: this.suggestion(rule, { action: '核对客户是否仍在店，并修正预约履约状态', entry: '/stores/reservations' }),
    }));
  }

  private async evaluateServiceTaskState(rule: InspectionRuleRecord, storeId: number, now: Date) {
    const staleHours = this.number(this.record(rule.condition).staleHours, 12);
    const historyDays = this.number(this.record(rule.condition).historyDays, 90);
    const cutoff = new Date(now.getTime() - staleHours * 60 * 60_000);
    const historyStart = this.daysAgo(now, historyDays);
    const tasks = await this.prisma.serviceTask.findMany({
      where: {
        storeId,
        appointmentTime: { gte: historyStart, lte: now },
        status: { in: ['pending', 'in_progress', 'completed'] },
      },
      include: {
        customer: { select: { name: true } },
        project: { select: { name: true } },
      },
      orderBy: { appointmentTime: 'desc' },
      take: 500,
    });
    return tasks.flatMap((task) => {
      const reasons: string[] = [];
      if (task.status === 'in_progress' && !task.startedAt) reasons.push('进行中但缺少开始时间');
      if (task.status === 'in_progress' && task.startedAt && task.startedAt < cutoff) reasons.push(`进行中超过 ${staleHours} 小时`);
      if (task.status === 'pending' && task.startedAt) reasons.push('待开始状态已有开始时间');
      if (task.status === 'completed' && !task.completedAt) reasons.push('已完成但缺少完成时间');
      if (task.completedAt && !task.startedAt) reasons.push('存在完成时间但缺少开始时间');
      if (task.startedAt && task.completedAt && task.completedAt < task.startedAt) reasons.push('完成时间早于开始时间');
      if (!reasons.length) return [];
      return [{
        dedupeKey: `${rule.ruleKey}:service_task:${task.id}`,
        objectType: 'service_task',
        objectId: String(task.id),
        severity: rule.riskLevel,
        title: `${task.customer.name} 的服务任务状态不一致`,
        evidence: {
          taskId: task.id,
          taskNo: task.taskNo,
          customerName: task.customer.name,
          projectName: task.project.name,
          status: task.status,
          startedAt: task.startedAt?.toISOString() ?? null,
          completedAt: task.completedAt?.toISOString() ?? null,
          reasons,
        },
        suggestion: this.suggestion(rule, { action: '核对服务任务实际进度并修正状态与时间记录', entry: '/stores/reservations' }),
      }];
    });
  }

  private async evaluateInventorySafetyStock(rule: InspectionRuleRecord, storeId: number) {
    const products = await this.prisma.product.findMany({
      where: {
        storeId,
        deletedAt: null,
        status: 'active',
        OR: [{ safetyStock: { lte: 0 } }, { currentStock: { lt: 0 } }, { minPurchaseQty: { lt: 0 } }],
      },
      select: { id: true, sku: true, name: true, currentStock: true, safetyStock: true, minPurchaseQty: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return products.map((product) => {
      const currentStock = this.number(product.currentStock, 0);
      const safetyStock = this.number(product.safetyStock, 0);
      const reasons = [
        ...(safetyStock <= 0 ? ['未配置有效安全库存'] : []),
        ...(currentStock < 0 ? ['当前库存为负数'] : []),
        ...(product.minPurchaseQty < 0 ? ['最小采购量为负数'] : []),
      ];
      return {
        dedupeKey: `${rule.ruleKey}:product:${product.id}`,
        objectType: 'product',
        objectId: String(product.id),
        severity: rule.riskLevel,
        title: `${product.name} 的库存基础参数不完整`,
        evidence: { productId: product.id, sku: product.sku, currentStock, safetyStock, minPurchaseQty: product.minPurchaseQty, reasons },
        suggestion: this.suggestion(rule, { action: '补齐安全库存并复核当前库存与最小采购量', entry: '/inventory/products' }),
      };
    });
  }

  private async evaluateProcurementEvidence(rule: InspectionRuleRecord, storeId: number) {
    const analysis = await this.skillRuntime.buildInventoryProcurementAnalysis({ storeId });
    return analysis.suggestions
      .filter((item) => item.suggestedQty > 0 && (!item.supplierName || item.unitPrice == null))
      .slice(0, 50)
      .map((item) => ({
        dedupeKey: `${rule.ruleKey}:product:${item.productId}`,
        objectType: 'product',
        objectId: String(item.productId),
        severity: rule.riskLevel,
        title: `${item.productName} 需要补货但缺少供应商或报价证据`,
        evidence: {
          productId: item.productId,
          sku: item.sku,
          currentStock: item.currentStock,
          safetyStock: item.safetyStock,
          suggestedQty: item.suggestedQty,
          supplierName: item.supplierName ?? null,
          unitPrice: item.unitPrice ?? null,
        },
        suggestion: this.suggestion(rule, { action: '维护商品供应映射和有效报价后再生成采购单预览', entry: '/inventory/purchase' }),
      }));
  }

  private suggestion(rule: InspectionRuleRecord, fallback: Record<string, unknown>) {
    const configured = this.record(rule.suggestionTpl);
    return { ...fallback, ...configured };
  }

  private async planFinding(input: {
    storeId: number;
    rule: InspectionRuleRecord;
    candidate: InspectionFindingCandidate;
  }) {
    if (!this.planBridge) return undefined;
    try {
      return await this.planBridge.planFinding({
        storeId: input.storeId,
        finding: {
          ...input.candidate,
          ruleKey: input.rule.ruleKey,
          domain: input.rule.domain,
        },
      });
    } catch (error) {
      return {
        status: 'unavailable' as const,
        reason: error instanceof Error ? error.message : 'inspection_planning_failed',
        actionPreviews: [],
      };
    }
  }

  private record(value: Prisma.JsonValue): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private number(value: unknown, fallback: number) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  private daysAgo(now: Date, days: number) {
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    return date;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
