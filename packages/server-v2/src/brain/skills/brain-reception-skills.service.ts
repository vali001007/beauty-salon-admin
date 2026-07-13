import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface BrainActionPreview {
  actionId: string;
  actionType: 'create_reservation' | 'reschedule_reservation';
  riskLevel: 'medium' | 'high';
  requiresConfirmation: true;
  summary: string;
}

export interface ReceptionReservationSchedule {
  count: number;
  reservations: Array<{
    date: string;
    customerName: string;
    projectName: string;
    projectTypeName?: string;
    startTime: string;
    beauticianName?: string;
    remark?: string;
  }>;
}

export interface ReceptionOperationsSnapshot {
  total: number;
  checkedIn: number;
  pendingArrival: number;
  noShow: number;
  cancelled: number;
  arrivalRate: number;
  noShowRate: number;
  arrivedCustomers: Array<{ customerName: string; startTime: string; projectName: string; status: string }>;
  pendingCustomers: Array<{ customerName: string; startTime: string; projectName: string; status: string }>;
  resources: Array<{ name: string; type: string; booked: boolean }>;
  staff: Array<{
    name: string;
    appointmentCount: number;
    inService: boolean;
    onTimeOff: boolean;
    available: boolean;
    nextAvailableAt?: string;
  }>;
}

export interface ReceptionServiceOverrunAnalysis {
  overrunCount: number;
  impactedCount: number;
  items: Array<{
    taskId: number;
    beauticianName: string;
    customerName: string;
    projectName: string;
    plannedEnd: string;
    actualEnd: string;
    overrunMinutes: number;
    impactedReservation?: { startTime: string; customerName: string; projectName: string };
  }>;
}

export interface ReceptionCatalogSnapshot {
  cards: Array<{ name: string; totalTimes: number; price: number; validDays: number }>;
  promotions: Array<{ name: string; discountText: string; endAt?: string }>;
}

@Injectable()
export class BrainReceptionSkillsService {
  constructor(private readonly prisma: PrismaService) {}

  countReservations(input: { storeId: number; startDate: Date; endDate: Date }) {
    return this.prisma.reservation.count({
      where: {
        storeId: input.storeId,
        date: { gte: input.startDate, lte: input.endDate },
        status: { notIn: ['cancelled', 'canceled'] },
      },
    });
  }

