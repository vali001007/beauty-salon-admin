-- Lock commission records into settlement documents so later records in the
-- same staff/month cannot be accidentally settled by an older settlement.

CREATE TABLE "CommissionSettlementRecord" (
  "id" SERIAL NOT NULL,
  "settlementId" INTEGER NOT NULL,
  "commissionRecordId" INTEGER NOT NULL,
  "amountSnapshot" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "statusSnapshot" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CommissionSettlementRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommissionSettlementRecord_settlementId_commissionRecordId_key"
  ON "CommissionSettlementRecord"("settlementId", "commissionRecordId");

CREATE INDEX "CommissionSettlementRecord_commissionRecordId_idx"
  ON "CommissionSettlementRecord"("commissionRecordId");

CREATE INDEX "CommissionSettlementRecord_settlementId_idx"
  ON "CommissionSettlementRecord"("settlementId");

ALTER TABLE "CommissionSettlementRecord"
  ADD CONSTRAINT "CommissionSettlementRecord_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "CommissionSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommissionSettlementRecord"
  ADD CONSTRAINT "CommissionSettlementRecord_commissionRecordId_fkey"
  FOREIGN KEY ("commissionRecordId") REFERENCES "CommissionRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
