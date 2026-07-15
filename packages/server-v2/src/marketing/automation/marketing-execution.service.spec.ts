import { MarketingExecutionService } from './marketing-execution.service';
import { MarketingAudienceService } from './marketing-audience.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('MarketingExecutionService', () => {
  const customers = Array.from({ length: 1000 }, (_, index) => ({
    id: index + 1,
    storeId: 6,
    prediction: { id: index + 1001 },
    predictedConversionScore: 70,
    predictedRevenue: 180,
    reason: '高营销响应',
  }));
  const touches = customers.map((customer, index) => ({
    id: index + 2001,
    customerId: customer.id,
  }));
  const prisma = {
    $transaction: jest.fn(async (callback: any) => callback(prisma)),
    $queryRaw: jest.fn(),
    marketingAutomationExecution: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    marketingAutomationStrategy: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    marketingAutomationTouch: {
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    marketingDeliveryJob: {
      createMany: jest.fn(),
    },
  } as any;
  const audience = {
    buildForStrategy: jest.fn(),
  } as any;
  let service: MarketingExecutionService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    prisma.$queryRaw.mockReset();
    prisma.marketingAutomationExecution.findUnique.mockResolvedValue(null);
    prisma.marketingAutomationExecution.create.mockResolvedValue({ id: 90, status: 'pending' });
    prisma.marketingAutomationExecution.update.mockImplementation(async ({ data }: any) => ({ id: 90, ...data }));
    prisma.marketingAutomationStrategy.findFirst.mockResolvedValue({
      id: 12,
      storeId: 6,
      name: '护理召回',
      status: 'enabled',
      triggerRules: [],
      ruleRelation: 'AND',
      actions: [{ channel: 'terminal', content: '请联系客户确认护理计划' }],
    });
    prisma.marketingAutomationTouch.createMany.mockResolvedValue({ count: 500 });
    prisma.marketingAutomationTouch.findMany.mockResolvedValue(touches);
    prisma.marketingDeliveryJob.createMany.mockResolvedValue({ count: 500 });
    prisma.marketingAutomationStrategy.update.mockResolvedValue({});
    audience.buildForStrategy.mockResolvedValue({
      customers,
      totalCustomers: 1252,
      total: 1000,
      source: {
        predictionRunId: 53,
        audienceSnapshotId: null,
        ruleHash: 'rule-hash',
        totalCustomerCount: 1252,
        matchedCustomerCount: 1000,
        eligibleCustomerCount: 1000,
        frequencyCapFilteredCount: 0,
        generatedAt: '2026-07-13T02:00:00.000Z',
      },
    });
    service = new MarketingExecutionService(prisma as PrismaService, audience as MarketingAudienceService);
  });

  it('creates one touch and one delivery job per eligible customer in fixed batches', async () => {
    const result = await service.start(12, 6, 'daily-2026-07-13-10:00');

    expect(result).toEqual(expect.objectContaining({ id: 90, status: 'pending', queuedCount: 1000 }));
    expect(prisma.marketingAutomationTouch.createMany).toHaveBeenCalledTimes(2);
    expect(prisma.marketingDeliveryJob.createMany).toHaveBeenCalledTimes(2);
    expect(prisma.marketingAutomationTouch.createMany.mock.calls[0][0].data).toHaveLength(500);
    expect(prisma.marketingDeliveryJob.createMany.mock.calls[1][0].data).toHaveLength(500);
    expect(prisma.marketingAutomationExecution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: 6,
          status: 'pending',
          triggeredCount: 1000,
          queuedCount: 1000,
          audienceSnapshotJson: expect.objectContaining({ predictionRunId: 53, ruleHash: 'rule-hash' }),
        }),
      }),
    );
  });

  it('returns the existing execution for the same strategy window', async () => {
    prisma.marketingAutomationExecution.findUnique.mockResolvedValue({ id: 91, status: 'running' });

    const result = await service.start(12, 6, 'daily-2026-07-13-10:00');

    expect(result).toEqual({ id: 91, status: 'running' });
    expect(audience.buildForStrategy).not.toHaveBeenCalled();
    expect(prisma.marketingAutomationTouch.createMany).not.toHaveBeenCalled();
  });

  it('initializes a persisted audience snapshot in one atomic database statement', async () => {
    prisma.marketingAutomationStrategy.findFirst.mockResolvedValue({
      id: 12,
      storeId: 6,
      name: '千人站内通知',
      status: 'enabled',
      triggerRules: [],
      ruleRelation: 'AND',
      actions: [{ channel: 'in_app', title: '服务提醒', content: '请查看本周护理建议' }],
      predictionRunId: 53,
      audienceSnapshotId: 'snapshot-1000',
    });
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 92,
        storeId: 6,
        strategyId: 12,
        status: 'pending',
        triggeredCount: 1000,
        queuedCount: 1000,
        reachedCount: 0,
        failedCount: 0,
      },
    ]);
    audience.buildForStrategy.mockRejectedValue(new Error('snapshot fast path must not materialize 1000 customers'));

    const result = await service.start(12, 6, 'daily-2026-07-13-11:00');

    expect(result).toEqual(expect.objectContaining({ id: 92, status: 'pending', queuedCount: 1000 }));
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(audience.buildForStrategy).not.toHaveBeenCalled();
    expect(prisma.marketingAutomationTouch.createMany).not.toHaveBeenCalled();
    expect(prisma.marketingDeliveryJob.createMany).not.toHaveBeenCalled();
  });
});
