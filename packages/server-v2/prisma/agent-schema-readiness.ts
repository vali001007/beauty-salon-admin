import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname, '..', '.env') });

import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type SchemaGroup = {
  code: 'memory_archive' | 'automation_engine';
  name: string;
  migration: string;
  requiredTables: string[];
};

const allowPending = process.argv.includes('--allow-pending');
const groupArg = process.argv.find((arg) => arg.startsWith('--group='))?.split('=')[1] ?? 'all';
if (!['all', 'memory_archive', 'automation_engine'].includes(groupArg)) {
  throw new Error('--group must be one of: all, memory_archive, automation_engine.');
}

const schemaGroups: SchemaGroup[] = [
  {
    code: 'memory_archive',
    name: '阶段 6 记忆归档',
    migration: '20260626123000_agent_memory_archive',
    requiredTables: ['agent_memories', 'agent_daily_archives'],
  },
  {
    code: 'automation_engine',
    name: '阶段 7 自动化执行引擎',
    migration: '20260626160000_agent_automation_engine',
    requiredTables: ['agent_automation_definitions', 'agent_automation_runs', 'agent_automation_effects'],
  },
];

const requiredTables = schemaGroups.flatMap((group) => group.requiredTables);
const requiredMigrations = schemaGroups.map((group) => group.migration);
const selectedGroups = groupArg === 'all' ? schemaGroups : schemaGroups.filter((group) => group.code === groupArg);
const selectedTables = selectedGroups.flatMap((group) => group.requiredTables);
const selectedMigrations = selectedGroups.map((group) => group.migration);

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.DATABASE_POOL_MAX || 3),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

async function listExistingTables() {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>(Prisma.sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_type = 'BASE TABLE'
      AND table_name IN (${Prisma.join([...selectedTables, '_prisma_migrations'])})
  `);
  return new Set(rows.map((row) => row.table_name));
}

async function listAppliedMigrations(migrationTableExists: boolean) {
  if (!migrationTableExists) return new Set<string>();
  const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>(Prisma.sql`
    SELECT migration_name
    FROM "_prisma_migrations"
    WHERE migration_name IN (${Prisma.join(selectedMigrations)})
      AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL
  `);
  return new Set(rows.map((row) => row.migration_name));
}

async function main() {
  const existingTables = await listExistingTables();
  const appliedMigrations = await listAppliedMigrations(existingTables.has('_prisma_migrations'));
  const groups = selectedGroups.map((group) => {
    const missingTables = group.requiredTables.filter((tableName) => !existingTables.has(tableName));
    const migrationApplied = appliedMigrations.has(group.migration);
    return {
      ...group,
      ready: missingTables.length === 0 && migrationApplied,
      migrationApplied,
      missingTables,
    };
  });
  const missingTables = groups.flatMap((group) => group.missingTables);
  const missingMigrations = groups.filter((group) => !group.migrationApplied).map((group) => group.migration);
  const ready = missingTables.length === 0 && missingMigrations.length === 0;

  console.log(JSON.stringify({ ready, group: groupArg, groups, missingTables, missingMigrations }, null, 2));
  if (!ready && !allowPending) {
    console.error('Agent schema is not ready. Apply pending migrations before T6.7/T7.13 runtime E2E.');
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
