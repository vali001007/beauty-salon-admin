-- Ami Ask Coverage R2: governed product/project contribution-margin events.
-- This is contribution margin (recognized revenue minus attributable inventory/
-- consumable cost), not confirmed operating profit.

CREATE VIEW ask_data_item_margin_view AS
WITH product_sale_events AS (
  SELECT
    concat('order_item:', item."id") AS event_id,
    'order_sale'::text AS event_type,
    item."id" AS source_id,
    item."orderId" AS order_id,
    orders."storeId" AS store_id,
    COALESCE(item."recognizedAt", orders."createdAt") AS event_at,
    'product'::text AS item_type,
    item."itemId" AS item_id,
    item."name" AS item_name,
    item."quantity"::numeric AS quantity,
    item."listAmount"::numeric AS gross_revenue,
    item."totalDiscountAmount"::numeric AS discount_amount,
    item."netAmount"::numeric AS net_revenue,
    item."itemId" AS product_id,
    NULL::integer AS project_id,
    'order_item_net_amount'::text AS revenue_basis
  FROM "OrderItem" item
  JOIN "ProductOrder" orders ON orders."id" = item."orderId"
  WHERE item."itemType" IN ('product', 'goods')
    AND item."recognizedAt" IS NOT NULL
    AND orders."storeId" IS NOT NULL
    AND orders."status" NOT IN ('cancelled', 'canceled', 'voided')
), product_movement_cost AS (
  SELECT
    movement."orderItemId" AS source_id,
    SUM(ABS(movement."quantity"))::numeric AS movement_quantity,
    SUM(
      COALESCE(
        ABS(movement."costAmount"),
        ABS(movement."quantity") * COALESCE(movement."unitCost", batch."unitCost", product."costPrice")
      )
    )::numeric AS movement_cost,
    BOOL_AND(
      movement."costAmount" IS NOT NULL
      OR movement."unitCost" IS NOT NULL
      OR batch."unitCost" IS NOT NULL
    ) AS all_movement_cost_recorded
  FROM "StockMovement" movement
  JOIN "Product" product ON product."id" = movement."productId"
  LEFT JOIN "StockBatch" batch ON batch."id" = movement."batchId"
  WHERE movement."movementType" = 'sale_out'
    AND movement."quantity" < 0
    AND movement."orderItemId" IS NOT NULL
  GROUP BY movement."orderItemId"
), product_sale_cost AS (
  SELECT
    event.event_id,
    CASE
      WHEN COALESCE(product."costPrice", 0) <= 0
        AND COALESCE(movement.movement_quantity, 0) < event.quantity
      THEN NULL
      ELSE (
        COALESCE(movement.movement_cost, 0)
        + GREATEST(event.quantity - COALESCE(movement.movement_quantity, 0), 0) * product."costPrice"
      )::numeric
    END AS attributed_cost,
    CASE
      WHEN COALESCE(product."costPrice", 0) <= 0
        AND COALESCE(movement.movement_quantity, 0) < event.quantity
      THEN 'cost_missing'
      WHEN COALESCE(movement.movement_quantity, 0) = 0
      THEN 'catalog_cost_estimate'
      WHEN movement.movement_quantity >= event.quantity
        AND movement.all_movement_cost_recorded
      THEN 'recorded_stock_movement_cost'
      ELSE 'movement_quantity_with_catalog_cost'
    END AS cost_basis,
    CASE
      WHEN COALESCE(product."costPrice", 0) <= 0
        AND COALESCE(movement.movement_quantity, 0) < event.quantity
      THEN 'missing'
      WHEN COALESCE(movement.movement_quantity, 0) >= event.quantity
      THEN 'movement_covered'
      ELSE 'catalog_fallback'
    END AS cost_completeness,
    NOT (
      COALESCE(movement.movement_quantity, 0) >= event.quantity
      AND COALESCE(movement.all_movement_cost_recorded, false)
    ) AS is_estimated_cost
  FROM product_sale_events event
  LEFT JOIN "Product" product ON product."id" = event.product_id
  LEFT JOIN product_movement_cost movement ON movement.source_id = event.source_id
), service_events AS (
  SELECT
    concat('order_item:', item."id") AS event_id,
    'order_sale'::text AS event_type,
    'order_item'::text AS source_type,
    item."id" AS source_id,
    item."orderId" AS order_id,
    orders."storeId" AS store_id,
    COALESCE(item."recognizedAt", orders."createdAt") AS event_at,
    item."itemId" AS project_id,
    item."name" AS item_name,
    item."quantity"::numeric AS quantity,
    item."listAmount"::numeric AS gross_revenue,
    item."totalDiscountAmount"::numeric AS discount_amount,
    item."netAmount"::numeric AS net_revenue,
    'order_item_net_amount'::text AS revenue_basis
  FROM "OrderItem" item
  JOIN "ProductOrder" orders ON orders."id" = item."orderId"
  WHERE item."itemType" IN ('project', 'service')
    AND item."recognizedAt" IS NOT NULL
    AND orders."storeId" IS NOT NULL
    AND orders."status" NOT IN ('cancelled', 'canceled', 'voided')

  UNION ALL

  SELECT
    concat('card_usage:', usage."id") AS event_id,
    'card_redemption'::text AS event_type,
    'card_usage'::text AS source_type,
    usage."id" AS source_id,
    usage."sourceOrderId" AS order_id,
    usage."storeId" AS store_id,
    usage."verifiedAt" AS event_at,
    usage."projectId" AS project_id,
    usage."projectName" AS item_name,
    usage."times"::numeric AS quantity,
    usage."recognizedAmount"::numeric AS gross_revenue,
    0::numeric AS discount_amount,
    usage."recognizedAmount"::numeric AS net_revenue,
    'card_redemption_recognized_amount'::text AS revenue_basis
  FROM "CardUsageRecord" usage
  WHERE usage."storeId" IS NOT NULL
    AND usage."projectId" IS NOT NULL
), service_actual_by_product AS (
  SELECT
    event.event_id,
    movement."productId" AS product_id,
    SUM(ABS(movement."quantity"))::numeric AS actual_quantity,
    SUM(
      COALESCE(
        ABS(movement."costAmount"),
        ABS(movement."quantity") * COALESCE(movement."unitCost", batch."unitCost", product."costPrice")
      )
    )::numeric AS actual_cost,
    BOOL_AND(
      movement."costAmount" IS NOT NULL
      OR movement."unitCost" IS NOT NULL
      OR batch."unitCost" IS NOT NULL
    ) AS all_actual_cost_recorded
  FROM service_events event
  JOIN "StockMovement" movement
    ON (
      event.source_type = 'order_item'
      AND movement."orderItemId" = event.source_id
    ) OR (
      event.source_type = 'card_usage'
      AND movement."sourceType" = 'card_usage'
      AND movement."sourceId" = event.source_id
    )
  JOIN "Product" product ON product."id" = movement."productId"
  LEFT JOIN "StockBatch" batch ON batch."id" = movement."batchId"
  WHERE movement."movementType" IN ('service_consume', 'service_consumption')
    AND movement."quantity" < 0
  GROUP BY event.event_id, movement."productId"
), service_bom_by_product AS (
  SELECT
    event.event_id,
    bom."productId" AS product_id,
    (bom."standardQty" * event.quantity)::numeric AS standard_quantity,
    CASE
      WHEN product."costPrice" > 0
      THEN (bom."standardQty" * event.quantity * product."costPrice")::numeric
      ELSE NULL
    END AS standard_cost
  FROM service_events event
  JOIN "ProjectBomItem" bom ON bom."projectId" = event.project_id
  JOIN "Product" product ON product."id" = bom."productId"
), service_cost_products AS (
  SELECT event_id, product_id FROM service_actual_by_product
  UNION
  SELECT event_id, product_id FROM service_bom_by_product
), service_cost_rollup AS (
  SELECT
    universe.event_id,
    COUNT(*) FILTER (WHERE actual.product_id IS NOT NULL)::integer AS actual_product_count,
    COUNT(*) FILTER (WHERE bom.product_id IS NOT NULL)::integer AS bom_product_count,
    COUNT(*) FILTER (WHERE bom.product_id IS NOT NULL AND actual.product_id IS NULL)::integer AS estimated_bom_product_count,
    COUNT(*) FILTER (
      WHERE (actual.product_id IS NOT NULL AND actual.actual_cost IS NULL)
         OR (actual.product_id IS NULL AND bom.product_id IS NOT NULL AND bom.standard_cost IS NULL)
    )::integer AS missing_cost_product_count,
    COALESCE(SUM(actual.actual_cost), 0)::numeric
      + COALESCE(SUM(bom.standard_cost) FILTER (WHERE actual.product_id IS NULL), 0)::numeric AS attributed_cost,
    BOOL_AND(COALESCE(actual.all_actual_cost_recorded, true)) AS all_actual_cost_recorded
  FROM service_cost_products universe
  LEFT JOIN service_actual_by_product actual
    ON actual.event_id = universe.event_id
   AND actual.product_id = universe.product_id
  LEFT JOIN service_bom_by_product bom
    ON bom.event_id = universe.event_id
   AND bom.product_id = universe.product_id
  GROUP BY universe.event_id
), service_cost AS (
  SELECT
    event.event_id,
    CASE
      WHEN rollup.event_id IS NULL OR rollup.missing_cost_product_count > 0 THEN NULL
      ELSE rollup.attributed_cost
    END AS attributed_cost,
    CASE
      WHEN rollup.event_id IS NULL OR rollup.missing_cost_product_count > 0 THEN 'cost_missing'
      WHEN rollup.actual_product_count = 0 THEN 'bom_standard_estimate'
      WHEN rollup.estimated_bom_product_count > 0 THEN 'actual_consumption_plus_bom_estimate'
      WHEN rollup.all_actual_cost_recorded THEN 'recorded_consumption_cost'
      ELSE 'actual_quantity_with_catalog_cost'
    END AS cost_basis,
    CASE
      WHEN rollup.event_id IS NULL OR rollup.missing_cost_product_count > 0 THEN 'missing'
      WHEN rollup.actual_product_count = 0 THEN 'bom_estimate_only'
      WHEN rollup.estimated_bom_product_count > 0 THEN 'mixed_actual_and_standard'
      ELSE 'actual_consumption_covered'
    END AS cost_completeness,
    CASE
      WHEN rollup.event_id IS NULL OR rollup.missing_cost_product_count > 0 THEN false
      ELSE rollup.actual_product_count = 0
        OR rollup.estimated_bom_product_count > 0
        OR NOT rollup.all_actual_cost_recorded
    END AS is_estimated_cost
  FROM service_events event
  LEFT JOIN service_cost_rollup rollup ON rollup.event_id = event.event_id
), successful_refunds AS (
  SELECT
    refund."id" AS refund_id,
    refund."orderId" AS order_id,
    refund."amount"::numeric AS refund_amount,
    COALESCE(refund."refundedAt", refund."createdAt") AS refunded_at
  FROM "RefundRecord" refund
  JOIN "ProductOrder" orders ON orders."id" = refund."orderId"
  WHERE refund."status" = 'success'
    AND orders."storeId" IS NOT NULL
), direct_refund_items AS (
  SELECT
    item."refundId" AS refund_id,
    item."orderItemId" AS order_item_id,
    SUM(item."quantity")::numeric AS refund_quantity,
    SUM(item."refundAmount")::numeric AS direct_refund_amount,
    BOOL_OR(item."inventoryStatus" = 'completed' OR item."inventoryAction" = 'sale_return_in') AS inventory_returned
  FROM "RefundItem" item
  GROUP BY item."refundId", item."orderItemId"
), direct_refund_totals AS (
  SELECT refund_id, SUM(direct_refund_amount)::numeric AS direct_refund_amount
  FROM direct_refund_items
  GROUP BY refund_id
), refund_order_weights AS (
  SELECT
    refund.refund_id,
    refund.order_id,
    refund.refund_amount,
    refund.refunded_at,
    item."id" AS order_item_id,
    item."itemType" AS item_type,
    item."itemId" AS item_id,
    item."name" AS item_name,
    item."quantity"::numeric AS sold_quantity,
    item."netAmount"::numeric AS item_net_amount,
    SUM(GREATEST(item."netAmount", 0)) OVER (PARTITION BY refund.refund_id)::numeric AS order_item_net_total,
    COALESCE(direct.direct_refund_amount, 0)::numeric AS direct_refund_amount,
    COALESCE(direct.refund_quantity, 0)::numeric AS direct_refund_quantity,
    COALESCE(direct.inventory_returned, false) AS inventory_returned,
    COALESCE(totals.direct_refund_amount, 0)::numeric AS refund_direct_total
  FROM successful_refunds refund
  JOIN "OrderItem" item ON item."orderId" = refund.order_id
  LEFT JOIN direct_refund_items direct
    ON direct.refund_id = refund.refund_id
   AND direct.order_item_id = item."id"
  LEFT JOIN direct_refund_totals totals ON totals.refund_id = refund.refund_id
  WHERE item."itemType" IN ('product', 'goods', 'project', 'service')
), refund_allocations AS (
  SELECT
    weights.*,
    (
      weights.direct_refund_amount
      + GREATEST(weights.refund_amount - weights.refund_direct_total, 0)
        * CASE
            WHEN weights.order_item_net_total > 0
            THEN GREATEST(weights.item_net_amount, 0) / weights.order_item_net_total
            ELSE 0
          END
    )::numeric AS allocated_refund_amount,
    (
      weights.direct_refund_quantity
      + CASE
          WHEN weights.order_item_net_total > 0
          THEN weights.sold_quantity
            * GREATEST(weights.refund_amount - weights.refund_direct_total, 0)
            / weights.order_item_net_total
          ELSE 0
        END
    )::numeric AS allocated_refund_quantity
  FROM refund_order_weights weights
), refund_return_cost AS (
  SELECT
    movement."refundItemId" AS refund_item_id,
    movement."orderItemId" AS order_item_id,
    SUM(
      COALESCE(
        ABS(movement."costAmount"),
        ABS(movement."quantity") * COALESCE(movement."unitCost", batch."unitCost", product."costPrice")
      )
    )::numeric AS returned_cost
  FROM "StockMovement" movement
  JOIN "Product" product ON product."id" = movement."productId"
  LEFT JOIN "StockBatch" batch ON batch."id" = movement."batchId"
  WHERE movement."movementType" = 'sale_return_in'
    AND movement."refundItemId" IS NOT NULL
  GROUP BY movement."refundItemId", movement."orderItemId"
), refund_cost_by_order_item AS (
  SELECT
    refund_item."refundId" AS refund_id,
    refund_item."orderItemId" AS order_item_id,
    SUM(
      COALESCE(
        return_cost.returned_cost,
        CASE
          WHEN refund_item."inventoryStatus" = 'completed' OR refund_item."inventoryAction" = 'sale_return_in'
          THEN refund_item."quantity" * product."costPrice"
          ELSE 0
        END
      )
    )::numeric AS returned_cost,
    BOOL_OR(
      return_cost.returned_cost IS NULL
      AND (refund_item."inventoryStatus" = 'completed' OR refund_item."inventoryAction" = 'sale_return_in')
    ) AS estimated_return_cost
  FROM "RefundItem" refund_item
  JOIN "OrderItem" order_item ON order_item."id" = refund_item."orderItemId"
  LEFT JOIN "Product" product
    ON product."id" = order_item."itemId"
   AND order_item."itemType" IN ('product', 'goods')
  LEFT JOIN refund_return_cost return_cost
    ON return_cost.refund_item_id = refund_item."id"
   AND return_cost.order_item_id = refund_item."orderItemId"
  GROUP BY refund_item."refundId", refund_item."orderItemId"
), economic_events AS (
  SELECT
    event.store_id,
    event.event_id,
    event.event_type,
    event.event_at,
    event.item_type,
    event.item_id,
    event.item_name,
    event.product_id,
    event.project_id,
    event.quantity,
    event.gross_revenue,
    event.discount_amount,
    0::numeric AS refund_amount,
    event.net_revenue,
    cost.attributed_cost,
    event.revenue_basis,
    cost.cost_basis,
    'none'::text AS refund_basis,
    cost.is_estimated_cost,
    cost.cost_completeness
  FROM product_sale_events event
  JOIN product_sale_cost cost ON cost.event_id = event.event_id

  UNION ALL

  SELECT
    event.store_id,
    event.event_id,
    event.event_type,
    event.event_at,
    'project'::text AS item_type,
    event.project_id AS item_id,
    event.item_name,
    NULL::integer AS product_id,
    event.project_id,
    event.quantity,
    event.gross_revenue,
    event.discount_amount,
    0::numeric AS refund_amount,
    event.net_revenue,
    cost.attributed_cost,
    event.revenue_basis,
    cost.cost_basis,
    'none'::text AS refund_basis,
    cost.is_estimated_cost,
    cost.cost_completeness
  FROM service_events event
  JOIN service_cost cost ON cost.event_id = event.event_id

  UNION ALL

  SELECT
    orders."storeId" AS store_id,
    concat('refund:', allocation.refund_id, ':order_item:', allocation.order_item_id) AS event_id,
    'refund'::text AS event_type,
    allocation.refunded_at AS event_at,
    CASE WHEN allocation.item_type IN ('product', 'goods') THEN 'product' ELSE 'project' END AS item_type,
    allocation.item_id,
    allocation.item_name,
    CASE WHEN allocation.item_type IN ('product', 'goods') THEN allocation.item_id END AS product_id,
    CASE WHEN allocation.item_type IN ('project', 'service') THEN allocation.item_id END AS project_id,
    -allocation.allocated_refund_quantity AS quantity,
    0::numeric AS gross_revenue,
    0::numeric AS discount_amount,
    allocation.allocated_refund_amount AS refund_amount,
    -allocation.allocated_refund_amount AS net_revenue,
    CASE
      WHEN allocation.item_type IN ('product', 'goods')
      THEN -COALESCE(return_cost.returned_cost, 0)
      ELSE 0::numeric
    END AS attributed_cost,
    'successful_refund'::text AS revenue_basis,
    CASE
      WHEN allocation.item_type NOT IN ('product', 'goods') THEN 'no_cost_reversal'
      WHEN COALESCE(return_cost.returned_cost, 0) = 0 THEN 'no_inventory_return_cost_reversal'
      WHEN return_cost.estimated_return_cost THEN 'catalog_return_cost_estimate'
      ELSE 'recorded_return_cost_reversal'
    END AS cost_basis,
    CASE
      WHEN allocation.direct_refund_amount > 0
        AND allocation.refund_amount > allocation.refund_direct_total
      THEN 'itemized_plus_order_allocation'
      WHEN allocation.direct_refund_amount > 0 THEN 'refund_item'
      ELSE 'order_proportional_allocation'
    END AS refund_basis,
    COALESCE(return_cost.estimated_return_cost, false) AS is_estimated_cost,
    CASE
      WHEN allocation.item_type NOT IN ('product', 'goods') THEN 'not_applicable'
      WHEN COALESCE(return_cost.returned_cost, 0) > 0 THEN 'inventory_return_recorded'
      ELSE 'no_inventory_return_fact'
    END AS cost_completeness
  FROM refund_allocations allocation
  JOIN "ProductOrder" orders ON orders."id" = allocation.order_id
  LEFT JOIN refund_cost_by_order_item return_cost
    ON return_cost.refund_id = allocation.refund_id
   AND return_cost.order_item_id = allocation.order_item_id
  WHERE allocation.allocated_refund_amount > 0
)
SELECT
  event.store_id,
  store."name" AS store_name,
  event.event_id,
  event.event_type,
  event.event_at,
  event.item_type,
  event.item_id,
  event.item_name,
  event.product_id,
  product."name" AS product_name,
  product."sku",
  event.project_id,
  project."name" AS project_name,
  project_type."name" AS project_type,
  event.quantity,
  event.gross_revenue,
  event.discount_amount,
  event.refund_amount,
  event.net_revenue,
  event.attributed_cost,
  CASE
    WHEN event.attributed_cost IS NULL THEN NULL
    ELSE event.net_revenue - event.attributed_cost
  END::numeric AS contribution_margin,
  CASE
    WHEN event.attributed_cost IS NULL OR event.net_revenue <= 0 THEN NULL
    ELSE (event.net_revenue - event.attributed_cost) / NULLIF(event.net_revenue, 0)
  END::numeric AS contribution_margin_rate,
  event.revenue_basis,
  event.cost_basis,
  event.refund_basis,
  event.is_estimated_cost,
  event.cost_completeness
FROM economic_events event
JOIN "Store" store ON store."id" = event.store_id
LEFT JOIN "Product" product ON product."id" = event.product_id
LEFT JOIN "Project" project ON project."id" = event.project_id
LEFT JOIN "ProjectType" project_type ON project_type."id" = project."typeId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ask_data_free_sql_readonly') THEN
    EXECUTE 'GRANT SELECT ON ask_data_item_margin_view TO ask_data_free_sql_readonly';
  END IF;
END
$$;
