CREATE TABLE "brain_store_operating_target" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "revenueTarget" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "grossProfitTarget" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "appointmentTarget" INTEGER NOT NULL DEFAULT 0,
    "newCustomerTarget" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "brain_store_operating_target_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "brain_store_operating_target_storeId_periodType_periodStart_key"
ON "brain_store_operating_target"("storeId", "periodType", "periodStart");

CREATE INDEX "brain_store_operating_target_storeId_periodStart_periodEnd_idx"
ON "brain_store_operating_target"("storeId", "periodStart", "periodEnd");

CREATE INDEX "brain_store_operating_target_status_idx"
ON "brain_store_operating_target"("status");

ALTER TABLE "brain_store_operating_target"
ADD CONSTRAINT "brain_store_operating_target_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
