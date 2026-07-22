import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { config } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const packageRoot = resolve(import.meta.dirname, '..');
config({ path: resolve(packageRoot, '.env') });

const MIGRATIONS = [
  '20260717130000_store_manager_supply_manage_permission',
  '20260717220000_customer_service_feedback_core',
  '20260717233000_customer_waiting_episode_core',
  '20260718153000_beautician_brain_self_permissions',
  '20260718190000_card_usage_action_idempotency',
  '20260718203000_reservation_creation_idempotency',
  '20260718214500_purchase_order_creation_idempotency',
  '20260718223000_follow_up_task_creation_idempotency',
  '20260718234500_supply_platform_idempotency',
];

function argValue(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function queryRows(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const client = new Client({ connectionString, application_name: 'ami-brain-cloud-migration-post-verify' });
  await client.connect();
  let evidence;
  try {
    await client.query('BEGIN READ ONLY');
    const migrations = await queryRows(
      client,
      `SELECT migration_name, finished_at, rolled_back_at
       FROM "_prisma_migrations"
       WHERE migration_name = ANY($1::text[])
       ORDER BY migration_name`,
      [MIGRATIONS],
    );
    const roles = await queryRows(
      client,
      `SELECT "key", status, permissions FROM "Role"
       WHERE "key" IN ('store_manager', 'beautician') ORDER BY "key"`,
    );
    const rowContracts = {
      cardUsage: (await queryRows(client, `SELECT COUNT(*)::int count, COUNT("idempotencyKey")::int keyed FROM "CardUsageRecord"`))[0],
      reservation: (
        await queryRows(
          client,
          `SELECT COUNT(*)::int count, COUNT("idempotencyKey")::int keyed,
                  COUNT("creationFingerprint")::int fingerprinted,
                  COUNT(*) FILTER (WHERE "bookingSource" = 'manual')::int manual
           FROM "Reservation"`,
        )
      )[0],
      purchaseOrder: (
        await queryRows(
          client,
          `SELECT COUNT(*)::int count, COUNT("idempotencyKey")::int keyed,
                  COUNT("creationFingerprint")::int fingerprinted
           FROM "PurchaseOrder"`,
        )
      )[0],
      followUpTask: (
        await queryRows(
          client,
          `SELECT COUNT(*)::int count, COUNT("idempotencyKey")::int keyed,
                  COUNT("creationFingerprint")::int fingerprinted
           FROM "TerminalFollowUpTask"`,
        )
      )[0],
      procurementOrder: (
        await queryRows(
          client,
          `SELECT COUNT(*)::int count, COUNT("idempotencyKey")::int keyed,
                  COUNT("creationFingerprint")::int fingerprinted,
                  COUNT("batchIdempotencyKey")::int batch_keyed,
                  COUNT("batchCreationFingerprint")::int batch_fingerprinted
           FROM "ProcurementOrder"`,
        )
      )[0],
      procurementReceipt: (await queryRows(client, `SELECT COUNT(*)::int count FROM "ProcurementReceipt"`))[0],
      customerFeedback: (await queryRows(client, `SELECT COUNT(*)::int count FROM "customer_service_feedback"`))[0],
      waitingEpisode: (await queryRows(client, `SELECT COUNT(*)::int count FROM "customer_waiting_episode"`))[0],
    };
    const indexes = await queryRows(
      client,
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = current_schema()
         AND indexname = ANY($1::text[])
       ORDER BY indexname`,
      [[
        'CardUsageRecord_idempotencyKey_key',
        'PurchaseOrder_idempotencyKey_key',
        'Reservation_idempotencyKey_key',
        'TerminalFollowUpTask_idempotencyKey_key',
        'ProcurementOrder_idempotencyKey_key',
        'ProcurementReceipt_idempotencyKey_key',
      ]],
    );
    await client.query('COMMIT');

    const storeManager = roles.find((role) => role.key === 'store_manager');
    const beautician = roles.find((role) => role.key === 'beautician');
    const checks = {
      migrationsApplied:
        migrations.length === MIGRATIONS.length &&
        migrations.every((migration) => migration.finished_at && !migration.rolled_back_at),
      permissionsMerged:
        storeManager?.permissions?.includes('core:supply:manage') &&
        storeManager?.permissions?.includes('core:brain:use') &&
        beautician?.permissions?.includes('core:brain:use') &&
        beautician?.permissions?.includes('core:brain:beautician-view') &&
        beautician?.permissions?.includes('core:store:reservations') &&
        beautician?.permissions?.includes('core:dashboard:view') &&
        beautician?.permissions?.includes('terminal:service:view'),
      historicalRowsPreserved:
        rowContracts.cardUsage.count >= 254 &&
        rowContracts.reservation.count >= 384 &&
        rowContracts.purchaseOrder.count >= 21 &&
        rowContracts.followUpTask.count >= 2065 &&
        rowContracts.procurementOrder.count >= 3,
      historicalRowsNotFabricated:
        rowContracts.cardUsage.keyed === 0 &&
        rowContracts.reservation.keyed === 0 &&
        rowContracts.reservation.fingerprinted === 0 &&
        rowContracts.reservation.manual === rowContracts.reservation.count &&
        rowContracts.purchaseOrder.keyed === 0 &&
        rowContracts.purchaseOrder.fingerprinted === 0 &&
        rowContracts.followUpTask.keyed === 0 &&
        rowContracts.followUpTask.fingerprinted === 0 &&
        rowContracts.procurementOrder.keyed === 0 &&
        rowContracts.procurementOrder.fingerprinted === 0 &&
        rowContracts.procurementOrder.batch_keyed === 0 &&
        rowContracts.procurementOrder.batch_fingerprinted === 0,
      newFactTablesStartEmpty:
        rowContracts.procurementReceipt.count === 0 &&
        rowContracts.customerFeedback.count === 0 &&
        rowContracts.waitingEpisode.count === 0,
      idempotencyIndexesPresent: indexes.length === 6,
    };
    const failedChecks = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    evidence = {
      generatedAt: new Date().toISOString(),
      status: failedChecks.length ? 'failed' : 'passed',
      databaseWritePerformed: false,
      migrations,
      roles,
      rowContracts,
      indexes: indexes.map((row) => row.indexname),
      checks,
      failedChecks,
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
    writeFileSync(resolvedPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(evidence, null, 2));
  if (process.argv.includes('--strict') && evidence.status !== 'passed') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
