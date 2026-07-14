import { config } from 'dotenv';
import { resolve } from 'path';
import { mkdir, writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: resolve(import.meta.dirname, '..', '.env') });

const flags = new Set(process.argv.slice(2));
const apply = flags.has('--apply');
const yes = flags.has('--yes');
if (apply && !yes) throw new Error('真实回填必须同时传入 --apply --yes。');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter });
type CountRow = { count: bigint | number | string };
const count = (rows: CountRow[]) => Number(rows[0]?.count ?? 0);

async function main() {
  const foundation = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'OrderItem' AND column_name = 'recognizedAt'
  `;
  if (!count(foundation)) throw new Error('财务中心 foundation migration 尚未部署，禁止回填。');

  const saleOutCandidates = count(await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count FROM "OrderItem" oi
    WHERE oi."recognizedAt" IS NULL
      AND EXISTS (SELECT 1 FROM "StockMovement" sm WHERE sm."orderItemId" = oi.id AND sm."movementType" = 'sale_out')
  `);
  const paymentCandidates = count(await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count FROM "OrderItem" oi
    WHERE oi."recognizedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "StockMovement" sm WHERE sm."orderItemId" = oi.id AND sm."movementType" = 'sale_out')
      AND EXISTS (SELECT 1 FROM "PaymentRecord" pr WHERE pr."orderId" = oi."orderId" AND pr.status = 'success')
  `);
  const unmatched = count(await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count FROM "OrderItem" oi
    WHERE oi."recognizedAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM "StockMovement" sm WHERE sm."orderItemId" = oi.id AND sm."movementType" = 'sale_out')
      AND NOT EXISTS (SELECT 1 FROM "PaymentRecord" pr WHERE pr."orderId" = oi."orderId" AND pr.status = 'success')
  `);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', uniqueMatch: saleOutCandidates + paymentCandidates, saleOutCandidates, paymentCandidates, manualReviewOrUnmatched: unmatched }, null, 2));
  if (!apply) return;

  const backupRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
    SELECT oi.id, oi."orderId", oi."recognizedAt", oi."recognitionSource"
    FROM "OrderItem" oi
    WHERE oi."recognizedAt" IS NULL
      AND (
        EXISTS (SELECT 1 FROM "StockMovement" sm WHERE sm."orderItemId" = oi.id AND sm."movementType" = 'sale_out')
        OR EXISTS (SELECT 1 FROM "PaymentRecord" pr WHERE pr."orderId" = oi."orderId" AND pr.status = 'success')
      )
    ORDER BY oi.id
  `);
  const backupDir = resolve(import.meta.dirname, '..', '..', '..', 'outputs', 'finance-center-backfill');
  await mkdir(backupDir, { recursive: true });
  const backupPath = resolve(backupDir, `order-item-recognition-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), rows: backupRows }, null, 2), 'utf8');

  const saleOutUpdated = await prisma.$executeRaw`
    UPDATE "OrderItem" oi
    SET "recognizedAt" = source."occurredAt", "recognitionSource" = 'sale_out_backfill'
    FROM (
      SELECT sm."orderItemId", MIN(sm."occurredAt") AS "occurredAt"
      FROM "StockMovement" sm
      WHERE sm."movementType" = 'sale_out' AND sm."orderItemId" IS NOT NULL
      GROUP BY sm."orderItemId"
    ) source
    WHERE oi.id = source."orderItemId" AND oi."recognizedAt" IS NULL
  `;
  const paymentUpdated = await prisma.$executeRaw`
    UPDATE "OrderItem" oi
    SET "recognizedAt" = source."paidAt", "recognitionSource" = 'first_successful_payment_backfill'
    FROM (
      SELECT pr."orderId", MIN(pr."paidAt") AS "paidAt"
      FROM "PaymentRecord" pr WHERE pr.status = 'success' GROUP BY pr."orderId"
    ) source
    WHERE oi."orderId" = source."orderId" AND oi."recognizedAt" IS NULL
  `;
  console.log(JSON.stringify({ applied: true, backupPath, saleOutUpdated, paymentUpdated, untouchedForManualReview: unmatched }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
