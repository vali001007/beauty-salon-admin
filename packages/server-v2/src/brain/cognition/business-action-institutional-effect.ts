import { createBusinessDefinitionProjectionFingerprint } from '../../semantic-data/business-definition-projection-compiler.service.js';
import type {
  BusinessActionDefinitionSnapshot,
  BusinessActionInstitutionalEffectProfile,
} from './business-definition-snapshot.types.js';
import type { BrainActionExecutionProvenance } from './brain-action-execution-provenance.types.js';
import type { ActionInvariantEvaluation } from '../../semantic-data/brain-action-invariant-catalog.js';
import type { BrainActionEffectObservation } from '../domain/brain-action-predicate-effect-evaluator.service.js';
import type { BrainCapabilityReceipt } from '../skills/brain-capability-gateway.service.js';

const PROFILE_INPUTS = {
  'action.cancel_reservation': {
    effectKind: 'reservation_cancellation',
    requiredPermission: 'core:store:reservations',
    requiredEffectKey: 'reservation_cancelled',
    requiredBusinessObjectType: 'reservation',
    fromStatePolicy: 'non_terminal_reservation_state',
    toState: 'cancelled',
  },
  'action.submit_purchase_order_for_approval': {
    effectKind: 'purchase_order_submission_for_approval',
    requiredPermission: 'core:inventory:purchase',
    requiredEffectKey: 'purchase_order_submitted_for_approval',
    requiredBusinessObjectType: 'purchase_order',
    fromStatePolicy: 'purchase_order_draft',
    toState: 'pending_approval',
  },
} as const;

export const INSTITUTIONAL_EFFECT_ACTION_KEYS = Object.freeze(Object.keys(PROFILE_INPUTS));

export function createBusinessActionInstitutionalEffectProfile(input: {
  readonly actionKey: string;
  readonly preconditions: readonly string[];
}): BusinessActionInstitutionalEffectProfile | undefined {
  const governed = PROFILE_INPUTS[input.actionKey as keyof typeof PROFILE_INPUTS];
  if (!governed) return undefined;
  const profile = {
    schemaVersion: '1.0' as const,
    profileKey: `${input.actionKey}.institutional_effect`,
    effectKind: governed.effectKind,
    requiredPermission: governed.requiredPermission,
    empoweredRolePolicy: 'current_authenticated_role_with_permission' as const,
    authorizationBasis: 'explicit_confirmation_and_current_permission' as const,
    constitutionPolicy: {
      requiredPreconditionKeys: [...new Set(input.preconditions)].sort(),
      requiredEffectKey: governed.requiredEffectKey,
      requiredMutationKind: 'state_transition' as const,
      requiredBusinessObjectType: governed.requiredBusinessObjectType,
      requiredChangedFields: ['status'] as const,
      requiredParticipantRoles: ['requester', 'authorizer', 'performer', 'accountable_party'] as const,
    },
    formalStateTransition: {
      fromStatePolicy: governed.fromStatePolicy,
      toState: governed.toState,
    },
    effectivenessPolicy: 'observed_state_transition_and_transactional_receipt' as const,
    effectiveAtPolicy: 'mutation_receipt_committed_at' as const,
    truthPolicy: 'observed_only' as const,
    invalidityPolicy: 'fail_closed_with_reason' as const,
  };
  return { ...profile, fingerprint: createBusinessDefinitionProjectionFingerprint(profile) };
}

export type BrainActionInstitutionalEffectStatus = 'effective' | 'ineffective' | 'unknown' | 'conflicted';

export interface BrainActionInstitutionalEffectEvaluation {
  readonly schemaVersion: '1.0';
  readonly profileFingerprint: string;
  readonly actionKey: string;
  readonly status: BrainActionInstitutionalEffectStatus;
  readonly businessObjectType: string;
  readonly businessObjectId: string;
  readonly storeId: number;
  readonly authorizerSubjectRef?: string;
  readonly requiredPermission: string;
  readonly effectiveAt?: string;
  readonly evidenceCodes: readonly string[];
  readonly invalidityReasons: readonly string[];
  readonly evaluatedAt: string;
  readonly fingerprint: string;
}

