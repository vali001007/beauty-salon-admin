import { createHash } from 'crypto';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type LegacyActivity = {
  id: number;
  storeId: number;
  title: string;
  description?: string | null;
  status?: string | null;
  sourceRecommendationId?: string | null;
  predictionRunId?: string | null;
  participants: number;
  startDate?: Date | null;
  endDate?: Date | null;
  publishStatus?: string | null;
  publishedAt?: Date | null;
  createdAt: Date;
};

type LegacyTerminalTask = {
  id: number;
  storeId: number;
  customerId: number;
  recommendationId: number | null;
  title: string;
  priority: string;
  status: string;
  dueAt?: Date | null;
  createdAt: Date;
};

function shanghaiDate(date: Date) {
  const value = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return new Date(`${value}T00:00:00.000Z`);
}

export function buildLegacyActivityInstanceInput(activity: LegacyActivity) {
  const sourceRecommendationId = String(activity.sourceRecommendationId ?? '').trim();
  if (!Number.isInteger(activity.storeId) || activity.storeId <= 0 || !sourceRecommendationId) {
    throw new Error('legacy_activity_scope_unreliable');
  }

  const recommendationKey = `legacy:recommendation:${sourceRecommendationId}:activity:${activity.id}`;
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        activityId: activity.id,
        storeId: activity.storeId,
        sourceRecommendationId,
        predictionRunId: activity.predictionRunId ?? null,
      }),
    )
    .digest('hex');
  const generatedAt = activity.createdAt;
  const fallbackExpiresAt = new Date(generatedAt.getTime() + 30 * 86400000);
  const expiresAt = activity.endDate ?? fallbackExpiresAt;
  const status =
    ['ended', 'cancelled'].includes(String(activity.status)) || expiresAt.getTime() < Date.now() ? 'expired' : 'active';
  const parsedPredictionRunId = Number(activity.predictionRunId);

  return {
    storeId: activity.storeId,
    recommendationKey,
    sourceType: 'legacy',
    sourceVersion: 'legacy-activity-v1',
    predictionRunId:
      Number.isInteger(parsedPredictionRunId) && parsedPredictionRunId > 0 ? parsedPredictionRunId : null,
    businessDate: shanghaiDate(activity.startDate ?? activity.createdAt),
    status,
    title: activity.title,
    description: activity.description ?? null,
    priority: 'P1',
    urgency: 'recommended',
    preferredMode: 'activity',
    executionModes: ['activity'],
    evidenceSnapshot: {
      source: 'legacy_activity_backfill',
      legacyActivityId: activity.id,
      sourceRecommendationId,
    },
    strategySnapshot: null,
    targetCount: Math.max(0, Number(activity.participants ?? 0)),
    fingerprint,
    generatedAt,
    expiresAt,
  };
}

export function buildLegacyActivityAdoptionInput(activity: LegacyActivity, recommendationInstanceId: string) {
  const sourceRecommendationId = String(activity.sourceRecommendationId ?? '').trim();
  if (
    !Number.isInteger(activity.storeId) ||
    activity.storeId <= 0 ||
    !sourceRecommendationId ||
    !recommendationInstanceId
  ) {
    throw new Error('legacy_activity_scope_unreliable');
  }
  const numericRecommendationId = /^\d+$/.test(sourceRecommendationId) ? Number(sourceRecommendationId) : null;
  const numericPredictionRunId = Number(activity.predictionRunId);

  return {
    storeId: activity.storeId,
    recommendationId:
      Number.isInteger(numericRecommendationId) && Number(numericRecommendationId) > 0 ? numericRecommendationId : null,
    recommendationInstanceId,
    adoptionKey: `legacy-backfill:activity:${activity.storeId}:${activity.id}`,
    mode: 'activity',
    status: activity.publishStatus === 'published' || activity.publishedAt ? 'published' : 'draft',
    activityId: activity.id,
    predictionRunId:
      Number.isInteger(numericPredictionRunId) && numericPredictionRunId > 0 ? numericPredictionRunId : null,
    snapshotJson: {
      source: 'legacy_activity_backfill',
      activityId: activity.id,
      sourceRecommendationId,
    },
  };
}

