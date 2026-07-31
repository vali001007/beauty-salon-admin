import { Injectable } from '@nestjs/common';
import type { BrainSemanticIntent, BrainDefinitionRef } from '../cognition/brain-semantic-intent.types.js';
import type { BusinessActionDefinitionSnapshot } from '../cognition/business-definition-snapshot.types.js';
import type { BrainRequestContext } from '../context/brain-request-context.js';
import { BrainRuntimeConfigService } from '../config/brain-runtime-config.service.js';
import type { BrainCapabilityCard, BrainCapabilityRiskLevel } from './brain-capability.types.js';

const RISK_ORDER: Record<BrainCapabilityRiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const MIN_MARGIN = 0.08;

export interface BrainCapabilityRetrievalInput {
  intent: BrainSemanticIntent;
  question: string;
  context: BrainRequestContext;
  cards: readonly BrainCapabilityCard[];
  maxRisk?: BrainCapabilityRiskLevel;
  readOnlyOnly?: boolean;
  actionDefinition?: BusinessActionDefinitionSnapshot;
}

export interface BrainCapabilityRankedCandidate {
  card: BrainCapabilityCard;
  score: number;
  matchedFields: readonly string[];
}

export interface BrainCapabilityRetrievalResult {
  status: 'selected' | 'clarify' | 'none';
  selected?: BrainCapabilityCard;
  topK: readonly BrainCapabilityRankedCandidate[];
  confidence: number;
  margin: number;
  reason: string;
}

export interface BrainCapabilityGuidanceInput {
  domains: readonly string[];
  question: string;
  context: BrainRequestContext;
  cards: readonly BrainCapabilityCard[];
  limit?: number;
}

export interface BrainCapabilityDiscoveryInput {
  question: string;
  context: BrainRequestContext;
  cards: readonly BrainCapabilityCard[];
  maxRisk?: BrainCapabilityRiskLevel;
}

@Injectable()
export class BrainCapabilityRetrieverService {
  constructor(private readonly config: BrainRuntimeConfigService) {}

  retrieve(input: BrainCapabilityRetrievalInput): BrainCapabilityRetrievalResult {
    if (input.intent.intent === 'action') return this.retrieveBoundAction(input);
    const candidates = input.cards.filter((card) => this.passesHardFilters(card, input));
    if (!candidates.length) {
      return { status: 'none', topK: [], confidence: 0, margin: 0, reason: 'no_capability_after_hard_filters' };
    }

    const ranked = candidates
      .map((card) => this.rank(card, input.question))
      .sort((left, right) => right.score - left.score || left.card.name.localeCompare(right.card.name));
    const minimumSufficient = uniqueMinimumSufficientCandidate(ranked, input.intent);
    if (minimumSufficient) {
      const governedCandidate: BrainCapabilityRankedCandidate = {
        ...minimumSufficient,
        score: 1,
        matchedFields: [...new Set([...minimumSufficient.matchedFields, 'definition_contract'])],
      };
      const governedRanked = [
        governedCandidate,
        ...ranked.filter((candidate) => candidate.card.key !== minimumSufficient.card.key),
      ];
      return {
        status: 'selected',
        selected: minimumSufficient.card,
        topK: governedRanked.slice(0, this.config.runtime.capabilityTopK),
        confidence: 1,
        margin: round(1 - (governedRanked[1]?.score ?? 0)),
        reason: 'unique_minimum_sufficient_definition_contract',
      };
    }
    const top = ranked[0]!;
    const secondScore = ranked[1]?.score ?? 0;
    const margin = round(top.score - secondScore);
    const confidence = round(top.score);
    const topK = ranked.slice(0, this.config.runtime.capabilityTopK);

    if (confidence < this.config.runtime.capabilityMinConfidence) {
      return { status: 'clarify', topK, confidence, margin, reason: 'top1_below_confidence_threshold' };
    }
    if (ranked.length > 1 && margin < MIN_MARGIN) {
      return { status: 'clarify', topK, confidence, margin, reason: 'top1_margin_insufficient' };
    }
    return { status: 'selected', selected: top.card, topK, confidence, margin, reason: 'top1_selected' };
  }

