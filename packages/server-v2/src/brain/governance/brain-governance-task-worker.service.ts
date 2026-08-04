import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BrainGovernanceControlPlaneService } from './brain-governance-control-plane.service.js';

@Injectable()
export class BrainGovernanceTaskWorkerService {
  private readonly logger = new Logger(BrainGovernanceTaskWorkerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly controlPlane: BrainGovernanceControlPlaneService,
  ) {}

  @Cron('*/5 * * * * *', { timeZone: 'Asia/Shanghai' })
  async tick() {
    if (process.env.BRAIN_GOVERNANCE_TASK_WORKER_ENABLED !== 'true') return;
    try {
      await this.processAvailable();
    } catch (error) {
      this.logger.error(`Governance task worker tick failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async processAvailable(limit = 10, workerId = `brain-governance-${process.pid}-${randomUUID()}`) {
    const boundedLimit = Math.max(1, Math.min(limit, 50));
    const now = new Date();
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "brain_governance_task"
      SET "status" = 'failed',
          "blockerType" = 'system',
          "blockerCode" = 'governance_task_attempts_exhausted',
          "resolutionType" = 'contact_owner',
          "errorCode" = 'governance_task_attempts_exhausted',
          "errorMessage" = '治理任务已达到最大自动尝试次数，请联系负责人处理。',
          "completedAt" = ${now},
          "leaseOwner" = NULL,
          "leasedAt" = NULL,
          "leaseExpiresAt" = NULL,
          "updatedAt" = ${now}
      WHERE "attemptCount" >= "maxAttempts"
        AND (
          ("status" = 'pending' AND "availableAt" <= ${now})
          OR ("status" IN ('validating', 'classifying', 'evaluating') AND "leaseExpiresAt" < ${now})
        )
    `);
    const tasks = await this.prisma.brainGovernanceTask.findMany({
      where: {
        OR: [
          { status: 'pending', availableAt: { lte: now } },
          { status: { in: ['validating', 'classifying', 'evaluating'] }, leaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
      take: boundedLimit,
      select: { id: true },
    });
    let processed = 0;
    for (const task of tasks) {
      if (await this.controlPlane.processTask(task.id, workerId)) processed += 1;
    }
    return processed;
  }
}
