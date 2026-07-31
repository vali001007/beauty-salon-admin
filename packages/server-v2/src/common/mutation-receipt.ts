import { createHash } from 'node:crypto';

export const BUSINESS_MUTATION_RECEIPT_SCHEMA_VERSION = '1.0' as const;

export type BusinessMutationKind = 'update' | 'state_transition';

export interface BusinessMutationContext {
  readonly capabilityKey: string;
  readonly idempotencyKey: string;
  readonly mutationKind: BusinessMutationKind;
  readonly requestPayload: Record<string, unknown>;
  readonly actorId?: number;
}

export interface BusinessMutationReceipt {
  readonly schemaVersion: typeof BUSINESS_MUTATION_RECEIPT_SCHEMA_VERSION;
  readonly receiptFingerprint: string;
  readonly capabilityKey: string;
  readonly idempotencyKeyFingerprint: string;
  readonly businessObjectType: string;
  readonly businessObjectId: string;
  readonly storeId: number;
  readonly mutationKind: BusinessMutationKind;
  readonly requestFingerprint: string;
  readonly before: {
    readonly version: string;
    readonly stateFingerprint: string;
  };
  readonly after: {
    readonly version: string;
    readonly stateFingerprint: string;
  };
  readonly changedFields: readonly string[];
  readonly committedAt: string;
}

export interface PersistedBusinessMutationReceipt {
  readonly storeId: number;
  readonly capabilityKey: string;
  readonly idempotencyKey: string;
  readonly businessObjectType: string;
  readonly businessObjectId: string;
  readonly mutationKind: string;
  readonly requestFingerprint: string;
  readonly beforeVersion: string;
  readonly afterVersion: string;
  readonly beforeStateFingerprint: string;
  readonly afterStateFingerprint: string;
  readonly changedFields: unknown;
  readonly receiptFingerprint: string;
  readonly committedAt: Date;
}

export function buildBusinessMutationRequestFingerprint(input: {
  capabilityKey: string;
  storeId: number;
  businessObjectType: string;
  businessObjectId: number | string;
  requestPayload: Record<string, unknown>;
}) {
  return fingerprint({
    schemaVersion: BUSINESS_MUTATION_RECEIPT_SCHEMA_VERSION,
    capabilityKey: input.capabilityKey,
    storeId: input.storeId,
    businessObjectType: input.businessObjectType,
    businessObjectId: String(input.businessObjectId),
    requestPayload: input.requestPayload,
  });
}

export function buildBusinessMutationStateFingerprint(input: {
  businessObjectType: string;
  businessObjectId: number | string;
  version: string;
  state: Record<string, unknown>;
}) {
  return fingerprint({
    schemaVersion: BUSINESS_MUTATION_RECEIPT_SCHEMA_VERSION,
    businessObjectType: input.businessObjectType,
    businessObjectId: String(input.businessObjectId),
    version: input.version,
    state: input.state,
  });
}

export function buildBusinessMutationReceipt(input: {
  storeId: number;
  context: BusinessMutationContext;
  businessObjectType: string;
  businessObjectId: number | string;
  requestFingerprint: string;
  beforeVersion: string;
  afterVersion: string;
  beforeStateFingerprint: string;
  afterStateFingerprint: string;
  changedFields: readonly string[];
  committedAt: Date;
}): BusinessMutationReceipt {
  const body = {
    schemaVersion: BUSINESS_MUTATION_RECEIPT_SCHEMA_VERSION,
    capabilityKey: input.context.capabilityKey,
    idempotencyKeyFingerprint: fingerprint(input.context.idempotencyKey),
    businessObjectType: input.businessObjectType,
    businessObjectId: String(input.businessObjectId),
    storeId: input.storeId,
    mutationKind: input.context.mutationKind,
    requestFingerprint: input.requestFingerprint,
    before: { version: input.beforeVersion, stateFingerprint: input.beforeStateFingerprint },
    after: { version: input.afterVersion, stateFingerprint: input.afterStateFingerprint },
    changedFields: [...input.changedFields].sort(),
    committedAt: input.committedAt.toISOString(),
  } as const;
  return { ...body, receiptFingerprint: fingerprint(body) };
}

export function restoreBusinessMutationReceipt(row: PersistedBusinessMutationReceipt): BusinessMutationReceipt {
  const mutationKind = row.mutationKind;
  if (mutationKind !== 'update' && mutationKind !== 'state_transition') {
    throw new Error('business_mutation_receipt_kind_invalid');
  }
  const changedFields = Array.isArray(row.changedFields)
    ? row.changedFields.filter((item): item is string => typeof item === 'string').sort()
    : [];
  const receipt = buildBusinessMutationReceipt({
    storeId: row.storeId,
    context: {
      capabilityKey: row.capabilityKey,
      idempotencyKey: row.idempotencyKey,
      mutationKind,
      requestPayload: {},
    },
    businessObjectType: row.businessObjectType,
    businessObjectId: row.businessObjectId,
    requestFingerprint: row.requestFingerprint,
    beforeVersion: row.beforeVersion,
    afterVersion: row.afterVersion,
    beforeStateFingerprint: row.beforeStateFingerprint,
    afterStateFingerprint: row.afterStateFingerprint,
    changedFields,
    committedAt: row.committedAt,
  });
  if (receipt.receiptFingerprint !== row.receiptFingerprint) {
    throw new Error('business_mutation_receipt_fingerprint_invalid');
  }
  return receipt;
}

export function businessMutationChangedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): readonly string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => stableStringify(before[key]) !== stableStringify(after[key]))
    .sort();
}

function fingerprint(value: unknown) {
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
