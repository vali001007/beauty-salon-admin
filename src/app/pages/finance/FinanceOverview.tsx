import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, ClipboardList, RefreshCcw, TrendingUp, WalletCards } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '../../components/UI';
import { getCommissionSummary, getDailySettlements, type CommissionSummary, type DailySettlement } from '@/api/commission';
import { getOperationProfitOverview, getPrepaidLiabilities } from '@/api/operationProfit';
import { useStoreStore } from '@/stores/storeStore';
import type { OperationProfitOverview, PrepaidLiabilitySummary } from '@/types/operationProfit';

function todayText() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthText() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthStartText() {
  return `${monthText()}-01`;
}

function money(value?: number | null) {
  return `¥${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percent(value?: number | null) {
  return `${Math.round(Number(value ?? 0) * 10000) / 100}%`;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'object' && error && 'message' in error) return String((error as { message?: unknown }).message || fallback);
  return fallback;
}

export type FinanceOverviewAlert = { title: string; detail: string; to: string };
type FinanceOverviewSectionKey = 'dailySettlement' | 'commissionSummary' | 'profitOverview' | 'memberAssets';
type FinanceOverviewSectionError = { key: FinanceOverviewSectionKey; title: string; message: string };

export function buildFinanceOverviewAlerts(input: {
  dailySettlement: DailySettlement | null;
  profitOverview: OperationProfitOverview | null;
  failedSections?: FinanceOverviewSectionKey[];
}): FinanceOverviewAlert[] {
  const items: FinanceOverviewAlert[] = [];
  const failedSections = new Set(input.failedSections ?? []);
  if (!failedSections.has('dailySettlement') && !input.dailySettlement) {
    items.push({ title: '今日尚未生成日结', detail: '收银完成后建议生成或刷新日结，确认支付与退款口径。', to: '/finance/reconciliation' });
  } else if (!failedSections.has('dailySettlement') && input.dailySettlement.status !== 'confirmed') {
    items.push({ title: '今日日结待确认', detail: '日结已生成但尚未确认，确认前不要作为最终财务口径。', to: '/finance/reconciliation' });
  }
  if (!failedSections.has('profitOverview') && input.profitOverview?.dataQuality?.status && input.profitOverview.dataQuality.status !== 'complete') {
    items.push({ title: '经营利润存在数据缺口', detail: input.profitOverview.dataQuality.detail || '成本、BOM 或提成记录未完全闭合。', to: '/finance/profit' });
  }
  return items;
}

function MetricTile({ label, value, hint, to }: { label: string; value: string; hint?: string; to?: string }) {
  const content = (
    <div className="rounded-lg border border-border bg-card p-4 transition hover:border-primary/30">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

function WorkbenchLink({ to, icon: Icon, title, description }: { to: string; icon: typeof WalletCards; title: string; description: string }) {
  return (
    <Link to={to} className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition hover:border-primary/30 hover:bg-muted/30">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="font-medium text-foreground">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      </div>
    </Link>
  );
}

export function FinanceOverview() {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [loading, setLoading] = useState(false);
  const [dailySettlement, setDailySettlement] = useState<DailySettlement | null>(null);
  const [commissionSummary, setCommissionSummary] = useState<CommissionSummary | null>(null);
  const [profitOverview, setProfitOverview] = useState<OperationProfitOverview | null>(null);
  const [memberAssets, setMemberAssets] = useState<PrepaidLiabilitySummary | null>(null);
  const [sectionErrors, setSectionErrors] = useState<FinanceOverviewSectionError[]>([]);

  const date = todayText();
  const month = monthText();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const baseStoreParams = currentStoreId ? { storeId: currentStoreId } : {};
      const requests = [
        {
          key: 'dailySettlement' as const,
          title: '今日收款与日结',
          run: () => getDailySettlements({ page: 1, pageSize: 1, dateFrom: date, dateTo: date, ...baseStoreParams }),
          apply: (dailyPage: Awaited<ReturnType<typeof getDailySettlements>>) => setDailySettlement(dailyPage.items[0] ?? null),
        },
        {
          key: 'commissionSummary' as const,
          title: '本月提成汇总',
          run: () => getCommissionSummary({ settleMonth: month, ...baseStoreParams }),
          apply: (summary: CommissionSummary) => setCommissionSummary(summary),
        },
        {
          key: 'profitOverview' as const,
          title: '经营利润',
          run: () => getOperationProfitOverview({ from: monthStartText(), to: date, basis: 'operating', ...baseStoreParams }),
          apply: (profit: OperationProfitOverview) => setProfitOverview(profit),
        },
        {
          key: 'memberAssets' as const,
          title: '会员资产',
          run: () => getPrepaidLiabilities({ page: 1, pageSize: 1, type: 'all', ...baseStoreParams }),
          apply: (liabilities: Awaited<ReturnType<typeof getPrepaidLiabilities>>) => setMemberAssets(liabilities.summary ?? null),
        },
      ];
      const results = await Promise.allSettled(requests.map((request) => request.run()));
      const errors: FinanceOverviewSectionError[] = [];
      results.forEach((result, index) => {
        const request = requests[index];
        if (result.status === 'fulfilled') {
          request.apply(result.value as never);
          return;
        }
        errors.push({ key: request.key, title: request.title, message: errorMessage(result.reason, '加载失败') });
      });
      setSectionErrors(errors);
      if (errors.length === requests.length) {
        toast.error('财务首页加载失败');
      } else if (errors.length > 0) {
        toast.error(`财务首页部分数据加载失败：${errors.map((item) => item.title).join('、')}`);
      }
    } catch (error) {
      toast.error(errorMessage(error, '财务首页加载失败'));
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, date, month]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const alerts = useMemo(() => {
    return buildFinanceOverviewAlerts({ dailySettlement, profitOverview, failedSections: sectionErrors.map((item) => item.key) });
  }, [dailySettlement, profitOverview, sectionErrors]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">财务首页</h1>
          <p className="mt-1 text-sm text-muted-foreground">集中查看收银对账、员工提成、经营利润和会员资产风险。</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => void loadData()} disabled={loading}>
          <RefreshCcw className="h-4 w-4" />
          刷新
        </Button>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="今日净收款" value={money((dailySettlement?.totalRevenue ?? 0) - (dailySettlement?.refundAmount ?? 0))} hint={`退款 ${money(dailySettlement?.refundAmount)}`} to="/finance/reconciliation" />
        <MetricTile label="本月提成" value={money(commissionSummary?.totalAmount)} hint={`${commissionSummary?.count ?? 0} 条流水`} to="/finance/staff-commission" />
        <MetricTile label="本月经营利润" value={money(profitOverview?.summary?.operatingProfit)} hint={`净利率 ${percent(profitOverview?.summary?.netMargin)}`} to="/finance/profit" />
        <MetricTile label="会员履约负债" value={money(memberAssets?.totalLiability)} hint={`高风险 ${memberAssets?.highRisk ?? 0} 个`} to="/finance/member-assets" />
      </section>

      {sectionErrors.length ? (
        <section className="grid gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <div className="font-medium text-destructive">部分财务数据暂时无法加载</div>
          <div className="grid gap-1 text-sm text-muted-foreground">
            {sectionErrors.map((error) => (
              <div key={error.key}>{error.title}：{error.message}</div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <WorkbenchLink to="/finance/reconciliation" icon={ClipboardList} title="收银对账" description="核对收款、退款、日结和班次交接，确认现金流是否可信。" />
        <WorkbenchLink to="/finance/staff-commission" icon={WalletCards} title="员工提成" description="查看自动生成的提成流水，维护规则并处理必要调整。" />
        <WorkbenchLink to="/finance/profit" icon={TrendingUp} title="经营利润" description="查看商品毛利、项目毛利、成本配置和数据缺口。" />
        <WorkbenchLink to="/finance/member-assets" icon={BarChart3} title="会员资产" description="跟踪储值余额、次卡履约和未确认收入。" />
        <WorkbenchLink to="/finance/ami-billing" icon={WalletCards} title="数字员工账单" description="查看 Ami Aura 账单、计费明细和绩效来源。" />
      </section>

      {alerts.length ? (
        <section className="grid gap-3">
          {alerts.map((alert) => (
            <Link key={alert.title} to={alert.to} className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 transition hover:bg-amber-100">
              <AlertTriangle className="mt-0.5 h-5 w-5" />
              <div>
                <div className="font-medium">{alert.title}</div>
                <div className="mt-1 text-sm">{alert.detail}</div>
              </div>
            </Link>
          ))}
        </section>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">当前没有明显财务待处理提醒。</div>
      )}
    </div>
  );
}
