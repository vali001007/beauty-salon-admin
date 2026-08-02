import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

export const BUSINESS_DATABASE_WRITE_SET_SCHEMA_VERSION = '1.0' as const;
export const BUSINESS_DATABASE_WRITE_SET_COVERAGE_BOUNDARY = 'database_trigger_observed_public_tables' as const;

export interface BusinessDatabaseWriteSetContext {
  readonly storeId: number;
  readonly capabilityKey: string;
  readonly idempotencyKey: string;
}

export interface BusinessDatabaseWriteSetEntryEvidence {
  readonly sequence: number;
  readonly modelName: string;
  readonly tableName: string;
  readonly operation: 'create' | 'update' | 'delete';
  readonly rowIdentity: Readonly<Record<string, unknown>>;
  readonly changedFields: readonly string[];
  readonly beforeStateFingerprint?: string;
  readonly afterStateFingerprint?: string;
}

export interface BusinessDatabaseWriteSetEvidence {
  readonly schemaVersion: typeof BUSINESS_DATABASE_WRITE_SET_SCHEMA_VERSION;
  readonly writeSetId: string;
  readonly storeId: number;
  readonly capabilityKey: string;
  readonly idempotencyKeyFingerprint: string;
  readonly databaseTransactionId: string;
  readonly coverageBoundary: typeof BUSINESS_DATABASE_WRITE_SET_COVERAGE_BOUNDARY;
  readonly monitorTableCount: number;
  readonly monitorFingerprint: string;
  readonly entries: readonly BusinessDatabaseWriteSetEntryEvidence[];
  readonly entryCount: number;
  readonly startedAt: string;
  readonly finalizedAt: string;
  readonly writeSetFingerprint: string;
}

type WriteSetTransaction = Prisma.TransactionClient;

interface PersistedWriteSetEntry {
  readonly id: bigint;
  readonly databaseTransactionId: bigint;
  readonly modelName: string;
  readonly tableName: string;
  readonly operation: string;
  readonly rowIdentity: unknown;
  readonly changedFields: unknown;
  readonly beforeStateFingerprint: string | null;
  readonly afterStateFingerprint: string | null;
}

export interface PersistedBusinessDatabaseWriteSet {
  readonly id: string;
  readonly storeId: number;
  readonly capabilityKey: string;
  readonly idempotencyKey: string;
  readonly databaseTransactionId: bigint;
  readonly status: string;
  readonly coverageBoundary: string;
  readonly monitorTableCount: number;
  readonly monitorFingerprint: string;
  readonly entryCount: number;
  readonly writeSetFingerprint: string | null;
  readonly startedAt: Date;
  readonly finalizedAt: Date | null;
  readonly entries: readonly PersistedWriteSetEntry[];
}

