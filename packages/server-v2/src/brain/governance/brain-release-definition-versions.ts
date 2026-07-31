import type { BrainCapabilityCandidate } from '../capability/brain-capability.types.js';

export function extractBrainReleaseDefinitionVersionIds(
  capabilityCandidates: readonly BrainCapabilityCandidate[],
): number[] {
  return [
    ...new Set(
      capabilityCandidates.flatMap((candidate) => {
        if (!Array.isArray(candidate.definitionRefs)) return [];
        return candidate.definitionRefs.flatMap((ref) => {
          if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return [];
          const versionId = Number((ref as Record<string, unknown>).versionId);
          return Number.isInteger(versionId) && versionId > 0 ? [versionId] : [];
        });
      }),
    ),
  ].sort((left, right) => left - right);
}
