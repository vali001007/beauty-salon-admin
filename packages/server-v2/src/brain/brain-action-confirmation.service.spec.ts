import { BrainActionConfirmationService } from './skills/brain-action-confirmation.service.js';

describe('BrainActionConfirmationService', () => {
  it('requires confirmation for high-risk actions', () => {
    const service = new BrainActionConfirmationService({} as never);
    expect(service.requiresConfirmation('high')).toBe(true);
    expect(service.requiresConfirmation('critical')).toBe(true);
    expect(service.requiresConfirmation('low')).toBe(false);
  });
});
