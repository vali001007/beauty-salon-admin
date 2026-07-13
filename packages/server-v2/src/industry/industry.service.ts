import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AdoptIndustryProductTemplateDto,
  AdoptIndustryServiceTemplateDto,
  BatchAdoptIndustryProductTemplatesDto,
  CreateIndustryAdoptionDto,
  CreateIndustryDataSourceDto,
  CreateIndustryKnowledgeItemDto,
  CreateIndustryProductTemplateDto,
  CreateIndustrySalaryBenchmarkDto,
  CreateIndustryServiceTemplateDto,
  CreateIndustrySupplyMappingRequestDto,
  QueryIndustryDataSourcesDto,
  QueryIndustryKnowledgeDto,
  QueryIndustryProductTemplatesDto,
  QueryIndustrySalaryDto,
  QueryIndustryServiceTemplatesDto,
  SaveIndustryBomTemplateDto,
  LinkIndustryProductTemplateDto,
  UpdateIndustryDataSourceDto,
  UpdateIndustryKnowledgeItemDto,
  UpdateIndustryProductTemplateDto,
  UpdateIndustrySalaryBenchmarkDto,
  UpdateIndustryServiceTemplateDto,
} from './dto/industry.dto.js';

type AnyRecord = Record<string, any>;

@Injectable()
export class IndustryService {
  constructor(private prisma: PrismaService) {}

  private get db(): any {
    return this.prisma as any;
  }

