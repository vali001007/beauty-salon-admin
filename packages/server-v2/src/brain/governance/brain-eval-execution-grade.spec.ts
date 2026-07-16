import { gradeBrainEvalExecution } from './brain-eval.service.js';

describe('gradeBrainEvalExecution', () => {
  it('accepts grounded no-data when the governed completion result is complete', () => {
    expect(gradeBrainEvalExecution('completed', [{
      status: 'no_data',
      grounding: 'db_skill',
      citationCount: 1,
    }], { status: 'complete' })).toMatchObject({ passed: true, failures: [] });
  });

  it('rejects ungrounded or incomplete no-data results', () => {
    expect(gradeBrainEvalExecution('completed', [{
      status: 'no_data',
      grounding: 'none',
      citationCount: 0,
    }], { status: 'complete' })).toMatchObject({
      passed: false,
      failures: ['execution_status:no_data'],
    });
    expect(gradeBrainEvalExecution('completed', [{
      status: 'no_data',
      grounding: 'db_skill',
      citationCount: 1,
    }], { status: 'incomplete' })).toMatchObject({
      passed: false,
      failures: ['execution_status:no_data'],
    });
  });
});
