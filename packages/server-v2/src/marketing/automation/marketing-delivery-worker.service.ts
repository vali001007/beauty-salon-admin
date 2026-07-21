import { Injectable, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MarketingChannelService, type MarketingChannel } from '../marketing-channel.service.js';
import { MarketingFeatureFlagsService } from '../marketing-feature-flags.service.js';
import { MarketingEffectFactService } from '../attribution/marketing-effect-fact.service.js';

const CLAIM_CANDIDATE_LIMIT = 500;
const CLAIM_LIMIT = 100;
const STORE_CONCURRENCY_LIMIT = 20;
const CHANNEL_CONCURRENCY_LIMIT = 10;
const LEASE_DURATION_MS = 60_000;
const RETRY_BACKOFF_MINUTES = [1, 5, 20] as const;
const NON_RETRYABLE_ERRORS = new Set(['channel_not_configured', 'customer_not_found', 'store_mismatch']);
const CLAIM_ADVISORY_LOCK_KEY = 6071320;

type ClaimedDeliveryJob = {
  id: number;
  storeId: number;
  executionId: number;
  touchId: number;
  strategyId: number;
  customerId: number;
  channel: string;
  title: string;
  content: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  strategy?: { recommendationInstanceId?: string | null; adoptionId?: number | null; actions?: unknown };
};

type ClaimedDeliveryBatch = {
  jobs: ClaimedDeliveryJob[];
  storeCapacities: Map<number, number>;
  channelCapacities: Map<string, number>;
};

