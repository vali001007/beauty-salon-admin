import type { BrainCapabilityCandidate } from '../capability/brain-capability.types.js';

export function extractBrainReleaseDefinitionVersionIds(
  capabilityCandidates: readonly BrainCapabilityCandidate[],
): number[] {
  return [
    ...new Set(
      capabilityCandidates.flatMap((candidate) => {
        const direct = Array.isArray(candidate.definitionRefs)
          ? candidate.definitionRefs.flatMap((ref) => {
              if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return [];
              const versionId = Number((ref as Record<string, unknown>).versionId);
              return Number.isInteger(versionId) && versionId > 0 ? [versionId] : [];
            })
          : [];
        const ontology = Array.isArray(candidate.ontologyDefinitionVersionIds)
          ? candidate.ontologyDefinitionVersionIds
              .map((value) => Number(value))
              .filter((value) => Number.isInteger(value) && value > 0)
          : [];
        return [...direct, ...ontology];
      }),
    ),
  ].sort((left, right) => left - right);
}
