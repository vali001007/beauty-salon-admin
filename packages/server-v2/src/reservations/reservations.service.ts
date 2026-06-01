import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ReservationsService {
  constructor(private prisma: PrismaService) {}

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
  }) {
    const page = Number(query.page || 1);
    const pageSize = Number(query.pageSize || 20);
    const { storeId, status, date, startDate, endDate, storeName, userName, projectName, beauticianName } = query;
    const where: any = {};
    if (storeId) where.storeId = storeId;
    if (status) where.status = status;
    if (date) {
      const start = new Date(date);
      if (!Number.isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        where.date = { gte: start, lt: end };
      }
    } else if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.date.lte = end;
      }
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
        orderBy: { date: 'desc' },
        include: { store: true, customer: true, project: true, beautician: true },
      }),
      this.prisma.reservation.count({ where }),
    ]);
    const mapped = items.map((item) => this.mapReservation(item));
    return { items: mapped, data: mapped, total, page, pageSize };
  }

  async create(data: any) {
    const createData = await this.buildCreateData(data);
    const created = await this.prisma.reservation.create({ data: createData });
    return this.findById(created.id);
  }

  async findById(id: number) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: { store: true, customer: true, project: true, beautician: true },
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
      include: { store: true, customer: true, project: true, beautician: true },
    });
    return this.mapReservation(updated);
  }

  async confirm(id: number) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException('预约不存在');
    if (!['pending', 'confirmed'].includes(reservation.status)) throw new BadRequestException('当前预约状态不能确认');
    const updated = await this.prisma.reservation.update({
      where: { id },
      data: { status: 'confirmed' },
      include: { store: true, customer: true, project: true, beautician: true },
    });
    return this.mapReservation(updated);
  }

  async checkIn(id: number) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException('预约不存在');
    if (!['pending', 'confirmed'].includes(reservation.status)) throw new BadRequestException('当前预约状态不能到店');
    return this.prisma.reservation.update({
      where: { id },
      data: { status: 'checked_in', checkedInAt: new Date() },
      include: { store: true, customer: true, project: true, beautician: true },
    }).then((item) => this.mapReservation(item));
  }

  async cancel(id: number, reason?: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException('预约不存在');
    if (['completed', 'cancelled'].includes(reservation.status)) throw new BadRequestException('当前预约状态不能取消');
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

  private async buildCreateData(data: any) {
    const storeId = Number(data.storeId);
    const customerId = Number(data.customerId);
    const projectId = Number(data.projectId);
    if (!storeId) throw new BadRequestException('请选择预约门店');
    if (!customerId) throw new BadRequestException('请选择预约客户');
    if (!projectId) throw new BadRequestException('请选择预约项目');

    const appointmentTime = data.appointmentTime || data.date;
    const appointment = new Date(appointmentTime);
    if (Number.isNaN(appointment.getTime())) throw new BadRequestException('预约时间无效');

    const project = await this.prisma.project.findFirst({ where: { id: projectId, storeId, deletedAt: null } });
    if (!project) throw new BadRequestException('预约项目不属于当前门店');
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, storeId, deletedAt: null } });
    if (!customer) throw new BadRequestException('预约客户不属于当前门店');

    let beauticianId: number | null = data.beauticianId ? Number(data.beauticianId) : null;
    if (beauticianId) {
      const beautician = await this.prisma.beautician.findFirst({ where: { id: beauticianId, storeId } });
      if (!beautician) throw new BadRequestException('预约美容师不属于当前门店');
    }

    const duration = Number(data.duration || project.duration || 60);
    const end = new Date(appointment);
    end.setMinutes(end.getMinutes() + duration);

    return {
      storeId,
      customerId,
      projectId,
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

  private mapReservation(reservation: any) {
    const dateText = this.toIso(reservation.date).slice(0, 10);
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
      status: reservation.status,
      remark: reservation.remark ?? '',
      createTime: createdAt,
      createdAt,
      checkedInAt: this.toIso(reservation.checkedInAt) || undefined,
    };
  }
}
