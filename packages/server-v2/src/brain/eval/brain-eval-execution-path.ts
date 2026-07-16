export type BrainEvalExecutionPath =
  | 'exact_contract_fast_path'
  | 'governed_contract_fallback'
  | 'model_primary'
  | 'model_unavailable'
  | 'rules'
  | 'unknown';

export function resolveBrainEvalExecutionPath(value: unknown): BrainEvalExecutionPath {
  const output = record(value);
  const model = stringValue(output.model);
  const provider = stringValue(output.provider);
  const cognitionMode = stringValue(output.cognitionMode);
  const failureCode = stringValue(output.failureCode);

  if (model === 'exact_example_fast_path') return 'exact_contract_fast_path';
  if (model === 'exact_example_fallback' || provider === 'governed_contract') {
    return 'governed_contract_fallback';
  }
  if (cognitionMode === 'rules') return 'rules';
  if (cognitionMode === 'model' && (provider || model)) return 'model_primary';
  if (cognitionMode === 'model' || failureCode?.startsWith('MODEL_') || failureCode === 'PROVIDER_UNAVAILABLE') {
    return 'model_unavailable';
  }
  return 'unknown';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
