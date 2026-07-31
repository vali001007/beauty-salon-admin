import { createBusinessActionSituationContextProfile } from './business-action-situation-context.js';

export function createTestBusinessActionSituationContextProfile(actionKey = 'action.test') {
  return createBusinessActionSituationContextProfile(actionKey);
}
