import type { BusinessActionClass } from './business-definition-snapshot.types.js';

export interface BusinessActionLexicalSemanticContext {
  readonly actionKey: string;
  readonly actionClass: BusinessActionClass;
  readonly targetEntityRefs: readonly string[];
  readonly preconditions: readonly string[];
  readonly effects: readonly string[];
}

export function governedBusinessActionSemanticPredicates(
  context: BusinessActionLexicalSemanticContext,
): readonly string[] {
  return [
    `occurrence_of:${context.actionKey}`,
    ...context.preconditions.map((key) => `precondition_ref:${key}`),
    ...context.effects.map((key) => `effect_ref:${key}`),
  ];
}

export function validateBusinessActionSemanticPredicates(
  predicates: readonly string[],
  context: BusinessActionLexicalSemanticContext,
): readonly string[] {
  const reasons: string[] = [];
  const uniquePredicates = new Set(predicates);
  if (uniquePredicates.size !== predicates.length) reasons.push('action_lexical_semantic_predicates_duplicate');

  for (const predicate of predicates) {
    if (!/^[a-z][a-z0-9_]*:[a-z][a-z0-9_.:]*$/u.test(predicate)) {
      reasons.push(`action_lexical_semantic_predicate_invalid:${predicate || 'missing'}`);
    }
  }

  for (const required of governedBusinessActionSemanticPredicates(context)) {
    if (!uniquePredicates.has(required)) reasons.push(`action_lexical_semantic_anchor_missing:${required}`);
  }

  const targetMutations = predicates.filter(
    (predicate) =>
      predicate.startsWith('creates:') ||
      predicate.startsWith('updates:') ||
      predicate.startsWith('invalidates:') ||
      predicate.startsWith('state_transition:'),
  );
  for (const predicate of predicates) {
    if (!predicate.startsWith('creates:') && !predicate.startsWith('updates:')) continue;
    const value = predicate.slice(predicate.indexOf(':') + 1);
    if (!context.targetEntityRefs.some((entityRef) => value === entityRef || value.startsWith(`${entityRef}.`))) {
      reasons.push(`action_lexical_semantic_target_invalid:${predicate}`);
    }
  }

  if (
    (context.actionClass === 'create' || context.actionClass === 'reserve') &&
    !predicates.some(
      (predicate) =>
        predicate.startsWith('creates:') &&
        context.targetEntityRefs.some((entityRef) => {
          const value = predicate.slice(predicate.indexOf(':') + 1);
          return value === entityRef || value.startsWith(`${entityRef}.`);
        }),
    )
  ) {
    reasons.push(`action_lexical_semantic_creation_target_missing:${context.actionKey}`);
  }
  if (
    ['update', 'transition', 'delete', 'approve', 'consume'].includes(context.actionClass) &&
    targetMutations.length === 0
  ) {
    reasons.push(`action_lexical_semantic_mutation_missing:${context.actionKey}`);
  }

  return [...new Set(reasons)];
}
