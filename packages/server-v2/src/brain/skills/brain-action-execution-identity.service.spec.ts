import { BrainActionExecutionIdentityService } from './brain-action-execution-identity.service.js';
import { createBrainActionSituationContext } from '../cognition/brain-action-situation-context.js';
import { createBusinessDefinitionProjectionFingerprint } from '../../semantic-data/business-definition-projection-compiler.service.js';

const actionRef = {
  definitionType: 'action' as const,
  definitionKey: 'action.create_reservation',
  definitionVersion: 3,
  definitionFingerprint: 'a'.repeat(64),
  sourceFingerprint: 'b'.repeat(64),
};
const provenance = {
  schemaVersion: '1.0' as const,
  actionRef,
  actionBindingFingerprint: 'c'.repeat(64),
  actionSituationContextProfileFingerprint: '1'.repeat(64),
  actionModalityPolicyFingerprint: '2'.repeat(64),
  actionInformationArtifactProfileFingerprint: '3'.repeat(64),
  actionSideEffectInvariantProfileFingerprint: '4'.repeat(64),
  ontologySnapshotFingerprint: 'd'.repeat(64),
  situationContext: createBrainActionSituationContext({
    profileFingerprint: '1'.repeat(64),
    runId: 7,
    conversationId: 12,
    context: {
      userId: 9,
      storeId: 6,
      visibleStoreIds: [6],
      roles: ['store_manager'],
      permissions: ['core:store:reservations'],
      deniedPermissions: [],
      requestId: 'request-test',
      timezone: 'Asia/Shanghai',
    },
    qualifiedRole: 'store_manager',
  }),
  informationArtifacts: [],
  capability: {
    key: 'reservation_action_preview',
    version: 12,
    sourceFingerprint: 'e'.repeat(64),
  },
  gatewayActionKey: 'create_reservation',
  release: { releaseId: 417, releaseFingerprint: 'f'.repeat(64) },
};

function fixture() {
  const card = {
    key: 'reservation_action_preview',
    version: 12,
    sourceFingerprint: 'e'.repeat(64),
    definitionRefs: [{ ...actionRef, definitionId: 1, versionId: 31, version: 3 }],
  };
  const snapshot = {
    fingerprint: 'd'.repeat(64),
    actions: [
      {
        ...actionRef,
        version: actionRef.definitionVersion,
        actionKey: actionRef.definitionKey,
        bindingFingerprint: 'c'.repeat(64),
        situationContext: { fingerprint: '1'.repeat(64) },
        modalityPolicy: { fingerprint: '2'.repeat(64) },
        informationArtifact: { fingerprint: '3'.repeat(64) },
        sideEffectInvariant: { fingerprint: '4'.repeat(64) },
        capabilityBindings: [
          {
            capabilityKey: 'reservation_action_preview',
            bindingMode: 'preview_and_execute',
            gatewayActionKey: 'create_reservation',
            priority: 0,
            enabled: true,
          },
        ],
      },
    ],
  };
  const releaseService = {
    loadFreshEvaluationRelease: jest.fn().mockResolvedValue({
      releaseId: 417,
      releaseStatus: 'draft',
      releaseFingerprint: 'f'.repeat(64),
      capabilityCandidates: [{ definitionRefs: [{ versionId: 31 }] }],
    }),
  };
  const ontologyRuntime = { loadEvaluationSnapshot: jest.fn().mockResolvedValue(snapshot) };
  const capabilityCatalog = { listEnabledCapabilities: jest.fn().mockResolvedValue([card]) };
  return {
    service: new BrainActionExecutionIdentityService(
      ontologyRuntime as never,
      releaseService as never,
      capabilityCatalog as never,
    ),
    releaseService,
    ontologyRuntime,
    capabilityCatalog,
    snapshot,
    card,
  };
}

