import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CardsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.card.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findById(id: number) {
    const card = await this.prisma.card.findUnique({ where: { id } });
    if (!card) throw new NotFoundException('次卡不存在');
    return card;
  }

  async create(data: any) {
    return this.prisma.card.create({ data });
  }

  async update(id: number, data: any) {
    await this.findById(id);
    return this.prisma.card.update({ where: { id }, data });
  }

  async remove(id: number) {
    await this.findById(id);
    return this.prisma.card.delete({ where: { id } });
  }

  async createCustomerCard(data: any) {
    return this.prisma.customerCard.create({ data });
  }

  async verifyCardUsage(data: { customerId: number; cardName: string; projectName: string; times: number; beauticianId?: number; deviceId?: number }) {
    const customerCard = await this.prisma.customerCard.findFirst({
      where: { customerId: data.customerId, cardName: data.cardName, status: 'active' },
    });
    if (!customerCard) throw new NotFoundException('未找到有效次卡');
    if (customerCard.remainingTimes < data.times) {
      throw new NotFoundException('次卡剩余次数不足');
    }

    await this.prisma.customerCard.update({
      where: { id: customerCard.id },
      data: { remainingTimes: customerCard.remainingTimes - data.times },
    });

    return this.prisma.cardUsageRecord.create({
      data: {
        customerId: data.customerId,
        customerName: '',
        cardName: data.cardName,
        projectName: data.projectName,
        times: data.times,
        remainingTimes: customerCard.remainingTimes - data.times,
        beauticianId: data.beauticianId,
        deviceId: data.deviceId,
      },
    });
  }
}
