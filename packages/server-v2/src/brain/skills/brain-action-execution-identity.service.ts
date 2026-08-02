import { BadRequestException, Injectable } from '@nestjs/common';
import { BrainCapabilityCatalogService } from '../capability/brain-capability-catalog.service.js';
import type { BrainCapabilityCard } from '../capability/brain-capability.types.js';
import type { BrainActionExecutionProvenance } from '../cognition/brain-action-execution-provenance.types.js';
import { createBusinessDefinitionProjectionFingerprint } from '../../semantic-data/business-definition-projection-compiler.service.js';
import { BrainOntologyRuntimeService } from '../cognition/brain-ontology-runtime.service.js';
import type { ProductionReadyBusinessDefinitionSnapshot } from '../cognition/business-definition-snapshot.types.js';
import { extractBrainReleaseDefinitionVersionIds } from '../governance/brain-release-definition-versions.js';
import { BrainReleaseService } from '../governance/brain-release.service.js';

@Injectable()
export class BrainActionExecutionIdentityService {
  constructor(
    private readonly ontologyRuntime: BrainOntologyRuntimeService,
    private readonly releaseService: BrainReleaseService,
    private readonly capabilityCatalog: BrainCapabilityCatalogService,
  ) {}

  async assertCurrent(provenance: BrainActionExecutionProvenance) {
    const { snapshot, cards } = provenance.release
      ? await this.loadReleaseIdentity(provenance)
      : await this.loadProductionIdentity();
    if (snapshot.fingerprint !== provenance.ontologySnapshotFingerprint) {
      throw new BadRequestException('action_ontology_snapshot_drift');
    }

    const action = snapshot.actions.find(
      (candidate) =>
        candidate.definitionKey === provenance.actionRef.definitionKey &&
        candidate.version === provenance.actionRef.definitionVersion &&
        candidate.definitionFingerprint === provenance.actionRef.definitionFingerprint &&
        candidate.sourceFingerprint === provenance.actionRef.sourceFingerprint,
    );
    if (!action) throw new BadRequestException('action_definition_drift');
    if (action.bindingFingerprint !== provenance.actionBindingFingerprint) {
      throw new BadRequestException('action_binding_drift');
    }
    if (
      action.situationContext.fingerprint !== provenance.actionSituationContextProfileFingerprint ||
      action.situationContext.fingerprint !== provenance.situationContext.profileFingerprint
    ) {
      throw new BadRequestException('action_situation_context_profile_drift');
    }
    if (action.modalityPolicy.fingerprint !== provenance.actionModalityPolicyFingerprint) {
      throw new BadRequestException('action_modality_policy_drift');
    }
    if (
      action.informationArtifact.fingerprint !== provenance.actionInformationArtifactProfileFingerprint ||
      provenance.informationArtifacts.some(
        (artifact) => artifact.profileFingerprint !== action.informationArtifact.fingerprint,
      )
    ) {
      throw new BadRequestException('action_information_artifact_profile_drift');
    }
    if (action.sideEffectInvariant.fingerprint !== provenance.actionSideEffectInvariantProfileFingerprint) {
      throw new BadRequestException('action_side_effect_invariant_profile_drift');
    }
    if (provenance.schemaVersion === '1.1' || provenance.schemaVersion === '1.2') {
      if (!action.participantProfile || !action.relationProfile) {
        throw new BadRequestException('action_relation_governance_profile_missing');
      }
      if (action.participantProfile.fingerprint !== provenance.actionParticipantProfileFingerprint) {
        throw new BadRequestException('action_participant_profile_drift');
      }
      if (action.relationProfile.fingerprint !== provenance.actionRelationProfileFingerprint) {
        throw new BadRequestException('action_relation_profile_drift');
      }
      this.assertParticipants(action, provenance);
    } else if (action.participantProfile || action.relationProfile) {
      throw new BadRequestException('action_relation_provenance_upgrade_required');
    }
    if (action.institutionalEffect) {
      if (provenance.schemaVersion !== '1.2') {
        throw new BadRequestException('action_institutional_effect_provenance_upgrade_required');
      }
      if (
        provenance.actionInstitutionalEffectProfileFingerprint !== action.institutionalEffect.fingerprint
      ) {
        throw new BadRequestException('action_institutional_effect_profile_drift');
      }
    } else if (provenance.actionInstitutionalEffectProfileFingerprint) {
      throw new BadRequestException('action_institutional_effect_profile_unexpected');
    }
    const binding = action.capabilityBindings.find(
      (candidate) =>
        candidate.enabled &&
        candidate.bindingMode === 'preview_and_execute' &&
        candidate.capabilityKey === provenance.capability.key &&
        (candidate.gatewayActionKey?.trim() || candidate.capabilityKey) === provenance.gatewayActionKey,
    );
    if (!binding) throw new BadRequestException('action_capability_binding_drift');

    const card = cards.find(
      (candidate) =>
        candidate.key === provenance.capability.key &&
        candidate.version === provenance.capability.version &&
        candidate.sourceFingerprint === provenance.capability.sourceFingerprint,
    );
    if (!card) throw new BadRequestException('action_capability_identity_drift');
    if (!card.definitionRefs.some((reference) => this.sameActionRef(reference, provenance.actionRef))) {
      throw new BadRequestException('action_capability_definition_ref_drift');
    }
    return { action, card };
  }

