import { createBusinessDefinitionProjectionFingerprint } from '../../semantic-data/business-definition-projection-compiler.service.js';
import type { BusinessActionSituationContextProfile } from './business-definition-snapshot.types.js';

export function createBusinessActionSituationContextProfile(actionKey: string): BusinessActionSituationContextProfile {
  const profile = {
    schemaVersion: '1.0' as const,
    profileKey: `${actionKey}.situation_context`,
    tenantBoundary: 'current_store' as const,
    requestChannelPolicy: 'bind_if_present' as const,
    devicePolicy: 'bind_if_present' as const,
    conversationPolicy: 'same_conversation' as const,
    businessTimePolicy: {
      timezone: 'Asia/Shanghai' as const,
      businessDatePolicy: 'same_business_date' as const,
      clockSource: 'server' as const,
    },
    actorPolicy: {
      subjectPolicy: 'same_authenticated_user' as const,
      qualificationPolicy: 'revalidate_current_role_and_permission' as const,
    },
  };
  return { ...profile, fingerprint: createBusinessDefinitionProjectionFingerprint(profile) };
}
