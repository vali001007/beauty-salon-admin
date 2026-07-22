import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export type MarketingRecommendationV2VerificationInput = {
  schemaReady: boolean;
  storeScopedRunsMissingIdentity: number;
  recommendationInstancesMissingStore: number;
  crossStoreAudienceMembers: number;
  crossStoreAdoptions: number;
  legacyActivitiesMissingLinks: number;
  legacyTasksMissingLinks: number;
  crossStoreActivityLinks: number;
  crossStorePageLinks: number;
  crossStoreTaskLinks: number;
  staleRunningExecutions: number;
  invalidDeliveryFacts: number;
  eligibleDeliveryTouchesMissingFacts: number;
  duplicatePrimaryRevenueFacts: number;
  supersededTerminalPrimaryConversions: number;
};

export function summarizeMarketingRecommendationV2Verification(input: MarketingRecommendationV2VerificationInput) {
  const passed =
    input.schemaReady &&
    input.storeScopedRunsMissingIdentity === 0 &&
    input.recommendationInstancesMissingStore === 0 &&
    input.crossStoreAudienceMembers === 0 &&
    input.crossStoreAdoptions === 0 &&
    input.legacyActivitiesMissingLinks === 0 &&
    input.legacyTasksMissingLinks === 0 &&
    input.crossStoreActivityLinks === 0 &&
    input.crossStorePageLinks === 0 &&
    input.crossStoreTaskLinks === 0 &&
    input.staleRunningExecutions === 0 &&
    input.invalidDeliveryFacts === 0 &&
    input.eligibleDeliveryTouchesMissingFacts === 0 &&
    input.duplicatePrimaryRevenueFacts === 0 &&
    input.supersededTerminalPrimaryConversions === 0;
  return { ...input, passed };
}

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

