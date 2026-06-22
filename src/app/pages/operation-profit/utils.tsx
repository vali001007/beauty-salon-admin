import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { DataQualityStatus, MissingCostReason, OperationCostCategory } from '@/types/operationProfit';
import { Button } from '../../components/UI';

export const costCategoryLabels: Record<OperationCostCategory, string> = {
  rent: '房租物业',
  salary: '固定工资',
  commission: '提成成本',
  marketing: '营销成本',
  utilities: '水电杂费',
  depreciation: '折旧摊销',
  supplies_adjustment: '耗材调整',
  other: '其他费用',
};

export const missingReasonLabels: Record<MissingCostReason, string> = {
  missing_cost: '经营成本未录完整',
  missing_bom: '项目 BOM 缺失',
  missing_commission: '提成记录缺失',
  missing_project_master: '项目档案缺失',
  missing_actual_consumption: '实际耗材流水缺失',
  missing_card_unit_value: '卡项单次价值缺失',
};

export const dataQualityLabels: Record<DataQualityStatus, string> = {
  complete: '数据完整',
  estimated: '部分估算',
  missing_cost: '成本缺失',
  missing_bom: 'BOM 缺失',
  missing_commission: '提成缺失',
  unavailable: '不可计算',
};

export function todayText() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function monthStartText() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

export function currentMonthText() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function previousMonthText(month: string) {
  const [year, rawMonth] = month.split('-').map(Number);
  const date = new Date(year, rawMonth - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function money(value?: number) {
  return `¥${Number(value ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function compactMoney(value?: number) {
  const amount = Number(value ?? 0);
  if (Math.abs(amount) >= 10000) return `¥${(amount / 10000).toFixed(1)}万`;
  return `¥${Math.round(amount).toLocaleString('zh-CN')}`;
}

export function percent(value?: number) {
  return `${(Number(value ?? 0) * 100).toFixed(1)}%`;
}

export function dateText(value?: string) {
  return value ? String(value).slice(0, 10) : '-';
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function statusTone(status?: string) {
  if (status === 'complete' || status === 'high_profit' || status === 'low') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'estimated' || status === 'normal' || status === 'medium') return 'bg-blue-50 text-blue-700 border-blue-200';
  if (status === 'critical' || status === 'missing_cost' || status === 'cost_missing' || status === 'loss' || status === 'high') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

export function StatusBadge({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tone ?? ''}`}>{children}</span>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function DateRangeFilters({
  from,
  to,
  loading,
  onChange,
  onRefresh,
}: {
  from: string;
  to: string;
  loading?: boolean;
  onChange: (patch: Partial<{ from: string; to: string }>) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">开始</span>
        <input
          type="date"
          value={from}
          onChange={(event) => onChange({ from: event.target.value })}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">结束</span>
        <input
          type="date"
          value={to}
          onChange={(event) => onChange({ to: event.target.value })}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm"
        />
      </label>
      <Button variant="outline" className="gap-2" onClick={onRefresh} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        刷新
      </Button>
    </div>
  );
}

export function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-xl font-semibold text-foreground">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function LoadingBlock({ label = '数据加载中' }: { label?: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function EmptyBlock({ label = '暂无数据' }: { label?: string }) {
  return (
    <div className="flex min-h-36 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function DataQualityPanel({
  status,
  detail,
  reasons,
}: {
  status?: DataQualityStatus;
  detail?: string;
  reasons?: MissingCostReason[];
}) {
  const complete = status === 'complete';
  return (
    <div className={`rounded-lg border p-4 ${complete ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/70'}`}>
      <div className="flex items-start gap-3">
        {complete ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />}
        <div>
          <div className={`text-sm font-medium ${complete ? 'text-emerald-800' : 'text-amber-800'}`}>
            {status ? dataQualityLabels[status] : '数据状态'}
          </div>
          <div className={`mt-1 text-sm ${complete ? 'text-emerald-700' : 'text-amber-700'}`}>{detail || '请结合数据缺口判断经营指标准确度。'}</div>
          {reasons?.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {reasons.map((reason) => (
                <StatusBadge key={reason} tone="border-amber-200 bg-amber-100 text-amber-800">
                  {missingReasonLabels[reason] ?? reason}
                </StatusBadge>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
