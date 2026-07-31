import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  assertBusinessDatabaseWriteSetEvidence,
  beginBusinessDatabaseWriteSet,
  BUSINESS_DATABASE_WRITE_SET_COVERAGE_BOUNDARY,
  restoreBusinessDatabaseWriteSet,
  type PersistedBusinessDatabaseWriteSet,
} from './database-write-set.js';

describe('business database write-set evidence', () => {
  it('refuses to begin collection when any eligible public table lacks the audit trigger', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          transactionId: '777',
          tableCount: 120,
          monitorFingerprint: '1'.repeat(64),
          coverageComplete: false,
        },
      ]),
      businessDatabaseWriteSet: { create: jest.fn() },
    };

    await expect(
      beginBusinessDatabaseWriteSet(tx as never, {
        storeId: 6,
        capabilityKey: 'cancel_reservation',
        idempotencyKey: 'cancel-44',
      }),
    ).rejects.toThrow('business_database_write_set_monitor_unavailable');
    expect(tx.businessDatabaseWriteSet.create).not.toHaveBeenCalled();
  });

  it('restores a finalized trigger-observed write set and rejects content drift', () => {
    const row = fixture();
    const first = restoreWithFingerprint(row);

    expect(first).toMatchObject({
      coverageBoundary: BUSINESS_DATABASE_WRITE_SET_COVERAGE_BOUNDARY,
      capabilityKey: 'cancel_reservation',
      entryCount: 2,
      entries: [
        { modelName: 'Reservation', operation: 'update', changedFields: ['status', 'updatedAt'] },
        { modelName: 'BusinessMutationReceipt', operation: 'create' },
      ],
    });
    expect(assertBusinessDatabaseWriteSetEvidence(first)).toBe(first);
    expect(() =>
      assertBusinessDatabaseWriteSetEvidence({
        ...first,
        entries: [{ ...first.entries[0], changedFields: ['remark'] }, first.entries[1]],
      }),
    ).toThrow('business_database_write_set_fingerprint_invalid');
    expect(() =>
      restoreBusinessDatabaseWriteSet({
        ...row,
        writeSetFingerprint: first.writeSetFingerprint,
        entries: [{ ...row.entries[0], changedFields: ['remark'] }, row.entries[1]],
      }),
    ).toThrow('business_database_write_set_fingerprint_invalid');
  });

  it('rejects entries that were not recorded by the same database transaction', () => {
    const row = fixture();
    expect(() =>
      restoreBusinessDatabaseWriteSet({
        ...row,
        writeSetFingerprint: 'a'.repeat(64),
        entries: [{ ...row.entries[0], databaseTransactionId: 778n }, row.entries[1]],
      }),
    ).toThrow('business_database_write_set_transaction_mismatch');
  });

  it('defines an all-public-table trigger migration without rewriting business rows', () => {
    const packageRoot = process.cwd();
    const schema = readFileSync(resolve(packageRoot, 'prisma/schema.prisma'), 'utf8');
    const migration = readFileSync(
      resolve(packageRoot, 'prisma/migrations/20260730210000_brain_action_database_write_set/migration.sql'),
      'utf8',
    );

    expect(schema).toContain('model BusinessDatabaseWriteSet');
    expect(schema).toContain('model BusinessDatabaseWriteSetEntry');
    expect(migration).toContain("current_setting('ami.business_write_set_context', true)");
    expect(migration).toContain("table_schema = 'public'");
    expect(migration).toContain("table_type = 'BASE TABLE'");
    expect(migration).toContain('AFTER INSERT OR UPDATE OR DELETE');
    expect(migration).toContain('txid_current()');
    expect(migration).toContain("digest(before_row::TEXT, 'sha256')");
    expect(migration).toContain('ami_refresh_business_write_set_triggers');
    expect(migration).not.toMatch(/TRUNCATE|DELETE\s+FROM|UPDATE\s+"(?:Customer|PurchaseOrder|Reservation)"/iu);
  });
});

function restoreWithFingerprint(row: PersistedBusinessDatabaseWriteSet) {
  const initial = { ...row, writeSetFingerprint: null };
  expect(() => restoreBusinessDatabaseWriteSet(initial)).toThrow('business_database_write_set_not_finalized');
  const fingerprint = buildExpectedFingerprint(row);
  return restoreBusinessDatabaseWriteSet({ ...row, writeSetFingerprint: fingerprint });
}

function buildExpectedFingerprint(row: PersistedBusinessDatabaseWriteSet): string {
  const entries = row.entries.map((entry, index) => ({
    sequence: index + 1,
    modelName: entry.modelName,
    tableName: entry.tableName,
    operation: entry.operation,
    rowIdentity: entry.rowIdentity,
    changedFields: [...(entry.changedFields as string[])].sort(),
    ...(entry.beforeStateFingerprint ? { beforeStateFingerprint: entry.beforeStateFingerprint } : {}),
    ...(entry.afterStateFingerprint ? { afterStateFingerprint: entry.afterStateFingerprint } : {}),
  }));
  const body = {
    schemaVersion: '1.0',
    writeSetId: row.id,
    storeId: row.storeId,
    capabilityKey: row.capabilityKey,
    idempotencyKeyFingerprint: createHash('sha256').update(JSON.stringify(row.idempotencyKey)).digest('hex'),
    databaseTransactionId: row.databaseTransactionId.toString(),
    coverageBoundary: BUSINESS_DATABASE_WRITE_SET_COVERAGE_BOUNDARY,
    monitorTableCount: row.monitorTableCount,
    monitorFingerprint: row.monitorFingerprint,
    entries,
    entryCount: entries.length,
    startedAt: row.startedAt.toISOString(),
    finalizedAt: row.finalizedAt!.toISOString(),
  };
  return createHash('sha256').update(stableStringify(body)).digest('hex');
}

function fixture(): PersistedBusinessDatabaseWriteSet {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    storeId: 6,
    capabilityKey: 'cancel_reservation',
    idempotencyKey: 'cancel-44',
    databaseTransactionId: 777n,
    status: 'finalized',
    coverageBoundary: BUSINESS_DATABASE_WRITE_SET_COVERAGE_BOUNDARY,
    monitorTableCount: 120,
    monitorFingerprint: '1'.repeat(64),
    entryCount: 2,
    writeSetFingerprint: null,
    startedAt: new Date('2026-07-30T12:00:00.000Z'),
    finalizedAt: new Date('2026-07-30T12:00:01.000Z'),
    entries: [
      {
        id: 1n,
        databaseTransactionId: 777n,
        modelName: 'Reservation',
        tableName: 'Reservation',
        operation: 'update',
        rowIdentity: { id: 44, storeId: 6 },
        changedFields: ['updatedAt', 'status'],
        beforeStateFingerprint: '2'.repeat(64),
        afterStateFingerprint: '3'.repeat(64),
      },
      {
        id: 2n,
        databaseTransactionId: 777n,
        modelName: 'BusinessMutationReceipt',
        tableName: 'business_mutation_receipt',
        operation: 'create',
        rowIdentity: { id: 9, storeId: 6 },
        changedFields: ['id', 'storeId'],
        beforeStateFingerprint: null,
        afterStateFingerprint: '4'.repeat(64),
      },
    ],
  };
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
