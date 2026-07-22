import { CustomerMarketingProfileService } from './customer-marketing-profile.service';

describe('CustomerMarketingProfileService', () => {
  let service: CustomerMarketingProfileService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      customer: {
        findMany: jest.fn(),
      },
      customerPredictionSnapshot: {
        findMany: jest.fn(),
      },
      customerCard: {
        findMany: jest.fn(),
      },
      reservation: {
        findMany: jest.fn(),
      },
      orderItem: {
        findMany: jest.fn(),
      },
      customerBehaviorEvent: {
        findMany: jest.fn(),
      },
      customerAppEvent: {
        findMany: jest.fn(),
      },
    };
    service = new CustomerMarketingProfileService(prisma);
  });

  it('rejects profile aggregation without a store boundary', async () => {
    await expect(service.buildProfiles(undefined as any, [1])).rejects.toThrow('storeId is required');
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
  });

  it('should build explainable multi-dimensional tags from customer data', async () => {
    prisma.customer.findMany.mockResolvedValue([
      {
        id: 1,
        storeId: 1,
        name: 'Alice',
        memberLevel: 'VIP',
        totalSpent: 8000,
        visitCount: 3,
        lastVisitDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        skinType: '干敏肌',
        skinCondition: '缺水 屏障受损',
        tags: [],
        healthProfile: { skinType: '干敏肌', mainProblems: '缺水 屏障受损', goals: '补水修护' },
      },
    ]);
    prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
      {
        customerId: 1,
        churnScore: 85,
        churnLevel: '高',
        repurchase30dScore: 70,
        marketingResponseScore: 82,
        ltvTier: '铂金',
        ltv12m: 12000,
        createdAt: new Date(),
      },
    ]);
    prisma.customerCard.findMany.mockResolvedValue([
      { customerId: 1, status: 'active', remainingTimes: 1, expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) },
    ]);
    prisma.reservation.findMany.mockResolvedValue([]);
    prisma.orderItem.findMany.mockResolvedValue([
      { itemType: 'project', name: '补水修护护理', order: { customerId: 1 } },
      { itemType: 'product', name: '补水精华', order: { customerId: 1 } },
    ]);
    prisma.customerBehaviorEvent.findMany.mockResolvedValue([
      { customerId: 1, eventType: 'project_viewed', occurredAt: new Date() },
      { customerId: 1, eventType: 'promotion_claimed', occurredAt: new Date() },
    ]);
    prisma.customerAppEvent.findMany.mockResolvedValue([
      { customerId: 1, eventType: 'page_view', channel: 'miniapp', occurredAt: new Date() },
    ]);

    const [profile] = await service.buildProfiles(1, [1]);

    expect(profile.customerId).toBe(1);
    expect(profile.lifecycleTags).toEqual(expect.arrayContaining(['沉睡', '流失高风险', '复购窗口']));
    expect(profile.valueTags).toEqual(expect.arrayContaining(['VIP', '高 LTV', '高价值客户']));
    expect(profile.skinTags).toEqual(expect.arrayContaining(['干皮', '敏感', '修护']));
    expect(profile.cardTags).toEqual(expect.arrayContaining(['次卡临期', '剩余次数低']));
    expect(profile.behaviorTags).toEqual(expect.arrayContaining(['浏览未预约', '已领券', '已领未核销', '高响应客户']));
    expect(profile.preferenceTags).toContain('补水');
    expect(profile.productCycleTags).toEqual(expect.arrayContaining(['产品补货周期', '产品搭售']));
    expect(profile.channelTags).toContain('小程序活跃');
    expect(profile.evidence.length).toBeGreaterThan(0);
  });

  it('should return empty list when no customers match', async () => {
    prisma.customer.findMany.mockResolvedValue([]);

    await expect(service.buildProfiles(1, [999])).resolves.toEqual([]);
  });
});
