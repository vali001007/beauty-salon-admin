import { AgentWorkflowRuntimeService } from './agent-workflow-runtime.service.js';

describe('AgentWorkflowRuntimeService', () => {
  let prisma: any;
  let service: AgentWorkflowRuntimeService;

  beforeEach(() => {
    prisma = {
      agentRun: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      agentToolCall: {
        findMany: jest.fn(),
      },
      agentApproval: {
        findMany: jest.fn(),
      },
    };
    service = new AgentWorkflowRuntimeService(prisma);
  });

  it('returns slim run list records without large json snapshots', async () => {
    const createdAt = new Date('2026-06-27T10:00:00.000Z');
    prisma.agentRun.findMany.mockResolvedValue([
      {
        id: 155,
        runNo: 'ar_test',
        storeId: 6,
        userId: 1,
        deviceId: 0,
        role: 'manager',
        entrypoint: 'terminal:kiosk',
        agentCode: 'business_operations',
        personaCode: 'manager',
        status: 'completed',
        userInput: '昨天有哪些消费的客户，列出清单',
        errorMessage: null,
        startedAt: createdAt,
        completedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      },
    ]);
    prisma.agentRun.count.mockResolvedValue(1);
    prisma.agentToolCall.findMany.mockResolvedValue([{ runId: 155 }]);
    prisma.agentApproval.findMany.mockResolvedValue([]);

    const result = await service.findRuns({ entrypoint: 'terminal:kiosk', page: 1, pageSize: 20 });

    expect(prisma.agentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entrypoint: 'terminal:kiosk' },
        take: 20,
        select: expect.objectContaining({
          id: true,
          runNo: true,
          entrypoint: true,
          userInput: true,
          status: true,
        }),
      }),
    );
    expect(prisma.agentRun.findMany.mock.calls[0][0].select).not.toHaveProperty('planJson');
    expect(prisma.agentRun.findMany.mock.calls[0][0].select).not.toHaveProperty('resultJson');
    expect(prisma.agentRun.findMany.mock.calls[0][0].select).not.toHaveProperty('contextJson');
    expect(prisma.agentRun.findMany.mock.calls[0][0].select).not.toHaveProperty('evidenceJson');
    expect(result.items[0]).toMatchObject({
      id: 155,
      entrypoint: 'terminal:kiosk',
      toolCallCount: 1,
      approvalCount: 0,
    });
  });
});
