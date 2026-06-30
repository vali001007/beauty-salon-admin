import { ActionOntologyService } from './action-ontology.service.js';
import { CapabilityCatalogService } from './capability-catalog.service.js';
import { EntityResolverService } from './entity-resolver.service.js';
import { UnifiedQueryPlannerService } from './unified-query-planner.service.js';

describe('UnifiedQueryPlannerService', () => {
  let prisma: jest.Mocked<any>;
  let service: UnifiedQueryPlannerService;

  beforeEach(() => {
    prisma = {
      marketingPage: { findMany: jest.fn().mockResolvedValue([]) },
      marketingActivity: { findMany: jest.fn().mockResolvedValue([]) },
      customer: { findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      project: { findMany: jest.fn().mockResolvedValue([]) },
      beautician: { findMany: jest.fn().mockResolvedValue([]) },
      productOrder: { findMany: jest.fn().mockResolvedValue([]) },
      customerCard: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new UnifiedQueryPlannerService(
      new EntityResolverService(prisma),
      new CapabilityCatalogService(new ActionOntologyService()),
    );
  });

  it('plans marketing activity link with entity, action and capability trace', async () => {
    prisma.marketingPage.findMany.mockResolvedValue([
      {
        id: 11,
        activityId: 7,
        title: '老朋友回店护理礼',
        shareUrl: 'https://example.com/old-friend',
        status: 'published',
        storeId: 1,
      },
    ]);
    prisma.marketingActivity.findMany.mockResolvedValue([
      { id: 7, title: '老朋友回店护理礼', status: 'active', publishStatus: 'published' },
    ]);

    const decision = await service.planBusinessQuery({
      question: '老朋友回店护理礼活动链接发我',
      storeId: 1,
      role: 'manager',
    });

    expect(decision.status).toBe('planned');
    expect(decision.businessCapabilityId).toBe('marketing_activity_link_lookup');
    expect(decision.trace).toEqual(
      expect.objectContaining({
        parserVersion: 'unified-query-planner-v1',
        actionIntent: 'get_link',
        capabilityId: 'marketing.activity.link.lookup',
        executionPath: 'knowledge_graph',
        fallbackReason: null,
        schemaPath: expect.arrayContaining(['MarketingActivity']),
      }),
    );
    expect(decision.trace.entityMatches[0]).toMatchObject({
      objectType: 'MarketingActivity',
      displayName: '老朋友回店护理礼',
    });
  });

  it('returns clarify when required entity has multiple candidates', async () => {
    prisma.marketingActivity.findMany.mockResolvedValue([
      { id: 7, title: '老朋友回店护理礼', status: 'active', publishStatus: 'published' },
      { id: 8, title: '老朋友回店礼', status: 'active', publishStatus: 'published' },
    ]);

    const decision = await service.planBusinessQuery({
      question: '回店礼活动链接发我',
      storeId: 1,
      role: 'manager',
    });

    expect(decision.status).toBe('clarify');
    expect(decision.trace.executionPath).toBe('clarify');
    expect(decision.entityResolution.status).toBe('ambiguous');
  });

  it('falls back with a reason when confidence is below threshold', async () => {
    const decision = await service.planBusinessQuery({
      question: '帮我写一首诗',
      storeId: 1,
      role: 'manager',
    });

    expect(decision.status).toBe('fallback');
    expect(decision.fallbackReason).toBe('capability_not_found');
    expect(decision.trace.executionPath).toBe('legacy_fallback');
  });

  it('blocks finance profit capabilities when the current role is not allowed', async () => {
    const decision = await service.planBusinessQuery({
      question: '本月利润为什么下降',
      storeId: 1,
      role: 'reception',
    });

    expect(decision.status).toBe('fallback');
    expect(decision.businessCapabilityId).toBe('finance_cashflow_summary');
    expect(decision.fallbackReason).toBe('business_query_role_not_allowed');
    expect(decision.trace).toEqual(
      expect.objectContaining({
        capabilityId: 'finance.profit.diagnosis',
        executionPath: 'legacy_fallback',
        fallbackReason: 'business_query_role_not_allowed',
      }),
    );
  });
});
