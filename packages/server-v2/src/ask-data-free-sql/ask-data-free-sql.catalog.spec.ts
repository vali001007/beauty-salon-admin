import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASK_DATA_FREE_SQL_VIEWS } from './ask-data-free-sql.catalog.js';

describe('Ask Data Free SQL catalog and independence', () => {
  it('registers 37 governed views with store and permission policies', () => {
    expect(ASK_DATA_FREE_SQL_VIEWS).toHaveLength(37);
    expect(new Set(ASK_DATA_FREE_SQL_VIEWS.map((view) => view.viewName)).size).toBe(37);
    for (const view of ASK_DATA_FREE_SQL_VIEWS) {
      expect(view.requiredPermissions.length).toBeGreaterThan(0);
      expect(view.storeScopeField).toBe('store_id');
      expect(view.fields.some((field) => field.name === 'store_id')).toBe(true);
      expect(view.keywords?.length).toBeGreaterThan(0);
      expect(view.dataPolicy?.length).toBeGreaterThan(0);
      expect(view.defaultTimeField || view.requiresTimeScope === false).toBeTruthy();
    }
  });

  it('registers item contribution margin without exposing order or customer internals', () => {
    const view = ASK_DATA_FREE_SQL_VIEWS.find((item) => item.viewName === 'ask_data_item_margin_view');
    expect(view?.requiredPermissions).toEqual(['core:operation-profit:view']);
    expect(view?.defaultTimeField).toBe('event_at');
    expect(view?.allowJoin).toBe(false);
    expect(view?.dataPolicy).toContain('贡献毛利');
    expect(view?.dataPolicy).toContain('不等同已确认月结利润');
    expect(view?.fields.map((field) => field.name)).toEqual(expect.arrayContaining([
      'event_id',
      'event_type',
      'event_at',
      'item_type',
      'item_id',
      'item_name',
      'net_revenue',
      'attributed_cost',
      'contribution_margin',
      'contribution_margin_rate',
      'cost_basis',
      'is_estimated_cost',
      'cost_completeness',
    ]));
    expect(view?.fields.map((field) => field.name)).not.toEqual(expect.arrayContaining([
      'customer_id',
      'customer_name',
      'phone',
      'remark',
      'refund_reason',
      'items',
    ]));
  });

  it('registers approved supplier quote terms without sensitive supplier fields', () => {
    const view = ASK_DATA_FREE_SQL_VIEWS.find((item) => item.viewName === 'ask_data_supplier_quote_terms_view');
    expect(view?.requiredPermissions).toEqual(['core:supply:view']);
    expect(view?.requiresTimeScope).toBe(false);
    expect(view?.fields.map((field) => field.name)).toEqual(expect.arrayContaining([
      'product_id',
      'supplier_id',
      'quote_price',
      'minimum_order_quantity',
      'payment_terms',
      'lowest_current_quote_price',
    ]));
    expect(view?.fields.map((field) => field.name)).not.toEqual(expect.arrayContaining([
      'phone',
      'email',
      'contact_name',
      'reviewed_by',
      'reject_reason',
    ]));
  });

  it('registers inventory turnover as operational and estimated facts only', () => {
    const view = ASK_DATA_FREE_SQL_VIEWS.find((item) => item.viewName === 'ask_data_inventory_turnover_view');
    expect(view?.requiredPermissions).toEqual(['core:inventory:stock']);
    expect(view?.requiresTimeScope).toBe(false);
    expect(view?.dataPolicy).toContain('不等同于财务库存周转率');
    expect(view?.dataPolicy).toContain('商品档案成本估算');
    expect(view?.dataPolicy).toContain('不生成补货建议');
    expect(view?.fields.map((field) => field.name)).not.toEqual(
      expect.arrayContaining(['remark', 'items', 'supplier_contract', 'opened_at']),
    );
  });

  it('keeps sensitive customer fields outside the queryable field surface', () => {
    const customerProfile = ASK_DATA_FREE_SQL_VIEWS.find(
      (view) => view.viewName === 'ask_data_customer_profile_summary_view',
    );
    expect(customerProfile?.fields.map((field) => field.name)).not.toEqual(
      expect.arrayContaining(['phone', 'phone_last4', 'tags_summary', 'health_profile']),
    );

    const feedback = ASK_DATA_FREE_SQL_VIEWS.find((view) => view.viewName === 'ask_data_customer_feedback_view');
    expect(feedback?.fields.map((field) => field.name)).not.toEqual(
      expect.arrayContaining(['content', 'resolution_note', 'phone', 'source_channel']),
    );
  });

  it('uses current management permissions instead of retired Agent permission keys', () => {
    const permissions = ASK_DATA_FREE_SQL_VIEWS.flatMap((view) => view.requiredPermissions);
    expect(permissions).not.toEqual(
      expect.arrayContaining(['core:card:view', 'core:schedule:view', 'core:service:view']),
    );
  });

  it('does not import Brain or Agent runtime modules', () => {
    const files = [
      'ask-data-free-sql.service.ts',
      'ask-data-free-sql.module.ts',
      'ask-data-free-sql.controller.ts',
      'ask-data-free-sql-view-selector.ts',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(__dirname, file), 'utf8');
      expect(source).not.toMatch(/from ['"].*\/brain\//);
      expect(source).not.toMatch(/from ['"].*\/agent-v\d\//);
      expect(source).not.toContain('BrainRelease');
      expect(source).not.toContain('AgentV3SemanticViewRegistryService');
    }
  });
});
