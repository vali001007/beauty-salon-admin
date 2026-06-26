import { AgentMemoryService } from './agent-memory.service.js';

describe('AgentMemoryService', () => {
  let prisma: any;
  let service: AgentMemoryService;

  beforeEach(() => {
    prisma = {
      agentMemory: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      agentDailyArchive: {
        findMany: jest.fn(),
        count: jest.fn(),
        upsert: jest.fn(),
      },
      agentRun: {
        findMany: jest.fn(),
      },
      agentFeedback: {
        findMany: jest.fn(),
      },
      agentToolCall: {
        findMany: jest.fn(),
      },
    };
    service = new AgentMemoryService(prisma);
  });

  it('creates store memory with bounded importance', async () => {
    prisma.agentMemory.create.mockResolvedValue({ id: 1, title: '店长偏好' });

    await service.createMemory({
      storeId: 6,
      userId: 1,
      personaCode: 'manager',
      title: '店长偏好',
      content: '日报优先看收入和退款。',
      importance: 9,
    });

    expect(prisma.agentMemory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 6,
        userId: 1,
        personaCode: 'manager',
        memoryType: 'store_preference',
        title: '店长偏好',
        content: '日报优先看收入和退款。',
        importance: 5,
        status: 'active',
      }),
    });
  });

  it('generates daily archive from runs feedback and tool calls', async () => {
    prisma.agentRun.findMany.mockResolvedValue([
      { id: 11, status: 'completed', personaCode: 'finance', userInput: '本月收入' },
      { id: 12, status: 'failed', personaCode: 'finance', userInput: '财务报告' },
    ]);
    prisma.agentFeedback.findMany.mockResolvedValue([
      { runId: 11, adopted: true },
      { runId: 12, adopted: false },
    ]);
    prisma.agentToolCall.findMany.mockResolvedValue([
      { runId: 11, toolName: 'finance.revenue.summary', status: 'success' },
      { runId: 12, toolName: 'finance.report.draft', status: 'failed' },
      { runId: 11, toolName: 'finance.revenue.summary', status: 'success' },
    ]);
    prisma.agentDailyArchive.upsert.mockResolvedValue({ id: 7 });

    await service.generateDailyArchive({ storeId: 6, personaCode: 'finance', date: '2026-06-26', createdBy: 1 });

    expect(prisma.agentDailyArchive.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          storeId: 6,
          personaCode: 'finance',
          summary: expect.stringContaining('今日共 2 次 Agent 运行'),
          metricsJson: expect.objectContaining({
            runCount: 2,
            completed: 1,
            failed: 1,
            adopted: 1,
            rejected: 1,
            topTools: expect.arrayContaining([expect.objectContaining({ name: 'finance.revenue.summary', count: 2 })]),
          }),
          risksJson: expect.arrayContaining([expect.stringContaining('1 次 Agent 运行失败')]),
          sourceRunIds: [11, 12],
        }),
      }),
    );
  });

  it('returns empty memory page when memory tables are not migrated', async () => {
    prisma.agentMemory.findMany.mockRejectedValue({ code: 'P2021', meta: { table: 'agent_memories' } });

    const result = await service.listMemories({ storeId: 6, personaCode: 'manager' });

    expect(result).toEqual(expect.objectContaining({
      items: [],
      total: 0,
      migrationPending: true,
      reason: 'agent_memory_schema_pending',
    }));
  });

  it('returns a transient archive preview when archive table is not migrated', async () => {
    prisma.agentRun.findMany.mockResolvedValue([{ id: 11, status: 'completed', personaCode: 'manager', userInput: '今日简报' }]);
    prisma.agentFeedback.findMany.mockResolvedValue([]);
    prisma.agentToolCall.findMany.mockResolvedValue([]);
    prisma.agentDailyArchive.upsert.mockRejectedValue({ code: 'P2021', meta: { table: 'agent_daily_archives' } });

    const result = await service.generateDailyArchive({ storeId: 6, personaCode: 'manager', date: '2026-06-26' });

    expect(result).toEqual(expect.objectContaining({
      id: 0,
      storeId: 6,
      personaCode: 'manager',
      status: 'migration_pending',
      summary: expect.stringContaining('暂不能持久化'),
    }));
  });
});
