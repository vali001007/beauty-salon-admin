-- Persist the external create request identity on the reservation business fact.
-- Existing reservations remain compatible because the new key is nullable.

ALTER TABLE "Reservation"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "creationFingerprint" VARCHAR(64);

CREATE UNIQUE INDEX "Reservation_idempotencyKey_key"
  ON "Reservation"("idempotencyKey");
