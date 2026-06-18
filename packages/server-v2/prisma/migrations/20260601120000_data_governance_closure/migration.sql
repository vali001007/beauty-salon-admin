-- Data governance and operating-loop closure.
-- Existing-table foreign keys are added NOT VALID to avoid blocking migration on legacy demo data.

-- New operating tables -------------------------------------------------------

CREATE TABLE "StockMovement" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "batchId" INTEGER,
    "movementNo" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "beforeStock" DECIMAL(65,30),
    "afterStock" DECIMAL(65,30),
    "unit" TEXT,
    "sourceType" TEXT,
    "sourceId" INTEGER,
    "sourceNo" TEXT,
    "remark" TEXT,
    "operatorId" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" INTEGER,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "subtotal" DECIMAL(65,30) NOT NULL,
    "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentRecord" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "paymentNo" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL,
    "transactionNo" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefundRecord" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "refundNo" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingAttribution" (
    "id" SERIAL NOT NULL,
    "touchId" INTEGER NOT NULL,
    "strategyId" INTEGER NOT NULL,
    "executionId" INTEGER,
    "customerId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "attributionType" TEXT NOT NULL DEFAULT 'last_touch',
    "attributedRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "attributionWindowDays" INTEGER NOT NULL DEFAULT 30,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingAttribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecommendationEvent" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "deviceId" INTEGER,
    "recommendationId" INTEGER,
    "eventType" TEXT NOT NULL,
    "taskId" INTEGER,
    "orderId" INTEGER,
    "note" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Promotion" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discountText" TEXT NOT NULL,
    "applicableProjectIds" INTEGER[],
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrintJob" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "jobNo" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" INTEGER,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- New indexes ----------------------------------------------------------------

CREATE UNIQUE INDEX "StockMovement_movementNo_key" ON "StockMovement"("movementNo");
CREATE INDEX "StockMovement_storeId_productId_occurredAt_idx" ON "StockMovement"("storeId", "productId", "occurredAt");
CREATE INDEX "StockMovement_movementType_idx" ON "StockMovement"("movementType");
CREATE INDEX "StockMovement_sourceType_sourceId_idx" ON "StockMovement"("sourceType", "sourceId");
CREATE INDEX "StockMovement_batchId_idx" ON "StockMovement"("batchId");
CREATE INDEX "StockMovement_operatorId_idx" ON "StockMovement"("operatorId");

CREATE INDEX "ProductOrder_storeId_idx" ON "ProductOrder"("storeId");

CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_itemType_itemId_idx" ON "OrderItem"("itemType", "itemId");

CREATE UNIQUE INDEX "PaymentRecord_paymentNo_key" ON "PaymentRecord"("paymentNo");
CREATE INDEX "PaymentRecord_orderId_idx" ON "PaymentRecord"("orderId");
CREATE INDEX "PaymentRecord_status_idx" ON "PaymentRecord"("status");
CREATE INDEX "PaymentRecord_paidAt_idx" ON "PaymentRecord"("paidAt");

CREATE UNIQUE INDEX "RefundRecord_refundNo_key" ON "RefundRecord"("refundNo");
CREATE INDEX "RefundRecord_orderId_idx" ON "RefundRecord"("orderId");
CREATE INDEX "RefundRecord_status_idx" ON "RefundRecord"("status");
CREATE INDEX "RefundRecord_refundedAt_idx" ON "RefundRecord"("refundedAt");

CREATE INDEX "CardUsageRecord_beauticianId_idx" ON "CardUsageRecord"("beauticianId");
CREATE INDEX "CardUsageRecord_deviceId_idx" ON "CardUsageRecord"("deviceId");

CREATE INDEX "Reservation_projectId_idx" ON "Reservation"("projectId");
CREATE INDEX "Reservation_beauticianId_idx" ON "Reservation"("beauticianId");

CREATE INDEX "ServiceTask_deviceId_idx" ON "ServiceTask"("deviceId");

CREATE INDEX "SkinTest_taskId_idx" ON "SkinTest"("taskId");
CREATE INDEX "SkinTest_deviceId_idx" ON "SkinTest"("deviceId");

CREATE INDEX "MarketingAttribution_touchId_idx" ON "MarketingAttribution"("touchId");
CREATE INDEX "MarketingAttribution_strategyId_idx" ON "MarketingAttribution"("strategyId");
CREATE INDEX "MarketingAttribution_executionId_idx" ON "MarketingAttribution"("executionId");
CREATE INDEX "MarketingAttribution_customerId_idx" ON "MarketingAttribution"("customerId");
CREATE INDEX "MarketingAttribution_orderId_idx" ON "MarketingAttribution"("orderId");
CREATE INDEX "MarketingAttribution_occurredAt_idx" ON "MarketingAttribution"("occurredAt");

CREATE INDEX "RecommendationEvent_storeId_createdAt_idx" ON "RecommendationEvent"("storeId", "createdAt");
CREATE INDEX "RecommendationEvent_customerId_idx" ON "RecommendationEvent"("customerId");
CREATE INDEX "RecommendationEvent_eventType_idx" ON "RecommendationEvent"("eventType");
CREATE INDEX "RecommendationEvent_taskId_idx" ON "RecommendationEvent"("taskId");
CREATE INDEX "RecommendationEvent_orderId_idx" ON "RecommendationEvent"("orderId");

CREATE INDEX "Promotion_storeId_idx" ON "Promotion"("storeId");
CREATE INDEX "Promotion_status_idx" ON "Promotion"("status");
CREATE INDEX "Promotion_startAt_endAt_idx" ON "Promotion"("startAt", "endAt");

CREATE UNIQUE INDEX "PrintJob_jobNo_key" ON "PrintJob"("jobNo");
CREATE INDEX "PrintJob_storeId_createdAt_idx" ON "PrintJob"("storeId", "createdAt");
CREATE INDEX "PrintJob_sourceType_sourceId_idx" ON "PrintJob"("sourceType", "sourceId");
CREATE INDEX "PrintJob_status_idx" ON "PrintJob"("status");

CREATE INDEX "AiAuditLog_deviceId_idx" ON "AiAuditLog"("deviceId");

-- New table foreign keys -----------------------------------------------------

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefundRecord" ADD CONSTRAINT "RefundRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingAttribution" ADD CONSTRAINT "MarketingAttribution_touchId_fkey" FOREIGN KEY ("touchId") REFERENCES "MarketingAutomationTouch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingAttribution" ADD CONSTRAINT "MarketingAttribution_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "MarketingAutomationStrategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingAttribution" ADD CONSTRAINT "MarketingAttribution_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "MarketingAutomationExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingAttribution" ADD CONSTRAINT "MarketingAttribution_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingAttribution" ADD CONSTRAINT "MarketingAttribution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecommendationEvent" ADD CONSTRAINT "RecommendationEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecommendationEvent" ADD CONSTRAINT "RecommendationEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecommendationEvent" ADD CONSTRAINT "RecommendationEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TerminalDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecommendationEvent" ADD CONSTRAINT "RecommendationEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ServiceTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecommendationEvent" ADD CONSTRAINT "RecommendationEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing table foreign keys ------------------------------------------------

ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_fromStoreId_fkey" FOREIGN KEY ("fromStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_toStoreId_fkey" FOREIGN KEY ("toStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Beautician" ADD CONSTRAINT "Beautician_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ProductOrder" ADD CONSTRAINT "ProductOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ProductOrder" ADD CONSTRAINT "ProductOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "CardUsageRecord" ADD CONSTRAINT "CardUsageRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "CardUsageRecord" ADD CONSTRAINT "CardUsageRecord_beauticianId_fkey" FOREIGN KEY ("beauticianId") REFERENCES "Beautician"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "CardUsageRecord" ADD CONSTRAINT "CardUsageRecord_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TerminalDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_beauticianId_fkey" FOREIGN KEY ("beauticianId") REFERENCES "Beautician"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_beauticianId_fkey" FOREIGN KEY ("beauticianId") REFERENCES "Beautician"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ServiceTask" ADD CONSTRAINT "ServiceTask_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ServiceTask" ADD CONSTRAINT "ServiceTask_beauticianId_fkey" FOREIGN KEY ("beauticianId") REFERENCES "Beautician"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "SkinTest" ADD CONSTRAINT "SkinTest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ServiceTask"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
ALTER TABLE "AiAuditLog" ADD CONSTRAINT "AiAuditLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TerminalDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
