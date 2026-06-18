import { PromotionsService } from './promotions.service';

describe('PromotionsService', () => {
  let service: PromotionsService;
  let prisma: any;

  const basePromotion = {
    id: 1,
    storeId: null,
    source: 'system',
    status: 'active',
    approvalStatus: 'approved',
    applicableProjectIds: [],
    issuedCount: 0,
    usedCount: 0,
    maxIssueCount: null,
    startAt: null,
    endAt: null,
    thresholdAmount: null,
    discountAmount: null,
    estimatedCost: 0,
    store: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = {
      promotion: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new PromotionsService(prisma);
  });

  it('should query paginated promotions by scenario and store scope', async () => {
    prisma.promotion.findMany.mockResolvedValue([
      {
        ...basePromotion,
        id: 31,
        storeId: null,
        name: '护理周期预约券',
        discountText: '护理项目满500减80',
        type: 'money_off',
        scenario: 'care_cycle_due',
        audienceTags: ['护理周期'],
        metadata: { reason: '护理周期到期客户已有复购时机。' },
      },
    ]);
    prisma.promotion.count.mockResolvedValue(1);

    const result = await service.findPaginated({
      page: 2,
      pageSize: 5,
      scenario: 'care_cycle_due',
      storeId: 3,
      approvalStatus: 'approved',
    });

    expect(prisma.promotion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          scenario: 'care_cycle_due',
          approvalStatus: 'approved',
          OR: [{ storeId: 3 }, { storeId: null }],
        },
        skip: 5,
        take: 5,
      }),
    );
    expect(prisma.promotion.count).toHaveBeenCalledWith({
      where: {
        scenario: 'care_cycle_due',
        approvalStatus: 'approved',
        OR: [{ storeId: 3 }, { storeId: null }],
      },
    });
    expect(result).toMatchObject({
      total: 1,
      page: 2,
      pageSize: 5,
      items: [expect.objectContaining({
        id: 31,
        scenario: 'care_cycle_due',
        metadata: expect.objectContaining({ reason: '护理周期到期客户已有复购时机。' }),
      })],
    });
  });

  it('should allow non-paginated promotions query to filter by scenario', async () => {
    prisma.promotion.findMany.mockResolvedValue([]);
    prisma.promotion.count.mockResolvedValue(0);

    await service.findAll({ scenario: 'project_idle_capacity', status: 'active' });

    expect(prisma.promotion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          scenario: 'project_idle_capacity',
          status: 'active',
        },
        skip: 0,
        take: 200,
      }),
    );
  });

  it('should prioritize care-cycle hydration asset for dry-skin cycle customers', async () => {
    prisma.promotion.findMany.mockResolvedValue([
      {
        ...basePromotion,
        id: 1,
        name: '护理周期预约券',
        discountText: '护理项目满500减80',
        type: 'money_off',
        scenario: 'care_cycle_due',
        audienceTags: ['护理周期', '复购窗口'],
        metadata: {
          lifecycleTags: ['活跃老客'],
          behaviorTags: ['护理周期到期'],
          preferenceTags: ['补水'],
          skinTags: ['干皮'],
          offerStrength: 'medium',
          preferredExecutionModes: ['automation'],
          reason: '护理周期到期客户已有复购时机。',
        },
      },
      {
        ...basePromotion,
        id: 2,
        name: '通用门店礼',
        discountText: '到店赠小样',
        type: 'gift',
        scenario: 'member_day',
        audienceTags: ['会员'],
        metadata: { offerStrength: 'light' },
      },
    ]);

    const result = await service.match({
      scenario: 'care_cycle_due',
      executionMode: 'automation',
      customerTags: ['活跃老客', '护理周期到期', '干皮', '补水'],
      skinType: '干皮',
    });

    expect(result.selected).toMatchObject({
      promotionId: 1,
      name: '护理周期预约券',
      fitLevel: expect.stringMatching(/excellent|good/),
    });
    expect(result.selected.fitReasons).toContain('适用场景匹配');
    expect(result.selected.scoreBreakdown.itemFitScore).toBeGreaterThan(0);
  });

  it('should prefer VIP privilege over strong discount for high-value customers', async () => {
    prisma.promotion.findMany.mockResolvedValue([
      {
        ...basePromotion,
        id: 1,
        name: '高流失满减券',
        discountText: '到店护理满300减100',
        type: 'money_off',
        scenario: 'churn_winback',
        audienceTags: ['沉睡客户'],
        metadata: {
          lifecycleTags: ['流失高风险'],
          offerStrength: 'strong',
          preferredExecutionModes: ['automation'],
        },
      },
      {
        ...basePromotion,
        id: 2,
        name: 'VIP 专属护理礼遇',
        discountText: '专属顾问服务 + 优先预约',
        type: 'member_privilege',
        scenario: 'vip_privilege_care',
        audienceTags: ['VIP', '高 LTV'],
        applicableCustomerLevels: ['VIP', '铂金'],
        metadata: {
          valueTags: ['高 LTV', '高价值客户'],
          includeTags: ['VIP'],
          offerStrength: 'light',
          preferredExecutionModes: ['automation', 'consultant_task'],
        },
      },
    ]);

    const result = await service.match({
      scenario: 'vip_privilege_care',
      executionMode: 'automation',
      ltvTier: 'VIP',
      customerTags: ['VIP', '高 LTV', '高价值客户'],
    });

    expect(result.selected).toMatchObject({
      promotionId: 2,
      name: 'VIP 专属护理礼遇',
    });
    expect(result.items.map((item: any) => item.promotionId)).not.toContain(1);
  });

  it('should recommend claimed-unused reminder without adding extra discount', async () => {
    prisma.promotion.findMany.mockResolvedValue([
      {
        ...basePromotion,
        id: 1,
        name: '已领权益核销提醒',
        discountText: '提醒使用已领取权益',
        type: 'member_privilege',
        scenario: 'coupon_claimed_unused',
        audienceTags: ['已领券', '未核销'],
        metadata: {
          behaviorTags: ['已领未核销'],
          includeTags: ['已领券'],
          offerStrength: 'light',
          preferredExecutionModes: ['automation'],
        },
      },
      {
        ...basePromotion,
        id: 2,
        name: '新客强折扣',
        discountText: '指定项目新客体验价',
        type: 'trial_price',
        scenario: 'new_customer',
        audienceTags: ['新客户'],
        metadata: {
          lifecycleTags: ['新客未首单'],
          offerStrength: 'strong',
          preferredExecutionModes: ['activity'],
        },
      },
    ]);

    const result = await service.match({
      scenario: 'coupon_claimed_unused',
      executionMode: 'automation',
      customerTags: ['已领券', '已领未核销'],
    });

    expect(result.selected).toMatchObject({
      promotionId: 1,
      type: 'member_privilege',
      discountText: '提醒使用已领取权益',
    });
    expect(result.items.map((item: any) => item.promotionId)).not.toContain(2);
  });

  it('should return draft suggestion when no asset is usable', async () => {
    prisma.promotion.findMany.mockResolvedValue([]);

    const result = await service.match({ scenario: 'project_idle_capacity' });

    expect(result.items).toEqual([]);
    expect(result.selected).toBeUndefined();
    expect(result.draftSuggestion).toMatchObject({
      name: '低峰预约礼',
      type: 'gift',
    });
  });
});
