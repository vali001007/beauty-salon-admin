import { BrainCustomerFactResolverService } from './brain-customer-fact-resolver.service.js';

describe('BrainCustomerFactResolverService', () => {
  it('requires both customer name and phone tail when both are provided', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new BrainCustomerFactResolverService({ customer: { findMany } } as never);

    await service.answerExactCustomerQuestion({
      storeId: 6,
      message: '有个客人说她叫李梅，手机尾号3256，帮我找一下',
      permissions: ['*'],
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: 6,
          AND: [{ name: { contains: '李梅' } }, { phone: { endsWith: '3256' } }],
        }),
      }),
    );
  });

  it('extracts a customer name from a reservation lookup', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new BrainCustomerFactResolverService({ customer: { findMany } } as never);

    await service.answerExactCustomerQuestion({
      storeId: 6,
      message: '张美丽的预约是几点，做什么项目',
      permissions: ['*'],
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ name: { contains: '张美丽' } }) }),
    );
  });

  it('supports the natural phone-last-four expression for exact customer lookup', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new BrainCustomerFactResolverService({ customer: { findMany } } as never);

    await service.answerCustomerQuestion({
      storeId: 6,
      message: '手机号后四位是7636',
      permissions: ['core:customer:view'],
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ phone: { endsWith: '7636' } }),
    }));
  });

  it('routes a resolved customer mention to exact facts and a generic segment question to customer analysis', async () => {
    const service = new BrainCustomerFactResolverService({} as never);
    const exact = jest.spyOn(service, 'answerExactCustomerQuestion').mockResolvedValue('张女士客户事实');
    const segment = jest.spyOn(service, 'answerCustomerFactQuestion').mockResolvedValue('沉睡客户名单');

    await expect(service.answerCustomerQuestion({
      storeId: 6,
      message: '帮我查一下这个客户',
      specificCustomerMention: '张女士',
      permissions: ['core:customer:view'],
    })).resolves.toBe('张女士客户事实');
    await expect(service.answerCustomerQuestion({
      storeId: 6,
      message: '最近哪些老客好久没来了，帮我列一下',
      permissions: ['core:customer:view'],
      startDate: new Date('2026-05-01T00:00:00.000Z'),
      endDate: new Date('2026-07-16T00:00:00.000Z'),
    })).resolves.toBe('沉睡客户名单');
    await expect(service.answerCustomerQuestion({
      storeId: 6,
      message: '帮我找一下三个月没来消费的客户',
      permissions: ['core:customer:view'],
    })).resolves.toBe('沉睡客户名单');

    expect(exact).toHaveBeenCalledWith({
      storeId: 6,
      message: '帮我查一下这个客户',
      customerName: '张女士',
      permissions: ['core:customer:view'],
    });
    expect(segment).toHaveBeenCalledWith(expect.objectContaining({
      storeId: 6,
      message: '最近哪些老客好久没来了，帮我列一下',
    }));
    expect(exact).toHaveBeenCalledTimes(1);
    expect(segment).toHaveBeenCalledTimes(2);
  });

  it('uses the latest completed service task and returns the shared customer source', async () => {
    const findMany = jest.fn().mockResolvedValue([{
      name: '马美琳',
      phone: '15838146325',
      memberLevel: '钻石会员',
      totalSpent: 196626,
      visitCount: 119,
      lastVisitDate: new Date('2026-07-15T00:00:00.000Z'),
      source: '小红书',
      tags: ['沉睡客户'],
      remark: '偏好下午到店',
      healthProfile: null,
      customerCards: [],
      balanceAccounts: [],
      consumptionRecords: [],
      reservations: [{
        date: new Date('2026-07-18T00:00:00.000Z'),
        startTime: '14:00',
        status: 'confirmed',
        remark: '未来预约，不是已完成服务',
        project: { name: '未来预约项目' },
        beautician: { name: '预约美容师' },
      }],
      serviceTasks: [{
        appointmentTime: new Date('2026-07-10T06:00:00.000Z'),
        completedAt: new Date('2026-07-10T07:00:00.000Z'),
        remark: '重点补水',
        project: { name: '水光护理' },
        beautician: { name: '王美容师' },
      }],
    }]);
    const service = new BrainCustomerFactResolverService({ customer: { findMany } } as never);

    const answer = await service.answerExactCustomerQuestion({
      storeId: 6,
      message: '马美琳上次做的什么项目，她从哪个渠道来的，标签和备注是什么',
      customerName: '马美琳，手机尾号6325',
      permissions: ['core:customer:view'],
    });

    expect(answer).toContain('最近完成服务：水光护理');
    expect(answer).not.toContain('最近服务：未来预约项目');
    expect(answer).toContain('客户来源：小红书');
    expect(answer).toContain('标签：沉睡客户；备注：偏好下午到店');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({
        serviceTasks: expect.objectContaining({ where: { storeId: 6, status: 'completed' } }),
      }),
    }));
  });

  it('fails closed when a customer question has no registered business fact', async () => {
    const service = new BrainCustomerFactResolverService({} as never);

    await expect(service.answerCustomerFactQuestion({
      storeId: 6,
      message: '帮我看一下客户满意度整体情况',
    })).resolves.toContain('尚未注册该业务口径');
  });

  it('answers dormant-customer reactivation from lifecycle evidence instead of a dormant list', async () => {
    const customerLifecycle = {
      getDormantReactivationEvidence: jest.fn().mockResolvedValue({
        rangeLabel: '2026-07-01 至 2026-07-17',
        touchCountAnalyzed: 4,
        dormantCandidateCount: 2,
        reactivatedCustomerCount: 1,
        strongSignalCustomerCount: 1,
        mediumSignalCustomerCount: 0,
        weakSignalCustomerCount: 0,
        rows: [{ customerName: '赵女士', signalSummary: '实际到店、产生有效消费', dormantEvidence: '触达前 60 天无实际到店或有效消费' }],
      }),
    };
    const service = new BrainCustomerFactResolverService({} as never, customerLifecycle as never);

    await expect(service.answerCustomerFactQuestion({
      storeId: 6,
      message: '哪些沉睡客户最近有点被唤醒的迹象',
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-17T23:59:59.999Z'),
    })).resolves.toContain('赵女士：实际到店、产生有效消费');
    expect(customerLifecycle.getDormantReactivationEvidence).toHaveBeenCalledWith(6, expect.objectContaining({ limit: 10 }));
  });

  it('uses the latest prediction run for new-customer long-term potential instead of a one-time customer list', async () => {
    const predictionRunFindFirst = jest.fn().mockResolvedValue({
      id: 62,
      modelVersion: 'rules-v2.1',
      businessDate: new Date('2026-07-16T00:00:00.000Z'),
      finishedAt: new Date('2026-07-15T16:00:56.000Z'),
    });
    const snapshotFindMany = jest.fn().mockResolvedValue([
      {
        repurchase30dScore: 82,
        marketingResponseScore: 76,
        ltv6m: 1800,
        ltvTier: '白银',
        customer: {
          name: '高晓雯',
          createdAt: new Date('2026-05-14T02:00:00.000Z'),
          visitCount: 2,
          totalSpent: 961,
          lastVisitDate: new Date('2026-06-30T02:28:02.604Z'),
        },
      },
    ]);
    const service = new BrainCustomerFactResolverService({
      predictionRun: { findFirst: predictionRunFindFirst },
      customerPredictionSnapshot: { findMany: snapshotFindMany },
    } as never);

    await expect(service.answerCustomerFactQuestion({
      storeId: 6,
      message: '新客中哪些人最有潜力转成长期客户',
    })).resolves.toContain('高晓雯：近 90 天建档、到店 2 次，30 天复购评分 82');
    expect(snapshotFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: 6,
        runId: 62,
        repurchase30dScore: { gte: 70 },
        customer: expect.objectContaining({ visitCount: { lte: 2 } }),
      }),
    }));
  });

  it('uses bound project behavior and excludes customers with active cards from project-interest candidates', async () => {
    const eventFindMany = jest.fn().mockResolvedValue([
      {
        customerId: 10,
        eventType: 'h5_click_book',
        targetId: '88',
        occurredAt: new Date('2026-07-08T07:45:12.000Z'),
        customer: { name: '王女士', totalSpent: 0, customerCards: [] },
      },
      {
        customerId: 11,
        eventType: 'miniapp_reservation_success',
        targetId: '92',
        occurredAt: new Date('2026-07-07T07:45:12.000Z'),
        customer: { name: '李女士', totalSpent: 5000, customerCards: [{ id: 1 }] },
      },
    ]);
    const projectFindMany = jest.fn().mockResolvedValue([{ id: 88, name: '水光护理' }]);
    const service = new BrainCustomerFactResolverService({
      customerAppEvent: { findMany: eventFindMany },
      project: { findMany: projectFindMany },
    } as never);

    const answer = await service.answerCustomerFactQuestion({
      storeId: 6,
      message: '有没有客户对某个项目特别感兴趣但还没办卡',
    });

    expect(answer).toContain('王女士：水光护理，信号 点击预约');
    expect(answer).not.toContain('李女士');
    expect(projectFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: 6, id: { in: [88] }, deletedAt: null },
    }));
  });

  it('uses the requested time range and returns a ranked new-customer source distribution', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { createdAt: new Date('2026-07-02T02:00:00.000Z'), source: 'ami_glow' },
      { createdAt: new Date('2026-07-03T03:00:00.000Z'), source: 'ami_glow' },
      { createdAt: new Date('2026-07-10T04:00:00.000Z'), source: 'codex_acceptance' },
      { createdAt: new Date('2026-07-11T05:00:00.000Z'), source: null },
    ]);
    const service = new BrainCustomerFactResolverService({ customer: { findMany } } as never);
    const startDate = new Date('2026-06-30T16:00:00.000Z');
    const endDate = new Date('2026-07-31T15:59:59.999Z');

    const result = await service.getNewCustomerSourceDistribution({ storeId: 6, startDate, endDate });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        storeId: 6,
        deletedAt: null,
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { createdAt: true, source: true },
    });
    expect(result).toMatchObject({
      total: 4,
      missingSourceCount: 1,
      sourceRanking: [
        { source: 'Ami Glow', count: 2, share: 0.5 },
        { source: '验收测试', count: 1, share: 0.25 },
        { source: '未记录渠道', count: 1, share: 0.25 },
      ],
    });
  });

  it('passes the parsed time range into the new-customer source query', async () => {
    const service = new BrainCustomerFactResolverService({} as never);
    const sourceDistribution = jest.spyOn(service, 'getNewCustomerSourceDistribution').mockResolvedValue({
      total: 2,
      missingSourceCount: 0,
      sourceRanking: [{ source: '美团', count: 2, share: 1 }],
      weeklyRanking: [{ week: '2026-06-29 周', count: 2 }],
    });
    const startDate = new Date('2026-06-30T16:00:00.000Z');
    const endDate = new Date('2026-07-31T15:59:59.999Z');

    await expect(service.answerCustomerFactQuestion({
      storeId: 6,
      message: '这个月新客主要来自什么渠道',
      startDate,
      endDate,
    })).resolves.toContain('当前时间范围新客共 2 人');

    expect(sourceDistribution).toHaveBeenCalledWith({ storeId: 6, startDate, endDate });
  });

  it('calculates new-customer conversion from the cohort created in the requested period', async () => {
    const startDate = new Date('2026-05-31T16:00:00.000Z');
    const endDate = new Date('2026-06-30T15:59:59.999Z');
    const customerFindMany = jest.fn().mockResolvedValue([
      { id: 1, createdAt: new Date('2026-06-03T02:00:00.000Z') },
      { id: 2, createdAt: new Date('2026-06-10T03:00:00.000Z') },
      { id: 3, createdAt: new Date('2026-06-20T04:00:00.000Z') },
    ]);
    const orderFindMany = jest.fn().mockResolvedValue([
      { customerId: 1, createdAt: new Date('2026-06-05T02:00:00.000Z') },
      { customerId: 1, createdAt: new Date('2026-06-06T02:00:00.000Z') },
      { customerId: 2, createdAt: new Date('2026-06-09T02:00:00.000Z') },
    ]);
    const service = new BrainCustomerFactResolverService({
      customer: { findMany: customerFindMany },
      productOrder: { findMany: orderFindMany },
    } as never);

    await expect(service.getNewCustomerConversionSummary({ storeId: 6, startDate, endDate })).resolves.toEqual({
      newCustomerCount: 3,
      convertedCustomerCount: 1,
      unconvertedCustomerCount: 2,
      conversionRate: 1 / 3,
    });
    expect(customerFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: 6, deletedAt: null, createdAt: { gte: startDate, lte: endDate } },
    }));
    expect(orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: 6,
        customerId: { in: [1, 2, 3] },
        createdAt: { gte: startDate, lte: endDate },
        netAmount: { gt: 0 },
      }),
    }));
  });

  it('groups unique arrived customers by governed age bands and keeps unknown coverage visible', async () => {
    const startDate = new Date('2026-07-16T16:00:00.000Z');
    const endDate = new Date('2026-07-17T15:59:59.999Z');
    const findMany = jest.fn().mockResolvedValue([
      { customerId: 1, customer: { age: 23, birthday: null } },
      { customerId: 1, customer: { age: 23, birthday: null } },
      { customerId: 2, customer: { age: null, birthday: new Date('1992-08-01T00:00:00.000Z') } },
      { customerId: 3, customer: { age: null, birthday: null } },
    ]);
    const service = new BrainCustomerFactResolverService({ reservation: { findMany } } as never);

    const result = await service.getArrivedCustomerAgeDistribution({ storeId: 6, startDate, endDate });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 6, OR: expect.any(Array) }),
      take: 20_000,
    }));
    expect(result).toEqual({
      arrivedCustomerCount: 3,
      knownAgeCount: 2,
      unknownAgeCount: 1,
      rows: [
        { ageGroup: '24岁及以下', count: 1, share: 1 / 3 },
        { ageGroup: '25-34岁', count: 1, share: 1 / 3 },
      ],
    });
  });

  it('matches uppercase VIP questions and returns the real total with a bounded list', async () => {
    const service = new BrainCustomerFactResolverService({
      customer: {
        count: jest.fn().mockResolvedValue(581),
        findMany: jest.fn().mockResolvedValue([
          { name: '李女士', memberLevel: '钻石会员', totalSpent: 10000, lastVisitDate: null },
        ]),
      },
    } as never);

    await expect(service.answerCustomerFactQuestion({
      storeId: 6,
      message: '我们店里的 VIP 客户有多少个',
    })).resolves.toContain('共 581 人，展示前 1 人');
  });

  it('uses the governed high-value and inactivity thresholds without asking the user to configure them', async () => {
    const count = jest.fn().mockResolvedValue(12);
    const findMany = jest.fn().mockResolvedValue([
      { name: '李女士', memberLevel: '钻石会员', totalSpent: 12000, visitCount: 8, lastVisitDate: null },
    ]);
    const service = new BrainCustomerFactResolverService({ customer: { count, findMany } } as never);

    await expect(service.answerCustomerFactQuestion({
      storeId: 6,
      message: '哪些客户是高价值但最近不太活跃的',
    })).resolves.toContain('累计消费不少于 5000 元，且近 30 天未到店');

    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({ storeId: 6, totalSpent: { gte: 5000 } }),
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
  });

  it('compares the recent 30 days with the previous 30 days for declining customer consumption', async () => {
    const now = Date.now();
    const previousDate = new Date(now - 40 * 24 * 60 * 60 * 1000);
    const currentDate = new Date(now - 5 * 24 * 60 * 60 * 1000);
    const customer = { name: '王女士', memberLevel: '金卡', totalSpent: 8000, lastVisitDate: currentDate };
    const findMany = jest.fn().mockResolvedValue([
      { customerId: 1, createdAt: previousDate, netAmount: 300, customer },
      { customerId: 1, createdAt: previousDate, netAmount: 400, customer },
      { customerId: 1, createdAt: previousDate, netAmount: 300, customer },
      { customerId: 1, createdAt: currentDate, netAmount: 400, customer },
    ]);
    const service = new BrainCustomerFactResolverService({ productOrder: { findMany } } as never);

    await expect(service.answerCustomerFactQuestion({
      storeId: 6,
      message: '哪些客户最近消费频率明显下降',
    })).resolves.toContain('前期 3 单，近期 1 单');
    await expect(service.answerCustomerFactQuestion({
      storeId: 6,
      message: '哪些客户最近消费明显减少',
    })).resolves.toContain('前期 1000.00 元，近期 400.00 元');

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 6, customerId: { not: null } }),
      take: 5000,
    }));
  });

  it('returns only cards expiring soon with a governed high remaining balance', async () => {
    const asOf = new Date('2026-07-18T00:00:00.000Z');
    const findMany = jest.fn().mockResolvedValue([
      { cardName: '抗衰 10 次卡', totalTimes: 10, remainingTimes: 6, recognizedUnitValue: 200, expiryDate: new Date('2026-07-25T00:00:00.000Z'), customer: { name: '李女士' } },
      { cardName: '补水 10 次卡', totalTimes: 10, remainingTimes: 1, recognizedUnitValue: 100, expiryDate: new Date('2026-07-22T00:00:00.000Z'), customer: { name: '王女士' } },
      { cardName: '修护 5 次卡', totalTimes: 5, remainingTimes: 2, recognizedUnitValue: 300, expiryDate: new Date('2026-08-01T00:00:00.000Z'), customer: { name: '赵女士' } },
    ]);
    const service = new BrainCustomerFactResolverService({ customerCard: { findMany } } as never);

    const result = await service.getExpiringHighBalanceCards({ storeId: 6, asOf, windowDays: 30, limit: 10 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'active',
        expiryDate: { gte: asOf, lte: new Date('2026-08-17T00:00:00.000Z') },
        customer: { storeId: 6, deletedAt: null },
      }),
    }));
    expect(result.total).toBe(2);
    expect(result.rows).toEqual([
      expect.objectContaining({ customerName: '李女士', remainingTimes: 6, remainingRate: 0.6, daysToExpiry: 7, unfulfilledValue: 1200 }),
      expect.objectContaining({ customerName: '赵女士', remainingTimes: 2, remainingRate: 0.4, daysToExpiry: 14, unfulfilledValue: 600 }),
    ]);
  });

  it('reuses the management customer monetary tiers for spending segmentation', async () => {
    const service = new BrainCustomerFactResolverService({
      customer: {
        count: jest.fn().mockResolvedValue(4),
        findMany: jest.fn().mockResolvedValue([
          { name: '甲', totalSpent: 52000, visitCount: 20, lastVisitDate: null },
          { name: '乙', totalSpent: 9000, visitCount: 8, lastVisitDate: null },
          { name: '丙', totalSpent: 3200, visitCount: 3, lastVisitDate: null },
          { name: '丁', totalSpent: 0, visitCount: 0, lastVisitDate: null },
        ]),
      },
    } as never);

    const answer = await service.answerCustomerFactQuestion({ storeId: 6, message: '帮我把客户按消费金额分一下层' });

    expect(answer).toContain('复用管理端客户画像 M 值阈值');
    expect(answer).toContain('M5 核心消费层');
    expect(answer).toContain('M0 未消费层');
  });

  it('finds discount-sensitive customers from real order discount facts', async () => {
    const service = new BrainCustomerFactResolverService({
      productOrder: {
        findMany: jest.fn().mockResolvedValue([
          { customerId: 1, totalAmount: 500, totalDiscountAmount: 100, createdAt: new Date(), customer: { name: '李女士', totalSpent: 5000, visitCount: 5, lastVisitDate: null } },
          { customerId: 1, totalAmount: 600, totalDiscountAmount: 80, createdAt: new Date(), customer: { name: '李女士', totalSpent: 5000, visitCount: 5, lastVisitDate: null } },
        ]),
      },
    } as never);

    await expect(service.answerCustomerFactQuestion({ storeId: 6, message: '有没有客户对优惠很敏感，老是等打折才来' }))
      .resolves.toContain('2 单中 2 单使用优惠');
  });

  it('uses project type semantics to find basic-project customers without an upgrade', async () => {
    const service = new BrainCustomerFactResolverService({
      project: {
        findMany: jest.fn().mockResolvedValue([
          { id: 72, name: '深层补水护理', type: { name: '基础面部护理' } },
          { id: 75, name: '亮肤淡斑管理', type: { name: '功效面部护理' } },
        ]),
      },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([
          { itemId: 72, name: '深层补水护理', createdAt: new Date(), order: { customerId: 1, customer: { name: '李女士', totalSpent: 3000, lastVisitDate: null } } },
          { itemId: 72, name: '深层补水护理', createdAt: new Date(), order: { customerId: 2, customer: { name: '王女士', totalSpent: 5000, lastVisitDate: null } } },
          { itemId: 75, name: '亮肤淡斑管理', createdAt: new Date(), order: { customerId: 2, customer: { name: '王女士', totalSpent: 5000, lastVisitDate: null } } },
        ]),
      },
    } as never);

    const answer = await service.answerCustomerFactQuestion({ storeId: 6, message: '帮我找一下只做过基础项目没有升单的客户' });

    expect(answer).toContain('李女士');
    expect(answer).not.toContain('王女士');
    expect(answer).toContain('ProjectType 名称含“基础”');
  });

  it('deduplicates active low-balance cards into treatment-renewal customers', async () => {
    const service = new BrainCustomerFactResolverService({
      customerCard: {
        findMany: jest.fn().mockResolvedValue([
          { customerId: 1, cardName: '补水 10 次卡', totalTimes: 10, remainingTimes: 1, expiryDate: new Date('2026-08-01T00:00:00.000Z'), customer: { name: '李女士', totalSpent: 6000, lastVisitDate: null } },
          { customerId: 1, cardName: '修护 5 次卡', totalTimes: 5, remainingTimes: 2, expiryDate: new Date('2026-08-02T00:00:00.000Z'), customer: { name: '李女士', totalSpent: 6000, lastVisitDate: null } },
          { customerId: 2, cardName: '抗衰 6 次卡', totalTimes: 6, remainingTimes: 2, expiryDate: new Date('2026-09-01T00:00:00.000Z'), customer: { name: '王女士', totalSpent: 8000, lastVisitDate: null } },
        ]),
      },
    } as never);

    const answer = await service.answerCustomerFactQuestion({ storeId: 6, message: '疗程快结束的客户有多少，适合推续购' });

    expect(answer).toContain('共 2 人');
    expect(answer.match(/李女士/g)).toHaveLength(1);
    expect(answer).toContain('仅生成候选，不自动触达');
  });
});
