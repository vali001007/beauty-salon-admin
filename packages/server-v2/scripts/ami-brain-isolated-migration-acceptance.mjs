import { spawnSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
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
const defaultBaselineMigration = '20260718234500_supply_platform_idempotency';
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
      [`Command failed: ${command} ${args.join(' ')}`, result.error?.message, stdout, stderr]
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
  const container = argValue('container') ?? `ami-brain-migration-${Date.now().toString(36)}-${randomInt(1000, 9999)}`;
  const port = Number(argValue('port') ?? randomInt(40000, 49999));
  const baselineMigration = argValue('baseline-migration') ?? defaultBaselineMigration;
  if (!/^ami-brain-migration-[a-z0-9-]+$/.test(container)) {
    throw new Error(
      'Container name must start with ami-brain-migration- and contain lowercase letters, digits or hyphens.',
    );
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Port must be an integer from 1024 to 65535.');
  if (!/^\d{14}_[a-z0-9_]+$/.test(baselineMigration)) {
    throw new Error('baseline-migration must be a Prisma migration directory name.');
  }
  return { container, port, baselineMigration };
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
  let consecutiveReadyChecks = 0;
  while (Date.now() < deadline) {
    const result = spawnSync('docker', ['exec', container, 'pg_isready', '-U', postgresUser, '-d', 'postgres'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    consecutiveReadyChecks = result.status === 0 ? consecutiveReadyChecks + 1 : 0;
    if (consecutiveReadyChecks >= 2) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  throw new Error('PostgreSQL container did not become ready within 60 seconds.');
}

function createDatabase(container, database) {
  if (!/^ami_migration_[a-z0-9_]+$/.test(database)) throw new Error(`Unsafe database name: ${database}`);
  runDocker(['exec', container, 'createdb', '-U', postgresUser, database]);
}

function createBaselinePrismaDirectory(inventory, baselineMigration) {
  const baselineIndex = inventory.migrations.findIndex((migration) => migration.name === baselineMigration);
  if (baselineIndex < 0) throw new Error(`Baseline migration is not in inventory: ${baselineMigration}`);
  if (baselineIndex >= inventory.count - 1) throw new Error(`Baseline migration must precede the latest migration: ${baselineMigration}`);
  const root = mkdtempSync(join(tmpdir(), 'ami-brain-migration-baseline-'));
  const baselinePrismaRoot = join(root, 'prisma');
  const baselineMigrationsRoot = join(baselinePrismaRoot, 'migrations');
  mkdirSync(baselineMigrationsRoot, { recursive: true });
  cpSync(schemaPath, join(baselinePrismaRoot, 'schema.prisma'));
  for (const migration of inventory.migrations.slice(0, baselineIndex + 1)) {
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

      INSERT INTO "SupplySupplier" (
        "id", "name", "qualificationStatus", "status", "createdAt", "updatedAt"
      ) VALUES (
        900001, 'Baseline Supply Supplier', 'approved', 'active', NOW(), NOW()
      );

      INSERT INTO "ProcurementOrder" (
        "id", "orderNo", "storeId", "supplierId", "status", "totalAmount", "sourceType", "createdAt", "updatedAt"
      ) VALUES (
        900001, 'SPO-BASELINE-900001', 900001, 900001, 'pending_supplier_confirm', 200, 'manual', NOW(), NOW()
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
    const failed = result.rows.filter((row) => !row.finished_at || row.rolled_back_at).map((row) => row.migration_name);
    const unexpected = result.rows.filter((row) => !expected.has(row.migration_name)).map((row) => row.migration_name);
    const missing = inventory.migrations
      .filter((item) => !result.rows.some((row) => row.migration_name === item.name))
      .map((item) => item.name);
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
      'brain_action_execution',
      'brain_action_confirmation',
      'brain_gate_receipt',
      'brain_governance_task',
      'business_definition',
      'business_database_write_set',
      'business_database_write_set_entry',
      'business_mutation_receipt',
      'PurchaseOrder',
    ];
    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [requiredTables],
    );
    const foundTables = new Set(tables.rows.map((row) => row.table_name));
    const requiredColumns = [
      ['PurchaseOrder', 'storeId'],
      ['brain_action_confirmation', 'actionDefinitionKey'],
      ['brain_action_confirmation', 'boundCapabilityKey'],
      ['brain_action_confirmation', 'situationContextFingerprint'],
      ['brain_action_confirmation', 'informationArtifactFingerprints'],
      ['brain_action_confirmation', 'sideEffectInvariantProfileFingerprint'],
      ['brain_action_confirmation', 'institutionalEffectProfileFingerprint'],
      ['brain_action_execution', 'actionDefinitionKey'],
      ['brain_action_execution', 'boundCapabilityKey'],
      ['brain_action_execution', 'situationContextFingerprint'],
      ['brain_action_execution', 'informationArtifactFingerprints'],
      ['brain_action_execution', 'sideEffectInvariantProfileFingerprint'],
      ['brain_action_execution', 'institutionalEffectProfileFingerprint'],
      ['business_database_write_set_entry', 'afterStateFingerprint'],
      ['brain_governance_task', 'transitionLog'],
      ['brain_gate_receipt', 'resultChecksum'],
    ];
    const columns = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `);
    const columnSet = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
    const requiredIndexes = [
      'PurchaseOrder_storeId_createdAt_idx',
      'PurchaseOrder_storeId_status_idx',
      'brain_action_confirmation_actionDefinitionKey_actionDefinitionVersion_idx',
      'brain_action_execution_actionDefinitionKey_actionDefinitionVersion_idx',
      'business_mutation_receipt_receiptFingerprint_key',
      'business_mutation_receipt_storeId_capabilityKey_idempotencyKey_key',
      'business_database_write_set_storeId_capabilityKey_idempotencyKey_key',
      'business_database_write_set_entry_writeSetId_id_idx',
      'brain_governance_task_idempotencyKey_key',
      'brain_gate_receipt_receiptKey_key',
    ];
    const indexes = await client.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const indexSet = new Set(indexes.rows.map((row) => row.indexname));
    const indexPresent = (expectedName) =>
      indexSet.has(expectedName) ||
      [...indexSet].some((actualName) => actualName.length === 63 && expectedName.startsWith(actualName));
    const requiredFunctions = [
      'ami_business_write_set_capture_row()',
      'ami_pgcrypto_digest(text,text)',
      'ami_refresh_business_write_set_triggers()',
      'business_definition_canonical_jsonb(jsonb)',
      'business_definition_capability_bindings(text,jsonb)',
      'validate_business_definition_projection_lineage()',
    ];
    const functions = await client.query(
      `SELECT function_name, to_regprocedure(function_name) IS NOT NULL AS present FROM unnest($1::text[]) AS function_name`,
      [requiredFunctions],
    );
    const purchaseOrderStoreColumn = await client.query(`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PurchaseOrder' AND column_name = 'storeId'
    `);
    const purchaseOrderForeignKey = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'PurchaseOrder'
        AND constraint_name = 'PurchaseOrder_storeId_fkey'
        AND constraint_type = 'FOREIGN KEY'
    `);
    const writeSetTrigger = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM pg_trigger trigger_record
      JOIN pg_class table_record ON table_record.oid = trigger_record.tgrelid
      JOIN pg_namespace schema_record ON schema_record.oid = table_record.relnamespace
      WHERE schema_record.nspname = 'public'
        AND table_record.relname = 'PurchaseOrder'
        AND trigger_record.tgname = 'ami_business_write_set_capture_row'
        AND NOT trigger_record.tgisinternal
    `);
    const actionEnum = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM pg_enum enum_record
      JOIN pg_type type_record ON type_record.oid = enum_record.enumtypid
      WHERE type_record.typname = 'BusinessDefinitionKind' AND enum_record.enumlabel = 'action'
    `);
    return {
      missingTables: requiredTables.filter((name) => !foundTables.has(name)),
      missingColumns: requiredColumns
        .map(([table, column]) => `${table}.${column}`)
        .filter((name) => !columnSet.has(name)),
      missingIndexes: requiredIndexes.filter((name) => !indexPresent(name)),
      missingFunctions: functions.rows.filter((row) => !row.present).map((row) => row.function_name),
      purchaseOrderStoreNotNull: purchaseOrderStoreColumn.rows[0]?.is_nullable === 'NO',
      purchaseOrderStoreForeignKey: purchaseOrderForeignKey.rows[0]?.count === 1,
      purchaseOrderWriteSetTrigger: writeSetTrigger.rows[0]?.count === 1,
      actionDefinitionKindAvailable: actionEnum.rows[0]?.count === 1,
    };
  });
}

