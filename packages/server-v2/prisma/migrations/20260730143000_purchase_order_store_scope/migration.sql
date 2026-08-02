ALTER TABLE "PurchaseOrder"
  ADD COLUMN "storeId" INTEGER;

UPDATE "PurchaseOrder"
SET "storeId" = ("items" ->> 'storeId')::INTEGER
WHERE jsonb_typeof("items") = 'object'
  AND ("items" ->> 'storeId') ~ '^[1-9][0-9]*$';

WITH legacy_items AS (
  SELECT DISTINCT
    purchase_order."id" AS purchase_order_id,
    item.value ->> 'sku' AS sku
  FROM "PurchaseOrder" purchase_order
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(purchase_order."items") = 'array' THEN purchase_order."items"
      WHEN jsonb_typeof(purchase_order."items") = 'object'
        AND jsonb_typeof(purchase_order."items" -> 'items') = 'array'
        THEN purchase_order."items" -> 'items'
      ELSE '[]'::jsonb
    END
  ) item(value)
  WHERE purchase_order."storeId" IS NULL
    AND COALESCE(item.value ->> 'sku', '') <> ''
),
legacy_totals AS (
  SELECT purchase_order_id, COUNT(DISTINCT sku) AS sku_count
  FROM legacy_items
  GROUP BY purchase_order_id
),
store_matches AS (
  SELECT
    legacy_items.purchase_order_id,
    product."storeId" AS store_id,
    COUNT(DISTINCT legacy_items.sku) AS matched_sku_count
  FROM legacy_items
  JOIN "Product" product
    ON product."sku" = legacy_items.sku
   AND product."deletedAt" IS NULL
  GROUP BY legacy_items.purchase_order_id, product."storeId"
),
resolved_store AS (
  SELECT store_matches.purchase_order_id, MIN(store_matches.store_id) AS store_id
  FROM store_matches
  JOIN legacy_totals USING (purchase_order_id)
  WHERE store_matches.matched_sku_count = legacy_totals.sku_count
  GROUP BY store_matches.purchase_order_id
  HAVING COUNT(*) = 1
)
UPDATE "PurchaseOrder" purchase_order
SET "storeId" = resolved_store.store_id
FROM resolved_store
WHERE purchase_order."id" = resolved_store.purchase_order_id
  AND purchase_order."storeId" IS NULL;

WITH historical_store AS (
  SELECT
    purchase_order."id" AS purchase_order_id,
    MIN(store_record."id") AS store_id
  FROM "PurchaseOrder" purchase_order
  JOIN "Store" store_record
    ON store_record."createdAt" <= purchase_order."createdAt"
   AND (store_record."deletedAt" IS NULL OR store_record."deletedAt" > purchase_order."createdAt")
  WHERE purchase_order."storeId" IS NULL
  GROUP BY purchase_order."id"
  HAVING COUNT(*) = 1
)
UPDATE "PurchaseOrder" purchase_order
SET "storeId" = historical_store.store_id
FROM historical_store
WHERE purchase_order."id" = historical_store.purchase_order_id
  AND purchase_order."storeId" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PurchaseOrder" WHERE "storeId" IS NULL) THEN
    RAISE EXCEPTION 'purchase_order_store_scope_backfill_incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "PurchaseOrder" purchase_order
    LEFT JOIN "Store" store_record ON store_record."id" = purchase_order."storeId"
    WHERE store_record."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'purchase_order_store_scope_store_missing';
  END IF;
END $$;

ALTER TABLE "PurchaseOrder"
  ALTER COLUMN "storeId" SET NOT NULL,
  ADD CONSTRAINT "PurchaseOrder_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "PurchaseOrder_storeId_createdAt_idx"
  ON "PurchaseOrder"("storeId", "createdAt");

CREATE INDEX "PurchaseOrder_storeId_status_idx"
  ON "PurchaseOrder"("storeId", "status");
