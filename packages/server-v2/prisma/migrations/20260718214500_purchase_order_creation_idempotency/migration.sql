ALTER TABLE "PurchaseOrder"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "creationFingerprint" VARCHAR(64);

CREATE UNIQUE INDEX "PurchaseOrder_idempotencyKey_key" ON "PurchaseOrder"("idempotencyKey");
