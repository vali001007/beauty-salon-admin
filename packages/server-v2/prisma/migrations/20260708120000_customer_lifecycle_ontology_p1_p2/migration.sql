-- Customer lifecycle ontology P1/P2: service cycles, fulfillment, attribution, rules, quality, and business plans.

CREATE TABLE "CustomerServiceCycleState" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "lastServiceAt" TIMESTAMP(3),
    "cycleDays" INTEGER NOT NULL DEFAULT 28,
    "nextDueAt" TIMESTAMP(3),
    "sourceType" TEXT,
    "sourceId" TEXT,
    "evidenceJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerServiceCycleState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerOpportunityFulfillmentCheck" (
    "id" SERIAL NOT NULL,
    "opportunityId" INTEGER NOT NULL,
    "inventoryReady" BOOLEAN NOT NULL DEFAULT true,
    "capacityReady" BOOLEAN NOT NULL DEFAULT true,
    "requiredProductsJson" JSONB,
    "capacitySnapshotJson" JSONB,
    "riskJson" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerOpportunityFulfillmentCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LifecycleAttributionEvent" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "opportunityId" INTEGER,
    "recommendationKey" TEXT,
    "eventType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "touchId" INTEGER,
    "orderId" INTEGER,
    "reservationId" INTEGER,
    "stockMovementId" INTEGER,
    "eventValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "evidenceJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LifecycleAttributionEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerLifecycleRuleVersion" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER,
    "ruleType" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "grayPercent" INTEGER NOT NULL DEFAULT 100,
    "ruleJson" JSONB NOT NULL,
    "evidenceJson" JSONB,
    "publishedBy" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "rolledBackFromId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerLifecycleRuleVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerLifecycleQualitySnapshot" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fieldCoverageRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "ruleHitRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "attributionCompletenessRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "fulfillmentReadyRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "metricsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLifecycleQualitySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LifecycleBusinessPlan" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "planPeriod" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "goalsJson" JSONB NOT NULL,
    "actionsJson" JSONB NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "approvalJson" JSONB,
    "resultJson" JSONB,
    "createdBy" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LifecycleBusinessPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerServiceCycleState_storeId_customerId_projectId_key" ON "CustomerServiceCycleState"("storeId", "customerId", "projectId");
CREATE INDEX "CustomerServiceCycleState_storeId_nextDueAt_idx" ON "CustomerServiceCycleState"("storeId", "nextDueAt");
CREATE INDEX "CustomerServiceCycleState_customerId_nextDueAt_idx" ON "CustomerServiceCycleState"("customerId", "nextDueAt");
CREATE INDEX "CustomerServiceCycleState_projectId_idx" ON "CustomerServiceCycleState"("projectId");
CREATE INDEX "CustomerServiceCycleState_sourceType_sourceId_idx" ON "CustomerServiceCycleState"("sourceType", "sourceId");

CREATE INDEX "CustomerOpportunityFulfillmentCheck_opportunityId_checkedAt_idx" ON "CustomerOpportunityFulfillmentCheck"("opportunityId", "checkedAt");
CREATE INDEX "CustomerOpportunityFulfillmentCheck_inventoryReady_capacityReady_idx" ON "CustomerOpportunityFulfillmentCheck"("inventoryReady", "capacityReady");
CREATE INDEX "CustomerOpportunityFulfillmentCheck_checkedAt_idx" ON "CustomerOpportunityFulfillmentCheck"("checkedAt");

CREATE INDEX "LifecycleAttributionEvent_storeId_occurredAt_idx" ON "LifecycleAttributionEvent"("storeId", "occurredAt");
CREATE INDEX "LifecycleAttributionEvent_customerId_occurredAt_idx" ON "LifecycleAttributionEvent"("customerId", "occurredAt");
CREATE INDEX "LifecycleAttributionEvent_opportunityId_idx" ON "LifecycleAttributionEvent"("opportunityId");
CREATE INDEX "LifecycleAttributionEvent_recommendationKey_idx" ON "LifecycleAttributionEvent"("recommendationKey");
CREATE INDEX "LifecycleAttributionEvent_eventType_occurredAt_idx" ON "LifecycleAttributionEvent"("eventType", "occurredAt");
CREATE INDEX "LifecycleAttributionEvent_touchId_idx" ON "LifecycleAttributionEvent"("touchId");
CREATE INDEX "LifecycleAttributionEvent_orderId_idx" ON "LifecycleAttributionEvent"("orderId");
CREATE INDEX "LifecycleAttributionEvent_reservationId_idx" ON "LifecycleAttributionEvent"("reservationId");
CREATE INDEX "LifecycleAttributionEvent_stockMovementId_idx" ON "LifecycleAttributionEvent"("stockMovementId");

CREATE UNIQUE INDEX "CustomerLifecycleRuleVersion_storeId_ruleType_version_key" ON "CustomerLifecycleRuleVersion"("storeId", "ruleType", "version");
CREATE INDEX "CustomerLifecycleRuleVersion_storeId_ruleType_status_idx" ON "CustomerLifecycleRuleVersion"("storeId", "ruleType", "status");
CREATE INDEX "CustomerLifecycleRuleVersion_status_idx" ON "CustomerLifecycleRuleVersion"("status");
CREATE INDEX "CustomerLifecycleRuleVersion_publishedAt_idx" ON "CustomerLifecycleRuleVersion"("publishedAt");

CREATE INDEX "CustomerLifecycleQualitySnapshot_storeId_snapshotDate_idx" ON "CustomerLifecycleQualitySnapshot"("storeId", "snapshotDate");

CREATE INDEX "LifecycleBusinessPlan_storeId_planPeriod_idx" ON "LifecycleBusinessPlan"("storeId", "planPeriod");
CREATE INDEX "LifecycleBusinessPlan_storeId_status_idx" ON "LifecycleBusinessPlan"("storeId", "status");
CREATE INDEX "LifecycleBusinessPlan_createdAt_idx" ON "LifecycleBusinessPlan"("createdAt");

ALTER TABLE "CustomerServiceCycleState" ADD CONSTRAINT "CustomerServiceCycleState_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCycleState" ADD CONSTRAINT "CustomerServiceCycleState_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCycleState" ADD CONSTRAINT "CustomerServiceCycleState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerOpportunityFulfillmentCheck" ADD CONSTRAINT "CustomerOpportunityFulfillmentCheck_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "CustomerOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LifecycleAttributionEvent" ADD CONSTRAINT "LifecycleAttributionEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LifecycleAttributionEvent" ADD CONSTRAINT "LifecycleAttributionEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LifecycleAttributionEvent" ADD CONSTRAINT "LifecycleAttributionEvent_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "CustomerOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LifecycleAttributionEvent" ADD CONSTRAINT "LifecycleAttributionEvent_touchId_fkey" FOREIGN KEY ("touchId") REFERENCES "MarketingAutomationTouch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LifecycleAttributionEvent" ADD CONSTRAINT "LifecycleAttributionEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LifecycleAttributionEvent" ADD CONSTRAINT "LifecycleAttributionEvent_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LifecycleAttributionEvent" ADD CONSTRAINT "LifecycleAttributionEvent_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerLifecycleRuleVersion" ADD CONSTRAINT "CustomerLifecycleRuleVersion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerLifecycleRuleVersion" ADD CONSTRAINT "CustomerLifecycleRuleVersion_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerLifecycleQualitySnapshot" ADD CONSTRAINT "CustomerLifecycleQualitySnapshot_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LifecycleBusinessPlan" ADD CONSTRAINT "LifecycleBusinessPlan_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LifecycleBusinessPlan" ADD CONSTRAINT "LifecycleBusinessPlan_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
