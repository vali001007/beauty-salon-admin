import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  CARD_MASTER_MERGE_MAP,
  applyCardMasterDeduplication,
  auditCardMasterDeduplication,
} from '../src/cards/card-master-deduplication.js';

config({ path: resolve(import.meta.dirname, '..', '.env') });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
const prisma = new PrismaClient({ adapter });
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const confirmed = args.has('--yes');

function json(value: unknown) {
  return JSON.stringify(
    value,
    (_key, entryValue) => {
      if (typeof entryValue === 'bigint') return entryValue.toString();
      if (entryValue && typeof entryValue === 'object' && typeof entryValue.toJSON === 'function') {
        return entryValue.toJSON();
      }
      return entryValue;
    },
    2,
  );
}

function createBackup(audit: Awaited<ReturnType<typeof auditCardMasterDeduplication>>) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = resolve(import.meta.dirname, '..', '..', '..', 'outputs', 'card-master-deduplication');
  const path = resolve(directory, `card-master-backup-${timestamp}.json`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path,
    json({
      createdAt: new Date().toISOString(),
      mappings: CARD_MASTER_MERGE_MAP,
      conservation: audit.conservation,
      snapshot: audit.snapshot,
    }),
    'utf8',
  );
  return path;
}

async function main() {
  if (apply !== confirmed) {
    throw new Error('真实归并必须同时传入 --apply --yes；不传参数时只执行 dry-run。');
  }

  const audit = await auditCardMasterDeduplication(prisma);
  const readyToApply = audit.groups.every((group) => group.blockers.length === 0);
  console.log(
    json({
      mode: apply ? 'apply-preflight' : 'dry-run/read-only',
      status: audit.status,
      readyToApply,
      mappings: audit.groups.map(({ sourceId, targetId, status, blockers, warnings, references }) => ({
        sourceId,
        targetId,
        status,
        blockers,
        warnings,
        references,
      })),
      conservation: audit.conservation,
    }),
  );

  if (!apply) return;
  if (!readyToApply) throw new Error('dry-run 存在 blocked 项，禁止写库。');

  const backupPath = createBackup(audit);
  console.log(json({ backupPath }));
  const result = await applyCardMasterDeduplication(prisma);

  const [remainingCards, oldCustomerCardRefs, oldUsageRefs, oldOrderItemRefs, retainedCards] = await Promise.all([
    prisma.card.findMany({
      where: { id: { in: CARD_MASTER_MERGE_MAP.map((item) => item.sourceId) } },
      select: { id: true },
    }),
    prisma.customerCard.count({ where: { cardId: { in: CARD_MASTER_MERGE_MAP.map((item) => item.sourceId) } } }),
    prisma.cardUsageRecord.count({ where: { cardId: { in: CARD_MASTER_MERGE_MAP.map((item) => item.sourceId) } } }),
    prisma.orderItem.count({
      where: {
        itemType: { in: ['card', 'card_sale', 'customer_card', 'member_card'] },
        itemId: { in: CARD_MASTER_MERGE_MAP.map((item) => item.sourceId) },
      },
    }),
    prisma.card.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true, storeId: true, totalTimes: true, projects: true },
    }),
  ]);
  const liveVerify = {
    remainingDuplicateCardIds: remainingCards.map((card) => card.id),
    oldReferences: { customerCards: oldCustomerCardRefs, usageRecords: oldUsageRefs, orderItems: oldOrderItemRefs },
    retainedCards,
  };
  if (remainingCards.length || oldCustomerCardRefs || oldUsageRefs || oldOrderItemRefs) {
    throw new Error(`归并后 live verify 失败：${json(liveVerify)}`);
  }
  console.log(json({ result, liveVerify }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
