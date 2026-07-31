import { createBusinessDefinitionProjectionFingerprint } from '../../semantic-data/business-definition-projection-compiler.service.js';
import { curatedActionRelationRef } from '../../semantic-data/brain-action-relation-catalog.js';
import type {
  BusinessActionClass,
  BusinessActionParticipantProfile,
  BusinessActionRelationProfile,
} from './business-definition-snapshot.types.js';

const PARTICIPANT_RELATION_KEYS = {
  requester: 'action_relation.requested_by',
  authorizer: 'action_relation.authorized_by',
  approver: 'action_relation.approved_by',
  performer: 'action_relation.performed_by',
  accountable_party: 'action_relation.accountable_party',
  assignee: 'action_relation.assigned_to',
  service_provider: 'action_relation.assigned_service_provider',
  beneficiary: 'action_relation.benefits',
  counterparty: 'action_relation.counterparty',
} as const;

export function createBusinessActionRelationProfile(input: {
  readonly actionKey: string;
  readonly actionClass: BusinessActionClass;
  readonly targetEntityRefs: readonly string[];
  readonly participantProfile: BusinessActionParticipantProfile;
}): BusinessActionRelationProfile {
  const relationRefs: BusinessActionRelationProfile['relationRefs'][number][] = [
    {
      relationDefinitionRef: curatedActionRelationRef('action_relation.occurrence_of'),
      fromRef: '$action_execution',
      toRef: input.actionKey,
      qualificationKeys: qualificationKeys('store', 'business_time', 'evidence'),
      truthStatusPolicy: 'runtime_evaluator_required',
    },
  ];
  if (
    input.actionKey === 'action.cancel_reservation' ||
    input.actionKey === 'action.submit_purchase_order_for_approval'
  ) {
    relationRefs.push({
      relationDefinitionRef: curatedActionRelationRef('action_relation.institutional_effect'),
      fromRef: '$action_execution',
      toRef: `${input.actionKey}.institutional_effect`,
      qualificationKeys: qualificationKeys('role', 'store', 'business_time', 'object_version', 'evidence', 'confirmation'),
      truthStatusPolicy: 'runtime_evaluator_required',
    });
  }
  for (const targetEntityRef of [...new Set(input.targetEntityRefs)].sort()) {
    relationRefs.push({
      relationDefinitionRef: curatedActionRelationRef('action_relation.acts_on'),
      fromRef: input.actionKey,
      toRef: targetEntityRef,
      qualificationKeys: qualificationKeys(),
      truthStatusPolicy: 'declared_only',
    });
    if (input.actionClass === 'create' || input.actionClass === 'reserve') {
      relationRefs.push({
        relationDefinitionRef: curatedActionRelationRef('action_relation.creates'),
        fromRef: input.actionKey,
        toRef: targetEntityRef,
        qualificationKeys: qualificationKeys(),
        truthStatusPolicy: 'declared_only',
      });
    } else if (input.actionClass === 'transition' || input.actionClass === 'update') {
      relationRefs.push({
        relationDefinitionRef: curatedActionRelationRef('action_relation.state_transition'),
        fromRef: '$action_execution',
        toRef: targetEntityRef,
        qualificationKeys: qualificationKeys('object_version'),
        truthStatusPolicy: 'runtime_evaluator_required',
      });
    }
  }
  for (const binding of input.participantProfile.roleBindings) {
    const relationKey = PARTICIPANT_RELATION_KEYS[binding.role];
    if (!relationKey) continue;
    relationRefs.push({
      relationDefinitionRef: curatedActionRelationRef(relationKey),
      fromRef: '$action_execution',
      toRef: `participant.${binding.role}`,
      qualificationKeys: qualificationKeys('role', 'store', 'business_time', 'evidence'),
      ...(binding.slotKey ? { slotKey: binding.slotKey } : {}),
      participantRole: binding.role,
      truthStatusPolicy: 'runtime_evaluator_required',
    });
  }
  const profile = {
    schemaVersion: '1.0' as const,
    profileKey: `${input.actionKey}.relations`,
    unknownRelationPolicy: 'fail_closed' as const,
    inferencePolicy: 'explicit_only' as const,
    relationRefs: relationRefs.sort(
      (left, right) =>
        left.relationDefinitionRef.key.localeCompare(right.relationDefinitionRef.key) ||
        left.fromRef.localeCompare(right.fromRef) ||
        left.toRef.localeCompare(right.toRef),
    ),
  };
  return { ...profile, fingerprint: createBusinessDefinitionProjectionFingerprint(profile) };
}

function qualificationKeys(
  ...keys: BusinessActionRelationProfile['relationRefs'][number]['qualificationKeys'][number][]
) {
  return [...new Set(keys)].sort();
}
