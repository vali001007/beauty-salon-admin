import type { BrainCapabilityCandidate } from '../capability/brain-capability.types.js';

export interface BrainEvaluationReleaseSnapshot {
  releaseId: number;
  releaseStatus: 'draft' | 'active';
  releaseFingerprint: string;
  declaredMode: 'rules' | 'shadow' | 'model';
  mode: 'rules' | 'model';
  resourceVersionIds: readonly number[];
  capabilityKeys: readonly string[];
  capabilityCandidates: readonly BrainCapabilityCandidate[];
}