  private retrieveBoundAction(input: BrainCapabilityRetrievalInput): BrainCapabilityRetrievalResult {
    if (input.intent.actionPolarity !== 'affirmative') {
      return {
        status: 'none',
        topK: [],
        confidence: 0,
        margin: 0,
        reason: 'action_polarity_not_executable',
      };
    }
    const actionRef = input.intent.actionRef;
    const action = input.actionDefinition;
    if (
      !actionRef ||
      !action ||
      action.definitionKey !== actionRef.definitionKey ||
      action.version !== actionRef.definitionVersion ||
      action.definitionFingerprint !== actionRef.definitionFingerprint ||
      action.sourceFingerprint !== actionRef.sourceFingerprint
    ) {
      return { status: 'none', topK: [], confidence: 0, margin: 0, reason: 'action_definition_not_resolved' };
    }
    if (input.intent.actionModality !== 'request') {
      return {
        status: 'none',
        topK: [],
        confidence: 0,
        margin: 0,
        reason: 'action_modality_requires_dedicated_flow',
      };
    }
    const bindings = action.capabilityBindings
      .filter((binding) => binding.enabled && binding.bindingMode === 'preview_and_execute')
      .sort((left, right) => left.priority - right.priority || left.capabilityKey.localeCompare(right.capabilityKey));
    const bindingPriority = new Map(bindings.map((binding) => [binding.capabilityKey, binding.priority]));
    const candidates = input.cards.filter(
      (card) =>
        bindingPriority.has(card.key) &&
        !card.readOnly &&
        card.sideEffect &&
        card.requiresConfirmation &&
        card.idempotency === 'required' &&
        card.grounding === 'preview_action' &&
        this.passesHardFilters(card, input) &&
        card.definitionRefs.some((ref) => samePublishedDefinitionRef(ref, actionRef)),
    );
    if (!candidates.length) {
      return { status: 'none', topK: [], confidence: 0, margin: 0, reason: 'action_binding_not_published' };
    }
    const ranked = candidates
      .map((card) => ({
        card,
        score: 1,
        matchedFields: ['action_binding'] as const,
        priority: bindingPriority.get(card.key)!,
      }))
      .sort((left, right) => left.priority - right.priority || left.card.key.localeCompare(right.card.key));
    const topPriority = ranked[0]!.priority;
    const topPriorityCandidates = ranked.filter((candidate) => candidate.priority === topPriority);
    const topK = ranked
      .slice(0, this.config.runtime.capabilityTopK)
      .map(({ priority: _priority, ...candidate }) => candidate);
    if (topPriorityCandidates.length !== 1) {
      return { status: 'clarify', topK, confidence: 1, margin: 0, reason: 'action_binding_priority_ambiguous' };
    }
    return {
      status: 'selected',
      selected: topPriorityCandidates[0]!.card,
      topK,
      confidence: 1,
      margin: ranked.length > 1 ? 1 : 1,
      reason: 'action_binding_selected',
    };
  }

  discover(input: BrainCapabilityDiscoveryInput): BrainCapabilityRetrievalResult {
    const maxRisk = input.maxRisk ?? 'high';
    const contextCandidates = input.cards.filter(
      (card) =>
        RISK_ORDER[card.riskLevel] <= RISK_ORDER[maxRisk] &&
        this.hasPermissions(card, input.context) &&
        this.hasAllowedRole(card, input.context),
    );
    const explicitIntent = inferExplicitInteractionIntent(input.question);
    const intentCandidates = explicitIntent
      ? contextCandidates.filter((card) => card.intents.includes(explicitIntent))
      : [];
    const ranked = (intentCandidates.length ? intentCandidates : contextCandidates)
      .map((card) => this.rank(card, input.question))
      .sort((left, right) => right.score - left.score || left.card.name.localeCompare(right.card.name));
    if (!ranked.length) {
      return { status: 'none', topK: [], confidence: 0, margin: 0, reason: 'no_capability_after_context_filters' };
    }
    const top = ranked[0]!;
    const margin = round(top.score - (ranked[1]?.score ?? 0));
    const confidence = round(top.score);
    const topK = ranked.slice(0, this.config.runtime.capabilityTopK);
    if (confidence < this.config.runtime.capabilityMinConfidence) {
      return { status: 'clarify', topK, confidence, margin, reason: 'catalog_top1_below_confidence_threshold' };
    }
    const hasUniqueCatalogEvidence = top.matchedFields.length > 0 && (ranked[1]?.matchedFields.length ?? 0) === 0;
    const usesUniqueCatalogEvidence = ranked.length > 1 && margin < MIN_MARGIN && hasUniqueCatalogEvidence;
    if (ranked.length > 1 && margin < MIN_MARGIN && !hasUniqueCatalogEvidence) {
      return { status: 'clarify', topK, confidence, margin, reason: 'catalog_top1_margin_insufficient' };
    }
    return {
      status: 'selected',
      selected: top.card,
      topK,
      confidence,
      margin,
      reason: usesUniqueCatalogEvidence ? 'catalog_unique_field_evidence' : 'catalog_top1_selected',
    };
  }

