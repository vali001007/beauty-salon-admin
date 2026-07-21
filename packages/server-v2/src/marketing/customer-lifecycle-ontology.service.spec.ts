import { CustomerLifecycleOntologyService } from './customer-lifecycle-ontology.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CustomerLifecycleOntologyService', () => {
  let service: CustomerLifecycleOntologyService;
  let prisma: jest.Mocked<any>;

  beforeEach(() => {
    prisma = {
      predictionRun: {
        findFirst: jest.fn().mockResolvedValue({ id: 88, storeId: 1, modelVersion: 'rules-v2.1', status: 'completed' }),
        findUnique: jest.fn().mockResolvedValue({ id: 88, storeId: 1, modelVersion: 'rules-v2.1', status: 'completed' }),
      },
      customer: {
        findMany: jest.fn(),
      },
      customerPredictionSnapshot: {
        findMany: jest.fn(),
      },
      customerBehaviorEvent: {
        findMany: jest.fn(),
      },
      customerLifecycleSnapshot: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
      customerLifecycleEvent: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      customerOpportunity: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      marketingAutomationTouch: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      reservation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      productOrder: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      lifecycleBusinessPlan: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      agentRun: {
        create: jest.fn(),
      },
      agentApproval: {
        create: jest.fn(),
      },
    };
    service = new CustomerLifecycleOntologyService(prisma as unknown as PrismaService);
  });

  it('rebuilds lifecycle snapshots and P0 opportunities from prediction, card, touch, and behavior signals', async () => {
    const now = new Date();
    prisma.customer.findMany.mockResolvedValue([
      {
        id: 1,
        storeId: 1,
        name: '王女士',
        createdAt: new Date(now.getTime() - 120 * 86400000),
        lastVisitDate: new Date(now.getTime() - 35 * 86400000),
        visitCount: 6,
        totalSpent: 28000,
        customerCards: [
          {
            id: 11,
            status: 'active',
            remainingTimes: 2,
            expiryDate: new Date(now.getTime() + 10 * 86400000),
            cardName: '补水疗程卡',
          },
        ],
        consumptionRecords: [{ consumeContent: '补水护理', consumeTime: new Date(now.getTime() - 35 * 86400000) }],
        marketingTouches: [
          { status: 'reached', touchedAt: new Date(now.getTime() - 3 * 86400000) },
          { status: 'reached', touchedAt: new Date(now.getTime() - 5 * 86400000) },
        ],
        customerAppEvents: [{ eventType: 'project_view', occurredAt: new Date(now.getTime() - 2 * 86400000) }],
        recommendationEvents: [],
      },
    ]);
    prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
      {
        id: 31,
        runId: 88,
        storeId: 1,
        customerId: 1,
        ltvTier: '黄金',
        churnLevel: '中',
        churnScore: 30,
        repurchase30dScore: 80,
        marketingResponseScore: 82,
        featureJson: { cardExpiryUrgencyScore: 80 },
      },
    ]);
    prisma.customerBehaviorEvent.findMany.mockResolvedValue([
      { customerId: 1, eventType: 'promotion_claimed', occurredAt: new Date(now.getTime() - 4 * 86400000) },
      { customerId: 1, eventType: 'project_view', occurredAt: new Date(now.getTime() - 1 * 86400000) },
    ]);

    const result = await service.rebuild(1, { predictionRunId: 88 });

    expect(result).toMatchObject({ rebuilt: true, predictionRunId: 88, snapshotCount: 1 });
    expect(prisma.customerLifecycleSnapshot.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        lifecycleStage: 'growth',
        ltvTier: '黄金',
        touchFatigueScore: 1,
        evidenceJson: expect.arrayContaining(['客户价值层级 黄金']),
      }),
    }));
    const opportunityTypes = prisma.customerOpportunity.upsert.mock.calls.map((call: any[]) => call[0].create.opportunityType);
    expect(opportunityTypes).toEqual(expect.arrayContaining(['care_cycle_due', 'card_expiring', 'coupon_claimed_unused', 'browse_abandonment']));
  });

  it('detects dormant winback opportunities for high churn customers', async () => {
    prisma.customer.findMany.mockResolvedValue([
      {
        id: 2,
        storeId: 1,
        name: '李女士',
        createdAt: new Date(Date.now() - 400 * 86400000),
        lastVisitDate: new Date(Date.now() - 190 * 86400000),
        visitCount: 5,
        totalSpent: 6000,
        customerCards: [],
        consumptionRecords: [],
        marketingTouches: [],
        customerAppEvents: [],
        recommendationEvents: [],
      },
    ]);
    prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
      { id: 32, runId: 88, storeId: 1, customerId: 2, ltvTier: '白银', churnLevel: '极高', churnScore: 86, repurchase30dScore: 20, marketingResponseScore: 40, featureJson: {} },
    ]);
    prisma.customerBehaviorEvent.findMany.mockResolvedValue([]);

    await service.rebuild(1);

    expect(prisma.customerLifecycleSnapshot.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ lifecycleStage: 'dormant', churnRiskLevel: '极高' }),
    }));
    expect(prisma.customerOpportunity.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        opportunityType: 'dormant_winback',
        priority: 'P0',
        recommendedExecutionMode: 'activity',
      }),
    }));
  });

  it('links a dormant touch to later reservation, arrival, and attributed order evidence', async () => {
    const touchedAt = new Date('2026-07-05T02:00:00.000Z');
    prisma.marketingAutomationTouch.findMany.mockResolvedValue([{
      id: 501,
      customerId: 21,
      status: 'clicked',
      channel: 'wechat',
      touchedAt,
      convertedAt: null,
      conversionType: null,
      actualRevenue: 688,
      attributionWindowDays: 30,
      customer: {
        id: 21,
        name: '赵女士',
        memberLevel: '金卡',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      },
      predictionSnapshot: {
        churnLevel: 'high',
        churnScore: 82,
        createdAt: new Date('2026-07-04T02:00:00.000Z'),
      },
      attributions: [{
        orderId: 801,
        attributedRevenue: 688,
        occurredAt: new Date('2026-07-12T03:00:00.000Z'),
      }],
    }]);
    prisma.marketingAutomationTouch.count.mockResolvedValue(1);
    prisma.customerOpportunity.findMany.mockResolvedValue([]);
    prisma.reservation.findMany.mockResolvedValue([{
      id: 701,
      customerId: 21,
      createdAt: new Date('2026-07-08T03:00:00.000Z'),
      checkedInAt: new Date('2026-07-11T03:00:00.000Z'),
      date: new Date('2026-07-11T00:00:00.000Z'),
      status: 'completed',
    }]);
    prisma.productOrder.findMany.mockResolvedValue([{
      id: 801,
      customerId: 21,
      createdAt: new Date('2026-07-12T03:00:00.000Z'),
      netAmount: 688,
    }]);

    const result = await service.getDormantReactivationEvidence(1, {
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-17T23:59:59.999Z'),
    });

    expect(result).toMatchObject({
      dormantCandidateCount: 1,
      reactivatedCustomerCount: 1,
      strongSignalCustomerCount: 1,
      explicitAttributionCustomerCount: 1,
    });
    expect(result.rows[0]).toMatchObject({
      customerName: '赵女士',
      signalLevel: 'strong',
      attributionConfidence: 'explicit_attribution',
      attributedRevenue: 688,
      signalTypes: expect.arrayContaining(['attributed_order', 'order', 'arrival', 'reservation', 'touch_clicked']),
    });
    expect(prisma.marketingAutomationTouch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ customer: { storeId: 1, deletedAt: null } }),
    }));
    expect(prisma.productOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 1 }),
    }));
  });

  it('does not treat delivery alone or a newly created customer as reactivation evidence', async () => {
    const touchedAt = new Date('2026-07-10T02:00:00.000Z');
    prisma.marketingAutomationTouch.findMany.mockResolvedValue([
      {
        id: 601,
        customerId: 31,
        status: 'delivered',
        channel: 'sms',
        touchedAt,
        convertedAt: null,
        conversionType: null,
        actualRevenue: 0,
        attributionWindowDays: 30,
        customer: { id: 31, name: '陈女士', memberLevel: '银卡', createdAt: new Date('2025-01-01T00:00:00.000Z') },
        predictionSnapshot: { churnLevel: 'dormant', churnScore: 75, createdAt: new Date('2026-07-09T02:00:00.000Z') },
        attributions: [],
      },
      {
        id: 602,
        customerId: 32,
        status: 'clicked',
        channel: 'wechat',
        touchedAt,
        convertedAt: null,
        conversionType: null,
        actualRevenue: 0,
        attributionWindowDays: 30,
        customer: { id: 32, name: '新客户', memberLevel: '普通', createdAt: new Date('2026-07-01T00:00:00.000Z') },
        predictionSnapshot: null,
        attributions: [],
      },
    ]);
    prisma.marketingAutomationTouch.count.mockResolvedValue(2);
    prisma.customerOpportunity.findMany.mockResolvedValue([]);

    const result = await service.getDormantReactivationEvidence(1, {
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-17T23:59:59.999Z'),
    });

    expect(result).toMatchObject({
      touchCountAnalyzed: 2,
      dormantCandidateCount: 1,
      reactivatedCustomerCount: 0,
    });
    expect(result.rows).toEqual([]);
  });

  it('returns schema pending instead of throwing when lifecycle tables are unavailable', async () => {
    delete prisma.customerLifecycleSnapshot;

    await expect(service.rebuild(1)).resolves.toMatchObject({
      rebuilt: false,
      reason: 'customer_lifecycle_schema_pending',
    });
  });

  it('resolves an explicit prediction run only inside the current store', async () => {
    prisma.predictionRun.findFirst.mockResolvedValue({ id: 99, storeId: 1, status: 'completed' });
    prisma.customer.findMany.mockResolvedValue([]);

    await service.rebuild(1, { predictionRunId: 99 });

    expect(prisma.predictionRun.findFirst).toHaveBeenCalledWith({
      where: { id: 99, storeId: 1, status: 'completed' },
    });
    expect(prisma.predictionRun.findUnique).not.toHaveBeenCalled();
  });

  it('submits lifecycle business plan approval as agent_v4 when called from Agent V4', async () => {
    prisma.lifecycleBusinessPlan.findFirst.mockResolvedValue({
      id: 9,
      storeId: 1,
      planPeriod: '2026-W28',
      title: 'Agent V4 客户生命周期经营周计划',
      actionsJson: [{ id: 'act-1', title: '护理周期召回' }],
      evidenceJson: ['护理周期到期'],
    });
    prisma.agentRun.create.mockResolvedValue({ id: 101, runNo: 'run-v4', agentCode: 'agent_v4' });
    prisma.agentApproval.create.mockResolvedValue({ id: 201, status: 'pending' });
    prisma.lifecycleBusinessPlan.update.mockResolvedValue({ id: 9, status: 'waiting_approval' });

    const result = await service.submitBusinessPlanActions(9, 1, {
      sourceAgentCode: 'agent_v4',
      sourceRunId: 401,
      sourceEntrypoint: 'ami-agent:auto',
    }, 2);

    expect(prisma.agentRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        agentCode: 'agent_v4',
        entrypoint: 'ami-agent:auto',
        planJson: expect.objectContaining({ sourceRunId: 401 }),
        contextJson: expect.objectContaining({ sourceAgentCode: 'agent_v4', sourceRunId: 401 }),
      }),
    }));
    expect(result).toMatchObject({ submitted: true, approvalRequired: true });
  });

  it('groups lifecycle business plan actions by opportunity type and execution mode', async () => {
    const checkedAt = new Date('2026-07-08T10:00:00.000Z');
    prisma.customerOpportunity.findMany.mockResolvedValue([
      {
        id: 301,
        storeId: 1,
        customerId: 11,
        opportunityType: 'dormant_winback',
        recommendedExecutionMode: 'activity',
        evidenceJson: ['客户 11 超过 180 天未到店'],
        fulfillmentChecks: [{ id: 1, opportunityId: 301, inventoryReady: true, capacityReady: true, riskJson: [], checkedAt }],
      },
      {
        id: 302,
        storeId: 1,
        customerId: 12,
        opportunityType: 'dormant_winback',
        recommendedExecutionMode: 'activity',
        evidenceJson: ['客户 12 超过 180 天未到店'],
        fulfillmentChecks: [{ id: 2, opportunityId: 302, inventoryReady: true, capacityReady: false, riskJson: ['未来 7 天未找到足够可预约产能'], checkedAt }],
      },
      {
        id: 303,
        storeId: 1,
        customerId: 13,
        opportunityType: 'coupon_claimed_unused',
        recommendedExecutionMode: 'automation',
        evidenceJson: ['领券后 7 天未核销'],
        fulfillmentChecks: [],
      },
    ]);
    prisma.lifecycleBusinessPlan.create.mockImplementation(async ({ data }: any) => ({ id: 77, ...data }));

    const plan = await service.createBusinessPlan({ planPeriod: '2026-W28' }, 1, 2);
    const actions = plan.actionsJson;
    const dormantAction = actions.find((item: any) => item.opportunityType === 'dormant_winback');
    const couponAction = actions.find((item: any) => item.opportunityType === 'coupon_claimed_unused');

    expect(actions).toHaveLength(2);
    expect(dormantAction).toMatchObject({
      actionType: 'activity_draft',
      opportunityIds: [301, 302],
      customerIds: [11, 12],
      targetCustomerCount: 2,
      fulfillment: expect.objectContaining({
        inventoryReady: true,
        capacityReady: false,
        checkedOpportunityCount: 2,
      }),
    });
    expect(dormantAction.riskControls).toEqual(expect.arrayContaining([
      '审批后执行草稿',
      '未来 7 天产能不足，建议先转顾问小范围邀约。',
    ]));
    expect(couponAction).toMatchObject({
      actionType: 'automation_draft',
      targetCustomerCount: 1,
    });
  });

  it('creates lifecycle attribution events from touch, behavior, reservation, card usage, and order facts', async () => {
    const now = new Date('2026-07-08T10:00:00.000Z');
    prisma.lifecycleAttributionEvent = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 900, ...data })),
    };
    prisma.customerOpportunity.upsert.mockImplementation(async ({ create }: any) => ({
      id: Number(create.customerId) * 100 + prisma.customerOpportunity.upsert.mock.calls.length,
      ...create,
    }));
    prisma.customer.findMany.mockResolvedValue([
      {
        id: 21,
        storeId: 1,
        name: '赵女士',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        lastVisitDate: new Date('2026-05-01T00:00:00.000Z'),
        visitCount: 8,
        totalSpent: 12000,
        customerCards: [],
        cardUsageRecords: [{ id: 61, customerId: 21, projectName: '补水护理', times: 1, recognizedAmount: 188, verifiedAt: now }],
        reservations: [{ id: 71, customerId: 21, projectId: 7, project: { name: '补水护理' }, createdAt: now, checkedInAt: null }],
        productOrders: [{ id: 81, orderNo: 'PO-81', customerId: 21, status: 'completed', netAmount: 388, totalAmount: 388, createdAt: now }],
        consumptionRecords: [],
        marketingTouches: [
          { id: 51, customerId: 21, status: 'converted', channel: '微信', touchedAt: now, convertedAt: now, actualRevenue: 388 },
          { id: 52, customerId: 21, status: 'queued', channel: '短信', touchedAt: now, convertedAt: null, actualRevenue: 0 },
          { id: 53, customerId: 21, status: 'failed', channel: '微信', touchedAt: now, convertedAt: null, actualRevenue: 0 },
          { id: 54, customerId: 21, status: 'reached', channel: '终端', touchedAt: now, convertedAt: null, actualRevenue: 0 },
        ],
        customerAppEvents: [{ id: 41, customerId: 21, eventType: 'project_view', pageTitle: '补水护理详情', occurredAt: now, source: 'ami_glow' }],
        recommendationEvents: [{ id: 91, customerId: 21, eventType: 'advisor_accept', note: '顾问已承接推荐', createdAt: now }],
      },
    ]);
    prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
      { id: 321, runId: 88, storeId: 1, customerId: 21, ltvTier: '黄金', churnLevel: '低', churnScore: 12, repurchase30dScore: 88, marketingResponseScore: 86, featureJson: {} },
    ]);
    prisma.customerBehaviorEvent.findMany.mockResolvedValue([
      { id: 31, customerId: 21, eventType: 'promotion_claimed', occurredAt: now },
    ]);

    const result: any = await service.rebuild(1, { predictionRunId: 88, includeServiceCycles: false, includeFulfillmentChecks: false, includeAttribution: true });

    expect(result.attributionEventCount).toBeGreaterThanOrEqual(6);
    const eventTypes = prisma.lifecycleAttributionEvent.create.mock.calls.map((call: any[]) => call[0].data.eventType);
    expect(eventTypes).toEqual(expect.arrayContaining([
      'touch_converted',
      'coupon_claimed',
      'behavior_view',
      'reservation_created',
      'card_usage_verified',
      'order_completed',
    ]));
    expect(prisma.lifecycleAttributionEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        recommendationKey: expect.stringMatching(/^lifecycle:/),
        sourceId: expect.any(String),
      }),
    }));
    const attributedTouchIds = prisma.lifecycleAttributionEvent.create.mock.calls
      .map((call: any[]) => call[0].data.touchId)
      .filter(Boolean);
    expect(new Set(attributedTouchIds)).toEqual(new Set([51]));
  });

  it('keeps direct lifecycle business plan approval compatible with the legacy agent code', async () => {
    prisma.lifecycleBusinessPlan.findFirst.mockResolvedValue({
      id: 10,
      storeId: 1,
      planPeriod: '2026-W28',
      title: '客户生命周期经营周计划',
      actionsJson: [{ id: 'act-1', title: '沉睡召回' }],
      evidenceJson: ['沉睡客户召回'],
    });
    prisma.agentRun.create.mockResolvedValue({ id: 102, runNo: 'run-legacy', agentCode: 'lifecycle_business_agent' });
    prisma.agentApproval.create.mockResolvedValue({ id: 202, status: 'pending' });
    prisma.lifecycleBusinessPlan.update.mockResolvedValue({ id: 10, status: 'waiting_approval' });

    await service.submitBusinessPlanActions(10, 1, {}, 2);

    expect(prisma.agentRun.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        agentCode: 'lifecycle_business_agent',
        entrypoint: 'ami-agent:lifecycle-business-plan',
      }),
    }));
  });

  it('reads opportunity fulfillment only inside the current store', async () => {
    prisma.customerOpportunityFulfillmentCheck = {
      findMany: jest.fn().mockResolvedValue([]),
    };

    await (service as any).getOpportunityFulfillment(301, 1);

    expect(prisma.customerOpportunityFulfillmentCheck.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { opportunityId: 301, opportunity: { storeId: 1 } },
    }));
  });

  it('ignores body store overrides when creating lifecycle rules and plans', async () => {
    prisma.customerLifecycleRuleVersion = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 1 }),
    };
    prisma.lifecycleBusinessPlan.create.mockResolvedValue({ id: 2 });
    prisma.customerOpportunity.findMany.mockResolvedValue([]);

    await (service as any).createRule({ storeId: 999, ruleType: 'churn' }, 1);
    await (service as any).createBusinessPlan({ storeId: 999 }, 1, 9);

    expect(prisma.customerLifecycleRuleVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ storeId: 1 }),
    }));
    expect(prisma.lifecycleBusinessPlan.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ storeId: 1, createdBy: 9 }),
    }));
  });

  it('scopes lifecycle rule publication and business plan submission by store', async () => {
    const rule = { id: 5, storeId: 1, ruleType: 'churn', version: 2 };
    prisma.customerLifecycleRuleVersion = {
      findFirst: jest.fn().mockResolvedValue(rule),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({ ...rule, status: 'active' }),
    };
    prisma.lifecycleBusinessPlan.findFirst = jest.fn().mockResolvedValue({
      id: 9,
      storeId: 1,
      planPeriod: '2026-W28',
      title: '门店计划',
      actionsJson: [],
      evidenceJson: [],
    });
    prisma.agentRun.create.mockResolvedValue({ id: 101 });
    prisma.agentApproval.create.mockResolvedValue({ id: 201 });
    prisma.lifecycleBusinessPlan.update.mockResolvedValue({ id: 9, status: 'waiting_approval' });

    await (service as any).publishRule(5, 1, 9);
    await (service as any).submitBusinessPlanActions(9, 1, {}, 9);

    expect(prisma.customerLifecycleRuleVersion.findFirst).toHaveBeenCalledWith({ where: { id: 5, storeId: 1 } });
    expect(prisma.lifecycleBusinessPlan.findFirst).toHaveBeenCalledWith({ where: { id: 9, storeId: 1 } });
  });
});
