ALTER TABLE "OrderItem"
  ADD COLUMN "recognizedAt" TIMESTAMP(3),
  ADD COLUMN "recognitionSource" TEXT;

ALTER TABLE "AmiMonthlyBill"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "confirmedBy" INTEGER,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "invoicedAt" TIMESTAMP(3),
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidReason" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP INDEX IF EXISTS "AmiMonthlyBill_storeId_settleMonth_key";
CREATE UNIQUE INDEX "AmiMonthlyBill_storeId_settleMonth_version_key" ON "AmiMonthlyBill"("storeId", "settleMonth", "version");
CREATE INDEX "AmiMonthlyBill_storeId_settleMonth_status_idx" ON "AmiMonthlyBill"("storeId", "settleMonth", "status");

ALTER TABLE "CommissionSettlement"
  ADD COLUMN "paidBy" INTEGER,
  ADD COLUMN "paymentBatchNo" TEXT,
  ADD COLUMN "paymentMethod" TEXT,
  ADD COLUMN "paymentVoucherNo" TEXT;

CREATE TABLE "DailySettlementSnapshot" (
  "id" SERIAL NOT NULL,
  "dailySettlementId" INTEGER NOT NULL,
  "storeId" INTEGER NOT NULL,
  "settleDate" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL,
  "totalRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "cashRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "wechatRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "alipayRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "cardRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "balanceRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "rechargeIncome" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "refundAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "orderCount" INTEGER NOT NULL DEFAULT 0,
  "customerCount" INTEGER NOT NULL DEFAULT 0,
  "avgTransaction" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "materialCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "grossProfit" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "grossMargin" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "commissionTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "snapshot" JSONB NOT NULL,
  "sourceDigest" TEXT,
  "confirmedBy" INTEGER,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "supersededAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailySettlementSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceAuditLog" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER,
  "userId" INTEGER,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" INTEGER NOT NULL,
  "reason" TEXT,
  "beforePayload" JSONB,
  "afterPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MonthlyProfitClose" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER NOT NULL,
  "periodMonth" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "operatingRevenue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "materialCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "productCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "commissionCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "operatingCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "grossProfit" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "operatingProfit" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "dataQuality" JSONB NOT NULL,
  "sourceSummary" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "confirmedBy" INTEGER,
  "confirmedAt" TIMESTAMP(3),
  "reopenedBy" INTEGER,
  "reopenedAt" TIMESTAMP(3),
  "reopenReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonthlyProfitClose_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberLiabilitySnapshot" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER NOT NULL,
  "snapshotDate" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL,
  "cashContractLiability" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "giftObligation" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "cardLiability" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "remainingTimes" INTEGER NOT NULL DEFAULT 0,
  "additions" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "releases" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "refunds" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "expirations" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "adjustments" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "sourceSummary" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "confirmedBy" INTEGER,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemberLiabilitySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommissionAdjustment" (
  "id" SERIAL NOT NULL,
  "settlementId" INTEGER NOT NULL,
  "commissionRecordId" INTEGER,
  "storeId" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdBy" INTEGER,
  "confirmedBy" INTEGER,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailySettlementSnapshot_dailySettlementId_version_key" ON "DailySettlementSnapshot"("dailySettlementId", "version");
CREATE INDEX "DailySettlementSnapshot_storeId_settleDate_idx" ON "DailySettlementSnapshot"("storeId", "settleDate");
CREATE INDEX "FinanceAuditLog_storeId_createdAt_idx" ON "FinanceAuditLog"("storeId", "createdAt");
CREATE INDEX "FinanceAuditLog_entityType_entityId_idx" ON "FinanceAuditLog"("entityType", "entityId");
CREATE INDEX "FinanceAuditLog_action_idx" ON "FinanceAuditLog"("action");
CREATE UNIQUE INDEX "MonthlyProfitClose_storeId_periodMonth_version_key" ON "MonthlyProfitClose"("storeId", "periodMonth", "version");
CREATE INDEX "MonthlyProfitClose_storeId_periodMonth_status_idx" ON "MonthlyProfitClose"("storeId", "periodMonth", "status");
CREATE UNIQUE INDEX "MemberLiabilitySnapshot_storeId_snapshotDate_version_key" ON "MemberLiabilitySnapshot"("storeId", "snapshotDate", "version");
CREATE INDEX "MemberLiabilitySnapshot_storeId_snapshotDate_idx" ON "MemberLiabilitySnapshot"("storeId", "snapshotDate");
CREATE INDEX "CommissionAdjustment_settlementId_status_idx" ON "CommissionAdjustment"("settlementId", "status");
CREATE INDEX "CommissionAdjustment_commissionRecordId_idx" ON "CommissionAdjustment"("commissionRecordId");
CREATE INDEX "CommissionAdjustment_storeId_createdAt_idx" ON "CommissionAdjustment"("storeId", "createdAt");

ALTER TABLE "DailySettlementSnapshot" ADD CONSTRAINT "DailySettlementSnapshot_dailySettlementId_fkey" FOREIGN KEY ("dailySettlementId") REFERENCES "DailySettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailySettlementSnapshot" ADD CONSTRAINT "DailySettlementSnapshot_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailySettlementSnapshot" ADD CONSTRAINT "DailySettlementSnapshot_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceAuditLog" ADD CONSTRAINT "FinanceAuditLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceAuditLog" ADD CONSTRAINT "FinanceAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MonthlyProfitClose" ADD CONSTRAINT "MonthlyProfitClose_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthlyProfitClose" ADD CONSTRAINT "MonthlyProfitClose_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MemberLiabilitySnapshot" ADD CONSTRAINT "MemberLiabilitySnapshot_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberLiabilitySnapshot" ADD CONSTRAINT "MemberLiabilitySnapshot_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "CommissionSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_commissionRecordId_fkey" FOREIGN KEY ("commissionRecordId") REFERENCES "CommissionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "DailySettlementSnapshot" (
  "dailySettlementId", "storeId", "settleDate", "version", "totalRevenue", "cashRevenue", "wechatRevenue",
  "alipayRevenue", "cardRevenue", "balanceRevenue", "rechargeIncome", "refundAmount", "orderCount", "customerCount",
  "avgTransaction", "materialCost", "grossProfit", "grossMargin", "commissionTotal", "snapshot", "confirmedBy", "confirmedAt"
)
SELECT
  ds."id", ds."storeId", ds."settleDate", 1, ds."totalRevenue", ds."cashRevenue", ds."wechatRevenue",
  ds."alipayRevenue", ds."cardRevenue", ds."balanceRevenue", ds."rechargeIncome", ds."refundAmount", ds."orderCount", ds."customerCount",
  ds."avgTransaction", ds."materialCost", ds."grossProfit", ds."grossMargin", ds."commissionTotal", to_jsonb(ds), ds."confirmedBy",
  COALESCE(ds."confirmedAt", ds."updatedAt")
FROM "DailySettlement" ds
WHERE ds."status" = 'confirmed';
