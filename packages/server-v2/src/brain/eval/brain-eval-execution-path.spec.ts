import { resolveBrainEvalExecutionPath } from './brain-eval-execution-path.js';

describe('resolveBrainEvalExecutionPath', () => {
  it.each([
    [{ model: 'exact_example_fast_path', provider: 'governed_contract', cognitionMode: 'model' }, 'exact_contract_fast_path'],
    [{ model: 'exact_example_fallback', provider: 'governed_contract', cognitionMode: 'model' }, 'governed_contract_fallback'],
    [{ model: 'gpt-5.6-terra', provider: 'openai_responses', cognitionMode: 'model' }, 'model_primary'],
    [{ cognitionMode: 'model', failureCode: 'MODEL_INTENT_UNAVAILABLE' }, 'model_unavailable'],
    [{ failureCode: 'PROVIDER_AUTH_FAILED' }, 'model_unavailable'],
    [{ cognitionMode: 'rules' }, 'rules'],
    [{}, 'unknown'],
  ] as const)('maps %j to %s', (output, expected) => {
    expect(resolveBrainEvalExecutionPath(output)).toBe(expected);
  });
});
