import {
  evaluateMarketingRolloutObservation,
  type MarketingFactParityDailyObservation,
  type MarketingRolloutObservationExport,
  type MarketingWorkerDailyObservation,
} from './marketing-rollout-observation-gate';

const businessDates = [
  '2026-07-07',
  '2026-07-08',
  '2026-07-09',
  '2026-07-10',
  '2026-07-11',
  '2026-07-12',
  '2026-07-13',
];

const workerDay = (businessDate: string): MarketingWorkerDailyObservation => ({
  businessDate,
  executionCount: 2,
  deliveryJobCount: 100,
  queuedCount: 0,
  runningCount: 0,
  staleExecutionCount: 0,
  deliveredCount: 99,
  deadLetterCount: 1,
  expiredLeaseCount: 0,
  duplicateDeliveryArtifactCount: 0,
  deliveredMissingFactCount: 0,
});

const factDay = (businessDate: string): MarketingFactParityDailyObservation => ({
  businessDate,
  legacy: { deliveryCount: 99, conversionCount: 5, revenue: 1000, refundAmount: 100 },
  facts: { deliveryCount: 99, conversionCount: 5, revenue: 1000, refundAmount: 100 },
});

const validExport = (): MarketingRolloutObservationExport => ({
  storeId: 6,
  rangeStart: '2026-07-07T00:00:00.000Z',
  rangeEnd: '2026-07-14T00:00:00.000Z',
  exportedAt: '2026-07-14T00:30:00.000Z',
  observationEndBusinessDate: '2026-07-13',
  sources: {
    worker: 'delivery-job-worker-metrics',
    legacyEffect: 'legacy-marketing-attribution-projection',
    factEffect: 'marketing-effect-facts',
  },
  coverageSegments: [{ start: '2026-07-07T00:00:00.000Z', end: '2026-07-14T00:00:00.000Z' }],
  workerDays: businessDates.slice(-3).map(workerDay),
  factParityDays: businessDates.map(factDay),
});

describe('marketing rollout observation gate', () => {
  it('passes Release C and D only with complete worker and fact observations', () => {
    const result = evaluateMarketingRolloutObservation(validExport(), new Date('2026-07-14T01:00:00.000Z'));

    expect(result).toEqual(
      expect.objectContaining({
        mode: 'read_only',
        requirement: 'all',
        passed: true,
        reasons: [],
      }),
    );
    expect(result.worker).toEqual(expect.objectContaining({ passed: true, requiredDays: 3 }));
    expect(result.facts).toEqual(expect.objectContaining({ passed: true, requiredDays: 7 }));
  });

  it('fails Release C when one of the three business days is missing', () => {
    const input = validExport();
    input.workerDays = input.workerDays.slice(1);

    expect(
      evaluateMarketingRolloutObservation(input, new Date('2026-07-14T01:00:00.000Z'), {
        requirement: 'worker',
      }),
    ).toEqual(
      expect.objectContaining({
        passed: false,
        reasons: ['worker_observation_days_missing'],
      }),
    );
  });

  it('fails Release C for stale executions, expired leases, duplicates, or missing facts', () => {
    const input = validExport();
    input.workerDays[2] = {
      ...input.workerDays[2],
      staleExecutionCount: 1,
      expiredLeaseCount: 2,
      duplicateDeliveryArtifactCount: 1,
      deliveredMissingFactCount: 1,
    };

    const result = evaluateMarketingRolloutObservation(input, new Date('2026-07-14T01:00:00.000Z'), {
      requirement: 'worker',
    });

    expect(result.passed).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'stale_execution_detected:2026-07-13',
        'expired_lease_detected:2026-07-13',
        'duplicate_delivery_artifact_detected:2026-07-13',
        'delivered_missing_fact_detected:2026-07-13',
      ]),
    );
  });

  it('fails Release D when any daily count or amount differs', () => {
    const input = validExport();
    input.factParityDays[6] = {
      ...input.factParityDays[6],
      facts: { deliveryCount: 98, conversionCount: 4, revenue: 999, refundAmount: 99 },
    };

    const result = evaluateMarketingRolloutObservation(input, new Date('2026-07-14T01:00:00.000Z'), {
      requirement: 'facts',
    });

    expect(result.passed).toBe(false);
    expect(result.reasons).toEqual([
      'delivery_count_mismatch:2026-07-13',
      'conversion_count_mismatch:2026-07-13',
      'revenue_mismatch:2026-07-13',
      'refund_amount_mismatch:2026-07-13',
    ]);
  });

  it('allows the three-day worker gate to run before seven fact days exist', () => {
    const input = validExport();
    input.rangeStart = '2026-07-11T00:00:00.000Z';
    input.coverageSegments = [{ start: '2026-07-11T00:00:00.000Z', end: '2026-07-14T00:00:00.000Z' }];
    input.factParityDays = [];

    const result = evaluateMarketingRolloutObservation(input, new Date('2026-07-14T01:00:00.000Z'), {
      requirement: 'worker',
    });

    expect(result.passed).toBe(true);
    expect(result.worker).toEqual(expect.objectContaining({ required: true, passed: true }));
    expect(result.facts).toEqual(expect.objectContaining({ required: false, passed: false }));
  });

  it('fails closed for stale exports and internal coverage gaps', () => {
    const input = validExport();
    input.coverageSegments = [
      { start: '2026-07-07T00:00:00.000Z', end: '2026-07-10T00:00:00.000Z' },
      { start: '2026-07-11T00:00:00.000Z', end: '2026-07-14T00:00:00.000Z' },
    ];

    const result = evaluateMarketingRolloutObservation(input, new Date('2026-07-15T00:00:00.000Z'));

    expect(result.passed).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(['export_not_fresh', 'export_coverage_has_gaps']));
  });

  it('rejects a cross-store aggregate or a same-source fact comparison', () => {
    const input = validExport();
    input.storeId = 0;
    expect(() => evaluateMarketingRolloutObservation(input)).toThrow('Invalid rollout storeId');

    const sameSource = validExport();
    sameSource.sources.factEffect = sameSource.sources.legacyEffect;
    expect(() => evaluateMarketingRolloutObservation(sameSource)).toThrow(
      'Legacy and fact observations must use independent sources',
    );
  });
});