function governedFixture() {
  const base = fixture();
  const participantProfile = {
    fingerprint: '5'.repeat(64),
    roleBindings: [
      { role: 'requester', source: 'authenticated_user' },
      { role: 'authorizer', source: 'confirmation_actor' },
      { role: 'performer', source: 'gateway_executor' },
      { role: 'accountable_party', source: 'confirmation_actor' },
    ],
  };
  const relationProfile = { fingerprint: '6'.repeat(64) };
  const action = { ...base.snapshot.actions[0], participantProfile, relationProfile };
  base.snapshot.actions = [action] as never;
  base.ontologyRuntime.loadEvaluationSnapshot.mockResolvedValue(base.snapshot);
  const participant = (role: string, source: string, subjectRef: string) => {
    const value = {
      role,
      source,
      subjectRef,
      storeId: provenance.situationContext.storeId,
      businessDate: provenance.situationContext.businessDate,
    };
    return { ...value, fingerprint: createBusinessDefinitionProjectionFingerprint(value) };
  };
  const governedProvenance = {
    ...provenance,
    schemaVersion: '1.1' as const,
    actionParticipantProfileFingerprint: participantProfile.fingerprint,
    actionRelationProfileFingerprint: relationProfile.fingerprint,
    participants: [
      participant('requester', 'authenticated_user', 'user:9'),
      participant('authorizer', 'confirmation_actor', 'user:9'),
      participant('performer', 'gateway_executor', 'gateway:create_reservation'),
      participant('accountable_party', 'confirmation_actor', 'user:9'),
    ],
  };
  return { ...base, governedProvenance };
}

function institutionalFixture() {
  const base = governedFixture();
  const institutionalEffect = { fingerprint: '7'.repeat(64) };
  const action = { ...base.snapshot.actions[0], institutionalEffect };
  base.snapshot.actions = [action] as never;
  base.ontologyRuntime.loadEvaluationSnapshot.mockResolvedValue(base.snapshot);
  return {
    ...base,
    institutionalProvenance: {
      ...base.governedProvenance,
      schemaVersion: '1.2' as const,
      actionInstitutionalEffectProfileFingerprint: institutionalEffect.fingerprint,
    },
  };
}

