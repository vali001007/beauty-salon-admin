import { AskDataClarificationPolicy } from './ask-data-clarification-policy.js';
import { ASK_DATA_FREE_SQL_VIEWS } from './ask-data-free-sql.catalog.js';
import { authorizedAskDataViews } from './ask-data-free-sql-view-selector.js';
import { AskDataIntentParser } from './ask-data-intent-parser.js';
import { AskDataSemanticRouter } from './ask-data-semantic-router.js';

type MatrixRole = {
  name: string;
  permissions: string[];
  expectedViews: string[];
  forbiddenViews: string[];
  question?: string;
  expectedMetric?: string;
  expectedCandidate?: string;
};

const matrix: MatrixRole[] = [
  {
    name: '管理员',
    permissions: ['*'],
    expectedViews: ASK_DATA_FREE_SQL_VIEWS.map((view) => view.viewName),
    forbiddenViews: [],
    question: '最近30天营销ROI最高的渠道是什么？',
    expectedMetric: 'marketing_roi',
    expectedCandidate: 'ask_data_marketing_roi_view',
  },
  {
    name: '财务',
    permissions: [
      'core:dashboard:view',
      'core:finance:view',
      'core:operation-cost:view',
      'core:operation-profit:view',
      'core:prepaid-liability:view',
    ],
    expectedViews: [
      'agent_v3_order_summary_view',
      'agent_v3_payment_refund_view',
      'agent_v3_daily_settlement_view',
      'agent_v3_customer_balance_view',
      'ask_data_operating_cost_view',
      'ask_data_confirmed_profit_view',
      'ask_data_item_margin_view',
      'ask_data_reconciliation_issue_view',
      'ask_data_member_liability_view',
    ],
    forbiddenViews: ['ask_data_marketing_roi_view', 'ask_data_transfer_status_view'],
    question: '本月营业利润是多少？',
    expectedMetric: 'confirmed_profit',
    expectedCandidate: 'ask_data_confirmed_profit_view',
  },
  {
    name: '营销',
    permissions: ['core:dashboard:view', 'core:marketing:view', 'core:marketing:analytics'],
    expectedViews: [
      'agent_v3_marketing_conversion_view',
      'agent_v3_marketing_activity_view',
      'agent_v3_marketing_automation_view',
      'agent_v3_promotion_offer_view',
      'ask_data_marketing_roi_view',
    ],
    forbiddenViews: ['agent_v3_payment_refund_view', 'ask_data_customer_lifecycle_view'],
    question: '最近30天营销ROI最高的渠道是什么？',
    expectedMetric: 'marketing_roi',
    expectedCandidate: 'ask_data_marketing_roi_view',
  },
  {
    name: '库存供应',
    permissions: [
      'core:dashboard:view',
      'core:inventory:products',
      'core:inventory:stock',
      'core:inventory:consumption',
      'core:inventory:purchase',
      'core:inventory:transfer',
      'core:supply:view',
    ],
    expectedViews: [
      'agent_v3_product_inventory_view',
      'ask_data_inventory_turnover_view',
      'agent_v3_stock_movement_view',
      'agent_v3_inventory_scrap_view',
      'agent_v3_purchase_procurement_view',
      'agent_v3_supplier_performance_view',
      'ask_data_supplier_quote_terms_view',
      'ask_data_transfer_status_view',
      'ask_data_bom_consumption_variance_view',
    ],
    forbiddenViews: ['ask_data_confirmed_profit_view', 'ask_data_customer_feedback_view'],
    question: '帮我比较同一商品的供应商报价？',
    expectedMetric: 'supplier_price_comparison',
    expectedCandidate: 'ask_data_supplier_quote_terms_view',
  },
  {
    name: '店务排班',
    permissions: [
      'core:dashboard:view',
      'core:store:reservations',
      'core:store:scheduling',
      'core:store:scheduling:gap:view',
      'core:store:projects',
    ],
    expectedViews: [
      'agent_v3_reservation_view',
      'agent_v3_service_quality_view',
      'agent_v3_appointment_gap_view',
      'agent_v3_project_catalog_view',
      'ask_data_staff_capacity_view',
    ],
    forbiddenViews: ['agent_v3_payment_refund_view', 'ask_data_marketing_roi_view'],
    question: '未来7天哪些员工空闲时间最多？',
    expectedMetric: 'staff_capacity',
    expectedCandidate: 'ask_data_staff_capacity_view',
  },
  {
    name: '客户服务',
    permissions: ['core:dashboard:view', 'core:customer:view'],
    expectedViews: [
      'ask_data_customer_profile_summary_view',
      'ask_data_customer_feedback_view',
      'ask_data_customer_lifecycle_view',
    ],
    forbiddenViews: ['agent_v3_customer_balance_view', 'agent_v3_payment_refund_view'],
    question: '当前高价值客户有哪些？',
    expectedMetric: 'customer_lifecycle',
    expectedCandidate: 'ask_data_customer_lifecycle_view',
  },
  {
    name: '仅看板',
    permissions: ['core:dashboard:view'],
    expectedViews: [],
    forbiddenViews: ['agent_v3_order_summary_view', 'ask_data_customer_lifecycle_view', 'ask_data_marketing_roi_view'],
  },
];

describe('Ami Ask eight-class permission contract matrix', () => {
  const parser = new AskDataIntentParser();
  const policy = new AskDataClarificationPolicy();

  it.each(matrix)('$name only receives its governed catalog scope', ({ permissions, expectedViews, forbiddenViews }) => {
    const visible = authorizedAskDataViews({ permissions, deniedPermissions: [] }).map((view) => view.viewName);
    expect(new Set(visible)).toEqual(new Set(expectedViews));
    for (const forbidden of forbiddenViews) expect(visible).not.toContain(forbidden);
  });

  it.each(matrix.filter((role) => role.question))(
    '$name routes a permitted question without exposing another domain',
    async ({ permissions, question, expectedMetric, expectedCandidate }) => {
      const ai = { generateStructured: jest.fn() };
      const router = new AskDataSemanticRouter(ai as any, parser, policy);
      const authorizedViews = authorizedAskDataViews({ permissions, deniedPermissions: [] });
      const result = await router.route({
        question: question!,
        context: { userId: 1, storeId: 6, permissions, deniedPermissions: [] },
        authorizedViews,
        config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
      });

      expect(result.permissionDenied).toBe(false);
      expect(result.semanticIntent.metricKeys).toContain(expectedMetric);
      expect(result.candidateViews.map((view) => view.viewName)).toContain(expectedCandidate);
      expect(result.candidateViews.every((view) => authorizedViews.includes(view))).toBe(true);
    },
  );

  it('only-board users get an explicit permission denial before any model call', async () => {
    const permissions = ['core:dashboard:view'];
    const ai = { generateStructured: jest.fn() };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question: '本月营业利润是多少？',
      context: { userId: 7, storeId: 6, permissions, deniedPermissions: [] },
      authorizedViews: authorizedAskDataViews({ permissions, deniedPermissions: [] }),
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });

    expect(result.permissionDenied).toBe(true);
    expect(result.candidateViews).toEqual([]);
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('deniedPermissions wins over wildcard permission', () => {
    const visible = authorizedAskDataViews({ permissions: ['*'], deniedPermissions: ['core:finance:view'] })
      .map((view) => view.viewName);
    expect(visible).not.toContain('agent_v3_order_summary_view');
    expect(visible).not.toContain('agent_v3_payment_refund_view');
    expect(visible).not.toContain('ask_data_reconciliation_issue_view');
    expect(visible).toContain('ask_data_marketing_roi_view');
  });
});
