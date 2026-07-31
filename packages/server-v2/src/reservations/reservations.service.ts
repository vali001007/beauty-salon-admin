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
import {
  assertReservationWindowAvailable,
  normalizeReservationWindow,
  reservationWindowLockKey,
} from './reservation-window-policy.js';
import {
  buildBusinessMutationReceipt,
  buildBusinessMutationRequestFingerprint,
  buildBusinessMutationStateFingerprint,
  businessMutationChangedFields,
  restoreBusinessMutationReceipt,
  type BusinessMutationContext,
  type BusinessMutationReceipt,
} from '../common/mutation-receipt.js';
import {
  beginBusinessDatabaseWriteSet,
  finalizeBusinessDatabaseWriteSet,
  loadBusinessDatabaseWriteSet,
  type BusinessDatabaseWriteSetContext,
  type BusinessDatabaseWriteSetEvidence,
} from '../common/database-write-set.js';

export interface ReservationCreateResult {
  reservation: { id: number; storeId: number; [key: string]: unknown };
  replayed: boolean;
  databaseWriteSet?: BusinessDatabaseWriteSetEvidence;
}

export interface ReservationMutationResult {
  id: number;
  storeId: number;
  mutationReceipt?: BusinessMutationReceipt;
  mutationReplayed?: boolean;
  databaseWriteSet?: BusinessDatabaseWriteSetEvidence;
  [key: string]: unknown;
}

