import { ProductsService } from './products.service.js';

describe('ProductsService', () => {
  let prisma: any;
  let service: ProductsService;

  beforeEach(() => {
    prisma = {
      product: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      industryAdoptionRecord: {
        findMany: jest.fn(),
      },
      industryProductTemplate: {
        findMany: jest.fn(),
      },
      supplyCatalogMapping: {
        findMany: jest.fn(),
      },
      category: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    service = new ProductsService(prisma);
  });

  it('returns industry source and unmapped supply status for adopted products', async () => {
    const createdAt = new Date('2026-07-01T10:00:00.000Z');
    prisma.product.findMany.mockResolvedValue([
      {
        id: 101,
        storeId: 1,
        sku: 'IND-1-STD-MASK-001',
        name: '补水软膜粉',
        deletedAt: null,
      },
    ]);
    prisma.product.count.mockResolvedValue(1);
    prisma.industryAdoptionRecord.findMany.mockResolvedValue([
      {
        id: 22,
        storeId: 1,
        adoptionType: 'product',
        productTemplateId: 5,
        templateVersion: 3,
        localProductId: 101,
        payload: null,
        createdAt,
      },
    ]);
    prisma.industryProductTemplate.findMany.mockResolvedValue([
      {
        id: 5,
        standardProductCode: 'STD-MASK-001',
        name: '标准补水软膜粉',
        version: 3,
        deletedAt: null,
      },
    ]);
    prisma.supplyCatalogMapping.findMany.mockResolvedValue([]);

    const result = await service.findPaginated({ page: 1, pageSize: 20 }, 1);

    expect(result.items[0]).toMatchObject({
      id: 101,
      industrySource: {
        productTemplateId: 5,
        standardProductCode: 'STD-MASK-001',
        templateName: '标准补水软膜粉',
        templateVersion: 3,
        adoptionId: 22,
        adoptionStatus: 'active',
      },
      supplyMapping: {
        availabilityStatus: 'not_mapped',
      },
    });
  });

  it('marks product supply mapping available when preferred mapping has approved active quote', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 102,
      storeId: 1,
      sku: 'IND-1-STD-SERUM-001',
      name: '补水精华液',
      deletedAt: null,
      category: null,
      batches: [],
    });
    prisma.industryAdoptionRecord.findMany.mockResolvedValue([]);
    prisma.industryProductTemplate.findMany.mockResolvedValue([]);
    prisma.supplyCatalogMapping.findMany.mockResolvedValue([
      {
        id: 9,
        productId: 102,
        supplySkuId: 88,
        mappingStatus: 'active',
        supplySku: {
          supplier: { id: 6, name: '核心耗材供应商' },
          quotes: [
            {
              id: 77,
              price: 18.5,
              moq: 10,
              leadDays: 4,
              stockStatus: 'available',
              status: 'active',
              auditStatus: 'approved',
              deletedAt: null,
              validFrom: null,
              validTo: null,
            },
          ],
        },
      },
    ]);

    const result = await service.findById(102);

    expect(result).toMatchObject({
      id: 102,
      industrySource: null,
      supplyMapping: {
        mappingId: 9,
        mappingStatus: 'active',
        supplySkuId: 88,
        supplierName: '核心耗材供应商',
        latestQuotePrice: 18.5,
        moq: 10,
        leadDays: 4,
        stockStatus: 'available',
        availabilityStatus: 'available',
      },
    });
  });
});
