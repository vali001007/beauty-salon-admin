import { statusForLayerFailure } from './brain-eval-status.js';

const passedLayer = {
  layer: 'intent',
  passed: true,
  score: 1,
  checked: 1,
  failures: [],
  deterministicFailure: false,
} as const;

describe('statusForLayerFailure', () => {
  it('keeps an honest unsupported answer unsupported even when intent validation also fails', () => {
    expect(
      statusForLayerFailure(
        { intent: { ...passedLayer, passed: false }, tool: passedLayer, plan: passedLayer, execution: passedLayer, completion: passedLayer, answer: { ...passedLayer, passed: false } } as never,
        'unsupported_intent',
      ),
    ).toBe('unsupported_intent');
  });

  it('marks a grounded-looking answer as a false positive when semantic intent mismatches', () => {
    expect(
      statusForLayerFailure(
        { intent: { ...passedLayer, passed: false }, tool: passedLayer, plan: passedLayer, execution: passedLayer, completion: passedLayer, answer: passedLayer } as never,
        'usable_exact',
      ),
    ).toBe('false_positive_intent_mismatch');
  });
});
