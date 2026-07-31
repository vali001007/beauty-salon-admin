import { createBusinessActionModalityPolicy } from './business-action-modality-policy.js';

export function createTestBusinessActionModalityPolicy(actionKey = 'action.test') {
  return createBusinessActionModalityPolicy(actionKey);
}
