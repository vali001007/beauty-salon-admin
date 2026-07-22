import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export const NORMALIZE_STALE_QUEUED_TOUCHES_SQL = `
  UPDATE "MarketingAutomationTouch" touch
  SET status = 'failed', "errorCode" = 'legacy_execution_stale',
      "errorMessage" = '历史执行超过 30 分钟且没有可恢复投递任务'
  FROM "MarketingAutomationExecution" execution
  WHERE touch."executionId" = execution.id
    AND touch.status = 'queued'
    AND execution.status = 'running'
    AND COALESCE(execution."startedAt", execution."executedAt") < NOW() - INTERVAL '30 minutes'
    AND NOT EXISTS (
      SELECT 1 FROM "MarketingDeliveryJob" job WHERE job."executionId" = execution.id
    )
`;

export const NORMALIZE_LEGACY_EXECUTIONS_SQL = `
  WITH counts AS (
    SELECT execution.id,
           COUNT(touch.id)::int AS total,
           COUNT(touch.id) FILTER (WHERE touch.status IN ('sent', 'delivered', 'opened', 'clicked', 'converted'))::int AS reached,
           COUNT(touch.id) FILTER (WHERE touch.status = 'failed')::int AS failed,
           COUNT(touch.id) FILTER (WHERE touch.status = 'queued')::int AS queued
    FROM "MarketingAutomationExecution" execution
    LEFT JOIN "MarketingAutomationTouch" touch ON touch."executionId" = execution.id
    GROUP BY execution.id
  )
  UPDATE "MarketingAutomationExecution" execution
  SET "reachedCount" = counts.reached,
      "failedCount" = counts.failed,
      status = CASE
        WHEN counts.queued > 0 THEN 'running'
        WHEN counts.total = 0 OR counts.reached = counts.total THEN 'success'
        WHEN counts.reached > 0 AND counts.failed > 0 THEN 'partial_failed'
        ELSE 'failed'
      END,
      "completedAt" = CASE WHEN counts.queued = 0 THEN NOW() ELSE execution."completedAt" END,
      message = CASE WHEN counts.queued = 0 THEN 'legacy_status_normalized' ELSE execution.message END
  FROM counts
  WHERE execution.id = counts.id
    AND execution.status IN ('completed', 'running', 'success', 'partial_failed', 'failed')
`;

function parseMode() {
  const apply = process.argv.includes('--apply');
  if (apply && (!process.argv.includes('--yes') || process.env.ALLOW_MARKETING_DATA_WRITE !== 'true')) {
    throw new Error('Applying status normalization requires --apply --yes and ALLOW_MARKETING_DATA_WRITE=true');
  }
  return { apply };
}

function count(rows: any[]) {
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  config({ path: '.env' });
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const { apply } = parseMode();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX || 3),
      idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
    }),
  });

  try {
    const readiness = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        to_regclass('public."MarketingAutomationTouch"') IS NOT NULL AS "touchTable",
        to_regclass('public."MarketingAutomationExecution"') IS NOT NULL AS "executionTable",
        to_regclass('public."MarketingDeliveryJob"') IS NOT NULL AS "deliveryJobTable",
        to_regclass('public."MarketingInAppNotification"') IS NOT NULL AS "notificationTable"
    `);
    const schemaReady = Boolean(
      readiness[0]?.touchTable &&
      readiness[0]?.executionTable &&
      readiness[0]?.deliveryJobTable &&
      readiness[0]?.notificationTable,
    );
    if (!schemaReady) {
      console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', schemaReady, applied: false }, null, 2));
      if (apply) process.exitCode = 1;
      return;
    }

    const [reachedRows, verifiedRows, unverifiedRows, staleRows] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::bigint AS count FROM "MarketingAutomationTouch" WHERE status = 'reached'`,
      ),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*)::bigint AS count
        FROM "MarketingAutomationTouch" touch
        WHERE touch.status = 'reached'
          AND (
            EXISTS (SELECT 1 FROM "MarketingDeliveryJob" job WHERE job."touchId" = touch.id AND job.status = 'delivered')
            OR EXISTS (
              SELECT 1 FROM "MarketingInAppNotification" notification
              WHERE notification."executionId" = touch."executionId"
                AND notification."strategyId" = touch."strategyId"
                AND notification."customerId" = touch."customerId"
                AND notification.status IN ('delivered', 'opened')
            )
          )
      `),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*)::bigint AS count
        FROM "MarketingAutomationTouch" touch
        WHERE touch.status = 'reached'
          AND NOT EXISTS (SELECT 1 FROM "MarketingDeliveryJob" job WHERE job."touchId" = touch.id AND job.status = 'delivered')
          AND NOT EXISTS (
            SELECT 1 FROM "MarketingInAppNotification" notification
            WHERE notification."executionId" = touch."executionId"
              AND notification."strategyId" = touch."strategyId"
              AND notification."customerId" = touch."customerId"
              AND notification.status IN ('delivered', 'opened')
          )
      `),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*)::bigint AS count
        FROM "MarketingAutomationExecution" execution
        WHERE execution.status = 'running'
          AND COALESCE(execution."startedAt", execution."executedAt") < NOW() - INTERVAL '30 minutes'
          AND NOT EXISTS (
            SELECT 1 FROM "MarketingDeliveryJob" job
            WHERE job."executionId" = execution.id
              AND job.status = 'leased'
              AND job."leaseExpiresAt" > NOW()
          )
      `),
    ]);

    let normalizedDelivered = 0;
    let normalizedFailed = 0;
    let normalizedStaleQueued = 0;
    let normalizedExecutions = 0;
    if (apply) {
      await prisma.$transaction(async (tx) => {
        const delivered = await tx.$executeRawUnsafe(`
          UPDATE "MarketingAutomationTouch" touch
          SET status = 'delivered', "errorCode" = NULL, "errorMessage" = NULL
          WHERE touch.status = 'reached'
            AND (
              EXISTS (SELECT 1 FROM "MarketingDeliveryJob" job WHERE job."touchId" = touch.id AND job.status = 'delivered')
              OR EXISTS (
                SELECT 1 FROM "MarketingInAppNotification" notification
                WHERE notification."executionId" = touch."executionId"
                  AND notification."strategyId" = touch."strategyId"
                  AND notification."customerId" = touch."customerId"
                  AND notification.status IN ('delivered', 'opened')
              )
            )
        `);
        const failed = await tx.$executeRawUnsafe(`
          UPDATE "MarketingAutomationTouch" touch
          SET status = 'failed', "errorCode" = 'legacy_delivery_unverified',
              "errorMessage" = '历史 reached 记录缺少真实投递对象'
          WHERE touch.status = 'reached'
        `);
        const staleQueued = await tx.$executeRawUnsafe(NORMALIZE_STALE_QUEUED_TOUCHES_SQL);
        const executions = await tx.$executeRawUnsafe(NORMALIZE_LEGACY_EXECUTIONS_SQL);
        normalizedDelivered = delivered;
        normalizedFailed = failed;
        normalizedStaleQueued = staleQueued;
        normalizedExecutions = executions;
      });
    }

    console.log(
      JSON.stringify(
        {
          mode: apply ? 'apply' : 'dry-run',
          schemaReady,
          reachedTouches: count(reachedRows),
          verifiedReachedTouches: count(verifiedRows),
          unverifiedReachedTouches: count(unverifiedRows),
          staleRunningExecutions: count(staleRows),
          normalizedDelivered,
          normalizedFailed,
          normalizedStaleQueued,
          normalizedExecutions,
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
