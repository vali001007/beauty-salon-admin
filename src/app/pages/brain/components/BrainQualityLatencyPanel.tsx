import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getBrainGovernanceQualityLatency } from '@/api/brain';
import type { BrainGovernanceQualityLatencyResponse, BrainLatencyMetricSummary } from '@/types/brain';

export function BrainQualityLatencyPanel({ storeId }: { storeId: number | null }) {
  const [days, setDays] = useState(7);
  const [candidateKey, setCandidateKey] = useState('');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [capabilityKey, setCapabilityKey] = useState('');
  const [percentile, setPercentile] = useState(50);
  const [data, setData] = useState<BrainGovernanceQualityLatencyResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getBrainGovernanceQualityLatency({
        days,
        ...(storeId ? { storeId } : {}),
        ...(candidateKey.trim() ? { candidateKey: candidateKey.trim() } : {}),
        ...(provider.trim() ? { provider: provider.trim() } : {}),
        ...(model.trim() ? { model: model.trim() } : {}),
        ...(capabilityKey.trim() ? { capabilityKey: capabilityKey.trim() } : {}),
        percentile,
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '问答耗时加载失败');
    } finally {
      setLoading(false);
    }
  }, [candidateKey, capabilityKey, days, model, percentile, provider, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="min-w-0 space-y-4" aria-label="问答耗时">
      <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-base font-semibold">问答耗时</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            来自服务端 Brain Run 与 Trace；{storeId ? `当前门店 #${storeId}` : '当前为全部门店聚合'}。
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            时间范围
            <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value={7}>最近 7 天</option>
              <option value={30}>最近 30 天</option>
              <option value={90}>最近 90 天</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Candidate
            <input value={candidateKey} onChange={(event) => setCandidateKey(event.target.value)} placeholder="全部 Candidate" className="mt-1 block h-9 w-44 rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            Provider
            <input value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="全部 Provider" className="mt-1 block h-9 w-36 rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            模型
            <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="全部模型" className="mt-1 block h-9 w-36 rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            能力 key
            <input value={capabilityKey} onChange={(event) => setCapabilityKey(event.target.value)} placeholder="全部能力" className="mt-1 block h-9 w-40 rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="text-xs text-muted-foreground">
            关注百分位
            <select value={percentile} onChange={(event) => setPercentile(Number(event.target.value))} className="mt-1 block h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value={50}>P50</option>
              <option value={90}>P90</option>
              <option value={95}>P95</option>
              <option value={99}>P99</option>
            </select>
          </label>
          <button type="button" title="刷新问答耗时" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border" onClick={() => void load()}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <LatencyCard label="端到端耗时" metric={data?.metrics.endToEnd} />
        <LatencyCard label="首次可见回答" metric={data?.metrics.firstVisibleAnswer} />
        <LatencyCard label="模型耗时" metric={data?.metrics.model} />
        <LatencyCard label="工具/数据耗时" metric={data?.metrics.toolData} />
      </div>

      {data?.selectedPercentile ? (
        <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm">
          <div className="font-medium">所选 P{data.selectedPercentile.percentile} 耗时</div>
          <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4 text-muted-foreground">
            <span>端到端 {formatDuration(data.selectedPercentile.endToEndMs)}</span>
            <span>首次可见 {formatDuration(data.selectedPercentile.firstVisibleAnswerMs)}</span>
            <span>模型 {formatDuration(data.selectedPercentile.modelMs)}</span>
            <span>工具/数据 {formatDuration(data.selectedPercentile.toolDataMs)}</span>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">每日 P50 趋势</h3>
          <span className="text-xs text-muted-foreground">样本 {data?.sampleSize ?? 0}</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">日期</th><th className="px-3 py-2">样本</th><th className="px-3 py-2">端到端</th><th className="px-3 py-2">首次可见</th><th className="px-3 py-2">模型</th><th className="px-3 py-2">工具/数据</th></tr>
            </thead>
            <tbody>
              {data?.daily.length ? data.daily.map((item) => (
                <tr key={item.date} className="border-t border-border">
                  <td className="px-3 py-2">{item.date}</td><td className="px-3 py-2">{item.sampleSize}</td>
                  <td className="px-3 py-2 tabular-nums">{formatDuration(item.endToEndP50Ms)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatDuration(item.firstVisibleP50Ms)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatDuration(item.modelP50Ms)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatDuration(item.toolDataP50Ms)}</td>
                </tr>
              )) : <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">{loading ? '加载中' : '当前筛选暂无完整耗时样本'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg bg-muted/40 px-4 py-3 text-xs leading-5 text-muted-foreground" role="note">
        {data?.dataCompleteness.note ?? '耗时缺失时显示暂无数据，不以 0 代替。'}
      </div>
    </section>
  );
}

function LatencyCard({ label, metric }: { label: string; metric?: BrainLatencyMetricSummary }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-xl font-semibold tabular-nums">P50 {formatDuration(metric?.p50Ms)}</div>
      <div className="mt-1 text-sm tabular-nums text-muted-foreground">P95 {formatDuration(metric?.p95Ms)}</div>
      <div className="mt-2 text-xs text-muted-foreground">样本 {metric?.sampleSize ?? 0}</div>
    </div>
  );
}

export function formatDuration(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '暂无数据';
  if (value === 0) return '0 秒';
  if (value > 0 && value < 1000) return '<1 秒';
  const seconds = Math.max(0, Math.round(value / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分`;
}
