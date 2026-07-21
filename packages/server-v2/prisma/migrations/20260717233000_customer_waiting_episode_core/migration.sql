CREATE TABLE "customer_waiting_episode" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER NOT NULL,
  "customerId" INTEGER,
  "reservationId" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'waiting',
  "outcome" TEXT,
  "leaveReasonCode" TEXT,
  "leaveReasonNote" TEXT,
  "expectedWaitMinutes" INTEGER,
  "actualWaitMinutes" INTEGER,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "sourceChannel" TEXT NOT NULL DEFAULT 'manual',
  "recordedByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "customer_waiting_episode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_waiting_episode_status_check" CHECK ("status" IN ('waiting', 'ended')),
  CONSTRAINT "customer_waiting_episode_outcome_check" CHECK ("outcome" IS NULL OR "outcome" IN ('served', 'left', 'cancelled')),
  CONSTRAINT "customer_waiting_episode_reason_check" CHECK ("leaveReasonCode" IS NULL OR "leaveReasonCode" IN ('wait_too_long', 'schedule_conflict', 'personal_reason', 'service_unavailable', 'other')),
  CONSTRAINT "customer_waiting_episode_expected_minutes_check" CHECK ("expectedWaitMinutes" IS NULL OR "expectedWaitMinutes" >= 0),
  CONSTRAINT "customer_waiting_episode_actual_minutes_check" CHECK ("actualWaitMinutes" IS NULL OR "actualWaitMinutes" >= 0),
  CONSTRAINT "customer_waiting_episode_end_check" CHECK (("status" = 'waiting' AND "endedAt" IS NULL AND "outcome" IS NULL) OR ("status" = 'ended' AND "endedAt" IS NOT NULL AND "outcome" IS NOT NULL))
);

ALTER TABLE "customer_waiting_episode"
  ADD CONSTRAINT "customer_waiting_episode_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_waiting_episode"
  ADD CONSTRAINT "customer_waiting_episode_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_waiting_episode"
  ADD CONSTRAINT "customer_waiting_episode_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "customer_waiting_episode_active_reservation_key"
  ON "customer_waiting_episode"("reservationId")
  WHERE "status" = 'waiting' AND "reservationId" IS NOT NULL;

CREATE INDEX "customer_waiting_episode_storeId_startedAt_idx"
  ON "customer_waiting_episode"("storeId", "startedAt");

CREATE INDEX "customer_waiting_episode_storeId_status_startedAt_idx"
  ON "customer_waiting_episode"("storeId", "status", "startedAt");

CREATE INDEX "customer_waiting_episode_storeId_outcome_leaveReasonCode_startedAt_idx"
  ON "customer_waiting_episode"("storeId", "outcome", "leaveReasonCode", "startedAt");

CREATE INDEX "customer_waiting_episode_reservationId_status_idx"
  ON "customer_waiting_episode"("reservationId", "status");

CREATE INDEX "customer_waiting_episode_customerId_startedAt_idx"
  ON "customer_waiting_episode"("customerId", "startedAt");
