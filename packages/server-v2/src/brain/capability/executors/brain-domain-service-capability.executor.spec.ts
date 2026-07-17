import { BrainTimeRangeParserService } from '../../cognition/brain-time-range-parser.service.js';
import type { BrainCapabilityCard } from '../brain-capability.types.js';
import { BrainDomainServiceCapabilityExecutor } from './brain-domain-service-capability.executor.js';

describe('BrainDomainServiceCapabilityExecutor store operations', () => {
  it('generates a read-only marketing draft without requiring a concrete recipient', async () => {
    const skillRuntime = {
      draftAppointmentReminder: jest.fn().mockReturnValue('您好，店里明天下午有可预约空档，方便的话可以回复我帮您安排。'),
      draftCustomerRecall: jest.fn(),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      {} as never,
      new BrainTimeRangeParserService(),
    );

    const result = await executor.execute({
      card: { ...storeCard(), key: 'marketing_message_draft', intents: ['draft'] },
      context: {
        userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['marketing'], permissions: ['*'],
        deniedPermissions: [], requestId: 'marketing-draft-test', timezone: 'Asia/Shanghai',
      },
      runId: 9,
      question: '为明天下午空档写一条温和邀约消息',
      answerShape: 'draft',
      args: {
        objective: '生成预约邀约文案', entities: [], metrics: [], dimensions: [], filters: [], orderBy: [],
      },
    });

    expect(skillRuntime.draftAppointmentReminder).toHaveBeenCalledWith({ timeWindow: '明天下午' });
    expect(result).toMatchObject({
      status: 'completed',
      grounding: 'template_skill',
      metadata: { capabilityKey: 'marketing_message_draft', deliveryStatus: 'draft_only' },
    });
    expect(result.blocks).toEqual([expect.objectContaining({ kind: 'limitations' })]);
    expect(result.suggestedActions).toBeUndefined();
  });

  it('uses the recall template only when the user actually asks for recall', async () => {
    const skillRuntime = {
      draftAppointmentReminder: jest.fn(),
      draftCustomerRecall: jest.fn().mockReturnValue('您好，最近护理节奏可以衔接起来了。'),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      {} as never,
      new BrainTimeRangeParserService(),
    );

    const result = await executor.execute({
      card: { ...storeCard(), key: 'marketing_message_draft', intents: ['draft'] },
      context: {
        userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['marketing'], permissions: ['*'],
        deniedPermissions: [], requestId: 'marketing-recall-test', timezone: 'Asia/Shanghai',
      },
      runId: 10,
      question: '准备一段沉睡客户召回文案',
      answerShape: 'draft',
      args: {
        objective: '生成客户召回文案', entities: [], metrics: [], dimensions: [], filters: [], orderBy: [],
      },
    });

    expect(skillRuntime.draftCustomerRecall).toHaveBeenCalledWith({});
    expect(result.metadata).toMatchObject({ mode: 'customer_recall' });
  });

  it('answers the largest completed order without expanding into the full operations overview', async () => {
    const skillRuntime = {
      buildManagerOperationsAnalysis: jest.fn().mockResolvedValue(operations({
        largestOrder: { orderNo: 'O-99', amount: 688, customerName: '李女士' },
      })),
      buildReceptionOperationsSnapshot: jest.fn().mockResolvedValue(reception(0)),
      buildFinanceRiskSummary: jest.fn().mockResolvedValue(finance(0, 0)),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      {} as never,
      new BrainTimeRangeParserService(),
    );

    const result = await executor.execute({
      card: storeCard(),
      context: {
        userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'],
        deniedPermissions: [], requestId: 'largest-order-test', timezone: 'Asia/Shanghai',
      },
      runId: 8,
      question: '今天最大的一笔消费是多少',
      args: {
        objective: '查询最大单笔消费',
        time: { label: '今天', timezone: 'Asia/Shanghai', startDate: '2026-07-16', endDate: '2026-07-16' },
        entities: [], metrics: [], dimensions: [], filters: [], orderBy: [],
      },
    });

    expect(result.answer).toBe('今天最大一笔消费为 688.00 元，订单号 O-99，客户 李女士。');
    expect(result.blocks).toEqual([expect.objectContaining({
      kind: 'kpi',
      items: [{ label: '最大单笔消费', value: '688.00 元', hint: 'O-99' }],
    })]);
    expect(result.metadata).toMatchObject({ answerScope: 'largest_completed_order' });
  });

  it('answers the largest governed daily paid-amount gap without expanding the full overview', async () => {
    const skillRuntime = {
      buildManagerOperationsAnalysis: jest
        .fn()
        .mockResolvedValueOnce(operations({
          revenue: 1200,
          orderCount: 6,
          customerCount: 5,
          avgTransaction: 200,
          newCustomerCount: 2,
          dailyTrend: [
            { date: '2026-07-15', revenue: 400 },
            { date: '2026-07-16', revenue: 800 },
          ],
        }))
        .mockResolvedValueOnce(operations({
          revenue: 700,
          orderCount: 4,
          customerCount: 4,
          avgTransaction: 175,
          newCustomerCount: 1,
          dailyTrend: [
            { date: '2026-07-08', revenue: 500 },
            { date: '2026-07-09', revenue: 200 },
          ],
        })),
      buildReceptionOperationsSnapshot: jest
        .fn()
        .mockResolvedValueOnce(reception(8))
        .mockResolvedValueOnce(reception(5)),
      buildFinanceRiskSummary: jest
        .fn()
        .mockResolvedValueOnce(finance(120, 2))
        .mockResolvedValueOnce(finance(30, 1)),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      {} as never,
      new BrainTimeRangeParserService(),
    );

    const result = await executor.execute({
      card: storeCard(),
      context: {
        userId: 9,
        storeId: 6,
        visibleStoreIds: [6],
        roles: ['store_manager'],
        permissions: ['*'],
        deniedPermissions: [],
        requestId: 'comparison-test',
        timezone: 'Asia/Shanghai',
      },
      runId: 1,
      question: '本周跟上周比，哪天差距最大',
      args: {
        objective: '比较本周与上周经营情况',
        time: {
          label: '本周',
          timezone: 'Asia/Shanghai',
          startDate: '2026-07-15',
          endDate: '2026-07-16',
        },
        comparisonTarget: {
          type: 'time',
          timeRange: {
            label: '上周',
            timezone: 'Asia/Shanghai',
            startDate: '2026-07-08',
            endDate: '2026-07-09',
          },
        },
        entities: [],
        metrics: [],
        dimensions: [],
        filters: [],
        orderBy: [],
      },
    });

    expect(skillRuntime.buildManagerOperationsAnalysis).toHaveBeenNthCalledWith(2, {
      storeId: 6,
      startDate: new Date('2026-07-07T16:00:00.000Z'),
      endDate: new Date('2026-07-09T15:59:59.999Z'),
    });
    expect(result.metadata).toMatchObject({
      answerScope: 'largest_daily_paid_amount_gap',
      metricDefinitionKey: 'metric.paid_amount',
      comparisonRange: { current: '本周', previous: '上周' },
      completionCriteria: expect.arrayContaining(['comparison_loaded', 'daily_paid_amount_gap_ranked']),
    });
    expect(result.answer).toBe('本周对比上周，按实收金额比较，差距最大的是周四：2026-07-16实收 800.00 元，2026-07-09实收 200.00 元，差额 +600.00 元。');
    expect(result.blocks).toEqual([
      expect.objectContaining({
        kind: 'ranking',
        rows: [expect.objectContaining({ currentDate: '2026-07-16', delta: '+600.00 元' }), expect.anything()],
      }),
      expect.objectContaining({
        kind: 'limitations',
        items: ['问题未指定比较指标，本次按统一已发布实收指标 metric.paid_amount 进行逐日比较。'],
      }),
    ]);
  });

  it('uses generic customer analysis unless the semantic plan resolved a specific customer instance', async () => {
    const customerFacts = {
      answerCustomerQuestion: jest.fn().mockResolvedValue('沉睡客户名单'),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      {} as never,
      customerFacts as never,
      new BrainTimeRangeParserService(),
    );

    const result = await executor.execute({
      card: { ...storeCard(), key: 'customer_facts' },
      context: {
        userId: 9,
        storeId: 6,
        visibleStoreIds: [6],
        roles: ['store_manager'],
        permissions: ['core:brain:use', 'core:customer:view'],
        deniedPermissions: [],
        requestId: 'customer-segment-test',
        timezone: 'Asia/Shanghai',
      },
      runId: 2,
      question: '最近哪些老客好久没来了，帮我列一下',
      args: {
        objective: '列出沉睡老客',
        time: { label: '最近90天', timezone: 'Asia/Shanghai', startDate: '2026-04-18', endDate: '2026-07-16' },
        entities: [{ entityType: 'customer', mention: '老客' }],
        metrics: [],
        dimensions: [],
        filters: [],
        orderBy: [],
      },
    });

    expect(customerFacts.answerCustomerQuestion).toHaveBeenCalledWith(expect.objectContaining({
      storeId: 6,
      message: '最近哪些老客好久没来了，帮我列一下',
      specificCustomerMention: undefined,
    }));
    expect(result.answer).toBe('沉睡客户名单');
  });

  it('does not treat a governed customer segment key as a concrete customer identity', async () => {
    const customerFacts = { answerCustomerQuestion: jest.fn().mockResolvedValue('VIP 客户名单') };
    const executor = new BrainDomainServiceCapabilityExecutor(
      {} as never,
      customerFacts as never,
      new BrainTimeRangeParserService(),
    );

    await executor.execute({
      card: { ...storeCard(), key: 'customer_facts' },
      context: {
        userId: 9,
        storeId: 6,
        visibleStoreIds: [6],
        roles: ['store_manager'],
        permissions: ['core:brain:use', 'core:customer:view'],
        deniedPermissions: [],
        requestId: 'customer-segment-key-test',
        timezone: 'Asia/Shanghai',
      },
      runId: 5,
      question: '我们店里的 VIP 客户有多少个',
      args: {
        objective: '统计 VIP 客户',
        entities: [{ entityType: 'customer', entityKey: 'customer', mention: 'Customer', source: 'system' }],
        metrics: [],
        dimensions: [],
        filters: [],
        orderBy: [],
      },
    });

    expect(customerFacts.answerCustomerQuestion).toHaveBeenCalledWith(expect.objectContaining({
      specificCustomerMention: undefined,
    }));
  });

  it('returns structured clarification when an exact customer mention matches multiple records', async () => {
    const customerFacts = {
      answerCustomerQuestion: jest.fn().mockResolvedValue(
        '找到 2 位同名或尾号匹配客户：\n1. 胡静怡，手机 ***7636\n2. 胡静怡，手机 ***0522\n请补充完整姓名或手机号后四位后继续。',
      ),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      {} as never,
      customerFacts as never,
      new BrainTimeRangeParserService(),
    );

    const result = await executor.execute({
      card: { ...storeCard(), key: 'customer_facts' },
      context: {
        userId: 9,
        storeId: 6,
        visibleStoreIds: [6],
        roles: ['receptionist'],
        permissions: ['core:brain:use', 'core:customer:view'],
        deniedPermissions: [],
        requestId: 'customer-disambiguation-test',
        timezone: 'Asia/Shanghai',
      },
      runId: 3,
      question: '客户叫胡静怡',
      args: {
        objective: '查询胡静怡的最近消费和卡项',
        entities: [{ entityType: 'customer', mention: '胡静怡' }],
        metrics: [],
        dimensions: [],
        filters: [],
        orderBy: [],
      },
    });

    expect(result).toMatchObject({
      grounding: 'none',
      blocks: [{ kind: 'clarification' }],
      metadata: {
        clarification: { missingSlots: ['entity'] },
        completion: { status: 'partial', recoverable: true },
      },
    });
  });

  it('extracts the inherited name from a name-and-phone semantic mention', async () => {
    const customerFacts = { answerCustomerQuestion: jest.fn().mockResolvedValue('客户事实') };
    const executor = new BrainDomainServiceCapabilityExecutor(
      {} as never,
      customerFacts as never,
      new BrainTimeRangeParserService(),
    );

    await executor.execute({
      card: { ...storeCard(), key: 'customer_facts' },
      context: {
        userId: 9,
        storeId: 6,
        visibleStoreIds: [6],
        roles: ['receptionist'],
        permissions: ['core:brain:use', 'core:customer:view'],
        deniedPermissions: [],
        requestId: 'customer-name-phone-test',
        timezone: 'Asia/Shanghai',
      },
      runId: 4,
      question: '手机号后四位是7636',
      args: {
        objective: '查询胡静怡的消费和卡项',
        entities: [{ entityType: 'customer', mention: '胡静怡（手机号后四位7636）' }],
        metrics: [],
        dimensions: [],
        filters: [],
        orderBy: [],
      },
    });

    expect(customerFacts.answerCustomerQuestion).toHaveBeenCalledWith(expect.objectContaining({
      specificCustomerMention: '胡静怡',
    }));
  });

  it('returns a structured new-customer source ranking for the requested period', async () => {
    const customerFacts = {
      getNewCustomerSourceDistribution: jest.fn().mockResolvedValue({
        total: 4,
        missingSourceCount: 1,
        sourceRanking: [
          { source: '美团', count: 2, share: 0.5 },
          { source: '小红书', count: 1, share: 0.25 },
          { source: '未记录渠道', count: 1, share: 0.25 },
        ],
        weeklyRanking: [],
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      {} as never,
      customerFacts as never,
      new BrainTimeRangeParserService(),
    );

    const result = await executor.execute({
      card: { ...storeCard(), key: 'customer_facts' },
      context: {
        userId: 9,
        storeId: 6,
        visibleStoreIds: [6],
        roles: ['store_manager'],
        permissions: ['core:brain:use', 'core:customer:view'],
        deniedPermissions: [],
        requestId: 'customer-source-test',
        timezone: 'Asia/Shanghai',
      },
      runId: 3,
      question: '这个月新客主要来自什么渠道',
      args: {
        objective: '查看本月新客来源渠道排名',
        time: { label: '本月', timezone: 'Asia/Shanghai', startDate: '2026-07-01', endDate: '2026-07-31' },
        entities: [{ entityType: 'customer', mention: '新客' }],
        metrics: [],
        dimensions: [{ definitionKey: 'dimension.customerSource', mention: '渠道' }],
        filters: [],
        orderBy: [],
      },
    });

    expect(customerFacts.getNewCustomerSourceDistribution).toHaveBeenCalledWith({
      storeId: 6,
      startDate: new Date('2026-06-30T16:00:00.000Z'),
      endDate: new Date('2026-07-31T15:59:59.999Z'),
    });
    expect(result.answer).toContain('本月新客共 4 人');
    expect(result.answer).toContain('美团 2 人（50.0%）');
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'kpi',
        items: [
          { label: '新客总数', value: '4 人' },
          { label: '未记录渠道', value: '1 人' },
        ],
      }),
      expect.objectContaining({
        kind: 'ranking',
        columns: ['customerSource', 'newCustomerCount', 'share'],
        rows: [
          { customerSource: '美团', newCustomerCount: 2, share: '50.0%' },
          { customerSource: '小红书', newCustomerCount: 1, share: '25.0%' },
          { customerSource: '未记录渠道', newCustomerCount: 1, share: '25.0%' },
        ],
      }),
    ]));
    expect(result.metadata).toMatchObject({
      rangeLabel: '本月',
      totalNewCustomers: 4,
      newCustomerDefinition: 'Customer.createdAt within requested time range',
      sourceField: 'Customer.source',
    });
  });

  it('answers governed customer retention metrics without using the default today range', async () => {
    const customerFacts = {
      getCustomerRetentionSummary: jest.fn().mockResolvedValue({
        rangeLabel: '最近 180 天', activeCustomerCount: 40, repeatCustomerCount: 12,
        repurchaseRate: 0.3, repeatIntervalCount: 18, averageReturnIntervalDays: 28.5,
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor({} as never, customerFacts as never, new BrainTimeRangeParserService());
    const result = await executor.execute({
      card: { ...storeCard(), key: 'customer_facts', intents: ['query'] },
      context: { userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'], deniedPermissions: [], requestId: 'retention-test', timezone: 'Asia/Shanghai' },
      runId: 3,
      question: '我们的老客回头率大概是多少',
      answerShape: 'scalar',
      args: {
        objective: '查询客户复购率', entities: [], dimensions: [], filters: [], orderBy: [],
        metrics: [{ definitionType: 'metric', definitionKey: 'metric.repurchase_rate', definitionVersion: 1, definitionFingerprint: 'a'.repeat(64), sourceFingerprint: 'b'.repeat(64) }],
      },
    });

    expect(customerFacts.getCustomerRetentionSummary).toHaveBeenCalledWith({ storeId: 6, startDate: undefined, endDate: undefined });
    expect(result.answer).toContain('客户复购率 30.0%');
    expect(result.citations).toEqual(expect.arrayContaining([expect.objectContaining({ sourceId: 'metric.repurchase_rate@1' })]));
  });

  it('returns real customer-card usage facts for low-use card customers', async () => {
    const customerFacts = {
      getLowCardUsageCustomers: jest.fn().mockResolvedValue({
        total: 1,
        rows: [{ customerName: '李女士', cardName: '护理 10 次卡', totalTimes: 10, remainingTimes: 9, usedTimes: 1, usageRate: 0.1, totalSpent: 6800, lastVisitDate: null }],
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor({} as never, customerFacts as never, new BrainTimeRangeParserService());
    const result = await executor.execute({
      card: { ...storeCard(), key: 'customer_facts', intents: ['query'] },
      context: { userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'], deniedPermissions: [], requestId: 'low-card-use-test', timezone: 'Asia/Shanghai' },
      runId: 4,
      question: '哪些客户消费了钱但很少用次卡',
      args: { objective: '查询次卡低使用客户', entities: [], metrics: [], dimensions: [], filters: [], orderBy: [] },
    });

    expect(result.answer).toContain('李女士：护理 10 次卡，已用 1/10 次（10.0%）');
    expect(result.blocks?.[0]).toMatchObject({ kind: 'table', rows: [expect.objectContaining({ customerName: '李女士', usageRate: 0.1 })] });
  });

  it('returns a dedicated manager staff ranking and current availability view', async () => {
    const skillRuntime = {
      buildManagerStaffAnalysis: jest.fn().mockResolvedValue({
        staff: [
          {
            beauticianId: 1,
            name: '唐伊',
            serviceCount: 8,
            completedCount: 7,
            uniqueCustomerCount: 6,
            repeatCustomerCount: 2,
            revenueAmount: 3200,
            commissionAmount: 320,
            timeOffHours: 0,
          },
          {
            beauticianId: 2,
            name: '沈晴',
            serviceCount: 6,
            completedCount: 6,
            uniqueCustomerCount: 7,
            repeatCustomerCount: 1,
            revenueAmount: 2800,
            commissionAmount: 280,
            timeOffHours: 0,
          },
        ],
      }),
      buildReceptionOperationsSnapshot: jest.fn().mockResolvedValue(reception(3)),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      {} as never,
      new BrainTimeRangeParserService(),
    );

    const result = await executor.execute({
      card: {
        ...storeCard(),
        key: 'manager_staff_overview',
        name: '店长员工运营分析',
        intents: ['query', 'ranking', 'comparison', 'diagnosis'],
        definitionRefs: [
          {
            definitionId: 10,
            versionId: 60,
            definitionKey: 'metric.staff_unique_customer_count',
            version: 1,
            definitionFingerprint: 'b'.repeat(64),
            sourceFingerprint: 'c'.repeat(64),
          },
        ],
      },
      context: {
        userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'],
        deniedPermissions: [], requestId: 'manager-staff-test', timezone: 'Asia/Shanghai',
      },
      runId: 4,
      question: '哪个美容师接的客人最多',
      args: {
        objective: '员工接客排行',
        entities: [],
        metrics: [],
        dimensions: [],
        filters: [],
        orderBy: [
          {
            direction: 'desc',
            definitionRef: {
              definitionType: 'metric',
              definitionKey: 'metric.staff_unique_customer_count',
              definitionVersion: 1,
              definitionFingerprint: 'b'.repeat(64),
              sourceFingerprint: 'c'.repeat(64),
            },
          },
        ],
      },
    });

    expect(result.blocks).toEqual([
      expect.objectContaining({
        kind: 'ranking',
        columns: ['staff', 'uniqueCustomerCount'],
        rows: [
          expect.objectContaining({ staff: '沈晴', serviceCount: 6, uniqueCustomerCount: 7 }),
          expect.objectContaining({ staff: '唐伊', serviceCount: 8, uniqueCustomerCount: 6 }),
        ],
      }),
    ]);
    expect(result.answer).toBe('今天服务客户数最多的是 沈晴，共 7 位独立客户。');
    expect(result.metadata).toMatchObject({
      capabilityKey: 'manager_staff_overview',
      staffCount: 2,
      focusMetric: 'metric.staff_unique_customer_count',
    });
  });

  it('ranks staff by the requested commission metric instead of the generic service score', async () => {
    const skillRuntime = {
      buildManagerStaffAnalysis: jest.fn().mockResolvedValue({
        staff: [
          { beauticianId: 1, name: '唐伊', serviceCount: 8, completedCount: 8, uniqueCustomerCount: 6, repeatCustomerCount: 2, revenueAmount: 5000, commissionAmount: 320, timeOffHours: 0 },
          { beauticianId: 2, name: '沈晴', serviceCount: 4, completedCount: 4, uniqueCustomerCount: 4, repeatCustomerCount: 1, revenueAmount: 4000, commissionAmount: 560, timeOffHours: 0 },
        ],
      }),
      buildReceptionOperationsSnapshot: jest.fn().mockResolvedValue(reception(0)),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(skillRuntime as never, {} as never, new BrainTimeRangeParserService());
    const result = await executor.execute({
      card: { ...storeCard(), key: 'manager_staff_overview', intents: ['ranking'] },
      context: { userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'], deniedPermissions: [], requestId: 'commission-rank-test', timezone: 'Asia/Shanghai' },
      runId: 5,
      question: '这个月提成最高的是谁，大概多少',
      answerShape: 'ranking',
      args: {
        objective: '员工提成排行', entities: [], dimensions: [], filters: [],
        metrics: [{ definitionType: 'metric', definitionKey: 'metric.staff_commission_amount', definitionVersion: 1, definitionFingerprint: 'a'.repeat(64), sourceFingerprint: 'b'.repeat(64) }],
        orderBy: [],
      },
    });

    expect(result.answer).toContain('提成最高的是 沈晴，提成 560.00 元');
    expect(result.blocks?.[0]).toMatchObject({
      kind: 'ranking',
      columns: ['staff', 'commissionAmount'],
      rows: [expect.objectContaining({ staff: '沈晴', commissionAmount: 560 }), expect.objectContaining({ staff: '唐伊', commissionAmount: 320 })],
    });
  });

  it('fails closed when the requested staff complaint fact does not exist', async () => {
    const skillRuntime = {
      buildManagerStaffAnalysis: jest.fn(),
      buildReceptionOperationsSnapshot: jest.fn(),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(skillRuntime as never, {} as never, new BrainTimeRangeParserService());
    const result = await executor.execute({
      card: { ...storeCard(), key: 'manager_staff_overview', intents: ['ranking'] },
      context: { userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'], deniedPermissions: [], requestId: 'complaint-rank-test', timezone: 'Asia/Shanghai' },
      runId: 6,
      question: '哪个美容师的客诉最多，最近有没有',
      answerShape: 'ranking',
      args: { objective: '员工客诉排行', entities: [], metrics: [], dimensions: [], filters: [], orderBy: [] },
    });

    expect(result).toMatchObject({ grounding: 'none', citations: [], metadata: { unsupportedReason: 'staff_complaint_fact_not_available' } });
    expect(result.answer).toContain('不会用服务量、业绩或综合表现分替代客诉指标');
    expect(skillRuntime.buildManagerStaffAnalysis).not.toHaveBeenCalled();
  });

  it('fails closed when probation evaluation facts do not exist', async () => {
    const skillRuntime = {
      buildManagerStaffAnalysis: jest.fn(),
      buildReceptionOperationsSnapshot: jest.fn(),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(skillRuntime as never, {} as never, new BrainTimeRangeParserService());
    const result = await executor.execute({
      card: { ...storeCard(), key: 'manager_staff_overview', intents: ['diagnosis'] },
      context: { userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'], deniedPermissions: [], requestId: 'probation-evaluation-test', timezone: 'Asia/Shanghai' },
      runId: 7,
      question: '新员工试用期表现怎么样',
      answerShape: 'diagnosis',
      args: { objective: '评价新员工试用期表现', entities: [], metrics: [], dimensions: [], filters: [], orderBy: [] },
    });

    expect(result).toMatchObject({ grounding: 'none', citations: [], metadata: { unsupportedReason: 'staff_probation_fact_not_available' } });
    expect(result.answer).toContain('不会用服务量、接客数或通用业绩分替代试用期评估');
    expect(skillRuntime.buildManagerStaffAnalysis).not.toHaveBeenCalled();
  });

  it('returns only low-stock rows for a governed stock-risk ranking', async () => {
    const skillRuntime = {
      buildInventoryRiskSummary: jest.fn().mockResolvedValue({
        stockoutSkuCount: 1,
        expiringStockValue: 0,
        lowStockProducts: [{ name: '玻尿酸保湿精华', currentStock: 131, safetyStock: 143 }],
        expiringProducts: [],
      }),
      buildInventoryDetailAnalysis: jest.fn().mockResolvedValue({
        totalSku: 45,
        totalStockValue: 259391.31,
        products: [{ name: '非低库存商品', stock: 999, outboundQty: 0, coverageDays: null }],
      }),
      buildInventoryProcurementAnalysis: jest.fn().mockResolvedValue({
        suggestions: [],
        suppliers: [],
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      {} as never,
      new BrainTimeRangeParserService(),
    );

    const result = await executor.execute({
      card: { ...storeCard(), key: 'inventory_operations_overview' },
      context: {
        userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'],
        deniedPermissions: [], requestId: 'inventory-risk-test', timezone: 'Asia/Shanghai',
      },
      runId: 3,
      question: '现在哪些产品库存不够了',
      args: {
        objective: '列出低库存商品',
        entities: [],
        metrics: [{ definitionKey: 'metric.stock_risk_score' }],
        dimensions: [],
        filters: [],
        orderBy: [],
      },
    });

    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'ranking',
        columns: ['product', 'currentStock', 'safetyStock', 'shortage'],
        rows: [{ product: '玻尿酸保湿精华', currentStock: 131, safetyStock: 143, shortage: 12 }],
      }),
    ]));
  });

  it('answers explicitly requested payment methods with zero rows when the period has no payments', async () => {
    const skillRuntime = {
      buildFinanceIncomeAnalysis: jest.fn().mockResolvedValue({
        totalCollected: 0,
        paymentBreakdown: [],
        dailyTrend: [],
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      {} as never,
      new BrainTimeRangeParserService(),
    );

    const result = await executor.execute({
      card: { ...storeCard(), key: 'finance_payment_breakdown', name: '实收支付方式拆分' },
      context: {
        userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'],
        deniedPermissions: [], requestId: 'payment-zero-test', timezone: 'Asia/Shanghai',
      },
      runId: 6,
      question: '今天现金收了多少，微信支付宝各多少',
      answerShape: 'comparison',
      args: {
        objective: '查询支付方式实收',
        entities: [],
        metrics: [],
        dimensions: [{ definitionKey: 'dimension.paymentMethod' }],
        filters: [],
        orderBy: [],
      },
    });

    expect(result.answer).toContain('现金：0.00 元');
    expect(result.answer).toContain('微信：0.00 元');
    expect(result.answer).toContain('支付宝：0.00 元');
    expect(result.blocks).toEqual([
      expect.objectContaining({
        kind: 'ranking',
        rows: [
          { paymentMethod: '现金', amount: 0, count: 0 },
          { paymentMethod: '微信', amount: 0, count: 0 },
          { paymentMethod: '支付宝', amount: 0, count: 0 },
        ],
      }),
    ]);
  });

  it('returns only the requested refund scalar metrics instead of the full finance overview', async () => {
    const skillRuntime = {
      buildFinanceRiskSummary: jest.fn().mockResolvedValue({
        refundAmount: 88,
        refundCount: 2,
        discountAmount: 30,
        grossMarginRate: 0.6,
        riskItems: [],
      }),
      buildFinanceIncomeAnalysis: jest.fn().mockResolvedValue({
        totalCollected: 1000,
        paymentBreakdown: [{ method: '微信', amount: 1000, count: 3 }],
        dailyTrend: [],
        orderKindBreakdown: [],
      }),
      buildFinanceCostAnalysis: jest.fn().mockResolvedValue({
        revenue: 1000,
        materialCost: 100,
        commissionCost: 100,
        operatingCost: 50,
        grossProfit: 750,
        grossMarginRate: 0.75,
        cardLiability: 200,
        costCategories: [],
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      {} as never,
      new BrainTimeRangeParserService(),
    );

    const result = await executor.execute({
      card: { ...storeCard(), key: 'finance_risk_overview', name: '财务经营风险概览' },
      context: {
        userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'],
        deniedPermissions: [], requestId: 'finance-refund-scalar-test', timezone: 'Asia/Shanghai',
      },
      runId: 7,
      question: '今天退款有几笔，金额多少',
      answerShape: 'scalar',
      args: {
        objective: '查询退款金额和笔数',
        entities: [],
        metrics: [
          { definitionKey: 'metric.refund_amount' },
          { definitionKey: 'metric.refund_count' },
        ],
        dimensions: [],
        filters: [],
        orderBy: [],
      },
    });

    expect(result.answer).toContain('退款金额 88.00 元');
    expect(result.answer).toContain('退款笔数 2 笔');
    expect(result.answer).not.toContain('实收');
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'kpi',
        items: [
          { label: '退款金额', value: '88.00 元' },
          { label: '退款笔数', value: '2 笔' },
        ],
      }),
    ]));
    expect(result.blocks?.some((block) => block.kind === 'ranking')).toBe(false);
  });

  it('compares governed paid amounts across two structured time ranges', async () => {
    const skillRuntime = {
      buildFinanceIncomeAnalysis: jest.fn()
        .mockResolvedValueOnce({ totalCollected: 1200, paymentBreakdown: [], dailyTrend: [] })
        .mockResolvedValueOnce({ totalCollected: 1000, paymentBreakdown: [], dailyTrend: [] }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      {} as never,
      new BrainTimeRangeParserService(),
    );

    const result = await executor.execute({
      card: { ...storeCard(), key: 'finance_payment_breakdown', name: '实收与储值流水拆分' },
      context: {
        userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'],
        deniedPermissions: [], requestId: 'payment-comparison-test', timezone: 'Asia/Shanghai',
      },
      runId: 8,
      question: '这个月比上个月多收了多少',
      answerShape: 'comparison',
      args: {
        objective: '比较本月和上月实收',
        time: { label: '本月', timezone: 'Asia/Shanghai', startDate: '2026-07-01', endDate: '2026-07-10' },
        comparisonTarget: {
          type: 'time',
          timeRange: { label: '上月', timezone: 'Asia/Shanghai', startDate: '2026-06-01', endDate: '2026-06-30' },
        },
        entities: [],
        metrics: [{ definitionKey: 'metric.paid_amount', definitionVersion: 8 }],
        dimensions: [],
        filters: [],
        orderBy: [],
      },
    });

    expect(skillRuntime.buildFinanceIncomeAnalysis).toHaveBeenNthCalledWith(1, {
      storeId: 6,
      startDate: new Date('2026-06-30T16:00:00.000Z'),
      endDate: new Date('2026-07-10T15:59:59.999Z'),
    });
    expect(skillRuntime.buildFinanceIncomeAnalysis).toHaveBeenNthCalledWith(2, {
      storeId: 6,
      startDate: new Date('2026-05-31T16:00:00.000Z'),
      endDate: new Date('2026-06-30T15:59:59.999Z'),
    });
    expect(result.answer).toContain('增加 200.00 元');
    expect(result.answer).toContain('+20.0%');
    expect(result.blocks).toEqual([expect.objectContaining({
      kind: 'comparison',
      items: [{ label: '实收金额', current: '本月 1200.00 元', previous: '上月 1000.00 元', delta: '+200.00 元（+20.0%）' }],
    })]);
  });

  it('answers member-balance consumption and recharge from real balance transactions', async () => {
    const skillRuntime = {
      buildFinanceMemberBalanceFlowSummary: jest.fn().mockResolvedValue({
        rechargeAmount: 1000,
        rechargeGiftAmount: 200,
        rechargeCount: 1,
        consumedAmount: 180,
        consumedGiftAmount: 20,
        consumedCount: 2,
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      {} as never,
      new BrainTimeRangeParserService(),
    );

    const result = await executor.execute({
      card: { ...storeCard(), key: 'finance_payment_breakdown', name: '实收与储值流水拆分' },
      context: {
        userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'],
        deniedPermissions: [], requestId: 'balance-flow-test', timezone: 'Asia/Shanghai',
      },
      runId: 7,
      question: '今天储值卡消耗了多少，新充值了多少',
      args: {
        objective: '查询储值消耗和新充值',
        time: { label: '今天', timezone: 'Asia/Shanghai', startDate: '2026-07-10', endDate: '2026-07-10' },
        entities: [], metrics: [], dimensions: [], filters: [], orderBy: [],
      },
    });

    expect(skillRuntime.buildFinanceMemberBalanceFlowSummary).toHaveBeenCalledWith({
      storeId: 6,
      startDate: new Date('2026-07-09T16:00:00.000Z'),
      endDate: new Date('2026-07-10T15:59:59.999Z'),
    });
    expect(result.answer).toContain('储值消耗 200.00 元');
    expect(result.answer).toContain('新充值入账 1200.00 元');
    expect(result.blocks).toEqual([
      expect.objectContaining({
        kind: 'kpi',
        items: [
          expect.objectContaining({ label: '储值消耗', value: '200.00 元' }),
          expect.objectContaining({ label: '新充值入账', value: '1200.00 元' }),
        ],
      }),
    ]);
  });

  it('diagnoses gross-margin deterioration against the previous comparable period', async () => {
    const skillRuntime = {
      buildFinanceRiskSummary: jest.fn()
        .mockResolvedValueOnce({ refundAmount: 100, refundCount: 2, discountAmount: 200, grossMarginRate: 0.5, riskItems: [] })
        .mockResolvedValueOnce({ refundAmount: 50, refundCount: 1, discountAmount: 50, grossMarginRate: 0.7, riskItems: [] }),
      buildFinanceIncomeAnalysis: jest.fn()
        .mockResolvedValueOnce({ totalCollected: 1000, paymentBreakdown: [], dailyTrend: [], orderKindBreakdown: [] })
        .mockResolvedValueOnce({ totalCollected: 1200, paymentBreakdown: [], dailyTrend: [], orderKindBreakdown: [] }),
      buildFinanceCostAnalysis: jest.fn()
        .mockResolvedValueOnce({ revenue: 1000, materialCost: 300, commissionCost: 150, operatingCost: 100, grossProfit: 500, grossMarginRate: 0.5, cardLiability: 0, costCategories: [] })
        .mockResolvedValueOnce({ revenue: 1200, materialCost: 180, commissionCost: 120, operatingCost: 60, grossProfit: 840, grossMarginRate: 0.7, cardLiability: 0, costCategories: [] }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      {} as never,
      new BrainTimeRangeParserService(),
    );

    const result = await executor.execute({
      card: { ...storeCard(), key: 'finance_risk_overview', name: '财务经营风险概览' },
      context: {
        userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'],
        deniedPermissions: [], requestId: 'finance-diagnosis-test', timezone: 'Asia/Shanghai',
      },
      runId: 9,
      question: '查一下毛利异常是折扣、成本还是项目结构造成的',
      answerShape: 'diagnosis',
      args: {
        objective: '诊断最近毛利下降原因',
        time: { label: '最近30天', timezone: 'Asia/Shanghai', startDate: '2026-06-18', endDate: '2026-07-17' },
        entities: [], metrics: [], dimensions: [], filters: [], orderBy: [],
      },
    });

    expect(result.answer).toContain('毛利率较上一可比期下降 20.0 个百分点');
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'diagnosis',
        findings: expect.arrayContaining([
          expect.objectContaining({ title: '毛利率下降' }),
          expect.objectContaining({ title: '折扣率上升' }),
          expect.objectContaining({ title: '物料成本率上升' }),
        ]),
      }),
      expect.objectContaining({
        kind: 'comparison',
        items: expect.arrayContaining([
          { label: '毛利率', current: '50.0%', previous: '70.0%', delta: '-20.0 个百分点' },
        ]),
      }),
      expect.objectContaining({
        kind: 'limitations',
        items: [expect.stringContaining('未关联商品/项目级收入、折扣和成本')],
      }),
    ]));
    expect(result.metadata).toMatchObject({
      answerShape: 'diagnosis',
      diagnosisBaselineLabel: '上一可比期',
      projectStructureGap: true,
    });
  });
});

function operations(override: Record<string, unknown> = {}): any {
  return {
    revenue: 0,
    orderCount: 0,
    customerCount: 0,
    avgTransaction: 0,
    inStoreCount: 1,
    newCustomerCount: 0,
    returningCustomerCount: 3,
    paymentBreakdown: [{ method: '微信', amount: 600 }],
    dailyTrend: [],
    projectRanking: [{ name: '补水护理', count: 3 }],
    beauticianRanking: [{ name: '唐伊', count: 3 }],
    largestOrder: { orderNo: 'O-1', amount: 500, customerName: '客户A' },
    target: { revenueTarget: 2000, appointmentTarget: 10, newCustomerTarget: 4 },
    ...override,
  };
}

function reception(total: number): any {
  return {
    total,
    checkedIn: 2,
    pendingArrival: 3,
    noShow: 0,
    arrivalRate: 0.25,
    noShowRate: 0,
    staff: [{
      name: '唐伊',
      appointmentCount: 3,
      onTimeOff: false,
      inService: true,
      available: false,
      nextAvailableAt: '15:00',
    }],
  };
}

function finance(refundAmount: number, refundCount: number): any {
  return { refundAmount, refundCount, discountAmount: 0, grossMarginRate: 0.5, riskItems: [] };
}

function storeCard(): BrainCapabilityCard {
  return {
    key: 'store_operations_overview',
    version: 1,
    name: '店长经营概览',
    description: '经营概览与对比',
    domains: ['order', 'payment', 'reservation', 'beautician'],
    intents: ['query', 'comparison', 'diagnosis'],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    requiredPermissions: [],
    allowedRoles: ['store_manager'],
    readOnly: true,
    sideEffect: false,
    riskLevel: 'low',
    requiresConfirmation: false,
    idempotency: 'not_applicable',
    timeoutMs: 10_000,
    grounding: 'domain_service',
    examples: [],
    sourceFingerprint: 'a'.repeat(64),
    definitionRefs: [],
    synonyms: [],
    negativeExamples: [],
    successSchema: {},
  };
}
