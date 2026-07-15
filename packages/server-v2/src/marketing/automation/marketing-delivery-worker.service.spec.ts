import { MarketingDeliveryWorkerService } from './marketing-delivery-worker.service';
import { MarketingChannelService } from '../marketing-channel.service';
import { MarketingFeatureFlagsService } from '../marketing-feature-flags.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('MarketingDeliveryWorkerService', () => {
  const prisma = {
    $transaction: jest.fn(async (callback: any) => callback(prisma)),
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    marketingDeliveryJob: {
      updateMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    marketingAutomationTouch: {
      update: jest.fn(),
    },
    marketingAutomationExecution: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    marketingEffectFact: {
      createMany: jest.fn(),
    },
  } as any;
  const channel = { deliver: jest.fn(), deliverBatch: jest.fn() } as any;
  const flags = {
    deliveryJobEngine: true,
    effectFactWrite: true,
    enabledStoreIds: jest.fn(),
    isEnabledForStore: jest.fn(),
  } as any;
  const facts = { recordFact: jest.fn() } as any;
  let service: MarketingDeliveryWorkerService;

  const job = {
    id: 1,
    storeId: 6,
    executionId: 90,
    touchId: 2001,
    strategyId: 12,
    customerId: 11,
    channel: 'terminal',
    title: '护理召回',
    content: '请联系客户',
    status: 'leased',
    attemptCount: 0,
    maxAttempts: 4,
    strategy: {
      recommendationInstanceId: 'recommendation-instance-1',
      adoptionId: 301,
      actions: [{ promotionId: 31 }],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    flags.deliveryJobEngine = true;
    flags.effectFactWrite = true;
    flags.enabledStoreIds.mockImplementation((flag: string) => (flags[flag] ? null : []));
    flags.isEnabledForStore.mockImplementation((flag: string) => Boolean(flags[flag]));
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.marketingDeliveryJob.updateMany.mockResolvedValue({ count: 0 });
    prisma.marketingDeliveryJob.update.mockResolvedValue({});
    prisma.marketingAutomationTouch.update.mockResolvedValue({});
    prisma.marketingAutomationExecution.update.mockResolvedValue({});
    prisma.marketingAutomationExecution.updateMany.mockResolvedValue({ count: 1 });
    prisma.marketingDeliveryJob.count.mockResolvedValue(0);
    prisma.marketingEffectFact.createMany.mockResolvedValue({ count: 0 });
    facts.recordFact.mockResolvedValue({ id: 1 });
    service = new MarketingDeliveryWorkerService(
      prisma as PrismaService,
      channel as MarketingChannelService,
      flags as MarketingFeatureFlagsService,
      facts,
    );
  });

  it('releases expired leases and continues unfinished delivery jobs', async () => {
    prisma.marketingDeliveryJob.updateMany.mockResolvedValue({ count: 25 });
    const now = new Date('2026-07-13T03:00:00.000Z');

    const result = await service.recoverExpiredLeases(now);

    expect(result).toEqual({ requeued: 25 });
    expect(prisma.marketingDeliveryJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'leased', leaseExpiresAt: { lte: now } },
        data: expect.objectContaining({ status: 'queued', availableAt: now, leaseOwner: null, leaseExpiresAt: null }),
      }),
    );
  });

  it('recovers leases only for delivery-engine rollout stores', async () => {
    flags.enabledStoreIds.mockReturnValue([6]);
    prisma.marketingDeliveryJob.updateMany.mockResolvedValue({ count: 2 });
    const now = new Date('2026-07-13T03:00:00.000Z');

    await service.recoverExpiredLeases(now);

    expect(prisma.marketingDeliveryJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'leased', leaseExpiresAt: { lte: now }, storeId: { in: [6] } },
      }),
    );
  });

  it('does not process a claimed job outside delivery-engine rollout stores', async () => {
    flags.isEnabledForStore.mockImplementation(
      (flag: string, storeId: number) => flag === 'deliveryJobEngine' && storeId === 6,
    );

    const result = await service.processClaimedJob({ ...job, storeId: 8 } as any, new Date('2026-07-13T03:00:00.000Z'));

    expect(result).toEqual({ status: 'skipped_store_rollout' });
    expect(channel.deliver).not.toHaveBeenCalled();
    expect(prisma.marketingDeliveryJob.update).not.toHaveBeenCalled();
  });

  it('filters the delivery-job claim query to rollout stores', async () => {
    flags.enabledStoreIds.mockReturnValue([6, 8]);

    await (service as any).claimNextBatch('worker-1', new Date('2026-07-13T03:00:00.000Z'));

    const query = prisma.$queryRaw.mock.calls[0]?.[0];
    expect(query?.strings?.join('')).toContain('AND "storeId" IN (');
    expect(query?.values).toEqual(expect.arrayContaining([6, 8]));
  });

  it('claims up to 100 jobs while keeping delivery concurrency as a separate limit', async () => {
    const candidates = Array.from({ length: 100 }, (_, index) => ({
      ...job,
      id: index + 1,
      touchId: index + 2001,
      customerId: index + 1001,
      status: 'queued',
    }));
    prisma.$queryRaw.mockResolvedValue(candidates);
    prisma.marketingDeliveryJob.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(candidates.map((candidate) => ({ ...candidate, status: 'leased' })));

    const batch = await (service as any).claimNextBatch('worker-100', new Date('2026-07-13T03:00:00.000Z'));

    expect(batch.jobs).toHaveLength(100);
    expect(batch.storeCapacities.get(6)).toBe(20);
    expect(batch.channelCapacities.get('terminal')).toBe(10);
    expect(prisma.marketingDeliveryJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: candidates.map((candidate) => candidate.id) },
          status: { in: ['queued', 'retry_scheduled'] },
        },
      }),
    );
  });

  it('processes a claimed batch of 100 with at most 10 concurrent jobs on one channel', async () => {
    const jobs = Array.from({ length: 100 }, (_, index) => ({
      ...job,
      id: index + 1,
      touchId: index + 2001,
      customerId: index + 1001,
    }));
    let running = 0;
    let maxRunning = 0;
    jest.spyOn(service, 'processClaimedJob').mockImplementation(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setImmediate(resolve));
      running -= 1;
      return { status: 'delivered' } as any;
    });

    const results = await (service as any).processClaimedJobsWithLimits(
      jobs,
      new Map([[6, 20]]),
      new Map([['terminal', 10]]),
      new Date('2026-07-13T03:00:00.000Z'),
    );

    expect(results).toHaveLength(100);
    expect(maxRunning).toBe(10);
  });

  it('completes an in-app batch with one adapter call and one bulk state update', async () => {
    const jobs = [
      { ...job, id: 1, touchId: 2001, customerId: 1001, channel: 'in_app' },
      { ...job, id: 2, touchId: 2002, customerId: 1002, channel: 'in_app' },
    ];
    channel.deliverBatch.mockResolvedValue([
      { status: 'delivered', externalId: '3001' },
      { status: 'delivered', externalId: '3002' },
    ]);
    prisma.$queryRaw.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    const results = await (service as any).processInAppBatch(
      jobs,
      new Map([[6, 20]]),
      new Map([['in_app', 10]]),
      new Date('2026-07-13T03:00:00.000Z'),
    );

    expect(channel.deliverBatch).toHaveBeenCalledTimes(1);
    expect(channel.deliver).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.marketingEffectFact.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ deliveryJobId: 1, factType: 'delivery', metricSource: 'actual' }),
          expect.objectContaining({ deliveryJobId: 1, factType: 'cost', metricSource: 'estimated' }),
        ]),
        skipDuplicates: true,
      }),
    );
    expect(results).toHaveLength(2);
  });

  it('dead-letters a non-configured channel without retrying', async () => {
    channel.deliver.mockResolvedValue({ status: 'failed', errorCode: 'channel_not_configured' });

    await service.processClaimedJob({ ...job, channel: 'sms' } as any, new Date('2026-07-13T03:00:00.000Z'));

    expect(prisma.marketingDeliveryJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ status: 'dead_letter', attemptCount: 1, errorCode: 'channel_not_configured' }),
      }),
    );
    expect(prisma.marketingAutomationTouch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2001 },
        data: expect.objectContaining({ status: 'failed', attemptCount: 1, errorCode: 'channel_not_configured' }),
      }),
    );
  });

  it('retries transient failures with bounded backoff', async () => {
    channel.deliver.mockRejectedValue(Object.assign(new Error('timeout'), { code: 'timeout' }));
    const now = new Date('2026-07-13T03:00:00.000Z');

    await service.processClaimedJob(job as any, now);

    expect(prisma.marketingDeliveryJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'retry_scheduled',
          attemptCount: 1,
          availableAt: new Date('2026-07-13T03:01:00.000Z'),
          errorCode: 'timeout',
        }),
      }),
    );
    expect(prisma.marketingAutomationTouch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'queued', attemptCount: 1, errorCode: 'timeout' }),
      }),
    );
  });

  it('marks the touch delivered only after the adapter succeeds', async () => {
    channel.deliver.mockResolvedValue({ status: 'delivered', externalId: 'task-91' });

    await service.processClaimedJob(job as any, new Date('2026-07-13T03:00:00.000Z'));

    expect(channel.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryJobId: 1,
        touchId: 2001,
        recommendationInstanceId: 'recommendation-instance-1',
        adoptionId: 301,
      }),
    );
    expect(prisma.marketingDeliveryJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'delivered', externalId: 'task-91', attemptCount: 1 }),
      }),
    );
    expect(prisma.marketingAutomationTouch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'delivered', attemptCount: 1, errorCode: null }),
      }),
    );
    expect(facts.recordFact).toHaveBeenCalledWith(
      expect.objectContaining({
        factType: 'delivery',
        countValue: 1,
        dimensions: expect.objectContaining({ deliveryJobId: 1, strategyId: 12, customerId: 11 }),
      }),
    );
    expect(facts.recordFact).toHaveBeenCalledWith(
      expect.objectContaining({
        factType: 'cost',
        metricSource: 'estimated',
        amountValue: 2,
      }),
    );
  });

  it('does not dual-write delivery facts outside effect-fact rollout stores', async () => {
    flags.isEnabledForStore.mockImplementation(
      (flag: string, storeId: number) => flag === 'deliveryJobEngine' || (flag === 'effectFactWrite' && storeId === 8),
    );
    channel.deliver.mockResolvedValue({ status: 'delivered', externalId: 'task-91' });

    await service.processClaimedJob(job as any, new Date('2026-07-13T03:00:00.000Z'));

    expect(facts.recordFact).not.toHaveBeenCalled();
  });

  it('stops retrying after three retries and moves the fourth failed attempt to dead letter', async () => {
    channel.deliver.mockRejectedValue(Object.assign(new Error('network'), { code: 'network_error' }));

    await service.processClaimedJob(
      { ...job, attemptCount: 3, maxAttempts: 4 } as any,
      new Date('2026-07-13T03:00:00.000Z'),
    );

    expect(prisma.marketingDeliveryJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'dead_letter', attemptCount: 4, errorCode: 'network_error' }),
      }),
    );
  });

  it('summarizes delivered and dead-letter jobs as partial failure without counting queued jobs as reached', async () => {
    prisma.marketingDeliveryJob.count.mockResolvedValueOnce(7).mockResolvedValueOnce(3).mockResolvedValueOnce(0);
    const now = new Date('2026-07-13T03:30:00.000Z');

    await (service as any).summarizeExecution(90, now);

    expect(prisma.marketingAutomationExecution.update).toHaveBeenCalledWith({
      where: { id: 90 },
      data: {
        status: 'partial_failed',
        reachedCount: 7,
        failedCount: 3,
        completedAt: now,
        message: 'delivery_jobs_completed',
      },
    });
  });
});