  private async loadReleaseIdentity(provenance: BrainActionExecutionProvenance): Promise<{
    snapshot: ProductionReadyBusinessDefinitionSnapshot;
    cards: readonly BrainCapabilityCard[];
  }> {
    const release = await this.releaseService.loadFreshEvaluationRelease(provenance.release!.releaseId);
    if (release.releaseFingerprint !== provenance.release!.releaseFingerprint) {
      throw new BadRequestException('action_release_drift');
    }
    const cards = await this.capabilityCatalog.listEnabledCapabilities(release.capabilityCandidates);
    const definitionVersionIds = extractBrainReleaseDefinitionVersionIds(release.capabilityCandidates);
    const snapshot = await this.ontologyRuntime.loadEvaluationSnapshot(definitionVersionIds);
    return { snapshot, cards };
  }

  private async loadProductionIdentity(): Promise<{
    snapshot: ProductionReadyBusinessDefinitionSnapshot;
    cards: readonly BrainCapabilityCard[];
  }> {
    const snapshot = this.ontologyRuntime.getSnapshot() ?? (await this.ontologyRuntime.loadProductionReadySnapshot());
    const cards = await this.capabilityCatalog.listEnabledCapabilities();
    return { snapshot, cards };
  }

  private sameActionRef(
    reference: BrainCapabilityCard['definitionRefs'][number],
    actionRef: BrainActionExecutionProvenance['actionRef'],
  ) {
    return (
      reference.definitionKey === actionRef.definitionKey &&
      reference.version === actionRef.definitionVersion &&
      reference.definitionFingerprint === actionRef.definitionFingerprint &&
      reference.sourceFingerprint === actionRef.sourceFingerprint
    );
  }

  private assertParticipants(
    action: NonNullable<ProductionReadyBusinessDefinitionSnapshot['actions'][number]>,
    provenance: BrainActionExecutionProvenance,
  ) {
    const participants = provenance.participants ?? [];
    const profile = action.participantProfile!;
    const seen = new Set<string>();
    for (const participant of participants) {
      const profileBinding = profile.roleBindings.find(
        (binding) =>
          binding.role === participant.role &&
          binding.source === participant.source &&
          (binding.slotKey ?? '') === (participant.slotKey ?? ''),
      );
      if (!profileBinding) throw new BadRequestException('action_participant_binding_drift');
      if (
        participant.storeId !== provenance.situationContext.storeId ||
        participant.businessDate !== provenance.situationContext.businessDate
      ) {
        throw new BadRequestException('action_participant_situation_mismatch');
      }
      const { fingerprint, ...fingerprintInput } = participant;
      if (fingerprint !== createBusinessDefinitionProjectionFingerprint(fingerprintInput)) {
        throw new BadRequestException('action_participant_fingerprint_invalid');
      }
      const key = `${participant.role}:${participant.slotKey ?? participant.subjectRef}`;
      if (seen.has(key)) throw new BadRequestException('action_participant_duplicate');
      seen.add(key);
    }
    for (const requiredRole of ['requester', 'authorizer', 'performer', 'accountable_party']) {
      const participant = participants.find((item) => item.role === requiredRole);
      if (!participant) throw new BadRequestException(`action_participant_missing:${requiredRole}`);
      if (
        (requiredRole === 'requester' || requiredRole === 'authorizer' || requiredRole === 'accountable_party') &&
        participant.subjectRef !== `user:${provenance.situationContext.actorUserId}`
      ) {
        throw new BadRequestException(`action_participant_actor_mismatch:${requiredRole}`);
      }
    }
    const performer = participants.find((item) => item.role === 'performer');
    if (performer?.subjectRef !== `gateway:${provenance.gatewayActionKey}`) {
      throw new BadRequestException('action_participant_performer_mismatch');
    }
  }
}
