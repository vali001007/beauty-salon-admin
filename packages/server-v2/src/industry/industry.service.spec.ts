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
});
