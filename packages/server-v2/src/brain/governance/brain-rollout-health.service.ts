import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BrainRolloutHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async observe(input: {
    releaseId: number;
    activatedAt: Date | null;
    promotionPolicy: Prisma.JsonValue;
    healthThresholds: Prisma.JsonValue;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const policy = record(input.promotionPolicy);
    const thresholds = record(input.healthThresholds);
    const observationMinutes = finite(policy.observationMinutes, 30);
    const minimumSampleSize = Math.max(1, Math.trunc(finite(policy.minimumSampleSize, 20)));
    const observedFrom = input.activatedAt ?? now;
    const elapsedMinutes = Math.max(0, (now.getTime() - observedFrom.getTime()) / 60_000);
    const traces = await this.prisma.brainRunStep.findMany({
      where: {
        stepKey: 'release_runtime_selection',
        createdAt: { gte: observedFrom, lte: now },
      },
      orderBy: { createdAt: 'asc' },
      take: 5000,
      select: {
        runId: true,
        output: true,
        run: { select: { status: true, error: true, createdAt: true } },
      },
    });
    const matched = traces.filter((trace) => Number(record(trace.output).releaseId) === input.releaseId);
    const runIds = [...new Set(matched.map((trace) => trace.runId))];
    const feedback = runIds.length
      ? await this.prisma.brainFeedback.findMany({
          where: { runId: { in: runIds }, createdAt: { lte: now } },
          select: { runId: true, rating: true },
        })
      : [];
    const errors = matched.filter((trace) => trace.run.status === 'failed');
    const timeoutCount = matched.filter((trace) => contains(trace.run.error, /timeout|timed out|超时/i)).length;
    const permissionViolationCount = matched.filter((trace) => contains(trace.run.error, /permission|forbidden|unauthorized|权限/i)).length;
    const negativeFeedbackCount = feedback.filter((item) => item.rating === 'needs_improvement').length;
    const sampleSize = runIds.length;
    const metrics = {
      errorRate: sampleSize ? errors.length / sampleSize : null,
      timeoutRate: sampleSize ? timeoutCount / sampleSize : null,
      permissionViolationCount,
      negativeFeedbackRate: feedback.length ? negativeFeedbackCount / feedback.length : 0,
      feedbackSampleSize: feedback.length,
    };
    const blockers: string[] = [];
    if (elapsedMinutes < observationMinutes) blockers.push('rollout_observation_window_incomplete');
    if (sampleSize < minimumSampleSize) blockers.push('rollout_observation_sample_insufficient');
    compare(blockers, metrics.errorRate, thresholds.maxErrorRate, 'errorRate');
    compare(blockers, metrics.timeoutRate, thresholds.maxTimeoutRate, 'timeoutRate');
    compare(blockers, metrics.permissionViolationCount, thresholds.maxPermissionViolationCount, 'permissionViolationCount');
    if (thresholds.maxNegativeFeedbackRate !== undefined) {
      compare(blockers, metrics.negativeFeedbackRate, thresholds.maxNegativeFeedbackRate, 'negativeFeedbackRate');
    }
    return {
      status: blockers.length ? 'blocked' : 'ready',
      releaseId: input.releaseId,
      observedFrom: observedFrom.toISOString(),
      observedTo: now.toISOString(),
      observationMinutes,
      elapsedMinutes: Math.floor(elapsedMinutes),
      minimumSampleSize,
      sampleSize,
      metrics,
      thresholds,
      blockers,
      source: 'brain_run_trace_and_feedback',
    };
  }
}

function compare(blockers: string[], value: number | null, threshold: unknown, metric: string) {
  const limit = Number(threshold);
  if (!Number.isFinite(limit)) {
    blockers.push(`rollout_health_threshold_missing:${metric}`);
    return;
  }
  if (value === null) return;
  if (value > limit) blockers.push(`rollout_health_threshold_exceeded:${metric}`);
}

function finite(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function contains(value: Prisma.JsonValue | null, pattern: RegExp) {
  return pattern.test(JSON.stringify(value ?? {}));
}

function record(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
