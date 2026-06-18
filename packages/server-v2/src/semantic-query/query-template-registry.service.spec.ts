import { QueryTemplateRegistryService } from './query-template-registry.service.js';

describe('QueryTemplateRegistryService', () => {
  const registry = new QueryTemplateRegistryService();

  it('maps first-batch metrics to controlled query templates', () => {
    expect(registry.findByMetric('paid_amount')?.id).toBe('order_revenue');
    expect(registry.findByMetric('product_sales_quantity')?.id).toBe('product_sales');
    expect(registry.findByMetric('project_service_count')?.id).toBe('project_service');
    expect(registry.findByMetric('follow_up_priority_score')?.id).toBe('customer_follow_up');
    expect(registry.findByMetric('stock_risk_score')?.id).toBe('inventory_risk');
    expect(registry.findByMetric('card_expiry_risk')?.id).toBe('card_expiry');
    expect(registry.findByMetric('staff_performance_score')?.id).toBe('staff_performance');
    expect(registry.findByMetric('campaign_conversion_rate')?.id).toBe('marketing_conversion');
  });

  it('does not claim unsupported metrics', () => {
    expect(registry.supportsMetric('raw_sql_metric')).toBe(false);
    expect(registry.findForMetrics(['raw_sql_metric'])).toBeUndefined();
  });
});