  retrieveTopKForSupervisor(
    input: Omit<BrainCapabilityRetrievalInput, 'readOnlyOnly'>,
  ): readonly BrainCapabilityRankedCandidate[] {
    return input.cards
      .filter((card) => this.passesSupervisorHardFilters(card, input))
      .map((card) => this.rankForSupervisor(card, input))
      .sort((left, right) => right.score - left.score || left.card.name.localeCompare(right.card.name))
      .slice(0, this.config.runtime.capabilityTopK);
  }

  retrieveGuidanceCandidates(input: BrainCapabilityGuidanceInput): readonly BrainCapabilityRankedCandidate[] {
    return input.cards
      .filter((card) => {
        if (input.domains.length && !input.domains.some((domain) => card.domains.includes(domain))) return false;
        if (!card.readOnly || card.sideEffect || card.requiresConfirmation || card.riskLevel !== 'low') return false;
        return this.hasPermissions(card, input.context) && this.hasAllowedRole(card, input.context);
      })
      .map((card) => this.rank(card, input.question))
      .sort((left, right) => right.score - left.score || left.card.name.localeCompare(right.card.name))
      .slice(0, input.limit ?? this.config.runtime.capabilityTopK);
  }

  private passesHardFilters(card: BrainCapabilityCard, input: BrainCapabilityRetrievalInput): boolean {
    if (input.intent.domains.length && !input.intent.domains.some((domain) => card.domains.includes(domain))) {
      return false;
    }
    if (!card.intents.includes(input.intent.intent)) return false;
    const maxRisk = input.maxRisk ?? 'low';
    const readOnlyOnly = input.readOnlyOnly ?? true;
    if (RISK_ORDER[card.riskLevel] > RISK_ORDER[maxRisk]) return false;
    if (readOnlyOnly && !card.readOnly) return false;
    if (!this.hasPermissions(card, input.context)) return false;
    if (!this.hasAllowedRole(card, input.context)) return false;

    const metricAndDimensionRefs = intentMetricDimensionAndFilterRefs(input.intent);
    const entityRefs = input.intent.entities.flatMap((entity) => {
      if (!entity.definitionRef) return [];
      if (metricAndDimensionRefs.length > 0 && !entity.entityKey) return [];
      return [entity.definitionRef];
    });
    const requestedRefs: BrainDefinitionRef[] = [
      ...metricAndDimensionRefs,
      ...entityRefs,
      ...(input.intent.actionRef ? [input.intent.actionRef] : []),
    ];
    const allowsFinanceStaffCommissionCompositionContract =
      card.key === 'finance_risk_overview' &&
      requestedRefs.some((requested) => isFinanceStaffCommissionCompositionMetricRef(requested));
    return requestedRefs.every((requested) => {
      if (
        allowsFinanceStaffCommissionCompositionContract &&
        isBeauticianEntityRef(requested) &&
        !card.definitionRefs.some((published) => published.definitionKey === requested.definitionKey)
      ) {
        return true;
      }
      if (
        allowsFinanceStaffCommissionCompositionContract &&
        (isFinanceStaffCommissionCompositionMetricRef(requested) ||
          isCommissionTypeDimensionRef(requested) ||
          isBeauticianIdentityDimensionRef(requested))
      ) {
        return true;
      }
      return capabilityCoversRequestedDefinitionRef(card.definitionRefs, requested);
    });
  }

  private passesSupervisorHardFilters(
    card: BrainCapabilityCard,
    input: Omit<BrainCapabilityRetrievalInput, 'readOnlyOnly'>,
  ): boolean {
    const maxRisk = input.maxRisk ?? 'high';
    return (
      RISK_ORDER[card.riskLevel] <= RISK_ORDER[maxRisk] &&
      this.hasPermissions(card, input.context) &&
      this.hasAllowedRole(card, input.context)
    );
  }

