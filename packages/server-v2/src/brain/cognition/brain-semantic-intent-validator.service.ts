import { Injectable } from '@nestjs/common';
import { BrainOntologyRuntimeService } from './brain-ontology-runtime.service.js';
import type {
  BrainDefinitionRef,
  BrainSemanticActionSlot,
  BrainSemanticAmbiguity,
  BrainSemanticIntent,
} from './brain-semantic-intent.types.js';
import type {
  BusinessActionDefinitionSnapshot,
  BusinessActionInputSlotDefinition,
  BusinessDefinitionBase,
  ProductionReadyBusinessDefinitionSnapshot,
} from './business-definition-snapshot.types.js';

export type BrainSemanticIntentValidationIssueCode =
  | 'SNAPSHOT_UNAVAILABLE'
  | 'UNTRUSTED_SECURITY_SCOPE'
  | 'UNKNOWN_DOMAIN'
  | 'UNKNOWN_ENTITY_REFERENCE'
  | 'UNKNOWN_METRIC_REFERENCE'
  | 'UNKNOWN_DIMENSION_REFERENCE'
  | 'UNKNOWN_ACTION_REFERENCE'
  | 'ACTION_REFERENCE_REQUIRED'
  | 'ACTION_REFERENCE_NOT_ALLOWED'
  | 'ACTION_POLARITY_REQUIRED'
  | 'ACTION_POLARITY_INVALID'
  | 'UNKNOWN_NEGATED_ACTION_REFERENCE'
  | 'DUPLICATE_NEGATED_ACTION_REFERENCE'
  | 'ACTION_CORRECTION_CONFLICT'
  | 'ACTION_MODALITY_NOT_SUPPORTED'
  | 'UNKNOWN_ACTION_SLOT'
  | 'DUPLICATE_ACTION_SLOT'
  | 'ACTION_SLOT_TYPE_INVALID'
  | 'ACTION_TARGET_TYPE_MISMATCH'
  | 'UNKNOWN_ORDER_REFERENCE'
  | 'UNKNOWN_FIELD_REFERENCE'
  | 'INVALID_COMPARISON_TARGET'
  | 'MISSING_REQUIRED_SLOT'
  | 'SEMANTIC_AMBIGUITY'
  | 'ENTITY_CONFLICT';

export interface BrainSemanticIntentValidationIssue {
  code: BrainSemanticIntentValidationIssueCode;
  message: string;
  slot?: string;
  candidates?: string[];
}

export interface BrainSemanticIntentGovernedScope {
  domains: readonly string[];
  definitionRefs: readonly {
    definitionKey: string;
    version: number;
    definitionFingerprint: string;
    sourceFingerprint: string;
  }[];
  rankingContracts?: readonly { capabilityKey: string; domains: readonly string[] }[];
}

export type BrainSemanticIntentValidationResult =
  | {
      status: 'valid';
      intent: BrainSemanticIntent;
      snapshotFingerprint: string;
    }
  | {
      status: 'clarification_required';
      intent: BrainSemanticIntent;
      snapshotFingerprint: string;
      issues: BrainSemanticIntentValidationIssue[];
      clarification: {
        questions: [string];
        missingSlots: string[];
        ambiguities: BrainSemanticAmbiguity[];
      };
    }
  | {
      status: 'invalid';
      intent: BrainSemanticIntent;
      snapshotFingerprint?: string;
      issues: BrainSemanticIntentValidationIssue[];
    };

@Injectable()
export class BrainSemanticIntentValidatorService {
  constructor(private readonly ontologyRuntime: BrainOntologyRuntimeService) {}

