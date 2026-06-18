import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class BeauticiansService {
  constructor(private prisma: PrismaService) {}

  private includeRelations = {
    level: true,
    store: true,
    user: true,
    projectSkills: { include: { project: true }, orderBy: { priority: 'asc' as const } },
  };

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
    if (!userId) throw new BadRequestException('请选择系统管理-用户管理中的美容师角色用户');
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        status: 'active',
        roles: { some: { role: { key: 'beautician' } } },
        stores: { some: { storeId } },
      },
      select: { id: true, name: true, phone: true },
    });
    if (!user) throw new BadRequestException('请选择已启用且拥有当前门店范围的美容师角色系统用户');

    const existing = await this.prisma.beautician.findFirst({
      where: {
        storeId,
        userId,
        ...(currentBeauticianId ? { id: { not: currentBeauticianId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (existing) throw new BadRequestException(`该系统账号已绑定美容师：${existing.name}`);
    return user;
  }

  private normalizeProjectSkillNames(data: any) {
    const values = Array.isArray(data.specialties)
      ? data.specialties
      : Array.isArray(data.projectNames)
        ? data.projectNames
        : [];
    return [...new Set(values.map((item: unknown) => String(item ?? '').trim()).filter(Boolean))] as string[];
  }

  private async resolveProjectSkillIds(storeId: number, data: any) {
    const explicitIds = Array.isArray(data.projectIds)
      ? data.projectIds.map((item: unknown) => Number(item)).filter((item: number) => Number.isFinite(item) && item > 0)
      : [];
    const names = this.normalizeProjectSkillNames(data);
    if (!explicitIds.length && !names.length) return [];

    const projects = await this.prisma.project.findMany({
      where: {
        storeId,
        deletedAt: null,
        status: 'active',
        OR: [
          ...(explicitIds.length ? [{ id: { in: explicitIds } }] : []),
          ...(names.length ? [{ name: { in: names } }] : []),
        ],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return [...new Set(projects.map((project) => project.id))];
  }

  private async syncProjectSkills(beauticianId: number, projectIds: number[]) {
    await this.prisma.beauticianProjectSkill.deleteMany({ where: { beauticianId } });
    if (!projectIds.length) return;
    await this.prisma.beauticianProjectSkill.createMany({
      data: projectIds.map((projectId, index) => ({
        beauticianId,
        projectId,
        skillLevel: 1,
        certified: true,
        priority: index,
      })),
      skipDuplicates: true,
    });
  }

  private async toBeauticianData(data: any, fallbackStoreId?: number, currentBeauticianId?: number) {
    const storeId = await this.resolveStoreId(data, fallbackStoreId);
    const rawUserId = data.userId === '' || data.userId === null || data.userId === undefined ? null : Number(data.userId);
    const userId = rawUserId && Number.isFinite(rawUserId) && rawUserId > 0 ? rawUserId : null;
    const user = await this.assertUserBindingAvailable(storeId, userId, currentBeauticianId);
    const levelId = await this.resolveLevelId(data);
    const status = this.normalizeStatus(data.status);
    const projectSkillIds = await this.resolveProjectSkillIds(storeId, data);

    return {
      projectSkillIds,
      payload: {
        storeId,
        userId,
        name: String(user.name ?? '').trim(),
        phone: user.phone ? String(user.phone) : null,
        ...(levelId !== undefined ? { levelId } : {}),
        ...(data.avatar !== undefined ? { avatar: data.avatar } : {}),
        ...(status ? { status } : {}),
      },
    };
  }

  private buildVisibleBeauticianWhere(storeId?: number) {
    const where: any = {
      user: {
        is: {
          deletedAt: null,
          status: 'active',
          roles: { some: { role: { key: 'beautician' } } },
          ...(storeId ? { stores: { some: { storeId } } } : {}),
        },
      },
    };
    if (storeId) where.storeId = storeId;
    return where;
  }

  async findAll(storeId?: number) {
    const where = this.buildVisibleBeauticianWhere(storeId);
    return this.prisma.beautician.findMany({
      where,
      include: this.includeRelations,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPaginated(query: { page?: number; pageSize?: number; keyword?: string; storeName?: string }, storeId?: number) {
    const { page = 1, pageSize = 20, keyword, storeName } = query;
    const where = this.buildVisibleBeauticianWhere(storeId);
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
    const { payload, projectSkillIds } = await this.toBeauticianData(data, storeId);
    if (!payload.name) throw new BadRequestException('美容师姓名不能为空');
    const beautician = await this.prisma.beautician.create({ data: payload, include: this.includeRelations });
    await this.syncProjectSkills(beautician.id, projectSkillIds);
    return this.findById(beautician.id);
  }

  async update(id: number, data: any, storeId?: number) {
    await this.findById(id);
    const { payload, projectSkillIds } = await this.toBeauticianData(data, storeId, id);
    if (!payload.name) throw new BadRequestException('美容师姓名不能为空');
    await this.prisma.beautician.update({ where: { id }, data: payload, include: this.includeRelations });
    await this.syncProjectSkills(id, projectSkillIds);
    return this.findById(id);
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
