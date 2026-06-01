import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class BeauticiansService {
  constructor(private prisma: PrismaService) {}

  async findAll(storeId?: number) {
    const where: any = {};
    if (storeId) where.storeId = storeId;
    return this.prisma.beautician.findMany({
      where,
      include: { level: true, store: true },
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
        include: { level: true, store: true },
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
      include: { level: true, store: true },
    });
    if (!beautician) throw new NotFoundException('美容师不存在');
    return beautician;
  }

  async create(data: any) {
    return this.prisma.beautician.create({ data, include: { level: true, store: true } });
  }

  async update(id: number, data: any) {
    await this.findById(id);
    return this.prisma.beautician.update({ where: { id }, data, include: { level: true, store: true } });
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
