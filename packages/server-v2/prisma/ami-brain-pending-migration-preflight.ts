import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '..', '.env') });

import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  BEAUTICIAN_BRAIN_SELF_PERMISSION_MIGRATION,
  buildBrainPendingMigrationPreflight,
  CUSTOMER_FEEDBACK_REQUIRED_COLUMNS,
  CUSTOMER_FEEDBACK_REQUIRED_CONSTRAINTS,
  CUSTOMER_FEEDBACK_REQUIRED_INDEXES,
  CUSTOMER_SERVICE_FEEDBACK_MIGRATION,
  CUSTOMER_WAITING_EPISODE_MIGRATION,
  STORE_MANAGER_SUPPLY_PERMISSION_MIGRATION,
  type BrainMigrationHistoryState,
  type BrainMigrationPreflightInput,
  type BrainPendingMigrationPreflightResult,
} from '../src/brain/governance/brain-pending-migration-preflight.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required for read-only migration preflight.');

const adapter = new PrismaPg({
  connectionString,
  max: Number(process.env.DATABASE_POOL_MAX || 1),
  idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 10000),
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000),
});
const prisma = new PrismaClient({ adapter });

const MIGRATION_NAMES = [
  STORE_MANAGER_SUPPLY_PERMISSION_MIGRATION,
  CUSTOMER_SERVICE_FEEDBACK_MIGRATION,
  CUSTOMER_WAITING_EPISODE_MIGRATION,
  BEAUTICIAN_BRAIN_SELF_PERMISSION_MIGRATION,
] as const;

type MigrationRow = {
  migration_name: string;
  started_at: Date;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  logs: string | null;
};

function argValue(name: string) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function historyState(row?: MigrationRow): BrainMigrationHistoryState {
  if (!row) return { status: 'pending' };
  if (row.rolled_back_at) {
    return {
      status: 'rolled_back',
      finishedAt: row.finished_at?.toISOString() ?? null,
      rolledBackAt: row.rolled_back_at.toISOString(),
      logs: row.logs,
    };
  }
  if (row.finished_at) {
    return { status: 'applied', finishedAt: row.finished_at.toISOString(), rolledBackAt: null, logs: row.logs };
  }
  return { status: 'failed', finishedAt: null, rolledBackAt: null, logs: row.logs };
}

async function tableNames(names: readonly string[]) {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>(Prisma.sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name IN (${Prisma.join(names)})
  `);
  return new Set(rows.map((row) => row.table_name));
}

async function columnsFor(tableName: string) {
  const rows = await prisma.$queryRaw<Array<{ column_name: string }>>(Prisma.sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = ${tableName}
    ORDER BY ordinal_position
  `);
  return rows.map((row) => row.column_name);
}

async function constraintsFor(tableName: string) {
  const rows = await prisma.$queryRaw<Array<{ constraint_name: string }>>(Prisma.sql`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = current_schema()
      AND table_name = ${tableName}
    ORDER BY constraint_name
  `);
  return rows.map((row) => row.constraint_name);
}