  private pagination(query: { page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
  }

  private clean<T extends AnyRecord>(data: T): T {
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as T;
  }

  private keywordWhere(keyword?: string, fields: string[] = ['name']) {
    if (!keyword?.trim()) return undefined;
    return {
      OR: fields.map((field) => ({ [field]: { contains: keyword.trim(), mode: 'insensitive' } })),
    };
  }

  private publishedWhere(status?: string) {
    return status ? { status } : { status: 'published' };
  }

  async findDataSources(query: QueryIndustryDataSourcesDto) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where = this.clean({
      deletedAt: null,
      status: query.status,
      sourceType: query.sourceType,
      confidenceLevel: query.confidenceLevel,
      ...this.keywordWhere(query.keyword, ['name', 'ownerName']),
    });
    const [items, total] = await Promise.all([
      this.db.industryDataSource.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' }, include: { evidences: true } }),
      this.db.industryDataSource.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  createDataSource(dto: CreateIndustryDataSourceDto) {
    return this.db.industryDataSource.create({ data: this.clean({ ...dto }) });
  }

  async updateDataSource(id: number, dto: UpdateIndustryDataSourceDto) {
    await this.assertExists(this.db.industryDataSource, id, '数据源不存在');
    return this.db.industryDataSource.update({ where: { id }, data: this.clean({ ...dto }) });
  }

  async findServiceTemplates(query: QueryIndustryServiceTemplatesDto, publishedOnly = false) {
    const where = this.clean({
      deletedAt: null,
      ...(publishedOnly ? this.publishedWhere(query.status) : { status: query.status }),
      category: query.category,
      subCategory: query.subCategory,
      ...this.keywordWhere(query.keyword, ['name', 'code', 'category', 'subCategory']),
    });
    return this.db.industryServiceTemplate.findMany({
      where,
      include: {
        bomTemplates: {
          where: publishedOnly ? { status: 'published', deletedAt: null } : { deletedAt: null },
          include: { items: { include: { productTemplate: true } } },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async findServiceTemplatesPaginated(query: QueryIndustryServiceTemplatesDto) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where = this.clean({
      deletedAt: null,
      status: query.status,
      category: query.category,
      subCategory: query.subCategory,
      ...this.keywordWhere(query.keyword, ['name', 'code', 'category', 'subCategory']),
    });
    const [items, total] = await Promise.all([
      this.db.industryServiceTemplate.findMany({
        where,
        skip,
        take,
        include: {
          source: true,
          bomTemplates: {
            where: { deletedAt: null },
            include: { items: { include: { productTemplate: true }, orderBy: { id: 'asc' } } },
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.db.industryServiceTemplate.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  async findServiceTemplate(id: number, publishedOnly = false) {
    const template = await this.db.industryServiceTemplate.findFirst({
      where: { id, deletedAt: null, ...(publishedOnly ? { status: 'published' } : {}) },
      include: {
        source: true,
        bomTemplates: {
          where: { deletedAt: null, ...(publishedOnly ? { status: 'published' } : {}) },
          include: { items: { include: { productTemplate: true } } },
          orderBy: { version: 'desc' },
        },
      },
    });
    if (!template) throw new NotFoundException('行业服务项目模板不存在');
    return template;
  }

  createServiceTemplate(dto: CreateIndustryServiceTemplateDto) {
    return this.db.industryServiceTemplate.create({ data: this.clean({ ...dto }) });
  }

  async updateServiceTemplate(id: number, dto: UpdateIndustryServiceTemplateDto) {
    await this.findServiceTemplate(id);
    return this.db.industryServiceTemplate.update({ where: { id }, data: this.clean({ ...dto }) });
  }

  setServiceTemplateStatus(id: number, status: string) {
    const data: AnyRecord = { status };
    if (status === 'published') data.publishedAt = new Date();
    return this.db.industryServiceTemplate.update({ where: { id }, data });
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

  private async attachProductTemplateChainInfo<T>(templates: T[], storeId?: number): Promise<Array<T & { adoptionSummary: any; supplySummary: any }>> {
    const rows = templates as any[];
    const templateIds = [...new Set(rows.map((template) => Number(template.id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (!templateIds.length) {
      return rows.map((template) => ({
        ...template,
        adoptionSummary: { status: 'unadopted', localProductId: null, localProductName: null, localProductSku: null },
        supplySummary: { status: 'not_mapped', mappingCount: 0, availableQuoteCount: 0 },
      }));
    }

    const adoptionWhere: AnyRecord = { productTemplateId: { in: templateIds }, localProductId: { not: null } };
    if (storeId) adoptionWhere.storeId = storeId;
    const mappingWhere: AnyRecord = { standardProductTemplateId: { in: templateIds } };
    if (storeId) mappingWhere.storeId = storeId;

    const [adoptions, mappings] = await Promise.all([
      this.db.industryAdoptionRecord.findMany({
        where: adoptionWhere,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.supplyCatalogMapping.findMany({
        where: mappingWhere,
        include: {
          supplySku: {
            include: {
              supplier: { select: { id: true, name: true } },
              quotes: { orderBy: { updatedAt: 'desc' } },
            },
          },
        },
      }),
    ]);

    const localProductIds = [...new Set(adoptions.map((adoption: any) => adoption.localProductId).filter(Boolean))];
    const products = localProductIds.length
      ? await this.db.product.findMany({
          where: { id: { in: localProductIds } },
          select: { id: true, storeId: true, sku: true, name: true, deletedAt: true },
        })
      : [];
    const productById = new Map<number, AnyRecord>(products.map((product: any) => [product.id, product]));

    const adoptionByTemplateId = new Map<number, any>();
    for (const adoption of adoptions) {
      const templateId = Number(adoption.productTemplateId);
      if (!Number.isInteger(templateId) || adoptionByTemplateId.has(templateId)) continue;
      adoptionByTemplateId.set(templateId, adoption);
    }

    const mappingsByTemplateId = new Map<number, any[]>();
    for (const mapping of mappings) {
      const templateId = Number(mapping.standardProductTemplateId);
      if (!Number.isInteger(templateId)) continue;
      mappingsByTemplateId.set(templateId, [...(mappingsByTemplateId.get(templateId) ?? []), mapping]);
    }

    return rows.map((template) => {
      const adoption = adoptionByTemplateId.get(template.id);
      const product = adoption?.localProductId ? productById.get(adoption.localProductId) : null;
      const chainStatus = this.chainStatusFromPayload(adoption?.payload);
      const adoptionStatus = !adoption
        ? 'unadopted'
        : chainStatus === 'invalid'
          ? 'invalid'
          : !product || product.deletedAt
            ? 'invalid'
            : adoption.storeId && product.storeId !== adoption.storeId
              ? 'invalid'
              : 'adopted';
      const templateMappings = mappingsByTemplateId.get(template.id) ?? [];
      const availableMappings = templateMappings.filter((mapping) =>
        mapping.mappingStatus === 'active' && mapping.supplySku?.quotes?.some((quote: any) => this.quoteAvailable(quote)),
      );
      const supplyStatus = templateMappings.length === 0
        ? 'not_mapped'
        : availableMappings.length > 0
          ? 'available'
          : 'mapped_no_quote';

      return {
        ...template,
        adoptionSummary: {
          status: adoptionStatus,
          adoptionId: adoption?.id ?? null,
          adoptedAt: adoption?.createdAt ?? null,
          localProductId: product?.id ?? adoption?.localProductId ?? null,
          localProductName: product?.name ?? null,
          localProductSku: product?.sku ?? null,
        },
        supplySummary: {
          status: supplyStatus,
          mappingCount: templateMappings.length,
          availableQuoteCount: availableMappings.length,
          preferredSupplierName: availableMappings[0]?.supplySku?.supplier?.name ?? templateMappings[0]?.supplySku?.supplier?.name ?? null,
        },
      };
    });
  }

  private filterTemplatesByAdoptionStatus<T extends AnyRecord>(templates: T[], adoptionStatus?: string) {
    if (!adoptionStatus) return templates;
    return templates.filter((template: any) => {
      if (adoptionStatus === 'unadopted') return template.adoptionSummary?.status === 'unadopted';
      if (adoptionStatus === 'adopted') return template.adoptionSummary?.status === 'adopted';
      if (adoptionStatus === 'invalid') return template.adoptionSummary?.status === 'invalid';
      if (adoptionStatus === 'unmapped_supply') return template.supplySummary?.status === 'not_mapped';
      if (adoptionStatus === 'available') return template.supplySummary?.status === 'available';
      return true;
    });
  }

  private summarizeProductTemplateCoverage(templates: AnyRecord[]) {
    const total = templates.length;
    const published = templates.filter((item) => item.status === 'published').length;
    const adopted = templates.filter((item) => item.adoptionSummary?.status === 'adopted').length;
    const invalid = templates.filter((item) => item.adoptionSummary?.status === 'invalid').length;
    const unadopted = templates.filter((item) => item.adoptionSummary?.status === 'unadopted').length;
    const mappedSupply = templates.filter((item) => item.supplySummary?.mappingCount > 0).length;
    const available = templates.filter((item) => item.supplySummary?.status === 'available').length;
    return {
      total,
      published,
      adopted,
      invalid,
      unadopted,
      mappedSupply,
      available,
      adoptionRate: total ? Number((adopted / total).toFixed(4)) : 0,
      supplyAvailableRate: total ? Number((available / total).toFixed(4)) : 0,
    };
  }

  async findProductTemplates(query: QueryIndustryProductTemplatesDto, publishedOnly = false, storeId?: number) {
    const where = this.clean({
      deletedAt: null,
      ...(publishedOnly ? this.publishedWhere(query.status) : { status: query.status }),
      category: query.category,
      productType: query.productType,
      futureSupplyMappingStatus: query.futureSupplyMappingStatus,
      ...this.keywordWhere(query.keyword, ['name', 'standardProductCode', 'category', 'subCategory']),
    });
    const items = await this.db.industryProductTemplate.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
    const withChainInfo = await this.attachProductTemplateChainInfo(items, storeId);
    return this.filterTemplatesByAdoptionStatus(withChainInfo, query.adoptionStatus);
  }

  async findProductTemplatesPaginated(query: QueryIndustryProductTemplatesDto, storeId?: number) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where = this.clean({
      deletedAt: null,
      status: query.status,
      category: query.category,
      productType: query.productType,
      futureSupplyMappingStatus: query.futureSupplyMappingStatus,
      ...this.keywordWhere(query.keyword, ['name', 'standardProductCode', 'category', 'subCategory']),
    });
    if (query.adoptionStatus) {
      const allItems = await this.db.industryProductTemplate.findMany({ where, orderBy: { updatedAt: 'desc' } });
      const allWithChainInfo = await this.attachProductTemplateChainInfo(allItems, storeId);
      const filtered = this.filterTemplatesByAdoptionStatus(allWithChainInfo, query.adoptionStatus);
      const items = filtered.slice(skip, skip + take);
      return { items, data: items, total: filtered.length, page, pageSize, coverage: this.summarizeProductTemplateCoverage(allWithChainInfo) };
    }
    const [items, total] = await Promise.all([
      this.db.industryProductTemplate.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' } }),
      this.db.industryProductTemplate.count({ where }),
    ]);
    const itemsWithChainInfo = await this.attachProductTemplateChainInfo(items, storeId);
    const allItems = await this.db.industryProductTemplate.findMany({ where, orderBy: { updatedAt: 'desc' } });
    const allWithChainInfo = await this.attachProductTemplateChainInfo(allItems, storeId);
    return { items: itemsWithChainInfo, data: itemsWithChainInfo, total, page, pageSize, coverage: this.summarizeProductTemplateCoverage(allWithChainInfo) };
  }

  async productTemplateAdoptionCoverage(query: QueryIndustryProductTemplatesDto, headerStoreId?: number) {
    const storeId = await this.resolveStoreId(this.db, query.storeId ?? headerStoreId);
    const items = await this.findProductTemplates(query, false, storeId);
    return {
      storeId,
      coverage: this.summarizeProductTemplateCoverage(items as AnyRecord[]),
      items,
    };
  }

  private nowTs() {
    return Date.now();
  }

  private isSupplyQuoteAvailable(quote: AnyRecord, now = this.nowTs()) {
    const validFrom = quote.validFrom ? new Date(quote.validFrom).getTime() : null;
    const validTo = quote.validTo ? new Date(quote.validTo).getTime() : null;
    return (
      quote.status === 'active' &&
      quote.auditStatus === 'approved' &&
      quote.stockStatus !== 'unavailable' &&
      quote.stockStatus !== 'out_of_stock' &&
      !quote.deletedAt &&
      (validFrom === null || validFrom <= now) &&
      (validTo === null || validTo >= now)
    );
  }

  private decimalToNumber(value: unknown) {
    if (value === null || value === undefined) return 0;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  private buildProductTemplateChainItem(params: {
    template: AnyRecord;
    adoption?: AnyRecord;
    product?: AnyRecord | null;
    industryBomItems: AnyRecord[];
    localBomItems: AnyRecord[];
    stockMovements: AnyRecord[];
    supplyMappings: AnyRecord[];
    procurementItems: AnyRecord[];
    orderItems: AnyRecord[];
  }) {
    const { template, adoption, product, industryBomItems, localBomItems, stockMovements, supplyMappings, procurementItems, orderItems } = params;
    const validProduct = product && !product.deletedAt ? product : null;
    const activeMappings = supplyMappings.filter((mapping) => mapping.mappingStatus === 'active');
    const now = this.nowTs();
    const availableMappings = activeMappings.filter((mapping) =>
      mapping.supplySku?.quotes?.some((quote: AnyRecord) => this.isSupplyQuoteAvailable(quote, now)),
    );
    const receivedQty = procurementItems.reduce((sum, item) => sum + this.decimalToNumber(item.receivedQty), 0);
    const orderedQty = procurementItems.reduce((sum, item) => sum + this.decimalToNumber(item.quantity), 0);
    const inboundMovements = stockMovements.filter((item) => item.movementType === 'inbound');
    const serviceMovements = stockMovements.filter((item) => ['service_consume', 'service_consumption'].includes(item.movementType));
    const saleMovements = stockMovements.filter((item) => item.movementType === 'sale_out');
    const productOrderItems = orderItems.filter((item) => item.itemType === 'product');

    const adoptionStatus = !adoption
      ? 'missing'
      : validProduct
        ? 'ready'
        : 'broken';
    const bomStatus = industryBomItems.length || localBomItems.length ? 'ready' : 'missing';
    const inventoryStatus = !validProduct
      ? 'blocked'
      : stockMovements.length || this.decimalToNumber(validProduct.currentStock) > 0
        ? 'ready'
        : 'empty';
    const supplyStatus = availableMappings.length
      ? 'ready'
      : activeMappings.length
        ? 'missing_quote'
        : 'missing';
    const procurementStatus = procurementItems.length
      ? receivedQty > 0
        ? 'received'
        : 'ordered'
      : supplyStatus === 'ready'
        ? 'ready_no_order'
        : 'blocked';
    const salesStatus = productOrderItems.length || serviceMovements.length || saleMovements.length ? 'ready' : 'missing';

    const blockers: string[] = [];
    if (adoptionStatus === 'missing') blockers.push('未采用/未映射本地产品');
    if (adoptionStatus === 'broken') blockers.push('采用记录指向的本地产品已缺失或失效');
    if (bomStatus === 'missing') blockers.push('未被行业 BOM 或门店项目 BOM 使用');
    if (supplyStatus === 'missing') blockers.push('未配置供应链 SKU 映射');
    if (supplyStatus === 'missing_quote') blockers.push('已有供应链映射但无可用报价');
    if (procurementStatus === 'ready_no_order') blockers.push('可生成平台采购单但暂无采购履约记录');
    if (procurementStatus === 'blocked') blockers.push('采购履约被前序链路阻断');
    if (salesStatus === 'missing') blockers.push('暂无商品销售或服务扣耗记录');

    return {
      productTemplateId: template.id,
      standardProductCode: template.standardProductCode,
      name: template.name,
      category: template.category,
      productType: template.productType,
      status: template.status,
      adoption: {
        status: adoptionStatus,
        adoptionId: adoption?.id ?? null,
        adoptionType: adoption?.adoptionType ?? null,
        localProductId: validProduct?.id ?? adoption?.localProductId ?? null,
        localProductName: validProduct?.name ?? null,
        localProductSku: validProduct?.sku ?? null,
      },
      localProduct: validProduct
        ? {
            id: validProduct.id,
            storeId: validProduct.storeId,
            name: validProduct.name,
            sku: validProduct.sku,
            currentStock: this.decimalToNumber(validProduct.currentStock),
            safetyStock: this.decimalToNumber(validProduct.safetyStock),
            packageUnit: validProduct.packageUnit ?? validProduct.unit ?? null,
            specUnit: validProduct.specUnit ?? null,
          }
        : null,
      counters: {
        industryBomItemCount: industryBomItems.length,
        localBomItemCount: localBomItems.length,
        stockMovementCount: stockMovements.length,
        inboundMovementCount: inboundMovements.length,
        serviceConsumptionCount: serviceMovements.length,
        saleMovementCount: saleMovements.length,
        supplyMappingCount: activeMappings.length,
        availableQuoteCount: availableMappings.reduce(
          (sum, mapping) => sum + (mapping.supplySku?.quotes ?? []).filter((quote: AnyRecord) => this.isSupplyQuoteAvailable(quote, now)).length,
          0,
        ),
        procurementOrderCount: new Set(procurementItems.map((item) => item.orderId).filter(Boolean)).size,
        orderedQty,
        receivedQty,
        productOrderItemCount: productOrderItems.length,
      },
      statuses: {
        adoption: adoptionStatus,
        bom: bomStatus,
        inventory: inventoryStatus,
        supply: supplyStatus,
        procurement: procurementStatus,
        salesService: salesStatus,
      },
      blockers,
      nextAction: blockers[0] ?? '链路已有业务记录，继续观察采购履约和消耗数据。',
      latestActivityAt: [
        adoption?.createdAt,
        validProduct?.updatedAt,
        ...stockMovements.map((item) => item.occurredAt ?? item.createdAt),
        ...procurementItems.map((item) => item.order?.updatedAt ?? item.order?.createdAt),
        ...orderItems.map((item) => item.createdAt),
      ]
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null,
    };
  }

  private async loadProductTemplateChainRows(query: QueryIndustryProductTemplatesDto, storeId?: number, templateId?: number) {
    const where = this.clean({
      deletedAt: null,
      id: templateId,
      status: query.status,
      category: query.category,
      productType: query.productType,
      futureSupplyMappingStatus: query.futureSupplyMappingStatus,
      ...this.keywordWhere(query.keyword, ['name', 'standardProductCode', 'category', 'subCategory']),
    });
    const templates = await this.db.industryProductTemplate.findMany({
      where,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });
    const templateIds = templates.map((item: AnyRecord) => Number(item.id)).filter(Boolean);
    if (!templateIds.length) {
      return { templates, chainItems: [] };
    }

    const adoptionWhere: AnyRecord = {
      productTemplateId: { in: templateIds },
      localProductId: { not: null },
      adoptionType: { in: ['product', 'product_mapping'] },
    };
    const mappingWhere: AnyRecord = { standardProductTemplateId: { in: templateIds } };
    if (storeId) {
      adoptionWhere.storeId = storeId;
      mappingWhere.OR = [{ storeId }, { storeId: null }];
    }

    const [adoptions, industryBomItems, supplyMappings] = await Promise.all([
      this.db.industryAdoptionRecord.findMany({ where: adoptionWhere, orderBy: { createdAt: 'desc' } }),
      this.db.industryProjectBomItemTemplate.findMany({
        where: { productTemplateId: { in: templateIds } },
        include: { bomTemplate: { include: { serviceTemplate: true } } },
      }),
      this.db.supplyCatalogMapping.findMany({
        where: mappingWhere,
        include: {
          supplySku: {
            include: {
              supplier: { select: { id: true, name: true } },
              quotes: { orderBy: { updatedAt: 'desc' } },
            },
          },
        },
      }),
    ]);

    const adoptionByTemplateId = new Map<number, AnyRecord>();
    for (const adoption of adoptions) {
      const id = Number(adoption.productTemplateId);
      if (!adoptionByTemplateId.has(id)) adoptionByTemplateId.set(id, adoption);
    }
    const productIds = [...new Set(adoptions.map((item: AnyRecord) => Number(item.localProductId)).filter(Boolean))];
    const productWhere: AnyRecord = { id: { in: productIds } };
    if (storeId) productWhere.storeId = storeId;
    const products = productIds.length
      ? await this.db.product.findMany({
          where: productWhere,
          select: {
            id: true,
            storeId: true,
            name: true,
            sku: true,
            currentStock: true,
            safetyStock: true,
            unit: true,
            packageUnit: true,
            specUnit: true,
            updatedAt: true,
            deletedAt: true,
          },
        })
      : [];
    const productById = new Map<number, AnyRecord>(products.map((item: AnyRecord) => [Number(item.id), item]));

    const [localBomItems, stockMovements, procurementItems, orderItems] = productIds.length
      ? await Promise.all([
          this.db.projectBomItem.findMany({
            where: { productId: { in: productIds } },
            include: { project: { select: { id: true, name: true, status: true } } },
          }),
          this.db.stockMovement.findMany({
            where: { productId: { in: productIds }, ...(storeId ? { storeId } : {}) },
            orderBy: { occurredAt: 'desc' },
            take: 1000,
          }),
          this.db.procurementOrderItem.findMany({
            where: { productId: { in: productIds } },
            include: { order: { include: { supplier: { select: { id: true, name: true } }, shipments: true } }, supplySku: true, quote: true },
            orderBy: { id: 'desc' },
            take: 1000,
          }),
          this.db.orderItem.findMany({
            where: {
              itemType: 'product',
              itemId: { in: productIds },
              order: storeId ? { storeId } : undefined,
            },
            include: { order: { select: { id: true, orderNo: true, status: true, createdAt: true } } },
            orderBy: { createdAt: 'desc' },
            take: 1000,
          }),
        ])
      : [[], [], [], []];

    const groupBy = <T extends AnyRecord>(rows: T[], key: string) => {
      const map = new Map<number, T[]>();
      for (const row of rows) {
        const id = Number(row[key]);
        if (!Number.isInteger(id)) continue;
        map.set(id, [...(map.get(id) ?? []), row]);
      }
      return map;
    };
    const industryBomByTemplateId = groupBy(industryBomItems, 'productTemplateId');
    const supplyMappingsByTemplateId = groupBy(supplyMappings, 'standardProductTemplateId');
    const localBomByProductId = groupBy(localBomItems, 'productId');
    const stockMovementsByProductId = groupBy(stockMovements, 'productId');
    const procurementItemsByProductId = groupBy(procurementItems, 'productId');
    const orderItemsByProductId = groupBy(orderItems, 'itemId');

    const chainItems = templates.map((template: AnyRecord) => {
      const adoption = adoptionByTemplateId.get(Number(template.id));
      const product = adoption?.localProductId ? productById.get(Number(adoption.localProductId)) : null;
      const productId = product?.id ? Number(product.id) : 0;
      return this.buildProductTemplateChainItem({
        template,
        adoption,
        product,
        industryBomItems: industryBomByTemplateId.get(Number(template.id)) ?? [],
        localBomItems: productId ? localBomByProductId.get(productId) ?? [] : [],
        stockMovements: productId ? stockMovementsByProductId.get(productId) ?? [] : [],
        supplyMappings: supplyMappingsByTemplateId.get(Number(template.id)) ?? [],
        procurementItems: productId ? procurementItemsByProductId.get(productId) ?? [] : [],
        orderItems: productId ? orderItemsByProductId.get(productId) ?? [] : [],
      });
    });

    return { templates, chainItems, adoptions, products, industryBomItems, localBomItems, stockMovements, supplyMappings, procurementItems, orderItems };
  }

  private summarizeProductTemplateChain(items: AnyRecord[]) {
    const count = (predicate: (item: AnyRecord) => boolean) => items.filter(predicate).length;
    return {
      total: items.length,
      published: count((item) => item.status === 'published'),
      adopted: count((item) => item.statuses.adoption === 'ready'),
      adoptionBroken: count((item) => item.statuses.adoption === 'broken'),
      bomLinked: count((item) => item.statuses.bom === 'ready'),
      inventoryReady: count((item) => item.statuses.inventory === 'ready'),
      supplyMapped: count((item) => item.statuses.supply !== 'missing'),
      supplyAvailable: count((item) => item.statuses.supply === 'ready'),
      procurementOrdered: count((item) => ['ordered', 'received'].includes(item.statuses.procurement)),
      procurementReceived: count((item) => item.statuses.procurement === 'received'),
      salesOrServiceTouched: count((item) => item.statuses.salesService === 'ready'),
    };
  }

  async productTemplateChainOverview(query: QueryIndustryProductTemplatesDto, headerStoreId?: number) {
    const storeId = await this.resolveStoreId(this.db, query.storeId ?? headerStoreId);
    const { page, pageSize, skip, take } = this.pagination(query);
    const { chainItems } = await this.loadProductTemplateChainRows(query, storeId);
    const items = chainItems.slice(skip, skip + take);
    return {
      storeId,
      summary: this.summarizeProductTemplateChain(chainItems),
      items,
      data: items,
      total: chainItems.length,
      page,
      pageSize,
    };
  }

  private activeSupplyMappings(product: AnyRecord) {
    return (product.supplyMappings ?? []).filter((mapping: AnyRecord) => mapping.mappingStatus === 'active');
  }

  private availableQuotesForMapping(mapping: AnyRecord) {
    const now = this.nowTs();
    return (mapping.supplySku?.quotes ?? []).filter((quote: AnyRecord) => this.isSupplyQuoteAvailable(quote, now));
  }

  async productTemplateChainOperationalReport(query: QueryIndustryProductTemplatesDto, headerStoreId?: number) {
    const storeId = await this.resolveStoreId(this.db, query.storeId ?? headerStoreId);
    const chainQuery = { ...query, status: query.status ?? 'published' };
    const [chainRows, products, bomItems] = await Promise.all([
      this.loadProductTemplateChainRows(chainQuery, storeId),
      this.db.product.findMany({
        where: { storeId, deletedAt: null, status: 'active' },
        include: {
          supplyMappings: {
            include: {
              industryProductTemplate: { select: { id: true, standardProductCode: true, name: true } },
              supplySku: {
                include: {
                  supplier: { select: { id: true, name: true } },
                  quotes: { orderBy: { updatedAt: 'desc' } },
                },
              },
            },
          },
        },
        orderBy: [{ currentStock: 'asc' }, { name: 'asc' }],
      }),
      this.db.projectBomItem.findMany({
        where: { project: { storeId } },
        include: {
          project: { select: { id: true, name: true, storeId: true, status: true } },
          product: {
            select: {
              id: true,
              storeId: true,
              name: true,
              sku: true,
              currentStock: true,
              safetyStock: true,
              specUnit: true,
              packageUnit: true,
              deletedAt: true,
            },
          },
        },
        orderBy: { id: 'asc' },
      }),
    ]);

    const missingLocalSku = chainRows.chainItems
      .filter((item: AnyRecord) => item.statuses?.adoption !== 'ready')
      .map((item: AnyRecord) => ({
        productTemplateId: item.productTemplateId,
        standardProductCode: item.standardProductCode,
        name: item.name,
        category: item.category,
        status: item.statuses?.adoption,
        nextAction: item.statuses?.adoption === 'broken'
          ? '修复失效采用记录，或重新映射到有效本地产品。'
          : '在行业数据平台批量采用，或映射到已有本地产品。',
      }));

    const productsMissingSupplyMapping = products
      .filter((product: AnyRecord) => !this.activeSupplyMappings(product).length)
      .map((product: AnyRecord) => ({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        currentStock: this.decimalToNumber(product.currentStock),
        safetyStock: this.decimalToNumber(product.safetyStock),
        nextAction: '在供应链映射页绑定已审核供应链 SKU 和有效报价。',
      }));

    const bomProductsWithoutStock = bomItems
      .filter((item: AnyRecord) => item.product && !item.product.deletedAt && this.decimalToNumber(item.product.currentStock) <= 0)
      .map((item: AnyRecord) => ({
        bomItemId: item.id,
        projectId: item.projectId,
        projectName: item.project?.name ?? '-',
        productId: item.productId,
        productName: item.product?.name ?? '-',
        sku: item.product?.sku ?? '-',
        currentStock: this.decimalToNumber(item.product?.currentStock),
        standardQty: this.decimalToNumber(item.standardQty),
        unit: item.unit ?? item.product?.specUnit ?? '-',
        nextAction: '先补货或调整服务可售状态，避免服务执行时扣耗失败。',
      }));

    const lowStockProducts = products.filter((product: AnyRecord) => {
      const safetyStock = this.decimalToNumber(product.safetyStock);
      return safetyStock > 0 && this.decimalToNumber(product.currentStock) <= safetyStock;
    });
    const lowStockPlatformPurchasable = lowStockProducts
      .map((product: AnyRecord) => {
        const mapping = this.activeSupplyMappings(product).find((item: AnyRecord) => this.availableQuotesForMapping(item).length);
        const quote = mapping ? this.availableQuotesForMapping(mapping)[0] : null;
        return { product, mapping, quote };
      })
      .filter((item: AnyRecord) => item.mapping && item.quote)
      .map(({ product, mapping, quote }: AnyRecord) => ({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        currentStock: this.decimalToNumber(product.currentStock),
        safetyStock: this.decimalToNumber(product.safetyStock),
        mappingId: mapping.id,
        supplySkuId: mapping.supplySkuId,
        supplierName: mapping.supplySku?.supplier?.name ?? '-',
        quoteId: quote.id,
        price: this.decimalToNumber(quote.price),
        moq: this.decimalToNumber(quote.moq),
        leadDays: quote.leadDays ?? null,
        nextAction: '可从库存补货建议生成平台采购单。',
      }));
    const lowStockManualOnly = lowStockProducts
      .filter((product: AnyRecord) => !this.activeSupplyMappings(product).some((mapping: AnyRecord) => this.availableQuotesForMapping(mapping).length))
      .map((product: AnyRecord) => ({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        currentStock: this.decimalToNumber(product.currentStock),
        safetyStock: this.decimalToNumber(product.safetyStock),
        supplier: product.supplier ?? null,
        nextAction: this.activeSupplyMappings(product).length
          ? '已有映射但缺可用报价，需补报价或改手工采购。'
          : '缺供应链映射，只能走手工采购或先申请映射。',
      }));

    return {
      storeId,
      generatedAt: new Date().toISOString(),
      summary: {
        publishedTemplates: chainRows.chainItems.length,
        validAdoptions: chainRows.chainItems.filter((item: AnyRecord) => item.statuses?.adoption === 'ready').length,
        missingLocalSku: missingLocalSku.length,
        activeProducts: products.length,
        productsMissingSupplyMapping: productsMissingSupplyMapping.length,
        bomProductsWithoutStock: bomProductsWithoutStock.length,
        lowStockProducts: lowStockProducts.length,
        lowStockPlatformPurchasable: lowStockPlatformPurchasable.length,
        lowStockManualOnly: lowStockManualOnly.length,
      },
      missingLocalSku,
      productsMissingSupplyMapping,
      bomProductsWithoutStock,
      lowStockPlatformPurchasable,
      lowStockManualOnly,
    };
  }

  async productTemplateChainDetail(id: number, query: QueryIndustryProductTemplatesDto, headerStoreId?: number) {
    const storeId = await this.resolveStoreId(this.db, query.storeId ?? headerStoreId);
    const rows = await this.loadProductTemplateChainRows(query, storeId, id);
    const item = rows.chainItems[0];
    if (!item) throw new NotFoundException('行业标准品链路不存在');
    const localProductId = item.localProduct?.id ? Number(item.localProduct.id) : 0;
    return {
      storeId,
      item,
      template: rows.templates[0],
      adoption: (rows.adoptions ?? [])[0] ?? null,
      localProduct: item.localProduct,
      industryBomItems: rows.industryBomItems ?? [],
      localBomItems: localProductId ? (rows.localBomItems ?? []).filter((row: AnyRecord) => Number(row.productId) === localProductId) : [],
      stockMovements: localProductId ? (rows.stockMovements ?? []).filter((row: AnyRecord) => Number(row.productId) === localProductId).slice(0, 20) : [],
      supplyMappings: rows.supplyMappings ?? [],
      procurementItems: localProductId ? (rows.procurementItems ?? []).filter((row: AnyRecord) => Number(row.productId) === localProductId).slice(0, 20) : [],
      orderItems: localProductId ? (rows.orderItems ?? []).filter((row: AnyRecord) => Number(row.itemId) === localProductId).slice(0, 20) : [],
    };
  }

  async findProductTemplate(id: number, publishedOnly = false) {
    const item = await this.db.industryProductTemplate.findFirst({
      where: { id, deletedAt: null, ...(publishedOnly ? { status: 'published' } : {}) },
      include: { bomItems: { include: { bomTemplate: { include: { serviceTemplate: true } } } } },
    });
    if (!item) throw new NotFoundException('行业标准商品/耗品不存在');
    return item;
  }

  createProductTemplate(dto: CreateIndustryProductTemplateDto) {
    return this.db.industryProductTemplate.create({ data: this.clean({ ...dto }) });
  }

  async updateProductTemplate(id: number, dto: UpdateIndustryProductTemplateDto) {
    await this.findProductTemplate(id);
    return this.db.industryProductTemplate.update({ where: { id }, data: this.clean({ ...dto }) });
  }

  setProductTemplateStatus(id: number, status: string) {
    return this.db.industryProductTemplate.update({ where: { id }, data: { status } });
  }

  async getBomTemplate(serviceTemplateId: number, publishedOnly = false) {
    await this.findServiceTemplate(serviceTemplateId, publishedOnly);
    const bom = await this.db.industryProjectBomTemplate.findFirst({
      where: { serviceTemplateId, deletedAt: null, ...(publishedOnly ? { status: 'published' } : {}) },
      include: { items: { include: { productTemplate: true }, orderBy: { id: 'asc' } }, serviceTemplate: true },
      orderBy: { version: 'desc' },
    });
    if (!bom) throw new NotFoundException('项目 BOM 模板不存在');
    return bom;
  }

  async saveBomTemplate(serviceTemplateId: number, dto: SaveIndustryBomTemplateDto) {
    await this.findServiceTemplate(serviceTemplateId);
    if (!Array.isArray(dto.items)) throw new BadRequestException('BOM 明细不能为空');

    const productIds = dto.items.map((item) => Number(item.productTemplateId)).filter(Boolean);
    const products = await this.db.industryProductTemplate.findMany({ where: { id: { in: productIds }, deletedAt: null } });
    const productMap = new Map<number, AnyRecord>(products.map((item: AnyRecord) => [Number(item.id), item]));
    const missingProduct = productIds.find((id) => !productMap.has(id));
    if (missingProduct) throw new BadRequestException(`标准商品/耗品不存在：${missingProduct}`);

    const latest = await this.db.industryProjectBomTemplate.findFirst({
      where: { serviceTemplateId, deletedAt: null },
      orderBy: { version: 'desc' },
    });
    const version = latest?.version ?? 1;
    const costs = this.computeBomCost(dto.items, productMap);

    return this.db.$transaction(async (tx: any) => {
      const bom = latest
        ? await tx.industryProjectBomTemplate.update({
            where: { id: latest.id },
            data: this.clean({
              status: dto.status ?? latest.status,
              sourceId: dto.sourceId,
              totalCostMin: costs.totalCostMin,
              totalCostMax: costs.totalCostMax,
            }),
          })
        : await tx.industryProjectBomTemplate.create({
            data: this.clean({
              serviceTemplateId,
              version,
              status: dto.status ?? 'draft',
              sourceId: dto.sourceId,
              totalCostMin: costs.totalCostMin,
              totalCostMax: costs.totalCostMax,
            }),
          });

      await tx.industryProjectBomItemTemplate.deleteMany({ where: { bomTemplateId: bom.id } });
      if (dto.items.length) {
        await tx.industryProjectBomItemTemplate.createMany({
          data: dto.items.map((item) =>
            this.clean({
              bomTemplateId: bom.id,
              productTemplateId: Number(item.productTemplateId),
              itemRole: item.itemRole ?? 'main_material',
              standardQty: Number(item.standardQty ?? 0),
              unit: item.unit,
              lossRate: Number(item.lossRate ?? 0),
              required: item.required ?? true,
              costIncluded: item.costIncluded ?? true,
              serviceStep: item.serviceStep,
              allowSubstitute: item.allowSubstitute ?? false,
              substituteGroupCode: item.substituteGroupCode,
              futureSupplyRequired: item.futureSupplyRequired ?? false,
              futureSupplyMappingKey: item.futureSupplyMappingKey,
            }),
          ),
        });
      }
      return tx.industryProjectBomTemplate.findUnique({
        where: { id: bom.id },
        include: { items: { include: { productTemplate: true }, orderBy: { id: 'asc' } }, serviceTemplate: true },
      });
    });
  }

  async publishBomTemplate(serviceTemplateId: number) {
    const bom = await this.getBomTemplate(serviceTemplateId);
    return this.db.industryProjectBomTemplate.update({
      where: { id: bom.id },
      data: { status: 'published', publishedAt: new Date() },
      include: { items: { include: { productTemplate: true } }, serviceTemplate: true },
    });
  }

  async findKnowledgeItems(query: QueryIndustryKnowledgeDto, publishedOnly = false) {
    const where = this.clean({
      deletedAt: null,
      ...(publishedOnly ? { reviewStatus: 'approved' } : { reviewStatus: query.status }),
      domain: query.domain,
      ...this.keywordWhere(query.keyword, ['title', 'domain']),
    });
    return this.db.industryKnowledgeItem.findMany({ where, orderBy: { updatedAt: 'desc' } });
  }

  async findKnowledgeItemsPaginated(query: QueryIndustryKnowledgeDto) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where = this.clean({
      deletedAt: null,
      reviewStatus: query.status,
      domain: query.domain,
      ...this.keywordWhere(query.keyword, ['title', 'domain']),
    });
    const [items, total] = await Promise.all([
      this.db.industryKnowledgeItem.findMany({ where, skip, take, include: { source: true }, orderBy: { updatedAt: 'desc' } }),
      this.db.industryKnowledgeItem.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  createKnowledgeItem(dto: CreateIndustryKnowledgeItemDto) {
    const data: AnyRecord = this.clean({ ...dto });
    if (data.reviewStatus === 'approved') data.publishedAt = new Date();
    return this.db.industryKnowledgeItem.create({ data });
  }

  async updateKnowledgeItem(id: number, dto: UpdateIndustryKnowledgeItemDto) {
    await this.assertExists(this.db.industryKnowledgeItem, id, '知识条目不存在');
    const data: AnyRecord = this.clean({ ...dto });
    if (data.reviewStatus === 'approved') data.publishedAt = new Date();
    return this.db.industryKnowledgeItem.update({ where: { id }, data });
  }

  async findSalaryBenchmarks(query: QueryIndustrySalaryDto, publishedOnly = false) {
    const where = this.clean({
      deletedAt: null,
      ...(publishedOnly ? this.publishedWhere(query.status) : { status: query.status }),
      jobRole: query.jobRole,
      roleCategory: query.roleCategory,
      ...this.keywordWhere(query.keyword, ['jobRole', 'roleCategory', 'employeeLevel']),
    });
    return this.db.industrySalaryBenchmark.findMany({ where, orderBy: [{ roleCategory: 'asc' }, { jobRole: 'asc' }] });
  }

  async findSalaryBenchmarksPaginated(query: QueryIndustrySalaryDto) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where = this.clean({
      deletedAt: null,
      status: query.status,
      jobRole: query.jobRole,
      roleCategory: query.roleCategory,
      ...this.keywordWhere(query.keyword, ['jobRole', 'roleCategory', 'employeeLevel']),
    });
    const [items, total] = await Promise.all([
      this.db.industrySalaryBenchmark.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' } }),
      this.db.industrySalaryBenchmark.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  createSalaryBenchmark(dto: CreateIndustrySalaryBenchmarkDto) {
    return this.db.industrySalaryBenchmark.create({ data: this.clean({ ...dto }) });
  }

  async updateSalaryBenchmark(id: number, dto: UpdateIndustrySalaryBenchmarkDto) {
    await this.assertExists(this.db.industrySalaryBenchmark, id, '薪酬模板不存在');
    return this.db.industrySalaryBenchmark.update({ where: { id }, data: this.clean({ ...dto }) });
  }

  createAdoption(dto: CreateIndustryAdoptionDto, headerStoreId?: number) {
    return this.db.industryAdoptionRecord.create({
      data: this.clean({
        ...dto,
        storeId: dto.storeId ?? headerStoreId,
      }),
    });
  }

  async adoptProductTemplateAsProduct(id: number, dto: AdoptIndustryProductTemplateDto, headerStoreId?: number) {
    const template = await this.findProductTemplate(id, true);
    return this.db.$transaction(async (tx: any) => {
      const storeId = await this.resolveStoreId(tx, dto.storeId ?? headerStoreId);
      return this.adoptProductTemplateInTx(tx, template, storeId, dto);
    });
  }

  async batchAdoptProductTemplates(dto: BatchAdoptIndustryProductTemplatesDto, headerStoreId?: number) {
    const templateIds = [...new Set((dto.productTemplateIds ?? []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    if (!templateIds.length) throw new BadRequestException('请选择要采用的行业标准品');
    const storeId = await this.resolveStoreId(this.db, dto.storeId ?? headerStoreId);
    const templates = await this.db.industryProductTemplate.findMany({
      where: { id: { in: templateIds }, deletedAt: null },
      orderBy: { id: 'asc' },
    });
    const templateById = new Map<number, AnyRecord>(templates.map((template: any) => [template.id, template]));
    const actions: AnyRecord[] = [];

    for (const templateId of templateIds) {
      const template = templateById.get(templateId) as AnyRecord | undefined;
      if (!template) {
        actions.push({ productTemplateId: templateId, action: 'conflict', reason: 'template_missing' });
        continue;
      }
      if (template.status !== 'published') {
        actions.push({ productTemplateId: templateId, standardProductCode: template.standardProductCode, action: 'conflict', reason: 'template_not_published' });
        continue;
      }
      const existing = await this.findValidProductAdoption(this.db, storeId, templateId);
      if (existing && !dto.overwriteExisting) {
        actions.push({
          productTemplateId: templateId,
          standardProductCode: template.standardProductCode,
          action: 'skip',
          reason: 'already_adopted',
          localProductId: existing.product.id,
          localProductSku: existing.product.sku,
        });
        continue;
      }
      actions.push({
        productTemplateId: templateId,
        standardProductCode: template.standardProductCode,
        action: 'create',
        plannedSku: `IND-${storeId}-${template.standardProductCode}`,
      });
    }

    if (dto.dryRun) {
      return {
        mode: 'dry-run',
        storeId,
        total: templateIds.length,
        createCount: actions.filter((item) => item.action === 'create').length,
        skipCount: actions.filter((item) => item.action === 'skip').length,
        conflictCount: actions.filter((item) => item.action === 'conflict').length,
        items: actions,
      };
    }

    const applied: AnyRecord[] = await this.db.$transaction(async (tx: any) => {
      const results: AnyRecord[] = [];
      for (const action of actions) {
        if (action.action !== 'create') {
          results.push(action);
          continue;
        }
        const template = templateById.get(action.productTemplateId) as AnyRecord;
        const result = await this.adoptProductTemplateInTx(tx, template, storeId, {
          adoptedByUserId: dto.adoptedByUserId,
          categoryName: dto.categoryStrategy === 'template_category' ? template.category : undefined,
          safetyStock: dto.defaultSafetyStock,
          supplier: dto.defaultSupplier,
          minPurchaseQty: dto.defaultMinPurchaseQty,
        });
        results.push({
          ...action,
          productId: result.product.id,
          sku: result.product.sku,
          adoptionId: result.adoption.id,
          reused: result.reused,
        });
      }
      return results;
    });

    return {
      mode: 'apply',
      storeId,
      total: templateIds.length,
      createCount: applied.filter((item: AnyRecord) => item.action === 'create').length,
      skipCount: applied.filter((item: AnyRecord) => item.action === 'skip').length,
      conflictCount: applied.filter((item: AnyRecord) => item.action === 'conflict').length,
      items: applied,
    };
  }

  async linkProductTemplateToProduct(id: number, dto: LinkIndustryProductTemplateDto, headerStoreId?: number) {
    const template = await this.findProductTemplate(id, true);
    const storeId = await this.resolveStoreId(this.db, dto.storeId ?? headerStoreId);
    const product = await this.db.product.findFirst({
      where: { id: dto.productId, storeId, deletedAt: null },
    });
    if (!product) throw new BadRequestException('本地商品不存在、已删除或不属于当前门店');

    const existing = await this.findValidProductAdoption(this.db, storeId, template.id);
    if (existing?.product?.id && existing.product.id !== product.id) {
      throw new BadRequestException(`该标准品已关联本地商品：${existing.product.name || existing.product.sku}`);
    }
    if (existing && existing.product?.id === product.id) {
      return { product, adoption: existing.adoption, reused: true };
    }

    const adoption = await this.db.industryAdoptionRecord.create({
      data: this.clean({
        storeId,
        adoptedByUserId: dto.adoptedByUserId,
        adoptionType: 'product_mapping',
        productTemplateId: template.id,
        templateVersion: template.version,
        localProductId: product.id,
        payload: {
          source: 'manual_link_product',
          reason: dto.reason?.trim(),
          standardProductCode: template.standardProductCode,
          localProductSku: product.sku,
        },
      }),
    });
    return { product, adoption, reused: false };
  }

  async adoptServiceTemplateAsProject(id: number, dto: AdoptIndustryServiceTemplateDto, headerStoreId?: number) {
    const template = await this.findServiceTemplate(id, true);
    const bom = await this.db.industryProjectBomTemplate.findFirst({
      where: { serviceTemplateId: id, deletedAt: null, status: 'published' },
      include: { items: { include: { productTemplate: true }, orderBy: { id: 'asc' } } },
      orderBy: { version: 'desc' },
    });
    const shouldAdoptBom = dto.adoptBom !== false;

    return this.db.$transaction(async (tx: any) => {
      const storeId = await this.resolveStoreId(tx, dto.storeId ?? headerStoreId);
      const typeName = dto.typeName?.trim() || template.category;
      const projectType = await this.findOrCreateProjectType(tx, typeName);
      const mappedProductIdsByTemplate = new Map<number, number>(
        (dto.productMappings ?? [])
          .map((mapping) => [Number(mapping.productTemplateId), Number(mapping.productId)] as const)
          .filter(([productTemplateId, productId]) => productTemplateId > 0 && productId > 0),
      );
      const project = await tx.project.create({
        data: this.clean({
          storeId,
          typeId: projectType?.id,
          name: dto.projectName?.trim() || template.name,
          description: this.buildServiceTemplateDescription(template),
          price: dto.price ?? this.averageRange(template.referencePriceMin, template.referencePriceMax),
          duration: dto.duration ?? template.recommendedDurationMax ?? template.recommendedDurationMin ?? 60,
          careCycleWeeks: dto.careCycleWeeks ?? template.careCycleWeeks,
          treatmentCourseTimes: dto.treatmentCourseTimes ?? template.treatmentCourseTimes,
          status: dto.status ?? 'active',
          online: true,
          recommend: false,
          home: false,
        }),
      });

      const bomItemIds: number[] = [];
      const adoptedProducts: AnyRecord[] = [];
      if (shouldAdoptBom && bom?.items?.length) {
        for (const item of bom.items) {
          if (!item.productTemplate) continue;
          const mappedProductId = mappedProductIdsByTemplate.get(Number(item.productTemplateId));
          let productForBom: AnyRecord | undefined;

          if (mappedProductId) {
            productForBom = await tx.product.findFirst({
              where: { id: mappedProductId, storeId, deletedAt: null },
            });
            if (!productForBom) {
              throw new BadRequestException(`BOM 映射商品不存在或不属于当前门店：${item.productTemplate.name}`);
            }
            await tx.industryAdoptionRecord.create({
              data: this.clean({
                storeId,
                adoptedByUserId: dto.adoptedByUserId,
                adoptionType: 'product_mapping',
                productTemplateId: item.productTemplateId,
                templateVersion: item.productTemplate.version,
                localProductId: productForBom.id,
                payload: {
                  source: 'adopt_project_bom_mapping',
                  serviceTemplateId: template.id,
                  serviceTemplateCode: template.code,
                  standardProductCode: item.productTemplate.standardProductCode,
                },
              }),
            });
          } else {
            if (item.productTemplate.status !== 'published') {
              throw new BadRequestException(`BOM 标准品未发布，不能采用：${item.productTemplate.name}`);
            }
            if (dto.createMissingProducts === false) {
              throw new BadRequestException(`BOM 标准品未映射本地商品：${item.productTemplate.name}`);
            }
            const adopted = await this.adoptProductTemplateInTx(tx, item.productTemplate, storeId, {
              adoptedByUserId: dto.adoptedByUserId,
            });
            productForBom = adopted.product;
          }

          if (!productForBom) {
            throw new BadRequestException(`BOM 标准品未能匹配本地商品：${item.productTemplate.name}`);
          }
          adoptedProducts.push(productForBom);
          const bomItem = await tx.projectBomItem.create({
            data: {
              projectId: project.id,
              productId: productForBom.id,
              standardQty: Number(item.standardQty ?? 0),
              unit: item.unit || productForBom.specUnit || productForBom.unit || '件',
            },
          });
          bomItemIds.push(bomItem.id);
        }
      }

      const adoption = await tx.industryAdoptionRecord.create({
        data: this.clean({
          storeId,
          adoptedByUserId: dto.adoptedByUserId,
          adoptionType: shouldAdoptBom ? 'service_project_with_bom' : 'service_project',
          serviceTemplateId: template.id,
          templateVersion: template.version,
          localProjectId: project.id,
          localBomItemIds: bomItemIds,
          payload: {
            projectName: project.name,
            projectType: projectType?.name,
            sourceTemplateCode: template.code,
            adoptedBomItemCount: bomItemIds.length,
            adoptedProductIds: adoptedProducts.map((product) => product.id),
            mappedProductIds: Array.from(mappedProductIdsByTemplate.values()),
          },
        }),
      });

      const localProject = await tx.project.findUnique({
        where: { id: project.id },
        include: { type: true, store: true, bomItems: { include: { product: true } } },
      });
      return { project: localProject, adoption, adoptedProducts };
    });
  }

  async findAdoptions(query: IndustryPaginationQuery) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where = this.clean({
      storeId: query.storeId,
      adoptionType: query.adoptionType,
      serviceTemplateId: query.serviceTemplateId,
      productTemplateId: query.productTemplateId,
    });
    const [items, total] = await Promise.all([
      this.db.industryAdoptionRecord.findMany({ where, skip, take, include: { serviceTemplate: true }, orderBy: { createdAt: 'desc' } }),
      this.db.industryAdoptionRecord.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  templateUpdates() {
    return { items: [], data: [], total: 0 };
  }

  async productSupplyMappings(id: number) {
    const product = await this.findProductTemplate(id);
    return {
      productTemplateId: id,
      standardProductCode: product.standardProductCode,
      status: product.futureSupplyMappingStatus ?? 'not_connected',
      supplyCategoryCode: product.supplyCategoryCode,
      preferredSpecKey: product.preferredSpecKey,
      candidates: [],
    };
  }

  async bomSupplyCandidates(id: number) {
    const item = await this.db.industryProjectBomItemTemplate.findUnique({
      where: { id },
      include: { productTemplate: true },
    });
    if (!item) throw new NotFoundException('BOM 明细不存在');
    return {
      bomItemTemplateId: id,
      productTemplateId: item.productTemplateId,
      status: 'not_connected',
      candidates: [],
      message: '供应链平台尚未接入，当前仅保留未来映射键。',
    };
  }

  createSupplyMappingRequest(dto: CreateIndustrySupplyMappingRequestDto, headerStoreId?: number) {
    return this.db.industrySupplyMappingRequest.create({
      data: this.clean({
        ...dto,
        requestedByStoreId: dto.requestedByStoreId ?? headerStoreId,
        status: 'not_connected',
      }),
    });
  }

  private computeBomCost(items: Array<{ productTemplateId: number; standardQty: number; lossRate?: number; costIncluded?: boolean }>, productMap: Map<number, AnyRecord>) {
    let totalCostMin = 0;
    let totalCostMax = 0;
    for (const item of items) {
      if (item.costIncluded === false) continue;
      const product = productMap.get(Number(item.productTemplateId));
      if (!product) continue;
      const qty = Number(item.standardQty ?? 0);
      const lossRate = Number(item.lossRate ?? 0);
      const multiplier = 1 + Math.max(0, lossRate);
      totalCostMin += qty * multiplier * Number(product.referenceCostMin ?? product.referenceCostMax ?? 0);
      totalCostMax += qty * multiplier * Number(product.referenceCostMax ?? product.referenceCostMin ?? 0);
    }
    return { totalCostMin, totalCostMax };
  }

  private async assertExists(model: any, id: number, message: string) {
    const item = await model.findUnique({ where: { id } });
    if (!item || item.deletedAt) throw new NotFoundException(message);
    return item;
  }

  private async adoptProductTemplateInTx(
    tx: any,
    template: AnyRecord,
    storeId: number,
    dto: AdoptIndustryProductTemplateDto = {},
  ) {
    if (template.status !== 'published') {
      throw new BadRequestException(`行业标准品未发布，不能采用：${template.name}`);
    }

    const existingAdoption = await tx.industryAdoptionRecord.findFirst({
      where: { storeId, productTemplateId: template.id, adoptionType: 'product', localProductId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    if (existingAdoption?.localProductId) {
      const existingProduct = await tx.product.findFirst({
        where: { id: existingAdoption.localProductId, storeId, deletedAt: null },
      });
      if (existingProduct) {
        return { product: existingProduct, adoption: existingAdoption, reused: true };
      }
    }

    const sku = await this.resolveProductSku(tx, storeId, template, dto.sku);
    const existingBySku = await tx.product.findFirst({ where: { sku, storeId, deletedAt: null } });
    const parsedSpec = this.parseRecommendedSpec(template.recommendedSpec);
    const specQuantity = dto.specQuantity ?? parsedSpec.specQuantity;
    const specUnit = dto.specUnit?.trim() || parsedSpec.specUnit || template.unit || '件';
    const packageUnit = dto.packageUnit?.trim() || template.packageUnit || '件';
    const product =
      existingBySku ??
      (await tx.product.create({
        data: this.clean({
          storeId,
          categoryId: await this.findOrCreateCategoryId(tx, dto.categoryName?.trim() || template.category),
          sku,
          name: dto.name?.trim() || template.name,
          spec: this.formatSpec(specQuantity, specUnit) ?? template.recommendedSpec,
          unit: packageUnit,
          specQuantity,
          specUnit,
          packageUnit,
          costPrice: dto.costPrice ?? this.averageRange(template.referenceCostMin, template.referenceCostMax),
          retailPrice: dto.retailPrice ?? this.averageRange(template.referenceRetailPriceMin, template.referenceRetailPriceMax),
          currentStock: dto.currentStock ?? 0,
          safetyStock: dto.safetyStock ?? 0,
          supplier: dto.supplier?.trim(),
          minPurchaseQty: dto.minPurchaseQty ?? 0,
          status: 'active',
        }),
      }));

    const adoption = await tx.industryAdoptionRecord.create({
      data: this.clean({
        storeId,
        adoptedByUserId: dto.adoptedByUserId,
        adoptionType: 'product',
        productTemplateId: template.id,
        templateVersion: template.version,
        localProductId: product.id,
        payload: {
          standardProductCode: template.standardProductCode,
          sku: product.sku,
          reusedExistingProduct: Boolean(existingBySku),
        },
      }),
    });
    return { product, adoption, reused: Boolean(existingBySku) };
  }

  private async resolveStoreId(tx: any, requestedStoreId?: number) {
    const storeId = Number(requestedStoreId ?? 0);
    if (storeId > 0) {
      const store = await tx.store.findFirst({ where: { id: storeId, deletedAt: null } });
      if (!store) throw new BadRequestException('门店不存在或已停用');
      return storeId;
    }
    const store = await tx.store.findFirst({
      where: { deletedAt: null, status: { not: 'disabled' } },
      orderBy: { id: 'asc' },
    });
    if (!store) throw new BadRequestException('门店不能为空');
    return store.id;
  }

  private async findOrCreateProjectType(tx: any, name?: string | null) {
    const typeName = name?.trim();
    if (!typeName) return undefined;
    const existing = await tx.projectType.findFirst({ where: { name: typeName } });
    if (existing) return existing;
    return tx.projectType.create({ data: { name: typeName, status: 'active' } });
  }

  private async findOrCreateCategoryId(tx: any, name?: string | null) {
    const categoryName = name?.trim();
    if (!categoryName) return undefined;
    const existing = await tx.category.findFirst({ where: { name: categoryName } });
    if (existing) return existing.id;
    const category = await tx.category.create({ data: { name: categoryName } });
    return category.id;
  }

  private async resolveProductSku(tx: any, storeId: number, template: AnyRecord, overrideSku?: string) {
    const candidate = overrideSku?.trim() || `IND-${storeId}-${template.standardProductCode}`;
    const existing = await tx.product.findFirst({ where: { sku: candidate, storeId } });
    if (!existing || (existing.storeId === storeId && !existing.deletedAt)) return candidate;
    return `IND-${storeId}-${template.standardProductCode}-${Date.now().toString(36).toUpperCase()}`;
  }

  private async findValidProductAdoption(tx: any, storeId: number, productTemplateId: number) {
    const adoptions = await tx.industryAdoptionRecord.findMany({
      where: {
        storeId,
        productTemplateId,
        adoptionType: { in: ['product', 'product_mapping'] },
        localProductId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    for (const adoption of adoptions) {
      if (this.chainStatusFromPayload(adoption.payload) === 'invalid') continue;
      const product = await tx.product.findFirst({
        where: { id: adoption.localProductId, storeId, deletedAt: null },
      });
      if (product) return { adoption, product };
    }
    return null;
  }

  private averageRange(min?: unknown, max?: unknown) {
    const first = min == null ? undefined : Number(min);
    const second = max == null ? undefined : Number(max);
    if (Number.isFinite(first) && Number.isFinite(second)) return Number(((first! + second!) / 2).toFixed(2));
    if (Number.isFinite(first)) return Number(first);
    if (Number.isFinite(second)) return Number(second);
    return 0;
  }

  private parseRecommendedSpec(spec?: unknown) {
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

  private buildServiceTemplateDescription(template: AnyRecord) {
    const parts = [
      template.subCategory ? `细分类目：${template.subCategory}` : undefined,
      template.recommendedFrequency ? `建议频次：${template.recommendedFrequency}` : undefined,
      Array.isArray(template.sellingPoints) && template.sellingPoints.length ? `卖点：${template.sellingPoints.join('、')}` : undefined,
    ].filter(Boolean);
    return parts.length ? parts.join('\n') : undefined;
  }
}

type IndustryPaginationQuery = {
  page?: number;
  pageSize?: number;
  storeId?: number;
  adoptionType?: string;
  serviceTemplateId?: number;
  productTemplateId?: number;
};
