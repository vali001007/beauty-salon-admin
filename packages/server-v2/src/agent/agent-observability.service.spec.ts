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
      agentEvalCase: {
        createMany: jest.fn(),
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

  it('groups negative feedback by skill and imports failures as eval draft cases', async () => {
    prisma.agentRun.findMany.mockResolvedValue([
      {
        id: 11,
        role: 'manager',
        personaCode: 'inventory',
        userInput: '哪些商品库存不足',
        planJson: {
          skillPlan: { skillId: 'inventory.supply.risk', capabilityId: 'inventory_supply_risk' },
          toolPlan: [{ tool: 'inventory.risk.rank' }],
        },
        resultJson: { answer: '库存不足清单', traceSummary: { skillId: 'inventory.supply.risk', capabilityId: 'inventory_supply_risk' } },
        createdAt: new Date('2026-06-27T08:00:00.000Z'),
      },
      {
        id: 12,
        role: 'manager',
        personaCode: 'finance',
        userInput: '为什么利润下降',
        planJson: {
          skillPlan: { skillId: 'finance.profit.risk', capabilityId: 'finance_profit_diagnosis' },
          toolPlan: [{ tool: 'finance.revenue.summary' }, { tool: 'finance.profit.diagnose' }],
        },
        resultJson: { answer: '利润诊断', traceSummary: { skillId: 'finance.profit.risk', capabilityId: 'finance_profit_diagnosis' } },
        createdAt: new Date('2026-06-27T09:00:00.000Z'),
      },
    ]);
    prisma.agentFeedback.findMany.mockResolvedValue([
      {
        id: 101,
        runId: 11,
        rating: 1,
        adopted: false,
        comment: '答非所问',
        businessActionJson: {
          snapshot: {
            question: '哪些商品库存不足',
            answer: '库存不足清单',
            skillId: 'inventory.supply.risk',
            capabilityId: 'inventory_supply_risk',
            toolNames: ['inventory.risk.rank'],
          },
        },
        createdAt: new Date('2026-06-27T08:05:00.000Z'),
      },
      {
        id: 102,
        runId: 12,
        rating: 5,
        adopted: true,
        comment: '有用',
        businessActionJson: {},
        createdAt: new Date('2026-06-27T09:05:00.000Z'),
      },
    ]);
    prisma.agentEvalCase.createMany.mockResolvedValue({ count: 1 });

    const report = await service.getFeedbackFailureReport({ storeId: 6, days: 7 });
    expect(report.kpis).toMatchObject({ negativeFeedbackCount: 1, affectedSkillCount: 1 });
    expect(report.bySkill[0]).toMatchObject({ skillId: 'inventory.supply.risk', count: 1 });
    expect(report.items[0]).toMatchObject({
      feedbackId: 101,
      runId: 11,
      question: '哪些商品库存不足',
      skillId: 'inventory.supply.risk',
      toolNames: ['inventory.risk.rank'],
    });

    const imported = await service.importFeedbackFailuresToEvalCases({ storeId: 6, days: 7 });
    expect(imported.created).toBe(1);
    expect(prisma.agentEvalCase.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          scenario: 'feedback_failure:inventory.supply.risk',
          input: '哪些商品库存不足',
          role: 'manager',
          expectedTool: 'inventory.risk.rank',
          status: 'draft',
        }),
      ],
    });
  });
});
