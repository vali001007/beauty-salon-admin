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

  it('returns schema pending instead of throwing when lifecycle tables are unavailable', async () => {
    delete prisma.customerLifecycleSnapshot;

    await expect(service.rebuild(1)).resolves.toMatchObject({
      rebuilt: false,
      reason: 'customer_lifecycle_schema_pending',
    });
  });
});
