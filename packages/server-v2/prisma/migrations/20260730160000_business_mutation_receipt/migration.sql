CREATE TABLE IF NOT EXISTS "business_mutation_receipt" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER NOT NULL,
  "capabilityKey" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "businessObjectType" TEXT NOT NULL,
  "businessObjectId" TEXT NOT NULL,
  "mutationKind" TEXT NOT NULL,
  "requestFingerprint" VARCHAR(64) NOT NULL,
  "beforeVersion" TEXT NOT NULL,
  "afterVersion" TEXT NOT NULL,
  "beforeStateFingerprint" VARCHAR(64) NOT NULL,
  "afterStateFingerprint" VARCHAR(64) NOT NULL,
  "changedFields" JSONB NOT NULL,
  "actorId" INTEGER,
  "receiptFingerprint" VARCHAR(64) NOT NULL,
  "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "business_mutation_receipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "business_mutation_receipt_receiptFingerprint_key"
  ON "business_mutation_receipt"("receiptFingerprint");

CREATE UNIQUE INDEX IF NOT EXISTS "business_mutation_receipt_storeId_capabilityKey_idempotencyKey_key"
  ON "business_mutation_receipt"("storeId", "capabilityKey", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "business_mutation_receipt_businessObjectType_businessObjectId_committedAt_idx"
  ON "business_mutation_receipt"("businessObjectType", "businessObjectId", "committedAt");