export async function beginBusinessDatabaseWriteSet(
  tx: WriteSetTransaction,
  input: BusinessDatabaseWriteSetContext,
): Promise<{ writeSetId: string }> {
  if (!Number.isInteger(input.storeId) || input.storeId <= 0) {
    throw new Error('business_database_write_set_store_invalid');
  }
  if (!input.capabilityKey.trim() || !input.idempotencyKey.trim()) {
    throw new Error('business_database_write_set_identity_invalid');
  }
  const [monitor] = await tx.$queryRaw<
    Array<{ transactionId: string; tableCount: number; monitorFingerprint: string; coverageComplete: boolean }>
  >(Prisma.sql`
    WITH eligible_tables AS (
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN (
          '_prisma_migrations',
          'business_database_write_set',
          'business_database_write_set_entry'
        )
    ), monitored_tables AS (
      SELECT namespace.nspname AS table_schema, relation.relname AS table_name
      FROM pg_catalog.pg_trigger trigger
      JOIN pg_catalog.pg_class relation ON relation.oid = trigger.tgrelid
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE trigger.tgname = 'ami_business_write_set_capture_row'
        AND trigger.tgisinternal = false
        AND namespace.nspname = 'public'
    )
    SELECT
      txid_current()::text AS "transactionId",
      (SELECT COUNT(*)::int FROM eligible_tables) AS "tableCount",
      (
        SELECT encode(
          extensions.digest(
            COALESCE(string_agg(format('%I.%I', table_schema, table_name), ',' ORDER BY table_schema, table_name), ''),
            'sha256'
          ),
          'hex'
        )
        FROM eligible_tables
      ) AS "monitorFingerprint",
      NOT EXISTS (
        (SELECT table_schema, table_name FROM eligible_tables)
        EXCEPT
        (SELECT table_schema, table_name FROM monitored_tables)
      ) AND NOT EXISTS (
        (SELECT table_schema, table_name FROM monitored_tables)
        EXCEPT
        (SELECT table_schema, table_name FROM eligible_tables)
      ) AS "coverageComplete"
  `);
  if (
    !monitor ||
    monitor.coverageComplete !== true ||
    !/^\d+$/u.test(monitor.transactionId) ||
    !Number.isInteger(monitor.tableCount) ||
    monitor.tableCount <= 0 ||
    !isFingerprint(monitor.monitorFingerprint)
  ) {
    throw new Error('business_database_write_set_monitor_unavailable');
  }

  const writeSetId = randomUUID();
  await tx.businessDatabaseWriteSet.create({
    data: {
      id: writeSetId,
      storeId: input.storeId,
      capabilityKey: input.capabilityKey,
      idempotencyKey: input.idempotencyKey,
      databaseTransactionId: BigInt(monitor.transactionId),
      coverageBoundary: BUSINESS_DATABASE_WRITE_SET_COVERAGE_BOUNDARY,
      monitorTableCount: monitor.tableCount,
      monitorFingerprint: monitor.monitorFingerprint,
    },
  });
  const context = JSON.stringify({ schemaVersion: BUSINESS_DATABASE_WRITE_SET_SCHEMA_VERSION, writeSetId });
  await tx.$queryRaw(Prisma.sql`SELECT set_config('ami.business_write_set_context', ${context}, true)`);
  return { writeSetId };
}

export async function finalizeBusinessDatabaseWriteSet(
  tx: WriteSetTransaction,
  writeSetId: string,
  finalizedAt: Date = new Date(),
): Promise<BusinessDatabaseWriteSetEvidence> {
  const row = await tx.businessDatabaseWriteSet.findUnique({
    where: { id: writeSetId },
    include: { entries: { orderBy: { id: 'asc' } } },
  });
  if (!row) throw new Error('business_database_write_set_missing');
  if (row.status !== 'collecting') throw new Error('business_database_write_set_not_collecting');
  const evidence = buildBusinessDatabaseWriteSetEvidence({
    ...row,
    status: 'finalized',
    entryCount: row.entries.length,
    finalizedAt,
    writeSetFingerprint: null,
  });
  const updated = await tx.businessDatabaseWriteSet.updateMany({
    where: { id: writeSetId, status: 'collecting', databaseTransactionId: row.databaseTransactionId },
    data: {
      status: 'finalized',
      entryCount: evidence.entryCount,
      writeSetFingerprint: evidence.writeSetFingerprint,
      finalizedAt,
    },
  });
  if (updated.count !== 1) throw new Error('business_database_write_set_finalize_conflict');
  return evidence;
}

export async function loadBusinessDatabaseWriteSet(
  tx: Pick<WriteSetTransaction, 'businessDatabaseWriteSet'>,
  input: BusinessDatabaseWriteSetContext,
): Promise<BusinessDatabaseWriteSetEvidence | undefined> {
  const row = await tx.businessDatabaseWriteSet.findUnique({
    where: {
      storeId_capabilityKey_idempotencyKey: {
        storeId: input.storeId,
        capabilityKey: input.capabilityKey,
        idempotencyKey: input.idempotencyKey,
      },
    },
    include: { entries: { orderBy: { id: 'asc' } } },
  });
  return row ? restoreBusinessDatabaseWriteSet(row) : undefined;
}

