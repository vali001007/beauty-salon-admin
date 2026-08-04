export function isHealthyHttpStatus(status) {
  return Number.isInteger(status) && status >= 200 && status < 300;
}

export function describeApiHealthFailure(result) {
  if (result?.reachable) return `HTTP ${result.status ?? 'unknown'}`;
  const error = result?.error;
  return error
    ? `${error.code || error.name || 'ERROR'} ${error.message || ''}`.trim()
    : 'unknown error';
}

export function shouldRecycleManagedApi(input) {
  return Boolean(
    input.managed &&
      input.running &&
      input.consecutiveFailures >= input.restartAfterFailures,
  );
}
