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
        findMany: jest.fn().mockResolvedValue([]),
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
      reservation: {
        findMany: jest.fn().mockResolvedValue([]),
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

  it('returns material forecast from upcoming appointments and recent consumption', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 10, name: '补水精华', sku: 'SKU-001', currentStock: 2, safetyStock: 5 },
    ]);
    prisma.reservation.findMany.mockResolvedValue([{ projectId: 1 }]);
    prisma.serviceTask.findMany.mockResolvedValue([{ projectId: 1 }]);
    prisma.projectBomItem.findMany.mockResolvedValue([{ projectId: 1, productId: 10, standardQty: 2 }]);
    prisma.stockMovement.findMany.mockResolvedValue([{ productId: 10, quantity: -30 }]);

    const result = await service.getForecast();

    expect(result).toEqual([
      {
        productName: '补水精华',
        sku: 'SKU-001',
        forecastConsumption: 11,
        scheduledConsumption: 4,
        recentDailyConsumption: 1,
        currentStock: 2,
        shortage: 9,
      },
    ]);
  });

  it('marks consumption rows abnormal when actual usage deviates from project BOM standard', async () => {
    prisma.stockMovement.findMany.mockResolvedValue([
      {
        id: 212,
        productId: 88,
        sourceType: 'card_usage',
        sourceId: 436,
        movementType: 'service_consume',
        quantity: -3,
        occurredAt: new Date('2026-06-14T02:59:13.706Z'),
        remark: '次卡核销自动扣耗材：深层补水护理',
        product: { id: 88, name: '玻尿酸保湿精华' },
        store: { name: 'Ami 全量演示门店' },
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([
      {
        id: 436,
        projectId: 20,
        times: 2,
        customerName: '李梦瑶',
        projectName: '深层补水护理',
        beautician: null,
      },
    ]);
    prisma.productOrder.findMany.mockResolvedValue([]);
    prisma.serviceTask.findMany.mockResolvedValue([]);
    prisma.consumptionRecord.findMany.mockResolvedValue([]);
    prisma.projectBomItem.findMany.mockResolvedValue([{ projectId: 20, productId: 88, standardQty: 1 }]);

    const result = await service.getConsumptionRecords();

    expect(result[0]).toEqual(expect.objectContaining({
      standardQty: 2,
      actualQty: 3,
      deviation: 50,
      isAbnormal: true,
    }));
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

  it('maps project order stock movements to order number and service employee', async () => {
    prisma.stockMovement.findMany.mockResolvedValue([
      {
        id: 301,
        sourceType: 'project_order',
        sourceId: 501,
        sourceNo: 'PO501',
        movementType: 'service_consume',
        quantity: -2,
        occurredAt: new Date('2026-06-20T04:00:00.000Z'),
        remark: '项目订单自动扣耗材：肩颈舒压',
        product: { name: '肩颈护理耗材包' },
        store: { name: 'Ami 全量演示门店' },
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 501,
        orderNo: 'PO501',
        customerName: '胡语嫣',
        customer: { name: '胡语嫣' },
        orderItems: [
          {
            id: 701,
            itemType: 'project',
            name: '补水护理',
            payload: { beauticianName: '许诺' },
          },
          {
            id: 702,
            itemType: 'project',
            name: '肩颈舒压',
            beautician: { name: '周宁' },
            payload: { beauticianName: '历史员工' },
          },
        ],
      },
    ]);
    prisma.serviceTask.findMany.mockResolvedValue([]);
    prisma.consumptionRecord.findMany.mockResolvedValue([]);

    const result = await service.getConsumptionRecords();

    expect(result[0]).toEqual(expect.objectContaining({
      id: 301,
      date: '2026-06-20',
      orderNo: 'PO501',
      serviceName: '肩颈舒压',
      customerName: '胡语嫣',
      serviceEmployee: '周宁',
      beautician: '周宁',
      productName: '肩颈护理耗材包',
      actualQty: 2,
      sourceType: 'project_order',
      sourceId: 501,
      sourceNo: 'PO501',
    }));
  });

  it('uses business timezone for card usage consumption date', async () => {
    prisma.stockMovement.findMany.mockResolvedValue([
      {
        id: 213,
        sourceType: 'card_usage',
        sourceId: 437,
        movementType: 'service_consume',
        quantity: -1,
        occurredAt: new Date('2026-06-19T17:51:29.000Z'),
        remark: '次卡核销自动扣耗材：深层补水护理',
        product: { name: '一次性护理巾' },
        store: { name: 'Ami 全量演示门店' },
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([
      {
        id: 437,
        customerName: '林雨薇',
        projectName: '深层补水护理',
        beautician: { name: '宋乔' },
      },
    ]);
    prisma.productOrder.findMany.mockResolvedValue([]);
    prisma.serviceTask.findMany.mockResolvedValue([]);
    prisma.consumptionRecord.findMany.mockResolvedValue([]);

    const result = await service.getConsumptionRecords();

    expect(result[0]).toEqual(expect.objectContaining({
      id: 213,
      date: '2026-06-20',
      serviceName: '深层补水护理',
      customerName: '林雨薇',
      beautician: '宋乔',
      productName: '一次性护理巾',
      sourceType: 'card_usage',
    }));
  });
});
