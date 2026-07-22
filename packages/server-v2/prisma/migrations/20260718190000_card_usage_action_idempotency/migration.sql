-- Persist the confirmed action identity on the business fact so receipt recovery
-- can prove that a card usage was committed without applying the side effects twice.

ALTER TABLE "CardUsageRecord"
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "CardUsageRecord_idempotencyKey_key"
  ON "CardUsageRecord"("idempotencyKey");
