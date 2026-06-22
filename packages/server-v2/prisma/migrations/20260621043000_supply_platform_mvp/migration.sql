CREATE TABLE "SupplySupplier" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "companyName" TEXT,
  "contactName" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "serviceRegions" JSONB,
  "categories" JSONB,
  "qualificationStatus" TEXT NOT NULL DEFAULT 'pending',
  "settlementMode" TEXT NOT NULL DEFAULT 'monthly',
  "paymentTerms" TEXT,
  "rebateRate" DECIMAL(65,30),
  "platformFeeRate" DECIMAL(65,30),
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "SupplySupplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierQualification" (
  "id" SERIAL NOT NULL,
  "supplierId" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewedBy" INTEGER,
  "reviewedAt" TIMESTAMP(3),
  "rejectReason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierQualification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplySku" (
  "id" SERIAL NOT NULL,
  "supplierId" INTEGER NOT NULL,
  "categoryId" INTEGER,
  "name" TEXT NOT NULL,
  "brand" TEXT,
  "spec" TEXT,
  "unit" TEXT,
  "barcode" TEXT,
  "images" JSONB,
  "shelfLife" INTEGER,
  "qualificationFiles" JSONB,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "auditStatus" TEXT NOT NULL DEFAULT 'draft',
  "reviewedBy" INTEGER,
  "reviewedAt" TIMESTAMP(3),
  "rejectReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "SupplySku_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplyQuote" (
  "id" SERIAL NOT NULL,
  "supplySkuId" INTEGER NOT NULL,
  "supplierId" INTEGER NOT NULL,
  "price" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "taxIncluded" BOOLEAN NOT NULL DEFAULT true,
  "moq" INTEGER NOT NULL DEFAULT 1,
  "leadDays" INTEGER,
  "stockStatus" TEXT NOT NULL DEFAULT 'available',
  "availableStock" INTEGER,
  "regionScope" JSONB,
  "storeScope" JSONB,
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'draft',
  "auditStatus" TEXT NOT NULL DEFAULT 'draft',
  "reviewedBy" INTEGER,
  "reviewedAt" TIMESTAMP(3),
  "rejectReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "SupplyQuote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplyCatalogMapping" (
  "id" SERIAL NOT NULL,
  "supplySkuId" INTEGER NOT NULL,
  "productId" INTEGER,
  "storeId" INTEGER,
  "standardProductTemplateId" INTEGER,
  "mappingStatus" TEXT NOT NULL DEFAULT 'active',
  "isPreferred" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplyCatalogMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcurementOrder" (
  "id" SERIAL NOT NULL,
  "orderNo" TEXT NOT NULL,
  "storeId" INTEGER NOT NULL,
  "supplierId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_supplier_confirm',
  "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "platformFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "rebateAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "netAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "expectedArrivalDate" TIMESTAMP(3),
  "sourceType" TEXT NOT NULL DEFAULT 'manual',
  "sourceNo" TEXT,
  "createdBy" INTEGER,
  "acceptedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "shippedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProcurementOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcurementOrderItem" (
  "id" SERIAL NOT NULL,
  "orderId" INTEGER NOT NULL,
  "productId" INTEGER,
  "supplySkuId" INTEGER NOT NULL,
  "quoteId" INTEGER,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "receivedQty" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProcurementOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierShipment" (
  "id" SERIAL NOT NULL,
  "orderId" INTEGER NOT NULL,
  "supplierId" INTEGER NOT NULL,
  "shipmentNo" TEXT NOT NULL,
  "logisticsCompany" TEXT,
  "trackingNo" TEXT,
  "status" TEXT NOT NULL DEFAULT 'shipped',
  "shippedAt" TIMESTAMP(3),
  "expectedArrivalAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierShipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierShipmentItem" (
  "id" SERIAL NOT NULL,
  "shipmentId" INTEGER NOT NULL,
  "orderItemId" INTEGER NOT NULL,
  "supplySkuId" INTEGER NOT NULL,
  "shippedQty" INTEGER NOT NULL,
  "receivedQty" INTEGER NOT NULL DEFAULT 0,
  "batchNo" TEXT,
  "productionDate" TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3),
  CONSTRAINT "SupplierShipmentItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplySettlement" (
  "id" SERIAL NOT NULL,
  "supplierId" INTEGER NOT NULL,
  "settleMonth" TEXT NOT NULL,
  "orderCount" INTEGER NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "rebateAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "platformFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "adjustmentAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "netPayable" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "confirmedAt" TIMESTAMP(3),
  "supplierConfirmedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplySettlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProcurementOrder_orderNo_key" ON "ProcurementOrder"("orderNo");
CREATE UNIQUE INDEX "SupplierShipment_shipmentNo_key" ON "SupplierShipment"("shipmentNo");
CREATE UNIQUE INDEX "SupplySettlement_supplierId_settleMonth_key" ON "SupplySettlement"("supplierId", "settleMonth");

CREATE INDEX "SupplySupplier_status_idx" ON "SupplySupplier"("status");
CREATE INDEX "SupplySupplier_qualificationStatus_idx" ON "SupplySupplier"("qualificationStatus");
CREATE INDEX "SupplySupplier_name_idx" ON "SupplySupplier"("name");
CREATE INDEX "SupplierQualification_supplierId_idx" ON "SupplierQualification"("supplierId");
CREATE INDEX "SupplierQualification_status_idx" ON "SupplierQualification"("status");
CREATE INDEX "SupplierQualification_type_idx" ON "SupplierQualification"("type");
CREATE INDEX "SupplySku_supplierId_idx" ON "SupplySku"("supplierId");
CREATE INDEX "SupplySku_status_idx" ON "SupplySku"("status");
CREATE INDEX "SupplySku_auditStatus_idx" ON "SupplySku"("auditStatus");
CREATE INDEX "SupplySku_name_idx" ON "SupplySku"("name");
CREATE INDEX "SupplySku_barcode_idx" ON "SupplySku"("barcode");
CREATE INDEX "SupplyQuote_supplySkuId_idx" ON "SupplyQuote"("supplySkuId");
CREATE INDEX "SupplyQuote_supplierId_idx" ON "SupplyQuote"("supplierId");
CREATE INDEX "SupplyQuote_status_idx" ON "SupplyQuote"("status");
CREATE INDEX "SupplyQuote_auditStatus_idx" ON "SupplyQuote"("auditStatus");
CREATE INDEX "SupplyQuote_validTo_idx" ON "SupplyQuote"("validTo");
CREATE INDEX "SupplyCatalogMapping_supplySkuId_idx" ON "SupplyCatalogMapping"("supplySkuId");
CREATE INDEX "SupplyCatalogMapping_productId_idx" ON "SupplyCatalogMapping"("productId");
CREATE INDEX "SupplyCatalogMapping_storeId_idx" ON "SupplyCatalogMapping"("storeId");
CREATE INDEX "SupplyCatalogMapping_standardProductTemplateId_idx" ON "SupplyCatalogMapping"("standardProductTemplateId");
CREATE INDEX "SupplyCatalogMapping_mappingStatus_idx" ON "SupplyCatalogMapping"("mappingStatus");
CREATE INDEX "ProcurementOrder_storeId_idx" ON "ProcurementOrder"("storeId");
CREATE INDEX "ProcurementOrder_supplierId_status_idx" ON "ProcurementOrder"("supplierId", "status");
CREATE INDEX "ProcurementOrder_status_idx" ON "ProcurementOrder"("status");
CREATE INDEX "ProcurementOrder_createdAt_idx" ON "ProcurementOrder"("createdAt");
CREATE INDEX "ProcurementOrderItem_orderId_idx" ON "ProcurementOrderItem"("orderId");
CREATE INDEX "ProcurementOrderItem_productId_idx" ON "ProcurementOrderItem"("productId");
CREATE INDEX "ProcurementOrderItem_supplySkuId_idx" ON "ProcurementOrderItem"("supplySkuId");
CREATE INDEX "ProcurementOrderItem_quoteId_idx" ON "ProcurementOrderItem"("quoteId");
CREATE INDEX "SupplierShipment_orderId_idx" ON "SupplierShipment"("orderId");
CREATE INDEX "SupplierShipment_supplierId_idx" ON "SupplierShipment"("supplierId");
CREATE INDEX "SupplierShipment_status_idx" ON "SupplierShipment"("status");
CREATE INDEX "SupplierShipmentItem_shipmentId_idx" ON "SupplierShipmentItem"("shipmentId");
CREATE INDEX "SupplierShipmentItem_orderItemId_idx" ON "SupplierShipmentItem"("orderItemId");
CREATE INDEX "SupplierShipmentItem_supplySkuId_idx" ON "SupplierShipmentItem"("supplySkuId");
CREATE INDEX "SupplySettlement_supplierId_idx" ON "SupplySettlement"("supplierId");
CREATE INDEX "SupplySettlement_settleMonth_idx" ON "SupplySettlement"("settleMonth");
CREATE INDEX "SupplySettlement_status_idx" ON "SupplySettlement"("status");

ALTER TABLE "SupplierQualification" ADD CONSTRAINT "SupplierQualification_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "SupplySupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplySku" ADD CONSTRAINT "SupplySku_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "SupplySupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyQuote" ADD CONSTRAINT "SupplyQuote_supplySkuId_fkey" FOREIGN KEY ("supplySkuId") REFERENCES "SupplySku"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyQuote" ADD CONSTRAINT "SupplyQuote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "SupplySupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyCatalogMapping" ADD CONSTRAINT "SupplyCatalogMapping_supplySkuId_fkey" FOREIGN KEY ("supplySkuId") REFERENCES "SupplySku"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyCatalogMapping" ADD CONSTRAINT "SupplyCatalogMapping_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplyCatalogMapping" ADD CONSTRAINT "SupplyCatalogMapping_standardProductTemplateId_fkey" FOREIGN KEY ("standardProductTemplateId") REFERENCES "IndustryProductTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "SupplySupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcurementOrderItem" ADD CONSTRAINT "ProcurementOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProcurementOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcurementOrderItem" ADD CONSTRAINT "ProcurementOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProcurementOrderItem" ADD CONSTRAINT "ProcurementOrderItem_supplySkuId_fkey" FOREIGN KEY ("supplySkuId") REFERENCES "SupplySku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcurementOrderItem" ADD CONSTRAINT "ProcurementOrderItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "SupplyQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupplierShipment" ADD CONSTRAINT "SupplierShipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProcurementOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierShipment" ADD CONSTRAINT "SupplierShipment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "SupplySupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierShipmentItem" ADD CONSTRAINT "SupplierShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "SupplierShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierShipmentItem" ADD CONSTRAINT "SupplierShipmentItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "ProcurementOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierShipmentItem" ADD CONSTRAINT "SupplierShipmentItem_supplySkuId_fkey" FOREIGN KEY ("supplySkuId") REFERENCES "SupplySku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplySettlement" ADD CONSTRAINT "SupplySettlement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "SupplySupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
