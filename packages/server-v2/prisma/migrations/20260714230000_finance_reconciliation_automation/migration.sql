ALTER TABLE "DailySettlement"
  ADD COLUMN "reconciliationStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "confirmationMode" TEXT,
  ADD COLUMN "latestReconciliationRunId" INTEGER,
  ADD COLUMN "systemSummary" JSONB,
  ADD COLUMN "adjustmentSummary" JSONB,
  ADD COLUMN "finalSummary" JSONB;

ALTER TABLE "DailySettlementSnapshot"
  ADD COLUMN "systemSummary" JSONB,
  ADD COLUMN "adjustmentSummary" JSONB,
  ADD COLUMN "finalSummary" JSONB,
  ADD COLUMN "confirmationMode" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "reconciliationRunId" INTEGER,
  ADD COLUMN "ruleVersion" TEXT;

CREATE TABLE "FinanceReconciliationRun" (
  "id" SERIAL NOT NULL,
  "storeId" INTEGER NOT NULL,
  "dailySettlementId" INTEGER,
  "businessDate" TIMESTAMP(3) NOT NULL,
  "triggerType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "ruleVersion" TEXT NOT NULL,
  "sourceDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "summary" JSONB NOT NULL,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceReconciliationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceReconciliationIssue" (
  "id" SERIAL NOT NULL,
  "runId" INTEGER NOT NULL,
  "storeId" INTEGER NOT NULL,
  "dailySettlementId" INTEGER,
  "businessDate" TIMESTAMP(3) NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "amount" DECIMAL(65,30),
  "sourceType" TEXT,
  "sourceId" INTEGER,
  "actionPath" TEXT NOT NULL,
  "acknowledgedBy" INTEGER,
  "acknowledgedAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceReconciliationIssue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailySettlementAdjustment" (
  "id" SERIAL NOT NULL,
  "dailySettlementId" INTEGER NOT NULL,
  "storeId" INTEGER NOT NULL,
  "adjustmentType" TEXT NOT NULL,
  "effectField" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "reason" TEXT NOT NULL,
  "voucherNo" TEXT,
  "status" TEXT NOT NULL DEFAULT 'applied',
  "createdBy" INTEGER NOT NULL,
  "cancelledBy" INTEGER,
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailySettlementAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceReconciliationRun_idempotencyKey_key" ON "FinanceReconciliationRun"("idempotencyKey");
CREATE INDEX "FinanceReconciliationRun_storeId_businessDate_status_idx" ON "FinanceReconciliationRun"("storeId", "businessDate", "status");
CREATE INDEX "FinanceReconciliationRun_dailySettlementId_createdAt_idx" ON "FinanceReconciliationRun"("dailySettlementId", "createdAt");
CREATE UNIQUE INDEX "FinanceReconciliationIssue_fingerprint_key" ON "FinanceReconciliationIssue"("fingerprint");
CREATE INDEX "FinanceReconciliationIssue_storeId_businessDate_status_idx" ON "FinanceReconciliationIssue"("storeId", "businessDate", "status");
CREATE INDEX "FinanceReconciliationIssue_category_severity_status_idx" ON "FinanceReconciliationIssue"("category", "severity", "status");
CREATE INDEX "FinanceReconciliationIssue_dailySettlementId_status_idx" ON "FinanceReconciliationIssue"("dailySettlementId", "status");
CREATE INDEX "DailySettlementAdjustment_dailySettlementId_status_idx" ON "DailySettlementAdjustment"("dailySettlementId", "status");
CREATE INDEX "DailySettlementAdjustment_storeId_createdAt_idx" ON "DailySettlementAdjustment"("storeId", "createdAt");
CREATE INDEX "DailySettlementAdjustment_createdBy_createdAt_idx" ON "DailySettlementAdjustment"("createdBy", "createdAt");

ALTER TABLE "FinanceReconciliationRun" ADD CONSTRAINT "FinanceReconciliationRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceReconciliationRun" ADD CONSTRAINT "FinanceReconciliationRun_dailySettlementId_fkey" FOREIGN KEY ("dailySettlementId") REFERENCES "DailySettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceReconciliationIssue" ADD CONSTRAINT "FinanceReconciliationIssue_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FinanceReconciliationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceReconciliationIssue" ADD CONSTRAINT "FinanceReconciliationIssue_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceReconciliationIssue" ADD CONSTRAINT "FinanceReconciliationIssue_dailySettlementId_fkey" FOREIGN KEY ("dailySettlementId") REFERENCES "DailySettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DailySettlementAdjustment" ADD CONSTRAINT "DailySettlementAdjustment_dailySettlementId_fkey" FOREIGN KEY ("dailySettlementId") REFERENCES "DailySettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailySettlementAdjustment" ADD CONSTRAINT "DailySettlementAdjustment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "DailySettlement"
SET
  "reconciliationStatus" = CASE WHEN "status" = 'confirmed' THEN 'passed' ELSE 'pending' END,
  "confirmationMode" = CASE WHEN "status" = 'confirmed' THEN 'manual' ELSE NULL END,
  "systemSummary" = jsonb_build_object(
    'totalRevenue', "totalRevenue",
    'cashRevenue', "cashRevenue",
    'wechatRevenue', "wechatRevenue",
    'alipayRevenue', "alipayRevenue",
    'cardRevenue', "cardRevenue",
    'balanceRevenue', "balanceRevenue",
    'rechargeIncome', "rechargeIncome",
    'refundAmount', "refundAmount",
    'materialCost', "materialCost",
    'commissionTotal', "commissionTotal"
  ),
  "adjustmentSummary" = '{}'::jsonb,
  "finalSummary" = jsonb_build_object(
    'totalRevenue', "totalRevenue",
    'cashRevenue', "cashRevenue",
    'wechatRevenue', "wechatRevenue",
    'alipayRevenue', "alipayRevenue",
    'cardRevenue', "cardRevenue",
    'balanceRevenue', "balanceRevenue",
    'rechargeIncome', "rechargeIncome",
    'refundAmount', "refundAmount",
    'materialCost', "materialCost",
    'commissionTotal', "commissionTotal"
  );

UPDATE "DailySettlementSnapshot"
SET
  "systemSummary" = jsonb_build_object(
    'totalRevenue', "totalRevenue",
    'cashRevenue', "cashRevenue",
    'wechatRevenue', "wechatRevenue",
    'alipayRevenue', "alipayRevenue",
    'cardRevenue', "cardRevenue",
    'balanceRevenue', "balanceRevenue",
    'rechargeIncome', "rechargeIncome",
    'refundAmount', "refundAmount",
    'materialCost', "materialCost",
    'commissionTotal', "commissionTotal"
  ),
  "adjustmentSummary" = '{}'::jsonb,
  "finalSummary" = jsonb_build_object(
    'totalRevenue', "totalRevenue",
    'cashRevenue', "cashRevenue",
    'wechatRevenue', "wechatRevenue",
    'alipayRevenue', "alipayRevenue",
    'cardRevenue', "cardRevenue",
    'balanceRevenue', "balanceRevenue",
    'rechargeIncome', "rechargeIncome",
    'refundAmount', "refundAmount",
    'materialCost', "materialCost",
    'commissionTotal', "commissionTotal"
  );
