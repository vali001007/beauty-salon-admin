import { Injectable } from '@nestjs/common';

export interface BrainEvalPlanShapeExpectation {
  minNodes?: number;
  maxNodes?: number;
  requiresPreview?: boolean;
  requiredCapabilityKeys?: string[];
}

export interface BrainEvalExpectation {
  intent?: string;
  answerShape?: string;
  domains?: string[];
  entities?: string[];
  metrics?: string[];
  dimensions?: string[];
  capabilityKeys?: string[];
  capabilityAnyOf?: string[];
  planShape?: BrainEvalPlanShapeExpectation;
  brainStatuses?: string[];
  missingSlots?: string[];
  forbiddenMissingSlots?: string[];
  requiresGrounding?: boolean;
  requiresComplete?: boolean;
}

export interface BrainEvalLayerGrade {
  layer: 'intent' | 'capability' | 'plan' | 'execution' | 'completion' | 'answer';
  passed: boolean;
  score: number;
  checked: number;
  failures: string[];
  deterministicFailure: boolean;
}

@Injectable()
export class BrainIntentGraderService {
  grade(input: { expected: BrainEvalExpectation; actual: unknown }): BrainEvalLayerGrade {
    const actual = record(input.actual);
    const checks: Array<{ ok: boolean; failure: string }> = [];
    if (input.expected.intent) {
      checks.push({ ok: intentMatches(input.expected.intent, actual), failure: 'intent_mismatch' });
    }
    this.subsetCheck(checks, 'domain', input.expected.domains, stringArray(actual.domains));
    this.subsetCheck(checks, 'entity', input.expected.entities, entityTypes(actual.entities));
    this.subsetCheck(checks, 'metric', input.expected.metrics, definitionKeys(actual.metrics));
    this.subsetCheck(checks, 'dimension', input.expected.dimensions, inferredDimensionKeys(actual));
    this.subsetCheck(checks, 'missing_slot', input.expected.missingSlots, stringArray(actual.missingSlots));
    for (const value of input.expected.forbiddenMissingSlots ?? []) {
      checks.push({
        ok: !stringArray(actual.missingSlots).includes(value),
        failure: `missing_slot_not_cleared:${value}`,
      });
    }
    if (input.expected.answerShape && input.expected.answerShape !== 'clarification') {
      checks.push({ ok: actual.answerShape === input.expected.answerShape, failure: 'answer_shape_mismatch' });
    }
    return layerGrade('intent', checks);
  }

  private subsetCheck(
    checks: Array<{ ok: boolean; failure: string }>,
    name: string,
    expected: string[] | undefined,
    actual: string[],
  ) {
    if (!expected?.length) return;
    for (const value of expected) {
      checks.push({ ok: actual.some((item) => equivalentKey(item, value)), failure: `${name}_missing:${value}` });
    }
  }
}

export function layerGrade(
  layer: BrainEvalLayerGrade['layer'],
  checks: Array<{ ok: boolean; failure: string }>,
): BrainEvalLayerGrade {
  const failures = checks.filter((check) => !check.ok).map((check) => check.failure);
  return {
    layer,
    passed: failures.length === 0,
    score: checks.length ? (checks.length - failures.length) / checks.length : 1,
    checked: checks.length,
    failures,
    deterministicFailure: failures.length > 0,
  };
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function equivalentKey(actual: string, expected: string): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/^(?:metric|dimension|entity)\./, '').replace(/[._-]/g, '');
  const left = normalize(actual);
  const right = normalize(expected);
  return left === right || left.includes(right) || right.includes(left);
}

function normalizeIntent(value: unknown): string {
  const intent = String(value ?? '');
  const aliases: Record<string, string> = {
    scalar_metric: 'query',
    metric_query: 'query',
    list: 'query',
    non_metric: 'draft',
    analysis_and_recommendation: 'diagnosis',
  };
  return aliases[intent] ?? intent;
}

function intentMatches(expected: string, actual: Record<string, unknown>): boolean {
  const expectedIntent = normalizeIntent(expected);
  const actualIntent = normalizeIntent(actual.intent);
  if (actualIntent === expectedIntent) return true;
  if (
    ((expectedIntent === 'draft' && actualIntent === 'recommendation') ||
      (expectedIntent === 'recommendation' && actualIntent === 'draft')) &&
    actual.answerShape === 'draft'
  ) {
    return true;
  }
  if (
    expectedIntent === 'clarify' &&
    (actual.answerShape === 'clarification' ||
      stringArray(actual.missingSlots).length > 0 ||
      (Array.isArray(actual.ambiguities) && actual.ambiguities.length > 0))
  ) {
    return true;
  }
  if (
    expectedIntent === 'query' &&
    ['ranking', 'comparison', 'trend', 'diagnosis', 'recommendation'].includes(actualIntent) &&
    ['ranking', 'list', 'comparison', 'trend', 'diagnosis'].includes(String(actual.answerShape))
  ) {
    return true;
  }
  if (
    expectedIntent === 'comparison' &&
    actualIntent === 'ranking' &&
    actual.answerShape === 'ranking' &&
    Array.isArray(actual.dimensions) &&
    actual.dimensions.length > 0 &&
    actual.comparisonTarget === undefined
  ) {
    return true;
  }
  return expectedIntent === 'diagnosis' && actualIntent === 'query' && ['diagnosis', 'list'].includes(String(actual.answerShape));
}

function entityTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const entity = record(item);
    return typeof entity.entityType === 'string' ? [entity.entityType] : [];
  });
}

function definitionKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === 'string') return [item];
    const definition = record(item);
    return typeof definition.definitionKey === 'string' ? [definition.definitionKey] : [];
  });
}

function inferredDimensionKeys(actual: Record<string, unknown>): string[] {
  const dimensions = definitionKeys(actual.dimensions);
  if (!['list', 'ranking'].includes(String(actual.answerShape))) return dimensions;
  const inferredByEntity: Record<string, string> = {
    customer: 'customerName',
    staff: 'beauticianName',
    beautician: 'beauticianName',
    project: 'projectName',
    product: 'productName',
  };
  for (const entityType of entityTypes(actual.entities)) {
    const inferred = inferredByEntity[entityType];
    if (inferred && !dimensions.some((item) => equivalentKey(item, inferred))) dimensions.push(inferred);
  }
  return dimensions;
}
