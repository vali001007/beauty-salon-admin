import { createBusinessDefinitionProjectionFingerprint } from '../../semantic-data/business-definition-projection-compiler.service.js';
import type {
  BusinessActionClass,
  BusinessActionInputSlotDefinition,
  BusinessActionLexicalContrast,
  BusinessActionLexicalFrame,
} from './business-definition-snapshot.types.js';
import {
  governedBusinessActionSemanticPredicates,
  validateBusinessActionSemanticPredicates,
} from './business-action-lexical-semantics.js';

export interface BusinessActionLexicalFrameInput {
  readonly actionKey: string;
  readonly actionClass: BusinessActionClass;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly targetEntityRefs: readonly string[];
  readonly inputSlots: readonly Pick<BusinessActionInputSlotDefinition, 'slotKey' | 'semanticRole'>[];
  readonly preconditions: readonly string[];
  readonly effects: readonly string[];
  readonly semanticPredicates: readonly string[];
  readonly contrasts: readonly BusinessActionLexicalContrast[];
}

export function createBusinessActionLexicalFrame(input: BusinessActionLexicalFrameInput): BusinessActionLexicalFrame {
  const thematicRoles = new Map<string, string[]>();
  for (const item of input.inputSlots) {
    const slotKeys = thematicRoles.get(item.semanticRole) ?? [];
    slotKeys.push(item.slotKey);
    thematicRoles.set(item.semanticRole, slotKeys);
  }
  const semanticContext = {
    actionKey: input.actionKey,
    actionClass: input.actionClass,
    targetEntityRefs: input.targetEntityRefs,
    preconditions: input.preconditions,
    effects: input.effects,
  };
  const semanticPredicates = [
    ...new Set([...input.semanticPredicates, ...governedBusinessActionSemanticPredicates(semanticContext)]),
  ].sort();
  const semanticErrors = validateBusinessActionSemanticPredicates(semanticPredicates, semanticContext);
  if (semanticErrors.length) throw new Error(semanticErrors.join(','));

  const frame = {
    schemaVersion: '1.0' as const,
    frameKey: `${input.actionKey}.lexical_frame`,
    lexicalUnits: [...new Set([input.name, ...input.aliases])].sort(),
    thematicRoles: [...thematicRoles.entries()]
      .map(([semanticRole, slotKeys]) => ({
        semanticRole: semanticRole as BusinessActionInputSlotDefinition['semanticRole'],
        slotKeys: [...new Set(slotKeys)].sort(),
      }))
      .sort((left, right) => left.semanticRole.localeCompare(right.semanticRole)),
    semanticPredicates,
    contrasts: input.contrasts
      .map((item) => ({
        conceptKey: item.conceptKey,
        name: item.name,
        discriminators: item.discriminators
          .map((value) => ({ ...value }))
          .sort(
            (left, right) =>
              left.dimension.localeCompare(right.dimension) ||
              left.currentActionValue.localeCompare(right.currentActionValue) ||
              left.contrastActionValue.localeCompare(right.contrastActionValue),
          ),
      }))
      .sort((left, right) => left.conceptKey.localeCompare(right.conceptKey)),
  };
  return { ...frame, fingerprint: createBusinessDefinitionProjectionFingerprint(frame) };
}
