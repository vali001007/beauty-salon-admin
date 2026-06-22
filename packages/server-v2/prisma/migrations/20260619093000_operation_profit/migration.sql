CREATE TABLE "OperatingCost" (
  "id" SERIAL PRIMARY KEY,
  "storeId" INTEGER NOT NULL,
  "periodMonth" TEXT NOT NULL,
  "costDate" TIMESTAMP(3) NOT NULL,
  "category" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "allocationType" TEXT NOT NULL DEFAULT 'store_month',
  "relatedCampaignId" INTEGER,
  "relatedEmployeeId" INTEGER,
  "remark" TEXT,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "OperatingCost_storeId_periodMonth_idx" ON "OperatingCost"("storeId", "periodMonth");
CREATE INDEX "OperatingCost_category_idx" ON "OperatingCost"("category");
CREATE INDEX "OperatingCost_costDate_idx" ON "OperatingCost"("costDate");
CREATE INDEX "OperatingCost_createdBy_idx" ON "OperatingCost"("createdBy");

ALTER TABLE "OperatingCost"
  ADD CONSTRAINT "OperatingCost_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OperatingCost"
  ADD CONSTRAINT "OperatingCost_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