@Injectable()
export class ReservationsService {
  constructor(
    private prisma: PrismaService,
    private readonly customerWaiting: CustomerWaitingService,
  ) {}

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
    const { storeId, status, date, startDate, endDate, storeName, userName, projectName, beauticianName, scope } =
      query;
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
        orderBy:
          scope === 'future'
            ? [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }]
            : [{ date: 'desc' }, { startTime: 'desc' }, { id: 'desc' }],
        include: {
          store: true,
          customer: true,
          project: true,
          beautician: true,
          waitingEpisodes: { where: { status: 'waiting' }, take: 1, orderBy: { startedAt: 'desc' } },
        },
      }),
      this.prisma.reservation.count({ where }),
    ]);
    const mapped = items.map((item) => this.mapReservation(item));
    return { items: mapped, data: mapped, total, page, pageSize };
  }

  async create(data: any) {
    const result = await this.createIdempotent(data);
    return {
      ...result.reservation,
      ...(result.databaseWriteSet ? { databaseWriteSet: result.databaseWriteSet } : {}),
    };
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
    const databaseWriteSetContext = this.optionalDatabaseWriteSetContext(data.databaseWriteSetContext, storeId);

    return this.prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))`);
        const existing = await tx.reservation.findUnique({
          where: { idempotencyKey },
          include: this.reservationInclude(),
        });
        if (existing) {
          this.assertIdempotentReservationMatches(existing, bookingSource, creationFingerprint);
          const databaseWriteSet = databaseWriteSetContext
            ? await loadBusinessDatabaseWriteSet(tx, databaseWriteSetContext)
            : undefined;
          return {
            reservation: this.mapReservation(existing),
            replayed: true,
            ...(databaseWriteSet ? { databaseWriteSet } : {}),
          };
        }
      }

      const writeSet = databaseWriteSetContext
        ? await beginBusinessDatabaseWriteSet(tx, databaseWriteSetContext)
        : undefined;
      const createData = await this.buildCreateData({ ...data, storeId }, tx);
      const created = await tx.reservation.create({
        data: { ...createData, bookingSource, idempotencyKey, creationFingerprint },
        include: this.reservationInclude(),
      });
      const databaseWriteSet = writeSet ? await finalizeBusinessDatabaseWriteSet(tx, writeSet.writeSetId) : undefined;
      return {
        reservation: this.mapReservation(created),
        replayed: false,
        ...(databaseWriteSet ? { databaseWriteSet } : {}),
      };
    });
  }

  async findById(id: number) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        store: true,
        customer: true,
        project: true,
        beautician: true,
        waitingEpisodes: { where: { status: 'waiting' }, take: 1, orderBy: { startedAt: 'desc' } },
      },
    });
    if (!reservation) throw new NotFoundException('预约不存在');
    return this.mapReservation(reservation);
  }

  async update(id: number, data: any): Promise<ReservationMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { id } });
      if (!reservation) throw new NotFoundException('预约不存在');
      const mutationContext = this.mutationContext(data.mutationContext);
      const expectedUpdatedAt = this.optionalTimestamp(data.expectedUpdatedAt);
      if (mutationContext && !expectedUpdatedAt) {
        throw new BadRequestException('mutation_receipt_expected_version_required');
      }
      const requestFingerprint = mutationContext
        ? buildBusinessMutationRequestFingerprint({
            capabilityKey: mutationContext.capabilityKey,
            storeId: reservation.storeId,
            businessObjectType: 'reservation',
            businessObjectId: reservation.id,
            requestPayload: mutationContext.requestPayload,
          })
        : undefined;
      if (mutationContext && requestFingerprint) {
        await this.lockBusinessMutation(tx, reservation.storeId, mutationContext);
        const replay = await this.replayBusinessMutation(tx, reservation, mutationContext, requestFingerprint);
        if (replay) return replay;
      }
      const updateData = await this.buildUpdateData(reservation, data, tx);
      const writeSet = mutationContext
        ? await beginBusinessDatabaseWriteSet(tx, {
            storeId: reservation.storeId,
            capabilityKey: mutationContext.capabilityKey,
            idempotencyKey: mutationContext.idempotencyKey,
          })
        : undefined;
      let updated: any;
      if (expectedUpdatedAt) {
        const claimed = await tx.reservation.updateMany({
          where: { id, updatedAt: expectedUpdatedAt },
          data: updateData,
        });
        if (claimed.count !== 1) throw new ConflictException('预约已发生变化，请重新确认后再操作');
        updated = await tx.reservation.findUnique({ where: { id }, include: this.reservationInclude() });
        if (!updated) throw new NotFoundException('预约不存在');
      } else {
        updated = await tx.reservation.update({
          where: { id },
          data: updateData,
          include: this.reservationInclude(),
        });
      }
      const mapped = this.mapReservation(updated);
      if (!mutationContext || !requestFingerprint) return mapped;
      const mutationReceipt = await this.persistBusinessMutationReceipt(tx, {
        before: reservation,
        after: updated,
        context: mutationContext,
        requestFingerprint,
      });
      const databaseWriteSet = writeSet ? await finalizeBusinessDatabaseWriteSet(tx, writeSet.writeSetId) : undefined;
      return {
        ...mapped,
        mutationReceipt,
        mutationReplayed: false,
        ...(databaseWriteSet ? { databaseWriteSet } : {}),
      };
    });
  }

  async confirm(id: number) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException('预约不存在');
    if (!['pending', 'confirmed'].includes(this.getEffectiveStatus(reservation)))
      throw new BadRequestException('当前预约状态不能确认');
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
    if (!['pending', 'confirmed'].includes(this.getEffectiveStatus(reservation)))
      throw new BadRequestException('当前预约状态不能到店');
    const updated = await this.prisma.reservation.update({
      where: { id },
      data: { status: 'checked_in', checkedInAt: new Date() },
      include: { store: true, customer: true, project: true, beautician: true },
    });
    await this.customerWaiting.startForReservation(
      updated.storeId,
      userId,
      updated.id,
      undefined,
      'reservation_check_in',
    );
    return this.findById(updated.id);
  }

  async cancel(
    id: number,
    reason?: string,
    expectedUpdatedAtValue?: unknown,
    mutationContextValue?: BusinessMutationContext,
  ): Promise<ReservationMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { id } });
      if (!reservation) throw new NotFoundException('预约不存在');
      const mutationContext = this.mutationContext(mutationContextValue);
      const expectedUpdatedAt = this.optionalTimestamp(expectedUpdatedAtValue);
      if (mutationContext && !expectedUpdatedAt) {
        throw new BadRequestException('mutation_receipt_expected_version_required');
      }
      const requestFingerprint = mutationContext
        ? buildBusinessMutationRequestFingerprint({
            capabilityKey: mutationContext.capabilityKey,
            storeId: reservation.storeId,
            businessObjectType: 'reservation',
            businessObjectId: reservation.id,
            requestPayload: mutationContext.requestPayload,
          })
        : undefined;
      if (mutationContext && requestFingerprint) {
        await this.lockBusinessMutation(tx, reservation.storeId, mutationContext);
        const replay = await this.replayBusinessMutation(tx, reservation, mutationContext, requestFingerprint);
        if (replay) return replay;
      }
      if (['completed', 'cancelled'].includes(this.getEffectiveStatus(reservation))) {
        throw new BadRequestException('当前预约状态不能取消');
      }
      const writeSet = mutationContext
        ? await beginBusinessDatabaseWriteSet(tx, {
            storeId: reservation.storeId,
            capabilityKey: mutationContext.capabilityKey,
            idempotencyKey: mutationContext.idempotencyKey,
          })
        : undefined;
      let updated: any;
      if (expectedUpdatedAt) {
        const claimed = await tx.reservation.updateMany({
          where: { id, updatedAt: expectedUpdatedAt },
          data: { status: 'cancelled', remark: reason || reservation.remark },
        });
        if (claimed.count !== 1) throw new ConflictException('预约已发生变化，请重新确认后再操作');
        updated = await tx.reservation.findUnique({ where: { id }, include: this.reservationInclude() });
        if (!updated) throw new NotFoundException('预约不存在');
      } else {
        updated = await tx.reservation.update({
          where: { id },
          data: { status: 'cancelled', remark: reason || reservation.remark },
          include: this.reservationInclude(),
        });
      }
      const mapped = this.mapReservation(updated);
      if (!mutationContext || !requestFingerprint) return mapped;
      const mutationReceipt = await this.persistBusinessMutationReceipt(tx, {
        before: reservation,
        after: updated,
        context: mutationContext,
        requestFingerprint,
      });
      const databaseWriteSet = writeSet ? await finalizeBusinessDatabaseWriteSet(tx, writeSet.writeSetId) : undefined;
      return {
        ...mapped,
        mutationReceipt,
        mutationReplayed: false,
        ...(databaseWriteSet ? { databaseWriteSet } : {}),
      };
    });
  }

  private async buildUpdateData(
    reservation: any,
    data: any,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const updateData: any = {};
    if (data.status) updateData.status = data.status;
    if (data.remark !== undefined) updateData.remark = data.remark;
    if (data.beauticianId !== undefined) updateData.beauticianId = data.beauticianId ? Number(data.beauticianId) : null;

    if (data.projectId !== undefined) {
      const project = await db.project.findFirst({
        where: { id: Number(data.projectId), storeId: reservation.storeId, deletedAt: null },
      });
      if (!project) throw new BadRequestException('预约项目不属于当前门店');
      updateData.projectId = project.id;
    } else if (data.projectName) {
      const project = await db.project.findFirst({
        where: { storeId: reservation.storeId, name: { contains: data.projectName }, deletedAt: null },
      });
      if (!project) throw new BadRequestException('预约项目不属于当前门店');
      updateData.projectId = project.id;
    }

    if (data.beauticianId) {
      const beautician = await db.beautician.findFirst({
        where: { id: Number(data.beauticianId), storeId: reservation.storeId, status: 'active' },
      });
      if (!beautician) throw new BadRequestException('预约美容师不属于当前门店或已停用');
      updateData.beauticianId = beautician.id;
    }
    if (data.beauticianName && data.beauticianId === undefined) {
      const beautician = await db.beautician.findFirst({
        where: { storeId: reservation.storeId, name: { contains: data.beauticianName }, status: 'active' },
      });
      if (!beautician) throw new BadRequestException('预约美容师不属于当前门店或已停用');
      updateData.beauticianId = beautician.id;
    }

    const windowChanged = [
      'appointmentTime',
      'date',
      'startTime',
      'endTime',
      'duration',
      'beauticianId',
      'beauticianName',
      'projectId',
      'projectName',
    ].some((key) => data[key] !== undefined);
    if (windowChanged) {
      const projectId = Number(updateData.projectId ?? reservation.projectId);
      const project = await db.project.findFirst({
        where: { id: projectId, storeId: reservation.storeId, deletedAt: null },
        select: { duration: true },
      });
      if (!project) throw new BadRequestException('预约项目不属于当前门店');
      const currentAppointment = `${formatBusinessDate(reservation.date)} ${reservation.startTime}:00`;
      const window = normalizeReservationWindow({
        appointmentTime: data.appointmentTime || data.date || currentAppointment,
        startTime: data.startTime,
        endTime: data.endTime,
        duration: data.duration,
        fallbackDuration: project.duration,
      });
      const beauticianId = updateData.beauticianId ?? reservation.beauticianId;
      await this.lockAndAssertReservationWindow(db, {
        ...window,
        storeId: reservation.storeId,
        beauticianId,
        excludeReservationId: reservation.id,
      });
      updateData.date = window.date;
      updateData.startTime = window.startTime;
      updateData.endTime = window.endTime;
    }

    return updateData;
  }

  private async buildCreateData(data: any, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const storeId = Number(data.storeId);
    if (!storeId) throw new BadRequestException('请选择预约门店');

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
        ? await db.project.findFirst({
            where: { storeId, name: { contains: String(data.projectName) }, deletedAt: null },
          })
        : null;
    if (!project && data.allowDefaultProject) {
      project = await db.project.findFirst({ where: { storeId, deletedAt: null, status: 'active' } });
    }
    if (!project) throw new BadRequestException('预约项目不属于当前门店');

    let beauticianId: number | null = data.beauticianId ? Number(data.beauticianId) : null;
    if (beauticianId) {
      const beautician = await db.beautician.findFirst({ where: { id: beauticianId, storeId, status: 'active' } });
      if (!beautician) throw new BadRequestException('预约美容师不属于当前门店或已停用');
    } else if (data.beauticianName) {
      const beautician = await db.beautician.findFirst({
        where: { storeId, name: { contains: String(data.beauticianName) }, status: 'active' },
      });
      beauticianId = beautician?.id ?? null;
    }

    const window = normalizeReservationWindow({
      appointmentTime: data.appointmentTime || data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      duration: data.duration,
      fallbackDuration: project.duration,
    });
    await this.lockAndAssertReservationWindow(db, { ...window, storeId, beauticianId });

    return {
      storeId,
      customerId: customer.id,
      projectId: project.id,
      beauticianId,
      date: window.date,
      startTime: window.startTime,
      endTime: window.endTime,
      status: data.status || 'pending',
      remark: data.remark || null,
    };
  }

  private async lockAndAssertReservationWindow(
    db: Prisma.TransactionClient | PrismaService,
    input: Parameters<typeof assertReservationWindowAvailable>[1],
  ) {
    const lockKey = reservationWindowLockKey(input);
    if (lockKey && '$executeRaw' in db) {
      await db.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    }
    await assertReservationWindowAvailable(db, input);
  }

  private async lockBusinessMutation(tx: Prisma.TransactionClient, storeId: number, context: BusinessMutationContext) {
    const lockKey = `business-mutation:${storeId}:${context.capabilityKey}:${context.idempotencyKey}`;
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
  }

  private async replayBusinessMutation(
    tx: Prisma.TransactionClient,
    reservation: any,
    context: BusinessMutationContext,
    requestFingerprint: string,
  ) {
    const existing = await tx.businessMutationReceipt.findUnique({
      where: {
        storeId_capabilityKey_idempotencyKey: {
          storeId: reservation.storeId,
          capabilityKey: context.capabilityKey,
          idempotencyKey: context.idempotencyKey,
        },
      },
    });
    if (!existing) return undefined;
    if (
      existing.businessObjectType !== 'reservation' ||
      existing.businessObjectId !== String(reservation.id) ||
      existing.requestFingerprint !== requestFingerprint
    ) {
      throw new ConflictException('幂等键已用于另一笔业务变更，请核对原执行记录');
    }
    const current = await tx.reservation.findUnique({
      where: { id: reservation.id },
      include: this.reservationInclude(),
    });
    if (!current) throw new NotFoundException('预约不存在');
    const databaseWriteSet = await loadBusinessDatabaseWriteSet(tx, {
      storeId: reservation.storeId,
      capabilityKey: context.capabilityKey,
      idempotencyKey: context.idempotencyKey,
    });
    return {
      ...this.mapReservation(current),
      mutationReceipt: restoreBusinessMutationReceipt(existing),
      mutationReplayed: true,
      ...(databaseWriteSet ? { databaseWriteSet } : {}),
    };
  }

  private optionalDatabaseWriteSetContext(
    value: unknown,
    expectedStoreId: number,
  ): BusinessDatabaseWriteSetContext | undefined {
    if (value === undefined || value === null) return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('business_database_write_set_context_invalid');
    }
    const input = value as Record<string, unknown>;
    const storeId = Number(input.storeId);
    const capabilityKey = typeof input.capabilityKey === 'string' ? input.capabilityKey.trim() : '';
    const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
    if (storeId !== expectedStoreId || !capabilityKey || !idempotencyKey) {
      throw new BadRequestException('business_database_write_set_context_invalid');
    }
    return { storeId, capabilityKey, idempotencyKey };
  }

  private async persistBusinessMutationReceipt(
    tx: Prisma.TransactionClient,
    input: {
      before: any;
      after: any;
      context: BusinessMutationContext;
      requestFingerprint: string;
    },
  ): Promise<BusinessMutationReceipt> {
    const beforeVersion = this.toIso(input.before.updatedAt);
    const afterVersion = this.toIso(input.after.updatedAt);
    if (!beforeVersion || !afterVersion || beforeVersion === afterVersion) {
      throw new ConflictException('业务对象版本未发生变化，无法生成变更回执');
    }
    const beforeState = this.reservationMutationState(input.before);
    const afterState = this.reservationMutationState(input.after);
    const committedAt = new Date();
    const receipt = buildBusinessMutationReceipt({
      storeId: Number(input.after.storeId),
      context: input.context,
      businessObjectType: 'reservation',
      businessObjectId: input.after.id,
      requestFingerprint: input.requestFingerprint,
      beforeVersion,
      afterVersion,
      beforeStateFingerprint: buildBusinessMutationStateFingerprint({
        businessObjectType: 'reservation',
        businessObjectId: input.before.id,
        version: beforeVersion,
        state: beforeState,
      }),
      afterStateFingerprint: buildBusinessMutationStateFingerprint({
        businessObjectType: 'reservation',
        businessObjectId: input.after.id,
        version: afterVersion,
        state: afterState,
      }),
      changedFields: businessMutationChangedFields(beforeState, afterState),
      committedAt,
    });
    const hasExpectedChange =
      input.context.capabilityKey === 'cancel_reservation'
        ? receipt.changedFields.includes('status')
        : input.context.capabilityKey === 'reschedule_reservation'
          ? receipt.changedFields.some((field) =>
              ['date', 'startTime', 'endTime', 'beauticianId', 'projectId'].includes(field),
            )
          : receipt.changedFields.length > 0;
    if (!hasExpectedChange) {
      throw new ConflictException('业务对象未产生该动作要求的有效变化，无法生成变更回执');
    }
    await tx.businessMutationReceipt.create({
      data: {
        storeId: receipt.storeId,
        capabilityKey: input.context.capabilityKey,
        idempotencyKey: input.context.idempotencyKey,
        businessObjectType: receipt.businessObjectType,
        businessObjectId: receipt.businessObjectId,
        mutationKind: receipt.mutationKind,
        requestFingerprint: receipt.requestFingerprint,
        beforeVersion: receipt.before.version,
        afterVersion: receipt.after.version,
        beforeStateFingerprint: receipt.before.stateFingerprint,
        afterStateFingerprint: receipt.after.stateFingerprint,
        changedFields: [...receipt.changedFields],
        actorId: input.context.actorId,
        receiptFingerprint: receipt.receiptFingerprint,
        committedAt,
      },
    });
    return receipt;
  }

  private reservationMutationState(reservation: any): Record<string, unknown> {
    return {
      storeId: Number(reservation.storeId),
      date: formatBusinessDate(reservation.date),
      startTime: reservation.startTime ?? null,
      endTime: reservation.endTime ?? null,
      beauticianId: reservation.beauticianId ?? null,
      projectId: reservation.projectId,
      status: reservation.status,
      remark: reservation.remark ?? null,
    };
  }

  private mutationContext(value: unknown): BusinessMutationContext | undefined {
    if (value === undefined || value === null) return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('business_mutation_context_invalid');
    }
    const record = value as Record<string, unknown>;
    const capabilityKey = typeof record.capabilityKey === 'string' ? record.capabilityKey.trim() : '';
    const idempotencyKey = typeof record.idempotencyKey === 'string' ? record.idempotencyKey.trim() : '';
    const mutationKind = record.mutationKind;
    const requestPayload = record.requestPayload;
    if (
      !capabilityKey ||
      !idempotencyKey ||
      (mutationKind !== 'update' && mutationKind !== 'state_transition') ||
      !requestPayload ||
      typeof requestPayload !== 'object' ||
      Array.isArray(requestPayload)
    ) {
      throw new BadRequestException('business_mutation_context_invalid');
    }
    const actorId = Number(record.actorId);
    return {
      capabilityKey,
      idempotencyKey,
      mutationKind,
      requestPayload: requestPayload as Record<string, unknown>,
      ...(Number.isInteger(actorId) && actorId > 0 ? { actorId } : {}),
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

  private optionalTimestamp(value: unknown): Date | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new BadRequestException('预约版本时间格式不正确');
    return date;
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
      updatedAt: this.toIso(reservation.updatedAt),
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
