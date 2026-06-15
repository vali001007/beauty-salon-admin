import { ArrowRight, LayoutDashboard } from 'lucide-react';
import type { WorkbenchMetric } from '@/types/dashboard';
import { metricIconByKey } from './workbenchIcons';

interface MetricCardGridProps {
  metrics: WorkbenchMetric[];
  isLoading?: boolean;
  onNavigate: (path: string) => void;
}

const toneClass: Record<WorkbenchMetric['tone'], string> = {
  primary: 'bg-primary/10 text-primary',
  rose: 'bg-rose-100 text-rose-700',
  amber: 'bg-amber-100 text-amber-700',
  slate: 'bg-muted text-muted-foreground',
};

const severityClass: Record<WorkbenchMetric['severity'], string> = {
  normal: 'border-border',
  warning: 'border-amber-200',
  critical: 'border-rose-200',
};

export function MetricCardGrid({ metrics, isLoading, onNavigate }: MetricCardGridProps) {
  if (metrics.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
        当前角色暂无可展示的关键数据。
      </section>
    );
  }

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = metricIconByKey[metric.key] ?? LayoutDashboard;
        return (
          <button
            key={metric.key}
            type="button"
            onClick={() => onNavigate(metric.path)}
            className={`rounded-xl border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 ${severityClass[metric.severity]}`}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass[metric.tone]}`}>
                <Icon className="h-5 w-5" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-semibold text-foreground">{isLoading ? '-' : metric.value}</div>
            <div className="mt-1 text-sm font-medium text-foreground/80">{metric.label}</div>
            <div className="mt-2 min-h-4 text-xs text-muted-foreground">{isLoading ? '数据加载中' : metric.hint}</div>
          </button>
        );
      })}
    </section>
  );
}
