import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CommissionService } from '../commission/commission.service.js';
import { deductStockItems } from '../common/inventory-stock-deduction.js';
import { normalizeCardMasterName } from './card-master-deduplication.js';
import { buildCardUsageIdempotencyKey } from './card-usage-idempotency.js';

@Injectable()
export class CardsService {
  constructor(
    private prisma: PrismaService,
    private commissionService: CommissionService,
  ) {}

  private toNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  private toNonNegativeStock(value: unknown): number {
    const stock = this.toNumber(value);
    return Number.isFinite(stock) ? Math.max(0, stock) : 0;
  }

  private buildInventoryShortageRemark(baseRemark: string, requestedQty: number, appliedQty: number) {
    if (appliedQty >= requestedQty) return baseRemark;
    return `${baseRemark}；库存不足：本次申请 ${requestedQty}，实际扣减 ${appliedQty}，不足 ${requestedQty - appliedQty}`;
  }

  private createStockMovementNo(prefix = 'SM') {
    return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private roundCurrency(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private assertIdempotentUsageMatches(
    existing: any,
    input: {
      customerCardId: number;
      customerId?: number;
      projectId?: number;
      projectName?: string;
      times: number;
      beauticianId?: number;
    },
  ) {
    const mismatch =
      Number(existing.customerCardId) !== input.customerCardId ||
      (input.customerId !== undefined && Number(existing.customerId) !== input.customerId) ||
      Number(existing.times) !== input.times ||
      (input.projectId !== undefined && Number(existing.projectId) !== input.projectId) ||
      (input.projectName && String(existing.projectName).trim() !== input.projectName) ||
      (input.beauticianId !== undefined && Number(existing.beauticianId) !== input.beauticianId);
    if (mismatch) throw new ConflictException('幂等键已用于另一笔次卡核销，请核对原业务记录');
  }

  private normalizeCardStatus(status: unknown) {
    const value = String(status ?? '').trim();
    if (!value || ['active', 'enabled', '上架', '在售', 'true'].includes(value)) return 'active';
    if (['inactive', 'disabled', '下架', '停售', 'false'].includes(value)) return 'inactive';
    return value;
  }

  private toOptionalPositiveNumber(value: unknown) {
    if (value === null || value === undefined || value === '') return undefined;
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : undefined;
  }

  private resolveCardValidDays(card: any) {
    const validDays = this.toOptionalPositiveNumber(card?.validDays);
    return validDays ?? 365;
  }

  private resolveCardExpiryDate(data: any, card: any) {
    const explicitDate = data.expiryDate ?? data.expireTime;
    if (explicitDate) return new Date(explicitDate);
    return new Date(Date.now() + this.resolveCardValidDays(card) * 24 * 60 * 60 * 1000);
  }

  private buildCardMutationData(data: any, mode: 'create' | 'update') {
    const payload: any = {};
    if (data.name !== undefined) payload.name = String(data.name).trim();
    if (data.description !== undefined) payload.description = data.description ? String(data.description) : null;
    if (data.totalTimes !== undefined) payload.totalTimes = Number(data.totalTimes);
    if (data.price !== undefined) payload.price = Number(data.price);
    if (data.projects !== undefined || mode === 'create') {
      payload.projects = Array.isArray(data.projects) ? data.projects : [];
    }
    if (data.status !== undefined) payload.status = this.normalizeCardStatus(data.status);
    if (data.validDays !== undefined || mode === 'create') {
      payload.validDays = this.toOptionalPositiveNumber(data.validDays) ?? 365;
    }
    if (data.sortOrder !== undefined || data.sort !== undefined) {
      payload.sortOrder = Number(data.sortOrder ?? data.sort) || 0;
    }
    if (data.storeId !== undefined) {
      payload.storeId = this.toOptionalPositiveNumber(data.storeId) ?? null;
    }
    return payload;
  }

  private serializeCard(card: any) {
    const totalTimes = Number(card.totalTimes ?? 0);
    const projects = Array.isArray(card.projects)
      ? card.projects
          .map((project: any) =>
            typeof project === 'string'
              ? { projectName: project, timesPerCard: totalTimes || 1 }
              : {
                  projectName: project.projectName ?? project.name ?? '',
                  timesPerCard: Number(project.timesPerCard ?? project.totalCount ?? (totalTimes || 1)),
                },
          )
          .filter((project: any) => project.projectName)
      : [];
    return {
      id: card.id,
      name: card.name,
      description: card.description ?? '',
      type: '次卡',
      totalTimes,
      price: this.toNumber(card.price),
      validDays: this.resolveCardValidDays(card),
      storeId: card.storeId ?? card.store?.id ?? null,
      storeName: card.store?.name ?? (card.storeId ? '' : '全部门店'),
      status: this.normalizeCardStatus(card.status) === 'active' ? '上架' : '下架',
      sortOrder: Number(card.sortOrder ?? 0),
      createdAt: card.createdAt instanceof Date ? card.createdAt.toISOString() : card.createdAt,
      projects,
    };
  }

  private async findCardOrThrow(id: number) {
    const card = await this.prisma.card.findUnique({
      where: { id },
      include: { store: { select: { id: true, name: true } } },
    });
    if (!card) throw new NotFoundException('次卡不存在');
    return card;
  }

  private async assertUniqueCardName(params: { name: unknown; storeId?: number | null; excludeId?: number }) {
    const normalizedName = normalizeCardMasterName(params.name);
    if (!normalizedName) throw new BadRequestException('请输入次卡名称');
    const candidates = await this.prisma.card.findMany({
      where: {
        storeId: params.storeId ?? null,
        ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
      },
      select: { id: true, name: true },
    });
    const conflict = candidates.find((card) => normalizeCardMasterName(card.name) === normalizedName);
    if (conflict) {
      throw new ConflictException(`同一门店范围已存在同名次卡：#${conflict.id} ${conflict.name}`);
    }
  }

  private buildCardPricingSnapshot(params: {
    card: any;
    paidAmount: number;
    totalTimes: number;
    giftTimes?: number;
    discountAmount?: number;
  }) {
    const totalTimes = Math.max(0, this.toNumber(params.totalTimes));
    const paidAmount = Math.max(0, this.toNumber(params.paidAmount));
    const recognizedUnitValue = totalTimes > 0 ? this.roundCurrency(paidAmount / totalTimes) : 0;
    return {
      cardId: params.card?.id,
      cardName: params.card?.name,
      cardPrice: this.toNumber(params.card?.price),
      paidAmount,
      discountAmount: Math.max(0, this.toNumber(params.discountAmount)),
      totalTimes,
      giftTimes: Math.max(0, this.toNumber(params.giftTimes)),
      recognizedUnitValue,
      projects: Array.isArray(params.card?.projects) ? params.card.projects : [],
    };
  }

  private resolveRecognizedUnitValue(customerCard: any) {
    const snapshotUnit = this.toNumber(customerCard?.recognizedUnitValue);
    if (snapshotUnit > 0) return snapshotUnit;
    const paidAmount = this.toNumber(customerCard?.paidAmount);
    const totalTimes = this.toNumber(customerCard?.totalTimes);
    if (paidAmount > 0 && totalTimes > 0) return this.roundCurrency(paidAmount / totalTimes);
    const cardPrice = this.toNumber(customerCard?.card?.price);
    const cardTimes = this.toNumber(customerCard?.card?.totalTimes ?? totalTimes);
    return cardPrice > 0 && cardTimes > 0 ? this.roundCurrency(cardPrice / cardTimes) : 0;
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
      remark?: string;
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
    await deductStockItems(tx, {
      storeId: params.storeId,
      movementType: 'service_consume',
      source: {
        type: 'card_usage',
        id: params.recordId,
        no: params.cardName,
        remark: params.remark ?? `次卡核销自动扣耗材：${project.name}`,
      },
      items: bomItems.map((bomItem: any) => ({
        productId: bomItem.productId,
        quantity: this.toNumber(bomItem.standardQty) * params.times,
        remark: params.remark ?? `次卡核销自动扣耗材：${project.name}`,
      })),
    });
  }

  async findAll() {
    const cards = await this.prisma.card.findMany({
      include: { store: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return cards.map((card) => this.serializeCard(card));
  }

  async findById(id: number) {
    return this.serializeCard(await this.findCardOrThrow(id));
  }

  async findSaleOptions(params: { storeId?: number; limit?: number } = {}) {
    const storeId = this.toOptionalPositiveNumber(params.storeId);
    const cards = await this.prisma.card.findMany({
      where: {
        status: 'active',
        ...(storeId ? { OR: [{ storeId: null }, { storeId }] } : {}),
      },
      include: { store: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: params.limit ?? 200,
    });
    return cards.map((card) => this.serializeCard(card));
  }

  async create(data: any) {
    const mutationData = this.buildCardMutationData(data, 'create');
    await this.assertUniqueCardName({ name: mutationData.name, storeId: mutationData.storeId });
    const card = await this.prisma.card.create({
      data: mutationData,
      include: { store: { select: { id: true, name: true } } },
    });
    return this.serializeCard(card);
  }

  async update(id: number, data: any) {
    const current = await this.findCardOrThrow(id);
    const mutationData = this.buildCardMutationData(data, 'update');
    await this.assertUniqueCardName({
      name: mutationData.name ?? current.name,
      storeId: mutationData.storeId !== undefined ? mutationData.storeId : current.storeId,
      excludeId: id,
    });
    const card = await this.prisma.card.update({
      where: { id },
      data: mutationData,
      include: { store: { select: { id: true, name: true } } },
    });
    return this.serializeCard(card);
  }

  async remove(id: number) {
    await this.findCardOrThrow(id);
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

    const expiryDate = this.resolveCardExpiryDate(data, card);
    const totalTimes = Number(data.totalTimes ?? card.totalTimes ?? 0);
    const paidAmount = Math.max(0, this.toNumber(data.paidAmount ?? data.amount ?? data.actualPrice ?? card.price));
    const discountAmount = Math.max(0, this.toNumber(card.price) - paidAmount);
    const pricingSnapshot = this.buildCardPricingSnapshot({ card, paidAmount, totalTimes, discountAmount });

    return this.prisma.customerCard.create({
      data: {
        customerId,
        cardId,
        operatorId: operatorId || undefined,
        cardName: data.cardName ?? card.name,
        totalTimes,
        remainingTimes: Number(data.remainingTimes ?? totalTimes),
        paidAmount,
        discountAmount,
        giftTimes: 0,
        recognizedUnitValue: pricingSnapshot.recognizedUnitValue,
        pricingSnapshot,
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
    projectId?: string | number;
    projectName?: string;
    times?: number;
    consumedTimes?: number;
    operatorId?: number;
    beauticianId?: number;
    deviceId?: number;
    remark?: string;
    idempotencyKey?: string;
  }) {
    const customerCardId = Number(data.customerCardId ?? data.cardOrderId ?? 0);
    const times = Number(data.times ?? data.consumedTimes ?? 1);
    const requestedProjectId = this.toOptionalPositiveNumber(data.projectId);
    const requestedProjectName = String(data.projectName ?? '').trim();
    if (!requestedProjectId && !requestedProjectName) throw new BadRequestException('请选择消费项目');
    if (!Number.isFinite(times) || times <= 0) throw new BadRequestException('核销次数必须大于 0');

    return this.prisma.$transaction(async (tx) => {
      let customerCard = await tx.customerCard.findFirst({
        where: customerCardId
          ? { id: customerCardId }
          : { customerId: Number(data.customerId), cardName: data.cardName, status: 'active' },
        include: {
          customer: { select: { name: true, storeId: true } },
          card: { select: { id: true, name: true, price: true, totalTimes: true, projects: true } },
        },
      });
      if (!customerCard) throw new NotFoundException('未找到有效次卡');
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CustomerCard" WHERE "id" = ${customerCard.id} FOR UPDATE`);
      customerCard = await tx.customerCard.findFirst({
        where: { id: customerCard.id },
        include: {
          customer: { select: { name: true, storeId: true } },
          card: { select: { id: true, name: true, price: true, totalTimes: true, projects: true } },
        },
      });
      if (!customerCard) throw new NotFoundException('未找到有效次卡');
      const idempotencyKey = buildCardUsageIdempotencyKey(customerCard.customer.storeId, data.idempotencyKey);
      if (idempotencyKey) {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))`);
        const existing = await tx.cardUsageRecord.findUnique({ where: { idempotencyKey } });
        if (existing) {
          this.assertIdempotentUsageMatches(existing, {
            customerCardId: customerCard.id,
            customerId: data.customerId ? Number(data.customerId) : undefined,
            projectId: requestedProjectId,
            projectName: requestedProjectName || undefined,
            times,
            beauticianId: data.beauticianId,
          });
          return existing;
        }
      }
      if (customerCard.status !== 'active') throw new BadRequestException('次卡未启用');
      if (data.customerId && customerCard.customerId !== Number(data.customerId)) {
        throw new BadRequestException('卡项不属于该客户');
      }
      if (customerCard.expiryDate < new Date()) {
        throw new BadRequestException('次卡已过期');
      }
      if (customerCard.remainingTimes < times) {
        throw new BadRequestException('次卡剩余次数不足');
      }

      const requestedProject = requestedProjectId
        ? await tx.project.findFirst({
            where: { id: requestedProjectId, storeId: customerCard.customer.storeId, deletedAt: null },
            select: { id: true, name: true },
          })
        : null;
      const normalizedRequestedProjectName = requestedProjectName || String(requestedProject?.name ?? '').trim();
      const projects = Array.isArray(customerCard.card?.projects) ? customerCard.card.projects : [];
      const matchedProject = projects.find((project: any) => {
        const projectName = String(project.projectName ?? project.name ?? '').trim();
        const projectId = this.toNumber(project.projectId ?? project.id);
        return (
          (requestedProjectId && projectId === requestedProjectId) ||
          (normalizedRequestedProjectName && projectName === normalizedRequestedProjectName)
        );
      });
      if (!matchedProject) {
        throw new BadRequestException('消费项目不属于当前次卡，请选择本卡配置的项目');
      }
      const matchedProjectName = String((matchedProject as any).projectName ?? (matchedProject as any).name ?? normalizedRequestedProjectName).trim();
      if (!matchedProjectName) throw new BadRequestException('消费项目配置缺少项目名称');

      const projectTotalTimes = Number((matchedProject as any).timesPerCard ?? (matchedProject as any).totalCount ?? customerCard.totalTimes ?? 0);
      const usedProjectTimes = await tx.cardUsageRecord.aggregate({
        where: {
          customerCardId: customerCard.id,
          projectName: matchedProjectName,
        },
        _sum: { times: true },
      });
      const projectRemainingTimes = Math.max(projectTotalTimes - Number(usedProjectTimes._sum.times ?? 0), 0);
      if (projectRemainingTimes < times) {
        throw new BadRequestException('该项目剩余次数不足');
      }

      const beautician = data.beauticianId
        ? await tx.beautician.findFirst({
            where: { id: data.beauticianId, storeId: customerCard.customer.storeId, status: 'active' },
            select: { id: true, levelId: true, userId: true },
          })
        : null;
      if (data.beauticianId && !beautician) {
        throw new BadRequestException('服务人员不属于当前门店或未启用');
      }

      const updatedCard = await tx.customerCard.update({
        where: { id: customerCard.id },
        data: { remainingTimes: customerCard.remainingTimes - times },
      });
      const matchedProjectId =
        requestedProjectId ?? (this.toNumber((matchedProject as any).projectId ?? (matchedProject as any).id) || undefined);
      const cardId = this.toNumber(customerCard.cardId) || this.toNumber(customerCard.card?.id) || undefined;
      const resolvedProject = await tx.project.findFirst({
        where: {
          storeId: customerCard.customer.storeId,
          deletedAt: null,
          OR: [
            ...(matchedProjectId ? [{ id: matchedProjectId }] : []),
            { name: matchedProjectName },
          ],
        },
        select: { id: true, name: true },
      });
      const resolvedProjectId = resolvedProject?.id ?? matchedProjectId;
      const recognizedUnitValue = this.resolveRecognizedUnitValue(customerCard);
      const recognizedAmount = this.roundCurrency(recognizedUnitValue * times);
      const pricingSnapshot =
        customerCard.pricingSnapshot ??
        this.buildCardPricingSnapshot({
          card: { ...customerCard.card, id: cardId, name: customerCard.card?.name ?? customerCard.cardName },
          paidAmount: this.toNumber(customerCard.paidAmount) || this.toNumber(customerCard.card?.price),
          totalTimes: this.toNumber(customerCard.totalTimes),
          discountAmount: this.toNumber(customerCard.discountAmount),
          giftTimes: this.toNumber(customerCard.giftTimes),
        });

      const record = await tx.cardUsageRecord.create({
        data: {
          idempotencyKey,
          customerCardId: customerCard.id,
          cardId,
          projectId: resolvedProjectId,
          storeId: customerCard.customer.storeId,
          customerId: customerCard.customerId,
          customerName: customerCard.customer?.name ?? '',
          cardName: customerCard.cardName,
          projectName: resolvedProject?.name ?? matchedProjectName,
          times,
          remainingTimes: updatedCard.remainingTimes,
          recognizedUnitValue,
          recognizedAmount,
          sourceOrderId: customerCard.sourceOrderId,
          sourceOrderItemId: customerCard.sourceOrderItemId,
          pricingSnapshot,
          operatorId: data.operatorId,
          beauticianId: beautician?.id,
          deviceId: data.deviceId,
        },
      });

      await this.consumeProjectBomForCardUsage(tx, {
        storeId: customerCard.customer.storeId,
        projectName: matchedProjectName,
        projectId: resolvedProjectId,
        times,
        recordId: record.id,
        cardName: customerCard.cardName,
        remark: data.remark,
      });

      if (beautician && recognizedAmount > 0) {
        if (beautician?.userId) {
          await this.commissionService.calculateCommission(
            {
              storeId: customerCard.customer.storeId,
              staffUserId: beautician.userId,
              beauticianId: beautician.id,
              type: 'project',
              itemId: resolvedProjectId,
              sourceAmount: recognizedAmount,
              levelId: beautician.levelId ?? undefined,
              isDesignated: false,
              sourceType: 'card_usage',
              sourceId: record.id,
              cardUsageRecordId: record.id,
              remark: `次卡核销：${customerCard.cardName}`,
            },
            tx,
          );
        }
      }

      return record;
    }, { timeout: 20000 });
  }
}
