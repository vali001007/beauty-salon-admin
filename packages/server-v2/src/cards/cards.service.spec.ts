import { CardsService } from './cards.service';

describe('CardsService inventory consumption', () => {
  let service: CardsService;
  let prisma: any;
  let tx: any;
  let commissionService: { calculateCommission: jest.Mock };

  beforeEach(() => {
    commissionService = {
      calculateCommission: jest.fn(),
    };
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
          paidAmount: 680,
          discountAmount: 0,
          giftTimes: 0,
          recognizedUnitValue: 68,
          sourceOrderId: 501,
          sourceOrderItemId: 601,
          customer: { name: '林若溪', storeId: 1 },
          card: { id: 11, price: 680, totalTimes: 10, projects: [{ projectName: '深层补水护理', timesPerCard: 10 }] },
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
      beautician: {
        findFirst: jest.fn(),
      },
    };
    prisma = {
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    service = new CardsService(prisma, commissionService as any);
  });

  it('deducts project BOM stock after card usage verification', async () => {
    await service.verifyCardUsage({
      customerCardId: 66,
      projectName: '深层补水护理',
      consumedTimes: 1,
      operatorId: 7,
      remark: '库存发布前验收-次卡核销 BOM 扣减',
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
      data: { currentStock: 8 },
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
        remark: expect.stringContaining('库存发布前验收-次卡核销 BOM 扣减'),
      }),
    });
    expect(tx.cardUsageRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operatorId: 7,
        customerId: 10,
        cardName: '补水护理 10 次卡',
        projectName: '深层补水护理',
        customerCardId: 66,
        cardId: 11,
        projectId: 101,
        storeId: 1,
        recognizedUnitValue: 68,
        recognizedAmount: 68,
        sourceOrderId: 501,
        sourceOrderItemId: 601,
      }),
    });
  });

  it('accepts projectId from terminal card usage verification', async () => {
    tx.customerCard.findFirst.mockResolvedValue({
      id: 66,
      customerId: 10,
      cardName: '补水护理 10 次卡',
      totalTimes: 10,
      remainingTimes: 5,
      expiryDate: new Date('2026-12-31T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      paidAmount: 680,
      discountAmount: 0,
      giftTimes: 0,
      recognizedUnitValue: 68,
      sourceOrderId: 501,
      sourceOrderItemId: 601,
      customer: { name: '林若溪', storeId: 1 },
      card: {
        id: 11,
        price: 680,
        totalTimes: 10,
        projects: [{ projectId: 101, projectName: '深层补水护理', timesPerCard: 10 }],
      },
    });

    await service.verifyCardUsage({
      customerCardId: 66,
      projectId: 101,
      consumedTimes: 1,
      operatorId: 7,
      deviceId: 99,
    });

    expect(tx.project.findFirst).toHaveBeenCalledWith({
      where: {
        storeId: 1,
        deletedAt: null,
        OR: [{ id: 101 }, { name: '深层补水护理' }],
      },
      select: { id: true, name: true },
    });
    expect(tx.cardUsageRecord.aggregate).toHaveBeenCalledWith({
      where: expect.objectContaining({
        customerId: 10,
        cardName: '补水护理 10 次卡',
        projectName: '深层补水护理',
      }),
      _sum: { times: true },
    });
    expect(tx.cardUsageRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operatorId: 7,
        deviceId: 99,
        projectId: 101,
        projectName: '深层补水护理',
        recognizedAmount: 68,
      }),
    });
  });

  it('matches terminal projectId to legacy card project names', async () => {
    await service.verifyCardUsage({
      customerCardId: 66,
      projectId: 101,
      consumedTimes: 1,
      operatorId: 7,
      deviceId: 99,
    });

    expect(tx.project.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 101, storeId: 1, deletedAt: null },
      select: { id: true, name: true },
    });
    expect(tx.cardUsageRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operatorId: 7,
        deviceId: 99,
        projectId: 101,
        projectName: '深层补水护理',
        recognizedAmount: 68,
      }),
    });
  });

  it('resolves card usage project by name before calculating beautician commission', async () => {
    tx.beautician.findFirst.mockResolvedValue({ id: 2, levelId: 3, userId: 21 });

    await service.verifyCardUsage({
      customerCardId: 66,
      projectName: '深层补水护理',
      consumedTimes: 1,
      operatorId: 7,
      beauticianId: 2,
    });

    expect(tx.project.findFirst).toHaveBeenCalledWith({
      where: {
        storeId: 1,
        deletedAt: null,
        OR: [{ name: '深层补水护理' }],
      },
      select: { id: true, name: true },
    });
    expect(tx.beautician.findFirst).toHaveBeenCalledWith({
      where: { id: 2, storeId: 1, status: 'active' },
      select: { id: true, levelId: true, userId: true },
    });
    expect(commissionService.calculateCommission).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 1,
        staffUserId: 21,
        beauticianId: 2,
        type: 'project',
        itemId: 101,
        sourceAmount: 68,
        sourceType: 'card_usage',
        sourceId: 88,
        cardUsageRecordId: 88,
      }),
      tx,
    );
  });
});

