import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
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
const SKU_MIGRATION_NAME = '20260629102000_product_sku_store_scope';

function argValue(name: string, fallback?: string) {
  const dashName = name.startsWith('--') ? name : `--${name}`;
  const index = process.argv.indexOf(dashName);
  if (index >= 0) return process.argv[index + 1] ?? fallback;
  const prefix = `${dashName}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function table(headers: string[], rows: Array<Array<string | number>>) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => String(cell).replace(/\n/g, ' ')).join(' | ')} |`),
  ].join('\n');
}

async function indexState() {
  const rows = await prisma.$queryRawUnsafe<Array<{ indexname: string; indexdef: string }>>(
    `select indexname, indexdef from pg_indexes where schemaname = current_schema() and tablename = 'Product' and indexname in ('Product_sku_key', 'Product_storeId_sku_key') order by indexname`,
  );
  const names = new Set(rows.map((row) => row.indexname));
  return {
    globalUnique: names.has('Product_sku_key'),
    storeScopedUnique: names.has('Product_storeId_sku_key'),
    indexes: rows,
  };
}

async function duplicateStoreSkuRows() {
  return prisma.$queryRawUnsafe<Array<{ storeId: number; storeName: string | null; sku: string; count: bigint; productIds: string }>>(
    `select p."storeId", s.name as "storeName", p.sku, count(*) as count, string_agg(p.id::text, ',' order by p.id) as "productIds"
     from "Product" p
     left join "Store" s on s.id = p."storeId"
     where p."deletedAt" is null and p.sku is not null and trim(p.sku) <> ''
     group by p."storeId", s.name, p.sku
     having count(*) > 1
     order by count(*) desc, p."storeId", p.sku
     limit 50`,
  );
}

async function crossStoreSkuRows() {
  return prisma.$queryRawUnsafe<Array<{ sku: string; storeCount: bigint; productCount: bigint; stores: string }>>(
    `select p.sku, count(distinct p."storeId") as "storeCount", count(*) as "productCount", string_agg(distinct coalesce(s.name, p."storeId"::text), ', ' order by coalesce(s.name, p."storeId"::text)) as stores
     from "Product" p
     left join "Store" s on s.id = p."storeId"
     where p."deletedAt" is null and p.sku is not null and trim(p.sku) <> ''
     group by p.sku
     having count(distinct p."storeId") > 1
     order by count(distinct p."storeId") desc, count(*) desc, p.sku
     limit 50`,
  );
}

async function prismaMigrationState() {
  const tableRows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `select to_regclass('_prisma_migrations') is not null as exists`,
  );
  if (!tableRows[0]?.exists) return { tableExists: false, applied: false, finishedAt: null };
  const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>(
    `select migration_name, finished_at, rolled_back_at
     from "_prisma_migrations"
     where migration_name = $1
     order by started_at desc
     limit 1`,
    SKU_MIGRATION_NAME,
  );
  const row = rows[0];
  return {
    tableExists: true,
    applied: Boolean(row?.finished_at && !row?.rolled_back_at),
    finishedAt: row?.finished_at ?? null,
    rolledBackAt: row?.rolled_back_at ?? null,
  };
}

function renderMarkdown(result: any) {
  const duplicateRows = result.duplicateStoreSkuRows.length
    ? table(['门店ID', '门店', 'SKU', '重复数', '商品ID'], result.duplicateStoreSkuRows.map((row: any) => [
        row.storeId,
        row.storeName ?? '-',
        row.sku,
        String(row.count),
        row.productIds,
      ]))
    : '未发现同一门店重复 SKU。';
  const crossStoreRows = result.crossStoreSkuRows.length
    ? table(['SKU', '门店数', '商品数', '门店'], result.crossStoreSkuRows.map((row: any) => [
        row.sku,
        String(row.storeCount),
        String(row.productCount),
        row.stores,
      ]))
    : '当前没有跨门店复用 SKU 的商品；迁移后可创建调拨验收样本。';

  return `# Product SKU 门店唯一迁移预检

生成时间：${new Date().toISOString()}
结论：${result.ready ? '可执行 migration' : '暂不建议执行 migration'}

## 1. 当前索引状态

${table(['索引', '状态'], [
  ['Product_sku_key（全局唯一）', result.indexState.globalUnique ? '存在' : '不存在'],
  ['Product_storeId_sku_key（门店内唯一）', result.indexState.storeScopedUnique ? '存在' : '不存在'],
  [`Prisma migration：${SKU_MIGRATION_NAME}`, result.prismaMigration.applied ? `已应用 / ${result.prismaMigration.finishedAt}` : result.prismaMigration.tableExists ? '未应用' : '迁移表不存在'],
])}

## 2. 同门店重复 SKU 检查

${duplicateRows}

## 3. 跨门店同 SKU 现状

${crossStoreRows}

## 4. 执行建议

- 如果同门店重复 SKU 为 0，则 \`20260629102000_product_sku_store_scope\` 可从数据一致性角度执行。
- 如果 \`Product_sku_key\` 仍存在且 \`Product_storeId_sku_key\` 不存在，说明真实库尚未应用迁移，跨门店同 SKU 调拨样本仍会被阻塞。
- 发布前不仅要索引切换成功，还需要 \`_prisma_migrations\` 中存在 \`${SKU_MIGRATION_NAME}\` 的成功记录，避免手工改库但迁移状态不同步。
- 本脚本只读，不会执行 migration，也不会修改商品数据。
`;
}

async function main() {
  const [indexes, duplicateRows, crossStoreRows, prismaMigration] = await Promise.all([
    indexState(),
    duplicateStoreSkuRows(),
    crossStoreSkuRows(),
    prismaMigrationState(),
  ]);
  const result = {
    ready: duplicateRows.length === 0,
    indexState: indexes,
    prismaMigration,
    duplicateStoreSkuRows: duplicateRows.map((row) => ({ ...row, count: String(row.count) })),
    crossStoreSkuRows: crossStoreRows.map((row) => ({
      ...row,
      storeCount: String(row.storeCount),
      productCount: String(row.productCount),
    })),
  };

  const outPath = argValue('out');
  if (outPath) {
    const resolvedOutPath = resolve(process.cwd(), outPath);
    mkdirSync(dirname(resolvedOutPath), { recursive: true });
    writeFileSync(resolvedOutPath, renderMarkdown(result), 'utf8');
  }

  console.log(JSON.stringify(result, null, 2));
  if (!result.ready && process.argv.includes('--strict')) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
