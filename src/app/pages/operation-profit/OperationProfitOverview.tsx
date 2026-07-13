import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { getOperationProfitOverview, type OperationProfitOverview as OverviewData } from '@/api/operationProfit';
import { useStoreStore } from '@/stores/storeStore';
import { Button } from '../../components/UI';
import {
  compactMoney,
  DataQualityPanel,
  DateRangeFilters,
  EmptyBlock,
  errorMessage,
  LoadingBlock,
  MetricCard,
  money,
  monthStartText,
  PageHeader,
  percent,
  statusTone,
  StatusBadge,
  todayText,
} from './utils';

export function OperationProfitOverview() {
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [filters, setFilters] = useState({ from: monthStartText(), to: todayText() });
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await getOperationProfitOverview({ ...filters, storeId: currentStoreId ?? undefined, basis: 'operating' });
      setData(overview);
    } catch (error) {
      toast.error(errorMessage(error, '经营利润看板加载失败'));
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, filters]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summaryCards = useMemo(() => {
    const summary = data?.summary;
    const qualityHint =
      data?.dataQuality.status === 'complete'
        ? '成本完整'
        : data?.dataQuality.status === 'estimated'
          ? '含估算'
          : data?.dataQuality.status
            ? '成本缺失'
            : '';
    return [
      { label: '现金收入', value: money(summary?.cashIncome), hint: '订单实收 + 办卡/充值 - 退款' },
      { label: '经营收入', value: money(summary?.operatingIncome), hint: '服务 + 消课 + 产品销售' },
      { label: '毛利', value: money(summary?.grossProfit), hint: `毛利率 ${percent(summary?.grossMargin)}${qualityHint ? ` / ${qualityHint}` : ''}` },
      { label: '经营利润', value: money(summary?.operatingProfit), hint: `净利率 ${percent(summary?.netMargin)}` },
      { label: '服务顾客', value: String(summary?.customerCount ?? 0), hint: `客单价 ${money(summary?.avgTicket)}` },
      { label: '消课转化', value: percent(summary?.cardConsumptionRate), hint: '消课价值 / 新增预收现金流' },
    ];
  }, [data]);

  const trendRows = useMemo(
    () =>
      (data?.trend ?? []).map((row) => ({
        ...row,
        label: row.date.slice(5),
      })),
    [data],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="经营利润看板"
        description="区分现金收入和真实经营收入，按门店经营口径展示毛利、经营利润和数据缺口。"
        actions={
          <Button variant="outline" className="gap-2" onClick={() => void loadData()} disabled={loading}>
            <RefreshCcw className="h-4 w-4" />
            刷新
          </Button>
        }
      />

      <DateRangeFilters from={filters.from} to={filters.to} loading={loading} onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))} onRefresh={() => void loadData()} />

      {loading && !data ? (
        <LoadingBlock />
      ) : data ? (
        <>
          <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {summaryCards.map((card) => (
              <MetricCard key={card.label} {...card} />
            ))}
          </section>

          <DataQualityPanel status={data.dataQuality.status} detail={data.dataQuality.detail} reasons={data.dataQuality.missingCostReasons} />

          {data.alerts.length ? (
            <section className="grid gap-3 lg:grid-cols-2">
              {data.alerts.map((alert) => (
                <div key={alert.key} className={`rounded-lg border p-4 ${statusTone(alert.level)}`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5" />
                    <div>
                      <div className="font-medium">{alert.title}</div>
                      <div className="mt-1 text-sm opacity-90">{alert.detail}</div>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-4">
                <div className="text-sm font-medium">利润趋势</div>
                <div className="mt-1 text-sm text-muted-foreground">经营收入、毛利和经营利润按日期展示。</div>
              </div>
              <div className="h-80">
                {trendRows.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendRows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                      <defs>
                        <linearGradient id="operationIncome" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.24} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="operationProfit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#16a34a" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#16a34a" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis width={56} tickLine={false} axisLine={false} tickFormatter={(value) => compactMoney(Number(value))} />
                      <Tooltip
                        formatter={(value: number, name) => {
                          const labels: Record<string, string> = {
                            operatingIncome: '经营收入',
                            grossProfit: '毛利',
                            operatingProfit: '经营利润',
                          };
                          return [money(Number(value)), labels[String(name)] ?? String(name)];
                        }}
                        labelFormatter={(label) => `日期：${label}`}
                        contentStyle={{ borderRadius: 8, borderColor: 'hsl(var(--border))' }}
                      />
                      <Area type="monotone" dataKey="operatingIncome" stroke="#2563eb" strokeWidth={2} fill="url(#operationIncome)" />
                      <Area type="monotone" dataKey="grossProfit" stroke="#0891b2" strokeWidth={2} fill="transparent" />
                      <Area type="monotone" dataKey="operatingProfit" stroke="#16a34a" strokeWidth={2} fill="url(#operationProfit)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyBlock label="当前日期范围暂无趋势数据" />
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-4">
                <div className="text-sm font-medium">收入与成本结构</div>
                <div className="mt-1 text-sm text-muted-foreground">现金流项目不会并入经营收入。</div>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">收入结构</div>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.incomeBreakdown} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tickFormatter={(value) => compactMoney(Number(value))} />
                        <YAxis dataKey="label" type="category" width={92} tickLine={false} axisLine={false} />
                        <Tooltip formatter={(value: number) => money(Number(value))} contentStyle={{ borderRadius: 8, borderColor: 'hsl(var(--border))' }} />
                        <Bar dataKey="amount" fill="#2563eb" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">成本结构</div>
                  <div className="space-y-2">
                    {data.costBreakdown.map((item) => (
                      <div key={item.key} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm">{item.label}</span>
                          {item.estimated ? <StatusBadge tone="border-amber-200 bg-amber-50 text-amber-700">估算</StatusBadge> : null}
                        </div>
                        <span className="text-sm font-medium">{money(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : (
        <EmptyBlock label="暂无经营利润数据" />
      )}
    </div>
  );
}
