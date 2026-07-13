import { Test } from '@nestjs/testing';
import { MarketingSchedulerService } from './marketing-scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingService } from './marketing.service';

describe('MarketingSchedulerService', () => {
  const prisma = { marketingAutomationStrategy: { findMany: jest.fn() }, store: { findMany: jest.fn() } } as any;
  const marketing = { executeStrategy: jest.fn(), runPredictions: jest.fn() } as any;
  let service: MarketingSchedulerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        MarketingSchedulerService,
        { provide: PrismaService, useValue: prisma },
        { provide: MarketingService, useValue: marketing },
      ],
    }).compile();
    service = module.get(MarketingSchedulerService);
  });

  it('executes a due daily strategy with a stable business-window key', async () => {
    prisma.marketingAutomationStrategy.findMany.mockResolvedValue([
      { id: 7, storeId: 6, schedule: { type: 'daily', time: '09:00' } },
    ]);
    marketing.executeStrategy.mockResolvedValue({ id: 1 });

    await service.runDueStrategies(new Date('2026-07-12T01:00:30.000Z'));

    expect(marketing.executeStrategy).toHaveBeenCalledWith(7, 6, 'daily-2026-07-12-09:00');
  });

  it('does not execute a daily strategy outside its scheduled minute', async () => {
    prisma.marketingAutomationStrategy.findMany.mockResolvedValue([
      { id: 7, storeId: 6, schedule: { type: 'daily', time: '09:00' } },
    ]);

    await service.runDueStrategies(new Date('2026-07-12T01:01:00.000Z'));

    expect(marketing.executeStrategy).not.toHaveBeenCalled();
  });

  it('runs one daily prediction batch for every active store', async () => {
    prisma.store.findMany.mockResolvedValue([{ id: 6 }, { id: 8 }]);
    marketing.runPredictions.mockResolvedValue({});

    await service.runDailyPredictions();

    expect(marketing.runPredictions).toHaveBeenCalledTimes(2);
    expect(marketing.runPredictions).toHaveBeenCalledWith(6);
    expect(marketing.runPredictions).toHaveBeenCalledWith(8);
  });
});
