ALTER TABLE "PredictionRun"
  ADD COLUMN "businessDate" DATE,
  ADD COLUMN "runKey" TEXT,
  ADD COLUMN "scopeStatus" TEXT NOT NULL DEFAULT 'store_scoped';

UPDATE "PredictionRun"
SET "scopeStatus" = 'legacy_global'
WHERE "storeId" IS NULL;

UPDATE "PredictionRun"
SET "businessDate" = ("startedAt" + INTERVAL '8 hours')::date,
    "runKey" = 'legacy-store:' || "storeId"::text || ':run:' || "id"::text
WHERE "storeId" IS NOT NULL;

ALTER TABLE "PredictionRun"
  ADD CONSTRAINT "PredictionRun_scopeStatus_check"
  CHECK (
    ("scopeStatus" = 'legacy_global' AND "storeId" IS NULL)
    OR
    ("scopeStatus" = 'store_scoped' AND "storeId" IS NOT NULL AND "businessDate" IS NOT NULL AND "runKey" IS NOT NULL)
  );

CREATE UNIQUE INDEX "PredictionRun_runKey_key" ON "PredictionRun"("runKey");
CREATE INDEX "PredictionRun_storeId_businessDate_status_idx" ON "PredictionRun"("storeId", "businessDate", "status");

