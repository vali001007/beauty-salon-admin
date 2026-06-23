ALTER TABLE "ProductOrder"
  ADD COLUMN "listAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "itemDiscountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "orderDiscountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "totalDiscountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "netAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "discountSource" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "allocationMethod" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "promotionId" INTEGER,
  ADD COLUMN "couponId" INTEGER,
  ADD COLUMN "packageId" INTEGER,
  ADD COLUMN "discountPayload" JSONB;

ALTER TABLE "OrderItem"
  ADD COLUMN "listAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "itemDiscountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "orderAllocatedDiscountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "totalDiscountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "netAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "discountSource" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "allocationMethod" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "discountPayload" JSONB,
  ADD COLUMN "isGift" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "eligibleForOrderDiscount" BOOLEAN NOT NULL DEFAULT true;

UPDATE "OrderItem"
SET
  "listAmount" = "subtotal",
  "netAmount" = "subtotal",
  "itemDiscountAmount" = "discount",
  "totalDiscountAmount" = "discount",
  "discountSource" = CASE WHEN "discount" > 0 THEN 'item' ELSE 'none' END,
  "allocationMethod" = CASE WHEN "discount" > 0 THEN 'direct' ELSE 'none' END;

UPDATE "ProductOrder" po
SET
  "netAmount" = po."totalAmount",
  "listAmount" = COALESCE(items."listAmount", po."totalAmount"),
  "itemDiscountAmount" = COALESCE(items."itemDiscountAmount", 0),
  "totalDiscountAmount" = COALESCE(items."itemDiscountAmount", 0),
  "discountSource" = CASE WHEN COALESCE(items."itemDiscountAmount", 0) > 0 THEN 'item' ELSE 'none' END,
  "allocationMethod" = CASE WHEN COALESCE(items."itemDiscountAmount", 0) > 0 THEN 'direct' ELSE 'none' END
FROM (
  SELECT
    "orderId",
    SUM("listAmount") AS "listAmount",
    SUM("itemDiscountAmount") AS "itemDiscountAmount"
  FROM "OrderItem"
  GROUP BY "orderId"
) items
WHERE po."id" = items."orderId";
