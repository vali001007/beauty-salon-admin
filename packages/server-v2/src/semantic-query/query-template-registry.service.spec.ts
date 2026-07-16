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
    expect(registry.findByMetric('staff_service_count')?.id).toBe('staff_performance');
    expect(registry.findByMetric('staff_unique_customer_count')?.id).toBe('staff_performance');
    expect(registry.findByMetric('staff_unique_customer_count')?.sourceModels).toContain('Customer');
    expect(registry.findByMetric('staff_performance_score')?.id).toBe('staff_performance');
    expect(registry.findByMetric('campaign_conversion_rate')?.id).toBe('marketing_conversion');
  });

  it('maps P0 skill capabilities to dedicated templates without stealing generic metrics', () => {
    expect(registry.findByCapability('order_revenue_analysis')).toMatchObject({
      id: 'order_revenue',
      defaultDimensions: ['paymentMethod'],
    });
    expect(registry.findByCapability('order_customer_consumption_list')).toMatchObject({
      id: 'order_customer_consumption_list',
      defaultDimensions: ['customerId', 'customerName'],
      defaultLimit: 20,
    });
    expect(registry.findByMetric('paid_amount')?.id).toBe('order_revenue');
  });

  it('maps P1 query capabilities to controlled templates', () => {
    expect(registry.findByCapability('product_sales_ranking')?.id).toBe('product_sales');
    expect(registry.findByCapability('project_business_diagnosis')?.id).toBe('project_service');
    expect(registry.findByCapability('customer_priority_recommendation')?.id).toBe('customer_follow_up');
    expect(registry.findByCapability('inventory_risk_ranking')?.id).toBe('inventory_risk');
    expect(registry.findByCapability('reservation_schedule_diagnosis')?.id).toBe('reservation_schedule');
    expect(registry.findByCapability('staff_performance_ranking')?.id).toBe('staff_performance');
    expect(registry.findByCapability('manager_staff_overview')?.id).toBe('staff_performance');
    expect(registry.findById('project_service')?.capabilityIds).not.toContain('manager_staff_overview');
    expect(registry.findByCapability('marketing_conversion_diagnosis')?.id).toBe('marketing_conversion');
  });

  it('does not claim unsupported metrics', () => {
    expect(registry.supportsMetric('raw_sql_metric')).toBe(false);
    expect(registry.findForMetrics(['raw_sql_metric'])).toBeUndefined();
  });
});
