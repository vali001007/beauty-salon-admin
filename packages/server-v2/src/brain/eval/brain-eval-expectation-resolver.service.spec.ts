import { BrainEvalExpectationResolverService } from './brain-eval-expectation-resolver.service.js';

describe('BrainEvalExpectationResolverService', () => {
  const service = new BrainEvalExpectationResolverService();
  const definitions = {
    entities: [
      {
        definitionKey: 'entity.customer',
        entityKey: 'customer',
        name: '客户',
        aliases: ['顾客'],
        domain: 'customer',
        source: {},
        permissions: [],
        version: 1,
        definitionFingerprint: '3'.repeat(64),
        sourceFingerprint: '4'.repeat(64),
      },
      {
        definitionKey: 'entity.product',
        entityKey: 'product',
        name: '商品',
        aliases: ['产品'],
        domain: 'product',
        source: {},
        permissions: [],
        version: 1,
        definitionFingerprint: '5'.repeat(64),
        sourceFingerprint: '6'.repeat(64),
      },
    ],
    relations: [],
    metrics: [
      {
        definitionKey: 'metric.paid_amount',
        metricKey: 'paid_amount',
        name: '实收金额',
        aliases: ['营业额', 'paid_revenue'],
        domain: 'payment',
        formula: {},
        source: [],
        defaultFilters: [],
        permissions: [],
        description: '实收',
        runtimeQuery: { capabilityKeys: ['order_revenue_analysis'], dimensions: [] },
        version: 4,
        definitionFingerprint: 'a'.repeat(64),
        sourceFingerprint: 'b'.repeat(64),
      },
      {
        definitionKey: 'metric.product_sales_quantity',
        metricKey: 'product_sales_quantity',
        name: '商品销量',
        aliases: ['产品销量'],
        domain: 'order',
        formula: {},
        source: [],
        defaultFilters: [],
        permissions: [],
        description: '销量',
        runtimeQuery: {
          capabilityKeys: ['product_sales_ranking'],
          dimensions: ['productId', 'productName'],
        },
        version: 4,
        definitionFingerprint: 'c'.repeat(64),
        sourceFingerprint: 'd'.repeat(64),
      },
      {
        definitionKey: 'metric.average_order_value',
        metricKey: 'average_order_value',
        name: '客单价',
        aliases: ['平均客单价', '日均客单价', '订单平均金额'],
        domain: 'finance',
        formula: {},
        source: [],
        defaultFilters: [],
        permissions: [],
        description: '平均每单金额',
        runtimeQuery: { capabilityKeys: ['order_revenue_analysis'], dimensions: [] },
        version: 1,
        definitionFingerprint: '9'.repeat(64),
        sourceFingerprint: '0'.repeat(64),
      },
      {
        definitionKey: 'metric.material_cost_rate',
        metricKey: 'material_cost_rate',
        name: '耗材成本率',
        aliases: ['耗材成本占服务收入比例'],
        domain: 'finance',
        formula: {},
        source: [],
        defaultFilters: [],
        permissions: [],
        description: '耗材成本除以服务收入',
        runtimeQuery: { capabilityKeys: ['finance_material_cost_summary'], dimensions: [] },
        version: 1,
        definitionFingerprint: '5'.repeat(64),
        sourceFingerprint: '6'.repeat(64),
      },
    ],
    dimensions: [
      {
        definitionKey: 'dimension.productId',
        dimensionKey: 'productId',
        name: '商品 ID',
        aliases: ['商品编号'],
        domain: 'product',
        source: {},
        permissions: [],
        version: 1,
        definitionFingerprint: 'e'.repeat(64),
        sourceFingerprint: 'f'.repeat(64),
      },
      {
        definitionKey: 'dimension.productName',
        dimensionKey: 'productName',
        name: '商品名称',
        aliases: ['产品名称'],
        domain: 'product',
        source: {},
        permissions: [],
        version: 1,
        definitionFingerprint: '1'.repeat(64),
        sourceFingerprint: '2'.repeat(64),
      },
      {
        definitionKey: 'dimension.customerName',
        dimensionKey: 'customerName',
        name: '客户名称',
        aliases: ['客户姓名'],
        domain: 'customer',
        source: {},
        permissions: [],
        version: 1,
        definitionFingerprint: '7'.repeat(64),
        sourceFingerprint: '8'.repeat(64),
      },
    ],
  } as never;

  it('resolves legacy metric keys through published aliases and derives canonical domain and capability', () => {
    const result = service.resolve({
      base: {
        intent: 'query',
        domains: ['store_operation'],
        metrics: ['paid_revenue'],
        capabilityKeys: ['store.operations.overview'],
      },
      definitions,
      releaseSnapshot: { capabilityKeys: ['order_revenue_analysis'] } as never,
    });

    expect(result.expectation).toMatchObject({
      domains: ['payment'],
      metrics: ['paid_amount'],
      capabilityKeys: [],
      capabilityAnyOf: ['order_revenue_analysis'],
    });
    expect(result.evidence.unresolved).toEqual([]);
  });

  it('resolves the governed average order value instead of falling back to paid amount', () => {
    const result = service.resolve({
      base: { intent: 'query', metrics: ['日均客单价'] },
      definitions,
      roleKey: 'store_manager',
      releaseSnapshot: {
        capabilityKeys: ['order_revenue_analysis'],
        capabilityCandidates: [
          {
            key: 'order_revenue_analysis',
            allowedRoles: ['store_manager'],
            intents: ['query'],
            domains: ['finance'],
            definitionRefs: [{ definitionKey: 'metric.average_order_value' }],
          },
        ],
      } as never,
    });

    expect(result.expectation).toMatchObject({
      metrics: ['average_order_value'],
      domains: ['finance'],
      capabilityAnyOf: ['order_revenue_analysis'],
    });
  });

  it('resolves material cost rate to the focused finance capability', () => {
    const result = service.resolve({
      base: { intent: 'query', metrics: ['耗材成本占服务收入比例'] },
      definitions,
      roleKey: 'inventory',
      releaseSnapshot: {
        capabilityKeys: ['finance_material_cost_summary'],
        capabilityCandidates: [
          {
            key: 'finance_material_cost_summary',
            allowedRoles: ['inventory', 'store_manager'],
            intents: ['query'],
            domains: ['finance'],
            definitionRefs: [{ definitionKey: 'metric.material_cost_rate' }],
          },
        ],
      } as never,
    });

    expect(result.expectation).toMatchObject({
      metrics: ['material_cost_rate'],
      domains: ['finance'],
      capabilityAnyOf: ['finance_material_cost_summary'],
    });
  });

  it('uses the published metric dimension binding instead of a persona-level dimension label', () => {
    const result = service.resolve({
      base: {
        intent: 'ranking',
        domains: ['store_operation'],
        metrics: ['product_sales_quantity'],
        dimensions: ['product'],
      },
      definitions,
      releaseSnapshot: { capabilityKeys: ['product_sales_ranking'] } as never,
    });

    expect(result.expectation).toMatchObject({
      metrics: ['product_sales_quantity'],
      dimensions: ['productName'],
      domains: ['order', 'product'],
      capabilityKeys: [],
      capabilityAnyOf: ['product_sales_ranking'],
    });
  });

  it('keeps unresolved expectations as evidence without enforcing stale labels', () => {
    const result = service.resolve({
      base: { metrics: ['gross_margin_rate'], domains: ['finance_risk'] },
      definitions,
    });

    expect(result.expectation.metrics).toEqual([]);
    expect(result.expectation.domains).toEqual([]);
    expect(result.evidence.unresolved).toEqual(['metric:gross_margin_rate']);
  });

  it('resolves validated candidate metrics and dimensions from the frozen evaluation release', () => {
    const result = service.resolve({
      base: {
        intent: 'query',
        metrics: ['new_customer_count', 'new_customer_conversion_count', 'new_customer_conversion_rate'],
        dimensions: ['customerAgeGroup'],
      },
      definitions,
      roleKey: 'store_manager',
      releaseSnapshot: {
        capabilityKeys: ['customer_facts'],
        capabilityCandidates: [
          {
            key: 'customer_facts',
            allowedRoles: ['store_manager'],
            intents: ['query'],
            domains: ['customer'],
            definitionRefs: [
              { definitionKey: 'metric.new_customer_count' },
              { definitionKey: 'metric.new_customer_conversion_count' },
              { definitionKey: 'metric.new_customer_conversion_rate' },
              { definitionKey: 'dimension.customerAgeGroup' },
            ],
          },
        ],
      } as never,
    });

    expect(result.expectation).toMatchObject({
      metrics: ['new_customer_count', 'new_customer_conversion_count', 'new_customer_conversion_rate'],
      dimensions: ['customerAgeGroup'],
      capabilityAnyOf: ['customer_facts'],
    });
    expect(result.evidence.unresolved).toEqual([]);
  });

  it('uses role-scoped release capabilities as alternatives when no metric binding exists', () => {
    const result = service.resolve({
      base: { intent: 'diagnosis', capabilityKeys: ['store.operations.overview'] },
      definitions,
      roleKey: 'store_manager',
      releaseSnapshot: {
        capabilityKeys: ['store_operations_overview', 'finance_risk_overview'],
        capabilityCandidates: [
          { key: 'store_operations_overview', allowedRoles: ['store_manager'] },
          { key: 'finance_risk_overview', allowedRoles: ['finance'] },
        ],
      } as never,
    });

    expect(result.expectation).toMatchObject({
      capabilityKeys: [],
      capabilityAnyOf: ['store_operations_overview'],
    });
  });

  it('maps evaluation role aliases to governed runtime roles', () => {
    const result = service.resolve({
      base: { intent: 'diagnosis' },
      definitions,
      roleKey: 'manager',
      releaseSnapshot: {
        capabilityKeys: ['finance_risk_overview', 'beautician_service_overview'],
        capabilityCandidates: [
          { key: 'finance_risk_overview', allowedRoles: ['finance', 'store_manager'], intents: ['diagnosis'] },
          { key: 'beautician_service_overview', allowedRoles: ['beautician'], intents: ['diagnosis'] },
        ],
      } as never,
    });

    expect(result.expectation.capabilityAnyOf).toEqual(['finance_risk_overview']);
  });

  it('does not require capability selection while the turn is waiting for clarification', () => {
    const result = service.resolve({
      base: { intent: 'comparison', answerShape: 'clarification', metrics: ['paid_amount'] },
      definitions,
      roleKey: 'store_manager',
      releaseSnapshot: {
        capabilityKeys: ['order_revenue_analysis'],
        capabilityCandidates: [{ key: 'order_revenue_analysis', allowedRoles: ['store_manager'] }],
      } as never,
    });

    expect(result.expectation.capabilityAnyOf).toBeUndefined();
    expect(result.evidence.capabilityKeys).toEqual([]);
  });

  it('does not require a capability or grounding for a declared system boundary', () => {
    const result = service.resolve({
      base: { intent: 'query', entities: ['reservation'], requiresGrounding: false, requiresComplete: false },
      definitions,
      roleKey: 'receptionist',
      releaseSnapshot: {
        capabilityKeys: ['reservation_list'],
        capabilityCandidates: [
          {
            key: 'reservation_list',
            allowedRoles: ['receptionist'],
            definitionRefs: [{ definitionKey: 'entity.reservation' }],
          },
        ],
      } as never,
    });

    expect(result.expectation.capabilityAnyOf).toBeUndefined();
    expect(result.evidence.capabilityKeys).toEqual([]);
  });

  it('does not infer a tool requirement for a governed deterministic decision', () => {
    const result = service.resolve({
      base: {
        intent: 'recommendation',
        entities: ['product'],
        decisionCodes: ['expiring_inventory_empty_no_campaign_needed'],
      },
      definitions,
      roleKey: 'store_manager',
      releaseSnapshot: {
        capabilityKeys: ['inventory_operations_overview'],
        capabilityCandidates: [
          {
            key: 'inventory_operations_overview',
            allowedRoles: ['store_manager'],
            intents: ['query', 'recommendation'],
            domains: ['product'],
            definitionRefs: [{ definitionKey: 'entity.product' }],
          },
        ],
      } as never,
    });

    expect(result.expectation.capabilityAnyOf).toBeUndefined();
    expect(result.expectation.decisionCodes).toEqual(['expiring_inventory_empty_no_campaign_needed']);
    expect(result.evidence.capabilityKeys).toEqual([]);
  });

  it('includes release capabilities whose frozen definition refs cover the expected metric', () => {
    const result = service.resolve({
      base: { intent: 'query', metrics: ['paid_amount'] },
      definitions,
      roleKey: 'store_manager',
      releaseSnapshot: {
        capabilityKeys: ['order_revenue_analysis', 'store_operations_overview'],
        capabilityCandidates: [
          {
            key: 'store_operations_overview',
            allowedRoles: ['store_manager'],
            definitionRefs: [{ definitionKey: 'metric.paid_amount' }],
          },
        ],
      } as never,
    });

    expect(result.expectation.capabilityAnyOf).toEqual(['order_revenue_analysis', 'store_operations_overview']);
  });

  it('uses entity, domain, intent and role evidence instead of falling back to an unrelated role capability', () => {
    const result = service.resolve({
      base: { intent: 'query', domains: ['product'], entities: ['product'], dimensions: ['productName'] },
      definitions,
      roleKey: 'store_manager',
      releaseSnapshot: {
        capabilityKeys: ['store_operations_overview', 'inventory_operations_overview', 'customer_facts'],
        capabilityCandidates: [
          {
            key: 'store_operations_overview',
            allowedRoles: ['store_manager'],
            intents: ['query'],
            domains: ['customer'],
            definitionRefs: [{ definitionKey: 'entity.customer' }],
          },
          {
            key: 'inventory_operations_overview',
            allowedRoles: ['inventory', 'store_manager'],
            intents: ['query'],
            domains: ['product'],
            definitionRefs: [{ definitionKey: 'entity.product' }],
          },
          {
            key: 'customer_facts',
            allowedRoles: ['store_manager'],
            intents: ['query'],
            domains: ['customer'],
            definitionRefs: [{ definitionKey: 'entity.customer' }],
          },
        ],
      } as never,
    });

    expect(result.expectation.capabilityAnyOf).toEqual(['inventory_operations_overview']);
    expect(result.evidence).toMatchObject({
      entityKeys: ['product'],
      dimensionKeys: ['productName'],
      domainKeys: ['product'],
      capabilityKeys: ['inventory_operations_overview'],
    });
  });

  it('allows a governed query capability to satisfy a ranking answer shape', () => {
    const result = service.resolve({
      base: { intent: 'ranking', domains: ['product'], entities: ['product'], dimensions: ['productName'] },
      definitions,
      roleKey: 'store_manager',
      releaseSnapshot: {
        capabilityKeys: ['finance_risk_overview'],
        capabilityCandidates: [
          {
            key: 'finance_risk_overview',
            allowedRoles: ['store_manager'],
            intents: ['query', 'diagnosis'],
            domains: ['product', 'finance'],
            definitionRefs: [{ definitionKey: 'entity.product' }, { definitionKey: 'dimension.productName' }],
          },
        ],
      } as never,
    });

    expect(result.expectation.capabilityAnyOf).toEqual(['finance_risk_overview']);
  });
});