export function restoreBusinessDatabaseWriteSet(
  row: PersistedBusinessDatabaseWriteSet,
): BusinessDatabaseWriteSetEvidence {
  if (row.status !== 'finalized' || !row.finalizedAt || !isFingerprint(row.writeSetFingerprint)) {
    throw new Error('business_database_write_set_not_finalized');
  }
  const evidence = buildBusinessDatabaseWriteSetEvidence(row);
  if (evidence.writeSetFingerprint !== row.writeSetFingerprint) {
    throw new Error('business_database_write_set_fingerprint_invalid');
  }
  return evidence;
}

export function assertBusinessDatabaseWriteSetEvidence(
  evidence: BusinessDatabaseWriteSetEvidence,
): BusinessDatabaseWriteSetEvidence {
  if (
    evidence.schemaVersion !== BUSINESS_DATABASE_WRITE_SET_SCHEMA_VERSION ||
    evidence.coverageBoundary !== BUSINESS_DATABASE_WRITE_SET_COVERAGE_BOUNDARY ||
    evidence.entryCount !== evidence.entries.length ||
    !isFingerprint(evidence.monitorFingerprint) ||
    !isFingerprint(evidence.writeSetFingerprint)
  ) {
    throw new Error('business_database_write_set_evidence_invalid');
  }
  const { writeSetFingerprint, ...fingerprintInput } = evidence;
  if (fingerprint(fingerprintInput) !== writeSetFingerprint) {
    throw new Error('business_database_write_set_fingerprint_invalid');
  }
  return evidence;
}

function buildBusinessDatabaseWriteSetEvidence(
  row: PersistedBusinessDatabaseWriteSet,
): BusinessDatabaseWriteSetEvidence {
  if (row.coverageBoundary !== BUSINESS_DATABASE_WRITE_SET_COVERAGE_BOUNDARY) {
    throw new Error('business_database_write_set_coverage_invalid');
  }
  if (!row.finalizedAt) throw new Error('business_database_write_set_not_finalized');
  if (!isFingerprint(row.monitorFingerprint)) throw new Error('business_database_write_set_monitor_invalid');
  const transactionId = row.databaseTransactionId.toString();
  const entries = row.entries.map((entry, index) => {
    if (entry.databaseTransactionId.toString() !== transactionId) {
      throw new Error('business_database_write_set_transaction_mismatch');
    }
    if (!['create', 'update', 'delete'].includes(entry.operation)) {
      throw new Error('business_database_write_set_operation_invalid');
    }
    const changedFields = Array.isArray(entry.changedFields)
      ? entry.changedFields.filter((item): item is string => typeof item === 'string').sort()
      : [];
    return {
      sequence: index + 1,
      modelName: entry.modelName,
      tableName: entry.tableName,
      operation: entry.operation as BusinessDatabaseWriteSetEntryEvidence['operation'],
      rowIdentity: jsonObject(entry.rowIdentity),
      changedFields,
      ...(entry.beforeStateFingerprint ? { beforeStateFingerprint: entry.beforeStateFingerprint } : {}),
      ...(entry.afterStateFingerprint ? { afterStateFingerprint: entry.afterStateFingerprint } : {}),
    };
  });
  if (row.entryCount !== entries.length) throw new Error('business_database_write_set_entry_count_invalid');
  const body = {
    schemaVersion: BUSINESS_DATABASE_WRITE_SET_SCHEMA_VERSION,
    writeSetId: row.id,
    storeId: row.storeId,
    capabilityKey: row.capabilityKey,
    idempotencyKeyFingerprint: fingerprint(row.idempotencyKey),
    databaseTransactionId: transactionId,
    coverageBoundary: BUSINESS_DATABASE_WRITE_SET_COVERAGE_BOUNDARY,
    monitorTableCount: row.monitorTableCount,
    monitorFingerprint: row.monitorFingerprint,
    entries,
    entryCount: entries.length,
    startedAt: row.startedAt.toISOString(),
    finalizedAt: row.finalizedAt.toISOString(),
  } as const;
  return { ...body, writeSetFingerprint: fingerprint(body) };
}

function jsonObject(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isFingerprint(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
