-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT 'all',
    "targetId" INTEGER,
    "levelId" INTEGER,
    "rate" DECIMAL(65,30) NOT NULL,
    "fixedAmount" DECIMAL(65,30),
    "calcBase" TEXT NOT NULL DEFAULT 'total',
    "isDesignated" BOOLEAN NOT NULL DEFAULT false,
    "designatedBonus" DECIMAL(65,30),
    "minThreshold" DECIMAL(65,30),
    "status" TEXT NOT NULL DEFAULT 'active',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRecord" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "beauticianId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "orderItemId" INTEGER,
    "ruleId" INTEGER,
    "type" TEXT NOT NULL,
    "sourceAmount" DECIMAL(65,30) NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "settleMonth" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionSettlement" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "beauticianId" INTEGER NOT NULL,
    "settleMonth" TEXT NOT NULL,
    "projectAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "productAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cardSaleAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "rechargeAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "otherAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "confirmedBy" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionRule_storeId_type_status_idx" ON "CommissionRule"("storeId", "type", "status");

-- CreateIndex
CREATE INDEX "CommissionRule_levelId_idx" ON "CommissionRule"("levelId");

-- CreateIndex
CREATE INDEX "CommissionRecord_beauticianId_settleMonth_idx" ON "CommissionRecord"("beauticianId", "settleMonth");

-- CreateIndex
CREATE INDEX "CommissionRecord_storeId_status_idx" ON "CommissionRecord"("storeId", "status");

-- CreateIndex
CREATE INDEX "CommissionRecord_orderId_idx" ON "CommissionRecord"("orderId");

-- CreateIndex
CREATE INDEX "CommissionRecord_orderItemId_idx" ON "CommissionRecord"("orderItemId");

-- CreateIndex
CREATE INDEX "CommissionRecord_ruleId_idx" ON "CommissionRecord"("ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionSettlement_storeId_beauticianId_settleMonth_key" ON "CommissionSettlement"("storeId", "beauticianId", "settleMonth");

-- CreateIndex
CREATE INDEX "CommissionSettlement_storeId_settleMonth_idx" ON "CommissionSettlement"("storeId", "settleMonth");

-- CreateIndex
CREATE INDEX "CommissionSettlement_beauticianId_idx" ON "CommissionSettlement"("beauticianId");

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "BeauticianLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "CommissionRecord_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "CommissionRecord_beauticianId_fkey" FOREIGN KEY ("beauticianId") REFERENCES "Beautician"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "CommissionRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "CommissionRecord_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "CommissionRecord_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "CommissionRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionSettlement" ADD CONSTRAINT "CommissionSettlement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionSettlement" ADD CONSTRAINT "CommissionSettlement_beauticianId_fkey" FOREIGN KEY ("beauticianId") REFERENCES "Beautician"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
