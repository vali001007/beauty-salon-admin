import { BrainMemoryService } from './memory/brain-memory.service.js';

describe('BrainMemoryService', () => {
  it('keeps volatile numbers out of long-term memory extraction', () => {
    const service = new BrainMemoryService({} as never);
    const extracted = service.extractMemoryCandidates('本月流水是 128000，以后先看毛利再看流水');

    expect(extracted).toEqual([
      expect.objectContaining({
        type: 'procedural',
        scope: 'user',
        subjectKey: 'user.preference.metric_order',
        content: expect.objectContaining({ preference: '先看毛利再看流水', source: 'explicit_user_instruction' }),
        confidence: 0.9,
        expiresAt: expect.any(Date),
      }),
    ]);
  });

  it('extracts stable preferences but refuses volatile operating values', () => {
    const service = new BrainMemoryService({} as never);

    expect(service.extractMemoryCandidates('请记住，以后默认先看客户复购趋势')).toEqual([
      expect.objectContaining({ type: 'procedural', scope: 'user', subjectKey: 'user.preference.metric_order' }),
    ]);
    expect(service.extractMemoryCandidates('请记住，本月流水是 128000')).toEqual([]);
    expect(service.extractMemoryCandidates('请记住，客户李女士手机号 13800138000')).toEqual([]);
    expect(service.extractMemoryCandidates('请记住，李女士身份证号 440301199001011234')).toEqual([]);
  });

  it('does not turn ordinary questions or unverified customer claims into long-term facts', () => {
    const service = new BrainMemoryService({} as never);

    expect(service.extractMemoryCandidates('先确定她的皮肤问题，怎么办')).toEqual([]);
    expect(service.extractMemoryCandidates('客户李女士喜欢做补水护理')).toEqual([]);
    expect(service.extractMemoryCandidates('我决定下个月做活动')).toEqual([]);
  });

  it('keeps stable numeric preferences and does not duplicate an explicit decision as a preference', () => {
    const service = new BrainMemoryService({} as never);

    expect(service.extractMemoryCandidates('以后默认展示前10名')).toEqual([
      expect.objectContaining({
        type: 'procedural',
        scope: 'user',
        content: expect.objectContaining({ preference: '展示前10名' }),
      }),
    ]);
    expect(service.extractMemoryCandidates('请记住我们决定每周一做经营复盘')).toEqual([
      expect.objectContaining({
        type: 'episodic',
        content: expect.objectContaining({ decision: '每周一做经营复盘' }),
      }),
    ]);
  });

  it('marks explicit store defaults as store scope and rejects them without governance permission', async () => {
    const service = new BrainMemoryService({} as never);
    expect(service.extractMemoryCandidates('请记住，全店以后默认先看毛利再看流水')).toEqual([
      expect.objectContaining({ scope: 'store', subjectKey: 'store.preference.metric_order' }),
    ]);

    await expect(service.applyUserInstruction({
      storeId: 6,
      userId: 9,
      runId: 10,
      text: '请记住，全店以后默认先看毛利再看流水',
      allowStoreScope: false,
    })).resolves.toMatchObject({ action: 'rejected', memories: [] });
  });

  it('replaces conflicting memory and records a revision', async () => {
    const repository = {
      findLatestIdentity: jest.fn().mockResolvedValue({
        id: 1,
        storeId: 6,
        userId: 9,
        type: 'procedural',
        subjectKey: 'user.preference.metric_order',
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

  it('lets a user list and forget personal preferences through natural language', async () => {
    const memory = {
      id: 3,
      storeId: 6,
      userId: 9,
      type: 'procedural',
      subjectKey: 'user.preference.answer_style',
      content: { preference: '先说结论' },
      confidence: 0.9,
      sourceRunId: 10,
      updatedAt: new Date('2026-07-21T00:00:00.000Z'),
      expiresAt: null,
      deletedAt: null,
    };
    const repository = {
      findRelevantMemories: jest.fn().mockResolvedValue([memory]),
      findActiveByPrefixes: jest.fn().mockResolvedValue([memory]),
      updateMemory: jest.fn().mockResolvedValue({ ...memory, deletedAt: new Date() }),
      createRevision: jest.fn().mockResolvedValue({ id: 1 }),
    };
    const service = new BrainMemoryService(repository as never);

    await expect(service.applyUserInstruction({ storeId: 6, userId: 9, runId: 11, text: '你记得我什么' }))
      .resolves.toMatchObject({ action: 'listed', message: expect.stringContaining('先说结论') });
    await expect(service.applyUserInstruction({ storeId: 6, userId: 9, runId: 12, text: '忘记我的偏好' }))
      .resolves.toMatchObject({ action: 'forgotten', memories: [memory] });
    expect(repository.createRevision).toHaveBeenCalledWith(expect.objectContaining({ revisionType: 'user_forgotten' }));
  });

  it('prioritizes user correction over a store default when injecting planning memory', async () => {
    const repository = {
      findRelevantMemories: jest.fn().mockResolvedValue([
        {
          id: 1, storeId: 6, userId: null, type: 'procedural', subjectKey: 'store.preference.answer_style',
          content: { preference: '详细说明' }, confidence: 0.95, sourceRunId: 7,
          updatedAt: new Date('2026-07-21T01:00:00.000Z'), expiresAt: null, deletedAt: null,
        },
        {
          id: 2, storeId: 6, userId: 9, type: 'procedural', subjectKey: 'user.preference.answer_style',
          content: { preference: '先说结论' }, confidence: 0.9, sourceRunId: 8,
          updatedAt: new Date('2026-07-20T01:00:00.000Z'), expiresAt: null, deletedAt: null,
        },
      ]),
    };
    const service = new BrainMemoryService(repository as never);

    const result = await service.retrieveForPlanning({ storeId: 6, userId: 9, question: '按我的习惯回答' });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 2, scope: 'user', content: { preference: '先说结论' } });
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
