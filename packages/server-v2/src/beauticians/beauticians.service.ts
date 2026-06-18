import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class BeauticiansService {
  constructor(private prisma: PrismaService) {}

  private includeRelations = { level: true, store: true, user: true };

  private normalizeStatus(status?: string) {
    if (!status) return undefined;
    if (status === '在职' || status === 'active') return 'active';
    if (status === '休假' || status === 'leave' || status === 'inactive') return 'inactive';
    if (status === '离职' || status === 'disabled') return 'disabled';
    return status;
  }

  private async resolveStoreId(data: any, fallbackStoreId?: number) {
    const explicitStoreId = Number(data.storeId ?? fallbackStoreId);
    if (Number.isFinite(explicitStoreId) && explicitStoreId > 0) return explicitStoreId;
    if (data.storeName) {
      const store = await this.prisma.store.findFirst({
        where: { name: String(data.storeName), deletedAt: null },
        select: { id: true },
      });
      if (store) return store.id;
    }
    throw new BadRequestException('请选择所属门店');
  }

  private async resolveLevelId(data: any) {
    const explicitLevelId = Number(data.levelId);
    if (Number.isFinite(explicitLevelId) && explicitLevelId > 0) return explicitLevelId;
    if (!data.level) return undefined;
    const level = await this.prisma.beauticianLevel.findFirst({
      where: { name: String(data.level) },
      select: { id: true },
    });
    return level?.id;
  }

  private async assertUserBindingAvailable(storeId: number, userId?: number | null, currentBeauticianId?: number) {
    if (!userId) return;
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        status: 'active',
        OR: [
          { stores: { some: { storeId } } },
          { roles: { some: { role: { key: { in: ['super_admin', 'store_manager'] } } } } },
        ],
      },
      select: { id: true },
    });
    if (!user) throw new BadRequestException('所选系统账号无权绑定当前门店');

    const existing = await this.prisma.beautician.findFirst({
      where: {
        storeId,
        userId,
        ...(currentBeauticianId ? { id: { not: currentBeauticianId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (existing) throw new BadRequestException(`该系统账号已绑定美容师：${existing.name}`);
  }

  private async toBeauticianData(data: any, fallbackStoreId?: number, currentBeauticianId?: number) {
    const storeId = await this.resolveStoreId(data, fallbackStoreId);
    const rawUserId = data.userId === '' || data.userId === null || data.userId === undefined ? null : Number(data.userId);
    const userId = rawUserId && Number.isFinite(rawUserId) && rawUserId > 0 ? rawUserId : null;
    await this.assertUserBindingAvailable(storeId, userId, currentBeauticianId);
    const levelId = await this.resolveLevelId(data);
    const status = this.normalizeStatus(data.status);

    return {
      storeId,
      userId,
      name: String(data.name ?? '').trim(),
      phone: data.phone ? String(data.phone) : null,
      ...(levelId !== undefined ? { levelId } : {}),
      ...(data.avatar !== undefined ? { avatar: data.avatar } : {}),
      ...(status ? { status } : {}),
    };
  }

  async findAll(storeId?: number) {
    const where: any = {};
    if (storeId) where.storeId = storeId;
    return this.prisma.beautician.findMany({
      where,
      include: this.includeRelations,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPaginated(query: { page?: number; pageSize?: number; keyword?: string; storeName?: string }, storeId?: number) {
    const { page = 1, pageSize = 20, keyword, storeName } = query;
    const where: any = {};
    if (storeId) where.storeId = storeId;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { phone: { contains: keyword } },
      ];
    }
    if (storeName) where.store = { name: storeName };
    const [items, total] = await Promise.all([
      this.prisma.beautician.findMany({
        where,
        include: this.includeRelations,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.beautician.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  async findById(id: number) {
    const beautician = await this.prisma.beautician.findUnique({
      where: { id },
      include: this.includeRelations,
    });
    if (!beautician) throw new NotFoundException('美容师不存在');
    return beautician;
  }

  async create(data: any, storeId?: number) {
    const payload = await this.toBeauticianData(data, storeId);
    if (!payload.name) throw new BadRequestException('美容师姓名不能为空');
    return this.prisma.beautician.create({ data: payload, include: this.includeRelations });
  }

  async update(id: number, data: any, storeId?: number) {
    await this.findById(id);
    const payload = await this.toBeauticianData(data, storeId, id);
    if (!payload.name) throw new BadRequestException('美容师姓名不能为空');
    return this.prisma.beautician.update({ where: { id }, data: payload, include: this.includeRelations });
  }

  async remove(id: number) {
    await this.findById(id);
    return this.prisma.beautician.delete({ where: { id } });
  }

  // Levels
  async findAllLevels() {
    return this.prisma.beauticianLevel.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async createLevel(data: any) {
    return this.prisma.beauticianLevel.create({ data });
  }

  async updateLevel(id: number, data: any) {
    return this.prisma.beauticianLevel.update({ where: { id }, data });
  }

  async removeLevels(ids: number[]) {
    return this.prisma.beauticianLevel.deleteMany({ where: { id: { in: ids } } });
  }
}
