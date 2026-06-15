-- CreateTable
CREATE TABLE IF NOT EXISTS "Supplier" (
    "id" SERIAL NOT NULL,
    "storeId" INTEGER,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "category" TEXT,
    "rebateRate" DECIMAL(65,30),
    "paymentTerms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductSupplier" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "supplyPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "moq" INTEGER,
    "leadDays" INTEGER,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SupplierOrder" (
    "id" SERIAL NOT NULL,
    "orderNo" TEXT NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "storeId" INTEGER NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "platformFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "rebateAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SupplierOrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "receivedQty" INTEGER,

    CONSTRAINT "SupplierOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Supplier_storeId_idx" ON "Supplier"("storeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Supplier_status_idx" ON "Supplier"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Supplier_category_idx" ON "Supplier"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Supplier_name_idx" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductSupplier_productId_supplierId_key" ON "ProductSupplier"("productId", "supplierId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductSupplier_supplierId_idx" ON "ProductSupplier"("supplierId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductSupplier_productId_isPrimary_idx" ON "ProductSupplier"("productId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierOrder_orderNo_key" ON "SupplierOrder"("orderNo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierOrder_supplierId_status_idx" ON "SupplierOrder"("supplierId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierOrder_storeId_idx" ON "SupplierOrder"("storeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierOrder_status_idx" ON "SupplierOrder"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierOrder_orderedAt_idx" ON "SupplierOrder"("orderedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierOrderItem_orderId_idx" ON "SupplierOrderItem"("orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupplierOrderItem_productId_idx" ON "SupplierOrderItem"("productId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSupplier" ADD CONSTRAINT "ProductSupplier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSupplier" ADD CONSTRAINT "ProductSupplier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "SupplierOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SupplierOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "SupplierOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migrate legacy Product.supplier text into formal Supplier and ProductSupplier records.
INSERT INTO "Supplier" ("storeId", "name", "status", "createdAt", "updatedAt")
SELECT DISTINCT p."storeId", trim(p."supplier"), 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" p
WHERE p."supplier" IS NOT NULL
  AND trim(p."supplier") <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "Supplier" s
    WHERE s."storeId" = p."storeId"
      AND s."name" = trim(p."supplier")
      AND s."deletedAt" IS NULL
  );

INSERT INTO "ProductSupplier" ("productId", "supplierId", "supplyPrice", "moq", "isPrimary", "createdAt", "updatedAt")
SELECT p."id", s."id", p."costPrice", NULLIF(p."minPurchaseQty", 0), true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" p
JOIN "Supplier" s ON s."storeId" = p."storeId" AND s."name" = trim(p."supplier") AND s."deletedAt" IS NULL
WHERE p."supplier" IS NOT NULL
  AND trim(p."supplier") <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "ProductSupplier" ps
    WHERE ps."productId" = p."id"
      AND ps."supplierId" = s."id"
  );