  validate(
    intent: BrainSemanticIntent,
    governedScope?: BrainSemanticIntentGovernedScope,
    snapshotOverride?: ProductionReadyBusinessDefinitionSnapshot,
  ): BrainSemanticIntentValidationResult {
    const snapshot = snapshotOverride ?? this.ontologyRuntime.getSnapshot();
    if (!snapshot) {
      return this.invalid(intent, [
        {
          code: 'SNAPSHOT_UNAVAILABLE',
          message: 'A production-ready business definition snapshot is not loaded.',
        },
      ]);
    }

    const hardIssues = dedupeIssues([
      ...this.validateSecurityBoundary(intent),
      ...this.validateComparisonTargetStructure(intent),
      ...this.validateDefinitions(intent, snapshot, governedScope),
    ]);
    if (hardIssues.length > 0) {
      return this.invalid(intent, hardIssues, snapshot.fingerprint);
    }

    const missingSlots = new Set(intent.missingSlots.map((slot) => slot.trim()).filter(Boolean));
    if (isGroupedDimensionComparison(intent)) {
      missingSlots.delete('comparisonTarget');
      missingSlots.delete('comparisonEntities');
    }
    const actionableAmbiguities = intent.ambiguities.filter(
      (ambiguity) =>
        missingSlots.has(ambiguity.slot) ||
        ambiguity.candidates.length === 0 ||
        ambiguity.candidates.some(isUserFacingCandidate),
    );
    const clarificationIssues: BrainSemanticIntentValidationIssue[] = actionableAmbiguities.map((ambiguity) => ({
      code: 'SEMANTIC_AMBIGUITY',
      slot: ambiguity.slot,
      message: ambiguity.reason,
      candidates: [...ambiguity.candidates],
    }));

    this.collectIntentShapeGaps(
      intent,
      missingSlots,
      hasGovernedImplicitRankingContract(intent, governedScope),
      governedScope,
      snapshot,
    );
    clarificationIssues.push(...this.findEntityConflicts(intent));
    const stableClarificationIssues = dedupeIssues(clarificationIssues);
    const ambiguitySlots = new Set(actionableAmbiguities.map((ambiguity) => ambiguity.slot));
    const requiredMissingSlots = [...missingSlots].filter((slot) => !ambiguitySlots.has(slot)).sort();
    const canonicalMissingSlots = new Set(missingSlots);
    for (const ambiguity of actionableAmbiguities) canonicalMissingSlots.add(ambiguity.slot);
    const orderedMissingSlots = [...canonicalMissingSlots].sort();
    if (orderedMissingSlots.length > 0 || clarificationIssues.length > 0) {
      const clarifiedIntent: BrainSemanticIntent = {
        ...intent,
        missingSlots: orderedMissingSlots,
        ambiguities: actionableAmbiguities.map((ambiguity) => ({
          ...ambiguity,
          candidates: [...ambiguity.candidates],
        })),
      };
      return {
        status: 'clarification_required',
        intent: clarifiedIntent,
        snapshotFingerprint: snapshot.fingerprint,
        issues: [
          ...requiredMissingSlots.map((slot) => ({
            code: 'MISSING_REQUIRED_SLOT' as const,
            slot,
            message: `Required semantic slot ${slot} is missing.`,
          })),
          ...stableClarificationIssues,
        ],
        clarification: {
          questions: [
            buildMergedClarificationQuestion(orderedMissingSlots, actionableAmbiguities, stableClarificationIssues),
          ],
          missingSlots: orderedMissingSlots,
          ambiguities: actionableAmbiguities.map((ambiguity) => ({
            ...ambiguity,
            candidates: [...ambiguity.candidates],
          })),
        },
      };
    }

    return { status: 'valid', intent, snapshotFingerprint: snapshot.fingerprint };
  }

  private validateSecurityBoundary(intent: BrainSemanticIntent): BrainSemanticIntentValidationIssue[] {
    const forbidden = findForbiddenSecurityKeys(intent);
    if (forbidden.length === 0) return [];
    return [
      {
        code: 'UNTRUSTED_SECURITY_SCOPE',
        message: `Semantic intent must not contain security scope conclusions: ${forbidden.join(', ')}.`,
      },
    ];
  }

