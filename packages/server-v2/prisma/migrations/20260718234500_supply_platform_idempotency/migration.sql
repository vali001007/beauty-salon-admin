ALTER TABLE "ProcurementOrder"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "creationFingerprint" VARCHAR(64),
  ADD COLUMN "batchIdempotencyKey" TEXT,
  ADD COLUMN "batchCreationFingerprint" VARCHAR(64);

CREATE UNIQUE INDEX "ProcurementOrder_idempotencyKey_key" ON "ProcurementOrder"("idempotencyKey");
CREATE INDEX "ProcurementOrder_batchIdempotencyKey_idx" ON "ProcurementOrder"("batchIdempotencyKey");

CREATE TABLE "ProcurementReceipt" (
  "id" SERIAL NOT NULL,
  "orderId" INTEGER NOT NULL,
  "storeId" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "creationFingerprint" VARCHAR(64) NOT NULL,
  "operatorId" INTEGER,
  "remark" TEXT,
  "items" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProcurementReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProcurementReceipt_idempotencyKey_key" ON "ProcurementReceipt"("idempotencyKey");
CREATE INDEX "ProcurementReceipt_orderId_createdAt_idx" ON "ProcurementReceipt"("orderId", "createdAt");
CREATE INDEX "ProcurementReceipt_storeId_createdAt_idx" ON "ProcurementReceipt"("storeId", "createdAt");
CREATE INDEX "ProcurementReceipt_operatorId_idx" ON "ProcurementReceipt"("operatorId");

ALTER TABLE "ProcurementReceipt" ADD CONSTRAINT "ProcurementReceipt_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "ProcurementOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcurementReceipt" ADD CONSTRAINT "ProcurementReceipt_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcurementReceipt" ADD CONSTRAINT "ProcurementReceipt_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
