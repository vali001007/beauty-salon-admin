import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter }) as any;

type Row = Record<string, any>;

function parseArgs() {
  const args = new Map<string, string | boolean>();
  for (const raw of process.argv.slice(2)) {
    const normalized = raw.replace(/^--/, '');
    const [key, ...value] = normalized.split('=');
    args.set(key, value.length ? value.join('=') : true);
  }
  return {
    apply: args.has('apply'),
    storeId: args.get('store-id') ? Number(args.get('store-id')) : undefined,
  };
}

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toDate(value: unknown) {
  return value ? new Date(String(value)) : undefined;
}

function normalizeOrderStatus(status: string) {
  if (status === 'ordered') return 'accepted';
  if (status === 'partial_received') return 'partial_received';
  if (status === 'received') return 'received';
  if (status === 'settled') return 'settled';
  if (status === 'cancelled') return 'cancelled';
  return 'pending_supplier_confirm';
}

async function ensureMapTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SupplyLegacyMigrationMap" (
      "id" SERIAL NOT NULL,
      "legacyModel" TEXT NOT NULL,
      "legacyId" INTEGER NOT NULL,
      "targetModel" TEXT NOT NULL,
      "targetId" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SupplyLegacyMigrationMap_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "SupplyLegacyMigrationMap_legacyModel_legacyId_targetModel_key"
      ON "SupplyLegacyMigrationMap"("legacyModel", "legacyId", "targetModel")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "SupplyLegacyMigrationMap_targetModel_targetId_idx"
      ON "SupplyLegacyMigrationMap"("targetModel", "targetId")
  `);
}

async function getMap(legacyModel: string, legacyId: number, targetModel: string): Promise<number | null> {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT "targetId" FROM "SupplyLegacyMigrationMap" WHERE "legacyModel" = $1 AND "legacyId" = $2 AND "targetModel" = $3 LIMIT 1`,
    legacyModel,
    legacyId,
    targetModel,
  );
  return rows[0]?.targetId ? Number(rows[0].targetId) : null;
}

