import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { MarketingService } from './marketing.service.js';
import { MarketingPredictionRunService } from './prediction/marketing-prediction-run.service.js';
import { MarketingRecommendationOrchestratorService } from './recommendation/marketing-recommendation-orchestrator.service.js';
import { MarketingExecutionService } from './automation/marketing-execution.service.js';
import { MarketingFeatureFlagsService } from './marketing-feature-flags.service.js';

@Injectable()
export class MarketingSchedulerService {
  private recommendationRefreshRunning = false;
  private dailyPredictionRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketingService: MarketingService,
    private readonly predictionRunService: MarketingPredictionRunService,
    private readonly recommendationOrchestrator: MarketingRecommendationOrchestratorService,
    private readonly marketingExecutionService: MarketingExecutionService,
    private readonly featureFlags: MarketingFeatureFlagsService,
  ) {}

  @Cron('* * * * *', { timeZone: 'Asia/Shanghai' })
  runScheduledStrategies() {
    if (!this.schedulerEnabled()) return { skipped: true, reason: 'scheduler_disabled' };
    return this.runDueStrategies(new Date());
  }

  @Cron('15 2 * * *', { timeZone: 'Asia/Shanghai' })
  async runScheduledDailyPredictions() {
    if (!this.schedulerEnabled() || this.dailyPredictionRunning) {
      return { skipped: true, reason: this.dailyPredictionRunning ? 'already_running' : 'scheduler_disabled' };
    }
    this.dailyPredictionRunning = true;
    try {
      return await this.runDailyPredictions();
    } finally {
      this.dailyPredictionRunning = false;
    }
  }

  async runDailyPredictions() {
    const stores = await this.findActiveStores();
    const results: PromiseSettledResult<unknown>[] = [];
    for (const store of stores) {
      try {
        await this.predictionRunService.runForStore(store.id);
        results.push({ status: 'fulfilled', value: await this.recommendationOrchestrator.refreshForStore(store.id) });
      } catch (reason) {
        results.push({ status: 'rejected', reason });
      }
    }
    return results;
  }

  @Cron('*/5 * * * *', { timeZone: 'Asia/Shanghai' })
  async runScheduledRecommendationRefresh() {
    if (!this.schedulerEnabled() || this.recommendationRefreshRunning) {
      return { skipped: true, reason: this.recommendationRefreshRunning ? 'already_running' : 'scheduler_disabled' };
    }
    this.recommendationRefreshRunning = true;
    try {
      return await this.refreshRecommendationInstances();
    } finally {
      this.recommendationRefreshRunning = false;
    }
  }

  async refreshRecommendationInstances() {
    const stores = await this.findActiveStores();
    const results: PromiseSettledResult<unknown>[] = [];
    for (const store of stores) {
      try {
        results.push({ status: 'fulfilled', value: await this.recommendationOrchestrator.refreshForStore(store.id) });
      } catch (reason) {
        results.push({ status: 'rejected', reason });
      }
    }
    return results;
  }

  async runDueStrategies(now: Date) {
    const clock = this.getShanghaiClock(now);
    const strategies = await this.prisma.marketingAutomationStrategy.findMany({
      where: { status: 'enabled' },
      select: { id: true, storeId: true, schedule: true },
    });

    const due = strategies.filter((strategy: any) => {
      const schedule = strategy.schedule ?? {};
      return schedule.type === 'daily' && String(schedule.time ?? '') === clock.time;
    });

    return Promise.allSettled(due.map((strategy: any) => {
      const key = `daily-${clock.date}-${clock.time}`;
      return this.featureFlags.isEnabledForStore('deliveryJobEngine', strategy.storeId)
        ? this.marketingExecutionService.start(strategy.id, strategy.storeId, key)
        : this.marketingService.executeStrategy(strategy.id, strategy.storeId, key);
    }));
  }

  private getShanghaiClock(date: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
    return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
  }

  private findActiveStores() {
    return this.prisma.store.findMany({
      where: { deletedAt: null, status: 'active' },
      select: { id: true },
    });
  }

  private schedulerEnabled() {
    const configured = process.env.MARKETING_SCHEDULER_ENABLED;
    return configured == null ? process.env.NODE_ENV === 'production' : configured === 'true';
  }
}
