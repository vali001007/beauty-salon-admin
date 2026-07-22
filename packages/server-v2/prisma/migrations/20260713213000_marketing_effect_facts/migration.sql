-- Release D: deduplicated marketing effect facts.
CREATE TABLE "MarketingEffectFact" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER NOT NULL,
  "factType" TEXT NOT NULL,
  "metricSource" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "sourceEventId" TEXT NOT NULL,
  "countValue" DECIMAL(65,30),
  "amountValue" DECIMAL(65,30),
  "recommendationInstanceId" TEXT,
  "adoptionId" INTEGER,
  "activityId" INTEGER,
  "pageId" INTEGER,
  "strategyId" INTEGER,
  "executionId" INTEGER,
  "touchId" INTEGER,
  "deliveryJobId" INTEGER,
  "terminalFollowUpTaskId" INTEGER,
  "promotionId" INTEGER,
  "customerId" INTEGER,
  "orderId" INTEGER,
  "refundId" INTEGER,
  "channel" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT true,
  "metadataJson" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingEffectFact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingEffectFact_sourceSystem_sourceEventId_factType_key"
  ON "MarketingEffectFact"("sourceSystem", "sourceEventId", "factType");
CREATE INDEX "MarketingEffectFact_storeId_occurredAt_idx" ON "MarketingEffectFact"("storeId", "occurredAt");
CREATE INDEX "MarketingEffectFact_storeId_factType_occurredAt_idx" ON "MarketingEffectFact"("storeId", "factType", "occurredAt");
CREATE INDEX "MarketingEffectFact_recommendationInstanceId_idx" ON "MarketingEffectFact"("recommendationInstanceId");
CREATE INDEX "MarketingEffectFact_activityId_idx" ON "MarketingEffectFact"("activityId");
CREATE INDEX "MarketingEffectFact_pageId_idx" ON "MarketingEffectFact"("pageId");
CREATE INDEX "MarketingEffectFact_strategyId_idx" ON "MarketingEffectFact"("strategyId");
CREATE INDEX "MarketingEffectFact_promotionId_idx" ON "MarketingEffectFact"("promotionId");
CREATE INDEX "MarketingEffectFact_orderId_idx" ON "MarketingEffectFact"("orderId");
CREATE INDEX "MarketingEffectFact_deliveryJobId_idx" ON "MarketingEffectFact"("deliveryJobId");
CREATE INDEX "MarketingEffectFact_terminalFollowUpTaskId_idx" ON "MarketingEffectFact"("terminalFollowUpTaskId");

ALTER TABLE "MarketingEffectFact"
  ADD CONSTRAINT "MarketingEffectFact_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
