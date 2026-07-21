import { Injectable } from '@nestjs/common';
import type { BrainSemanticIntent, BrainDefinitionRef } from '../cognition/brain-semantic-intent.types.js';
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
    const candidates = input.cards.filter((card) => this.passesHardFilters(card, input));
    if (!candidates.length) {
      return { status: 'none', topK: [], confidence: 0, margin: 0, reason: 'no_capability_after_hard_filters' };
    }

    const ranked = candidates
      .map((card) => this.rank(card, input.question))
      .sort((left, right) => right.score - left.score || left.card.name.localeCompare(right.card.name));
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

  discover(input: BrainCapabilityDiscoveryInput): BrainCapabilityRetrievalResult {
    const maxRisk = input.maxRisk ?? 'high';
    const ranked = input.cards
      .filter((card) =>
        RISK_ORDER[card.riskLevel] <= RISK_ORDER[maxRisk] &&
        this.hasPermissions(card, input.context) &&
        this.hasAllowedRole(card, input.context),
      )
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
    if (ranked.length > 1 && margin < MIN_MARGIN) {
      return { status: 'clarify', topK, confidence, margin, reason: 'catalog_top1_margin_insufficient' };
    }
    return { status: 'selected', selected: top.card, topK, confidence, margin, reason: 'catalog_top1_selected' };
  }

  retrieveTopKForSupervisor(input: Omit<BrainCapabilityRetrievalInput, 'readOnlyOnly'>): readonly BrainCapabilityRankedCandidate[] {
    return input.cards
      .filter((card) => this.passesSupervisorHardFilters(card, input))
      .map((card) => this.rankForSupervisor(card, input))
      .sort((left, right) => right.score - left.score || left.card.name.localeCompare(right.card.name))
      .slice(0, this.config.runtime.capabilityTopK);
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

    const metricAndDimensionRefs: BrainDefinitionRef[] = [...input.intent.metrics, ...input.intent.dimensions];
    const entityRefs = input.intent.entities.flatMap((entity) => {
      if (!entity.definitionRef) return [];
      if (metricAndDimensionRefs.length > 0 && !entity.entityKey) return [];
      return [entity.definitionRef];
    });
    const requestedRefs: BrainDefinitionRef[] = [...metricAndDimensionRefs, ...entityRefs];
    return requestedRefs.every((requested) =>
      card.definitionRefs.some(
        (published) =>
          published.definitionKey === requested.definitionKey &&
          published.version === requested.definitionVersion &&
          published.definitionFingerprint === requested.definitionFingerprint &&
          published.sourceFingerprint === requested.sourceFingerprint,
      ),
    );
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
