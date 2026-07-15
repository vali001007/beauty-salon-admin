import {
  buildMarketingPerformanceRequestPlan,
  evaluateMarketingReadPerformance,
  percentile95,
  resolveRecommendationInstanceId,
  sampleReadEndpoint,
} from './marketing-performance-gate';

describe('marketing performance gate', () => {
  it('calculates p95 using the nearest-rank sample', () => {
    expect(percentile95(Array.from({ length: 20 }, (_, index) => index + 1))).toBe(19);
  });

  it('passes only when recommendation and audience p95 are strictly below their gates', () => {
    expect(
      evaluateMarketingReadPerformance({
        recommendationListMs: [120, 240, 799],
        audiencePageMs: [80, 180, 499],
      }),
    ).toEqual(
      expect.objectContaining({
        passed: true,
        recommendationList: expect.objectContaining({ thresholdMs: 800, passed: true }),
        audiencePage: expect.objectContaining({ thresholdMs: 500, passed: true }),
        implementationEvidence: {
          browserInitialRequestCount: expect.objectContaining({ value: 3, source: 'component_contract_test' }),
          serverOfferPoolQueryCount: expect.objectContaining({ value: 1, source: 'service_unit_test' }),
        },
        notMeasured: ['1000_customer_execution_initialization', 'worker_100_delivery_batch'],
      }),
    );

    expect(
      evaluateMarketingReadPerformance({
        recommendationListMs: [800],
        audiencePageMs: [500],
      }),
    ).toEqual(
      expect.objectContaining({
        passed: false,
        recommendationList: expect.objectContaining({ passed: false }),
        audiencePage: expect.objectContaining({ passed: false }),
      }),
    );
  });

  it('fails closed when a required scenario has no samples', () => {
    expect(evaluateMarketingReadPerformance({ recommendationListMs: [], audiencePageMs: [100] })).toEqual(
      expect.objectContaining({
        passed: false,
        recommendationList: expect.objectContaining({ sampleCount: 0, passed: false }),
      }),
    );
  });

  it('builds a read-only request plan with store-scoped headers and bounded sample counts', () => {
    expect(
      buildMarketingPerformanceRequestPlan({
        baseUrl: 'http://127.0.0.1:8080/api/',
        token: 'token-1',
        storeId: 6,
        instanceId: 'instance-1',
        iterations: 200,
        warmup: -1,
      }),
    ).toEqual({
      recommendationListUrl: 'http://127.0.0.1:8080/api/marketing/recommendation-instances?page=1&pageSize=50',
      audiencePageUrl:
        'http://127.0.0.1:8080/api/marketing/recommendation-instances/instance-1/audience?page=1&pageSize=50',
      headers: { Authorization: 'Bearer token-1', 'X-Store-Id': '6' },
      iterations: 100,
      warmup: 0,
    });
  });

  it('discards warmup requests and records only measured GET durations', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [] }) });
    const times = [0, 50, 50, 150, 150, 270];

    const samples = await sampleReadEndpoint({
      url: 'http://127.0.0.1/api/marketing/recommendation-instances',
      headers: { Authorization: 'Bearer token', 'X-Store-Id': '6' },
      iterations: 2,
      warmup: 1,
      fetchImpl,
      now: () => times.shift() ?? 270,
    });

    expect(samples).toEqual([100, 120]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1/api/marketing/recommendation-instances', {
      method: 'GET',
      headers: { Authorization: 'Bearer token', 'X-Store-Id': '6' },
    });
  });

  it('resolves the first persisted recommendation instance from a list response', () => {
    expect(
      resolveRecommendationInstanceId({
        items: [{ recommendationInstanceId: 'instance-1' }, { recommendationInstanceId: 'instance-2' }],
      }),
    ).toBe('instance-1');
    expect(resolveRecommendationInstanceId({ data: [{ id: 'legacy-instance' }] })).toBe('legacy-instance');
    expect(() => resolveRecommendationInstanceId({ items: [] })).toThrow('No recommendation instance is available');
  });

  it('prefers an instance that has an audience snapshot for audience sampling', () => {
    expect(
      resolveRecommendationInstanceId({
        items: [
          { recommendationInstanceId: 'legacy-instance', audience: null },
          { recommendationInstanceId: 'current-instance', audience: { snapshotId: 'audience-1' } },
        ],
      }),
    ).toBe('current-instance');
  });
});
