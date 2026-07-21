CREATE TABLE "customer_service_feedback" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER NOT NULL,
  "customerId" INTEGER,
  "serviceTaskId" INTEGER,
  "reservationId" INTEGER,
  "orderId" INTEGER,
  "beauticianId" INTEGER,
  "projectId" INTEGER,
  "feedbackType" TEXT NOT NULL,
  "rating" INTEGER,
  "category" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'normal',
  "content" TEXT,
  "sourceChannel" TEXT NOT NULL DEFAULT 'manual',
  "status" TEXT NOT NULL DEFAULT 'open',
  "assignedUserId" INTEGER,
  "handledByUserId" INTEGER,
  "resolutionNote" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "handledAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "customer_service_feedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_service_feedback_rating_check" CHECK ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5)),
  CONSTRAINT "customer_service_feedback_type_check" CHECK ("feedbackType" IN ('complaint', 'satisfaction', 'suggestion', 'praise')),
  CONSTRAINT "customer_service_feedback_severity_check" CHECK ("severity" IN ('normal', 'warning', 'critical')),
  CONSTRAINT "customer_service_feedback_status_check" CHECK ("status" IN ('open', 'in_progress', 'resolved', 'closed'))
);

ALTER TABLE "customer_service_feedback"
  ADD CONSTRAINT "customer_service_feedback_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_service_feedback"
  ADD CONSTRAINT "customer_service_feedback_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "customer_service_feedback_storeId_occurredAt_idx"
  ON "customer_service_feedback"("storeId", "occurredAt");

CREATE INDEX "customer_service_feedback_storeId_feedbackType_status_idx"
  ON "customer_service_feedback"("storeId", "feedbackType", "status");

CREATE INDEX "customer_service_feedback_storeId_rating_idx"
  ON "customer_service_feedback"("storeId", "rating");

CREATE INDEX "customer_service_feedback_customerId_occurredAt_idx"
  ON "customer_service_feedback"("customerId", "occurredAt");

CREATE INDEX "customer_service_feedback_beauticianId_occurredAt_idx"
  ON "customer_service_feedback"("beauticianId", "occurredAt");

CREATE INDEX "customer_service_feedback_serviceTaskId_idx"
  ON "customer_service_feedback"("serviceTaskId");

CREATE INDEX "customer_service_feedback_reservationId_idx"
  ON "customer_service_feedback"("reservationId");

CREATE INDEX "customer_service_feedback_orderId_idx"
  ON "customer_service_feedback"("orderId");
