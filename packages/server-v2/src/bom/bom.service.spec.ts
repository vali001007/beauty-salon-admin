import { Test, TestingModule } from '@nestjs/testing';
import { BomService } from './bom.service';
import { PrismaService } from '../prisma/prisma.service';

describe('BomService', () => {
  let service: BomService;
  let prisma: jest.Mocked<any>;

  beforeEach(async () => {
    const mockPrisma = {
      project: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      projectBomItem: {
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      consumptionRecord: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BomService>(BomService);
    prisma = module.get(PrismaService);
  });

  it('maps project BOM items to service facade shape', async () => {
    prisma.project.findMany.mockResolvedValue([
      {
        id: 1,
        name: '深层补水护理',
        duration: 60,
        price: 299,
        bomItems: [
          {
            id: 10,
            standardQty: 1,
            unit: '瓶',
            product: { name: '补水精华', sku: 'SKU-001', unit: '瓶' },
          },
        ],
      },
    ]);

    const result = await service.listServices();

    expect(result[0]).toMatchObject({
      id: 1,
      name: '深层补水护理',
      bomCount: 1,
      bom: [{ id: 10, productName: '补水精华', sku: 'SKU-001', standardQty: 1, unit: '瓶' }],
    });
  });

  it('returns material forecast with shortage calculation', async () => {
    prisma.product.findMany.mockResolvedValue([
      { name: '补水精华', sku: 'SKU-001', currentStock: 2, safetyStock: 5 },
    ]);

    const result = await service.getForecast();

    expect(result).toEqual([
      { productName: '补水精华', sku: 'SKU-001', forecastConsumption: 5, currentStock: 2, shortage: 3 },
    ]);
  });
});