describe('CardsService sale options', () => {
  it('returns active global and store-scoped cards with normalized fields', async () => {
    const prisma: any = {
      card: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 12,
            name: '补水护理 10 次卡',
            totalTimes: 10,
            price: 2680,
            validDays: 180,
            storeId: 6,
            store: { id: 6, name: 'Ami 全量演示门店' },
            status: 'active',
            sortOrder: 1,
            createdAt: new Date('2026-06-01T00:00:00.000Z'),
            projects: [{ projectName: '深层补水护理', timesPerCard: 10 }],
          },
          {
            id: 13,
            name: '全店通用次卡',
            totalTimes: 8,
            price: 1880,
            validDays: null,
            storeId: null,
            store: null,
            status: 'active',
            sortOrder: 2,
            createdAt: new Date('2026-06-02T00:00:00.000Z'),
            projects: ['敏感肌舒缓修护'],
          },
        ]),
      },
    };
    const service = new CardsService(prisma, { calculateCommission: jest.fn() } as any);

    const result = await service.findSaleOptions({ storeId: 6 });

    expect(prisma.card.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: 'active',
        OR: [{ storeId: null }, { storeId: 6 }],
      },
    }));
    expect(result).toEqual([
      expect.objectContaining({
        id: 12,
        status: '上架',
        storeId: 6,
        storeName: 'Ami 全量演示门店',
        validDays: 180,
        projects: [{ projectName: '深层补水护理', timesPerCard: 10 }],
      }),
      expect.objectContaining({
        id: 13,
        storeId: null,
        storeName: '全部门店',
        validDays: 365,
        projects: [{ projectName: '敏感肌舒缓修护', timesPerCard: 8 }],
      }),
    ]);
  });

  it('drops display-only fields when creating cards', async () => {
    const prisma: any = {
      card: {
        create: jest.fn().mockResolvedValue({
          id: 20,
          name: '抗衰管理 6 次卡',
          totalTimes: 6,
          price: 3680,
          validDays: 120,
          storeId: 6,
          store: { id: 6, name: 'Ami 全量演示门店' },
          status: 'active',
          sortOrder: 0,
          createdAt: new Date('2026-06-01T00:00:00.000Z'),
          projects: [{ projectName: '紧致抗衰护理', timesPerCard: 6 }],
        }),
      },
    };
    const service = new CardsService(prisma, { calculateCommission: jest.fn() } as any);

    await service.create({
      name: '抗衰管理 6 次卡',
      type: '次卡',
      storeName: 'Ami 全量演示门店',
      storeId: 6,
      totalTimes: 6,
      price: 3680,
      validDays: 120,
      status: '上架',
      projects: [{ projectName: '紧致抗衰护理', timesPerCard: 6 }],
    });

    const data = prisma.card.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      name: '抗衰管理 6 次卡',
      storeId: 6,
      totalTimes: 6,
      validDays: 120,
      status: 'active',
    });
    expect(data).not.toHaveProperty('type');
    expect(data).not.toHaveProperty('storeName');
  });
});
