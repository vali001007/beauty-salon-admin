import { createBusinessDefinitionProjectionFingerprint } from '../../semantic-data/business-definition-projection-compiler.service.js';
import type {
  BusinessActionSemanticContractRef,
  BusinessActionSideEffectInvariantProfile,
} from './business-definition-snapshot.types.js';

export function createBusinessActionSideEffectInvariantProfile(input: {
  actionKey: string;
  preconditions: readonly string[];
  preconditionPredicateRefs: readonly BusinessActionSemanticContractRef[];
  effects: readonly string[];
  effectAssertionRefs: readonly BusinessActionSemanticContractRef[];
  invariantContractRef: BusinessActionSemanticContractRef;
}): BusinessActionSideEffectInvariantProfile {
  const preconditions = [...new Set(input.preconditions)].sort();
  const predicateRefs = [...input.preconditionPredicateRefs]
    .map((ref) => ({ ...ref }))
    .sort((left, right) => left.key.localeCompare(right.key));
  const effects = [...new Set(input.effects)].sort();
  const effectRefs = [...input.effectAssertionRefs]
    .map((ref) => ({ ...ref }))
    .sort((left, right) => left.key.localeCompare(right.key));
  const profile = {
    schemaVersion: '1.2' as const,
    profileKey: `${input.actionKey}.side_effect_invariant`,
    guardContractFingerprint: createBusinessDefinitionProjectionFingerprint({
      actionKey: input.actionKey,
      preconditions,
      predicateRefs,
    }),
    effectContractFingerprint: createBusinessDefinitionProjectionFingerprint({
      actionKey: input.actionKey,
      effects,
      effectRefs,
    }),
    invariantContractRef: { ...input.invariantContractRef },
    undeclaredSideEffectPolicy: 'forbid' as const,
    gatewayEffectPolicy: 'exact_declared_effect_match' as const,
    mutationFootprintEvidencePolicy: 'exact_database_trigger_observed_write_set' as const,
    successEvidencePolicy: 'all_declared_effects_observed' as const,
    partialSuccessPolicy: 'explicit_partially_succeeded' as const,
    recoveryPolicy: 'gateway_declared_strategy_only' as const,
    compensationPolicy: 'explicit_compensation_action_required' as const,
    outcomeObservationPolicy: 'required_for_async_effects' as const,
  };
  return { ...profile, fingerprint: createBusinessDefinitionProjectionFingerprint(profile) };
}