@Injectable()
export class MarketingDeliveryWorkerService {
  private readonly workerId = `marketing-${process.pid}-${randomUUID().slice(0, 8)}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly channelService: MarketingChannelService,
    private readonly featureFlags: MarketingFeatureFlagsService,
    @Optional() private readonly factService?: MarketingEffectFactService,
  ) {}

  @Cron('*/10 * * * * *', { timeZone: 'Asia/Shanghai' })
  async poll() {
    const enabledStoreIds = this.featureFlags.enabledStoreIds('deliveryJobEngine');
    if (enabledStoreIds?.length === 0) return { claimed: 0, processed: 0 };
    return this.processBatch(this.workerId, new Date());
  }

  async processBatch(workerId = this.workerId, now = new Date()) {
    await this.recoverExpiredLeases(now);
    const batch = await this.claimNextBatch(workerId, now);
    const jobs = batch.jobs;
    if (jobs.length === 0) return { claimed: 0, processed: 0 };

    const results = jobs.every((job) => job.channel === 'in_app')
      ? await this.processInAppBatch(jobs, batch.storeCapacities, batch.channelCapacities, now)
      : await this.processClaimedJobsWithLimits(jobs, batch.storeCapacities, batch.channelCapacities, now);
    const executionIds = [...new Set(jobs.map((job) => job.executionId))];
    await Promise.all(executionIds.map((executionId) => this.summarizeExecution(executionId, new Date())));
    return {
      claimed: jobs.length,
      processed: results.filter((result) => result.status === 'fulfilled').length,
      rejected: results.filter((result) => result.status === 'rejected').length,
    };
  }

  async recoverExpiredLeases(now = new Date()) {
    const enabledStoreIds = this.featureFlags.enabledStoreIds('deliveryJobEngine');
    if (enabledStoreIds?.length === 0) return { requeued: 0 };
    const result = await this.prisma.marketingDeliveryJob.updateMany({
      where: {
        status: 'leased',
        leaseExpiresAt: { lte: now },
        ...(enabledStoreIds === null ? {} : { storeId: { in: enabledStoreIds } }),
      },
      data: {
        status: 'queued',
        availableAt: now,
        leasedAt: null,
        leaseExpiresAt: null,
        leaseOwner: null,
      },
    });
    return { requeued: result.count };
  }

  async processClaimedJob(job: ClaimedDeliveryJob, now = new Date()) {
    if (!this.featureFlags.isEnabledForStore('deliveryJobEngine', job.storeId)) {
      return { status: 'skipped_store_rollout' as const };
    }
    const attemptCount = Number(job.attemptCount ?? 0) + 1;
    let result: { status: 'delivered' | 'failed'; externalId?: string; errorCode?: string };
    try {
      result = await this.channelService.deliver({
        channel: this.normalizeChannel(job.channel),
        storeId: job.storeId,
        customerId: job.customerId,
        strategyId: job.strategyId,
        executionId: job.executionId,
        deliveryJobId: job.id,
        touchId: job.touchId,
        recommendationInstanceId: job.strategy?.recommendationInstanceId ?? null,
        adoptionId: job.strategy?.adoptionId ?? null,
        title: job.title,
        content: job.content,
      });
    } catch (error: any) {
      result = { status: 'failed', errorCode: String(error?.code ?? 'delivery_failed') };
    }

    if (result.status === 'delivered') {
      await this.updateJobAndTouch(
        job,
        {
          status: 'delivered',
          attemptCount,
          externalId: result.externalId ?? null,
          deliveredAt: now,
          errorCode: null,
          errorMessage: null,
          leasedAt: null,
          leaseExpiresAt: null,
          leaseOwner: null,
        },
        { status: 'delivered', attemptCount, errorCode: null, errorMessage: null },
      );
      await this.recordDeliveryFacts(job, now, true);
      return { status: 'delivered' as const };
    }

    const errorCode = String(result.errorCode ?? 'delivery_failed');
    const canRetry = !NON_RETRYABLE_ERRORS.has(errorCode) && attemptCount < Number(job.maxAttempts ?? 4);
    if (canRetry) {
      const retryIndex = Math.min(attemptCount - 1, RETRY_BACKOFF_MINUTES.length - 1);
      const availableAt = new Date(now.getTime() + RETRY_BACKOFF_MINUTES[retryIndex] * 60_000);
      await this.updateJobAndTouch(
        job,
        {
          status: 'retry_scheduled',
          attemptCount,
          availableAt,
          errorCode,
          errorMessage: errorCode,
          leasedAt: null,
          leaseExpiresAt: null,
          leaseOwner: null,
        },
        { status: 'queued', attemptCount, errorCode, errorMessage: errorCode },
      );
      return { status: 'retry_scheduled' as const, availableAt };
    }

    await this.updateJobAndTouch(
      job,
      {
        status: 'dead_letter',
        attemptCount,
        errorCode,
        errorMessage: errorCode,
        leasedAt: null,
        leaseExpiresAt: null,
        leaseOwner: null,
      },
      { status: 'failed', attemptCount, errorCode, errorMessage: errorCode },
    );
    await this.recordDeliveryFacts(job, now, false, errorCode);
    return { status: 'dead_letter' as const };
  }

  private emptyClaimedBatch(): ClaimedDeliveryBatch {
    return { jobs: [], storeCapacities: new Map(), channelCapacities: new Map() };
  }

  private async claimNextBatch(workerId: string, now: Date): Promise<ClaimedDeliveryBatch> {
    const enabledStoreIds = this.featureFlags.enabledStoreIds('deliveryJobEngine');
    if (enabledStoreIds?.length === 0) return this.emptyClaimedBatch();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);
    return this.prisma.$transaction(
      async (tx: any) => {
        // Claiming is serialized across instances so every worker observes committed active leases
        // before reserving the next 100 jobs. Delivery remains concurrent inside the claimed batch.
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${CLAIM_ADVISORY_LOCK_KEY})`);
        const storeScope =
          enabledStoreIds === null ? Prisma.empty : Prisma.sql`AND "storeId" IN (${Prisma.join(enabledStoreIds)})`;
        const candidates = (await tx.$queryRaw(Prisma.sql`
        SELECT "id", "storeId", "executionId", "touchId", "strategyId", "customerId",
               "channel", "title", "content", "status", "attemptCount", "maxAttempts"
        FROM "MarketingDeliveryJob"
        WHERE "status" IN ('queued', 'retry_scheduled')
          AND "availableAt" <= ${now}
          ${storeScope}
        ORDER BY "availableAt" ASC, "id" ASC
        LIMIT ${CLAIM_CANDIDATE_LIMIT}
        FOR UPDATE SKIP LOCKED
      `)) as ClaimedDeliveryJob[];
        if (candidates.length === 0) return this.emptyClaimedBatch();

        const activeLeases = await tx.marketingDeliveryJob.findMany({
          where: { status: 'leased', leaseExpiresAt: { gt: now } },
          select: { storeId: true, channel: true },
        });
        const storeCounts = new Map<number, number>();
        const channelCounts = new Map<string, number>();
        for (const lease of activeLeases) {
          storeCounts.set(Number(lease.storeId), (storeCounts.get(Number(lease.storeId)) ?? 0) + 1);
          channelCounts.set(String(lease.channel), (channelCounts.get(String(lease.channel)) ?? 0) + 1);
        }

        const storeCapacities = new Map<number, number>();
        const channelCapacities = new Map<string, number>();
        const selected: ClaimedDeliveryJob[] = [];
        for (const candidate of candidates) {
          if (selected.length >= CLAIM_LIMIT) break;
          const storeId = Number(candidate.storeId);
          const channel = String(candidate.channel);
          const storeCapacity = Math.max(0, STORE_CONCURRENCY_LIMIT - (storeCounts.get(storeId) ?? 0));
          const channelCapacity = Math.max(0, CHANNEL_CONCURRENCY_LIMIT - (channelCounts.get(channel) ?? 0));
          storeCapacities.set(storeId, storeCapacity);
          channelCapacities.set(channel, channelCapacity);
          if (storeCapacity === 0 || channelCapacity === 0) continue;
          selected.push(candidate);
        }
        if (selected.length === 0) return this.emptyClaimedBatch();

        const ids = selected.map((job) => job.id);
        await tx.marketingDeliveryJob.updateMany({
          where: { id: { in: ids }, status: { in: ['queued', 'retry_scheduled'] } },
          data: { status: 'leased', leasedAt: now, leaseExpiresAt, leaseOwner: workerId },
        });
        const executionIds = [...new Set(selected.map((job) => job.executionId))];
        await tx.marketingAutomationExecution.updateMany({
          where: { id: { in: executionIds }, startedAt: null },
          data: { startedAt: now },
        });
        await tx.marketingAutomationExecution.updateMany({
          where: { id: { in: executionIds }, status: { in: ['pending', 'running'] } },
          data: { status: 'running' },
        });
        const jobs = await tx.marketingDeliveryJob.findMany({
          where: { id: { in: ids }, status: 'leased', leaseOwner: workerId },
          include: { strategy: { select: { recommendationInstanceId: true, adoptionId: true, actions: true } } },
          orderBy: { id: 'asc' },
        });
        return { jobs, storeCapacities, channelCapacities };
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }

  private async processInAppBatch(
    jobs: ClaimedDeliveryJob[],
    storeCapacities: Map<number, number>,
    channelCapacities: Map<string, number>,
    now: Date,
  ): Promise<PromiseSettledResult<unknown>[]> {
    try {
      const deliveryResults = await this.channelService.deliverBatch(
        jobs.map((job) => ({
          channel: 'in_app',
          storeId: job.storeId,
          customerId: job.customerId,
          strategyId: job.strategyId,
          executionId: job.executionId,
          deliveryJobId: job.id,
          touchId: job.touchId,
          recommendationInstanceId: job.strategy?.recommendationInstanceId ?? null,
          adoptionId: job.strategy?.adoptionId ?? null,
          title: job.title,
          content: job.content,
        })),
      );
      if (deliveryResults.some((result) => result.status !== 'delivered')) {
        throw new Error('in_app_batch_delivery_incomplete');
      }
      await this.completeInAppBatch(jobs, now);
      return jobs.map(() => ({ status: 'fulfilled', value: { status: 'delivered' } }));
    } catch {
      // Preserve the regular retry/dead-letter semantics if the batch adapter is unavailable.
      return this.processClaimedJobsWithLimits(jobs, storeCapacities, channelCapacities, now);
    }
  }

  private async completeInAppBatch(jobs: ClaimedDeliveryJob[], now: Date) {
    const ids = jobs.map((job) => Number(job.id));
    const updated = await this.prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      WITH updated_jobs AS (
        UPDATE "MarketingDeliveryJob" job
        SET
          "status" = 'delivered',
          "attemptCount" = job."attemptCount" + 1,
          "externalId" = notification."id"::text,
          "deliveredAt" = ${now},
          "errorCode" = NULL,
          "errorMessage" = NULL,
          "leasedAt" = NULL,
          "leaseExpiresAt" = NULL,
          "leaseOwner" = NULL,
          "updatedAt" = ${now}
        FROM "MarketingInAppNotification" notification
        WHERE job."id" IN (${Prisma.join(ids)})
          AND job."status" = 'leased'
          AND notification."deliveryJobId" = job."id"
        RETURNING job."id", job."touchId", job."attemptCount"
      )
      UPDATE "MarketingAutomationTouch" touch
      SET
        "status" = 'delivered',
        "attemptCount" = updated_jobs."attemptCount",
        "errorCode" = NULL,
        "errorMessage" = NULL
      FROM updated_jobs
      WHERE touch."id" = updated_jobs."touchId"
      RETURNING updated_jobs."id"
    `);
    if (updated.length !== jobs.length) {
      throw new Error(`in_app_batch_state_incomplete:${updated.length}/${jobs.length}`);
    }

    if (this.featureFlags.isEnabledForStore('effectFactWrite', jobs[0]?.storeId) && this.factService) {
      try {
        await this.prisma.marketingEffectFact.createMany({
          data: jobs.flatMap((job) => {
            const dimensions = {
              recommendationInstanceId: job.strategy?.recommendationInstanceId ?? null,
              adoptionId: job.strategy?.adoptionId ?? null,
              strategyId: job.strategyId,
              executionId: job.executionId,
              touchId: job.touchId,
              deliveryJobId: job.id,
              promotionId: this.promotionFromActions(job.strategy?.actions),
              customerId: job.customerId,
              channel: job.channel,
            };
            return [
              {
                storeId: job.storeId,
                factType: 'delivery',
                metricSource: 'actual',
                sourceSystem: 'marketing_delivery_worker',
                sourceEventId: `job:${job.id}`,
                countValue: 1,
                ...dimensions,
                metadataJson: { status: 'delivered' },
                occurredAt: now,
              },
              {
                storeId: job.storeId,
                factType: 'cost',
                metricSource: 'estimated',
                sourceSystem: 'marketing_delivery_worker',
                sourceEventId: `job:${job.id}`,
                amountValue: 2,
                ...dimensions,
                metadataJson: { definition: '固定单次触达估算成本，非渠道账单' },
                occurredAt: now,
              },
            ];
          }),
          skipDuplicates: true,
        });
      } catch {
        // Fact persistence remains dual-write observability and cannot roll back real delivery.
      }
    }
  }

  private async processClaimedJobsWithLimits(
    jobs: ClaimedDeliveryJob[],
    storeCapacities: Map<number, number>,
    channelCapacities: Map<string, number>,
    now: Date,
  ) {
    const pending = [...jobs];
    const results: PromiseSettledResult<unknown>[] = [];
    while (pending.length > 0) {
      const storeRunning = new Map<number, number>();
      const channelRunning = new Map<string, number>();
      const wave: ClaimedDeliveryJob[] = [];
      for (let index = 0; index < pending.length; ) {
        const job = pending[index];
        const storeId = Number(job.storeId);
        const channel = String(job.channel);
        const storeLimit = storeCapacities.get(storeId) ?? STORE_CONCURRENCY_LIMIT;
        const channelLimit = channelCapacities.get(channel) ?? CHANNEL_CONCURRENCY_LIMIT;
        if ((storeRunning.get(storeId) ?? 0) < storeLimit && (channelRunning.get(channel) ?? 0) < channelLimit) {
          wave.push(job);
          storeRunning.set(storeId, (storeRunning.get(storeId) ?? 0) + 1);
          channelRunning.set(channel, (channelRunning.get(channel) ?? 0) + 1);
          pending.splice(index, 1);
          continue;
        }
        index += 1;
      }
      if (wave.length === 0) {
        throw new Error('marketing_delivery_concurrency_capacity_unavailable');
      }
      results.push(...(await Promise.allSettled(wave.map((job) => this.processClaimedJob(job, now)))));
    }
    return results;
  }

  private async updateJobAndTouch(
    job: ClaimedDeliveryJob,
    jobData: Record<string, unknown>,
    touchData: Record<string, unknown>,
  ) {
    return this.prisma.$transaction(async (tx: any) => {
      await tx.marketingDeliveryJob.update({ where: { id: job.id }, data: jobData });
      await tx.marketingAutomationTouch.update({ where: { id: job.touchId }, data: touchData });
    });
  }

  private async summarizeExecution(executionId: number, now: Date) {
    const [delivered, deadLetter, unfinished] = await Promise.all([
      this.prisma.marketingDeliveryJob.count({ where: { executionId, status: 'delivered' } }),
      this.prisma.marketingDeliveryJob.count({ where: { executionId, status: 'dead_letter' } }),
      this.prisma.marketingDeliveryJob.count({
        where: { executionId, status: { in: ['queued', 'retry_scheduled', 'leased'] } },
      }),
    ]);
    const status =
      unfinished > 0
        ? 'running'
        : delivered > 0 && deadLetter > 0
          ? 'partial_failed'
          : delivered > 0
            ? 'success'
            : 'failed';
    return this.prisma.marketingAutomationExecution.update({
      where: { id: executionId },
      data: {
        status,
        reachedCount: delivered,
        failedCount: deadLetter,
        completedAt: unfinished > 0 ? null : now,
        message: unfinished > 0 ? 'delivery_jobs_running' : 'delivery_jobs_completed',
      },
    });
  }

  private normalizeChannel(channel: string): MarketingChannel {
    return ['terminal', 'in_app', 'sms', 'wechat'].includes(channel) ? (channel as MarketingChannel) : 'in_app';
  }

  private async recordDeliveryFacts(job: ClaimedDeliveryJob, occurredAt: Date, delivered: boolean, errorCode?: string) {
    if (!this.featureFlags.isEnabledForStore('effectFactWrite', job.storeId) || !this.factService) return;
    const dimensions = {
      recommendationInstanceId: job.strategy?.recommendationInstanceId ?? null,
      adoptionId: job.strategy?.adoptionId ?? null,
      strategyId: job.strategyId,
      executionId: job.executionId,
      touchId: job.touchId,
      deliveryJobId: job.id,
      promotionId: this.promotionFromActions(job.strategy?.actions),
      customerId: job.customerId,
      channel: job.channel,
    };
    try {
      await this.factService.recordFact({
        storeId: job.storeId,
        factType: 'delivery',
        metricSource: 'actual',
        sourceSystem: 'marketing_delivery_worker',
        sourceEventId: `job:${job.id}`,
        countValue: delivered ? 1 : 0,
        dimensions,
        metadata: delivered ? { status: 'delivered' } : { status: 'failed', errorCode },
        occurredAt,
      });
      if (delivered) {
        await this.factService.recordFact({
          storeId: job.storeId,
          factType: 'cost',
          metricSource: 'estimated',
          sourceSystem: 'marketing_delivery_worker',
          sourceEventId: `job:${job.id}`,
          amountValue: 2,
          dimensions,
          metadata: { definition: '固定单次触达估算成本，非渠道账单' },
          occurredAt,
        });
      }
    } catch {
      // Fact persistence is dual-write observability and must not turn a real delivery into a retry.
    }
  }

  private promotionFromActions(actions: unknown) {
    if (!Array.isArray(actions)) return null;
    const id = actions
      .map((action: any) => Number(action?.promotionId))
      .find((value) => Number.isInteger(value) && value > 0);
    return id ?? null;
  }
}
