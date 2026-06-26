import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type Args = {
  apply: boolean;
  yes: boolean;
  storeId?: number;
  limit: number;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

function parseArgs(): Args {
  const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith('--') && !arg.includes('=')));
  const args = new Map<string, string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--') || !raw.includes('=')) continue;
    const [key, ...value] = raw.replace(/^--/, '').split('=');
    args.set(key, value.join('='));
  }
  const storeId = args.get('storeId') ? Number(args.get('storeId')) : undefined;
  const limit = args.get('limit') ? Number(args.get('limit')) : 1000;
  if (storeId !== undefined && (!Number.isInteger(storeId) || storeId <= 0)) {
    throw new Error('--storeId must be a positive integer');
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('--limit must be a positive integer');
  }
  return { apply: flags.has('--apply'), yes: flags.has('--yes'), storeId, limit };
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function movementNo(prefix: string) {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function main() {
  const args = parseArgs();
  const dryRun = !args.apply;
  if (args.apply && !args.yes) {
    throw new Error('真实修复负库存必须同时传入 --apply --yes；不传 --apply 时只 dry-run。');
  }

  const productWhere = {
    deletedAt: null,
    currentStock: { lt: 0 },
    ...(args.storeId ? { storeId: args.storeId } : {}),
  };
  const batchWhere = {
    stock: { lt: 0 },
    product: {
      deletedAt: null,
      ...(args.storeId ? { storeId: args.storeId } : {}),
    },
  };

  const [products, batches, productTotal, batchTotal, productRepairMovementTotal, batchRepairMovementTotal] = await Promise.all([
    prisma.product.findMany({
      where: productWhere,
      select: { id: true, storeId: true, name: true, sku: true, unit: true, currentStock: true },
      orderBy: [{ storeId: 'asc' }, { id: 'asc' }],
      take: args.limit,
    }),
    prisma.stockBatch.findMany({
      where: batchWhere,
      select: {
        id: true,
        batchNo: true,
        stock: true,
        product: { select: { id: true, storeId: true, name: true, sku: true, unit: true } },
      },
      orderBy: [{ productId: 'asc' }, { id: 'asc' }],
      take: args.limit,
    }),
    prisma.product.count({ where: productWhere }),
    prisma.stockBatch.count({ where: batchWhere }),
    prisma.stockMovement.count({ where: { sourceType: 'inventory_negative_stock_repair' } }),
    prisma.stockMovement.count({ where: { sourceType: 'inventory_negative_batch_repair' } }),
  ]);

  const plan = {
    mode: dryRun ? 'dry-run' : 'apply',
    storeId: args.storeId ?? 'all',
    limited: productTotal > products.length || batchTotal > batches.length,
    totals: {
      negativeProducts: productTotal,
      negativeBatches: batchTotal,
      plannedProductRepairs: products.length,
      plannedBatchRepairs: batches.length,
      productRepairMovements: productRepairMovementTotal,
      batchRepairMovements: batchRepairMovementTotal,
    },
    samples: {
      products: products.slice(0, 10).map((item) => ({
        id: item.id,
        storeId: item.storeId,
        name: item.name,
        sku: item.sku,
        beforeStock: toNumber(item.currentStock),
        afterStock: 0,
      })),
      batches: batches.slice(0, 10).map((item) => ({
        id: item.id,
        productId: item.product.id,
        storeId: item.product.storeId,
        productName: item.product.name,
        sku: item.product.sku,
        batchNo: item.batchNo,
        beforeStock: toNumber(item.stock),
        afterStock: 0,
      })),
    },
  };

  if (dryRun) {
    console.log(JSON.stringify({ ...plan, note: 'dry-run 未修改数据库；确认后追加 --apply --yes。' }, null, 2));
    return;
  }

  const result = await prisma.$transaction(
    async (tx) => {
      let repairedProducts = 0;
      let repairedBatches = 0;
      for (const product of products) {
        const beforeStock = toNumber(product.currentStock);
        if (beforeStock >= 0) continue;
        await tx.product.update({
          where: { id: product.id },
          data: { currentStock: 0 },
        });
        await tx.stockMovement.create({
          data: {
            storeId: product.storeId,
            productId: product.id,
            movementNo: movementNo('FIX'),
            movementType: 'inventory_adjustment',
            quantity: Math.abs(beforeStock),
            beforeStock,
            afterStock: 0,
            unit: product.unit,
            sourceType: 'inventory_negative_stock_repair',
            sourceId: product.id,
            sourceNo: product.sku,
            remark: '负库存数据修复：Product.currentStock 归零',
          },
        });
        repairedProducts += 1;
      }

      for (const batch of batches) {
        const beforeStock = toNumber(batch.stock);
        if (beforeStock >= 0) continue;
        await tx.stockBatch.update({
          where: { id: batch.id },
          data: { stock: 0 },
        });
        await tx.stockMovement.create({
          data: {
            storeId: batch.product.storeId,
            productId: batch.product.id,
            batchId: batch.id,
            movementNo: movementNo('FIXB'),
            movementType: 'inventory_adjustment',
            quantity: Math.abs(beforeStock),
            beforeStock,
            afterStock: 0,
            unit: batch.product.unit,
            sourceType: 'inventory_negative_batch_repair',
            sourceId: batch.id,
            sourceNo: batch.batchNo,
            remark: '负库存数据修复：StockBatch.stock 归零',
          },
        });
        repairedBatches += 1;
      }
      return { repairedProducts, repairedBatches };
    },
    { timeout: 30000 },
  );

  const [remainingProducts, remainingBatches] = await Promise.all([
    prisma.product.count({ where: productWhere }),
    prisma.stockBatch.count({ where: batchWhere }),
  ]);

  console.log(
    JSON.stringify(
      {
        ...plan,
        result,
        remaining: {
          negativeProducts: remainingProducts,
          negativeBatches: remainingBatches,
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