  private validateDefinitions(
    intent: BrainSemanticIntent,
    snapshot: ProductionReadyBusinessDefinitionSnapshot,
    governedScope?: BrainSemanticIntentGovernedScope,
  ): BrainSemanticIntentValidationIssue[] {
    const issues: BrainSemanticIntentValidationIssue[] = [];
    const domains = new Set([
      ...snapshot.entities.map((definition) => definition.domain),
      ...snapshot.metrics.map((definition) => definition.domain),
      ...snapshot.dimensions.map((definition) => definition.domain),
      ...snapshot.actions.map((definition) => definition.domain),
      ...(governedScope?.domains ?? []),
    ]);
    for (const domain of intent.domains) {
      if (!domains.has(domain)) {
        issues.push({ code: 'UNKNOWN_DOMAIN', slot: 'domain', message: `Domain ${domain} is not active.` });
      }
    }

    for (const entity of intent.entities) {
      if (!entity.definitionRef) continue;
      if (
        !hasCanonicalRef(snapshot.entities, entity.definitionRef, 'entity') &&
        !hasGovernedRef(governedScope, entity.definitionRef)
      ) {
        issues.push({
          code: 'UNKNOWN_ENTITY_REFERENCE',
          slot: 'entity',
          message: `Entity reference for ${entity.mention} is not active.`,
        });
      }
    }
    for (const metric of intent.metrics) {
      if (!hasCanonicalRef(snapshot.metrics, metric, 'metric') && !hasGovernedRef(governedScope, metric)) {
        issues.push({
          code: 'UNKNOWN_METRIC_REFERENCE',
          slot: 'metric',
          message: `Metric reference ${metric.definitionKey} is not active.`,
        });
      }
    }
    for (const dimension of intent.dimensions) {
      if (!hasCanonicalRef(snapshot.dimensions, dimension, 'dimension') && !hasGovernedRef(governedScope, dimension)) {
        issues.push({
          code: 'UNKNOWN_DIMENSION_REFERENCE',
          slot: 'dimension',
          message: `Dimension reference ${dimension.definitionKey} is not active.`,
        });
      }
    }
    issues.push(...validateActionContract(intent, snapshot));
    for (const filter of intent.filters) {
      if (filter.fieldRef.definitionType === 'dimension') {
        if (
          !hasCanonicalRef(snapshot.dimensions, filter.fieldRef, 'dimension') &&
          !hasGovernedRef(governedScope, filter.fieldRef)
        ) {
          issues.push({
            code: 'UNKNOWN_DIMENSION_REFERENCE',
            slot: 'filter',
            message: `Dimension filter ${filter.fieldRef.definitionKey} is not active.`,
          });
        }
        continue;
      }
      issues.push({
        code: 'UNKNOWN_FIELD_REFERENCE',
        slot: 'filter',
        message: `Field reference ${filter.fieldRef.definitionKey} cannot be verified by the active snapshot.`,
      });
    }
    for (const order of intent.orderBy) {
      if (order.definitionRef.definitionType === 'field') {
        issues.push({
          code: 'UNKNOWN_FIELD_REFERENCE',
          slot: 'orderBy',
          message: `Field reference ${order.definitionRef.definitionKey} cannot be verified by the active snapshot.`,
        });
        continue;
      }
      const definitions = order.definitionRef.definitionType === 'metric' ? snapshot.metrics : snapshot.dimensions;
      if (
        !hasCanonicalRef(definitions, order.definitionRef, order.definitionRef.definitionType) &&
        !hasGovernedRef(governedScope, order.definitionRef)
      ) {
        issues.push({
          code: 'UNKNOWN_ORDER_REFERENCE',
          slot: 'orderBy',
          message: `Order reference ${order.definitionRef.definitionKey} is not active.`,
        });
      }
    }
    return issues;
  }

  private validateComparisonTargetStructure(intent: BrainSemanticIntent): BrainSemanticIntentValidationIssue[] {
    if (intent.intent !== 'comparison' || !intent.comparisonTarget) return [];
    const target = intent.comparisonTarget as unknown as Record<string, unknown>;
    if (target.type === 'time') {
      const timeRange = target.timeRange;
      if (
        !isExecutableTimeRange(timeRange) ||
        (intent.timeRange !== undefined && !isExecutableTimeRange(intent.timeRange))
      ) {
        return [
          {
            code: 'INVALID_COMPARISON_TARGET',
            slot: 'comparisonTarget',
            message: 'Time comparison target must contain a governed timeRange.',
          },
        ];
      }
      return [];
    }
    if (target.type === 'entity') {
      const entityKeys = target.entityKeys;
      if (
        !Array.isArray(entityKeys) ||
        entityKeys.length < 2 ||
        entityKeys.some((key) => typeof key !== 'string' || !key.trim()) ||
        new Set(entityKeys).size !== entityKeys.length
      ) {
        return [
          {
            code: 'INVALID_COMPARISON_TARGET',
            slot: 'comparisonTarget',
            message: 'Entity comparison target must contain at least two unique resolved entity keys.',
          },
        ];
      }
      return [];
    }
    return [
      {
        code: 'INVALID_COMPARISON_TARGET',
        slot: 'comparisonTarget',
        message: 'Comparison target type is invalid.',
      },
    ];
  }

