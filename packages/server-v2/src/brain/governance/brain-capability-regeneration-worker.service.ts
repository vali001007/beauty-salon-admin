import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { basename, resolve } from 'node:path';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  BrainCapabilityRegenerationService,
  publicErrorMessage,
} from './brain-capability-regeneration.service.js';

interface ClaimedRegenerationJob {
  id: number;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  leaseOwner: string;
}

@Injectable()
export class BrainCapabilityRegenerationWorkerService {
  private readonly logger = new Logger(BrainCapabilityRegenerationWorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly regeneration: BrainCapabilityRegenerationService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async tick(): Promise<void> {
    if (process.env.BRAIN_CAPABILITY_REGENERATION_WORKER_ENABLED !== 'true') return;
    try {
      await this.processQueued(5);
    } catch (error) {
      this.logger.error(`Capability regeneration worker tick failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async processQueued(limit = 5, workerId = `capability-regeneration-${process.pid}-${randomUUID()}`): Promise<number> {
    let finalized = 0;
    for (let index = 0; index < Math.max(0, Math.min(limit, 20)); index += 1) {
      const job = await this.claimNext(workerId);
      if (!job) break;
      if (await this.processJob(job)) finalized += 1;
    }
    return finalized;
  }

  async processJob(job: ClaimedRegenerationJob): Promise<boolean> {
    try {
      const result = await this.regeneration.executeJob(job.id, job.leaseOwner, workspaceRoot());
      const status = result.status === 'completed' ? 'completed' : 'blocked';
      const rows = await this.prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
        UPDATE "brain_capability_regeneration_job"
        SET "status" = ${status},
            "report" = ${JSON.stringify(result.report)}::jsonb,
            "generatedResourceVersionIds" = ${JSON.stringify(result.generatedResourceVersionIds)}::jsonb,
            "errorCode" = ${status === 'blocked' ? 'regeneration_blocked' : null},
            "errorMessage" = ${status === 'blocked' ? firstReason(result.report) : null},
            "completedAt" = NOW(),
            "leaseOwner" = NULL,
            "leasedAt" = NULL,
            "leaseExpiresAt" = NULL,
            "updatedAt" = NOW()
        WHERE "id" = ${job.id}
          AND "status" = 'leased'
          AND "leaseOwner" = ${job.leaseOwner}
          AND "leaseExpiresAt" > NOW()
        RETURNING "id"
      `);
      return rows.length === 1;
    } catch (error) {
      return this.recordFailure(job, error);
    }
  }

  private async claimNext(workerId: string): Promise<ClaimedRegenerationJob | null> {
    const rows = await this.prisma.$queryRaw<ClaimedRegenerationJob[]>(Prisma.sql`
      WITH exhausted AS (
        UPDATE "brain_capability_regeneration_job" AS exhausted_job
        SET "status" = 'dead_letter',
            "errorCode" = 'regeneration_dead_letter',
            "errorMessage" = '自动再生成已达到最大尝试次数，请人工重试。',
            "completedAt" = NOW(),
            "leaseOwner" = NULL,
            "leasedAt" = NULL,
            "leaseExpiresAt" = NULL,
            "updatedAt" = NOW()
        WHERE (
          (exhausted_job."status" IN ('queued', 'retry_scheduled') AND exhausted_job."availableAt" <= NOW())
          OR (exhausted_job."status" = 'leased' AND exhausted_job."leaseExpiresAt" < NOW())
        )
          AND exhausted_job."attemptCount" >= exhausted_job."maxAttempts"
          AND jsonb_array_length(exhausted_job."affectedCapabilities") > 0
          AND COALESCE(exhausted_job."errorCode", '') NOT IN (
            'business_definition_change_pending',
            'business_definition_registry_failed',
            'affected_capability_ambiguous'
          )
        RETURNING exhausted_job."id"
      ),
      candidate AS (
        SELECT job."id"
        FROM "brain_capability_regeneration_job" AS job
        WHERE (
          (job."status" IN ('queued', 'retry_scheduled') AND job."availableAt" <= NOW())
          OR (job."status" = 'leased' AND job."leaseExpiresAt" < NOW())
        )
          AND job."attemptCount" < job."maxAttempts"
          AND jsonb_array_length(job."affectedCapabilities") > 0
          AND COALESCE(job."errorCode", '') NOT IN (
            'business_definition_change_pending',
            'business_definition_registry_failed',
            'affected_capability_ambiguous'
          )
        ORDER BY job."availableAt" ASC, job."id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "brain_capability_regeneration_job" AS job
      SET "status" = 'leased',
          "attemptCount" = job."attemptCount" + 1,
          "leasedAt" = NOW(),
          "leaseExpiresAt" = NOW() + INTERVAL '5 minutes',
          "leaseOwner" = ${workerId},
          "updatedAt" = NOW()
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING job."id", job."status", job."attemptCount", job."maxAttempts", job."leaseOwner"
    `);
    return rows[0] ?? null;
  }

  private async recordFailure(job: ClaimedRegenerationJob, error: unknown): Promise<boolean> {
    const deadLetter = job.attemptCount >= job.maxAttempts;
    const delayMinutes = [1, 5, 20][Math.min(Math.max(job.attemptCount - 1, 0), 2)]!;
    const status = deadLetter ? 'dead_letter' : 'retry_scheduled';
    const rows = await this.prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      UPDATE "brain_capability_regeneration_job"
      SET "status" = ${status},
          "availableAt" = CASE WHEN ${deadLetter} THEN NOW() ELSE NOW() + ${delayMinutes} * INTERVAL '1 minute' END,
          "errorCode" = ${deadLetter ? 'regeneration_dead_letter' : 'regeneration_retry_scheduled'},
          "errorMessage" = ${publicErrorMessage(error)},
          "completedAt" = CASE WHEN ${deadLetter} THEN NOW() ELSE NULL END,
          "leaseOwner" = NULL,
          "leasedAt" = NULL,
          "leaseExpiresAt" = NULL,
          "updatedAt" = NOW()
      WHERE "id" = ${job.id}
        AND "status" = 'leased'
        AND "leaseOwner" = ${job.leaseOwner}
        AND "leaseExpiresAt" > NOW()
      RETURNING "id"
    `);
    return rows.length === 1;
  }
}

function workspaceRoot(): string {
  if (process.env.BRAIN_CAPABILITY_WORKSPACE_ROOT) return resolve(process.env.BRAIN_CAPABILITY_WORKSPACE_ROOT);
  const cwd = process.cwd();
  return basename(cwd).toLowerCase() === 'server-v2' ? resolve(cwd, '../..') : resolve(cwd);
}

function firstReason(report: Record<string, unknown>): string {
  const reasons = Array.isArray(report.blockingReasons) ? report.blockingReasons : [];
  return typeof reasons[0] === 'string' ? reasons[0].slice(0, 500) : 'regeneration_blocked';
}
