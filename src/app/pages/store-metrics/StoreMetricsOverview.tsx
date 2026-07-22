import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, RefreshCcw, Settings2, TrendingUp, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { getStoreMetricDrilldown, getStoreMetricsOverview } from '@/api/storeMetrics';
import type { StoreMetricDrilldown, StoreMetricsOverview as OverviewData, StoreMetricValue } from '@/types/storeMetrics';
import { useStoreStore } from '@/stores/storeStore';
import { Button } from '@/app/components/UI';

const groupKeys = {
  result: ['store.paid_revenue.today', 'store.operating_revenue.today', 'store.gross_margin_rate.today', 'store.monthly_target_completion_rate'],
  funnel: ['customer.first_visit_arrival_rate', 'customer.first_visit_conversion_rate', 'reservation.checkout_rebooking_rate', 'customer.new_customer_30d_repurchase_rate', 'reservation.no_show_rate'],
  capacity: ['staff.service_time_utilization_rate', 'staff.operating_revenue_per_service_hour', 'member.renewal_rate'],
};

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function formatValue(metric: StoreMetricValue) {
  if (metric.value === null) return '暂无样本';
  if (metric.unit === 'percent') return `${(metric.value * 100).toFixed(1)}%`;
  if (metric.unit === 'CNY_PER_HOUR') return `¥${metric.value.toLocaleString()}/小时`;
  return `¥${metric.value.toLocaleString()}`;
}

const qualityLabels = {
  complete: '完整',
  estimated: '历史估算',
  partial: '部分缺失',
  unavailable: '不可计算',
  frozen: '已冻结',
};

const qualityClass = {
  complete: 'bg-emerald-50 text-emerald-700',
  frozen: 'bg-blue-50 text-blue-700',
  estimated: 'bg-amber-50 text-amber-700',
  partial: 'bg-orange-50 text-orange-700',
  unavailable: 'bg-slate-100 text-slate-600',
};

function MetricCard({ metric, onClick }: { metric: StoreMetricValue; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium text-muted-foreground">{metric.name}</div>
        <span className={`rounded-full px-2 py-1 text-xs ${qualityClass[metric.quality.status]}`}>{qualityLabels[metric.quality.status]}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold text-foreground">{formatValue(metric)}</div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{metric.denominator !== null ? `样本 ${metric.sampleCount}` : metric.target ? `目标 ¥${metric.target.toLocaleString()}` : '实时口径'}</span>
        <span className="inline-flex items-center gap-1 text-primary">查看明细 <ArrowRight className="h-3 w-3" /></span>
      </div>
    </button>
  );
}

export function StoreMetricsOverview() {
  const navigate = useNavigate();
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const [date, setDate] = useState(today());
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<StoreMetricValue | null>(null);
  const [drilldown, setDrilldown] = useState<StoreMetricDrilldown | null>(null);

  const load = useCallback(async () => {
    if (!currentStoreId) { setData(null); return; }
    setLoading(true);
    try {
      setData(await getStoreMetricsOverview({ storeId: currentStoreId, date }));
    } catch (error: any) {
      toast.error(error?.message || '加载门店经营指标失败');
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, date]);

  useEffect(() => { void load(); }, [load]);

  const byKey = useMemo(() => new Map(data?.metrics.map((item) => [item.key, item]) ?? []), [data]);
  const metrics = (keys: string[]) => keys.map((key) => byKey.get(key)).filter((item): item is StoreMetricValue => Boolean(item));

  const openMetric = async (metric: StoreMetricValue) => {
    setSelected(metric);
    setDrilldown(null);
    if (!currentStoreId) return;
    try {
      setDrilldown(await getStoreMetricDrilldown(metric.key, { storeId: currentStoreId, date, page: 1, pageSize: 20 }));
    } catch (error: any) {
      toast.error(error?.message || '加载指标明细失败');
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">门店经营指标</h1>
          <p className="mt-1 text-sm text-muted-foreground">从经营结果、客户漏斗、预约履约、员工产能和会员续费解释目标差距。</p>
        </div>
        <div className="flex items-center gap-2">
          <input aria-label="指标日期" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
          <Button variant="outline" className="gap-2" onClick={() => void load()} disabled={loading}><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
          <Button className="gap-2" onClick={() => navigate('/store-operations/metrics/targets')}><Settings2 className="h-4 w-4" />目标设置</Button>
        </div>
      </div>

      {!currentStoreId ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-800">请先选择门店后查看经营指标。</div> : null}

      <section>
        <div className="mb-3 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold">经营结果与目标</h2></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{metrics(groupKeys.result).map((metric) => <MetricCard key={metric.key} metric={metric} onClick={() => void openMetric(metric)} />)}</div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">新客与预约漏斗</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{metrics(groupKeys.funnel).map((metric) => <MetricCard key={metric.key} metric={metric} onClick={() => void openMetric(metric)} />)}</div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">员工产能与会员健康</h2>
        <div className="grid gap-4 md:grid-cols-3">{metrics(groupKeys.capacity).map((metric) => <MetricCard key={metric.key} metric={metric} onClick={() => void openMetric(metric)} />)}</div>
      </section>

      {data?.alerts.length ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="mb-3 flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle className="h-5 w-5" />经营行动</div>
          <div className="grid gap-3 md:grid-cols-2">{data.alerts.map((alert) => <button type="button" key={alert.key} onClick={() => navigate(alert.path)} className="rounded-lg bg-white p-4 text-left shadow-sm"><div className="font-medium">{alert.title}</div><div className="mt-1 text-sm text-muted-foreground">{alert.detail}</div><div className="mt-2 text-sm text-primary">{alert.action}</div></button>)}</div>
        </section>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-modal="true" aria-label={`${selected.name}明细`}>
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-background p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{selected.name}</h2><p className="mt-1 text-sm text-muted-foreground">分子 {selected.numerator ?? '-'} / 分母 {selected.denominator ?? '-'} · 样本 {selected.sampleCount}</p></div><button type="button" aria-label="关闭" onClick={() => setSelected(null)} className="rounded-md p-2 hover:bg-muted"><X className="h-5 w-5" /></button></div>
            {selected.quality.reasons.length ? <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">数据说明：{selected.quality.reasons.join('、')}</div> : null}
            <div className="mt-5 flex flex-col gap-3">{drilldown ? drilldown.items.map((item, index) => <pre key={index} className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap">{JSON.stringify(item, null, 2)}</pre>) : <div className="text-sm text-muted-foreground">明细加载中...</div>}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
