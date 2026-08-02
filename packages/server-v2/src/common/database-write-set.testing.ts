import { createHash } from 'node:crypto';
import {
  BUSINESS_DATABASE_WRITE_SET_COVERAGE_BOUNDARY,
  BUSINESS_DATABASE_WRITE_SET_SCHEMA_VERSION,
  type BusinessDatabaseWriteSetEntryEvidence,
  type BusinessDatabaseWriteSetEvidence,
  type PersistedBusinessDatabaseWriteSet,
} from './database-write-set.js';

export function createTestBusinessDatabaseWriteSetEvidence(input: {
  capabilityKey: string;
  idempotencyKey?: string;
  businessObjectId: number | string;
  entries: readonly Omit<BusinessDatabaseWriteSetEntryEvidence, 'sequence' | 'rowIdentity'>[];
  writeSetId?: string;
  storeId?: number;
}): BusinessDatabaseWriteSetEvidence {
  const startedAt = '2026-07-30T12:00:00.000Z';
  const finalizedAt = '2026-07-30T12:00:01.000Z';
  const entries = input.entries.map((entry, index) => ({
    ...entry,
    sequence: index + 1,
    rowIdentity: { id: input.businessObjectId, storeId: input.storeId ?? 6 },
  }));
  const body = {
    schemaVersion: BUSINESS_DATABASE_WRITE_SET_SCHEMA_VERSION,
    writeSetId: input.writeSetId ?? '00000000-0000-4000-8000-000000000001',
    storeId: input.storeId ?? 6,
    capabilityKey: input.capabilityKey,
    idempotencyKeyFingerprint: fingerprint(input.idempotencyKey ?? 'brain-action-31'),
    databaseTransactionId: '777',
    coverageBoundary: BUSINESS_DATABASE_WRITE_SET_COVERAGE_BOUNDARY,
    monitorTableCount: 120,
    monitorFingerprint: '1'.repeat(64),
    entries,
    entryCount: entries.length,
    startedAt,
    finalizedAt,
  } as const;
  return { ...body, writeSetFingerprint: fingerprint(body) };
}

export function createTestPersistedBusinessDatabaseWriteSet(input: {
  capabilityKey: string;
  idempotencyKey?: string;
  businessObjectId: number | string;
  entries: readonly Omit<BusinessDatabaseWriteSetEntryEvidence, 'sequence' | 'rowIdentity'>[];
  writeSetId?: string;
  storeId?: number;
}): PersistedBusinessDatabaseWriteSet {
  const idempotencyKey = input.idempotencyKey ?? 'brain-action-31';
  const evidence = createTestBusinessDatabaseWriteSetEvidence({ ...input, idempotencyKey });
  return {
    id: evidence.writeSetId,
    storeId: evidence.storeId,
    capabilityKey: evidence.capabilityKey,
    idempotencyKey,
    databaseTransactionId: BigInt(evidence.databaseTransactionId),
    status: 'finalized',
    coverageBoundary: evidence.coverageBoundary,
    monitorTableCount: evidence.monitorTableCount,
    monitorFingerprint: evidence.monitorFingerprint,
    entryCount: evidence.entryCount,
    writeSetFingerprint: evidence.writeSetFingerprint,
    startedAt: new Date(evidence.startedAt),
    finalizedAt: new Date(evidence.finalizedAt),
    entries: evidence.entries.map((entry) => ({
      id: BigInt(entry.sequence),
      databaseTransactionId: BigInt(evidence.databaseTransactionId),
      modelName: entry.modelName,
      tableName: entry.tableName,
      operation: entry.operation,
      rowIdentity: entry.rowIdentity,
      changedFields: [...entry.changedFields],
      beforeStateFingerprint: entry.beforeStateFingerprint ?? null,
      afterStateFingerprint: entry.afterStateFingerprint ?? null,
    })),
  };
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
