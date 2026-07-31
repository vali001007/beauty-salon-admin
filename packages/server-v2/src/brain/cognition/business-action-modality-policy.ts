import { createBusinessDefinitionProjectionFingerprint } from '../../semantic-data/business-definition-projection-compiler.service.js';
import type { BusinessActionModalityPolicy } from './business-definition-snapshot.types.js';

export function createBusinessActionModalityPolicy(actionKey: string): BusinessActionModalityPolicy {
  const policy = {
    schemaVersion: '1.0' as const,
    policyKey: `${actionKey}.speech_act_modality`,
    supportedModalities: ['request'] as const,
    unsupportedModalityPolicy: 'fail_closed' as const,
    confirmationReferencePolicy: 'existing_confirmation_required' as const,
    schedulePolicy: 'action_plan_required' as const,
    cancellationReferencePolicy: 'existing_preview_or_plan_required' as const,
  };
  return { ...policy, fingerprint: createBusinessDefinitionProjectionFingerprint(policy) };
}
