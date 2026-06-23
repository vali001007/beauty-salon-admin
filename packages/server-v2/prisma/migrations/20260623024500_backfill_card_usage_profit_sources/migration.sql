UPDATE "CustomerCard" cc
SET
  "paidAmount" = CASE WHEN cc."paidAmount" = 0 THEN c."price" ELSE cc."paidAmount" END,
  "discountAmount" = CASE WHEN cc."discountAmount" < 0 THEN 0 ELSE cc."discountAmount" END,
  "recognizedUnitValue" = CASE
    WHEN cc."recognizedUnitValue" = 0 AND cc."totalTimes" > 0 THEN c."price" / cc."totalTimes"
    ELSE cc."recognizedUnitValue"
  END,
  "pricingSnapshot" = COALESCE(
    cc."pricingSnapshot",
    jsonb_build_object(
      'cardId', c."id",
      'cardName', c."name",
      'cardPrice', c."price",
      'paidAmount', CASE WHEN cc."paidAmount" = 0 THEN c."price" ELSE cc."paidAmount" END,
      'discountAmount', CASE WHEN cc."discountAmount" < 0 THEN 0 ELSE cc."discountAmount" END,
      'totalTimes', cc."totalTimes",
      'giftTimes', cc."giftTimes",
      'recognizedUnitValue', CASE WHEN cc."totalTimes" > 0 THEN c."price" / cc."totalTimes" ELSE 0 END,
      'projects', c."projects"
    )
  )
FROM "Card" c
WHERE cc."cardId" = c."id";

WITH matched_usage AS (
  SELECT
    cur."id" AS usage_id,
    cc."id" AS customer_card_id,
    cc."cardId" AS card_id,
    cc."sourceOrderId" AS source_order_id,
    cc."sourceOrderItemId" AS source_order_item_id,
    COALESCE(NULLIF(cc."recognizedUnitValue", 0), CASE WHEN cc."totalTimes" > 0 THEN cc."paidAmount" / cc."totalTimes" ELSE 0 END) AS recognized_unit_value,
    cc."pricingSnapshot" AS pricing_snapshot
  FROM "CardUsageRecord" cur
  JOIN LATERAL (
    SELECT cc2.*
    FROM "CustomerCard" cc2
    WHERE cc2."customerId" = cur."customerId"
      AND cc2."cardName" = cur."cardName"
      AND cur."verifiedAt" >= cc2."createdAt"
      AND cur."verifiedAt" <= cc2."expiryDate"
    ORDER BY cc2."createdAt" DESC
    LIMIT 1
  ) cc ON TRUE
)
UPDATE "CardUsageRecord" cur
SET
  "customerCardId" = COALESCE(cur."customerCardId", mu.customer_card_id),
  "cardId" = COALESCE(cur."cardId", mu.card_id),
  "recognizedUnitValue" = CASE WHEN cur."recognizedUnitValue" = 0 THEN mu.recognized_unit_value ELSE cur."recognizedUnitValue" END,
  "recognizedAmount" = CASE
    WHEN cur."recognizedAmount" = 0 THEN mu.recognized_unit_value * cur."times"
    ELSE cur."recognizedAmount"
  END,
  "sourceOrderId" = COALESCE(cur."sourceOrderId", mu.source_order_id),
  "sourceOrderItemId" = COALESCE(cur."sourceOrderItemId", mu.source_order_item_id),
  "pricingSnapshot" = COALESCE(cur."pricingSnapshot", mu.pricing_snapshot)
FROM matched_usage mu
WHERE cur."id" = mu.usage_id;

UPDATE "CardUsageRecord" cur
SET "storeId" = c."storeId"
FROM "Customer" c
WHERE cur."customerId" = c."id"
  AND cur."storeId" IS NULL;

UPDATE "CardUsageRecord" cur
SET "projectId" = p."id"
FROM "Project" p
WHERE cur."projectId" IS NULL
  AND cur."storeId" = p."storeId"
  AND cur."projectName" = p."name"
  AND p."deletedAt" IS NULL;
