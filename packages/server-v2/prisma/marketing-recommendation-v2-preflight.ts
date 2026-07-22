import { config } from 'dotenv';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export const MARKETING_RECOMMENDATION_V2_MIGRATIONS = [
  '20260713180000_marketing_recommendation_instance_foundation',
  '20260713200000_marketing_delivery_jobs',
  '20260713213000_marketing_effect_facts',
] as const;

export type MarketingMigrationBatchGate = {
  status: 'ready' | 'up_to_date' | 'blocked_mixed_batch' | 'blocked_missing_migrations';
  safeForMarketingOnlyDeploy: boolean;
  requiredMarketingMigrations: string[];
  pendingMigrations: string[];
  pendingMarketingMigrations: string[];
  pendingNonMarketingMigrations: string[];
  missingRequiredMarketingMigrations: string[];
};

type StatusCount = {
  status: string;
  _count: { _all: number };
};

type RunningExecution = {
  id: number;
  strategyId: number;
  queuedCount: number;
  executedAt: Date;
};

type MarketingPreflightPrisma = {
  predictionRun: { count(args: unknown): Promise<number> };
  customerPredictionSnapshot: { count(args: unknown): Promise<number> };
  customerOpportunity: { count(args: unknown): Promise<number> };
  marketingActivity: { count(args: unknown): Promise<number> };
  terminalFollowUpTask: { count(args: unknown): Promise<number> };
  marketingRecommendationAdoption: { count(args?: unknown): Promise<number> };
  marketingAutomationTouch: {
    groupBy(args: unknown): Promise<StatusCount[]>;
    count(args: unknown): Promise<number>;
  };
  marketingAutomationExecution: {
    groupBy(args: unknown): Promise<StatusCount[]>;
    findMany(args: unknown): Promise<RunningExecution[]>;
  };
};

export type RecommendationV2PreflightReport = {
  mode: 'read-only';
  generatedAt: string;
  globalPredictionRuns: number;
  storeSnapshotsLinkedToGlobalRuns: number;
  storeOpportunitiesLinkedToGlobalRuns: number;
  legacyRecommendationActivities: number;
  legacyRecommendationTasks: number;
  recommendationAdoptions: number;
  touchStatusDistribution: Record<string, number>;
  executionStatusDistribution: Record<string, number>;
  runningExecutions: Array<{
    executionId: number;
    strategyId: number;
    queuedCount: number;
    touchCount: number;
    executedAt: string;
  }>;
};

function toDistribution(rows: StatusCount[]) {
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))].sort();
}

function resolveMigrationDirectory() {
  const candidates = [
    resolve(process.cwd(), 'prisma', 'migrations'),
    resolve(process.cwd(), 'packages', 'server-v2', 'prisma', 'migrations'),
  ];
  const directory = candidates.find((candidate) => existsSync(candidate));
  if (!directory) throw new Error('Prisma migration directory not found');
  return directory;
}

export function buildMarketingMigrationBatchGate(
  filesystemMigrations: string[],
  appliedMigrations: string[],
): MarketingMigrationBatchGate {
  const requiredMarketingMigrations = [...MARKETING_RECOMMENDATION_V2_MIGRATIONS];
  const allMigrations = uniqueSorted(filesystemMigrations);
  const applied = new Set(uniqueSorted(appliedMigrations));
  const all = new Set(allMigrations);
  const required = new Set<string>(requiredMarketingMigrations);
  const pendingMigrations = allMigrations.filter((migration) => !applied.has(migration));
  const pendingMarketingMigrations = pendingMigrations.filter((migration) => required.has(migration));
  const pendingNonMarketingMigrations = pendingMigrations.filter((migration) => !required.has(migration));
  const missingRequiredMarketingMigrations = requiredMarketingMigrations.filter((migration) => !all.has(migration));
  const status = missingRequiredMarketingMigrations.length > 0
    ? 'blocked_missing_migrations'
    : pendingNonMarketingMigrations.length > 0
      ? 'blocked_mixed_batch'
      : pendingMarketingMigrations.length > 0
        ? 'ready'
        : 'up_to_date';

  return {
    status,
    safeForMarketingOnlyDeploy: status === 'ready' || status === 'up_to_date',
    requiredMarketingMigrations,
    pendingMigrations,
    pendingMarketingMigrations,
    pendingNonMarketingMigrations,
    missingRequiredMarketingMigrations,
  };
}

export function resolveMarketingMigrationGateExitCode(
  gate: Pick<MarketingMigrationBatchGate, 'safeForMarketingOnlyDeploy'>,
  requireMarketingOnly: boolean,
) {
  return requireMarketingOnly && !gate.safeForMarketingOnlyDeploy ? 2 : 0;
}

export async function collectMarketingRecommendationV2Preflight(
  prisma: MarketingPreflightPrisma,
  now = new Date(),
): Promise<RecommendationV2PreflightReport> {
  const [
    globalPredictionRuns,
    storeSnapshotsLinkedToGlobalRuns,
    storeOpportunitiesLinkedToGlobalRuns,
    legacyRecommendationActivities,
    legacyRecommendationTasks,
    recommendationAdoptions,
    touchStatuses,
    executionStatuses,
    running,
  ] = await Promise.all([
    prisma.predictionRun.count({ where: { storeId: null } }),
    prisma.customerPredictionSnapshot.count({ where: { run: { storeId: null } } }),
    prisma.customerOpportunity.count({ where: { predictionRun: { storeId: null } } }),
    prisma.marketingActivity.count({ where: { sourceRecommendationId: { not: null } } }),
    prisma.terminalFollowUpTask.count({ where: { recommendationId: { not: null } } }),
    prisma.marketingRecommendationAdoption.count(),
    prisma.marketingAutomationTouch.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.marketingAutomationExecution.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.marketingAutomationExecution.findMany({
      where: { status: 'running' },
      select: { id: true, strategyId: true, queuedCount: true, executedAt: true },
      orderBy: { executedAt: 'asc' },
    }),
  ]);

  const runningExecutions = await Promise.all(
    running.map(async (execution) => ({
      executionId: execution.id,
      strategyId: execution.strategyId,
      queuedCount: execution.queuedCount,
      touchCount: await prisma.marketingAutomationTouch.count({ where: { executionId: execution.id } }),
      executedAt: execution.executedAt.toISOString(),
    })),
  );

  return {
    mode: 'read-only',
    generatedAt: now.toISOString(),
    globalPredictionRuns,
    storeSnapshotsLinkedToGlobalRuns,
    storeOpportunitiesLinkedToGlobalRuns,
    legacyRecommendationActivities,
    legacyRecommendationTasks,
    recommendationAdoptions,
    touchStatusDistribution: toDistribution(touchStatuses),
    executionStatusDistribution: toDistribution(executionStatuses),
    runningExecutions,
  };
}

async function main() {
  config({ path: '.env' });
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX || 3),
      idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
      connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
    }),
  });

  try {
    const [report, appliedMigrations] = await Promise.all([
      collectMarketingRecommendationV2Preflight(prisma),
      prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
        'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
      ),
    ]);
    const filesystemMigrations = readdirSync(resolveMigrationDirectory(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const migrationBatch = buildMarketingMigrationBatchGate(
      filesystemMigrations,
      appliedMigrations.map((row) => row.migration_name),
    );
    console.log(JSON.stringify({ ...report, migrationBatch }, null, 2));
    process.exitCode = resolveMarketingMigrationGateExitCode(
      migrationBatch,
      process.argv.includes('--require-marketing-only'),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.env.NODE_ENV !== 'test') {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
