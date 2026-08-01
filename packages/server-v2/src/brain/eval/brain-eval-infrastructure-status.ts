export function isBrainProviderUnavailableOutput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const failureCode = String(record.failureCode ?? '');
  const diagnosticCode = String(record.diagnosticCode ?? '');
  return failureCode === 'MODEL_INTENT_UNAVAILABLE' ||
    failureCode === 'MODEL_CATALOG_UNAVAILABLE' ||
    failureCode === 'PROVIDER_UNAVAILABLE' ||
    failureCode === 'PROVIDER_AUTH_FAILED' ||
    (failureCode === 'CAPABILITY_EXECUTION_FAILED' &&
      [
        'TIMEOUT_EXCEEDED_WHEN_TRYING_TO_CONNECT',
        'CONNECTION_TERMINATED_UNEXPECTEDLY',
        'CONNECTION_TIMEOUT',
        'CONNECT_TIMEOUT',
        'ECONNRESET',
        'ETIMEDOUT',
      ].includes(diagnosticCode));
}

export class BrainEvalProviderFailureBreaker {
  private consecutiveFailures = 0;

  constructor(private readonly threshold: number) {
    if (!Number.isInteger(threshold) || threshold < 1) throw new Error('provider_failure_threshold_invalid');
  }

  observe(status: string) {
    this.consecutiveFailures = status === 'provider_unavailable' ? this.consecutiveFailures + 1 : 0;
    return this.isOpen();
  }

  isOpen() {
    return this.consecutiveFailures >= this.threshold;
  }

  count() {
    return this.consecutiveFailures;
  }
}
