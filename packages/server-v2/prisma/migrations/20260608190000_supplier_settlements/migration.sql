CREATE TABLE IF NOT EXISTS "SupplierSettlement" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "settleMonth" TEXT NOT NULL,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "rebateAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "platformFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "confirmedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierSettlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupplierSettlement_supplierId_settleMonth_key" ON "SupplierSettlement"("supplierId", "settleMonth");
CREATE INDEX IF NOT EXISTS "SupplierSettlement_supplierId_idx" ON "SupplierSettlement"("supplierId");
CREATE INDEX IF NOT EXISTS "SupplierSettlement_settleMonth_idx" ON "SupplierSettlement"("settleMonth");
CREATE INDEX IF NOT EXISTS "SupplierSettlement_status_idx" ON "SupplierSettlement"("status");

ALTER TABLE "SupplierSettlement"
ADD CONSTRAINT "SupplierSettlement_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