async function main() {
  config({ path: '.env' });
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
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
        to_regclass('public."MarketingRecommendationInstance"') IS NOT NULL AS "instanceTable",
        to_regclass('public."MarketingRecommendationAudienceSnapshot"') IS NOT NULL AS "audienceSnapshotTable",
        to_regclass('public."MarketingRecommendationAudienceMember"') IS NOT NULL AS "audienceMemberTable",
        to_regclass('public."MarketingRecommendationOfferSnapshot"') IS NOT NULL AS "offerSnapshotTable",
        to_regclass('public."MarketingDeliveryJob"') IS NOT NULL AS "deliveryJobTable",
        to_regclass('public."MarketingEffectFact"') IS NOT NULL AS "effectFactTable",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'PredictionRun' AND column_name = 'runKey'
        ) AS "predictionRunIdentity"
    `);
    const schemaReady = Boolean(
      readiness[0]?.instanceTable &&
      readiness[0]?.audienceSnapshotTable &&
      readiness[0]?.audienceMemberTable &&
      readiness[0]?.offerSnapshotTable &&
      readiness[0]?.deliveryJobTable &&
      readiness[0]?.effectFactTable &&
      readiness[0]?.predictionRunIdentity,
    );

    let storeScopedRunsMissingIdentity = 0;
    let recommendationInstancesMissingStore = 0;
    let crossStoreAudienceMembers = 0;
    let crossStoreAdoptions = 0;
    let legacyActivitiesMissingLinks = 0;
    let legacyTasksMissingLinks = 0;
    let crossStoreActivityLinks = 0;
    let crossStorePageLinks = 0;
    let crossStoreTaskLinks = 0;
    let staleRunningExecutions = 0;
    let invalidDeliveryFacts = 0;
    let eligibleDeliveryTouchesMissingFacts = 0;
    let duplicatePrimaryRevenueFacts = 0;
    let supersededTerminalPrimaryConversions = 0;
    if (schemaReady) {
      const [
        runRows,
        instanceRows,
        audienceRows,
        adoptionRows,
        activityMissingRows,
        taskMissingRows,
        activityScopeRows,
        pageScopeRows,
        taskScopeRows,
        staleRows,
        deliveryRows,
        missingFactRows,
        revenueRows,
        supersededConversionRows,
      ] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(`
          SELECT COUNT(*)::bigint AS count
          FROM "PredictionRun"
          WHERE "scopeStatus" = 'store_scoped'
            AND ("storeId" IS NULL OR "businessDate" IS NULL OR "runKey" IS NULL)
        `),
        prisma.$queryRawUnsafe<any[]>(`
          SELECT COUNT(*)::bigint AS count
          FROM "MarketingRecommendationInstance"
          WHERE "storeId" IS NULL
        `),
        prisma.$queryRawUnsafe<any[]>(`
          SELECT COUNT(*)::bigint AS count
          FROM "MarketingRecommendationAudienceMember" member
          JOIN "MarketingRecommendationAudienceSnapshot" snapshot ON snapshot."id" = member."snapshotId"
          JOIN "MarketingRecommendationInstance" instance ON instance."id" = snapshot."recommendationInstanceId"
          JOIN "Customer" customer ON customer."id" = member."customerId"
          WHERE member."storeId" <> snapshot."storeId"
             OR snapshot."storeId" <> instance."storeId"
             OR customer."storeId" <> instance."storeId"
        `),
        prisma.$queryRawUnsafe<any[]>(`
          SELECT COUNT(*)::bigint AS count
          FROM "MarketingRecommendationAdoption" adoption
          JOIN "MarketingRecommendationInstance" instance ON instance."id" = adoption."recommendationInstanceId"
          WHERE adoption."storeId" <> instance."storeId"
        `),
        prisma.$queryRawUnsafe<any[]>(`
          SELECT COUNT(*)::bigint AS count
          FROM "MarketingActivity"
          WHERE "sourceRecommendationId" IS NOT NULL
            AND ("recommendationInstanceId" IS NULL OR "adoptionId" IS NULL)
        `),
        prisma.$queryRawUnsafe<any[]>(`
          SELECT COUNT(*)::bigint AS count
          FROM "TerminalFollowUpTask"
          WHERE "recommendationId" IS NOT NULL
            AND ("recommendationInstanceId" IS NULL OR "adoptionId" IS NULL)
        `),
        prisma.$queryRawUnsafe<any[]>(`
          SELECT COUNT(*)::bigint AS count
          FROM "MarketingActivity" activity
          JOIN "MarketingRecommendationInstance" instance ON instance.id = activity."recommendationInstanceId"
          JOIN "MarketingRecommendationAdoption" adoption ON adoption.id = activity."adoptionId"
          WHERE activity."storeId" <> instance."storeId"
             OR activity."storeId" <> adoption."storeId"
             OR adoption."recommendationInstanceId" IS DISTINCT FROM activity."recommendationInstanceId"
             OR adoption."activityId" IS DISTINCT FROM activity.id
        `),
        prisma.$queryRawUnsafe<any[]>(`
          SELECT COUNT(*)::bigint AS count
          FROM "MarketingPage" page
          JOIN "MarketingRecommendationInstance" instance ON instance.id = page."recommendationInstanceId"
          JOIN "MarketingRecommendationAdoption" adoption ON adoption.id = page."adoptionId"
          WHERE page."storeId" IS DISTINCT FROM instance."storeId"
             OR page."storeId" IS DISTINCT FROM adoption."storeId"
             OR adoption."recommendationInstanceId" IS DISTINCT FROM page."recommendationInstanceId"
             OR adoption."activityId" IS DISTINCT FROM page."activityId"
        `),
        prisma.$queryRawUnsafe<any[]>(`
          SELECT COUNT(*)::bigint AS count
          FROM "TerminalFollowUpTask" task
          JOIN "MarketingRecommendationInstance" instance ON instance.id = task."recommendationInstanceId"
          JOIN "MarketingRecommendationAdoption" adoption ON adoption.id = task."adoptionId"
          WHERE task."storeId" <> instance."storeId"
             OR task."storeId" <> adoption."storeId"
             OR adoption."recommendationInstanceId" IS DISTINCT FROM task."recommendationInstanceId"
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
        prisma.$queryRawUnsafe<any[]>(`
          SELECT COUNT(*)::bigint AS count
          FROM "MarketingEffectFact"
          WHERE "factType" = 'delivery'
            AND COALESCE("countValue", 0) > 0
            AND COALESCE(("metadataJson"->>'status'), '') IN ('failed', 'queued', 'reached')
        `),
        prisma.$queryRawUnsafe<any[]>(`
          SELECT COUNT(*)::bigint AS count
          FROM "MarketingAutomationTouch" touch
          WHERE touch.status IN ('sent', 'delivered', 'opened', 'clicked', 'converted')
            AND NOT EXISTS (SELECT 1 FROM "MarketingDeliveryJob" job WHERE job."touchId" = touch.id)
            AND (
              NOT EXISTS (
                SELECT 1 FROM "MarketingEffectFact" fact
                WHERE fact."sourceSystem" = 'marketing_delivery_worker'
                  AND fact."sourceEventId" = 'legacy-touch:' || touch.id
                  AND fact."factType" = 'delivery'
              )
              OR NOT EXISTS (
                SELECT 1 FROM "MarketingEffectFact" fact
                WHERE fact."sourceSystem" = 'marketing_delivery_worker'
                  AND fact."sourceEventId" = 'legacy-touch:' || touch.id
                  AND fact."factType" = 'cost'
              )
            )
        `),
        prisma.$queryRawUnsafe<any[]>(`
          SELECT COUNT(*)::bigint AS count FROM (
            SELECT "storeId", "orderId"
            FROM "MarketingEffectFact"
            WHERE "factType" = 'revenue' AND "isPrimary" = true AND "orderId" IS NOT NULL
            GROUP BY "storeId", "orderId"
            HAVING COUNT(*) > 1
          ) duplicates
        `),
        prisma.$queryRawUnsafe<any[]>(`
          SELECT COUNT(*)::bigint AS count
          FROM "MarketingEffectFact" terminal
          WHERE terminal."factType" = 'conversion'
            AND terminal."sourceSystem" = 'terminal_follow_up'
            AND terminal."isPrimary" = true
            AND terminal."orderId" IS NULL
            AND terminal."touchId" IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM "MarketingEffectFact" order_fact
              WHERE order_fact."storeId" = terminal."storeId"
                AND order_fact."touchId" = terminal."touchId"
                AND order_fact."factType" = 'conversion'
                AND order_fact."sourceSystem" = 'marketing_attribution'
                AND order_fact."isPrimary" = true
                AND order_fact."orderId" IS NOT NULL
            )
        `),
      ]);
      storeScopedRunsMissingIdentity = numberValue(runRows[0]?.count);
      recommendationInstancesMissingStore = numberValue(instanceRows[0]?.count);
      crossStoreAudienceMembers = numberValue(audienceRows[0]?.count);
      crossStoreAdoptions = numberValue(adoptionRows[0]?.count);
      legacyActivitiesMissingLinks = numberValue(activityMissingRows[0]?.count);
      legacyTasksMissingLinks = numberValue(taskMissingRows[0]?.count);
      crossStoreActivityLinks = numberValue(activityScopeRows[0]?.count);
      crossStorePageLinks = numberValue(pageScopeRows[0]?.count);
      crossStoreTaskLinks = numberValue(taskScopeRows[0]?.count);
      staleRunningExecutions = numberValue(staleRows[0]?.count);
      invalidDeliveryFacts = numberValue(deliveryRows[0]?.count);
      eligibleDeliveryTouchesMissingFacts = numberValue(missingFactRows[0]?.count);
      duplicatePrimaryRevenueFacts = numberValue(revenueRows[0]?.count);
      supersededTerminalPrimaryConversions = numberValue(supersededConversionRows[0]?.count);
    }

    const result = summarizeMarketingRecommendationV2Verification({
      schemaReady,
      storeScopedRunsMissingIdentity,
      recommendationInstancesMissingStore,
      crossStoreAudienceMembers,
      crossStoreAdoptions,
      legacyActivitiesMissingLinks,
      legacyTasksMissingLinks,
      crossStoreActivityLinks,
      crossStorePageLinks,
      crossStoreTaskLinks,
      staleRunningExecutions,
      invalidDeliveryFacts,
      eligibleDeliveryTouchesMissingFacts,
      duplicatePrimaryRevenueFacts,
      supersededTerminalPrimaryConversions,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
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