  private collectIntentShapeGaps(
    intent: BrainSemanticIntent,
    missingSlots: Set<string>,
    hasImplicitRankingContract = false,
    governedScope?: BrainSemanticIntentGovernedScope,
    snapshot?: ProductionReadyBusinessDefinitionSnapshot,
  ): void {
    if (hasExplicitTimeReference(intent.objective) && !intent.timeRange && intent.comparisonTarget?.type !== 'time') {
      missingSlots.add('timeRange');
    }

    if (
      intent.entities.some(
        (entity) => !entity.definitionRef && !(intent.intent === 'action' && isSpecificActionTarget(entity)),
      )
    ) {
      missingSlots.add('entity');
    }

    if (
      ['scalar', 'trend'].includes(intent.answerShape) &&
      intent.metrics.length === 0 &&
      !hasInternalCapabilityCoverage(intent) &&
      !governedScope?.definitionRefs.some((ref) => ref.definitionKey.startsWith('metric.'))
    ) {
      missingSlots.add('metric');
    }

    if (
      intent.answerShape === 'list' &&
      hasExplicitObjectCollectionRequest(intent.objective) &&
      intent.entities.every((entity) => !entity.definitionRef && !entity.entityKey) &&
      intent.dimensions.length === 0
    ) {
      missingSlots.add('entity');
    }

    if (intent.intent === 'ranking' && !hasImplicitRankingContract) {
      if (intent.metrics.length === 0) missingSlots.add('metric');
      if (intent.dimensions.length === 0) missingSlots.add('dimension');
      if (intent.orderBy.length === 0) missingSlots.add('orderBy');
    }

    if (intent.intent === 'comparison') {
      if (
        intent.metrics.length === 0 &&
        !governedScope?.definitionRefs.some((ref) => ref.definitionKey.startsWith('metric.'))
      )
        missingSlots.add('metric');
      if (!intent.comparisonTarget) {
        if (!isGroupedDimensionComparison(intent)) missingSlots.add('comparisonTarget');
      } else if (intent.comparisonTarget.type === 'time') {
        if (!intent.timeRange) missingSlots.add('timeRange');
      } else {
        const resolvedKeys = new Set(intent.entities.map((entity) => entity.entityKey).filter(Boolean));
        if (intent.comparisonTarget.entityKeys.some((key) => !resolvedKeys.has(key))) {
          missingSlots.add('comparisonEntities');
        }
      }
    }

    if (intent.intent === 'action') {
      const action = findCanonicalAction(intent, snapshot);
      if (!action) {
        missingSlots.add('actionDefinition');
      } else if (intent.actionPolarity !== 'negated') {
        const slots = new Map((intent.actionSlots ?? []).map((slot) => [slot.slotKey, slot]));
        for (const definition of action.inputSlots) {
          if (
            (definition.requiredAt.includes('recognition') || definition.requiredAt.includes('preview')) &&
            !hasValidActionSlotValue(slots.get(definition.slotKey), definition)
          ) {
            missingSlots.add(definition.slotKey);
          }
        }
      }
      if (intent.actionPolarity !== 'negated' && intent.successCriteria.length === 0) {
        missingSlots.add('successCriteria');
      }
    }
  }

  private findEntityConflicts(intent: BrainSemanticIntent): BrainSemanticIntentValidationIssue[] {
    const refsByMention = new Map<string, Set<string>>();
    for (const entity of intent.entities) {
      if (!entity.definitionRef) continue;
      const mention = normalizeMention(entity.mention);
      const refs = refsByMention.get(mention) ?? new Set<string>();
      refs.add(`${canonicalRefKey(entity.definitionRef)}:${entity.entityKey ?? '<unresolved>'}`);
      refsByMention.set(mention, refs);
    }
    return [...refsByMention.entries()]
      .filter(([, refs]) => refs.size > 1)
      .map(([mention]) => ({
        code: 'ENTITY_CONFLICT' as const,
        slot: 'entity',
        message: `“${mention}”匹配到多个业务对象，请补充更具体的信息。`,
      }));
  }

  private invalid(
    intent: BrainSemanticIntent,
    issues: BrainSemanticIntentValidationIssue[],
    snapshotFingerprint?: string,
  ): BrainSemanticIntentValidationResult {
    return { status: 'invalid', intent, ...(snapshotFingerprint ? { snapshotFingerprint } : {}), issues };
  }
}

