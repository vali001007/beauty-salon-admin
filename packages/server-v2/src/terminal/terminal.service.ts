import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiService } from '../ai/ai.service.js';
import { DeviceLoginDto } from './dto/device-login.dto.js';
import { DeviceHeartbeatDto } from './dto/device-heartbeat.dto.js';
import { QuickCreateCustomerDto } from './dto/quick-create-customer.dto.js';
import { CreateServiceTaskDto } from './dto/create-service-task.dto.js';
import { VerifyCardDto, ConsumeCardDto } from './dto/verify-card.dto.js';
import { CheckoutDto } from './dto/checkout.dto.js';
import { CreateSkinTestDto } from './dto/create-skin-test.dto.js';
import { CreateCardOrderDto } from './dto/card-order.dto.js';
import { CreateRechargeOrderDto } from './dto/recharge-order.dto.js';
import { UpdateTerminalCustomerHealthProfileDto } from './dto/customer-health-profile.dto.js';
import {
  CreateReservationDto,
  ReservationAvailabilityQueryDto,
  RescheduleReservationDto,
  UpdateReservationDto,
} from './dto/reservation.dto.js';
import { AdjustBalanceDto, ConsumeBalanceDto, RefundBalanceDto } from './dto/balance.dto.js';
import { CreateTerminalServiceRecordDto } from './dto/service-record.dto.js';
import { CreateTerminalAutomationDto, UpdateTerminalAutomationDto } from './dto/automation.dto.js';

type TerminalDashboardInsight = {
  title: string;
  severity: 'high' | 'medium' | 'low' | string;
  reason: string;
  action: string;
  relatedType?: string;
  relatedId?: number | string;
};

type TerminalDashboardInsights = {
  risks: TerminalDashboardInsight[];
  suggestions: TerminalDashboardInsight[];
};

