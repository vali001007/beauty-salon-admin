ALTER TABLE "ProductOrder"
  ADD COLUMN IF NOT EXISTS "checkoutGroupNo" TEXT,
  ADD COLUMN IF NOT EXISTS "orderKind" TEXT NOT NULL DEFAULT 'product';

CREATE INDEX IF NOT EXISTS "ProductOrder_checkoutGroupNo_idx" ON "ProductOrder"("checkoutGroupNo");
CREATE INDEX IF NOT EXISTS "ProductOrder_orderKind_idx" ON "ProductOrder"("orderKind");

UPDATE "ProductOrder"
SET
  "checkoutGroupNo" = COALESCE("checkoutGroupNo", "orderNo"),
  "orderKind" = CASE
    WHEN EXISTS (SELECT 1 FROM "OrderItem" oi WHERE oi."orderId" = "ProductOrder"."id" AND oi."itemType" = 'project')
      AND NOT EXISTS (SELECT 1 FROM "OrderItem" oi WHERE oi."orderId" = "ProductOrder"."id" AND oi."itemType" IN ('product', 'goods'))
      THEN 'project'
    WHEN EXISTS (SELECT 1 FROM "OrderItem" oi WHERE oi."orderId" = "ProductOrder"."id" AND oi."itemType" = 'project')
      AND EXISTS (SELECT 1 FROM "OrderItem" oi WHERE oi."orderId" = "ProductOrder"."id" AND oi."itemType" IN ('product', 'goods'))
      THEN 'mixed'
    ELSE 'product'
  END
WHERE "checkoutGroupNo" IS NULL OR "orderKind" = 'product';

