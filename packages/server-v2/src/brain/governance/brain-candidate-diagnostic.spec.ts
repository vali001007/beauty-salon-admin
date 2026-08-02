import { candidateDiagnosticPassed } from './brain-candidate-diagnostic.js';

describe('Ami Brain candidate diagnostic', () => {
  it('passes only when every requested candidate run completes', () => {
    expect(candidateDiagnosticPassed([{ status: 'completed' }, { status: 'completed' }])).toBe(true);
    expect(candidateDiagnosticPassed([{ status: 'completed' }, { status: 'failed' }])).toBe(false);
    expect(candidateDiagnosticPassed([])).toBe(false);
  });
});
