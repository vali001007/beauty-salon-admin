import { AgentV2TextToSqlCandidateService } from './agent-v2-text-to-sql-candidate.service.js';
import { AgentV2SemanticViewRegistryService } from './agent-v2-semantic-view-registry.service.js';

describe('AgentV2TextToSqlCandidateService', () => {
  const runs = [
    run({ id: 1, status: 'success', question: '本月销量最好的商品', isUseful: true }),
    run({ id: 2, status: 'dry_run', question: '最近30天销量最高的商品' }),
    run({ id: 3, status: 'blocked', question: '谁的手机号最全', selectedViewsJson: ['agent_v2_customer_profile_summary_view'], blockedReason: 'sensitive_field_selected' }),
  ];
  const prisma = {
    agentV2TextToSqlRun: {
      findMany: jest.fn().mockResolvedValue(runs),
      findUnique: jest.fn().mockResolvedValue(runs[0]),
    },
    agentCapabilityDraft: {
      upsert: jest.fn().mockResolvedValue({ capabilityId: 'sales.product-ranking.metric', status: 'draft' }),
    },
  } as any;
  const service = new AgentV2TextToSqlCandidateService(prisma, new AgentV2SemanticViewRegistryService());

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.agentV2TextToSqlRun.findMany.mockResolvedValue(runs);
    prisma.agentV2TextToSqlRun.findUnique.mockResolvedValue(runs[0]);
  });

  it('clusters successful Text-to-SQL runs into capability candidates and blocked reports', async () => {
    const candidates = await service.listCandidates();
    const sales = candidates.find((item) => item.suggestedCapabilityId === 'sales.product-ranking.metric');
    const blocked = candidates.find((item) => item.status === 'blocked_report');

    expect(sales).toMatchObject({
      status: 'candidate',
      selectedViews: ['agent_v2_order_item_sales_view'],
      hitCount: 2,
      successCount: 2,
      suggestedCapabilityId: 'sales.product-ranking.metric',
    });
    expect(blocked).toMatchObject({
      status: 'blocked_report',
      blockedCount: 1,
    });
  });

  it('promotes a candidate into draft status without bypassing governance', async () => {
    const candidates = await service.listCandidates();
    const sales = candidates.find((item) => item.suggestedCapabilityId === 'sales.product-ranking.metric');
    expect(sales).toBeTruthy();

    await service.promoteToDraft({ clusterKey: sales!.clusterKey, requestedBy: 1 });

    expect(prisma.agentCapabilityDraft.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { capabilityId: 'sales.product-ranking.metric' },
      create: expect.objectContaining({
        capabilityId: 'sales.product-ranking.metric',
        status: 'draft',
        source: 'text_to_sql_candidate',
        releaseStrategy: 'approval_required',
        permissionSource: 'semantic_view_registry',
        permissionCodes: ['core:order:view', 'core:product:view'],
        storeScope: 'store_id',
        fieldPoliciesJson: expect.arrayContaining([
          expect.objectContaining({
            field: 'product_name',
            policy: 'allow',
            sourceView: 'agent_v2_order_item_sales_view',
          }),
        ]),
        executorJson: expect.objectContaining({
          selectedViews: ['agent_v2_order_item_sales_view'],
          fieldPolicies: expect.arrayContaining([
            expect.objectContaining({ field: 'product_name', policy: 'allow' }),
          ]),
          viewDescriptions: [expect.objectContaining({
            viewName: 'agent_v2_order_item_sales_view',
            defaultTimeField: 'order_created_at',
            storeScopeField: 'store_id',
          })],
        }),
      }),
      update: expect.objectContaining({
        status: 'draft',
        source: 'text_to_sql_candidate',
        permissionCodes: ['core:order:view', 'core:product:view'],
        fieldPoliciesJson: expect.arrayContaining([
          expect.objectContaining({ field: 'product_name', policy: 'allow' }),
        ]),
      }),
    }));
  });

  it('promotes a successful audit run into the matching draft candidate', async () => {
    await service.promoteRunToDraft({ runId: 1, requestedBy: 9 });

    expect(prisma.agentV2TextToSqlRun.findUnique).toHaveBeenCalledWith({
      where: { id: 1 },
      include: { feedback: true },
    });
    expect(prisma.agentCapabilityDraft.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { capabilityId: 'sales.product-ranking.metric' },
      create: expect.objectContaining({
        status: 'draft',
        source: 'text_to_sql_candidate',
        governanceIssues: [expect.objectContaining({ requestedBy: 9 })],
      }),
    }));
  });

  it('does not promote blocked audit runs', async () => {
    prisma.agentV2TextToSqlRun.findUnique.mockResolvedValue(run({
      id: 4,
      status: 'blocked',
      question: '查询所有客户手机号',
      selectedViewsJson: ['agent_v2_customer_profile_summary_view'],
    }));

    await expect(service.promoteRunToDraft({ runId: 4 })).rejects.toThrow('Only successful Text-to-SQL runs can be promoted');
  });
});

function run(input: {
  id: number;
  status: string;
  question: string;
  selectedViewsJson?: string[];
  blockedReason?: string;
  isUseful?: boolean;
}) {
  const selectedViewsJson = input.selectedViewsJson ?? ['agent_v2_order_item_sales_view'];
  return {
    id: input.id,
    question: input.question,
    normalizedIntentJson: { domain: selectedViewsJson.includes('agent_v2_order_item_sales_view') ? 'product' : 'customer', type: 'ranking' },
    selectedViewsJson,
    safeSqlHash: selectedViewsJson.join('-hash'),
    generatedSqlHash: selectedViewsJson.join('-generated'),
    status: input.status,
    blockedReason: input.blockedReason ?? null,
    feedback: input.isUseful === undefined ? [] : [{ isUseful: input.isUseful }],
    createdAt: new Date(),
  };
}