WITH mixed_orders AS (
  SELECT po.*
  FROM "ProductOrder" po
  WHERE EXISTS (SELECT 1 FROM "OrderItem" oi WHERE oi."orderId" = po."id" AND oi."itemType" = 'project')
    AND EXISTS (SELECT 1 FROM "OrderItem" oi WHERE oi."orderId" = po."id" AND oi."itemType" IN ('product', 'goods'))
    AND NOT EXISTS (
      SELECT 1
      FROM "ProductOrder" split
      WHERE split."checkoutGroupNo" = COALESCE(po."checkoutGroupNo", po."orderNo")
        AND split."orderKind" = 'project'
    )
),
project_summary AS (
  SELECT
    oi."orderId",
    COALESCE(SUM(oi."listAmount"), 0) AS "listAmount",
    COALESCE(SUM(oi."itemDiscountAmount"), 0) AS "itemDiscountAmount",
    COALESCE(SUM(oi."orderAllocatedDiscountAmount"), 0) AS "orderDiscountAmount",
    COALESCE(SUM(oi."totalDiscountAmount"), 0) AS "totalDiscountAmount",
    COALESCE(SUM(oi."netAmount"), 0) AS "netAmount",
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'itemType', oi."itemType",
        'itemId', oi."itemId",
        'name', oi."name",
        'quantity', oi."quantity",
        'unitPrice', oi."unitPrice",
        'subtotal', oi."subtotal",
        'discount', oi."discount",
        'listAmount', oi."listAmount",
        'itemDiscountAmount', oi."itemDiscountAmount",
        'orderAllocatedDiscountAmount', oi."orderAllocatedDiscountAmount",
        'totalDiscountAmount', oi."totalDiscountAmount",
        'netAmount', oi."netAmount",
        'discountSource', oi."discountSource",
        'allocationMethod', oi."allocationMethod",
        'isGift', oi."isGift",
        'beauticianId', oi."beauticianId"
      )
    ), '[]'::jsonb) AS "items"
  FROM "OrderItem" oi
  WHERE oi."itemType" = 'project'
  GROUP BY oi."orderId"
),
inserted_project_orders AS (
  INSERT INTO "ProductOrder" (
    "orderNo",
    "checkoutGroupNo",
    "orderKind",
    "customerId",
    "customerName",
    "storeId",
    "totalAmount",
    "listAmount",
    "itemDiscountAmount",
    "orderDiscountAmount",
    "totalDiscountAmount",
    "netAmount",
    "discountSource",
    "allocationMethod",
    "promotionId",
    "couponId",
    "packageId",
    "discountPayload",
    "status",
    "payMethod",
    "source",
    "items",
    "remark",
    "createdAt",
    "updatedAt"
  )
  SELECT
    mo."orderNo" || '-S',
    COALESCE(mo."checkoutGroupNo", mo."orderNo"),
    'project',
    mo."customerId",
    mo."customerName",
    mo."storeId",
    ps."netAmount",
    ps."listAmount",
    ps."itemDiscountAmount",
    ps."orderDiscountAmount",
    ps."totalDiscountAmount",
    ps."netAmount",
    mo."discountSource",
    mo."allocationMethod",
    mo."promotionId",
    mo."couponId",
    mo."packageId",
    mo."discountPayload",
    mo."status",
    mo."payMethod",
    mo."source",
    ps."items",
    mo."remark",
    mo."createdAt",
    mo."updatedAt"
  FROM mixed_orders mo
  JOIN project_summary ps ON ps."orderId" = mo."id"
  RETURNING "id", "checkoutGroupNo"
),
project_order_map AS (
  SELECT mo."id" AS "oldOrderId", ipo."id" AS "newOrderId"
  FROM mixed_orders mo
  JOIN inserted_project_orders ipo ON ipo."checkoutGroupNo" = COALESCE(mo."checkoutGroupNo", mo."orderNo")
),
updated_project_items AS (
  UPDATE "OrderItem" oi
  SET "orderId" = pom."newOrderId"
  FROM project_order_map pom
  WHERE oi."orderId" = pom."oldOrderId"
    AND oi."itemType" = 'project'
  RETURNING oi."id", pom."oldOrderId", pom."newOrderId"
),
updated_project_commissions AS (
  UPDATE "CommissionRecord" cr
  SET "orderId" = upi."newOrderId"
  FROM updated_project_items upi
  WHERE cr."orderItemId" = upi."id"
  RETURNING cr."id"
),
updated_unassigned_project_commissions AS (
  UPDATE "CommissionRecord" cr
  SET "orderId" = pom."newOrderId"
  FROM project_order_map pom
  WHERE cr."orderId" = pom."oldOrderId"
    AND cr."orderItemId" IS NULL
    AND cr."type" = 'project'
  RETURNING cr."id"
),
updated_project_movements AS (
  UPDATE "StockMovement" sm
  SET "sourceId" = pom."newOrderId", "sourceNo" = po."orderNo"
  FROM project_order_map pom
  JOIN "ProductOrder" po ON po."id" = pom."newOrderId"
  WHERE sm."sourceType" = 'project_order'
    AND sm."sourceId" = pom."oldOrderId"
  RETURNING sm."id"
),
project_payment_source AS (
  SELECT
    pr.*,
    pom."newOrderId",
    ps."netAmount" AS "projectAmount",
    ROW_NUMBER() OVER (PARTITION BY pr."orderId" ORDER BY pr."createdAt", pr."id") AS rn
  FROM "PaymentRecord" pr
  JOIN project_order_map pom ON pom."oldOrderId" = pr."orderId"
  JOIN project_summary ps ON ps."orderId" = pom."oldOrderId"
  WHERE pr."status" = 'success'
),
inserted_project_payments AS (
  INSERT INTO "PaymentRecord" (
    "orderId",
    "paymentNo",
    "method",
    "amount",
    "status",
    "transactionNo",
    "paidAt",
    "createdAt"
  )
  SELECT
    pps."newOrderId",
    pps."paymentNo" || '-S',
    pps."method",
    pps."projectAmount",
    pps."status",
    pps."transactionNo",
    pps."paidAt",
    pps."createdAt"
  FROM project_payment_source pps
  WHERE pps.rn = 1 AND pps."projectAmount" > 0
  RETURNING "id"
),
product_summary AS (
  SELECT
    oi."orderId",
    COALESCE(SUM(oi."listAmount"), 0) AS "listAmount",
    COALESCE(SUM(oi."itemDiscountAmount"), 0) AS "itemDiscountAmount",
    COALESCE(SUM(oi."orderAllocatedDiscountAmount"), 0) AS "orderDiscountAmount",
    COALESCE(SUM(oi."totalDiscountAmount"), 0) AS "totalDiscountAmount",
    COALESCE(SUM(oi."netAmount"), 0) AS "netAmount",
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'itemType', oi."itemType",
        'itemId', oi."itemId",
        'name', oi."name",
        'quantity', oi."quantity",
        'unitPrice', oi."unitPrice",
        'subtotal', oi."subtotal",
        'discount', oi."discount",
        'listAmount', oi."listAmount",
        'itemDiscountAmount', oi."itemDiscountAmount",
        'orderAllocatedDiscountAmount', oi."orderAllocatedDiscountAmount",
        'totalDiscountAmount', oi."totalDiscountAmount",
        'netAmount', oi."netAmount",
        'discountSource', oi."discountSource",
        'allocationMethod', oi."allocationMethod",
        'isGift', oi."isGift",
        'beauticianId', oi."beauticianId"
      )
    ), '[]'::jsonb) AS "items"
  FROM "OrderItem" oi
  WHERE oi."itemType" IN ('product', 'goods')
  GROUP BY oi."orderId"
)
UPDATE "ProductOrder" po
SET
  "checkoutGroupNo" = COALESCE(po."checkoutGroupNo", po."orderNo"),
  "orderKind" = 'product',
  "totalAmount" = ps."netAmount",
  "listAmount" = ps."listAmount",
  "itemDiscountAmount" = ps."itemDiscountAmount",
  "orderDiscountAmount" = ps."orderDiscountAmount",
  "totalDiscountAmount" = ps."totalDiscountAmount",
  "netAmount" = ps."netAmount",
  "items" = ps."items"
FROM product_summary ps
WHERE po."id" = ps."orderId"
  AND po."id" IN (SELECT "oldOrderId" FROM project_order_map);

UPDATE "PaymentRecord" pr
SET "amount" = po."netAmount"
FROM "ProductOrder" po
WHERE pr."orderId" = po."id"
  AND po."orderKind" = 'product'
  AND po."checkoutGroupNo" IS NOT NULL;
