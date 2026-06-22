import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CardsService {
  constructor(private prisma: PrismaService) {}

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  private createStockMovementNo(prefix = 'SM') {
    return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private async consumeProjectBomForCardUsage(
    tx: any,
    params: {
      storeId: number;
      projectName: string;
      projectId?: number;
      times: number;
      recordId: number;
      cardName: string;
    },
  ) {
    if (!params.storeId || !params.projectName || params.times <= 0) return;

    const project = await tx.project.findFirst({
      where: {
        storeId: params.storeId,
        deletedAt: null,
        ...(params.projectId ? { id: params.projectId } : { name: params.projectName }),
      },
      select: { id: true, name: true },
    });
    if (!project) return;

    const bomItems = await tx.projectBomItem.findMany({
      where: { projectId: project.id },
      select: { productId: true, standardQty: true },
    });
    for (const bomItem of bomItems) {
      const quantity = this.toNumber(bomItem.standardQty) * params.times;
      if (quantity <= 0) continue;

      const product = await tx.product.findFirst({
        where: { id: bomItem.productId, storeId: params.storeId, deletedAt: null },
      });
      if (!product) continue;

      const beforeStock = this.toNumber(product.currentStock);
      const afterStock = beforeStock - quantity;
      await tx.product.update({
        where: { id: product.id },
        data: { currentStock: { decrement: quantity } },
      });
      await tx.stockMovement.create({
        data: {
          storeId: params.storeId,
          productId: product.id,
          movementNo: this.createStockMovementNo('SM'),
          movementType: 'service_consume',
          quantity: -quantity,
          beforeStock,
          afterStock,
          unit: product.unit,
          sourceType: 'card_usage',
          sourceId: params.recordId,
          sourceNo: params.cardName,
          remark: `次卡核销自动扣耗材：${project.name}`,
        },
      });
    }
  }

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

  async createCustomerCard(data: any, operatorId?: number) {
    const cardId = Number(data.cardId);
    if (!cardId) throw new BadRequestException('请选择次卡');

    let customerId = Number(data.customerId ?? data.userId);
    let customer = customerId
      ? await this.prisma.customer.findUnique({ where: { id: customerId } })
      : null;
    const customerName = String(data.customerName ?? data.userName ?? '').trim();
    if (!customer && customerName) {
      customer = await this.prisma.customer.findFirst({ where: { name: customerName } });
    }
    if (!customer) throw new BadRequestException('请选择客户');
    customerId = customer.id;

    const card = await this.prisma.card.findUnique({ where: { id: cardId } });
    if (!card) throw new NotFoundException('次卡不存在');

    const expiryDate = data.expiryDate ?? data.expireTime
      ? new Date(data.expiryDate ?? data.expireTime)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const totalTimes = Number(data.totalTimes ?? card.totalTimes ?? 0);

    return this.prisma.customerCard.create({
      data: {
        customerId,
        cardId,
        operatorId: operatorId || undefined,
        cardName: data.cardName ?? card.name,
        totalTimes,
        remainingTimes: Number(data.remainingTimes ?? totalTimes),
        expiryDate,
        status: data.status ?? 'active',
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        card: { select: { id: true, price: true, totalTimes: true, projects: true } },
        operator: { select: { id: true, name: true, username: true } },
      },
    });
  }

  async verifyCardUsage(data: {
    cardOrderId?: string | number;
    customerCardId?: string | number;
    customerId?: number;
    cardName?: string;
    projectName: string;
    times?: number;
    consumedTimes?: number;
    operatorId?: number;
    beauticianId?: number;
    deviceId?: number;
  }) {
    const customerCardId = Number(data.customerCardId ?? data.cardOrderId ?? 0);
    const times = Number(data.times ?? data.consumedTimes ?? 1);
    if (!data.projectName) throw new BadRequestException('请选择消费项目');
    if (!Number.isFinite(times) || times <= 0) throw new BadRequestException('核销次数必须大于 0');

    return this.prisma.$transaction(async (tx) => {
      const customerCard = await tx.customerCard.findFirst({
        where: customerCardId
          ? { id: customerCardId, status: 'active' }
          : { customerId: Number(data.customerId), cardName: data.cardName, status: 'active' },
        include: {
          customer: { select: { name: true, storeId: true } },
          card: { select: { projects: true } },
        },
      });
      if (!customerCard) throw new NotFoundException('未找到有效次卡');
      if (customerCard.remainingTimes < times) {
        throw new BadRequestException('次卡剩余次数不足');
      }

      const projects = Array.isArray(customerCard.card?.projects) ? customerCard.card.projects : [];
      const matchedProject = projects.find((project: any) => {
        const projectName = String(project.projectName ?? project.name ?? '').trim();
        return projectName === data.projectName;
      });
      if (!matchedProject) {
        throw new BadRequestException('消费项目不属于当前次卡，请选择本卡配置的项目');
      }

      const projectTotalTimes = Number((matchedProject as any).timesPerCard ?? (matchedProject as any).totalCount ?? customerCard.totalTimes ?? 0);
      const usedProjectTimes = await tx.cardUsageRecord.aggregate({
        where: {
          customerId: customerCard.customerId,
          cardName: customerCard.cardName,
          projectName: data.projectName,
          verifiedAt: {
            gte: customerCard.createdAt,
            lte: customerCard.expiryDate,
          },
        },
        _sum: { times: true },
      });
      const projectRemainingTimes = Math.max(projectTotalTimes - Number(usedProjectTimes._sum.times ?? 0), 0);
      if (projectRemainingTimes < times) {
        throw new BadRequestException('该项目剩余次数不足');
      }

      const updatedCard = await tx.customerCard.update({
        where: { id: customerCard.id },
        data: { remainingTimes: customerCard.remainingTimes - times },
      });

      const record = await tx.cardUsageRecord.create({
        data: {
          customerId: customerCard.customerId,
          customerName: customerCard.customer?.name ?? '',
          cardName: customerCard.cardName,
          projectName: data.projectName,
          times,
          remainingTimes: updatedCard.remainingTimes,
          operatorId: data.operatorId,
          beauticianId: data.beauticianId,
          deviceId: data.deviceId,
        },
      });

      await this.consumeProjectBomForCardUsage(tx, {
        storeId: customerCard.customer.storeId,
        projectName: data.projectName,
        projectId: this.toNumber((matchedProject as any).projectId ?? (matchedProject as any).id) || undefined,
        times,
        recordId: record.id,
        cardName: customerCard.cardName,
      });

      return record;
    });
  }
}
