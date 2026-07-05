import { IndustryService } from './industry.service.js';

describe('IndustryService adoption', () => {
  const serviceTemplate = {
    id: 10,
    code: 'SVC-FACE-HYDRATING-BASIC',
    name: '深层补水护理',
    category: '基础面部护理',
    subCategory: '补水护理',
    referencePriceMin: 198,
    referencePriceMax: 398,
    recommendedDurationMin: 45,
    recommendedDurationMax: 60,
    careCycleWeeks: 4,
    treatmentCourseTimes: 6,
    recommendedFrequency: '2-4 周一次',
    sellingPoints: ['补水', '舒缓'],
    status: 'published',
    version: 1,
  };

  const productTemplate = {
    id: 20,
    standardProductCode: 'STD-SERUM-HYDRATING-001',
    name: '补水精华液',
    category: '院装护肤耗品',
    recommendedSpec: '100ml',
    unit: 'ml',
    referenceCostMin: 1,
    referenceCostMax: 3,
    referenceRetailPriceMin: 98,
    referenceRetailPriceMax: 198,
    status: 'published',
    version: 1,
  };

  function createPrisma(overrides: Record<string, any> = {}) {
    const tx: any = {
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'Ami 门店', status: 'active' }),
      },
      projectType: {
        findFirst: jest.fn().mockResolvedValue({ id: 101, name: '基础面部护理' }),
        create: jest.fn(),
      },
      project: {
        create: jest.fn().mockResolvedValue({ id: 301, name: '深层补水护理' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 301,
          name: '深层补水护理',
          bomItems: [
            {
              id: 501,
              projectId: 301,
              productId: 401,
              standardQty: 3,
              unit: 'ml',
              product: { id: 401, name: '补水精华液', unit: 'ml', costPrice: 2 },
            },
          ],
        }),
      },
      category: {
        findFirst: jest.fn().mockResolvedValue({ id: 201, name: '院装护肤耗品' }),
        create: jest.fn(),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 401,
          storeId: 1,
          sku: 'IND-1-STD-SERUM-HYDRATING-001',
          name: '补水精华液',
          unit: 'ml',
          costPrice: 2,
        }),
      },
      projectBomItem: {
        create: jest.fn().mockResolvedValue({ id: 501 }),
      },
      industryAdoptionRecord: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }: any) => Promise.resolve({ id: data.adoptionType === 'product' ? 601 : 602, ...data })),
      },
      ...overrides.tx,
    };

    const prisma: any = {
      industryServiceTemplate: {
        findFirst: jest.fn().mockResolvedValue(serviceTemplate),
      },
      industryProjectBomTemplate: {
        findFirst: jest.fn().mockResolvedValue({
          id: 11,
          serviceTemplateId: 10,
          status: 'published',
          version: 1,
          items: [
            {
              id: 12,
              productTemplateId: productTemplate.id,
              productTemplate,
              standardQty: 3,
              unit: 'ml',
            },
          ],
        }),
      },
      $transaction: jest.fn((callback: any) => callback(tx)),
      ...overrides.prisma,
    };

    return { prisma, tx };
  }

  it('adopts a published service template into a local project, product and ProjectBomItem', async () => {
    const { prisma, tx } = createPrisma();
    const service = new IndustryService(prisma as any);

    const result = await service.adoptServiceTemplateAsProject(10, { storeId: 1, adoptBom: true });

    expect(prisma.industryServiceTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 10, status: 'published' }) }),
    );
    expect(tx.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 1,
        sku: 'IND-1-STD-SERUM-HYDRATING-001',
        name: '补水精华液',
        costPrice: 2,
        retailPrice: 148,
      }),
    });
    expect(tx.project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        duration: 60,
        careCycleWeeks: 4,
        treatmentCourseTimes: 6,
      }),
    });
    expect(tx.projectBomItem.create).toHaveBeenCalledWith({
      data: {
        projectId: 301,
        productId: 401,
        standardQty: 3,
        unit: 'ml',
      },
    });
    expect(tx.industryAdoptionRecord.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        adoptionType: 'service_project_with_bom',
        serviceTemplateId: 10,
        localProjectId: 301,
        localBomItemIds: [501],
        payload: expect.objectContaining({
          sourceTemplateCode: 'SVC-FACE-HYDRATING-BASIC',
          adoptedBomItemCount: 1,
          adoptedProductIds: [401],
        }),
      }),
    });
    expect(result.project.bomItems).toEqual([
      expect.objectContaining({ projectId: 301, productId: 401, standardQty: 3, unit: 'ml' }),
    ]);
  });

  it('adopts a service BOM by mapping industry product templates to existing local products', async () => {
    const mappedProduct = { id: 888, storeId: 1, name: '门店现有补水精华', unit: 'ml', deletedAt: null };
    const { tx } = createPrisma({
      tx: {
        product: {
          findUnique: jest.fn(),
          findFirst: jest.fn().mockResolvedValue(mappedProduct),
          create: jest.fn(),
        },
        projectBomItem: {
          create: jest.fn().mockResolvedValue({ id: 777 }),
        },
        project: {
          create: jest.fn().mockResolvedValue({ id: 302, name: '深层补水护理' }),
          findUnique: jest.fn().mockResolvedValue({
            id: 302,
            name: '深层补水护理',
            bomItems: [{ id: 777, projectId: 302, productId: 888, standardQty: 3, unit: 'ml', product: mappedProduct }],
          }),
        },
      },
    });
    const service = new IndustryService(createPrisma({ tx }).prisma as any);

    await service.adoptServiceTemplateAsProject(10, {
      storeId: 1,
      adoptBom: true,
      createMissingProducts: false,
      productMappings: [{ productTemplateId: 20, productId: 888 }],
    });

    expect(tx.product.create).not.toHaveBeenCalled();
    expect(tx.projectBomItem.create).toHaveBeenCalledWith({
      data: {
        projectId: 302,
        productId: 888,
        standardQty: 3,
        unit: 'ml',
      },
    });
    expect(tx.industryAdoptionRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adoptionType: 'product_mapping',
        productTemplateId: 20,
        localProductId: 888,
        payload: expect.objectContaining({
          source: 'adopt_project_bom_mapping',
          serviceTemplateCode: 'SVC-FACE-HYDRATING-BASIC',
        }),
      }),
    });
    expect(tx.industryAdoptionRecord.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        adoptionType: 'service_project_with_bom',
        localProjectId: 302,
        localBomItemIds: [777],
        payload: expect.objectContaining({
          mappedProductIds: [888],
        }),
      }),
    });
  });

  it('previews batch product adoption with create and skip actions', async () => {
    const prisma: any = {
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'Ami 门店', status: 'active' }),
      },
      industryProductTemplate: {
        findMany: jest.fn().mockResolvedValue([
          { ...productTemplate, id: 20, standardProductCode: 'STD-SERUM-HYDRATING-001', status: 'published' },
          { ...productTemplate, id: 21, standardProductCode: 'STD-MASK-001', name: '补水面膜', status: 'published' },
        ]),
      },
      industryAdoptionRecord: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 9001, storeId: 1, productTemplateId: 20, localProductId: 401, payload: null }])
          .mockResolvedValueOnce([]),
      },
      product: {
        findFirst: jest.fn().mockResolvedValueOnce({ id: 401, storeId: 1, sku: 'IND-1-STD-SERUM-HYDRATING-001', name: '补水精华液' }),
      },
    };
    const service = new IndustryService(prisma);

    const result = await service.batchAdoptProductTemplates({
      storeId: 1,
      productTemplateIds: [20, 21],
      dryRun: true,
    });

    expect(result).toMatchObject({
      mode: 'dry-run',
      total: 2,
      createCount: 1,
      skipCount: 1,
      conflictCount: 0,
    });
    expect(result.items).toEqual([
      expect.objectContaining({ productTemplateId: 20, action: 'skip', reason: 'already_adopted' }),
      expect.objectContaining({ productTemplateId: 21, action: 'create', plannedSku: 'IND-1-STD-MASK-001' }),
    ]);
  });

  it('links an industry product template to an existing local product', async () => {
    const localProduct = { id: 888, storeId: 1, sku: 'SKU-LOCAL-888', name: '门店现有补水精华', deletedAt: null };
    const prisma: any = {
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'Ami 门店', status: 'active' }),
      },
      industryProductTemplate: {
        findFirst: jest.fn().mockResolvedValue(productTemplate),
      },
      product: {
        findFirst: jest.fn().mockResolvedValue(localProduct),
      },
      industryAdoptionRecord: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(({ data }: any) => Promise.resolve({ id: 9901, ...data })),
      },
    };
    const service = new IndustryService(prisma);

    const result = await service.linkProductTemplateToProduct(20, {
      storeId: 1,
      productId: 888,
      reason: '已有门店 SKU，直接建立来源追溯',
    });

    expect(prisma.industryAdoptionRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 1,
        adoptionType: 'product_mapping',
        productTemplateId: 20,
        localProductId: 888,
        payload: expect.objectContaining({
          source: 'manual_link_product',
          reason: '已有门店 SKU，直接建立来源追溯',
          standardProductCode: 'STD-SERUM-HYDRATING-001',
          localProductSku: 'SKU-LOCAL-888',
        }),
      }),
    });
    expect(result).toEqual(expect.objectContaining({ product: localProduct, reused: false }));
  });

  it('summarizes product template chain readiness from local SKU, BOM, supply mapping and procurement records', async () => {
    const prisma: any = {
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'Ami 门店', status: 'active' }),
      },
      industryProductTemplate: {
        findMany: jest.fn().mockResolvedValue([{ ...productTemplate, id: 20, status: 'published' }]),
      },
      industryAdoptionRecord: {
        findMany: jest.fn().mockResolvedValue([
          { id: 9001, storeId: 1, productTemplateId: 20, adoptionType: 'product', localProductId: 401, createdAt: new Date('2026-07-01') },
        ]),
      },
      industryProjectBomItemTemplate: {
        findMany: jest.fn().mockResolvedValue([{ id: 3001, productTemplateId: 20, bomTemplateId: 300 }]),
      },
      supplyCatalogMapping: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 7001,
            standardProductTemplateId: 20,
            productId: 401,
            storeId: 1,
            mappingStatus: 'active',
            supplySku: {
              id: 8001,
              name: '平台补水精华',
              supplier: { id: 6001, name: 'Ami 供应商' },
              quotes: [{ id: 8101, status: 'active', auditStatus: 'approved', stockStatus: 'available', validFrom: null, validTo: null }],
            },
          },
        ]),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 401,
            storeId: 1,
            sku: 'IND-1-STD-SERUM-HYDRATING-001',
            name: '补水精华液',
            currentStock: 12,
            safetyStock: 5,
            packageUnit: '瓶',
            specUnit: 'ml',
            updatedAt: new Date('2026-07-01'),
            deletedAt: null,
          },
        ]),
      },
      projectBomItem: {
        findMany: jest.fn().mockResolvedValue([{ id: 501, projectId: 301, productId: 401 }]),
      },
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, productId: 401, movementType: 'inbound', quantity: 10, unit: '瓶', occurredAt: new Date('2026-07-01') },
          { id: 2, productId: 401, movementType: 'service_consume', quantity: -1, unit: 'ml', occurredAt: new Date('2026-07-02') },
        ]),
      },
      procurementOrderItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 9101,
            orderId: 9201,
            productId: 401,
            quantity: 10,
            receivedQty: 10,
            order: { id: 9201, orderNo: 'PO-001', status: 'received', updatedAt: new Date('2026-07-01'), supplier: { id: 6001, name: 'Ami 供应商' }, shipments: [] },
          },
        ]),
      },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: 9301, itemType: 'product', itemId: 401, quantity: 1, createdAt: new Date('2026-07-02'), order: { id: 9401, orderNo: 'ORD-001' } },
        ]),
      },
    };
    const service = new IndustryService(prisma);

    const result = await service.productTemplateChainOverview({ page: 1, pageSize: 20 }, 1);

    expect(result.summary).toMatchObject({
      total: 1,
      adopted: 1,
      bomLinked: 1,
      inventoryReady: 1,
      supplyAvailable: 1,
      procurementReceived: 1,
      salesOrServiceTouched: 1,
    });
    expect(result.items[0]).toMatchObject({
      productTemplateId: 20,
      statuses: {
        adoption: 'ready',
        bom: 'ready',
        inventory: 'ready',
        supply: 'ready',
        procurement: 'received',
        salesService: 'ready',
      },
      blockers: [],
    });
  });

  it('builds operational issue lists for chain report questions', async () => {
    const publishedTemplates = [
      { id: 20, standardProductCode: 'STD-SERUM-HYDRATING-001', name: '补水精华液', category: '院装护肤耗品', productType: 'consumable', status: 'published' },
      { id: 21, standardProductCode: 'STD-MASK-001', name: '补水面膜', category: '院装护肤耗品', productType: 'consumable', status: 'published' },
    ];
    const prisma: any = {
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'Ami 门店', status: 'active' }),
      },
      industryProductTemplate: {
        findMany: jest.fn().mockResolvedValue(publishedTemplates),
      },
      industryAdoptionRecord: {
        findMany: jest.fn().mockResolvedValue([
          { id: 9001, storeId: 1, productTemplateId: 20, adoptionType: 'product', localProductId: 401, createdAt: new Date('2026-07-01') },
        ]),
      },
      industryProjectBomItemTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      supplyCatalogMapping: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      product: {
        findMany: jest.fn((args: any) => {
          if (args?.include?.supplyMappings) {
            return Promise.resolve([
            {
              id: 401,
              storeId: 1,
              sku: 'SKU-401',
              name: '补水精华液',
              currentStock: 2,
              safetyStock: 10,
              supplier: null,
              supplyMappings: [
                {
                  id: 7001,
                  supplySkuId: 8001,
                  mappingStatus: 'active',
                  supplySku: {
                    supplier: { id: 6001, name: 'Ami 供应商' },
                    quotes: [{ id: 8101, status: 'active', auditStatus: 'approved', stockStatus: 'available', price: 12, moq: 5 }],
                  },
                },
              ],
            },
            {
              id: 402,
              storeId: 1,
              sku: 'SKU-402',
              name: '无映射低库存耗材',
              currentStock: 0,
              safetyStock: 5,
              supplier: '手工供应商',
              supplyMappings: [],
            },
            ]);
          }
          return Promise.resolve([{ id: 401, storeId: 1, sku: 'SKU-401', name: '补水精华液', currentStock: 2, safetyStock: 10, updatedAt: new Date(), deletedAt: null }]);
        }),
      },
      projectBomItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 501,
            projectId: 301,
            productId: 402,
            standardQty: 2,
            unit: '片',
            project: { id: 301, name: '补水护理', storeId: 1, status: 'active' },
            product: { id: 402, storeId: 1, sku: 'SKU-402', name: '无映射低库存耗材', currentStock: 0, safetyStock: 5, specUnit: '片', deletedAt: null },
          },
        ]),
      },
      projectBomItemTemplate: {},
      stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
      procurementOrderItem: { findMany: jest.fn().mockResolvedValue([]) },
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new IndustryService(prisma);

    const result = await service.productTemplateChainOperationalReport({ page: 1, pageSize: 20 }, 1);

    expect(result.summary).toMatchObject({
      publishedTemplates: 2,
      validAdoptions: 1,
      missingLocalSku: 1,
      activeProducts: 2,
      productsMissingSupplyMapping: 1,
      bomProductsWithoutStock: 1,
      lowStockProducts: 2,
      lowStockPlatformPurchasable: 1,
      lowStockManualOnly: 1,
    });
    expect(result.missingLocalSku[0]).toEqual(expect.objectContaining({ standardProductCode: 'STD-MASK-001' }));
    expect(result.lowStockPlatformPurchasable[0]).toEqual(expect.objectContaining({ sku: 'SKU-401', supplierName: 'Ami 供应商' }));
    expect(result.lowStockManualOnly[0]).toEqual(expect.objectContaining({ sku: 'SKU-402', supplier: '手工供应商' }));
  });
});