async function saveMap(legacyModel: string, legacyId: number, targetModel: string, targetId: number) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SupplyLegacyMigrationMap" ("legacyModel", "legacyId", "targetModel", "targetId")
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ("legacyModel", "legacyId", "targetModel") DO NOTHING`,
    legacyModel,
    legacyId,
    targetModel,
    targetId,
  );
}

async function fetchLegacy<T = Row>(sql: string, ...params: unknown[]): Promise<T[]> {
  return prisma.$queryRawUnsafe<T[]>(sql, ...params);
}

async function migrateSupplier(item: Row) {
  const mapped = await getMap('Supplier', Number(item.id), 'SupplySupplier');
  if (mapped) return mapped;
  const created = await prisma.supplySupplier.create({
    data: {
      name: item.name,
      companyName: item.name,
      contactName: item.contactName,
      phone: item.phone,
      email: item.email,
      address: item.address,
      categories: item.category ? [item.category] : undefined,
      qualificationStatus: 'approved',
      settlementMode: 'monthly',
      paymentTerms: item.paymentTerms,
      rebateRate: item.rebateRate,
      status: item.status === 'active' ? 'active' : 'disabled',
      createdAt: toDate(item.createdAt),
      updatedAt: toDate(item.updatedAt),
      deletedAt: item.deletedAt ? toDate(item.deletedAt) : undefined,
    },
  });
  await saveMap('Supplier', Number(item.id), 'SupplySupplier', created.id);
  return Number(created.id);
}

async function migrateSupplierById(legacySupplierId: number) {
  const rows = await fetchLegacy<Row>(`SELECT * FROM "Supplier" WHERE "id" = $1 LIMIT 1`, legacySupplierId);
  if (!rows[0]) throw new Error(`Legacy supplier ${legacySupplierId} does not exist`);
  return migrateSupplier(rows[0]);
}

async function getProduct(productId: number) {
  const rows = await fetchLegacy<Row>(`SELECT * FROM "Product" WHERE "id" = $1 LIMIT 1`, productId);
  return rows[0] ?? null;
}

async function migrateProductSupplier(link: Row) {
  const supplySkuMapped = await getMap('ProductSupplier', Number(link.id), 'SupplySku');
  const quoteMapped = await getMap('ProductSupplier', Number(link.id), 'SupplyQuote');
  const mappingMapped = await getMap('ProductSupplier', Number(link.id), 'SupplyCatalogMapping');
  if (supplySkuMapped && quoteMapped && mappingMapped) {
    return { supplySkuId: supplySkuMapped, quoteId: quoteMapped, mappingId: mappingMapped };
  }

  const supplierId = await migrateSupplierById(Number(link.supplierId));
  const product = await getProduct(Number(link.productId));
  if (!product) throw new Error(`ProductSupplier ${link.id} references missing product ${link.productId}`);

  let supplySkuId = supplySkuMapped;
  if (!supplySkuId) {
    const sku = await prisma.supplySku.create({
      data: {
        supplierId,
        categoryId: product.categoryId,
        name: product.name,
        brand: product.brand,
        spec: product.spec,
        unit: product.packageUnit ?? product.unit ?? product.specUnit,
        barcode: `legacy-product-supplier:${link.id}`,
        shelfLife: product.shelfLife,
        status: 'active',
        auditStatus: 'approved',
        description: `由旧供应商供货关系迁移，legacy ProductSupplier#${link.id}`,
        createdAt: toDate(link.createdAt),
        updatedAt: toDate(link.updatedAt),
      },
    });
    supplySkuId = Number(sku.id);
    await saveMap('ProductSupplier', Number(link.id), 'SupplySku', supplySkuId);
  }

  let quoteId = quoteMapped;
  if (!quoteId) {
    const quote = await prisma.supplyQuote.create({
      data: {
        supplySkuId,
        supplierId,
        price: toNumber(link.supplyPrice),
        moq: Math.max(1, toNumber(link.moq, 1)),
        leadDays: link.leadDays === null || link.leadDays === undefined ? undefined : toNumber(link.leadDays),
        stockStatus: 'available',
        status: 'active',
        auditStatus: 'approved',
        createdAt: toDate(link.createdAt),
        updatedAt: toDate(link.updatedAt),
      },
    });
    quoteId = Number(quote.id);
    await saveMap('ProductSupplier', Number(link.id), 'SupplyQuote', quoteId);
  }

  let mappingId = mappingMapped;
  if (!mappingId) {
    const mapping = await prisma.supplyCatalogMapping.create({
      data: {
        supplySkuId,
        productId: Number(link.productId),
        storeId: product.storeId,
        mappingStatus: 'active',
        isPreferred: Boolean(link.isPrimary),
        createdAt: toDate(link.createdAt),
        updatedAt: toDate(link.updatedAt),
      },
    });
    mappingId = Number(mapping.id);
    await saveMap('ProductSupplier', Number(link.id), 'SupplyCatalogMapping', mappingId);
  }

  return { supplySkuId, quoteId, mappingId };
}

async function ensureSupplySkuForOrderItem(orderItem: Row, supplierId: number, legacySupplierId: number) {
  const links = await fetchLegacy<Row>(
    `SELECT ps.* FROM "ProductSupplier" ps WHERE ps."productId" = $1 AND ps."supplierId" = $2 LIMIT 1`,
    Number(orderItem.productId),
    legacySupplierId,
  );
  if (links[0]) return migrateProductSupplier(links[0]);

  const mapped = await getMap('SupplierOrderItem', Number(orderItem.id), 'SupplySku');
  if (mapped) return { supplySkuId: mapped, quoteId: null, mappingId: null };

  const product = await getProduct(Number(orderItem.productId));
  if (!product) throw new Error(`SupplierOrderItem ${orderItem.id} references missing product ${orderItem.productId}`);
  const sku = await prisma.supplySku.create({
    data: {
      supplierId,
      categoryId: product.categoryId,
      name: product.name,
      brand: product.brand,
      spec: product.spec,
      unit: product.packageUnit ?? product.unit ?? product.specUnit,
      barcode: `legacy-supplier-order-item:${orderItem.id}`,
      shelfLife: product.shelfLife,
      status: 'active',
      auditStatus: 'approved',
      description: `由旧采购单明细迁移，legacy SupplierOrderItem#${orderItem.id}`,
    },
  });
  await saveMap('SupplierOrderItem', Number(orderItem.id), 'SupplySku', Number(sku.id));
  return { supplySkuId: Number(sku.id), quoteId: null, mappingId: null };
}

