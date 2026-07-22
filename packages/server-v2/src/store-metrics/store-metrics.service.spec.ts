import { STORE_METRIC_DEFINITIONS, STORE_METRIC_KEYS } from './store-metric-definitions.js';
import { StoreMetricsService } from './store-metrics.service.js';

describe('StoreMetricsService', () => {
  const service = new StoreMetricsService({} as any, {} as any);

  it('registers exactly twelve versioned business definitions', () => {
    expect(STORE_METRIC_DEFINITIONS).toHaveLength(12);
    expect(new Set(STORE_METRIC_DEFINITIONS.map((item) => item.key)).size).toBe(12);
    expect(STORE_METRIC_DEFINITIONS.every((item) => item.version === 1)).toBe(true);
  });

  it('returns null instead of a fake zero rate when denominator is zero', () => {
    const metric = (service as any).ratioMetric(
      STORE_METRIC_KEYS.firstVisitArrivalRate,
      { numerator: 0, denominator: 0, quality: 'unavailable', reasons: ['no_sample'] },
      '2026-07-15T00:00:00.000Z',
    );

    expect(metric.value).toBeNull();
    expect(metric.numerator).toBe(0);
    expect(metric.denominator).toBe(0);
    expect(metric.quality).toEqual({ status: 'unavailable', reasons: ['no_sample'] });
  });

  it('keeps historical inference quality visible to consumers', () => {
    const metric = (service as any).ratioMetric(
      STORE_METRIC_KEYS.checkoutRebookingRate,
      { numerator: 2, denominator: 5, quality: 'estimated', reasons: ['legacy_rebooking_inferred'] },
      '2026-07-15T00:00:00.000Z',
    );

    expect(metric.value).toBe(0.4);
    expect(metric.quality.status).toBe('estimated');
    expect(metric.quality.reasons).toContain('legacy_rebooking_inferred');
  });

  it('merges overlapping service intervals and subtracts only overlapping leave', () => {
    expect((service as any).intervalMinutes([[540, 600], [570, 660]])).toBe(120);
    expect((service as any).overlapMinutes([[540, 660]], [[480, 570], [630, 720]])).toBe(60);
  });

  it('accepts the monthly operating revenue target key', async () => {
    const prisma = { storeMetricTarget: { create: jest.fn(async ({ data }) => ({ id: 1, ...data })) } };
    const targetService = new StoreMetricsService(prisma as any, {} as any);

    await expect(targetService.createTarget({
      storeId: 6,
      metricKey: 'store.operating_revenue.month',
      periodType: 'month',
      periodStart: '2026-07-01',
      periodEnd: '2026-08-01',
      targetValue: 100000,
    })).resolves.toMatchObject({ metricKey: 'store.operating_revenue.month', targetValue: 100000 });
  });
});
