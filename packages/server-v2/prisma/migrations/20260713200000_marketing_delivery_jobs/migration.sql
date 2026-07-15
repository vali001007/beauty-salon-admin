-- Release C: resumable, store-scoped marketing delivery jobs.
ALTER TABLE "MarketingAutomationExecution"
  ADD COLUMN "audienceSnapshotJson" JSONB,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "MarketingDeliveryJob" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER NOT NULL,
  "executionId" INTEGER NOT NULL,
  "touchId" INTEGER NOT NULL,
  "strategyId" INTEGER NOT NULL,
  "customerId" INTEGER NOT NULL,
  "channel" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 4,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leasedAt" TIMESTAMP(3),
  "leaseExpiresAt" TIMESTAMP(3),
  "leaseOwner" TEXT,
  "externalId" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketingDeliveryJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingDeliveryJob_touchId_key" ON "MarketingDeliveryJob"("touchId");
CREATE INDEX "MarketingDeliveryJob_status_availableAt_idx" ON "MarketingDeliveryJob"("status", "availableAt");
CREATE INDEX "MarketingDeliveryJob_storeId_status_availableAt_idx" ON "MarketingDeliveryJob"("storeId", "status", "availableAt");
CREATE INDEX "MarketingDeliveryJob_executionId_status_idx" ON "MarketingDeliveryJob"("executionId", "status");
CREATE INDEX "MarketingDeliveryJob_strategyId_customerId_channel_idx" ON "MarketingDeliveryJob"("strategyId", "customerId", "channel");
CREATE INDEX "MarketingDeliveryJob_leaseExpiresAt_idx" ON "MarketingDeliveryJob"("leaseExpiresAt");

ALTER TABLE "MarketingDeliveryJob"
  ADD CONSTRAINT "MarketingDeliveryJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MarketingDeliveryJob_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "MarketingAutomationExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MarketingDeliveryJob_touchId_fkey" FOREIGN KEY ("touchId") REFERENCES "MarketingAutomationTouch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MarketingDeliveryJob_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "MarketingAutomationStrategy"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "MarketingDeliveryJob_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingInAppNotification" ADD COLUMN "deliveryJobId" INTEGER;
CREATE UNIQUE INDEX "MarketingInAppNotification_deliveryJobId_key" ON "MarketingInAppNotification"("deliveryJobId");