  private rankForSupervisor(
    card: BrainCapabilityCard,
    input: Omit<BrainCapabilityRetrievalInput, 'readOnlyOnly'>,
  ): BrainCapabilityRankedCandidate {
    const ranked = this.rank(card, input.question);
    const domainBoost = input.intent.domains.some((domain) => card.domains.includes(domain)) ? 0.16 : 0;
    const intentBoost = card.intents.includes(input.intent.intent) ? 0.12 : 0;
    return { ...ranked, score: round(Math.min(1, ranked.score + domainBoost + intentBoost)) };
  }

  private hasPermissions(card: BrainCapabilityCard, context: BrainRequestContext): boolean {
    if (context.deniedPermissions.includes('*')) return false;
    for (const permission of card.requiredPermissions) {
      if (context.deniedPermissions.includes(permission)) return false;
      if (!context.permissions.includes('*') && !context.permissions.includes(permission)) return false;
    }
    return true;
  }

  private hasAllowedRole(card: BrainCapabilityCard, context: BrainRequestContext): boolean {
    if (!card.allowedRoles.length) return true;
    const roles = context.roles ?? [];
    if (!roles.length) return false;
    if (roles.includes('super_admin')) return true;
    if (roles.includes('*') || card.allowedRoles.includes('*')) return true;
    return card.allowedRoles.some((role) => roles.includes(role));
  }

  private rank(card: BrainCapabilityCard, question: string): BrainCapabilityRankedCandidate {
    const scores = [
      { field: 'name', weight: 0.35, score: textSimilarity(question, card.name) },
      { field: 'description', weight: 0.1, score: textSimilarity(question, card.description) },
      { field: 'synonyms', weight: 0.3, score: bestSimilarity(question, card.synonyms) },
      { field: 'examples', weight: 0.2, score: bestSimilarity(question, card.examples) },
      { field: 'inputSchema', weight: 0.05, score: bestSimilarity(question, inputPropertyNames(card.inputSchema)) },
    ];
    const weighted = scores.reduce((total, item) => total + item.weight * item.score, 0);
    const bestSignal = Math.max(...scores.map((item) => item.score));
    const negativeSignal = bestSimilarity(question, card.negativeExamples ?? []);
    const positiveScore = bestSignal === 0 ? 0 : Math.min(1, 0.2 + 0.8 * (0.65 * bestSignal + 0.35 * weighted));
    const score = Math.max(0, positiveScore - 0.65 * negativeSignal);
    return {
      card,
      score: round(score),
      matchedFields: scores.filter((item) => item.score >= 0.45).map((item) => item.field),
    };
  }
}

function uniqueMinimumSufficientCandidate(
  ranked: readonly BrainCapabilityRankedCandidate[],
  intent: BrainSemanticIntent,
): BrainCapabilityRankedCandidate | undefined {
  const requestedRefs = [...intent.metrics, ...intent.dimensions];
  if (requestedRefs.length === 0) return undefined;
  const requestedKeys = new Set(requestedRefs.map((ref) => ref.definitionKey));
  const candidates = ranked.map((candidate) => ({
    candidate,
    definitionRefCount: new Set(candidate.card.definitionRefs.map((ref) => ref.definitionKey)).size,
    extraDefinitionRefCount: new Set(
      candidate.card.definitionRefs
        .map((ref) => ref.definitionKey)
        .filter((definitionKey) => !requestedKeys.has(definitionKey)),
    ).size,
  }));
  const minimumExtraDefinitionRefCount = Math.min(...candidates.map((item) => item.extraDefinitionRefCount));
  const minimumExtraCandidates = candidates.filter(
    (item) => item.extraDefinitionRefCount === minimumExtraDefinitionRefCount,
  );
  const minimumDefinitionRefCount = Math.min(...minimumExtraCandidates.map((item) => item.definitionRefCount));
  const minimumCandidates = minimumExtraCandidates.filter(
    (item) => item.definitionRefCount === minimumDefinitionRefCount,
  );
  return minimumCandidates.length === 1 ? minimumCandidates[0]!.candidate : undefined;
}

