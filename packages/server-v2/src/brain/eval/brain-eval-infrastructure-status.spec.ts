import {
  BrainEvalProviderFailureBreaker,
  isBrainProviderUnavailableOutput,
} from './brain-eval-infrastructure-status.js';

describe('Ami Brain evaluation infrastructure status', () => {
  it.each(['MODEL_INTENT_UNAVAILABLE', 'PROVIDER_UNAVAILABLE', 'PROVIDER_AUTH_FAILED'])(
    'classifies %s outside product failures',
    (failureCode) => {
      expect(isBrainProviderUnavailableOutput({ failureCode })).toBe(true);
    },
  );

  it('opens only after consecutive provider failures and resets after a product result', () => {
    const breaker = new BrainEvalProviderFailureBreaker(3);
    expect(breaker.observe('provider_unavailable')).toBe(false);
    expect(breaker.observe('metric_failed')).toBe(false);
    expect(breaker.count()).toBe(0);
    expect(breaker.observe('provider_unavailable')).toBe(false);
    expect(breaker.observe('provider_unavailable')).toBe(false);
    expect(breaker.observe('provider_unavailable')).toBe(true);
    expect(breaker.count()).toBe(3);
  });
});
