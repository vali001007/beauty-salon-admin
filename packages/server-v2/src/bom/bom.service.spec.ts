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
      stockMovement: {
        findMany: jest.fn(),
      },
      cardUsageRecord: {
        findMany: jest.fn(),
      },
      productOrder: {
        findMany: jest.fn(),
      },
      serviceTask: {
        findMany: jest.fn(),
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

  it('maps card usage stock movements to consumption rows', async () => {
    prisma.stockMovement.findMany.mockResolvedValue([
      {
        id: 212,
        sourceType: 'card_usage',
        sourceId: 436,
        movementType: 'service_consume',
        quantity: -7,
        occurredAt: new Date('2026-06-14T02:59:13.706Z'),
        remark: '次卡核销自动扣耗材：深层补水护理',
        product: { name: '玻尿酸保湿精华' },
        store: { name: 'Ami 全量演示门店' },
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([
      {
        id: 436,
        customerName: '李梦瑶',
        projectName: '深层补水护理',
        beautician: null,
      },
    ]);
    prisma.productOrder.findMany.mockResolvedValue([]);
    prisma.serviceTask.findMany.mockResolvedValue([]);
    prisma.consumptionRecord.findMany.mockResolvedValue([]);

    const result = await service.getConsumptionRecords();

    expect(result).toEqual([
      expect.objectContaining({
        id: 212,
        date: '2026-06-14',
        serviceName: '深层补水护理',
        customerName: '李梦瑶',
        storeName: 'Ami 全量演示门店',
        productName: '玻尿酸保湿精华',
        actualQty: 7,
        sourceType: 'card_usage',
        sourceId: 436,
      }),
    ]);
  });
});
