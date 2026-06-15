import { LayoutDashboard } from 'lucide-react';
import type { WorkbenchQuickAction } from '@/types/dashboard';
import { getWorkbenchIcon } from './workbenchIcons';

interface QuickActionGridProps {
  actions: WorkbenchQuickAction[];
  onNavigate: (path: string) => void;
}

export function QuickActionGrid({ actions, onNavigate }: QuickActionGridProps) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">高频操作</h2>
        <span className="text-xs text-muted-foreground">按角色和权限筛选</span>
      </div>
      {actions.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
          {actions.map((action) => {
            const Icon = getWorkbenchIcon(action.icon, LayoutDashboard);
            return (
              <button
                key={action.key}
                type="button"
                onClick={() => onNavigate(action.path)}
                className="rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                <Icon className="mb-4 h-5 w-5 text-primary" />
                <div className="font-medium text-foreground">{action.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">快速进入</div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          当前账号暂无可用快捷入口，请联系管理员开通对应权限。
        </div>
      )}
    </section>
  );
}
