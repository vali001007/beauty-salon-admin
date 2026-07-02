import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AuditSupplyQuoteDto,
  AuditSupplySkuDto,
  CreateProcurementOrderDto,
  CreateProcurementOrdersFromReplenishmentDto,
  CreateShipmentDto,
  CreateSupplierQualificationDto,
  CreateSupplyCatalogMappingDto,
  CreateSupplyQuoteDto,
  CreateSupplySkuDto,
  CreateSupplySupplierDto,
  GenerateSupplySettlementDto,
  QueryProcurementOrdersDto,
  QuerySupplyCatalogMappingsDto,
  QuerySupplyQuotesDto,
  QuerySupplySkusDto,
  QuerySupplySuppliersDto,
  ReceiveProcurementOrderDto,
  UpdateSupplyCatalogMappingDto,
  UpdateProcurementOrderStatusDto,
  UpdateSupplyQuoteDto,
  UpdateSupplySkuDto,
  UpdateSupplySupplierDto,
  UpdateSupplySupplierStatusDto,
} from './dto/supply-platform.dto.js';

const DEFAULT_PLATFORM_FEE_RATE = 0.02;
const ACTIVE_PROCUREMENT_STATUSES = ['pending_supplier_confirm', 'accepted', 'shipped', 'partial_received'];

export type SupplyPlatformActor = {
  id?: number;
  permissions?: string[];
  supplySupplierId?: number | null;
};

@Injectable()
export class SupplyPlatformService {
  constructor(private prisma: PrismaService) {}

  private toNumber(value: unknown, fallback = 0) {
    const num = Number(value ?? fallback);
    return Number.isFinite(num) ? num : fallback;
  }

  private page(query: { page?: number; pageSize?: number }) {
    const page = Math.max(1, this.toNumber(query.page, 1));
    const pageSize = Math.max(1, Math.min(200, this.toNumber(query.pageSize, 20)));
    return { page, pageSize, skip: (page - 1) * pageSize };
  }

