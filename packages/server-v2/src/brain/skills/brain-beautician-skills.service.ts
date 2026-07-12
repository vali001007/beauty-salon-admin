import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface BeauticianServiceSummary {
  serviceCount: number;
  nextTasks: Array<{ customerName: string; projectName: string; appointmentTime: string; attentionItems: string[] }>;
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

@Injectable()
export class BrainBeauticianSkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async buildTodayServiceSummary(input: {
    storeId: number;
    startDate: Date;
    endDate: Date;
    beauticianId?: number;
    userId?: number;
  }): Promise<BeauticianServiceSummary> {
    const beauticianId = input.beauticianId ?? (await this.findBeauticianId(input.storeId, input.userId));
    const reservations = await this.prisma.reservation.findMany({
      where: {
        storeId: input.storeId,
        ...(beauticianId ? { beauticianId } : {}),
        date: { gte: input.startDate, lte: input.endDate },
        status: { notIn: ['cancelled', 'canceled'] },
      },
      include: {
        customer: {
          select: {
            name: true,
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
      take: 20,
    });

    return {
      serviceCount: reservations.length,
      nextTasks: reservations.map((reservation) => ({
        customerName: reservation.customer?.name ?? '客户',
        projectName: reservation.project?.name ?? '服务项目',
        appointmentTime: `${reservation.date.toISOString().slice(0, 10)} ${reservation.startTime}`,
        attentionItems: this.buildAttentionItems(reservation.customer),
      })),
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
    if (!text || ['无', '否', '暂无', 'none', 'null'].includes(text.toLowerCase())) return undefined;
    return `${label}：${text}`;
  }

  private toNumber(value: unknown) {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') return Number(value);
    if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
    return 0;
  }
}