function validateActionContract(
  intent: BrainSemanticIntent,
  snapshot: ProductionReadyBusinessDefinitionSnapshot,
): BrainSemanticIntentValidationIssue[] {
  const issues: BrainSemanticIntentValidationIssue[] = [];
  const supportsActionFrame = intent.intent === 'action' || intent.intent === 'workflow';
  const carriesActionFrame = Boolean(
    intent.actionRef ||
    intent.actionPolarity ||
    intent.negatedActionRefs !== undefined ||
    intent.actionModality ||
    intent.actionSlots !== undefined,
  );
  if (!supportsActionFrame && carriesActionFrame) {
    return [
      {
        code: 'ACTION_REFERENCE_NOT_ALLOWED',
        slot: 'actionRef',
        message: `Intent ${intent.intent} cannot carry an action semantic frame.`,
      },
    ];
  }
  if (!supportsActionFrame) return [];
  if (intent.intent === 'action' && intent.schemaVersion !== '1.1') {
    issues.push({
      code: 'ACTION_REFERENCE_REQUIRED',
      slot: 'actionRef',
      message: 'Action intent requires a schemaVersion 1.1 governed actionRef.',
    });
    return issues;
  }
  if (intent.intent === 'action' && !intent.actionRef) {
    if (intent.missingSlots.includes('actionDefinition')) return issues;
    issues.push({
      code: 'ACTION_REFERENCE_REQUIRED',
      slot: 'actionRef',
      message: 'Action intent requires a governed actionRef or an explicit actionDefinition gap.',
    });
    return issues;
  }
  if (!intent.actionRef) return issues;
  if (!intent.actionPolarity) {
    issues.push({
      code: 'ACTION_POLARITY_REQUIRED',
      slot: 'actionPolarity',
      message: 'A governed action polarity is required whenever actionRef exists.',
    });
  } else if (intent.actionPolarity !== 'affirmative' && intent.actionPolarity !== 'negated') {
    issues.push({
      code: 'ACTION_POLARITY_INVALID',
      slot: 'actionPolarity',
      message: `Action polarity ${String(intent.actionPolarity)} is invalid.`,
    });
  }
  if (intent.negatedActionRefs?.length) {
    if (intent.actionPolarity !== 'affirmative') {
      issues.push({
        code: 'ACTION_CORRECTION_CONFLICT',
        slot: 'negatedActionRefs',
        message: 'Correction references require one affirmative selected action.',
      });
    }
    const seenNegatedRefs = new Set<string>();
    for (const ref of intent.negatedActionRefs) {
      const refKey = canonicalRefKey(ref);
      if (seenNegatedRefs.has(refKey)) {
        issues.push({
          code: 'DUPLICATE_NEGATED_ACTION_REFERENCE',
          slot: 'negatedActionRefs',
          message: `Negated action reference ${ref.definitionKey} appears more than once.`,
        });
      }
      seenNegatedRefs.add(refKey);
      if (!hasCanonicalRef(snapshot.actions, ref, 'action')) {
        issues.push({
          code: 'UNKNOWN_NEGATED_ACTION_REFERENCE',
          slot: 'negatedActionRefs',
          message: `Negated action reference ${ref.definitionKey} is not active in the current snapshot.`,
        });
      }
      if (canonicalRefKey(intent.actionRef) === refKey) {
        issues.push({
          code: 'ACTION_CORRECTION_CONFLICT',
          slot: 'negatedActionRefs',
          message: `Selected action ${ref.definitionKey} cannot also be rejected by the same correction.`,
        });
      }
    }
  }
  const action = findCanonicalAction(intent, snapshot);
  if (!action) {
    issues.push({
      code: 'UNKNOWN_ACTION_REFERENCE',
      slot: 'actionRef',
      message: `Action reference ${intent.actionRef.definitionKey} is not active in the current snapshot.`,
    });
    return issues;
  }
  if (!intent.actionModality) {
    issues.push({
      code: 'ACTION_REFERENCE_REQUIRED',
      slot: 'actionModality',
      message: 'A governed action modality is required for action intent.',
    });
  } else if (!action.modalityPolicy.supportedModalities.includes(intent.actionModality)) {
    issues.push({
      code: 'ACTION_MODALITY_NOT_SUPPORTED',
      slot: 'actionModality',
      message: `Action ${action.actionKey} does not support modality ${intent.actionModality}.`,
      candidates: [...action.modalityPolicy.supportedModalities],
    });
  }
  const definitions = new Map(action.inputSlots.map((slot) => [slot.slotKey, slot]));
  const seen = new Set<string>();
  for (const slot of intent.actionSlots ?? []) {
    if (seen.has(slot.slotKey)) {
      issues.push({
        code: 'DUPLICATE_ACTION_SLOT',
        slot: slot.slotKey,
        message: `Action slot ${slot.slotKey} appears more than once.`,
      });
      continue;
    }
    seen.add(slot.slotKey);
    const definition = definitions.get(slot.slotKey);
    if (!definition) {
      issues.push({
        code: 'UNKNOWN_ACTION_SLOT',
        slot: slot.slotKey,
        message: `Action slot ${slot.slotKey} is not declared by ${action.actionKey}.`,
      });
      continue;
    }
    if (slot.semanticRole && slot.semanticRole !== definition.semanticRole) {
      issues.push({
        code: 'ACTION_SLOT_TYPE_INVALID',
        slot: slot.slotKey,
        message: `Action slot ${slot.slotKey} has an invalid semantic role.`,
      });
    }
    if (!hasValidActionSlotValue(slot, definition)) {
      issues.push({
        code: 'ACTION_SLOT_TYPE_INVALID',
        slot: slot.slotKey,
        message: `Action slot ${slot.slotKey} does not match value type ${definition.valueType}.`,
      });
    }
    if (definition.valueType === 'entity_ref' && (slot.entityDefinitionRef || slot.entityKey)) {
      const expectedDefinitionKey = definition.entityTypeRef;
      if (
        !expectedDefinitionKey ||
        !slot.entityDefinitionRef ||
        slot.entityDefinitionRef.definitionKey !== expectedDefinitionKey ||
        !hasCanonicalRef(snapshot.entities, slot.entityDefinitionRef, 'entity') ||
        !entityKeyMatchesDefinitionType(slot.entityKey, expectedDefinitionKey)
      ) {
        issues.push({
          code: 'ACTION_TARGET_TYPE_MISMATCH',
          slot: slot.slotKey,
          message: `Action slot ${slot.slotKey} does not reference the required entity type.`,
        });
      }
    }
  }
  return issues;
}

