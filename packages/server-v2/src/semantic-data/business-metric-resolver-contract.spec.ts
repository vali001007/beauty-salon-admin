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
});
