-- Run only after `npm.cmd --prefix packages/server-v2 run supply-platform:legacy-verify`
-- reports complete=true and business totals have been manually accepted.

DROP TABLE IF EXISTS "SupplierSettlement" CASCADE;
DROP TABLE IF EXISTS "SupplierOrderItem" CASCADE;
DROP TABLE IF EXISTS "SupplierOrder" CASCADE;
DROP TABLE IF EXISTS "ProductSupplier" CASCADE;
DROP TABLE IF EXISTS "Supplier" CASCADE;
