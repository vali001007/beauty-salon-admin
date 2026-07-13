import { AgentV2SemanticViewRegistryService } from './agent-v2-semantic-view-registry.service.js';
import { AgentV2TextToSqlPlannerService } from './agent-v2-text-to-sql-planner.service.js';

describe('AgentV2TextToSqlPlannerService', () => {
  const planner = new AgentV2TextToSqlPlannerService(new AgentV2SemanticViewRegistryService());

  it('plans product ranking without exposing raw schema', () => {
    const plan = planner.plan({
      question: '本月销量最好的商品',
      storeIds: [1],
      roleCodes: ['manager'],
      permissions: ['core:order:view', 'core:product:view'],
      mode: 'dry_run',
    });

    expect(plan.status).toBe('planned');
    expect(plan.selectedViews).toEqual(['agent_v2_order_item_sales_view']);
    expect(plan.generatedSql).toContain('agent_v2_order_item_sales_view');
    expect(plan.generatedSql).not.toMatch(/\bupdate\b|\bdelete\b|\bdrop\b|\*/i);
  });

  it.each([
    ['本月销量最好的商品', 'ORDER BY quantity_sold DESC, net_sales_amount DESC'],
    ['本月热销商品排行', 'ORDER BY quantity_sold DESC, net_sales_amount DESC'],
    ['本月卖得最好的商品有哪些', 'ORDER BY quantity_sold DESC, net_sales_amount DESC'],
    ['最近30天销售额最高的商品', 'ORDER BY net_sales_amount DESC, quantity_sold DESC'],
    ['本月商品销售金额排行', 'ORDER BY net_sales_amount DESC, quantity_sold DESC'],
  ])('keeps product sales wording on the sales view with the right metric order: %s', (question, orderBy) => {
    const plan = planner.plan({
      question,
      storeIds: [1],
      roleCodes: ['manager'],
      permissions: ['core:order:view', 'core:product:view'],
      mode: 'dry_run',
    });

    expect(plan.status).toBe('planned');
    expect(plan.selectedViews).toEqual(['agent_v2_order_item_sales_view']);
    expect(plan.generatedSql).toContain('agent_v2_order_item_sales_view');
    expect(plan.generatedSql).toContain(orderBy);
    expect(plan.generatedSql).not.toContain('agent_v2_product_inventory_view');
  });

  it.each([
    {
      question: '最近30天报废最多的产品有哪些',
      permissions: ['core:inventory:view', 'core:product:view'],
      selectedView: 'agent_v2_inventory_scrap_view',
      sqlIncludes: ['SUM(scrap_quantity)', 'ORDER BY scrap_quantity DESC'],
    },
    {
      question: '上个月营业额和本月相比怎么样',
      permissions: ['core:order:view'],
      selectedView: 'agent_v2_order_summary_view',
      sqlIncludes: ['SUM(paid_amount)', 'SUM(net_amount)'],
    },
    {
      question: '哪个员工客单价最高',
      permissions: ['core:staff:view', 'core:finance:view'],
      selectedView: 'agent_v2_staff_performance_view',
      sqlIncludes: ['AVG(average_order_amount)', 'ORDER BY average_order_amount DESC'],
    },
    {
      question: '高消费客户最近复购下降的是谁',
      permissions: ['core:customer:view'],
      selectedView: 'agent_v2_customer_profile_summary_view',
      sqlIncludes: ['total_paid_amount', 'last_order_at ASC NULLS FIRST'],
    },
  ])('plans acceptance question: $question', ({ question, permissions, selectedView, sqlIncludes }) => {
    const plan = planner.plan({
      question,
      storeIds: [1],
      roleCodes: ['manager'],
      permissions,
      mode: 'dry_run',
    });

    expect(plan.status).toBe('planned');
    expect(plan.selectedViews).toEqual([selectedView]);
    for (const expected of sqlIncludes) {
      expect(plan.generatedSql).toContain(expected);
    }
    expect(plan.generatedSql).not.toMatch(/\bupdate\b|\bdelete\b|\bdrop\b|\*/i);
  });

  it('returns unable_to_plan when no enabled semantic view is available', () => {
    const plan = planner.plan({
      question: '把库存为0的商品删除',
      storeIds: [1],
      roleCodes: ['manager'],
      permissions: ['core:inventory:view'],
      mode: 'dry_run',
    });

    expect(plan.status).toBe('unable_to_plan');
    expect(plan.reasonCode).toBeTruthy();
  });
});
