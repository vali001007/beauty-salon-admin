import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface BeauticianServiceSummary {
  serviceCount: number;
  cancelledCount: number;
  scheduledMinutes: number;
  nextTasks: BeauticianReservationFact[];
  cancelledTasks: BeauticianReservationFact[];
  gaps: Array<{ date: string; startTime: string; endTime: string; minutes: number }>;
  materialPlan: Array<{ productId: number; productName: string; requiredQty: number; unit: string; projectNames: string[] }>;
  bomCoveredReservationCount: number;
  bomMissingProjects: string[];
}

export interface BeauticianReservationFact {
  reservationId: number;
  customerId: number;
  projectId: number;
  date: string;
  startTime: string;
  endTime?: string;
  status: string;
  customerName: string;
  projectName: string;
  appointmentTime: string;
  memberLevel: string;
  isFirstVisit: boolean;
  checkedInAt?: Date;
  arrivedEarly: boolean;
  attentionItems: string[];
  previousService?: { projectName: string; appointmentTime: Date; remark?: string };
  cards: Array<{ cardName: string; totalTimes: number; usedTimes: number; remainingTimes: number; expiryDate: Date; status: string }>;
}

export interface BeauticianPerformanceSummary {
  beauticianName?: string;
  serviceCount: number;
  completedCount: number;
  scheduledMinutes: number;
  actualMinutes: number;
  revenueAmount: number;
  commissionAmount: number;
  uniqueCustomerCount: number;
  repeatCustomerCount: number;
  projectRanking: Array<{ name: string; count: number }>;
}

export interface BeauticianInactiveCustomerSummary {
  beauticianName: string;
  thresholdDays: number;
  total: number;
  truncated: boolean;
  rows: Array<{
    customerId: number;
    customerName: string;
    memberLevel: string;
    visitCount: number;
    totalSpent: number;
    lastServedByMeAt: Date;
    lastStoreVisitAt: Date;
    inactiveDays: number;
  }>;
}

