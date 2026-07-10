import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }),
});

async function main() {
  const [metrics, dimensions, skills, roles, rules, evalCases] = await Promise.all([
    prisma.brainMetric.count(),
    prisma.brainDimension.count(),
    prisma.brainSkillRegistry.count(),
    prisma.brainAgentProfile.count(),
    prisma.brainInspectionRule.count(),
    prisma.brainEvalCase.count({ where: { enabled: true } }),
  ]);

  const summary = { metrics, dimensions, skills, roles, rules, evalCases };
  console.log(JSON.stringify(summary, null, 2));

  if (metrics < 12 || dimensions < 8 || skills < 12 || roles < 7 || rules < 6 || evalCases < 40) {
    process.exit(1);
  }
}

main()
  .catch((error) => {
    const cause = error?.cause as { code?: string; message?: string } | undefined;
    console.error(
      JSON.stringify(
        {
          status: 'failed',
          code: error?.code ?? cause?.code,
          message:
            error?.code === 'P2021'
              ? '当前数据库缺少 brain_* 表，请先获得授权并执行 Prisma 迁移。'
              : 'Brain MVP readiness 无法连接或校验数据库。',
          details: error?.message ?? String(error),
          cause: cause?.message,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
