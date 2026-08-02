import { buildBusinessMutationReceipt } from '../common/mutation-receipt.js';
import { createTestBusinessDatabaseWriteSetEvidence } from '../common/database-write-set.testing.js';
import {
  CURATED_ACTION_INVARIANT_CATALOG,
  curatedActionInvariantRef,
  evaluateCuratedActionInvariant,
  resolveCuratedActionInvariantContract,
} from './brain-action-invariant-catalog.js';

describe('curated action invariant catalog', () => {
  it('defines one frozen action-specific mutation footprint contract for every first-batch action', () => {
    expect(CURATED_ACTION_INVARIANT_CATALOG.map((item) => item.actionKey)).toEqual([
      'action.create_customer',
      'action.create_purchase_order',
      'action.submit_purchase_order_for_approval',
      'action.create_reservation',
      'action.reschedule_reservation',
      'action.cancel_reservation',
    ]);
    for (const contract of CURATED_ACTION_INVARIANT_CATALOG) {
      expect(contract.fingerprint).toHaveLength(64);
      expect(resolveCuratedActionInvariantContract(curatedActionInvariantRef(contract.actionKey))).toEqual(contract);
      expect(contract.coverageBoundary).toBe('database_trigger_observed_public_tables');
    }
  });

  it('accepts a create action only when its declared effect and business object identity are observed', () => {
    expect(
      evaluateCuratedActionInvariant({
        actionKey: 'action.create_purchase_order',
        contractRef: curatedActionInvariantRef('action.create_purchase_order'),
        receipt: {
          capabilityKey: 'create_purchase_order',
          businessObjectType: 'purchase_order',
          businessObjectId: 91,
          databaseWriteSet: writeSet('create_purchase_order', 91, [
            { modelName: 'PurchaseOrder', tableName: 'PurchaseOrder', operation: 'create', changedFields: ['id'] },
          ]),
        },
        effectObservations: [{ effectKey: 'purchase_order_created', status: 'observed' }],
        evaluatedAt: new Date('2026-07-30T12:00:00.000Z'),
      }),
    ).toMatchObject({
      status: 'satisfied',
      observedWriteTargets: ['PurchaseOrder:create'],
      evidenceCodes: [],
      coverageBoundary: 'database_trigger_observed_public_tables',
    });
  });

  it('requires an exact transactional mutation footprint for reservation state changes', () => {
    const receipt = mutationReceipt(['status']);
    expect(
      evaluateCuratedActionInvariant({
        actionKey: 'action.cancel_reservation',
        contractRef: curatedActionInvariantRef('action.cancel_reservation'),
        receipt: {
          capabilityKey: 'cancel_reservation',
          businessObjectType: 'reservation',
          businessObjectId: 31,
          mutationReceipt: receipt,
          databaseWriteSet: writeSet('cancel_reservation', 31, [
            {
              modelName: 'Reservation',
              tableName: 'Reservation',
              operation: 'update',
              changedFields: ['status', 'updatedAt'],
            },
            {
              modelName: 'BusinessMutationReceipt',
              tableName: 'business_mutation_receipt',
              operation: 'create',
              changedFields: ['id'],
            },
          ]),
        },
        effectObservations: [{ effectKey: 'reservation_cancelled', status: 'observed' }],
        evaluatedAt: new Date('2026-07-30T12:00:00.000Z'),
      }),
    ).toMatchObject({
      status: 'satisfied',
      observedWriteTargets: ['BusinessMutationReceipt:create', 'Reservation:update'],
      changedFields: ['status'],
      evidenceCodes: [],
    });
  });

  it('requires manual reconciliation when transactional evidence is absent or exceeds the action contract', () => {
    const missing = evaluateCuratedActionInvariant({
      actionKey: 'action.cancel_reservation',
      contractRef: curatedActionInvariantRef('action.cancel_reservation'),
      receipt: {
        capabilityKey: 'cancel_reservation',
        businessObjectType: 'reservation',
        businessObjectId: 31,
      },
      effectObservations: [{ effectKey: 'reservation_cancelled', status: 'observed' }],
    });
    expect(missing).toMatchObject({ status: 'manual_reconcile_required' });
    expect(missing.evidenceCodes).toContain('transactional_mutation_receipt_missing');
    expect(missing.evidenceCodes).toContain('database_write_set_missing');

    const excessive = evaluateCuratedActionInvariant({
      actionKey: 'action.cancel_reservation',
      contractRef: curatedActionInvariantRef('action.cancel_reservation'),
      receipt: {
        capabilityKey: 'cancel_reservation',
        businessObjectType: 'reservation',
        businessObjectId: 31,
        mutationReceipt: mutationReceipt(['status', 'customerId']),
        databaseWriteSet: writeSet('cancel_reservation', 31, [
          {
            modelName: 'Reservation',
            tableName: 'Reservation',
            operation: 'update',
            changedFields: ['customerId', 'status', 'updatedAt'],
          },
          {
            modelName: 'BusinessMutationReceipt',
            tableName: 'business_mutation_receipt',
            operation: 'create',
            changedFields: ['id'],
          },
        ]),
      },
      effectObservations: [{ effectKey: 'reservation_cancelled', status: 'observed' }],
    });
    expect(excessive.evidenceCodes).toContain('mutation_changed_fields_outside_contract');
    expect(excessive.evidenceCodes).toContain('database_write_set_changed_fields_outside_contract');
    expect(excessive.status).toBe('manual_reconcile_required');
  });

  it('rejects an undeclared database write even when the declared effect and mutation receipt look valid', () => {
    const result = evaluateCuratedActionInvariant({
      actionKey: 'action.cancel_reservation',
      contractRef: curatedActionInvariantRef('action.cancel_reservation'),
      receipt: {
        capabilityKey: 'cancel_reservation',
        businessObjectType: 'reservation',
        businessObjectId: 31,
        mutationReceipt: mutationReceipt(['status']),
        databaseWriteSet: writeSet('cancel_reservation', 31, [
          {
            modelName: 'Reservation',
            tableName: 'Reservation',
            operation: 'update',
            changedFields: ['status', 'updatedAt'],
          },
          {
            modelName: 'BusinessMutationReceipt',
            tableName: 'business_mutation_receipt',
            operation: 'create',
            changedFields: ['id'],
          },
          {
            modelName: 'Customer',
            tableName: 'Customer',
            operation: 'update',
            changedFields: ['updatedAt'],
          },
        ]),
      },
      effectObservations: [{ effectKey: 'reservation_cancelled', status: 'observed' }],
    });

    expect(result.status).toBe('manual_reconcile_required');
    expect(result.evidenceCodes).toContain('declared_transaction_footprint_mismatch');
    expect(result.observedWriteTargets).toContain('Customer:update');
  });
});

function writeSet(
  capabilityKey: string,
  businessObjectId: number,
  entries: Parameters<typeof createTestBusinessDatabaseWriteSetEvidence>[0]['entries'],
) {
  return createTestBusinessDatabaseWriteSetEvidence({ capabilityKey, businessObjectId, entries });
}

function mutationReceipt(changedFields: string[]) {
  return buildBusinessMutationReceipt({
    storeId: 6,
    context: {
      capabilityKey: 'cancel_reservation',
      idempotencyKey: 'brain-action-31',
      mutationKind: 'state_transition',
      requestPayload: { reservationId: 31 },
    },
    businessObjectType: 'reservation',
    businessObjectId: 31,
    requestFingerprint: '1'.repeat(64),
    beforeVersion: '2026-07-30T10:00:00.000Z',
    afterVersion: '2026-07-30T10:01:00.000Z',
    beforeStateFingerprint: '2'.repeat(64),
    afterStateFingerprint: '3'.repeat(64),
    changedFields,
    committedAt: new Date('2026-07-30T10:01:00.000Z'),
  });
}
