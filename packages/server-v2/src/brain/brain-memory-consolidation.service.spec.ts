import { BrainMemoryConsolidationService } from './memory/brain-memory-consolidation.service.js';

describe('BrainMemoryConsolidationService', () => {
  it('uses configurable evidence thresholds instead of one fixed phrase rule', () => {
    const service = new BrainMemoryConsolidationService();
    const result = service.consolidate(
      [
        { subjectKey: 'store.event.repeat', content: { value: 'A' } },
        { subjectKey: 'store.event.repeat', content: { value: 'B' } },
      ],
      [
        {
          sourceSubjectKey: 'store.event.repeat',
          targetSubjectKey: 'store.profile.repeat',
          minEvidence: 2,
          confidence: 0.8,
          project: (events) => ({ count: events.length }),
        },
      ],
    );

    expect(result).toEqual([
      expect.objectContaining({
        subjectKey: 'store.profile.repeat',
        content: { count: 2 },
        confidence: 0.8,
        evidence: [{ value: 'A' }, { value: 'B' }],
      }),
    ]);
  });
});
