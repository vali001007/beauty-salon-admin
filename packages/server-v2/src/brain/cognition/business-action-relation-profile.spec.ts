import { createBusinessDefinitionProjectionFingerprint } from '../../semantic-data/business-definition-projection-compiler.service.js';
import {
  CURATED_ACTION_RELATION_DEFINITIONS,
  resolveCuratedActionRelationDefinition,
} from '../../semantic-data/brain-action-relation-catalog.js';
import { createCuratedActionCandidates } from '../../semantic-data/brain-action-candidate-catalog.js';
import { createBrainActionExecutionParticipants } from './business-action-participant-profile.js';

describe('business action relation and participant governance', () => {
  it('freezes every relation definition with level, qualification, truth, evidence, freshness and conflict policy', () => {
    expect(CURATED_ACTION_RELATION_DEFINITIONS.length).toBeGreaterThanOrEqual(14);
    for (const definition of CURATED_ACTION_RELATION_DEFINITIONS) {
      const { fingerprint, ...fingerprintInput } = definition;
      expect(definition.relationKey).toMatch(/^action_relation\.[a-z][a-z0-9_]*$/u);
      expect(definition.domainKinds.length).toBeGreaterThan(0);
      expect(definition.rangeKinds.length).toBeGreaterThan(0);
      expect(['definition', 'occurrence', 'situation', 'evidence']).toContain(definition.relationLevel);
      expect(definition.evaluatorRef).not.toHaveLength(0);
      expect(definition.evidencePolicy).not.toHaveLength(0);
      expect(definition.freshnessPolicy).not.toHaveLength(0);
      expect(['fail_closed', 'reread_authoritative_source', 'manual_review']).toContain(
        definition.conflictPolicy,
      );
      expect(fingerprint).toBe(createBusinessDefinitionProjectionFingerprint(fingerprintInput));
    }
  });

  it('separates authenticated responsibility from the assigned beautician and resolves all relation refs', () => {
    const reservation = createCuratedActionCandidates().find(
      (candidate) => candidate.definitionKey === 'action.create_reservation',
    )!;
    const payload = reservation.payload as any;
    const beautician = payload.inputSlots.find((slot: any) => slot.slotKey === 'beautician');
    expect(beautician.semanticRole).toBe('service_provider');
    expect(beautician.semanticRole).not.toBe('actor');

    const bindings = payload.participantProfile.roleBindings;
    expect(bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'requester', source: 'authenticated_user' }),
        expect.objectContaining({ role: 'authorizer', source: 'confirmation_actor' }),
        expect.objectContaining({ role: 'performer', source: 'gateway_executor' }),
        expect.objectContaining({ role: 'accountable_party', source: 'confirmation_actor' }),
        expect.objectContaining({ role: 'service_provider', source: 'action_slot', slotKey: 'beautician' }),
      ]),
    );
    const { fingerprint: participantFingerprint, ...participantInput } = payload.participantProfile;
    expect(participantFingerprint).toBe(createBusinessDefinitionProjectionFingerprint(participantInput));

    for (const relation of payload.relationProfile.relationRefs) {
      const definition = resolveCuratedActionRelationDefinition(relation.relationDefinitionRef);
      expect(definition).toBeDefined();
      expect([...relation.qualificationKeys].sort()).toEqual(
        [...definition!.qualificationPolicy.requiredKeys].sort(),
      );
      expect(relation.truthStatusPolicy).toBe(
        definition!.truthMode === 'declared' ? 'declared_only' : 'runtime_evaluator_required',
      );
    }
    const { fingerprint: relationFingerprint, ...relationInput } = payload.relationProfile;
    expect(relationFingerprint).toBe(createBusinessDefinitionProjectionFingerprint(relationInput));
  });

  it('keeps state transition truth at occurrence level instead of treating a definition edge as execution proof', () => {
    const submit = createCuratedActionCandidates().find(
      (candidate) => candidate.definitionKey === 'action.submit_purchase_order_for_approval',
    )!;
    const transitionRef = (submit.payload as any).relationProfile.relationRefs.find(
      (relation: any) => relation.relationDefinitionRef.key === 'action_relation.state_transition',
    );
    const definition = resolveCuratedActionRelationDefinition(transitionRef.relationDefinitionRef)!;
    expect(definition).toMatchObject({
      relationLevel: 'occurrence',
      truthMode: 'observed',
      truthUsePolicy: 'success_evidence',
      conflictPolicy: 'reread_authoritative_source',
    });
    expect(transitionRef).toMatchObject({
      fromRef: '$action_execution',
      truthStatusPolicy: 'runtime_evaluator_required',
      qualificationKeys: ['object_version'],
    });
  });

  it('adds institutional-effect evidence only to cancellation and approval-submission actions', () => {
    const candidates = createCuratedActionCandidates();
    for (const actionKey of ['action.cancel_reservation', 'action.submit_purchase_order_for_approval']) {
      const payload = candidates.find((candidate) => candidate.definitionKey === actionKey)!.payload as any;
      expect(payload.institutionalEffect).toMatchObject({
        schemaVersion: '1.0',
        profileKey: `${actionKey}.institutional_effect`,
        truthPolicy: 'observed_only',
        effectiveAtPolicy: 'mutation_receipt_committed_at',
      });
      expect(payload.relationProfile.relationRefs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fromRef: '$action_execution',
            toRef: `${actionKey}.institutional_effect`,
            truthStatusPolicy: 'runtime_evaluator_required',
            relationDefinitionRef: expect.objectContaining({ key: 'action_relation.institutional_effect' }),
          }),
        ]),
      );
      const { fingerprint, ...fingerprintInput } = payload.institutionalEffect;
      expect(fingerprint).toBe(createBusinessDefinitionProjectionFingerprint(fingerprintInput));
    }
    expect(
      (candidates.find((candidate) => candidate.definitionKey === 'action.create_reservation')!.payload as any)
        .institutionalEffect,
    ).toBeUndefined();
  });

  it('freezes the occurrence responsibility chain without persisting raw participant values', () => {
    const reservation = createCuratedActionCandidates().find(
      (candidate) => candidate.definitionKey === 'action.create_reservation',
    )!;
    const profile = (reservation.payload as any).participantProfile;
    const participants = createBrainActionExecutionParticipants({
      profile,
      userId: 7,
      storeId: 6,
      businessDate: '2026-07-30',
      gatewayActionKey: 'create_reservation',
      actionSlots: [
        {
          slotKey: 'beautician',
          semanticRole: 'service_provider',
          source: 'user',
          rawValue: '张美容师',
          entityKey: '88',
          confidence: 0.99,
        },
      ],
    });
    expect(participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'requester', subjectRef: 'user:7' }),
        expect.objectContaining({ role: 'authorizer', subjectRef: 'user:7' }),
        expect.objectContaining({ role: 'performer', subjectRef: 'gateway:create_reservation' }),
        expect.objectContaining({ role: 'accountable_party', subjectRef: 'user:7' }),
        expect.objectContaining({ role: 'service_provider', slotKey: 'beautician' }),
      ]),
    );
    expect(JSON.stringify(participants)).not.toContain('张美容师');
    for (const participant of participants) {
      const { fingerprint, ...fingerprintInput } = participant;
      expect(fingerprint).toBe(createBusinessDefinitionProjectionFingerprint(fingerprintInput));
    }
  });
});
