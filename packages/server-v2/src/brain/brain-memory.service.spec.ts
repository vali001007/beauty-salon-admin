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

  it('extracts stable preferences but refuses volatile operating values', () => {
    const service = new BrainMemoryService({} as never);

    expect(service.extractMemoryCandidates('请记住，以后默认先看客户复购趋势')).toEqual([
      expect.objectContaining({ type: 'procedural', subjectKey: 'user.preference.general' }),
    ]);
    expect(service.extractMemoryCandidates('请记住，本月流水是 128000')).toEqual([]);
    expect(service.extractMemoryCandidates('请记住，客户李女士手机号 13800138000')).toEqual([]);
    expect(service.extractMemoryCandidates('请记住，李女士身份证号 440301199001011234')).toEqual([]);
  });

  it('replaces conflicting memory and records a revision', async () => {
    const repository = {
      findLatestIdentity: jest.fn().mockResolvedValue({
        id: 1,
        storeId: 6,
        userId: 9,
        type: 'procedural',
        subjectKey: 'user.preference.general',
        content: { preference: '先看流水' },
        confidence: 0.7,
      }),
      writeMemory: jest.fn().mockResolvedValue({ id: 2, content: { preference: '先看复购' } }),
      updateMemory: jest.fn().mockResolvedValue({ id: 1, deletedAt: new Date() }),
      createRevision: jest.fn().mockResolvedValue({ id: 1 }),
    };
    const service = new BrainMemoryService(repository as never);

    await service.persistCandidates({ storeId: 6, userId: 9, runId: 10, text: '请记住，以后默认先看复购' });

    expect(repository.updateMemory).toHaveBeenCalledWith(1, { deletedAt: expect.any(Date) });
    expect(repository.createRevision).toHaveBeenCalledWith(
      expect.objectContaining({ memoryId: 2, previousMemoryId: 1, revisionType: 'conflict_replaced' }),
    );
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
