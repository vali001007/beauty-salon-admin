import {
  BrainEvalProviderFailureBreaker,
  isBrainProviderUnavailableOutput,
} from './brain-eval-infrastructure-status.js';

describe('Ami Brain evaluation infrastructure status', () => {
  it.each([
    'MODEL_INTENT_UNAVAILABLE',
    'MODEL_CATALOG_UNAVAILABLE',
    'PROVIDER_UNAVAILABLE',
    'PROVIDER_AUTH_FAILED',
  ])(
    'classifies %s outside product failures',
    (failureCode) => {
      expect(isBrainProviderUnavailableOutput({ failureCode })).toBe(true);
    },
  );

  it.each([
    'TIMEOUT_EXCEEDED_WHEN_TRYING_TO_CONNECT',
    'CONNECTION_TERMINATED_UNEXPECTEDLY',
    'CONNECTION_TIMEOUT',
    'CONNECT_TIMEOUT',
    'ECONNRESET',
    'ETIMEDOUT',
  ])('classifies the infrastructure diagnostic %s outside product failures', (diagnosticCode) => {
    expect(isBrainProviderUnavailableOutput({
      failureCode: 'CAPABILITY_EXECUTION_FAILED',
      diagnosticCode,
    })).toBe(true);
  });

  it('does not hide an ordinary capability execution failure as infrastructure unavailable', () => {
    expect(isBrainProviderUnavailableOutput({
      failureCode: 'CAPABILITY_EXECUTION_FAILED',
      diagnosticCode: 'BRAIN_RESPONSE_ANSWER_CONTRACT_MISMATCH',
    })).toBe(false);
  });

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
