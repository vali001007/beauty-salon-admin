import { Test } from '@nestjs/testing';
import { MarketingChannelService } from './marketing-channel.service';
import { PrismaService } from '../prisma/prisma.service';
import { TerminalService } from '../terminal/terminal.service';

describe('MarketingChannelService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    marketingInAppNotification: { create: jest.fn(), upsert: jest.fn() },
  } as any;
  const terminal = {
    batchCreateFollowUpTasks: jest.fn(),
  } as any;
  let service: MarketingChannelService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        MarketingChannelService,
        { provide: PrismaService, useValue: prisma },
        { provide: TerminalService, useValue: terminal },
      ],
    }).compile();
    service = module.get(MarketingChannelService);
  });

  it('marks terminal delivery successful only after a follow-up task is created', async () => {
    terminal.batchCreateFollowUpTasks.mockResolvedValue({ createdCount: 1, items: [{ id: 91 }] });

    const result = await service.deliver({
      channel: 'terminal',
      storeId: 6,
      customerId: 12,
      strategyId: 3,
      executionId: 90,
      deliveryJobId: 1001,
      touchId: 2001,
      recommendationInstanceId: 'recommendation-instance-1',
      adoptionId: 301,
      assigneeRole: 'consultant',
      assigneeUserId: 7,
      assigneeBeauticianId: 17,
      title: '护理回访',
      content: '请联系客户确认护理需求',
    });

    expect(terminal.batchCreateFollowUpTasks).toHaveBeenCalledWith(
      6,
      expect.objectContaining({
        customerId: 12,
        customerIds: [12],
        source: 'marketing_automation',
        sourceRecommendationKey: 'delivery-job:1001',
        recommendationInstanceId: 'recommendation-instance-1',
        adoptionId: 301,
        assigneeRole: 'consultant',
        assigneeUserId: 7,
        assigneeBeauticianId: 17,
        attribution: {
          strategyId: 3,
          executionId: 90,
          deliveryJobId: 1001,
          touchId: 2001,
        },
      }),
    );
    expect(result).toEqual({ status: 'delivered', externalId: '91' });
  });

  it('creates an in-app notification before reporting delivery', async () => {
    prisma.marketingInAppNotification.create.mockResolvedValue({ id: 33 });

    const result = await service.deliver({
      channel: 'in_app',
      storeId: 6,
      customerId: 12,
      strategyId: 3,
      title: '护理提醒',
      content: '您有一项护理权益即将到期',
    });

    expect(result).toEqual({ status: 'delivered', externalId: '33' });
  });

  it('uses the delivery job as the retry idempotency key', async () => {
    prisma.marketingInAppNotification.upsert.mockResolvedValue({ id: 34 });

    const result = await service.deliver({
      channel: 'in_app',
      storeId: 6,
      customerId: 12,
      strategyId: 3,
      executionId: 90,
      deliveryJobId: 1001,
      title: '护理提醒',
      content: '您有一项护理权益即将到期',
    });

    expect(prisma.marketingInAppNotification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deliveryJobId: 1001 },
        create: expect.objectContaining({ deliveryJobId: 1001, storeId: 6, customerId: 12 }),
      }),
    );
    expect(result).toEqual({ status: 'delivered', externalId: '34' });
  });

  it('creates 100 in-app notifications in one database batch', async () => {
    const requests = Array.from({ length: 100 }, (_, index) => ({
      channel: 'in_app' as const,
      storeId: 6,
      customerId: index + 1,
      strategyId: 3,
      executionId: 90,
      deliveryJobId: index + 1001,
      touchId: index + 2001,
      title: '批量护理提醒',
      content: '请查看本周护理建议',
    }));
    prisma.$queryRaw.mockResolvedValue(
      requests.map((request, index) => ({
        deliveryJobId: request.deliveryJobId,
        id: index + 3001,
      })),
    );

    const results = await service.deliverBatch(requests);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(100);
    expect(results[0]).toEqual({ status: 'delivered', externalId: '3001' });
    expect(results[99]).toEqual({ status: 'delivered', externalId: '3100' });
  });

  it.each(['sms', 'wechat'] as const)('does not fake delivery for unconfigured %s channel', async (channel) => {
    const result = await service.deliver({
      channel,
      storeId: 6,
      customerId: 12,
      strategyId: 3,
      title: '提醒',
      content: '测试消息',
    });

    expect(result).toEqual({ status: 'failed', errorCode: 'channel_not_configured' });
  });
});
