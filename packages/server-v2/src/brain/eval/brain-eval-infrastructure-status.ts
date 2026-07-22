export function isBrainProviderUnavailableOutput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const failureCode = String((value as Record<string, unknown>).failureCode ?? '');
  return failureCode === 'MODEL_INTENT_UNAVAILABLE' ||
    failureCode === 'MODEL_CATALOG_UNAVAILABLE' ||
    failureCode === 'PROVIDER_UNAVAILABLE' ||
    failureCode === 'PROVIDER_AUTH_FAILED';
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
