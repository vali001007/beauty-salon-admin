import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async findAll(storeId?: number) {
    const where: any = { deletedAt: null };
    if (storeId) where.storeId = storeId;
    return this.prisma.project.findMany({
      where,
      include: { type: true, store: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPaginated(query: { page?: number; pageSize?: number; keyword?: string; type?: string }, storeId?: number) {
    const { page = 1, pageSize = 20, keyword, type } = query;
    const where: any = { deletedAt: null };
    if (storeId) where.storeId = storeId;
    if (keyword) where.name = { contains: keyword, mode: 'insensitive' };
    if (type) where.type = { name: type };

    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: { type: true, store: true },
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

  async create(data: any) {
    return this.prisma.project.create({ data, include: { type: true, store: true } });
  }

  async update(id: number, data: any) {
    await this.findById(id);
    return this.prisma.project.update({ where: { id }, data, include: { type: true, store: true } });
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
    if (items.length > 0) {
      await this.prisma.projectBomItem.createMany({
        data: items.map((item) => ({ projectId, ...item })),
      });
    }
    return this.getBomItems(projectId);
  }
}
