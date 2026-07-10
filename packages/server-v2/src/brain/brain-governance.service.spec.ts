import { BrainEvalService } from './governance/brain-eval.service.js';

describe('BrainEvalService', () => {
  it('blocks release when deterministic regression fails', () => {
    const service = new BrainEvalService({} as never);
    const summary = service.summarizeResults([
      { caseKey: 'sem_001', passed: true },
      { caseKey: 'permission_001', passed: false },
    ]);

    expect(summary.canRelease).toBe(false);
    expect(summary.failed).toBe(1);
  });
});
