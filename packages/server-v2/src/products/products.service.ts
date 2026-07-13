import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  private parseSpec(spec?: unknown) {
    const value = String(spec ?? '').trim();
    const match = value.match(/^(\d+(?:\.\d+)?)\s*([^\d\s/]+)(?:\/.*)?$/);
    return {
      specQuantity: match ? Number(match[1]) : undefined,
      specUnit: match?.[2],
    };
  }

  private formatSpec(quantity?: unknown, unit?: unknown) {
    const numericQuantity = Number(quantity);
    const specUnit = String(unit ?? '').trim();
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0 || !specUnit) return undefined;
    const quantityText = Number.isInteger(numericQuantity)
      ? String(numericQuantity)
      : String(numericQuantity).replace(/\.?0+$/, '');
    return `${quantityText}${specUnit}`;
  }

  private quoteAvailable(quote: any) {
    if (!quote) return false;
    const now = Date.now();
    const validFrom = quote.validFrom ? new Date(quote.validFrom).getTime() : null;
    const validTo = quote.validTo ? new Date(quote.validTo).getTime() : null;
    return (
      quote.status === 'active' &&
      quote.auditStatus === 'approved' &&
      !quote.deletedAt &&
      (validFrom === null || validFrom <= now) &&
      (validTo === null || validTo >= now)
    );
  }

  private chainStatusFromPayload(payload: unknown) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
    return (payload as Record<string, unknown>).chainStatus;
  }

  private async attachChainInfo<T>(products: T[]): Promise<Array<T & { industrySource: any; supplyMapping: any }>> {
    const rows = products as any[];
    const productIds = [...new Set(rows.map((product: any) => Number(product.id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (!productIds.length) return rows.map((product) => ({ ...product, industrySource: null, supplyMapping: { availabilityStatus: 'not_mapped' } }));

    const [adoptions, mappings] = await Promise.all([
      this.prisma.industryAdoptionRecord.findMany({
        where: { localProductId: { in: productIds }, productTemplateId: { not: null } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supplyCatalogMapping.findMany({
        where: { productId: { in: productIds } },
        include: {
          supplySku: {
            include: {
              supplier: { select: { id: true, name: true } },
              quotes: { orderBy: { updatedAt: 'desc' }, take: 1 },
            },
          },
        },
        orderBy: [{ isPreferred: 'desc' }, { updatedAt: 'desc' }],
      }),
    ]);

    const templateIds = [...new Set(adoptions.map((adoption: any) => adoption.productTemplateId).filter(Boolean))];
    const templates = templateIds.length
      ? await this.prisma.industryProductTemplate.findMany({
          where: { id: { in: templateIds } },
          select: { id: true, standardProductCode: true, name: true, version: true, deletedAt: true },
        })
      : [];

    const templateById = new Map(templates.map((template: any) => [template.id, template]));
    const adoptionByProductId = new Map<number, any>();
    for (const adoption of adoptions) {
      const localProductId = Number(adoption.localProductId);
      if (Number.isInteger(localProductId) && !adoptionByProductId.has(localProductId)) {
        adoptionByProductId.set(localProductId, adoption);
      }
    }

    const mappingByProductId = new Map<number, any>();
    for (const mapping of mappings) {
      const productId = Number(mapping.productId);
      if (Number.isInteger(productId) && !mappingByProductId.has(productId)) {
        mappingByProductId.set(productId, mapping);
      }
    }

    return rows.map((product: any) => {
      const adoption = adoptionByProductId.get(product.id);
      const template = adoption?.productTemplateId ? templateById.get(adoption.productTemplateId) : null;
      const mapping = mappingByProductId.get(product.id);
      const latestQuote = mapping?.supplySku?.quotes?.[0] ?? null;
      const isQuoteAvailable = this.quoteAvailable(latestQuote);
      const mappingStatus = mapping?.mappingStatus ?? null;
      const availabilityStatus = !mapping
        ? 'not_mapped'
        : !latestQuote
          ? 'mapped_no_quote'
          : mappingStatus !== 'active' || !isQuoteAvailable
            ? 'quote_unavailable'
            : 'available';
      const chainStatus = this.chainStatusFromPayload(adoption?.payload);
      const adoptionStatus = !adoption
        ? null
        : chainStatus === 'invalid'
          ? 'invalid'
          : !template || template.deletedAt
            ? 'template_missing'
            : adoption.storeId && product.storeId !== adoption.storeId
              ? 'store_mismatch'
              : 'active';

      return {
        ...product,
        industrySource: adoption
          ? {
              productTemplateId: adoption.productTemplateId ?? null,
              standardProductCode: template?.standardProductCode ?? null,
              templateName: template?.name ?? null,
              templateVersion: adoption.templateVersion ?? template?.version ?? null,
              adoptionId: adoption.id,
              adoptedAt: adoption.createdAt,
              adoptionStatus,
            }
          : null,
        supplyMapping: {
          mappingId: mapping?.id ?? null,
          mappingStatus,
          supplySkuId: mapping?.supplySkuId ?? null,
          supplierName: mapping?.supplySku?.supplier?.name ?? null,
          latestQuotePrice: latestQuote ? Number(latestQuote.price ?? 0) : null,
          moq: latestQuote?.moq ?? null,
          leadDays: latestQuote?.leadDays ?? null,
          stockStatus: latestQuote?.stockStatus ?? null,
          availabilityStatus,
        },
      };
    });
  }

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
    const products = await this.prisma.product.findMany({ where, include: { category: true, store: true }, orderBy: { createdAt: 'desc' } });
    return this.attachChainInfo(products);
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

    const itemsWithChainInfo = await this.attachChainInfo(items);
    return { items: itemsWithChainInfo, data: itemsWithChainInfo, total, page, pageSize };
  }

  async findById(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, batches: true },
    });
    if (!product || product.deletedAt) throw new NotFoundException('商品不存在');
    return (await this.attachChainInfo([product]))[0];
  }

  private normalizeProductData(data: CreateProductDto | UpdateProductDto) {
    const normalized: any = { ...data };
    if (normalized.name !== undefined) normalized.name = String(normalized.name).trim();
    if (normalized.sku !== undefined) normalized.sku = String(normalized.sku).trim();
    if (normalized.sku === '') delete normalized.sku;
    if (normalized.packageUnit === undefined && normalized.unit !== undefined) {
      normalized.packageUnit = normalized.unit;
    }
    if (normalized.specQuantity === undefined || normalized.specUnit === undefined) {
      const parsed = this.parseSpec(normalized.spec);
      if (normalized.specQuantity === undefined && parsed.specQuantity !== undefined) normalized.specQuantity = parsed.specQuantity;
      if (normalized.specUnit === undefined && parsed.specUnit) normalized.specUnit = parsed.specUnit;
    }
    const formattedSpec = this.formatSpec(normalized.specQuantity, normalized.specUnit);
    if (formattedSpec) normalized.spec = formattedSpec;
    if (normalized.packageUnit !== undefined) normalized.unit = normalized.packageUnit;
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
