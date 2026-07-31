import { buildBusinessMutationReceipt } from '../../common/mutation-receipt.js';
import { createCuratedActionCandidates } from '../../semantic-data/brain-action-candidate-catalog.js';
import { createBusinessDefinitionProjectionFingerprint } from '../../semantic-data/business-definition-projection-compiler.service.js';
import { evaluateBusinessActionInstitutionalEffect } from './business-action-institutional-effect.js';

describe('business action institutional effect', () => {
  it('marks cancellation effective only from confirmation identity, observed transition and transaction receipt', () => {
    const action = createCuratedActionCandidates().find(
      (candidate) => candidate.definitionKey === 'action.cancel_reservation',
    )!.payload as any;
    const result = evaluateBusinessActionInstitutionalEffect({
      action,
      provenance: provenance(),
      receipt: receipt(),
      effectObservations: [effectObservation('observed')],
      actionInvariantEvaluation: { status: 'satisfied' } as any,
      permissionValidatedAtExecution: true,
      evaluatedAt: new Date('2026-07-30T11:00:01.000Z'),
    })!;

    expect(result).toMatchObject({
      status: 'effective',
      actionKey: 'action.cancel_reservation',
      businessObjectType: 'reservation',
      businessObjectId: '44',
      storeId: 6,
      authorizerSubjectRef: 'user:9',
      requiredPermission: 'core:store:reservations',
      effectiveAt: '2026-07-30T11:00:00.000Z',
      invalidityReasons: [],
    });
    const { fingerprint, ...fingerprintInput } = result;
    expect(fingerprint).toBe(createBusinessDefinitionProjectionFingerprint(fingerprintInput));
  });

  it('fails closed when the authorizer conflicts or the formal transition is not observed', () => {
    const action = createCuratedActionCandidates().find(
      (candidate) => candidate.definitionKey === 'action.cancel_reservation',
    )!.payload as any;
    const conflicting = provenance();
    conflicting.participants = conflicting.participants.map((participant: any) =>
      participant.role === 'authorizer' ? { ...participant, subjectRef: 'user:10' } : participant,
    );
    const conflict = evaluateBusinessActionInstitutionalEffect({
      action,
      provenance: conflicting,
      receipt: receipt(),
      effectObservations: [effectObservation('observed')],
      actionInvariantEvaluation: { status: 'satisfied' } as any,
      permissionValidatedAtExecution: true,
    })!;
    expect(conflict).toMatchObject({
      status: 'conflicted',
      invalidityReasons: expect.arrayContaining(['authorizer_actor_conflict']),
    });

    const unknown = evaluateBusinessActionInstitutionalEffect({
      action,
      provenance: provenance(),
      receipt: receipt(),
      effectObservations: [effectObservation('unobserved')],
      actionInvariantEvaluation: { status: 'satisfied' } as any,
      permissionValidatedAtExecution: true,
    })!;
    expect(unknown.status).not.toBe('effective');
    expect(unknown.invalidityReasons).toContain('formal_state_transition_not_observed');
  });

  it.each([
    {
      name: 'capability',
      mutate: (value: any) => ({
        ...value,
        mutationReceipt: { ...value.mutationReceipt, capabilityKey: 'other_action' },
      }),
      reason: 'mutation_capability_conflict',
    },
    {
      name: 'business object type',
      mutate: (value: any) => ({
        ...value,
        mutationReceipt: { ...value.mutationReceipt, businessObjectType: 'purchase_order' },
      }),
      reason: 'mutation_business_object_type_conflict',
    },
    {
      name: 'business object identity',
      mutate: (value: any) => ({
        ...value,
        mutationReceipt: { ...value.mutationReceipt, businessObjectId: 45 },
      }),
      reason: 'mutation_business_object_identity_conflict',
    },
    {
      name: 'store',
      mutate: (value: any) => ({
        ...value,
        mutationReceipt: { ...value.mutationReceipt, storeId: 7 },
      }),
      reason: 'mutation_store_conflict',
    },
  ])('never promotes a $name conflict to effective', ({ mutate, reason }) => {
    const action = createCuratedActionCandidates().find(
      (candidate) => candidate.definitionKey === 'action.cancel_reservation',
    )!.payload as any;
    const result = evaluateBusinessActionInstitutionalEffect({
      action,
      provenance: provenance(),
      receipt: mutate(receipt()),
      effectObservations: [effectObservation('observed')],
      actionInvariantEvaluation: { status: 'satisfied' } as any,
      permissionValidatedAtExecution: true,
    })!;

    expect(result.status).toBe('conflicted');
    expect(result.invalidityReasons).toContain(reason);
    expect(result.effectiveAt).toBeUndefined();
  });

  it('does not become effective without current permission or a satisfied action invariant', () => {
    const action = createCuratedActionCandidates().find(
      (candidate) => candidate.definitionKey === 'action.cancel_reservation',
    )!.payload as any;
    const result = evaluateBusinessActionInstitutionalEffect({
      action,
      provenance: provenance(),
      receipt: receipt(),
      effectObservations: [effectObservation('observed')],
      actionInvariantEvaluation: { status: 'unknown' } as any,
      permissionValidatedAtExecution: false,
    })!;

    expect(result.status).toBe('ineffective');
    expect(result.invalidityReasons).toEqual(
      expect.arrayContaining(['current_permission_not_validated', 'transaction_invariant_not_satisfied']),
    );
    expect(result.effectiveAt).toBeUndefined();
  });
});

function provenance(): any {
  return {
    schemaVersion: '1.2',
    gatewayActionKey: 'cancel_reservation',
    situationContext: { storeId: 6, actorUserId: 9 },
    participants: [
      { role: 'requester', subjectRef: 'user:9' },
      { role: 'authorizer', subjectRef: 'user:9' },
      { role: 'performer', subjectRef: 'gateway:cancel_reservation' },
      { role: 'accountable_party', subjectRef: 'user:9' },
    ],
  };
}

function receipt(): any {
  return {
    status: 'succeeded',
    capabilityKey: 'cancel_reservation',
    businessObjectType: 'reservation',
    businessObjectId: 44,
    result: { id: 44 },
    mutationReceipt: buildBusinessMutationReceipt({
      storeId: 6,
      context: {
        capabilityKey: 'cancel_reservation',
        idempotencyKey: 'cancel-44',
        mutationKind: 'state_transition',
        requestPayload: { reservationId: 44 },
      },
      businessObjectType: 'reservation',
      businessObjectId: 44,
      requestFingerprint: '1'.repeat(64),
      beforeVersion: '2026-07-30T10:59:59.000Z',
      afterVersion: '2026-07-30T11:00:00.000Z',
      beforeStateFingerprint: '2'.repeat(64),
      afterStateFingerprint: '3'.repeat(64),
      changedFields: ['status'],
      committedAt: new Date('2026-07-30T11:00:00.000Z'),
    }),
  };
}

function effectObservation(status: 'observed' | 'unobserved'): any {
  return {
    effectKey: 'reservation_cancelled',
    version: 4,
    fingerprint: '4'.repeat(64),
    status,
    evidenceCode: status === 'observed' ? 'reservation_cancel_mutation_receipt_observed' : 'not_observed',
    observedAt: '2026-07-30T11:00:00.000Z',
    verificationDeadline: '2026-07-30T11:00:05.000Z',
  };
}
