ALTER TABLE "RefundRecord"
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "refundMode" TEXT NOT NULL DEFAULT 'refund_only',
  ADD COLUMN "operatorId" INTEGER,
  ADD COLUMN "operatorType" TEXT,
  ADD COLUMN "inventoryStatus" TEXT NOT NULL DEFAULT 'not_required';

UPDATE "RefundRecord"
SET "requestId" = 'legacy-refund-' || "id"::text
WHERE "requestId" IS NULL;

ALTER TABLE "RefundRecord"
  ALTER COLUMN "requestId" SET NOT NULL;

CREATE UNIQUE INDEX "RefundRecord_requestId_key" ON "RefundRecord"("requestId");
CREATE INDEX "RefundRecord_refundMode_idx" ON "RefundRecord"("refundMode");
CREATE INDEX "RefundRecord_operatorId_idx" ON "RefundRecord"("operatorId");

ALTER TABLE "RefundRecord"
  ADD CONSTRAINT "RefundRecord_refundMode_check"
  CHECK ("refundMode" IN ('refund_only', 'return_and_refund'));

ALTER TABLE "RefundRecord"
  ADD CONSTRAINT "RefundRecord_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RefundItem" (
  "id" SERIAL NOT NULL,
  "refundId" INTEGER NOT NULL,
  "orderItemId" INTEGER NOT NULL,
  "itemType" TEXT NOT NULL,
  "itemId" INTEGER,
  "quantity" DECIMAL(65,30) NOT NULL,
  "listAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "refundAmount" DECIMAL(65,30) NOT NULL,
  "inventoryAction" TEXT NOT NULL DEFAULT 'none',
  "inventoryStatus" TEXT NOT NULL DEFAULT 'not_required',
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefundItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RefundItem_refundId_idx" ON "RefundItem"("refundId");
CREATE INDEX "RefundItem_orderItemId_idx" ON "RefundItem"("orderItemId");
CREATE INDEX "RefundItem_itemType_itemId_idx" ON "RefundItem"("itemType", "itemId");

ALTER TABLE "RefundItem"
  ADD CONSTRAINT "RefundItem_quantity_positive_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "RefundItem_refundAmount_positive_check" CHECK ("refundAmount" > 0),
  ADD CONSTRAINT "RefundItem_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "RefundRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "RefundItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockMovement"
  ADD COLUMN "orderItemId" INTEGER,
  ADD COLUMN "refundItemId" INTEGER;

CREATE INDEX "StockMovement_orderItemId_idx" ON "StockMovement"("orderItemId");
CREATE INDEX "StockMovement_refundItemId_idx" ON "StockMovement"("refundItemId");

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "StockMovement_refundItemId_fkey" FOREIGN KEY ("refundItemId") REFERENCES "RefundItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
