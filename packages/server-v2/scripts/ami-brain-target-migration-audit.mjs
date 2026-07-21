import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { config } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const packageRoot = resolve(import.meta.dirname, '..');
const migrationsRoot = join(packageRoot, 'prisma', 'migrations');
const checksumExceptionsPath = join(packageRoot, 'prisma', 'migration-checksum-exceptions.json');

config({ path: join(packageRoot, '.env') });

function argValue(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function inspectMigrations() {
  const migrations = readdirSync(migrationsRoot)
    .filter((name) => statSync(join(migrationsRoot, name)).isDirectory())
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const sqlPath = join(migrationsRoot, name, 'migration.sql');
      if (!existsSync(sqlPath)) throw new Error(`Migration is missing migration.sql: ${name}`);
      const sql = readFileSync(sqlPath);
      if (sql.length === 0) throw new Error(`Migration SQL is empty: ${name}`);
      const text = sql.toString('utf8');
      const checksums = {
        raw: sha256(sql),
        lf: sha256(text.replace(/\r\n/g, '\n')),
        crlf: sha256(text.replace(/\r?\n/g, '\r\n')),
      };
      return { name, checksums, bytes: sql.length };
    });

  return {
    migrations,
    count: migrations.length,
    first: migrations[0]?.name ?? null,
    latest: migrations.at(-1)?.name ?? null,
    rawChainHash: sha256(migrations.map((item) => `${item.name}:${item.checksums.raw}`).join('\n')),
    canonicalLfChainHash: sha256(migrations.map((item) => `${item.name}:${item.checksums.lf}`).join('\n')),
  };
}

