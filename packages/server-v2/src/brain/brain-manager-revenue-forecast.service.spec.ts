import { BrainManagerSkillsService } from './skills/brain-manager-skills.service.js';

describe('BrainManagerSkillsService revenue forecast baseline', () => {
  const settlement = (id: number, date: Date, revenue: number, status = 'confirmed', reconciliationStatus = 'passed') => ({
    id,
    settleDate: date,
    totalRevenue: revenue,
    status,
    reconciliationStatus,
    updatedAt: new Date(date.getTime() + id * 1000),
  });

  it('builds a backtested next-quarter baseline from complete trusted history', async () => {
    const asOf = new Date('2026-07-11T04:00:00.000Z');
    const settlements = Array.from({ length: 90 }, (_, index) => settlement(
      index + 1,
      new Date(Date.UTC(2026, 3, 12 + index)),
      100,
    ));
    const prisma = {
      dailySettlement: { findMany: jest.fn().mockResolvedValue(settlements) },
    };
    const service = new BrainManagerSkillsService(prisma as never);

    const result = await service.buildRevenueForecastBaseline({ storeId: 6, asOf });

    expect(result).toMatchObject({
      status: 'available',
      modelVersion: 'deterministic_daily_revenue_v2',
      sampleDays: 90,
      missingDays: 0,
      trustedDays: 90,
      dataCoverageRate: 1,
      reconciliationRate: 1,
      forecastDays: 92,
      averageDailyRevenue: 100,
      estimatedRevenue: 9200,
      confidence: 0.95,
      confidenceLabel: 'high',
      backtest: {
        status: 'available',
        evaluationDays: 76,
        meanAbsoluteError: 0,
        weightedAbsolutePercentageError: 0,
        accuracyRate: 1,
      },
    });
    expect(result.lowerBound).toBeCloseTo(7360);
    expect(result.upperBound).toBeCloseTo(11040);
  });

  it('deduplicates business dates and lowers confidence for sparse unreconciled history', async () => {
    const asOf = new Date('2026-07-11T04:00:00.000Z');
    const settlements = Array.from({ length: 30 }, (_, index) => settlement(
      index + 1,
      new Date(Date.UTC(2026, 5, 11 + index)),
      100 + index * 10,
      index < 12 ? 'confirmed' : 'draft',
      index < 12 ? 'passed' : 'pending',
    ));
    settlements.push(settlement(99, new Date('2026-06-30T16:00:00.000Z'), 200, 'confirmed', 'passed'));
    const prisma = { dailySettlement: { findMany: jest.fn().mockResolvedValue(settlements) } };
    const service = new BrainManagerSkillsService(prisma as never);

    const result = await service.buildRevenueForecastBaseline({ storeId: 6, asOf });

    expect(result.sampleDays).toBe(30);
    expect(result.duplicateBusinessDateCount).toBe(1);
    expect(result.trustedDays).toBe(13);
    expect(result.dataCoverageRate).toBeCloseTo(1 / 3);
    expect(result.reconciliationRate).toBeCloseTo(13 / 30);
    expect(result.confidence).toBeLessThan(0.75);
    expect(result.limitations.join(' ')).toContain('缺失日期不按零营收处理');
    expect(result.limitations.join(' ')).toContain('重复营业日记录');
  });

  it('does not emit a precise forecast when fewer than seven business-day samples exist', async () => {
    const settlements = Array.from({ length: 6 }, (_, index) => settlement(
      index + 1,
      new Date(Date.UTC(2026, 6, 4 + index)),
      100,
    ));
    const prisma = { dailySettlement: { findMany: jest.fn().mockResolvedValue(settlements) } };
    const service = new BrainManagerSkillsService(prisma as never);

    const result = await service.buildRevenueForecastBaseline({ storeId: 6, asOf: new Date('2026-07-11T04:00:00.000Z') });

    expect(result).toMatchObject({
      status: 'insufficient',
      sampleDays: 6,
      averageDailyRevenue: null,
      estimatedRevenue: null,
      lowerBound: null,
      upperBound: null,
      backtest: { status: 'insufficient', evaluationDays: 0 },
    });
  });

  it('withholds the amount when historical backtest error proves the baseline is not predictive', async () => {
    const settlements = Array.from({ length: 45 }, (_, index) => settlement(
      index + 1,
      new Date(Date.UTC(2026, 4, 27 + index)),
      index % 3 === 0 ? 20_000 : 0,
    ));
    const prisma = { dailySettlement: { findMany: jest.fn().mockResolvedValue(settlements) } };
    const service = new BrainManagerSkillsService(prisma as never);

    const result = await service.buildRevenueForecastBaseline({ storeId: 6, asOf: new Date('2026-07-11T04:00:00.000Z') });

    expect(result.backtest.weightedAbsolutePercentageError).toBeGreaterThan(1);
    expect(result).toMatchObject({
      status: 'insufficient',
      averageDailyRevenue: null,
      estimatedRevenue: null,
      lowerBound: null,
      upperBound: null,
    });
    expect(result.limitations.join(' ')).toContain('停止输出预测金额');
  });
});
