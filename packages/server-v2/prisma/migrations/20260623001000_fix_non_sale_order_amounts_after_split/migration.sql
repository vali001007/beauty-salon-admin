UPDATE "ProductOrder" po
SET
  "netAmount" = po."totalAmount",
  "listAmount" = CASE WHEN po."listAmount" = 0 THEN po."totalAmount" ELSE po."listAmount" END
WHERE po."orderKind" = 'product'
  AND NOT EXISTS (
    SELECT 1 FROM "OrderItem" oi
    WHERE oi."orderId" = po."id"
      AND oi."itemType" IN ('product', 'goods', 'project')
  )
  AND po."totalAmount" > 0
  AND po."netAmount" = 0;

UPDATE "PaymentRecord" pr
SET "amount" = po."totalAmount"
FROM "ProductOrder" po
WHERE pr."orderId" = po."id"
  AND po."orderKind" = 'product'
  AND NOT EXISTS (
    SELECT 1 FROM "OrderItem" oi
    WHERE oi."orderId" = po."id"
      AND oi."itemType" IN ('product', 'goods', 'project')
  )
  AND po."totalAmount" > 0;
