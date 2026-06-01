import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SchedulingService {
  constructor(private prisma: PrismaService) {}

  async findAll(storeId?: number, date?: string) {
    const where: any = {};
    if (storeId) where.storeId = storeId;
    if (date) where.date = new Date(date);
    return this.prisma.schedule.findMany({ where, orderBy: { date: 'asc' } });
  }

  async save(schedules: Array<{ storeId: number; beauticianId: number; date: string; startTime: string; endTime: string }>) {
    if (!schedules.length) return [];
    const storeId = schedules[0].storeId;
    const date = new Date(schedules[0].date);

    await this.prisma.schedule.deleteMany({ where: { storeId, date } });
    await this.prisma.schedule.createMany({
      data: schedules.map((s) => ({ ...s, date: new Date(s.date) })),
    });
    return this.findAll(storeId, schedules[0].date);
  }
}
