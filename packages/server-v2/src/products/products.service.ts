import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

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
    return this.prisma.product.findMany({ where, include: { category: true, store: true }, orderBy: { createdAt: 'desc' } });
  }

  async findPaginated(query: { page?: number; pageSize?: number; keyword?: string; categoryId?: number; status?: string; sellableOnly?: boolean | string }, storeId?: number) {
    const { page = 1, pageSize = 20, keyword, categoryId, status, sellableOnly } = query;
    const where: any = { deletedAt: null };
    if (storeId) where.storeId = storeId;
    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status;
    if (sellableOnly === true || sellableOnly === 'true') {
      where.OR = [
        { salePrice: { gt: 0 } },
        { salePrice: null, retailPrice: { gt: 0 } },
      ];
    }
    if (keyword) {
      const keywordWhere = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { sku: { contains: keyword, mode: 'insensitive' } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: keywordWhere }];
        delete where.OR;
      } else {
        where.OR = keywordWhere;
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { category: true, store: true },
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

  private normalizeProductData(data: CreateProductDto | UpdateProductDto) {
    const normalized: any = { ...data };
    if (normalized.name !== undefined) normalized.name = String(normalized.name).trim();
    if (normalized.sku !== undefined) normalized.sku = String(normalized.sku).trim();
    if (normalized.sku === '') delete normalized.sku;
    if (normalized.miniappPublishedAt !== undefined) {
      normalized.miniappPublishedAt = normalized.miniappPublishedAt ? new Date(normalized.miniappPublishedAt) : null;
    }
    return normalized;
  }

  async create(data: CreateProductDto, headerStoreId?: number) {
    const payload = this.normalizeProductData(data);
    payload.storeId = payload.storeId ?? headerStoreId;
    if (!payload.name) throw new BadRequestException('商品名称不能为空');
    if (!payload.storeId) throw new BadRequestException('storeId is required');
    if (!payload.sku) {
      payload.sku = `SKU-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    }
    return this.prisma.product.create({ data: payload });
  }

  async update(id: number, data: UpdateProductDto, headerStoreId?: number) {
    await this.findById(id);
    const payload = this.normalizeProductData(data);
    if (payload.storeId === undefined && headerStoreId !== undefined) delete payload.storeId;
    return this.prisma.product.update({ where: { id }, data: payload });
  }

  async remove(id: number) {
    await this.findById(id);
    return this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async getCategories() {
    const categories = await this.prisma.category.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { id: 'asc' },
    });
    const nodeById = new Map<number, any>();
    categories.forEach((category) => {
      nodeById.set(category.id, {
        id: category.id,
        name: category.name,
        parentId: category.parentId,
        productCount: category._count.products,
        description: '',
        status: '启用',
        children: [],
      });
    });
    const roots: any[] = [];
    nodeById.forEach((node) => {
      if (node.parentId && nodeById.has(node.parentId)) {
        nodeById.get(node.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  async createCategory(data: { name: string; parentId?: number | null }) {
    return this.prisma.category.create({
      data: {
        name: data.name,
        parentId: data.parentId ?? null,
      },
    });
  }

  async updateCategory(id: number, data: { name?: string; parentId?: number | null }) {
    await this.ensureCategory(id);
    return this.prisma.category.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
      },
    });
  }

  async deleteCategories(ids: number[]) {
    const uniqueIds = [...new Set(ids)].filter((id) => Number.isFinite(id));
    if (!uniqueIds.length) return { count: 0 };

    const [usedCount, childCount] = await Promise.all([
      this.prisma.product.count({ where: { categoryId: { in: uniqueIds }, deletedAt: null } }),
      this.prisma.category.count({ where: { parentId: { in: uniqueIds } } }),
    ]);

    if (usedCount > 0 || childCount > 0) {
      throw new BadRequestException({
        message: '分类下已有商品或子分类，不能删除',
        code: 'CATEGORY_IN_USE',
      });
    }

    return this.prisma.category.deleteMany({ where: { id: { in: uniqueIds } } });
  }

  private async ensureCategory(id: number) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('商品分类不存在');
    return category;
  }
}
