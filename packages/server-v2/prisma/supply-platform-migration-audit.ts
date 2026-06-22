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

function parseArgs() {
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    const [key, ...value] = raw.replace(/^--/, '').split('=');
    args.set(key, value.join('='));
  }
  return {
    storeId: args.get('storeId') ? Number(args.get('storeId')) : undefined,
    limit: args.get('limit') ? Number(args.get('limit')) : 20,
  };
}

function legacySupplierKey(id: number) {
  return `legacy-supplier:${id}`;
}

async function main() {
  const { storeId, limit } = parseArgs();
  const supplierWhere = { deletedAt: null, ...(storeId ? { storeId } : {}) };
  const orderWhere = { ...(storeId ? { storeId } : {}) };

  const [legacySuppliers, legacyProductLinks, legacySupplierOrders, legacySettlements, platformSuppliers, platformOrders] = await Promise.all([
    prisma.supplier.findMany({ where: supplierWhere, include: { products: true }, take: limit, orderBy: { id: 'asc' } }),
    prisma.productSupplier.findMany({ where: { supplier: supplierWhere }, include: { product: true, supplier: true }, take: limit, orderBy: { id: 'asc' } }),
    prisma.supplierOrder.findMany({ where: orderWhere, include: { items: true, supplier: true }, take: limit, orderBy: { id: 'asc' } }),
    prisma.supplierSettlement.findMany({ where: { supplier: supplierWhere }, include: { supplier: true }, take: limit, orderBy: { id: 'asc' } }),
    prisma.supplySupplier.findMany({ where: { companyName: { startsWith: 'legacy-supplier:' } }, select: { id: true, companyName: true } }),
    prisma.procurementOrder.findMany({ where: { sourceNo: { startsWith: 'legacy-supplier-order:' } }, select: { id: true, sourceNo: true } }),
  ]);

  const migratedSupplierKeys = new Set(platformSuppliers.map((item: any) => item.companyName));
  const migratedOrderKeys = new Set(platformOrders.map((item: any) => item.sourceNo));
  const unmigratedSuppliers = legacySuppliers.filter((item: any) => !migratedSupplierKeys.has(legacySupplierKey(item.id)));
  const unmigratedOrders = legacySupplierOrders.filter((item: any) => !migratedOrderKeys.has(`legacy-supplier-order:${item.id}`));

  const report = {
    mode: 'audit',
    storeId: storeId ?? null,
    sampledLimit: limit,
    counts: {
      sampledLegacySuppliers: legacySuppliers.length,
      sampledLegacyProductLinks: legacyProductLinks.length,
      sampledLegacySupplierOrders: legacySupplierOrders.length,
      sampledLegacySettlements: legacySettlements.length,
      migratedPlatformSuppliers: platformSuppliers.length,
      migratedPlatformOrders: platformOrders.length,
      sampledUnmigratedSuppliers: unmigratedSuppliers.length,
      sampledUnmigratedOrders: unmigratedOrders.length,
    },
    samples: {
      unmigratedSuppliers: unmigratedSuppliers.slice(0, 10).map((item: any) => ({
        id: item.id,
        name: item.name,
        storeId: item.storeId,
        productLinks: item.products?.length ?? 0,
      })),
      unmigratedProductLinks: legacyProductLinks.slice(0, 10).map((item: any) => ({
        id: item.id,
        supplierId: item.supplierId,
        supplierName: item.supplier?.name,
        productId: item.productId,
        productName: item.product?.name,
        supplyPrice: Number(item.supplyPrice ?? 0),
      })),
      unmigratedOrders: unmigratedOrders.slice(0, 10).map((item: any) => ({
        id: item.id,
        orderNo: item.orderNo,
        supplierId: item.supplierId,
        supplierName: item.supplier?.name,
        storeId: item.storeId,
        status: item.status,
        itemCount: item.items?.length ?? 0,
      })),
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
