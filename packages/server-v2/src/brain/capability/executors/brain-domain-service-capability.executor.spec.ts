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

  it('identifies the lowest paid-amount day and discloses the missing attribution facts', async () => {
    const skillRuntime = {
      buildManagerOperationsAnalysis: jest.fn().mockResolvedValue(operations({
        dailyTrend: [
          { date: '2026-07-13', revenue: 3400 },
          { date: '2026-07-14', revenue: 0 },
          { date: '2026-07-15', revenue: 4900 },
        ],
      })),
      buildReceptionOperationsSnapshot: jest.fn().mockResolvedValue(reception(0)),
      buildFinanceRiskSummary: jest.fn().mockResolvedValue(finance(0, 0)),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(skillRuntime as never, {} as never, new BrainTimeRangeParserService());

    const result = await executor.execute({
      card: storeCard(),
      context: { userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'], deniedPermissions: [], requestId: 'lowest-day-test', timezone: 'Asia/Shanghai' },
      runId: 81,
      question: '这周有没有哪天特别差，为什么',
      answerShape: 'diagnosis',
      args: { objective: '识别经营低谷日', time: { label: '本周', timezone: 'Asia/Shanghai', startDate: '2026-07-13', endDate: '2026-07-19' }, entities: [], metrics: [], dimensions: [], filters: [], orderBy: [] },
    });

    expect(result.answer).toContain('表现最差的是 2026-07-14，实收 0.00 元');
    expect(result.answer).toContain('不能直接断言原因');
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'ranking' }),
      expect.objectContaining({ kind: 'limitations' }),
    ]));
    expect(result.metadata).toMatchObject({ answerScope: 'lowest_daily_paid_amount_with_reason_gap' });
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

  it('returns the governed new-customer cohort conversion funnel for the requested period', async () => {
    const customerFacts = {
      getNewCustomerConversionSummary: jest.fn().mockResolvedValue({
        newCustomerCount: 9,
        convertedCustomerCount: 1,
        unconvertedCustomerCount: 8,
        conversionRate: 1 / 9,
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
        userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'],
        deniedPermissions: [], requestId: 'new-customer-conversion-test', timezone: 'Asia/Shanghai',
      },
      runId: 4,
      question: '上个月新来了多少新客，转化了多少',
      answerShape: 'scalar',
      args: {
        objective: '查询上月新客转化',
        time: { label: '上月', timezone: 'Asia/Shanghai', startDate: '2026-06-01', endDate: '2026-06-30' },
        entities: [],
        metrics: [
          { definitionKey: 'metric.new_customer_count' },
          { definitionKey: 'metric.new_customer_conversion_count' },
          { definitionKey: 'metric.new_customer_conversion_rate' },
        ],
        dimensions: [], filters: [], orderBy: [],
      },
    });

    expect(customerFacts.getNewCustomerConversionSummary).toHaveBeenCalledWith({
      storeId: 6,
      startDate: new Date('2026-05-31T16:00:00.000Z'),
      endDate: new Date('2026-06-30T15:59:59.999Z'),
    });
    expect(result.answer).toContain('新增客户 9 人');
    expect(result.answer).toContain('转化率 11.1%');
    expect(result.blocks).toEqual([
      expect.objectContaining({
        kind: 'kpi',
        items: [
          { label: '新增客户', value: '9 人' },
          { label: '已转化', value: '1 人' },
          { label: '转化率', value: '11.1%' },
          { label: '待转化', value: '8 人' },
        ],
      }),
    ]);
    expect(result.metadata).toMatchObject({
      cohortDefinition: 'Customer.createdAt within requested period',
      conversionDefinition: 'first valid positive-net ProductOrder between customer creation and period end',
    });
  });

  it('returns an aggregate-only arrived-customer age distribution', async () => {
    const customerFacts = {
      getArrivedCustomerAgeDistribution: jest.fn().mockResolvedValue({
        arrivedCustomerCount: 5,
        knownAgeCount: 4,
        unknownAgeCount: 1,
        rows: [
          { ageGroup: '25-34岁', count: 3, share: 0.6 },
          { ageGroup: '35-44岁', count: 1, share: 0.2 },
        ],
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
        userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'],
        deniedPermissions: [], requestId: 'arrived-age-profile-test', timezone: 'Asia/Shanghai',
      },
      runId: 5,
      question: '帮我看一下今天到店客人的画像，主要是什么年龄段',
      answerShape: 'list',
      args: {
        objective: '查看今日到店年龄画像',
        time: { label: '今天', timezone: 'Asia/Shanghai', startDate: '2026-07-17', endDate: '2026-07-17' },
        entities: [], metrics: [],
        dimensions: [{ definitionKey: 'dimension.customerAgeGroup' }],
        filters: [], orderBy: [],
      },
    });

    expect(result.answer).toContain('实际到店客户 5 人');
    expect(result.answer).toContain('人数最多的是 25-34岁');
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'table', columns: ['ageGroup', 'customerCount', 'share'] }),
      expect.objectContaining({ kind: 'limitations', items: ['1 位到店客户缺少有效年龄或生日，未分配到年龄段'] }),
    ]));
    expect(result.metadata).toMatchObject({ dimensionKey: 'customerAgeGroup', privacy: 'aggregate_only' });
  });

  it('returns structured dormant-customer reactivation evidence without claiming temporal causality', async () => {
    const customerLifecycle = {
      getDormantReactivationEvidence: jest.fn().mockResolvedValue({
        rangeLabel: '2026-07-01 至 2026-07-17',
        dormantThresholdDays: 60,
        attributionWindowDays: 30,
        touchCountAnalyzed: 6,
        dormantCandidateCount: 3,
        reactivatedCustomerCount: 2,
        strongSignalCustomerCount: 1,
        mediumSignalCustomerCount: 1,
        weakSignalCustomerCount: 0,
        explicitAttributionCustomerCount: 1,
        rows: [
          {
            customerId: 21,
            customerName: '赵女士',
            memberLevel: '金卡',
            touchId: 501,
            channel: 'wechat',
            touchedAt: new Date('2026-07-05T02:00:00.000Z'),
            dormantEvidence: '触达前 60 天无实际到店或有效正金额消费',
            dormantEvidenceSource: 'inactivity_window',
            signalLevel: 'strong',
            signalTypes: ['arrival', 'order'],
            signalSummary: '实际到店、产生有效消费',
            latestSignalAt: new Date('2026-07-12T03:00:00.000Z'),
            attributedRevenue: 688,
            attributionConfidence: 'explicit_attribution',
          },
          {
            customerId: 22,
            customerName: '陈女士',
            memberLevel: '银卡',
            touchId: 502,
            channel: 'sms',
            touchedAt: new Date('2026-07-06T02:00:00.000Z'),
            dormantEvidence: '触达时预测流失等级 high，流失分 80',
            dormantEvidenceSource: 'prediction_snapshot',
            signalLevel: 'medium',
            signalTypes: ['reservation'],
            signalSummary: '新建有效预约',
            latestSignalAt: new Date('2026-07-10T03:00:00.000Z'),
            attributedRevenue: 0,
            attributionConfidence: 'temporal_evidence',
          },
        ],
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      {} as never,
      {} as never,
      new BrainTimeRangeParserService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      customerLifecycle as never,
    );

    const result = await executor.execute({
      card: { ...storeCard(), key: 'customer_facts', intents: ['query', 'diagnosis'] },
      context: {
        userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'],
        deniedPermissions: [], requestId: 'dormant-reactivation-test', timezone: 'Asia/Shanghai',
      },
      runId: 5,
      question: '哪些沉睡客户最近有点被唤醒的迹象',
      answerShape: 'list',
      args: {
        objective: '查询沉睡客户唤醒迹象',
        time: { label: '最近', timezone: 'Asia/Shanghai', startDate: '2026-07-01', endDate: '2026-07-17' },
        entities: [], dimensions: [], filters: [], orderBy: [],
        metrics: [{ definitionKey: 'metric.dormant_reactivation_customer_count', definitionVersion: 1 }],
      },
    });

    expect(result.answer).toContain('发现 2 位沉睡客户');
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'kpi', items: expect.arrayContaining([{ label: '出现唤醒迹象', value: '2 人' }]) }),
      expect.objectContaining({ kind: 'table', rows: expect.arrayContaining([expect.objectContaining({ customerName: '赵女士', signalLevel: 'strong' })]) }),
      expect.objectContaining({ kind: 'limitations', items: expect.arrayContaining([expect.stringContaining('不能宣称由本次触达直接造成')]) }),
    ]));
    expect(result.metadata).toMatchObject({
      answerScope: 'dormant_reactivation_evidence',
      causalClaim: 'not_inferred_from_temporal_evidence',
    });
    expect(customerLifecycle.getDormantReactivationEvidence).toHaveBeenCalledWith(6, expect.objectContaining({ limit: 10 }));
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
      question: '哪些客户买了次卡但最近一直不来用',
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

  it('answers staff leave impact from the shared leave and reception snapshot', async () => {
    const skillRuntime = {
      buildManagerStaffAnalysis: jest.fn().mockResolvedValue({
        staff: [
          { beauticianId: 1, name: '唐伊', serviceCount: 0, completedCount: 0, uniqueCustomerCount: 0, repeatCustomerCount: 0, revenueAmount: 0, commissionAmount: 0, timeOffHours: 8 },
          { beauticianId: 2, name: '沈晴', serviceCount: 0, completedCount: 0, uniqueCustomerCount: 0, repeatCustomerCount: 0, revenueAmount: 0, commissionAmount: 0, timeOffHours: 0 },
        ],
      }),
      buildReceptionOperationsSnapshot: jest.fn().mockResolvedValue({
        ...reception(2),
        staff: [
          { name: '唐伊', appointmentCount: 0, onTimeOff: true, inService: false, available: false, nextAvailableAt: null },
          { name: '沈晴', appointmentCount: 2, onTimeOff: false, inService: false, available: true, nextAvailableAt: null },
        ],
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(skillRuntime as never, {} as never, new BrainTimeRangeParserService());

    const result = await executor.execute({
      card: { ...storeCard(), key: 'manager_staff_overview', intents: ['query', 'diagnosis'] },
      context: { userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'], deniedPermissions: [], requestId: 'staff-leave-impact-test', timezone: 'Asia/Shanghai' },
      runId: 41,
      question: '今天谁请假了，有没有影响接待',
      answerShape: 'diagnosis',
      args: { objective: '分析请假对接待的影响', entities: [], metrics: [], dimensions: [], filters: [], orderBy: [] },
    });

    expect(result.answer).toBe('今天请假人员：唐伊。当前仍有 1 位美容师可接待，未发现接待能力完全中断。');
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'table' }),
      expect.objectContaining({ kind: 'diagnosis' }),
    ]));
    expect(result.metadata).toMatchObject({
      answerScope: 'staff_leave_reception_impact',
      leaveStaffCount: 1,
      availableStaffCount: 1,
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

  it('returns the staff commission total when the question asks for a total instead of a ranking', async () => {
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
      card: { ...storeCard(), key: 'manager_staff_overview', intents: ['query'] },
      context: { userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'], deniedPermissions: [], requestId: 'commission-total-test', timezone: 'Asia/Shanghai' },
      runId: 51,
      question: '本月员工总提成大概多少',
      answerShape: 'scalar',
      args: {
        objective: '员工提成合计', entities: [], dimensions: [], filters: [], orderBy: [],
        metrics: [{ definitionType: 'metric', definitionKey: 'metric.staff_commission_amount', definitionVersion: 1, definitionFingerprint: 'a'.repeat(64), sourceFingerprint: 'b'.repeat(64) }],
      },
    });

    expect(result.answer).toBe('本月员工提成合计 880.00 元，共覆盖 2 位美容师。');
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'kpi', items: [expect.objectContaining({ value: '880.00 元' })] }),
      expect.objectContaining({ kind: 'table' }),
    ]));
    expect(result.metadata).toMatchObject({ answerScope: 'staff_commission_total', totalCommission: 880 });
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

  it('answers recent procurement amount from existing procurement orders', async () => {
    const skillRuntime = {
      buildInventoryRiskSummary: jest.fn().mockResolvedValue({ stockoutSkuCount: 0, expiringStockValue: 0, lowStockProducts: [], expiringProducts: [] }),
      buildInventoryDetailAnalysis: jest.fn().mockResolvedValue({ totalSku: 0, totalStockValue: 0, products: [], movements: [] }),
      buildInventoryProcurementAnalysis: jest.fn().mockResolvedValue({
        suggestions: [], suppliers: [],
        recentOrders: [
          { orderNo: 'PO-2', supplierName: '供应商B', amount: 600, status: 'received', createdAt: '2026-07-16' },
          { orderNo: 'PO-1', supplierName: '供应商A', amount: 400, status: 'approved', createdAt: '2026-07-10' },
        ],
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(skillRuntime as never, {} as never, new BrainTimeRangeParserService());
    const result = await executor.execute({
      card: { ...storeCard(), key: 'inventory_operations_overview', intents: ['query'] },
      context: { userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'], deniedPermissions: [], requestId: 'procurement-history-test', timezone: 'Asia/Shanghai' },
      runId: 52,
      question: '最近采购了什么，花了多少钱',
      answerShape: 'list',
      args: { objective: '采购历史与金额', entities: [], metrics: [], dimensions: [], filters: [], orderBy: [] },
    });

    expect(result.answer).toBe('最近 2 张采购单合计 1000.00 元。');
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'kpi' }),
      expect.objectContaining({ kind: 'table', rows: expect.arrayContaining([expect.objectContaining({ orderNo: 'PO-2' })]) }),
    ]));
  });

  it('ranks consumables by real outbound quantity', async () => {
    const skillRuntime = {
      buildInventoryRiskSummary: jest.fn().mockResolvedValue({ stockoutSkuCount: 0, expiringStockValue: 0, lowStockProducts: [], expiringProducts: [] }),
      buildInventoryDetailAnalysis: jest.fn().mockResolvedValue({
        totalSku: 2, totalStockValue: 100,
        products: [
          { productId: 1, name: '美容棉片', stock: 20, outboundQty: 30, coverageDays: 10 },
          { productId: 2, name: '导入凝胶', stock: 50, outboundQty: 12, coverageDays: 40 },
        ],
        movements: [],
      }),
      buildInventoryProcurementAnalysis: jest.fn().mockResolvedValue({ suggestions: [], suppliers: [], recentOrders: [] }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(skillRuntime as never, {} as never, new BrainTimeRangeParserService());
    const result = await executor.execute({
      card: { ...storeCard(), key: 'inventory_operations_overview', intents: ['query', 'ranking'] },
      context: { userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'], deniedPermissions: [], requestId: 'consumption-ranking-test', timezone: 'Asia/Shanghai' },
      runId: 53,
      question: '哪些耗材消耗速度最快',
      answerShape: 'ranking',
      args: { objective: '耗材消耗排行', entities: [], metrics: [], dimensions: [], filters: [], orderBy: [] },
    });

    expect(result.answer).toContain('消耗量最高的是 美容棉片');
    expect(result.blocks?.[0]).toMatchObject({
      kind: 'ranking',
      rows: expect.arrayContaining([expect.objectContaining({ productName: '美容棉片', outboundQty: 30 })]),
    });
  });

  it('answers product sales amount from existing order item facts', async () => {
    const skillRuntime = {
      buildInventoryRiskSummary: jest.fn().mockResolvedValue({ stockoutSkuCount: 0, expiringStockValue: 0, lowStockProducts: [], expiringProducts: [] }),
      buildInventoryDetailAnalysis: jest.fn().mockResolvedValue({ totalSku: 0, totalStockValue: 0, products: [], movements: [] }),
      buildInventoryProcurementAnalysis: jest.fn().mockResolvedValue({ suggestions: [], suppliers: [], recentOrders: [] }),
    };
    const prisma = {
      orderItem: { aggregate: jest.fn().mockResolvedValue({ _sum: { netAmount: 3580 } }) },
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      skillRuntime as never,
      {} as never,
      new BrainTimeRangeParserService(),
      undefined,
      undefined,
      prisma as never,
    );
    const result = await executor.execute({
      card: { ...storeCard(), key: 'inventory_operations_overview', intents: ['query'] },
      context: { userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'], deniedPermissions: [], requestId: 'product-sales-amount-test', timezone: 'Asia/Shanghai' },
      runId: 54,
      question: '这个月产品销售额是多少',
      answerShape: 'scalar',
      args: { objective: '商品销售额', entities: [], metrics: [{ definitionKey: 'metric.product_sales_amount', definitionVersion: 138 }], dimensions: [], filters: [], orderBy: [] },
    });

    expect(result.answer).toContain('商品净销售额 3580.00 元');
    expect(result.blocks?.[0]).toMatchObject({ kind: 'kpi' });
    expect(prisma.orderItem.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ order: expect.objectContaining({ storeId: 6 }) }),
    }));
  });

  it('checks project BOM requirements against current material stock', async () => {
    const skillRuntime = {
      buildInventoryRiskSummary: jest.fn().mockResolvedValue({ stockoutSkuCount: 0, expiringStockValue: 0, lowStockProducts: [], expiringProducts: [] }),
      buildInventoryDetailAnalysis: jest.fn().mockResolvedValue({ totalSku: 0, totalStockValue: 0, products: [], movements: [] }),
      buildInventoryProcurementAnalysis: jest.fn().mockResolvedValue({ suggestions: [], suppliers: [], recentOrders: [] }),
    };
    const prisma = {
      project: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, name: '补水护理', bomItems: [{ standardQty: 2, unit: '支', product: { id: 10, name: '补水精华', currentStock: 1, status: 'active', deletedAt: null } }] },
          { id: 2, name: '清洁护理', bomItems: [] },
        ]),
      },
    };
    const executor = new BrainDomainServiceCapabilityExecutor(skillRuntime as never, {} as never, new BrainTimeRangeParserService(), undefined, undefined, prisma as never);
    const result = await executor.execute({
      card: { ...storeCard(), key: 'inventory_operations_overview', intents: ['diagnosis'] },
      context: { userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'], deniedPermissions: [], requestId: 'project-material-test', timezone: 'Asia/Shanghai' },
      runId: 54,
      question: '有没有哪个项目因为缺耗材没法做',
      answerShape: 'diagnosis',
      args: { objective: '项目耗材可执行性', entities: [], metrics: [], dimensions: [], filters: [], orderBy: [] },
    });

    expect(result.answer).toContain('1 个项目因至少一项标准耗材库存不足');
    expect(result.answer).toContain('1 个在售项目没有配置 BOM');
    expect(result.blocks?.[0]).toMatchObject({ kind: 'table', rows: [expect.objectContaining({ projectName: '补水护理', shortageQty: 1 })] });
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

  it('answers refund amount and reasons without expanding to the full finance overview', async () => {
    const skillRuntime = {
      buildFinanceRefundReasonAnalysis: jest.fn().mockResolvedValue({
        refundAmount: 450,
        refundCount: 3,
        reasons: [
          { reason: '客户不适', amount: 400, count: 2 },
          { reason: '未填写原因', amount: 50, count: 1 },
        ],
        records: [
          { refundNo: 'R-2', orderNo: 'O-2', customerName: '李女士', reason: '客户不适', amount: 300, refundedAt: new Date('2026-07-10T08:00:00.000Z') },
        ],
      }),
      buildFinanceRiskSummary: jest.fn(),
      buildFinanceIncomeAnalysis: jest.fn(),
      buildFinanceCostAnalysis: jest.fn(),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(skillRuntime as never, {} as never, new BrainTimeRangeParserService());

    const result = await executor.execute({
      card: { ...storeCard(), key: 'finance_risk_overview', intents: ['query', 'diagnosis'] },
      context: { userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'], deniedPermissions: [], requestId: 'refund-reason-test', timezone: 'Asia/Shanghai' },
      runId: 55,
      question: '这个月退货了多少，原因是什么',
      answerShape: 'list',
      args: { objective: '退款金额与原因', entities: [], metrics: [], dimensions: [], filters: [], orderBy: [] },
    });

    expect(result.answer).toContain('退款 3 笔、合计 450.00 元');
    expect(result.answer).toContain('客户不适 2 笔/400.00 元');
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'table', rows: [expect.objectContaining({ refundNo: 'R-2', reason: '客户不适' })] }),
      expect.objectContaining({ kind: 'limitations' }),
    ]));
    expect(skillRuntime.buildFinanceRiskSummary).not.toHaveBeenCalled();
  });

  it('ranks product margins and discloses cost fallback quality', async () => {
    const skillRuntime = {
      buildFinanceProductMarginAnalysis: jest.fn().mockResolvedValue({
        totalProductCount: 2,
        belowCostProductCount: 1,
        incompleteCostProductCount: 0,
        rows: [
          { productId: 1, productName: '眼霜', quantity: 2, netRevenue: 500, costAmount: 200, grossProfit: 300, grossMarginRate: 0.6, belowCostSaleCount: 0, costCoverageRate: 1, costSources: ['order_snapshot'] },
          { productId: 2, productName: '精华', quantity: 1, netRevenue: 80, costAmount: 100, grossProfit: -20, grossMarginRate: -0.25, belowCostSaleCount: 1, costCoverageRate: 1, costSources: ['product_master_fallback'] },
        ],
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(skillRuntime as never, {} as never, new BrainTimeRangeParserService());

    const result = await executor.execute({
      card: { ...storeCard(), key: 'finance_risk_overview', intents: ['query', 'diagnosis', 'ranking'] },
      context: { userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'], deniedPermissions: [], requestId: 'product-margin-test', timezone: 'Asia/Shanghai' },
      runId: 57,
      question: '哪些产品毛利率最高',
      answerShape: 'ranking',
      args: { objective: '商品毛利率排行', entities: [], metrics: [{ definitionKey: 'metric.product_gross_margin_rate', definitionVersion: 1 }], dimensions: [{ definitionKey: 'dimension.productName' }], filters: [], orderBy: [] },
    });

    expect(result.answer).toContain('商品毛利率最高的是 眼霜，毛利率 60.0%');
    expect(result.answer).toContain('商品主数据成本作为明确标注的回退值');
    expect(result.blocks?.[0]).toMatchObject({
      kind: 'ranking',
      rows: expect.arrayContaining([expect.objectContaining({ productName: '眼霜', grossMarginRate: '60.0%' })]),
    });
  });

  it('lists products with non-gift sales below governed cost', async () => {
    const skillRuntime = {
      buildFinanceProductMarginAnalysis: jest.fn().mockResolvedValue({
        totalProductCount: 2, belowCostProductCount: 1, incompleteCostProductCount: 0,
        rows: [
          { productId: 1, productName: '眼霜', quantity: 2, netRevenue: 500, costAmount: 200, grossProfit: 300, grossMarginRate: 0.6, belowCostSaleCount: 0, costCoverageRate: 1, costSources: ['order_snapshot'] },
          { productId: 2, productName: '精华', quantity: 1, netRevenue: 80, costAmount: 100, grossProfit: -20, grossMarginRate: -0.25, belowCostSaleCount: 1, costCoverageRate: 1, costSources: ['order_snapshot'] },
        ],
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(skillRuntime as never, {} as never, new BrainTimeRangeParserService());
    const result = await executor.execute({
      card: { ...storeCard(), key: 'finance_risk_overview', intents: ['query', 'diagnosis', 'ranking'] },
      context: { userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'], deniedPermissions: [], requestId: 'below-cost-test', timezone: 'Asia/Shanghai' },
      runId: 58,
      question: '有没有产品卖出去的价格低于成本的',
      answerShape: 'list',
      args: { objective: '低于成本销售商品', entities: [], metrics: [{ definitionKey: 'metric.product_below_cost_sale_count', definitionVersion: 1 }], dimensions: [{ definitionKey: 'dimension.productName' }], filters: [], orderBy: [] },
    });

    expect(result.answer).toContain('发现 1 个商品存在至少一笔非赠品成交单价低于可用成本');
    expect(result.blocks?.[0]).toMatchObject({ kind: 'ranking', rows: [expect.objectContaining({ productName: '精华', belowCostSaleCount: 1 })] });
  });

  it('answers expiring high-balance cards from customer card facts', async () => {
    const customerFacts = {
      getExpiringHighBalanceCards: jest.fn().mockResolvedValue({
        total: 1,
        windowDays: 30,
        rows: [{
          customerName: '李女士', cardName: '抗衰 10 次卡', totalTimes: 10, remainingTimes: 6,
          remainingRate: 0.6, expiryDate: new Date('2026-07-25T00:00:00.000Z'), daysToExpiry: 7, unfulfilledValue: 1200,
        }],
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor({} as never, customerFacts as never, new BrainTimeRangeParserService());

    const result = await executor.execute({
      card: { ...storeCard(), key: 'customer_facts', intents: ['query', 'ranking', 'diagnosis'] },
      context: { userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'], deniedPermissions: [], requestId: 'expiring-card-test', timezone: 'Asia/Shanghai' },
      runId: 56,
      question: '有没有次卡即将过期但客户还有很多余量',
      answerShape: 'list',
      args: { objective: '次卡临期高余量名单', entities: [], metrics: [], dimensions: [], filters: [], orderBy: [] },
    });

    expect(result.answer).toContain('未来 30 天内有 1 张活跃次卡临期且余量较高');
    expect(result.answer).toContain('剩余 6/10 次');
    expect(result.blocks).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'table' })]));
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

  it('answers complaint summary from the unified feedback fact and discloses collection coverage', async () => {
    const customerFeedback = { analytics: jest.fn().mockResolvedValue(feedbackAnalytics()) };
    const executor = new BrainDomainServiceCapabilityExecutor(
      {} as never,
      {} as never,
      new BrainTimeRangeParserService(),
      undefined,
      undefined,
      undefined,
      customerFeedback as never,
    );

    const result = await executor.execute({
      card: { ...storeCard(), key: 'customer_feedback_overview', name: '客户投诉与满意度分析' },
      context: {
        userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'],
        deniedPermissions: [], requestId: 'feedback-summary-test', timezone: 'Asia/Shanghai',
      },
      runId: 10,
      question: '最近有没有客户投诉或者表达不满',
      args: {
        objective: '查询客户投诉',
        time: { label: '最近30天', timezone: 'Asia/Shanghai', startDate: '2026-06-18', endDate: '2026-07-17' },
        entities: [], metrics: [], dimensions: [], filters: [], orderBy: [],
      },
    });

    expect(customerFeedback.analytics).toHaveBeenCalledWith(6, {
      startDate: '2026-06-17T16:00:00.000Z',
      endDate: '2026-07-17T15:59:59.999Z',
    });
    expect(result.answer).toContain('共录入 3 条客户投诉或不满，其中 2 条尚未解决');
    expect(result.answer).toContain('评价采集覆盖率 40.0%');
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'kpi' }),
      expect.objectContaining({ kind: 'limitations', items: [expect.stringContaining('未记录不代表客户没有不满')] }),
    ]));
  });

  it('returns satisfaction KPIs without treating missing ratings as zero', async () => {
    const customerFeedback = { analytics: jest.fn().mockResolvedValue(feedbackAnalytics()) };
    const executor = new BrainDomainServiceCapabilityExecutor(
      {} as never,
      {} as never,
      new BrainTimeRangeParserService(),
      undefined,
      undefined,
      undefined,
      customerFeedback as never,
    );

    const result = await executor.execute({
      card: { ...storeCard(), key: 'customer_feedback_overview', name: '客户投诉与满意度分析' },
      context: {
        userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'],
        deniedPermissions: [], requestId: 'feedback-rating-test', timezone: 'Asia/Shanghai',
      },
      runId: 11,
      question: '帮我看一下客户满意度整体情况',
      args: { objective: '查询客户满意度', entities: [], metrics: [], dimensions: [], filters: [], orderBy: [] },
    });

    expect(result.answer).toContain('客户平均满意度为 3.5/5');
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'kpi',
        items: expect.arrayContaining([{ label: '平均满意度', value: '3.5 / 5' }]),
      }),
    ]));
    expect(result.metadata).toMatchObject({ answerScope: 'satisfaction_summary' });
  });

  it('ranks beauticians by complaint count instead of substituting performance metrics', async () => {
    const customerFeedback = { analytics: jest.fn().mockResolvedValue(feedbackAnalytics()) };
    const executor = new BrainDomainServiceCapabilityExecutor(
      {} as never,
      {} as never,
      new BrainTimeRangeParserService(),
      undefined,
      undefined,
      undefined,
      customerFeedback as never,
    );

    const result = await executor.execute({
      card: { ...storeCard(), key: 'customer_feedback_overview', name: '客户投诉与满意度分析' },
      context: {
        userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'],
        deniedPermissions: [], requestId: 'feedback-ranking-test', timezone: 'Asia/Shanghai',
      },
      runId: 12,
      question: '哪个美容师的客诉最多，最近有没有',
      answerShape: 'ranking',
      args: { objective: '美容师客诉排行', entities: [], metrics: [], dimensions: [], filters: [], orderBy: [], limit: 10 },
    });

    expect(result.answer).toContain('唐伊的客诉最多，共 2 条');
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'ranking',
        columns: expect.arrayContaining(['beauticianName', 'complaintCount', 'unresolvedComplaintCount']),
      }),
    ]));
    expect(result.metadata).toMatchObject({ answerScope: 'staff_complaint_ranking' });
  });

  it('answers long-wait departures from explicit waiting facts and discloses coverage', async () => {
    const customerWaiting = {
      analytics: jest.fn().mockResolvedValue({
        summary: {
          waitingEpisodeCount: 5,
          activeWaitingCount: 1,
          endedWaitingCount: 4,
          servedCount: 2,
          leftCount: 2,
          longWaitDepartureCount: 1,
          averageWaitMinutes: 26.5,
          checkedInReservationCount: 10,
          linkedReservationCount: 5,
          collectionCoverageRate: 0.5,
        },
        longWaitDepartures: [{ customerName: '林女士', actualWaitMinutes: 48, reasonNote: '等待过久' }],
      }),
    };
    const executor = new BrainDomainServiceCapabilityExecutor(
      {} as never,
      {} as never,
      new BrainTimeRangeParserService(),
      undefined,
      undefined,
      undefined,
      undefined,
      customerWaiting as never,
    );

    const result = await executor.execute({
      card: { ...storeCard(), key: 'customer_waiting_loss_overview', name: '客户等待流失分析' },
      context: {
        userId: 9, storeId: 6, visibleStoreIds: [6], roles: ['store_manager'], permissions: ['*'],
        deniedPermissions: [], requestId: 'waiting-loss-test', timezone: 'Asia/Shanghai',
      },
      runId: 13,
      question: '最近有没有客户因为等待时间长而离开',
      args: {
        objective: '查询等待过久离店',
        time: { label: '最近30天', timezone: 'Asia/Shanghai', startDate: '2026-06-18', endDate: '2026-07-17' },
        entities: [], metrics: [], dimensions: [], filters: [], orderBy: [],
      },
    });

    expect(result.answer).toContain('有 1 位客户明确记录为因等待过久离店');
    expect(result.answer).toContain('等待记录覆盖率 50.0%');
    expect(result.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'table', rows: [expect.objectContaining({ customerName: '林女士' })] }),
      expect.objectContaining({ kind: 'limitations', items: [expect.stringContaining('未记录不代表客户没有等待或离店')] }),
    ]));
    expect(result.metadata).toMatchObject({ capabilityKey: 'customer_waiting_loss_overview' });
  });
});

function feedbackAnalytics(): any {
  return {
    range: { startDate: new Date('2026-06-17T16:00:00.000Z'), endDate: new Date('2026-07-17T15:59:59.999Z') },
    summary: {
      feedbackCount: 5,
      complaintCount: 3,
      unresolvedComplaintCount: 2,
      ratedFeedbackCount: 4,
      averageRating: 3.5,
      lowRatingCount: 1,
      completedServiceTaskCount: 10,
      linkedServiceTaskCount: 4,
      collectionCoverageRate: 0.4,
    },
    staff: [
      { beauticianId: 8, beauticianName: '唐伊', feedbackCount: 3, complaintCount: 2, unresolvedComplaintCount: 1, lowRatingCount: 1, ratedFeedbackCount: 2, averageRating: 3 },
      { beauticianId: 9, beauticianName: '沈晴', feedbackCount: 2, complaintCount: 1, unresolvedComplaintCount: 1, lowRatingCount: 0, ratedFeedbackCount: 2, averageRating: 4 },
    ],
  };
}

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
