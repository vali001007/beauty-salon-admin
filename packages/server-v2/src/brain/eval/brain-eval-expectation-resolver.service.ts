import { Injectable } from '@nestjs/common';
import type { BrainCapabilityCandidate } from '../capability/brain-capability.types.js';
import type { BusinessDefinitionSnapshotInput } from '../cognition/business-definition-snapshot.types.js';
import type { BrainEvaluationReleaseSnapshot } from '../governance/brain-evaluation-release-snapshot.js';
import type { BrainEvalExpectation } from './brain-intent-grader.service.js';

export interface BrainEvalExpectationResolution {
  expectation: BrainEvalExpectation;
  evidence: {
    metricKeys: string[];
    dimensionKeys: string[];
    entityKeys: string[];
    domainKeys: string[];
    capabilityKeys: string[];
    unresolved: string[];
  };
}

@Injectable()
export class BrainEvalExpectationResolverService {
  resolve(input: {
    base: BrainEvalExpectation;
    definitions: BusinessDefinitionSnapshotInput;
    releaseSnapshot?: BrainEvaluationReleaseSnapshot;
    roleKey?: string;
  }): BrainEvalExpectationResolution {
    const unresolved: string[] = [];
    const metrics = (input.base.metrics ?? []).flatMap((value) => {
      const match = uniqueMatch(
        value,
        input.definitions.metrics,
        (item) => [item.definitionKey, item.metricKey, item.name, ...(item.aliases ?? [])],
      );
      if (!match) unresolved.push(`metric:${value}`);
      return match ? [match.metricKey] : [];
    });
    const entities = (input.base.entities ?? []).flatMap((value) => {
      const match = uniqueMatch(
        value,
        input.definitions.entities,
        (item) => [item.definitionKey, item.entityKey, item.name, ...item.aliases],
      );
      if (!match) unresolved.push(`entity:${value}`);
      return match ? [match.entityKey] : [];
    });
    const resolvedMetricRows = input.definitions.metrics.filter((item) => metrics.includes(item.metricKey));
    const metricDimensionKeys = new Set(resolvedMetricRows.flatMap((item) => item.runtimeQuery?.dimensions ?? []));
    const dimensions = (input.base.dimensions ?? []).flatMap((value) => {
      const exact = uniqueMatch(
        value,
        input.definitions.dimensions,
        (item) => [item.definitionKey, item.dimensionKey, item.name, ...(item.aliases ?? [])],
      );
      if (exact) return [exact.dimensionKey];
      const domain = normalize(value);
      const candidates = input.definitions.dimensions.filter(
        (item) =>
          normalize(item.domain) === domain &&
          (!metricDimensionKeys.size || metricDimensionKeys.has(item.dimensionKey)),
      );
      const preferred = candidates.find((item) => /name$/i.test(item.dimensionKey)) ?? candidates[0];
      if (!preferred) unresolved.push(`dimension:${value}`);
      return preferred ? [preferred.dimensionKey] : [];
    });
    const resolvedDimensionRows = input.definitions.dimensions.filter((item) => dimensions.includes(item.dimensionKey));
    const domains = unique([
      ...resolvedMetricRows.map((item) => item.domain),
      ...resolvedDimensionRows.map((item) => item.domain),
    ]);
    const metricCapabilities = unique(
      resolvedMetricRows.flatMap((item) => item.runtimeQuery?.capabilityKeys ?? []),
    );
    const availableCapabilities = new Set(input.releaseSnapshot?.capabilityKeys ?? []);
    const capabilityKeys = metricCapabilities.filter(
      (key) => !availableCapabilities.size || availableCapabilities.has(key),
    );
    const resolvedDefinitionKeys = new Set([
      ...resolvedMetricRows.map((item) => item.definitionKey),
      ...resolvedDimensionRows.map((item) => item.definitionKey),
      ...input.definitions.entities
        .filter((item) => entities.includes(item.entityKey))
        .map((item) => item.definitionKey),
    ]);
    const definitionBoundCapabilityKeys = (input.releaseSnapshot?.capabilityCandidates ?? []).flatMap((candidate) => {
      if (
        typeof candidate.key !== 'string' ||
        !Array.isArray(candidate.definitionRefs) ||
        !candidateMatchesExpectation(candidate, input.base.intent, domains, input.roleKey)
      ) return [];
      const matches = candidate.definitionRefs.some((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        return resolvedDefinitionKeys.has(String((value as Record<string, unknown>).definitionKey ?? ''));
      });
      return matches ? [candidate.key] : [];
    });
    const roleCapabilityKeys = (input.releaseSnapshot?.capabilityCandidates ?? []).flatMap((candidate) => {
      if (typeof candidate.key !== 'string') return [];
      return candidateMatchesExpectation(candidate, input.base.intent, domains, input.roleKey) ? [candidate.key] : [];
    });
    const definitionCapabilities = unique([...capabilityKeys, ...definitionBoundCapabilityKeys]);
    const capabilityAnyOf = unique(definitionCapabilities.length ? definitionCapabilities : roleCapabilityKeys);

    return {
      expectation: {
        ...input.base,
        metrics,
        dimensions,
        entities: [],
        domains,
        capabilityKeys: input.releaseSnapshot ? [] : input.base.capabilityKeys,
        capabilityAnyOf: input.releaseSnapshot ? capabilityAnyOf : undefined,
      },
      evidence: {
        metricKeys: metrics,
        dimensionKeys: dimensions,
        entityKeys: entities,
        domainKeys: domains,
        capabilityKeys: input.releaseSnapshot ? capabilityAnyOf : input.base.capabilityKeys ?? [],
        unresolved: unique(unresolved),
      },
    };
  }
}

function uniqueMatch<T>(value: string, items: readonly T[], terms: (item: T) => readonly string[]): T | undefined {
  const target = normalize(value);
  const matches = items.filter((item) => terms(item).some((term) => normalize(term) === target));
  return matches.length === 1 ? matches[0] : undefined;
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase('zh-Hans-CN')
    .replace(/^(?:metric|dimension|entity)\./, '')
    .replace(/[\s._-]/g, '');
}

function unique(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
}

function candidateMatchesExpectation(
  candidate: Pick<BrainCapabilityCandidate, 'allowedRoles' | 'intents' | 'domains'>,
  expectedIntent: string | undefined,
  expectedDomains: readonly string[],
  roleKey: string | undefined,
) {
  const allowedRoles = strings(candidate.allowedRoles);
  if (roleKey && allowedRoles.length > 0 && !allowedRoles.includes('*') && !allowedRoles.includes(roleKey)) return false;

  const intents = strings(candidate.intents);
  if (expectedIntent && intents.length > 0 && !intents.includes(expectedIntent)) return false;

  const domains = strings(candidate.domains);
  if (expectedDomains.length > 0 && domains.length > 0 && !expectedDomains.some((domain) => domains.includes(domain))) {
    return false;
  }
  return true;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item)) : [];
}
