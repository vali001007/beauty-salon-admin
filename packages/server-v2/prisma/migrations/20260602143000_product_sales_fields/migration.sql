ALTER TABLE "Product"
  ADD COLUMN "salePrice" DECIMAL(65,30),
  ADD COLUMN "discountRate" DECIMAL(65,30),
  ADD COLUMN "discountLabel" TEXT,
  ADD COLUMN "salesDescription" TEXT,
  ADD COLUMN "miniappStatus" TEXT NOT NULL DEFAULT 'unpublished',
  ADD COLUMN "miniappPublishedAt" TIMESTAMP(3);

CREATE INDEX "Product_miniappStatus_idx" ON "Product"("miniappStatus");
