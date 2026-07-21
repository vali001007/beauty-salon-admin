import { evaluateMarketingLegacyRetirement } from './marketing-legacy-retirement-gate';

const coverage = (start: string, end: string) => [{ start, end }];

describe('marketing legacy recommendation retirement gate', () => {
  it('passes only after a complete fourteen-day window with zero legacy calls', () => {
    expect(evaluateMarketingLegacyRetirement({
      rangeStart: '2026-07-01T00:00:00.000Z',
      rangeEnd: '2026-07-15T00:00:00.000Z',
      exportedAt: '2026-07-15T00:05:00.000Z',
      coverageSegments: coverage('2026-07-01T00:00:00.000Z', '2026-07-15T00:00:00.000Z'),
      events: [],
    }, new Date('2026-07-15T00:10:00.000Z'))).toEqual(expect.objectContaining({
      passed: true,
      observationDays: 14,
      legacyCallCount: 0,
      reasons: [],
    }));
  });

  it('fails closed when the exported observation window is shorter than fourteen days', () => {
    expect(evaluateMarketingLegacyRetirement({
      rangeStart: '2026-07-01T00:00:00.000Z',
      rangeEnd: '2026-07-14T23:59:59.000Z',
      exportedAt: '2026-07-15T00:00:00.000Z',
      coverageSegments: coverage('2026-07-01T00:00:00.000Z', '2026-07-14T23:59:59.000Z'),
      events: [],
    }, new Date('2026-07-15T00:05:00.000Z'))).toEqual(expect.objectContaining({
      passed: false,
      legacyCallCount: 0,
      reasons: ['observation_window_too_short'],
    }));
  });

  it('fails and summarizes route and store usage when a legacy call exists', () => {
    expect(evaluateMarketingLegacyRetirement({
      rangeStart: '2026-07-01T00:00:00.000Z',
      rangeEnd: '2026-07-16T00:00:00.000Z',
      exportedAt: '2026-07-16T00:05:00.000Z',
      coverageSegments: coverage('2026-07-01T00:00:00.000Z', '2026-07-16T00:00:00.000Z'),
      events: [{
        timestamp: '2026-07-10T08:00:00.000Z',
        message: 'legacy_marketing_recommendation_api route=GET /marketing/recommendations storeId=6 successor=/marketing/recommendation-instances sunset=2026-09-30',
      }],
    }, new Date('2026-07-16T00:10:00.000Z'))).toEqual(expect.objectContaining({
      passed: false,
      legacyCallCount: 1,
      routeCounts: { 'GET /marketing/recommendations': 1 },
      storeCounts: { '6': 1 },
      reasons: ['legacy_calls_detected'],
    }));
  });

  it('rejects invalid coverage timestamps instead of treating them as zero usage', () => {
    expect(() => evaluateMarketingLegacyRetirement({
      rangeStart: 'invalid',
      rangeEnd: '2026-07-16T00:00:00.000Z',
      exportedAt: '2026-07-16T00:05:00.000Z',
      coverageSegments: coverage('2026-07-01T00:00:00.000Z', '2026-07-16T00:00:00.000Z'),
      events: [],
    })).toThrow('Invalid legacy log export range');
  });

  it('fails closed for a historical empty export that is no longer fresh', () => {
    expect(evaluateMarketingLegacyRetirement({
      rangeStart: '2026-06-01T00:00:00.000Z',
      rangeEnd: '2026-06-15T00:00:00.000Z',
      exportedAt: '2026-06-15T00:05:00.000Z',
      coverageSegments: coverage('2026-06-01T00:00:00.000Z', '2026-06-15T00:00:00.000Z'),
      events: [],
    }, new Date('2026-07-15T00:00:00.000Z'))).toEqual(expect.objectContaining({
      passed: false,
      reasons: ['export_not_fresh'],
    }));
  });

  it('fails closed when the export does not cover logs through its export time', () => {
    expect(evaluateMarketingLegacyRetirement({
      rangeStart: '2026-07-01T00:00:00.000Z',
      rangeEnd: '2026-07-15T00:00:00.000Z',
      exportedAt: '2026-07-15T08:00:00.000Z',
      coverageSegments: coverage('2026-07-01T00:00:00.000Z', '2026-07-15T00:00:00.000Z'),
      events: [],
    }, new Date('2026-07-15T08:05:00.000Z'))).toEqual(expect.objectContaining({
      passed: false,
      reasons: ['export_coverage_not_continuous'],
    }));
  });

  it('fails closed when the declared log coverage contains an internal gap', () => {
    expect(evaluateMarketingLegacyRetirement({
      rangeStart: '2026-07-01T00:00:00.000Z',
      rangeEnd: '2026-07-15T00:00:00.000Z',
      exportedAt: '2026-07-15T00:05:00.000Z',
      coverageSegments: [
        { start: '2026-07-01T00:00:00.000Z', end: '2026-07-07T00:00:00.000Z' },
        { start: '2026-07-08T00:00:00.000Z', end: '2026-07-15T00:00:00.000Z' },
      ],
      events: [],
    }, new Date('2026-07-15T00:10:00.000Z'))).toEqual(expect.objectContaining({
      passed: false,
      reasons: ['export_coverage_has_gaps'],
    }));
  });
});
