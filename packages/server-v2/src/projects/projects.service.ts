import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: { keyword?: string; type?: string; status?: string; sellableOnly?: boolean | string } = {}, storeId?: number) {
    const where = this.buildProjectWhere(query, storeId);
    return this.prisma.project.findMany({
      where,
      include: { type: true, store: true, bomItems: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPaginated(query: { page?: number; pageSize?: number; keyword?: string; type?: string; status?: string; sellableOnly?: boolean | string }, storeId?: number) {
    const { page = 1, pageSize = 20 } = query;
    const where = this.buildProjectWhere(query, storeId);

    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: { type: true, store: true, bomItems: { include: { product: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.project.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  async findById(id: number) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { type: true, store: true, bomItems: { include: { product: true } } },
    });
    if (!project || project.deletedAt) throw new NotFoundException('项目不存在');
    return project;
  }

  async create(data: any, headerStoreId?: number) {
    const payload = await this.normalizeProjectData(data, headerStoreId, true);
    const project = await this.prisma.project.create({
      data: payload,
      include: { type: true, store: true, bomItems: { include: { product: true } } },
    });
    if (Array.isArray(data.bom)) {
      await this.setBomItems(project.id, data.bom);
      return this.findById(project.id);
    }
    return project;
  }

  async update(id: number, data: any, headerStoreId?: number) {
    await this.findById(id);
    const payload = await this.normalizeProjectData(data, headerStoreId, false);
    await this.prisma.project.update({
      where: { id },
      data: payload,
      include: { type: true, store: true, bomItems: { include: { product: true } } },
    });
    if (Array.isArray(data.bom)) {
      await this.setBomItems(id, data.bom);
    }
    return this.findById(id);
  }

  async remove(id: number) {
    await this.findById(id);
    return this.prisma.project.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // Project Types
  async findAllTypes() {
    return this.prisma.projectType.findMany({ orderBy: { name: 'asc' } });
  }

  async createType(data: any) {
    return this.prisma.projectType.create({ data });
  }

  async updateType(id: number, data: any) {
    return this.prisma.projectType.update({ where: { id }, data });
  }

  async removeType(id: number) {
    return this.prisma.projectType.delete({ where: { id } });
  }

  // BOM
  async getBomItems(projectId: number) {
    return this.prisma.projectBomItem.findMany({
      where: { projectId },
      include: { product: true },
    });
  }

  async setBomItems(projectId: number, items: Array<{ productId: number; standardQty: number; unit: string }>) {
    await this.prisma.projectBomItem.deleteMany({ where: { projectId } });
    const validItems = items
      .map((item) => ({
        productId: Number(item.productId),
        standardQty: Number(item.standardQty ?? 1),
        unit: item.unit || '件',
      }))
      .filter((item) => Number.isFinite(item.productId) && item.productId > 0 && item.standardQty > 0);
    if (validItems.length > 0) {
      await this.prisma.projectBomItem.createMany({
        data: validItems.map((item) => ({ projectId, ...item })),
      });
    }
    return this.getBomItems(projectId);
  }

  private async normalizeProjectData(data: any, headerStoreId: number | undefined, isCreate: boolean) {
    const payload: any = {};

    if (data.name !== undefined) {
      payload.name = String(data.name).trim();
    }
    if (isCreate && !payload.name) {
      throw new BadRequestException('项目名称不能为空');
    }

    const description = data.description ?? data.summary;
    if (description !== undefined) {
      payload.description = String(description);
    }

    if (data.price !== undefined) {
      payload.price = Number(data.price);
    }
    if (data.duration !== undefined) {
      payload.duration = Math.max(0, Number(data.duration));
    }
    if (data.careCycleWeeks !== undefined) {
      payload.careCycleWeeks = this.toOptionalPositiveInt(data.careCycleWeeks);
    }
    if (data.treatmentCourseTimes !== undefined) {
      payload.treatmentCourseTimes = this.toOptionalPositiveInt(data.treatmentCourseTimes);
    }
    if (data.recommend !== undefined) {
      payload.recommend = Boolean(data.recommend);
    }
    if (data.online !== undefined) {
      payload.online = Boolean(data.online);
    }
    if (data.home !== undefined) {
      payload.home = Boolean(data.home);
    }
    if (data.sort !== undefined || data.sortOrder !== undefined) {
      payload.sort = Number(data.sort ?? data.sortOrder ?? 0);
    }
    if (data.image !== undefined) {
      payload.image = data.image || null;
    }
    if (data.status !== undefined) {
      payload.status = this.normalizeStatus(data.status);
    }

    if (data.typeId !== undefined) {
      payload.typeId = data.typeId === null || data.typeId === '' ? null : Number(data.typeId);
    } else if (typeof data.type === 'string' && data.type.trim()) {
      const type = await this.prisma.projectType.findFirst({ where: { name: data.type.trim() } });
      if (type) payload.typeId = type.id;
    }

    if (isCreate) {
      payload.storeId = Number(data.storeId ?? headerStoreId ?? 0);
      if (!payload.storeId) {
        const store = await this.prisma.store.findFirst({
          where: { deletedAt: null, status: { not: 'disabled' } },
          orderBy: { id: 'asc' },
        });
        payload.storeId = store?.id;
      }
      if (!payload.storeId) {
        throw new BadRequestException('门店不能为空');
      }
    } else if (data.storeId !== undefined) {
      payload.storeId = Number(data.storeId);
    }

    return payload;
  }

  private normalizeStatus(status: unknown) {
    if (typeof status === 'boolean') return status ? 'active' : 'inactive';
    if (status === '启用' || status === '在售') return 'active';
    if (status === '停用' || status === '停售') return 'inactive';
    return String(status || 'active');
  }

  private toOptionalPositiveInt(value: unknown) {
    if (value === null || value === '') return null;
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue <= 0) return null;
    return Math.floor(numberValue);
  }

  private buildProjectWhere(query: { keyword?: string; type?: string; status?: string; sellableOnly?: boolean | string }, storeId?: number) {
    const { keyword, type, status, sellableOnly } = query;
    const where: any = { deletedAt: null };
    if (storeId) where.storeId = storeId;
    if (keyword) where.name = { contains: keyword, mode: 'insensitive' };
    if (type) where.type = { name: type };
    if (status) where.status = this.normalizeStatus(status);
    if (sellableOnly === true || sellableOnly === 'true') {
      where.price = { gt: 0 };
    }
    return where;
  }
}
