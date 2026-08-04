CREATE VIEW ask_data_supplier_quote_terms_view AS
WITH approved_mapped_quotes AS (
  SELECT
    mapping."storeId" AS store_id,
    store."name" AS store_name,
    product."id" AS product_id,
    product."name" AS product_name,
    product."sku" AS product_sku,
    category."name" AS category_name,
    product."unit" AS product_unit,
    supply_sku."id" AS supply_sku_id,
    supply_sku."name" AS supply_sku_name,
    supply_sku."brand",
    supply_sku."spec",
    supply_sku."unit" AS supply_unit,
    supplier."id" AS supplier_id,
    supplier."name" AS supplier_name,
    supplier."settlementMode" AS settlement_mode,
    supplier."paymentTerms" AS payment_terms,
    quote."id" AS quote_id,
    quote."price" AS quote_price,
    quote."taxIncluded" AS tax_included,
    quote."moq" AS minimum_order_quantity,
    quote."leadDays" AS lead_days,
    quote."stockStatus" AS stock_status,
    quote."availableStock" AS available_stock,
    quote."validFrom" AS valid_from,
    quote."validTo" AS valid_to,
    quote."createdAt" AS quote_created_at,
    quote."updatedAt" AS quote_updated_at,
    mapping."isPreferred" AS is_preferred_supplier,
    (
      (quote."validFrom" IS NULL OR quote."validFrom" <= CURRENT_TIMESTAMP)
      AND (quote."validTo" IS NULL OR quote."validTo" > CURRENT_TIMESTAMP)
    ) AS is_current_valid
  FROM "SupplyCatalogMapping" mapping
  JOIN "Store" store
    ON store."id" = mapping."storeId"
  JOIN "Product" product
    ON product."id" = mapping."productId"
   AND product."storeId" = mapping."storeId"
   AND product."deletedAt" IS NULL
  LEFT JOIN "Category" category
    ON category."id" = product."categoryId"
  JOIN "SupplySku" supply_sku
    ON supply_sku."id" = mapping."supplySkuId"
   AND supply_sku."deletedAt" IS NULL
  JOIN "SupplyQuote" quote
    ON quote."supplySkuId" = supply_sku."id"
   AND quote."status" = 'active'
   AND quote."auditStatus" = 'approved'
   AND quote."deletedAt" IS NULL
  JOIN "SupplySupplier" supplier
    ON supplier."id" = quote."supplierId"
   AND supplier."id" = supply_sku."supplierId"
   AND supplier."deletedAt" IS NULL
  WHERE mapping."storeId" IS NOT NULL
    AND mapping."productId" IS NOT NULL
    AND mapping."mappingStatus" = 'active'
), product_quote_stats AS (
  SELECT
    store_id,
    product_id,
    COUNT(DISTINCT supplier_id) FILTER (WHERE is_current_valid)::integer AS current_supplier_count,
    MIN(quote_price) FILTER (WHERE is_current_valid)::numeric AS lowest_current_quote_price
  FROM approved_mapped_quotes
  GROUP BY store_id, product_id
), ranked AS (
  SELECT
    quote.*,
    CASE
      WHEN quote.is_current_valid THEN
        DENSE_RANK() OVER (
          PARTITION BY quote.store_id, quote.product_id, quote.is_current_valid
          ORDER BY quote.quote_price ASC, quote.supplier_id ASC
        )::integer
      ELSE NULL
    END AS current_price_rank
  FROM approved_mapped_quotes quote
)
SELECT
  ranked.store_id,
  ranked.store_name,
  ranked.product_id,
  ranked.product_name,
  ranked.product_sku,
  ranked.category_name,
  ranked.product_unit,
  ranked.supply_sku_id,
  ranked.supply_sku_name,
  ranked.brand,
  ranked.spec,
  ranked.supply_unit,
  ranked.supplier_id,
  ranked.supplier_name,
  ranked.settlement_mode,
  ranked.payment_terms,
  ranked.quote_id,
  ranked.quote_price,
  ranked.tax_included,
  ranked.minimum_order_quantity,
  ranked.lead_days,
  ranked.stock_status,
  ranked.available_stock,
  ranked.valid_from,
  ranked.valid_to,
  ranked.quote_created_at,
  ranked.quote_updated_at,
  ranked.is_preferred_supplier,
  ranked.is_current_valid,
  GREATEST(COALESCE(stats.current_supplier_count, 0) - 1, 0)::integer AS alternative_supplier_count,
  stats.lowest_current_quote_price,
  CASE
    WHEN ranked.is_current_valid AND stats.lowest_current_quote_price IS NOT NULL
      THEN ranked.quote_price - stats.lowest_current_quote_price
    ELSE NULL
  END::numeric AS price_difference_from_lowest,
  CASE
    WHEN ranked.is_current_valid
      AND stats.lowest_current_quote_price IS NOT NULL
      AND stats.lowest_current_quote_price > 0
      THEN (ranked.quote_price - stats.lowest_current_quote_price) / stats.lowest_current_quote_price
    ELSE NULL
  END::numeric AS price_premium_rate,
  ranked.current_price_rank,
  CURRENT_TIMESTAMP AS data_as_of
FROM ranked
JOIN product_quote_stats stats
  ON stats.store_id = ranked.store_id
 AND stats.product_id = ranked.product_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ask_data_free_sql_readonly') THEN
    GRANT SELECT ON ask_data_supplier_quote_terms_view TO ask_data_free_sql_readonly;
  END IF;
END
$$;
