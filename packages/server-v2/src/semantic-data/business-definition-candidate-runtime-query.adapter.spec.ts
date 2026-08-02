import { AMI_CORE_BUSINESS_METRIC_CONTRACTS } from './ami-core-business-semantic-contracts.js';
import { BusinessDefinitionCandidateRuntimeQueryAdapter } from './business-definition-candidate-runtime-query.adapter.js';

describe('business definition candidate runtime query adapter', () => {
  it('dispatches current settlement metrics through the settlement resolver key', async () => {
    const contract = AMI_CORE_BUSINESS_METRIC_CONTRACTS.find((item) => item.metricKey === 'material_cost_rate');
    expect(contract).toBeDefined();
    const loadRows = jest.fn().mockResolvedValue([{ revenue: 1000, materialCost: 240 }]);
    const adapter = new BusinessDefinitionCandidateRuntimeQueryAdapter({} as never, {} as never).useResolverRowSource({
      loadRows,
    });

    const result = await adapter.execute({
      canonicalQueryRef: 'semantic_query.material_cost_rate',
      version: { payload: contract!.payload } as never,
      fixtureCase: {
        caseKey: 'metric.material_cost_rate.store_6',
        input: {
          storeId: 6,
          timeRange: {
            preset: 'custom',
            startDate: '2026-07-01',
            endDate: '2026-08-01',
            label: '2026年7月',
          },
        },
        expected: null,
      },
      timezone: 'Asia/Shanghai',
      storeScope: { mode: 'current_store' },
    });

    expect(loadRows).toHaveBeenCalledWith(
      expect.objectContaining({
        resolverKey: 'finance_settlement_cost_analysis',
        storeId: 6,
      }),
    );
    expect(result).toEqual({
      status: 'success',
      rows: [],
      kpis: [{ label: 'material_cost_rate', value: '0.24' }],
    });
  });

  it('executes an as-of snapshot resolver metric without requiring an event-time field', async () => {
    const contract = AMI_CORE_BUSINESS_METRIC_CONTRACTS.find((item) => item.metricKey === 'stored_value_liability');
    expect(contract).toBeDefined();
    const loadRows = jest.fn().mockResolvedValue([{ storedValueLiability: 60745.42 }]);
    const adapter = new BusinessDefinitionCandidateRuntimeQueryAdapter({} as never, {} as never).useResolverRowSource({
      loadRows,
    });

    const result = await adapter.execute({
      canonicalQueryRef: 'semantic_query.stored_value_liability',
      version: { payload: contract!.payload } as never,
      fixtureCase: {
        caseKey: 'metric.stored_value_liability.store_6',
        input: {
          storeId: 6,
          timeRange: {
            preset: 'custom',
            startDate: '2026-07-01',
            endDate: '2026-08-01',
            label: '2026年7月',
          },
        },
        expected: null,
      },
      timezone: 'Asia/Shanghai',
      storeScope: { mode: 'current_store' },
    });

    expect(loadRows).toHaveBeenCalledWith(
      expect.objectContaining({
        resolverKey: 'finance_stored_value_liability_summary',
        storeId: 6,
      }),
    );
    expect(result).toEqual({
      status: 'success',
      rows: [],
      kpis: [{ label: 'stored_value_liability', value: '60745.42' }],
    });
  });
});