  private clean<T extends Record<string, unknown>>(payload: T) {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)) as T;
  }

  private text(value: unknown) {
    const text = value === undefined || value === null ? '' : String(value).trim();
    return text || undefined;
  }

  private orderNo() {
    return `SPO${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private shipmentNo() {
    return `SHP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private movementNo() {
    return `SPI${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private monthRange(settleMonth: string) {
    if (!/^\d{4}-\d{2}$/.test(settleMonth)) throw new BadRequestException('结算月份格式应为 YYYY-MM');
    const [year, month] = settleMonth.split('-').map(Number);
    return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
  }

  private isQuoteAvailable(quote: { status?: string; auditStatus?: string; validFrom?: Date | null; validTo?: Date | null }) {
    const now = new Date();
    if (quote.status !== 'active' || quote.auditStatus !== 'approved') return false;
    if (quote.validFrom && quote.validFrom > now) return false;
    if (quote.validTo && quote.validTo < now) return false;
    return true;
  }

  private supplyMappingInclude() {
    return {
      product: { select: { id: true, sku: true, name: true, storeId: true, store: { select: { id: true, name: true } } } },
      industryProductTemplate: { select: { id: true, standardProductCode: true, name: true, category: true } },
      supplySku: {
        include: {
          supplier: { select: { id: true, name: true, status: true, qualificationStatus: true } },
          quotes: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        },
      },
    } as const;
  }

  private mapCatalogMapping(item: any) {
    const quotes = Array.isArray(item.supplySku?.quotes) ? item.supplySku.quotes : [];
    const availableQuote = quotes.find((quote: any) => this.isQuoteAvailable(quote) && quote.stockStatus !== 'out_of_stock' && quote.stockStatus !== 'unavailable');
    const latestQuote = availableQuote ?? quotes[0] ?? null;
    const purchasableStatus = !item.supplySkuId
      ? 'not_mapped'
      : !latestQuote
        ? 'mapped_no_quote'
        : !availableQuote
          ? 'quote_unavailable'
          : 'available';
    return {
      ...item,
      latestQuote,
      purchasableStatus,
      quoteCount: quotes.length,
      supplySku: item.supplySku ? { ...item.supplySku, quotes: undefined } : item.supplySku,
    };
  }

  private async ensureMappingReferences(dto: CreateSupplyCatalogMappingDto | UpdateSupplyCatalogMappingDto, current?: any) {
    const nextSupplySkuId = dto.supplySkuId ?? current?.supplySkuId;
    if (!nextSupplySkuId) throw new BadRequestException('供应链 SKU 不能为空');
    const supplySku = await this.prisma.supplySku.findFirst({
      where: { id: Number(nextSupplySkuId), deletedAt: null },
      include: { supplier: true },
    });
    if (!supplySku) throw new NotFoundException('供应链商品不存在');
    if (supplySku.status !== 'active' || supplySku.auditStatus !== 'approved') {
      throw new BadRequestException('只能映射已审核通过且可用的供应链商品');
    }

    let product: any = current?.product ?? null;
    const nextProductId = dto.productId ?? current?.productId;
    if (nextProductId) {
      product = await this.prisma.product.findFirst({ where: { id: Number(nextProductId), deletedAt: null } });
      if (!product) throw new NotFoundException('本地商品不存在或已归档');
    }

    const nextTemplateId = dto.standardProductTemplateId ?? current?.standardProductTemplateId;
    if (nextTemplateId) {
      const template = await this.prisma.industryProductTemplate.findFirst({ where: { id: Number(nextTemplateId), deletedAt: null } });
      if (!template) throw new NotFoundException('行业标准商品模板不存在或已归档');
    }

    const storeId = dto.storeId ?? current?.storeId ?? product?.storeId;
    if (!nextProductId && !nextTemplateId) throw new BadRequestException('至少需要绑定门店商品或行业商品模板');
    if ((dto.isPreferred ?? current?.isPreferred) && (!nextProductId || !storeId)) {
      throw new BadRequestException('设置首选映射时必须绑定门店和本地商品');
    }
    return { supplySku, product, storeId };
  }

  private isSupplyManager(actor?: SupplyPlatformActor) {
    return Boolean(actor?.permissions?.includes('*') || actor?.permissions?.includes('core:supply:manage'));
  }

  private scopedSupplierId(actor?: SupplyPlatformActor, requestedSupplierId?: number) {
    if (!actor?.supplySupplierId) return requestedSupplierId;
    if (requestedSupplierId && Number(requestedSupplierId) !== Number(actor.supplySupplierId)) {
      throw new BadRequestException('供应商账号只能访问自己的供应链数据');
    }
    return Number(actor.supplySupplierId);
  }

  private requireScopedSupplierId(actor?: SupplyPlatformActor, requestedSupplierId?: number) {
    const supplierId = this.scopedSupplierId(actor, requestedSupplierId);
    if (!supplierId) throw new BadRequestException('供应商不能为空');
    return Number(supplierId);
  }

  private requireSupplierScope(actor?: SupplyPlatformActor) {
    if (!actor?.supplySupplierId) return undefined;
    return Number(actor.supplySupplierId);
  }

  private ensureManageOrOwnSupplier(actor: SupplyPlatformActor | undefined, supplierId: number) {
    if (!actor) return;
    if (this.isSupplyManager(actor)) return;
    if (!actor?.supplySupplierId || Number(actor.supplySupplierId) !== Number(supplierId)) {
      throw new BadRequestException('当前账号不能操作其他供应商数据');
    }
  }

  async findSuppliers(query: QuerySupplySuppliersDto, actor?: SupplyPlatformActor) {
    const { page, pageSize, skip } = this.page(query);
    const where: any = { deletedAt: null };
    const supplierScope = this.requireSupplierScope(actor);
    if (supplierScope) where.id = supplierScope;
    if (query.status) where.status = query.status;
    if (query.qualificationStatus) where.qualificationStatus = query.qualificationStatus;
    const keyword = this.text(query.keyword);
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { companyName: { contains: keyword, mode: 'insensitive' } },
        { contactName: { contains: keyword, mode: 'insensitive' } },
        { phone: { contains: keyword, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.supplySupplier.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.supplySupplier.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  async findSupplier(id: number, actor?: SupplyPlatformActor) {
    this.ensureManageOrOwnSupplier(actor, id);
    const item = await this.prisma.supplySupplier.findFirst({
      where: { id, deletedAt: null },
      include: { qualifications: true, _count: { select: { skus: true, quotes: true, orders: true } } },
    });
    if (!item) throw new NotFoundException('供应商不存在');
    return item;
  }

  createSupplier(dto: CreateSupplySupplierDto) {
    if (!this.text(dto.name)) throw new BadRequestException('供应商名称不能为空');
    return this.prisma.supplySupplier.create({
      data: this.clean({
        name: dto.name.trim(),
        companyName: this.text(dto.companyName),
        contactName: this.text(dto.contactName),
        phone: this.text(dto.phone),
        email: this.text(dto.email),
        address: this.text(dto.address),
        serviceRegions: dto.serviceRegions as any,
        categories: dto.categories as any,
        settlementMode: dto.settlementMode ?? 'monthly',
        paymentTerms: this.text(dto.paymentTerms),
        rebateRate: dto.rebateRate,
        platformFeeRate: dto.platformFeeRate,
      }),
    });
  }

  async updateSupplier(id: number, dto: UpdateSupplySupplierDto, actor?: SupplyPlatformActor) {
    await this.findSupplier(id, actor);
    return this.prisma.supplySupplier.update({
      where: { id },
      data: this.clean({
        name: this.text(dto.name),
        companyName: this.text(dto.companyName),
        contactName: this.text(dto.contactName),
        phone: this.text(dto.phone),
        email: this.text(dto.email),
        address: this.text(dto.address),
        serviceRegions: dto.serviceRegions as any,
        categories: dto.categories as any,
        settlementMode: this.text(dto.settlementMode),
        paymentTerms: this.text(dto.paymentTerms),
        rebateRate: dto.rebateRate,
        platformFeeRate: dto.platformFeeRate,
      }),
    });
  }

  async updateSupplierStatus(id: number, dto: UpdateSupplySupplierStatusDto, actor?: SupplyPlatformActor) {
    if (!this.isSupplyManager(actor)) throw new BadRequestException('只有平台运营可以审核或启停供应商');
    await this.findSupplier(id);
    return this.prisma.supplySupplier.update({
      where: { id },
      data: this.clean({ status: dto.status, qualificationStatus: dto.qualificationStatus }),
    });
  }

  async createQualification(dto: CreateSupplierQualificationDto, actor?: SupplyPlatformActor) {
    const supplierId = this.requireScopedSupplierId(actor, dto.supplierId);
    await this.findSupplier(supplierId);
    return this.prisma.supplierQualification.create({
      data: {
        supplierId,
        type: dto.type,
        fileUrl: dto.fileUrl,
        fileName: dto.fileName,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }

  async findSkus(query: QuerySupplySkusDto, actor?: SupplyPlatformActor) {
    const { page, pageSize, skip } = this.page(query);
    const where: any = { deletedAt: null };
    const supplierId = this.scopedSupplierId(actor, query.supplierId ? Number(query.supplierId) : undefined);
    if (supplierId) where.supplierId = Number(supplierId);
    if (query.status) where.status = query.status;
    if (query.auditStatus) where.auditStatus = query.auditStatus;
    const keyword = this.text(query.keyword);
    if (keyword) where.OR = [{ name: { contains: keyword, mode: 'insensitive' } }, { barcode: { contains: keyword } }];
    const [items, total] = await Promise.all([
      this.prisma.supplySku.findMany({
        where,
        skip,
        take: pageSize,
        include: { supplier: { select: { id: true, name: true, status: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supplySku.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  async findSku(id: number, actor?: SupplyPlatformActor) {
    const item = await this.prisma.supplySku.findFirst({
      where: { id, deletedAt: null },
      include: { supplier: true, quotes: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } }, mappings: true },
    });
    if (!item) throw new NotFoundException('供应链商品不存在');
    this.ensureManageOrOwnSupplier(actor, item.supplierId);
    return item;
  }

  async createSku(dto: CreateSupplySkuDto, actor?: SupplyPlatformActor) {
    const supplierId = this.requireScopedSupplierId(actor, dto.supplierId);
    await this.findSupplier(supplierId);
    return this.prisma.supplySku.create({
      data: this.clean({
        supplierId,
        categoryId: dto.categoryId,
        name: dto.name.trim(),
        brand: this.text(dto.brand),
        spec: this.text(dto.spec),
        unit: this.text(dto.unit),
        barcode: this.text(dto.barcode),
        images: dto.images as any,
        shelfLife: dto.shelfLife,
        qualificationFiles: dto.qualificationFiles as any,
        description: this.text(dto.description),
        status: 'draft',
        auditStatus: 'draft',
      }),
    });
  }

  async updateSku(id: number, dto: UpdateSupplySkuDto, actor?: SupplyPlatformActor) {
    await this.findSku(id, actor);
    return this.prisma.supplySku.update({
      where: { id },
      data: this.clean({
        categoryId: dto.categoryId,
        name: this.text(dto.name),
        brand: this.text(dto.brand),
        spec: this.text(dto.spec),
        unit: this.text(dto.unit),
        barcode: this.text(dto.barcode),
        images: dto.images as any,
        shelfLife: dto.shelfLife,
        qualificationFiles: dto.qualificationFiles as any,
        description: this.text(dto.description),
      }),
    });
  }

  async auditSku(id: number, dto: AuditSupplySkuDto, actor?: SupplyPlatformActor) {
    if (!this.isSupplyManager(actor)) throw new BadRequestException('只有平台运营可以审核商品');
    await this.findSku(id);
    const approved = dto.auditStatus === 'approved';
    return this.prisma.supplySku.update({
      where: { id },
      data: {
        auditStatus: dto.auditStatus,
        status: dto.status ?? (approved ? 'active' : dto.auditStatus === 'rejected' ? 'draft' : undefined),
        rejectReason: dto.rejectReason,
        reviewedAt: new Date(),
      },
    });
  }

  async findQuotes(query: QuerySupplyQuotesDto, actor?: SupplyPlatformActor) {
    const { page, pageSize, skip } = this.page(query);
    const where: any = { deletedAt: null };
    if (query.supplySkuId) where.supplySkuId = Number(query.supplySkuId);
    const supplierId = this.scopedSupplierId(actor, query.supplierId ? Number(query.supplierId) : undefined);
    if (supplierId) where.supplierId = Number(supplierId);
    if (query.status) where.status = query.status;
    if (query.auditStatus) where.auditStatus = query.auditStatus;
    if (query.availableOnly === 'true') {
      const now = new Date();
      where.status = 'active';
      where.auditStatus = 'approved';
      where.AND = [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ validTo: null }, { validTo: { gte: now } }] }];
    }
    const [items, total] = await Promise.all([
      this.prisma.supplyQuote.findMany({
        where,
        include: { sku: true, supplier: { select: { id: true, name: true, status: true } } },
        skip,
        take: pageSize,
        orderBy: [{ status: 'asc' }, { price: 'asc' }],
      }),
      this.prisma.supplyQuote.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  async createQuote(dto: CreateSupplyQuoteDto, actor?: SupplyPlatformActor) {
    const sku = await this.findSku(dto.supplySkuId, actor);
    const supplierId = this.scopedSupplierId(actor, dto.supplierId ?? sku.supplierId);
    if (supplierId !== sku.supplierId) throw new BadRequestException('报价供应商必须与供应链商品所属供应商一致');
    return this.prisma.supplyQuote.create({
      data: this.clean({
        supplySkuId: dto.supplySkuId,
        supplierId,
        price: dto.price,
        taxIncluded: dto.taxIncluded ?? true,
        moq: dto.moq ?? 1,
        leadDays: dto.leadDays,
        stockStatus: dto.stockStatus ?? 'available',
        availableStock: dto.availableStock,
        regionScope: dto.regionScope as any,
        storeScope: dto.storeScope as any,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validTo: dto.validTo ? new Date(dto.validTo) : undefined,
        status: 'draft',
        auditStatus: 'draft',
      }),
    });
  }

  async updateQuote(id: number, dto: UpdateSupplyQuoteDto, actor?: SupplyPlatformActor) {
    const current = await this.prisma.supplyQuote.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException('报价不存在');
    this.ensureManageOrOwnSupplier(actor, current.supplierId);
    return this.prisma.supplyQuote.update({
      where: { id },
      data: this.clean({
        price: dto.price,
        taxIncluded: dto.taxIncluded,
        moq: dto.moq,
        leadDays: dto.leadDays,
        stockStatus: this.text(dto.stockStatus),
        availableStock: dto.availableStock,
        regionScope: dto.regionScope as any,
        storeScope: dto.storeScope as any,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validTo: dto.validTo ? new Date(dto.validTo) : undefined,
      }),
    });
  }

  async auditQuote(id: number, dto: AuditSupplyQuoteDto, actor?: SupplyPlatformActor) {
    if (!this.isSupplyManager(actor)) throw new BadRequestException('只有平台运营可以审核报价');
    const current = await this.prisma.supplyQuote.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException('报价不存在');
    const approved = dto.auditStatus === 'approved';
    return this.prisma.supplyQuote.update({
      where: { id },
      data: {
        auditStatus: dto.auditStatus,
        status: dto.status ?? (approved ? 'active' : dto.auditStatus === 'rejected' ? 'draft' : undefined),
        rejectReason: dto.rejectReason,
        reviewedAt: new Date(),
      },
    });
  }

  async findMappings(query: QuerySupplyCatalogMappingsDto) {
    const { page, pageSize, skip } = this.page(query);
    const where: any = {};
    if (query.productId) where.productId = Number(query.productId);
    if (query.storeId) where.storeId = Number(query.storeId);
    if (query.supplySkuId) where.supplySkuId = Number(query.supplySkuId);
    if (query.standardProductTemplateId) where.standardProductTemplateId = Number(query.standardProductTemplateId);
    if (query.mappingStatus) where.mappingStatus = query.mappingStatus;
    const keyword = this.text(query.keyword);
    if (keyword) {
      where.OR = [
        { product: { name: { contains: keyword, mode: 'insensitive' } } },
        { product: { sku: { contains: keyword, mode: 'insensitive' } } },
        { industryProductTemplate: { name: { contains: keyword, mode: 'insensitive' } } },
        { industryProductTemplate: { standardProductCode: { contains: keyword, mode: 'insensitive' } } },
        { supplySku: { name: { contains: keyword, mode: 'insensitive' } } },
        { supplySku: { supplier: { name: { contains: keyword, mode: 'insensitive' } } } },
      ];
    }
    const [records, total] = await Promise.all([
      this.prisma.supplyCatalogMapping.findMany({
        where,
        include: this.supplyMappingInclude(),
        skip,
        take: pageSize,
        orderBy: [{ isPreferred: 'desc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.supplyCatalogMapping.count({ where }),
    ]);
    const items = records.map((item) => this.mapCatalogMapping(item));
    const filteredItems = query.purchasableStatus ? items.filter((item) => item.purchasableStatus === query.purchasableStatus) : items;
    return { items: filteredItems, data: filteredItems, total, page, pageSize };
  }

  async createMapping(dto: CreateSupplyCatalogMappingDto) {
    const refs = await this.ensureMappingReferences(dto);
    const createData = {
      supplySkuId: Number(dto.supplySkuId),
      productId: dto.productId ? Number(dto.productId) : undefined,
      storeId: refs.storeId ? Number(refs.storeId) : undefined,
      standardProductTemplateId: dto.standardProductTemplateId ? Number(dto.standardProductTemplateId) : undefined,
      mappingStatus: dto.mappingStatus ?? 'active',
      isPreferred: dto.isPreferred ?? false,
    };
    const record = await this.prisma.$transaction(async (tx) => {
      if (createData.isPreferred && createData.productId && createData.storeId) {
        await tx.supplyCatalogMapping.updateMany({
          where: { productId: createData.productId, storeId: createData.storeId, isPreferred: true },
          data: { isPreferred: false },
        });
      }
      return tx.supplyCatalogMapping.create({
        data: createData,
        include: this.supplyMappingInclude(),
      });
    });
    return this.mapCatalogMapping(record);
  }

  async updateMapping(id: number, dto: UpdateSupplyCatalogMappingDto) {
    const current = await this.prisma.supplyCatalogMapping.findFirst({ where: { id }, include: this.supplyMappingInclude() });
    if (!current) throw new NotFoundException('供应链目录映射不存在');
    const refs = await this.ensureMappingReferences(dto, current);
    const nextProductId = dto.productId === undefined ? current.productId : dto.productId;
    const nextStoreId = dto.storeId === undefined ? refs.storeId : dto.storeId;
    const nextIsPreferred = dto.isPreferred === undefined ? current.isPreferred : dto.isPreferred;
    const record = await this.prisma.$transaction(async (tx) => {
      if (nextIsPreferred && nextProductId && nextStoreId) {
        await tx.supplyCatalogMapping.updateMany({
          where: { id: { not: id }, productId: Number(nextProductId), storeId: Number(nextStoreId), isPreferred: true },
          data: { isPreferred: false },
        });
      }
      return tx.supplyCatalogMapping.update({
        where: { id },
        data: this.clean({
          supplySkuId: dto.supplySkuId,
          productId: dto.productId,
          storeId: nextStoreId,
          standardProductTemplateId: dto.standardProductTemplateId,
          mappingStatus: dto.mappingStatus,
          isPreferred: dto.isPreferred,
        }),
        include: this.supplyMappingInclude(),
      });
    });
    return this.mapCatalogMapping(record);
  }

  async findOrders(query: QueryProcurementOrdersDto, actor?: SupplyPlatformActor) {
    const { page, pageSize, skip } = this.page(query);
    const where: any = {};
    if (query.storeId) where.storeId = Number(query.storeId);
    const supplierId = this.scopedSupplierId(actor, query.supplierId ? Number(query.supplierId) : undefined);
    if (supplierId) where.supplierId = Number(supplierId);
    if (query.status) where.status = query.status;
    const keyword = this.text(query.keyword);
    if (keyword) where.OR = [{ orderNo: { contains: keyword, mode: 'insensitive' } }, { supplier: { name: { contains: keyword, mode: 'insensitive' } } }];
    const [items, total] = await Promise.all([
      this.prisma.procurementOrder.findMany({
        where,
        include: { supplier: { select: { id: true, name: true } }, store: { select: { id: true, name: true } }, items: { include: { supplySku: true, quote: true } }, shipments: true },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.procurementOrder.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  async findOrder(id: number, actor?: SupplyPlatformActor) {
    const item = await this.prisma.procurementOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        store: { select: { id: true, name: true } },
        items: { include: { product: true, supplySku: true, quote: true, shipmentItems: true } },
        shipments: { include: { items: { include: { orderItem: true, supplySku: true } } } },
      },
    });
    if (!item) throw new NotFoundException('采购订单不存在');
    this.ensureManageOrOwnSupplier(actor, item.supplierId);
    return item;
  }

  async createOrdersFromReplenishment(dto: CreateProcurementOrdersFromReplenishmentDto) {
    const store = await this.prisma.store.findFirst({ where: { id: dto.storeId, deletedAt: null } });
    if (!store) throw new NotFoundException('门店不存在');
    const productIds = [...new Set(dto.items.map((item) => Number(item.productId)))];
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds }, storeId: dto.storeId, deletedAt: null } });
    const productMap = new Map(products.map((item) => [item.id, item]));
    const mappingIds = [...new Set(dto.items.map((item) => item.mappingId).filter(Boolean) as number[])];
    const now = new Date();
    const mappingOrConditions: Prisma.SupplyCatalogMappingWhereInput[] = [
      { productId: { in: productIds }, OR: [{ storeId: dto.storeId }, { storeId: null }] },
    ];
    if (mappingIds.length) {
      mappingOrConditions.unshift({ id: { in: mappingIds } });
    }
    const mappings = await this.prisma.supplyCatalogMapping.findMany({
      where: {
        mappingStatus: 'active',
        OR: mappingOrConditions,
        supplySku: { status: 'active', auditStatus: 'approved', deletedAt: null },
      },
      include: {
        supplySku: {
          include: {
            supplier: { select: { id: true, name: true } },
            quotes: {
              where: {
                status: 'active',
                auditStatus: 'approved',
                deletedAt: null,
                stockStatus: { notIn: ['out_of_stock', 'unavailable'] },
                AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ validTo: null }, { validTo: { gte: now } }] }],
              },
              orderBy: [{ price: 'asc' }],
            },
          },
        },
      },
      orderBy: [{ isPreferred: 'desc' }, { updatedAt: 'desc' }],
    });
    const mappingsById = new Map(mappings.map((item: any) => [item.id, item]));
    const mappingsByProduct = new Map<number, any[]>();
    for (const mapping of mappings as any[]) {
      if (!mapping.productId) continue;
      const list = mappingsByProduct.get(mapping.productId) ?? [];
      list.push(mapping);
      mappingsByProduct.set(mapping.productId, list);
    }

    const grouped = new Map<number, CreateProcurementOrderDto['items']>();
    for (const input of dto.items) {
      const product = productMap.get(Number(input.productId));
      if (!product) throw new NotFoundException(`本地商品 ${input.productId} 不存在或不属于当前门店`);
      const candidates = input.mappingId ? [mappingsById.get(Number(input.mappingId))].filter(Boolean) : (mappingsByProduct.get(product.id) ?? []);
      const mapping: any = candidates.find((item: any) => {
        if (item.productId && Number(item.productId) !== Number(product.id)) return false;
        if (input.supplySkuId && Number(item.supplySkuId) !== Number(input.supplySkuId)) return false;
        if (input.quoteId && !item.supplySku?.quotes?.some((quote: any) => Number(quote.id) === Number(input.quoteId))) return false;
        return true;
      });
      if (!mapping) throw new BadRequestException(`${product.name} 尚未建立可用供应链映射`);
      const quote = input.quoteId
        ? mapping.supplySku?.quotes?.find((item: any) => Number(item.id) === Number(input.quoteId))
        : mapping.supplySku?.quotes?.[0];
      if (!quote || !this.isQuoteAvailable(quote)) throw new BadRequestException(`${product.name} 暂无可用平台报价`);
      const supplierId = Number(mapping.supplySku.supplierId);
      const list = grouped.get(supplierId) ?? [];
      list.push({
        productId: product.id,
        supplySkuId: Number(mapping.supplySkuId),
        quoteId: Number(quote.id),
        quantity: Number(input.quantity),
      });
      grouped.set(supplierId, list);
    }

    const orders = await Promise.all(
      [...grouped.entries()].map(([supplierId, items]) =>
        this.createOrder({
          storeId: dto.storeId,
          supplierId,
          expectedArrivalDate: dto.expectedArrivalDate,
          sourceType: 'inventory_replenishment',
          sourceNo: dto.sourceNo,
          items,
        }),
      ),
    );
    return { items: orders, data: orders, total: orders.length, sourceType: 'inventory_replenishment' };
  }

  async createOrder(dto: CreateProcurementOrderDto) {
    const supplier = await this.findSupplier(dto.supplierId);
    const store = await this.prisma.store.findFirst({ where: { id: dto.storeId, deletedAt: null } });
    if (!store) throw new NotFoundException('门店不存在');
    const skuIds = [...new Set(dto.items.map((item) => item.supplySkuId))];
    const quoteIds = [...new Set(dto.items.map((item) => item.quoteId).filter(Boolean) as number[])];
    const [skus, quotes] = await Promise.all([
      this.prisma.supplySku.findMany({ where: { id: { in: skuIds }, deletedAt: null } }),
      this.prisma.supplyQuote.findMany({ where: { id: { in: quoteIds }, deletedAt: null } }),
    ]);
    const skuMap = new Map(skus.map((item) => [item.id, item]));
    const quoteMap = new Map(quotes.map((item) => [item.id, item]));
    const orderItems = dto.items.map((input) => {
      const sku = skuMap.get(input.supplySkuId);
      if (!sku) throw new NotFoundException(`供应链商品 ${input.supplySkuId} 不存在`);
      if (sku.supplierId !== dto.supplierId) throw new BadRequestException(`${sku.name} 不属于当前供应商`);
      const quote = input.quoteId ? quoteMap.get(input.quoteId) : undefined;
      if (quote && (!this.isQuoteAvailable(quote) || quote.supplySkuId !== sku.id)) throw new BadRequestException(`${sku.name} 报价不可用`);
      const quantity = Math.max(input.quantity, quote?.moq ?? 1);
      const unitPrice = input.unitPrice ?? this.toNumber(quote?.price);
      return { productId: input.productId, supplySkuId: sku.id, quoteId: quote?.id, quantity, unitPrice, subtotal: quantity * unitPrice };
    });
    const totalAmount = orderItems.reduce((sum, item) => sum + item.subtotal, 0);
    const platformFee = totalAmount * this.toNumber(supplier.platformFeeRate, DEFAULT_PLATFORM_FEE_RATE);
    const rebateAmount = totalAmount * this.toNumber(supplier.rebateRate);
    const order = await this.prisma.procurementOrder.create({
      data: {
        orderNo: this.orderNo(),
        storeId: dto.storeId,
        supplierId: dto.supplierId,
        status: 'pending_supplier_confirm',
        totalAmount,
        platformFee,
        rebateAmount,
        netAmount: Math.max(0, totalAmount - rebateAmount),
        expectedArrivalDate: dto.expectedArrivalDate ? new Date(dto.expectedArrivalDate) : undefined,
        sourceType: dto.sourceType ?? 'manual',
        sourceNo: dto.sourceNo,
        items: { create: orderItems },
      },
      include: { supplier: true, store: true, items: { include: { supplySku: true, quote: true } } },
    });
    return order;
  }

  async updateOrderStatus(id: number, dto: UpdateProcurementOrderStatusDto, actor?: SupplyPlatformActor) {
    const order = await this.findOrder(id, actor);
    if (!this.isSupplyManager(actor)) {
      if (!actor?.supplySupplierId) throw new BadRequestException('当前账号不能更新供应链采购单状态');
      if (order.status !== 'pending_supplier_confirm') throw new BadRequestException('供应商只能处理待确认订单');
      if (!['accepted', 'rejected'].includes(dto.status)) throw new BadRequestException('供应商只能接单或拒单');
    }
    const now = new Date();
    const data: any = { status: dto.status };
    if (dto.status === 'accepted') data.acceptedAt = now;
    if (dto.status === 'rejected') data.rejectedAt = now;
    if (dto.status === 'settled') data.settledAt = now;
    return this.prisma.procurementOrder.update({ where: { id }, data, include: { items: true, shipments: true } });
  }

  async createShipment(orderId: number, dto: CreateShipmentDto, actor?: SupplyPlatformActor) {
    const order = await this.findOrder(orderId, actor);
    if (order.status === 'rejected' || order.status === 'cancelled' || order.status === 'received' || order.status === 'settled') {
      throw new BadRequestException('当前采购单状态不能发货');
    }
    const itemMap = new Map(order.items.map((item: any) => [item.id, item]));
    for (const input of dto.items) {
      const orderItem = itemMap.get(input.orderItemId);
      if (!orderItem) throw new NotFoundException('采购明细不存在');
      if (orderItem.supplySkuId !== input.supplySkuId) throw new BadRequestException('发货商品与采购明细不一致');
    }
    const shipment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supplierShipment.create({
        data: {
          orderId,
          supplierId: order.supplierId,
          shipmentNo: this.shipmentNo(),
          logisticsCompany: dto.logisticsCompany,
          trackingNo: dto.trackingNo,
          shippedAt: dto.shippedAt ? new Date(dto.shippedAt) : new Date(),
          expectedArrivalAt: dto.expectedArrivalAt ? new Date(dto.expectedArrivalAt) : undefined,
          items: {
            create: dto.items.map((item) => ({
              orderItemId: item.orderItemId,
              supplySkuId: item.supplySkuId,
              shippedQty: item.shippedQty,
              batchNo: item.batchNo,
              productionDate: item.productionDate ? new Date(item.productionDate) : undefined,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
            })),
          },
        },
        include: { items: true },
      });
      await tx.procurementOrder.update({ where: { id: orderId }, data: { status: 'shipped', shippedAt: new Date() } });
      return created;
    });
    return shipment;
  }

  async receiveOrder(orderId: number, dto: ReceiveProcurementOrderDto & { operatorId?: number | string }) {
    const affectedStoreId = await this.prisma.$transaction(async (tx) => {
      const order = await tx.procurementOrder.findUnique({
        where: { id: orderId },
        include: { items: { include: { product: true, supplySku: true } }, shipments: { include: { items: true } } },
      });
      if (!order) throw new NotFoundException('采购订单不存在');
      const shipmentItems = new Map(order.shipments.flatMap((shipment) => shipment.items.map((item) => [item.id, { ...item, shipment }])));
      const orderItemMap = new Map(order.items.map((item) => [item.id, item]));
      for (const input of dto.items) {
        const shipmentItem: any = shipmentItems.get(input.shipmentItemId);
        if (!shipmentItem) throw new NotFoundException('发货明细不存在');
        const orderItem = orderItemMap.get(shipmentItem.orderItemId);
        if (!orderItem) throw new NotFoundException('采购明细不存在');
        const productId = input.productId ?? orderItem.productId;
        if (!productId) throw new BadRequestException(`${orderItem.supplySku.name} 尚未绑定本地商品，不能入库`);
        const product = await tx.product.findFirst({ where: { id: productId, storeId: order.storeId, deletedAt: null } });
        if (!product) throw new NotFoundException('本地商品不存在或不属于当前门店');
        const remaining = this.toNumber(shipmentItem.shippedQty) - this.toNumber(shipmentItem.receivedQty);
        if (input.receivedQty > remaining) throw new BadRequestException(`${product.name} 收货数量超过未收数量`);
        const beforeStock = this.toNumber(product.currentStock);
        const afterStock = beforeStock + input.receivedQty;
        const batch = await tx.stockBatch.create({
          data: {
            productId,
            batchNo: shipmentItem.batchNo ?? `${order.orderNo}-${productId}`,
            stock: input.receivedQty,
            productionDate: shipmentItem.productionDate ?? undefined,
            expiryDate: shipmentItem.expiryDate ?? undefined,
          },
        });
        await tx.product.update({ where: { id: productId }, data: { currentStock: { increment: input.receivedQty } } });
        await tx.stockMovement.create({
          data: {
            storeId: order.storeId,
            productId,
            batchId: batch.id,
            movementNo: this.movementNo(),
            movementType: 'purchase_inbound',
            quantity: input.receivedQty,
            beforeStock,
            afterStock,
            unit: product.specUnit ?? product.unit,
            sourceType: 'supply_platform_order',
            sourceId: order.id,
            sourceNo: order.orderNo,
            ...(dto.operatorId ? { operatorId: Number(dto.operatorId) } : {}),
            remark: dto.remark,
          },
        });
        await tx.supplierShipmentItem.update({
          where: { id: shipmentItem.id },
          data: { receivedQty: { increment: input.receivedQty } },
        });
        await tx.procurementOrderItem.update({
          where: { id: orderItem.id },
          data: { receivedQty: { increment: input.receivedQty }, productId },
        });
      }
      const refreshedItems = await tx.procurementOrderItem.findMany({ where: { orderId } });
      const allReceived = refreshedItems.every((item) => item.receivedQty >= item.quantity);
      const anyReceived = refreshedItems.some((item) => item.receivedQty > 0);
      await tx.procurementOrder.update({
        where: { id: orderId },
        data: { status: allReceived ? 'received' : anyReceived ? 'partial_received' : order.status, receivedAt: allReceived ? new Date() : order.receivedAt },
      });
      return order.storeId;
    });
    return { ...(await this.findOrder(orderId)), affectedStoreId };
  }

  async generateSettlement(dto: GenerateSupplySettlementDto) {
    const { start, end } = this.monthRange(dto.settleMonth);
    const where: any = { status: { in: ['received', 'settled'] }, receivedAt: { gte: start, lt: end } };
    if (dto.supplierId) where.supplierId = Number(dto.supplierId);
    const orders = await this.prisma.procurementOrder.findMany({ where });
    const groups = new Map<number, typeof orders>();
    for (const order of orders) groups.set(order.supplierId, [...(groups.get(order.supplierId) ?? []), order]);
    const items = await this.prisma.$transaction(
      [...groups.entries()].map(([supplierId, supplierOrders]) => {
        const totalAmount = supplierOrders.reduce((sum, order) => sum + this.toNumber(order.totalAmount), 0);
        const rebateAmount = supplierOrders.reduce((sum, order) => sum + this.toNumber(order.rebateAmount), 0);
        const platformFee = supplierOrders.reduce((sum, order) => sum + this.toNumber(order.platformFee), 0);
        return this.prisma.supplySettlement.upsert({
          where: { supplierId_settleMonth: { supplierId, settleMonth: dto.settleMonth } },
          update: { orderCount: supplierOrders.length, totalAmount, rebateAmount, platformFee, netPayable: Math.max(0, totalAmount - rebateAmount - platformFee) },
          create: { supplierId, settleMonth: dto.settleMonth, orderCount: supplierOrders.length, totalAmount, rebateAmount, platformFee, netPayable: Math.max(0, totalAmount - rebateAmount - platformFee) },
          include: { supplier: true },
        });
      }),
    );
    return { items, total: items.length };
  }

  async findSettlements(query: { page?: number; pageSize?: number; supplierId?: number; settleMonth?: string; status?: string }, actor?: SupplyPlatformActor) {
    const { page, pageSize, skip } = this.page(query);
    const where: any = {};
    const supplierId = this.scopedSupplierId(actor, query.supplierId ? Number(query.supplierId) : undefined);
    if (supplierId) where.supplierId = Number(supplierId);
    if (query.settleMonth) where.settleMonth = query.settleMonth;
    if (query.status) where.status = query.status;
    const [items, total] = await Promise.all([
      this.prisma.supplySettlement.findMany({ where, include: { supplier: true }, skip, take: pageSize, orderBy: [{ settleMonth: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.supplySettlement.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  async getInTransitByProduct(storeId: number, productIds: number[]) {
    if (!productIds.length) return new Map<number, number>();
    const items = await this.prisma.procurementOrderItem.findMany({
      where: { productId: { in: productIds }, order: { storeId, status: { in: ACTIVE_PROCUREMENT_STATUSES } } },
      select: { productId: true, quantity: true, receivedQty: true },
    });
    const map = new Map<number, number>();
    for (const item of items) {
      if (!item.productId) continue;
      map.set(item.productId, (map.get(item.productId) ?? 0) + Math.max(0, item.quantity - item.receivedQty));
    }
    return map;
  }
}
