-- CreateTable
CREATE TABLE "CustomerLifecycleSnapshot" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "predictionRunId" INTEGER,
    "predictionSnapshotId" INTEGER,
    "lifecycleStage" TEXT NOT NULL,
    "ltvTier" TEXT,
    "churnRiskLevel" TEXT,
    "touchFatigueScore" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "assetSummaryJson" JSONB,
    "servicePreferenceJson" JSONB,
    "evidenceJson" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerLifecycleSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerLifecycleEvent" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "evidenceJson" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerOpportunity" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "predictionRunId" INTEGER,
    "predictionSnapshotId" INTEGER,
    "opportunityType" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'P1',
    "status" TEXT NOT NULL DEFAULT 'open',
    "score" INTEGER NOT NULL DEFAULT 0,
    "recommendedExecutionMode" TEXT NOT NULL DEFAULT 'automation',
    "recommendedChannelsJson" JSONB NOT NULL,
    "recommendedOfferJson" JSONB,
    "recommendedItemsJson" JSONB,
    "evidenceJson" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLifecycleSnapshot_storeId_customerId_key" ON "CustomerLifecycleSnapshot"("storeId", "customerId");
CREATE INDEX "CustomerLifecycleSnapshot_storeId_lifecycleStage_idx" ON "CustomerLifecycleSnapshot"("storeId", "lifecycleStage");
CREATE INDEX "CustomerLifecycleSnapshot_customerId_idx" ON "CustomerLifecycleSnapshot"("customerId");
CREATE INDEX "CustomerLifecycleSnapshot_predictionRunId_idx" ON "CustomerLifecycleSnapshot"("predictionRunId");
CREATE INDEX "CustomerLifecycleSnapshot_predictionSnapshotId_idx" ON "CustomerLifecycleSnapshot"("predictionSnapshotId");
CREATE INDEX "CustomerLifecycleSnapshot_computedAt_idx" ON "CustomerLifecycleSnapshot"("computedAt");

CREATE INDEX "CustomerLifecycleEvent_storeId_occurredAt_idx" ON "CustomerLifecycleEvent"("storeId", "occurredAt");
CREATE INDEX "CustomerLifecycleEvent_customerId_occurredAt_idx" ON "CustomerLifecycleEvent"("customerId", "occurredAt");
CREATE INDEX "CustomerLifecycleEvent_toStage_idx" ON "CustomerLifecycleEvent"("toStage");
CREATE INDEX "CustomerLifecycleEvent_eventType_idx" ON "CustomerLifecycleEvent"("eventType");
CREATE INDEX "CustomerLifecycleEvent_sourceType_sourceId_idx" ON "CustomerLifecycleEvent"("sourceType", "sourceId");

CREATE UNIQUE INDEX "CustomerOpportunity_storeId_customerId_opportunityType_key" ON "CustomerOpportunity"("storeId", "customerId", "opportunityType");
CREATE INDEX "CustomerOpportunity_storeId_opportunityType_status_idx" ON "CustomerOpportunity"("storeId", "opportunityType", "status");
CREATE INDEX "CustomerOpportunity_customerId_idx" ON "CustomerOpportunity"("customerId");
CREATE INDEX "CustomerOpportunity_predictionRunId_idx" ON "CustomerOpportunity"("predictionRunId");
CREATE INDEX "CustomerOpportunity_predictionSnapshotId_idx" ON "CustomerOpportunity"("predictionSnapshotId");
CREATE INDEX "CustomerOpportunity_priority_idx" ON "CustomerOpportunity"("priority");
CREATE INDEX "CustomerOpportunity_expiresAt_idx" ON "CustomerOpportunity"("expiresAt");

-- AddForeignKey
ALTER TABLE "CustomerLifecycleSnapshot" ADD CONSTRAINT "CustomerLifecycleSnapshot_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerLifecycleSnapshot" ADD CONSTRAINT "CustomerLifecycleSnapshot_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerLifecycleSnapshot" ADD CONSTRAINT "CustomerLifecycleSnapshot_predictionRunId_fkey" FOREIGN KEY ("predictionRunId") REFERENCES "PredictionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerLifecycleSnapshot" ADD CONSTRAINT "CustomerLifecycleSnapshot_predictionSnapshotId_fkey" FOREIGN KEY ("predictionSnapshotId") REFERENCES "CustomerPredictionSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerLifecycleEvent" ADD CONSTRAINT "CustomerLifecycleEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerLifecycleEvent" ADD CONSTRAINT "CustomerLifecycleEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerOpportunity" ADD CONSTRAINT "CustomerOpportunity_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerOpportunity" ADD CONSTRAINT "CustomerOpportunity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerOpportunity" ADD CONSTRAINT "CustomerOpportunity_predictionRunId_fkey" FOREIGN KEY ("predictionRunId") REFERENCES "PredictionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerOpportunity" ADD CONSTRAINT "CustomerOpportunity_predictionSnapshotId_fkey" FOREIGN KEY ("predictionSnapshotId") REFERENCES "CustomerPredictionSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