function findCanonicalAction(
  intent: BrainSemanticIntent,
  snapshot?: ProductionReadyBusinessDefinitionSnapshot,
): BusinessActionDefinitionSnapshot | undefined {
  const ref = intent.actionRef;
  if (!ref || !snapshot) return undefined;
  return snapshot.actions.find(
    (action) =>
      ref.definitionType === 'action' &&
      action.definitionKey === ref.definitionKey &&
      action.version === ref.definitionVersion &&
      action.definitionFingerprint === ref.definitionFingerprint &&
      action.sourceFingerprint === ref.sourceFingerprint,
  );
}

function hasValidActionSlotValue(
  slot: BrainSemanticActionSlot | undefined,
  definition: BusinessActionInputSlotDefinition,
): boolean {
  if (!slot) return false;
  const typedValues = [
    slot.numericValue !== undefined,
    slot.enumValue !== undefined,
    slot.booleanValue !== undefined,
    slot.timeValue !== undefined,
    slot.entityKey !== undefined,
    slot.entityDefinitionRef !== undefined,
  ].filter(Boolean).length;
  if (typedValues > 2) return false;
  if (definition.valueType === 'entity_ref') {
    return Boolean(slot.rawValue?.trim() || slot.entityKey?.trim());
  }
  if (definition.valueType === 'number' || definition.valueType === 'money') {
    return typeof slot.numericValue === 'number' && Number.isFinite(slot.numericValue);
  }
  if (definition.valueType === 'enum') {
    const value = slot.enumValue?.trim();
    if (!value) return false;
    const allowed = definition.validationPolicy?.startsWith('one_of:')
      ? definition.validationPolicy
          .slice('one_of:'.length)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    return allowed.length === 0 || allowed.includes(value);
  }
  if (definition.valueType === 'text') return Boolean(slot.rawValue?.trim());
  if (definition.valueType === 'time') return Boolean(slot.timeValue?.trim());
  if (definition.valueType === 'boolean') return typeof slot.booleanValue === 'boolean';
  return false;
}

