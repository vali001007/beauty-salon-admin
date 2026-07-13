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
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    const [key, ...value] = raw.replace(/^--/, '').split('=');
    args.set(key, value.join('='));
  }
  return {
    storeId: args.get('store-id') ? Number(args.get('store-id')) : undefined,
    limit: args.get('limit') ? Number(args.get('limit')) : 20,
  };
}

async function query<T = Row>(sql: string, ...params: unknown[]): Promise<T[]> {
  return prisma.$queryRawUnsafe<T[]>(sql, ...params);
}

async function main() {
  const { storeId, limit } = parseArgs();
  const supplierWhere = storeId ? `WHERE s."storeId" = ${Number(storeId)} AND s."deletedAt" IS NULL` : `WHERE s."deletedAt" IS NULL`;
  const orderWhere = storeId ? `WHERE o."storeId" = ${Number(storeId)}` : '';

  const unmigratedSuppliers = await query<Row>(
    `
      SELECT s."id", s."name", s."storeId"
      FROM "Supplier" s
      LEFT JOIN "SupplyLegacyMigrationMap" map
        ON map."legacyModel" = 'Supplier' AND map."legacyId" = s."id" AND map."targetModel" = 'SupplySupplier'
      ${supplierWhere}
        AND map."id" IS NULL
      ORDER BY s."id" ASC
      LIMIT $1
    `,
    limit,
  );
  const unmigratedProductLinks = await query<Row>(
    `
      SELECT ps."id", ps."supplierId", s."name" AS "supplierName", ps."productId", p."name" AS "productName", ps."supplyPrice"
      FROM "ProductSupplier" ps
      JOIN "Supplier" s ON s."id" = ps."supplierId"
      JOIN "Product" p ON p."id" = ps."productId"
      LEFT JOIN "SupplyLegacyMigrationMap" map
        ON map."legacyModel" = 'ProductSupplier' AND map."legacyId" = ps."id" AND map."targetModel" = 'SupplyCatalogMapping'
      ${storeId ? `WHERE s."storeId" = ${Number(storeId)} AND map."id" IS NULL` : `WHERE map."id" IS NULL`}
      ORDER BY ps."id" ASC
      LIMIT $1
    `,
    limit,
  );
  const unmigratedOrders = await query<Row>(
    `
      SELECT o."id", o."orderNo", o."supplierId", s."name" AS "supplierName", o."storeId", o."status"
      FROM "SupplierOrder" o
      JOIN "Supplier" s ON s."id" = o."supplierId"
      LEFT JOIN "SupplyLegacyMigrationMap" map
        ON map."legacyModel" = 'SupplierOrder' AND map."legacyId" = o."id" AND map."targetModel" = 'ProcurementOrder'
      ${orderWhere ? `${orderWhere} AND map."id" IS NULL` : `WHERE map."id" IS NULL`}
      ORDER BY o."id" ASC
      LIMIT $1
    `,
    limit,
  );

  const counts = {
    unmigratedSuppliers: unmigratedSuppliers.length,
    unmigratedProductLinks: unmigratedProductLinks.length,
    unmigratedOrders: unmigratedOrders.length,
  };

  console.log(
    JSON.stringify(
      {
        mode: 'audit',
        storeId: storeId ?? null,
        sampledLimit: limit,
        counts,
        samples: {
          unmigratedSuppliers,
          unmigratedProductLinks,
          unmigratedOrders,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
