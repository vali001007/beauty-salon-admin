import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { formatBusinessDate, toBusinessDateOnly } from '../common/utils/business-time.js';
import { CustomerWaitingService } from './customer-waiting.service.js';
import {
  buildReservationCreationFingerprint,
  buildReservationIdempotencyKey,
  normalizeReservationBookingSource,
} from './reservation-idempotency.js';

export interface ReservationCreateResult {
  reservation: { id: number; storeId: number; [key: string]: unknown };
  replayed: boolean;
}

@Injectable()
export class ReservationsService {
  constructor(private prisma: PrismaService, private readonly customerWaiting: CustomerWaitingService) {}

  async findPaginated(query: {
    page?: number;
    pageSize?: number;
    storeId?: number;
    status?: string;
    date?: string;
    startDate?: string;
    endDate?: string;
    storeName?: string;
    userName?: string;
    projectName?: string;
    beauticianName?: string;
    scope?: string;
  }) {
    const page = Number(query.page || 1);
    const pageSize = Number(query.pageSize || 20);
    const { storeId, status, date, startDate, endDate, storeName, userName, projectName, beauticianName, scope } = query;
    const where: any = {};
    if (storeId) where.storeId = storeId;
    if (status) where.status = status;
    if (date) {
      const start = toBusinessDateOnly(date);
      if (!Number.isNaN(start.getTime())) {
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        where.date = { gte: start, lt: end };
      }
    } else if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = toBusinessDateOnly(startDate);
      if (endDate) {
        const end = toBusinessDateOnly(endDate);
        end.setDate(end.getDate() + 1);
        end.setMilliseconds(end.getMilliseconds() - 1);
        where.date.lte = end;
      }
    }
    const today = toBusinessDateOnly(new Date());
    if (scope === 'future') {
      where.date = where.date ?? {};
      const currentGte = where.date.gte instanceof Date ? where.date.gte : null;
      where.date.gte = currentGte && currentGte > today ? currentGte : today;
    } else if (scope === 'history') {
      where.date = where.date ?? {};
      const beforeToday = new Date(today);
      beforeToday.setMilliseconds(beforeToday.getMilliseconds() - 1);
      const currentLte = where.date.lte instanceof Date ? where.date.lte : null;
      where.date.lte = currentLte && currentLte < beforeToday ? currentLte : beforeToday;
    }
    if (storeName) where.store = { name: { contains: storeName } };
    if (userName) where.customer = { name: { contains: userName } };
    if (projectName) where.project = { name: { contains: projectName } };
    if (beauticianName) where.beautician = { name: { contains: beauticianName } };

