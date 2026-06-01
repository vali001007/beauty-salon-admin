-- Prediction runs and customer-level prediction snapshots
CREATE TABLE "PredictionRun" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER,
    "modelVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "customerCount" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" JSONB,

    CONSTRAINT "PredictionRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerPredictionSnapshot" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "storeId" INTEGER NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "churnScore" INTEGER NOT NULL DEFAULT 0,
    "churnLevel" TEXT NOT NULL,
    "repurchase30dScore" INTEGER NOT NULL DEFAULT 0,
    "marketingResponseScore" INTEGER NOT NULL DEFAULT 0,
    "ltv6m" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "ltv12m" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "ltvTier" TEXT NOT NULL,
    "featureJson" JSONB NOT NULL,
    "reasonJson" JSONB NOT NULL,
    "recommendedActionsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPredictionSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingAutomationTouch" (
    "id" SERIAL NOT NULL,
    "executionId" INTEGER NOT NULL,
    "strategyId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "predictionSnapshotId" INTEGER,
    "predictedConversionScore" INTEGER NOT NULL DEFAULT 0,
    "predictedRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "channel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'reached',
    "touchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" TIMESTAMP(3),
    "conversionType" TEXT,
    "actualRevenue" DECIMAL(65,30),
    "attributionWindowDays" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "MarketingAutomationTouch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PredictionRun_storeId_idx" ON "PredictionRun"("storeId");
CREATE INDEX "PredictionRun_modelVersion_idx" ON "PredictionRun"("modelVersion");
CREATE INDEX "PredictionRun_startedAt_idx" ON "PredictionRun"("startedAt");
CREATE INDEX "PredictionRun_status_idx" ON "PredictionRun"("status");

CREATE INDEX "CustomerPredictionSnapshot_runId_idx" ON "CustomerPredictionSnapshot"("runId");
CREATE INDEX "CustomerPredictionSnapshot_customerId_idx" ON "CustomerPredictionSnapshot"("customerId");
CREATE INDEX "CustomerPredictionSnapshot_storeId_idx" ON "CustomerPredictionSnapshot"("storeId");
CREATE INDEX "CustomerPredictionSnapshot_churnLevel_idx" ON "CustomerPredictionSnapshot"("churnLevel");
CREATE INDEX "CustomerPredictionSnapshot_ltvTier_idx" ON "CustomerPredictionSnapshot"("ltvTier");
CREATE INDEX "CustomerPredictionSnapshot_createdAt_idx" ON "CustomerPredictionSnapshot"("createdAt");

CREATE INDEX "MarketingAutomationTouch_executionId_idx" ON "MarketingAutomationTouch"("executionId");
CREATE INDEX "MarketingAutomationTouch_strategyId_idx" ON "MarketingAutomationTouch"("strategyId");
CREATE INDEX "MarketingAutomationTouch_customerId_idx" ON "MarketingAutomationTouch"("customerId");
CREATE INDEX "MarketingAutomationTouch_predictionSnapshotId_idx" ON "MarketingAutomationTouch"("predictionSnapshotId");
CREATE INDEX "MarketingAutomationTouch_status_idx" ON "MarketingAutomationTouch"("status");
CREATE INDEX "MarketingAutomationTouch_touchedAt_idx" ON "MarketingAutomationTouch"("touchedAt");

ALTER TABLE "PredictionRun" ADD CONSTRAINT "PredictionRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerPredictionSnapshot" ADD CONSTRAINT "CustomerPredictionSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PredictionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerPredictionSnapshot" ADD CONSTRAINT "CustomerPredictionSnapshot_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerPredictionSnapshot" ADD CONSTRAINT "CustomerPredictionSnapshot_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingAutomationTouch" ADD CONSTRAINT "MarketingAutomationTouch_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "MarketingAutomationExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingAutomationTouch" ADD CONSTRAINT "MarketingAutomationTouch_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "MarketingAutomationStrategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingAutomationTouch" ADD CONSTRAINT "MarketingAutomationTouch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingAutomationTouch" ADD CONSTRAINT "MarketingAutomationTouch_predictionSnapshotId_fkey" FOREIGN KEY ("predictionSnapshotId") REFERENCES "CustomerPredictionSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
