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
});
