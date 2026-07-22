import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: resolve(import.meta.dirname, '..', '.env') });

const flags = new Set(process.argv.slice(2));
const apply = flags.has('--apply');
const yes = flags.has('--yes');
if (apply && !yes) throw new Error('真实回填必须同时传入 --apply --yes。');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter });

type Candidate = { movementId: number; orderItemId: number; movementType: string };

async function main() {
  const candidates = await prisma.$queryRaw<Candidate[]>`
    SELECT sm.id AS "movementId", MIN(oi.id)::int AS "orderItemId", sm."movementType"
    FROM "StockMovement" sm
    JOIN "OrderItem" oi
      ON oi."orderId" = sm."sourceId"
     AND ((sm."movementType" = 'sale_out' AND oi."itemType" IN ('product', 'goods') AND oi."itemId" = sm."productId")
       OR (sm."movementType" = 'service_consume' AND oi."itemType" IN ('project', 'service', 'service_project')))
    WHERE sm."orderItemId" IS NULL
      AND sm."movementType" IN ('sale_out', 'service_consume')
    GROUP BY sm.id, sm."movementType"
    HAVING COUNT(DISTINCT oi.id) = 1
    ORDER BY sm.id
  `;

  const ambiguousRows = await prisma.$queryRaw<Array<{ count: bigint | number | string }>>`
    SELECT COUNT(*) AS count FROM "StockMovement"
    WHERE "orderItemId" IS NULL AND "movementType" IN ('sale_out', 'service_consume')
  `;
  const totalUnlinked = Number(ambiguousRows[0]?.count ?? 0);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', uniqueCandidates: candidates.length, ambiguousOrUnmatched: totalUnlinked - candidates.length }, null, 2));

  if (!apply) return;
  const updated = await prisma.$executeRaw`
    WITH candidates AS (
      SELECT sm.id AS "movementId", MIN(oi.id)::int AS "orderItemId"
      FROM "StockMovement" sm
      JOIN "OrderItem" oi
        ON oi."orderId" = sm."sourceId"
       AND ((sm."movementType" = 'sale_out' AND oi."itemType" IN ('product', 'goods') AND oi."itemId" = sm."productId")
         OR (sm."movementType" = 'service_consume' AND oi."itemType" IN ('project', 'service', 'service_project')))
      WHERE sm."orderItemId" IS NULL
        AND sm."movementType" IN ('sale_out', 'service_consume')
      GROUP BY sm.id
      HAVING COUNT(DISTINCT oi.id) = 1
    )
    UPDATE "StockMovement" sm
    SET "orderItemId" = candidates."orderItemId"
    FROM candidates
    WHERE sm.id = candidates."movementId"
  `;
  console.log(`已回填 ${updated} 条唯一可追溯库存流水；歧义记录未修改。`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
