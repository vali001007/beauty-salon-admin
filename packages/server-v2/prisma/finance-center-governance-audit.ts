import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: resolve(import.meta.dirname, '..', '.env') });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter });

type CountRow = { count: bigint | number | string };
type ColumnRow = { table_name: string; column_name: string };

const count = (rows: CountRow[]) => Number(rows[0]?.count ?? 0);

async function main() {
  const columns = await prisma.$queryRaw<ColumnRow[]>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('OrderItem', 'DailySettlementSnapshot', 'RefundItem', 'StockMovement', 'CommissionAdjustment', 'MemberLiabilitySnapshot')
  `;
  const byTable = new Map<string, Set<string>>();
  for (const row of columns) {
    if (!byTable.has(row.table_name)) byTable.set(row.table_name, new Set());
    byTable.get(row.table_name)!.add(row.column_name);
  }
  const foundationApplied = byTable.get('OrderItem')?.has('recognizedAt') && byTable.has('DailySettlementSnapshot');

  const confirmedDaily = count(await prisma.$queryRaw<CountRow[]>`SELECT COUNT(*) AS count FROM "DailySettlement" WHERE status = 'confirmed'`);
  const draftDaily = count(await prisma.$queryRaw<CountRow[]>`SELECT COUNT(*) AS count FROM "DailySettlement" WHERE status = 'draft'`);
  const missingRefundItems = count(await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count
    FROM "RefundRecord" rr
    WHERE rr.status IN ('success', 'completed', 'refunded', 'paid')
      AND NOT EXISTS (SELECT 1 FROM "RefundItem" ri WHERE ri."refundId" = rr.id)
  `);
  const refundAmountMismatch = count(await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count
    FROM "RefundRecord" rr
    JOIN LATERAL (SELECT COALESCE(SUM(ri."refundAmount"), 0) AS item_total FROM "RefundItem" ri WHERE ri."refundId" = rr.id) x ON TRUE
    WHERE ABS(rr.amount - x.item_total) > 0.01
  `);
  const unlinkedRefundInventory = byTable.get('StockMovement')?.has('refundItemId')
    ? count(await prisma.$queryRaw<CountRow[]>`
        SELECT COUNT(*) AS count FROM "RefundItem" ri
        WHERE ri."inventoryAction" <> 'none'
          AND NOT EXISTS (SELECT 1 FROM "StockMovement" sm WHERE sm."refundItemId" = ri.id)
      `)
    : missingRefundItems;

  const recognition = foundationApplied
    ? {
        uniqueMatch: count(await prisma.$queryRaw<CountRow[]>`
          SELECT COUNT(*) AS count FROM "OrderItem" oi
          WHERE oi."recognizedAt" IS NULL AND (
            EXISTS (SELECT 1 FROM "StockMovement" sm WHERE sm."orderItemId" = oi.id AND sm."movementType" = 'sale_out')
            OR EXISTS (SELECT 1 FROM "PaymentRecord" pr WHERE pr."orderId" = oi."orderId" AND pr.status = 'success')
          )
        `),
        manualReview: count(await prisma.$queryRaw<CountRow[]>`
          SELECT COUNT(*) AS count FROM "OrderItem" oi
          WHERE oi."recognizedAt" IS NULL AND oi."itemType" IN ('project', 'service', 'service_project')
            AND NOT EXISTS (SELECT 1 FROM "PaymentRecord" pr WHERE pr."orderId" = oi."orderId" AND pr.status = 'success')
        `),
        unmatched: count(await prisma.$queryRaw<CountRow[]>`
          SELECT COUNT(*) AS count FROM "OrderItem" oi
          WHERE oi."recognizedAt" IS NULL
            AND NOT EXISTS (SELECT 1 FROM "StockMovement" sm WHERE sm."orderItemId" = oi.id AND sm."movementType" = 'sale_out')
            AND NOT EXISTS (SELECT 1 FROM "PaymentRecord" pr WHERE pr."orderId" = oi."orderId" AND pr.status = 'success')
        `),
      }
    : { uniqueMatch: 0, manualReview: 0, unmatched: 0 };

  const confirmedWithoutSnapshot = foundationApplied
    ? count(await prisma.$queryRaw<CountRow[]>`
        SELECT COUNT(*) AS count FROM "DailySettlement" ds
        WHERE ds.status = 'confirmed'
          AND NOT EXISTS (SELECT 1 FROM "DailySettlementSnapshot" dss WHERE dss."dailySettlementId" = ds.id)
      `)
    : confirmedDaily;

  const report = {
    mode: 'dry-run/read-only',
    foundationMigrationApplied: Boolean(foundationApplied),
    dailySettlement: { confirmed: confirmedDaily, draft: draftDaily, confirmedWithoutSnapshot },
    recognitionCandidates: recognition,
    refundTrace: { missingRefundItems, refundAmountMismatch, unlinkedRefundInventory },
    classifications: {
      uniqueMatch: '可由库存出库时间或首次成功支付时间确定，只在 --apply --yes 模式回填。',
      manualReview: '缺少支付或履约证据，必须人工确认。',
      unmatched: '证据不足，不伪造确认时间。',
    },
    nextAction: foundationApplied
      ? '先处理退款追溯和人工确认项，再执行 finance-center:backfill -- --apply --yes。'
      : '目标 migration 尚未部署。本次只输出旧结构基线，不写库。',
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
