import { RefreshCw } from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/UI';
import type { AdminWorkbenchRole, WorkbenchScope } from '@/types/dashboard';
import { workbenchRoleBadges, workbenchRoleLabels } from './workbenchConfig';
import { formatBusinessDateTime } from '@/utils/businessTime';

interface WorkbenchHeaderProps {
  role: AdminWorkbenchRole;
  availableRoles: AdminWorkbenchRole[];
  scope: WorkbenchScope | null;
  generatedAt?: string;
  userName?: string;
  isLoading?: boolean;
  error?: string | null;
  onRoleChange: (role: AdminWorkbenchRole) => void;
  onRefresh: () => void;
}

function formatGeneratedAt(value?: string) {
  if (!value) return '暂无更新时间';
  return formatBusinessDateTime(value) || '暂无更新时间';
}

function scopeLabel(scope: WorkbenchScope | null) {
  if (!scope) return '当前口径：加载中';
  if (scope.mode === 'self') return `当前口径：本人 / ${scope.storeName}`;
  return `当前口径：${scope.storeName}`;
}

export function WorkbenchHeader({
  role,
  availableRoles,
  scope,
  generatedAt,
  userName,
  isLoading,
  error,
  onRoleChange,
  onRefresh,
}: WorkbenchHeaderProps) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="default">当前视角：{workbenchRoleBadges[role]}</Badge>
            <Badge variant="outline">数据来源 Ami_Core</Badge>
            <Badge variant="outline">{scopeLabel(scope)}</Badge>
            <Badge variant="outline">更新：{formatGeneratedAt(generatedAt)}</Badge>
            {isLoading && <Badge variant="secondary">数据刷新中</Badge>}
            {error && <Badge variant="destructive">数据暂不可用</Badge>}
          </div>
          <h1 className="text-2xl font-semibold text-foreground">{workbenchRoleLabels[role]}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {userName ? `${userName}，` : ''}
            登录后先看今日最需要关注的数据和待办，再进入高频操作处理。
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          {availableRoles.length > 1 && (
            <div className="flex max-w-xl flex-wrap gap-2">
              {availableRoles.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={item === role ? 'default' : 'outline'}
                  onClick={() => onRoleChange(item)}
                >
                  {workbenchRoleBadges[item]}
                </Button>
              ))}
            </div>
          )}
          <Button type="button" variant="outline" size="sm" className="gap-2 self-start lg:self-auto" onClick={onRefresh}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新工作台
          </Button>
        </div>
      </div>
    </section>
  );
}
