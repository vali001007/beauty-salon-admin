-- CreateTable
CREATE TABLE IF NOT EXISTS "AmiPerformanceRecord" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerId" INTEGER,
    "customerId" INTEGER,
    "orderId" INTEGER,
    "revenueAmount" DECIMAL(65,30),
    "commissionRate" DECIMAL(65,30),
    "commissionAmount" DECIMAL(65,30),
    "workMinutes" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settleMonth" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "AmiPerformanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AmiMonthlyBill" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "settleMonth" TEXT NOT NULL,
    "baseFee" DECIMAL(65,30) NOT NULL,
    "commissionFee" DECIMAL(65,30) NOT NULL,
    "totalFee" DECIMAL(65,30) NOT NULL,
    "revenueGenerated" DECIMAL(65,30) NOT NULL,
    "roi" DECIMAL(65,30),
    "breakdown" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmiMonthlyBill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AmiPerformanceRecord_storeId_settleMonth_idx" ON "AmiPerformanceRecord"("storeId", "settleMonth");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AmiPerformanceRecord_category_idx" ON "AmiPerformanceRecord"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AmiPerformanceRecord_customerId_idx" ON "AmiPerformanceRecord"("customerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AmiPerformanceRecord_orderId_idx" ON "AmiPerformanceRecord"("orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AmiPerformanceRecord_triggerType_triggerId_idx" ON "AmiPerformanceRecord"("triggerType", "triggerId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AmiMonthlyBill_storeId_settleMonth_key" ON "AmiMonthlyBill"("storeId", "settleMonth");

-- AddForeignKey
ALTER TABLE "AmiPerformanceRecord" ADD CONSTRAINT "AmiPerformanceRecord_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmiPerformanceRecord" ADD CONSTRAINT "AmiPerformanceRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmiPerformanceRecord" ADD CONSTRAINT "AmiPerformanceRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmiMonthlyBill" ADD CONSTRAINT "AmiMonthlyBill_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
