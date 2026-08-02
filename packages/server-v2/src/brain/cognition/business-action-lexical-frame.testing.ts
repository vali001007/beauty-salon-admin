import { createBusinessActionLexicalFrame } from './business-action-lexical-frame.js';
import type {
  BusinessActionClass,
  BusinessActionInputSlotDefinition,
  BusinessActionLexicalFrame,
} from './business-definition-snapshot.types.js';

export function createTestBusinessActionLexicalFrame(input: {
  readonly actionKey: string;
  readonly actionClass?: BusinessActionClass;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly targetEntityRefs?: readonly string[];
  readonly inputSlots: readonly Pick<BusinessActionInputSlotDefinition, 'slotKey' | 'semanticRole'>[];
  readonly preconditions?: readonly string[];
  readonly effects?: readonly string[];
}): BusinessActionLexicalFrame {
  const actionClass = input.actionClass ?? 'execute';
  const targetEntityRefs = input.targetEntityRefs ?? [];
  return createBusinessActionLexicalFrame({
    ...input,
    actionClass,
    aliases: input.aliases ?? [],
    targetEntityRefs,
    preconditions: input.preconditions ?? [],
    effects: input.effects ?? [],
    semanticPredicates:
      (actionClass === 'create' || actionClass === 'reserve') && targetEntityRefs[0]
        ? [`creates:${targetEntityRefs[0]}`]
        : actionClass === 'update' || actionClass === 'transition'
          ? [`state_transition:${input.actionKey.replace(/^action\./u, '')}_test_transition`]
          : [],
    contrasts: [
      {
        conceptKey: 'action.semantic_contrast_fixture',
        name: '测试竞争动作',
        discriminators: [
          {
            dimension: 'effect',
            currentActionValue: '执行当前动作的受治理效果',
            contrastActionValue: '执行不同动作的受治理效果',
          },
        ],
      },
    ],
  });
}
