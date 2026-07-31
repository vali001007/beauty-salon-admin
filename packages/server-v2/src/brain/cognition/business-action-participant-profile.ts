import { createBusinessDefinitionProjectionFingerprint } from '../../semantic-data/business-definition-projection-compiler.service.js';
import type {
  BusinessActionInputSlotDefinition,
  BusinessActionParticipantProfile,
  BusinessActionParticipantRole,
  BusinessActionParticipantRoleBinding,
} from './business-definition-snapshot.types.js';
import type { BrainSemanticActionSlot } from './brain-semantic-intent.types.js';
import type { BrainActionExecutionParticipant } from './brain-action-execution-provenance.types.js';

const SLOT_PARTICIPANT_ROLES = new Set<BusinessActionParticipantRole>([
  'approver',
  'assignee',
  'service_provider',
  'beneficiary',
  'counterparty',
]);

export function createBusinessActionParticipantProfile(input: {
  readonly actionKey: string;
  readonly inputSlots: readonly Pick<BusinessActionInputSlotDefinition, 'slotKey' | 'semanticRole' | 'requiredAt'>[];
}): BusinessActionParticipantProfile {
  const roleBindings: BusinessActionParticipantRoleBinding[] = [
    {
      role: 'requester',
      source: 'authenticated_user',
      requiredAt: ['execution', 'preview', 'recognition'],
      qualificationPolicy: 'same_authenticated_user',
      runtimeVisibility: 'execution_only',
    },
    {
      role: 'authorizer',
      source: 'confirmation_actor',
      requiredAt: ['execution'],
      qualificationPolicy: 'revalidate_current_role_and_permission',
      runtimeVisibility: 'execution_only',
    },
    {
      role: 'performer',
      source: 'gateway_executor',
      requiredAt: ['execution'],
      qualificationPolicy: 'released_gateway_binding',
      runtimeVisibility: 'execution_only',
    },
    {
      role: 'accountable_party',
      source: 'confirmation_actor',
      requiredAt: ['execution'],
      qualificationPolicy: 'revalidate_current_role_and_permission',
      runtimeVisibility: 'validator_only',
    },
  ];
  for (const slot of input.inputSlots) {
    const role = slot.semanticRole as BusinessActionParticipantRole;
    if (!SLOT_PARTICIPANT_ROLES.has(role)) continue;
    roleBindings.push({
      role,
      source: 'action_slot',
      slotKey: slot.slotKey,
      requiredAt: [...slot.requiredAt].sort(),
      qualificationPolicy: 'resolved_same_store_business_subject',
      runtimeVisibility: 'model_visible',
    });
  }
  const profile = {
    schemaVersion: '1.0' as const,
    profileKey: `${input.actionKey}.participant`,
    actorAliasPolicy: 'legacy_requester_only' as const,
    unboundRolePolicy: 'fail_closed' as const,
    roleBindings: roleBindings.sort(
      (left, right) => left.role.localeCompare(right.role) || (left.slotKey ?? '').localeCompare(right.slotKey ?? ''),
    ),
  };
  return { ...profile, fingerprint: createBusinessDefinitionProjectionFingerprint(profile) };
}

export function createBrainActionExecutionParticipants(input: {
  readonly profile: BusinessActionParticipantProfile;
  readonly userId: number;
  readonly storeId: number;
  readonly businessDate: string;
  readonly gatewayActionKey: string;
  readonly actionSlots: readonly BrainSemanticActionSlot[];
}): readonly BrainActionExecutionParticipant[] {
  const slots = new Map(input.actionSlots.map((slot) => [slot.slotKey, slot]));
  const participants: BrainActionExecutionParticipant[] = [];
  for (const binding of input.profile.roleBindings) {
    let subjectRef: string | undefined;
    let valueFingerprint: string | undefined;
    if (binding.source === 'authenticated_user' || binding.source === 'confirmation_actor') {
      subjectRef = `user:${input.userId}`;
    } else if (binding.source === 'gateway_executor') {
      subjectRef = `gateway:${input.gatewayActionKey}`;
    } else if (binding.source === 'action_slot' && binding.slotKey) {
      const slot = slots.get(binding.slotKey);
      if (!slot) continue;
      const slotValue = {
        slotKey: slot.slotKey,
        source: slot.source,
        ...(slot.rawValue !== undefined ? { rawValue: slot.rawValue } : {}),
        ...(slot.numericValue !== undefined ? { numericValue: slot.numericValue } : {}),
        ...(slot.unit !== undefined ? { unit: slot.unit } : {}),
        ...(slot.enumValue !== undefined ? { enumValue: slot.enumValue } : {}),
        ...(slot.booleanValue !== undefined ? { booleanValue: slot.booleanValue } : {}),
        ...(slot.timeValue !== undefined ? { timeValue: slot.timeValue } : {}),
        ...(slot.entityKey !== undefined ? { entityKey: slot.entityKey } : {}),
        ...(slot.entityDefinitionRef !== undefined ? { entityDefinitionRef: slot.entityDefinitionRef } : {}),
        ...(slot.resultReferenceId !== undefined ? { resultReferenceId: slot.resultReferenceId } : {}),
      };
      valueFingerprint = createBusinessDefinitionProjectionFingerprint(slotValue);
      subjectRef = `slot:${binding.slotKey}:${valueFingerprint}`;
    }
    if (!subjectRef) continue;
    const participant = {
      role: binding.role,
      source: binding.source,
      subjectRef,
      ...(binding.slotKey ? { slotKey: binding.slotKey } : {}),
      storeId: input.storeId,
      businessDate: input.businessDate,
      ...(valueFingerprint ? { valueFingerprint } : {}),
    };
    participants.push({
      ...participant,
      fingerprint: createBusinessDefinitionProjectionFingerprint(participant),
    });
  }
  return participants.sort(
    (left, right) => left.role.localeCompare(right.role) || left.subjectRef.localeCompare(right.subjectRef),
  );
}
