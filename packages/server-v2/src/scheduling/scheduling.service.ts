import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TerminalDashboardCacheService } from '../terminal/terminal-dashboard-cache.service.js';

@Injectable()
export class SchedulingService {
  constructor(
    private prisma: PrismaService,
    private terminalDashboardCache: TerminalDashboardCacheService,
  ) {}

  async findAll(storeId?: number, date?: string, beauticianId?: number, weekStart?: string) {
    const where: any = {};
    if (storeId) where.storeId = storeId;
    if (beauticianId) where.beauticianId = beauticianId;
    if (date) {
      const start = new Date(date);
      const end = new Date(start);
      end.setDate(start.getDate() + 1);
      where.date = { gte: start, lt: end };
    } else if (weekStart) {
      const start = new Date(weekStart);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      where.date = { gte: start, lt: end };
    }
    return this.prisma.schedule.findMany({ where, orderBy: { date: 'asc' } });
  }

  async save(
    schedules: Array<{
      storeId?: number;
      beauticianId: number;
      date: string;
      startTime: string;
      endTime: string;
      status?: string;
      smartRunId?: string | null;
    }>,
    storeId?: number,
    beauticianId?: number,
    weekStart?: string,
  ) {
    const resolvedBeauticianId = beauticianId ?? schedules[0]?.beauticianId;
    let resolvedStoreId = storeId ?? schedules[0]?.storeId;

    if (!resolvedStoreId && resolvedBeauticianId) {
      const beautician = await this.prisma.beautician.findUnique({
        where: { id: resolvedBeauticianId },
        select: { storeId: true },
      });
      resolvedStoreId = beautician?.storeId;
    }

    if (!resolvedStoreId || !resolvedBeauticianId) {
      throw new BadRequestException({ message: '缺少门店或美容师信息', code: 'SCHEDULING_CONTEXT_REQUIRED' });
    }

    const dates = weekStart
      ? Array.from({ length: 7 }, (_, index) => {
          const date = new Date(weekStart);
          date.setDate(date.getDate() + index);
          return date;
        })
      : Array.from(new Set(schedules.map((item) => item.date))).map((item) => new Date(item));

    if (!dates.length) return [];

    await this.prisma.schedule.deleteMany({
      where: {
        storeId: resolvedStoreId,
        beauticianId: resolvedBeauticianId,
        date: { in: dates },
      },
    });
    if (schedules.length) {
      await this.prisma.schedule.createMany({
        data: schedules.map((s) => ({
          storeId: s.storeId ?? resolvedStoreId,
          beauticianId: s.beauticianId,
          date: new Date(s.date),
          startTime: s.startTime,
          endTime: s.endTime,
          status: s.status ?? 'available',
          smartRunId: s.smartRunId ?? null,
        })),
      });
    }
    this.terminalDashboardCache.invalidate(resolvedStoreId, ['role', 'manager', 'staff-schedules']);
    return this.findAll(resolvedStoreId, undefined, resolvedBeauticianId, weekStart ?? schedules[0]?.date);
  }
}
