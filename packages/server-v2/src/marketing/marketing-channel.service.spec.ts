import { Test } from '@nestjs/testing';
import { MarketingChannelService } from './marketing-channel.service';
import { PrismaService } from '../prisma/prisma.service';
import { TerminalService } from '../terminal/terminal.service';

describe('MarketingChannelService', () => {
  const prisma = {
    marketingInAppNotification: { create: jest.fn() },
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
      channel: 'terminal', storeId: 6, customerId: 12, strategyId: 3,
      title: '护理回访', content: '请联系客户确认护理需求',
    });

    expect(result).toEqual({ status: 'delivered', externalId: '91' });
  });

  it('creates an in-app notification before reporting delivery', async () => {
    prisma.marketingInAppNotification.create.mockResolvedValue({ id: 33 });

    const result = await service.deliver({
      channel: 'in_app', storeId: 6, customerId: 12, strategyId: 3,
      title: '护理提醒', content: '您有一项护理权益即将到期',
    });

    expect(result).toEqual({ status: 'delivered', externalId: '33' });
  });

  it.each(['sms', 'wechat'] as const)('does not fake delivery for unconfigured %s channel', async (channel) => {
    const result = await service.deliver({
      channel, storeId: 6, customerId: 12, strategyId: 3,
      title: '提醒', content: '测试消息',
    });

    expect(result).toEqual({ status: 'failed', errorCode: 'channel_not_configured' });
  });
});