async function indexesFor(tableName: string) {
  const rows = await prisma.$queryRaw<Array<{ indexname: string }>>(Prisma.sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = ${tableName}
    ORDER BY indexname
  `);
  return rows.map((row) => row.indexname);
}

async function migrationRows(migrationTableExists: boolean) {
  if (!migrationTableExists) return [];
  return prisma.$queryRaw<MigrationRow[]>(Prisma.sql`
    SELECT DISTINCT ON (migration_name)
      migration_name,
      started_at,
      finished_at,
      rolled_back_at,
      logs
    FROM "_prisma_migrations"
    WHERE migration_name IN (${Prisma.join(MIGRATION_NAMES)})
    ORDER BY migration_name, started_at DESC
  `);
}

async function collectInput(): Promise<BrainMigrationPreflightInput> {
  const tables = await tableNames([
    '_prisma_migrations',
    'Role',
    'Store',
    'Customer',
    'Reservation',
    'customer_service_feedback',
    'customer_waiting_episode',
  ]);
  const migrationTableExists = tables.has('_prisma_migrations');
  const roleTableExists = tables.has('Role');
  const customerFeedbackTableExists = tables.has('customer_service_feedback');
  const customerWaitingTableExists = tables.has('customer_waiting_episode');
  const [
    migrationRecords,
    roleColumns,
    feedbackColumns,
    feedbackConstraints,
    feedbackIndexes,
    waitingColumns,
    waitingConstraints,
    waitingIndexes,
  ] = await Promise.all([
    migrationRows(migrationTableExists),
    roleTableExists ? columnsFor('Role') : Promise.resolve([]),
    customerFeedbackTableExists ? columnsFor('customer_service_feedback') : Promise.resolve([]),
    customerFeedbackTableExists ? constraintsFor('customer_service_feedback') : Promise.resolve([]),
    customerFeedbackTableExists ? indexesFor('customer_service_feedback') : Promise.resolve([]),
    customerWaitingTableExists ? columnsFor('customer_waiting_episode') : Promise.resolve([]),
    customerWaitingTableExists ? constraintsFor('customer_waiting_episode') : Promise.resolve([]),
    customerWaitingTableExists ? indexesFor('customer_waiting_episode') : Promise.resolve([]),
  ]);
  const migrationByName = new Map(migrationRecords.map((row) => [row.migration_name, row]));
  const storeManagerRole = roleTableExists
    ? await prisma.role.findUnique({ where: { key: 'store_manager' }, select: { status: true, permissions: true } })
    : null;
  const beauticianRole = roleTableExists
    ? await prisma.role.findUnique({ where: { key: 'beautician' }, select: { status: true, permissions: true } })
    : null;

  return {
    migrationTableExists,
    migrations: {
      [STORE_MANAGER_SUPPLY_PERMISSION_MIGRATION]: historyState(
        migrationByName.get(STORE_MANAGER_SUPPLY_PERMISSION_MIGRATION),
      ),
      [CUSTOMER_SERVICE_FEEDBACK_MIGRATION]: historyState(migrationByName.get(CUSTOMER_SERVICE_FEEDBACK_MIGRATION)),
      [CUSTOMER_WAITING_EPISODE_MIGRATION]: historyState(migrationByName.get(CUSTOMER_WAITING_EPISODE_MIGRATION)),
      [BEAUTICIAN_BRAIN_SELF_PERMISSION_MIGRATION]: historyState(
        migrationByName.get(BEAUTICIAN_BRAIN_SELF_PERMISSION_MIGRATION),
      ),
    },
    roleSchema: { tableExists: roleTableExists, columns: roleColumns },
    storeManagerRole: {
      exists: Boolean(storeManagerRole),
      status: storeManagerRole?.status ?? null,
      permissions: storeManagerRole?.permissions ?? [],
    },
    beauticianRole: {
      exists: Boolean(beauticianRole),
      status: beauticianRole?.status ?? null,
      permissions: beauticianRole?.permissions ?? [],
    },
    customerFeedbackSchema: {
      tableExists: customerFeedbackTableExists,
      columns: feedbackColumns,
      constraints: feedbackConstraints,
      indexes: feedbackIndexes,
    },
    customerWaitingSchema: {
      tableExists: customerWaitingTableExists,
      columns: waitingColumns,
      constraints: waitingConstraints,
      indexes: waitingIndexes,
    },
    dependencies: {
      Store: tables.has('Store'),
      Customer: tables.has('Customer'),
      Reservation: tables.has('Reservation'),
    },
  };
}

function markdownList(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- 无';
}

function renderMarkdown(result: BrainPendingMigrationPreflightResult) {
  const migrationSections = result.migrations
    .map((migration, index) => {
      const checks = migration.checks
        .map((check) => `| ${check.key} | ${check.status} | ${check.message} |`)
        .join('\n');
      return `## ${index + 2}. ${migration.migrationName}\n\n- 状态：\`${migration.status}\`\n- 允许直接进入执行审批：${migration.directApplyAllowed ? '是' : '否'}\n- 结论：${migration.summary}\n- 回滚边界：${migration.rollbackBoundary}\n\n| 检查项 | 状态 | 说明 |\n| --- | --- | --- |\n${checks}\n\n风险：\n\n${markdownList(migration.risks)}`;
    })
    .join('\n\n');

  return `# Ami Brain 待迁移项只读预检报告\n\n生成时间：${result.generatedAt}\n\n## 1. 总结\n\n- 总体状态：\`${result.status}\`\n- 数据库写入：未执行\n- 是否进入审批：${result.approval.decisionRequired ? '是' : '否'}\n- 审批动作：通过 / 修改 / 拒绝\n- 审批摘要：${result.approval.summary}\n\n${migrationSections}\n\n## ${result.migrations.length + 2}. 执行边界\n\n- 本脚本只读取 migration 历史、系统目录、Role、store_manager 和 beautician 权限。\n- 本脚本不会执行 migration、resolve、DDL、DML、回填或权限修改。\n- 只有状态为 \`ready\` 且用户另行明确授权后，才可进入 apply -> verify。\n`;
}

async function main() {
  const input = await collectInput();
  const result = buildBrainPendingMigrationPreflight(input);
  const outPath = argValue('out');
  if (outPath) {
    const resolvedPath = resolve(process.cwd(), outPath);
    mkdirSync(dirname(resolvedPath), { recursive: true });
    writeFileSync(resolvedPath, renderMarkdown(result), 'utf8');
  }
  console.log(JSON.stringify({ ...result, databaseWritePerformed: false }, null, 2));
  if (process.argv.includes('--strict') && result.status !== 'ready' && result.status !== 'already_applied') {
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
