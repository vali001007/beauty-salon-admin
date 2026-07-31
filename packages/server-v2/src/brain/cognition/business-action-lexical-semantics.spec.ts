import {
  governedBusinessActionSemanticPredicates,
  validateBusinessActionSemanticPredicates,
} from './business-action-lexical-semantics.js';

describe('business action lexical semantics', () => {
  const context = {
    actionKey: 'action.create_purchase_order',
    actionClass: 'create' as const,
    targetEntityRefs: ['entity.product', 'entity.purchase_order'],
    preconditions: ['context_store_resolved', 'quantity_positive'],
    effects: ['purchase_order_created'],
  };

  it('derives stable governed anchors from the action contract', () => {
    expect(governedBusinessActionSemanticPredicates(context)).toEqual([
      'occurrence_of:action.create_purchase_order',
      'precondition_ref:context_store_resolved',
      'precondition_ref:quantity_positive',
      'effect_ref:purchase_order_created',
    ]);
  });

  it('accepts a creation predicate only when it targets a governed action entity', () => {
    expect(
      validateBusinessActionSemanticPredicates(
        [...governedBusinessActionSemanticPredicates(context), 'creates:entity.purchase_order'],
        context,
      ),
    ).toEqual([]);

    expect(
      validateBusinessActionSemanticPredicates(
        [...governedBusinessActionSemanticPredicates(context), 'creates:entity.reservation'],
        context,
      ),
    ).toEqual(
      expect.arrayContaining([
        'action_lexical_semantic_target_invalid:creates:entity.reservation',
        'action_lexical_semantic_creation_target_missing:action.create_purchase_order',
      ]),
    );
  });

  it('rejects a frame that omits its governed action, precondition, or effect anchors', () => {
    expect(validateBusinessActionSemanticPredicates(['creates:entity.purchase_order'], context)).toEqual(
      expect.arrayContaining([
        'action_lexical_semantic_anchor_missing:occurrence_of:action.create_purchase_order',
        'action_lexical_semantic_anchor_missing:precondition_ref:context_store_resolved',
        'action_lexical_semantic_anchor_missing:effect_ref:purchase_order_created',
      ]),
    );
  });
});
