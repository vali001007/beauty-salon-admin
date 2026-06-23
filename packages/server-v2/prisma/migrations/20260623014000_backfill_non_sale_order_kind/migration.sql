UPDATE "ProductOrder" po
SET
  "orderKind" = CASE
    WHEN EXISTS (
      SELECT 1 FROM "OrderItem" oi
      WHERE oi."orderId" = po.id AND oi."itemType" = 'recharge'
    ) THEN 'recharge'
    WHEN EXISTS (
      SELECT 1 FROM "OrderItem" oi
      WHERE oi."orderId" = po.id AND oi."itemType" = 'open'
    ) THEN 'member_card_open'
    WHEN EXISTS (
      SELECT 1 FROM "OrderItem" oi
      WHERE oi."orderId" = po.id AND oi."itemType" = 'card'
    ) THEN 'card'
    ELSE po."orderKind"
  END,
  "updatedAt" = NOW()
WHERE EXISTS (
  SELECT 1
  FROM "OrderItem" oi
  WHERE oi."orderId" = po.id
    AND oi."itemType" IN ('card', 'recharge', 'open')
)
AND NOT EXISTS (
  SELECT 1
  FROM "OrderItem" oi
  WHERE oi."orderId" = po.id
    AND oi."itemType" IN ('product', 'goods', 'project')
);
