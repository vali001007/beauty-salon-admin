import { AgentObservabilityService } from './agent-observability.service.js';

describe('AgentObservabilityService', () => {
  let prisma: any;
  let service: AgentObservabilityService;

  beforeEach(() => {
    prisma = {
      agentRun: {
        findMany: jest.fn(),
      },
      agentFeedback: {
        findMany: jest.fn(),
      },
      agentToolCall: {
        findMany: jest.fn(),
      },
      agentEvalRun: {
        findMany: jest.fn(),
      },
    };
    service = new AgentObservabilityService(prisma);
  });

  it('builds quality report from runs feedback tools and eval runs', async () => {
    prisma.agentRun.findMany.mockResolvedValue([
      { id: 1, status: 'completed', personaCode: 'finance', role: 'manager' },
      { id: 2, status: 'failed', personaCode: 'inventory', role: 'manager' },
    ]);
    prisma.agentFeedback.findMany.mockResolvedValue([
      { runId: 1, rating: 5, adopted: true, comment: '有用' },
      { runId: 2, rating: 1, adopted: false, comment: '答非所问' },
    ]);
    prisma.agentToolCall.findMany.mockResolvedValue([
      { runId: 1, toolName: 'finance.report.draft', status: 'success', latencyMs: 1200 },
      { runId: 2, toolName: 'inventory.consumption.trend', status: 'failed', latencyMs: 6200 },
    ]);
    prisma.agentEvalRun.findMany.mockResolvedValue([
      { id: 1, status: 'passed', score: 1 },
      { id: 2, status: 'failed', score: 0.2 },
    ]);

    const result = await service.getQualityReport({ storeId: 6, days: 7 });

    expect(result.kpis).toMatchObject({
      runCount: 2,
      completed: 1,
      failed: 1,
      feedbackCount: 2,
      adopted: 1,
      rejected: 1,
      evalRunCount: 2,
      evalPassed: 1,
    });
    expect(result.personaBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'finance', runCount: 1, completed: 1 }),
        expect.objectContaining({ name: 'inventory', runCount: 1, failed: 1 }),
      ]),
    );
    expect(result.toolBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: 'inventory.consumption.trend', failed: 1 }),
      ]),
    );
    expect(result.recentNegativeFeedback[0]).toMatchObject({ comment: '答非所问' });
    expect(result.recommendations).toEqual(expect.arrayContaining([expect.stringContaining('失败')]));
  });
});
