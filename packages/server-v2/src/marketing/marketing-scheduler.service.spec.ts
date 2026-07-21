import { Test } from '@nestjs/testing';
import { MarketingSchedulerService } from './marketing-scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingService } from './marketing.service';
import { MarketingPredictionRunService } from './prediction/marketing-prediction-run.service';
import { MarketingRecommendationOrchestratorService } from './recommendation/marketing-recommendation-orchestrator.service';
import { MarketingExecutionService } from './automation/marketing-execution.service';
import { MarketingFeatureFlagsService } from './marketing-feature-flags.service';

describe('MarketingSchedulerService', () => {
  const prisma = { marketingAutomationStrategy: { findMany: jest.fn() }, store: { findMany: jest.fn() } } as any;
  const marketing = { executeStrategy: jest.fn(), runPredictions: jest.fn() } as any;
  const predictionRuns = { runForStore: jest.fn() } as any;
  const recommendationOrchestrator = { refreshForStore: jest.fn() } as any;
  const execution = { start: jest.fn() } as any;
  const flags = { deliveryJobEngine: false, isEnabledForStore: jest.fn() } as any;
  let service: MarketingSchedulerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    flags.deliveryJobEngine = false;
    flags.isEnabledForStore.mockImplementation((flag: string) => Boolean(flags[flag]));
    const module = await Test.createTestingModule({
      providers: [
        MarketingSchedulerService,
        { provide: PrismaService, useValue: prisma },
        { provide: MarketingService, useValue: marketing },
        { provide: MarketingPredictionRunService, useValue: predictionRuns },
        { provide: MarketingRecommendationOrchestratorService, useValue: recommendationOrchestrator },
        { provide: MarketingExecutionService, useValue: execution },
        { provide: MarketingFeatureFlagsService, useValue: flags },
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

  it('queues delivery jobs instead of synchronously delivering when the new engine is enabled', async () => {
    flags.deliveryJobEngine = true;
    prisma.marketingAutomationStrategy.findMany.mockResolvedValue([
      { id: 7, storeId: 6, schedule: { type: 'daily', time: '09:00' } },
    ]);
    execution.start.mockResolvedValue({ id: 90, status: 'pending' });

    await service.runDueStrategies(new Date('2026-07-12T01:00:30.000Z'));

    expect(execution.start).toHaveBeenCalledWith(7, 6, 'daily-2026-07-12-09:00');
    expect(marketing.executeStrategy).not.toHaveBeenCalled();
    flags.deliveryJobEngine = false;
  });

  it('uses the new delivery engine only inside rollout stores', async () => {
    flags.deliveryJobEngine = true;
    flags.isEnabledForStore.mockImplementation(
      (flag: string, storeId: number) => flag === 'deliveryJobEngine' && storeId === 6,
    );
    prisma.marketingAutomationStrategy.findMany.mockResolvedValue([
      { id: 7, storeId: 6, schedule: { type: 'daily', time: '09:00' } },
      { id: 8, storeId: 8, schedule: { type: 'daily', time: '09:00' } },
    ]);
    execution.start.mockResolvedValue({ id: 90, status: 'pending' });
    marketing.executeStrategy.mockResolvedValue({ id: 91, status: 'success' });

    await service.runDueStrategies(new Date('2026-07-12T01:00:30.000Z'));

    expect(execution.start).toHaveBeenCalledWith(7, 6, 'daily-2026-07-12-09:00');
    expect(marketing.executeStrategy).toHaveBeenCalledWith(8, 8, 'daily-2026-07-12-09:00');
  });

  it('runs one daily prediction batch for every active store', async () => {
    prisma.store.findMany.mockResolvedValue([{ id: 6 }, { id: 8 }]);
    predictionRuns.runForStore.mockResolvedValue({});
    recommendationOrchestrator.refreshForStore.mockResolvedValue({});

    await service.runDailyPredictions();

    expect(predictionRuns.runForStore).toHaveBeenCalledTimes(2);
    expect(predictionRuns.runForStore).toHaveBeenCalledWith(6);
    expect(predictionRuns.runForStore).toHaveBeenCalledWith(8);
    expect(recommendationOrchestrator.refreshForStore).toHaveBeenCalledWith(6);
    expect(recommendationOrchestrator.refreshForStore).toHaveBeenCalledWith(8);
  });

  it('refreshes persisted recommendation instances for every active store', async () => {
    prisma.store.findMany.mockResolvedValue([{ id: 6 }, { id: 8 }]);
    recommendationOrchestrator.refreshForStore.mockResolvedValue({});

    await service.refreshRecommendationInstances();

    expect(recommendationOrchestrator.refreshForStore).toHaveBeenCalledTimes(2);
    expect(recommendationOrchestrator.refreshForStore).toHaveBeenCalledWith(6);
    expect(recommendationOrchestrator.refreshForStore).toHaveBeenCalledWith(8);
  });
});
