ALTER TABLE "ProductOrder" ADD COLUMN IF NOT EXISTS "source" TEXT;

CREATE INDEX IF NOT EXISTS "ProductOrder_source_idx" ON "ProductOrder"("source");
