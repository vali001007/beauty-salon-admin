import { describe, expect, it } from 'vitest';
import { buildFinanceOverviewAlerts } from './FinanceOverview';
import type { DailySettlement } from '@/api/commission';
import type { OperationProfitOverview } from '@/types/operationProfit';

describe('buildFinanceOverviewAlerts', () => {
  it('collects daily settlement and profit data quality alerts', () => {
    const alerts = buildFinanceOverviewAlerts({
      dailySettlement: null,
      profitOverview: {
        dataQuality: { status: 'partial', detail: '缺少 3 条项目 BOM 成本' },
      } as OperationProfitOverview,
    });

    expect(alerts.map((item) => [item.title, item.to])).toEqual([
      ['今日尚未生成日结', '/finance/reconciliation'],
      ['经营利润存在数据缺口', '/finance/profit'],
    ]);
    expect(alerts[1].detail).toBe('缺少 3 条项目 BOM 成本');
  });

  it('does not alert when the daily settlement is confirmed and finance data is complete', () => {
    const alerts = buildFinanceOverviewAlerts({
      dailySettlement: { status: 'confirmed' } as DailySettlement,
      profitOverview: {
        dataQuality: { status: 'complete' },
      } as OperationProfitOverview,
    });

    expect(alerts).toEqual([]);
  });

  it('does not convert failed section loading into business alerts', () => {
    const alerts = buildFinanceOverviewAlerts({
      dailySettlement: null,
      profitOverview: {
        dataQuality: { status: 'partial', detail: '利润接口返回异常前的旧数据' },
      } as OperationProfitOverview,
      failedSections: ['dailySettlement', 'commissionSummary', 'profitOverview'],
    });

    expect(alerts).toEqual([]);
  });
});
