-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "beauticianId" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CashierShift" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "deviceId" INTEGER,
    "operatorId" INTEGER,
    "operatorType" TEXT NOT NULL DEFAULT 'device',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "openingCash" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "closingCash" DECIMAL(65,30),
    "systemCash" DECIMAL(65,30),
    "cashDiff" DECIMAL(65,30),
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashierShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DailySettlement" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "settleDate" TIMESTAMP(3) NOT NULL,
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
    "status" TEXT NOT NULL DEFAULT 'draft',
    "confirmedBy" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailySettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderItem_beauticianId_idx" ON "OrderItem"("beauticianId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CashierShift_storeId_startedAt_idx" ON "CashierShift"("storeId", "startedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CashierShift_deviceId_status_idx" ON "CashierShift"("deviceId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CashierShift_operatorId_idx" ON "CashierShift"("operatorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CashierShift_status_idx" ON "CashierShift"("status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DailySettlement_storeId_settleDate_key" ON "DailySettlement"("storeId", "settleDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DailySettlement_storeId_settleDate_idx" ON "DailySettlement"("storeId", "settleDate");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DailySettlement_status_idx" ON "DailySettlement"("status");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_beauticianId_fkey" FOREIGN KEY ("beauticianId") REFERENCES "Beautician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TerminalDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySettlement" ADD CONSTRAINT "DailySettlement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