export function buildLegacyTerminalInstanceInput(tasks: LegacyTerminalTask[]) {
  if (!tasks.length) throw new Error('legacy_terminal_scope_unreliable');
  const storeId = Number(tasks[0].storeId);
  const recommendationId = Number(tasks[0].recommendationId);
  if (
    !Number.isInteger(storeId) ||
    storeId <= 0 ||
    !Number.isInteger(recommendationId) ||
    recommendationId <= 0 ||
    tasks.some((task) => Number(task.storeId) !== storeId || Number(task.recommendationId) !== recommendationId)
  ) {
    throw new Error('legacy_terminal_scope_unreliable');
  }

  const taskIds = [...new Set(tasks.map((task) => Number(task.id)))].sort((left, right) => left - right);
  const customerIds = [...new Set(tasks.map((task) => Number(task.customerId)))].sort((left, right) => left - right);
  const generatedAt = new Date(Math.min(...tasks.map((task) => task.createdAt.getTime())));
  const dueDates = tasks.map((task) => task.dueAt).filter((date): date is Date => Boolean(date));
  const expiresAt = dueDates.length
    ? new Date(Math.max(...dueDates.map((date) => date.getTime())))
    : new Date(generatedAt.getTime() + 30 * 86400000);
  const recommendationKey = `legacy:recommendation:${recommendationId}:terminal_follow_up`;
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ storeId, recommendationId, taskIds, customerIds }))
    .digest('hex');
  const urgent = tasks.some((task) => task.priority === 'urgent');

  return {
    storeId,
    recommendationId,
    recommendationKey,
    sourceType: 'legacy',
    sourceVersion: 'legacy-terminal-v1',
    predictionRunId: null,
    businessDate: shanghaiDate(generatedAt),
    status: expiresAt.getTime() < Date.now() ? 'expired' : 'active',
    title: tasks[0].title || '历史推荐终端跟进',
    description: `历史推荐终端跟进任务 ${taskIds.length} 条`,
    priority: urgent ? 'P0' : 'P1',
    urgency: urgent ? 'urgent' : 'recommended',
    preferredMode: 'terminal_follow_up',
    executionModes: ['terminal_follow_up'],
    evidenceSnapshot: {
      source: 'legacy_terminal_backfill',
      recommendationId,
      taskIds,
      customerIds,
    },
    strategySnapshot: null,
    targetCount: customerIds.length,
    fingerprint,
    generatedAt,
    expiresAt,
    taskIds,
    customerIds,
    adoptionKey: `legacy-backfill:terminal:${storeId}:${recommendationId}`,
  };
}

export function parseBackfillMode(
  argv: string[] = process.argv,
  env: Record<string, string | undefined> = process.env,
) {
  const apply = argv.includes('--apply');
  const confirmed = argv.includes('--yes');
  if (apply && (!confirmed || env.ALLOW_MARKETING_DATA_WRITE !== 'true')) {
    throw new Error('Applying backfill requires --apply --yes and ALLOW_MARKETING_DATA_WRITE=true');
  }
  return { apply };
}

export function validateLegacyPredictionScope(
  storeId: number,
  predictionRunId: number | null,
  run?: { id: number; storeId?: number | null; scopeStatus?: string | null },
) {
  if (!predictionRunId) return null;
  if (!run) return 'prediction_run_missing';
  if (run.scopeStatus === 'legacy_global') return null;
  if (Number(run.storeId) !== storeId) return 'prediction_run_store_mismatch';
  return null;
}