async function incrementalDataEvidence(connectionString) {
  return withClient(connectionString, async (client) => {
    const historicalRows = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM "Reservation" WHERE "id" = 900001) AS "reservationCount",
        (SELECT COUNT(*)::int FROM "CardUsageRecord" WHERE "id" = 900001) AS "cardUsageCount",
        (SELECT COUNT(*)::int FROM "TerminalFollowUpTask" WHERE "id" = 900001) AS "followUpTaskCount",
        (SELECT COUNT(*)::int FROM "ProcurementOrder" WHERE "id" = 900001) AS "procurementOrderCount",
        (SELECT COUNT(*)::int FROM "PurchaseOrder" WHERE "id" = 900001) AS "purchaseOrderCount",
        (SELECT "storeId" FROM "PurchaseOrder" WHERE "id" = 900001) AS "purchaseOrderStoreId",
        (SELECT "status" FROM "PurchaseOrder" WHERE "id" = 900001) AS "purchaseOrderStatus"
    `);
    const functionContracts = await client.query(`
      SELECT
        business_definition_canonical_jsonb('{"b":2,"A":1}'::jsonb) AS "canonicalJson",
        business_definition_capability_bindings(
          'action',
          '{"bindings":{"capability":["legacy_action"]},"capabilityBindings":[{"capabilityKey":"purchase_order_draft","enabled":true},{"capabilityKey":"disabled_action","enabled":false}]}'::jsonb
        )::text AS "capabilityBindings",
        position(
          'parent_kind IN (''entity'', ''relation'', ''dimension'', ''action'')'
          IN pg_get_functiondef('validate_business_definition_projection_lineage()'::regprocedure)
        ) > 0 AS "actionLineageEnabled"
    `);

    const writeSetId = '00000000-0000-4000-8000-000000000001';
    let writeSetCapture;
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO "business_database_write_set" (
          "id", "storeId", "capabilityKey", "idempotencyKey", "databaseTransactionId", "coverageBoundary", "monitorTableCount", "monitorFingerprint"
        ) VALUES ($1::uuid, 900001, 'migration_acceptance', 'migration-write-set', txid_current(), 'PurchaseOrder', 1, repeat('a', 64))`,
        [writeSetId],
      );
      await client.query(`SELECT set_config('ami.business_write_set_context', $1, true)`, [
        JSON.stringify({ schemaVersion: '1.0', writeSetId }),
      ]);
      await client.query(`UPDATE "PurchaseOrder" SET "status" = 'migration-write-set-probe' WHERE "id" = 900001`);
      const captured = await client.query(
        `SELECT COUNT(*)::int AS count,
                MIN("modelName") AS "modelName",
                MIN("operation") AS operation,
                BOOL_AND("changedFields" @> '["status"]'::jsonb) AS "statusCaptured",
                BOOL_AND(length("beforeStateFingerprint") = 64) AS "beforeFingerprintValid",
                BOOL_AND(length("afterStateFingerprint") = 64) AS "afterFingerprintValid"
         FROM "business_database_write_set_entry"
         WHERE "writeSetId" = $1::uuid`,
        [writeSetId],
      );
      writeSetCapture = captured.rows[0];
    } finally {
      await client.query('ROLLBACK');
    }

    let mutationReceiptUniqueRejected = false;
    let mutationReceiptInserted = false;
    await client.query('BEGIN');
    try {
      const inserted = await client.query(`
        INSERT INTO "business_mutation_receipt" (
          "storeId", "capabilityKey", "idempotencyKey", "businessObjectType", "businessObjectId", "mutationKind",
          "requestFingerprint", "beforeVersion", "afterVersion", "beforeStateFingerprint", "afterStateFingerprint",
          "changedFields", "receiptFingerprint"
        ) VALUES (
          900001, 'migration_acceptance', 'receipt-key', 'PurchaseOrder', '900001', 'update',
          repeat('a', 64), '1', '2', repeat('b', 64), repeat('c', 64), '["status"]'::jsonb, repeat('d', 64)
        )
      `);
      mutationReceiptInserted = inserted.rowCount === 1;
      await client.query(`
        INSERT INTO "business_mutation_receipt" (
          "storeId", "capabilityKey", "idempotencyKey", "businessObjectType", "businessObjectId", "mutationKind",
          "requestFingerprint", "beforeVersion", "afterVersion", "beforeStateFingerprint", "afterStateFingerprint",
          "changedFields", "receiptFingerprint"
        ) VALUES (
          900001, 'migration_acceptance', 'receipt-key', 'PurchaseOrder', '900001', 'update',
          repeat('e', 64), '2', '3', repeat('f', 64), repeat('1', 64), '["status"]'::jsonb, repeat('2', 64)
        )
      `);
    } catch (error) {
      const expectedConstraint = 'business_mutation_receipt_storeId_capabilityKey_idempotencyKey_key';
      mutationReceiptUniqueRejected =
        error?.constraint === expectedConstraint ||
        (String(error?.constraint ?? '').length === 63 && expectedConstraint.startsWith(error.constraint));
    } finally {
      await client.query('ROLLBACK');
    }

    let governanceTask;
    let governanceTaskUniqueRejected = false;
    await client.query('BEGIN');
    try {
      const inserted = await client.query(`
        INSERT INTO "brain_governance_task" (
          "idempotencyKey", "taskType", "stage", "payload", "createdBy", "updatedAt"
        ) VALUES ('migration-task-key', 'migration_acceptance', 'preflight', '{}'::jsonb, 900001, NOW())
        RETURNING "status", "riskLevel", "attemptCount", "transitionLog"::text AS "transitionLog"
      `);
      governanceTask = inserted.rows[0];
      await client.query(`
        INSERT INTO "brain_governance_task" (
          "idempotencyKey", "taskType", "stage", "payload", "createdBy", "updatedAt"
        ) VALUES ('migration-task-key', 'migration_acceptance', 'preflight', '{}'::jsonb, 900001, NOW())
      `);
    } catch (error) {
      governanceTaskUniqueRejected = error?.constraint === 'brain_governance_task_idempotencyKey_key';
    } finally {
      await client.query('ROLLBACK');
    }

    let gateReceipt;
    let gateReceiptUniqueRejected = false;
    await client.query('BEGIN');
    try {
      const inserted = await client.query(`
        INSERT INTO "brain_gate_receipt" (
          "receiptKey", "stage", "riskLevel", "changedFilesChecksum", "diffChecksum", "sourceFingerprint",
          "suiteChecksum", "resultChecksum", "status", "result", "expiresAt"
        ) VALUES (
          'migration-gate-key', 'preflight', 'low', repeat('a', 64), repeat('b', 64), repeat('c', 64),
          repeat('d', 64), repeat('e', 64), 'passed', '{}', NOW() + INTERVAL '1 hour'
        ) RETURNING "status", "stage"
      `);
      gateReceipt = inserted.rows[0];
      await client.query(`
        INSERT INTO "brain_gate_receipt" (
          "receiptKey", "stage", "riskLevel", "changedFilesChecksum", "diffChecksum", "sourceFingerprint",
          "suiteChecksum", "resultChecksum", "status", "result", "expiresAt"
        ) VALUES (
          'migration-gate-key', 'preflight', 'low', repeat('1', 64), repeat('2', 64), repeat('3', 64),
          repeat('4', 64), repeat('5', 64), 'passed', '{}', NOW() + INTERVAL '1 hour'
        )
      `);
    } catch (error) {
      gateReceiptUniqueRejected = error?.constraint === 'brain_gate_receipt_receiptKey_key';
    } finally {
      await client.query('ROLLBACK');
    }

    const purchaseOrderAfterProbes = await client.query(
      `SELECT "status", "storeId" FROM "PurchaseOrder" WHERE "id" = 900001`,
    );

    return {
      historicalRows: historicalRows.rows[0],
      functionContracts: functionContracts.rows[0],
      writeSetCapture,
      mutationReceipt: {
        inserted: mutationReceiptInserted,
        uniqueRejected: mutationReceiptUniqueRejected,
      },
      governanceTask: {
        ...governanceTask,
        uniqueRejected: governanceTaskUniqueRejected,
      },
      gateReceipt: {
        ...gateReceipt,
        uniqueRejected: gateReceiptUniqueRejected,
      },
      purchaseOrderAfterProbes: purchaseOrderAfterProbes.rows[0],
    };
  });
}