async function migrateOrder(order: Row) {
  const mapped = await getMap('SupplierOrder', Number(order.id), 'ProcurementOrder');
  if (mapped) return mapped;
  const targetSupplierId = await migrateSupplierById(Number(order.supplierId));
  const items = await fetchLegacy<Row>(`SELECT * FROM "SupplierOrderItem" WHERE "orderId" = $1 ORDER BY "id" ASC`, Number(order.id));
  const mappedItems = [];
  for (const item of items) {
    const supply = await ensureSupplySkuForOrderItem(item, targetSupplierId, Number(order.supplierId));
    mappedItems.push({
      legacyItem: item,
      data: {
        productId: Number(item.productId),
        supplySkuId: supply.supplySkuId,
        quoteId: supply.quoteId,
        quantity: Math.max(1, toNumber(item.quantity, 1)),
        unitPrice: toNumber(item.unitPrice),
        subtotal: toNumber(item.subtotal),
        receivedQty: toNumber(item.receivedQty),
      },
    });
  }

  const created = await prisma.procurementOrder.create({
    data: {
      orderNo: `LEGACY-${order.orderNo}`,
      storeId: Number(order.storeId),
      supplierId: targetSupplierId,
      status: normalizeOrderStatus(order.status),
      totalAmount: toNumber(order.totalAmount),
      platformFee: toNumber(order.platformFee),
      rebateAmount: toNumber(order.rebateAmount),
      netAmount: toNumber(order.netAmount),
      sourceType: 'legacy_supplier_order',
      sourceNo: order.orderNo,
      acceptedAt: ['ordered', 'partial_received', 'received', 'settled'].includes(String(order.status)) ? toDate(order.orderedAt) : undefined,
      receivedAt: toDate(order.receivedAt),
      settledAt: toDate(order.settledAt),
      createdAt: toDate(order.createdAt),
      updatedAt: toDate(order.updatedAt),
      items: { create: mappedItems.map((item) => item.data) },
    },
    include: { items: true },
  });
  await saveMap('SupplierOrder', Number(order.id), 'ProcurementOrder', Number(created.id));

  const receivedItems = created.items.filter((item: any) => toNumber(item.receivedQty) > 0);
  if (receivedItems.length) {
    const shipment = await prisma.supplierShipment.create({
      data: {
        orderId: Number(created.id),
        supplierId: targetSupplierId,
        shipmentNo: `LEGACY-SHIP-${order.orderNo}`,
        status: 'received',
        shippedAt: toDate(order.receivedAt) ?? toDate(order.orderedAt),
        receivedAt: toDate(order.receivedAt),
        items: {
          create: receivedItems.map((item: any) => ({
            orderItemId: Number(item.id),
            supplySkuId: Number(item.supplySkuId),
            shippedQty: toNumber(item.receivedQty),
            receivedQty: toNumber(item.receivedQty),
            batchNo: `LEGACY-${order.orderNo}-${item.productId}`,
          })),
        },
      },
    });
    await saveMap('SupplierOrder', Number(order.id), 'SupplierShipment', Number(shipment.id));
  }

  return Number(created.id);
}

