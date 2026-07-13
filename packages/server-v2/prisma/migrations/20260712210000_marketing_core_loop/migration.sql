-- Add nullable columns first so existing marketing data can be deterministically backfilled.
ALTER TABLE "MarketingActivity" ADD COLUMN "storeId" INTEGER;
ALTER TABLE "MarketingAutomationStrategy" ADD COLUMN "storeId" INTEGER;
ALTER TABLE "MarketingAutomationExecution" ADD COLUMN "storeId" INTEGER;
ALTER TABLE "MarketingAutomationExecution" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "MarketingAutomationExecution" ADD COLUMN "queuedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MarketingAutomationExecution" ADD COLUMN "failedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MarketingAutomationTouch" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MarketingAutomationTouch" ADD COLUMN "errorCode" TEXT;
ALTER TABLE "MarketingAutomationTouch" ADD COLUMN "errorMessage" TEXT;
ALTER TABLE "MarketingAutomationTouch" ALTER COLUMN "status" SET DEFAULT 'queued';

-- Normalize legacy activity status values to stable API codes.
UPDATE "MarketingActivity" SET "status" = CASE "status"
  WHEN '进行中' THEN 'active'
  WHEN '即将开始' THEN 'scheduled'
  WHEN '已结束' THEN 'ended'
  WHEN '草稿' THEN 'draft'
  WHEN '已取消' THEN 'cancelled'
  ELSE "status"
END;

-- Prefer the activity page's store, then its promotion store, then the first active store.
UPDATE "MarketingActivity" activity
SET "storeId" = COALESCE(
  (SELECT page."storeId" FROM "MarketingPage" page
   WHERE page."activityId" = activity."id" OR (page."sourceType" = 'activity' AND page."sourceId" = activity."id"::text)
   ORDER BY page."publishedAt" DESC NULLS LAST, page."id" DESC LIMIT 1),
  (SELECT promotion."storeId" FROM "Promotion" promotion WHERE promotion."id" = activity."primaryPromotionId"),
  (SELECT store."id" FROM "Store" store WHERE store."deletedAt" IS NULL ORDER BY CASE WHEN store."status" = 'active' THEN 0 ELSE 1 END, store."id" LIMIT 1)
);

-- Prefer rule-template ownership, then a touched customer's store, then the first active store.
UPDATE "MarketingAutomationStrategy" strategy
SET "storeId" = COALESCE(
  (SELECT template."storeId" FROM "MarketingRuleTemplate" template WHERE template."id" = strategy."ruleTemplateId"),
  (SELECT customer."storeId" FROM "MarketingAutomationTouch" touch JOIN "Customer" customer ON customer."id" = touch."customerId"
   WHERE touch."strategyId" = strategy."id" ORDER BY touch."touchedAt" DESC LIMIT 1),
  NULLIF(strategy."schedule"->>'storeId', '')::integer,
  (SELECT store."id" FROM "Store" store WHERE store."deletedAt" IS NULL ORDER BY CASE WHEN store."status" = 'active' THEN 0 ELSE 1 END, store."id" LIMIT 1)
);

UPDATE "MarketingAutomationExecution" execution
SET "storeId" = strategy."storeId",
    "idempotencyKey" = 'legacy-' || execution."id"::text
FROM "MarketingAutomationStrategy" strategy
WHERE strategy."id" = execution."strategyId";

ALTER TABLE "MarketingActivity" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "MarketingAutomationStrategy" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "MarketingAutomationExecution" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "MarketingAutomationExecution" ALTER COLUMN "idempotencyKey" SET NOT NULL;

CREATE TABLE "MarketingInAppNotification" (
  "id" SERIAL PRIMARY KEY,
  "storeId" INTEGER NOT NULL,
  "customerId" INTEGER NOT NULL,
  "strategyId" INTEGER NOT NULL,
  "executionId" INTEGER,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "deliveredAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "MarketingRecommendationAdoption" (
  "id" SERIAL PRIMARY KEY,
  "storeId" INTEGER NOT NULL,
  "recommendationId" INTEGER NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "activityId" INTEGER,
  "pageId" INTEGER,
  "strategyId" INTEGER,
  "followUpTaskIds" JSONB,
  "predictionRunId" INTEGER,
  "snapshotJson" JSONB NOT NULL,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "MarketingActivity_storeId_status_idx" ON "MarketingActivity"("storeId", "status");
CREATE INDEX "MarketingAutomationStrategy_storeId_status_idx" ON "MarketingAutomationStrategy"("storeId", "status");
CREATE UNIQUE INDEX "MarketingAutomationExecution_strategyId_idempotencyKey_key" ON "MarketingAutomationExecution"("strategyId", "idempotencyKey");
CREATE INDEX "MarketingAutomationExecution_storeId_executedAt_idx" ON "MarketingAutomationExecution"("storeId", "executedAt");
CREATE INDEX "MarketingInAppNotification_storeId_customerId_createdAt_idx" ON "MarketingInAppNotification"("storeId", "customerId", "createdAt");
CREATE INDEX "MarketingInAppNotification_strategyId_executionId_idx" ON "MarketingInAppNotification"("strategyId", "executionId");
CREATE INDEX "MarketingInAppNotification_status_createdAt_idx" ON "MarketingInAppNotification"("status", "createdAt");
CREATE INDEX "MarketingRecommendationAdoption_storeId_createdAt_idx" ON "MarketingRecommendationAdoption"("storeId", "createdAt");
CREATE INDEX "MarketingRecommendationAdoption_recommendationId_mode_idx" ON "MarketingRecommendationAdoption"("recommendationId", "mode");
CREATE INDEX "MarketingRecommendationAdoption_activityId_idx" ON "MarketingRecommendationAdoption"("activityId");
CREATE INDEX "MarketingRecommendationAdoption_strategyId_idx" ON "MarketingRecommendationAdoption"("strategyId");

ALTER TABLE "MarketingActivity" ADD CONSTRAINT "MarketingActivity_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingAutomationStrategy" ADD CONSTRAINT "MarketingAutomationStrategy_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingAutomationExecution" ADD CONSTRAINT "MarketingAutomationExecution_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
