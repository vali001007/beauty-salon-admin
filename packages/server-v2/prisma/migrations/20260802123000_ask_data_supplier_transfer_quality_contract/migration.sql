-- Ask supplier delivery metrics must not expose negative durations caused by
-- source-system timestamp jitter. A negative delivery duration is not a valid
-- business measure, so clamp it to zero at the semantic-view boundary.
CREATE OR REPLACE VIEW agent_v3_supplier_performance_view AS
SELECT
  po."storeId" AS store_id,
  s."name" AS store_name,
  ss."id" AS supplier_id,
  ss."name" AS supplier_name,
  COUNT(po."id")::integer AS procurement_count,
  SUM(po."totalAmount")::numeric AS procurement_amount,
  AVG(
    GREATEST(
      EXTRACT(EPOCH FROM (COALESCE(po."receivedAt", po."updatedAt") - po."createdAt")) / 86400,
      0
    )
  )::numeric AS avg_delivery_days,
  MAX(po."createdAt") AS last_procurement_at
FROM "SupplySupplier" ss
JOIN "ProcurementOrder" po ON po."supplierId" = ss."id"
JOIN "Store" s ON s."id" = po."storeId"
GROUP BY po."storeId", s."name", ss."id", ss."name";

-- The view exposes one row per store perspective. Invalid/self-store demo
-- transfers otherwise create two rows for the same store and transfer id,
-- which makes list/ranking questions count the same transfer twice. Preserve
-- the outbound perspective and suppress only the duplicate inbound row.
CREATE OR REPLACE VIEW ask_data_transfer_status_view AS
SELECT
  transfer."fromStoreId" AS store_id,
  source_store."name" AS store_name,
  transfer."id" AS transfer_id,
  transfer."orderNo" AS transfer_no,
  'outbound'::text AS direction,
  transfer."toStoreId" AS counterpart_store_id,
  target_store."name" AS counterpart_store_name,
  transfer."productCount" AS product_count,
  transfer."status",
  transfer."createdAt" AS created_at,
  transfer."updatedAt" AS updated_at
FROM "TransferOrder" transfer
JOIN "Store" source_store ON source_store."id" = transfer."fromStoreId"
JOIN "Store" target_store ON target_store."id" = transfer."toStoreId"
UNION ALL
SELECT
  transfer."toStoreId" AS store_id,
  target_store."name" AS store_name,
  transfer."id" AS transfer_id,
  transfer."orderNo" AS transfer_no,
  'inbound'::text AS direction,
  transfer."fromStoreId" AS counterpart_store_id,
  source_store."name" AS counterpart_store_name,
  transfer."productCount" AS product_count,
  transfer."status",
  transfer."createdAt" AS created_at,
  transfer."updatedAt" AS updated_at
FROM "TransferOrder" transfer
JOIN "Store" source_store ON source_store."id" = transfer."fromStoreId"
JOIN "Store" target_store ON target_store."id" = transfer."toStoreId"
WHERE transfer."fromStoreId" <> transfer."toStoreId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ask_data_free_sql_readonly') THEN
    GRANT SELECT ON agent_v3_supplier_performance_view, ask_data_transfer_status_view
      TO ask_data_free_sql_readonly;
  END IF;
END
$$;