    const [items, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: scope === 'future'
          ? [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }]
          : [{ date: 'desc' }, { startTime: 'desc' }, { id: 'desc' }],
        include: { store: true, customer: true, project: true, beautician: true, waitingEpisodes: { where: { status: 'waiting' }, take: 1, orderBy: { startedAt: 'desc' } } },
      }),
      this.prisma.reservation.count({ where }),
    ]);
    const mapped = items.map((item) => this.mapReservation(item));
    return { items: mapped, data: mapped, total, page, pageSize };
  }

  async create(data: any) {
    return (await this.createIdempotent(data)).reservation;
  }

  async recoverIdempotentCreate(data: any): Promise<ReservationCreateResult | undefined> {
    const storeId = Number(data.storeId);
    if (!storeId) throw new BadRequestException('请选择预约门店');
    const bookingSource = normalizeReservationBookingSource(data.bookingSource);
    const idempotencyKey = buildReservationIdempotencyKey(storeId, bookingSource, data.idempotencyKey);
    const creationFingerprint = buildReservationCreationFingerprint({ ...data, storeId, bookingSource });
    if (!idempotencyKey) return undefined;
    const existing = await this.prisma.reservation.findUnique({
      where: { idempotencyKey },
      include: this.reservationInclude(),
    });
    if (!existing) return undefined;
    this.assertIdempotentReservationMatches(existing, bookingSource, creationFingerprint);
    return { reservation: this.mapReservation(existing), replayed: true };
  }

  async createIdempotent(data: any): Promise<ReservationCreateResult> {
    const storeId = Number(data.storeId);
    if (!storeId) throw new BadRequestException('请选择预约门店');
    const bookingSource = normalizeReservationBookingSource(data.bookingSource);
    const idempotencyKey = buildReservationIdempotencyKey(storeId, bookingSource, data.idempotencyKey);
    const creationFingerprint = buildReservationCreationFingerprint({ ...data, storeId, bookingSource });

    return this.prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))`);
        const existing = await tx.reservation.findUnique({
          where: { idempotencyKey },
          include: this.reservationInclude(),
        });
        if (existing) {
          this.assertIdempotentReservationMatches(existing, bookingSource, creationFingerprint);
          return { reservation: this.mapReservation(existing), replayed: true };
        }
      }

      const createData = await this.buildCreateData({ ...data, storeId }, tx);
      const created = await tx.reservation.create({
        data: { ...createData, bookingSource, idempotencyKey, creationFingerprint },
        include: this.reservationInclude(),
      });
      return { reservation: this.mapReservation(created), replayed: false };
    });
  }

  async findById(id: number) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: { store: true, customer: true, project: true, beautician: true, waitingEpisodes: { where: { status: 'waiting' }, take: 1, orderBy: { startedAt: 'desc' } } },
    });
    if (!reservation) throw new NotFoundException('预约不存在');
    return this.mapReservation(reservation);
  }

  async update(id: number, data: any) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException('预约不存在');
    const updateData = await this.buildUpdateData(reservation, data);
    const updated = await this.prisma.reservation.update({
      where: { id },
      data: updateData,
      include: { store: true, customer: true, project: true, beautician: true, waitingEpisodes: { where: { status: 'waiting' }, take: 1, orderBy: { startedAt: 'desc' } } },
    });
    return this.mapReservation(updated);
  }

  async confirm(id: number) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException('预约不存在');
    if (!['pending', 'confirmed'].includes(this.getEffectiveStatus(reservation))) throw new BadRequestException('当前预约状态不能确认');
    const updated = await this.prisma.reservation.update({
      where: { id },
      data: { status: 'confirmed' },
      include: { store: true, customer: true, project: true, beautician: true },
    });
    return this.mapReservation(updated);
  }

  async checkIn(id: number, storeId?: number, userId?: number) {
    const reservation = await this.prisma.reservation.findFirst({ where: { id, ...(storeId ? { storeId } : {}) } });
    if (!reservation) throw new NotFoundException('预约不存在');
    if (!['pending', 'confirmed'].includes(this.getEffectiveStatus(reservation))) throw new BadRequestException('当前预约状态不能到店');
    const updated = await this.prisma.reservation.update({
      where: { id },
      data: { status: 'checked_in', checkedInAt: new Date() },
      include: { store: true, customer: true, project: true, beautician: true },
    });
    await this.customerWaiting.startForReservation(updated.storeId, userId, updated.id, undefined, 'reservation_check_in');
    return this.findById(updated.id);
  }

  async cancel(id: number, reason?: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException('预约不存在');
    if (['completed', 'cancelled'].includes(this.getEffectiveStatus(reservation))) throw new BadRequestException('当前预约状态不能取消');
    const updated = await this.prisma.reservation.update({
      where: { id },
      data: { status: 'cancelled', remark: reason || reservation.remark },
      include: { store: true, customer: true, project: true, beautician: true },
    });
    return this.mapReservation(updated);
  }

  private async buildUpdateData(reservation: any, data: any) {
    const updateData: any = {};
    if (data.status) updateData.status = data.status;
    if (data.remark !== undefined) updateData.remark = data.remark;
    if (data.beauticianId !== undefined) updateData.beauticianId = data.beauticianId ? Number(data.beauticianId) : null;

    if (data.projectId !== undefined) {
      updateData.projectId = Number(data.projectId);
    } else if (data.projectName) {
      const project = await this.prisma.project.findFirst({
        where: { storeId: reservation.storeId, name: { contains: data.projectName }, deletedAt: null },
      });
      if (project) updateData.projectId = project.id;
    }

    if (data.beauticianName && data.beauticianId === undefined) {
      const beautician = await this.prisma.beautician.findFirst({
        where: { storeId: reservation.storeId, name: { contains: data.beauticianName } },
      });
      if (beautician) updateData.beauticianId = beautician.id;
    }

    const appointmentTime = data.appointmentTime || data.date;
    if (appointmentTime) {
      const appointment = new Date(appointmentTime);
      if (Number.isNaN(appointment.getTime())) throw new BadRequestException('预约时间无效');
      updateData.date = appointment;
      updateData.startTime = appointment.toTimeString().slice(0, 5);
      const end = new Date(appointment);
      end.setMinutes(end.getMinutes() + Number(data.duration || 60));
      updateData.endTime = end.toTimeString().slice(0, 5);
    }

    return updateData;
  }

  private async buildCreateData(data: any, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const storeId = Number(data.storeId);
    if (!storeId) throw new BadRequestException('请选择预约门店');

    const appointmentTime = data.appointmentTime || data.date;
    const appointment = new Date(appointmentTime);
    if (Number.isNaN(appointment.getTime())) throw new BadRequestException('预约时间无效');

    let customer = data.customerId
      ? await db.customer.findFirst({ where: { id: Number(data.customerId), storeId, deletedAt: null } })
      : null;
    if (!customer && data.allowCreateCustomer) {
      customer = await db.customer.create({
        data: {
          storeId,
          name: String(data.customerName || '新客户'),
          phone: String(data.customerPhone || ''),
          gender: '女',
          source: normalizeReservationBookingSource(data.bookingSource),
        },
      });
    }
    if (!customer) throw new BadRequestException('预约客户不属于当前门店');

    let project = data.projectId
      ? await db.project.findFirst({ where: { id: Number(data.projectId), storeId, deletedAt: null } })
      : data.projectName
        ? await db.project.findFirst({ where: { storeId, name: { contains: String(data.projectName) }, deletedAt: null } })
        : null;
    if (!project && data.allowDefaultProject) {
      project = await db.project.findFirst({ where: { storeId, deletedAt: null, status: 'active' } });
    }
    if (!project) throw new BadRequestException('预约项目不属于当前门店');

    let beauticianId: number | null = data.beauticianId ? Number(data.beauticianId) : null;
    if (beauticianId) {
      const beautician = await db.beautician.findFirst({ where: { id: beauticianId, storeId } });
      if (!beautician) throw new BadRequestException('预约美容师不属于当前门店');
    } else if (data.beauticianName) {
      const beautician = await db.beautician.findFirst({
        where: { storeId, name: { contains: String(data.beauticianName) }, status: 'active' },
      });
      beauticianId = beautician?.id ?? null;
    }

    const duration = Number(data.duration || project.duration || 60);
    const end = new Date(appointment);
    end.setMinutes(end.getMinutes() + duration);

    return {
      storeId,
      customerId: customer.id,
      projectId: project.id,
      beauticianId,
      date: appointment,
      startTime: data.startTime || appointment.toTimeString().slice(0, 5),
      endTime: data.endTime || end.toTimeString().slice(0, 5),
      status: data.status || 'pending',
      remark: data.remark || null,
    };
  }

  private toIso(value?: Date | string | null) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString();
  }

  private getEffectiveStatus(reservation: any) {
    const status = String(reservation.status || 'pending');
    if (status === 'completed' && this.isFutureReservation(reservation)) {
      return 'pending';
    }
    return status;
  }

  private isFutureReservation(reservation: any) {
    const dateText = formatBusinessDate(reservation.date);
    const appointment = new Date(`${dateText}T${reservation.startTime || '00:00'}:00`);
    return !Number.isNaN(appointment.getTime()) && appointment.getTime() > Date.now();
  }

  private mapReservation(reservation: any) {
    const dateText = formatBusinessDate(reservation.date);
    const appointmentTime = `${dateText} ${reservation.startTime || '00:00'}:00`;
    const createdAt = this.toIso(reservation.createdAt);
    const projectDuration = Number(reservation.project?.duration ?? 60);

    return {
      id: reservation.id,
      reservationNo: `R${String(reservation.id).padStart(6, '0')}`,
      storeId: reservation.storeId,
      storeName: reservation.store?.name ?? '',
      customerId: reservation.customerId,
      customerName: reservation.customer?.name ?? '',
      userName: reservation.customer?.name ?? '',
      customerPhone: reservation.customer?.phone ?? '',
      projectId: reservation.projectId,
      projectName: reservation.project?.name ?? '',
      beauticianId: reservation.beauticianId ?? undefined,
      beauticianName: reservation.beautician?.name ?? '待分配',
      appointmentTime,
      date: dateText,
      time: reservation.startTime || '',
      duration: projectDuration,
      status: this.getEffectiveStatus(reservation),
      bookingSource: reservation.bookingSource || 'manual',
      remark: reservation.remark ?? '',
      createTime: createdAt,
      createdAt,
      checkedInAt: this.toIso(reservation.checkedInAt) || undefined,
      waitingEpisodeId: reservation.waitingEpisodes?.[0]?.id ?? undefined,
      waitingStartedAt: this.toIso(reservation.waitingEpisodes?.[0]?.startedAt) || undefined,
    };
  }

  private reservationInclude() {
    return {
      store: true,
      customer: true,
      project: true,
      beautician: true,
      waitingEpisodes: { where: { status: 'waiting' }, take: 1, orderBy: { startedAt: 'desc' as const } },
    };
  }

  private assertIdempotentReservationMatches(existing: any, bookingSource: string, creationFingerprint: string) {
    const mismatch =
      normalizeReservationBookingSource(existing.bookingSource) !== bookingSource ||
      typeof existing.creationFingerprint !== 'string' ||
      existing.creationFingerprint !== creationFingerprint;
    if (mismatch) throw new ConflictException('幂等键已用于另一笔预约，请核对原预约记录');
  }
}
