import { BrainMarketingCampaignCapabilityExecutor } from './brain-marketing-campaign-capability.executor.js';

describe('BrainMarketingCampaignCapabilityExecutor', () => {
  it('returns an editable campaign plan without publishing or sending anything', async () => {
    const skillRuntime = {
      draftCampaignPlan: jest.fn().mockReturnValue('母亲节活动方案：\n1. 目标客群：老客。'),
    };
    const executor = new BrainMarketingCampaignCapabilityExecutor(skillRuntime as never);

    const result = await executor.execute({
      card: {
        key: 'marketing_campaign_plan',
        version: 1,
        name: '营销活动方案草稿',
        description: '生成活动方案草稿',
        domains: ['customer', 'project'],
        intents: ['draft'],
        riskLevel: 'low',
        readOnly: true,
        sideEffect: false,
        grounding: 'domain_service',
        requiredPermissions: ['core:brain:use', 'core:marketing:create'],
        allowedRoles: ['marketing'],
        requiresConfirmation: false,
        idempotency: 'not_applicable',
        timeoutMs: 10_000,
        definitionRefs: [],
        examples: [],
        negativeExamples: [],
        synonyms: [],
        inputSchema: {},
        outputSchema: {},
        successSchema: {},
        sourceFingerprint: 'a'.repeat(64),
      },
      context: {
        userId: 9,
        storeId: 6,
        visibleStoreIds: [6],
        roles: ['marketing'],
        permissions: ['*'],
        deniedPermissions: [],
        requestId: 'marketing-campaign-plan-test',
        timezone: 'Asia/Shanghai',
      },
      runId: 11,
      question: '为母亲节设计一套门店促销活动',
      answerShape: 'draft',
      args: {
        objective: '生成活动方案',
        entities: [],
        metrics: [],
        dimensions: [],
        filters: [],
        orderBy: [],
      },
    });

    expect(skillRuntime.draftCampaignPlan).toHaveBeenCalledWith({
      theme: '围绕“为母亲节设计一套门店促销活动”',
    });
    expect(result).toMatchObject({
      status: 'completed',
      grounding: 'template_skill',
      metadata: { capabilityKey: 'marketing_campaign_plan', deliveryStatus: 'draft_only' },
    });
    expect(result.blocks).toEqual([
      expect.objectContaining({ kind: 'text' }),
      expect.objectContaining({ kind: 'limitations' }),
    ]);
    expect(result.suggestedActions).toBeUndefined();
  });
});
