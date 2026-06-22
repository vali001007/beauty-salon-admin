import { CardsService } from './cards.service';

describe('CardsService inventory consumption', () => {
  let service: CardsService;
  let prisma: any;
  let tx: any;

  beforeEach(() => {
    tx = {
      customerCard: {
        findFirst: jest.fn().mockResolvedValue({
          id: 66,
          customerId: 10,
          cardName: '补水护理 10 次卡',
          totalTimes: 10,
          remainingTimes: 5,
          expiryDate: new Date('2026-12-31T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          customer: { name: '林若溪', storeId: 1 },
          card: { projects: [{ projectId: 101, projectName: '深层补水护理', timesPerCard: 10 }] },
        }),
        update: jest.fn().mockResolvedValue({ id: 66, remainingTimes: 4 }),
      },
      cardUsageRecord: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { times: 0 } }),
        create: jest.fn().mockResolvedValue({
          id: 88,
          customerId: 10,
          customerName: '林若溪',
          cardName: '补水护理 10 次卡',
          projectName: '深层补水护理',
          times: 1,
          remainingTimes: 4,
        }),
      },
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 101, name: '深层补水护理' }),
      },
      projectBomItem: {
        findMany: jest.fn().mockResolvedValue([{ productId: 301, standardQty: 2 }]),
      },
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: 301, storeId: 1, currentStock: 10, unit: '支' }),
        update: jest.fn().mockResolvedValue({ id: 301 }),
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({ id: 901 }),
      },
    };
    prisma = {
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    service = new CardsService(prisma);
  });

  it('deducts project BOM stock after card usage verification', async () => {
    await service.verifyCardUsage({
      customerCardId: 66,
      projectName: '深层补水护理',
      consumedTimes: 1,
      operatorId: 7,
    });

    expect(tx.customerCard.update).toHaveBeenCalledWith({
      where: { id: 66 },
      data: { remainingTimes: 4 },
    });
    expect(tx.projectBomItem.findMany).toHaveBeenCalledWith({
      where: { projectId: 101 },
      select: { productId: true, standardQty: true },
    });
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 301 },
      data: { currentStock: { decrement: 2 } },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 1,
        productId: 301,
        movementType: 'service_consume',
        quantity: -2,
        beforeStock: 10,
        afterStock: 8,
        sourceType: 'card_usage',
        sourceId: 88,
        sourceNo: '补水护理 10 次卡',
      }),
    });
    expect(tx.cardUsageRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operatorId: 7,
        customerId: 10,
        cardName: '补水护理 10 次卡',
        projectName: '深层补水护理',
      }),
    });
  });
});
