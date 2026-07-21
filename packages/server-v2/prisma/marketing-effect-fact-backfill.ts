import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function parseMode() {
  const apply = process.argv.includes('--apply');
  if (apply && (!process.argv.includes('--yes') || process.env.ALLOW_MARKETING_DATA_WRITE !== 'true')) {
    throw new Error('Applying effect fact backfill requires --apply --yes and ALLOW_MARKETING_DATA_WRITE=true');
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
        to_regclass('public."MarketingEffectFact"') IS NOT NULL AS "factTable",
        to_regclass('public."MarketingAttribution"') IS NOT NULL AS "automationAttributionTable",
        to_regclass('public."MarketingPageAttribution"') IS NOT NULL AS "pageAttributionTable",
        to_regclass('public."MarketingAutomationTouch"') IS NOT NULL AS "touchTable"
    `);
    const schemaReady = Boolean(
      readiness[0]?.factTable &&
      readiness[0]?.automationAttributionTable &&
      readiness[0]?.pageAttributionTable &&
      readiness[0]?.touchTable,
    );
    if (!schemaReady) {
      console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', schemaReady, applied: false }, null, 2));
      if (apply) process.exitCode = 1;
      return;
    }

    const [revenueRows, assistRows, refundRows, deliveryRows, invalidRows, supersededConversionRows] =
      await Promise.all([
        prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(DISTINCT "orderId")::bigint AS count
        FROM (
          SELECT "orderId" FROM "MarketingAttribution"
          UNION ALL
          SELECT "orderId" FROM "MarketingPageAttribution"
        ) candidates
      `),
        prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*)::bigint AS count FROM (
          SELECT "orderId" FROM (
            SELECT "orderId" FROM "MarketingAttribution"
            UNION ALL SELECT "orderId" FROM "MarketingPageAttribution"
          ) candidates GROUP BY "orderId" HAVING COUNT(*) > 1
        ) duplicate_orders
      `),
        prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*)::bigint AS count
        FROM "RefundRecord" refund
        WHERE refund.status IN ('completed', 'success', 'paid', 'refunded')
          AND EXISTS (
            SELECT 1 FROM "MarketingAttribution" attribution WHERE attribution."orderId" = refund."orderId"
            UNION ALL
            SELECT 1 FROM "MarketingPageAttribution" attribution WHERE attribution."orderId" = refund."orderId"
          )
      `),
        prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*)::bigint AS count
        FROM "MarketingAutomationTouch" touch
        WHERE touch.status IN ('sent', 'delivered', 'opened', 'clicked', 'converted')
          AND NOT EXISTS (SELECT 1 FROM "MarketingDeliveryJob" job WHERE job."touchId" = touch.id)
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

    let primaryRevenueFacts = 0;
    let assistFacts = 0;
    let refundFacts = 0;
    let deliveryFacts = 0;
    let estimatedCostFacts = 0;
    let demotedTerminalConversionFacts = 0;
    if (apply) {
      await prisma.$transaction(async (tx) => {
        demotedTerminalConversionFacts = await tx.$executeRawUnsafe(`
          UPDATE "MarketingEffectFact" terminal
          SET "isPrimary" = false,
              "metadataJson" = COALESCE(terminal."metadataJson", '{}'::jsonb)
                || jsonb_build_object('supersededByOrderConversion', true)
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
        `);
        primaryRevenueFacts = await tx.$executeRawUnsafe(`
          WITH candidates AS (
            SELECT execution."storeId", attribution."orderId", attribution."customerId",
                   attribution."attributedRevenue" AS amount, attribution."occurredAt",
                   'automation'::text AS source_type, attribution.id AS source_id,
                   strategy."recommendationInstanceId", strategy."adoptionId",
                   NULL::int AS "activityId", NULL::int AS "pageId",
                   attribution."strategyId", attribution."executionId", attribution."touchId",
                   NULL::int AS "promotionId", touch.channel
            FROM "MarketingAttribution" attribution
            JOIN "MarketingAutomationTouch" touch ON touch.id = attribution."touchId"
            JOIN "MarketingAutomationExecution" execution ON execution.id = attribution."executionId"
            JOIN "MarketingAutomationStrategy" strategy ON strategy.id = attribution."strategyId"
            UNION ALL
            SELECT COALESCE(page."storeId", lead."storeId") AS "storeId", attribution."orderId", attribution."customerId",
                   attribution."attributedRevenue" AS amount, attribution."convertedAt" AS "occurredAt",
                   'page'::text AS source_type, attribution.id AS source_id,
                   page."recommendationInstanceId", page."adoptionId", page."activityId", page.id AS "pageId",
                   NULL::int AS "strategyId", NULL::int AS "executionId", NULL::int AS "touchId",
                   NULL::int AS "promotionId", COALESCE(lead.channel, 'marketing_page') AS channel
            FROM "MarketingPageAttribution" attribution
            JOIN "MarketingPage" page ON page.id = attribution."pageId"
            JOIN "MarketingPageLead" lead ON lead.id = attribution."leadId"
          ), ranked AS (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY "orderId" ORDER BY "occurredAt" DESC, source_type DESC, source_id DESC) AS rn
            FROM candidates WHERE "storeId" IS NOT NULL
          )
          INSERT INTO "MarketingEffectFact" (
            "storeId", "factType", "metricSource", "sourceSystem", "sourceEventId", "amountValue",
            "recommendationInstanceId", "adoptionId", "activityId", "pageId", "strategyId", "executionId", "touchId",
            "promotionId", "customerId", "orderId", channel, "isPrimary", "metadataJson", "occurredAt", "createdAt"
          )
          SELECT "storeId", 'revenue', 'actual', 'marketing_attribution', 'order:' || "orderId", amount,
                 "recommendationInstanceId", "adoptionId", "activityId", "pageId", "strategyId", "executionId", "touchId",
                 "promotionId", "customerId", "orderId", channel, true,
                 jsonb_build_object('backfilled', true, 'sourceType', source_type, 'sourceId', source_id), "occurredAt", NOW()
          FROM ranked WHERE rn = 1
          ON CONFLICT ("sourceSystem", "sourceEventId", "factType") DO NOTHING
        `);
        assistFacts = await tx.$executeRawUnsafe(`
          WITH candidates AS (
            SELECT attribution."orderId", execution."storeId", attribution."customerId", attribution."occurredAt",
                   'automation'::text AS source_type, attribution.id AS source_id,
                   strategy."recommendationInstanceId", strategy."adoptionId", NULL::int AS "activityId", NULL::int AS "pageId",
                   attribution."strategyId", attribution."executionId", attribution."touchId", touch.channel
            FROM "MarketingAttribution" attribution
            JOIN "MarketingAutomationTouch" touch ON touch.id = attribution."touchId"
            JOIN "MarketingAutomationExecution" execution ON execution.id = attribution."executionId"
            JOIN "MarketingAutomationStrategy" strategy ON strategy.id = attribution."strategyId"
            UNION ALL
            SELECT attribution."orderId", COALESCE(page."storeId", lead."storeId"), attribution."customerId", attribution."convertedAt",
                   'page'::text, attribution.id, page."recommendationInstanceId", page."adoptionId", page."activityId", page.id,
                   NULL::int, NULL::int, NULL::int, COALESCE(lead.channel, 'marketing_page')
            FROM "MarketingPageAttribution" attribution
            JOIN "MarketingPage" page ON page.id = attribution."pageId"
            JOIN "MarketingPageLead" lead ON lead.id = attribution."leadId"
          ), ranked AS (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY "orderId" ORDER BY "occurredAt" DESC, source_type DESC, source_id DESC) AS rn
            FROM candidates WHERE "storeId" IS NOT NULL
          )
          INSERT INTO "MarketingEffectFact" (
            "storeId", "factType", "metricSource", "sourceSystem", "sourceEventId", "countValue",
            "recommendationInstanceId", "adoptionId", "activityId", "pageId", "strategyId", "executionId", "touchId",
            "customerId", "orderId", channel, "isPrimary", "metadataJson", "occurredAt", "createdAt"
          )
          SELECT "storeId", 'conversion', 'actual', 'marketing_attribution_assist',
                 'order:' || "orderId" || ':assist:' || source_type || ':' || source_id, 1,
                 "recommendationInstanceId", "adoptionId", "activityId", "pageId", "strategyId", "executionId", "touchId",
                 "customerId", "orderId", channel, false,
                 jsonb_build_object('backfilled', true, 'assistForOrderId', "orderId"), "occurredAt", NOW()
          FROM ranked WHERE rn > 1
          ON CONFLICT ("sourceSystem", "sourceEventId", "factType") DO NOTHING
        `);
        refundFacts = await tx.$executeRawUnsafe(`
          INSERT INTO "MarketingEffectFact" (
            "storeId", "factType", "metricSource", "sourceSystem", "sourceEventId", "amountValue",
            "recommendationInstanceId", "adoptionId", "activityId", "pageId", "strategyId", "executionId", "touchId",
            "promotionId", "customerId", "orderId", "refundId", channel, "isPrimary", "metadataJson", "occurredAt", "createdAt"
          )
          SELECT fact."storeId", 'revenue_refund', 'actual', 'marketing_attribution', 'refund:' || refund.id, -ABS(refund.amount),
                 fact."recommendationInstanceId", fact."adoptionId", fact."activityId", fact."pageId", fact."strategyId",
                 fact."executionId", fact."touchId", fact."promotionId", fact."customerId", refund."orderId", refund.id,
                 fact.channel, true, jsonb_build_object('backfilled', true), COALESCE(refund."refundedAt", refund."createdAt"), NOW()
          FROM "RefundRecord" refund
          JOIN "MarketingEffectFact" fact ON fact."orderId" = refund."orderId" AND fact."factType" = 'revenue' AND fact."isPrimary" = true
          WHERE refund.status IN ('completed', 'success', 'paid', 'refunded')
          ON CONFLICT ("sourceSystem", "sourceEventId", "factType") DO NOTHING
        `);
        deliveryFacts = await tx.$executeRawUnsafe(`
          INSERT INTO "MarketingEffectFact" (
            "storeId", "factType", "metricSource", "sourceSystem", "sourceEventId", "countValue",
            "recommendationInstanceId", "adoptionId", "strategyId", "executionId", "touchId", "customerId", channel,
            "isPrimary", "metadataJson", "occurredAt", "createdAt"
          )
          SELECT execution."storeId", 'delivery', 'actual', 'marketing_delivery_worker', 'legacy-touch:' || touch.id, 1,
                 strategy."recommendationInstanceId", strategy."adoptionId", touch."strategyId", touch."executionId", touch.id,
                 touch."customerId", touch.channel, true, jsonb_build_object('backfilled', true, 'status', touch.status), touch."touchedAt", NOW()
          FROM "MarketingAutomationTouch" touch
          JOIN "MarketingAutomationExecution" execution ON execution.id = touch."executionId"
          JOIN "MarketingAutomationStrategy" strategy ON strategy.id = touch."strategyId"
          WHERE touch.status IN ('sent', 'delivered', 'opened', 'clicked', 'converted')
            AND NOT EXISTS (SELECT 1 FROM "MarketingDeliveryJob" job WHERE job."touchId" = touch.id)
          ON CONFLICT ("sourceSystem", "sourceEventId", "factType") DO NOTHING
        `);
        estimatedCostFacts = await tx.$executeRawUnsafe(`
          INSERT INTO "MarketingEffectFact" (
            "storeId", "factType", "metricSource", "sourceSystem", "sourceEventId", "amountValue",
            "recommendationInstanceId", "adoptionId", "strategyId", "executionId", "touchId", "customerId", channel,
            "isPrimary", "metadataJson", "occurredAt", "createdAt"
          )
          SELECT execution."storeId", 'cost', 'estimated', 'marketing_delivery_worker', 'legacy-touch:' || touch.id, 2,
                 strategy."recommendationInstanceId", strategy."adoptionId", touch."strategyId", touch."executionId", touch.id,
                 touch."customerId", touch.channel, true,
                 jsonb_build_object('backfilled', true, 'definition', '固定单次触达估算成本，非渠道账单'), touch."touchedAt", NOW()
          FROM "MarketingAutomationTouch" touch
          JOIN "MarketingAutomationExecution" execution ON execution.id = touch."executionId"
          JOIN "MarketingAutomationStrategy" strategy ON strategy.id = touch."strategyId"
          WHERE touch.status IN ('sent', 'delivered', 'opened', 'clicked', 'converted')
            AND NOT EXISTS (SELECT 1 FROM "MarketingDeliveryJob" job WHERE job."touchId" = touch.id)
          ON CONFLICT ("sourceSystem", "sourceEventId", "factType") DO NOTHING
        `);
      });
    }

    console.log(
      JSON.stringify(
        {
          mode: apply ? 'apply' : 'dry-run',
          schemaReady,
          candidatePrimaryRevenueFacts: count(revenueRows),
          candidateAssistOrders: count(assistRows),
          candidateRefundFacts: count(refundRows),
          candidateDeliveryFacts: count(deliveryRows),
          invalidExistingDeliveryFacts: count(invalidRows),
          candidateSupersededTerminalPrimaryConversions: count(supersededConversionRows),
          demotedTerminalConversionFacts,
          primaryRevenueFacts,
          assistFacts,
          refundFacts,
          deliveryFacts,
          estimatedCostFacts,
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