async function main() {
  config({ path: '.env' });
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const { apply } = parseBackfillMode();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX || 3),
      idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
    }),
  });

  try {
    const activities = await prisma.marketingActivity.findMany({
      where: { sourceRecommendationId: { not: null } },
      select: {
        id: true,
        storeId: true,
        title: true,
        description: true,
        status: true,
        sourceRecommendationId: true,
        predictionRunId: true,
        participants: true,
        startDate: true,
        endDate: true,
        publishStatus: true,
        publishedAt: true,
        createdAt: true,
      },
      orderBy: { id: 'asc' },
    });
    const terminalTasks = await prisma.terminalFollowUpTask.findMany({
      where: { recommendationId: { not: null } },
      select: {
        id: true,
        storeId: true,
        customerId: true,
        recommendationId: true,
        title: true,
        priority: true,
        status: true,
        dueAt: true,
        createdAt: true,
      },
      orderBy: { id: 'asc' },
    });

    const predictionScopeReadiness = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'PredictionRun' AND column_name = 'storeId') AS "storeIdReady",
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'PredictionRun' AND column_name = 'scopeStatus') AS "scopeStatusReady"
    `);
    const predictionScopeReady = Boolean(
      predictionScopeReadiness[0]?.storeIdReady && predictionScopeReadiness[0]?.scopeStatusReady,
    );
    const referencedRunIds = [
      ...new Set(
        activities.map((activity) => Number(activity.predictionRunId)).filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
    const predictionRuns =
      predictionScopeReady && referencedRunIds.length
        ? await prisma.predictionRun.findMany({
            where: { id: { in: referencedRunIds } },
            select: { id: true, storeId: true, scopeStatus: true },
          })
        : [];
    const runById = new Map(predictionRuns.map((run) => [run.id, run]));

    const candidates: Array<{
      activity: LegacyActivity;
      input: ReturnType<typeof buildLegacyActivityInstanceInput>;
    }> = [];
    const conflicts: Array<{ activityId: number; code: string }> = [];
    for (const activity of activities) {
      try {
        const input = buildLegacyActivityInstanceInput(activity);
        if (input.predictionRunId && !predictionScopeReady) {
          conflicts.push({ activityId: activity.id, code: 'prediction_run_scope_columns_missing' });
          continue;
        }
        const scopeConflict = validateLegacyPredictionScope(
          activity.storeId,
          input.predictionRunId,
          input.predictionRunId ? runById.get(input.predictionRunId) : undefined,
        );
        if (scopeConflict) {
          conflicts.push({ activityId: activity.id, code: scopeConflict });
          continue;
        }
        candidates.push({ activity, input });
      } catch (error: any) {
        conflicts.push({ activityId: activity.id, code: error?.message ?? 'legacy_activity_backfill_failed' });
      }
    }

    const taskGroups = new Map<string, LegacyTerminalTask[]>();
    for (const task of terminalTasks) {
      const key = `${task.storeId}:${task.recommendationId}`;
      taskGroups.set(key, [...(taskGroups.get(key) ?? []), task]);
    }
    const terminalCandidates: Array<ReturnType<typeof buildLegacyTerminalInstanceInput>> = [];
    const terminalConflicts: Array<{ taskIds: number[]; code: string }> = [];
    for (const tasks of taskGroups.values()) {
      try {
        terminalCandidates.push(buildLegacyTerminalInstanceInput(tasks));
      } catch (error: any) {
        terminalConflicts.push({
          taskIds: tasks.map((task) => task.id),
          code: error?.message ?? 'legacy_terminal_backfill_failed',
        });
      }
    }

    let applied = 0;
    let appliedPages = 0;
    let appliedTaskBatches = 0;
    let appliedTasks = 0;
    if (apply) {
      for (const candidate of candidates) {
        await prisma.$transaction(async (tx) => {
          const instance = await tx.marketingRecommendationInstance.upsert({
            where: {
              storeId_recommendationKey_fingerprint: {
                storeId: candidate.input.storeId,
                recommendationKey: candidate.input.recommendationKey,
                fingerprint: candidate.input.fingerprint,
              },
            },
            create: candidate.input as any,
            update: {},
          });
          const adoptionInput = buildLegacyActivityAdoptionInput(candidate.activity, instance.id);
          const adoption = await tx.marketingRecommendationAdoption.upsert({
            where: { adoptionKey: adoptionInput.adoptionKey },
            create: adoptionInput,
            update: {
              recommendationInstanceId: instance.id,
              status: adoptionInput.status,
              activityId: candidate.activity.id,
              predictionRunId: adoptionInput.predictionRunId,
              snapshotJson: adoptionInput.snapshotJson,
            },
          });
          await tx.marketingActivity.update({
            where: { id: candidate.activity.id },
            data: { recommendationInstanceId: instance.id, adoptionId: adoption.id },
          });
          const pages = await tx.marketingPage.updateMany({
            where: {
              activityId: candidate.activity.id,
              OR: [{ storeId: candidate.input.storeId }, { storeId: null }],
            },
            data: {
              storeId: candidate.input.storeId,
              recommendationInstanceId: instance.id,
              adoptionId: adoption.id,
            },
          });
          appliedPages += pages.count;
        });
        applied += 1;
      }
      for (const candidate of terminalCandidates) {
        await prisma.$transaction(async (tx) => {
          const { recommendationId, taskIds, customerIds, adoptionKey, ...instanceInput } = candidate;
          const instance = await tx.marketingRecommendationInstance.upsert({
            where: {
              storeId_recommendationKey_fingerprint: {
                storeId: instanceInput.storeId,
                recommendationKey: instanceInput.recommendationKey,
                fingerprint: instanceInput.fingerprint,
              },
            },
            create: instanceInput as any,
            update: {},
          });
          const adoption = await tx.marketingRecommendationAdoption.upsert({
            where: { adoptionKey },
            create: {
              storeId: instanceInput.storeId,
              recommendationId,
              recommendationInstanceId: instance.id,
              adoptionKey,
              mode: 'terminal_follow_up',
              status: 'dispatched',
              followUpTaskIds: taskIds,
              snapshotJson: {
                source: 'legacy_terminal_backfill',
                recommendationId,
                taskIds,
                customerIds,
              },
            },
            update: {
              recommendationInstanceId: instance.id,
              followUpTaskIds: taskIds,
            },
          });
          const updated = await tx.terminalFollowUpTask.updateMany({
            where: { id: { in: taskIds }, storeId: instanceInput.storeId, recommendationId },
            data: { recommendationInstanceId: instance.id, adoptionId: adoption.id },
          });
          appliedTasks += updated.count;
        });
        appliedTaskBatches += 1;
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: apply ? 'apply' : 'dry-run',
          scannedActivities: activities.length,
          candidateCount: candidates.length,
          conflictCount: conflicts.length,
          appliedCount: applied,
          appliedPageCount: appliedPages,
          conflicts,
          scannedTasks: terminalTasks.length,
          taskBatchCandidateCount: terminalCandidates.length,
          taskConflictCount: terminalConflicts.length,
          appliedTaskBatchCount: appliedTaskBatches,
          appliedTaskCount: appliedTasks,
          taskConflicts: terminalConflicts,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.env.NODE_ENV !== 'test') {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
