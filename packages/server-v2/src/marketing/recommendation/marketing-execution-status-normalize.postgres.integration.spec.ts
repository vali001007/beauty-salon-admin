import { randomBytes } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import {
  NORMALIZE_LEGACY_EXECUTIONS_SQL,
  NORMALIZE_STALE_QUEUED_TOUCHES_SQL,
} from '../../../prisma/marketing-execution-status-normalize';

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describePostgres =
  process.env.RUN_MARKETING_NORMALIZATION_DB_TESTS === 'true' && databaseUrl ? describe : describe.skip;

describePostgres('marketing execution status normalization PostgreSQL integration', () => {
  let pool: Pool;
  let client: PoolClient;
  let schemaName = '';

  beforeAll(async () => {
    if (!databaseUrl?.includes('127.0.0.1') && !databaseUrl?.includes('localhost')) {
      throw new Error('marketing_normalization_test_requires_local_database');
    }
    schemaName = `marketing_normalize_${process.pid}_${randomBytes(4).toString('hex')}`;
    pool = new Pool({ connectionString: databaseUrl, max: 1 });
    client = await pool.connect();
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}"`);
    await client.query(`
      CREATE TABLE "MarketingAutomationExecution" (
        id integer PRIMARY KEY,
        status text NOT NULL,
        "startedAt" timestamptz,
        "executedAt" timestamptz NOT NULL,
        "reachedCount" integer NOT NULL DEFAULT 0,
        "failedCount" integer NOT NULL DEFAULT 0,
        "completedAt" timestamptz,
        message text
      );
      CREATE TABLE "MarketingAutomationTouch" (
        id integer PRIMARY KEY,
        "executionId" integer NOT NULL,
        status text NOT NULL,
        "errorCode" text,
        "errorMessage" text
      );
      CREATE TABLE "MarketingDeliveryJob" (
        id integer PRIMARY KEY,
        "executionId" integer NOT NULL,
        "touchId" integer NOT NULL,
        status text NOT NULL,
        "leaseExpiresAt" timestamptz
      );
    `);
  });

  afterAll(async () => {
    if (client) {
      await client.query('RESET search_path');
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      client.release();
    }
    if (pool) await pool.end();
  });

  it('fails stale queued touches without an active lease and closes the execution from real outcomes', async () => {
    await client.query(`
      INSERT INTO "MarketingAutomationExecution" (id, status, "startedAt", "executedAt") VALUES
        (1, 'running', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours'),
        (2, 'running', NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '5 minutes'),
        (3, 'running', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours');
      INSERT INTO "MarketingAutomationTouch" (id, "executionId", status) VALUES
        (11, 1, 'delivered'),
        (12, 1, 'queued'),
        (21, 2, 'queued'),
        (31, 3, 'queued');
      INSERT INTO "MarketingDeliveryJob" (id, "executionId", "touchId", status, "leaseExpiresAt") VALUES
        (301, 3, 31, 'leased', NOW() + INTERVAL '5 minutes');
    `);

    await client.query(NORMALIZE_STALE_QUEUED_TOUCHES_SQL);
    await client.query(NORMALIZE_LEGACY_EXECUTIONS_SQL);

    const touches = await client.query<{
      id: number;
      status: string;
      errorCode: string | null;
    }>(`SELECT id, status, "errorCode" FROM "MarketingAutomationTouch" ORDER BY id`);
    expect(touches.rows).toEqual([
      { id: 11, status: 'delivered', errorCode: null },
      { id: 12, status: 'failed', errorCode: 'legacy_execution_stale' },
      { id: 21, status: 'queued', errorCode: null },
      { id: 31, status: 'queued', errorCode: null },
    ]);

    const executions = await client.query<{
      id: number;
      status: string;
      reachedCount: number;
      failedCount: number;
      completed: boolean;
    }>(`
      SELECT id, status, "reachedCount", "failedCount", "completedAt" IS NOT NULL AS completed
      FROM "MarketingAutomationExecution"
      ORDER BY id
    `);
    expect(executions.rows).toEqual([
      { id: 1, status: 'partial_failed', reachedCount: 1, failedCount: 1, completed: true },
      { id: 2, status: 'running', reachedCount: 0, failedCount: 0, completed: false },
      { id: 3, status: 'running', reachedCount: 0, failedCount: 0, completed: false },
    ]);
  });
});
