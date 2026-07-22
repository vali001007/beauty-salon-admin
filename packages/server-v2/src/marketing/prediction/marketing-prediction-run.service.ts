import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MarketingService } from '../marketing.service.js';
import {
  buildPredictionRunKey,
  getShanghaiBusinessDate,
  MARKETING_PREDICTION_MODEL_VERSION,
  MARKETING_PREDICTION_STALE_RUNNING_MS,
} from './marketing-prediction.types.js';

@Injectable()
export class MarketingPredictionRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly marketingService: MarketingService,
  ) {}

  async runForStore(storeId: number, now = new Date()) {
    if (!Number.isInteger(storeId) || storeId <= 0) throw new BadRequestException('X-Store-Id is required');

    const businessDate = getShanghaiBusinessDate(now);
    const runKey = buildPredictionRunKey(storeId, businessDate);
    const existing = await this.prisma.predictionRun.findUnique({ where: { runKey } });

    if (existing?.status === 'completed') {
      return { run: existing, summary: existing.summaryJson ?? {}, reused: true };
    }

    if (existing) {
      const ageMs = now.getTime() - new Date(existing.startedAt).getTime();
      if (existing.status === 'running' && ageMs <= MARKETING_PREDICTION_STALE_RUNNING_MS) {
        return { run: existing, summary: existing.summaryJson ?? {}, reused: true };
      }
      await this.prisma.customerPredictionSnapshot.deleteMany({ where: { runId: existing.id } });
      await this.prisma.predictionRun.update({
        where: { id: existing.id },
        data: {
          status: 'running',
          startedAt: now,
          finishedAt: null,
          customerCount: 0,
          summaryJson: { restartedFromStatus: existing.status, restartedAt: now.toISOString() },
        },
      });
      const populated = await this.marketingService.populatePredictionRun(existing.id, storeId);
      return { ...populated, reused: false };
    }

    let run: any;
    try {
      run = await this.prisma.predictionRun.create({
        data: {
          storeId,
          businessDate: new Date(`${businessDate}T00:00:00.000Z`),
          runKey,
          scopeStatus: 'store_scoped',
          modelVersion: MARKETING_PREDICTION_MODEL_VERSION,
          status: 'running',
          startedAt: now,
          customerCount: 0,
        },
      });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const raced = await this.prisma.predictionRun.findUnique({ where: { runKey } });
      if (!raced) throw error;
      return { run: raced, summary: raced.summaryJson ?? {}, reused: true };
    }

    const populated = await this.marketingService.populatePredictionRun(run.id, storeId);
    return { ...populated, reused: false };
  }
}
