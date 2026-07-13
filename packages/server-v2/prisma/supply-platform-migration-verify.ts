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

async function tableExists(tableName: string) {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT to_regclass($1)::text AS name`,
    `"${tableName}"`,
  );
  return Boolean(rows[0]?.name);
}

async function count(sql: string) {
  const rows = await prisma.$queryRawUnsafe<Row[]>(sql);
  return Number(rows[0]?.count ?? 0);
}

async function sum(sql: string) {
  const rows = await prisma.$queryRawUnsafe<Row[]>(sql);
  return Number(rows[0]?.sum ?? 0);
}

async function mappedCount(legacyModel: string, targetModel: string) {
  return count(`SELECT COUNT(*)::int AS count FROM "SupplyLegacyMigrationMap" WHERE "legacyModel" = '${legacyModel}' AND "targetModel" = '${targetModel}'`);
}

async function main() {
  const legacyTables = ['Supplier', 'ProductSupplier', 'SupplierOrder', 'SupplierSettlement'];
  const existingLegacyTables = [];
  for (const table of legacyTables) {
    if (await tableExists(table)) existingLegacyTables.push(table);
  }

  if (existingLegacyTables.length === 0) {
    console.log(JSON.stringify({ complete: true, legacyTablesDropped: true, message: '旧供应链表已删除，归并完成。' }, null, 2));
    return;
  }

  const legacySupplierCount = await count(`SELECT COUNT(*)::int AS count FROM "Supplier" WHERE "deletedAt" IS NULL`);
  const legacyProductSupplierCount = await count(`SELECT COUNT(*)::int AS count FROM "ProductSupplier"`);
  const legacyOrderCount = await count(`SELECT COUNT(*)::int AS count FROM "SupplierOrder"`);
  const legacySettlementCount = await count(`SELECT COUNT(*)::int AS count FROM "SupplierSettlement"`);
  const mappedSupplierCount = await mappedCount('Supplier', 'SupplySupplier');
  const mappedSkuCount = await mappedCount('ProductSupplier', 'SupplySku');
  const mappedQuoteCount = await mappedCount('ProductSupplier', 'SupplyQuote');
  const mappedCatalogCount = await mappedCount('ProductSupplier', 'SupplyCatalogMapping');
  const mappedOrderCount = await mappedCount('SupplierOrder', 'ProcurementOrder');
  const mappedSettlementCount = await mappedCount('SupplierSettlement', 'SupplySettlement');
  const legacyOrderTotal = await sum(`SELECT COALESCE(SUM("totalAmount"), 0)::float AS sum FROM "SupplierOrder"`);
  const migratedOrderTotal = await sum(`
    SELECT COALESCE(SUM(po."totalAmount"), 0)::float AS sum
    FROM "SupplyLegacyMigrationMap" map
    JOIN "ProcurementOrder" po ON po."id" = map."targetId"
    WHERE map."legacyModel" = 'SupplierOrder' AND map."targetModel" = 'ProcurementOrder'
  `);
  const legacySettlementTotal = await sum(`SELECT COALESCE(SUM("netPayable"), 0)::float AS sum FROM "SupplierSettlement"`);
  const migratedSettlementTotal = await sum(`
    SELECT COALESCE(SUM(ss."netPayable"), 0)::float AS sum
    FROM "SupplyLegacyMigrationMap" map
    JOIN "SupplySettlement" ss ON ss."id" = map."targetId"
    WHERE map."legacyModel" = 'SupplierSettlement' AND map."targetModel" = 'SupplySettlement'
  `);
  const stockReplayCount = await count(`
    SELECT COUNT(*)::int AS count
    FROM "StockMovement"
    WHERE "sourceType" = 'supply_platform_order'
      AND "sourceNo" IN (SELECT "orderNo" FROM "SupplierOrder")
  `);

  const complete =
    mappedSupplierCount >= legacySupplierCount &&
    mappedSkuCount >= legacyProductSupplierCount &&
    mappedQuoteCount >= legacyProductSupplierCount &&
    mappedCatalogCount >= legacyProductSupplierCount &&
    mappedOrderCount >= legacyOrderCount &&
    mappedSettlementCount >= legacySettlementCount &&
    Math.abs(legacyOrderTotal - migratedOrderTotal) < 0.01 &&
    migratedSettlementTotal >= legacySettlementTotal &&
    stockReplayCount === 0;

  const report = {
    complete,
    existingLegacyTables,
    counts: {
      legacySupplierCount,
      mappedSupplierCount,
      legacyProductSupplierCount,
      mappedSkuCount,
      mappedQuoteCount,
      mappedCatalogCount,
      legacyOrderCount,
      mappedOrderCount,
      legacySettlementCount,
      mappedSettlementCount,
    },
    totals: {
      legacyOrderTotal,
      migratedOrderTotal,
      legacySettlementTotal,
      migratedSettlementTotal,
    },
    stockReplayCount,
    blockers: [
      mappedSupplierCount < legacySupplierCount ? 'legacy suppliers not fully mapped' : null,
      mappedSkuCount < legacyProductSupplierCount ? 'legacy product suppliers not fully mapped to supply skus' : null,
      mappedQuoteCount < legacyProductSupplierCount ? 'legacy product suppliers not fully mapped to quotes' : null,
      mappedCatalogCount < legacyProductSupplierCount ? 'legacy product suppliers not fully mapped to catalog mappings' : null,
      mappedOrderCount < legacyOrderCount ? 'legacy supplier orders not fully mapped' : null,
      mappedSettlementCount < legacySettlementCount ? 'legacy supplier settlements not fully mapped' : null,
      Math.abs(legacyOrderTotal - migratedOrderTotal) >= 0.01 ? 'legacy order total differs from migrated procurement order total' : null,
      migratedSettlementTotal < legacySettlementTotal ? 'migrated settlement payable total is lower than legacy total' : null,
      stockReplayCount > 0 ? 'migration appears to have replayed stock movement' : null,
    ].filter(Boolean),
    dropSql: complete ? 'packages/server-v2/prisma/manual/supply-platform-drop-legacy-after-verify.sql' : null,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!complete) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
