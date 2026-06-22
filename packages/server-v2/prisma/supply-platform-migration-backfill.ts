import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--yes');
const dryRun = !apply || !confirmed || process.argv.includes('--dry-run');

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
    limit: args.get('limit') ? Number(args.get('limit')) : 200,
  };
}

function legacySupplierKey(id: number) {
  return `legacy-supplier:${id}`;
}

function legacySkuKey(productId: number, supplierId: number) {
  return `legacy-product-supplier:${productId}:${supplierId}`;
}

function legacyOrderKey(id: number) {
  return `legacy-supplier-order:${id}`;
}

async function ensureSupplier(legacy: any) {
  const key = legacySupplierKey(legacy.id);
  const existing = await prisma.supplySupplier.findFirst({ where: { companyName: key } });
  if (existing) return existing;
  if (dryRun) return { id: -legacy.id, name: legacy.name, companyName: key };
  return prisma.supplySupplier.create({
    data: {
      name: legacy.name,
      companyName: key,
      contactName: legacy.contactName,
      phone: legacy.phone,
      email: legacy.email,
      address: legacy.address,
      categories: legacy.category ? [legacy.category] : undefined,
      settlementMode: 'legacy',
      paymentTerms: legacy.paymentTerms,
      rebateRate: legacy.rebateRate ?? 0,
      status: legacy.status === 'archived' ? 'disabled' : legacy.status,
      qualificationStatus: 'legacy_imported',
    },
  });
}

async function ensureSkuAndQuote(link: any, supplier: any) {
  const skuName = link.product?.name ?? `Legacy Product ${link.productId}`;
  const skuKey = legacySkuKey(link.productId, link.supplierId);
  const existingSku = await prisma.supplySku.findFirst({ where: { barcode: skuKey } });
  const sku =
    existingSku ??
    (dryRun
      ? { id: -link.id, supplierId: supplier.id, name: skuName }
      : await prisma.supplySku.create({
          data: {
            supplierId: supplier.id,
            name: skuName,
            spec: link.product?.spec,
            unit: link.product?.unit,
            barcode: skuKey,
            status: 'active',
            auditStatus: 'approved',
            description: '由旧供应商商品关联迁移',
          },
        }));

  if (!dryRun) {
    const quote = await prisma.supplyQuote.findFirst({ where: { supplySkuId: sku.id, supplierId: supplier.id } });
    if (!quote) {
      await prisma.supplyQuote.create({
        data: {
          supplySkuId: sku.id,
          supplierId: supplier.id,
          price: link.supplyPrice ?? link.product?.costPrice ?? 0,
          moq: link.moq ?? 1,
          leadDays: link.leadDays,
          stockStatus: 'available',
          status: 'active',
          auditStatus: 'approved',
        },
      });
    }
    const mapping = await prisma.supplyCatalogMapping.findFirst({ where: { supplySkuId: sku.id, productId: link.productId, storeId: link.product?.storeId ?? link.supplier?.storeId ?? undefined } });
    if (!mapping) {
      await prisma.supplyCatalogMapping.create({
        data: {
          supplySkuId: sku.id,
          productId: link.productId,
          storeId: link.product?.storeId ?? link.supplier?.storeId,
          mappingStatus: 'active',
          isPreferred: Boolean(link.isPrimary),
        },
      });
    }
  }
  return sku;
}

async function migrateOrder(legacy: any, supplier: any, skuByProductId: Map<number, any>) {
  const sourceNo = legacyOrderKey(legacy.id);
  const existing = await prisma.procurementOrder.findFirst({ where: { sourceNo } });
  if (existing) return existing;
  const items = (legacy.items ?? [])
    .map((item: any) => {
      const sku = skuByProductId.get(item.productId);
      if (!sku) return null;
      const quantity = Number(item.quantity ?? 0);
      const unitPrice = item.unitPrice ?? 0;
      return {
        productId: item.productId,
        supplySkuId: sku.id,
        quantity,
        unitPrice,
        subtotal: Number(item.subtotal ?? quantity * Number(unitPrice ?? 0)),
        receivedQty: Number(item.receivedQty ?? 0),
      };
    })
    .filter(Boolean);
  if (items.length === 0) return null;
  if (dryRun) return { id: -legacy.id, sourceNo, itemCount: items.length };
  return prisma.procurementOrder.create({
    data: {
      orderNo: `MIG-${legacy.orderNo}`,
      storeId: legacy.storeId,
      supplierId: supplier.id,
      status: legacy.status === 'received' ? 'received' : legacy.status === 'settled' ? 'settled' : 'accepted',
      totalAmount: legacy.totalAmount ?? 0,
      platformFee: legacy.platformFee ?? 0,
      rebateAmount: legacy.rebateAmount ?? 0,
      netAmount: legacy.netAmount ?? legacy.totalAmount ?? 0,
      expectedArrivalDate: legacy.orderedAt,
      sourceType: 'legacy_supplier_order',
      sourceNo,
      createdAt: legacy.createdAt,
      updatedAt: legacy.updatedAt,
      items: { create: items },
    },
  });
}

async function main() {
  const { storeId, limit } = parseArgs();
  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null, ...(storeId ? { storeId } : {}) },
    include: {
      products: { include: { product: true } },
      orders: { include: { items: true } },
      settlements: true,
    },
    take: limit,
    orderBy: { id: 'asc' },
  });

  const summary = { dryRun, suppliers: 0, skus: 0, orders: 0, settlements: 0, skippedOrders: 0 };
  for (const legacy of suppliers) {
    const supplier = await ensureSupplier(legacy);
    summary.suppliers += 1;
    const skuByProductId = new Map<number, any>();
    for (const link of legacy.products ?? []) {
      const sku = await ensureSkuAndQuote({ ...link, supplier: legacy }, supplier);
      skuByProductId.set(link.productId, sku);
      summary.skus += 1;
    }
    for (const order of legacy.orders ?? []) {
      const migratedOrder = await migrateOrder(order, supplier, skuByProductId);
      if (migratedOrder) summary.orders += 1;
      else summary.skippedOrders += 1;
    }
    if (!dryRun) {
      for (const settlement of legacy.settlements ?? []) {
        await prisma.supplySettlement.upsert({
          where: { supplierId_settleMonth: { supplierId: supplier.id, settleMonth: settlement.settleMonth } },
          create: {
            supplierId: supplier.id,
            settleMonth: settlement.settleMonth,
            orderCount: settlement.orderCount,
            totalAmount: settlement.totalAmount,
            rebateAmount: settlement.rebateAmount,
            platformFee: settlement.platformFee,
            netPayable: settlement.netPayable,
            status: settlement.status,
            confirmedAt: settlement.confirmedAt,
            paidAt: settlement.paidAt,
          },
          update: {},
        });
        summary.settlements += 1;
      }
    } else {
      summary.settlements += legacy.settlements?.length ?? 0;
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