function intentMetricDimensionAndFilterRefs(intent: BrainSemanticIntent): BrainDefinitionRef[] {
  const filterRefs = (intent.filters ?? []).flatMap((filter) =>
    filter.fieldRef.definitionType === 'dimension' ? [filter.fieldRef] : [],
  );
  const seen = new Set<string>();
  return [...intent.metrics, ...intent.dimensions, ...filterRefs].filter((ref) => {
    const key = `${ref.definitionType}:${ref.definitionKey}:${ref.definitionVersion}:${ref.definitionFingerprint}:${ref.sourceFingerprint}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function samePublishedDefinitionRef(
  published: BrainCapabilityCard['definitionRefs'][number],
  requested: BrainDefinitionRef,
): boolean {
  return (
    published.definitionKey === requested.definitionKey &&
    published.version === requested.definitionVersion &&
    published.definitionFingerprint === requested.definitionFingerprint &&
    published.sourceFingerprint === requested.sourceFingerprint
  );
}

function capabilityCoversRequestedDefinitionRef(
  publishedRefs: BrainCapabilityCard['definitionRefs'],
  requested: BrainDefinitionRef,
): boolean {
  if (publishedRefs.some((published) => samePublishedDefinitionRef(published, requested))) return true;
  if (requested.definitionType !== 'entity') return false;

  // A stale publication of the same entity definition must not be rescued by a looser identity-dimension match.
  if (publishedRefs.some((published) => published.definitionKey === requested.definitionKey)) return false;

  const entityIdentity = normalizedDefinitionIdentity(requested.definitionKey.replace(/^entity\./u, ''));
  if (!entityIdentity) return false;
  const acceptedIdentityDimensions = new Set([
    `dimension${entityIdentity}id`,
    `dimension${entityIdentity}name`,
  ]);
  return publishedRefs.some((published) =>
    acceptedIdentityDimensions.has(normalizedDefinitionIdentity(published.definitionKey)),
  );
}

function isFinanceStaffCommissionCompositionMetricRef(requested: BrainDefinitionRef): boolean {
  return (
    requested.definitionType === 'metric' &&
    normalizedDefinitionIdentity(requested.definitionKey) === 'metricstaffcommissioncomponentamount'
  );
}

function isCommissionTypeDimensionRef(requested: BrainDefinitionRef): boolean {
  return (
    requested.definitionType === 'dimension' &&
    normalizedDefinitionIdentity(requested.definitionKey) === 'dimensioncommissiontype'
  );
}

function isBeauticianEntityRef(requested: BrainDefinitionRef): boolean {
  return requested.definitionType === 'entity' && normalizedDefinitionIdentity(requested.definitionKey) === 'entitybeautician';
}

function isBeauticianIdentityDimensionRef(requested: BrainDefinitionRef): boolean {
  if (requested.definitionType !== 'dimension') return false;
  const key = normalizedDefinitionIdentity(requested.definitionKey);
  return key === 'dimensionbeauticianid' || key === 'dimensionbeauticianname';
}

function normalizedDefinitionIdentity(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, '');
}

function inferExplicitInteractionIntent(question: string): string | undefined {
  const normalized = question.trim().toLowerCase();
  if (
    /(?:写|生成|拟|编辑|准备).*(?:文案|话术|短信|消息|提醒|邀请|欢迎词)/.test(normalized) &&
    !/(?:发送|群发|推送|发布|执行|保存)/.test(normalized)
  ) {
    return 'draft';
  }
  if (/(?:发送|群发|推送|发布|执行|创建|修改|取消|核销|下单)/.test(normalized)) return 'action';
  return undefined;
}

function inputPropertyNames(schema: Readonly<Record<string, unknown>>): string[] {
  const properties = schema.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return [];
  return Object.keys(properties as Record<string, unknown>);
}

function bestSimilarity(question: string, values: readonly string[]): number {
  return values.reduce((best, value) => Math.max(best, textSimilarity(question, value)), 0);
}

function textSimilarity(leftValue: string, rightValue: string): number {
  const left = normalize(leftValue);
  const right = normalize(rightValue);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return Math.min(1, 0.75 + 0.25 * (Math.min(left.length, right.length) / Math.max(left.length, right.length)));
  }
  const leftBigrams = ngrams(left);
  const rightBigrams = ngrams(right);
  const bigramScore = dice(leftBigrams, rightBigrams);
  const characterScore = dice(new Set(left), new Set(right));
  return Math.max(bigramScore, characterScore);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function ngrams(value: string): Set<string> {
  if (value.length < 2) return new Set([value]);
  const values = new Set<string>();
  for (let index = 0; index < value.length - 1; index += 1) values.add(value.slice(index, index + 2));
  return values;
}

function dice(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return (2 * intersection) / (left.size + right.size || 1);
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
