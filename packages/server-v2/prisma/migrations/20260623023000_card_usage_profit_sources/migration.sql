ALTER TABLE "CustomerCard"
ADD COLUMN IF NOT EXISTS "sourceOrderId" INTEGER,
ADD COLUMN IF NOT EXISTS "sourceOrderItemId" INTEGER,
ADD COLUMN IF NOT EXISTS "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "giftTimes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "recognizedUnitValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "pricingSnapshot" JSONB;

ALTER TABLE "CardUsageRecord"
ADD COLUMN IF NOT EXISTS "customerCardId" INTEGER,
ADD COLUMN IF NOT EXISTS "cardId" INTEGER,
ADD COLUMN IF NOT EXISTS "projectId" INTEGER,
ADD COLUMN IF NOT EXISTS "storeId" INTEGER,
ADD COLUMN IF NOT EXISTS "recognizedUnitValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "recognizedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "sourceOrderId" INTEGER,
ADD COLUMN IF NOT EXISTS "sourceOrderItemId" INTEGER,
ADD COLUMN IF NOT EXISTS "pricingSnapshot" JSONB;

ALTER TABLE "CommissionRecord"
ADD COLUMN IF NOT EXISTS "sourceType" TEXT,
ADD COLUMN IF NOT EXISTS "sourceId" INTEGER,
ADD COLUMN IF NOT EXISTS "cardUsageRecordId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerCard_sourceOrderId_fkey'
  ) THEN
    ALTER TABLE "CustomerCard"
    ADD CONSTRAINT "CustomerCard_sourceOrderId_fkey"
    FOREIGN KEY ("sourceOrderId") REFERENCES "ProductOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerCard_sourceOrderItemId_fkey'
  ) THEN
    ALTER TABLE "CustomerCard"
    ADD CONSTRAINT "CustomerCard_sourceOrderItemId_fkey"
    FOREIGN KEY ("sourceOrderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CardUsageRecord_customerCardId_fkey'
  ) THEN
    ALTER TABLE "CardUsageRecord"
    ADD CONSTRAINT "CardUsageRecord_customerCardId_fkey"
    FOREIGN KEY ("customerCardId") REFERENCES "CustomerCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CardUsageRecord_cardId_fkey'
  ) THEN
    ALTER TABLE "CardUsageRecord"
    ADD CONSTRAINT "CardUsageRecord_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CardUsageRecord_projectId_fkey'
  ) THEN
    ALTER TABLE "CardUsageRecord"
    ADD CONSTRAINT "CardUsageRecord_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CardUsageRecord_storeId_fkey'
  ) THEN
    ALTER TABLE "CardUsageRecord"
    ADD CONSTRAINT "CardUsageRecord_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CardUsageRecord_sourceOrderId_fkey'
  ) THEN
    ALTER TABLE "CardUsageRecord"
    ADD CONSTRAINT "CardUsageRecord_sourceOrderId_fkey"
    FOREIGN KEY ("sourceOrderId") REFERENCES "ProductOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CardUsageRecord_sourceOrderItemId_fkey'
  ) THEN
    ALTER TABLE "CardUsageRecord"
    ADD CONSTRAINT "CardUsageRecord_sourceOrderItemId_fkey"
    FOREIGN KEY ("sourceOrderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CommissionRecord_cardUsageRecordId_fkey'
  ) THEN
    ALTER TABLE "CommissionRecord"
    ADD CONSTRAINT "CommissionRecord_cardUsageRecordId_fkey"
    FOREIGN KEY ("cardUsageRecordId") REFERENCES "CardUsageRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "CustomerCard_sourceOrderId_idx" ON "CustomerCard"("sourceOrderId");
CREATE INDEX IF NOT EXISTS "CustomerCard_sourceOrderItemId_idx" ON "CustomerCard"("sourceOrderItemId");
CREATE INDEX IF NOT EXISTS "CardUsageRecord_customerCardId_verifiedAt_idx" ON "CardUsageRecord"("customerCardId", "verifiedAt");
CREATE INDEX IF NOT EXISTS "CardUsageRecord_cardId_idx" ON "CardUsageRecord"("cardId");
CREATE INDEX IF NOT EXISTS "CardUsageRecord_projectId_verifiedAt_idx" ON "CardUsageRecord"("projectId", "verifiedAt");
CREATE INDEX IF NOT EXISTS "CardUsageRecord_storeId_verifiedAt_idx" ON "CardUsageRecord"("storeId", "verifiedAt");
CREATE INDEX IF NOT EXISTS "CardUsageRecord_sourceOrderId_idx" ON "CardUsageRecord"("sourceOrderId");
CREATE INDEX IF NOT EXISTS "CardUsageRecord_sourceOrderItemId_idx" ON "CardUsageRecord"("sourceOrderItemId");
CREATE INDEX IF NOT EXISTS "CommissionRecord_sourceType_sourceId_idx" ON "CommissionRecord"("sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "CommissionRecord_cardUsageRecordId_idx" ON "CommissionRecord"("cardUsageRecordId");
