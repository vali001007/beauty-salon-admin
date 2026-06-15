-- Create a first-class task source for management-dispatched terminal follow-ups.
CREATE TABLE "TerminalFollowUpTask" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER NOT NULL,
  "customerId" INTEGER NOT NULL,
  "recommendationId" INTEGER,
  "sourceRecommendationKey" TEXT,
  "source" TEXT NOT NULL DEFAULT 'recommendation',
  "triggerType" TEXT,
  "title" TEXT NOT NULL,
  "script" TEXT,
  "note" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'recommended',
  "assigneeRole" TEXT NOT NULL DEFAULT 'manager',
  "assigneeUserId" INTEGER,
  "assigneeBeauticianId" INTEGER,
  "assignedByUserId" INTEGER,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'pending',
  "resultType" TEXT,
  "resultNote" TEXT,
  "reservationId" INTEGER,
  "orderId" INTEGER,
  "serviceTaskId" INTEGER,
  "deviceId" INTEGER,
  "completedByUserId" INTEGER,
  "completedAt" TIMESTAMP(3),
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "TerminalFollowUpTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TerminalFollowUpTask_storeId_status_dueAt_idx" ON "TerminalFollowUpTask"("storeId", "status", "dueAt");
CREATE INDEX "TerminalFollowUpTask_storeId_assigneeRole_status_dueAt_idx" ON "TerminalFollowUpTask"("storeId", "assigneeRole", "status", "dueAt");
CREATE INDEX "TerminalFollowUpTask_storeId_assigneeUserId_status_dueAt_idx" ON "TerminalFollowUpTask"("storeId", "assigneeUserId", "status", "dueAt");
CREATE INDEX "TerminalFollowUpTask_customerId_status_idx" ON "TerminalFollowUpTask"("customerId", "status");
CREATE INDEX "TerminalFollowUpTask_recommendationId_customerId_status_idx" ON "TerminalFollowUpTask"("recommendationId", "customerId", "status");
CREATE INDEX "TerminalFollowUpTask_sourceRecommendationKey_customerId_storeId_idx" ON "TerminalFollowUpTask"("sourceRecommendationKey", "customerId", "storeId");
CREATE INDEX "TerminalFollowUpTask_assigneeBeauticianId_idx" ON "TerminalFollowUpTask"("assigneeBeauticianId");
CREATE INDEX "TerminalFollowUpTask_reservationId_idx" ON "TerminalFollowUpTask"("reservationId");
CREATE INDEX "TerminalFollowUpTask_orderId_idx" ON "TerminalFollowUpTask"("orderId");
CREATE INDEX "TerminalFollowUpTask_serviceTaskId_idx" ON "TerminalFollowUpTask"("serviceTaskId");
CREATE INDEX "TerminalFollowUpTask_deviceId_idx" ON "TerminalFollowUpTask"("deviceId");
CREATE INDEX "TerminalFollowUpTask_deletedAt_idx" ON "TerminalFollowUpTask"("deletedAt");

ALTER TABLE "TerminalFollowUpTask"
  ADD CONSTRAINT "TerminalFollowUpTask_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TerminalFollowUpTask"
  ADD CONSTRAINT "TerminalFollowUpTask_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TerminalFollowUpTask"
  ADD CONSTRAINT "TerminalFollowUpTask_assigneeUserId_fkey"
  FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TerminalFollowUpTask"
  ADD CONSTRAINT "TerminalFollowUpTask_assigneeBeauticianId_fkey"
  FOREIGN KEY ("assigneeBeauticianId") REFERENCES "Beautician"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TerminalFollowUpTask"
  ADD CONSTRAINT "TerminalFollowUpTask_assignedByUserId_fkey"
  FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TerminalFollowUpTask"
  ADD CONSTRAINT "TerminalFollowUpTask_completedByUserId_fkey"
  FOREIGN KEY ("completedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TerminalFollowUpTask"
  ADD CONSTRAINT "TerminalFollowUpTask_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TerminalFollowUpTask"
  ADD CONSTRAINT "TerminalFollowUpTask_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "ProductOrder"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TerminalFollowUpTask"
  ADD CONSTRAINT "TerminalFollowUpTask_serviceTaskId_fkey"
  FOREIGN KEY ("serviceTaskId") REFERENCES "ServiceTask"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TerminalFollowUpTask"
  ADD CONSTRAINT "TerminalFollowUpTask_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "TerminalDevice"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
