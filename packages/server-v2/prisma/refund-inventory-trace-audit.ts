import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: resolve(import.meta.dirname, '..', '.env') });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter });

type ColumnRow = { column_name: string };
type CountRow = { count: bigint | number | string };

async function main() {
  const columns = await prisma.$queryRaw<ColumnRow[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'RefundRecord'
  `;
  const refundColumns = new Set(columns.map((row) => row.column_name));
  const movementColumns = new Set(
    (await prisma.$queryRaw<ColumnRow[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'StockMovement'
    `).map((row) => row.column_name),
  );
  const migrated = refundColumns.has('requestId') && movementColumns.has('orderItemId') && movementColumns.has('refundItemId');

  const legacyRefunds = Number((await prisma.$queryRaw<CountRow[]>`SELECT COUNT(*) AS count FROM "RefundRecord"`)[0]?.count ?? 0);
  const saleOutWithoutOrderItem = movementColumns.has('orderItemId')
    ? Number((await prisma.$queryRaw<CountRow[]>`SELECT COUNT(*) AS count FROM "StockMovement" WHERE "movementType" = 'sale_out' AND "orderItemId" IS NULL`)[0]?.count ?? 0)
    : Number((await prisma.$queryRaw<CountRow[]>`SELECT COUNT(*) AS count FROM "StockMovement" WHERE "movementType" = 'sale_out'`)[0]?.count ?? 0);
  const serviceConsumeWithoutOrderItem = movementColumns.has('orderItemId')
    ? Number((await prisma.$queryRaw<CountRow[]>`SELECT COUNT(*) AS count FROM "StockMovement" WHERE "movementType" = 'service_consume' AND "orderItemId" IS NULL`)[0]?.count ?? 0)
    : Number((await prisma.$queryRaw<CountRow[]>`SELECT COUNT(*) AS count FROM "StockMovement" WHERE "movementType" = 'service_consume'`)[0]?.count ?? 0);

  const report = {
    mode: 'dry-run/read-only',
    migrationApplied: migrated,
    legacyRefunds,
    saleOutWithoutOrderItem,
    serviceConsumeWithoutOrderItem,
    decision: migrated
      ? '可继续按唯一订单明细匹配生成回填候选；歧义记录必须人工确认。'
      : '目标 migration 尚未部署。本次只完成旧结构基线审计，没有写库。',
  };
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
