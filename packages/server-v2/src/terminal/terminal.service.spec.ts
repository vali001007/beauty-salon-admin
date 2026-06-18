import { BadRequestException } from '@nestjs/common';
import { TerminalService } from './terminal.service.js';
import { TerminalDashboardCacheService } from './terminal-dashboard-cache.service.js';

describe('TerminalService automation', () => {
  let service: TerminalService;
  let prisma: jest.Mocked<any>;
  let commissionService: { recordAmiContribution: jest.Mock; calculateOrderCommissions: jest.Mock; getAmiDashboard: jest.Mock };
  let terminalDashboardCache: { getKey: jest.Mock; get: jest.Mock; set: jest.Mock; invalidate: jest.Mock };

  const baseDto = {
    draftId: 'draft-1',
    title: '低库存提醒',
    summary: '库存低于安全库存时提醒店长补货',
    sourceText: '库存低于安全库存时提醒店长补货',
    trigger: '库存低于系统安全库存',
    audience: '门店库存商品',
    action: '给店长生成补货提醒',
    frequencyCap: '同一商品每天最多提醒 1 次',
    riskLevel: 'low' as const,
    requiresApproval: false,
    missingFields: [],
  };

  beforeEach(() => {
    commissionService = {
      recordAmiContribution: jest.fn(),
      calculateOrderCommissions: jest.fn().mockResolvedValue([]),
      getAmiDashboard: jest.fn().mockResolvedValue({ revenueGenerated: 0, totalFee: 0, roi: 0, recordCount: 0 }),
    };
    terminalDashboardCache = {
      getKey: jest.fn((parts: Array<string | number | undefined | null>) => parts.join(':')),
      get: jest.fn(),
      set: jest.fn(),
      invalidate: jest.fn(),
    };
    prisma = {
      store: {
        findUnique: jest.fn(),
      },
      marketingAutomationStrategy: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      marketingAutomationExecution: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      marketingAutomationTouch: {
        createMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      customerCard: {
        findMany: jest.fn(),
      },
      reservation: {
        findMany: jest.fn(),
      },
      customer: {
        findMany: jest.fn(),
      },
      serviceTask: {
        findMany: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
      },
      terminalConversation: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new TerminalService(prisma as any, {} as any, {} as any, commissionService as any, terminalDashboardCache as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the six P0 terminal automation templates', () => {
    const templates = service.getTerminalAutomationTemplates();

    expect(templates).toHaveLength(6);
    expect(templates.map((item) => item.title)).toEqual([
      '预约前提醒',
      '迟到提醒',
      '护理周期回访',
      '次卡剩余/到期提醒',
      '低库存提醒',
      '每日收工报告',
    ]);
  });

  it('returns only customers with usable cards in card verification context', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 1, name: 'Ami 全量演示门店' });
    prisma.reservation.findMany.mockResolvedValue([
      {
        customerId: 12,
        date: new Date('2026-06-11T00:00:00.000Z'),
        startTime: '10:30',
        customer: {
          id: 12,
          name: '王语嫣',
          phone: '13822495463',
          gender: '女',
          memberLevel: '银卡会员',
          source: 'terminal',
          totalSpent: 3600,
          visitCount: 8,
          lastVisitDate: new Date('2026-06-03T00:00:00.000Z'),
          skinCondition: '',
          tags: [],
          balanceAccounts: [],
          customerCards: [{ id: 467 }],
        },
        project: { name: '眼周紧致护理' },
      },
    ]);
    prisma.customer.findMany.mockResolvedValue([
      {
        id: 10,
        name: '无卡客户',
        phone: '13800000000',
        gender: '女',
        memberLevel: '普通会员',
        source: 'terminal',
        totalSpent: 1000,
        visitCount: 3,
        lastVisitDate: new Date('2026-06-01T00:00:00.000Z'),
        skinCondition: '',
        tags: [],
        balanceAccounts: [],
        customerCards: [],
      },
      {
        id: 11,
        name: '李伟明',
        phone: '15895260608',
        gender: '男',
        memberLevel: '银卡会员',
        source: 'terminal',
        totalSpent: 7702,
        visitCount: 29,
        lastVisitDate: new Date('2026-06-02T00:00:00.000Z'),
        skinCondition: 'T区出油，毛孔粗大',
        tags: ['VIP'],
        balanceAccounts: [],
        customerCards: [{ id: 466 }],
      },
    ]);

    const result = await service.getCardVerificationContext(1, '李');

    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerCards: { some: { status: 'active', remainingTimes: { gt: 0 } } },
        }),
      }),
    );
    expect(prisma.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customer: expect.objectContaining({
            customerCards: { some: { status: 'active', remainingTimes: { gt: 0 } } },
            OR: [
              { name: { contains: '李', mode: 'insensitive' } },
              { phone: { contains: '李' } },
            ],
          }),
        }),
      }),
    );
    expect(result.customers).toHaveLength(1);
    expect(result.customers[0]).toMatchObject({
      id: 11,
      name: '李伟明',
      activeCustomerCardsCount: 1,
    });
  });

  it('returns actionable customer growth recommendations instead of generic wake-up copy', async () => {
    prisma.predictionRun = {
      findFirst: jest.fn().mockResolvedValue({ id: 66, storeId: 1, status: 'completed' }),
    };
    prisma.customerPredictionSnapshot = {
      findMany: jest.fn().mockResolvedValue([
        {
          customer: {
            id: 101,
            name: '周梦瑶',
            phone: '13800000001',
            lastVisitDate: new Date('2026-03-01T00:00:00.000Z'),
            totalSpent: 8800,
            memberLevel: '银卡会员',
            visitCount: 12,
            tags: ['敏感修护'],
            source: '会员转介绍',
          },
          churnScore: 75,
          churnLevel: '极高',
          repurchase30dScore: 21,
          marketingResponseScore: 34,
          ltvTier: '青铜',
          recommendedActionsJson: [],
          featureJson: {},
        },
        {
          customer: {
            id: 102,
            name: '陈若兰',
            phone: '13800000002',
            lastVisitDate: new Date('2026-06-01T00:00:00.000Z'),
            totalSpent: 4200,
            memberLevel: '金卡会员',
            visitCount: 8,
            tags: ['补水'],
            source: '活动到店',
          },
          churnScore: 20,
          churnLevel: '低',
          repurchase30dScore: 68,
          marketingResponseScore: 52,
          ltvTier: '白银',
          recommendedActionsJson: [],
          featureJson: {},
        },
      ]),
    };

    const result = await service.getGrowthCandidates(1, 2);

    expect(result[0].reason).toContain('专属顾问电话/企微邀约回店');
    expect(result[0].reason).toContain('老客回归护理礼');
    expect(result[0].reason).toContain('7 天内预约有效');
    expect(result[0].reason).not.toContain('建议顾问优先唤醒');
    expect(result[1].reason).toContain('同系列护理邀约');
    expect(result[1].reason).toContain('次卡/套餐权益');
  });

  it('auto-enables low-risk terminal automation drafts', async () => {
    prisma.marketingAutomationStrategy.findFirst.mockResolvedValue(null);
    prisma.marketingAutomationStrategy.create.mockImplementation(async ({ data }: any) => ({
      id: 1,
      ...data,
      createdAt: new Date('2026-06-03T10:00:00.000Z'),
      updatedAt: new Date('2026-06-03T10:00:00.000Z'),
      lastExecutedAt: null,
    }));

    const result = await service.createTerminalAutomationStrategy(1, 9, baseDto);

    expect(prisma.marketingAutomationStrategy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'enabled',
        actions: [
          expect.objectContaining({
            type: 'staff_task',
            meta: expect.objectContaining({ riskLevel: 'low', requiresApproval: false }),
          }),
        ],
      }),
    });
    expect(result.status).toBe('enabled');
    expect(result.requiresApproval).toBe(false);
  });

  it('forces risky terminal automation drafts into approval', async () => {
    prisma.marketingAutomationStrategy.findFirst.mockResolvedValue(null);
    prisma.marketingAutomationStrategy.create.mockImplementation(async ({ data }: any) => ({
      id: 2,
      ...data,
      createdAt: new Date('2026-06-03T10:00:00.000Z'),
      updatedAt: new Date('2026-06-03T10:00:00.000Z'),
      lastExecutedAt: null,
    }));

    const result = await service.createTerminalAutomationStrategy(1, 9, {
      ...baseDto,
      title: '自动扣次提醒',
      sourceText: '顾客到店后自动扣次并收款',
      action: '自动扣次并创建收款订单',
    });

    expect(prisma.marketingAutomationStrategy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'draft',
        actions: [
          expect.objectContaining({
            type: 'approval',
            meta: expect.objectContaining({ riskLevel: 'high', requiresApproval: true }),
          }),
        ],
      }),
    });
    expect(result.status).toBe('draft');
    expect(result.riskLevel).toBe('high');
    expect(result.requiresApproval).toBe(true);
  });

  it('normalizes spoken daily time into scheduler time', async () => {
    prisma.marketingAutomationStrategy.findFirst.mockResolvedValue(null);
    prisma.marketingAutomationStrategy.create.mockImplementation(async ({ data }: any) => ({
      id: 6,
      ...data,
      createdAt: new Date('2026-06-03T10:00:00.000Z'),
      updatedAt: new Date('2026-06-03T10:00:00.000Z'),
      lastExecutedAt: null,
    }));

    await service.createTerminalAutomationStrategy(1, 9, {
      ...baseDto,
      title: '每日收工报告',
      sourceText: '每天晚上九点半提醒我看未收款订单',
      trigger: '每天晚上九点半',
      audience: '当前门店今日经营数据',
      action: '生成店长提醒卡片',
    });

    expect(prisma.marketingAutomationStrategy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        schedule: expect.objectContaining({ type: 'daily', time: '21:30' }),
      }),
    });
  });

  it('rejects run-once for non-enabled strategies', async () => {
    prisma.marketingAutomationStrategy.findFirst.mockResolvedValue({
      id: 3,
      name: '待确认自动化',
      status: 'draft',
      description: '待确认\n\n[terminal:1] [draft:draft-1] [source:aura-lite]',
      schedule: { type: 'daily', time: '21:30', label: '每天 21:30' },
      triggerRules: [],
      actions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastExecutedAt: null,
    });

    await expect(service.runTerminalAutomationOnce(1, 3)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.marketingAutomationExecution.create).not.toHaveBeenCalled();
  });

  it('creates customer touches when executing card reminder automation', async () => {
    const strategy = {
      id: 4,
      name: '次卡剩余/到期提醒',
      status: 'enabled',
      description: '次卡提醒\n\n[terminal:1] [draft:draft-card] [source:aura-lite]',
      schedule: { type: 'daily', time: '10:00', label: '次卡剩余 1 次，或 30 天内到期' },
      triggerRules: [
        {
          type: 'terminal_automation',
          params: {
            trigger: '次卡剩余 1 次，或 30 天内到期',
            audience: '持有有效次卡的顾客',
            frequencyCap: '同一卡项 14 天内最多提醒 1 次',
            riskLevel: 'medium',
            requiresApproval: false,
          },
        },
      ],
      actions: [
        {
          type: 'staff_task',
          value: '生成前台跟进任务，并推荐续卡/使用提醒话术',
          channel: 'terminal',
          contentTemplate: '生成前台跟进任务，并推荐续卡/使用提醒话术',
          meta: {
            trigger: '次卡剩余 1 次，或 30 天内到期',
            audience: '持有有效次卡的顾客',
            frequencyCap: '同一卡项 14 天内最多提醒 1 次',
            riskLevel: 'medium',
            requiresApproval: false,
          },
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastExecutedAt: null,
    };
    prisma.marketingAutomationStrategy.findFirst.mockResolvedValue(strategy);
    prisma.customerCard.count = jest.fn().mockResolvedValue(2);
    prisma.customerCard.findMany.mockResolvedValue([{ customerId: 10 }, { customerId: 11 }, { customerId: 10 }]);
    prisma.marketingAutomationTouch.findMany.mockResolvedValue([]);
    prisma.marketingAutomationExecution.create.mockResolvedValue({
      id: 20,
      strategyId: 4,
      strategyName: strategy.name,
      status: 'success',
      triggeredCount: 2,
      reachedCount: 0,
      channel: 'terminal',
      message: '次卡剩余/到期提醒 已到达触发时间，命中 2 个对象。动作：生成前台跟进任务，并推荐续卡/使用提醒话术',
    });
    prisma.marketingAutomationExecution.update.mockResolvedValue({
      id: 20,
      strategyId: 4,
      strategyName: strategy.name,
      status: 'success',
      triggeredCount: 2,
      reachedCount: 2,
      channel: 'terminal',
    });
    prisma.marketingAutomationStrategy.update.mockResolvedValue(strategy);

    const result = await service.runTerminalAutomationOnce(1, 4);

    expect(prisma.marketingAutomationTouch.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ executionId: 20, strategyId: 4, customerId: 10, channel: 'terminal' }),
        expect.objectContaining({ executionId: 20, strategyId: 4, customerId: 11, channel: 'terminal' }),
      ],
      skipDuplicates: true,
    });
    expect(result.reachedCount).toBe(2);
  });

  it('skips customers touched within the strategy frequency window', async () => {
    const strategy = {
      id: 5,
      name: '次卡剩余/到期提醒',
      status: 'enabled',
      description: '次卡提醒\n\n[terminal:1] [draft:draft-card] [source:aura-lite]',
      schedule: { type: 'daily', time: '10:00', label: '次卡剩余 1 次，或 30 天内到期' },
      triggerRules: [
        {
          type: 'terminal_automation',
          params: {
            trigger: '次卡剩余 1 次，或 30 天内到期',
            audience: '持有有效次卡的顾客',
            frequencyCap: '同一卡项 14 天内最多提醒 1 次',
            riskLevel: 'medium',
            requiresApproval: false,
          },
        },
      ],
      actions: [
        {
          type: 'staff_task',
          value: '生成前台跟进任务，并推荐续卡/使用提醒话术',
          channel: 'terminal',
          contentTemplate: '生成前台跟进任务，并推荐续卡/使用提醒话术',
          meta: {
            trigger: '次卡剩余 1 次，或 30 天内到期',
            audience: '持有有效次卡的顾客',
            frequencyCap: '同一卡项 14 天内最多提醒 1 次',
            riskLevel: 'medium',
            requiresApproval: false,
          },
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastExecutedAt: null,
    };
    prisma.marketingAutomationStrategy.findFirst.mockResolvedValue(strategy);
    prisma.customerCard.count = jest.fn().mockResolvedValue(2);
    prisma.customerCard.findMany.mockResolvedValue([{ customerId: 10 }, { customerId: 11 }]);
    prisma.marketingAutomationTouch.findMany.mockResolvedValue([{ customerId: 10 }]);
    prisma.marketingAutomationExecution.create.mockResolvedValue({
      id: 21,
      strategyId: 5,
      strategyName: strategy.name,
      status: 'success',
      triggeredCount: 2,
      reachedCount: 0,
      channel: 'terminal',
      message: '次卡剩余/到期提醒 已到达触发时间，命中 2 个对象。',
    });
    prisma.marketingAutomationExecution.update.mockResolvedValue({
      id: 21,
      strategyId: 5,
      strategyName: strategy.name,
      status: 'success',
      triggeredCount: 2,
      reachedCount: 1,
      channel: 'terminal',
    });
    prisma.marketingAutomationStrategy.update.mockResolvedValue(strategy);

    const result = await service.runTerminalAutomationOnce(1, 5);

    expect(prisma.marketingAutomationTouch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          strategyId: 5,
          customerId: { in: [10, 11] },
        }),
      }),
    );
    expect(prisma.marketingAutomationTouch.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ customerId: 11 })],
      skipDuplicates: true,
    });
    expect(result.reachedCount).toBe(1);
  });

  it('only creates reservation reminder touches inside the configured pre-appointment window', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-03T08:00:00.000'));
    const strategy = {
      id: 8,
      name: '预约前提醒',
      status: 'enabled',
      description: '预约前提醒\n\n[terminal:1] [draft:draft-reservation] [source:aura-lite]',
      schedule: { type: 'event', event: 'reservation', offset: '预约前 2 小时', label: '预约前 2 小时' },
      triggerRules: [
        {
          type: 'terminal_automation',
          params: {
            storeId: 1,
            trigger: '预约前 2 小时',
            audience: '今日已确认预约顾客',
            frequencyCap: '同一顾客 1 天内最多提醒 1 次',
            riskLevel: 'medium',
            requiresApproval: false,
          },
        },
      ],
      actions: [
        {
          type: 'staff_task',
          value: '生成前台确认到店提醒',
          channel: 'terminal',
          contentTemplate: '生成前台确认到店提醒',
          meta: {
            storeId: 1,
            trigger: '预约前 2 小时',
            audience: '今日已确认预约顾客',
            frequencyCap: '同一顾客 1 天内最多提醒 1 次',
            riskLevel: 'medium',
            requiresApproval: false,
          },
        },
      ],
      createdAt: new Date('2026-06-02T10:00:00.000'),
      updatedAt: new Date('2026-06-02T10:00:00.000'),
      lastExecutedAt: new Date('2026-06-03T07:30:00.000'),
    };
    const reservationDate = new Date('2026-06-03T00:00:00.000');
    prisma.marketingAutomationStrategy.findMany = jest.fn().mockResolvedValue([strategy]);
    prisma.reservation.findMany
      .mockResolvedValueOnce([
        { date: reservationDate, startTime: '10:00' },
        { date: reservationDate, startTime: '12:00' },
      ])
      .mockResolvedValueOnce([
        { customerId: 101, date: reservationDate, startTime: '10:00' },
        { customerId: 102, date: reservationDate, startTime: '12:00' },
      ]);
    prisma.marketingAutomationTouch.findMany.mockResolvedValue([]);
    prisma.marketingAutomationExecution.create.mockImplementation(async ({ data }: any) => ({
      id: 32,
      ...data,
    }));
    prisma.marketingAutomationExecution.update.mockImplementation(async ({ data }: any) => ({
      id: 32,
      strategyId: 8,
      strategyName: strategy.name,
      status: 'success',
      triggeredCount: 1,
      reachedCount: data.reachedCount,
      channel: 'terminal',
    }));
    prisma.marketingAutomationStrategy.update.mockResolvedValue(strategy);

    const result = await service.runDueTerminalAutomations(1);

    expect(prisma.marketingAutomationExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        strategyId: 8,
        triggeredCount: 1,
      }),
    });
    expect(prisma.marketingAutomationTouch.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ executionId: 32, strategyId: 8, customerId: 101, channel: 'terminal' })],
      skipDuplicates: true,
    });
    expect(result.executedCount).toBe(1);
  });

  it('returns terminal execution detail with touched customers', async () => {
    prisma.marketingAutomationExecution.findFirst.mockResolvedValue({
      id: 30,
      strategyId: 4,
      strategyName: '次卡剩余/到期提醒',
      status: 'success',
      triggeredCount: 2,
      reachedCount: 2,
      channel: 'terminal',
      executedAt: new Date('2026-06-03T10:00:00.000Z'),
      message: '已生成前台跟进任务',
      strategy: {
        id: 4,
        name: '次卡剩余/到期提醒',
        description: '次卡提醒\n\n[terminal:1] [draft:draft-card] [source:aura-lite]',
        schedule: { type: 'daily', time: '10:00', label: '次卡剩余 1 次，或 30 天内到期' },
        triggerRules: [],
        actions: [
          {
            value: '生成前台跟进任务',
            meta: {
              trigger: '次卡剩余 1 次，或 30 天内到期',
              audience: '持有有效次卡的顾客',
              frequencyCap: '同一卡项 14 天内最多提醒 1 次',
              riskLevel: 'medium',
              requiresApproval: false,
            },
          },
        ],
      },
      touches: [
        {
          id: 1,
          customerId: 10,
          customer: { name: '王女士', phone: '13800000000' },
          predictionSnapshotId: null,
          predictedConversionScore: 0,
          predictedRevenue: 0,
          channel: 'terminal',
          status: 'reached',
          touchedAt: new Date('2026-06-03T10:00:00.000Z'),
          convertedAt: null,
          conversionType: null,
          actualRevenue: 0,
          attributionWindowDays: 30,
        },
      ],
    });

    const result = await service.getTerminalAutomationExecutionDetail(1, 30);

    expect(prisma.marketingAutomationExecution.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 30,
          strategy: { description: { contains: '[terminal:1]' } },
        },
      }),
    );
    expect(result.touches).toEqual([
      expect.objectContaining({
        customerId: 10,
        customerName: '王女士',
        customerPhone: '13800000000',
      }),
    ]);
  });

  it('marks terminal automation touch as followed up without changing reach status', async () => {
    prisma.marketingAutomationTouch.findFirst.mockResolvedValue({
      id: 1,
      customerId: 10,
      customer: { name: '王女士', phone: '13800000000' },
      status: 'reached',
      channel: 'terminal',
      touchedAt: new Date('2026-06-03T10:00:00.000Z'),
      predictedConversionScore: 0,
      predictedRevenue: 0,
      attributionWindowDays: 30,
    });
    prisma.marketingAutomationTouch.update.mockResolvedValue({
      id: 1,
      customerId: 10,
      customer: { name: '王女士', phone: '13800000000' },
      status: 'reached',
      channel: 'terminal',
      touchedAt: new Date('2026-06-03T10:00:00.000Z'),
      convertedAt: new Date('2026-06-03T11:00:00.000Z'),
      conversionType: 'terminal_followed_up',
      predictedConversionScore: 0,
      predictedRevenue: 0,
      attributionWindowDays: 30,
    });

    const result = await service.markTerminalAutomationTouchFollowedUp(1, 1);

    expect(prisma.marketingAutomationTouch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 1,
          execution: {
            strategy: { description: { contains: '[terminal:1]' } },
          },
        },
      }),
    );
    expect(prisma.marketingAutomationTouch.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ conversionType: 'terminal_followed_up' }),
      include: { customer: true },
    });
    expect(result.status).toBe('reached');
    expect(result.conversionType).toBe('terminal_followed_up');
  });

  it('records failed execution and continues due scan when one strategy fails', async () => {
    const strategy = {
      id: 7,
      name: '低库存提醒',
      status: 'enabled',
      description: '低库存提醒\n\n[terminal:1] [draft:draft-stock] [source:aura-lite]',
      schedule: { type: 'daily', time: '00:00', label: '每天 00:00' },
      triggerRules: [
        {
          type: 'terminal_automation',
          params: {
            storeId: 1,
            trigger: '每天 00:00',
            audience: '门店库存商品',
            frequencyCap: '同一商品每天最多提醒 1 次',
            riskLevel: 'low',
            requiresApproval: false,
          },
        },
      ],
      actions: [
        {
          type: 'staff_task',
          value: '提醒店长补货',
          channel: 'terminal',
          contentTemplate: '提醒店长补货',
          meta: {
            storeId: 1,
            trigger: '每天 00:00',
            audience: '门店库存商品',
            frequencyCap: '同一商品每天最多提醒 1 次',
            riskLevel: 'low',
            requiresApproval: false,
          },
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastExecutedAt: null,
    };
    prisma.marketingAutomationStrategy.findMany = jest.fn().mockResolvedValue([strategy]);
    prisma.product.findMany.mockRejectedValue(new Error('stock table unavailable'));
    prisma.marketingAutomationExecution.create.mockResolvedValue({
      id: 31,
      strategyId: 7,
      strategyName: strategy.name,
      status: 'failed',
      triggeredCount: 0,
      reachedCount: 0,
      channel: 'terminal',
      message: '自动化执行失败：stock table unavailable',
    });

    const result = await service.runDueTerminalAutomations(1);

    expect(prisma.marketingAutomationExecution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        strategyId: 7,
        status: 'failed',
        message: expect.stringContaining('stock table unavailable'),
      }),
    });
    expect(result.executedCount).toBe(1);
    expect(result.executions?.[0].status).toBe('failed');
  });

  it('records Ami cashier assist work minutes after terminal checkout', async () => {
    prisma.$transaction = jest.fn(async (callback: any) => callback(prisma));
    prisma.cashierShift = {
      findFirst: jest.fn().mockResolvedValue({ id: 9001 }),
    };
    prisma.store = {
      findUnique: jest.fn().mockResolvedValue({ id: 1, name: 'Store A' }),
    };
    prisma.customer = {
      findUnique: jest.fn().mockResolvedValue({ id: 10, name: 'Customer A', phone: '13800000000' }),
      update: jest.fn().mockResolvedValue({ id: 10 }),
    };
    prisma.project = {
      findMany: jest.fn().mockResolvedValue([{ id: 101, name: 'Hydration' }]),
    };
    prisma.projectBomItem = {
      findMany: jest.fn().mockResolvedValue([{ projectId: 101, productId: 301, standardQty: 2, unit: '支' }]),
    };
    prisma.product = {
      findFirst: jest.fn().mockResolvedValue({ id: 301, storeId: 1, currentStock: 10, unit: '支' }),
      update: jest.fn().mockResolvedValue({ id: 301 }),
    };
    prisma.stockMovement = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 901 }),
    };
    prisma.productOrder = {
      create: jest.fn().mockResolvedValue({
        id: 501,
        orderNo: 'PO501',
        customerId: 10,
        customerName: 'Customer A',
        storeId: 1,
        totalAmount: 200,
        payMethod: 'wechat',
        createdAt: new Date('2026-06-08T10:00:00.000Z'),
        updatedAt: new Date('2026-06-08T10:01:00.000Z'),
      }),
    };
    prisma.orderItem = {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([
        { id: 701, itemType: 'project', itemId: 101, subtotal: 200, beauticianId: 2 },
      ]),
    };
    prisma.paymentRecord = {
      create: jest.fn().mockResolvedValue({ id: 601, orderId: 501, method: 'wechat', amount: 200 }),
    };
    prisma.marketingAttribution = {
      findFirst: jest.fn().mockResolvedValue(null),
    };
    prisma.marketingAutomationTouch = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    prisma.consumptionRecord = {
      create: jest.fn().mockResolvedValue({ id: 801 }),
    };
    prisma.beautician = {
      findFirst: jest.fn().mockResolvedValue({ id: 2, levelId: 3 }),
    };

    const result = await service.checkout(
      1,
      {
        customerId: 10,
        customerName: 'Customer A',
        customerPhone: '13800000000',
        beauticianId: 2,
        payMethod: 'wechat',
        items: [{ itemId: 101, itemType: 'project', name: 'Hydration', quantity: 1, unitPrice: 200 }],
      } as any,
      99,
    );

    expect(result).toEqual(expect.objectContaining({ id: 501, orderNo: 'PO501', storeId: 1, totalAmount: 200 }));
    expect(prisma.customer.findUnique).not.toHaveBeenCalled();
    expect(prisma.orderItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          orderId: 501,
          itemType: 'project',
          itemId: 101,
          name: 'Hydration',
          quantity: 1,
          unitPrice: 200,
          subtotal: 200,
          beauticianId: 2,
        }),
      ],
    });
    expect(prisma.projectBomItem.findMany).toHaveBeenCalledWith({
      where: { projectId: { in: [101] } },
      select: { projectId: true, productId: true, standardQty: true, unit: true },
    });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 301 },
      data: { currentStock: { decrement: 2 } },
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 1,
        productId: 301,
        movementType: 'service_consume',
        quantity: -2,
        beforeStock: 10,
        afterStock: 8,
        sourceType: 'project_order',
        sourceId: 501,
        sourceNo: 'PO501',
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(prisma.cashierShift.findFirst).toHaveBeenCalledWith({
      where: { storeId: 1, deviceId: 99, status: 'open' },
      select: { id: true },
      orderBy: { startedAt: 'desc' },
    });
    expect(commissionService.recordAmiContribution).toHaveBeenCalledWith({
      storeId: 1,
      category: 'cashier_assist',
      triggerType: 'terminal_checkout',
      triggerId: 501,
      customerId: 10,
      orderId: 501,
      workMinutes: 2,
      metadata: { paymentMethod: 'wechat', itemCount: 1 },
    });
    expect(commissionService.calculateOrderCommissions).toHaveBeenCalledWith({
      storeId: 1,
      orderId: 501,
      beauticianId: 2,
      levelId: 3,
      isDesignated: false,
      items: [{ itemType: 'project', itemId: 101, beauticianId: 2, subtotal: 200, orderItemId: 701 }],
    });
    expect(terminalDashboardCache.invalidate).toHaveBeenCalledWith(1, ['role', 'manager', 'customer-growth', 'cashier-context']);
  });

  it('deducts product stock after terminal checkout with product items', async () => {
    prisma.$transaction = jest.fn(async (callback: any) => callback(prisma));
    prisma.cashierShift = {
      findFirst: jest.fn().mockResolvedValue({ id: 9001 }),
    };
    prisma.store = {
      findUnique: jest.fn().mockResolvedValue({ id: 1, name: 'Store A' }),
    };
    prisma.customer = {
      update: jest.fn().mockResolvedValue({ id: 10 }),
    };
    prisma.product = {
      findMany: jest.fn().mockResolvedValue([{ id: 301, name: '补水精华' }]),
      findFirst: jest.fn().mockResolvedValue({ id: 301, storeId: 1, currentStock: 10, unit: '支' }),
      update: jest.fn().mockResolvedValue({ id: 301 }),
    };
    prisma.stockMovement = {
      create: jest.fn().mockResolvedValue({ id: 901 }),
    };
    prisma.productOrder = {
      create: jest.fn().mockResolvedValue({
        id: 502,
        orderNo: 'PO502',
        customerId: 10,
        customerName: 'Customer A',
        storeId: 1,
        totalAmount: 120,
        payMethod: 'wechat',
        createdAt: new Date('2026-06-08T10:00:00.000Z'),
        updatedAt: new Date('2026-06-08T10:01:00.000Z'),
      }),
    };
    prisma.orderItem = {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([
        { id: 702, itemType: 'product', itemId: 301, subtotal: 120, beauticianId: 2 },
      ]),
    };
    prisma.paymentRecord = {
      create: jest.fn().mockResolvedValue({ id: 602, orderId: 502, method: 'wechat', amount: 120 }),
    };
    prisma.marketingAttribution = {
      findFirst: jest.fn().mockResolvedValue(null),
    };
    prisma.marketingAutomationTouch = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    prisma.consumptionRecord = {
      create: jest.fn().mockResolvedValue({ id: 802 }),
    };
    prisma.beautician = {
      findFirst: jest.fn().mockResolvedValue({ id: 2, levelId: 3 }),
    };

    await service.checkout(
      1,
      {
        customerId: 10,
        customerName: 'Customer A',
        customerPhone: '13800000000',
        beauticianId: 2,
        payMethod: 'wechat',
        items: [{ itemId: 301, itemType: 'product', name: '补水精华', quantity: 3, unitPrice: 40 }],
      } as any,
      99,
    );

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 301 },
      data: { currentStock: { decrement: 3 } },
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 1,
        productId: 301,
        movementType: 'sale_out',
        quantity: -3,
        beforeStock: 10,
        afterStock: 7,
        sourceType: 'product_order',
        sourceId: 502,
        sourceNo: 'PO502',
      }),
    });
    expect(terminalDashboardCache.invalidate).toHaveBeenCalledWith(1, ['role', 'manager', 'inventory-alerts']);
  });

  it('deducts project BOM stock after terminal card verification', async () => {
    prisma.$transaction = jest.fn(async (callback: any) => callback(prisma));
    prisma.customerCard = {
      findUnique: jest.fn().mockResolvedValue({
        id: 66,
        customerId: 10,
        cardName: '补水护理 10 次卡',
        totalTimes: 10,
        remainingTimes: 5,
        expiryDate: new Date('2026-12-31T00:00:00.000Z'),
        status: 'active',
        card: { totalTimes: 10, price: 2680, projects: [{ projectId: 101, projectName: '深层补水护理' }] },
        customer: { id: 10, name: '林若溪', storeId: 1 },
      }),
      update: jest.fn().mockResolvedValue({ id: 66, remainingTimes: 4 }),
    };
    prisma.project = {
      findUnique: jest.fn().mockResolvedValue({ id: 101, name: '深层补水护理' }),
    };
    prisma.cardUsageRecord = {
      create: jest.fn().mockResolvedValue({
        id: 88,
        customerId: 10,
        customerName: '林若溪',
        cardName: '补水护理 10 次卡',
        projectName: '深层补水护理',
        times: 1,
        remainingTimes: 4,
        verifiedAt: new Date('2026-06-08T10:00:00.000Z'),
      }),
    };
    prisma.projectBomItem = {
      findMany: jest.fn().mockResolvedValue([{ productId: 301, standardQty: 2 }]),
    };
    prisma.stockMovement = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 901 }),
    };
    prisma.product = {
      findFirst: jest.fn().mockResolvedValue({ id: 301, storeId: 1, currentStock: 10, unit: '支' }),
      update: jest.fn().mockResolvedValue({ id: 301 }),
    };

    const result = await service.consumeCard(
      {
        customerCardId: 66,
        customerId: 10,
        projectId: 101,
        times: 1,
      },
      99,
    );

    expect(result).toEqual(expect.objectContaining({ id: 88, remainingTimes: 4, projectName: '深层补水护理' }));
    expect(prisma.customerCard.update).toHaveBeenCalledWith({
      where: { id: 66 },
      data: { remainingTimes: 4 },
    });
    expect(prisma.projectBomItem.findMany).toHaveBeenCalledWith({
      where: { projectId: 101 },
      select: { productId: true, standardQty: true },
    });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 301 },
      data: { currentStock: { decrement: 2 } },
    });
    expect(prisma.stockMovement.create).toHaveBeenCalledWith({
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
    expect(terminalDashboardCache.invalidate).toHaveBeenCalledWith(1, ['role', 'manager', 'inventory-alerts']);
  });

  it('rejects terminal checkout when the device has no open cashier shift', async () => {
    prisma.store = {
      findUnique: jest.fn().mockResolvedValue({ id: 1, name: 'Store A', shiftRequired: true }),
    };
    prisma.cashierShift = {
      findFirst: jest.fn().mockResolvedValue(null),
    };

    await expect(
      service.checkout(
        1,
        {
          customerId: 10,
          beauticianId: 2,
          payMethod: 'wechat',
          items: [{ itemId: 101, itemType: 'project', name: 'Hydration', quantity: 1, unitPrice: 200 }],
        } as any,
        99,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.cashierShift.findFirst).toHaveBeenCalledWith({
      where: { storeId: 1, deviceId: 99, status: 'open' },
      select: { id: true },
      orderBy: { startedAt: 'desc' },
    });
    expect(commissionService.recordAmiContribution).not.toHaveBeenCalled();
  });

  it('skips cashier shift guard when the store disables cashier shifts', async () => {
    prisma.store = {
      findUnique: jest.fn().mockResolvedValue({ shiftRequired: false }),
    };
    prisma.cashierShift = {
      findFirst: jest.fn(),
    };

    await expect((service as any).ensureOpenCashierShift(1, 99)).resolves.toBeUndefined();

    expect(prisma.store.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      select: { shiftRequired: true },
    });
    expect(prisma.cashierShift.findFirst).not.toHaveBeenCalled();
  });

  it('adds Ami contribution KPIs to the manager dashboard', async () => {
    const cache = new TerminalDashboardCacheService();
    terminalDashboardCache = {
      getKey: jest.fn((parts: Array<string | number | undefined | null>) => parts.join(':')),
      get: jest.fn(),
      set: jest.fn(),
      invalidate: jest.fn(),
    };
    service = new TerminalService(prisma as any, {} as any, {} as any, commissionService as any, cache);
    (service as any).getManagerDashboardInsights = jest.fn().mockResolvedValue({ risks: [], suggestions: [] });
    prisma.store = {
      findUnique: jest.fn().mockResolvedValue({ id: 1, name: '静安旗舰店' }),
    };
    prisma.customer = {
      count: jest.fn().mockResolvedValueOnce(120).mockResolvedValueOnce(88),
      findMany: jest.fn().mockResolvedValue([]),
    };
    prisma.productOrder = {
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: 68000 }, _count: 36 }),
      findMany: jest.fn().mockResolvedValue([]),
    };
    prisma.reservation = {
      count: jest.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(9),
      findMany: jest.fn().mockResolvedValue([]),
    };
    prisma.product = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    prisma.beautician = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    prisma.schedule = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    commissionService.getAmiDashboard.mockResolvedValue({
      revenueGenerated: 12000,
      totalFee: 1800,
      roi: 6.67,
      recordCount: 8,
    });

    const result = await service.getManagerDashboard(1);

    expect(commissionService.getAmiDashboard).toHaveBeenCalledWith({ storeId: 1 });
    expect(result.kpis).toEqual(
      expect.arrayContaining([
        { label: 'Ami关联收入 / 费用', value: '￥12,000', hint: '费用 ￥1,800 · 8 条贡献记录' },
      ]),
    );
    expect(result.kpis).not.toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Ami ROI' })]));
  });

  it('serves repeated inventory alert dashboard calls from terminal dashboard cache', async () => {
    const cache = new TerminalDashboardCacheService();
    const scopedPrisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 10,
            name: '补水精华',
            sku: 'SKU-10',
            currentStock: 1,
            safetyStock: 5,
            unit: '瓶',
            status: '在售',
            category: { name: '护理耗材' },
            updatedAt: new Date('2026-06-07T10:00:00.000Z'),
          },
        ]),
      },
      stockBatch: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      store: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, name: '总店' }),
      },
      runWithQueryCounter: jest.fn(async (task: any) => ({ value: await task(), queryCount: 2 })),
    };
    const cachedService = new TerminalService(scopedPrisma as any, {} as any, {} as any, {} as any, cache);

    const first = await cachedService.getInventoryAlertsDashboard(1);
    const second = await cachedService.getInventoryAlertsDashboard(1);

    expect(first).toEqual(second);
    expect(scopedPrisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(scopedPrisma.stockBatch.findMany).toHaveBeenCalledTimes(1);
    expect(scopedPrisma.store.findUnique).toHaveBeenCalledTimes(1);
    expect(scopedPrisma.runWithQueryCounter).toHaveBeenCalledTimes(1);
  });

  it('builds terminal account options from current store management users', async () => {
    const store = { id: 6, name: 'Ami 全量演示门店', address: '', shiftRequired: true };
    const makeRole = (key: string, permissions: string[]) => ({ role: { key, permissions } });
    const users = [
      {
        id: 1,
        username: 'admin',
        name: '系统管理员',
        status: 'active',
        roles: [makeRole('super_admin', ['*'])],
        stores: [{ storeId: 6 }],
      },
      {
        id: 28,
        username: 'ami_demo_full_manager',
        name: '林店长',
        status: 'active',
        roles: [makeRole('ami_demo_full_manager', ['*'])],
        stores: [{ storeId: 6 }],
      },
      {
        id: 29,
        username: 'ami_demo_full_cashier',
        name: '许收银',
        status: 'active',
        roles: [makeRole('ami_demo_full_cashier', ['core:order:create', 'core:order:products', 'core:goods:cards'])],
        stores: [{ storeId: 6 }],
      },
      {
        id: 31,
        username: 'ami_demo_full_frontdesk',
        name: '陈前台',
        status: 'active',
        roles: [makeRole('ami_demo_full_cashier', ['core:order:create', 'core:order:products', 'core:goods:cards'])],
        stores: [{ storeId: 6 }],
      },
      {
        id: 32,
        username: 'ami_demo_full_beautician_01',
        name: '沈晴',
        status: 'active',
        roles: [makeRole('ami_demo_full_beautician', ['terminal:service:start', 'terminal:service:complete'])],
        stores: [{ storeId: 6 }],
      },
      {
        id: 99,
        username: 'no_terminal_access',
        name: '无终端权限',
        status: 'active',
        roles: [makeRole('report_viewer', ['core:dashboard:view'])],
        stores: [{ storeId: 6 }],
      },
    ];
    prisma.store = {
      findUnique: jest.fn().mockResolvedValue(store),
      findMany: jest.fn().mockResolvedValue([store]),
    };
    prisma.user = {
      findUnique: jest.fn().mockResolvedValue(users[0]),
      findMany: jest.fn().mockResolvedValue(users),
    };
    prisma.beautician = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.project = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.card = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.product = { findMany: jest.fn().mockResolvedValue([]) };

    const bootstrap = await service.getBootstrap(6, 1);

    expect(bootstrap.terminalUsers.map((user: any) => user.username)).toEqual([
      'admin',
      'ami_demo_full_manager',
      'ami_demo_full_cashier',
      'ami_demo_full_frontdesk',
      'ami_demo_full_beautician_01',
    ]);
    expect(bootstrap.terminalUsers.find((user: any) => user.username === 'ami_demo_full_cashier')?.availableRoles).toEqual(['reception']);
    expect(bootstrap.terminalUsers.find((user: any) => user.username === 'ami_demo_full_beautician_01')?.availableRoles).toEqual(['beautician']);
    expect(bootstrap.terminalUsers.find((user: any) => user.username === 'no_terminal_access')).toBeUndefined();

    const beauticianBootstrap = await service.getBootstrap(6, 1, undefined, 32);
    expect(beauticianBootstrap.currentUser).toEqual(expect.objectContaining({ id: 32, username: 'ami_demo_full_beautician_01' }));
    expect(beauticianBootstrap.currentRole).toBe('beautician');
  });

  it('saves terminal conversations by device, role and date', async () => {
    const savedRecord = {
      id: 101,
      deviceId: 'AURA-1001',
      storeId: 1,
      role: 'manager',
      operatorId: 9,
      date: new Date('2026-06-08T00:00:00.000Z'),
      messages: [
        { role: 'user', content: '今天经营怎么样', timestamp: 1780920000000, type: 'query' },
        { role: 'assistant', content: '今日预约 3 条。', timestamp: 1780920001000, type: 'ai' },
      ],
      messageCount: 2,
      createdAt: new Date('2026-06-08T10:00:00.000Z'),
      updatedAt: new Date('2026-06-08T10:01:00.000Z'),
      archivedAt: new Date('2026-06-08T10:01:00.000Z'),
    };
    prisma.terminalConversation.findFirst.mockResolvedValue(null);
    prisma.terminalConversation.create.mockResolvedValue(savedRecord);

    const result = await service.saveConversation(1, 'AURA-1001', 9, {
      role: 'manager',
      date: '2026-06-08',
      messages: [
        { role: 'user', content: ' 今天经营怎么样 ', timestamp: 1780920000000, type: 'query' },
        { role: 'assistant', content: '今日预约 3 条。', timestamp: 1780920001000, type: 'ai' },
        { role: 'assistant', content: '   ', timestamp: 1780920002000, type: 'ai' },
      ],
    });

    expect(prisma.terminalConversation.findFirst).toHaveBeenCalledWith({
      where: {
        deviceId: 'AURA-1001',
        role: 'manager',
        date: new Date('2026-06-08T00:00:00.000Z'),
        operatorId: 9,
      },
    });
    expect(prisma.terminalConversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        deviceId: 'AURA-1001',
        storeId: 1,
        role: 'manager',
        operatorId: 9,
        date: new Date('2026-06-08T00:00:00.000Z'),
        messages: [
          { role: 'user', content: '今天经营怎么样', timestamp: 1780920000000, type: 'query', title: undefined },
          { role: 'assistant', content: '今日预约 3 条。', timestamp: 1780920001000, type: 'ai', title: undefined },
        ],
        messageCount: 2,
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 101,
        deviceId: 'AURA-1001',
        storeId: 1,
        role: 'manager',
        date: '2026-06-08',
        messageCount: 2,
      }),
    );
  });

  it('queries terminal conversation history within the current device and date range', async () => {
    const record = {
      id: 102,
      deviceId: 'AURA-1001',
      storeId: 1,
      role: 'reception',
      operatorId: null,
      date: new Date('2026-06-07T00:00:00.000Z'),
      messages: [{ role: 'user', content: '查客户张三', timestamp: 1780830000000, type: 'query' }],
      messageCount: 1,
      createdAt: new Date('2026-06-07T09:00:00.000Z'),
      updatedAt: new Date('2026-06-07T09:00:00.000Z'),
      archivedAt: new Date('2026-06-07T23:59:00.000Z'),
    };
    prisma.terminalConversation.findMany.mockResolvedValue([record]);
    prisma.terminalConversation.count.mockResolvedValue(1);

    const result = await service.getConversationHistory(1, 'AURA-1001', {
      page: 2,
      pageSize: 10,
      days: 7,
      endDate: '2026-06-08',
      role: 'reception',
    } as any);

    expect(prisma.terminalConversation.findMany).toHaveBeenCalledWith({
      where: {
        storeId: 1,
        deviceId: 'AURA-1001',
        role: 'reception',
        date: {
          gte: new Date('2026-06-01T00:00:00.000Z'),
          lte: new Date('2026-06-08T00:00:00.000Z'),
        },
      },
      orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }],
      skip: 10,
      take: 10,
    });
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: 102,
          deviceId: 'AURA-1001',
          role: 'reception',
          date: '2026-06-07',
          messageCount: 1,
        }),
      ],
      data: [
        expect.objectContaining({
          id: 102,
          deviceId: 'AURA-1001',
          role: 'reception',
          date: '2026-06-07',
          messageCount: 1,
        }),
      ],
      total: 1,
      page: 2,
      pageSize: 10,
    });
  });

  it('loads and deletes conversation details only in the current device scope', async () => {
    const record = {
      id: 103,
      deviceId: 'AURA-1001',
      storeId: 1,
      role: 'beautician',
      operatorId: 12,
      date: new Date('2026-06-06T00:00:00.000Z'),
      messages: [{ role: 'assistant', content: '护理建议', timestamp: 1780740000000, type: 'ai' }],
      messageCount: 1,
      createdAt: new Date('2026-06-06T09:00:00.000Z'),
      updatedAt: new Date('2026-06-06T09:30:00.000Z'),
      archivedAt: new Date('2026-06-06T09:30:00.000Z'),
    };
    prisma.terminalConversation.findFirst.mockResolvedValue(record);
    prisma.terminalConversation.delete.mockResolvedValue(record);

    const detail = await service.getConversationDetail(1, 'AURA-1001', 103);
    const deleted = await service.deleteConversation(1, 'AURA-1001', 103);

    expect(prisma.terminalConversation.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 103, storeId: 1, deviceId: 'AURA-1001' },
    });
    expect(prisma.terminalConversation.findFirst).toHaveBeenNthCalledWith(2, {
      where: { id: 103, storeId: 1, deviceId: 'AURA-1001' },
    });
    expect(prisma.terminalConversation.delete).toHaveBeenCalledWith({ where: { id: 103 } });
    expect(detail).toEqual(expect.objectContaining({ id: 103, role: 'beautician', date: '2026-06-06' }));
    expect(deleted).toEqual({ success: true, id: 103 });
  });

  it('deletes terminal conversations as admin within the requested store scope', async () => {
    const record = {
      id: 104,
      deviceId: 'AURA-1002',
      storeId: 2,
      role: 'manager',
      operatorId: 12,
      date: new Date('2026-06-07T00:00:00.000Z'),
      messages: [{ role: 'user', content: '查看昨天经营', timestamp: 1780826400000, type: 'query' }],
      messageCount: 1,
      createdAt: new Date('2026-06-07T09:00:00.000Z'),
      updatedAt: new Date('2026-06-07T09:30:00.000Z'),
      archivedAt: new Date('2026-06-07T09:30:00.000Z'),
    };
    prisma.terminalConversation.findFirst.mockResolvedValue(record);
    prisma.terminalConversation.delete.mockResolvedValue(record);

    const deleted = await service.deleteConversationAsAdmin(104, 2);

    expect(prisma.terminalConversation.findFirst).toHaveBeenCalledWith({
      where: { id: 104, storeId: 2 },
    });
    expect(prisma.terminalConversation.delete).toHaveBeenCalledWith({ where: { id: 104 } });
    expect(deleted).toEqual({ success: true, id: 104 });
  });
});