  async listReservationSchedule(input: {
    storeId: number;
    startDate: Date;
    endDate: Date;
  }): Promise<ReceptionReservationSchedule> {
    const reservations = await this.prisma.reservation.findMany({
      where: {
        storeId: input.storeId,
        date: { gte: input.startDate, lte: input.endDate },
        status: { notIn: ['cancelled', 'canceled'] },
      },
      include: {
        customer: { select: { name: true } },
        project: { select: { name: true, type: { select: { name: true } } } },
        beautician: { select: { name: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 20,
    });

    return {
      count: reservations.length,
      reservations: reservations.map((reservation) => ({
        date: reservation.date.toISOString().slice(0, 10),
        customerName: reservation.customer?.name ?? '客户',
        projectName: reservation.project?.name ?? '服务项目',
        projectTypeName: reservation.project?.type?.name,
        startTime: reservation.startTime,
        beauticianName: reservation.beautician?.name,
        remark: reservation.remark ?? undefined,
      })),
    };
  }

  previewReservationAction(input: {
    actionType: BrainActionPreview['actionType'];
    customerName?: string;
    targetTime?: string;
  }): BrainActionPreview {
    const target = input.targetTime ?? '待确认时间';
    const customer = input.customerName ?? '客户';
    return {
      actionId: `preview_${input.actionType}`,
      actionType: input.actionType,
      riskLevel: input.actionType === 'reschedule_reservation' ? 'high' : 'medium',
      requiresConfirmation: true,
      summary: `${customer}预约动作预览：${target}。确认前不会写入预约。`,
    };
  }

  async buildOperationsSnapshot(input: { storeId: number; startDate: Date; endDate: Date }): Promise<ReceptionOperationsSnapshot> {
    const [reservations, resources, bookings, beauticians, timeOffs] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { storeId: input.storeId, date: { gte: input.startDate, lte: input.endDate } },
        include: { customer: { select: { name: true } }, project: { select: { name: true } } },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        take: 300,
      }),
      this.prisma.storeResource.findMany({
        where: { storeId: input.storeId, status: 'active' },
        select: { id: true, name: true, type: true },
        take: 100,
      }),
      this.prisma.resourceBooking.findMany({
        where: {
          storeId: input.storeId,
          date: { gte: input.startDate, lte: input.endDate },
          status: 'active',
        },
        select: { resourceId: true },
        take: 500,
      }),
      this.prisma.beautician.findMany({
        where: { storeId: input.storeId, status: 'active' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: 100,
      }),
      this.prisma.beauticianTimeOff.findMany({
        where: {
          storeId: input.storeId,
          date: { gte: input.startDate, lte: input.endDate },
          status: 'approved',
        },
        select: { beauticianId: true },
        take: 500,
      }),
    ]);
    const bookedResourceIds = new Set(bookings.map((booking) => booking.resourceId));
    const pendingStatuses = ['pending', 'confirmed', 'scheduled', '待确认', '已确认'];
    const checkedInStatuses = ['checked_in', 'in_service', 'arrived', 'completed', 'served', '已到店', '服务中', '已完成'];
    const noShowStatuses = ['no_show', 'missed', '爽约', '未到店'];
    const cancelledStatuses = ['cancelled', 'canceled', '已取消'];
    const total = reservations.filter((reservation) => !cancelledStatuses.includes(reservation.status)).length;
    const checkedIn = reservations.filter((reservation) => checkedInStatuses.includes(reservation.status)).length;
    const noShow = reservations.filter((reservation) => noShowStatuses.includes(reservation.status)).length;
    return {
      total,
      checkedIn,
      pendingArrival: reservations.filter((reservation) => pendingStatuses.includes(reservation.status)).length,
      noShow,
      cancelled: reservations.filter((reservation) => cancelledStatuses.includes(reservation.status)).length,
      arrivalRate: total > 0 ? checkedIn / total : 0,
      noShowRate: total > 0 ? noShow / total : 0,
      arrivedCustomers: reservations
        .filter((reservation) => checkedInStatuses.includes(reservation.status))
        .slice(0, 20)
        .map((reservation) => ({
          customerName: reservation.customer.name,
          startTime: reservation.startTime,
          projectName: reservation.project.name,
          status: reservation.status,
        })),
      pendingCustomers: reservations
        .filter((reservation) => pendingStatuses.includes(reservation.status))
        .slice(0, 20)
        .map((reservation) => ({
          customerName: reservation.customer.name,
          startTime: reservation.startTime,
          projectName: reservation.project.name,
          status: reservation.status,
        })),
      resources: resources.map((resource) => ({
        name: resource.name,
        type: resource.type,
        booked: bookedResourceIds.has(resource.id),
      })),
      staff: beauticians.map((beautician) => {
        const appointments = reservations.filter((reservation) => reservation.beauticianId === beautician.id);
        const inServiceRows = appointments.filter((reservation) => checkedInStatuses.includes(reservation.status));
        const onTimeOff = timeOffs.some((timeOff) => timeOff.beauticianId === beautician.id);
        const nextAvailableAt = inServiceRows.map((reservation) => reservation.endTime).filter(Boolean).sort().at(-1) ?? undefined;
        return {
          name: beautician.name,
          appointmentCount: appointments.length,
          inService: inServiceRows.length > 0,
          onTimeOff,
          available: !onTimeOff && inServiceRows.length === 0,
          nextAvailableAt,
        };
      }),
    };
  }