@Injectable()
export class TerminalService implements OnModuleInit, OnModuleDestroy {
  private automationScheduler?: NodeJS.Timeout;
  private automationScanRunning = false;
  private managerInsightCache = new Map<string, { expiresAt: number; value: TerminalDashboardInsights }>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private aiService: AiService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.TERMINAL_AUTOMATION_SCHEDULER === 'disabled') return;
    this.automationScheduler = setInterval(() => {
      void this.runDueTerminalAutomations().catch((error) => {
        console.warn('Ami Core terminal automation due scan failed', error);
      });
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.automationScheduler) clearInterval(this.automationScheduler);
  }

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  private toIso(value?: Date | string | null): string {
    if (!value) return '';
    return value instanceof Date ? value.toISOString() : String(value);
  }

  private toLocalDateText(value?: Date | string | null): string {
    if (!value) return '';
    if (!(value instanceof Date)) return String(value).slice(0, 10);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toTerminalDeviceId(deviceId?: number | null): number | undefined {
    return deviceId && deviceId > 0 ? deviceId : undefined;
  }

  private isMissingOptionalTableError(error: unknown) {
    const candidate = error as {
      code?: string;
      meta?: {
        driverAdapterError?: {
          cause?: { kind?: string };
        };
      };
    };
    return candidate?.code === 'P2021' || candidate?.meta?.driverAdapterError?.cause?.kind === 'TableDoesNotExist';
  }

  private warnOptionalTableSkipped(tableName: string, error: unknown) {
    if (!this.isMissingOptionalTableError(error)) return false;
    console.warn(`Ami Core terminal optional table "${tableName}" is missing, skipped writing related detail.`);
    return true;
  }

  private getPaymentMethod(method?: string) {
    const map: Record<string, string> = {
      微信: 'wechat',
      支付宝: 'alipay',
      现金: 'cash',
      银行卡: 'card',
      次卡抵扣: 'customer_card',
      会员余额: 'member_balance',
      wechat: 'wechat',
      alipay: 'alipay',
      cash: 'cash',
      card: 'card',
      customer_card: 'customer_card',
      member_balance: 'member_balance',
    };
    return map[method || ''] || method || 'cash';
  }

  private createSequenceNo(prefix: string) {
    return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private getTerminalAutomationMarker(storeId: number) {
    return `[terminal:${storeId}]`;
  }

  private getTerminalAutomationDraftMarker(draftId: string) {
    return `[draft:${draftId}]`;
  }

  private resolveTerminalAutomationRisk(dto: CreateTerminalAutomationDto) {
    const text = `${dto.title} ${dto.summary} ${dto.sourceText} ${dto.trigger} ${dto.audience} ${dto.action}`;
    const approvalPattern =
      /自动(?:发送|取消|扣次|核销|收款|创建收款|发放|下发)|扣次|核销|收款|取消预约|优惠|折扣|短信|微信|企微|小程序|支付|退款|储值|充值/;
    const highRiskPattern = /扣次|核销|收款|取消预约|退款|储值|充值|支付/;
    const requiresApproval = dto.riskLevel === 'high' || dto.requiresApproval || approvalPattern.test(text);
    const riskLevel = dto.riskLevel === 'high' || highRiskPattern.test(text) ? 'high' : requiresApproval ? 'medium' : dto.riskLevel;

    return { riskLevel, requiresApproval };
  }

  getTerminalAutomationTemplates() {
    return [
      {
        id: 'reservation_before_reminder',
        category: '预约',
        title: '预约前提醒',
        description: '预约开始前提醒顾客，并同步给前台查看。',
        command: '顾客预约前 2 小时生成提醒，前台可查看',
        defaultTrigger: '预约开始前 2 小时',
        defaultAudience: '今日及未来有预约的顾客',
        defaultAction: '生成顾客提醒草稿，并同步给前台查看',
        riskLevel: 'medium',
      },
      {
        id: 'reservation_late_reminder',
        category: '预约',
        title: '迟到提醒',
        description: '顾客超过预约时间仍未到店时，提醒前台电话确认。',
        command: '顾客超过预约时间 10 分钟未到店，提醒前台电话确认',
        defaultTrigger: '超过预约时间 10 分钟未到店',
        defaultAudience: '今日有预约且未到店顾客',
        defaultAction: '提醒前台电话确认，并标记需跟进',
        riskLevel: 'low',
      },
      {
        id: 'care_cycle_followup',
        category: '护理',
        title: '护理周期回访',
        description: '顾客做完护理后，到周期时提醒美容师回访。',
        command: '顾客做完补水类项目 25 天后，提醒美容师回访并预约下次护理',
        defaultTrigger: '服务完成后第 25 天上午 10:00',
        defaultAudience: '补水类项目顾客',
        defaultAction: '给负责美容师生成回访任务',
        riskLevel: 'low',
      },
      {
        id: 'card_remaining_expiry',
        category: '卡项',
        title: '次卡剩余/到期提醒',
        description: '次卡剩余次数少或即将到期时，生成前台跟进任务。',
        command: '次卡剩 1 次或 30 天内到期时，生成前台跟进任务',
        defaultTrigger: '次卡剩余 1 次，或 30 天内到期',
        defaultAudience: '持有有效次卡的顾客',
        defaultAction: '生成前台跟进任务，并推荐续卡/使用提醒话术',
        riskLevel: 'medium',
      },
      {
        id: 'low_stock_reminder',
        category: '库存',
        title: '低库存提醒',
        description: '商品低于安全库存时提醒店长补货。',
        command: '库存低于安全库存时提醒店长补货',
        defaultTrigger: '库存低于系统安全库存',
        defaultAudience: '门店库存商品',
        defaultAction: '给店长生成补货提醒，并展示当前库存和建议补货量',
        riskLevel: 'low',
      },
      {
        id: 'daily_closing_report',
        category: '经营',
        title: '每日收工报告',
        description: '每天闭店前汇总未收款、未完成服务和库存风险。',
        command: '每天 21:30 提醒我看未收款订单、未完成服务和库存风险',
        defaultTrigger: '每天 21:30',
        defaultAudience: '当前门店今日经营数据',
        defaultAction: '生成店长提醒卡片，汇总未支付订单、未完成服务任务和低库存商品',
        riskLevel: 'low',
      },
    ];
  }

  private parseTerminalAutomationSchedule(trigger: string) {
    const dailyTime = trigger.match(/每天\s*(\d{2}:\d{2})/);
    if (dailyTime) {
      return { type: 'daily', time: dailyTime[1], label: trigger };
    }
    const spokenTime = this.parseTerminalAutomationSpokenTime(trigger);
    if (spokenTime) {
      return { type: 'daily', time: spokenTime, label: trigger };
    }
    if (/闭店前|下班前|收工前/.test(trigger)) {
      return { type: 'daily', time: '21:30', label: trigger };
    }
    if (/预约/.test(trigger)) {
      return { type: 'event', event: 'reservation', offset: trigger, label: trigger };
    }
    if (/服务完成|护理|次卡|库存/.test(trigger)) {
      return { type: 'daily', time: '10:00', label: trigger };
    }
    return { type: 'manual', label: trigger };
  }

  private parseTerminalAutomationChineseHour(text: string) {
    const normalized = text.replace(/两/g, '二');
    const map: Record<string, number> = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    if (/^\d+$/.test(normalized)) return Number(normalized);
    if (normalized === '十') return 10;
    if (normalized.startsWith('十')) return 10 + (map[normalized.slice(1)] ?? 0);
    if (normalized.endsWith('十')) return (map[normalized.slice(0, 1)] ?? 0) * 10;
    if (normalized.includes('十')) {
      const [tens, ones] = normalized.split('十');
      return (map[tens] ?? 1) * 10 + (map[ones] ?? 0);
    }
    return map[normalized] ?? null;
  }

  private parseTerminalAutomationSpokenTime(trigger: string) {
    const matched = trigger.match(/(?:每天|每日)?\s*(上午|下午|晚上|晚间|早上|中午)?\s*([0-9一二三四五六七八九十两]{1,3})[:：点](半|\d{0,2})/);
    if (!matched) return null;
    const [, period, hourText, minuteText] = matched;
    let hour = this.parseTerminalAutomationChineseHour(hourText) ?? Number(hourText);
    if (!Number.isFinite(hour)) return null;
    if ((period === '下午' || period === '晚上' || period === '晚间') && hour < 12) hour += 12;
    if (period === '中午' && hour < 11) hour += 12;
    const minute = minuteText === '半' ? 30 : minuteText ? Number(minuteText) : 0;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  private buildTerminalAutomationPayload(storeId: number, userId: number | undefined, dto: CreateTerminalAutomationDto) {
    const marker = this.getTerminalAutomationMarker(storeId);
    const draftMarker = this.getTerminalAutomationDraftMarker(dto.draftId);
    const risk = this.resolveTerminalAutomationRisk(dto);
    const terminalMeta = {
      source: 'aura_lite_terminal',
      storeId,
      draftId: dto.draftId,
      sourceText: dto.sourceText,
      trigger: dto.trigger,
      audience: dto.audience,
      frequencyCap: dto.frequencyCap,
      riskLevel: risk.riskLevel,
      requiresApproval: risk.requiresApproval,
      createdByUserId: userId,
    };

    return {
      name: dto.title,
      description: `${dto.summary}\n\n${marker} ${draftMarker} [source:aura-lite]`,
      status: risk.requiresApproval ? 'draft' : 'enabled',
      executionType: 'auto',
      schedule: this.parseTerminalAutomationSchedule(dto.trigger),
      triggerRules: [
        {
          type: 'terminal_automation',
          params: terminalMeta,
        },
      ],
      ruleRelation: 'AND',
      actions: [
        {
          type: risk.requiresApproval ? 'approval' : 'staff_task',
          value: dto.action,
          channel: 'terminal',
          contentTemplate: dto.action,
          meta: terminalMeta,
        },
      ],
      targetCount: 0,
    };
  }

  private mapTerminalAutomationStrategy(strategy: any) {
    const triggerRule = Array.isArray(strategy.triggerRules) ? strategy.triggerRules[0] : undefined;
    const action = Array.isArray(strategy.actions) ? strategy.actions[0] : undefined;
    const meta = action?.meta ?? triggerRule?.params ?? {};
    return {
      id: strategy.id,
      name: strategy.name,
      title: strategy.name,
      summary: String(strategy.description ?? '').split('\n\n')[0],
      status: strategy.status,
      executionType: strategy.executionType,
      schedule: strategy.schedule,
      trigger: meta.trigger ?? strategy.schedule?.label ?? '',
      audience: meta.audience ?? '',
      action: action?.value ?? action?.contentTemplate ?? '',
      frequencyCap: meta.frequencyCap ?? '',
      riskLevel: meta.riskLevel ?? 'low',
      requiresApproval: Boolean(meta.requiresApproval),
      sourceText: meta.sourceText ?? '',
      createdAt: strategy.createdAt,
      updatedAt: strategy.updatedAt,
      lastExecutedAt: strategy.lastExecutedAt,
    };
  }

  private getTerminalAutomationMeta(strategy: any) {
    const triggerRule = Array.isArray(strategy.triggerRules) ? strategy.triggerRules[0] : undefined;
    const action = Array.isArray(strategy.actions) ? strategy.actions[0] : undefined;
    return action?.meta ?? triggerRule?.params ?? {};
  }

  private getStoreIdFromTerminalAutomation(strategy: any): number | null {
    const metaStoreId = Number(this.getTerminalAutomationMeta(strategy)?.storeId);
    if (Number.isFinite(metaStoreId) && metaStoreId > 0) return metaStoreId;
    const matched = String(strategy.description ?? '').match(/\[terminal:(\d+)\]/);
    return matched ? Number(matched[1]) : null;
  }

  private getStartOfLocalDay(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private parseClockMinutes(time?: string) {
    const matched = String(time ?? '').match(/^(\d{1,2}):(\d{2})$/);
    if (!matched) return null;
    const hour = Number(matched[1]);
    const minute = Number(matched[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
  }

  private parseReservationReminderOffsetMinutes(text: string) {
    const hourMatch = text.match(/预约(?:开始)?前\s*(\d+)\s*小时/);
    if (hourMatch) return Number(hourMatch[1]) * 60;
    const minuteMatch = text.match(/预约(?:开始)?前\s*(\d+)\s*分钟/);
    if (minuteMatch) return Number(minuteMatch[1]);
    return 120;
  }

  private getReservationAppointmentDate(reservation: { date: Date | string; startTime?: string | null }) {
    const dateText = this.toLocalDateText(reservation.date);
    return new Date(`${dateText}T${reservation.startTime || '00:00'}:00`);
  }

  private isReservationReminderDue(reservation: { date: Date | string; startTime?: string | null }, offsetMinutes: number, now = new Date()) {
    const appointmentAt = this.getReservationAppointmentDate(reservation);
    const remindAt = new Date(appointmentAt.getTime() - offsetMinutes * 60000);
    const windowEnd = new Date(remindAt.getTime() + 10 * 60000);
    return now >= remindAt && now < windowEnd;
  }

  private shouldRunTerminalAutomation(strategy: any, now = new Date()) {
    const schedule = strategy.schedule && typeof strategy.schedule === 'object' ? strategy.schedule : {};
    if (schedule.type === 'manual') return false;
    if (
      schedule.type !== 'event' &&
      strategy.lastExecutedAt &&
      new Date(strategy.lastExecutedAt).getTime() >= this.getStartOfLocalDay(now).getTime()
    ) {
      return false;
    }

    const dueMinutes =
      schedule.type === 'daily'
        ? this.parseClockMinutes(schedule.time)
        : schedule.type === 'event'
          ? this.parseClockMinutes(schedule.time ?? '00:00')
          : null;
    if (dueMinutes === null) return false;

    return now.getHours() * 60 + now.getMinutes() >= dueMinutes;
  }

  private async countTerminalAutomationTargets(storeId: number, strategy: any) {
    const mapped = this.mapTerminalAutomationStrategy(strategy);
    const text = `${mapped.title} ${mapped.summary} ${mapped.trigger} ${mapped.audience} ${mapped.action}`;
    const today = this.getStartOfLocalDay();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (/库存|补货|低库存/.test(text)) {
      const products = await this.prisma.product.findMany({
        where: { storeId, deletedAt: null },
        select: { currentStock: true, safetyStock: true },
        take: 500,
      });
      return products.filter((item) => this.toNumber(item.currentStock) <= this.toNumber(item.safetyStock)).length;
    }

    if (/未收款|未付款|未支付|收款/.test(text)) {
      return this.prisma.productOrder.count({
        where: {
          storeId,
          status: { in: ['pending', 'pending_payment', 'unpaid'] },
        },
      });
    }

    if (/未完成服务|服务任务|护理回访|护理周期|服务完成/.test(text)) {
      return this.prisma.serviceTask.count({
        where: {
          storeId,
          status: { in: ['pending', 'in_progress'] },
        },
      });
    }

    if (/次卡|卡项|到期|续卡/.test(text)) {
      const inThirtyDays = new Date(today);
      inThirtyDays.setDate(inThirtyDays.getDate() + 30);
      return this.prisma.customerCard.count({
        where: {
          status: 'active',
          customer: { storeId },
          OR: [{ remainingTimes: { lte: 1 } }, { expiryDate: { lte: inThirtyDays } }],
        },
      });
    }

    if (/迟到|预约|到店/.test(text)) {
      const reservations = await this.prisma.reservation.findMany({
        where: {
          storeId,
          date: { gte: today, lt: tomorrow },
          status: { in: ['pending', 'confirmed'] },
        },
        select: { date: true, startTime: true },
        take: 500,
      });
      if (/预约前|来店前|到店前/.test(text)) {
        const offsetMinutes = this.parseReservationReminderOffsetMinutes(text);
        return reservations.filter((item) => this.isReservationReminderDue(item, offsetMinutes)).length;
      }
      return reservations.length;
    }

    if (/生日/.test(text)) {
      const customers = await this.prisma.customer.findMany({
        where: { storeId, deletedAt: null, birthday: { not: null } },
        select: { birthday: true },
        take: 1000,
      });
      const target = new Date(today);
      target.setDate(target.getDate() + 7);
      const targetMonth = target.getMonth();
      const targetDate = target.getDate();
      return customers.filter((item) => item.birthday?.getMonth() === targetMonth && item.birthday?.getDate() === targetDate).length;
    }

    return 1;
  }

  private async resolveTerminalAutomationTouchCustomers(storeId: number, strategy: any) {
    const mapped = this.mapTerminalAutomationStrategy(strategy);
    const text = `${mapped.title} ${mapped.summary} ${mapped.trigger} ${mapped.audience} ${mapped.action}`;
    const today = this.getStartOfLocalDay();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (/次卡|卡项|到期|续卡/.test(text)) {
      const inThirtyDays = new Date(today);
      inThirtyDays.setDate(inThirtyDays.getDate() + 30);
      const cards = await this.prisma.customerCard.findMany({
        where: {
          status: 'active',
          customer: { storeId },
          OR: [{ remainingTimes: { lte: 1 } }, { expiryDate: { lte: inThirtyDays } }],
        },
        select: { customerId: true },
        take: 200,
      });
      return Array.from(new Set(cards.map((item) => item.customerId).filter(Boolean)));
    }

    if (/迟到|预约|到店/.test(text)) {
      const reservations = await this.prisma.reservation.findMany({
        where: {
          storeId,
          date: { gte: today, lt: tomorrow },
          status: { in: ['pending', 'confirmed'] },
        },
        select: { customerId: true, date: true, startTime: true },
        take: 200,
      });
      const targetReservations = /预约前|来店前|到店前/.test(text)
        ? reservations.filter((item) => this.isReservationReminderDue(item, this.parseReservationReminderOffsetMinutes(text)))
        : reservations;
      return Array.from(new Set(targetReservations.map((item) => item.customerId).filter(Boolean)));
    }

    if (/生日/.test(text)) {
      const customers = await this.prisma.customer.findMany({
        where: { storeId, deletedAt: null, birthday: { not: null } },
        select: { id: true, birthday: true },
        take: 1000,
      });
      const target = new Date(today);
      target.setDate(target.getDate() + 7);
      const targetMonth = target.getMonth();
      const targetDate = target.getDate();
      return customers
        .filter((item) => item.birthday?.getMonth() === targetMonth && item.birthday?.getDate() === targetDate)
        .map((item) => item.id);
    }

    if (/未完成服务|服务任务|护理回访|护理周期|服务完成/.test(text)) {
      const tasks = await this.prisma.serviceTask.findMany({
        where: {
          storeId,
          status: { in: ['pending', 'in_progress'] },
        },
        select: { customerId: true },
        take: 200,
      });
      return Array.from(new Set(tasks.map((item) => item.customerId).filter(Boolean)));
    }

    return [];
  }

  private parseTerminalAutomationFrequencyDays(frequencyCap?: string) {
    const matched = String(frequencyCap ?? '').match(/(\d+)\s*天/);
    const days = matched ? Number(matched[1]) : 7;
    return Number.isFinite(days) && days > 0 ? days : 7;
  }

  private async filterTerminalAutomationTouchFatigue(strategy: any, customerIds: number[]) {
    const delegate = (this.prisma as any).marketingAutomationTouch;
    if (!delegate?.findMany || !customerIds.length) return customerIds;
    const mapped = this.mapTerminalAutomationStrategy(strategy);
    const windowDays = this.parseTerminalAutomationFrequencyDays(mapped.frequencyCap);
    const since = new Date();
    since.setDate(since.getDate() - windowDays);
    const touches = await delegate.findMany({
      where: {
        strategyId: strategy.id,
        customerId: { in: customerIds },
        touchedAt: { gte: since },
      },
      select: { customerId: true },
      take: 1000,
    });
    const fatiguedCustomerIds = new Set(touches.map((touch: any) => touch.customerId));
    return customerIds.filter((customerId) => !fatiguedCustomerIds.has(customerId));
  }

  private async createTerminalAutomationTouches(execution: any, strategy: any, storeId: number) {
    const delegate = (this.prisma as any).marketingAutomationTouch;
    if (!delegate?.createMany) return 0;
    const customerIds = await this.resolveTerminalAutomationTouchCustomers(storeId, strategy);
    if (!customerIds.length) return 0;
    const eligibleCustomerIds = await this.filterTerminalAutomationTouchFatigue(strategy, customerIds);
    if (!eligibleCustomerIds.length) return 0;
    await delegate.createMany({
      data: eligibleCustomerIds.map((customerId) => ({
        executionId: execution.id,
        strategyId: strategy.id,
        customerId,
        channel: 'terminal',
        status: 'reached',
        touchedAt: new Date(),
        attributionWindowDays: 30,
      })),
      skipDuplicates: true,
    });
    return eligibleCustomerIds.length;
  }

  private buildTerminalAutomationExecutionInsight(strategy: any, execution: { triggeredCount: number; reachedCount: number }) {
    const mapped = this.mapTerminalAutomationStrategy(strategy);
    const text = `${mapped.title} ${mapped.summary} ${mapped.trigger} ${mapped.audience} ${mapped.action}`;
    const hasTargets = execution.triggeredCount > 0;
    const targetText = hasTargets ? `本次命中 ${execution.triggeredCount} 个对象` : '本次暂无命中对象';
    const baseLines = [`触发规则：${mapped.trigger}`, `对象范围：${mapped.audience}`, `执行动作：${mapped.action}`];

    if (/库存|补货|低库存/.test(text)) {
      return {
        reason: `${targetText}，系统按当前库存和安全库存阈值完成扫描。`,
        nextActions: hasTargets ? ['查看低库存商品清单', '确认补货数量', '安排采购或调拨'] : ['保持当前安全库存设置', '明天继续自动扫描'],
        primaryActionLabel: hasTargets ? '处理补货待办' : '查看库存规则',
        detailLines: baseLines,
      };
    }

    if (/未收款|未付款|未支付|收款/.test(text)) {
      return {
        reason: `${targetText}，系统已筛出仍处于待支付状态的订单。`,
        nextActions: hasTargets ? ['核对订单金额', '提醒前台跟进收款', '必要时联系顾客确认支付方式'] : ['无需处理未收款', '闭店前继续自动复核'],
        primaryActionLabel: hasTargets ? '处理收款提醒' : '查看收款规则',
        detailLines: baseLines,
      };
    }

    if (/未完成服务|服务任务|护理回访|护理周期|服务完成/.test(text)) {
      return {
        reason: `${targetText}，系统按服务任务状态和护理周期完成筛选。`,
        nextActions: hasTargets ? ['查看待回访顾客', '分配美容师跟进', '记录回访结果或预约意向'] : ['无需新增回访', '继续按护理周期自动扫描'],
        primaryActionLabel: hasTargets ? '处理回访待办' : '查看回访规则',
        detailLines: baseLines,
      };
    }

    if (/次卡|卡项|到期|续卡/.test(text)) {
      return {
        reason: `${targetText}，系统按剩余次数和到期时间完成筛选。`,
        nextActions: hasTargets ? ['查看即将到期卡项', '生成续卡/使用提醒话术', '安排前台跟进'] : ['无需处理卡项风险', '继续按频控自动扫描'],
        primaryActionLabel: hasTargets ? '处理卡项待办' : '查看卡项规则',
        detailLines: baseLines,
      };
    }

    if (/迟到|预约|到店/.test(text)) {
      return {
        reason: `${targetText}，系统按今日预约状态完成检查。`,
        nextActions: hasTargets ? ['查看预约名单', '提醒前台电话确认', '必要时标记迟到/未到店'] : ['当前预约无需处理', '下一轮继续按预约时间扫描'],
        primaryActionLabel: hasTargets ? '处理预约提醒' : '查看预约规则',
        detailLines: baseLines,
      };
    }

    if (/生日/.test(text)) {
      return {
        reason: `${targetText}，系统按生日提前提醒规则完成筛选。`,
        nextActions: hasTargets ? ['预览生日关怀话术', '确认优惠或祝福内容', '安排员工触达顾客'] : ['暂无生日关怀对象', '保持生日信息完整'],
        primaryActionLabel: hasTargets ? '处理关怀待办' : '查看生日规则',
        detailLines: baseLines,
      };
    }

    return {
      reason: `${targetText}，系统已按当前自动化规则完成扫描。`,
      nextActions: hasTargets ? ['查看命中对象', '确认提醒内容', '安排员工跟进'] : ['暂无待处理事项', '继续按规则自动扫描'],
      primaryActionLabel: hasTargets ? '处理自动化待办' : '查看自动化规则',
      detailLines: baseLines,
    };
  }

  private async executeTerminalAutomationStrategy(strategy: any, storeId: number): Promise<any>;
  private async executeTerminalAutomationStrategy(strategy: any, storeId: number, options: { skipWhenNoTargets: true }): Promise<any | null>;
  private async executeTerminalAutomationStrategy(strategy: any, storeId: number, options?: { skipWhenNoTargets?: boolean }) {
    const targetCount = await this.countTerminalAutomationTargets(storeId, strategy);
    if (targetCount === 0 && options?.skipWhenNoTargets) return null;

    const mapped = this.mapTerminalAutomationStrategy(strategy);
    const message =
      targetCount > 0
        ? `${mapped.title} 已到达触发时间，命中 ${targetCount} 个对象。动作：${mapped.action}`
        : `${mapped.title} 已到达触发时间，本次暂无命中对象。`;

    const execution = await this.prisma.marketingAutomationExecution.create({
      data: {
        strategyId: strategy.id,
        strategyName: strategy.name,
        status: 'success',
        triggeredCount: targetCount,
        reachedCount: 0,
        channel: 'terminal',
        message,
      },
    });

    const reachedCount = await this.createTerminalAutomationTouches(execution, strategy, storeId);
    const finalExecution =
      reachedCount === execution.reachedCount
        ? execution
        : await this.prisma.marketingAutomationExecution.update({
            where: { id: execution.id },
            data: { reachedCount },
          });

    await this.prisma.marketingAutomationStrategy.update({
      where: { id: strategy.id },
      data: {
        lastExecutedAt: new Date(),
        targetCount,
      },
    });

    return finalExecution;
  }

  private async createFailedTerminalAutomationExecution(strategy: any, error: unknown) {
    const message = error instanceof Error ? error.message : '自动化执行失败，请稍后复核';
    return this.prisma.marketingAutomationExecution.create({
      data: {
        strategyId: strategy.id,
        strategyName: strategy.name,
        status: 'failed',
        triggeredCount: 0,
        reachedCount: 0,
        channel: 'terminal',
        message: `自动化执行失败：${message}`,
      },
    });
  }

  private normalizeOrderItems(rawItems: any[] = []) {
    return rawItems.map((item) => {
      const quantity = this.toNumber(item.quantity ?? item.qty ?? 1) || 1;
      const unitPrice = this.toNumber(item.unitPrice ?? item.price ?? item.amount);
      const discount = this.toNumber(item.discount);
      const subtotal = this.toNumber(item.subtotal ?? quantity * unitPrice - discount);
      const itemType = String(item.itemType ?? item.type ?? 'product');
      const itemId = item.itemId ?? item.productId ?? item.projectId ?? item.cardId;
      return {
        itemType,
        itemId: itemId === undefined || itemId === null ? undefined : Number(itemId),
        name: String(item.name ?? item.productName ?? item.projectName ?? item.cardName ?? `${itemType}#${itemId ?? ''}`),
        quantity,
        unitPrice,
        subtotal,
        discount,
        payload: item,
      };
    });
  }

  private async createOrderItems(tx: any, orderId: number, rawItems: any[] = []) {
    const items = this.normalizeOrderItems(rawItems);
    if (!items.length) return items;

    try {
      await tx.orderItem.createMany({
        data: items.map((item) => ({
          orderId,
          itemType: item.itemType,
          itemId: item.itemId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          discount: item.discount,
          payload: item.payload,
        })),
      });
    } catch (error) {
      if (!this.warnOptionalTableSkipped('OrderItem', error)) throw error;
    }

    return items;
  }

  private async createPaymentRecord(
    tx: any,
    orderId: number,
    paymentMethod: string | undefined,
    amount: number,
    transactionNo?: string,
  ) {
    if (amount <= 0) return null;
    try {
      return await tx.paymentRecord.create({
        data: {
          orderId,
          paymentNo: this.createSequenceNo('PAY'),
          method: this.getPaymentMethod(paymentMethod),
          amount,
          status: 'success',
          transactionNo,
          paidAt: new Date(),
        },
      });
    } catch (error) {
      if (this.warnOptionalTableSkipped('PaymentRecord', error)) return null;
      throw error;
    }
  }

  private mapBalanceAccount(account: any, customer?: any, transaction?: any) {
    return {
      customerId: account.customerId,
      customerName: customer?.name ?? '',
      customerPhone: customer?.phone ?? '',
      storeId: account.storeId,
      cashBalance: this.toNumber(account.cashBalance),
      giftBalance: this.toNumber(account.giftBalance),
      totalBalance: this.toNumber(account.cashBalance) + this.toNumber(account.giftBalance),
      status: account.status,
      updatedAt: this.toIso(account.updatedAt),
      lastTransaction: transaction
        ? {
            id: transaction.id,
            transactionNo: transaction.transactionNo,
            type: transaction.type,
            amount: this.toNumber(transaction.amount),
            giftAmount: this.toNumber(transaction.giftAmount),
            cashBalanceAfter: this.toNumber(transaction.cashBalanceAfter),
            giftBalanceAfter: this.toNumber(transaction.giftBalanceAfter),
            createdAt: this.toIso(transaction.createdAt),
          }
        : undefined,
    };
  }

  private async getOrCreateBalanceAccount(tx: any, storeId: number, customerId: number) {
    return tx.customerBalanceAccount.upsert({
      where: { customerId_storeId: { customerId, storeId } },
      update: {},
      create: {
        customerId,
        storeId,
        cashBalance: 0,
        giftBalance: 0,
        status: 'active',
      },
    });
  }

  private async writeBalanceTransaction(
    tx: any,
    storeId: number,
    input: {
      customerId: number;
      type: 'consume' | 'refund' | 'adjust';
      amount?: number;
      giftAmount?: number;
      orderId?: number;
      paymentMethod?: string;
      remark?: string;
    },
  ) {
    const account = await this.getOrCreateBalanceAccount(tx, storeId, input.customerId);
    if (account.status !== 'active') throw new BadRequestException('会员储值账户不可用');

    const cashBalanceBefore = this.toNumber(account.cashBalance);
    const giftBalanceBefore = this.toNumber(account.giftBalance);
    const amount = this.toNumber(input.amount);
    const giftAmount = this.toNumber(input.giftAmount);
    const sign = input.type === 'consume' ? -1 : 1;
    const cashBalanceAfter = cashBalanceBefore + sign * amount;
    const giftBalanceAfter = giftBalanceBefore + sign * giftAmount;

    if (cashBalanceAfter < 0 || giftBalanceAfter < 0) {
      throw new BadRequestException('会员余额不足');
    }

    const updatedAccount = await tx.customerBalanceAccount.update({
      where: { id: account.id },
      data: {
        cashBalance: cashBalanceAfter,
        giftBalance: giftBalanceAfter,
      },
    });
    const transaction = await tx.customerBalanceTransaction.create({
      data: {
        accountId: account.id,
        customerId: input.customerId,
        storeId,
        orderId: input.orderId,
        transactionNo: this.createSequenceNo('BAL'),
        type: input.type,
        amount,
        giftAmount,
        cashBalanceBefore,
        cashBalanceAfter,
        giftBalanceBefore,
        giftBalanceAfter,
        paymentMethod: this.getPaymentMethod(input.paymentMethod ?? 'member_balance'),
        remark: input.remark,
      },
    });

    return { account: updatedAccount, transaction };
  }

  private async applyMarketingAttribution(tx: any, order: { id: number; customerId?: number | null }, amount: number) {
    if (!order.customerId || amount <= 0) return;

    try {
      const existed = await tx.marketingAttribution.findFirst({
        where: { orderId: order.id },
        select: { id: true },
      });
      if (existed) return;

      const touches = await tx.marketingAutomationTouch.findMany({
        where: {
          customerId: order.customerId,
          touchedAt: { lte: new Date() },
          status: { in: ['reached', 'sent', 'delivered', 'clicked', 'opened', 'converted'] },
        },
        orderBy: { touchedAt: 'desc' },
        take: 10,
      });

      const now = new Date();
      const touch = touches.find((item: any) => {
        const windowDays = Number(item.attributionWindowDays ?? 30);
        return item.touchedAt.getTime() >= now.getTime() - windowDays * 86400000;
      });
      if (!touch) return;

      await tx.marketingAttribution.create({
        data: {
          touchId: touch.id,
          strategyId: touch.strategyId,
          executionId: touch.executionId,
          customerId: order.customerId,
          orderId: order.id,
          attributionType: 'last_touch',
          attributedRevenue: amount,
          attributionWindowDays: touch.attributionWindowDays ?? 30,
          occurredAt: now,
        },
      });

      await tx.marketingAutomationTouch.update({
        where: { id: touch.id },
        data: {
          status: 'converted',
          convertedAt: now,
          conversionType: 'order',
          actualRevenue: { increment: amount },
        },
      });
    } catch (error) {
      if (!this.warnOptionalTableSkipped('MarketingAttribution/MarketingAutomationTouch', error)) throw error;
    }
  }

  private async createStockMovementForItem(
    tx: any,
    storeId: number,
    item: any,
    movementType: string,
    source: { type: string; id?: number; no?: string; remark?: string },
  ) {
    const productId = Number(item.productId ?? item.itemId ?? item.id);
    const quantity = this.toNumber(item.quantity ?? item.qty ?? item.amount ?? item.standardQty);
    if (!productId || quantity <= 0) return;

    const product = await tx.product.findFirst({ where: { id: productId, storeId, deletedAt: null } });
    if (!product) return;

    const signedQuantity = movementType.endsWith('_out') || movementType.includes('consume') ? -quantity : quantity;
    const beforeStock = this.toNumber(product.currentStock);
    const afterStock = beforeStock + signedQuantity;

    await tx.product.update({
      where: { id: product.id },
      data: signedQuantity < 0 ? { currentStock: { decrement: Math.abs(signedQuantity) } } : { currentStock: { increment: signedQuantity } },
    });

    const batchId = item.batchId ? Number(item.batchId) : undefined;
    if (batchId) {
      await tx.stockBatch.updateMany({
        where: { id: batchId, productId: product.id },
        data: signedQuantity < 0 ? { stock: { decrement: Math.abs(signedQuantity) } } : { stock: { increment: signedQuantity } },
      });
    }

    await tx.stockMovement.create({
      data: {
        storeId,
        productId: product.id,
        batchId,
        movementNo: this.createSequenceNo('SM'),
        movementType,
        quantity: signedQuantity,
        beforeStock,
        afterStock,
        unit: product.unit,
        sourceType: source.type,
        sourceId: source.id,
        sourceNo: source.no,
        remark: source.remark,
      },
    });
  }

  private async getStore(storeId: number) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException('门店不存在');
    return store;
  }

  private async mapReservation(reservation: any) {
    const [store, customer, project, beautician] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: reservation.storeId } }),
      this.prisma.customer.findUnique({ where: { id: reservation.customerId } }),
      this.prisma.project.findUnique({ where: { id: reservation.projectId } }),
      reservation.beauticianId
        ? this.prisma.beautician.findUnique({ where: { id: reservation.beauticianId } })
        : Promise.resolve(null),
    ]);
    const dateText = this.toLocalDateText(reservation.date);
    const appointmentTime = `${dateText} ${reservation.startTime || '00:00'}:00`;

    return {
      id: reservation.id,
      reservationNo: `R${String(reservation.id).padStart(6, '0')}`,
      customerId: reservation.customerId,
      customerName: customer?.name ?? reservation.customerName ?? '客户',
      customerPhone: customer?.phone ?? reservation.customerPhone ?? '',
      projectId: reservation.projectId,
      projectName: project?.name ?? reservation.projectName ?? '预约项目',
      beauticianId: reservation.beauticianId,
      beauticianName: beautician?.name ?? reservation.beauticianName ?? '待分配',
      storeId: reservation.storeId,
      storeName: store?.name ?? '当前门店',
      appointmentTime,
      duration: project?.duration ?? reservation.duration ?? 60,
      status: reservation.status,
      remark: reservation.remark ?? undefined,
      createdAt: this.toIso(reservation.createdAt),
      checkedInAt: this.toIso(reservation.checkedInAt) || undefined,
    };
  }

  private async mapServiceTask(task: any) {
    const [store, customer, project, beautician] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: task.storeId } }),
      this.prisma.customer.findUnique({ where: { id: task.customerId } }),
      this.prisma.project.findUnique({ where: { id: task.projectId } }),
      task.beauticianId ? this.prisma.beautician.findUnique({ where: { id: task.beauticianId } }) : Promise.resolve(null),
    ]);
    return {
      id: task.id,
      taskNo: task.taskNo,
      customerId: task.customerId,
      customerName: customer?.name ?? '客户',
      customerPhone: customer?.phone ?? '',
      projectId: task.projectId,
      projectName: project?.name ?? task.project?.name ?? '服务项目',
      beauticianId: task.beauticianId ?? 0,
      beauticianName: beautician?.name ?? '待分配',
      storeId: task.storeId,
      storeName: store?.name ?? '当前门店',
      appointmentTime: this.toIso(task.appointmentTime),
      duration: task.duration,
      status: task.status,
      startedAt: this.toIso(task.startedAt) || undefined,
      completedAt: this.toIso(task.completedAt) || undefined,
      remark: task.remark ?? undefined,
      consumptionItems: (task.consumptionItems as any[]) ?? [],
      images: task.images ?? [],
    };
  }

  private async mapPrintJob(storeId: number, job: any, storeName?: string) {
    const store = storeName ? null : await this.getStore(storeId);
    return {
      id: job.id,
      jobNo: job.jobNo,
      sourceType: job.sourceType,
      sourceId: job.sourceId ?? undefined,
      title: job.title,
      content: job.content,
      copies: job.copies,
      storeId,
      storeName: storeName ?? store?.name ?? '当前门店',
      status: job.status,
      errorMessage: job.errorMessage ?? undefined,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString(),
    };
  }

  // ─── Device Management ──────────────────────────────────────────────────────

  async deviceLogin(dto: DeviceLoginDto) {
    const device = await this.prisma.terminalDevice.findUnique({
      where: { deviceCode: dto.deviceCode },
      include: { store: true },
    });

    if (!device) {
      throw new UnauthorizedException('设备编码不存在');
    }

    if (device.status === 'disabled') {
      throw new UnauthorizedException('设备已被禁用');
    }

    if (device.activationCode !== dto.activationCode) {
      throw new UnauthorizedException('激活码错误');
    }

    // 更新设备状态为在线
    await this.prisma.terminalDevice.update({
      where: { id: device.id },
      data: {
        status: 'online',
        lastOnlineAt: new Date(),
        boundAt: device.boundAt || new Date(),
      },
    });

    // 生成设备专用 token
    const token = this.jwtService.sign(
      { deviceId: device.id, storeId: device.storeId, type: 'device' },
      { expiresIn: '30d' },
    );

    return {
      token,
      device: {
        id: device.id,
        deviceCode: device.deviceCode,
        name: device.name,
        model: device.model,
        storeId: device.storeId,
        storeName: device.store.name,
      },
    };
  }

  async deviceHeartbeat(deviceId: number, dto: DeviceHeartbeatDto) {
    const updateData: any = {
      status: 'online',
      lastOnlineAt: new Date(),
    };

    if (dto.appVersion) updateData.appVersion = dto.appVersion;
    if (dto.firmwareVersion) updateData.firmwareVersion = dto.firmwareVersion;
    if (dto.batteryLevel !== undefined) updateData.batteryLevel = dto.batteryLevel;
    if (dto.networkStatus) updateData.networkStatus = dto.networkStatus;

    const result = await this.prisma.terminalDevice.updateMany({
      where: { id: deviceId },
      data: updateData,
    });

    if (result.count === 0) {
      return { success: false, code: 'DEVICE_NOT_FOUND', serverTime: new Date().toISOString() };
    }

    return { success: true, serverTime: new Date().toISOString() };
  }

  async unbindDevice(deviceId: number) {
    await this.prisma.terminalDevice.update({
      where: { id: deviceId },
      data: { status: 'offline', boundAt: null },
    });

    return { success: true };
  }

  async getDeviceInfo(deviceId: number) {
    const device = await this.prisma.terminalDevice.findUnique({
      where: { id: deviceId },
      include: { store: true },
    });

    if (!device) {
      throw new NotFoundException('设备不存在');
    }

    return {
      id: device.id,
      deviceCode: device.deviceCode,
      name: device.name,
      model: device.model,
      status: device.status,
      storeId: device.storeId,
      storeName: device.store.name,
      appVersion: device.appVersion,
      firmwareVersion: device.firmwareVersion,
      batteryLevel: device.batteryLevel,
      networkStatus: device.networkStatus,
      lastOnlineAt: device.lastOnlineAt,
      boundAt: device.boundAt,
    };
  }

  async getDeviceStatus(storeId: number, deviceId: number) {
    const device = await this.prisma.terminalDevice.findFirst({
      where: { id: deviceId, storeId },
      include: { store: true },
    });
    if (!device) throw new NotFoundException('设备不存在');

    const [pendingPrintCount, failedPrintCount, latestPrintJob] = await Promise.all([
      this.prisma.printJob.count({ where: { storeId, status: { in: ['queued', 'pending', 'printing'] } } }),
      this.prisma.printJob.count({ where: { storeId, status: 'failed' } }),
      this.prisma.printJob.findFirst({ where: { storeId }, orderBy: { createdAt: 'desc' } }),
    ]);
    const networkStatus = device.networkStatus || 'online';
    const printerStatus = failedPrintCount > 0 ? 'warning' : pendingPrintCount > 0 ? 'printing' : 'online';

    return {
      device: {
        id: device.id,
        name: device.name,
        model: device.model,
        storeId: device.storeId,
        storeName: device.store.name,
        status: device.status,
        appVersion: device.appVersion,
        firmwareVersion: device.firmwareVersion,
        batteryLevel: device.batteryLevel ?? 100,
        networkStatus,
        lastOnlineAt: this.toIso(device.lastOnlineAt),
      },
      peripherals: {
        network: {
          status: networkStatus,
          label: networkStatus === 'online' ? '网络正常' : networkStatus === 'unstable' ? '网络不稳定' : '网络离线',
          checkedAt: new Date().toISOString(),
        },
        printer: {
          status: printerStatus,
          label: failedPrintCount > 0 ? '有失败打印任务' : pendingPrintCount > 0 ? '打印队列处理中' : '打印机正常',
          pendingCount: pendingPrintCount,
          failedCount: failedPrintCount,
          latestJobId: latestPrintJob?.id,
        },
        scanner: {
          status: 'online',
          label: '扫码器正常',
        },
        camera: {
          status: 'online',
          label: '摄像头正常',
        },
      },
      serverTime: new Date().toISOString(),
    };
  }

  async getConfig() {
    return {
      version: '1.0.0',
      featureFlags: {
        skinTest: true,
        cardVerification: true,
        serviceConsumption: true,
        recommendationFeedback: true,
      },
      uploadLimits: {
        maxImageCount: 6,
        maxImageSizeMb: 8,
      },
      skinMetricKeys: ['moisture', 'oil', 'elasticity', 'sensitivity'],
      displayCopy: {
        welcomeTitle: '欢迎使用 Ami Aura Lite',
        serviceCompleteTitle: '服务已完成',
      },
    };
  }

  private getAuraRoleConfig(user: any, requestedRole?: string) {
    const roleKeys = new Set((user?.roles ?? []).map((item: any) => item.role?.key).filter(Boolean));
    const availableRoles = roleKeys.has('super_admin') || roleKeys.has('store_manager')
      ? ['manager', 'reception', 'beautician']
      : roleKeys.has('beautician')
        ? ['beautician']
        : ['reception'];
    const currentRole = requestedRole && availableRoles.includes(requestedRole) ? requestedRole : availableRoles[0] ?? 'reception';
    const actionMap: Record<string, string[]> = {
      manager: ['manager.dashboard', 'manager.staff', 'manager.customers', 'manager.inventory', 'reception.appointments', 'operation.cashier'],
      reception: [
        'reception.appointments',
        'operation.verify',
        'operation.register',
        'operation.cashier',
        'operation.card',
        'operation.recharge',
        'operation.print',
      ],
      beautician: ['beautician.schedule', 'beautician.customer', 'beautician.record', 'beautician.advice', 'operation.service-complete'],
    };
    const labelMap: Record<string, string> = {
      manager: '店长',
      reception: '前台',
      beautician: '美容师',
      'manager.dashboard': '经营',
      'manager.staff': '员工',
      'manager.customers': '客户增长',
      'manager.inventory': '库存',
      'reception.appointments': '预约',
      'operation.verify': '核销',
      'operation.register': '登记',
      'operation.cashier': '收银',
      'operation.card': '办卡',
      'operation.recharge': '充值',
      'operation.print': '打印',
      'operation.service-complete': '完成服务',
      'beautician.schedule': '我的预约',
      'beautician.customer': '客户档案',
      'beautician.record': '服务记录',
      'beautician.advice': '护理建议',
    };
    const iconMap: Record<string, string> = {
      'manager.dashboard': 'BarChart3',
      'manager.staff': 'Users',
      'manager.customers': 'Sparkles',
      'manager.inventory': 'PackageCheck',
      'reception.appointments': 'CalendarCheck',
      'operation.verify': 'CheckSquare',
      'operation.register': 'UserPlus',
      'operation.cashier': 'CreditCard',
      'operation.card': 'Wallet',
      'operation.recharge': 'Wallet',
      'operation.print': 'Printer',
      'operation.service-complete': 'CheckSquare',
      'beautician.schedule': 'CalendarCheck',
      'beautician.customer': 'Users',
      'beautician.record': 'FileText',
      'beautician.advice': 'HeartPulse',
    };
    const subtitles: Record<string, string> = {
      manager: '先看经营、风险和员工，再处理门店协同',
      reception: '围绕接待、预约、核销和收银快速处理',
      beautician: '只看自己的排班、客户和服务动作',
    };
    const permissions: Record<string, string[]> = {
      manager: [
        'aura:manager:view',
        'aura:customer:read',
        'aura:appointment:read',
        'aura:appointment:write',
        'aura:card:consume',
        'aura:cashier:create',
        'aura:card-order:create',
        'aura:recharge:create',
        'aura:inventory:read',
        'aura:staff:read',
      ],
      reception: [
        'aura:reception:view',
        'aura:customer:read',
        'aura:appointment:read',
        'aura:appointment:write',
        'aura:card:consume',
        'aura:cashier:create',
        'aura:card-order:create',
        'aura:recharge:create',
      ],
      beautician: ['aura:beautician:view', 'aura:customer:read', 'aura:appointment:read', 'aura:service-record:create'],
    };
    const availableActions = actionMap[currentRole];
    const roleDefinition = {
      role: currentRole,
      title: labelMap[currentRole],
      subtitle: subtitles[currentRole],
      quickActions: availableActions.map((action) => ({
        action,
        label: labelMap[action],
        icon: iconMap[action],
      })),
      availableActions,
    };

    return {
      currentRole,
      availableRoles,
      availableActions,
      quickActions: roleDefinition.quickActions,
      roleDefinition,
      permissions: permissions[currentRole],
      dataScopes: {
        store: 'own_store',
        customer: currentRole === 'beautician' ? 'served_customers' : 'own_store',
        order: currentRole === 'beautician' ? 'served_customers' : 'own_store',
        booking: currentRole === 'beautician' ? 'self' : 'own_store',
        inventory: currentRole === 'beautician' ? 'none' : 'own_store',
        report: currentRole === 'manager' ? 'own_store' : 'self',
        device: currentRole === 'beautician' ? 'current_device' : 'own_store',
      },
    };
  }

  async getBootstrap(storeId: number, userId?: number, requestedRole?: string) {
    const [store, stores, user, beauticians, projects, cards, products, config] = await Promise.all([
      this.getStore(storeId),
      this.prisma.store.findMany({ where: { deletedAt: null, status: 'active' }, orderBy: { id: 'asc' } }),
      userId
        ? this.prisma.user.findUnique({
            where: { id: userId },
            include: { roles: { include: { role: true } }, stores: true },
          })
        : Promise.resolve(null),
      this.prisma.beautician.findMany({ where: { storeId, status: 'active' }, include: { level: true }, take: 50 }),
      this.prisma.project.findMany({ where: { storeId, deletedAt: null, status: 'active' }, include: { type: true }, take: 80 }),
      this.prisma.card.findMany({ where: { status: 'active' }, take: 80 }),
      this.prisma.product.findMany({ where: { storeId, deletedAt: null, status: 'active' }, include: { category: true }, take: 120 }),
      this.getConfig(),
    ]);
    const role = this.getAuraRoleConfig(user, requestedRole);
    const storeDtos = stores.map((item) => ({
      id: item.id,
      name: item.name,
      address: item.address ?? '',
      skuCount: 0,
      totalValue: 0,
      healthScore: 100,
      mode: '独立',
    }));
    const currentUser = user
      ? {
          id: user.id,
          username: user.username,
          name: user.name,
          phone: user.phone ?? '',
          email: user.email ?? undefined,
          roles: user.roles.map((item) => item.role.key),
          permissions: [...new Set(user.roles.flatMap((item) => item.role.permissions))],
          storeIds: user.stores.map((item) => item.storeId),
        }
      : null;

    return {
      currentUser,
      currentStore: storeDtos.find((item) => item.id === storeId) ?? null,
      availableStores: storeDtos,
      ...role,
      store: storeDtos.find((item) => item.id === storeId) ?? null,
      stores: storeDtos,
      beauticians: beauticians.map((item) => ({
        id: item.id,
        name: item.name,
        phone: item.phone ?? '',
        level: item.level?.name ?? '美容师',
        specialties: ['面部护理', '身体护理'],
        status: item.status === 'active' ? '在职' : item.status,
        storeName: store.name,
        joinDate: item.createdAt.toISOString().slice(0, 10),
        createdAt: item.createdAt.toISOString(),
      })),
      projects: projects.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type?.name ?? '基础护理',
        duration: item.duration,
        price: this.toNumber(item.price),
        storeName: store.name,
        recommend: true,
        online: true,
        home: false,
        status: item.status === 'active',
        sort: item.id,
      })),
      cards: cards.map((item) => ({
        id: item.id,
        name: item.name,
        type: '次卡',
        totalTimes: item.totalTimes,
        price: this.toNumber(item.price),
        validDays: 365,
        storeName: store.name,
        status: item.status === 'active' ? '上架' : '下架',
        createdAt: item.createdAt.toISOString(),
        projects: Array.isArray(item.projects)
          ? (item.projects as any[]).map((project) => ({
              projectName: project.projectName ?? project.name ?? '护理项目',
              timesPerCard: project.timesPerCard ?? 1,
            }))
          : [],
      })),
      products: products.map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        brand: item.brand ?? '',
        spec: item.spec ?? '',
        unit: item.unit ?? '件',
        costPrice: this.toNumber(item.costPrice),
        retailPrice: this.toNumber(item.retailPrice),
        shelfLife: item.shelfLife ?? 0,
        categoryId: item.categoryId ?? 0,
        categoryName: item.category?.name ?? '默认分类',
        supplier: item.supplier ?? '',
        minPurchaseQty: item.minPurchaseQty,
        status: item.status === 'active' ? '在售' : '停售',
      })),
      config,
      catalogVersion: `catalog-${storeId}-${Date.now()}`,
    };
  }

  async getCatalogSync(storeId: number, since?: string) {
    const bootstrap = await this.getBootstrap(storeId);
    return {
      since,
      catalogVersion: bootstrap.catalogVersion,
      projects: bootstrap.projects,
      cards: bootstrap.cards,
      products: bootstrap.products,
      beauticians: bootstrap.beauticians,
      config: bootstrap.config,
    };
  }

  // ─── Customer Operations ────────────────────────────────────────────────────

  async searchCustomers(storeId: number, keyword: string) {
    const customers = await this.prisma.customer.findMany({
      where: {
        storeId,
        deletedAt: null,
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { phone: { contains: keyword } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        gender: true,
        memberLevel: true,
        lastVisitDate: true,
        visitCount: true,
      },
      take: 20,
      orderBy: { lastVisitDate: 'desc' },
    });

    return customers;
  }

  async quickCreateCustomer(storeId: number, dto: QuickCreateCustomerDto) {
    const customer = await this.prisma.customer.create({
      data: {
        storeId,
        name: dto.name,
        phone: dto.phone,
        gender: dto.gender,
        birthday: dto.birthday ? new Date(dto.birthday) : undefined,
        memberLevel: dto.memberLevel,
        skinCondition: dto.skinCondition,
        tags: dto.tags ?? [],
        remark: dto.remark,
        source: dto.source ?? 'terminal',
      },
    });

    return customer;
  }

  async getCustomerSummary(customerId: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        healthProfile: true,
        customerCards: {
          where: { status: 'active' },
          include: { card: true },
        },
      },
    });

    if (!customer || customer.deletedAt) {
      throw new NotFoundException('客户不存在');
    }

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      gender: customer.gender,
      memberLevel: customer.memberLevel,
      totalSpent: customer.totalSpent,
      visitCount: customer.visitCount,
      lastVisitDate: customer.lastVisitDate,
      skinType: customer.healthProfile?.skinType || customer.skinType,
      skinStatus: customer.healthProfile?.skinStatus,
      activeCards: customer.customerCards.map((cc) => ({
        id: cc.id,
        cardName: cc.cardName,
        remainingTimes: cc.remainingTimes,
        totalTimes: cc.totalTimes,
        expiryDate: cc.expiryDate,
      })),
      tags: customer.tags,
    };
  }

  async getCustomerHealthProfile(customerId: number) {
    const profile = await this.prisma.customerHealthProfile.findUnique({
      where: { customerId },
      include: { customer: { select: { name: true } } },
    });

    if (!profile) return undefined;

    return {
      id: profile.id,
      customerId: profile.customerId,
      name: profile.customer?.name ?? '',
      skinType: profile.skinType,
      skinStatus: profile.skinStatus ?? '',
      mainProblems: profile.mainProblems ?? '',
      allergyHistory: profile.allergyHistory ?? undefined,
      goals: profile.goals ?? undefined,
      recommendedCare: profile.recommendedCare ?? undefined,
      instrument: profile.instrument ?? undefined,
      lastCheck: profile.lastCheck.toISOString().slice(0, 10),
    };
  }

  async updateCustomerHealthProfile(customerId: number, dto: UpdateTerminalCustomerHealthProfileDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || customer.deletedAt) throw new NotFoundException('客户不存在');

    const profile = await this.prisma.customerHealthProfile.upsert({
      where: { customerId },
      update: {
        skinType: dto.skinType,
        skinStatus: dto.skinStatus,
        mainProblems: dto.mainProblems,
        allergyHistory: dto.allergyHistory,
        goals: dto.goals,
        recommendedCare: dto.recommendedCare,
        instrument: dto.instrument,
        lastCheck: new Date(),
      },
      create: {
        customerId,
        skinType: dto.skinType ?? customer.skinType ?? customer.skinCondition ?? '待检测',
        skinStatus: dto.skinStatus,
        mainProblems: dto.mainProblems,
        allergyHistory: dto.allergyHistory,
        goals: dto.goals,
        recommendedCare: dto.recommendedCare,
        instrument: dto.instrument,
      },
      include: { customer: { select: { name: true } } },
    });

    return {
      id: profile.id,
      customerId: profile.customerId,
      name: profile.customer?.name ?? customer.name,
      skinType: profile.skinType,
      skinStatus: profile.skinStatus ?? '',
      mainProblems: profile.mainProblems ?? '',
      allergyHistory: profile.allergyHistory ?? undefined,
      goals: profile.goals ?? undefined,
      recommendedCare: profile.recommendedCare ?? undefined,
      instrument: profile.instrument ?? undefined,
      lastCheck: profile.lastCheck.toISOString().slice(0, 10),
    };
  }

  async getCustomerConsumptionRecords(customerId: number, query: any) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const where = { customerId };
    const [items, total] = await Promise.all([
      this.prisma.consumptionRecord.findMany({
        where,
        orderBy: { consumeTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { customer: { select: { name: true, store: { select: { name: true } } } } },
      }),
      this.prisma.consumptionRecord.count({ where }),
    ]);

    const data = items.map((item) => ({
      id: item.id,
      customerId: item.customerId,
      userName: item.customer?.name ?? '',
      storeName: item.customer?.store?.name ?? '',
      consumeType: item.consumeType,
      consumeContent: item.consumeContent,
      payMethod: item.payMethod,
      amount: `￥${this.toNumber(item.amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      campaign: item.campaign ?? '',
      consumeTime: item.consumeTime.toISOString().replace('T', ' ').slice(0, 16),
    }));

    return { items: data, data, total, page, pageSize };
  }

  async getCustomerBehaviorProfile(customerId: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        productOrders: { orderBy: { createdAt: 'desc' }, take: 20 },
        cardUsageRecords: { orderBy: { verifiedAt: 'desc' }, take: 20 },
        reservations: { include: { project: { select: { name: true } } }, orderBy: { date: 'desc' }, take: 10 },
        customerCards: { where: { status: 'active' }, take: 5 },
      },
    });
    if (!customer || customer.deletedAt) throw new NotFoundException('客户不存在');

    const orderTotal = customer.productOrders.reduce((total, order) => total + this.toNumber(order.totalAmount), 0);
    const avgSpend = customer.productOrders.length ? Math.round(orderTotal / customer.productOrders.length) : 0;
    const preferredService = customer.cardUsageRecords[0]?.projectName ?? customer.reservations[0]?.project?.name ?? '待识别';

    return {
      customerId,
      name: customer.name,
      segment: customer.totalSpent && this.toNumber(customer.totalSpent) >= 5000 ? '高价值客户' : customer.memberLevel,
      skinType: customer.skinType ?? customer.skinCondition ?? '待检测',
      visitFrequency: customer.visitCount > 0 ? `累计到店 ${customer.visitCount} 次` : '暂无到店记录',
      avgSpend: `￥${avgSpend.toLocaleString()}`,
      preferredService,
      promotionSensitivity: customer.productOrders.length >= 3 ? '中等' : '待观察',
      repurchaseRate: customer.customerCards?.length ? '较高' : '待培养',
      loyalty: customer.memberLevel ?? '普通客户',
      seasonalTrend: '需结合后续订单持续观察',
    };
  }

  async getCustomerCards(customerId: number) {
    const cards = await this.prisma.customerCard.findMany({
      where: { customerId, status: 'active' },
      include: { card: true },
      orderBy: { expiryDate: 'asc' },
    });

    return cards.map((item) => ({
      id: item.id,
      customerId: item.customerId,
      cardId: item.cardId,
      cardName: item.cardName,
      totalTimes: item.totalTimes,
      remainingTimes: item.remainingTimes,
      expiryDate: item.expiryDate.toISOString(),
      applicableProjects: Array.isArray(item.card.projects)
        ? (item.card.projects as any[]).map((project) => project.projectName ?? project.name ?? '护理项目')
        : [],
      status: item.remainingTimes <= 0 ? 'used_up' : item.expiryDate < new Date() ? 'expired' : 'active',
    }));
  }

  async getCustomerRecommendations(customerId: number) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('客户不存在');
    const projects = await this.prisma.project.findMany({
      where: { storeId: customer.storeId, deletedAt: null, status: 'active' },
      take: 3,
      orderBy: { id: 'asc' },
    });
    return projects.map((project, index) => ({
      id: project.id,
      customerId,
      type: 'project',
      title: project.name,
      reason: index === 0 ? '结合客户最近到店和肤质信息，优先推荐该护理项目。' : '可作为后续复购或加项建议。',
      targetId: project.id,
      confidence: 0.82 - index * 0.08,
      payload: { price: this.toNumber(project.price), duration: project.duration },
    }));
  }

  async getCustomerNextBestActions(storeId: number, customerId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, storeId, deletedAt: null },
      include: {
        reservations: { include: { project: { select: { name: true } } }, orderBy: { date: 'desc' }, take: 3 },
        productOrders: { orderBy: { createdAt: 'desc' }, take: 3 },
        cardUsageRecords: { orderBy: { verifiedAt: 'desc' }, take: 3 },
      },
    });
    if (!customer) throw new NotFoundException('客户不存在');

    const recommendations = await this.getCustomerRecommendations(customerId);
    const latestReservation = customer.reservations?.[0];
    const latestOrder = customer.productOrders?.[0];
    const latestUsage = customer.cardUsageRecords?.[0];
    const actions: any[] = recommendations.slice(0, 2).map((item, index) => ({
      id: `recommendation-${item.id}`,
      type: 'recommend_project',
      title: item.title,
      reason: item.reason,
      priority: index === 0 ? 'high' : 'medium',
      actionLabel: '推荐给客户',
      payload: item,
    }));

    if (!latestReservation || !['pending', 'confirmed'].includes(latestReservation.status)) {
      actions.push({
        id: 'follow-up-reservation',
        type: 'create_follow_up',
        title: '安排邀约跟进',
        reason: latestUsage
          ? `上次核销 ${latestUsage.projectName} 后可回访护理效果`
          : '客户近期没有待到店预约，建议前台做一次轻量邀约',
        priority: 'medium',
        actionLabel: '创建跟进任务',
        payload: { customerId, preferredProjectName: latestReservation?.project?.name },
      });
    }

    if (latestOrder) {
      actions.push({
        id: 'post-order-care',
        type: 'service_care',
        title: '消费后护理提醒',
        reason: `最近消费金额 ￥${this.toNumber(latestOrder.totalAmount).toLocaleString('zh-CN')}，可结合项目做护理建议`,
        priority: 'low',
        actionLabel: '生成护理话术',
        payload: { orderId: latestOrder.id },
      });
    }

    return {
      customerId,
      customerName: customer.name,
      generatedAt: new Date().toISOString(),
      actions,
    };
  }

  // ─── Service Tasks ──────────────────────────────────────────────────────────

  async listTasks(storeId: number, deviceId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const terminalDeviceId = this.toTerminalDeviceId(deviceId);

    const tasks = await this.prisma.serviceTask.findMany({
      where: {
        storeId,
        OR: [
          ...(terminalDeviceId ? [{ deviceId: terminalDeviceId }] : []),
          { status: { in: ['pending', 'in_progress'] } },
        ],
        appointmentTime: { gte: today, lt: tomorrow },
      },
      include: { project: true },
      orderBy: { appointmentTime: 'asc' },
    });

    return Promise.all(tasks.map((task) => this.mapServiceTask(task)));
  }

  async getTaskById(taskId: number) {
    const task = await this.prisma.serviceTask.findUnique({
      where: { id: taskId },
      include: { project: true },
    });
    if (!task) throw new NotFoundException('任务不存在');
    return this.mapServiceTask(task);
  }

  async createTask(storeId: number, deviceId: number, dto: CreateServiceTaskDto) {
    // 生成任务编号
    const taskNo = `T${Date.now().toString(36).toUpperCase()}`;
    const terminalDeviceId = this.toTerminalDeviceId(deviceId);

    const task = await this.prisma.serviceTask.create({
      data: {
        taskNo,
        storeId,
        deviceId: terminalDeviceId,
        customerId: dto.customerId,
        projectId: dto.projectId,
        beauticianId: dto.beauticianId,
        appointmentTime: dto.appointmentTime
          ? new Date(dto.appointmentTime)
          : new Date(),
        duration: dto.duration || 60,
        remark: dto.remark,
        status: 'pending',
      },
      include: { project: true },
    });

    return this.mapServiceTask(task);
  }

  async startTask(taskId: number, deviceId: number) {
    const terminalDeviceId = this.toTerminalDeviceId(deviceId);
    const task = await this.prisma.serviceTask.findUnique({
      where: { id: taskId },
    });

    if (!task) throw new NotFoundException('任务不存在');
    if (task.status !== 'pending') {
      throw new BadRequestException('只有待处理的任务可以开始');
    }

    const updated = await this.prisma.serviceTask.update({
      where: { id: taskId },
      data: {
        status: 'in_progress',
        startedAt: new Date(),
        deviceId: terminalDeviceId,
      },
      include: { project: true },
    });
    return this.mapServiceTask(updated);
  }

  async completeTask(taskId: number, dto?: any) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const task = await tx.serviceTask.findUnique({
        where: { id: taskId },
      });

      if (!task) throw new NotFoundException('任务不存在');
      if (task.status !== 'in_progress') {
        throw new BadRequestException('只有进行中的任务可以完成');
      }

      const consumptionItems = Array.isArray(dto?.consumptionItems) ? dto.consumptionItems : [];
      const completedTask = await tx.serviceTask.update({
        where: { id: taskId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          ...(dto?.beauticianId ? { beauticianId: dto.beauticianId } : {}),
          ...(dto?.remark ? { remark: dto.remark } : {}),
          ...(dto?.consumptionItems ? { consumptionItems: dto.consumptionItems } : {}),
          ...(dto?.images ? { images: dto.images } : {}),
        },
        include: { project: true },
      });

      for (const item of consumptionItems) {
        await this.createStockMovementForItem(tx, task.storeId, item, 'service_consume', {
          type: 'service_task',
          id: task.id,
          no: task.taskNo,
          remark: dto?.remark,
        });
      }

      return completedTask;
    });
    return this.mapServiceTask(updated);
  }

  async cancelTask(taskId: number, reason?: string) {
    const task = await this.prisma.serviceTask.findUnique({
      where: { id: taskId },
    });

    if (!task) throw new NotFoundException('任务不存在');
    if (task.status === 'completed') {
      throw new BadRequestException('已完成的任务不能取消');
    }

    const updated = await this.prisma.serviceTask.update({
      where: { id: taskId },
      data: { status: 'cancelled', ...(reason ? { remark: reason } : {}) },
      include: { project: true },
    });
    return this.mapServiceTask(updated);
  }

  async getServiceRecord(taskId: number) {
    const task = await this.prisma.serviceTask.findUnique({
      where: { id: taskId },
      include: { project: true },
    });
    if (!task) throw new NotFoundException('服务任务不存在');
    const customer = await this.prisma.customer.findUnique({ where: { id: task.customerId } });
    const mappedTask = await this.mapServiceTask(task);
    const record = await this.prisma.consumptionRecord.findFirst({
      where: {
        customerId: task.customerId,
        consumeType: '服务记录',
        consumeTime: {
          gte: task.startedAt ?? task.appointmentTime,
        },
      },
      orderBy: { consumeTime: 'desc' },
    });
    return {
      task: mappedTask,
      customerName: customer?.name ?? mappedTask.customerName,
      result: task.remark ?? record?.campaign ?? '',
      images: task.images ?? [],
      consumptionItems: (task.consumptionItems as any[]) ?? [],
      record: record
        ? {
            id: record.id,
            consumeContent: record.consumeContent,
            note: record.campaign,
            createdAt: record.consumeTime.toISOString(),
          }
        : undefined,
    };
  }

  async createServiceRecord(storeId: number, dto: CreateTerminalServiceRecordDto) {
    const consumptionItems = Array.isArray(dto.consumptionItems) ? dto.consumptionItems : [];
    const note = [dto.result, dto.customerFeedback, dto.nextSuggestion, dto.remark].filter(Boolean).join('\n');
    const result = await this.prisma.$transaction(async (tx) => {
      const existingTask = dto.taskId
        ? await tx.serviceTask.findFirst({ where: { id: dto.taskId, storeId } })
        : null;
      const customerId = existingTask?.customerId ?? dto.customerId;
      const projectId = existingTask?.projectId ?? dto.projectId;
      if (!customerId) throw new BadRequestException('服务记录必须选择客户');
      if (!projectId) throw new BadRequestException('服务记录必须选择项目');

      const task = existingTask
        ? await tx.serviceTask.update({
            where: { id: existingTask.id },
            data: {
              status: 'completed',
              startedAt: existingTask.startedAt ?? new Date(),
              completedAt: new Date(),
              beauticianId: dto.beauticianId ?? existingTask.beauticianId,
              remark: note || existingTask.remark,
              consumptionItems: consumptionItems as any,
              images: dto.images ?? existingTask.images,
            },
            include: { project: true },
          })
        : await tx.serviceTask.create({
            data: {
              taskNo: this.createSequenceNo('T'),
              storeId,
              customerId,
              projectId,
              beauticianId: dto.beauticianId,
              appointmentTime: new Date(),
              duration: 60,
              status: 'completed',
              startedAt: new Date(),
              completedAt: new Date(),
              remark: note,
              consumptionItems: consumptionItems as any,
              images: dto.images ?? [],
            },
            include: { project: true },
          });

      for (const item of consumptionItems) {
        await this.createStockMovementForItem(tx, storeId, item, 'service_consume', {
          type: 'service_record',
          id: task.id,
          no: task.taskNo,
          remark: note,
        });
      }

      const consumptionRecord = await tx.consumptionRecord.create({
        data: {
          customerId,
          consumeType: '服务记录',
          consumeContent: JSON.stringify({
            taskId: task.id,
            projectId,
            result: dto.result,
            customerFeedback: dto.customerFeedback,
            nextSuggestion: dto.nextSuggestion,
            nextReservationSuggestion: dto.nextReservationSuggestion,
            consumptionItems,
          }),
          payMethod: 'service',
          amount: 0,
          campaign: note || dto.nextReservationSuggestion,
        },
      });

      return { task, consumptionRecord };
    });

    return {
      task: await this.mapServiceTask(result.task),
      serviceRecord: {
        id: result.consumptionRecord.id,
        customerId: result.consumptionRecord.customerId,
        consumeContent: result.consumptionRecord.consumeContent,
        note: result.consumptionRecord.campaign,
        createdAt: result.consumptionRecord.consumeTime.toISOString(),
      },
      nextActions: [
        ...(dto.transferToCashier ? ['transfer_cashier'] : []),
        ...(dto.nextReservationSuggestion ? ['create_next_reservation'] : []),
      ],
    };
  }

  async updateServiceRecord(storeId: number, taskId: number, dto: CreateTerminalServiceRecordDto) {
    const task = await this.prisma.serviceTask.findFirst({ where: { id: taskId, storeId } });
    if (!task) throw new NotFoundException('服务任务不存在');
    return this.createServiceRecord(storeId, {
      ...dto,
      taskId,
      customerId: dto.customerId ?? task.customerId,
      projectId: dto.projectId ?? task.projectId,
      beauticianId: dto.beauticianId ?? task.beauticianId ?? undefined,
    });
  }

  async transferTaskToCashier(taskId: number, remark?: string) {
    const task = await this.prisma.serviceTask.findUnique({
      where: { id: taskId },
      include: { project: true, customer: true, store: true },
    });
    if (!task) throw new NotFoundException('服务任务不存在');
    return {
      taskId: task.id,
      customerId: task.customerId,
      customerName: task.customer.name,
      customerPhone: task.customer.phone,
      storeId: task.storeId,
      storeName: task.store.name,
      items: [
        {
          itemType: 'project',
          itemId: task.projectId,
          name: task.project.name,
          quantity: 1,
          unitPrice: this.toNumber(task.project.price),
          subtotal: this.toNumber(task.project.price),
        },
      ],
      remark: remark ?? `服务任务 ${task.taskNo} 转前台收银`,
    };
  }

  // ─── Card Verification ──────────────────────────────────────────────────────

  async verifyCard(dto: VerifyCardDto) {
    const customerCard = await this.prisma.customerCard.findUnique({
      where: { id: dto.customerCardId },
      include: { card: true },
    });

    if (!customerCard) {
      throw new NotFoundException('卡项不存在');
    }

    if (dto.customerId && customerCard.customerId !== dto.customerId) {
      throw new BadRequestException('卡项不属于该客户');
    }

    if (customerCard.status !== 'active') {
      return { valid: false, reason: '卡项已停用' };
    }

    if (customerCard.expiryDate < new Date()) {
      return { valid: false, reason: '卡项已过期' };
    }

    if (customerCard.remainingTimes <= 0) {
      return { valid: false, reason: '卡项次数已用完' };
    }

    // 如果指定了项目，检查卡项是否包含该项目
    if (dto.projectId && customerCard.card.projects) {
      const projects = customerCard.card.projects as any[];
      const projectIncluded = projects.some(
        (p: any) => p.projectId === dto.projectId || p.id === dto.projectId,
      );
      if (!projectIncluded) {
        return { valid: false, reason: '该卡项不包含此项目' };
      }
    }

    return {
      valid: true,
      cardName: customerCard.cardName,
      remainingTimes: customerCard.remainingTimes,
      totalTimes: customerCard.totalTimes,
      expiryDate: customerCard.expiryDate,
    };
  }

  async consumeCard(dto: ConsumeCardDto, deviceId: number) {
    const terminalDeviceId = this.toTerminalDeviceId(deviceId);
    const beauticianId = dto.beauticianId && dto.beauticianId > 0 ? dto.beauticianId : undefined;
    const customerCard = await this.prisma.customerCard.findUnique({
      where: { id: dto.customerCardId },
      include: { card: true, customer: true },
    });

    if (!customerCard) {
      throw new NotFoundException('卡项不存在');
    }

    const customerId = dto.customerId ?? customerCard.customerId;

    if (dto.customerId && customerCard.customerId !== dto.customerId) {
      throw new BadRequestException('卡项不属于该客户');
    }

    if (customerCard.status !== 'active' || customerCard.expiryDate < new Date()) {
      throw new BadRequestException('卡项不可用');
    }

    const times = dto.times || 1;
    if (customerCard.remainingTimes < times) {
      throw new BadRequestException('剩余次数不足');
    }

    // 获取项目名称
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });

    // 扣减次数
    const updatedCard = await this.prisma.customerCard.update({
      where: { id: dto.customerCardId },
      data: { remainingTimes: customerCard.remainingTimes - times },
    });

    // 记录核销
    const record = await this.prisma.cardUsageRecord.create({
      data: {
        customerId,
        customerName: customerCard.customer.name,
        cardName: customerCard.cardName,
        projectName: project?.name || '未知项目',
        times,
        remainingTimes: updatedCard.remainingTimes,
        beauticianId,
        deviceId: terminalDeviceId,
      },
    });

    return {
      id: record.id,
      customerId,
      customerName: customerCard.customer.name,
      cardName: customerCard.cardName,
      projectName: project?.name || '未知项目',
      times,
      remainingTimes: updatedCard.remainingTimes,
      beauticianId,
      deviceId: terminalDeviceId,
      verifiedAt: record.verifiedAt,
    };
  }

  // ─── Cashier ────────────────────────────────────────────────────────────────

  async checkout(storeId: number, dto: CheckoutDto) {
    const subtotalAmount = dto.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const discountAmount = Math.min(subtotalAmount, Math.max(0, this.toNumber(dto.discountAmount)));
    const totalAmount = Math.max(0, subtotalAmount - discountAmount);
    const paymentMethod = this.getPaymentMethod(dto.payMethod);
    const store = await this.getStore(storeId);
    const normalizedItems = this.normalizeOrderItems(dto.items as any[]);
    const result = await this.prisma.$transaction(async (tx) => {
      const orderNo = `PO${Date.now().toString(36).toUpperCase()}`;
      const customer = dto.customerId ? await tx.customer.findUnique({ where: { id: dto.customerId } }) : null;
      if (paymentMethod === 'member_balance' && !customer) {
        throw new BadRequestException('会员余额支付必须选择客户');
      }
      const order = await tx.productOrder.create({
        data: {
          orderNo,
          customerId: dto.customerId,
          customerName: customer?.name,
          storeId,
          totalAmount,
          payMethod: paymentMethod,
          status: 'completed',
          items: dto.items as any,
          remark: dto.remark,
        },
      });

      for (const item of dto.items as any[]) {
        if (item.itemType === 'product' || item.productId) {
          await this.createStockMovementForItem(tx, storeId, item, 'sale_out', {
            type: 'product_order',
            id: order.id,
            no: order.orderNo,
            remark: dto.remark,
          });
        }
      }

      if (customer) {
        await tx.customer.update({
          where: { id: dto.customerId! },
          data: {
            totalSpent: { increment: totalAmount },
            visitCount: { increment: 1 },
            lastVisitDate: new Date(),
          },
        });

        if (paymentMethod === 'member_balance') {
          await this.writeBalanceTransaction(tx, storeId, {
            customerId: dto.customerId!,
            type: 'consume',
            amount: totalAmount,
            orderId: order.id,
            paymentMethod,
            remark: dto.remark ?? '终端收银余额支付',
          });
        }

        await tx.consumptionRecord.create({
          data: {
            customerId: dto.customerId!,
            consumeType: '消费',
            consumeContent: normalizedItems.map((i) => `${i.itemType}#${i.itemId ?? ''}x${i.quantity}`).join(', '),
            payMethod: paymentMethod,
            amount: totalAmount,
          },
        });
      }

      return { order, customer };
    });
    const orderItems = await this.createOrderItems(this.prisma, result.order.id, dto.items as any[]);
    await this.createPaymentRecord(this.prisma, result.order.id, paymentMethod, totalAmount);
    await this.applyMarketingAttribution(this.prisma, result.order, totalAmount);
    const responseItems = orderItems.length ? orderItems : normalizedItems;

    return {
      id: result.order.id,
      orderNo: result.order.orderNo,
      customerId: dto.customerId,
      customerName: result.customer?.name ?? '',
      customerPhone: result.customer?.phone ?? '',
      storeId,
      storeName: store.name,
      items: responseItems.map((item) => ({
        itemType: item.itemType,
        itemId: item.itemId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      })),
      totalAmount,
      status: 'completed',
      paymentMethod,
      createdAt: result.order.createdAt.toISOString(),
      paidAt: result.order.createdAt.toISOString(),
      completedAt: result.order.updatedAt.toISOString(),
      remark: result.order.remark ?? undefined,
    };
  }

  async completePayment(orderId: number, dto: any) {
    const amount = this.toNumber(dto.paidAmount ?? dto.amount);
    const order = await this.prisma.productOrder.update({
      where: { id: orderId },
      data: {
        status: 'completed',
        payMethod: this.getPaymentMethod(dto.paymentMethod),
      },
    });
    const paidAmount = amount || this.toNumber(order.totalAmount);
    await this.createPaymentRecord(this.prisma, order.id, dto.paymentMethod ?? order.payMethod, paidAmount, dto.transactionNo);
    await this.applyMarketingAttribution(this.prisma, order, paidAmount);
    const store = order.storeId ? await this.getStore(order.storeId) : null;
    return {
      id: order.id,
      orderNo: order.orderNo,
      customerId: order.customerId ?? undefined,
      customerName: order.customerName ?? '',
      customerPhone: '',
      storeId: order.storeId ?? 0,
      storeName: store?.name ?? '当前门店',
      items: (order.items as any[]) ?? [],
      totalAmount: this.toNumber(dto.paidAmount ?? order.totalAmount),
      status: 'completed',
      paymentMethod: order.payMethod ?? dto.paymentMethod,
      createdAt: order.createdAt.toISOString(),
      paidAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      remark: order.remark ?? undefined,
    };
  }

  async getPaymentMethods() {
    return [
      { key: 'wechat', name: '微信支付' },
      { key: 'alipay', name: '支付宝' },
      { key: 'cash', name: '现金' },
      { key: 'card', name: '银行卡' },
      { key: 'member_balance', name: '会员余额' },
      { key: 'customer_card', name: '次卡抵扣' },
    ];
  }

  async createCardOrder(storeId: number, dto: CreateCardOrderDto) {
    const [store, customer, card] = await Promise.all([
      this.getStore(storeId),
      dto.customerId ? this.prisma.customer.findUnique({ where: { id: dto.customerId } }) : Promise.resolve(null),
      this.prisma.card.findUnique({ where: { id: dto.cardId } }),
    ]);
    if (!card) throw new NotFoundException('卡项不存在');
    const expireTime = new Date();
    expireTime.setDate(expireTime.getDate() + 365);
    const originalAmount = this.toNumber(card.price);
    const discountAmount = Math.min(originalAmount, Math.max(0, this.toNumber(dto.discountAmount)));
    const amount = Math.max(0, this.toNumber(dto.amount ?? originalAmount - discountAmount));
    const totalTimes = dto.totalTimes ?? card.totalTimes;
    const giftProjects = Array.isArray(dto.giftProjects) ? dto.giftProjects : [];
    const result = await this.prisma.$transaction(async (tx) => {
      const customerCard = dto.customerId
        ? await tx.customerCard.create({
            data: {
              customerId: dto.customerId,
              cardId: card.id,
              cardName: dto.cardName ?? card.name,
              totalTimes,
              remainingTimes: totalTimes,
              expiryDate: expireTime,
              status: 'active',
            },
          })
        : null;

      const orderNo = `CO${Date.now().toString(36).toUpperCase()}`;
      const order = await tx.productOrder.create({
        data: {
          orderNo,
          customerId: dto.customerId,
          customerName: customer?.name ?? dto.customerName,
          storeId,
          totalAmount: amount,
          payMethod: this.getPaymentMethod(dto.paymentMethod),
          status: 'completed',
          items: [{ itemType: 'card', itemId: card.id, quantity: 1, unitPrice: amount, discountAmount, giftProjects }],
          remark: `办卡：${card.name}`,
        },
      });

      if (dto.customerId) {
        await tx.customer.update({
          where: { id: dto.customerId },
          data: {
            totalSpent: { increment: amount },
            visitCount: { increment: 1 },
            lastVisitDate: new Date(),
          },
        });
      }
      return { customerCard, order };
    });
    await this.createOrderItems(this.prisma, result.order.id, [
      {
        itemType: 'card',
        itemId: card.id,
        name: card.name,
        quantity: 1,
        unitPrice: amount,
        subtotal: amount,
        discount: discountAmount,
        giftProjects,
      },
    ]);
    await this.createPaymentRecord(this.prisma, result.order.id, dto.paymentMethod, amount, dto.transactionNo);
    await this.applyMarketingAttribution(this.prisma, result.order, amount);

    return {
      id: result.customerCard?.id ?? result.order.id,
      orderNo: result.order.orderNo,
      customerId: dto.customerId,
      customerName: customer?.name ?? dto.customerName,
      customerPhone: customer?.phone ?? dto.customerPhone ?? '',
      cardId: card.id,
      cardName: card.name,
      storeId,
      storeName: store.name,
      amount,
      discountAmount,
      giftProjects,
      totalTimes,
      remainingTimes: totalTimes,
      status: 'active',
      purchaseTime: new Date().toISOString(),
      expireTime: expireTime.toISOString(),
      paymentMethod: dto.paymentMethod,
    };
  }

  async createRechargeOrder(storeId: number, dto: CreateRechargeOrderDto) {
    const [store, customer] = await Promise.all([
      this.getStore(storeId),
      dto.customerId ? this.prisma.customer.findUnique({ where: { id: dto.customerId } }) : Promise.resolve(null),
    ]);
    if (!dto.customerId || !customer) throw new BadRequestException('充值必须选择有效客户');

    const amount = this.toNumber(dto.amount);
    const giftAmount = this.toNumber(dto.giftAmount ?? dto.discountAmount);
    const giftProjects = Array.isArray(dto.giftProjects) ? dto.giftProjects : [];
    const result = await this.prisma.$transaction(async (tx) => {
      const orderNo = `RO${Date.now().toString(36).toUpperCase()}`;
      const created = await tx.productOrder.create({
        data: {
          orderNo,
          customerId: dto.customerId,
          customerName: customer?.name ?? dto.customerName,
          storeId,
          totalAmount: amount,
          payMethod: this.getPaymentMethod(dto.paymentMethod),
          status: 'completed',
          items: [{ itemType: 'recharge', quantity: 1, unitPrice: amount, giftAmount, giftProjects }],
          remark: dto.remark ?? '会员充值',
        },
      });

      await tx.customer.update({
        where: { id: dto.customerId },
        data: {
          totalSpent: { increment: amount },
          visitCount: { increment: 1 },
          lastVisitDate: new Date(),
        },
      });
      await tx.consumptionRecord.create({
        data: {
          customerId: dto.customerId!,
          consumeType: '充值',
          consumeContent: `充值 ${amount}，赠送 ${giftAmount}${giftProjects.length ? `，赠送项目：${giftProjects.join('、')}` : ''}`,
          payMethod: this.getPaymentMethod(dto.paymentMethod),
          amount,
          campaign: dto.remark,
        },
      });

      const account = await tx.customerBalanceAccount.upsert({
        where: { customerId_storeId: { customerId: dto.customerId!, storeId } },
        update: {},
        create: {
          customerId: dto.customerId!,
          storeId,
          cashBalance: 0,
          giftBalance: 0,
          status: 'active',
        },
      });
      const cashBalanceBefore = this.toNumber(account.cashBalance);
      const giftBalanceBefore = this.toNumber(account.giftBalance);
      const cashBalanceAfter = cashBalanceBefore + amount;
      const giftBalanceAfter = giftBalanceBefore + giftAmount;
      const updatedAccount = await tx.customerBalanceAccount.update({
        where: { id: account.id },
        data: {
          cashBalance: cashBalanceAfter,
          giftBalance: giftBalanceAfter,
          status: 'active',
        },
      });
      const balanceTransaction = await tx.customerBalanceTransaction.create({
        data: {
          accountId: account.id,
          customerId: dto.customerId!,
          storeId,
          orderId: created.id,
          transactionNo: this.createSequenceNo('BAL'),
          type: 'recharge',
          amount,
          giftAmount,
          cashBalanceBefore,
          cashBalanceAfter,
          giftBalanceBefore,
          giftBalanceAfter,
          paymentMethod: this.getPaymentMethod(dto.paymentMethod),
          remark: dto.remark,
        },
      });

      return { order: created, balanceAccount: updatedAccount, balanceTransaction };
    });
    await this.createOrderItems(this.prisma, result.order.id, [
      { itemType: 'recharge', name: '会员充值', quantity: 1, unitPrice: amount, giftAmount, giftProjects },
    ]);
    await this.createPaymentRecord(this.prisma, result.order.id, dto.paymentMethod, amount, dto.transactionNo);
    await this.applyMarketingAttribution(this.prisma, result.order, amount);
    return {
      id: result.order.id,
      orderNo: result.order.orderNo,
      customerId: dto.customerId,
      customerName: customer?.name ?? dto.customerName,
      customerPhone: customer?.phone ?? dto.customerPhone ?? '',
      storeId,
      storeName: store.name,
      amount,
      giftAmount,
      giftProjects,
      cashBalance: this.toNumber(result.balanceAccount.cashBalance),
      giftBalance: this.toNumber(result.balanceAccount.giftBalance),
      balanceTransactionId: result.balanceTransaction.id,
      status: 'paid',
      paymentMethod: dto.paymentMethod,
      createdAt: result.order.createdAt.toISOString(),
      remark: dto.remark,
    };
  }

  async getCustomerBalance(storeId: number, customerId: number) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, storeId } });
    if (!customer) throw new NotFoundException('客户不存在');
    const account = await this.getOrCreateBalanceAccount(this.prisma, storeId, customerId);
    const lastTransaction = await this.prisma.customerBalanceTransaction.findFirst({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' },
    });
    return this.mapBalanceAccount(account, customer, lastTransaction);
  }

  async consumeBalance(storeId: number, dto: ConsumeBalanceDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, storeId } });
    if (!customer) throw new NotFoundException('客户不存在');
    const result = await this.prisma.$transaction((tx) =>
      this.writeBalanceTransaction(tx, storeId, {
        customerId: dto.customerId,
        type: 'consume',
        amount: this.toNumber(dto.amount),
        giftAmount: this.toNumber(dto.giftAmount),
        orderId: dto.orderId,
        paymentMethod: dto.paymentMethod ?? 'member_balance',
        remark: dto.remark,
      }),
    );
    return this.mapBalanceAccount(result.account, customer, result.transaction);
  }

  async refundBalance(storeId: number, dto: RefundBalanceDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, storeId } });
    if (!customer) throw new NotFoundException('客户不存在');
    const result = await this.prisma.$transaction((tx) =>
      this.writeBalanceTransaction(tx, storeId, {
        customerId: dto.customerId,
        type: 'refund',
        amount: this.toNumber(dto.amount),
        giftAmount: this.toNumber(dto.giftAmount),
        orderId: dto.orderId,
        paymentMethod: 'member_balance',
        remark: dto.remark,
      }),
    );
    return this.mapBalanceAccount(result.account, customer, result.transaction);
  }

  async adjustBalance(storeId: number, dto: AdjustBalanceDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, storeId } });
    if (!customer) throw new NotFoundException('客户不存在');
    const cashDelta = this.toNumber(dto.cashDelta);
    const giftDelta = this.toNumber(dto.giftDelta);
    if (cashDelta === 0 && giftDelta === 0) throw new BadRequestException('调整金额不能为 0');
    const result = await this.prisma.$transaction((tx) =>
      this.writeBalanceTransaction(tx, storeId, {
        customerId: dto.customerId,
        type: 'adjust',
        amount: cashDelta,
        giftAmount: giftDelta,
        paymentMethod: 'adjust',
        remark: dto.remark,
      }),
    );
    return this.mapBalanceAccount(result.account, customer, result.transaction);
  }

  async createPrintJob(storeId: number, dto: any) {
    const store = await this.getStore(storeId);
    const job = await this.prisma.printJob.create({
      data: {
        storeId,
        jobNo: this.createSequenceNo('PJ'),
        sourceType: dto.sourceType ?? 'custom',
        sourceId: dto.sourceId ? Number(dto.sourceId) : undefined,
        title: dto.title ?? 'Ami Aura Lite 小票',
        content: dto.content ?? '',
        copies: Number(dto.copies ?? 1),
        status: dto.status ?? 'queued',
        completedAt: ['completed'].includes(dto.status) ? new Date() : undefined,
      },
    });
    return this.mapPrintJob(storeId, job, store.name);
  }

  async listPrintJobs(storeId: number, query: any = {}) {
    const page = Number(query.page ?? 1);
    const pageSize = Math.min(Number(query.pageSize ?? 20), 100);
    const where: any = { storeId };
    if (query.sourceType) where.sourceType = String(query.sourceType);
    if (query.sourceId) where.sourceId = Number(query.sourceId);
    if (query.status) where.status = String(query.status);
    const [store, items, total] = await Promise.all([
      this.getStore(storeId),
      this.prisma.printJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.printJob.count({ where }),
    ]);
    return {
      items: await Promise.all(items.map((job) => this.mapPrintJob(storeId, job, store.name))),
      total,
      page,
      pageSize,
    };
  }

  async getPrintJob(storeId: number, id: number) {
    const job = await this.prisma.printJob.findFirst({ where: { id, storeId } });
    if (!job) throw new NotFoundException('打印任务不存在');
    return this.mapPrintJob(storeId, job);
  }

  async retryPrintJob(storeId: number, id: number) {
    const job = await this.prisma.printJob.findFirst({ where: { id, storeId } });
    if (!job) throw new NotFoundException('打印任务不存在');
    const updated = await this.prisma.printJob.update({
      where: { id },
      data: {
        status: 'queued',
        errorMessage: null,
        completedAt: null,
      },
    });
    return this.mapPrintJob(storeId, updated);
  }

  async updatePrintJobStatus(storeId: number, id: number, dto: any) {
    const nextStatus = String(dto.status ?? '');
    if (!['queued', 'pending', 'printing', 'completed', 'failed'].includes(nextStatus)) {
      throw new BadRequestException('打印状态无效');
    }
    const job = await this.prisma.printJob.findFirst({ where: { id, storeId } });
    if (!job) throw new NotFoundException('打印任务不存在');
    const updated = await this.prisma.printJob.update({
      where: { id },
      data: {
        status: nextStatus,
        errorMessage: dto.errorMessage ?? null,
        completedAt: nextStatus === 'completed' ? new Date() : nextStatus === 'failed' ? null : job.completedAt,
      },
    });
    return this.mapPrintJob(storeId, updated);
  }

  async getCardUsageRecords(query: any) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const where: any = {};
    if (query.customerId) where.customerId = Number(query.customerId);
    if (query.cardName) where.cardName = { contains: query.cardName, mode: 'insensitive' };
    if (query.projectName) where.projectName = { contains: query.projectName, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      this.prisma.cardUsageRecord.findMany({
        where,
        orderBy: { verifiedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.cardUsageRecord.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  // ─── Skin Test ──────────────────────────────────────────────────────────────

  async createSkinTest(deviceId: number, dto: CreateSkinTestDto) {
    const terminalDeviceId = this.toTerminalDeviceId(deviceId);
    const skinTest = await this.prisma.skinTest.create({
      data: {
        customerId: dto.customerId,
        taskId: dto.taskId,
        deviceId: terminalDeviceId,
        images: dto.images || [],
        metrics: dto.metrics as any,
        skinType: dto.skinType,
        skinStatus: dto.skinStatus,
        mainProblems: dto.mainProblems,
        recommendationText: dto.recommendationText,
      },
    });

    // 同步更新客户健康档案的肤质信息
    await this.prisma.customerHealthProfile.upsert({
      where: { customerId: dto.customerId },
      update: {
        skinType: dto.skinType,
        skinStatus: dto.skinStatus,
        mainProblems: dto.mainProblems,
        lastCheck: new Date(),
      },
      create: {
        customerId: dto.customerId,
        skinType: dto.skinType,
        skinStatus: dto.skinStatus,
        mainProblems: dto.mainProblems,
      },
    });

    return skinTest;
  }

  async getSkinTestHistory(customerId: number) {
    const tests = await this.prisma.skinTest.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return tests;
  }

  async getSkinTests(customerId?: number) {
    return this.prisma.skinTest.findMany({
      where: customerId ? { customerId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getSkinTestById(id: number) {
    const skinTest = await this.prisma.skinTest.findUnique({ where: { id } });
    if (!skinTest) throw new NotFoundException('皮肤检测记录不存在');
    return skinTest;
  }

  async bindSkinTestCustomer(id: number, customerId: number) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('客户不存在');
    return this.prisma.skinTest.update({ where: { id }, data: { customerId } });
  }

  async getSkinTestRecommendations(id: number) {
    const skinTest = await this.getSkinTestById(id);
    if (!skinTest.customerId) return [];
    return [
      {
        id,
        customerId: skinTest.customerId,
        type: 'script',
        title: '护理建议',
        reason: skinTest.recommendationText || `当前肤质：${skinTest.skinType}，建议结合检测结果安排护理。`,
        confidence: 0.86,
        payload: {
          skinType: skinTest.skinType,
          mainProblems: skinTest.mainProblems,
        },
      },
    ];
  }

  // ─── Reservations ───────────────────────────────────────────────────────────

  async getTodayReservations(storeId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const reservations = await this.prisma.reservation.findMany({
      where: {
        storeId,
        date: { gte: today, lt: tomorrow },
        status: { not: 'cancelled' },
      },
      orderBy: { startTime: 'asc' },
    });

    return Promise.all(reservations.map((reservation) => this.mapReservation(reservation)));
  }

  async getReservationAvailability(storeId: number, query: ReservationAvailabilityQueryDto) {
    const baseDate = query.date ? new Date(query.date) : new Date();
    if (Number.isNaN(baseDate.getTime())) throw new BadRequestException('查询日期无效');
    baseDate.setHours(0, 0, 0, 0);
    const tomorrow = new Date(baseDate);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const project = query.projectId
      ? await this.prisma.project.findFirst({ where: { id: query.projectId, storeId, deletedAt: null } })
      : null;
    const duration = Number(query.duration || project?.duration || 60);
    const [beauticians, reservations, schedules] = await Promise.all([
      this.prisma.beautician.findMany({
        where: {
          storeId,
          status: 'active',
          ...(query.beauticianId ? { id: query.beauticianId } : {}),
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: {
          storeId,
          date: { gte: baseDate, lt: tomorrow },
          status: { notIn: ['cancelled', 'no_show'] },
          ...(query.beauticianId ? { beauticianId: query.beauticianId } : {}),
        },
      }),
      this.prisma.schedule.findMany({
        where: {
          storeId,
          date: { gte: baseDate, lt: tomorrow },
          status: 'available',
          ...(query.beauticianId ? { beauticianId: query.beauticianId } : {}),
        },
      }),
    ]);
    const toMinutes = (time?: string | null) => {
      const [hour, minute] = String(time || '00:00').split(':').map((item) => Number(item));
      return hour * 60 + (minute || 0);
    };
    const toTime = (minutes: number) =>
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const byBeautician = beauticians.map((beautician) => {
      const beauticianSchedules = schedules.filter((item) => item.beauticianId === beautician.id);
      const windows = beauticianSchedules.length
        ? beauticianSchedules.map((item) => ({ start: toMinutes(item.startTime), end: toMinutes(item.endTime) }))
        : [{ start: 10 * 60, end: 20 * 60 }];
      const occupied = reservations
        .filter((item) => item.beauticianId === beautician.id)
        .map((item) => ({ start: toMinutes(item.startTime), end: toMinutes(item.endTime) || toMinutes(item.startTime) + duration }));
      const slots = windows.flatMap((window) => {
        const result: Array<{ time: string; available: boolean; reason?: string }> = [];
        for (let cursor = window.start; cursor + duration <= window.end; cursor += 30) {
          const conflict = occupied.some((item) => cursor < item.end && cursor + duration > item.start);
          result.push({ time: toTime(cursor), available: !conflict, reason: conflict ? '该时段已有预约' : undefined });
        }
        return result;
      });
      return {
        beauticianId: beautician.id,
        beauticianName: beautician.name,
        slots,
      };
    });

    return {
      storeId,
      date: this.toIso(baseDate).slice(0, 10),
      projectId: project?.id ?? query.projectId,
      projectName: project?.name,
      duration,
      items: byBeautician,
    };
  }

  async createReservation(storeId: number, dto: CreateReservationDto) {
    const appointment = new Date(dto.appointmentTime);
    if (Number.isNaN(appointment.getTime())) {
      throw new BadRequestException('预约时间无效');
    }
    const customer = dto.customerId
      ? await this.prisma.customer.findUnique({ where: { id: dto.customerId } })
      : await this.prisma.customer.create({
          data: {
            storeId,
            name: dto.customerName || '新客户',
            phone: dto.customerPhone || '',
            gender: '女',
            source: 'terminal',
          },
        });
    if (!customer) throw new NotFoundException('客户不存在');
    const project = dto.projectId
      ? await this.prisma.project.findUnique({ where: { id: dto.projectId } })
      : dto.projectName
        ? await this.prisma.project.findFirst({ where: { storeId, name: { contains: dto.projectName }, deletedAt: null } })
        : await this.prisma.project.findFirst({ where: { storeId, deletedAt: null, status: 'active' } });
    if (!project) throw new BadRequestException('当前门店没有可预约项目');
    const beautician = dto.beauticianId
      ? await this.prisma.beautician.findFirst({ where: { id: dto.beauticianId, storeId } })
      : dto.beauticianName
        ? await this.prisma.beautician.findFirst({ where: { storeId, name: { contains: dto.beauticianName }, status: 'active' } })
        : null;
    const startTime = appointment.toTimeString().slice(0, 5);
    const end = new Date(appointment);
    end.setMinutes(end.getMinutes() + (dto.duration ?? project.duration ?? 60));
    const reservation = await this.prisma.reservation.create({
      data: {
        storeId,
        customerId: customer.id,
        projectId: project.id,
        beauticianId: beautician?.id ?? dto.beauticianId,
        date: appointment,
        startTime,
        endTime: end.toTimeString().slice(0, 5),
        status: 'pending',
        remark: dto.remark,
      },
    });
    return this.mapReservation(reservation);
  }

  async updateReservation(reservationId: number, dto: UpdateReservationDto) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) throw new NotFoundException('预约不存在');
    const updateData: any = {};
    let selectedProject: { id: number; duration?: number | null } | null = null;
    if (dto.status) updateData.status = dto.status;
    if (dto.beauticianId !== undefined) updateData.beauticianId = dto.beauticianId;
    if (dto.remark !== undefined) updateData.remark = dto.remark;
    if (dto.projectId !== undefined) {
      updateData.projectId = Number(dto.projectId);
      selectedProject = await this.prisma.project.findFirst({
        where: { id: updateData.projectId, storeId: reservation.storeId, deletedAt: null },
        select: { id: true, duration: true },
      });
      if (!selectedProject) throw new BadRequestException('RESERVATION_PROJECT_NOT_FOUND');
    } else if (dto.projectName) {
      const project = await this.prisma.project.findFirst({
        where: { storeId: reservation.storeId, name: { contains: dto.projectName }, deletedAt: null },
        select: { id: true, duration: true },
      });
      if (project) {
        selectedProject = project;
        updateData.projectId = project.id;
      }
    }
    if (dto.beauticianName && dto.beauticianId === undefined) {
      const beautician = await this.prisma.beautician.findFirst({
        where: { storeId: reservation.storeId, name: { contains: dto.beauticianName } },
      });
      if (beautician) updateData.beauticianId = beautician.id;
    }
    if (dto.appointmentTime || dto.duration !== undefined || selectedProject) {
      const appointment = dto.appointmentTime
        ? new Date(dto.appointmentTime)
        : new Date(`${this.toLocalDateText(reservation.date)}T${reservation.startTime || '00:00'}:00`);
      if (Number.isNaN(appointment.getTime())) throw new BadRequestException('预约时间无效');
      const duration = Number(dto.duration || selectedProject?.duration || 60);
      updateData.date = appointment;
      updateData.startTime = appointment.toTimeString().slice(0, 5);
      const end = new Date(appointment);
      end.setMinutes(end.getMinutes() + duration);
      updateData.endTime = end.toTimeString().slice(0, 5);
    }
    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: updateData,
    });
    return this.mapReservation(updated);
  }

  async rescheduleReservation(reservationId: number, dto: RescheduleReservationDto) {
    const updated = await this.updateReservation(reservationId, {
      appointmentTime: dto.appointmentTime,
      duration: dto.duration,
      beauticianId: dto.beauticianId,
      remark: dto.reason ? `改期原因：${dto.reason}` : undefined,
    });
    return { ...updated, rescheduleReason: dto.reason };
  }

  async markReservationNoShow(reservationId: number, reason?: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) throw new NotFoundException('预约不存在');
    if (['completed', 'cancelled'].includes(reservation.status)) {
      throw new BadRequestException('当前预约状态不能标记爽约');
    }
    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'no_show', remark: reason || reservation.remark },
    });
    return this.mapReservation(updated);
  }

  async createTaskFromReservation(reservationId: number, deviceId?: number) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) throw new NotFoundException('预约不存在');
    if (['cancelled', 'no_show'].includes(reservation.status)) {
      throw new BadRequestException('已取消或爽约的预约不能创建服务任务');
    }
    const appointmentTime = new Date(`${this.toLocalDateText(reservation.date)}T${reservation.startTime || '00:00'}:00`);
    const existing = await this.prisma.serviceTask.findFirst({
      where: {
        storeId: reservation.storeId,
        customerId: reservation.customerId,
        projectId: reservation.projectId,
        beauticianId: reservation.beauticianId,
        appointmentTime,
        status: { not: 'cancelled' },
      },
      include: { project: true },
    });
    if (existing) return this.mapServiceTask(existing);

    const project = await this.prisma.project.findUnique({ where: { id: reservation.projectId } });
    const task = await this.prisma.serviceTask.create({
      data: {
        taskNo: this.createSequenceNo('T'),
        storeId: reservation.storeId,
        deviceId: this.toTerminalDeviceId(deviceId),
        customerId: reservation.customerId,
        projectId: reservation.projectId,
        beauticianId: reservation.beauticianId,
        appointmentTime,
        duration: project?.duration ?? 60,
        status: 'pending',
        remark: `由预约 R${String(reservation.id).padStart(6, '0')} 到店创建`,
      },
      include: { project: true },
    });
    return this.mapServiceTask(task);
  }

  async confirmReservation(reservationId: number) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) throw new NotFoundException('预约不存在');
    if (!['pending', 'confirmed'].includes(reservation.status)) {
      throw new BadRequestException('当前预约状态不能确认');
    }
    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'confirmed' },
    });
    return this.mapReservation(updated);
  }

  async checkInReservation(reservationId: number, deviceId?: number) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    if (!['pending', 'confirmed'].includes(reservation.status)) {
      throw new BadRequestException('Reservation status cannot be checked in');
    }

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'checked_in',
        checkedInAt: new Date(),
      },
    });
    const [mapped, serviceTask] = await Promise.all([
      this.mapReservation(updated),
      this.createTaskFromReservation(reservationId, deviceId).catch(() => null),
    ]);
    return { ...mapped, serviceTask: serviceTask ?? undefined };
  }

  async cancelReservation(reservationId: number, reason?: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) throw new NotFoundException('预约不存在');
    if (['completed', 'cancelled'].includes(reservation.status)) {
      throw new BadRequestException('当前预约状态不能取消');
    }
    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'cancelled', remark: reason || reservation.remark },
    });
    return this.mapReservation(updated);
  }

  // Dashboard ──────────────────────────────────────────────────────────────

  async getInventoryStock(storeId: number, query: any) {
    const productIds =
      typeof query.productIds === 'string'
        ? query.productIds
            .split(',')
            .map((id: string) => Number(id))
            .filter(Boolean)
        : undefined;
    const store = await this.getStore(storeId);
    const products = await this.prisma.product.findMany({
      where: {
        storeId,
        deletedAt: null,
        ...(productIds?.length ? { id: { in: productIds } } : {}),
      },
      orderBy: { currentStock: 'asc' },
      take: 100,
    });
    return products.map((item) => {
      const currentStock = this.toNumber(item.currentStock);
      const safetyStock = this.toNumber(item.safetyStock);
      return {
        id: item.id,
        productName: item.name,
        sku: item.sku,
        currentStock,
        reserved: 0,
        availableStock: currentStock,
        safetyStock,
        maxStock: Math.max(safetyStock * 3, currentStock),
        status: currentStock <= 0 ? '缺货' : currentStock < safetyStock ? '低库存' : '正常',
        lastInboundDate: item.updatedAt.toISOString(),
        storeName: store.name,
      };
    });
  }

  async getInventoryAlerts(storeId: number) {
    const store = await this.getStore(storeId);
    const now = new Date();
    const alertBefore = new Date(now);
    alertBefore.setDate(alertBefore.getDate() + 30);

    const [products, batches] = await Promise.all([
      this.prisma.product.findMany({
        where: { storeId, deletedAt: null },
        orderBy: { currentStock: 'asc' },
        take: 200,
      }),
      this.prisma.stockBatch.findMany({
        where: {
          product: { storeId, deletedAt: null },
          stock: { gt: 0 },
          expiryDate: { not: null, lte: alertBefore },
        },
        include: { product: true },
        orderBy: { expiryDate: 'asc' },
        take: 50,
      }),
    ]);

    const lowStock = products
      .filter((item) => this.toNumber(item.currentStock) <= this.toNumber(item.safetyStock))
      .map((item) => ({
        id: item.id,
        productName: item.name,
        name: item.name,
        sku: item.sku,
        currentStock: this.toNumber(item.currentStock),
        reserved: 0,
        availableStock: this.toNumber(item.currentStock),
        safetyStock: this.toNumber(item.safetyStock),
        maxStock: Math.max(this.toNumber(item.safetyStock) * 3, this.toNumber(item.currentStock)),
        minStock: this.toNumber(item.safetyStock),
        status: this.toNumber(item.currentStock) <= 0 ? '缺货' : '低库存',
        lastInboundDate: item.updatedAt.toISOString(),
        storeName: store.name,
      }));

    const expiring = batches.map((batch) => ({
      id: batch.id,
      urgency: batch.expiryDate && batch.expiryDate < now ? '已过期' : '临期',
      productName: batch.product.name,
      sku: batch.product.sku,
      batchNo: batch.batchNo,
      remainingDays: batch.expiryDate ? Math.ceil((batch.expiryDate.getTime() - now.getTime()) / 86400000) : 0,
      stock: this.toNumber(batch.stock),
      costAmount: this.toNumber(batch.stock) * this.toNumber(batch.product.costPrice),
      storeName: store.name,
      suggestion: batch.expiryDate && batch.expiryDate < now ? '报废' : '促销',
    }));

    const replenishment = lowStock.map((item) => ({
      id: item.id,
      productName: item.productName,
      sku: item.sku,
      currentStock: item.currentStock,
      forecast7Days: Math.max(item.safetyStock, 1),
      safetyStock: item.safetyStock,
      inTransit: 0,
      suggestedQty: Math.max(item.safetyStock * 2 - item.currentStock, item.safetyStock || 1),
      supplier: '默认供应商',
      estimatedAmount: Math.max(item.safetyStock * 2 - item.currentStock, item.safetyStock || 1) * 20,
      checked: false,
    }));

    return {
      lowStock,
      expiring,
      replenishment,
      summary: `当前有 ${lowStock.length} 项低库存，${expiring.length} 批临期库存。`,
      generatedAt: new Date().toISOString(),
      storeName: store.name,
    };
  }

  async getProjectBom(projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { bomItems: { include: { product: true } } },
    });
    if (!project) throw new NotFoundException('Project not found');
    return {
      projectId: project.id,
      projectName: project.name,
      items: project.bomItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        sku: item.product.sku,
        standardQty: this.toNumber(item.standardQty),
        unit: item.unit,
      })),
    };
  }

  async createConsumptionRecord(dto: any, storeId?: number) {
    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.consumptionRecord.create({
        data: {
          customerId: dto.customerId,
          consumeType: '服务消耗',
          consumeContent: JSON.stringify(dto.items ?? []),
          payMethod: 'service',
          amount: 0,
          campaign: dto.remark,
        },
      });

      if (storeId && Array.isArray(dto.items)) {
        for (const item of dto.items) {
          await this.createStockMovementForItem(tx, storeId, item, 'service_consume', {
            type: 'consumption_record',
            id: created.id,
            remark: dto.remark,
          });
        }
      }

      return created;
    });
    return { ...dto, id: record.id, createdAt: record.consumeTime.toISOString() };
  }

  async recordRecommendationEvent(storeId: number, deviceId: number | undefined, dto: any) {
    if (!dto.customerId) throw new BadRequestException('customerId is required');
    const terminalDeviceId = this.toTerminalDeviceId(deviceId);
    const event = await this.prisma.recommendationEvent.create({
      data: {
        storeId,
        customerId: Number(dto.customerId),
        deviceId: terminalDeviceId,
        recommendationId: dto.recommendationId ? Number(dto.recommendationId) : undefined,
        eventType: dto.eventType ?? dto.type ?? 'feedback',
        taskId: dto.taskId ? Number(dto.taskId) : undefined,
        orderId: dto.orderId ? Number(dto.orderId) : undefined,
        note: dto.note ?? dto.remark,
        payload: dto,
      },
    });
    return { ...event, createdAt: event.createdAt.toISOString() };
  }

  async createFollowUpTask(storeId: number, deviceId: number | undefined, dto: any) {
    if (!dto.customerId) throw new BadRequestException('customerId is required');
    const customer = await this.prisma.customer.findFirst({
      where: { id: Number(dto.customerId), storeId, deletedAt: null },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    const terminalDeviceId = this.toTerminalDeviceId(deviceId);
    const event = await this.prisma.recommendationEvent.create({
      data: {
        storeId,
        customerId: customer.id,
        deviceId: terminalDeviceId,
        recommendationId: dto.recommendationId ? Number(dto.recommendationId) : undefined,
        eventType: 'follow_up_created',
        taskId: dto.taskId ? Number(dto.taskId) : undefined,
        orderId: dto.orderId ? Number(dto.orderId) : undefined,
        note: dto.script ?? dto.note ?? dto.remark ?? '终端创建客户邀约跟进',
        payload: {
          ...dto,
          status: 'pending',
          source: 'aura_lite_terminal',
          dueAt: dto.dueAt,
          channel: dto.channel ?? 'phone',
        },
      },
    });
    return {
      id: event.id,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      status: 'pending',
      channel: dto.channel ?? 'phone',
      script: dto.script ?? dto.note ?? '',
      dueAt: dto.dueAt,
      createdAt: event.createdAt.toISOString(),
    };
  }

  async completeFollowUpTask(storeId: number, id: number, dto: any) {
    const existing = await this.prisma.recommendationEvent.findFirst({
      where: { id, storeId, eventType: 'follow_up_created' },
    });
    if (!existing) throw new NotFoundException('跟进任务不存在');
    const event = await this.prisma.recommendationEvent.create({
      data: {
        storeId,
        customerId: existing.customerId,
        deviceId: existing.deviceId,
        recommendationId: existing.recommendationId,
        eventType: 'follow_up_completed',
        taskId: existing.taskId,
        orderId: dto.orderId ? Number(dto.orderId) : existing.orderId,
        note: dto.result ?? dto.note ?? '终端完成客户邀约跟进',
        payload: {
          ...dto,
          sourceFollowUpTaskId: existing.id,
          status: 'completed',
          completedAt: new Date().toISOString(),
        },
      },
    });
    return {
      id: existing.id,
      completionEventId: event.id,
      customerId: existing.customerId,
      status: 'completed',
      result: dto.result ?? dto.note ?? '',
      completedAt: event.createdAt.toISOString(),
    };
  }

  async getPromotions(storeId?: number, query: any = {}) {
    const now = new Date();
    const promotions = await this.prisma.promotion.findMany({
      where: {
        status: 'active',
        OR: [{ storeId: null }, ...(storeId ? [{ storeId }] : [])],
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
          query.projectId ? { applicableProjectIds: { has: Number(query.projectId) } } : {},
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (promotions.length) {
      return promotions.map((promotion) => ({
        id: promotion.id,
        name: promotion.name,
        description: promotion.description ?? '',
        discountText: promotion.discountText,
        validUntil: promotion.endAt?.toISOString(),
        applicableProjectIds: promotion.applicableProjectIds,
      }));
    }

    return [
      {
        id: 1,
        name: '会员护理权益',
        description: '适用于到店护理客户的会员专属权益。',
        discountText: '到店咨询',
        validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
        applicableProjectIds: [],
      },
    ];
  }

  async getDashboardStats(storeId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      todayOrders,
      todayTasks,
      todayReservations,
      todayNewCustomers,
    ] = await Promise.all([
      // 今日营收
      this.prisma.productOrder.aggregate({
        where: {
          storeId,
          status: 'completed',
          createdAt: { gte: today, lt: tomorrow },
        },
        _sum: { totalAmount: true },
        _count: true,
      }),
      // 今日服务任务
      this.prisma.serviceTask.groupBy({
        by: ['status'],
        where: {
          storeId,
          appointmentTime: { gte: today, lt: tomorrow },
        },
        _count: true,
      }),
      // 今日预约
      this.prisma.reservation.count({
        where: {
          storeId,
          date: { gte: today, lt: tomorrow },
        },
      }),
      // 今日新客
      this.prisma.customer.count({
        where: {
          storeId,
          createdAt: { gte: today, lt: tomorrow },
        },
      }),
    ]);

    const taskStats = todayTasks.reduce(
      (acc, item) => {
        acc[item.status] = item._count;
        acc.total += item._count;
        return acc;
      },
      { total: 0, pending: 0, in_progress: 0, completed: 0, cancelled: 0 } as Record<string, number>,
    );

    return {
      revenue: {
        total: todayOrders._sum.totalAmount || 0,
        orderCount: todayOrders._count,
      },
      tasks: taskStats,
      reservations: todayReservations,
      newCustomers: todayNewCustomers,
    };
  }

  private getDaysSince(value?: Date | string | null) {
    if (!value) return 999;
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (Number.isNaN(time)) return 999;
    return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
  }

  private normalizeTerminalDashboardInsights(
    value: unknown,
    fallback: TerminalDashboardInsights,
  ): TerminalDashboardInsights {
    const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const normalizeItems = (items: unknown, fallbackItems: TerminalDashboardInsight[]) => {
      const source = Array.isArray(items) ? items : fallbackItems;
      return source
        .map((item) => {
          const current = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          const title = String(current.title ?? '').trim();
          const reason = String(current.reason ?? '').trim();
          const action = String(current.action ?? '').trim();
          if (!title || !reason || !action) return null;
          return {
            title,
            severity: String(current.severity ?? 'medium'),
            reason,
            action,
            relatedType: typeof current.relatedType === 'string' ? current.relatedType : undefined,
            relatedId:
              typeof current.relatedId === 'number' || typeof current.relatedId === 'string'
                ? current.relatedId
                : undefined,
          };
        })
        .filter(Boolean)
        .slice(0, 3) as TerminalDashboardInsight[];
    };
    return {
      risks: normalizeItems(record.risks, fallback.risks),
      suggestions: normalizeItems(record.suggestions, fallback.suggestions),
    };
  }

  private buildManagerInsightFallback(context: any): TerminalDashboardInsights {
    const dormantCustomer = context.customersAtRisk?.[0];
    const unarrivedCount = Math.max(0, Number(context.metrics?.reservationCount ?? 0) - Number(context.metrics?.arrivedReservationCount ?? 0));
    const lowStock = context.lowStock?.[0];
    const staffLoad = context.staffLoad?.[0];
    const risks: TerminalDashboardInsight[] = [];
    const suggestions: TerminalDashboardInsight[] = [];

    if (dormantCustomer) {
      risks.push({
        title: '高价值客户沉默',
        severity: dormantCustomer.daysSinceVisit >= 90 ? 'high' : 'medium',
        reason: `${dormantCustomer.name} 累计消费 ￥${Number(dormantCustomer.totalSpent).toLocaleString()}，已 ${dormantCustomer.daysSinceVisit} 天未到店，今日无预约。`,
        action: `安排顾问今天优先联系 ${dormantCustomer.name}，用最近护理记录邀约复购或预约。`,
        relatedType: 'customer',
        relatedId: dormantCustomer.id,
      });
      suggestions.push({
        title: '生成沉默客户邀约',
        severity: 'high',
        reason: `门店存在 ${context.customersAtRisk?.length ?? 0} 位高消费久未到店客户，优先处理比泛触达更有效。`,
        action: `先给 ${dormantCustomer.name} 生成一条微信/电话邀约话术，并分配前台跟进。`,
        relatedType: 'customer',
        relatedId: dormantCustomer.id,
      });
    }

    if (unarrivedCount > 0) {
      risks.push({
        title: '预约客户未到店',
        severity: unarrivedCount >= 3 ? 'high' : 'medium',
        reason: `今日预约 ${context.metrics.reservationCount} 位，已到店 ${context.metrics.arrivedReservationCount} 位，仍有 ${unarrivedCount} 位未到店。`,
        action: '前台按预约时间排序电话确认，迟到客户标记状态，避免美容师空等。',
        relatedType: 'reservation',
      });
      suggestions.push({
        title: '优先处理未到店预约',
        severity: 'medium',
        reason: '未到店预约会直接影响员工时段利用率和今日收银转化。',
        action: '将未到店名单按预约时间推给前台，先联系最近 30 分钟内的预约客户。',
        relatedType: 'reservation',
      });
    }

    if (lowStock) {
      risks.push({
        title: '项目耗材库存不足',
        severity: 'medium',
        reason: `${lowStock.name} 当前库存 ${lowStock.currentStock}，安全库存 ${lowStock.safetyStock}。`,
        action: `确认 ${lowStock.name} 是否影响今日项目交付，必要时暂停对应加项或安排补货。`,
        relatedType: 'inventory',
        relatedId: lowStock.id,
      });
    } else if (staffLoad) {
      risks.push({
        title: '员工排班需要关注',
        severity: 'low',
        reason: `${staffLoad.name} 今日有 ${staffLoad.slotCount} 个排班时段，忙碌时段 ${staffLoad.busyCount} 个。`,
        action: `检查 ${staffLoad.name} 的预约分配，避免高峰期接待压力集中。`,
        relatedType: 'staff',
        relatedId: staffLoad.id,
      });
    }

    suggestions.push({
      title: '盯紧到店转化',
      severity: 'medium',
      reason: `今日已到店 ${context.metrics.arrivedReservationCount} 位，营业额约 ￥${Number(context.metrics.revenue).toLocaleString()}。`,
      action: '店长检查已到店客户是否已完成核销/收银，避免服务完成但未开单。',
      relatedType: 'cashier',
    });

    return {
      risks: risks.slice(0, 3),
      suggestions: suggestions.slice(0, 3),
    };
  }

  private async getManagerDashboardInsights(storeId: number, context: any) {
    const cacheKey = `${storeId}:${context.metrics.customerTotal}:${context.metrics.reservationCount}:${context.metrics.arrivedReservationCount}:${context.metrics.revenue}`;
    const cached = this.managerInsightCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const fallback = this.buildManagerInsightFallback(context);
    const result = await this.aiService.generateTerminalDashboardInsights(
      { storeName: context.storeName, context, fallback },
      undefined,
      storeId,
    );
    const value = this.normalizeTerminalDashboardInsights(result.structured, fallback);
    this.managerInsightCache.set(cacheKey, { value, expiresAt: Date.now() + 5 * 60_000 });
    return value;
  }

  async getRoleDashboard(storeId: number, _requestedRole?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      store,
      customerTotal,
      activeCustomerTotal,
      orderStats,
      reservationCount,
      reservations,
      arrivedReservationCount,
      customersForInsights,
      stockProducts,
      recentOrders,
      beauticians,
      schedules,
    ] = await Promise.all([
        this.getStore(storeId),
        this.prisma.customer.count({ where: { storeId, deletedAt: null } }),
        this.prisma.customer.count({ where: { storeId, deletedAt: null, visitCount: { gt: 0 } } }),
        this.prisma.productOrder.aggregate({
          where: { storeId, status: 'completed' },
          _sum: { totalAmount: true },
          _count: true,
        }),
        this.prisma.reservation.count({
          where: {
            storeId,
            date: { gte: today, lt: tomorrow },
            status: { not: 'cancelled' },
          },
        }),
        this.prisma.reservation.findMany({
          where: {
            storeId,
            date: { gte: today, lt: tomorrow },
            status: { not: 'cancelled' },
          },
          orderBy: { startTime: 'asc' },
          take: 12,
        }),
        this.prisma.reservation.count({
          where: {
            storeId,
            date: { gte: today, lt: tomorrow },
            status: { in: ['checked_in', 'completed'] },
          },
        }),
        this.prisma.customer.findMany({
          where: { storeId, deletedAt: null },
          select: {
            id: true,
            name: true,
            phone: true,
            memberLevel: true,
            totalSpent: true,
            visitCount: true,
            lastVisitDate: true,
            tags: true,
          },
          orderBy: { totalSpent: 'desc' },
          take: 40,
        }),
        this.prisma.product.findMany({
          where: { storeId, deletedAt: null },
          select: { id: true, name: true, currentStock: true, safetyStock: true, status: true },
          orderBy: { currentStock: 'asc' },
          take: 30,
        }),
        this.prisma.productOrder.findMany({
          where: { storeId, status: 'completed' },
          select: { id: true, orderNo: true, customerName: true, totalAmount: true, createdAt: true, payMethod: true },
          orderBy: { createdAt: 'desc' },
          take: 12,
        }),
        this.prisma.beautician.findMany({
          where: { storeId, status: 'active' },
          include: { level: true },
          orderBy: { id: 'asc' },
          take: 8,
        }),
        this.prisma.schedule.findMany({
          where: { storeId, date: { gte: today, lt: tomorrow } },
          orderBy: [{ beauticianId: 'asc' }, { startTime: 'asc' }],
          take: 80,
        }),
      ]);

    const mappedReservations = await Promise.all(reservations.map((reservation) => this.mapReservation(reservation)));
    const scheduleByBeautician = new Map<number, typeof schedules>();
    schedules.forEach((slot) => {
      const list = scheduleByBeautician.get(slot.beauticianId) ?? [];
      list.push(slot);
      scheduleByBeautician.set(slot.beauticianId, list);
    });

    const staff = beauticians.map((item) => {
      const slots = scheduleByBeautician.get(item.id) ?? [];
      const fallbackSlots = slots.length
        ? slots
        : [
            { startTime: '10:00', status: 'available' },
            { startTime: '11:30', status: 'available' },
            { startTime: '14:00', status: 'available' },
            { startTime: '16:00', status: 'available' },
          ];
      const todaySlots = fallbackSlots.map((slot: any) => ({
        time: slot.startTime,
        period: slot.startTime < '12:00' ? '上午' : '下午',
        available: slot.status === 'available',
      }));
      const busyCount = todaySlots.filter((slot) => !slot.available).length;
      const utilization = todaySlots.length ? `${Math.round((busyCount / todaySlots.length) * 100)}%` : '0%';
      const beautician = {
        id: item.id,
        name: item.name,
        phone: item.phone ?? '',
        level: item.level?.name ?? '美容师',
        specialties: ['面部护理', '身体护理'],
        status: '在职',
        storeName: store.name,
        joinDate: item.createdAt.toISOString().slice(0, 10),
        createdAt: item.createdAt.toISOString(),
      };
      return {
        title: '员工当天排班',
        subtitle: store.name,
        beautician,
        todaySlots,
        utilization,
        summary: `${item.name} 今日共有 ${todaySlots.length} 个排班时段，占用率 ${utilization}。`,
      };
    });
    const revenue = this.toNumber(orderStats._sum.totalAmount);
    const reservationCustomerIds = new Set(reservations.map((reservation) => reservation.customerId));
    const customersAtRisk = customersForInsights
      .map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone ?? '',
        memberLevel: customer.memberLevel,
        totalSpent: this.toNumber(customer.totalSpent),
        visitCount: customer.visitCount,
        lastVisitDate: this.toIso(customer.lastVisitDate),
        daysSinceVisit: this.getDaysSince(customer.lastVisitDate),
        tags: customer.tags,
        hasTodayReservation: reservationCustomerIds.has(customer.id),
      }))
      .filter((customer) => !customer.hasTodayReservation && customer.totalSpent >= 1000 && customer.daysSinceVisit >= 45)
      .sort((a, b) => b.totalSpent - a.totalSpent || b.daysSinceVisit - a.daysSinceVisit)
      .slice(0, 8);
    const lowStock = stockProducts
      .map((item) => ({
        id: item.id,
        name: item.name,
        currentStock: this.toNumber(item.currentStock),
        safetyStock: this.toNumber(item.safetyStock),
        status: item.status,
      }))
      .filter((item) => item.currentStock <= item.safetyStock)
      .slice(0, 8);
    const staffLoad = staff
      .map((item) => ({
        id: item.beautician.id,
        name: item.beautician.name,
        slotCount: item.todaySlots.length,
        busyCount: item.todaySlots.filter((slot) => !slot.available).length,
        utilization: item.utilization,
      }))
      .sort((a, b) => b.busyCount - a.busyCount)
      .slice(0, 8);
    const insightContext = {
      storeName: store.name,
      metrics: {
        customerTotal,
        activeCustomerTotal,
        revenue,
        orderCount: orderStats._count,
        reservationCount,
        arrivedReservationCount,
      },
      customersAtRisk,
      todayReservations: mappedReservations.map((reservation) => ({
        id: reservation.id,
        customerName: reservation.customerName,
        projectName: reservation.projectName,
        appointmentTime: reservation.appointmentTime,
        status: reservation.status,
        checkedInAt: reservation.checkedInAt,
      })),
      lowStock,
      staffLoad,
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        customerName: order.customerName,
        totalAmount: this.toNumber(order.totalAmount),
        payMethod: order.payMethod,
        createdAt: this.toIso(order.createdAt),
      })),
    };
    const insights = await this.getManagerDashboardInsights(storeId, insightContext);

    return {
      manager: {
        title: '店长经营驾驶舱',
        subtitle: store.name,
        summary: `${store.name} 已接入 Ami_Core 数据，优先关注经营、预约、库存和员工协同。`,
        kpis: [
          { label: '客户总数', value: String(customerTotal) },
          { label: '营业额', value: `￥${revenue.toLocaleString()}` },
          { label: '预约客户', value: String(reservationCount) },
          { label: '到店客户', value: String(arrivedReservationCount) },
          { label: '活跃客户', value: String(activeCustomerTotal) },
        ],
        risks: insights.risks,
        highlights: insights.suggestions,
      },
      staff,
      reception: {
        title: '今日接待工作台',
        subtitle: store.name,
        items: mappedReservations,
        summary: reservationCount > 0 ? `当前共有 ${reservationCount} 条今日预约待处理。` : '今日暂无预约，请按需新增预约或接待散客。',
      },
    };
  }

  async createTerminalAutomationStrategy(storeId: number, userId: number | undefined, dto: CreateTerminalAutomationDto) {
    if (dto.missingFields?.length) {
      throw new BadRequestException('自动化草稿仍有缺失信息，请先补齐后再启用');
    }

    const payload = this.buildTerminalAutomationPayload(storeId, userId, dto);
    const existing = await this.prisma.marketingAutomationStrategy.findFirst({
      where: {
        description: {
          contains: `${this.getTerminalAutomationMarker(storeId)} ${this.getTerminalAutomationDraftMarker(dto.draftId)}`,
        },
      },
    });

    const strategy = existing
      ? await this.prisma.marketingAutomationStrategy.update({ where: { id: existing.id }, data: payload as any })
      : await this.prisma.marketingAutomationStrategy.create({ data: payload as any });

    return this.mapTerminalAutomationStrategy(strategy);
  }

  async previewTerminalAutomationStrategy(storeId: number, dto: CreateTerminalAutomationDto) {
    if (dto.missingFields?.length) {
      throw new BadRequestException('自动化草稿仍有缺失信息，请先补齐后再预览');
    }

    const payload = this.buildTerminalAutomationPayload(storeId, undefined, dto);
    const previewStrategy = {
      id: 0,
      ...payload,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastExecutedAt: null,
    };
    const mapped = this.mapTerminalAutomationStrategy(previewStrategy);
    const targetCount = await this.countTerminalAutomationTargets(storeId, previewStrategy);

    return {
      targetCount,
      riskLevel: mapped.riskLevel,
      requiresApproval: mapped.requiresApproval,
      trigger: mapped.trigger,
      audience: mapped.audience,
      action: mapped.action,
      frequencyCap: mapped.frequencyCap,
      message:
        targetCount > 0
          ? `预计命中 ${targetCount} 个对象，启用后会按规则生成：${mapped.action}`
          : `当前暂无命中对象，启用后仍会按“${mapped.trigger}”持续扫描。`,
    };
  }

  async runDueTerminalAutomations(storeId?: number) {
    if (this.automationScanRunning) {
      return { scannedCount: 0, executedCount: 0, skipped: true, reason: 'scan_running' };
    }

    this.automationScanRunning = true;
    try {
      const markerWhere = storeId
        ? { description: { contains: this.getTerminalAutomationMarker(storeId) } }
        : { description: { contains: '[source:aura-lite]' } };
      const strategies = await this.prisma.marketingAutomationStrategy.findMany({
        where: {
          status: 'enabled',
          ...markerWhere,
        },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });

      const now = new Date();
      const dueStrategies = strategies.filter((strategy) => this.shouldRunTerminalAutomation(strategy, now));
      const executions = [];
      for (const strategy of dueStrategies) {
        const resolvedStoreId = this.getStoreIdFromTerminalAutomation(strategy);
        if (!resolvedStoreId) continue;
        try {
          const execution = await this.executeTerminalAutomationStrategy(strategy, resolvedStoreId, { skipWhenNoTargets: true });
          if (execution) executions.push(execution);
        } catch (error) {
          executions.push(await this.createFailedTerminalAutomationExecution(strategy, error));
        }
      }

      return {
        scannedCount: strategies.length,
        dueCount: dueStrategies.length,
        executedCount: executions.length,
        executions,
        scannedAt: new Date().toISOString(),
      };
    } finally {
      this.automationScanRunning = false;
    }
  }

  async listTerminalAutomationStrategies(storeId: number) {
    const items = await this.prisma.marketingAutomationStrategy.findMany({
      where: {
        description: {
          contains: this.getTerminalAutomationMarker(storeId),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return items.map((item) => this.mapTerminalAutomationStrategy(item));
  }

  async updateTerminalAutomationStrategy(storeId: number, id: number, dto: UpdateTerminalAutomationDto) {
    const strategy = await this.prisma.marketingAutomationStrategy.findFirst({
      where: { id, description: { contains: this.getTerminalAutomationMarker(storeId) } },
    });
    if (!strategy) throw new NotFoundException('Terminal automation strategy not found');

    const current = this.mapTerminalAutomationStrategy(strategy);
    const nextDraft: CreateTerminalAutomationDto = {
      draftId: `strategy-${id}`,
      title: dto.title ?? current.title,
      summary: current.summary,
      sourceText: current.sourceText,
      trigger: dto.trigger ?? current.trigger,
      audience: dto.audience ?? current.audience,
      action: dto.action ?? current.action,
      frequencyCap: current.frequencyCap,
      riskLevel: current.riskLevel,
      requiresApproval: current.requiresApproval,
      missingFields: [],
    };
    const payload = this.buildTerminalAutomationPayload(storeId, undefined, nextDraft);
    const updated = await this.prisma.marketingAutomationStrategy.update({
      where: { id },
      data: {
        name: payload.name,
        schedule: payload.schedule,
        triggerRules: payload.triggerRules,
        actions: payload.actions,
      } as any,
    });
    return this.mapTerminalAutomationStrategy(updated);
  }

  async enableTerminalAutomationStrategy(storeId: number, id: number) {
    const strategy = await this.prisma.marketingAutomationStrategy.findFirst({
      where: { id, description: { contains: this.getTerminalAutomationMarker(storeId) } },
    });
    if (!strategy) throw new NotFoundException('Terminal automation strategy not found');
    const updated = await this.prisma.marketingAutomationStrategy.update({
      where: { id },
      data: { status: 'enabled' },
    });
    return this.mapTerminalAutomationStrategy(updated);
  }

  async pauseTerminalAutomationStrategy(storeId: number, id: number) {
    const strategy = await this.prisma.marketingAutomationStrategy.findFirst({
      where: { id, description: { contains: this.getTerminalAutomationMarker(storeId) } },
    });
    if (!strategy) throw new NotFoundException('Terminal automation strategy not found');
    const updated = await this.prisma.marketingAutomationStrategy.update({
      where: { id },
      data: { status: 'paused' },
    });
    return this.mapTerminalAutomationStrategy(updated);
  }

  async runTerminalAutomationOnce(storeId: number, id: number) {
    const strategy = await this.prisma.marketingAutomationStrategy.findFirst({
      where: { id, description: { contains: this.getTerminalAutomationMarker(storeId) } },
    });
    if (!strategy) throw new NotFoundException('Terminal automation strategy not found');
    if (strategy.status !== 'enabled') {
      throw new BadRequestException('自动化策略尚未启用，不能手动执行');
    }
    return this.executeTerminalAutomationStrategy(strategy, storeId);
  }

  async getTerminalAutomationExecutionDetail(storeId: number, id: number) {
    const marker = this.getTerminalAutomationMarker(storeId);
    const execution = await this.prisma.marketingAutomationExecution.findFirst({
      where: {
        id,
        strategy: { description: { contains: marker } },
      },
      include: {
        strategy: true,
        touches: {
          include: { customer: true, predictionSnapshot: true },
          orderBy: { touchedAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!execution) throw new NotFoundException('Terminal automation execution not found');
    const insight = this.buildTerminalAutomationExecutionInsight(execution.strategy, execution);

    return {
      id: execution.id,
      strategyId: execution.strategyId,
      strategyName: execution.strategyName,
      status: execution.status,
      triggeredCount: execution.triggeredCount,
      reachedCount: execution.reachedCount,
      channel: execution.channel,
      executedAt: execution.executedAt,
      message: execution.message,
      ...insight,
      touches: execution.touches.map((touch: any) => ({
        id: touch.id,
        customerId: touch.customerId,
        customerName: touch.customer?.name ?? '',
        customerPhone: touch.customer?.phone ?? '',
        status: touch.status,
        channel: touch.channel,
        touchedAt: touch.touchedAt,
        predictedConversionScore: touch.predictedConversionScore,
        predictedRevenue: Number(touch.predictedRevenue ?? 0),
        attributionWindowDays: touch.attributionWindowDays,
      })),
    };
  }

  async markTerminalAutomationTouchFollowedUp(storeId: number, touchId: number) {
    const marker = this.getTerminalAutomationMarker(storeId);
    const touch = await this.prisma.marketingAutomationTouch.findFirst({
      where: {
        id: touchId,
        execution: {
          strategy: { description: { contains: marker } },
        },
      },
      include: { customer: true },
    });
    if (!touch) throw new NotFoundException('Terminal automation touch not found');

    const updated = await this.prisma.marketingAutomationTouch.update({
      where: { id: touchId },
      data: {
        conversionType: 'terminal_followed_up',
        convertedAt: new Date(),
      },
      include: { customer: true },
    });

    return {
      id: updated.id,
      customerId: updated.customerId,
      customerName: updated.customer?.name ?? '',
      customerPhone: updated.customer?.phone ?? '',
      status: updated.status,
      channel: updated.channel,
      touchedAt: updated.touchedAt,
      convertedAt: updated.convertedAt,
      conversionType: updated.conversionType,
      predictedConversionScore: updated.predictedConversionScore,
      predictedRevenue: Number(updated.predictedRevenue ?? 0),
      attributionWindowDays: updated.attributionWindowDays,
    };
  }

  async getTerminalAutomationTodaySummary(storeId: number) {
    const marker = this.getTerminalAutomationMarker(storeId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [strategies, executions] = await Promise.all([
      this.prisma.marketingAutomationStrategy.findMany({
        where: { description: { contains: marker } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.marketingAutomationExecution.findMany({
        where: {
          executedAt: { gte: today },
          strategy: { description: { contains: marker } },
        },
        include: { strategy: true },
        orderBy: { executedAt: 'desc' },
        take: 50,
      }),
    ]);

    const enabledCount = strategies.filter((item) => item.status === 'enabled').length;
    const waitingApprovalCount = strategies.filter((item) => {
      const mapped = this.mapTerminalAutomationStrategy(item);
      return mapped.requiresApproval && item.status === 'draft';
    }).length;

    return {
      date: today.toISOString().slice(0, 10),
      strategyCount: strategies.length,
      enabledCount,
      waitingApprovalCount,
      executedCount: executions.length,
      successCount: executions.filter((item) => item.status === 'success').length,
      failedCount: executions.filter((item) => item.status === 'failed').length,
      latestStrategies: strategies.slice(0, 5).map((item) => this.mapTerminalAutomationStrategy(item)),
      latestExecutions: executions.map((item) => ({
        id: item.id,
        strategyId: item.strategyId,
        strategyName: item.strategyName,
        status: item.status,
        triggeredCount: item.triggeredCount,
        reachedCount: item.reachedCount,
        channel: item.channel,
        executedAt: item.executedAt,
        message: item.message,
        ...this.buildTerminalAutomationExecutionInsight(item.strategy, item),
      })),
    };
  }
}
