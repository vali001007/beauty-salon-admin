import { BrainBeauticianDomainAdapter } from './adapters/brain-beautician-domain.adapter.js';
import { BrainFinanceDomainAdapter } from './adapters/brain-finance-domain.adapter.js';
import { BrainFrontDeskDomainAdapter } from './adapters/brain-front-desk-domain.adapter.js';
import { BrainInventoryDomainAdapter } from './adapters/brain-inventory-domain.adapter.js';
import { BrainMarketingDomainAdapter } from './adapters/brain-marketing-domain.adapter.js';
import { BrainStoreManagerDomainAdapter } from './adapters/brain-store-manager-domain.adapter.js';
import { BrainCustomerServiceDomainAdapter } from './adapters/brain-customer-service-domain.adapter.js';
import type { BrainDomainAdapterExecution, BrainRoleIntentPlan } from './brain-domain-adapter.types.js';

describe('Brain domain adapters', () => {
  const context = {
    userId: 9,
    storeId: 2,
    visibleStoreIds: [2],
    permissions: ['*'],
    deniedPermissions: [],
    requestId: 'req',
    timezone: 'Asia/Shanghai',
  };
  const cognition = {
    normalizedText: '',
    terms: [],
    metrics: [],
    dimensions: [],
    entities: [],
    unsupportedTerms: [],
    intent: { key: 'metric_query', confidence: 0.8, reason: 'test' },
    needsClarification: false,
  };
  const runtimeIntent = {
    intent: 'diagnosis',
    expectedShape: 'non_metric',
    allowsScalarMetric: false,
    reason: 'test',
  };
  const plan = (
    adapterKey: BrainRoleIntentPlan['adapterKey'],
    intent = 'diagnosis',
    capabilityKey?: string,
  ): BrainRoleIntentPlan =>
    ({
      role: 'store_manager',
      domain: 'store_operation',
      intent,
      answerShape: intent === 'list' ? 'list' : 'non_metric',
      adapterKey,
      capabilityKey,
      requiredPermissions: [],
      confidence: 0.9,
      grounding: intent === 'draft' || intent === 'recommendation' ? 'template_skill' : 'db_skill',
      reason: 'test',
    }) as BrainRoleIntentPlan;
  const execution = (
    message: string,
    adapterKey: BrainRoleIntentPlan['adapterKey'],
    intent = 'diagnosis',
    capabilityKey?: string,
  ) =>
    ({
      context,
      dto: { message, timezone: 'Asia/Shanghai' },
      runId: 1,
      cognition,
      runtimeIntent,
      plan: plan(adapterKey, intent, capabilityKey),
    }) as BrainDomainAdapterExecution;

  const skillRuntime = {
    buildManagerDailyOverview: jest.fn().mockResolvedValue({
      revenue: 1200,
      appointmentCount: 3,
      activeCustomerCount: 2,
      grossMarginRate: 0.5,
      riskItems: ['低库存：补水面膜'],
    }),
    buildManagerOperationsAnalysis: jest.fn().mockResolvedValue({
      revenue: 1000,
      orderCount: 5,
      customerCount: 4,
      avgTransaction: 200,
      inStoreCount: 2,
      newCustomerCount: 1,
      returningCustomerCount: 3,
      paymentBreakdown: [{ method: '微信', amount: 700 }, { method: '现金', amount: 300 }],
      dailyTrend: [{ date: '2026-07-11', revenue: 1000 }],
      projectRanking: [{ name: '补水护理', count: 3 }],
      beauticianRanking: [{ name: '王美容师', count: 3 }],
      largestOrder: { orderNo: 'PO001', amount: 400 },
      target: { revenueTarget: 2000, appointmentTarget: 10, newCustomerTarget: 2 },
    }),
    buildManagerStaffAnalysis: jest.fn().mockResolvedValue({
      staff: [
        { beauticianId: 1, name: '王美容师', serviceCount: 6, completedCount: 5, uniqueCustomerCount: 4, repeatCustomerCount: 2, revenueAmount: 3000, commissionAmount: 300, timeOffHours: 0 },
        { beauticianId: 2, name: '李美容师', serviceCount: 3, completedCount: 3, uniqueCustomerCount: 3, repeatCustomerCount: 0, revenueAmount: 1500, commissionAmount: 150, timeOffHours: 2 },
      ],
    }),
    buildManagerRevenueForecastBaseline: jest.fn().mockResolvedValue({
      status: 'available',
      modelVersion: 'deterministic_daily_revenue_v2',
      generatedAt: '2026-07-11T04:00:00.000Z',
      historyStart: '2026-04-13T00:00:00.000Z',
      historyEnd: '2026-07-11T23:59:59.999Z',
      forecastStart: '2026-10-01T00:00:00.000Z',
      forecastEnd: '2026-12-31T23:59:59.999Z',
      historyWindowDays: 90,
      sampleDays: 90,
      missingDays: 0,
      duplicateBusinessDateCount: 0,
      trustedDays: 90,
      dataCoverageRate: 1,
      reconciliationRate: 1,
      latestSettlementDate: '2026-07-10',
      freshnessDays: 0,
      forecastDays: 92,
      averageDailyRevenue: 100,
      estimatedRevenue: 9200,
      lowerBound: 7360,
      upperBound: 11040,
      confidence: 0.95,
      confidenceLabel: 'high',
      backtest: { status: 'available', evaluationDays: 76, meanAbsoluteError: 0, weightedAbsolutePercentageError: 0, accuracyRate: 1 },
      methodology: 'test',
      limitations: [],
    }),
    listReceptionReservations: jest.fn().mockResolvedValue({
      count: 1,
      reservations: [{ date: '2026-07-11', startTime: '10:00', customerName: '李女士', projectName: '补水护理', projectTypeName: '面部护理', beauticianName: '王美容师', remark: '准备舒缓产品' }],
    }),
    buildReceptionOperationsSnapshot: jest.fn().mockResolvedValue({
      total: 5,
      checkedIn: 2,
      pendingArrival: 2,
      noShow: 1,
      cancelled: 1,
      arrivalRate: 0.4,
      noShowRate: 0.2,
      arrivedCustomers: [{ customerName: '赵女士', startTime: '10:00', projectName: '清洁护理', status: 'checked_in' }],
      pendingCustomers: [{ customerName: '李女士', startTime: '14:00', projectName: '补水护理', status: 'confirmed' }],
      resources: [{ name: '1号床', type: 'bed', booked: false }],
      staff: [
        { name: '李美容师', appointmentCount: 2, inService: true, onTimeOff: false, available: false, nextAvailableAt: '15:00' },
        { name: '王美容师', appointmentCount: 0, inService: false, onTimeOff: false, available: true },
      ],
    }),
    buildReceptionServiceOverrunAnalysis: jest.fn().mockResolvedValue({
      overrunCount: 1,
      impactedCount: 1,
      items: [
        {
          beauticianName: '王美容师',
          customerName: '李女士',
          projectName: '补水护理',
          plannedEnd: '15:00',
          actualEnd: '15:20',
          overrunMinutes: 20,
          impactedReservation: { startTime: '15:00', customerName: '赵女士', projectName: '肩颈护理' },
        },
      ],
    }),
    buildReceptionCatalogSnapshot: jest.fn().mockResolvedValue({
      cards: [{ name: '补水护理 10 次卡', totalTimes: 10, price: 3000, validDays: 365 }],
      promotions: [{ name: '新客体验礼', discountText: '首单减 100', endAt: '2026-07-31' }],
    }),
    previewReservationAction: jest.fn(() => ({
      actionId: 'preview_reschedule_reservation',
      actionType: 'reschedule_reservation',
      riskLevel: 'high',
      requiresConfirmation: true,
      summary: '客户预约动作预览：明天下午。确认前不会写入预约。',
    })),
    draftAppointmentReminder: jest.fn(() => '您好，店里近期有可预约空档，方便的话可以回复我帮您安排。'),
    draftCustomerRecall: jest.fn(() => '您好，最近护理节奏可以衔接起来了。方便的话回复我，我帮您安排合适时间。'),
    draftCampaignPlan: jest.fn(() => '活动方案：\n1. 目标客群：老客和会员。\n2. 执行前先确认毛利和库存。'),
    buildBeauticianServiceSummary: jest.fn().mockResolvedValue({
      serviceCount: 1,
      nextTasks: [{ appointmentTime: '2026-07-11 10:00', customerName: '李女士', projectName: '补水护理', attentionItems: [] }],
    }),
    buildBeauticianPersonalPerformance: jest.fn().mockResolvedValue({
      beauticianName: '王美容师',
      serviceCount: 4,
      completedCount: 3,
      scheduledMinutes: 240,
      actualMinutes: 210,
      revenueAmount: 1800,
      commissionAmount: 180,
      uniqueCustomerCount: 4,
      repeatCustomerCount: 1,
      projectRanking: [{ name: '补水护理', count: 3 }],
    }),
    composeBeauticianFollowUpAdvice: jest.fn(() => '客户本次项目结束后，建议记录反馈并在 7 天内安排一次跟进。'),
    buildInventoryRiskSummary: jest.fn().mockResolvedValue({
      expiringStockValue: 80,
      lowStockProducts: [{ name: '补水面膜', currentStock: 2, safetyStock: 5 }],
      expiringProducts: [],
      suggestedAction: '先复核低于安全库存的 SKU，再人工确认补货单。',
    }),
    buildInventoryDetailAnalysis: jest.fn().mockResolvedValue({
      totalSku: 1,
      totalStockValue: 500,
      products: [{ productId: 1, sku: 'SKU1', name: '精华液', stock: 10, safetyStock: 5, stockValue: 500, outboundQty: 3, inboundQty: 5, coverageDays: 20 }],
      movements: [{ occurredAt: '2026-07-11T10:00:00.000Z', productName: '精华液', type: 'outbound', quantity: 1, costAmount: 50 }],
    }),
    buildInventoryProcurementAnalysis: jest.fn().mockResolvedValue({
      suggestions: [
        { productId: 1, sku: 'SKU1', productName: '精华液', currentStock: 2, safetyStock: 5, suggestedQty: 8, supplierName: '供应商A', unitPrice: 20, estimatedCost: 160, leadDays: 3 },
      ],
      recentOrders: [{ orderNo: 'PO001', supplierName: '供应商A', amount: 160, status: 'received', createdAt: '2026-07-10' }],
      suppliers: [{ supplierName: '供应商A', qualificationStatus: 'approved', leadDays: 3, quoteCount: 1 }],
    }),
    composeInventoryDisposalAdvice: jest.fn(() => '临期产品处理建议：\n1. 先下架复核批次。\n2. 已过期不得给客使用。'),
    buildFinanceRiskSummary: jest.fn().mockResolvedValue({
      refundAmount: 200,
      refundCount: 2,
      discountAmount: 50,
      grossMarginRate: 0.35,
      riskItems: ['退款金额 200.00 元，需要复核原因。'],
    }),
    buildFinanceIncomeAnalysis: jest.fn().mockResolvedValue({
      totalCollected: 1000,
      paymentBreakdown: [{ method: 'wechat', amount: 700, count: 2 }, { method: 'member_balance', amount: 300, count: 1 }],
      dailyTrend: [{ date: '2026-07-11', revenue: 1000, orderCount: 5, customerCount: 4, avgTransaction: 200 }],
      orderKindBreakdown: [{ kind: 'project', amount: 800 }, { kind: 'product', amount: 200 }],
      largestOrder: { orderNo: 'PO001', amount: 400, customerName: '李女士', createdAt: new Date() },
    }),
    buildFinanceCostAnalysis: jest.fn().mockResolvedValue({
      revenue: 10000,
      materialCost: 2000,
      commissionCost: 1000,
      operatingCost: 1500,
      grossProfit: 8000,
      grossMarginRate: 0.8,
      cardLiability: 5000,
      costCategories: [{ category: '房租', amount: 1000 }, { category: '水电', amount: 500 }],
    }),
    buildMarketingAnalytics: jest.fn().mockResolvedValue({
      reachedCount: 100,
      convertedCount: 20,
      conversionRate: 0.2,
      attributedRevenue: 5000,
      channels: [{ channel: 'wechat', reached: 80, converted: 18, revenue: 4500, conversionRate: 0.225 }],
      strategies: [{ id: 1, name: '沉睡客户召回', status: 'active', executionType: 'scheduled' }],
      attributionByStrategy: [{ id: 1, name: '沉睡客户召回', revenue: 5000 }],
      dataCoverage: { touchesTruncated: false, attributionsTruncated: false, strategiesTruncated: false, touchSampleSize: 100, attributionSampleSize: 1 },
    }),
  };
  const timeRangeParser = {
    parse: jest.fn(() => ({
      range: {
        label: '今天',
        startDate: new Date('2026-07-11T00:00:00.000Z'),
        endDate: new Date('2026-07-11T23:59:59.999Z'),
        granularity: 'day',
      },
      filters: [],
      mentionedTime: true,
      requiresComparison: false,
      unsupportedExpressions: [],
    })),
  };
  const actionConfirmation = {
    createPreview: jest.fn().mockResolvedValue({ actionId: 'persisted_action' }),
  };
  const customerFacts = {
    answerCustomerFactQuestion: jest.fn().mockResolvedValue('客户分层：\n1. VIP 客户 2 人。\n2. 沉睡客户 1 人。'),
    answerExactCustomerQuestion: jest.fn().mockResolvedValue('客户：张雯，会员等级 VIP，最近服务补水护理。'),
    summarizeCustomerSegments: jest.fn().mockResolvedValue('客户分层：\n1. VIP 客户 2 人。\n2. 沉睡客户 1 人。'),
  };
  const actionTargets = {
    resolveCustomer: jest.fn().mockResolvedValue({ ok: true, value: { id: 7, name: '张女士', maskedPhone: '***1234' } }),
    resolveProject: jest.fn().mockResolvedValue({ ok: true, value: { id: 3, name: '补水护理', duration: 60 } }),
    resolveReservation: jest.fn().mockResolvedValue({
      ok: true,
      value: { id: 18, customerId: 7, customerName: '张女士', projectName: '补水护理', appointmentTime: '2026-07-11T10:00:00' },
    }),
    resolveAppointmentTime: jest.fn(() => new Date('2026-07-12T07:00:00.000Z')),
    resolveServiceTask: jest.fn().mockResolvedValue({ ok: true, value: { id: 51, customerName: '张女士', projectName: '补水护理' } }),
    resolveCardUsageTarget: jest.fn().mockResolvedValue({
      ok: true,
      value: {
        customerId: 7,
        customerName: '张女士',
        customerCardId: 66,
        cardName: '补水护理 10 次卡',
        projectId: 101,
        projectName: '深层补水护理',
        remainingTimes: 5,
        projectRemainingTimes: 7,
      },
    }),
    resolveBeautician: jest.fn().mockResolvedValue({ ok: true, value: { id: 2, name: '王美容师' } }),
    resolveUsageTimes: jest.fn().mockReturnValue(1),
    resolveMarketingStrategy: jest.fn().mockResolvedValue({
      ok: true,
      value: {
        id: 12,
        name: '沉睡客户唤醒',
        status: 'enabled',
        executionType: 'manual',
        ruleRelation: 'AND',
        actions: [{ channel: 'sms', value: '护理提醒' }],
        targetCount: 20,
        lastExecutedAt: '2026-07-10T08:00:00.000Z',
      },
    }),
  };
  const predictionSkills = {
    getCustomerPrediction: jest.fn().mockResolvedValue({
      status: 'available',
      snapshotId: 31,
      customerName: '张女士',
      modelVersion: 'customer-value-v3',
      generatedAt: '2026-07-10T08:00:00.000Z',
      ageDays: 1,
      churn: { score: 0.82, level: 'high' },
      repurchase30d: { score: 0.64 },
      marketingResponse: { score: 0.57 },
      customerValue: { ltv6m: 6800, ltv12m: 12000, tier: 'A' },
      reasons: ['距上次到店 75 天'],
      recommendedActions: ['一对一回访'],
      lifecycleStage: 'at_risk',
      boundary: '预测用于优先级和建议，不是确定事实。',
    }),
  };
  const gapOpportunities = {
    preview: jest.fn().mockResolvedValue({
      persisted: false,
      summary: { opportunityCount: 1, candidateCount: 2, availableCapacity: 1, expectedRevenue: 398, averageFillRate: 0.88 },
      opportunities: [{
        date: '2026-07-11',
        startTime: '15:00',
        endTime: '16:00',
        availableCapacity: 1,
        candidates: [{
          customerId: 7,
          customerName: '张女士',
          projectName: '补水护理',
          score: 88,
          recommendedChannel: 'phone',
          messageDraft: '张女士，今天下午有一个补水护理空档，是否帮您预留？',
          reasons: ['护理周期已到', '下午到店偏好'],
          risks: [],
        }],
      }],
    }),
  };
  const marketingService = {
    previewAudience: jest.fn().mockResolvedValue({ estimatedReachedCount: 18 }),
  };

  it('store manager adapter returns db-skill overview citation', async () => {
    const adapter = new BrainStoreManagerDomainAdapter(skillRuntime as never, timeRangeParser as never);
    const answer = await adapter.execute(execution('今天店里情况怎么样，给我来个总结', 'store_manager'));
    expect(answer?.grounding).toBe('db_skill');
    expect(answer?.citations[0]).toMatchObject({ sourceType: 'skill', sourceId: 'store_manager_overview_summary' });
  });

  it('store manager adapter returns target, trend and ranking analysis', async () => {
    const adapter = new BrainStoreManagerDomainAdapter(skillRuntime as never, timeRangeParser as never);
    const answer = await adapter.execute(execution('这个月目标完成率多少，还差多远', 'store_manager', 'diagnosis'));
    expect(answer?.answer).toContain('完成率');
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'store_operating_target' });
  });

  it('store manager adapter returns staff service, repeat, revenue, commission and time-off facts', async () => {
    const adapter = new BrainStoreManagerDomainAdapter(skillRuntime as never, timeRangeParser as never);
    const answer = await adapter.execute(execution('哪个美容师接的客人最多，这周谁请假了', 'store_manager', 'ranking'));

    expect(answer?.citations[0]).toMatchObject({ sourceId: 'store_manager_staff_analysis' });
    expect(answer?.answer).toContain('王美容师');
    expect(answer?.answer).toContain('关联业绩 3000.00');
    expect(answer?.answer).toContain('请假 2.0 小时');
  });

  it('store manager adapter returns a transparent revenue forecast baseline', async () => {
    const adapter = new BrainStoreManagerDomainAdapter(skillRuntime as never, timeRangeParser as never);
    const answer = await adapter.execute(execution('帮我预测下个季度的营业额', 'store_manager', 'diagnosis'));

    expect(answer?.citations[0]).toMatchObject({ sourceId: 'store_manager_revenue_forecast_baseline' });
    expect(answer?.answer).toContain('9200.00 元');
    expect(answer?.answer).toContain('deterministic_daily_revenue_v2');
    expect(answer?.answer).toContain('回测准确度 100.0%');
    expect(answer?.answer).toContain('不是经营承诺值');
    expect(answer?.metadata).toMatchObject({ answerScope: 'manager_revenue_forecast_backtested' });
  });

  it('store manager adapter withholds a forecast amount when evidence is insufficient', async () => {
    skillRuntime.buildManagerRevenueForecastBaseline.mockResolvedValueOnce({
      status: 'insufficient',
      modelVersion: 'deterministic_daily_revenue_v2',
      generatedAt: '2026-07-21T04:30:00.000Z',
      historyStart: '2026-04-22T00:00:00.000Z',
      historyEnd: '2026-07-20T23:59:59.999Z',
      forecastStart: '2026-10-01T00:00:00.000Z',
      forecastEnd: '2026-12-31T23:59:59.999Z',
      historyWindowDays: 90,
      sampleDays: 33,
      missingDays: 57,
      duplicateBusinessDateCount: 5,
      trustedDays: 14,
      dataCoverageRate: 0.3667,
      reconciliationRate: 0.4242,
      latestSettlementDate: '2026-07-20',
      freshnessDays: 0,
      forecastDays: 92,
      averageDailyRevenue: null,
      estimatedRevenue: null,
      lowerBound: null,
      upperBound: null,
      confidence: 0.294,
      confidenceLabel: 'low',
      backtest: { status: 'available', evaluationDays: 19, meanAbsoluteError: 4355, weightedAbsolutePercentageError: 3.05, accuracyRate: 0 },
      methodology: 'test',
      limitations: ['历史回测误差 305.0%，不能输出预测金额。'],
    });
    const adapter = new BrainStoreManagerDomainAdapter(skillRuntime as never, timeRangeParser as never);

    const answer = await adapter.execute(execution('帮我预测下个季度的营业额', 'store_manager', 'diagnosis'));

    expect(answer?.answer).toContain('当前无法形成下季度营业额预测');
    expect(answer?.answer).toContain('不会在样本不足时输出伪精确金额');
    expect(answer?.answer).not.toMatch(/309369|基线预测 \d/);
    expect(answer?.blocks).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'diagnosis' })]));
    expect(answer?.metadata).toMatchObject({ answerScope: 'manager_revenue_forecast_insufficient' });
  });

  it('front desk adapter returns preview actions without writing business state', async () => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never, actionTargets as never);
    const answer = await adapter.execute(execution('把张女士的预约改到明天下午3点', 'front_desk', 'action'));
    expect(answer?.grounding).toBe('preview_action');
    expect(answer?.suggestedActions?.[0]).toMatchObject({ actionId: 'persisted_action', actionType: 'reschedule_reservation' });
    expect(actionConfirmation.createPreview).toHaveBeenCalledWith(expect.objectContaining({
      skillKey: 'reschedule_reservation',
      payload: expect.objectContaining({ reservationId: 18, appointmentTime: '2026-07-12T07:00:00.000Z' }),
    }));
  });

  it('front desk adapter creates a critical card usage preview without writing business state', async () => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never, actionTargets as never);
    const answer = await adapter.execute(execution(
      '给张女士的补水护理 10 次卡核销深层补水护理 1 次，王美容师服务',
      'front_desk',
      'action',
      'card_usage_action_preview',
    ));

    expect(answer?.grounding).toBe('preview_action');
    expect(answer?.suggestedActions?.[0]).toMatchObject({ actionId: 'persisted_action', actionType: 'verify_card_usage', riskLevel: 'critical' });
    expect(actionConfirmation.createPreview).toHaveBeenCalledWith(expect.objectContaining({
      skillKey: 'verify_card_usage',
      riskLevel: 'critical',
      payload: expect.objectContaining({ customerCardId: 66, projectId: 101, times: 1, beauticianId: 2 }),
    }));
  });

  it('front desk adapter refuses card usage preview without the dedicated permission', async () => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never, actionTargets as never);
    const input = execution(
      '给张女士的补水护理 10 次卡核销深层补水护理 1 次，王美容师服务',
      'front_desk',
      'action',
      'card_usage_action_preview',
    );
    input.context = { ...context, permissions: ['core:store:reservations'] };

    await expect(adapter.execute(input)).rejects.toThrow('missing_permission:core:order:card-usage');
  });

  it('front desk adapter asks for an explicit usage count instead of defaulting a deduction', async () => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never, actionTargets as never);
    actionTargets.resolveUsageTimes.mockReturnValueOnce(undefined);

    const answer = await adapter.execute(execution(
      '给张女士的补水护理 10 次卡核销深层补水护理，王美容师服务',
      'front_desk',
      'action',
      'card_usage_action_preview',
    ));

    expect(answer?.suggestedActions).toEqual([]);
    expect(answer?.answer).toContain('明确本次核销次数');
  });

  it('front desk adapter keeps card-status questions read-only instead of turning them into deductions', async () => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never, actionTargets as never);
    const previewCalls = actionConfirmation.createPreview.mock.calls.length;

    const answer = await adapter.execute(execution('这个客人用次卡核销，帮我看一下她的次卡情况', 'front_desk', 'list'));

    expect(answer?.grounding).toBe('db_skill');
    expect(answer?.answer).toContain('客户：张雯');
    expect(actionConfirmation.createPreview).toHaveBeenCalledTimes(previewCalls);
  });

  it('front desk adapter returns reception service advice for onsite questions', async () => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never);
    const answer = await adapter.execute(execution('有客人说要投诉，我应该怎么处理', 'front_desk', 'recommendation'));
    expect(answer?.grounding).toBe('template_skill');
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'front_desk_service_advice' });
    expect(answer?.answer).toContain('投诉接待建议');
  });

  it('front desk adapter handles wait-time and new-customer reception advice', async () => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never);
    const answer = await adapter.execute(execution('客人等待时间太长，我能给她什么补偿或安抚', 'front_desk', 'recommendation'));

    expect(answer?.citations[0]).toMatchObject({ sourceId: 'front_desk_service_advice' });
    expect(answer?.answer).toContain('等待');
    expect(answer?.answer).toContain('店长');
  });

  it.each([
    ['这个客人要退款，原因是项目没做完，怎么处理', '退款/退卡处理建议'],
    ['这个客人想换一个美容师，怎么处理比较好', '更换美容师建议'],
    ['有个客人说她想试一个新项目，适合她吗', '新项目咨询建议'],
  ])('front desk adapter returns controlled service guidance: %s', async (message, expected) => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never);
    const answer = await adapter.execute(execution(message, 'front_desk', 'recommendation'));
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'front_desk_service_advice' });
    expect(answer?.answer).toContain(expected);
  });

  it('front desk adapter performs scoped exact customer lookup', async () => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never);
    const answer = await adapter.execute(execution('帮我查一下张雯，她上次来是什么项目', 'front_desk', 'list'));
    expect(answer?.answer).toContain('张雯');
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'front_desk_customer_exact_lookup' });
  });

  it('front desk adapter does not treat a generic reservation lookup as a customer lookup', async () => {
    customerFacts.answerExactCustomerQuestion.mockClear();
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never);
    const answer = await adapter.execute(execution('帮我查一下明天的预约情况', 'front_desk', 'list'));

    expect(customerFacts.answerExactCustomerQuestion).not.toHaveBeenCalled();
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'front_desk_reservation_schedule' });
  });

  it('front desk adapter treats appointment date correction as a schedule query', async () => {
    customerFacts.answerExactCustomerQuestion.mockClear();
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never);
    const answer = await adapter.execute(execution('不是今天的预约，是明天的', 'front_desk', 'list'));

    expect(customerFacts.answerExactCustomerQuestion).not.toHaveBeenCalled();
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'front_desk_reservation_schedule' });
  });

  it('front desk adapter groups reservation categories and preparation notes', async () => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never);
    const categoryAnswer = await adapter.execute(execution('今天有几个预约是做面部的，几个是身体的', 'front_desk', 'list'));
    const preparationAnswer = await adapter.execute(execution('今天有没有需要特别准备物品的预约', 'front_desk', 'list'));

    expect(categoryAnswer?.answer).toContain('面部 1 个');
    expect(categoryAnswer?.answer).toContain('身体 0 个');
    expect(preparationAnswer?.answer).toContain('准备舒缓产品');
  });

  it('front desk adapter ranks reservation density by date', async () => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never);
    const answer = await adapter.execute(execution('帮我看一下这个月预约最多的是哪几天', 'front_desk', 'ranking'));

    expect(answer?.answer).toContain('预约密度排行');
    expect(answer?.answer).toContain('2026-07-11：1 个');
  });

  it('front desk adapter returns recharge packages and active promotion facts', async () => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never);
    const packageAnswer = await adapter.execute(execution('客人要充值，帮我看一下充值套餐有哪些', 'front_desk', 'list'));
    const promotionAnswer = await adapter.execute(execution('这个客人问最近有没有什么优惠活动', 'front_desk', 'list'));

    expect(packageAnswer?.citations[0]).toMatchObject({ sourceId: 'front_desk_catalog_snapshot' });
    expect(packageAnswer?.answer).toContain('补水护理 10 次卡');
    expect(promotionAnswer?.answer).toContain('新客体验礼');
  });

  it('front desk adapter returns arrival, no-show and resource facts', async () => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never);
    const answer = await adapter.execute(execution('今天预约了但还没来的客人有哪些，床位有空吗', 'front_desk', 'list'));
    expect(answer?.answer).toContain('待到店 2 个');
    expect(answer?.answer).toContain('1号床');
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'front_desk_operations_snapshot' });
  });

  it('front desk adapter returns staff busy, time-off and availability facts', async () => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never);
    const answer = await adapter.execute(execution('帮我看一下今天哪个美容师可以接新单', 'front_desk', 'list'));

    expect(answer?.citations[0]).toMatchObject({ sourceId: 'front_desk_operations_snapshot' });
    expect(answer?.answer).toContain('李美容师：服务中');
    expect(answer?.answer).toContain('王美容师：可接新单');
  });

  it('front desk adapter reports arrival and no-show rates from real reservation facts', async () => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never);
    const answer = await adapter.execute(execution('帮我统计一下今天的到店率，爽约了几个', 'front_desk', 'diagnosis'));

    expect(answer?.answer).toContain('到店率 40.0%');
    expect(answer?.answer).toContain('爽约率 20.0%');
    expect(answer?.answer).toContain('爽约 1 个');
  });

  it('front desk adapter returns arrived customer details instead of only a count', async () => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never);
    const answer = await adapter.execute(execution('帮我看一下今天所有到店客人的基本信息', 'front_desk', 'list'));

    expect(answer?.answer).toContain('到店客户');
    expect(answer?.answer).toContain('赵女士');
    expect(answer?.answer).toContain('清洁护理');
  });

  it('front desk adapter explains service overruns and the impacted next reservation', async () => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never);
    const answer = await adapter.execute(execution('今天有没有超时的预约影响到下一个', 'front_desk', 'diagnosis'));

    expect(skillRuntime.buildReceptionServiceOverrunAnalysis).toHaveBeenCalled();
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'front_desk_service_overrun_analysis' });
    expect(answer?.answer).toContain('影响 15:00 赵女士');
  });

  it('front desk adapter evaluates walk-in availability from staff and resource state', async () => {
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never);
    const answer = await adapter.execute(execution('有个客人临时来了没预约，现在还能安排吗', 'front_desk', 'recommendation'));

    expect(answer?.citations[0]).toMatchObject({ sourceId: 'front_desk_walk_in_availability' });
    expect(answer?.answer).toContain('王美容师');
    expect(answer?.answer).toContain('1号床');
  });

  it('front desk adapter filters a named beautician reservation schedule', async () => {
    skillRuntime.listReceptionReservations.mockResolvedValueOnce({
      count: 2,
      reservations: [
        { date: '2026-07-11', startTime: '10:00', customerName: '李女士', projectName: '补水护理', beauticianName: '赵美容师' },
        { date: '2026-07-11', startTime: '11:00', customerName: '王女士', projectName: '肩颈护理', beauticianName: '王美容师' },
      ],
    });
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never);
    const answer = await adapter.execute(execution('帮我看一下今天赵美容师的预约安排', 'front_desk', 'list'));

    expect(answer?.answer).toContain('赵美容师预约清单');
    expect(answer?.answer).toContain('李女士');
    expect(answer?.answer).not.toContain('王女士');
  });

  it('customer service adapter returns grounded customer lists and care scripts', async () => {
    const adapter = new BrainCustomerServiceDomainAdapter(customerFacts as never, actionConfirmation as never);

    const listAnswer = await adapter.execute(execution('找出好久没来的客户名单', 'customer_service', 'list'));
    const scriptAnswer = await adapter.execute(execution('写一条生日关怀话术', 'customer_service', 'draft'));

    expect(listAnswer?.grounding).toBe('db_skill');
    expect(customerFacts.answerCustomerFactQuestion).toHaveBeenCalled();
    expect(scriptAnswer?.grounding).toBe('template_skill');
    expect(scriptAnswer?.answer).toContain('生日关怀话术');
  });

  it('customer service write requests create an executable customer-scoped follow-up preview', async () => {
    const adapter = new BrainCustomerServiceDomainAdapter(customerFacts as never, actionConfirmation as never, actionTargets as never);
    const answer = await adapter.execute(execution('给张女士创建跟进任务', 'customer_service', 'action'));

    expect(answer?.grounding).toBe('preview_action');
    expect(answer?.suggestedActions?.[0]).toMatchObject({
      actionId: 'persisted_action',
      actionType: 'create_customer_followup',
      requiresConfirmation: true,
      requiredPermissions: ['assist:followup:create'],
    });
    expect(answer?.metadata).toMatchObject({ executionRequiredPermissions: ['assist:followup:create'] });
    expect(actionConfirmation.createPreview).toHaveBeenCalledWith(expect.objectContaining({
      skillKey: 'create_customer_followup',
      payload: expect.objectContaining({ customerId: 7 }),
    }));
  });

  it('beautician adapter returns personal service and commission facts', async () => {
    const adapter = new BrainBeauticianDomainAdapter(skillRuntime as never, timeRangeParser as never, customerFacts as never);
    const answer = await adapter.execute(execution('我这个月个人业绩和服务时长怎么样', 'beautician_service', 'diagnosis'));
    expect(answer?.answer).toContain('关联业绩');
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'beautician_personal_performance' });
  });

  it('beautician adapter answers best-project and repeat-customer performance questions', async () => {
    const adapter = new BrainBeauticianDomainAdapter(skillRuntime as never, timeRangeParser as never, customerFacts as never);
    const answer = await adapter.execute(execution('我这个月做得最好的项目是什么，老客户占多少', 'beautician_service', 'diagnosis'));

    expect(answer?.citations[0]).toMatchObject({ sourceId: 'beautician_personal_performance' });
    expect(answer?.answer).toContain('补水护理 3 单');
    expect(answer?.answer).toContain('重复服务客户 1 人');
  });

  it('beautician adapter compares personal repeat rate with the store average', async () => {
    const adapter = new BrainBeauticianDomainAdapter(skillRuntime as never, timeRangeParser as never, customerFacts as never);
    const answer = await adapter.execute(execution('我的复购率在店里算高还是低', 'beautician_service', 'diagnosis'));

    expect(answer?.citations[0]).toMatchObject({ sourceId: 'beautician_personal_performance' });
    expect(answer?.answer).toContain('个人复购率 25.0%');
    expect(answer?.answer).toContain('店内平均 25.0%');
    expect(answer?.answer).toContain('持平');
  });

  it('beautician adapter requests customer facts before diagnosing an effect complaint', async () => {
    const adapter = new BrainBeauticianDomainAdapter(skillRuntime as never, timeRangeParser as never, customerFacts as never);
    const answer = await adapter.execute(execution('这个客人问为什么护理效果没有朋友说的好', 'beautician_service', 'diagnosis'));

    expect(answer?.citations).toEqual([]);
    expect(answer?.answer).toContain('客户身份');
    expect(answer?.answer).toContain('本次项目');
    expect(answer?.answer).not.toContain('24 小时内发送护理提醒');
  });

  it('beautician adapter prioritizes care advice over pronoun-based exact lookup', async () => {
    customerFacts.answerExactCustomerQuestion.mockClear();
    const adapter = new BrainBeauticianDomainAdapter(skillRuntime as never, timeRangeParser as never, customerFacts as never);
    const answer = await adapter.execute(
      execution('这个客人有过敏史，做项目前我需要注意什么', 'beautician_service', 'recommendation'),
    );

    expect(customerFacts.answerExactCustomerQuestion).not.toHaveBeenCalled();
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'beautician_follow_up_advice' });
    expect(answer?.answer).toContain('过敏');
  });

  it('beautician adapter answers post-care advice instead of falling back to service schedule', async () => {
    const adapter = new BrainBeauticianDomainAdapter(skillRuntime as never, timeRangeParser as never, customerFacts as never);
    const answer = await adapter.execute(execution('这次护理后我应该给她什么建议', 'beautician_service', 'recommendation'));

    expect(answer?.citations[0]).toMatchObject({ sourceId: 'beautician_follow_up_advice' });
    expect(answer?.citations[0]).not.toMatchObject({ sourceId: 'beautician_service_summary' });
  });

  it('beautician adapter still requires exact customer facts for card and treatment history queries', async () => {
    const adapter = new BrainBeauticianDomainAdapter(skillRuntime as never, timeRangeParser as never, customerFacts as never);
    const answer = await adapter.execute(execution('这个客人的疗程还有几次', 'beautician_service', 'list'));

    expect(customerFacts.answerExactCustomerQuestion).toHaveBeenCalled();
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'beautician_customer_care_facts' });
  });

  it('inventory adapter returns SKU, consumption and coverage facts', async () => {
    const adapter = new BrainInventoryDomainAdapter(skillRuntime as never, timeRangeParser as never);
    const answer = await adapter.execute(execution('精华液现在库存还有多少，够用多久', 'inventory_procurement', 'list'));
    expect(answer?.answer).toContain('预计覆盖 20 天');
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'inventory_detail_analysis' });
  });

  it('inventory adapter returns quantity, supplier quote and lead-time based procurement advice', async () => {
    const adapter = new BrainInventoryDomainAdapter(skillRuntime as never, timeRangeParser as never);
    const answer = await adapter.execute(execution('这批补水精华买多少量比较合适，哪个供应商报价更好', 'inventory_procurement', 'recommendation'));

    expect(answer?.citations[0]).toMatchObject({ sourceId: 'inventory_procurement_analysis' });
    expect(answer?.answer).toContain('建议采购 8');
    expect(answer?.answer).toContain('供应商A');
    expect(answer?.answer).toContain('160.00');
  });

  it('finance adapter returns payment split and daily income trend', async () => {
    const adapter = new BrainFinanceDomainAdapter(skillRuntime as never, timeRangeParser as never);
    const answer = await adapter.execute(execution('今天现金、微信、支付宝各收了多少', 'finance_risk', 'list'));
    expect(answer?.answer).toContain('支付拆分');
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'finance_income_analysis' });
  });

  it('finance adapter returns stored-value payment count and amount', async () => {
    const adapter = new BrainFinanceDomainAdapter(skillRuntime as never, timeRangeParser as never);
    const answer = await adapter.execute(execution('今天有几笔是用储值卡消费的', 'finance_risk', 'diagnosis'));

    expect(answer?.citations[0]).toMatchObject({ sourceId: 'finance_income_analysis' });
    expect(answer?.answer).toContain('member_balance 1 笔 300.00');
  });

  it('finance adapter simulates discount margin from real current margin facts', async () => {
    const adapter = new BrainFinanceDomainAdapter(skillRuntime as never, timeRangeParser as never);
    const answer = await adapter.execute(execution('帮我算一下如果打八折，毛利还剩多少', 'finance_risk', 'diagnosis'));

    expect(answer?.citations[0]).toMatchObject({ sourceId: 'finance_discount_margin_simulation' });
    expect(answer?.answer).toContain('8 折');
    expect(answer?.answer).toContain('18.8%');
  });

  it('finance adapter returns real cost, commission and card liability facts', async () => {
    const adapter = new BrainFinanceDomainAdapter(skillRuntime as never, timeRangeParser as never);
    const answer = await adapter.execute(execution('这个月耗材成本、员工提成和储值负债分别多少', 'finance_risk', 'diagnosis'));

    expect(answer?.citations[0]).toMatchObject({ sourceId: 'finance_cost_liability_analysis' });
    expect(answer?.answer).toContain('耗材成本 2000.00');
    expect(answer?.answer).toContain('提成 1000.00');
    expect(answer?.answer).toContain('卡项未履约负债 5000.00');
  });

  it('marketing adapter returns template-skill draft citation', async () => {
    const adapter = new BrainMarketingDomainAdapter(skillRuntime as never, customerFacts as never, timeRangeParser as never, actionConfirmation as never);
    const answer = await adapter.execute(execution('写一条提醒客户预约空档的消息', 'marketing_growth', 'draft'));
    expect(answer?.grounding).toBe('template_skill');
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'marketing_draft_appointment_reminder' });
  });

  it('marketing adapter returns customer segment summary for customer list questions', async () => {
    const adapter = new BrainMarketingDomainAdapter(skillRuntime as never, customerFacts as never, timeRangeParser as never, actionConfirmation as never);
    const answer = await adapter.execute(execution('有没有之前消费很多但突然消失的客户', 'marketing_growth', 'list'));
    expect(answer?.grounding).toBe('db_skill');
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'marketing_customer_segment_summary' });
    expect(answer?.answer).toContain('客户分层');
  });

  it('marketing adapter keeps fact and diagnosis questions on customer fact resolver', async () => {
    const adapter = new BrainMarketingDomainAdapter(skillRuntime as never, customerFacts as never, timeRangeParser as never, actionConfirmation as never);
    const answer = await adapter.execute(execution('有没有客户对优惠很敏感，老是等打折才来', 'marketing_growth', 'diagnosis'));
    expect(answer?.grounding).toBe('db_skill');
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'marketing_customer_segment_summary' });
    expect(skillRuntime.draftCampaignPlan).not.toHaveBeenCalledWith(expect.objectContaining({ theme: undefined }));
    expect(customerFacts.answerCustomerFactQuestion).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('优惠很敏感') }));
  });

  it('marketing adapter returns real touch, conversion and attribution facts without inventing cost', async () => {
    const adapter = new BrainMarketingDomainAdapter(skillRuntime as never, customerFacts as never, timeRangeParser as never, actionConfirmation as never);
    const answer = await adapter.execute(execution('这个月活动带来了多少收入，转化率怎么样', 'marketing_growth', 'diagnosis'));
    expect(answer?.answer).toContain('归因收入');
    expect(answer?.answer).toContain('不计算虚假的 ROI');
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'marketing_attribution_analytics' });
  });

  it('marketing adapter explains a real customer prediction snapshot with version and boundary', async () => {
    const adapter = new BrainMarketingDomainAdapter(
      skillRuntime as never,
      customerFacts as never,
      timeRangeParser as never,
      actionConfirmation as never,
      actionTargets as never,
      predictionSkills as never,
    );
    const answer = await adapter.execute(execution('预测张女士的流失风险和复购概率', 'marketing_growth', 'diagnosis'));

    expect(answer?.citations[0]).toMatchObject({ sourceType: 'prediction', sourceId: '31' });
    expect(answer?.answer).toContain('customer-value-v3');
    expect(answer?.answer).toContain('流失风险 82%');
    expect(answer?.answer).toContain('不是确定事实');
  });

  it('marketing adapter shows an automation rule preview without exposing an unsupported confirmation', async () => {
    const adapter = new BrainMarketingDomainAdapter(skillRuntime as never, customerFacts as never, timeRangeParser as never, actionConfirmation as never);
    const answer = await adapter.execute(execution('帮我设置一个新客来店三天后自动跟进的流程', 'marketing_growth', 'action'));

    expect(answer?.grounding).toBe('preview_action');
    expect(answer?.suggestedActions).toEqual([]);
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'marketing_automation_rule_preview' });
    expect(answer?.answer).toContain('新客到店 3 天后');
    expect(answer?.answer).toContain('不会生成不可执行的确认按钮');
  });

  it('marketing adapter creates a high-risk preview for an existing enabled strategy', async () => {
    const adapter = new BrainMarketingDomainAdapter(
      skillRuntime as never,
      customerFacts as never,
      timeRangeParser as never,
      actionConfirmation as never,
      actionTargets as never,
      predictionSkills as never,
      gapOpportunities as never,
      marketingService as never,
    );
    const answer = await adapter.execute(execution(
      '执行自动触达策略沉睡客户唤醒',
      'marketing_growth',
      'action',
      'marketing_strategy_execute_preview',
    ));

    expect(answer).toMatchObject({ grounding: 'preview_action' });
    expect(answer?.answer).toContain('预计进入发送队列 18 人');
    expect(answer?.suggestedActions?.[0]).toMatchObject({
      actionType: 'execute_marketing_strategy',
      riskLevel: 'high',
      requiresConfirmation: true,
    });
    expect(actionConfirmation.createPreview).toHaveBeenCalledWith(expect.objectContaining({
      skillKey: 'execute_marketing_strategy',
      riskLevel: 'high',
      payload: { strategyId: 12, strategyName: '沉睡客户唤醒', approvedAudienceCount: 18 },
    }));
  });

  it('marketing adapter does not expose a confirmation when the live audience is empty', async () => {
    marketingService.previewAudience.mockResolvedValueOnce({ estimatedReachedCount: 0 });
    const adapter = new BrainMarketingDomainAdapter(
      skillRuntime as never,
      customerFacts as never,
      timeRangeParser as never,
      actionConfirmation as never,
      actionTargets as never,
      predictionSkills as never,
      gapOpportunities as never,
      marketingService as never,
    );

    const answer = await adapter.execute(execution(
      '执行自动触达策略沉睡客户唤醒',
      'marketing_growth',
      'action',
      'marketing_strategy_execute_preview',
    ));

    expect(answer).toMatchObject({ grounding: 'db_skill', suggestedActions: [] });
    expect(answer?.metadata).toMatchObject({ noActionReason: 'marketing_strategy_audience_empty' });
  });

  it('marketing adapter creates a customer-scoped touch task draft preview', async () => {
    const adapter = new BrainMarketingDomainAdapter(skillRuntime as never, customerFacts as never, timeRangeParser as never, actionConfirmation as never, actionTargets as never);
    const answer = await adapter.execute(execution('给张女士创建一个召回触达任务', 'marketing_growth', 'action'));

    expect(answer?.suggestedActions?.[0]).toMatchObject({ actionType: 'create_marketing_touch_draft' });
    expect(actionConfirmation.createPreview).toHaveBeenCalledWith(expect.objectContaining({
      skillKey: 'create_marketing_touch_draft',
      payload: expect.objectContaining({ customerId: 7 }),
    }));
  });

  it('marketing adapter turns a governed gap workflow into one confirmable touch preview', async () => {
    const adapter = new BrainMarketingDomainAdapter(
      skillRuntime as never,
      customerFacts as never,
      timeRangeParser as never,
      actionConfirmation as never,
      actionTargets as never,
      predictionSkills as never,
      gapOpportunities as never,
    );
    const answer = await adapter.execute(execution(
      '找出明天下午空档、筛合适客户、写提醒并生成触达预览',
      'marketing_growth',
      'action',
      'gap_fill_touch_preview',
    ));

    expect(gapOpportunities.preview).toHaveBeenCalledWith(expect.objectContaining({
      storeId: 2,
      opportunityLimit: 3,
      candidateLimit: 3,
    }));
    expect(answer).toMatchObject({
      grounding: 'preview_action',
      metadata: expect.objectContaining({
        capabilityKey: 'gap_fill_touch_preview',
        selectedCustomerId: 7,
        businessDataPersisted: false,
      }),
    });
    expect(answer?.answer).toContain('张女士');
    expect(answer?.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'table' }),
      expect.objectContaining({ kind: 'action_preview' }),
    ]));
    expect(actionConfirmation.createPreview).toHaveBeenCalledWith(expect.objectContaining({
      skillKey: 'create_marketing_touch_draft',
      payload: expect.objectContaining({ customerId: 7, channel: 'phone' }),
    }));
  });

  it('marketing adapter returns grounded no-data without a fake action when future schedules are missing', async () => {
    gapOpportunities.preview.mockResolvedValueOnce({
      persisted: false,
      summary: { opportunityCount: 0, candidateCount: 0 },
      opportunities: [],
    });
    const adapter = new BrainMarketingDomainAdapter(
      skillRuntime as never,
      customerFacts as never,
      timeRangeParser as never,
      actionConfirmation as never,
      actionTargets as never,
      predictionSkills as never,
      gapOpportunities as never,
    );
    const answer = await adapter.execute(execution(
      '规划一个补齐明天下午空档的完整流程',
      'marketing_growth',
      'action',
      'gap_fill_touch_preview',
    ));

    expect(answer).toMatchObject({
      grounding: 'db_skill',
      suggestedActions: [],
      metadata: expect.objectContaining({ noActionReason: 'appointment_gap_missing', businessDataPersisted: false }),
    });
    expect(answer?.answer).toContain('没有可补位的预约空档');
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'gap_opportunity_readonly_preview' });
  });

  it('beautician adapter returns service schedule citation', async () => {
    const adapter = new BrainBeauticianDomainAdapter(skillRuntime as never, timeRangeParser as never, customerFacts as never);
    const answer = await adapter.execute(execution('下一个客人有什么注意事项', 'beautician_service', 'list'));
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'beautician_service_summary' });
    expect(answer?.answer).toContain('今日服务安排');
  });

  it('beautician adapter creates an exact service-task record preview', async () => {
    const adapter = new BrainBeauticianDomainAdapter(
      skillRuntime as never,
      timeRangeParser as never,
      customerFacts as never,
      actionConfirmation as never,
      actionTargets as never,
    );
    const answer = await adapter.execute(execution('记录张女士本次服务记录：补水护理完成，皮肤状态稳定', 'beautician_service', 'action'));

    expect(answer?.grounding).toBe('preview_action');
    expect(answer?.suggestedActions?.[0]).toMatchObject({ actionType: 'save_service_record' });
    expect(actionConfirmation.createPreview).toHaveBeenCalledWith(expect.objectContaining({
      skillKey: 'save_service_record',
      payload: expect.objectContaining({ taskId: 51 }),
    }));
  });

  it('honors the governed service-record capability before text heuristics', async () => {
    const adapter = new BrainBeauticianDomainAdapter(
      skillRuntime as never,
      timeRangeParser as never,
      customerFacts as never,
      actionConfirmation as never,
      actionTargets as never,
    );
    const answer = await adapter.execute(execution(
      '为当前客户生成服务记录待确认方案，护理完成且无明显不适',
      'beautician_service',
      'action',
      'service_record_completion_preview',
    ));

    expect(answer).toMatchObject({
      grounding: 'preview_action',
      suggestedActions: [expect.objectContaining({ actionType: 'save_service_record', requiresConfirmation: true })],
    });
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'beautician_service_record_preview' });
    expect(actionConfirmation.createPreview).toHaveBeenCalledWith(expect.objectContaining({
      skillKey: 'save_service_record',
      payload: expect.objectContaining({ taskId: 51 }),
    }));
  });

  it('inventory adapter returns low-stock list citation', async () => {
    const adapter = new BrainInventoryDomainAdapter(skillRuntime as never, timeRangeParser as never);
    const answer = await adapter.execute(execution('现在哪些产品库存不够了', 'inventory_procurement', 'list'));
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'inventory_risk_summary' });
    expect(answer?.answer).toContain('低库存产品');
  });

  it('inventory adapter keeps purchase suggestions grounded as procurement analysis', async () => {
    const adapter = new BrainInventoryDomainAdapter(skillRuntime as never, timeRangeParser as never);
    const answer = await adapter.execute(execution('下次采购需要补什么货', 'inventory_procurement', 'list'));
    expect(answer?.grounding).toBe('db_skill');
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'inventory_procurement_analysis' });
  });

  it('inventory adapter creates a priced purchase order approval preview', async () => {
    const adapter = new BrainInventoryDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never);
    const answer = await adapter.execute(execution('按建议生成采购单并提交审批', 'inventory_procurement', 'action'));

    expect(answer?.grounding).toBe('preview_action');
    expect(answer?.suggestedActions?.[0]).toMatchObject({ actionType: 'create_purchase_order', riskLevel: 'high' });
    expect(actionConfirmation.createPreview).toHaveBeenCalledWith(expect.objectContaining({
      skillKey: 'create_purchase_order',
      payload: expect.objectContaining({ supplier: '供应商A', submitForApproval: true }),
    }));
  });

  it('finance adapter returns finance-risk citation', async () => {
    const adapter = new BrainFinanceDomainAdapter(skillRuntime as never, timeRangeParser as never);
    const answer = await adapter.execute(execution('今天退款有几笔，金额多少', 'finance_risk'));
    expect(answer?.citations[0]).toMatchObject({ sourceId: 'finance_risk_summary' });
    expect(answer?.answer).toContain('退款 2 笔');
  });

  it('front desk capability bridge enters reservation preview without keyword routing', async () => {
    actionConfirmation.createPreview.mockClear();
    const adapter = new BrainFrontDeskDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never, customerFacts as never, actionTargets as never);

    const answer = await adapter.execute(
      execution('执行已选择的能力', 'front_desk', 'diagnosis', 'reservation_action_preview'),
    );

    expect(answer?.grounding).toBe('preview_action');
    expect(actionConfirmation.createPreview).toHaveBeenCalledWith(
      expect.objectContaining({ skillKey: 'create_reservation' }),
    );
  });

  it('customer service capability bridge enters follow-up preview without keyword routing', async () => {
    actionConfirmation.createPreview.mockClear();
    const adapter = new BrainCustomerServiceDomainAdapter(customerFacts as never, actionConfirmation as never, actionTargets as never);

    const answer = await adapter.execute(
      execution('执行已选择的能力', 'customer_service', 'diagnosis', 'customer_follow_up_draft'),
    );

    expect(answer?.grounding).toBe('preview_action');
    expect(actionConfirmation.createPreview).toHaveBeenCalledWith(
      expect.objectContaining({ skillKey: 'create_customer_followup' }),
    );
  });

  it('inventory capability bridge enters purchase order preview without keyword routing', async () => {
    actionConfirmation.createPreview.mockClear();
    skillRuntime.buildInventoryProcurementAnalysis.mockClear();
    const adapter = new BrainInventoryDomainAdapter(skillRuntime as never, timeRangeParser as never, actionConfirmation as never);

    const answer = await adapter.execute(
      execution('执行已选择的能力', 'inventory_procurement', 'diagnosis', 'purchase_order_draft'),
    );

    expect(skillRuntime.buildInventoryProcurementAnalysis).toHaveBeenCalledWith({ storeId: 2, keyword: undefined });
    expect(answer?.grounding).toBe('preview_action');
    expect(actionConfirmation.createPreview).toHaveBeenCalledWith(
      expect.objectContaining({ skillKey: 'create_purchase_order' }),
    );
  });

  it('marketing capability bridge enters touch preview without keyword routing', async () => {
    actionConfirmation.createPreview.mockClear();
    const adapter = new BrainMarketingDomainAdapter(skillRuntime as never, customerFacts as never, timeRangeParser as never, actionConfirmation as never, actionTargets as never);

    const answer = await adapter.execute(
      execution('执行已选择的能力', 'marketing_growth', 'diagnosis', 'marketing_touch_draft'),
    );

    expect(answer?.grounding).toBe('preview_action');
    expect(actionConfirmation.createPreview).toHaveBeenCalledWith(
      expect.objectContaining({ skillKey: 'create_marketing_touch_draft' }),
    );
  });
});
