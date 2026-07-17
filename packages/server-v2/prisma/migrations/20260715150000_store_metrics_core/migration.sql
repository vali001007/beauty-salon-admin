-- Store metrics fact lineage and versioned metric foundation.

ALTER TABLE "Reservation"
  ADD COLUMN "sourceReservationId" INTEGER,
  ADD COLUMN "createdById" INTEGER,
  ADD COLUMN "bookingSource" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelReasonCode" TEXT,
  ADD COLUMN "cancelledByType" TEXT,
  ADD COLUMN "noShowAt" TIMESTAMP(3);

ALTER TABLE "OrderItem"
  ADD COLUMN "reservationId" INTEGER,
  ADD COLUMN "serviceTaskId" INTEGER;

ALTER TABLE "CardUsageRecord"
  ADD COLUMN "reservationId" INTEGER,
  ADD COLUMN "serviceTaskId" INTEGER;

ALTER TABLE "ServiceTask"
  ADD COLUMN "reservationId" INTEGER;

ALTER TABLE "CustomerCard"
  ADD COLUMN "renewedFromCustomerCardId" INTEGER,
  ADD COLUMN "saleType" TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN "activatedAt" TIMESTAMP(3),
  ADD COLUMN "terminatedAt" TIMESTAMP(3),
  ADD COLUMN "terminationReason" TEXT;

CREATE TABLE "ReservationStatusEvent" (
  "id" SERIAL NOT NULL,
  "reservationId" INTEGER NOT NULL,
  "storeId" INTEGER NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reasonCode" TEXT,
  "actorType" TEXT,
  "actorId" INTEGER,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "ReservationStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "store_metric_target" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER NOT NULL,
  "metricKey" TEXT NOT NULL,
  "periodType" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "targetValue" DECIMAL(65,30) NOT NULL,
  "warningValue" DECIMAL(65,30),
  "criticalValue" DECIMAL(65,30),
  "weight" DECIMAL(65,30),
  "definitionVersion" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdById" INTEGER,
  "approvedById" INTEGER,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "store_metric_target_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "store_metric_snapshot" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER NOT NULL,
  "metricKey" TEXT NOT NULL,
  "metricDate" TIMESTAMP(3) NOT NULL,
  "granularity" TEXT NOT NULL DEFAULT 'day',
  "value" DECIMAL(65,30),
  "numerator" DECIMAL(65,30),
  "denominator" DECIMAL(65,30),
  "sampleCount" INTEGER,
  "qualityStatus" TEXT NOT NULL,
  "qualityReasons" JSONB,
  "dimensions" JSONB,
  "definitionVersion" INTEGER NOT NULL DEFAULT 1,
  "calculationMode" TEXT NOT NULL DEFAULT 'live',
  "sourceVersion" TEXT,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "frozenAt" TIMESTAMP(3),
  CONSTRAINT "store_metric_snapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Reservation_sourceReservationId_idx" ON "Reservation"("sourceReservationId");
CREATE INDEX "Reservation_bookingSource_idx" ON "Reservation"("bookingSource");
CREATE INDEX "OrderItem_reservationId_idx" ON "OrderItem"("reservationId");
CREATE INDEX "OrderItem_serviceTaskId_idx" ON "OrderItem"("serviceTaskId");
CREATE INDEX "CardUsageRecord_reservationId_idx" ON "CardUsageRecord"("reservationId");
CREATE INDEX "CardUsageRecord_serviceTaskId_idx" ON "CardUsageRecord"("serviceTaskId");
CREATE UNIQUE INDEX "ServiceTask_reservationId_key" ON "ServiceTask"("reservationId");
CREATE INDEX "CustomerCard_renewedFromCustomerCardId_idx" ON "CustomerCard"("renewedFromCustomerCardId");
CREATE INDEX "CustomerCard_saleType_idx" ON "CustomerCard"("saleType");
CREATE INDEX "ReservationStatusEvent_reservationId_occurredAt_idx" ON "ReservationStatusEvent"("reservationId", "occurredAt");
CREATE INDEX "ReservationStatusEvent_storeId_occurredAt_idx" ON "ReservationStatusEvent"("storeId", "occurredAt");
CREATE INDEX "ReservationStatusEvent_toStatus_idx" ON "ReservationStatusEvent"("toStatus");
CREATE UNIQUE INDEX "store_metric_target_storeId_metricKey_periodType_periodStart_key" ON "store_metric_target"("storeId", "metricKey", "periodType", "periodStart");
CREATE INDEX "store_metric_target_storeId_periodStart_periodEnd_idx" ON "store_metric_target"("storeId", "periodStart", "periodEnd");
CREATE INDEX "store_metric_target_metricKey_status_idx" ON "store_metric_target"("metricKey", "status");
CREATE UNIQUE INDEX "store_metric_snapshot_storeId_metricKey_metricDate_granularity_definitionVersion_key" ON "store_metric_snapshot"("storeId", "metricKey", "metricDate", "granularity", "definitionVersion");
CREATE INDEX "store_metric_snapshot_storeId_metricDate_idx" ON "store_metric_snapshot"("storeId", "metricDate");
CREATE INDEX "store_metric_snapshot_metricKey_metricDate_idx" ON "store_metric_snapshot"("metricKey", "metricDate");

ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_sourceReservationId_fkey" FOREIGN KEY ("sourceReservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_serviceTaskId_fkey" FOREIGN KEY ("serviceTaskId") REFERENCES "ServiceTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CardUsageRecord" ADD CONSTRAINT "CardUsageRecord_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CardUsageRecord" ADD CONSTRAINT "CardUsageRecord_serviceTaskId_fkey" FOREIGN KEY ("serviceTaskId") REFERENCES "ServiceTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceTask" ADD CONSTRAINT "ServiceTask_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerCard" ADD CONSTRAINT "CustomerCard_renewedFromCustomerCardId_fkey" FOREIGN KEY ("renewedFromCustomerCardId") REFERENCES "CustomerCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReservationStatusEvent" ADD CONSTRAINT "ReservationStatusEvent_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReservationStatusEvent" ADD CONSTRAINT "ReservationStatusEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_metric_target" ADD CONSTRAINT "store_metric_target_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_metric_snapshot" ADD CONSTRAINT "store_metric_snapshot_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the existing Brain targets as the initial generic metric targets.
INSERT INTO "store_metric_target" (
  "storeId", "metricKey", "periodType", "periodStart", "periodEnd", "targetValue",
  "definitionVersion", "status", "createdAt", "updatedAt"
)
SELECT "storeId", 'store.operating_revenue.month', "periodType", "periodStart", "periodEnd",
       "revenueTarget", 1, "status", "createdAt", "updatedAt"
FROM "brain_store_operating_target"
WHERE "revenueTarget" > 0
ON CONFLICT ("storeId", "metricKey", "periodType", "periodStart") DO NOTHING;
