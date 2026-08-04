CREATE VIEW ask_data_inventory_turnover_view AS
WITH movement_metrics AS (
  SELECT
    movement."storeId" AS store_id,
    movement."productId" AS product_id,
    COALESCE(SUM(ABS(movement."quantity")) FILTER (
      WHERE movement."quantity" < 0
        AND movement."occurredAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    ), 0)::numeric AS outbound_quantity_30d,
    COALESCE(SUM(ABS(movement."quantity")) FILTER (
      WHERE movement."quantity" < 0
        AND movement."occurredAt" >= CURRENT_TIMESTAMP - INTERVAL '60 days'
        AND movement."occurredAt" < CURRENT_TIMESTAMP - INTERVAL '30 days'
    ), 0)::numeric AS outbound_quantity_previous_30d,
    COALESCE(SUM(ABS(movement."quantity")) FILTER (
      WHERE movement."quantity" < 0
        AND movement."occurredAt" >= CURRENT_TIMESTAMP - INTERVAL '90 days'
    ), 0)::numeric AS outbound_quantity_90d,
    COALESCE(SUM(ABS(movement."quantity")) FILTER (
      WHERE movement."quantity" < 0
        AND movement."occurredAt" >= DATE_TRUNC('month', CURRENT_TIMESTAMP)
    ), 0)::numeric AS outbound_quantity_current_month,
    COALESCE(SUM(ABS(movement."quantity")) FILTER (
      WHERE movement."quantity" < 0
        AND movement."occurredAt" >= DATE_TRUNC('quarter', CURRENT_TIMESTAMP)
    ), 0)::numeric AS outbound_quantity_current_quarter,
    AVG((movement."beforeStock" + movement."afterStock") / 2) FILTER (
      WHERE movement."occurredAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'
        AND movement."beforeStock" IS NOT NULL
        AND movement."afterStock" IS NOT NULL
    )::numeric AS event_weighted_avg_stock_30d,
    COALESCE(SUM(ABS(movement."quantity") * product."costPrice") FILTER (
      WHERE movement."quantity" < 0
        AND movement."occurredAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    ), 0)::numeric AS estimated_outbound_cost_30d,
    COALESCE(SUM(ABS(movement."quantity") * product."costPrice") FILTER (
      WHERE movement."quantity" < 0
        AND movement."occurredAt" >= DATE_TRUNC('month', CURRENT_TIMESTAMP)
    ), 0)::numeric AS estimated_outbound_cost_current_month,
    MAX(movement."occurredAt") FILTER (WHERE movement."quantity" < 0) AS last_outbound_at,
    MAX(movement."occurredAt") FILTER (WHERE movement."quantity" > 0) AS last_inbound_at
  FROM "StockMovement" movement
  JOIN "Product" product ON product."id" = movement."productId"
  GROUP BY movement."storeId", movement."productId"
),
batch_metrics AS (
  SELECT
    batch."productId" AS product_id,
    COUNT(*) FILTER (WHERE batch."stock" > 0)::integer AS positive_batch_count,
    MIN(batch."expiryDate") FILTER (WHERE batch."stock" > 0) AS nearest_expiry_date,
    MIN(batch."createdAt") FILTER (WHERE batch."stock" > 0) AS oldest_positive_batch_created_at
  FROM "StockBatch" batch
  GROUP BY batch."productId"
),
procurement_metrics AS (
  SELECT
    procurement."storeId" AS store_id,
    item."productId" AS product_id,
    COUNT(DISTINCT procurement."id") FILTER (
      WHERE procurement."status" IN ('pending_supplier_confirm', 'accepted', 'shipped', 'partial_received')
    )::integer AS open_procurement_order_count,
    COALESCE(SUM(GREATEST(item."quantity" - item."receivedQty", 0)) FILTER (
      WHERE procurement."status" IN ('pending_supplier_confirm', 'accepted', 'shipped', 'partial_received')
    ), 0)::numeric AS open_procurement_quantity,
    MIN(procurement."expectedArrivalDate") FILTER (
      WHERE procurement."status" IN ('pending_supplier_confirm', 'accepted', 'shipped', 'partial_received')
    ) AS expected_arrival_date,
    COUNT(DISTINCT procurement."id") FILTER (
      WHERE procurement."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '90 days'
        AND procurement."status" NOT IN ('cancelled', 'rejected')
    )::integer AS procurement_order_count_90d,
    COALESCE(SUM(item."quantity") FILTER (
      WHERE procurement."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '90 days'
        AND procurement."status" NOT IN ('cancelled', 'rejected')
    ), 0)::numeric AS procurement_ordered_quantity_90d,
    MAX(procurement."createdAt") FILTER (
      WHERE procurement."status" NOT IN ('cancelled', 'rejected')
    ) AS last_procurement_at
  FROM "ProcurementOrder" procurement
  JOIN "ProcurementOrderItem" item ON item."orderId" = procurement."id"
  WHERE item."productId" IS NOT NULL
  GROUP BY procurement."storeId", item."productId"
),
calculated AS (
  SELECT
    product."storeId" AS store_id,
    store."name" AS store_name,
    product."id" AS product_id,
    product."name" AS product_name,
    product."sku" AS sku,
    category."name" AS category_name,
    product."unit" AS unit,
    product."status" AS product_status,
    product."currentStock"::numeric AS current_stock,
    product."safetyStock"::numeric AS safety_stock,
    product."costPrice"::numeric AS catalog_cost_price,
    (product."currentStock" * product."costPrice")::numeric AS current_stock_value,
    COALESCE(movement.outbound_quantity_30d, 0)::numeric AS outbound_quantity_30d,
    COALESCE(movement.outbound_quantity_previous_30d, 0)::numeric AS outbound_quantity_previous_30d,
    COALESCE(movement.outbound_quantity_90d, 0)::numeric AS outbound_quantity_90d,
    COALESCE(movement.outbound_quantity_current_month, 0)::numeric AS outbound_quantity_current_month,
    COALESCE(movement.outbound_quantity_current_quarter, 0)::numeric AS outbound_quantity_current_quarter,
    (COALESCE(movement.outbound_quantity_30d, 0) / 30)::numeric AS avg_daily_outbound_30d,
    (COALESCE(movement.outbound_quantity_90d, 0) / 90)::numeric AS avg_daily_outbound_90d,
    movement.event_weighted_avg_stock_30d,
    COALESCE(movement.estimated_outbound_cost_30d, 0)::numeric AS estimated_outbound_cost_30d,
    (COALESCE(movement.estimated_outbound_cost_30d, 0) / 30)::numeric AS estimated_avg_daily_outbound_cost_30d,
    COALESCE(movement.estimated_outbound_cost_current_month, 0)::numeric AS estimated_outbound_cost_current_month,
    (
      COALESCE(movement.estimated_outbound_cost_current_month, 0)
      / GREATEST(EXTRACT(DAY FROM CURRENT_TIMESTAMP)::numeric, 1)
    )::numeric AS estimated_avg_daily_outbound_cost_current_month,
    movement.last_outbound_at,
    movement.last_inbound_at,
    COALESCE(batch.positive_batch_count, 0)::integer AS positive_batch_count,
    batch.nearest_expiry_date,
    batch.oldest_positive_batch_created_at,
    COALESCE(procurement.open_procurement_order_count, 0)::integer AS open_procurement_order_count,
    COALESCE(procurement.open_procurement_quantity, 0)::numeric AS open_procurement_quantity,
    procurement.expected_arrival_date,
    COALESCE(procurement.procurement_order_count_90d, 0)::integer AS procurement_order_count_90d,
    COALESCE(procurement.procurement_ordered_quantity_90d, 0)::numeric AS procurement_ordered_quantity_90d,
    procurement.last_procurement_at
  FROM "Product" product
  JOIN "Store" store ON store."id" = product."storeId"
  LEFT JOIN "Category" category ON category."id" = product."categoryId"
  LEFT JOIN movement_metrics movement
    ON movement.store_id = product."storeId"
   AND movement.product_id = product."id"
  LEFT JOIN batch_metrics batch ON batch.product_id = product."id"
  LEFT JOIN procurement_metrics procurement
    ON procurement.store_id = product."storeId"
   AND procurement.product_id = product."id"
  WHERE product."deletedAt" IS NULL
)
SELECT
  calculated.*,
  CASE
    WHEN calculated.avg_daily_outbound_30d = 0 THEN NULL
    ELSE ROUND(calculated.current_stock / calculated.avg_daily_outbound_30d, 4)
  END::numeric AS days_of_stock_30d,
  CASE
    WHEN calculated.event_weighted_avg_stock_30d IS NULL
      OR calculated.event_weighted_avg_stock_30d = 0 THEN NULL
    ELSE ROUND(calculated.outbound_quantity_30d / calculated.event_weighted_avg_stock_30d, 4)
  END::numeric AS operational_turnover_ratio_30d,
  CASE
    WHEN calculated.outbound_quantity_previous_30d = 0 THEN NULL
    ELSE ROUND(
      (calculated.outbound_quantity_30d - calculated.outbound_quantity_previous_30d)
      / calculated.outbound_quantity_previous_30d,
      4
    )
  END::numeric AS demand_change_rate_30d,
  CASE
    WHEN calculated.current_stock > 0 AND calculated.outbound_quantity_90d = 0 THEN 'no_outbound_90d'
    WHEN calculated.current_stock > 0
      AND calculated.event_weighted_avg_stock_30d > 0
      AND calculated.outbound_quantity_30d / calculated.event_weighted_avg_stock_30d < 0.5 THEN 'low_turnover'
    ELSE 'moving'
  END::text AS slow_moving_status,
  CASE
    WHEN calculated.current_stock <= calculated.safety_stock
      AND calculated.open_procurement_quantity = 0 THEN 'below_safety_no_open_procurement'
    WHEN calculated.current_stock <= calculated.safety_stock
      AND calculated.open_procurement_quantity > 0 THEN 'below_safety_with_open_procurement'
    ELSE 'covered'
  END::text AS replenishment_fact_status,
  0.5::numeric AS slow_moving_turnover_threshold_30d,
  'operational_event_weighted_not_financial_turnover'::text AS turnover_policy,
  'catalog_cost_estimated_not_batch_actual'::text AS cost_policy,
  CURRENT_TIMESTAMP AS data_as_of
FROM calculated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ask_data_free_sql_readonly') THEN
    GRANT SELECT ON ask_data_inventory_turnover_view TO ask_data_free_sql_readonly;
  END IF;
END
$$;