export function evaluateBusinessActionInstitutionalEffect(input: {
  readonly action: BusinessActionDefinitionSnapshot;
  readonly provenance: BrainActionExecutionProvenance;
  readonly receipt: BrainCapabilityReceipt;
  readonly effectObservations: readonly BrainActionEffectObservation[];
  readonly actionInvariantEvaluation?: ActionInvariantEvaluation;
  readonly permissionValidatedAtExecution: boolean;
  readonly evaluatedAt?: Date;
}): BrainActionInstitutionalEffectEvaluation | undefined {
  const profile = input.action.institutionalEffect;
  if (!profile) return undefined;
  const evidenceCodes: string[] = [];
  const invalidityReasons: string[] = [];
  const conflicts: string[] = [];
  const mutation = input.receipt.mutationReceipt;
  const authorizer = input.provenance.participants?.find((item) => item.role === 'authorizer');

  if (!input.permissionValidatedAtExecution) invalidityReasons.push('current_permission_not_validated');
  for (const role of profile.constitutionPolicy.requiredParticipantRoles) {
    if (!input.provenance.participants?.some((item) => item.role === role)) {
      invalidityReasons.push(`participant_role_missing:${role}`);
    }
  }
  if (authorizer?.subjectRef !== `user:${input.provenance.situationContext.actorUserId}`) {
    conflicts.push('authorizer_actor_conflict');
  } else {
    evidenceCodes.push('confirmation_actor_bound');
  }
  const effect = input.effectObservations.find(
    (item) => item.effectKey === profile.constitutionPolicy.requiredEffectKey,
  );
  if (!effect || effect.status !== 'observed') invalidityReasons.push('formal_state_transition_not_observed');
  else evidenceCodes.push(`effect_observed:${effect.effectKey}`);
  if (input.actionInvariantEvaluation?.status !== 'satisfied') {
    invalidityReasons.push('transaction_invariant_not_satisfied');
  } else {
    evidenceCodes.push('transaction_invariant_satisfied');
  }
  if (!mutation) {
    invalidityReasons.push('transactional_mutation_receipt_missing');
  } else {
    if (mutation.capabilityKey !== input.provenance.gatewayActionKey) conflicts.push('mutation_capability_conflict');
    if (mutation.businessObjectType !== profile.constitutionPolicy.requiredBusinessObjectType) {
      conflicts.push('mutation_business_object_type_conflict');
    }
    if (String(mutation.businessObjectId) !== String(input.receipt.businessObjectId)) {
      conflicts.push('mutation_business_object_identity_conflict');
    }
    if (mutation.storeId !== input.provenance.situationContext.storeId) conflicts.push('mutation_store_conflict');
    if (mutation.mutationKind !== profile.constitutionPolicy.requiredMutationKind) {
      conflicts.push('mutation_kind_conflict');
    }
    if (profile.constitutionPolicy.requiredChangedFields.some((field) => !mutation.changedFields.includes(field))) {
      invalidityReasons.push('required_state_change_missing');
    }
    if (!conflicts.length) {
      evidenceCodes.push('transactional_mutation_receipt_observed');
      evidenceCodes.push(`effective_at:${mutation.committedAt}`);
    }
  }
  if (input.permissionValidatedAtExecution) evidenceCodes.push(`permission_validated:${profile.requiredPermission}`);

  const status: BrainActionInstitutionalEffectStatus = conflicts.length
    ? 'conflicted'
    : invalidityReasons.length
      ? mutation && effect
        ? 'ineffective'
        : 'unknown'
      : 'effective';
  const evaluatedAt = (input.evaluatedAt ?? new Date()).toISOString();
  const body = {
    schemaVersion: '1.0' as const,
    profileFingerprint: profile.fingerprint,
    actionKey: input.action.actionKey,
    status,
    businessObjectType: input.receipt.businessObjectType,
    businessObjectId: String(input.receipt.businessObjectId),
    storeId: input.provenance.situationContext.storeId,
    ...(authorizer ? { authorizerSubjectRef: authorizer.subjectRef } : {}),
    requiredPermission: profile.requiredPermission,
    ...(status === 'effective' && mutation ? { effectiveAt: mutation.committedAt } : {}),
    evidenceCodes: [...new Set(evidenceCodes)].sort(),
    invalidityReasons: [...new Set([...conflicts, ...invalidityReasons])].sort(),
    evaluatedAt,
  };
  return { ...body, fingerprint: createBusinessDefinitionProjectionFingerprint(body) };
}