function entityKeyMatchesDefinitionType(entityKey: string | undefined, definitionKey: string): boolean {
  const normalized = entityKey?.trim();
  if (!normalized) return true;
  const typed = normalized.match(/^([a-zA-Z][a-zA-Z0-9_-]*)[:#](.+)$/);
  if (!typed) return true;
  const expected = definitionKey
    .replace(/^entity[.:]/, '')
    .toLocaleLowerCase('en-US')
    .replace(/[\s_-]+/g, '');
  const actual = typed[1].toLocaleLowerCase('en-US').replace(/[\s_-]+/g, '');
  return actual === expected;
}

function hasGovernedImplicitRankingContract(
  intent: BrainSemanticIntent,
  governedScope?: BrainSemanticIntentGovernedScope,
) {
  if (intent.intent !== 'ranking' || !governedScope?.rankingContracts?.length || !intent.domains.length) return false;
  return governedScope.rankingContracts.some((contract) =>
    intent.domains.every((domain) => contract.domains.includes(domain)),
  );
}

function isSpecificActionTarget(entity: BrainSemanticIntent['entities'][number]): boolean {
  const explicitUserIdentifier =
    entity.source === 'user' &&
    Boolean(entity.entityKey) &&
    entity.entityKey !== entity.entityType &&
    /(?:#|号|ID|id|任务|服务单)?\s*\d+/.test(`${entity.mention} ${entity.entityKey}`);
  if (
    !entity.definitionRef &&
    !(
      entity.source === 'user' &&
      entity.entityType === 'marketing_strategy' &&
      Boolean(entity.entityKey) &&
      entity.entityKey !== entity.entityType
    ) &&
    !explicitUserIdentifier
  ) {
    return false;
  }
  if (entity.entityKey && entity.entityKey !== entity.entityType) return true;
  const mention = normalizeMention(entity.mention);
  if (!mention) return false;
  return (
    !GENERIC_ACTION_TARGET_MENTIONS.has(mention) &&
    !/^(这个|该|那个)?(客户|顾客|会员|员工|美容师|商品|产品|项目|预约)$/.test(mention)
  );
}

const GENERIC_ACTION_TARGET_MENTIONS = new Set(['她', '他', 'ta', '对方', '目标客户', '目标对象']);

function hasExplicitTimeReference(question: string): boolean {
  return /今天|今日|明天|昨日|昨天|本周|上周|本月|这个月|上月|本季度|上季度|今年|去年|近\s*\d+\s*(?:天|周|个月|月)/.test(
    question,
  );
}

function hasExplicitObjectCollectionRequest(question: string): boolean {
  return /谁|哪些|哪个|哪位|列出|名单|排行|排名/.test(question);
}

function hasInternalCapabilityCoverage(intent: BrainSemanticIntent): boolean {
  return (
    intent.ambiguities.some(
      (ambiguity) =>
        /组合能力|能力合同|内部/.test(ambiguity.reason) &&
        ambiguity.candidates.every((candidate) => !isUserFacingCandidate(candidate)),
    ) || intent.assumptions.some((assumption) => /能力\s+\S+\s+将采用并披露已治理的默认分析口径/.test(assumption))
  );
}

function isGroupedDimensionComparison(intent: BrainSemanticIntent): boolean {
  return (
    intent.intent === 'comparison' &&
    !intent.comparisonTarget &&
    intent.metrics.length > 0 &&
    intent.dimensions.length > 0
  );
}

function hasCanonicalRef(
  definitions: BusinessDefinitionBase[],
  ref: BrainDefinitionRef,
  expectedType: BrainDefinitionRef['definitionType'],
): boolean {
  if (ref.definitionType !== expectedType) return false;
  return definitions.some(
    (definition) =>
      definition.definitionKey === ref.definitionKey &&
      definition.version === ref.definitionVersion &&
      definition.definitionFingerprint === ref.definitionFingerprint &&
      definition.sourceFingerprint === ref.sourceFingerprint,
  );
}

function hasGovernedRef(scope: BrainSemanticIntentGovernedScope | undefined, ref: BrainDefinitionRef): boolean {
  return (
    scope?.definitionRefs.some(
      (candidate) =>
        candidate.definitionKey === ref.definitionKey &&
        candidate.version === ref.definitionVersion &&
        candidate.definitionFingerprint === ref.definitionFingerprint &&
        candidate.sourceFingerprint === ref.sourceFingerprint,
    ) ?? false
  );
}

const FORBIDDEN_SECURITY_KEYS = new Set([
  'userid',
  'user_id',
  'storeid',
  'store_id',
  'permission',
  'permissions',
  'permissioncodes',
  'requiredpermissions',
  'required_permissions',
  'datascope',
  'data_scope',
  'storeids',
  'visiblestoreids',
  'store_ids',
  'storescope',
  'store_scope',
  'tenantid',
  'tenant_id',
  'deniedpermissions',
  'role',
  'rolehint',
  'role_hint',
  'user',
  'store',
]);

function findForbiddenSecurityKeys(
  value: unknown,
  path = '',
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): string[] {
  if (depth > 12) return [path ? `${path}.__depth_limit__` : '__depth_limit__'];
  if (Array.isArray(value)) {
    if (seen.has(value)) return [path ? `${path}.__cycle__` : '__cycle__'];
    seen.add(value);
    try {
      return value.flatMap((item, index) => findForbiddenSecurityKeys(item, `${path}[${index}]`, seen, depth + 1));
    } finally {
      seen.delete(value);
    }
  }
  if (!value || typeof value !== 'object') return [];
  if (seen.has(value)) return [path ? `${path}.__cycle__` : '__cycle__'];
  seen.add(value);
  try {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => {
      const currentPath = path ? `${path}.${key}` : key;
      return [
        ...(FORBIDDEN_SECURITY_KEYS.has(key.toLowerCase()) ? [currentPath] : []),
        ...findForbiddenSecurityKeys(nested, currentPath, seen, depth + 1),
      ];
    });
  } finally {
    seen.delete(value);
  }
}

function canonicalRefKey(ref: BrainDefinitionRef): string {
  return `${ref.definitionType}:${ref.definitionKey}@${ref.definitionVersion}#${ref.definitionFingerprint}:${ref.sourceFingerprint}`;
}

function normalizeMention(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN').replace(/\s+/g, '');
}

const SLOT_LABELS: Record<string, string> = {
  actionTarget: '操作对象',
  comparisonEntities: '对比对象',
  comparisonTarget: '对比周期或对象',
  dimension: '分组维度',
  entity: '业务对象',
  metric: '指标口径',
  objective: '目标或要处理的问题',
  orderBy: '排序依据',
  successCriteria: '完成标准',
  timeRange: '时间范围',
};

function buildMergedClarificationQuestion(
  missingSlots: string[],
  ambiguities: BrainSemanticAmbiguity[],
  issues: BrainSemanticIntentValidationIssue[],
): string {
  const parts = missingSlots.map((slot) => `请补充${SLOT_LABELS[slot] ?? '必要信息'}`);
  for (const ambiguity of ambiguities) {
    const visibleCandidates = ambiguity.candidates.filter(isUserFacingCandidate);
    const candidates = visibleCandidates.length > 0 ? `（${visibleCandidates.join('、')}）` : '';
    parts.push(`${ambiguity.reason}${candidates}`);
  }
  for (const issue of issues) {
    if (issue.code !== 'ENTITY_CONFLICT') continue;
    parts.push(`${issue.message}${issue.candidates?.length ? `（${issue.candidates.join('、')}）` : ''}`);
  }
  const normalizedParts = parts.map((part) => part.trim().replace(/[，。；：！？,.!?:;]+$/u, ''));
  return `为了准确处理，请一次确认：${Array.from(new Set(normalizedParts)).join('；')}？`;
}

function isExecutableTimeRange(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const range = value as Record<string, unknown>;
  const label = typeof range.label === 'string' ? range.label.trim() : '';
  const timezone = typeof range.timezone === 'string' ? range.timezone : '';
  const preset = typeof range.preset === 'string' ? range.preset.trim() : '';
  const startDate = typeof range.startDate === 'string' ? range.startDate.trim() : '';
  const endDate = typeof range.endDate === 'string' ? range.endDate.trim() : '';
  if (!label || (timezone !== 'Asia/Shanghai' && timezone !== 'UTC')) return false;
  if (preset) return SUPPORTED_TIME_PRESETS.has(preset);
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) return false;
  return startDate <= endDate;
}

const SUPPORTED_TIME_PRESETS = new Set([
  'today',
  'tomorrow',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'this_year',
  'last_year',
]);

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isUserFacingCandidate(value: string): boolean {
  const candidate = value.trim();
  if (!candidate || candidate.length > 80) return false;
  return !/^(entity|relation|metric|dimension|field|action)[.:]|(:|@|#|=|fingerprint|definition|source[_-]?key|\bsql\b|capability(?:summaries)?|checkedInAt|\bstatus\b|字段|非空)/i.test(
    candidate,
  );
}

function dedupeIssues(issues: BrainSemanticIntentValidationIssue[]): BrainSemanticIntentValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = JSON.stringify([issue.code, issue.slot ?? '', issue.message, issue.candidates ?? []]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