describe('BrainActionExecutionIdentityService', () => {
  it('revalidates the exact release, ontology, action binding and capability identity', async () => {
    const { service, releaseService, ontologyRuntime, capabilityCatalog } = fixture();

    await expect(service.assertCurrent(provenance)).resolves.toEqual(
      expect.objectContaining({ action: expect.any(Object), card: expect.any(Object) }),
    );

    expect(releaseService.loadFreshEvaluationRelease).toHaveBeenCalledWith(417);
    expect(ontologyRuntime.loadEvaluationSnapshot).toHaveBeenCalledWith([31]);
    expect(capabilityCatalog.listEnabledCapabilities).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the frozen release identity changed', async () => {
    const { service, releaseService, ontologyRuntime } = fixture();
    releaseService.loadFreshEvaluationRelease.mockResolvedValueOnce({
      releaseId: 417,
      releaseStatus: 'draft',
      releaseFingerprint: '0'.repeat(64),
      capabilityCandidates: [],
    });

    await expect(service.assertCurrent(provenance)).rejects.toThrow('action_release_drift');
    expect(ontologyRuntime.loadEvaluationSnapshot).not.toHaveBeenCalled();
  });

  it('fails closed when the ontology snapshot changed', async () => {
    const { service, ontologyRuntime } = fixture();
    ontologyRuntime.loadEvaluationSnapshot.mockResolvedValueOnce({ fingerprint: '0'.repeat(64), actions: [] });

    await expect(service.assertCurrent(provenance)).rejects.toThrow('action_ontology_snapshot_drift');
  });

  it('fails closed when the action binding changed', async () => {
    const { service, snapshot, ontologyRuntime } = fixture();
    ontologyRuntime.loadEvaluationSnapshot.mockResolvedValueOnce({
      ...snapshot,
      actions: [{ ...snapshot.actions[0], bindingFingerprint: '0'.repeat(64) }],
    });

    await expect(service.assertCurrent(provenance)).rejects.toThrow('action_binding_drift');
  });

  it('fails closed when the governed situation context profile changed', async () => {
    const { service, snapshot, ontologyRuntime } = fixture();
    ontologyRuntime.loadEvaluationSnapshot.mockResolvedValueOnce({
      ...snapshot,
      actions: [{ ...snapshot.actions[0], situationContext: { fingerprint: '0'.repeat(64) } }],
    });

    await expect(service.assertCurrent(provenance)).rejects.toThrow('action_situation_context_profile_drift');
  });

  it('fails closed when the governed action modality policy changed', async () => {
    const { service, snapshot, ontologyRuntime } = fixture();
    ontologyRuntime.loadEvaluationSnapshot.mockResolvedValueOnce({
      ...snapshot,
      actions: [{ ...snapshot.actions[0], modalityPolicy: { fingerprint: '0'.repeat(64) } }],
    });

    await expect(service.assertCurrent(provenance)).rejects.toThrow('action_modality_policy_drift');
  });

  it('fails closed when the governed information artifact profile changed', async () => {
    const { service, snapshot, ontologyRuntime } = fixture();
    ontologyRuntime.loadEvaluationSnapshot.mockResolvedValueOnce({
      ...snapshot,
      actions: [{ ...snapshot.actions[0], informationArtifact: { fingerprint: '0'.repeat(64) } }],
    });

    await expect(service.assertCurrent(provenance)).rejects.toThrow('action_information_artifact_profile_drift');
  });

  it('fails closed when the governed side-effect invariant profile changed', async () => {
    const { service, snapshot, ontologyRuntime } = fixture();
    ontologyRuntime.loadEvaluationSnapshot.mockResolvedValueOnce({
      ...snapshot,
      actions: [{ ...snapshot.actions[0], sideEffectInvariant: { fingerprint: '0'.repeat(64) } }],
    });

    await expect(service.assertCurrent(provenance)).rejects.toThrow('action_side_effect_invariant_profile_drift');
  });

  it('revalidates participant and relation profile identity for provenance 1.1', async () => {
    const { service, governedProvenance } = governedFixture();
    await expect(service.assertCurrent(governedProvenance as never)).resolves.toEqual(
      expect.objectContaining({ action: expect.any(Object), card: expect.any(Object) }),
    );
  });

  it('requires a new preview when legacy provenance points at a governed action definition', async () => {
    const { service } = governedFixture();
    await expect(service.assertCurrent(provenance)).rejects.toThrow('action_relation_provenance_upgrade_required');
  });

  it('revalidates the institutional-effect profile identity for provenance 1.2', async () => {
    const { service, institutionalProvenance } = institutionalFixture();
    await expect(service.assertCurrent(institutionalProvenance as never)).resolves.toEqual(
      expect.objectContaining({ action: expect.any(Object), card: expect.any(Object) }),
    );
  });

  it('requires provenance 1.2 when the governed action has an institutional-effect profile', async () => {
    const { service, institutionalProvenance } = institutionalFixture();
    const legacy = {
      ...institutionalProvenance,
      schemaVersion: '1.1' as const,
      actionInstitutionalEffectProfileFingerprint: undefined,
    };
    await expect(service.assertCurrent(legacy as never)).rejects.toThrow(
      'action_institutional_effect_provenance_upgrade_required',
    );
  });

  it('fails closed when the institutional-effect profile fingerprint drifts', async () => {
    const { service, institutionalProvenance } = institutionalFixture();
    await expect(
      service.assertCurrent({
        ...institutionalProvenance,
        actionInstitutionalEffectProfileFingerprint: '0'.repeat(64),
      } as never),
    ).rejects.toThrow('action_institutional_effect_profile_drift');
  });

  it('rejects an institutional-effect fingerprint on an action where the profile does not apply', async () => {
    const { service, governedProvenance } = governedFixture();
    await expect(
      service.assertCurrent({
        ...governedProvenance,
        schemaVersion: '1.2',
        actionInstitutionalEffectProfileFingerprint: '7'.repeat(64),
      } as never),
    ).rejects.toThrow('action_institutional_effect_profile_unexpected');
  });

  it('fails closed when a participant binding or participant fingerprint drifts', async () => {
    const { service, governedProvenance } = governedFixture();
    const tampered = {
      ...governedProvenance,
      participants: governedProvenance.participants.map((participant) =>
        participant.role === 'performer' ? { ...participant, subjectRef: 'gateway:other_action' } : participant,
      ),
    };
    await expect(service.assertCurrent(tampered as never)).rejects.toThrow('action_participant_fingerprint_invalid');
  });

  it('fails closed when the frozen binding is preview-only', async () => {
    const { service, snapshot, ontologyRuntime } = fixture();
    ontologyRuntime.loadEvaluationSnapshot.mockResolvedValueOnce({
      ...snapshot,
      actions: [
        {
          ...snapshot.actions[0],
          capabilityBindings: [
            {
              ...snapshot.actions[0].capabilityBindings[0],
              bindingMode: 'preview_only',
            },
          ],
        },
      ],
    });

    await expect(service.assertCurrent(provenance)).rejects.toThrow('action_capability_binding_drift');
  });

  it('fails closed when the bound capability version or source changed', async () => {
    const { service, card, capabilityCatalog } = fixture();
    capabilityCatalog.listEnabledCapabilities.mockResolvedValueOnce([{ ...card, version: 13 }]);

    await expect(service.assertCurrent(provenance)).rejects.toThrow('action_capability_identity_drift');
  });
});
