import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getBrainGovernanceDashboard, listBrainFeedback } from '@/api/brain';

interface Dashboard {
  runCount?: number;
  completedRate?: number;
  failedRate?: number;
  p95LatencyMs?: number | null;
  feedbackCount?: number;
  helpfulRate?: number;
  actionCount?: number;
  actionSuccessRate?: number;
  openFindingCount?: number;
  inspectionTruePositiveRate?: number | null;
  latestEvalSummary?: Record<string, unknown> | null;
}
interface Feedback { id: number; runId: number; rating: string; status: string; correction?: unknown; createdAt: string }
function percent(value?: number | null) { return value == null ? '-' : `${(value * 100).toFixed(1)}%`; }

export function BrainFeedbackBoard() {
  const [dashboard, setDashboard] = useState<Dashboard>({});
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  async function load() {
    try {
      const [metrics, list] = await Promise.all([getBrainGovernanceDashboard(), listBrainFeedback()]);
      setDashboard(metrics as Dashboard);
      const items = list && typeof list === 'object' ? (list as { items?: unknown }).items : undefined;
      setFeedback(Array.isArray(items) ? items as Feedback[] : []);
    } catch (error) { toast.error(error instanceof Error ? error.message : '反馈指标加载失败'); }
  }
  useEffect(() => { void load(); }, []);
  const metrics = [
    ['运行次数', dashboard.runCount ?? 0], ['完成率', percent(dashboard.completedRate)], ['失败率', percent(dashboard.failedRate)],
    ['P95 延迟', dashboard.p95LatencyMs == null ? '-' : `${dashboard.p95LatencyMs} ms`], ['反馈数', dashboard.feedbackCount ?? 0],
    ['有帮助率', percent(dashboard.helpfulRate)], ['动作成功率', percent(dashboard.actionSuccessRate)], ['开放预警', dashboard.openFindingCount ?? 0],
    ['巡检真阳性率', percent(dashboard.inspectionTruePositiveRate)],
  ];
  return <section><div className="flex items-start justify-between gap-3 border-b border-border pb-4"><div><h2 className="text-base font-semibold">反馈与指标</h2><p className="mt-1 text-sm text-muted-foreground">展示真实运行、动作、巡检和评测结果，不使用占位统计。</p></div><button title="刷新" type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border" onClick={() => void load()}><RefreshCw className="h-4 w-4" /></button></div><div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 xl:grid-cols-5">{metrics.map(([label, value]) => <div key={String(label)} className="bg-background p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-2 text-xl font-semibold">{value}</div></div>)}</div><div className="mt-5 overflow-x-auto border border-border"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2">Run</th><th className="px-3 py-2">反馈</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">纠正</th><th className="px-3 py-2">时间</th></tr></thead><tbody>{feedback.length ? feedback.map((item) => <tr key={item.id} className="border-t border-border"><td className="px-3 py-3">#{item.runId}</td><td className="px-3 py-3">{item.rating}</td><td className="px-3 py-3">{item.status}</td><td className="max-w-md px-3 py-3 text-xs text-muted-foreground">{item.correction ? JSON.stringify(item.correction) : '-'}</td><td className="px-3 py-3 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString('zh-CN')}</td></tr>) : <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">暂无反馈</td></tr>}</tbody></table></div></section>;
}
