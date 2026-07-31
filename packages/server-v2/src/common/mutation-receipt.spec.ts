import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildBusinessMutationReceipt,
  buildBusinessMutationRequestFingerprint,
  buildBusinessMutationStateFingerprint,
  businessMutationChangedFields,
  restoreBusinessMutationReceipt,
} from './mutation-receipt.js';

describe('business mutation receipt', () => {
  it('builds a deterministic causal receipt without exposing the raw idempotency key', () => {
    const requestPayload = {
      reservationId: 31,
      appointmentTime: '2026-08-01 16:00:00',
      expectedReservationUpdatedAt: '2026-07-30T10:00:00.000Z',
    };
    const requestFingerprint = buildBusinessMutationRequestFingerprint({
      capabilityKey: 'reschedule_reservation',
      storeId: 6,
      businessObjectType: 'reservation',
      businessObjectId: 31,
      requestPayload,
    });
    const before = { date: '2026-08-01', startTime: '15:00', status: 'confirmed' };
    const after = { date: '2026-08-01', startTime: '16:00', status: 'confirmed' };
    const receipt = buildBusinessMutationReceipt({
      storeId: 6,
      context: {
        capabilityKey: 'reschedule_reservation',
        idempotencyKey: 'brain-action-secret-31',
        mutationKind: 'update',
        requestPayload,
        actorId: 9,
      },
      businessObjectType: 'reservation',
      businessObjectId: 31,
      requestFingerprint,
      beforeVersion: '2026-07-30T10:00:00.000Z',
      afterVersion: '2026-07-30T10:01:00.000Z',
      beforeStateFingerprint: buildBusinessMutationStateFingerprint({
        businessObjectType: 'reservation',
        businessObjectId: 31,
        version: '2026-07-30T10:00:00.000Z',
        state: before,
      }),
      afterStateFingerprint: buildBusinessMutationStateFingerprint({
        businessObjectType: 'reservation',
        businessObjectId: 31,
        version: '2026-07-30T10:01:00.000Z',
        state: after,
      }),
      changedFields: businessMutationChangedFields(before, after),
      committedAt: new Date('2026-07-30T10:01:00.000Z'),
    });

    expect(receipt.changedFields).toEqual(['startTime']);
    expect(receipt.receiptFingerprint).toHaveLength(64);
    expect(receipt.idempotencyKeyFingerprint).toHaveLength(64);
    expect(JSON.stringify(receipt)).not.toContain('brain-action-secret-31');
  });

  it('restores only an untampered persisted receipt', () => {
    const row = persistedFixture();
    expect(restoreBusinessMutationReceipt(row)).toMatchObject({
      capabilityKey: 'cancel_reservation',
      businessObjectId: '31',
      changedFields: ['status'],
    });
    expect(() => restoreBusinessMutationReceipt({ ...row, afterVersion: 'tampered' })).toThrow(
      'business_mutation_receipt_fingerprint_invalid',
    );
  });

  it('keeps the Prisma model and migration unique on the governed mutation identity', () => {
    const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
    const migration = readFileSync(
      resolve(process.cwd(), 'prisma/migrations/20260730160000_business_mutation_receipt/migration.sql'),
      'utf8',
    );
    expect(schema).toMatch(
      /model BusinessMutationReceipt \{[\s\S]*@@unique\(\[storeId, capabilityKey, idempotencyKey\]\)/,
    );
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "business_mutation_receipt"');
    expect(migration).toContain('"business_mutation_receipt_storeId_capabilityKey_idempotencyKey_key"');
  });
});

function persistedFixture() {
  const context = {
    capabilityKey: 'cancel_reservation',
    idempotencyKey: 'brain-action-31',
    mutationKind: 'state_transition' as const,
    requestPayload: {},
  };
  const receipt = buildBusinessMutationReceipt({
    storeId: 6,
    context,
    businessObjectType: 'reservation',
    businessObjectId: 31,
    requestFingerprint: '1'.repeat(64),
    beforeVersion: '2026-07-30T10:00:00.000Z',
    afterVersion: '2026-07-30T10:01:00.000Z',
    beforeStateFingerprint: '2'.repeat(64),
    afterStateFingerprint: '3'.repeat(64),
    changedFields: ['status'],
    committedAt: new Date('2026-07-30T10:01:00.000Z'),
  });
  return {
    storeId: 6,
    capabilityKey: context.capabilityKey,
    idempotencyKey: context.idempotencyKey,
    businessObjectType: receipt.businessObjectType,
    businessObjectId: receipt.businessObjectId,
    mutationKind: receipt.mutationKind,
    requestFingerprint: receipt.requestFingerprint,
    beforeVersion: receipt.before.version,
    afterVersion: receipt.after.version,
    beforeStateFingerprint: receipt.before.stateFingerprint,
    afterStateFingerprint: receipt.after.stateFingerprint,
    changedFields: [...receipt.changedFields],
    receiptFingerprint: receipt.receiptFingerprint,
    committedAt: new Date(receipt.committedAt),
  };
}
