import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { buildCardUsageIdempotencyKey } from '../../cards/card-usage-idempotency.js';
import { buildReservationIdempotencyKey } from '../../reservations/reservation-idempotency.js';
import { buildPurchaseOrderIdempotencyKey } from '../../inventory/purchase-order-idempotency.js';
import { buildFollowUpTaskIdempotencyKey } from '../../terminal/follow-up-task-idempotency.js';
import { extractCustomerPhoneTail } from './brain-customer-identity.js';

export type BrainTargetResolution<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; message: string };

@Injectable()
export class BrainActionTargetResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async revalidateCapabilityTarget(input: {
    capabilityKey: string;
    storeId: number;
    args: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<void> {
    switch (input.capabilityKey) {
      case 'create_reservation':
        if (input.idempotencyKey) {
          const idempotencyKey = buildReservationIdempotencyKey(input.storeId, 'ami_brain', input.idempotencyKey);
          const committed = await this.prisma.reservation.findUnique({ where: { idempotencyKey }, select: { id: true } });
          if (committed) return;
        }
        await Promise.all([
          this.requireScopedRecord('customer', input.args.customerId, input.storeId),
          this.requireScopedRecord('project', input.args.projectId, input.storeId),
        ]);
        return;
      case 'reschedule_reservation':
      case 'cancel_reservation':
        await this.requireScopedRecord('reservation', input.args.reservationId, input.storeId);
        return;
      case 'create_customer_followup':
      case 'create_marketing_touch_draft': {
        if (input.idempotencyKey) {
          const source = input.capabilityKey === 'create_customer_followup' ? 'brain_followup' : 'brain_marketing_touch_draft';
          const idempotencyKey = buildFollowUpTaskIdempotencyKey(input.storeId, source, input.idempotencyKey);
          const committed = await this.prisma.terminalFollowUpTask.findUnique({ where: { idempotencyKey }, select: { id: true } });
          if (committed) return;
        }
        await this.requireScopedRecord('customer', input.args.customerId, input.storeId);
        return;
      }
      case 'execute_marketing_strategy': {
        if (input.idempotencyKey) {
          const committed = await this.prisma.marketingAutomationExecution.findUnique({
            where: {
              strategyId_idempotencyKey: {
                strategyId: this.positiveId(input.args.strategyId),
                idempotencyKey: input.idempotencyKey,
              },
            },
            select: { id: true, storeId: true },
          });
          if (committed) {
            if (committed.storeId !== input.storeId) throw new ForbiddenException('cross_store_action_target');
            return;
          }
        }
        const strategy = await this.prisma.marketingAutomationStrategy.findFirst({
          where: { id: this.positiveId(input.args.strategyId), storeId: input.storeId },
          select: { id: true, status: true },
        });
        if (!strategy) throw new ForbiddenException('cross_store_action_target');
        if (strategy.status !== 'enabled') throw new BadRequestException('marketing_strategy_not_enabled');
        return;
      }
      case 'save_service_record':
        await this.requireScopedRecord('serviceTask', input.args.taskId, input.storeId);
        return;
      case 'verify_card_usage':
        await this.revalidateCardUsageTarget(input.storeId, input.args, input.idempotencyKey);
        return;
      case 'create_purchase_order': {
        if (input.idempotencyKey) {
          const idempotencyKey = buildPurchaseOrderIdempotencyKey(input.storeId, 'ami_brain', input.idempotencyKey);
          const committed = await this.prisma.purchaseOrder.findUnique({ where: { idempotencyKey }, select: { id: true } });
          if (committed) return;
        }
        if (!Array.isArray(input.args.items) || input.args.items.length === 0) {
          throw new BadRequestException('purchase_items_required');
        }
        const productIds = [...new Set(input.args.items.map((item) => this.positiveId((item as Record<string, unknown>)?.productId)))];
        const matched = await this.prisma.product.count({
          where: { id: { in: productIds }, storeId: input.storeId, deletedAt: null },
        });
        if (matched !== productIds.length) throw new ForbiddenException('cross_store_action_target');
        return;
      }
      default:
        throw new BadRequestException(`unsupported_action_target:${input.capabilityKey}`);
    }
  }

  async resolveCustomer(input: { storeId: number; message: string; customerName?: string }): Promise<BrainTargetResolution<{ id: number; name: string; maskedPhone: string }>> {
    const name = input.customerName?.trim() || this.extractCustomerName(input.message);
    const phoneTail = extractCustomerPhoneTail(input.message);
    if (!name && !phoneTail) {
      return { ok: false, reason: 'missing_customer', message: '请提供客户姓名或手机号后四位后再生成动作预览。' };
    }
    const customers = await this.prisma.customer.findMany({
      where: {
        storeId: input.storeId,
        deletedAt: null,
        ...(name && phoneTail
          ? { AND: [{ name: { contains: name } }, { phone: { endsWith: phoneTail } }] }
          : name
            ? { name: { contains: name } }
            : { phone: { endsWith: phoneTail! } }),
      },
      select: { id: true, name: true, phone: true },
      take: 3,
    });
    if (!customers.length) return { ok: false, reason: 'customer_not_found', message: '当前门店没有找到匹配客户，请核对姓名或手机号后四位。' };
    if (customers.length > 1) {
      return { ok: false, reason: 'ambiguous_customer', message: '当前门店找到多位匹配客户，请补充手机号后四位后再继续。' };
    }
    return {
      ok: true,
      value: { id: customers[0].id, name: customers[0].name, maskedPhone: this.maskPhone(customers[0].phone) },
    };
  }

  async resolveMarketingStrategy(input: { storeId: number; message: string }): Promise<BrainTargetResolution<{
    id: number;
    name: string;
    status: string;
    executionType: string;
    ruleRelation: string;
    actions: unknown;
    targetCount: number;
    lastExecutedAt: string | null;
  }>> {
    const explicitIdText =
      input.message.match(/(?:自动触达|营销)?策略(?:编号|ID|id|#|号)\s*(\d{1,9})(?!\d)/)?.[1] ??
      input.message.trim().match(
        /^(?:执行|运行|启动|开始|立即)\s*(?:自动触达|营销)?策略\s+(\d{1,9})(?!\d)(?:\s*(?:并)?\s*(?:发送|执行|启动))?\s*$/,
      )?.[1] ??
      input.message.trim().match(/^(?:执行|运行|启动|开始|立即)?\s*(?:自动触达|营销)?策略\s+(\d{1,9})$/)?.[1];
    const explicitId = Number(explicitIdText);
    if (explicitId > 0) {
      const strategy = await this.prisma.marketingAutomationStrategy.findFirst({
        where: { id: explicitId, storeId: input.storeId },
        select: {
          id: true,
          name: true,
          status: true,
          executionType: true,
          ruleRelation: true,
          actions: true,
          targetCount: true,
          lastExecutedAt: true,
        },
      });
      return strategy
        ? this.marketingStrategyResolution(strategy)
        : { ok: false, reason: 'marketing_strategy_not_found', message: '当前门店没有找到该自动触达策略。' };
    }
    const strategies = await this.prisma.marketingAutomationStrategy.findMany({
      where: { storeId: input.storeId },
      select: {
        id: true,
        name: true,
        status: true,
        executionType: true,
        ruleRelation: true,
        actions: true,
        targetCount: true,
        lastExecutedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    const matches = strategies.filter((strategy) => input.message.includes(strategy.name));
    if (!matches.length) {
      return { ok: false, reason: 'marketing_strategy_required', message: '请提供当前门店的自动触达策略名称或策略编号后再生成执行预览。' };
    }
    if (matches.length > 1) {
      return { ok: false, reason: 'ambiguous_marketing_strategy', message: '问题中命中多个自动触达策略，请明确策略编号。' };
    }
    return this.marketingStrategyResolution(matches[0]);
  }

  async resolveProject(input: { storeId: number; message: string }): Promise<BrainTargetResolution<{ id: number; name: string; duration: number }>> {
    const projects = await this.prisma.project.findMany({
      where: { storeId: input.storeId, deletedAt: null, status: 'active' },
      select: { id: true, name: true, duration: true },
      take: 200,
    });
    const matches = projects.filter((project) => input.message.includes(project.name));
    if (!matches.length) return { ok: false, reason: 'missing_project', message: '请提供当前门店的具体项目名称后再生成预约预览。' };
    if (matches.length > 1) return { ok: false, reason: 'ambiguous_project', message: '问题中命中多个项目，请明确本次预约项目。' };
    return { ok: true, value: { id: matches[0].id, name: matches[0].name, duration: Number(matches[0].duration || 60) } };
  }

  async resolveReservation(input: { storeId: number; message: string }): Promise<BrainTargetResolution<{ id: number; customerId: number; customerName: string; projectName: string; appointmentTime: string }>> {
    const customer = await this.resolveCustomer(input);
    if (!customer.ok) return customer;
    const reservations = await this.prisma.reservation.findMany({
      where: {
        storeId: input.storeId,
        customerId: customer.value.id,
        status: { notIn: ['cancelled', 'canceled', 'completed', '已取消', '已完成'] },
      },
      select: { id: true, date: true, startTime: true, status: true, project: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 5,
    });
    if (!reservations.length) return { ok: false, reason: 'reservation_not_found', message: `${customer.value.name}在当前门店没有可操作的预约。` };
    if (reservations.length > 1 && !/(下一次|最近|即将|明天|今天|后天)/.test(input.message)) {
      return { ok: false, reason: 'ambiguous_reservation', message: `${customer.value.name}有多条可操作预约，请补充原预约日期或时间。` };
    }
    const reservation = reservations[0];
    return {
      ok: true,
      value: {
        id: reservation.id,
        customerId: customer.value.id,
        customerName: customer.value.name,
        projectName: reservation.project.name,
        appointmentTime: `${reservation.date.toISOString().slice(0, 10)}T${reservation.startTime}:00`,
      },
    };
  }

  async resolveServiceTask(input: { storeId: number; message: string }): Promise<BrainTargetResolution<{ id: number; customerName: string; projectName: string }>> {
    const explicitId = Number(input.message.match(/(?:任务|服务单)[#号\s]*(\d+)/)?.[1]);
    if (explicitId > 0) {
      const task = await this.prisma.serviceTask.findFirst({
        where: { id: explicitId, storeId: input.storeId },
        select: { id: true, customer: { select: { name: true } }, project: { select: { name: true } } },
      });
      return task
        ? { ok: true, value: { id: task.id, customerName: task.customer.name, projectName: task.project.name } }
        : { ok: false, reason: 'service_task_not_found', message: '当前门店没有找到该服务任务。' };
    }
    const customer = await this.resolveCustomer(input);
    if (!customer.ok) return customer;
    const tasks = await this.prisma.serviceTask.findMany({
      where: { storeId: input.storeId, customerId: customer.value.id, status: { in: ['pending', 'in_progress'] } },
      select: { id: true, customer: { select: { name: true } }, project: { select: { name: true } } },
      orderBy: { appointmentTime: 'desc' },
      take: 2,
    });
    if (!tasks.length) return { ok: false, reason: 'service_task_not_found', message: `${customer.value.name}没有待完成的服务任务。` };
    if (tasks.length > 1) return { ok: false, reason: 'ambiguous_service_task', message: `${customer.value.name}有多条待完成服务，请补充服务单号。` };
    return { ok: true, value: { id: tasks[0].id, customerName: tasks[0].customer.name, projectName: tasks[0].project.name } };
  }

  async resolveCardUsageTarget(input: { storeId: number; message: string }): Promise<BrainTargetResolution<{
    customerId: number;
    customerName: string;
    customerCardId: number;
    cardName: string;
    projectId: number;
    projectName: string;
    remainingTimes: number;
    projectRemainingTimes: number;
  }>> {
    const customer = await this.resolveCustomer(input);
    if (!customer.ok) return customer;
    const cards = await this.prisma.customerCard.findMany({
      where: {
        customerId: customer.value.id,
        status: 'active',
        remainingTimes: { gt: 0 },
        expiryDate: { gte: new Date() },
        customer: { storeId: input.storeId, deletedAt: null },
      },
      include: { card: { select: { projects: true } } },
      orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
      take: 20,
    });
    if (!cards.length) {
      return { ok: false, reason: 'active_customer_card_not_found', message: `${customer.value.name}在当前门店没有可核销的有效次卡。` };
    }

    const explicitCards = cards.filter((card) => input.message.includes(card.cardName));
    if (explicitCards.length > 1) {
      return { ok: false, reason: 'ambiguous_customer_card', message: '问题中命中多张次卡，请明确本次要核销的卡名。' };
    }
    const scopedCards = explicitCards.length === 1 ? explicitCards : cards;
    const candidates = scopedCards.flatMap((card) => {
      const projects = Array.isArray(card.card?.projects) ? card.card.projects : [];
      return projects.flatMap((raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
        const project = raw as Record<string, unknown>;
        const projectName = String(project.projectName ?? project.name ?? '').trim();
        if (!projectName) return [];
        return [{
          card,
          projectName,
          projectId: this.optionalPositiveId(project.projectId ?? project.id),
          projectTotalTimes: Number(project.timesPerCard ?? project.totalCount ?? card.totalTimes ?? 0),
        }];
      });
    });
    const explicitProjects = candidates.filter((candidate) => input.message.includes(candidate.projectName));
    const matched = explicitProjects.length
      ? explicitProjects
      : scopedCards.length === 1 && candidates.length === 1
        ? candidates
        : [];
    const unique = [...new Map(matched.map((candidate) => [`${candidate.card.id}:${candidate.projectName}`, candidate])).values()];
    if (!unique.length) {
      return { ok: false, reason: 'missing_card_project', message: '请明确本次核销的项目名称；如果客户有多张次卡，还需要说明卡名。' };
    }
    if (unique.length > 1) {
      return { ok: false, reason: 'ambiguous_card_project', message: '当前客户有多张卡可核销该项目，请补充具体卡名。' };
    }

    const selected = unique[0];
    const project = await this.prisma.project.findFirst({
      where: {
        storeId: input.storeId,
        deletedAt: null,
        OR: [
          ...(selected.projectId ? [{ id: selected.projectId }] : []),
          { name: selected.projectName },
        ],
      },
      select: { id: true, name: true },
    });
    if (!project) {
      return { ok: false, reason: 'card_project_not_found', message: '次卡配置的项目在当前门店不存在或已停用，不能生成核销预览。' };
    }
    const used = await this.prisma.cardUsageRecord.aggregate({
      where: { customerCardId: selected.card.id, projectName: selected.projectName },
      _sum: { times: true },
    });
    const projectRemainingTimes = Math.max(selected.projectTotalTimes - Number(used._sum.times ?? 0), 0);
    if (projectRemainingTimes <= 0) {
      return { ok: false, reason: 'card_project_times_exhausted', message: `${selected.card.cardName}中的${selected.projectName}已无可核销次数。` };
    }
    return {
      ok: true,
      value: {
        customerId: customer.value.id,
        customerName: customer.value.name,
        customerCardId: selected.card.id,
        cardName: selected.card.cardName,
        projectId: project.id,
        projectName: project.name,
        remainingTimes: selected.card.remainingTimes,
        projectRemainingTimes,
      },
    };
  }

  async resolveBeautician(input: { storeId: number; message: string }): Promise<BrainTargetResolution<{ id: number; name: string }>> {
    const beauticians = await this.prisma.beautician.findMany({
      where: { storeId: input.storeId, status: 'active' },
      select: { id: true, name: true },
      take: 100,
    });
    const matches = beauticians.filter((beautician) => input.message.includes(beautician.name));
    if (!matches.length) return { ok: false, reason: 'missing_beautician', message: '请说明本次服务人员，用于核销记录和提成归属。' };
    if (matches.length > 1) return { ok: false, reason: 'ambiguous_beautician', message: '问题中命中多位美容师，请明确本次服务人员。' };
    return { ok: true, value: matches[0] };
  }

  resolveUsageTimes(message: string) {
    const numeric = message.match(/(?:核销|扣|划扣)?\s*([1-9]\d*)\s*次/);
    if (numeric) return Number(numeric[1]);
    const chinese = message.match(/(?:核销|扣|划扣)?\s*([一二两三四五六七八九十])\s*次/);
    if (!chinese) return undefined;
    const values: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    return values[chinese[1]];
  }

  resolveAppointmentTime(message: string, now = new Date()) {
    const clock = this.extractClock(message);
    if (!clock) return undefined;
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    if (message.includes('后天')) date.setDate(date.getDate() + 2);
    else if (message.includes('明天')) date.setDate(date.getDate() + 1);
    else {
      const monthDay = message.match(/(\d{1,2})月(\d{1,2})日?/);
      const isoDate = message.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
      if (isoDate) date.setFullYear(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));
      else if (monthDay) date.setMonth(Number(monthDay[1]) - 1, Number(monthDay[2]));
      else if (!this.applyWeekday(date, message)) {
        if (!message.includes('今天')) return undefined;
      }
    }
    date.setHours(clock.hour, clock.minute, 0, 0);
    return date;
  }

  private extractClock(message: string) {
    const colon = message.match(/(?:^|[^0-9])(\d{1,2})[:：](\d{2})(?:[^0-9]|$)/);
    if (colon) return this.validClock(Number(colon[1]), Number(colon[2]));
    const chinese = message.match(/(上午|早上|下午|晚上)?\s*(\d{1,2}|[一二三四五六七八九十两]{1,3})点(?:(半)|(\d{1,2})分?)?/);
    if (!chinese) return undefined;
    let hour = this.chineseNumber(chinese[2]);
    if ((chinese[1] === '下午' || chinese[1] === '晚上') && hour < 12) hour += 12;
    const minute = chinese[3] ? 30 : Number(chinese[4] ?? 0);
    return this.validClock(hour, minute);
  }

  private validClock(hour: number, minute: number) {
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? { hour, minute } : undefined;
  }

  private chineseNumber(value: string) {
    if (/^\d+$/.test(value)) return Number(value);
    const digits = ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 } as Record<string, number>);
    if (value === '十') return 10;
    if (value.startsWith('十')) return 10 + (digits[value[1]] ?? 0);
    if (value.endsWith('十')) return (digits[value[0]] ?? 0) * 10;
    const [tens, ones] = value.split('十');
    return tens && ones ? (digits[tens] ?? 0) * 10 + (digits[ones] ?? 0) : digits[value] ?? Number.NaN;
  }

  private applyWeekday(date: Date, message: string) {
    const matched = message.match(/(下)?(?:周|星期)([一二三四五六日天])/);
    if (!matched) return false;
    const target = ({ 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 } as Record<string, number>)[matched[2]];
    let offset = (target - date.getDay() + 7) % 7;
    if (matched[1]) offset += 7;
    else if (offset === 0) offset = 7;
    date.setDate(date.getDate() + offset);
    return true;
  }

  private extractCustomerName(message: string) {
    const patterns = [
      /(?:给|为|把|帮|帮我给|帮我为|查一下|找一下|叫)([\u4e00-\u9fa5]{2,5})(?=安排|创建|建立|改约|改期|取消|发|做|预约|核销|扣次|划扣|的|把|，|,|\s|$)/,
      /客户(?:是|叫)?([\u4e00-\u9fa5]{2,5})(?=，|,|\s|$|的)/,
      /^([\u4e00-\u9fa5]{2,5})(?=的预约|改约|改期|取消预约|做)/,
    ];
    for (const pattern of patterns) {
      const value = message.match(pattern)?.[1];
      if (value && !/(这个|那个|客户|客人|今天|明天|预约)/.test(value)) return value;
    }
    return undefined;
  }

  private maskPhone(phone?: string | null) {
    const value = String(phone ?? '').replace(/\s+/g, '');
    return value.length >= 4 ? `***${value.slice(-4)}` : '未记录';
  }

  private marketingStrategyResolution(strategy: {
    id: number;
    name: string;
    status: unknown;
    executionType: string;
    ruleRelation: string;
    actions: unknown;
    targetCount: number;
    lastExecutedAt: Date | null;
  }): BrainTargetResolution<{
    id: number;
    name: string;
    status: string;
    executionType: string;
    ruleRelation: string;
    actions: unknown;
    targetCount: number;
    lastExecutedAt: string | null;
  }> {
    if (String(strategy.status) !== 'enabled') {
      return { ok: false, reason: 'marketing_strategy_not_enabled', message: `自动触达策略“${strategy.name}”当前未启用，不能执行发送。` };
    }
    return {
      ok: true,
      value: {
        id: strategy.id,
        name: strategy.name,
        status: String(strategy.status),
        executionType: strategy.executionType,
        ruleRelation: strategy.ruleRelation,
        actions: strategy.actions,
        targetCount: strategy.targetCount,
        lastExecutedAt: strategy.lastExecutedAt?.toISOString() ?? null,
      },
    };
  }

  private async revalidateCardUsageTarget(storeId: number, args: Record<string, unknown>, rawIdempotencyKey?: string) {
    const idempotencyKey = buildCardUsageIdempotencyKey(storeId, rawIdempotencyKey);
    if (idempotencyKey) {
      const committed = await this.prisma.cardUsageRecord.findUnique({ where: { idempotencyKey }, select: { id: true } });
      if (committed) return;
    }
    const customerCardId = this.positiveId(args.customerCardId);
    const customerId = this.positiveId(args.customerId);
    const projectId = this.positiveId(args.projectId);
    const beauticianId = this.positiveId(args.beauticianId);
    const times = this.positiveId(args.times);
    const card = await this.prisma.customerCard.findFirst({
      where: { id: customerCardId, customer: { storeId, deletedAt: null } },
      include: { card: { select: { projects: true } } },
    });
    if (!card) throw new ForbiddenException('cross_store_action_target');
    if (card.customerId !== customerId) throw new BadRequestException('card_customer_mismatch');
    if (card.status !== 'active' || card.expiryDate < new Date()) throw new BadRequestException('customer_card_not_active');
    if (card.remainingTimes < times) throw new BadRequestException('customer_card_remaining_times_insufficient');
    const [project, beautician] = await Promise.all([
      this.prisma.project.findFirst({ where: { id: projectId, storeId, deletedAt: null }, select: { id: true, name: true } }),
      this.prisma.beautician.findFirst({ where: { id: beauticianId, storeId, status: 'active' }, select: { id: true } }),
    ]);
    if (!project || !beautician) throw new ForbiddenException('cross_store_action_target');
    const configuredProjects = Array.isArray(card.card?.projects) ? card.card.projects : [];
    const configured = configuredProjects.some((raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
      const value = raw as Record<string, unknown>;
      return this.optionalPositiveId(value.projectId ?? value.id) === project.id || String(value.projectName ?? value.name ?? '').trim() === project.name;
    });
    if (!configured) throw new BadRequestException('card_project_mismatch');
  }

  private async requireScopedRecord(
    model: 'customer' | 'project' | 'reservation' | 'serviceTask',
    rawId: unknown,
    storeId: number,
  ) {
    const id = this.positiveId(rawId);
    const delegate = this.prisma[model] as unknown as {
      findFirst(input: { where: { id: number; storeId: number }; select: { id: true } }): Promise<{ id: number } | null>;
    };
    const record = await delegate.findFirst({ where: { id, storeId }, select: { id: true } });
    if (!record) throw new ForbiddenException('cross_store_action_target');
  }

  private positiveId(value: unknown) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('invalid_action_target_id');
    return id;
  }

  private optionalPositiveId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : undefined;
  }
}
