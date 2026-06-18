import { ArrowRight, LayoutDashboard } from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import type { WorkbenchTodo } from '@/types/dashboard';
import { todoIconByType } from './workbenchIcons';

interface TodoListProps {
  todos: WorkbenchTodo[];
  isLoading?: boolean;
  onNavigate: (path: string) => void;
}

const severityBadge: Record<WorkbenchTodo['severity'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  normal: 'secondary',
  warning: 'default',
  critical: 'destructive',
};

export function TodoList({ todos, isLoading, onNavigate }: TodoListProps) {
  const sortedTodos = [...todos].sort((a, b) => b.priority - a.priority).slice(0, 8);

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <LayoutDashboard className="h-5 w-5 text-primary" />
          今日优先处理
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">按当前角色和业务紧急程度排序，只展示最需要先处理的事项。</p>
      </div>
      <div className="space-y-3 p-5">
        {isLoading && sortedTodos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background/50 p-6 text-sm text-muted-foreground">
            待办加载中
          </div>
        ) : sortedTodos.length > 0 ? (
          sortedTodos.map((item) => {
            const Icon = todoIconByType[item.type] ?? LayoutDashboard;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.path)}
                className="flex w-full items-start gap-4 rounded-lg border border-border bg-background/50 p-4 text-left transition hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{item.title}</span>
                    <Badge variant={severityBadge[item.severity]}>{item.tag}</Badge>
                    {item.count !== undefined && <Badge variant="outline">{item.count}</Badge>}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                  <div className="mt-2 text-xs font-medium text-primary">{item.primaryAction}</div>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-background/50 p-6 text-sm text-muted-foreground">
            当前无待办事项
          </div>
        )}
      </div>
    </section>
  );
}
