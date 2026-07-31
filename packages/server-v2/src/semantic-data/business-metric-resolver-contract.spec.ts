import type { BusinessMetricRuntimeQuery } from '../brain/cognition/business-definition-snapshot.types.js';
import { evaluateBusinessMetricResolver } from './business-metric-resolver-contract.js';

describe('business metric resolver runtime', () => {
  const storeScope: BusinessMetricRuntimeQuery['storeScope'] = {
    mode: 'current_store',
    anchorModel: 'Beautician',
    model: 'Beautician',
    field: 'storeId',
    joinPath: [],
  };

  it('evaluates staff scores with the shared resolver contract', () => {
    const result = evaluateBusinessMetricResolver({
      metricKey: 'staff_performance_score',
      resolver: {
        kind: 'domain_service',
        key: 'manager_staff_analysis',
        dimensionFields: { beauticianId: 'beauticianId', beauticianName: 'name' },
        expression: {
          op: 'add',
          operands: [
            { op: 'field', field: 'serviceCount' },
            { op: 'field', field: 'repeatCustomerCount' },
          ],
        },
        overallAggregation: 'avg',
      },
      dimensions: ['beauticianId', 'beauticianName'],
      outputField: 'staff_performance_score',
      sourceModels: ['Beautician', 'ServiceTask', 'CommissionRecord', 'BeauticianTimeOff'],
      storeScope,
      rows: [
        { beauticianId: 1, name: '王美容师', serviceCount: 6, repeatCustomerCount: 2 },
        { beauticianId: 2, name: '李美容师', serviceCount: 3, repeatCustomerCount: 1 },
      ],
    });

    expect(result.groups).toEqual([
      { dimensions: { beauticianId: 1, beauticianName: '王美容师' }, value: 8 },
      { dimensions: { beauticianId: 2, beauticianName: '李美容师' }, value: 4 },
    ]);
    expect(result.overallValue).toBe(6);
  });

  it('rejects resolver expressions that read undeclared fields', () => {
    expect(() =>
      evaluateBusinessMetricResolver({
        metricKey: 'staff_performance_score',
        resolver: {
          kind: 'domain_service',
          key: 'manager_staff_analysis',
          dimensionFields: { beauticianId: 'beauticianId', beauticianName: 'name' },
          expression: { op: 'field', field: 'passwordHash' },
          overallAggregation: 'avg',
        },
        dimensions: ['beauticianId', 'beauticianName'],
        outputField: 'staff_performance_score',
        sourceModels: ['Beautician'],
        storeScope,
        rows: [],
      }),
    ).toThrow('semantic_resolver_numeric_field_not_allowed:manager_staff_analysis:passwordHash');
  });

  it('evaluates customer unit price from the shared manager operations row', () => {
    const result = evaluateBusinessMetricResolver({
      metricKey: 'average_order_value',
      resolver: {
        kind: 'domain_service',
        key: 'manager_operations_analysis',
        dimensionFields: {},
        expression: { op: 'field', field: 'avgTransaction' },
        overallAggregation: 'avg',
      },
      dimensions: [],
      outputField: 'average_order_value',
      sourceModels: ['ProductOrder', 'PaymentRecord'],
      storeScope: {
        mode: 'current_store',
        anchorModel: 'ProductOrder',
        model: 'ProductOrder',
        field: 'storeId',
        joinPath: [],
      },
      rows: [{ revenue: 1200, orderCount: 4, customerCount: 4, avgTransaction: 300 }],
    });

    expect(result.overallValue).toBe(300);
  });

  it('evaluates material cost rate from the shared finance cost row', () => {
    const result = evaluateBusinessMetricResolver({
      metricKey: 'material_cost_rate',
      resolver: {
        kind: 'domain_service',
        key: 'finance_settlement_cost_analysis',
        dimensionFields: {},
        expression: {
          op: 'divide',
          numerator: { op: 'field', field: 'materialCost' },
          denominator: { op: 'field', field: 'revenue' },
          zero: 'zero',
        },
        overallAggregation: 'avg',
      },
      dimensions: [],
      outputField: 'material_cost_rate',
      sourceModels: ['DailySettlement', 'OperatingCost', 'CommissionRecord'],
      storeScope: {
        mode: 'current_store',
        anchorModel: 'DailySettlement',
        model: 'DailySettlement',
        field: 'storeId',
        joinPath: [],
      },
      rows: [{ revenue: 1000, materialCost: 240 }],
    });

    expect(result.overallValue).toBe(0.24);
  });

  it('keeps the historical ProductOrder material cost resolver compatible', () => {
    const result = evaluateBusinessMetricResolver({
      metricKey: 'material_cost_rate',
      resolver: {
        kind: 'domain_service',
        key: 'finance_cost_analysis',
        dimensionFields: {},
        expression: {
          op: 'divide',
          numerator: { op: 'field', field: 'materialCost' },
          denominator: { op: 'field', field: 'revenue' },
          zero: 'zero',
        },
        overallAggregation: 'avg',
      },
      dimensions: [],
      outputField: 'material_cost_rate',
      sourceModels: ['ProductOrder', 'OrderItem', 'ProjectBomItem', 'StockMovement'],
      storeScope: {
        mode: 'current_store',
        anchorModel: 'ProductOrder',
        model: 'ProductOrder',
        field: 'storeId',
        joinPath: [],
      },
      rows: [{ revenue: 1000, materialCost: 240 }],
    });

    expect(result.overallValue).toBe(0.24);
  });

  it('aggregates multiple resolver rows without creating duplicate empty-dimension groups', () => {
    const result = evaluateBusinessMetricResolver({
      metricKey: 'card_recognized_revenue_amount',
      resolver: {
        kind: 'domain_service',
        key: 'finance_card_recognition_rows',
        dimensionFields: {},
        expression: { op: 'field', field: 'recognizedAmount' },
        overallAggregation: 'sum',
      },
      dimensions: [],
      outputField: 'card_recognized_revenue_amount',
      sourceModels: ['CardUsageRecord'],
      storeScope: {
        mode: 'current_store',
        anchorModel: 'CardUsageRecord',
        model: 'CardUsageRecord',
        field: 'storeId',
        joinPath: [],
      },
      rows: [{ recognizedAmount: 80 }, { recognizedAmount: 120 }],
    });

    expect(result).toEqual({
      outputField: 'card_recognized_revenue_amount',
      groups: [],
      overallValue: 200,
    });
  });

  it('aggregates repeated commission dimensions instead of rejecting valid multi-staff rows', () => {
    const result = evaluateBusinessMetricResolver({
      metricKey: 'staff_commission_component_amount',
      resolver: {
        kind: 'domain_service',
        key: 'finance_staff_commission_rows',
        dimensionFields: { commissionType: 'commissionType' },
        expression: { op: 'field', field: 'amount' },
        overallAggregation: 'sum',
      },
      dimensions: ['commissionType'],
      outputField: 'staff_commission_component_amount',
      sourceModels: ['CommissionRecord', 'Beautician'],
      storeScope: {
        mode: 'current_store',
        anchorModel: 'CommissionRecord',
        model: 'CommissionRecord',
        field: 'storeId',
        joinPath: [],
      },
      rows: [
        { beauticianId: 19, commissionType: 'project', amount: 100 },
        { beauticianId: 20, commissionType: 'project', amount: 52.91 },
        { beauticianId: 19, commissionType: 'product', amount: 45.3 },
      ],
    });

    expect(result).toEqual({
      outputField: 'staff_commission_component_amount',
      groups: [
        { dimensions: { commissionType: 'project' }, value: 152.91 },
        { dimensions: { commissionType: 'product' }, value: 45.3 },
      ],
      overallValue: 198.21,
    });
  });

  it('calculates overall averages from source rows rather than averaged groups', () => {
    const result = evaluateBusinessMetricResolver({
      metricKey: 'product_gross_margin_rate',
      resolver: {
        kind: 'domain_service',
        key: 'product_margin_rows',
        dimensionFields: { productName: 'productName' },
        expression: { op: 'field', field: 'grossMarginRate' },
        overallAggregation: 'avg',
      },
      dimensions: ['productName'],
      outputField: 'product_gross_margin_rate',
      sourceModels: ['ProductOrder', 'OrderItem', 'RefundItem', 'Product'],
      storeScope: {
        mode: 'current_store',
        anchorModel: 'Product',
        model: 'Product',
        field: 'storeId',
        joinPath: [],
      },
      rows: [
        { productName: '精华', grossMarginRate: 0.1 },
        { productName: '精华', grossMarginRate: 0.2 },
        { productName: '面膜', grossMarginRate: 0.9 },
      ],
    });

    expect(result.groups).toEqual([
      { dimensions: { productName: '精华' }, value: 0.15 },
      { dimensions: { productName: '面膜' }, value: 0.9 },
    ]);
    expect(result.overallValue).toBe(0.4);
  });

  it('evaluates the governed new-customer conversion rate from the shared customer fact row', () => {
    const result = evaluateBusinessMetricResolver({
      metricKey: 'new_customer_conversion_rate',
      resolver: {
        kind: 'domain_service',
        key: 'customer_acquisition_conversion_summary',
        dimensionFields: {},
        expression: {
          op: 'divide',
          numerator: { op: 'field', field: 'convertedCustomerCount' },
          denominator: { op: 'field', field: 'newCustomerCount' },
          zero: 'zero',
        },
        overallAggregation: 'avg',
      },
      dimensions: [],
      outputField: 'new_customer_conversion_rate',
      sourceModels: ['Customer', 'ProductOrder'],
      storeScope: {
        mode: 'current_store',
        anchorModel: 'Customer',
        model: 'Customer',
        field: 'storeId',
        joinPath: [],
      },
      rows: [{ newCustomerCount: 9, convertedCustomerCount: 1 }],
    });

    expect(result).toEqual({
      outputField: 'new_customer_conversion_rate',
      groups: [],
      overallValue: 0.11111111,
    });
  });

  it('counts dormant reactivation rows by governed customer dimensions', () => {
    const result = evaluateBusinessMetricResolver({
      metricKey: 'dormant_reactivation_customer_count',
      resolver: {
        kind: 'domain_service',
        key: 'customer_dormant_reactivation_rows',
        dimensionFields: { customerId: 'customerId', customerName: 'customerName' },
        expression: { op: 'field', field: 'reactivationSignal' },
        overallAggregation: 'sum',
      },
      dimensions: ['customerId', 'customerName'],
      outputField: 'dormant_reactivation_customer_count',
      sourceModels: ['Customer', 'MarketingAutomationTouch', 'Reservation', 'ProductOrder'],
      storeScope: {
        mode: 'current_store',
        anchorModel: 'Customer',
        model: 'Customer',
        field: 'storeId',
        joinPath: [],
      },
      rows: [
        { customerId: 21, customerName: '赵女士', reactivationSignal: 1 },
        { customerId: 22, customerName: '陈女士', reactivationSignal: 1 },
      ],
    });

    expect(result).toEqual({
      outputField: 'dormant_reactivation_customer_count',
      groups: [
        { dimensions: { customerId: 21, customerName: '赵女士' }, value: 1 },
        { dimensions: { customerId: 22, customerName: '陈女士' }, value: 1 },
      ],
      overallValue: 2,
    });
  });

  it('ranks inventory consumption from governed outbound quantities', () => {
    const result = evaluateBusinessMetricResolver({
      metricKey: 'inventory_consumption_quantity',
      resolver: {
        kind: 'domain_service',
        key: 'inventory_consumption_rows',
        dimensionFields: { productId: 'productId', productName: 'name' },
        expression: { op: 'field', field: 'outboundQty' },
        overallAggregation: 'sum',
      },
      dimensions: ['productId', 'productName'],
      outputField: 'inventory_consumption_quantity',
      sourceModels: ['Product', 'StockMovement'],
      storeScope: {
        mode: 'current_store',
        anchorModel: 'Product',
        model: 'Product',
        field: 'storeId',
        joinPath: [],
      },
      rows: [
        { productId: 31, name: '美容棉片', outboundQty: 30 },
        { productId: 32, name: '修护面膜', outboundQty: 12 },
      ],
    });

    expect(result.groups).toEqual([
      { dimensions: { productId: 31, productName: '美容棉片' }, value: 30 },
      { dimensions: { productId: 32, productName: '修护面膜' }, value: 12 },
    ]);
    expect(result.overallValue).toBe(42);
  });

  it('evaluates governed product margin rows by product dimensions', () => {
    const result = evaluateBusinessMetricResolver({
      metricKey: 'product_gross_margin_rate',
      resolver: {
        kind: 'domain_service',
        key: 'product_margin_rows',
        dimensionFields: { productId: 'productId', productName: 'productName' },
        expression: { op: 'field', field: 'grossMarginRate' },
        overallAggregation: 'avg',
      },
      dimensions: ['productId', 'productName'],
      outputField: 'product_gross_margin_rate',
      sourceModels: ['ProductOrder', 'OrderItem', 'RefundItem', 'Product'],
      storeScope: { mode: 'current_store', anchorModel: 'Product', model: 'Product', field: 'storeId', joinPath: [] },
      rows: [
        { productId: 1, productName: '眼霜', grossMarginRate: 0.5 },
        { productId: 2, productName: '精华', grossMarginRate: 0.25 },
      ],
    });

    expect(result.groups).toEqual([
      { dimensions: { productId: 1, productName: '眼霜' }, value: 0.5 },
      { dimensions: { productId: 2, productName: '精华' }, value: 0.25 },
    ]);
    expect(result.overallValue).toBe(0.375);
  });

  it('evaluates satisfaction and coverage from the shared feedback summary row', () => {
    const feedbackScope: BusinessMetricRuntimeQuery['storeScope'] = {
      mode: 'current_store',
      anchorModel: 'CustomerServiceFeedback',
      model: 'CustomerServiceFeedback',
      field: 'storeId',
      joinPath: [],
    };
    const base = {
      dimensions: [],
      sourceModels: ['CustomerServiceFeedback', 'ServiceTask'],
      storeScope: feedbackScope,
      rows: [{ ratingTotal: 14, ratedFeedbackCount: 4, linkedServiceTaskCount: 4, completedServiceTaskCount: 10 }],
    };
    const satisfaction = evaluateBusinessMetricResolver({
      ...base,
      metricKey: 'customer_average_satisfaction_rating',
      outputField: 'customer_average_satisfaction_rating',
      resolver: {
        kind: 'domain_service',
        key: 'customer_service_feedback_summary',
        dimensionFields: {},
        expression: {
          op: 'divide',
          numerator: { op: 'field', field: 'ratingTotal' },
          denominator: { op: 'field', field: 'ratedFeedbackCount' },
          zero: 'zero',
        },
        overallAggregation: 'avg',
      },
    });
    const coverage = evaluateBusinessMetricResolver({
      ...base,
      metricKey: 'customer_feedback_collection_coverage_rate',
      outputField: 'customer_feedback_collection_coverage_rate',
      resolver: {
        kind: 'domain_service',
        key: 'customer_service_feedback_summary',
        dimensionFields: {},
        expression: {
          op: 'divide',
          numerator: { op: 'field', field: 'linkedServiceTaskCount' },
          denominator: { op: 'field', field: 'completedServiceTaskCount' },
          zero: 'zero',
        },
        overallAggregation: 'avg',
      },
    });

    expect(satisfaction.overallValue).toBe(3.5);
    expect(coverage.overallValue).toBe(0.4);
  });

  it('evaluates staff complaint ranking without reading undeclared employee metrics', () => {
    const result = evaluateBusinessMetricResolver({
      metricKey: 'staff_customer_complaint_count',
      resolver: {
        kind: 'domain_service',
        key: 'customer_service_feedback_by_staff',
        dimensionFields: { beauticianId: 'beauticianId', beauticianName: 'beauticianName' },
        expression: { op: 'field', field: 'complaintCount' },
        overallAggregation: 'sum',
      },
      dimensions: ['beauticianId', 'beauticianName'],
      outputField: 'staff_customer_complaint_count',
      sourceModels: ['CustomerServiceFeedback', 'Beautician'],
      storeScope: {
        mode: 'current_store',
        anchorModel: 'CustomerServiceFeedback',
        model: 'CustomerServiceFeedback',
        field: 'storeId',
        joinPath: [],
      },
      rows: [
        { beauticianId: 8, beauticianName: '唐伊', complaintCount: 2 },
        { beauticianId: 9, beauticianName: '沈晴', complaintCount: 1 },
      ],
    });

    expect(result.groups).toEqual([
      { dimensions: { beauticianId: 8, beauticianName: '唐伊' }, value: 2 },
      { dimensions: { beauticianId: 9, beauticianName: '沈晴' }, value: 1 },
    ]);
    expect(result.overallValue).toBe(3);
  });
});