function sanitizeDatabaseTarget(connectionString) {
  const parsed = new URL(connectionString);
  return {
    protocol: parsed.protocol.replace(':', ''),
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.replace(/^\//, ''),
    schema: parsed.searchParams.get('schema') || 'public',
  };
}

function loadChecksumExceptions() {
  if (!existsSync(checksumExceptionsPath)) return { version: 0, targets: [] };
  const manifest = JSON.parse(readFileSync(checksumExceptionsPath, 'utf8'));
  if (!Number.isInteger(manifest.version) || !Array.isArray(manifest.targets)) {
    throw new Error('Invalid migration checksum exception manifest.');
  }
  return manifest;
}

function applyChecksumExceptions(history, target, manifest) {
  const targetException = manifest.targets.find(
    (candidate) =>
      candidate.host === target.host &&
      String(candidate.port) === String(target.port) &&
      candidate.database === target.database &&
      candidate.schema === target.schema,
  );
  const approved = [];
  const unresolved = [];
  for (const mismatch of history.checksumMismatchDetails) {
    const exception = targetException?.exceptions?.find(
      (candidate) =>
        candidate.migration === mismatch.migration && candidate.recordedChecksum === mismatch.recordedChecksum,
    );
    if (exception) {
      approved.push({
        migration: mismatch.migration,
        recordedChecksum: mismatch.recordedChecksum,
        approvedAt: targetException.approvedAt,
        approvalScope: targetException.approvalScope,
        reason: targetException.reason,
      });
    } else {
      unresolved.push(mismatch);
    }
  }
  return {
    ...history,
    checksumMismatches: unresolved.map((mismatch) => mismatch.migration),
    checksumMismatchDetails: unresolved,
    approvedChecksumExceptions: approved,
    checksumExceptionManifest: {
      version: manifest.version,
      targetMatched: Boolean(targetException),
      path: 'prisma/migration-checksum-exceptions.json',
    },
  };
}

async function queryRows(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

async function collectHistory(client, inventory) {
  const tableRows = await queryRows(client, `SELECT to_regclass('public."_prisma_migrations"')::text AS name`);
  const migrationTableExists = Boolean(tableRows[0]?.name);
  if (!migrationTableExists) {
    return {
      migrationTableExists: false,
      appliedCount: 0,
      pending: inventory.migrations.map((migration) => migration.name),
      checksumMismatches: [],
      checksumMismatchDetails: [],
      lineEndingVariants: [],
      failedOrRolledBack: [],
      unexpected: [],
      duplicateHistory: [],
    };
  }

  const rows = await queryRows(
    client,
    `SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, logs
     FROM "_prisma_migrations"
     ORDER BY migration_name, started_at`,
  );
  const expected = new Map(inventory.migrations.map((migration) => [migration.name, migration.checksums]));
  const grouped = new Map();
  for (const row of rows) {
    const values = grouped.get(row.migration_name) ?? [];
    values.push(row);
    grouped.set(row.migration_name, values);
  }
  const latestRows = [...grouped.values()].map((values) => values.at(-1));
  const appliedNames = new Set(
    latestRows
      .filter((row) => row.finished_at && !row.rolled_back_at)
      .map((row) => row.migration_name),
  );

  const checksumMismatchDetails = latestRows
    .filter((row) => {
      const checksums = expected.get(row.migration_name);
      return checksums && !Object.values(checksums).includes(row.checksum);
    })
    .map((row) => ({
      migration: row.migration_name,
      recordedChecksum: row.checksum,
      localChecksums: expected.get(row.migration_name),
    }));

  return {
    migrationTableExists: true,
    appliedCount: appliedNames.size,
    pending: inventory.migrations
      .filter((migration) => !appliedNames.has(migration.name))
      .map((migration) => migration.name),
    checksumMismatches: checksumMismatchDetails.map((mismatch) => mismatch.migration),
    checksumMismatchDetails,
    lineEndingVariants: latestRows
      .filter((row) => {
        const checksums = expected.get(row.migration_name);
        return checksums && row.checksum !== checksums.raw && Object.values(checksums).includes(row.checksum);
      })
      .map((row) => ({
        migration: row.migration_name,
        recordedAs: row.checksum === expected.get(row.migration_name).lf ? 'lf' : 'crlf',
      })),
    failedOrRolledBack: latestRows
      .filter((row) => !row.finished_at || row.rolled_back_at)
      .map((row) => ({
        migration: row.migration_name,
        finishedAt: row.finished_at?.toISOString?.() ?? row.finished_at ?? null,
        rolledBackAt: row.rolled_back_at?.toISOString?.() ?? row.rolled_back_at ?? null,
        hasLogs: Boolean(row.logs),
      })),
    unexpected: latestRows
      .filter((row) => !expected.has(row.migration_name))
      .map((row) => row.migration_name),
    duplicateHistory: [...grouped.entries()]
      .filter(([, values]) => values.length > 1)
      .map(([migration, values]) => ({ migration, records: values.length })),
  };
}

async function collectCriticalStructure(client) {
  const requiredTables = [
    'CustomerBehaviorEvent',
    'agent_v3_text_to_sql_feedback',
    'agent_v3_text_to_sql_runs',
    'agent_v3_text_to_sql_semantic_views',
    'brain_action_execution',
    'brain_capability_regeneration_job',
    'customer_service_feedback',
    'customer_waiting_episode',
    'store_metric_target',
  ];
  const requiredColumns = [
    ['MarketingActivity', 'predictionRunId'],
    ['MarketingActivity', 'audienceSnapshotId'],
    ['MarketingActivity', 'sourceSignalsJson'],
    ['MarketingActivity', 'offerJson'],
    ['MarketingActivity', 'recommendedItemsJson'],
    ['MarketingActivity', 'audienceSnapshotJson'],
    ['CustomerBalanceTransaction', 'operatorId'],
    ['Project', 'recommend'],
    ['Project', 'online'],
    ['Project', 'home'],
    ['Project', 'sort'],
    ['CardUsageRecord', 'idempotencyKey'],
    ['PurchaseOrder', 'idempotencyKey'],
    ['PurchaseOrder', 'creationFingerprint'],
    ['Reservation', 'idempotencyKey'],
    ['Reservation', 'creationFingerprint'],
    ['TerminalFollowUpTask', 'idempotencyKey'],
    ['TerminalFollowUpTask', 'creationFingerprint'],
    ['ProcurementOrder', 'idempotencyKey'],
    ['ProcurementOrder', 'creationFingerprint'],
    ['ProcurementReceipt', 'idempotencyKey'],
    ['ProcurementReceipt', 'creationFingerprint'],
  ];
  const requiredIndexes = [
    'CardUsageRecord_idempotencyKey_key',
    'PurchaseOrder_idempotencyKey_key',
    'Reservation_idempotencyKey_key',
    'TerminalFollowUpTask_idempotencyKey_key',
    'ProcurementOrder_idempotencyKey_key',
    'ProcurementReceipt_idempotencyKey_key',
  ];

  const tables = await queryRows(
    client,
    `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = current_schema()`,
  );
  const columns = await queryRows(
    client,
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()`,
  );
  const indexes = await queryRows(client, `SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()`);
  const tableSet = new Set(tables.map((row) => row.table_name));
  const columnSet = new Set(columns.map((row) => `${row.table_name}.${row.column_name}`));
  const indexSet = new Set(indexes.map((row) => row.indexname));

  return {
    agentV3SemanticViewCount: tables.filter(
      (row) => row.table_type === 'VIEW' && row.table_name.startsWith('agent_v3_') && row.table_name.endsWith('_view'),
    ).length,
    missingTables: requiredTables.filter((table) => !tableSet.has(table)),
    missingColumns: requiredColumns
      .map(([table, column]) => `${table}.${column}`)
      .filter((column) => !columnSet.has(column)),
    missingIndexes: requiredIndexes.filter((index) => !indexSet.has(index)),
  };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for read-only target migration audit.');
  const inventory = inspectMigrations();
  const checksumExceptions = loadChecksumExceptions();
  const client = new Client({ connectionString, application_name: 'ami-brain-target-migration-audit' });
  await client.connect();

  let summary;
  try {
    await client.query('BEGIN READ ONLY');
    const databaseRows = await queryRows(
      client,
      `SELECT current_database() AS database, current_schema() AS schema, version() AS version`,
    );
    const rawHistory = await collectHistory(client, inventory);
    const structure = await collectCriticalStructure(client);
    await client.query('COMMIT');

    const target = { ...sanitizeDatabaseTarget(connectionString), ...databaseRows[0] };
    const history = applyChecksumExceptions(rawHistory, target, checksumExceptions);

    const blockers = [];
    if (!history.migrationTableExists) blockers.push('migration_table_missing');
    if (history.pending.length) blockers.push('pending_migrations');
    if (history.checksumMismatches.length) blockers.push('checksum_mismatch');
    if (history.failedOrRolledBack.length) blockers.push('failed_or_rolled_back_migrations');
    if (history.unexpected.length) blockers.push('unexpected_migrations');
    if (structure.missingTables.length || structure.missingColumns.length || structure.missingIndexes.length) {
      blockers.push('critical_structure_missing');
    }

    summary = {
      generatedAt: new Date().toISOString(),
      status: blockers.length ? 'blocked' : 'ready',
      databaseWritePerformed: false,
      targetLabel: argValue('label') ?? 'target-database',
      target,
      inventory: {
        count: inventory.count,
        first: inventory.first,
        latest: inventory.latest,
        rawChainHash: inventory.rawChainHash,
        canonicalLfChainHash: inventory.canonicalLfChainHash,
      },
      history,
      structure,
      blockers,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }

  const outPath = argValue('out');
  if (outPath) {
    const resolvedPath = resolve(process.cwd(), outPath);
    mkdirSync(dirname(resolvedPath), { recursive: true });
    writeFileSync(resolvedPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(summary, null, 2));
  if (process.argv.includes('--strict') && summary.status !== 'ready') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
