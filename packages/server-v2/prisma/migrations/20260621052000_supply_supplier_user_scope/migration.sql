-- Supply platform supplier account scope
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "supplySupplierId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_supplySupplierId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_supplySupplierId_fkey"
      FOREIGN KEY ("supplySupplierId") REFERENCES "SupplySupplier"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "User_supplySupplierId_idx" ON "User"("supplySupplierId");
