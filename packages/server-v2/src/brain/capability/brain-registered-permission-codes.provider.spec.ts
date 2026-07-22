import { loadRegisteredBrainPermissionCodes } from './brain-registered-permission-codes.provider.js';

describe('loadRegisteredBrainPermissionCodes', () => {
  it('uses the backend catalog independently from role grants', () => {
    const result = loadRegisteredBrainPermissionCodes();

    expect(result.has('core:brain:use')).toBe(true);
    expect(result.has('aura:service-record:create')).toBe(true);
    expect(result.has('*')).toBe(false);
    expect(result.has('aura:service-record:typo')).toBe(false);
  });
});
