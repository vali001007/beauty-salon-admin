import { AlertTriangle, ExternalLink, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import type { BrainInspectionInboxResponse } from '@/types/brain';

interface Props {
  inbox: BrainInspectionInboxResponse | null;
  loading: boolean;
  error?: string | null;
  reviewingId: number | null;
  onRefresh: () => void;
  onReview: (findingId: number) => void;
  onPageChange: (page: number) => void;
}

const evidenceLabels: Record<string, string> = {
  customerName: '客户',
  productName: '商品',
  projectName: '项目',
  beauticianName: '员工',
  currentStock: '当前库存',
  safetyStock: '安全库存',
  suggestedQty: '建议数量',
  daysSinceLastVisit: '未到店天数',
  totalSpent: '累计消费',
  currentValue: '当前值',
  previousValue: '对比值',
  dropRate: '下降幅度',
  noShowCount: '未到次数',
  cutoff: '统计截止',
  lastVisitDate: '最近到店',
  appointmentTime: '预约时间',
  startedAt: '开始时间',
  completedAt: '完成时间',
};

const severityLabels = {
  critical: '紧急',
  high: '高风险',
  medium: '需关注',
  low: '提示',
} as const;

const severityClasses = {
  critical: 'border-red-200 bg-red-50 text-red-700',
  high: 'border-orange-200 bg-orange-50 text-orange-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  low: 'border-slate-200 bg-slate-50 text-slate-600',
} as const;

export function BrainInspectionInbox({ inbox, loading, error, reviewingId, onRefresh, onReview, onPageChange }: Props) {
  const summary = inbox?.summary ?? { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
  const page = inbox?.page ?? 1;
  const totalPages = inbox?.totalPages ?? 1;

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="主动巡检风险">
      <div className="shrink-0 border-b border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              主动风险
            </div>
            <p className="mt-1 text-xs text-muted-foreground">共 {summary.total} 条待处理风险，按优先级排列。</p>
          </div>
          <button
            type="button"
            title="刷新主动风险"
            aria-label="刷新主动风险"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground disabled:opacity-60"
            disabled={loading}
            onClick={onRefresh}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[11px]">
          <SummaryBadge label="紧急" value={summary.critical} className="border-red-200 bg-red-50 text-red-700" />
          <SummaryBadge label="高风险" value={summary.high} className="border-orange-200 bg-orange-50 text-orange-700" />
          <SummaryBadge label="需关注" value={summary.medium} className="border-amber-200 bg-amber-50 text-amber-700" />
          <SummaryBadge label="提示" value={summary.low} className="border-slate-200 bg-slate-50 text-slate-600" />
        </div>
        {error ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs leading-5 text-red-700">
            {error}
            <button type="button" className="ml-2 underline" onClick={onRefresh}>重新加载</button>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading && !inbox ? (
          <div className="flex h-full min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载主动风险
          </div>
        ) : inbox?.items.length ? (
          <div className="space-y-2">
            {inbox.items.map((item) => (
              <article key={item.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-start gap-2">
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${severityClasses[item.severity]}`}>
                    {severityLabels[item.severity]}
                  </span>
                  <h3 className="min-w-0 flex-1 break-words text-sm font-medium leading-5 text-foreground">{item.title}</h3>
                </div>
                <p className="mt-2 line-clamp-2 break-words text-xs leading-5 text-muted-foreground">{evidenceSummary(item.evidence)}</p>
                <p className="mt-2 line-clamp-2 break-words text-xs leading-5 text-foreground">建议：{item.suggestion.action}</p>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">最近发现：{formatTime(item.lastDetectedAt)}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.suggestion.entry ? (
                      <a
                        title="打开业务页面"
                        aria-label={`打开${item.title}业务页面`}
                        href={item.suggestion.entry}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                    {item.canReview ? (
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs text-foreground hover:bg-muted disabled:opacity-60"
                        disabled={reviewingId === item.id}
                        onClick={() => onReview(item.id)}
                      >
                        {reviewingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        审查
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-40 flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <ShieldCheck className="h-8 w-8 text-emerald-600" />
            <div className="mt-3 font-medium text-foreground">当前没有待处理风险</div>
            <div className="mt-1 text-xs">主动巡检仍会持续运行并更新这里。</div>
          </div>
        )}
      </div>

      {summary.total > 0 ? (
        <div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>第 {page} / {totalPages} 页</span>
          <div className="flex gap-2">
            <button
              type="button"
              className="h-8 rounded-md border border-border px-3 text-foreground disabled:opacity-40"
              disabled={loading || page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              上一页
            </button>
            <button
              type="button"
              className="h-8 rounded-md border border-border px-3 text-foreground disabled:opacity-40"
              disabled={loading || page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SummaryBadge({ label, value, className }: { label: string; value: number; className: string }) {
  return <div className={`rounded-md border px-1 py-1.5 ${className}`}><div className="font-semibold">{value}</div><div>{label}</div></div>;
}

function evidenceSummary(evidence: Record<string, unknown>) {
  const values = Object.entries(evidence)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value) || value === null)
    .slice(0, 4)
    .map(([key, value]) => `${evidenceLabels[key] ?? key}：${formatValue(key, value)}`);
  return values.length ? values.join(' · ') : '查看巡检证据与影响范围';
}

function formatValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '未设置';
  if (key === 'totalSpent' && typeof value === 'number') return `¥${value.toLocaleString('zh-CN')}`;
  if (typeof value === 'number' && Math.abs(value) < 1 && value !== 0) return `${(value * 100).toFixed(1)}%`;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    }
  }
  return String(value);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}
