import { ActionOntologyService } from './action-ontology.service.js';
import { CapabilityCatalogService } from './capability-catalog.service.js';
import { EntityResolverService } from './entity-resolver.service.js';
import { UnifiedQueryPlannerService } from './unified-query-planner.service.js';
import type { BusinessQueryRole } from '../../business-query/business-query.types.js';

describe('Agent entrypoint planner consistency', () => {
  let prisma: jest.Mocked<any>;
  let planner: UnifiedQueryPlannerService;

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
    planner = new UnifiedQueryPlannerService(
      new EntityResolverService(prisma),
      new CapabilityCatalogService(new ActionOntologyService()),
    );
  });

  it.each([
    {
      question: '老朋友回店护理礼活动链接发我',
      role: 'manager',
      capabilityId: 'marketing.activity.link.lookup',
      businessCapabilityId: 'marketing_activity_link_lookup',
      fixture: 'marketingActivity',
    },
    {
      question: '推荐近期营销活动',
      role: 'manager',
      capabilityId: 'marketing.activity.list',
      businessCapabilityId: 'marketing_activity_list',
    },
    {
      question: '请列出10个需要紧急召回的客户',
      role: 'manager',
      capabilityId: 'marketing.customer.recall.list',
      businessCapabilityId: 'customer_growth_opportunity',
    },
    {
      question: '这个月营业额',
      role: 'manager',
      capabilityId: 'finance.revenue.summary',
      businessCapabilityId: 'order_revenue_analysis',
    },
    {
      question: '近期有哪些临期库存产品',
      role: 'manager',
      capabilityId: 'inventory.expiring.list',
      businessCapabilityId: 'inventory_alert',
    },
    {
      question: '今天有哪些预约',
      role: 'manager',
      capabilityId: 'reception.reservation.today.list',
      businessCapabilityId: 'reservation_today',
    },
  ] as const)(
    'returns the same planner result for Kiosk and management entrypoints: $question',
    async ({ question, role, capabilityId, businessCapabilityId, fixture }) => {
      if (fixture === 'marketingActivity') {
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
      }

      const decisions = await Promise.all(
        ['terminal:kiosk', 'ami-agent:auto'].map(async (entrypoint) => ({
          entrypoint,
          decision: await planner.planBusinessQuery({
            question,
            storeId: 1,
            role: role as BusinessQueryRole,
          }),
        })),
      );

      expect(decisions).toEqual(
        decisions.map(({ entrypoint }) => ({
          entrypoint,
          decision: expect.objectContaining({
            status: 'planned',
            businessCapabilityId,
            trace: expect.objectContaining({
              capabilityId,
              executionPath: 'knowledge_graph',
              parserVersion: 'unified-query-planner-v1',
            }),
          }),
        })),
      );
      expect(new Set(decisions.map(({ decision }) => decision.trace.capabilityId)).size).toBe(1);
      expect(new Set(decisions.map(({ decision }) => decision.businessCapabilityId)).size).toBe(1);
    },
  );
});
