import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type AutomationQuery = {
  storeId: number;
  personaCode?: string;
  status?: string;
  page?: number | string;
  pageSize?: number | string;
};

type CreateAutomationDraftInput = {
  storeId: number;
  userId?: number;
  personaCode?: string;
  goal?: string;
  name?: string;
  description?: string;
  triggerType?: string;
  triggerConfig?: unknown;
  actionPlan?: unknown;
  approvalPolicy?: unknown;
  schedule?: unknown;
  riskLevel?: string;
  sourceRunId?: number;
};

type RunAutomationInput = {
  storeId: number;
  userId?: number;
  definitionId: number;
  mode?: string;
  dryRun?: boolean;
  input?: unknown;
};

type RunDueAutomationsInput = {
  storeId: number;
  userId?: number;
  now?: string | Date;
  limit?: number | string;
  dryRun?: boolean;
};

type EvaluateAutomationEventInput = {
  storeId: number;
  userId?: number;
  eventType: string;
  payload?: unknown;
  limit?: number | string;
  dryRun?: boolean;
};

type DecideAutomationApprovalInput = {
  storeId: number;
  userId?: number;
  runId: number;
  decision: 'approve' | 'reject';
  comment?: string;
};

type RecoverAutomationInput = {
  storeId: number;
  userId?: number;
  definitionId: number;
  maxFailures?: number | string;
};

type RecordAutomationAttributionInput = {
  storeId: number;
  userId?: number;
  definitionId?: number;
  runId?: number;
  effectType?: string;
  objectType?: string;
  objectId?: number;
  customerId?: number;
  metricKey?: string;
  impact?: unknown;
};

const BUILT_IN_TRIGGERS = [
  { code: 'dormant_customer', name: '沉睡客户', domain: 'marketing', riskLevel: 'medium' },
  { code: 'high_value_customer_arrival', name: '高价值客户到店', domain: 'customer', riskLevel: 'low' },
  { code: 'course_consumption_due', name: '疗程消耗', domain: 'service', riskLevel: 'medium' },
  { code: 'inventory_stockout', name: '库存缺货', domain: 'inventory', riskLevel: 'medium' },
  { code: 'inventory_expiring', name: '临期库存', domain: 'inventory', riskLevel: 'medium' },
  { code: 'campaign_low_conversion', name: '活动低转化', domain: 'marketing', riskLevel: 'low' },
  { code: 'staff_exception', name: '员工异常', domain: 'staff', riskLevel: 'medium' },
  { code: 'reservation_exception', name: '预约异常', domain: 'reservation', riskLevel: 'medium' },
  { code: 'finance_exception', name: '财务异常', domain: 'finance', riskLevel: 'high' },
  { code: 'complaint_bad_review', name: '投诉差评', domain: 'service', riskLevel: 'high' },
] as const;

@Injectable()
export class AgentAutomationService {
  constructor(private readonly prisma: PrismaService) {}

  listTriggerTemplates() {
    return BUILT_IN_TRIGGERS.map((trigger) => ({
      ...trigger,
      defaultConfig: this.defaultTriggerConfig(trigger.code),
      defaultActionPlan: this.defaultActionPlan(trigger.code),
      approvalPolicy: this.defaultApprovalPolicy(trigger.riskLevel),
    }));
  }

  async listDefinitions(query: AutomationQuery) {
    const page = this.normalizePage(query.page);
    const pageSize = this.normalizeLimit(query.pageSize, 10, 50);
    const where = {
      storeId: Number(query.storeId),
      ...(query.personaCode ? { personaCode: String(query.personaCode) } : {}),
      ...(query.status && query.status !== 'all' ? { status: String(query.status) } : {}),
    };
    try {
      const [items, total] = await Promise.all([
        this.delegate('agentAutomationDefinition').findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.delegate('agentAutomationDefinition').count({ where }),
      ]);
      return { items, data: items, total, page, pageSize };
    } catch (error) {
      if (this.isMissingAutomationSchemaError(error)) return this.emptyPage(page, pageSize, 'agent_automation_schema_pending');
      throw error;
    }
  }

