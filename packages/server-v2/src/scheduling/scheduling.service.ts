import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TerminalDashboardCacheService } from '../terminal/terminal-dashboard-cache.service.js';

const CANCELLED_RESERVATION_STATUSES = ['cancelled', 'canceled', 'voided', '已取消', '取消'];

function addOneHour(time: string | null | undefined): string {
  if (!time) return '00:00';
  const [hour = '0', minute = '0'] = time.split(':');
  const total = Number(hour) * 60 + Number(minute) + 60;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

@Injectable()
export class SchedulingService {
  constructor(
    private prisma: PrismaService,
    private terminalDashboardCache: TerminalDashboardCacheService,
  ) {}

  async findAll(storeId?: number, date?: string, beauticianId?: number, weekStart?: string) {
    const dateRange = this.buildDateRange(date, weekStart);
    const scheduleWhere: any = {};
    if (storeId) scheduleWhere.storeId = storeId;
    if (beauticianId) scheduleWhere.beauticianId = beauticianId;
    if (dateRange) scheduleWhere.date = dateRange;

    const reservationWhere: any = {
      beauticianId: beauticianId ?? { not: null },
      status: { notIn: CANCELLED_RESERVATION_STATUSES },
    };
    if (storeId) reservationWhere.storeId = storeId;
    if (dateRange) reservationWhere.date = dateRange;

    const [schedules, reservations] = await Promise.all([
      this.prisma.schedule.findMany({
        where: scheduleWhere,
        select: {
          id: true,
          storeId: true,
          beauticianId: true,
          date: true,
          startTime: true,
          endTime: true,
          status: true,
          smartRunId: true,
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: reservationWhere,
        select: {
          id: true,
          storeId: true,
          customerId: true,
          projectId: true,
          beauticianId: true,
          date: true,
          startTime: true,
          endTime: true,
          status: true,
          remark: true,
          customer: {
            select: {
              name: true,
              phone: true,
            },
          },
          project: {
            select: {
              name: true,
              duration: true,
            },
          },
        },
        orderBy: { date: 'asc' },
      }),
    ]);

    const reservationSchedules = reservations
      .filter((reservation) => reservation.beauticianId)
      .map((reservation) => ({
        id: `reservation-${reservation.id}`,
        storeId: reservation.storeId,
        beauticianId: reservation.beauticianId,
        date: reservation.date,
        startTime: reservation.startTime,
        endTime: reservation.endTime ?? addOneHour(reservation.startTime),
        status: 'booked',
        source: 'reservation',
        reservationId: reservation.id,
        reservationStatus: reservation.status,
        customerId: reservation.customerId,
        customerName: reservation.customer?.name,
        customerPhone: reservation.customer?.phone,
        projectId: reservation.projectId,
        projectName: reservation.project?.name,
        projectDuration: reservation.project?.duration,
        remark: reservation.remark,
      }));

    return [...schedules, ...reservationSchedules].sort((a, b) => {
      const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateCompare !== 0) return dateCompare;
      return String(a.startTime).localeCompare(String(b.startTime));
    });
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

  private buildDateRange(date?: string, weekStart?: string) {
    if (date) {
      const start = new Date(date);
      const end = new Date(start);
      end.setDate(start.getDate() + 1);
      return { gte: start, lt: end };
    }
    if (weekStart) {
      const start = new Date(weekStart);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return { gte: start, lt: end };
    }
    return undefined;
  }
}
