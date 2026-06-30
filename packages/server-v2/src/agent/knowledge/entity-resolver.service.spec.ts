import { EntityResolverService } from './entity-resolver.service.js';

describe('EntityResolverService', () => {
  let prisma: jest.Mocked<any>;
  let service: EntityResolverService;

  beforeEach(() => {
    prisma = {
      marketingPage: { findMany: jest.fn() },
      marketingActivity: { findMany: jest.fn() },
      customer: { findMany: jest.fn() },
      product: { findMany: jest.fn() },
      project: { findMany: jest.fn() },
      beautician: { findMany: jest.fn() },
      productOrder: { findMany: jest.fn() },
      customerCard: { findMany: jest.fn() },
    };
    prisma.marketingPage.findMany.mockResolvedValue([]);
    prisma.marketingActivity.findMany.mockResolvedValue([]);
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([]);
    prisma.project.findMany.mockResolvedValue([]);
    prisma.beautician.findMany.mockResolvedValue([]);
    prisma.productOrder.findMany.mockResolvedValue([]);
    prisma.customerCard.findMany.mockResolvedValue([]);
    service = new EntityResolverService(prisma);
  });

  it('resolves a marketing activity by real activity title before keyword domain guesses', async () => {
    prisma.marketingPage.findMany.mockResolvedValue([
      {
        id: 11,
        activityId: 7,
        title: '老朋友回店护理礼',
        shareUrl: 'https://example.com/old-friend',
        miniappPath: '/pages/marketing/old-friend',
        qrCodeUrl: null,
        status: 'published',
        storeId: 1,
      },
    ]);
    prisma.marketingActivity.findMany.mockResolvedValue([
      {
        id: 7,
        title: '老朋友回店护理礼',
        status: 'active',
        publishStatus: 'published',
      },
    ]);

    const result = await service.resolve({
      text: '老朋友回店护理礼活动链接发我',
      storeId: 1,
      role: 'manager',
    });

    expect(result.status).toBe('resolved');
    expect(result.entity).toMatchObject({
      objectType: 'MarketingActivity',
      entityId: '7',
      displayName: '老朋友回店护理礼',
      matchStrategy: 'exact_title',
    });
    expect(result.entity?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('resolves marketing activity when the user adds business modifiers around the real title', async () => {
    prisma.marketingPage.findMany.mockResolvedValue([
      {
        id: 12,
        activityId: 8,
        title: '老朋友回店礼',
        shareUrl: 'https://example.com/old-friend-return',
        miniappPath: '/pages/marketing/old-friend-return',
        qrCodeUrl: null,
        status: 'published',
        storeId: 1,
      },
    ]);
    prisma.marketingActivity.findMany.mockResolvedValue([
      {
        id: 8,
        title: '老朋友回店礼',
        status: 'active',
        publishStatus: 'published',
      },
    ]);

    const result = await service.resolve({
      text: '老朋友回店护理礼活动链接发我',
      storeId: 1,
      role: 'manager',
    });

    expect(result.status).toBe('resolved');
    expect(result.entity).toMatchObject({
      objectType: 'MarketingActivity',
      entityId: '8',
      displayName: '老朋友回店礼',
    });
    expect(prisma.marketingActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ title: { contains: '老朋友回店礼' } }),
          ]),
        }),
      }),
    );
  });

  it('asks for clarification when multiple activity candidates are close', async () => {
    prisma.marketingPage.findMany.mockResolvedValue([]);
    prisma.marketingActivity.findMany.mockResolvedValue([
      { id: 7, title: '老朋友回店护理礼', status: 'active', publishStatus: 'published' },
      { id: 8, title: '老朋友回店礼', status: 'active', publishStatus: 'published' },
    ]);

    const result = await service.resolve({
      text: '老朋友回店礼链接发我',
      storeId: 1,
      role: 'manager',
    });

    expect(['ambiguous', 'resolved']).toContain(result.status);
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it('resolves customer entities from appointment and benefit questions', async () => {
    prisma.marketingPage.findMany.mockResolvedValue([]);
    prisma.marketingActivity.findMany.mockResolvedValue([]);
    prisma.customer.findMany.mockResolvedValue([
      {
        id: 21,
        name: '张雯',
        phone: '13800008888',
        memberLevel: '金卡',
        totalSpent: 12000,
        visitCount: 8,
      },
    ]);

    const result = await service.resolve({
      text: '张雯今天有哪些预约',
      storeId: 1,
      role: 'reception',
    });

    expect(result.status).toBe('resolved');
    expect(result.entity).toMatchObject({
      objectType: 'Customer',
      entityId: '21',
      displayName: '张雯',
      sourceModel: 'Customer',
    });
    expect(result.entity?.metadata).toMatchObject({ phoneMasked: '138****8888' });
    expect(JSON.stringify(result)).not.toContain('13800008888');
    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 1,
          deletedAt: null,
        }),
      }),
    );
  });

  it('resolves inventory product entities from stock questions', async () => {
    prisma.marketingPage.findMany.mockResolvedValue([]);
    prisma.marketingActivity.findMany.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([
      {
        id: 301,
        name: '一次性丁腈手套',
        sku: 'GLOVE-NITRILE',
        brand: 'Ami',
        currentStock: 3,
        safetyStock: 20,
        status: 'active',
      },
    ]);

    const result = await service.resolve({
      text: '一次性丁腈手套库存还够吗',
      storeId: 1,
      role: 'manager',
    });

    expect(result.status).toBe('resolved');
    expect(result.entity).toMatchObject({
      objectType: 'InventoryProduct',
      entityId: '301',
      displayName: '一次性丁腈手套',
      sourceModel: 'Product',
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 1,
          deletedAt: null,
        }),
      }),
    );
  });

  it('resolves project entities without stealing marketing activity link questions', async () => {
    prisma.marketingPage.findMany.mockResolvedValue([]);
    prisma.marketingActivity.findMany.mockResolvedValue([]);
    prisma.project.findMany.mockResolvedValue([
      {
        id: 77,
        name: '肩颈舒压护理',
        price: 298,
        duration: 60,
        status: 'active',
        online: true,
      },
    ]);

    const result = await service.resolve({
      text: '肩颈舒压护理最近卖得好吗',
      storeId: 1,
      role: 'manager',
    });

    expect(result.status).toBe('resolved');
    expect(result.entity).toMatchObject({
      objectType: 'Project',
      entityId: '77',
      displayName: '肩颈舒压护理',
      sourceModel: 'Project',
    });
  });

  it('resolves beautician entities from performance questions', async () => {
    prisma.marketingPage.findMany.mockResolvedValue([]);
    prisma.marketingActivity.findMany.mockResolvedValue([]);
    prisma.beautician.findMany.mockResolvedValue([
      {
        id: 43,
        name: '宋乔',
        phone: '13900001111',
        levelId: 3,
        status: 'active',
      },
    ]);

    const result = await service.resolve({
      text: '宋乔这个月业绩怎么样',
      storeId: 1,
      role: 'manager',
    });

    expect(result.status).toBe('resolved');
    expect(result.entity).toMatchObject({
      objectType: 'Beautician',
      entityId: '43',
      displayName: '宋乔',
      sourceModel: 'Beautician',
    });
  });

  it('resolves order entities from order number questions', async () => {
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 9001,
        orderNo: 'PO202606300001',
        checkoutGroupNo: 'CG202606300001',
        orderKind: 'product',
        customerName: '张雯',
        totalAmount: 880,
        netAmount: 780,
        status: 'completed',
        payMethod: 'cash',
        createdAt: new Date('2026-06-30T10:00:00.000Z'),
      },
    ]);

    const result = await service.resolve({
      text: '查一下订单 PO202606300001',
      storeId: 1,
      role: 'manager',
    });

    expect(result.status).toBe('resolved');
    expect(result.entity).toMatchObject({
      objectType: 'Order',
      entityId: '9001',
      displayName: 'PO202606300001',
      sourceModel: 'ProductOrder',
    });
    expect(prisma.productOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 1,
        }),
      }),
    );
  });

  it('resolves member card entities from card benefit questions', async () => {
    prisma.customerCard.findMany.mockResolvedValue([
      {
        id: 501,
        cardName: '水光护理卡',
        remainingTimes: 3,
        totalTimes: 10,
        expiryDate: new Date('2026-09-01T00:00:00.000Z'),
        status: 'active',
        customer: { id: 21, name: '张雯', memberLevel: '金卡' },
      },
    ]);

    const result = await service.resolve({
      text: '张雯的水光护理卡还剩几次',
      storeId: 1,
      role: 'reception',
    });

    expect(result.status).toBe('resolved');
    expect(result.entity).toMatchObject({
      objectType: 'MemberCard',
      entityId: '501',
      displayName: '张雯 · 水光护理卡',
      sourceModel: 'CustomerCard',
    });
  });
});
