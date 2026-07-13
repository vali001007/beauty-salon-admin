ALTER TABLE "StockBatch"
  ADD COLUMN "unitCost" DECIMAL(65,30),
  ADD COLUMN "totalAmount" DECIMAL(65,30),
  ADD COLUMN "supplierName" TEXT;

ALTER TABLE "StockMovement"
  ADD COLUMN "unitCost" DECIMAL(65,30),
  ADD COLUMN "costAmount" DECIMAL(65,30),
  ADD COLUMN "costSource" TEXT;