async function migrateSettlement(settlement: Row) {
  const mapped = await getMap('SupplierSettlement', Number(settlement.id), 'SupplySettlement');
  if (mapped) return mapped;
  const supplierRows = await fetchLegacy<Row>(`SELECT * FROM "Supplier" WHERE "id" = $1 LIMIT 1`, Number(settlement.supplierId));
  if (!supplierRows[0]) throw new Error(`SupplierSettlement ${settlement.id} references missing supplier ${settlement.supplierId}`);
  const targetSupplierId = await migrateSupplier(supplierRows[0]);
  const existing = await prisma.supplySettlement.findUnique({
    where: { supplierId_settleMonth: { supplierId: targetSupplierId, settleMonth: settlement.settleMonth } },
  });
  const item = existing
    ? await prisma.supplySettlement.update({
        where: { id: existing.id },
        data: {
          orderCount: { increment: toNumber(settlement.orderCount) },
          totalAmount: { increment: toNumber(settlement.totalAmount) },
          rebateAmount: { increment: toNumber(settlement.rebateAmount) },
          platformFee: { increment: toNumber(settlement.platformFee) },
          netPayable: { increment: toNumber(settlement.netPayable) },
        },
      })
    : await prisma.supplySettlement.create({
        data: {
          supplierId: targetSupplierId,
          settleMonth: settlement.settleMonth,
          orderCount: toNumber(settlement.orderCount),
          totalAmount: toNumber(settlement.totalAmount),
          rebateAmount: toNumber(settlement.rebateAmount),
          platformFee: toNumber(settlement.platformFee),
          netPayable: toNumber(settlement.netPayable),
          status: settlement.status,
          confirmedAt: toDate(settlement.confirmedAt),
          paidAt: toDate(settlement.paidAt),
          createdAt: toDate(settlement.createdAt),
          updatedAt: toDate(settlement.updatedAt),
        },
      });
  await saveMap('SupplierSettlement', Number(settlement.id), 'SupplySettlement', Number(item.id));
  return Number(item.id);
}

async function main() {
  const { apply, storeId } = parseArgs();
  await ensureMapTable();
  const storeFilter = storeId ? `WHERE "storeId" = ${Number(storeId)}` : '';
  const supplierFilter = storeId ? `WHERE "storeId" = ${Number(storeId)} AND "deletedAt" IS NULL` : `WHERE "deletedAt" IS NULL`;
  const counts = {
    legacySuppliers: Number((await fetchLegacy<Row>(`SELECT COUNT(*)::int AS count FROM "Supplier" ${supplierFilter}`))[0]?.count ?? 0),
    legacyProductSuppliers: Number((await fetchLegacy<Row>(`SELECT COUNT(*)::int AS count FROM "ProductSupplier"`))[0]?.count ?? 0),
    legacyOrders: Number((await fetchLegacy<Row>(`SELECT COUNT(*)::int AS count FROM "SupplierOrder" ${storeFilter}`))[0]?.count ?? 0),
    legacySettlements: Number((await fetchLegacy<Row>(`SELECT COUNT(*)::int AS count FROM "SupplierSettlement"`))[0]?.count ?? 0),
  };

  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', storeId: storeId ?? null, counts, nextCommand: 'npm.cmd --prefix packages/server-v2 run supply-platform:legacy-migrate' }, null, 2));
    return;
  }

  const suppliers = await fetchLegacy<Row>(`SELECT * FROM "Supplier" ${supplierFilter} ORDER BY "id" ASC`);
  for (const supplier of suppliers) await migrateSupplier(supplier);

  const links = await fetchLegacy<Row>(`
    SELECT ps.*
    FROM "ProductSupplier" ps
    JOIN "Supplier" s ON s."id" = ps."supplierId"
    ${storeId ? `WHERE s."storeId" = ${Number(storeId)}` : ''}
    ORDER BY ps."id" ASC
  `);
  for (const link of links) await migrateProductSupplier(link);

  const orders = await fetchLegacy<Row>(`SELECT o.*, s."name", s."contactName", s."phone", s."email", s."address", s."category", s."rebateRate", s."paymentTerms", s."deletedAt" FROM "SupplierOrder" o JOIN "Supplier" s ON s."id" = o."supplierId" ${storeId ? `WHERE o."storeId" = ${Number(storeId)}` : ''} ORDER BY o."id" ASC`);
  for (const order of orders) await migrateOrder(order);

  const settlements = await fetchLegacy<Row>(`
    SELECT ss.*
    FROM "SupplierSettlement" ss
    JOIN "Supplier" s ON s."id" = ss."supplierId"
    ${storeId ? `WHERE s."storeId" = ${Number(storeId)}` : ''}
    ORDER BY ss."id" ASC
  `);
  for (const settlement of settlements) await migrateSettlement(settlement);

  console.log(JSON.stringify({ mode: 'apply', storeId: storeId ?? null, migrated: { suppliers: suppliers.length, productSuppliers: links.length, orders: orders.length, settlements: settlements.length } }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
