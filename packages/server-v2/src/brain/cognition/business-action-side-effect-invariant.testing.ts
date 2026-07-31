import type { BusinessActionSemanticContractRef } from './business-definition-snapshot.types.js';
import { createBusinessActionSideEffectInvariantProfile } from './business-action-side-effect-invariant.js';
import { curatedActionInvariantRef } from '../../semantic-data/brain-action-invariant-catalog.js';

export function createTestBusinessActionSideEffectInvariantProfile(
  actionKey = 'action.test',
  input: {
    preconditions?: readonly string[];
    preconditionPredicateRefs?: readonly BusinessActionSemanticContractRef[];
    effects?: readonly string[];
    effectAssertionRefs?: readonly BusinessActionSemanticContractRef[];
    invariantContractRef?: BusinessActionSemanticContractRef;
  } = {},
) {
  const preconditions = input.preconditions ?? [];
  const effects = input.effects ?? [];
  return createBusinessActionSideEffectInvariantProfile({
    actionKey,
    preconditions,
    preconditionPredicateRefs:
      input.preconditionPredicateRefs ?? preconditions.map((key) => ({ key, version: 1, fingerprint: 'a'.repeat(64) })),
    effects,
    effectAssertionRefs:
      input.effectAssertionRefs ?? effects.map((key) => ({ key, version: 1, fingerprint: 'b'.repeat(64) })),
    invariantContractRef: input.invariantContractRef ?? testInvariantRef(actionKey),
  });
}

function testInvariantRef(actionKey: string): BusinessActionSemanticContractRef {
  try {
    return curatedActionInvariantRef(actionKey);
  } catch {
    return { key: `${actionKey}.mutation_footprint`, version: 1, fingerprint: 'c'.repeat(64) };
  }
}
