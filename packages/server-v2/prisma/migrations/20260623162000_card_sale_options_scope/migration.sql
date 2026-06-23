ALTER TABLE "Card"
ADD COLUMN IF NOT EXISTS "storeId" INTEGER,
ADD COLUMN IF NOT EXISTS "validDays" INTEGER NOT NULL DEFAULT 365,
ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Card_storeId_fkey'
  ) THEN
    ALTER TABLE "Card"
    ADD CONSTRAINT "Card_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Card_storeId_idx" ON "Card"("storeId");
CREATE INDEX IF NOT EXISTS "Card_status_idx" ON "Card"("status");
CREATE INDEX IF NOT EXISTS "Card_sortOrder_idx" ON "Card"("sortOrder");
