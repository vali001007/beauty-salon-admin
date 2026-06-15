ALTER TABLE "MarketingActivity"
  ADD COLUMN IF NOT EXISTS "predictionRunId" TEXT,
  ADD COLUMN IF NOT EXISTS "audienceSnapshotId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceSignalsJson" JSONB,
  ADD COLUMN IF NOT EXISTS "offerJson" JSONB,
  ADD COLUMN IF NOT EXISTS "recommendedItemsJson" JSONB;

CREATE INDEX IF NOT EXISTS "MarketingActivity_sourceRecommendationId_idx" ON "MarketingActivity"("sourceRecommendationId");
CREATE INDEX IF NOT EXISTS "MarketingActivity_predictionRunId_idx" ON "MarketingActivity"("predictionRunId");
CREATE TABLE IF NOT EXISTS "CustomerBehaviorEvent" (
  "id" SERIAL PRIMARY KEY,
  "storeId" INTEGER NOT NULL,
  "customerId" INTEGER NOT NULL,
  "eventType" TEXT NOT NULL,
  "targetType" TEXT,
  "targetId" TEXT,
  "sessionId" TEXT,
  "metadataJson" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CustomerBehaviorEvent_storeId_occurredAt_idx" ON "CustomerBehaviorEvent"("storeId", "occurredAt");
CREATE INDEX IF NOT EXISTS "CustomerBehaviorEvent_customerId_occurredAt_idx" ON "CustomerBehaviorEvent"("customerId", "occurredAt");
CREATE INDEX IF NOT EXISTS "CustomerBehaviorEvent_eventType_idx" ON "CustomerBehaviorEvent"("eventType");
CREATE INDEX IF NOT EXISTS "CustomerBehaviorEvent_targetType_targetId_idx" ON "CustomerBehaviorEvent"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "CustomerBehaviorEvent_sessionId_idx" ON "CustomerBehaviorEvent"("sessionId");

ALTER TABLE "MarketingActivity"
  ADD COLUMN IF NOT EXISTS "audienceSnapshotJson" JSONB;
