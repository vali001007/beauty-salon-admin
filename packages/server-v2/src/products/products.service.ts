import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(storeId?: number, categoryId?: number, status?: string, keyword?: string) {
    const where: any = { deletedAt: null };
    if (storeId) where.storeId = storeId;
    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { sku: { contains: keyword, mode: 'insensitive' } },
        { brand: { contains: keyword, mode: 'insensitive' } },
      ];
    }
    return this.prisma.product.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findPaginated(query: { page?: number; pageSize?: number; keyword?: string; categoryId?: number; status?: string }, storeId?: number) {
    const { page = 1, pageSize = 20, keyword, categoryId, status } = query;
    const where: any = { deletedAt: null };
    if (storeId) where.storeId = storeId;
    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { sku: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { category: true },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, data: items, total, page, pageSize };
  }

  async findById(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, batches: true },
    });
    if (!product || product.deletedAt) throw new NotFoundException('商品不存在');
    return product;
  }

  async create(data: any) {
    return this.prisma.product.create({ data });
  }

  async update(id: number, data: any) {
    await this.findById(id);
    return this.prisma.product.update({ where: { id }, data });
  }

  async remove(id: number) {
    await this.findById(id);
    return this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async getCategories() {
    return this.prisma.category.findMany({
      include: { children: true },
      where: { parentId: null },
    });
  }
}
