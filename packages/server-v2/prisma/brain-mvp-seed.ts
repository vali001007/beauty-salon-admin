import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { buildBrainMvpSeedPlan } from '../src/brain/seed/brain-mvp-seed-plan.js';

const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--yes');
const dryRun = process.argv.includes('--dry-run') || !apply || !confirmed;

function createPrisma() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
      max: Number(process.env.DATABASE_POOL_MAX || 3),
      idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
    }),
  }) as any;
}

function summary(plan: ReturnType<typeof buildBrainMvpSeedPlan>) {
  return {
    ontologyEntities: plan.ontologyEntities.length,
    ontologyRelations: plan.ontologyRelations.length,
    metrics: plan.metrics.length,
    dimensions: plan.dimensions.length,
    skills: plan.skills.length,
    agentProfiles: plan.agentProfiles.length,
    inspectionRules: plan.inspectionRules.length,
    evalCases: plan.evalCases.length,
  };
}

async function upsertPlan(prisma: any, plan: ReturnType<typeof buildBrainMvpSeedPlan>) {
  for (const item of plan.ontologyEntities) {
    await prisma.brainOntologyEntity.upsert({
      where: { entityKey_version: { entityKey: item.entityKey, version: item.version } },
      update: item,
      create: item,
    });
  }

  for (const item of plan.ontologyRelations) {
    await prisma.brainOntologyRelation.upsert({
      where: { relationKey_version: { relationKey: item.relationKey, version: item.version } },
      update: item,
      create: item,
    });
  }

  for (const item of plan.metrics) {
    await prisma.brainMetric.upsert({
      where: { metricKey_version: { metricKey: item.metricKey, version: item.version } },
      update: item,
      create: item,
    });
  }

  for (const item of plan.dimensions) {
    await prisma.brainDimension.upsert({
      where: { dimensionKey_version: { dimensionKey: item.dimensionKey, version: item.version } },
      update: item,
      create: item,
    });
  }

  for (const item of plan.skills) {
    await prisma.brainSkillRegistry.upsert({
      where: { skillKey_version: { skillKey: item.skillKey, version: item.version } },
      update: item,
      create: item,
    });
  }

  for (const item of plan.agentProfiles) {
    await prisma.brainAgentProfile.upsert({
      where: { roleKey_version: { roleKey: item.roleKey, version: item.version } },
      update: item,
      create: item,
    });
  }

  for (const item of plan.inspectionRules) {
    await prisma.brainInspectionRule.upsert({
      where: { ruleKey_version: { ruleKey: item.ruleKey, version: item.version } },
      update: item,
      create: item,
    });
  }

  for (const item of plan.evalCases) {
    await prisma.brainEvalCase.upsert({
      where: { caseKey: item.caseKey },
      update: item,
      create: item,
    });
  }
}

async function main() {
  const plan = buildBrainMvpSeedPlan();
  const report = { mode: dryRun ? 'dry-run' : 'apply', ...summary(plan) };

  if (dryRun) {
    console.log(JSON.stringify(report, null, 2));
    if (apply && !confirmed) {
      console.log('写库需显式传入 --apply --yes。');
    }
    return;
  }

  const prisma = createPrisma();
  try {
    await upsertPlan(prisma, plan);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: 'failed',
        message:
          error?.code === 'P2021'
            ? '当前数据库缺少 brain_* 表，请先获得授权并执行 Prisma 迁移。'
            : 'Brain MVP 种子执行失败。',
        details: error?.message ?? String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
