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

async function main() {
  const [legacySupplierCount, migratedSupplierCount, legacyOrderCount, migratedOrderCount, unmappedSkuCount, orderWithoutItemsCount] = await Promise.all([
    prisma.supplier.count({ where: { deletedAt: null } }),
    prisma.supplySupplier.count({ where: { companyName: { startsWith: 'legacy-supplier:' } } }),
    prisma.supplierOrder.count(),
    prisma.procurementOrder.count({ where: { sourceNo: { startsWith: 'legacy-supplier-order:' } } }),
    prisma.supplySku.count({ where: { barcode: { startsWith: 'legacy-product-supplier:' }, mappings: { none: {} } } }),
    prisma.procurementOrder.count({ where: { sourceNo: { startsWith: 'legacy-supplier-order:' }, items: { none: {} } } }),
  ]);

  const complete = migratedSupplierCount >= legacySupplierCount && migratedOrderCount >= legacyOrderCount && unmappedSkuCount === 0 && orderWithoutItemsCount === 0;
  const report = {
    complete,
    legacySupplierCount,
    migratedSupplierCount,
    legacyOrderCount,
    migratedOrderCount,
    unmappedSkuCount,
    orderWithoutItemsCount,
    blockers: [
      migratedSupplierCount < legacySupplierCount ? 'legacy suppliers not fully migrated' : null,
      migratedOrderCount < legacyOrderCount ? 'legacy supplier orders not fully migrated' : null,
      unmappedSkuCount > 0 ? 'legacy supply skus without catalog mappings' : null,
      orderWithoutItemsCount > 0 ? 'migrated procurement orders without items' : null,
    ].filter(Boolean),
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
