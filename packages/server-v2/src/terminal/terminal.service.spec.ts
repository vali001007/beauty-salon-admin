import { BadRequestException } from '@nestjs/common';
import { TerminalService } from './terminal.service.js';

describe('TerminalService automation', () => {
  let service: TerminalService;
  let prisma: jest.Mocked<any>;

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
    prisma = {
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
    };
    service = new TerminalService(prisma as any, {} as any, {} as any);
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
});
