import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import type { BrainInspectionInboxResponse } from '@/types/brain';

interface Props {
  inbox: BrainInspectionInboxResponse | null;
  loading: boolean;
  reviewingId: number | null;
  onRefresh: () => void;
  onReview: (findingId: number) => void;
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

export function BrainInspectionInbox({ inbox, loading, reviewingId, onRefresh, onReview }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (!loading && !inbox?.items.length) return null;
  return (
    <section className="border-b border-border bg-muted/20 px-4 py-3 lg:px-6" aria-label="主动巡检风险">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <div className="truncate text-sm font-medium text-foreground">主动风险</div>
          {inbox ? <div className="text-xs text-muted-foreground">待处理 {inbox.summary.total} 条</div> : null}
        </div>
        <div className="flex items-center gap-2">
          {inbox && inbox.items.length > 3 ? (
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {expanded ? '收起' : `查看 ${inbox.items.length} 条`}
            </button>
          ) : null}
          <button
            type="button"
            title="刷新主动风险"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground disabled:opacity-60"
            disabled={loading}
            onClick={onRefresh}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {inbox?.items.length ? (
        <div className="mt-3 divide-y divide-border border-y border-border">
          {inbox.items.slice(0, expanded ? inbox.items.length : 3).map((item) => (
            <div key={item.id} className="py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-amber-700">{severityLabels[item.severity]}</span>
                  <span className="min-w-0 break-words text-sm font-medium text-foreground">{item.title}</span>
                </div>
                <div className="mt-1 break-words text-xs leading-5 text-muted-foreground">{evidenceSummary(item.evidence)}</div>
              </div>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                <div className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
                  <div className="break-words">建议：{item.suggestion.action}</div>
                  <div>最近发现：{formatTime(item.lastDetectedAt)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.suggestion.entry ? (
                    <a
                      title="打开业务页面"
                      href={item.suggestion.entry}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                  {item.canReview ? (
                    <button
                      type="button"
                      className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2 text-xs text-foreground disabled:opacity-60"
                      disabled={reviewingId === item.id}
                      onClick={() => onReview(item.id)}
                    >
                      {reviewingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      审查
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
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