function assertAcceptance(summary) {
  const historicalRows = summary.incrementalData.historicalRows;
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
      summary.structure.missingIndexes.length === 0 &&
      summary.structure.missingFunctions.length === 0 &&
      summary.structure.purchaseOrderStoreNotNull &&
      summary.structure.purchaseOrderStoreForeignKey &&
      summary.structure.purchaseOrderWriteSetTrigger &&
      summary.structure.actionDefinitionKindAvailable,
    historicalRowsPreserved:
      historicalRows.reservationCount === 1 &&
      historicalRows.cardUsageCount === 1 &&
      historicalRows.followUpTaskCount === 1 &&
      historicalRows.procurementOrderCount === 1 &&
      historicalRows.purchaseOrderCount === 1 &&
      historicalRows.purchaseOrderStoreId === 900001 &&
      historicalRows.purchaseOrderStatus === '草稿' &&
      summary.incrementalData.purchaseOrderAfterProbes.storeId === 900001 &&
      summary.incrementalData.purchaseOrderAfterProbes.status === '草稿',
    actionProjectionContracts:
      summary.incrementalData.functionContracts.canonicalJson === '{"A":1,"b":2}' &&
      summary.incrementalData.functionContracts.capabilityBindings === '["legacy_action", "purchase_order_draft"]' &&
      summary.incrementalData.functionContracts.actionLineageEnabled,
    writeSetCapture:
      summary.incrementalData.writeSetCapture.count === 1 &&
      summary.incrementalData.writeSetCapture.modelName === 'PurchaseOrder' &&
      summary.incrementalData.writeSetCapture.operation === 'update' &&
      summary.incrementalData.writeSetCapture.statusCaptured &&
      summary.incrementalData.writeSetCapture.beforeFingerprintValid &&
      summary.incrementalData.writeSetCapture.afterFingerprintValid,
    mutationReceiptContracts:
      summary.incrementalData.mutationReceipt.inserted && summary.incrementalData.mutationReceipt.uniqueRejected,
    governanceContracts:
      summary.incrementalData.governanceTask.status === 'pending' &&
      summary.incrementalData.governanceTask.riskLevel === 'unclassified' &&
      summary.incrementalData.governanceTask.attemptCount === 0 &&
      summary.incrementalData.governanceTask.transitionLog === '[]' &&
      summary.incrementalData.governanceTask.uniqueRejected &&
      summary.incrementalData.gateReceipt.status === 'passed' &&
      summary.incrementalData.gateReceipt.stage === 'preflight' &&
      summary.incrementalData.gateReceipt.uniqueRejected,
  };
  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  return { checks, failedChecks, passed: failedChecks.length === 0 };
}

async function main() {
  requireApplyConfirmation();
  const options = validateOptions();
  const outputDir = resolve(process.cwd(), argValue('output-dir') ?? 'migration-acceptance-output');
  const inventory = inspectMigrations();
  if (!inventory.count) throw new Error('Migration inventory is empty.');
  const baseline = createBaselinePrismaDirectory(inventory, options.baselineMigration);
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
      'postgres:17-bookworm',
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
        postgresImage: 'postgres:17-bookworm',
        host: '127.0.0.1',
        port: options.port,
        container: options.container,
        emptyDatabase,
        incrementalDatabase,
        remoteDatabaseWriteCount: 0,
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
        migrationCount: inventory.migrations.findIndex((migration) => migration.name === options.baselineMigration) + 1,
        latestMigration: options.baselineMigration,
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
