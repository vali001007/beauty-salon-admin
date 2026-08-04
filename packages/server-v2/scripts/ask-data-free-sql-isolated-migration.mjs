import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const TARGET_MIGRATION = '20260804170000_ask_data_item_margin';
const EXCLUDED_BRAIN_MIGRATION = '20260801010000_brain_governance_tasks_and_gate_receipts';
const packageRoot = resolve(import.meta.dirname, '..');
const prismaRoot = join(packageRoot, 'prisma');
const migrationsRoot = join(prismaRoot, 'migrations');
const schemaPath = join(prismaRoot, 'schema.prisma');
loadEnv({ path: join(packageRoot, '.env'), quiet: true });
const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--yes');

if (apply && !confirmed) {
  throw new Error('Applying the isolated migration requires both --apply and --yes.');
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error('DATABASE_URL is required.');
const databaseUrl = new URL(connectionString);
if (!isApprovedSupabaseHost(databaseUrl.hostname)) {
  throw new Error(`Refusing unapproved database host: ${databaseUrl.hostname}`);
}

const local = inspectLocalMigrations();
const client = new Client({
  connectionString,
  statement_timeout: 10000,
  query_timeout: 10000,
  application_name: 'ask_data_free_sql_isolated_migration',
});

await client.connect();
try {
  const before = await inspectDatabase(client, local);
  printSummary('preflight', before, local, databaseUrl.hostname);
  if (before.blockers.length) {
    process.exitCode = 1;
  } else if (!apply || before.targetApplied) {
    process.exitCode = 0;
  } else {
    await deployIsolatedMigration(local);
    const after = await inspectDatabase(client, local);
    printSummary('post_apply', after, local, databaseUrl.hostname);
    if (
      after.blockers.length ||
      !after.targetApplied ||
      after.excludedBrainMigrationApplied !== before.excludedBrainMigrationApplied ||
      !after.auditTablePresent
    ) {
      process.exitCode = 1;
    }
  }
} finally {
  await client.end().catch(() => undefined);
}

function isApprovedSupabaseHost(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized.endsWith('.supabase.com') || normalized.endsWith('.supabase.co');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function inspectLocalMigrations() {
  const names = readdirSync(migrationsRoot)
    .filter((name) => statSync(join(migrationsRoot, name)).isDirectory())
    .sort((left, right) => left.localeCompare(right));
  if (!names.includes(TARGET_MIGRATION)) throw new Error(`Missing target migration: ${TARGET_MIGRATION}`);
  if (!names.includes(EXCLUDED_BRAIN_MIGRATION)) {
    throw new Error(`Missing explicitly excluded Brain migration: ${EXCLUDED_BRAIN_MIGRATION}`);
  }
  const laterMigrations = names.filter((name) => name.localeCompare(TARGET_MIGRATION) > 0);
  if (laterMigrations.length) {
    throw new Error(`Refusing because later migrations exist: ${laterMigrations.join(', ')}`);
  }
  // The shared development database can contain unrelated migration-history
  // differences. Copy only the Ask target so Prisma cannot opportunistically
  // deploy another product line while completing this isolated rollout.
  const selectedMigrations = [TARGET_MIGRATION];
  const targetSql = readFileSync(join(migrationsRoot, TARGET_MIGRATION, 'migration.sql'));
  return {
    names,
    selectedMigrations,
    targetChecksum: sha256(targetSql),
  };
}

async function inspectDatabase(db, local) {
  const migrationTable = await db.query(
    "SELECT to_regclass('public.\"_prisma_migrations\"') IS NOT NULL AS present",
  );
  if (!migrationTable.rows[0]?.present) {
    return {
      blockers: ['prisma_migration_table_missing'],
      targetApplied: false,
      excludedBrainMigrationApplied: false,
      auditTablePresent: false,
      failedMigrations: [],
      targetChecksumMatches: false,
    };
  }
  const history = await db.query(
    `SELECT migration_name, checksum, finished_at, rolled_back_at, started_at
       FROM "_prisma_migrations"
      WHERE migration_name = ANY($1::text[])
      ORDER BY migration_name, started_at`,
    [local.names],
  );
  const rowsByName = new Map();
  for (const row of history.rows) {
    const rows = rowsByName.get(row.migration_name) ?? [];
    rows.push(row);
    rowsByName.set(row.migration_name, rows);
  }
  const completedRows = (name) =>
    (rowsByName.get(name) ?? []).filter((row) => Boolean(row.finished_at && !row.rolled_back_at));
  const completed = (name) => completedRows(name).length > 0;
  const failedMigrations = local.names.filter((name) =>
    (rowsByName.get(name) ?? []).some((row) => !row.finished_at && !row.rolled_back_at),
  );
  const target = completedRows(TARGET_MIGRATION).at(-1);
  const targetApplied = completed(TARGET_MIGRATION);
  const targetChecksumMatches = !targetApplied || target?.checksum === local.targetChecksum;
  const excludedBrainMigrationApplied = completed(EXCLUDED_BRAIN_MIGRATION);
  const auditTable = await db.query(
    "SELECT to_regclass('public.ask_data_free_sql_runs') IS NOT NULL AS present",
  );
  const blockers = [];
  if (failedMigrations.length) blockers.push('failed_or_rolled_back_migrations_present');
  if (!targetChecksumMatches) blockers.push('target_checksum_mismatch');
  if (targetApplied && !auditTable.rows[0]?.present) blockers.push('target_applied_but_audit_table_missing');
  return {
    blockers,
    targetApplied,
    excludedBrainMigrationApplied,
    auditTablePresent: Boolean(auditTable.rows[0]?.present),
    failedMigrations,
    targetChecksumMatches,
  };
}

async function deployIsolatedMigration(local) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'ask-data-free-sql-migration-'));
  try {
    const tempPrismaRoot = join(tempRoot, 'prisma');
    const tempMigrationsRoot = join(tempPrismaRoot, 'migrations');
    mkdirSync(tempMigrationsRoot, { recursive: true });
    cpSync(schemaPath, join(tempPrismaRoot, 'schema.prisma'));
    const migrationLock = join(migrationsRoot, 'migration_lock.toml');
    if (existsSync(migrationLock)) cpSync(migrationLock, join(tempMigrationsRoot, 'migration_lock.toml'));
    for (const migration of local.selectedMigrations) {
      cpSync(join(migrationsRoot, migration), join(tempMigrationsRoot, migration), { recursive: true });
    }
    const command = process.platform === 'win32' ? 'cmd.exe' : 'npx';
    const args =
      process.platform === 'win32'
        ? ['/d', '/s', '/c', 'npx.cmd', 'prisma', 'migrate', 'deploy', '--schema', join(tempPrismaRoot, 'schema.prisma')]
        : ['prisma', 'migrate', 'deploy', '--schema', join(tempPrismaRoot, 'schema.prisma')];
    const result = spawnSync(command, args, {
      cwd: packageRoot,
      env: process.env,
      encoding: 'utf8',
      shell: false,
      timeout: 180000,
    });
    if (result.error || result.status !== 0) {
      throw new Error(
        [
          `Isolated Prisma deploy failed with status ${result.status ?? 'unknown'}.`,
          result.error?.message,
          result.stdout?.trim(),
          result.stderr?.trim(),
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function printSummary(phase, state, local, hostname) {
  console.log(
    JSON.stringify(
      {
        status: state.blockers.length ? 'fail' : state.targetApplied ? 'applied' : 'ready',
        phase,
        applyRequested: apply,
        databaseHost: hostname,
        targetMigration: TARGET_MIGRATION,
        excludedMigration: EXCLUDED_BRAIN_MIGRATION,
        localMigrationCount: local.names.length,
        isolatedMigrationCount: local.selectedMigrations.length,
        targetApplied: state.targetApplied,
        excludedBrainMigrationApplied: state.excludedBrainMigrationApplied,
        excludedBrainMigrationPolicy: 'preserve_existing_state',
        auditTablePresent: state.auditTablePresent,
        targetChecksumMatches: state.targetChecksumMatches,
        failedMigrations: state.failedMigrations,
        blockers: state.blockers,
      },
      null,
      2,
    ),
  );
}