  async listRuns(query: AutomationQuery & { definitionId?: number | string }) {
    const page = this.normalizePage(query.page);
    const pageSize = this.normalizeLimit(query.pageSize, 10, 50);
    const definitionId = Number(query.definitionId);
    const where = {
      storeId: Number(query.storeId),
      ...(Number.isFinite(definitionId) && definitionId > 0 ? { definitionId } : {}),
      ...(query.personaCode ? { personaCode: String(query.personaCode) } : {}),
      ...(query.status && query.status !== 'all' ? { status: String(query.status) } : {}),
    };
    try {
      const [items, total] = await Promise.all([
        this.delegate('agentAutomationRun').findMany({
          where,
          orderBy: { startedAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.delegate('agentAutomationRun').count({ where }),
      ]);
      return { items, data: items, total, page, pageSize };
    } catch (error) {
      if (this.isMissingAutomationSchemaError(error)) return this.emptyPage(page, pageSize, 'agent_automation_run_schema_pending');
      throw error;
    }
  }

  async listEffects(query: AutomationQuery & { definitionId?: number | string; runId?: number | string }) {
    const page = this.normalizePage(query.page);
    const pageSize = this.normalizeLimit(query.pageSize, 10, 50);
    const definitionId = Number(query.definitionId);
    const runId = Number(query.runId);
    const where = {
      storeId: Number(query.storeId),
      ...(Number.isFinite(definitionId) && definitionId > 0 ? { definitionId } : {}),
      ...(Number.isFinite(runId) && runId > 0 ? { runId } : {}),
      ...(query.status && query.status !== 'all' ? { status: String(query.status) } : {}),
    };
    try {
      const [items, total] = await Promise.all([
        this.delegate('agentAutomationEffect').findMany({
          where,
          orderBy: { occurredAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.delegate('agentAutomationEffect').count({ where }),
      ]);
      return { items, data: items, total, page, pageSize };
    } catch (error) {
      if (this.isMissingAutomationSchemaError(error)) return this.emptyPage(page, pageSize, 'agent_automation_effect_schema_pending');
      throw error;
    }
  }

  async createDraft(input: CreateAutomationDraftInput) {
    const trigger = this.resolveTrigger(input.triggerType, input.goal);
    const riskLevel = this.normalizeRiskLevel(input.riskLevel ?? trigger.riskLevel);
    const triggerConfig = input.triggerConfig ?? this.defaultTriggerConfig(trigger.code);
    const actionPlan = input.actionPlan ?? this.defaultActionPlan(trigger.code, input.goal);
    try {
      return await this.delegate('agentAutomationDefinition').create({
        data: {
          storeId: Number(input.storeId),
          personaCode: input.personaCode ?? null,
          name: (input.name || `${trigger.name}自动化草稿`).trim(),
          description: input.description ?? input.goal ?? `${trigger.name}场景的 Agent 自动化草稿。`,
          triggerType: trigger.code,
          triggerConfigJson: this.toJson(triggerConfig),
          actionPlanJson: this.toJson(actionPlan),
          approvalPolicyJson: this.toJson(input.approvalPolicy ?? this.defaultApprovalPolicy(riskLevel)),
          scheduleJson: this.toJson(input.schedule ?? { mode: 'manual_first', timezone: 'Asia/Shanghai' }),
          riskLevel,
          status: 'draft',
          sourceRunId: input.sourceRunId ?? null,
          createdBy: input.userId ?? null,
        },
      });
    } catch (error) {
      if (this.isMissingAutomationSchemaError(error)) throw this.schemaPendingError('Agent 自动化表尚未迁移，暂不能保存自动化草稿。');
      throw error;
    }
  }

  async runOnce(input: RunAutomationInput) {
    let definition: any;
    try {
      definition = await this.delegate('agentAutomationDefinition').findFirst({
        where: { id: Number(input.definitionId), storeId: Number(input.storeId) },
      });
    } catch (error) {
      if (this.isMissingAutomationSchemaError(error)) throw this.schemaPendingError('Agent 自动化表尚未迁移，暂不能触发自动化。');
      throw error;
    }
    if (!definition) throw new NotFoundException('未找到该 Agent 自动化定义。');

    const approvalRequired = this.requiresApproval(definition);
    const status = input.dryRun ? 'dry_run_completed' : approvalRequired ? 'waiting_approval' : 'completed';
    const output = {
      approvalRequired,
      summary: approvalRequired
        ? '该自动化包含中高风险动作，已生成运行记录并等待人工确认。'
        : '该自动化已完成一次手动触发预演，当前未执行外部客户触达。',
      nextStep: approvalRequired ? '请在自动化中心确认动作预览后再执行真实触达。' : '可继续观察效果归因或转为定时触发。',
      actionPreview: definition.actionPlanJson,
    };

    const run = await this.delegate('agentAutomationRun').create({
      data: {
        definitionId: Number(definition.id),
        storeId: Number(input.storeId),
        personaCode: definition.personaCode ?? null,
        triggerType: definition.triggerType,
        mode: input.mode ?? 'manual',
        status,
        triggeredBy: input.userId ?? null,
        inputJson: this.toJson({ dryRun: Boolean(input.dryRun), input: input.input ?? null }),
        outputJson: this.toJson(output),
        completedAt: status === 'waiting_approval' ? null : new Date(),
      },
    });

    const effect = await this.delegate('agentAutomationEffect').create({
      data: {
        definitionId: Number(definition.id),
        runId: Number(run.id),
        storeId: Number(input.storeId),
        effectType: approvalRequired ? 'approval_required' : 'manual_run',
        objectType: 'agent_automation',
        objectId: Number(definition.id),
        metricKey: approvalRequired ? 'approval_queue_count' : 'manual_run_count',
        impactJson: this.toJson(output),
        status: approvalRequired ? 'pending' : 'recorded',
      },
    });

    await this.delegate('agentAutomationDefinition').update({
      where: { id: Number(definition.id) },
      data: { lastTriggeredAt: new Date() },
    });

    return { run, effect, definition, approvalRequired };
  }

  async runDueAutomations(input: RunDueAutomationsInput) {
    const now = input.now ? new Date(input.now) : new Date();
    const limit = this.normalizeLimit(input.limit, 10, 50);
    let definitions: any[];
    try {
      definitions = await this.delegate('agentAutomationDefinition').findMany({
        where: { storeId: Number(input.storeId), status: 'enabled' },
        orderBy: { updatedAt: 'asc' },
        take: 200,
      });
    } catch (error) {
      if (this.isMissingAutomationSchemaError(error)) {
        return { checkedCount: 0, triggeredCount: 0, skippedCount: 0, results: [], migrationPending: true };
      }
      throw error;
    }
    const dueDefinitions = definitions.filter((definition: any) => this.isScheduleDue(definition, now)).slice(0, limit);
    const results = [];
    for (const definition of dueDefinitions) {
      results.push(
        await this.runOnce({
          storeId: Number(input.storeId),
          userId: input.userId,
          definitionId: Number(definition.id),
          mode: 'scheduled',
          dryRun: input.dryRun ?? true,
          input: { scheduledAt: now.toISOString(), schedule: definition.scheduleJson ?? null },
        }),
      );
    }
    return {
      checkedCount: definitions.length,
      triggeredCount: results.length,
      skippedCount: definitions.length - dueDefinitions.length,
      results,
    };
  }

  async evaluateEvent(input: EvaluateAutomationEventInput) {
    const limit = this.normalizeLimit(input.limit, 10, 50);
    let definitions: any[];
    try {
      definitions = await this.delegate('agentAutomationDefinition').findMany({
        where: { storeId: Number(input.storeId), status: 'enabled' },
        orderBy: { updatedAt: 'asc' },
        take: 200,
      });
    } catch (error) {
      if (this.isMissingAutomationSchemaError(error)) {
        return { eventType: input.eventType, checkedCount: 0, matchedCount: 0, results: [], migrationPending: true };
      }
      throw error;
    }
    const matched = definitions
      .filter((definition: any) => this.matchesEvent(definition, input.eventType, input.payload))
      .slice(0, limit);
    const results = [];
    for (const definition of matched) {
      results.push(
        await this.runOnce({
          storeId: Number(input.storeId),
          userId: input.userId,
          definitionId: Number(definition.id),
          mode: 'event',
          dryRun: input.dryRun ?? true,
          input: { eventType: input.eventType, payload: input.payload ?? null },
        }),
      );
    }
    return {
      eventType: input.eventType,
      checkedCount: definitions.length,
      matchedCount: matched.length,
      results,
    };
  }

  async listPendingApprovals(query: AutomationQuery & { definitionId?: number | string }) {
    return this.listRuns({ ...query, status: 'waiting_approval' });
  }

  async decideRunApproval(input: DecideAutomationApprovalInput) {
    const run = await this.delegate('agentAutomationRun').findFirst({
      where: {
        id: Number(input.runId),
        storeId: Number(input.storeId),
        status: 'waiting_approval',
      },
    });
    if (!run) throw new NotFoundException('未找到待确认的 Agent 自动化运行。');
    const approved = input.decision === 'approve';
    const output = {
      ...(this.asObject(run.outputJson)),
      approval: {
        decision: input.decision,
        decidedBy: input.userId ?? null,
        comment: input.comment ?? null,
        decidedAt: new Date().toISOString(),
      },
      summary: approved ? '自动化动作已确认，当前记录为已完成。' : '自动化动作已拒绝，未继续执行。',
    };
    const updatedRun = await this.delegate('agentAutomationRun').update({
      where: { id: Number(run.id) },
      data: {
        status: approved ? 'completed' : 'cancelled',
        outputJson: this.toJson(output),
        completedAt: new Date(),
      },
    });
    const effect = await this.delegate('agentAutomationEffect').create({
      data: {
        definitionId: run.definitionId ?? null,
        runId: Number(run.id),
        storeId: Number(input.storeId),
        effectType: approved ? 'approval_approved' : 'approval_rejected',
        objectType: 'agent_automation_run',
        objectId: Number(run.id),
        metricKey: approved ? 'approved_run_count' : 'rejected_run_count',
        impactJson: this.toJson(output),
        status: 'recorded',
      },
    });
    return { run: updatedRun, effect, approved };
  }

  async recoverDefinition(input: RecoverAutomationInput) {
    const definition = await this.delegate('agentAutomationDefinition').findFirst({
      where: { id: Number(input.definitionId), storeId: Number(input.storeId) },
    });
    if (!definition) throw new NotFoundException('未找到该 Agent 自动化定义。');
    const maxFailures = Math.max(1, Number(input.maxFailures) || 3);
    const recentRuns = await this.delegate('agentAutomationRun').findMany({
      where: { definitionId: Number(input.definitionId), storeId: Number(input.storeId) },
      orderBy: { startedAt: 'desc' },
      take: maxFailures,
    });
    const consecutiveFailures = recentRuns.length >= maxFailures && recentRuns.every((run: any) => run.status === 'failed');
    if (consecutiveFailures) {
      await this.delegate('agentAutomationDefinition').update({
        where: { id: Number(input.definitionId) },
        data: { status: 'paused' },
      });
      const effect = await this.delegate('agentAutomationEffect').create({
        data: {
          definitionId: Number(input.definitionId),
          storeId: Number(input.storeId),
          effectType: 'fuse_paused',
          objectType: 'agent_automation',
          objectId: Number(input.definitionId),
          metricKey: 'consecutive_failure_count',
          impactJson: this.toJson({ consecutiveFailures: recentRuns.length, maxFailures }),
          status: 'recorded',
        },
      });
      return { status: 'paused', recovered: false, effect, reason: '连续失败达到阈值，已暂停该自动化。' };
    }

    const retry = await this.runOnce({
      storeId: Number(input.storeId),
      userId: input.userId,
      definitionId: Number(input.definitionId),
      mode: 'recovery',
      dryRun: true,
      input: { recentRunIds: recentRuns.map((run: any) => run.id), maxFailures },
    });
    return { status: 'retry_scheduled', recovered: true, retry, reason: '未达到熔断阈值，已创建一次安全恢复预演。' };
  }

  async recordAttribution(input: RecordAutomationAttributionInput) {
    const effect = await this.delegate('agentAutomationEffect').create({
      data: {
        definitionId: input.definitionId ?? null,
        runId: input.runId ?? null,
        storeId: Number(input.storeId),
        effectType: input.effectType ?? 'attribution',
        objectType: input.objectType ?? null,
        objectId: input.objectId ?? null,
        customerId: input.customerId ?? null,
        metricKey: input.metricKey ?? 'attributed_effect',
        impactJson: this.toJson({
          ...(this.asObject(input.impact)),
          recordedBy: input.userId ?? null,
          recordedAt: new Date().toISOString(),
        }),
        status: 'attributed',
      },
    });
    return effect;
  }

  private resolveTrigger(triggerType?: string, goal?: string) {
    if (triggerType) {
      const found = BUILT_IN_TRIGGERS.find((item) => item.code === triggerType);
      if (found) return found;
    }
    const text = String(goal ?? '');
    if (/沉睡|流失|召回/.test(text)) return BUILT_IN_TRIGGERS[0];
    if (/高价值|VIP|大客户/.test(text)) return BUILT_IN_TRIGGERS[1];
    if (/疗程|消耗|到期|复购/.test(text)) return BUILT_IN_TRIGGERS[2];
    if (/缺货|补货|低库存/.test(text)) return BUILT_IN_TRIGGERS[3];
    if (/临期|过期/.test(text)) return BUILT_IN_TRIGGERS[4];
    if (/转化|活动效果/.test(text)) return BUILT_IN_TRIGGERS[5];
    if (/员工|美容师|绩效/.test(text)) return BUILT_IN_TRIGGERS[6];
    if (/预约|爽约|空档/.test(text)) return BUILT_IN_TRIGGERS[7];
    if (/财务|退款|折扣|毛利/.test(text)) return BUILT_IN_TRIGGERS[8];
    if (/投诉|差评|评价/.test(text)) return BUILT_IN_TRIGGERS[9];
    return BUILT_IN_TRIGGERS[0];
  }

  private defaultTriggerConfig(code: string) {
    const configs: Record<string, Record<string, unknown>> = {
      dormant_customer: { daysSinceLastVisit: 60, minSpend: 0, maxAudience: 200 },
      high_value_customer_arrival: { vipLevels: ['VIP2', 'VIP3'], arrivalWindowMinutes: 30 },
      course_consumption_due: { remainingTimesLessThanOrEqual: 2, expiryDaysLessThanOrEqual: 30 },
      inventory_stockout: { stockLessThanSafetyStock: true, projectedAvailableDaysLessThanOrEqual: 7 },
      inventory_expiring: { expiryDaysLessThanOrEqual: 45, minStockValue: 100 },
      campaign_low_conversion: { conversionRateLessThan: 0.05, minTouchCount: 50 },
      staff_exception: { refundRateAbove: 0.1, completionRateBelow: 0.7 },
      reservation_exception: { noShowRateAbove: 0.12, emptySlotsMoreThan: 3 },
      finance_exception: { refundAmountAbove: 1000, grossMarginBelow: 0.35 },
      complaint_bad_review: { ratingLessThanOrEqual: 2, unhandledHoursMoreThan: 24 },
    };
    return configs[code] ?? {};
  }

  private defaultActionPlan(code: string, goal?: string) {
    const actionLabels: Record<string, string[]> = {
      dormant_customer: ['生成召回名单', '推荐权益', '生成短信话术', '等待人工确认触达'],
      high_value_customer_arrival: ['提醒前台识别客户', '推荐接待话术', '提示店长关注转化'],
      course_consumption_due: ['筛选疗程将尽客户', '生成复购建议', '创建顾问跟进草稿'],
      inventory_stockout: ['生成缺货清单', '建议采购数量', '等待确认采购草稿'],
      inventory_expiring: ['生成临期清单', '建议处理方案', '创建促销草稿'],
      campaign_low_conversion: ['诊断漏斗掉点', '建议调整权益或客群', '生成复盘摘要'],
      staff_exception: ['生成异常线索', '提示店长复核', '创建员工沟通草稿'],
      reservation_exception: ['识别爽约和空档', '推荐候补客户', '等待确认通知'],
      finance_exception: ['识别财务异常', '生成风险说明', '提示人工复核'],
      complaint_bad_review: ['识别未处理投诉', '生成安抚话术', '创建服务补救任务草稿'],
    };
    return {
      goal: goal ?? '由 Agent 根据触发条件生成运营动作草稿。',
      steps: (actionLabels[code] ?? ['生成运营建议', '等待人工确认']).map((label, index) => ({
        order: index + 1,
        label,
        type: index === 0 ? 'analysis' : index === actionLabels[code]?.length - 1 ? 'approval' : 'draft',
      })),
      externalTouch: ['dormant_customer', 'course_consumption_due', 'reservation_exception', 'complaint_bad_review'].includes(code),
    };
  }

  private defaultApprovalPolicy(riskLevel: string) {
    return {
      required: riskLevel !== 'low',
      approverRoles: ['manager'],
      previewRequired: true,
      reason: riskLevel === 'high' ? '高风险自动化必须由店长确认后执行。' : '涉及客户触达或业务动作，执行前需要人工确认。',
    };
  }

  private requiresApproval(definition: any) {
    const policy = definition.approvalPolicyJson as { required?: boolean } | null;
    return policy?.required !== undefined ? Boolean(policy.required) : definition.riskLevel !== 'low';
  }

  private isScheduleDue(definition: any, now: Date) {
    const schedule = this.asObject(definition.scheduleJson);
    const mode = String(schedule.mode ?? 'manual_first');
    if (mode === 'manual_first' || mode === 'disabled') return false;
    const lastTriggeredAt = definition.lastTriggeredAt ? new Date(definition.lastTriggeredAt) : null;
    if (mode === 'interval') {
      const minutes = Math.max(1, Number(schedule.everyMinutes) || 1440);
      return !lastTriggeredAt || now.getTime() - lastTriggeredAt.getTime() >= minutes * 60_000;
    }
    if (mode === 'daily') {
      if (!lastTriggeredAt) return true;
      return this.formatDate(now) !== this.formatDate(lastTriggeredAt);
    }
    if (mode === 'weekly') {
      if (!lastTriggeredAt) return true;
      return now.getTime() - lastTriggeredAt.getTime() >= 7 * 86_400_000;
    }
    return false;
  }

  private matchesEvent(definition: any, eventType: string, payload: unknown) {
    if (definition.triggerType === eventType) return true;
    const config = this.asObject(definition.triggerConfigJson);
    const eventTypes = Array.isArray(config.eventTypes) ? config.eventTypes.map(String) : [];
    if (eventTypes.includes(eventType)) return true;
    const payloadObject = this.asObject(payload);
    const thresholdMetric = String(config.metricKey ?? '');
    if (thresholdMetric && payloadObject.metricKey === thresholdMetric) {
      const threshold = Number(config.threshold ?? config.lessThan ?? config.greaterThan);
      const value = Number(payloadObject.value);
      if (!Number.isFinite(threshold) || !Number.isFinite(value)) return true;
      if (config.lessThan !== undefined) return value < threshold;
      if (config.greaterThan !== undefined) return value > threshold;
      return value >= threshold;
    }
    return false;
  }

  private asObject(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
  }

  private normalizeRiskLevel(value: string) {
    return ['low', 'medium', 'high'].includes(value) ? value : 'medium';
  }

  private normalizePage(value: unknown) {
    return Math.max(1, Number(value) || 1);
  }

  private normalizeLimit(value: unknown, fallback: number, max: number) {
    return Math.min(max, Math.max(1, Number(value) || fallback));
  }

  private formatDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private delegate(name: string): any {
    const delegate = (this.prisma as any)[name];
    if (!delegate) throw new Error(`Prisma delegate ${name} is unavailable. Run prisma generate after applying agent automation schema.`);
    return delegate;
  }

  private emptyPage(page: number, pageSize: number, reason: string) {
    return { items: [], data: [], total: 0, page, pageSize, migrationPending: true, reason };
  }

  private isMissingAutomationSchemaError(error: unknown) {
    const anyError = error as { code?: string; message?: string; meta?: { table?: string } };
    const message = String(anyError?.message ?? '').toLowerCase();
    const table = String(anyError?.meta?.table ?? '').toLowerCase();
    return (
      anyError?.code === 'P2021' ||
      anyError?.code === 'P2022' ||
      table.includes('agent_automation') ||
      message.includes('agent_automation') ||
      message.includes('agentautomation') ||
      message.includes('does not exist')
    );
  }

  private schemaPendingError(message: string) {
    return new ServiceUnavailableException({
      message,
      code: 'AGENT_AUTOMATION_SCHEMA_MIGRATION_PENDING',
      details: {
        migration: '20260626160000_agent_automation_engine',
      },
    });
  }

  private toJson(value: unknown) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }
}
