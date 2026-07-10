import { BrainMemoryService } from './memory/brain-memory.service.js';

describe('BrainMemoryService', () => {
  it('keeps volatile numbers out of long-term memory extraction', () => {
    const service = new BrainMemoryService({} as never);
    const extracted = service.extractMemoryCandidates('本月流水是 128000，以后先看毛利再看流水');

    expect(extracted).toEqual([
      {
        type: 'procedural',
        subjectKey: 'store.preference.metric_order',
        content: { preference: '先看毛利再看流水' },
        confidence: 0.8,
      },
    ]);
  });

  it('asks one merged clarification when entity candidates conflict', () => {
    const service = new BrainMemoryService({} as never);
    const clarification = service.buildClarification([
      { slot: 'beautician', candidates: ['张丽（3号店）', '张敏（5号店）'] },
      { slot: 'metric', candidates: ['项目业绩', '销售业绩'] },
    ]);

    expect(clarification.question).toContain('张丽（3号店）');
    expect(clarification.question).toContain('项目业绩');
  });
});