@Injectable()
export class BrainBeauticianSkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async buildTodayServiceSummary(input: {
    storeId: number;
    startDate: Date;
    endDate: Date;
    beauticianId?: number;
    userId?: number;
    timezone?: string;
    includeMaterialPlan?: boolean;
    includeCustomerCards?: boolean;
  }): Promise<BeauticianServiceSummary> {
    const beauticianId = input.beauticianId ?? (await this.findBeauticianId(input.storeId, input.userId));
    if (!beauticianId) throw new ForbiddenException('beautician_identity_not_linked');
    const timezone = input.timezone ?? 'Asia/Shanghai';
    const dateRange = this.businessDateRange(input.startDate, input.endDate, timezone);
    const reservations = await this.prisma.reservation.findMany({
      where: {
        storeId: input.storeId,
        beauticianId,
        date: { gte: dateRange.startDate, lt: dateRange.endExclusive },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            memberLevel: true,
            visitCount: true,
            hasAllergy: true,
            skinCondition: true,
            skinType: true,
            remark: true,
            healthProfile: {
              select: {
                allergyHistory: true,
                skinStatus: true,
                mainProblems: true,
              },
            },
          },
        },
        project: { select: { name: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 500,
    });

    const customerIds = [...new Set(reservations.map((reservation) => reservation.customerId))];
    const projectIds = [...new Set(reservations.map((reservation) => reservation.projectId))];
    const [previousTasks, bomItems, customerCards] = await Promise.all([
      customerIds.length ? this.prisma.serviceTask.findMany({
          where: {
            storeId: input.storeId,
            customerId: { in: customerIds },
            appointmentTime: { lt: dateRange.startDate },
            status: 'completed',
          },
          select: {
            customerId: true,
            appointmentTime: true,
            remark: true,
            project: { select: { name: true } },
          },
          orderBy: { appointmentTime: 'desc' },
          take: 1000,
        }) : [],
      input.includeMaterialPlan && projectIds.length ? this.prisma.projectBomItem.findMany({
        where: { projectId: { in: projectIds } },
        select: {
          projectId: true,
          standardQty: true,
          unit: true,
          project: { select: { name: true } },
          product: { select: { id: true, name: true } },
        },
        take: 2000,
      }) : [],
      input.includeCustomerCards && customerIds.length ? this.prisma.customerCard.findMany({
        where: { customerId: { in: customerIds }, status: 'active' },
        select: { customerId: true, cardName: true, totalTimes: true, remainingTimes: true, expiryDate: true, status: true },
        orderBy: { expiryDate: 'asc' },
        take: 2000,
      }) : [],
    ]);
    const previousByCustomer = new Map<number, (typeof previousTasks)[number]>();
    for (const task of previousTasks) {
      if (!previousByCustomer.has(task.customerId)) previousByCustomer.set(task.customerId, task);
    }
    const cardsByCustomer = new Map<number, Array<(typeof customerCards)[number]>>();
    for (const card of customerCards) cardsByCustomer.set(card.customerId, [...(cardsByCustomer.get(card.customerId) ?? []), card]);
    const facts = reservations.map((reservation) => {
      const date = this.formatDate(reservation.date, timezone);
      const scheduledAt = this.reservationStartAt(date, reservation.startTime, timezone);
      const previous = previousByCustomer.get(reservation.customerId);
      return {
        reservationId: reservation.id,
        customerId: reservation.customerId,
        projectId: reservation.projectId,
        date,
        startTime: reservation.startTime,
        endTime: reservation.endTime ?? undefined,
        status: reservation.status,
        customerName: reservation.customer?.name ?? '客户',
        projectName: reservation.project?.name ?? '服务项目',
        appointmentTime: `${date} ${reservation.startTime}`,
        memberLevel: reservation.customer?.memberLevel ?? '无',
        isFirstVisit: (reservation.customer?.visitCount ?? 0) === 0,
        checkedInAt: reservation.checkedInAt ?? undefined,
        arrivedEarly: Boolean(reservation.checkedInAt && reservation.checkedInAt.getTime() < scheduledAt.getTime()),
        attentionItems: this.buildAttentionItems(reservation.customer),
        previousService: previous
          ? { projectName: previous.project.name, appointmentTime: previous.appointmentTime, remark: previous.remark ?? undefined }
          : undefined,
        cards: (cardsByCustomer.get(reservation.customerId) ?? []).map((card) => ({
          cardName: card.cardName,
          totalTimes: card.totalTimes,
          usedTimes: Math.max(0, card.totalTimes - card.remainingTimes),
          remainingTimes: card.remainingTimes,
          expiryDate: card.expiryDate,
          status: card.status,
        })),
      } satisfies BeauticianReservationFact;
    });
    const cancelledStatuses = new Set(['cancelled', 'canceled', '已取消']);
    const active = facts.filter((fact) => !cancelledStatuses.has(fact.status));
    const cancelled = facts.filter((fact) => cancelledStatuses.has(fact.status));
    const bomByProject = new Map<number, typeof bomItems>();
    for (const item of bomItems) bomByProject.set(item.projectId, [...(bomByProject.get(item.projectId) ?? []), item]);
    const materialPlan = new Map<string, { productId: number; productName: string; requiredQty: number; unit: string; projectNames: Set<string> }>();
    for (const reservation of active) {
      for (const item of bomByProject.get(reservation.projectId) ?? []) {
        const key = `${item.product.id}:${item.unit}`;
        const current = materialPlan.get(key) ?? {
          productId: item.product.id,
          productName: item.product.name,
          requiredQty: 0,
          unit: item.unit,
          projectNames: new Set<string>(),
        };
        current.requiredQty += this.toNumber(item.standardQty);
        current.projectNames.add(item.project.name);
        materialPlan.set(key, current);
      }
    }

    return {
      serviceCount: active.length,
      cancelledCount: cancelled.length,
      scheduledMinutes: active.reduce((sum, fact) => sum + this.durationMinutes(fact.startTime, fact.endTime), 0),
      nextTasks: active,
      cancelledTasks: cancelled,
      gaps: this.findReservationGaps(active),
      materialPlan: [...materialPlan.values()]
        .map((item) => ({ ...item, requiredQty: Number(item.requiredQty.toFixed(4)), projectNames: [...item.projectNames].sort() }))
        .sort((left, right) => left.productName.localeCompare(right.productName, 'zh-CN')),
      bomCoveredReservationCount: active.filter((reservation) => (bomByProject.get(reservation.projectId) ?? []).length > 0).length,
      bomMissingProjects: [...new Set(active.filter((reservation) => !(bomByProject.get(reservation.projectId) ?? []).length).map((reservation) => reservation.projectName))].sort(),
    };
  }

  composeFollowUpAdvice(input: { customerName?: string; projectName?: string }) {
    const customer = input.customerName ?? '客户';
    const project = input.projectName ?? '本次项目';
    return `${customer}${project}结束后，建议记录皮肤/身体反馈，24 小时内发送护理提醒，并在 7 天内安排一次跟进。`;
  }

  async buildPersonalPerformance(input: {
    storeId: number;
    userId: number;
    startDate: Date;
    endDate: Date;
  }): Promise<BeauticianPerformanceSummary> {
    const beautician = await this.prisma.beautician.findFirst({
      where: { storeId: input.storeId, userId: input.userId, status: 'active' },
      select: { id: true, name: true },
    });
    if (!beautician) {
      return {
        serviceCount: 0,
        completedCount: 0,
        scheduledMinutes: 0,
        actualMinutes: 0,
        revenueAmount: 0,
        commissionAmount: 0,
        uniqueCustomerCount: 0,
        repeatCustomerCount: 0,
        projectRanking: [],
      };
    }
    const [tasks, commissions] = await Promise.all([
      this.prisma.serviceTask.findMany({
        where: {
          storeId: input.storeId,
          beauticianId: beautician.id,
          appointmentTime: { gte: input.startDate, lte: input.endDate },
        },
        select: {
          customerId: true,
          duration: true,
          status: true,
          startedAt: true,
          completedAt: true,
          project: { select: { name: true } },
        },
        take: 1000,
      }),
      this.prisma.commissionRecord.findMany({
        where: {
          storeId: input.storeId,
          beauticianId: beautician.id,
          createdAt: { gte: input.startDate, lte: input.endDate },
          status: { notIn: ['cancelled', 'rejected'] },
        },
        select: { sourceAmount: true, amount: true },
        take: 1000,
      }),
    ]);
    const customerCounts = new Map<number, number>();
    const projectCounts = new Map<string, number>();
    for (const task of tasks) customerCounts.set(task.customerId, (customerCounts.get(task.customerId) ?? 0) + 1);
    for (const task of tasks) projectCounts.set(task.project.name, (projectCounts.get(task.project.name) ?? 0) + 1);
    return {
      beauticianName: beautician.name,
      serviceCount: tasks.length,
      completedCount: tasks.filter((task) => String(task.status) === 'completed').length,
      scheduledMinutes: tasks.reduce((sum, task) => sum + task.duration, 0),
      actualMinutes: tasks.reduce((sum, task) => {
        if (!task.startedAt || !task.completedAt) return sum;
        return sum + Math.max(0, Math.round((task.completedAt.getTime() - task.startedAt.getTime()) / 60000));
      }, 0),
      revenueAmount: commissions.reduce((sum, record) => sum + this.toNumber(record.sourceAmount), 0),
      commissionAmount: commissions.reduce((sum, record) => sum + this.toNumber(record.amount), 0),
      uniqueCustomerCount: customerCounts.size,
      repeatCustomerCount: [...customerCounts.values()].filter((count) => count > 1).length,
      projectRanking: [...projectCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 10),
    };
  }

  async buildPersonalInactiveCustomers(input: {
    storeId: number;
    userId: number;
    asOf: Date;
    thresholdDays?: number;
    limit?: number;
  }): Promise<BeauticianInactiveCustomerSummary> {
    const beautician = await this.prisma.beautician.findFirst({
      where: { storeId: input.storeId, userId: input.userId, status: 'active' },
      select: { id: true, name: true },
    });
    if (!beautician) throw new ForbiddenException('beautician_identity_not_linked');

    const thresholdDays = Math.max(30, Math.min(input.thresholdDays ?? 60, 365));
    const limit = Math.max(1, Math.min(input.limit ?? 10, 50));
    const scanLimit = 5000;
    const tasks = await this.prisma.serviceTask.findMany({
      where: {
        storeId: input.storeId,
        beauticianId: beautician.id,
        status: 'completed',
        appointmentTime: { lte: input.asOf },
        customer: { deletedAt: null },
      },
      select: {
        customerId: true,
        appointmentTime: true,
        customer: {
          select: {
            name: true,
            memberLevel: true,
            visitCount: true,
            totalSpent: true,
            lastVisitDate: true,
          },
        },
      },
      orderBy: { appointmentTime: 'desc' },
      take: scanLimit,
    });
    const latestByCustomer = new Map<number, (typeof tasks)[number]>();
    for (const task of tasks) {
      if (!latestByCustomer.has(task.customerId)) latestByCustomer.set(task.customerId, task);
    }
    const cutoff = new Date(input.asOf.getTime() - thresholdDays * 86_400_000);
    const rows = [...latestByCustomer.values()]
      .map((task) => {
        const lastStoreVisitAt =
          task.customer.lastVisitDate && task.customer.lastVisitDate > task.appointmentTime
            ? task.customer.lastVisitDate
            : task.appointmentTime;
        return {
          customerId: task.customerId,
          customerName: task.customer.name,
          memberLevel: task.customer.memberLevel,
          visitCount: task.customer.visitCount,
          totalSpent: this.toNumber(task.customer.totalSpent),
          lastServedByMeAt: task.appointmentTime,
          lastStoreVisitAt,
          inactiveDays: Math.max(0, Math.floor((input.asOf.getTime() - lastStoreVisitAt.getTime()) / 86_400_000)),
        };
      })
      .filter((row) => row.lastStoreVisitAt < cutoff)
      .sort(
        (left, right) =>
          right.inactiveDays - left.inactiveDays ||
          right.totalSpent - left.totalSpent ||
          left.customerName.localeCompare(right.customerName, 'zh-CN'),
      );

    return {
      beauticianName: beautician.name,
      thresholdDays,
      total: rows.length,
      truncated: tasks.length >= scanLimit,
      rows: rows.slice(0, limit),
    };
  }

  private async findBeauticianId(storeId: number, userId?: number) {
    if (!userId) return undefined;
    const beautician = await this.prisma.beautician.findFirst({
      where: { storeId, userId, status: 'active' },
      select: { id: true },
    });
    return beautician?.id;
  }

  private buildAttentionItems(customer: {
    hasAllergy?: string | null;
    skinCondition?: string | null;
    skinType?: string | null;
    remark?: string | null;
    healthProfile?: {
      allergyHistory?: string | null;
      skinStatus?: string | null;
      mainProblems?: string | null;
    } | null;
  } | null) {
    if (!customer) return [];
    return [
      this.formatAttention('过敏史', customer.hasAllergy),
      this.formatAttention('健康档案过敏史', customer.healthProfile?.allergyHistory),
      this.formatAttention('肤质', customer.skinType),
      this.formatAttention('皮肤状态', customer.skinCondition ?? customer.healthProfile?.skinStatus),
      this.formatAttention('主要问题', customer.healthProfile?.mainProblems),
      this.formatAttention('情绪/备注', customer.remark),
    ].filter((item): item is string => Boolean(item));
  }

  private formatAttention(label: string, value?: string | null) {
    const text = String(value ?? '').trim();
    if (!text || ['无', '否', '没有', '无过敏', '暂无', 'none', 'null'].includes(text.toLowerCase())) return undefined;
    return `${label}：${text}`;
  }

  private formatDate(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  }

  private findReservationGaps(facts: BeauticianReservationFact[]) {
    const gaps: BeauticianServiceSummary['gaps'] = [];
    for (let index = 1; index < facts.length; index += 1) {
      const previous = facts[index - 1]!;
      const current = facts[index]!;
      if (previous.date !== current.date || !previous.endTime) continue;
      const minutes = this.timeMinutes(current.startTime) - this.timeMinutes(previous.endTime);
      if (minutes > 0) gaps.push({ date: current.date, startTime: previous.endTime, endTime: current.startTime, minutes });
    }
    return gaps;
  }

  private durationMinutes(startTime: string, endTime?: string) {
    if (!endTime) return 0;
    return Math.max(0, this.timeMinutes(endTime) - this.timeMinutes(startTime));
  }

  private timeMinutes(value: string) {
    const [hours = 0, minutes = 0] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private reservationStartAt(date: string, startTime: string, timezone: string) {
    return new Date(`${date}T${startTime}:00${timezone === 'Asia/Shanghai' ? '+08:00' : 'Z'}`);
  }

  private businessDateRange(startDate: Date, endDate: Date, timezone: string) {
    const start = this.businessDateBoundary(this.formatDate(startDate, timezone), timezone);
    const end = this.businessDateBoundary(this.formatDate(endDate, timezone), timezone);
    end.setUTCDate(end.getUTCDate() + 1);
    return { startDate: start, endExclusive: end };
  }

  private businessDateBoundary(date: string, timezone: string) {
    return new Date(`${date}T00:00:00${timezone === 'Asia/Shanghai' ? '+08:00' : 'Z'}`);
  }

  private toNumber(value: unknown) {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') return Number(value);
    if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
    return 0;
  }
}
