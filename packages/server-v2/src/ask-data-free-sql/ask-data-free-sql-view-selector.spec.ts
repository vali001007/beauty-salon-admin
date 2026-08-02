import { ASK_DATA_FREE_SQL_VIEWS } from './ask-data-free-sql.catalog.js';
import { authorizedAskDataViews, selectAskDataViews } from './ask-data-free-sql-view-selector.js';

describe('Ask Data view selector', () => {
  it('filters the catalog with the same any/all and denied permission semantics as the guard', () => {
    const views = authorizedAskDataViews({
      permissions: ['core:dashboard:view', 'core:inventory:purchase'],
      deniedPermissions: [],
    });
    expect(views.some((view) => view.viewName === 'agent_v3_purchase_procurement_view')).toBe(true);
    expect(views.some((view) => view.viewName === 'ask_data_marketing_roi_view')).toBe(false);

    const denied = authorizedAskDataViews({
      permissions: ['core:inventory:purchase', 'core:supply:view'],
      deniedPermissions: ['core:inventory:purchase'],
    });
    expect(denied.some((view) => view.viewName === 'agent_v3_purchase_procurement_view')).toBe(false);
  });

  it('selects a bounded Ask-only candidate set for a domain-specific question', () => {
    const selected = selectAskDataViews(
      '最近30天哪些项目的 BOM 实际消耗偏差超过20%？',
      { permissions: ['*'], deniedPermissions: [] },
    );
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.length).toBeLessThanOrEqual(8);
    expect(selected[0]?.viewName).toBe('ask_data_bom_consumption_variance_view');
  });

  it('keeps explicit denied permissions ahead of wildcard grants', () => {
    const views = authorizedAskDataViews({
      permissions: ['*'],
      deniedPermissions: ['core:finance:view'],
    });
    expect(views.some((view) => view.viewName === 'agent_v3_daily_settlement_view')).toBe(false);
    expect(views.some((view) => view.viewName === 'agent_v3_product_inventory_view')).toBe(true);
  });

  it('returns no candidates when the question clearly targets an unauthorized domain', () => {
    const selected = selectAskDataViews('本月营业额、退款和净收分别是多少？', {
      permissions: ['core:dashboard:view', 'core:store:scheduling'],
      deniedPermissions: [],
    });

    expect(selected).toEqual([]);
  });

  it.each([
    {
      role: '管理员',
      permissions: ['*'],
      deniedPermissions: [],
      visible: ['ask_data_confirmed_profit_view', 'ask_data_marketing_roi_view'],
      hidden: [],
      count: 34,
    },
    {
      role: '财务',
      permissions: [
        'core:dashboard:view',
        'core:finance:view',
        'core:operation-profit:view',
        'core:operation-cost:view',
        'core:prepaid-liability:view',
      ],
      deniedPermissions: [],
      visible: ['agent_v3_daily_settlement_view', 'ask_data_confirmed_profit_view', 'ask_data_member_liability_view'],
      hidden: ['ask_data_marketing_roi_view'],
    },
    {
      role: '营销',
      permissions: ['core:dashboard:view', 'core:marketing:view', 'core:marketing:analytics'],
      deniedPermissions: [],
      visible: ['agent_v3_marketing_activity_view', 'ask_data_marketing_roi_view'],
      hidden: ['ask_data_confirmed_profit_view'],
    },
    {
      role: '库存供应',
      permissions: [
        'core:dashboard:view',
        'core:inventory:products',
        'core:inventory:stock',
        'core:inventory:consumption',
        'core:inventory:purchase',
        'core:inventory:transfer',
        'core:supply:view',
      ],
      deniedPermissions: [],
      visible: ['agent_v3_product_inventory_view', 'ask_data_transfer_status_view', 'ask_data_bom_consumption_variance_view'],
      hidden: ['ask_data_customer_feedback_view'],
    },
    {
      role: '店务排班',
      permissions: [
        'core:dashboard:view',
        'core:store:scheduling',
        'core:store:scheduling:gap:view',
        'core:store:reservations',
        'core:store:beauticians',
        'core:beautician-performance:view',
      ],
      deniedPermissions: [],
      visible: ['ask_data_staff_capacity_view', 'agent_v3_appointment_gap_view', 'agent_v3_service_quality_view'],
      hidden: ['ask_data_reconciliation_issue_view'],
    },
    {
      role: '客户服务',
      permissions: ['core:dashboard:view', 'core:customer:view', 'core:store:reservations'],
      deniedPermissions: [],
      visible: ['ask_data_customer_feedback_view', 'ask_data_customer_lifecycle_view', 'agent_v3_service_quality_view'],
      hidden: ['agent_v3_customer_balance_view'],
    },
    {
      role: '仅看板',
      permissions: ['core:dashboard:view'],
      deniedPermissions: [],
      visible: [],
      hidden: ['agent_v3_order_summary_view', 'ask_data_staff_capacity_view'],
      count: 0,
    },
    {
      role: '显式拒绝优先',
      permissions: ['*'],
      deniedPermissions: ['core:finance:view'],
      visible: ['ask_data_marketing_roi_view'],
      hidden: ['agent_v3_order_summary_view', 'ask_data_reconciliation_issue_view'],
    },
  ])('filters the catalog for the $role permission profile', ({ permissions, deniedPermissions, visible, hidden, count }) => {
    const selected = authorizedAskDataViews({ permissions, deniedPermissions });
    const names = selected.map((view) => view.viewName);

    if (count !== undefined) expect(selected).toHaveLength(count);
    expect(names).toEqual(expect.arrayContaining(visible));
    if (hidden.length > 0) expect(names).not.toEqual(expect.arrayContaining(hidden));
  });

  it.each([
    ['最近三个月员工业绩排行？', 'ask_data_staff_performance_view'],
    ['当前价格最高的项目有哪些？', 'agent_v3_project_catalog_view'],
  ])('routes management wording to the intended semantic view: %s', (question, expectedView) => {
    const selected = selectAskDataViews(question, { permissions: ['*'], deniedPermissions: [] });
    expect(selected[0]?.viewName).toBe(expectedView);
  });

  it('keeps the selector independent from Agent and Brain runtime registries', () => {
    expect(ASK_DATA_FREE_SQL_VIEWS).toHaveLength(34);
  });
});
