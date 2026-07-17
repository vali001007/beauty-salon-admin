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
      groups: [{ dimensions: {}, value: 0.11111111 }],
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
