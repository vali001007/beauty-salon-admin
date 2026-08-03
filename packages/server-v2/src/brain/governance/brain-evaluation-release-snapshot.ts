import type { BrainCapabilityCandidate } from '../capability/brain-capability.types.js';
import type { BrainProductIdentity } from './brain-release-identity.service.js';
import type { BrainReleaseProductProfileSummary } from './brain-release-product-profile.js';

export interface BrainEvaluationReleaseSnapshot {
  releaseId: number;
  releaseKey?: string;
  releaseStatus: 'draft' | 'active';
  releaseFingerprint: string;
  evaluationIdentity: BrainProductIdentity;
  declaredMode: 'rules' | 'shadow' | 'model';
  mode: 'rules' | 'model';
  resourceVersionIds: readonly number[];
  capabilityKeys: readonly string[];
  capabilityCandidates: readonly BrainCapabilityCandidate[];
  productProfile?: BrainReleaseProductProfileSummary;
}
