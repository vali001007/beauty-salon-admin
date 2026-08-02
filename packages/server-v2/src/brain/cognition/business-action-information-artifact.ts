import { createBusinessDefinitionProjectionFingerprint } from '../../semantic-data/business-definition-projection-compiler.service.js';
import type { BusinessActionInformationArtifactProfile } from './business-definition-snapshot.types.js';

export function createBusinessActionInformationArtifactProfile(
  actionKey: string,
): BusinessActionInformationArtifactProfile {
  const profile = {
    schemaVersion: '1.0' as const,
    profileKey: `${actionKey}.information_artifact`,
    referencePolicy: 'bind_if_present' as const,
    artifactTypePolicy: 'governed_result_reference' as const,
    sourcePolicy: 'completed_brain_run_same_conversation_store_user' as const,
    versionPolicy: 'source_run_and_capability_version' as const,
    contentIntegrityPolicy: 'canonical_content_fingerprint' as const,
    supersessionPolicy: 'explicit_new_reference_only' as const,
  };
  return { ...profile, fingerprint: createBusinessDefinitionProjectionFingerprint(profile) };
}
