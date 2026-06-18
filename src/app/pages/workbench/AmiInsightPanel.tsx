import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/app/components/UI';
import type { WorkbenchInsight } from '@/types/dashboard';

interface AmiInsightPanelProps {
  insight: WorkbenchInsight;
  onNavigate: (path: string) => void;
}

export function AmiInsightPanel({ insight, onNavigate }: AmiInsightPanelProps) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Sparkles className="h-5 w-5 text-primary" />
          Ami 参考
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">结论、依据和动作保持同屏可见。</p>
      </div>
      <div className="p-5">
        <div className="rounded-lg border border-primary/15 bg-primary/5 p-4">
          <div className="text-xs font-medium text-primary">结论</div>
          <div className="mt-1 font-medium text-foreground">{insight.conclusion}</div>
          <div className="mt-4 text-xs font-medium text-primary">依据</div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{insight.basis}</p>
          <Button className="mt-5 w-full gap-2" onClick={() => onNavigate(insight.path)}>
            {insight.action}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