CREATE TABLE "MarketingRecommendationInstance" (
  "id" TEXT NOT NULL,
  "storeId" INTEGER NOT NULL,
  "recommendationKey" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "predictionRunId" INTEGER,
  "businessDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'P1',
  "urgency" TEXT NOT NULL DEFAULT 'recommended',
  "preferredMode" TEXT NOT NULL,
  "executionModes" JSONB NOT NULL,
  "evidenceSnapshot" JSONB NOT NULL,
  "strategySnapshot" JSONB,
  "targetCount" INTEGER NOT NULL DEFAULT 0,
  "fingerprint" TEXT NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "supersededAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingRecommendationInstance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingRecommendationAudienceSnapshot" (
  "id" TEXT NOT NULL,
  "recommendationInstanceId" TEXT NOT NULL,
  "storeId" INTEGER NOT NULL,
  "ruleJson" JSONB NOT NULL,
  "customerCount" INTEGER NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingRecommendationAudienceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingRecommendationAudienceMember" (
  "id" SERIAL NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "storeId" INTEGER NOT NULL,
  "customerId" INTEGER NOT NULL,
  "rank" INTEGER NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "reasonJson" JSONB NOT NULL,
  "predictionData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingRecommendationAudienceMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingRecommendationOfferSnapshot" (
  "id" TEXT NOT NULL,
  "recommendationInstanceId" TEXT NOT NULL,
  "storeId" INTEGER NOT NULL,
  "selectedPromotionId" INTEGER,
  "offerJson" JSONB NOT NULL,
  "alternativesJson" JSONB NOT NULL,
  "fitBreakdownJson" JSONB,
  "inventorySnapshotJson" JSONB,
  "capacitySnapshotJson" JSONB,
  "riskWarningsJson" JSONB NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingRecommendationOfferSnapshot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MarketingRecommendationAdoption"
  ALTER COLUMN "recommendationId" DROP NOT NULL,
  ADD COLUMN "recommendationInstanceId" TEXT,
  ADD COLUMN "adoptionKey" TEXT,
  ADD COLUMN "errorCode" TEXT,
  ADD COLUMN "errorMessage" TEXT;

ALTER TABLE "MarketingActivity"
  ADD COLUMN "recommendationInstanceId" TEXT,
  ADD COLUMN "adoptionId" INTEGER;

ALTER TABLE "MarketingPage"
  ADD COLUMN "recommendationInstanceId" TEXT,
  ADD COLUMN "adoptionId" INTEGER;

ALTER TABLE "MarketingAutomationStrategy"
  ADD COLUMN "recommendationInstanceId" TEXT,
  ADD COLUMN "adoptionId" INTEGER,
  ADD COLUMN "predictionRunId" INTEGER,
  ADD COLUMN "audienceSnapshotId" TEXT;

ALTER TABLE "TerminalFollowUpTask"
  ADD COLUMN "recommendationInstanceId" TEXT,
  ADD COLUMN "adoptionId" INTEGER;

CREATE UNIQUE INDEX "MarketingRecommendationInstance_storeId_recommendationKey_fingerprint_key"
  ON "MarketingRecommendationInstance"("storeId", "recommendationKey", "fingerprint");
CREATE INDEX "MarketingRecommendationInstance_storeId_businessDate_recommendationKey_idx"
  ON "MarketingRecommendationInstance"("storeId", "businessDate", "recommendationKey");
CREATE INDEX "MarketingRecommendationInstance_storeId_status_expiresAt_idx"
  ON "MarketingRecommendationInstance"("storeId", "status", "expiresAt");
CREATE INDEX "MarketingRecommendationInstance_predictionRunId_idx"
  ON "MarketingRecommendationInstance"("predictionRunId");
CREATE INDEX "MarketingRecommendationInstance_fingerprint_idx"
  ON "MarketingRecommendationInstance"("fingerprint");

CREATE UNIQUE INDEX "MarketingRecommendationAudienceSnapshot_recommendationInstanceId_key"
  ON "MarketingRecommendationAudienceSnapshot"("recommendationInstanceId");
CREATE INDEX "MarketingRecommendationAudienceSnapshot_storeId_generatedAt_idx"
  ON "MarketingRecommendationAudienceSnapshot"("storeId", "generatedAt");

CREATE UNIQUE INDEX "MarketingRecommendationAudienceMember_snapshotId_customerId_key"
  ON "MarketingRecommendationAudienceMember"("snapshotId", "customerId");
CREATE INDEX "MarketingRecommendationAudienceMember_storeId_customerId_idx"
  ON "MarketingRecommendationAudienceMember"("storeId", "customerId");
CREATE INDEX "MarketingRecommendationAudienceMember_snapshotId_rank_id_idx"
  ON "MarketingRecommendationAudienceMember"("snapshotId", "rank", "id");

CREATE UNIQUE INDEX "MarketingRecommendationOfferSnapshot_recommendationInstanceId_key"
  ON "MarketingRecommendationOfferSnapshot"("recommendationInstanceId");
CREATE INDEX "MarketingRecommendationOfferSnapshot_storeId_selectedPromotionId_idx"
  ON "MarketingRecommendationOfferSnapshot"("storeId", "selectedPromotionId");

CREATE UNIQUE INDEX "MarketingRecommendationAdoption_adoptionKey_key"
  ON "MarketingRecommendationAdoption"("adoptionKey");
CREATE INDEX "MarketingRecommendationAdoption_recommendationInstanceId_idx"
  ON "MarketingRecommendationAdoption"("recommendationInstanceId");
CREATE INDEX "MarketingRecommendationAdoption_instance_mode_created_id_idx"
  ON "MarketingRecommendationAdoption"("recommendationInstanceId", "mode", "createdAt" DESC, "id" DESC);

CREATE INDEX "MarketingActivity_recommendationInstanceId_idx" ON "MarketingActivity"("recommendationInstanceId");
CREATE INDEX "MarketingActivity_adoptionId_idx" ON "MarketingActivity"("adoptionId");
CREATE INDEX "MarketingPage_recommendationInstanceId_idx" ON "MarketingPage"("recommendationInstanceId");
CREATE INDEX "MarketingPage_adoptionId_idx" ON "MarketingPage"("adoptionId");
CREATE INDEX "MarketingAutomationStrategy_recommendationInstanceId_idx" ON "MarketingAutomationStrategy"("recommendationInstanceId");
CREATE INDEX "MarketingAutomationStrategy_adoptionId_idx" ON "MarketingAutomationStrategy"("adoptionId");
CREATE INDEX "MarketingAutomationStrategy_predictionRunId_idx" ON "MarketingAutomationStrategy"("predictionRunId");
CREATE INDEX "MarketingAutomationStrategy_audienceSnapshotId_idx" ON "MarketingAutomationStrategy"("audienceSnapshotId");
CREATE INDEX "TerminalFollowUpTask_recommendationInstanceId_idx" ON "TerminalFollowUpTask"("recommendationInstanceId");
CREATE INDEX "TerminalFollowUpTask_adoptionId_idx" ON "TerminalFollowUpTask"("adoptionId");

ALTER TABLE "MarketingRecommendationInstance"
  ADD CONSTRAINT "MarketingRecommendationInstance_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingRecommendationInstance"
  ADD CONSTRAINT "MarketingRecommendationInstance_predictionRunId_fkey"
  FOREIGN KEY ("predictionRunId") REFERENCES "PredictionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketingRecommendationAudienceSnapshot"
  ADD CONSTRAINT "MarketingRecommendationAudienceSnapshot_recommendationInstanceId_fkey"
  FOREIGN KEY ("recommendationInstanceId") REFERENCES "MarketingRecommendationInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingRecommendationAudienceSnapshot"
  ADD CONSTRAINT "MarketingRecommendationAudienceSnapshot_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingRecommendationAudienceMember"
  ADD CONSTRAINT "MarketingRecommendationAudienceMember_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "MarketingRecommendationAudienceSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingRecommendationAudienceMember"
  ADD CONSTRAINT "MarketingRecommendationAudienceMember_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingRecommendationAudienceMember"
  ADD CONSTRAINT "MarketingRecommendationAudienceMember_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingRecommendationOfferSnapshot"
  ADD CONSTRAINT "MarketingRecommendationOfferSnapshot_recommendationInstanceId_fkey"
  FOREIGN KEY ("recommendationInstanceId") REFERENCES "MarketingRecommendationInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingRecommendationOfferSnapshot"
  ADD CONSTRAINT "MarketingRecommendationOfferSnapshot_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingRecommendationOfferSnapshot"
  ADD CONSTRAINT "MarketingRecommendationOfferSnapshot_selectedPromotionId_fkey"
  FOREIGN KEY ("selectedPromotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketingRecommendationAdoption"
  ADD CONSTRAINT "MarketingRecommendationAdoption_recommendationInstanceId_fkey"
  FOREIGN KEY ("recommendationInstanceId") REFERENCES "MarketingRecommendationInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketingActivity"
  ADD CONSTRAINT "MarketingActivity_recommendationInstanceId_fkey"
  FOREIGN KEY ("recommendationInstanceId") REFERENCES "MarketingRecommendationInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingActivity"
  ADD CONSTRAINT "MarketingActivity_adoptionId_fkey"
  FOREIGN KEY ("adoptionId") REFERENCES "MarketingRecommendationAdoption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketingPage"
  ADD CONSTRAINT "MarketingPage_recommendationInstanceId_fkey"
  FOREIGN KEY ("recommendationInstanceId") REFERENCES "MarketingRecommendationInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingPage"
  ADD CONSTRAINT "MarketingPage_adoptionId_fkey"
  FOREIGN KEY ("adoptionId") REFERENCES "MarketingRecommendationAdoption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MarketingAutomationStrategy"
  ADD CONSTRAINT "MarketingAutomationStrategy_recommendationInstanceId_fkey"
  FOREIGN KEY ("recommendationInstanceId") REFERENCES "MarketingRecommendationInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingAutomationStrategy"
  ADD CONSTRAINT "MarketingAutomationStrategy_adoptionId_fkey"
  FOREIGN KEY ("adoptionId") REFERENCES "MarketingRecommendationAdoption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingAutomationStrategy"
  ADD CONSTRAINT "MarketingAutomationStrategy_predictionRunId_fkey"
  FOREIGN KEY ("predictionRunId") REFERENCES "PredictionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingAutomationStrategy"
  ADD CONSTRAINT "MarketingAutomationStrategy_audienceSnapshotId_fkey"
  FOREIGN KEY ("audienceSnapshotId") REFERENCES "MarketingRecommendationAudienceSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TerminalFollowUpTask"
  ADD CONSTRAINT "TerminalFollowUpTask_recommendationInstanceId_fkey"
  FOREIGN KEY ("recommendationInstanceId") REFERENCES "MarketingRecommendationInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TerminalFollowUpTask"
  ADD CONSTRAINT "TerminalFollowUpTask_adoptionId_fkey"
  FOREIGN KEY ("adoptionId") REFERENCES "MarketingRecommendationAdoption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
