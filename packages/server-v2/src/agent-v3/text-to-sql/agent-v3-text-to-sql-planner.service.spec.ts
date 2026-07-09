import { AgentV3SemanticRouterService } from './agent-v3-semantic-router.service.js';
import { AgentV3SemanticViewRegistryService } from './agent-v3-semantic-view-registry.service.js';
import { AgentV3TextToSqlPlannerService } from './agent-v3-text-to-sql-planner.service.js';

describe('AgentV3TextToSqlPlannerService', () => {
  let planner: AgentV3TextToSqlPlannerService;

  beforeEach(() => {
    const registry = new AgentV3SemanticViewRegistryService();
    planner = new AgentV3TextToSqlPlannerService(registry, new AgentV3SemanticRouterService(registry));
  });

  it('plans product sales ranking through the V3 sales semantic view', async () => {
    const plan = await planner.plan({
      question: '本月销量最好的商品',
      storeIds: [1],
      permissions: ['*'],
      roleCodes: ['manager'],
      mode: 'dry_run',
    });

    expect(plan.status).toBe('planned');
    expect(plan.selectedViews).toEqual(['agent_v3_order_item_sales_view']);
    expect(plan.generatedSql).toContain('agent_v3_order_item_sales_view');
    expect(plan.generatedSql).toContain('SUM(quantity)');
    expect(plan.intent.metric).toBe('quantity_sold');
  });

  it('plans low-stock product questions through the V3 inventory semantic view', async () => {
    const plan = await planner.plan({
      question: '库存不足的产品',
      storeIds: [1],
      permissions: ['*'],
      roleCodes: ['manager'],
      mode: 'dry_run',
    });

    expect(plan.status).toBe('planned');
    expect(plan.selectedViews).toEqual(['agent_v3_product_inventory_view']);
    expect(plan.generatedSql).toContain('agent_v3_product_inventory_view');
    expect(plan.generatedSql).toContain('current_stock <= safety_stock');
    expect(plan.generatedSql).not.toContain('SUM(quantity)');
    expect(plan.intent.domain).toBe('inventory');
    expect(plan.intent.metric).toBe('low_stock');
    expect(plan.queryIntent?.entity.type).toBe('inventory');
  });

  it('plans project popularity through the V3 project service semantic view', async () => {
    const plan = await planner.plan({
      question: '最近一个月最受欢迎的项目有哪几个',
      storeIds: [1],
      permissions: ['*'],
      roleCodes: ['manager'],
      mode: 'dry_run',
    });

    expect(plan.status).toBe('planned');
    expect(plan.selectedViews).toEqual(['agent_v3_project_service_sales_view']);
    expect(plan.generatedSql).toContain('agent_v3_project_service_sales_view');
    expect(plan.generatedSql).toContain('SUM(service_quantity)');
    expect(plan.queryIntent?.entity.type).toBe('project');
    expect(plan.queryIntent?.expectedFields).toContain('project_name');
  });

  it('allows refund analysis questions as read-only analytics', async () => {
    const plan = await planner.plan({
      question: '退款率为什么升高',
      storeIds: [1],
      permissions: ['*'],
      roleCodes: ['manager'],
      mode: 'dry_run',
    });

    expect(plan.reasonCode).not.toBe('write_intent_not_allowed');
    expect(plan.status).toBe('planned');
  });

  it('plans store operation questions through the V3 order summary semantic view', async () => {
    const plan = await planner.plan({
      question: '最近3个月门店营业情况如何',
      storeIds: [1],
      permissions: ['*'],
      roleCodes: ['manager'],
      mode: 'dry_run',
    });

    expect(plan.status).toBe('planned');
    expect(plan.selectedViews).toEqual(['agent_v3_order_summary_view']);
    expect(plan.generatedSql).toContain('agent_v3_order_summary_view');
    expect(plan.intent.metric).toBe('paid_amount');
  });

  it('blocks explicit refund actions', async () => {
    const plan = await planner.plan({
      question: '帮我给这些客户办理退款',
      storeIds: [1],
      permissions: ['*'],
      roleCodes: ['manager'],
      mode: 'dry_run',
    });

    expect(plan.status).toBe('unable_to_plan');
    expect(plan.reasonCode).toBe('write_intent_not_allowed');
  });
});
