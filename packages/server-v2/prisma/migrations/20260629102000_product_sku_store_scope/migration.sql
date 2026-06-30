-- Product SKU must be reusable across stores so transfer can match the same SKU
-- in source and target stores. Keep SKU unique inside one store.
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_sku_key";
DROP INDEX IF EXISTS "Product_sku_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Product_storeId_sku_key" ON "Product"("storeId", "sku");
