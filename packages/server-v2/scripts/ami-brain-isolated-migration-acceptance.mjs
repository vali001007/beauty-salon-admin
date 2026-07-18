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
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;
const packageRoot = resolve(import.meta.dirname, '..');
const prismaRoot = join(packageRoot, 'prisma');
const migrationsRoot = join(prismaRoot, 'migrations');
const schemaPath = join(prismaRoot, 'schema.prisma');
const defaultContainer = 'ami-brain-migration-r231';
const defaultPort = 55435;
const defaultBaselineCount = 95;
const postgresUser = 'ami_migration';
const postgresPassword = 'ami_migration_test_only';
const emptyDatabase = 'ami_migration_empty';
const incrementalDatabase = 'ami_migration_incremental';

function argValue(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireApplyConfirmation() {
  if (!process.argv.includes('--apply') || !process.argv.includes('--yes')) {
    throw new Error('This acceptance creates isolated local databases. Re-run with --apply --yes.');
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function inspectMigrations() {
  const names = readdirSync(migrationsRoot)
    .filter((name) => statSync(join(migrationsRoot, name)).isDirectory())
    .sort((left, right) => left.localeCompare(right));
  const migrations = names.map((name) => {
    const sqlPath = join(migrationsRoot, name, 'migration.sql');
    if (!existsSync(sqlPath)) throw new Error(`Migration is missing migration.sql: ${name}`);
    const sql = readFileSync(sqlPath);
    if (sql.length === 0) throw new Error(`Migration SQL is empty: ${name}`);
    return { name, checksum: sha256(sql), bytes: sql.length };
  });
  const timestampGroups = new Map();
  for (const migration of migrations) {
    const prefix = migration.name.slice(0, 14);
    const values = timestampGroups.get(prefix) ?? [];
    values.push(migration.name);
    timestampGroups.set(prefix, values);
  }
  const duplicateTimestampPrefixes = [...timestampGroups.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([prefix, values]) => ({ prefix, migrations: values }));
  const chainHash = sha256(migrations.map((item) => `${item.name}:${item.checksum}`).join('\n'));
  return {
    migrations,
    count: migrations.length,
    first: migrations[0]?.name ?? null,
    latest: migrations.at(-1)?.name ?? null,
    totalSqlBytes: migrations.reduce((sum, item) => sum + item.bytes, 0),
    chainHash,
    duplicateTimestampPrefixes,
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? packageRoot,
    env: options.env ?? process.env,
    encoding: 'utf8',
    shell: false,
    timeout: options.timeout ?? 180000,
  });
  const stdout = result.stdout?.trim() ?? '';
  const stderr = result.stderr?.trim() ?? '';
  if (result.error || result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(' ')}`,
        result.error?.message,
        stdout,
        stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return { stdout, stderr };
}

function runDocker(args, timeout = 180000) {
  return run('docker', args, { timeout });
}

function runPrisma(args, databaseUrl, schema = schemaPath, timeout = 240000) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npx';
  const commandArgs =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npx.cmd', 'prisma', ...args, '--schema', schema]
      : ['prisma', ...args, '--schema', schema];
  return run(command, commandArgs, {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    timeout,
  });
}

function validateOptions() {
  const container = argValue('container') ?? defaultContainer;
  const port = Number(argValue('port') ?? defaultPort);
  const baselineCount = Number(argValue('baseline-count') ?? defaultBaselineCount);
  if (!/^ami-brain-migration-[a-z0-9-]+$/.test(container)) {
    throw new Error('Container name must start with ami-brain-migration- and contain lowercase letters, digits or hyphens.');
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be an integer from 1024 to 65535.');
  if (!Number.isInteger(baselineCount) || baselineCount < 1) throw new Error('baseline-count must be a positive integer.');
  return { container, port, baselineCount };
}

function databaseUrl(port, database) {
  return `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${port}/${database}?schema=public`;
}

function ensureContainerAbsent(container) {
  const result = runDocker(['ps', '-a', '--filter', `name=^/${container}$`, '--format', '{{.Names}}']);
  if (result.stdout) throw new Error(`Refusing to reuse existing container: ${container}`);
}

function waitForPostgres(container) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const result = spawnSync('docker', ['exec', container, 'pg_isready', '-U', postgresUser, '-d', 'postgres'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    if (result.status === 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  throw new Error('PostgreSQL container did not become ready within 60 seconds.');
}

function createDatabase(container, database) {
  if (!/^ami_migration_[a-z0-9_]+$/.test(database)) throw new Error(`Unsafe database name: ${database}`);
  runDocker(['exec', container, 'createdb', '-U', postgresUser, database]);
}

function createBaselinePrismaDirectory(inventory, baselineCount) {
  if (baselineCount >= inventory.count) {
    throw new Error(`baseline-count ${baselineCount} must be less than current migration count ${inventory.count}.`);
  }
  const root = mkdtempSync(join(tmpdir(), 'ami-brain-migration-baseline-'));
  const baselinePrismaRoot = join(root, 'prisma');
  const baselineMigrationsRoot = join(baselinePrismaRoot, 'migrations');
  mkdirSync(baselineMigrationsRoot, { recursive: true });
  cpSync(schemaPath, join(baselinePrismaRoot, 'schema.prisma'));
  for (const migration of inventory.migrations.slice(0, baselineCount)) {
    cpSync(join(migrationsRoot, migration.name), join(baselineMigrationsRoot, migration.name), { recursive: true });
  }
  return { root, schemaPath: join(baselinePrismaRoot, 'schema.prisma') };
}

async function withClient(connectionString, callback) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function seedIncrementalBaseline(connectionString) {
  await withClient(connectionString, async (client) => {
    await client.query(`
      INSERT INTO "Store" ("id", "name", "status", "createdAt", "updatedAt")
      VALUES (900001, 'Migration Acceptance Store', 'active', NOW(), NOW());

      INSERT INTO "Role" ("key", "name", "permissions", "status", "createdAt", "updatedAt")
      VALUES
        ('store_manager', 'Store Manager', ARRAY['core:brain:use', 'existing:store-manager']::text[], 'active', NOW(), NOW()),
        ('beautician', 'Beautician', ARRAY['existing:beautician']::text[], 'active', NOW(), NOW());

      INSERT INTO "Customer" ("id", "storeId", "name", "tags", "createdAt", "updatedAt")
      VALUES (900001, 900001, 'Baseline Customer', ARRAY['baseline']::text[], NOW(), NOW());

      INSERT INTO "Project" ("id", "storeId", "name", "price", "duration", "status", "createdAt", "updatedAt")
      VALUES (900001, 900001, 'Baseline Project', 299, 60, 'active', NOW(), NOW());

      INSERT INTO "Reservation" (
        "id", "storeId", "customerId", "projectId", "date", "startTime", "endTime", "status", "remark", "createdAt", "updatedAt"
      ) VALUES (
        900001, 900001, 900001, 900001, TIMESTAMP '2026-07-18 00:00:00', '10:00', '11:00', 'confirmed', 'baseline reservation', NOW(), NOW()
      );

      INSERT INTO "CardUsageRecord" (
        "id", "customerId", "customerName", "cardName", "projectName", "times", "remainingTimes", "verifiedAt"
      ) VALUES (
        900001, 900001, 'Baseline Customer', 'Baseline Card', 'Baseline Project', 1, 9, NOW()
      );

      INSERT INTO "PurchaseOrder" (
        "id", "orderNo", "supplier", "totalAmount", "status", "items", "createdAt", "updatedAt"
      ) VALUES (
        900001,
        'PUR-BASELINE-900001',
        'Baseline Supplier',
        200,
        '草稿',
        '{"storeId":900001,"storeName":"Migration Acceptance Store","source":"manual","items":[{"id":1,"productId":900001,"productName":"Baseline Project","sku":"BASELINE-SKU","quantity":10,"receivedQty":0,"unitPrice":20,"subtotal":200}]}'::jsonb,
        NOW(),
        NOW()
      );

      INSERT INTO "TerminalFollowUpTask" (
        "id", "storeId", "customerId", "source", "title", "status", "createdAt", "updatedAt"
      ) VALUES (
        900001, 900001, 900001, 'manual', 'Baseline Follow-up', 'pending', NOW(), NOW()
      );

      INSERT INTO "brain_store_operating_target" (
        "id", "storeId", "periodType", "periodStart", "periodEnd", "revenueTarget", "status", "createdAt", "updatedAt"
      ) VALUES (
        900001, 900001, 'month', TIMESTAMP '2026-07-01 00:00:00', TIMESTAMP '2026-08-01 00:00:00', 123456.78, 'active', NOW(), NOW()
      );
    `);
  });
}

async function migrationHistory(connectionString, inventory) {
  return withClient(connectionString, async (client) => {
    const result = await client.query(`
      SELECT migration_name, checksum, finished_at, rolled_back_at, logs
      FROM "_prisma_migrations"
      ORDER BY migration_name
    `);
    const expected = new Map(inventory.migrations.map((migration) => [migration.name, migration.checksum]));
    const checksumMismatches = result.rows
      .filter((row) => expected.get(row.migration_name) !== row.checksum)
      .map((row) => row.migration_name);
    const failed = result.rows
      .filter((row) => !row.finished_at || row.rolled_back_at)
      .map((row) => row.migration_name);
    const unexpected = result.rows.filter((row) => !expected.has(row.migration_name)).map((row) => row.migration_name);
    const missing = inventory.migrations.filter((item) => !result.rows.some((row) => row.migration_name === item.name)).map((item) => item.name);
    return {
      appliedCount: result.rows.length,
      checksumMismatches,
      failed,
      unexpected,
      missing,
    };
  });
}

async function structuralEvidence(connectionString) {
  return withClient(connectionString, async (client) => {
    const requiredTables = [
      'brain_conversation',
      'brain_message',
      'brain_run',
      'brain_action_execution',
      'brain_ontology_entity',
      'business_definition',
      'business_semantic_evidence',
      'brain_capability_regeneration_job',
      'store_metric_target',
      'store_metric_snapshot',
      'customer_service_feedback',
      'customer_waiting_episode',
      'CardUsageRecord',
      'PurchaseOrder',
      'Reservation',
      'TerminalFollowUpTask',
    ];
    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [requiredTables],
    );
    const foundTables = new Set(tables.rows.map((row) => row.table_name));
    const requiredColumns = [
      ['CardUsageRecord', 'idempotencyKey'],
      ['PurchaseOrder', 'idempotencyKey'],
      ['PurchaseOrder', 'creationFingerprint'],
      ['Reservation', 'idempotencyKey'],
      ['Reservation', 'creationFingerprint'],
      ['Reservation', 'bookingSource'],
      ['TerminalFollowUpTask', 'idempotencyKey'],
      ['TerminalFollowUpTask', 'creationFingerprint'],
      ['store_metric_target', 'definitionVersion'],
      ['customer_service_feedback', 'rating'],
      ['customer_waiting_episode', 'outcome'],
    ];
    const columns = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `);
    const columnSet = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
    const indexes = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('CardUsageRecord_idempotencyKey_key', 'PurchaseOrder_idempotencyKey_key', 'Reservation_idempotencyKey_key', 'TerminalFollowUpTask_idempotencyKey_key')
    `);
    const indexSet = new Set(indexes.rows.map((row) => row.indexname));
    return {
      missingTables: requiredTables.filter((name) => !foundTables.has(name)),
      missingColumns: requiredColumns.map(([table, column]) => `${table}.${column}`).filter((name) => !columnSet.has(name)),
      missingIndexes: ['CardUsageRecord_idempotencyKey_key', 'PurchaseOrder_idempotencyKey_key', 'Reservation_idempotencyKey_key', 'TerminalFollowUpTask_idempotencyKey_key'].filter(
        (name) => !indexSet.has(name),
      ),
    };
  });
}

async function expectConstraintViolation(client, sql, expectedConstraint) {
  try {
    await client.query(sql);
  } catch (error) {
    if (error?.constraint === expectedConstraint || String(error?.message ?? '').includes(expectedConstraint)) return true;
    throw error;
  }
  return false;
}

async function incrementalDataEvidence(connectionString) {
  return withClient(connectionString, async (client) => {
    const roles = await client.query(`SELECT "key", "permissions" FROM "Role" WHERE "key" IN ('store_manager', 'beautician') ORDER BY "key"`);
    const metric = await client.query(`
      SELECT "metricKey", "periodType", "targetValue"::text AS "targetValue"
      FROM "store_metric_target"
      WHERE "storeId" = 900001
    `);
    const reservation = await client.query(`
      SELECT COUNT(*)::int AS count,
             COUNT("idempotencyKey")::int AS "idempotencyPopulated",
             COUNT("creationFingerprint")::int AS "fingerprintPopulated",
             MIN("bookingSource") AS "bookingSource"
      FROM "Reservation"
      WHERE "id" = 900001
    `);
    const cardUsage = await client.query(`
      SELECT COUNT(*)::int AS count, COUNT("idempotencyKey")::int AS "idempotencyPopulated"
      FROM "CardUsageRecord"
      WHERE "id" = 900001
    `);
    const purchaseOrder = await client.query(`
      SELECT COUNT(*)::int AS count,
             COUNT("idempotencyKey")::int AS "idempotencyPopulated",
             COUNT("creationFingerprint")::int AS "fingerprintPopulated",
             MIN("status") AS status
      FROM "PurchaseOrder"
      WHERE "id" = 900001
    `);
    const followUpTask = await client.query(`
      SELECT COUNT(*)::int AS count,
             COUNT("idempotencyKey")::int AS "idempotencyPopulated",
             COUNT("creationFingerprint")::int AS "fingerprintPopulated",
             MIN("status") AS status
      FROM "TerminalFollowUpTask"
      WHERE "id" = 900001
    `);

    await client.query(`
      INSERT INTO "customer_service_feedback" ("storeId", "feedbackType", "rating", "content")
      VALUES (900001, 'satisfaction', 5, 'migration acceptance');
      INSERT INTO "customer_waiting_episode" ("storeId", "status", "expectedWaitMinutes")
      VALUES (900001, 'waiting', 10);
    `);
    const feedbackCount = await client.query(`SELECT COUNT(*)::int AS count FROM "customer_service_feedback" WHERE "storeId" = 900001`);
    const waitingCount = await client.query(`SELECT COUNT(*)::int AS count FROM "customer_waiting_episode" WHERE "storeId" = 900001`);
    const feedbackConstraintRejected = await expectConstraintViolation(
      client,
      `INSERT INTO "customer_service_feedback" ("storeId", "feedbackType", "rating") VALUES (900001, 'satisfaction', 6)`,
      'customer_service_feedback_rating_check',
    );
    const waitingConstraintRejected = await expectConstraintViolation(
      client,
      `INSERT INTO "customer_waiting_episode" ("storeId", "status", "outcome") VALUES (900001, 'waiting', 'served')`,
      'customer_waiting_episode_end_check',
    );

    await client.query('BEGIN');
    let reservationUniqueRejected = false;
    try {
      await client.query(`UPDATE "Reservation" SET "idempotencyKey" = 'reservation-r231-key' WHERE "id" = 900001`);
      await client.query(`
        INSERT INTO "Reservation" (
          "storeId", "customerId", "projectId", "date", "startTime", "status", "idempotencyKey", "creationFingerprint", "createdAt", "updatedAt"
        ) VALUES (
          900001, 900001, 900001, TIMESTAMP '2026-07-19 00:00:00', '12:00', 'pending', 'reservation-r231-key', repeat('a', 64), NOW(), NOW()
        )
      `);
    } catch (error) {
      reservationUniqueRejected = error?.constraint === 'Reservation_idempotencyKey_key';
    } finally {
      await client.query('ROLLBACK');
    }

    await client.query('BEGIN');
    let cardUsageUniqueRejected = false;
    try {
      await client.query(`UPDATE "CardUsageRecord" SET "idempotencyKey" = 'card-r231-key' WHERE "id" = 900001`);
      await client.query(`
        INSERT INTO "CardUsageRecord" (
          "customerId", "customerName", "cardName", "projectName", "times", "remainingTimes", "idempotencyKey", "verifiedAt"
        ) VALUES (
          900001, 'Baseline Customer', 'Baseline Card', 'Baseline Project', 1, 8, 'card-r231-key', NOW()
        )
      `);
    } catch (error) {
      cardUsageUniqueRejected = error?.constraint === 'CardUsageRecord_idempotencyKey_key';
    } finally {
      await client.query('ROLLBACK');
    }

    await client.query('BEGIN');
    let purchaseOrderUniqueRejected = false;
    try {
      await client.query(`UPDATE "PurchaseOrder" SET "idempotencyKey" = 'purchase-r232-key' WHERE "id" = 900001`);
      await client.query(`
        INSERT INTO "PurchaseOrder" (
          "orderNo", "supplier", "totalAmount", "status", "items", "idempotencyKey", "creationFingerprint", "createdAt", "updatedAt"
        ) VALUES (
          'PUR-DUPLICATE-R232', 'Baseline Supplier', 200, '草稿', '{}'::jsonb, 'purchase-r232-key', repeat('a', 64), NOW(), NOW()
        )
      `);
    } catch (error) {
      purchaseOrderUniqueRejected = error?.constraint === 'PurchaseOrder_idempotencyKey_key';
    } finally {
      await client.query('ROLLBACK');
    }

    await client.query('BEGIN');
    let followUpTaskUniqueRejected = false;
    try {
      await client.query(`UPDATE "TerminalFollowUpTask" SET "idempotencyKey" = 'follow-up-r234-key' WHERE "id" = 900001`);
      await client.query(`
        INSERT INTO "TerminalFollowUpTask" (
          "storeId", "customerId", "source", "title", "status", "idempotencyKey", "creationFingerprint", "createdAt", "updatedAt"
        ) VALUES (
          900001, 900001, 'manual', 'Duplicate Follow-up', 'pending', 'follow-up-r234-key', repeat('a', 64), NOW(), NOW()
        )
      `);
    } catch (error) {
      followUpTaskUniqueRejected = error?.constraint === 'TerminalFollowUpTask_idempotencyKey_key';
    } finally {
      await client.query('ROLLBACK');
    }

    return {
      roles: roles.rows,
      metric: metric.rows,
      reservation: reservation.rows[0],
      cardUsage: cardUsage.rows[0],
      purchaseOrder: purchaseOrder.rows[0],
      followUpTask: followUpTask.rows[0],
      feedbackCount: feedbackCount.rows[0].count,
      waitingCount: waitingCount.rows[0].count,
      feedbackConstraintRejected,
      waitingConstraintRejected,
      reservationUniqueRejected,
      cardUsageUniqueRejected,
      purchaseOrderUniqueRejected,
      followUpTaskUniqueRejected,
    };
  });
}

function assertAcceptance(summary) {
  const storeManager = summary.incrementalData.roles.find((role) => role.key === 'store_manager');
  const beautician = summary.incrementalData.roles.find((role) => role.key === 'beautician');
  const storeManagerPermissions = storeManager?.permissions ?? [];
  const beauticianPermissions = beautician?.permissions ?? [];
  const checks = {
    emptyHistoryAligned:
      summary.emptyHistory.appliedCount === summary.inventory.count &&
      summary.emptyHistory.checksumMismatches.length === 0 &&
      summary.emptyHistory.failed.length === 0 &&
      summary.emptyHistory.unexpected.length === 0 &&
      summary.emptyHistory.missing.length === 0,
    incrementalHistoryAligned:
      summary.incrementalHistory.appliedCount === summary.inventory.count &&
      summary.incrementalHistory.checksumMismatches.length === 0 &&
      summary.incrementalHistory.failed.length === 0 &&
      summary.incrementalHistory.unexpected.length === 0 &&
      summary.incrementalHistory.missing.length === 0,
    structureAligned:
      summary.structure.missingTables.length === 0 &&
      summary.structure.missingColumns.length === 0 &&
      summary.structure.missingIndexes.length === 0,
    historicalRowsPreserved:
      summary.incrementalData.reservation.count === 1 &&
      summary.incrementalData.reservation.idempotencyPopulated === 0 &&
      summary.incrementalData.reservation.fingerprintPopulated === 0 &&
      summary.incrementalData.reservation.bookingSource === 'manual' &&
      summary.incrementalData.cardUsage.count === 1 &&
      summary.incrementalData.cardUsage.idempotencyPopulated === 0 &&
      summary.incrementalData.purchaseOrder.count === 1 &&
      summary.incrementalData.purchaseOrder.idempotencyPopulated === 0 &&
      summary.incrementalData.purchaseOrder.fingerprintPopulated === 0 &&
      summary.incrementalData.purchaseOrder.status === '草稿' &&
      summary.incrementalData.followUpTask.count === 1 &&
      summary.incrementalData.followUpTask.idempotencyPopulated === 0 &&
      summary.incrementalData.followUpTask.fingerprintPopulated === 0 &&
      summary.incrementalData.followUpTask.status === 'pending',
    metricBackfilled:
      summary.incrementalData.metric.length === 1 &&
      summary.incrementalData.metric[0].metricKey === 'store.operating_revenue.month' &&
      Number(summary.incrementalData.metric[0].targetValue) === 123456.78,
    permissionsMerged:
      storeManagerPermissions.includes('existing:store-manager') &&
      storeManagerPermissions.includes('core:supply:manage') &&
      beauticianPermissions.includes('existing:beautician') &&
      beauticianPermissions.includes('core:brain:use') &&
      beauticianPermissions.includes('core:brain:beautician-view') &&
      beauticianPermissions.includes('core:store:reservations'),
    keyDataContracts:
      summary.incrementalData.feedbackCount === 1 &&
      summary.incrementalData.waitingCount === 1 &&
      summary.incrementalData.feedbackConstraintRejected &&
      summary.incrementalData.waitingConstraintRejected &&
      summary.incrementalData.reservationUniqueRejected &&
      summary.incrementalData.cardUsageUniqueRejected &&
      summary.incrementalData.purchaseOrderUniqueRejected &&
      summary.incrementalData.followUpTaskUniqueRejected,
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { checks, failedChecks, passed: failedChecks.length === 0 };
}

async function main() {
  requireApplyConfirmation();
  const options = validateOptions();
  const outputDir = resolve(process.cwd(), argValue('output-dir') ?? 'migration-acceptance-output');
  const inventory = inspectMigrations();
  if (inventory.count !== 104) {
    throw new Error(`Expected the current frozen chain to contain 104 migrations, found ${inventory.count}. Update the gate deliberately.`);
  }
  const baseline = createBaselinePrismaDirectory(inventory, options.baselineCount);
  let containerStarted = false;
  const startedAt = new Date().toISOString();
  const emptyUrl = databaseUrl(options.port, emptyDatabase);
  const incrementalUrl = databaseUrl(options.port, incrementalDatabase);

  try {
    run('docker', ['version', '--format', '{{.Server.Version}}']);
    ensureContainerAbsent(options.container);
    runDocker([
      'run',
      '--name',
      options.container,
      '-e',
      `POSTGRES_USER=${postgresUser}`,
      '-e',
      `POSTGRES_PASSWORD=${postgresPassword}`,
      '-p',
      `127.0.0.1:${options.port}:5432`,
      '-d',
      'postgres:16-alpine',
    ]);
    containerStarted = true;
    waitForPostgres(options.container);
    createDatabase(options.container, emptyDatabase);
    createDatabase(options.container, incrementalDatabase);

    const validate = runPrisma(['validate'], emptyUrl, schemaPath);
    const emptyDeploy = runPrisma(['migrate', 'deploy'], emptyUrl, schemaPath);
    const emptyStatus = runPrisma(['migrate', 'status'], emptyUrl, schemaPath);
    const emptyHistory = await migrationHistory(emptyUrl, inventory);

    const baselineDeploy = runPrisma(['migrate', 'deploy'], incrementalUrl, baseline.schemaPath);
    await seedIncrementalBaseline(incrementalUrl);
    const incrementalDeploy = runPrisma(['migrate', 'deploy'], incrementalUrl, schemaPath);
    const incrementalStatus = runPrisma(['migrate', 'status'], incrementalUrl, schemaPath);
    const incrementalHistory = await migrationHistory(incrementalUrl, inventory);
    const structure = await structuralEvidence(incrementalUrl);
    const incrementalData = await incrementalDataEvidence(incrementalUrl);

    const summary = {
      generatedAt: new Date().toISOString(),
      startedAt,
      status: 'pending_assertion',
      environment: {
        postgresImage: 'postgres:16-alpine',
        host: '127.0.0.1',
        port: options.port,
        container: options.container,
        emptyDatabase,
        incrementalDatabase,
        productionDatabaseWriteCount: 0,
      },
      inventory: {
        count: inventory.count,
        first: inventory.first,
        latest: inventory.latest,
        totalSqlBytes: inventory.totalSqlBytes,
        chainHash: inventory.chainHash,
        duplicateTimestampPrefixes: inventory.duplicateTimestampPrefixes,
      },
      baseline: {
        migrationCount: options.baselineCount,
        latestMigration: inventory.migrations[options.baselineCount - 1].name,
      },
      commands: {
        validate: validate.stdout,
        emptyDeploy: emptyDeploy.stdout,
        emptyStatus: emptyStatus.stdout,
        baselineDeploy: baselineDeploy.stdout,
        incrementalDeploy: incrementalDeploy.stdout,
        incrementalStatus: incrementalStatus.stdout,
      },
      emptyHistory,
      incrementalHistory,
      structure,
      incrementalData,
    };
    const assertion = assertAcceptance(summary);
    summary.status = assertion.passed ? 'passed' : 'failed';
    summary.assertion = assertion;
    mkdirSync(outputDir, { recursive: true });
    rmSync(join(outputDir, 'ami-brain-isolated-migration-acceptance-error.json'), { force: true });
    const outputPath = join(outputDir, 'ami-brain-isolated-migration-acceptance-summary.json');
    writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ status: summary.status, outputPath, ...assertion }, null, 2));
    if (!assertion.passed) process.exitCode = 1;
  } finally {
    rmSync(baseline.root, { recursive: true, force: true });
    if (containerStarted && !process.argv.includes('--keep-container')) {
      runDocker(['rm', '-f', options.container]);
    }
  }
}

main().catch((error) => {
  const outputDir = resolve(process.cwd(), argValue('output-dir') ?? 'migration-acceptance-output');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, 'ami-brain-isolated-migration-acceptance-error.json'),
    `${JSON.stringify({ status: 'failed', generatedAt: new Date().toISOString(), error: String(error?.stack ?? error) }, null, 2)}\n`,
    'utf8',
  );
  console.error(error);
  process.exitCode = 1;
});