  async buildServiceOverrunAnalysis(input: {
    storeId: number;
    startDate: Date;
    endDate: Date;
    timezone?: string;
  }): Promise<ReceptionServiceOverrunAnalysis> {
    const [tasks, reservations] = await Promise.all([
      this.prisma.serviceTask.findMany({
        where: {
          storeId: input.storeId,
          appointmentTime: { gte: input.startDate, lte: input.endDate },
          startedAt: { not: null },
        },
        include: {
          beautician: { select: { name: true } },
          customer: { select: { name: true } },
          project: { select: { name: true } },
        },
        orderBy: { appointmentTime: 'asc' },
        take: 300,
      }),
      this.prisma.reservation.findMany({
        where: {
          storeId: input.storeId,
          date: { gte: input.startDate, lte: input.endDate },
          beauticianId: { not: null },
          status: { notIn: ['cancelled', 'canceled', '已取消'] },
        },
        include: {
          customer: { select: { name: true } },
          project: { select: { name: true } },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        take: 500,
      }),
    ]);

    const now = new Date();
    const timezone = input.timezone ?? 'Asia/Shanghai';
    const items = tasks.flatMap((task) => {
      const plannedEnd = new Date(task.appointmentTime.getTime() + task.duration * 60_000);
      const actualEnd = task.completedAt ?? (task.startedAt && now <= input.endDate ? now : undefined);
      if (!actualEnd || actualEnd.getTime() <= plannedEnd.getTime()) return [];

      const overrunMinutes = Math.ceil((actualEnd.getTime() - plannedEnd.getTime()) / 60_000);
      const impacted = reservations.find((reservation) => {
        if (reservation.beauticianId !== task.beauticianId) return false;
        const reservationStart = this.reservationStartAt(reservation.date, reservation.startTime, timezone);
        return reservationStart.getTime() >= plannedEnd.getTime() && reservationStart.getTime() < actualEnd.getTime();
      });

      return [
        {
          taskId: task.id,
          beauticianName: task.beautician?.name ?? '未分配美容师',
          customerName: task.customer.name,
          projectName: task.project.name,
          plannedEnd: this.formatTime(plannedEnd, timezone),
          actualEnd: this.formatTime(actualEnd, timezone),
          overrunMinutes,
          impactedReservation: impacted
            ? {
                startTime: impacted.startTime,
                customerName: impacted.customer.name,
                projectName: impacted.project.name,
              }
            : undefined,
        },
      ];
    });

    return {
      overrunCount: items.length,
      impactedCount: items.filter((item) => item.impactedReservation).length,
      items,
    };
  }

  async buildCatalogSnapshot(input: { storeId: number; now: Date }): Promise<ReceptionCatalogSnapshot> {
    const [cards, promotions] = await Promise.all([
      this.prisma.card.findMany({
        where: { status: 'active', OR: [{ storeId: input.storeId }, { storeId: null }] },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        select: { name: true, totalTimes: true, price: true, validDays: true },
        take: 30,
      }),
      this.prisma.promotion.findMany({
        where: {
          status: 'active',
          approvalStatus: 'approved',
          OR: [{ storeId: input.storeId }, { storeId: null }],
          AND: [{ OR: [{ startAt: null }, { startAt: { lte: input.now } }] }, { OR: [{ endAt: null }, { endAt: { gte: input.now } }] }],
        },
        orderBy: { createdAt: 'desc' },
        select: { name: true, discountText: true, endAt: true },
        take: 30,
      }),
    ]);
    return {
      cards: cards.map((card) => ({ ...card, price: this.toNumber(card.price) })),
      promotions: promotions.map((promotion) => ({
        name: promotion.name,
        discountText: promotion.discountText,
        endAt: promotion.endAt?.toISOString().slice(0, 10),
      })),
    };
  }

  private toNumber(value: unknown) {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') return Number(value);
    if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
    return 0;
  }

  private reservationStartAt(date: Date, startTime: string, timezone: string) {
    const [hours = 0, minutes = 0] = startTime.split(':').map(Number);
    const offsetMinutes = timezone === 'Asia/Shanghai' ? 8 * 60 : 0;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes) - offsetMinutes * 60_000);
  }

  private formatTime(date: Date, timezone: string) {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }
}
