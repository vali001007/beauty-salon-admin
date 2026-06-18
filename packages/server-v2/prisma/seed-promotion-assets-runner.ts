import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedPromotionAssets, verifyPromotionAssets } from './seed-promotion-assets.ts';

const verifyOnly = process.argv.includes('--verify');
const dryRun = !process.argv.includes('--apply');
const confirmed = process.argv.includes('--yes');

if (!verifyOnly && !dryRun && !confirmed) {
  throw new Error('写入权益资产库需要同时传入 --apply --yes');
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

async function main() {
  if (verifyOnly) {
    const result = await verifyPromotionAssets(prisma);
    console.log(JSON.stringify({
      mode: 'verify',
      ...result,
    }, null, 2));
    if (!result.complete) {
      process.exitCode = 1;
    }
    return;
  }

  const beforeCount = await prisma.promotion.count();
  const result = await seedPromotionAssets(prisma, dryRun);
  const afterCount = dryRun ? beforeCount : await prisma.promotion.count();

  console.log(JSON.stringify({
    mode: dryRun ? 'dry-run' : 'apply',
    beforeCount,
    afterCount,
    created: result.created,
    skipped: result.skipped,
    expectedAfterCount: dryRun ? beforeCount + result.created : afterCount,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
