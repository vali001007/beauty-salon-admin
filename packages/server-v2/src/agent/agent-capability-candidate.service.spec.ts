import { AgentCapabilityCandidateService } from './agent-capability-candidate.service.js';

describe('AgentCapabilityCandidateService', () => {
  let prisma: jest.Mocked<any>;
  let service: AgentCapabilityCandidateService;

  beforeEach(() => {
    prisma = {
      agentRun: {
        findMany: jest.fn(),
      },
      agentToolCall: {
        findMany: jest.fn(),
      },
    };
    service = new AgentCapabilityCandidateService(prisma);
  });

  it('aggregates repeated business query fallback runs into capability candidates', async () => {
    const now = new Date();
    prisma.agentRun.findMany.mockResolvedValue([
      {
        id: 1,
        runNo: 'ar_1',
        storeId: 1,
        userInput: '哪些客户适合办卡',
        status: 'completed',
        createdAt: now,
        planJson: {
          businessTask: { domain: 'customer', taskType: 'recommendation', metrics: ['card_purchase_opportunity'] },
          capabilityPlan: { capabilityId: 'business_query' },
          semanticSqlCandidate: { fallbackCapability: undefined },
        },
      },
      {
        id: 2,
        runNo: 'ar_2',
        storeId: 1,
        userInput: '有哪些客户适合办卡',
        status: 'completed',
        createdAt: now,
        planJson: {
          businessTask: { domain: 'customer', taskType: 'recommendation', metrics: ['card_purchase_opportunity'] },
          capabilityPlan: { capabilityId: 'business_query' },
          semanticSqlCandidate: { fallbackCapability: undefined },
        },
      },
      {
        id: 3,
        runNo: 'ar_3',
        storeId: 1,
        userInput: '近30天毛利怎么样',
        status: 'completed',
        createdAt: now,
        planJson: {
          businessTask: { domain: 'finance', taskType: 'query', metrics: ['gross_margin'] },
          capabilityPlan: { capabilityId: 'finance_margin_diagnosis' },
          semanticSqlCandidate: { fallbackCapability: 'finance_margin_diagnosis' },
        },
      },
    ]);
    prisma.agentToolCall.findMany.mockResolvedValue([
      { runId: 1, toolName: 'business.query.ask', status: 'unsupported', resultJson: { status: 'unsupported' } },
      { runId: 2, toolName: 'business.query.ask', status: 'success', resultJson: { status: 'success' } },
      { runId: 3, toolName: 'finance.margin.diagnose', status: 'success', resultJson: { status: 'success' } },
    ]);

    const result = await service.listCandidates({ storeId: 1, days: 30, minCount: 2, limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      domain: 'customer',
      taskType: 'recommendation',
      metrics: ['card_purchase_opportunity'],
      count: 2,
      businessQueryCount: 2,
      unsupportedCount: 1,
      candidateCapabilityId: 'customer_card_purchase_opportunity_recommendation',
    });
    expect(result.items[0].examples).toHaveLength(2);
    expect(result.evidence).toMatchObject({
      source: ['AgentRun', 'AgentToolCall'],
      sampleSize: 3,
    });
  });

  it('keeps single unsupported run as a candidate even below min count', async () => {
    prisma.agentRun.findMany.mockResolvedValue([
      {
        id: 4,
        runNo: 'ar_4',
        storeId: 1,
        userInput: '某个奇怪问题',
        status: 'completed',
        createdAt: new Date(),
        planJson: {
          businessTask: { domain: 'store', taskType: 'query', metrics: [] },
          capabilityPlan: { capabilityId: 'business_query' },
          semanticSqlCandidate: {},
        },
      },
    ]);
    prisma.agentToolCall.findMany.mockResolvedValue([
      { runId: 4, toolName: 'business.query.ask', status: 'unsupported', resultJson: { status: 'unsupported' } },
    ]);

    const result = await service.listCandidates({ storeId: 1, minCount: 3 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      count: 1,
      unsupportedCount: 1,
      businessQueryCount: 1,
    });
  });
});
