WITH non_sale_order_amounts AS (
  SELECT
    po.id,
    COALESCE(SUM(oi."listAmount"), 0) AS list_amount,
    COALESCE(SUM(oi."itemDiscountAmount"), 0) AS item_discount_amount,
    COALESCE(SUM(oi."orderAllocatedDiscountAmount"), 0) AS order_discount_amount,
    COALESCE(SUM(oi."totalDiscountAmount"), 0) AS total_discount_amount,
    COALESCE(SUM(oi."netAmount"), 0) AS net_amount
  FROM "ProductOrder" po
  JOIN "OrderItem" oi ON oi."orderId" = po.id
  WHERE EXISTS (
    SELECT 1
    FROM "OrderItem" oi2
    WHERE oi2."orderId" = po.id
      AND oi2."itemType" IN ('card', 'recharge', 'open')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "OrderItem" oi3
    WHERE oi3."orderId" = po.id
      AND oi3."itemType" IN ('product', 'goods', 'project')
  )
  GROUP BY po.id
)
UPDATE "ProductOrder" po
SET
  "listAmount" = noa.list_amount,
  "itemDiscountAmount" = noa.item_discount_amount,
  "orderDiscountAmount" = noa.order_discount_amount,
  "totalDiscountAmount" = noa.total_discount_amount,
  "netAmount" = noa.net_amount,
  "totalAmount" = noa.net_amount,
  "updatedAt" = NOW()
FROM non_sale_order_amounts noa
WHERE po.id = noa.id;
