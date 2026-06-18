import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePromotionDto, UpdatePromotionDto } from './dto.js';

@Injectable()
export class PromotionsService {
  constructor(private prisma: PrismaService) {}

  async findPaginated(query: { page?: number | string; pageSize?: number | string; status?: string; storeId?: number | string }) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.max(1, Number(query.pageSize || 20));
    const where: any = {};
    if (query.status) where.status = String(query.status);
    const storeId = Number(query.storeId || 0);
    if (storeId > 0) where.OR = [{ storeId }, { storeId: null }];

    const [items, total] = await Promise.all([
      this.prisma.promotion.findMany({
        where,
        include: { store: { select: { id: true, name: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.promotion.count({ where }),
    ]);

    const normalizedItems = items.map((item) => this.toView(item));
    return { items: normalizedItems, data: normalizedItems, total, page, pageSize };
  }

  async findAll(query: { status?: string; storeId?: number | string }) {
    const result = await this.findPaginated({ ...query, page: 1, pageSize: 200 });
    return result.items;
  }

  async create(dto: CreatePromotionDto, headerStoreId?: number) {
    const data = this.normalizePayload(dto, headerStoreId);
    const item = await this.prisma.promotion.create({
      data,
      include: { store: { select: { id: true, name: true } } },
    });
    return this.toView(item);
  }

  async update(id: number, dto: UpdatePromotionDto, headerStoreId?: number) {
    await this.ensurePromotion(id);
    const item = await this.prisma.promotion.update({
      where: { id },
      data: this.normalizePayload(dto, headerStoreId, true),
      include: { store: { select: { id: true, name: true } } },
    });
    return this.toView(item);
  }

  async remove(id: number) {
    await this.ensurePromotion(id);
    await this.prisma.promotion.delete({ where: { id } });
    return { id };
  }

  async publish(id: number) {
    await this.ensurePromotion(id);
    const item = await this.prisma.promotion.update({
      where: { id },
      data: { status: 'active' },
      include: { store: { select: { id: true, name: true } } },
    });
    return this.toView(item);
  }

  async offline(id: number) {
    await this.ensurePromotion(id);
    const item = await this.prisma.promotion.update({
      where: { id },
      data: { status: 'offline' },
      include: { store: { select: { id: true, name: true } } },
    });
    return this.toView(item);
  }

  private async ensurePromotion(id: number) {
    const item = await this.prisma.promotion.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('优惠活动不存在');
    return item;
  }

  private normalizePayload(dto: CreatePromotionDto | UpdatePromotionDto, headerStoreId?: number, partial = false) {
    const payload: any = {};
    if (!partial || dto.storeId !== undefined || headerStoreId !== undefined) {
      payload.storeId = dto.storeId ?? headerStoreId ?? null;
    }
    for (const key of ['name', 'description', 'discountText', 'status'] as const) {
      if (!partial || dto[key] !== undefined) payload[key] = dto[key];
    }
    if (!partial || dto.applicableProjectIds !== undefined) {
      payload.applicableProjectIds = dto.applicableProjectIds ?? [];
    }
    if (!partial || dto.startAt !== undefined) payload.startAt = dto.startAt ? new Date(dto.startAt) : null;
    if (!partial || dto.endAt !== undefined) payload.endAt = dto.endAt ? new Date(dto.endAt) : null;
    if (!payload.status && !partial) payload.status = 'draft';
    return payload;
  }

  private toView(item: any) {
    return {
      ...item,
      storeName: item.store?.name ?? (item.storeId ? `门店 ${item.storeId}` : '全部门店'),
      startAt: item.startAt?.toISOString?.() ?? item.startAt,
      endAt: item.endAt?.toISOString?.() ?? item.endAt,
      createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
      updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
      store: undefined,
    };
  }
}
