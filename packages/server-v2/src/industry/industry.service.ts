import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AdoptIndustryProductTemplateDto,
  AdoptIndustryServiceTemplateDto,
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

  async findProductTemplates(query: QueryIndustryProductTemplatesDto, publishedOnly = false) {
    const where = this.clean({
      deletedAt: null,
      ...(publishedOnly ? this.publishedWhere(query.status) : { status: query.status }),
      category: query.category,
      productType: query.productType,
      futureSupplyMappingStatus: query.futureSupplyMappingStatus,
      ...this.keywordWhere(query.keyword, ['name', 'standardProductCode', 'category', 'subCategory']),
    });
    return this.db.industryProductTemplate.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  }

  async findProductTemplatesPaginated(query: QueryIndustryProductTemplatesDto) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where = this.clean({
      deletedAt: null,
      status: query.status,
      category: query.category,
      productType: query.productType,
      futureSupplyMappingStatus: query.futureSupplyMappingStatus,
      ...this.keywordWhere(query.keyword, ['name', 'standardProductCode', 'category', 'subCategory']),
    });
    const [items, total] = await Promise.all([
      this.db.industryProductTemplate.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' } }),
      this.db.industryProductTemplate.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
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
              unit: item.unit || productForBom.unit || '件',
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
    const product =
      existingBySku ??
      (await tx.product.create({
        data: this.clean({
          storeId,
          categoryId: await this.findOrCreateCategoryId(tx, dto.categoryName?.trim() || template.category),
          sku,
          name: dto.name?.trim() || template.name,
          spec: template.recommendedSpec,
          unit: template.unit || '件',
          costPrice: dto.costPrice ?? this.averageRange(template.referenceCostMin, template.referenceCostMax),
          retailPrice: dto.retailPrice ?? this.averageRange(template.referenceRetailPriceMin, template.referenceRetailPriceMax),
          currentStock: dto.currentStock ?? 0,
          safetyStock: dto.safetyStock ?? 0,
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

  private averageRange(min?: unknown, max?: unknown) {
    const first = min == null ? undefined : Number(min);
    const second = max == null ? undefined : Number(max);
    if (Number.isFinite(first) && Number.isFinite(second)) return Number(((first! + second!) / 2).toFixed(2));
    if (Number.isFinite(first)) return Number(first);
    if (Number.isFinite(second)) return Number(second);
    return 0;
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
